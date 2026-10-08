"""Danh mục HẠNG MỤC KIỂM KCS — repo/service sau mg `0285` (thuộc ĐÚNG MỘT công đoạn).

Từ mg `0381` (08/10/2026) một tiêu chí chỉ là MỘT câu chữ — không `active`/`bat_buoc`/`huong_dan`,
`thu_tu` do máy chủ gán. Điểm soi (snapshot khi phát hành soi riêng ở `test_san_xuat_release.py`):
  · `SanXuatRepository.checklist_theo_cong_doan()` — gom theo công đoạn, thứ tự `thu_tu` rồi `id`.
  · CRUD qua `SanXuatKcsTieuChiService` — mã sinh ngầm `KM####`, `thu_tu` nối đuôi, chặn công
    đoạn ma, chặn trùng câu chữ trong CÙNG công đoạn (khác công đoạn thì cho).
  · `sap_xep` (kéo thả) và `chep` (chép sang nhiều công đoạn, một giao dịch).
  · cửa `khai-bao` — nguồn hai ngăn của màn danh mục.
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, _dang_ky_ham_sqlite
import app.models  # noqa: F401 — đăng ký toàn bộ metadata (kể cả san_xuat_kcs)
from app.repositories.cong_doan_repo import CongDoanRepository
from app.repositories.san_xuat_kcs_tieu_chi_repo import SanXuatKcsTieuChiRepository
from app.repositories.san_xuat_repo import SanXuatRepository
from app.services.cong_doan_service import CongDoanService
from app.services.san_xuat_kcs_tieu_chi_service import (
    SanXuatKcsTieuChiService,
    SanXuatKcsTieuChiValidationError,
)


def _db():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    event.listen(eng, "connect", _dang_ky_ham_sqlite)     # `bo_dau` cho tìm tương đối
    Base.metadata.create_all(eng)
    return sessionmaker(bind=eng)()


def _svc():
    db = _db()
    return db, SanXuatKcsTieuChiService(SanXuatKcsTieuChiRepository(db))


def _cong_doan(db, ma: str, nhom: str = "print"):
    """Công đoạn tối thiểu — mượn CongDoanService cho đúng validate (basis/nhóm) thay vì tạo ORM
    trần, tránh cấu hình sai lặng lẽ lọt qua test."""
    cd_svc = CongDoanService(CongDoanRepository(db))
    return cd_svc.create(dict(
        ma=ma, ten=ma, nhom=nhom,
        che_do_tinh="theo_san_luong", pricing_basis="per_finished_qty", first_unit_floor=0,
    ))


# ---- checklist_theo_cong_doan() -------------------------------------------------------------
def test_checklist_theo_cong_doan_gom_dung_va_sap_theo_thu_tu():
    db = _db()
    cd1 = _cong_doan(db, "CD-KCS-1")
    cd2 = _cong_doan(db, "CD-KCS-2")
    svc = SanXuatKcsTieuChiService(SanXuatKcsTieuChiRepository(db))

    # Cùng CÂU CHỮ khai cho hai công đoạn = HAI dòng (mô hình mới không dùng chung một dòng).
    chung_1 = svc.create(dict(ten="Chồng màu đúng", cong_doan_id=cd1.id))
    chung_2 = svc.create(dict(ten="Chồng màu đúng", cong_doan_id=cd2.id))
    rieng = svc.create(dict(ten="Kiểm biên dạng bế", cong_doan_id=cd1.id))
    svc.sap_xep(cd1.id, [rieng.id, chung_1.id])

    out = SanXuatRepository(db).checklist_theo_cong_doan({cd1.id, cd2.id})

    assert [t.id for t in out[cd1.id]] == [rieng.id, chung_1.id]
    assert [t.id for t in out[cd2.id]] == [chung_2.id]


def test_checklist_theo_cong_doan_rong_khi_khong_co_id():
    db = _db()
    assert SanXuatRepository(db).checklist_theo_cong_doan(set()) == {}


# ---- CRUD ------------------------------------------------------------------------------------
def test_ma_sinh_ngam_nguoi_khai_chi_go_cau_chu():
    """Người khai chỉ gõ câu chữ hạng mục — mã `KM####` do server cấp (UI không có ô nhập mã)."""
    db, svc = _svc()
    cd = _cong_doan(db, "CD-MA")
    a = svc.create(dict(ten="Kiểm màu", cong_doan_id=cd.id))
    b = svc.create(dict(ten="Kiểm bế", cong_doan_id=cd.id))
    assert a.ma == "KM0001" and b.ma == "KM0002"


def test_thu_tu_may_chu_gan_noi_duoi_bo_qua_so_client_gui():
    """Thêm = nối cuối công đoạn đó; số `thu_tu` client gửi bị bỏ (kéo thả mới đổi thứ tự)."""
    db, svc = _svc()
    cd1 = _cong_doan(db, "CD-TT1")
    cd2 = _cong_doan(db, "CD-TT2")
    a = svc.create(dict(ten="  Câu A  ", cong_doan_id=cd1.id, thu_tu=99))
    b = svc.create(dict(ten="Câu B", cong_doan_id=cd1.id))
    c = svc.create(dict(ten="Câu C", cong_doan_id=cd2.id))
    assert (a.thu_tu, b.thu_tu, c.thu_tu) == (1, 2, 1)
    assert a.ten == "Câu A"

    a = svc.update(a.id, dict(ten="Câu A sửa", cong_doan_id=cd1.id, thu_tu=50))
    assert a.thu_tu == 1 and a.ten == "Câu A sửa"


def test_doi_cong_doan_cua_hang_muc():
    db, svc = _svc()
    cd1 = _cong_doan(db, "CD-A")
    cd2 = _cong_doan(db, "CD-B")
    tc = svc.create(dict(ten="Kiểm màu", cong_doan_id=cd1.id))
    assert tc.cong_doan_id == cd1.id

    tc = svc.update(tc.id, dict(ten="Kiểm màu", cong_doan_id=cd2.id))
    assert svc.get(tc.id).cong_doan_id == cd2.id


def test_validate_ten_khong_duoc_trong():
    db, svc = _svc()
    cd = _cong_doan(db, "CD-TRONG")
    with pytest.raises(SanXuatKcsTieuChiValidationError):
        svc.create(dict(ten="   ", cong_doan_id=cd.id))


def test_validate_cong_doan_id_khong_ton_tai_bi_chan():
    db, svc = _svc()
    with pytest.raises(SanXuatKcsTieuChiValidationError):
        svc.create(dict(ten="X", cong_doan_id=999))
    with pytest.raises(SanXuatKcsTieuChiValidationError):
        svc.create(dict(ten="X", cong_doan_id=None))


def test_trung_cau_chu_trong_cung_cong_doan_bi_chan_khac_cong_doan_thi_duoc():
    db, svc = _svc()
    cd1 = _cong_doan(db, "CD-T1")
    cd2 = _cong_doan(db, "CD-T2")
    svc.create(dict(ten="Chồng màu đúng", cong_doan_id=cd1.id))
    svc.create(dict(ten="Chồng màu đúng", cong_doan_id=cd2.id))   # công đoạn khác: OK
    with pytest.raises(SanXuatKcsTieuChiValidationError):
        svc.create(dict(ten=" Chồng màu đúng ", cong_doan_id=cd1.id))


def test_xoa_la_xoa_cung():
    db, svc = _svc()
    cd = _cong_doan(db, "CD-XOA")
    tc = svc.create(dict(ten="Kiểm độ bám mực", cong_doan_id=cd.id))
    svc.delete(tc.id)
    assert SanXuatKcsTieuChiRepository(db).cua_cong_doan(cd.id) == []


# ---- Sắp xếp (kéo thả) -----------------------------------------------------------------------
def test_sap_xep_danh_lai_1_n_theo_dung_thu_tu_gui():
    db, svc = _svc()
    cd = _cong_doan(db, "CD-SX")
    a = svc.create(dict(ten="A", cong_doan_id=cd.id))
    b = svc.create(dict(ten="B", cong_doan_id=cd.id))
    c = svc.create(dict(ten="C", cong_doan_id=cd.id))

    out = svc.sap_xep(cd.id, [c.id, a.id, b.id])

    assert [(r.id, r.thu_tu) for r in out] == [(c.id, 1), (a.id, 2), (b.id, 3)]


def test_sap_xep_lech_tap_id_bi_chan():
    """Thiếu một id, thừa id của công đoạn khác, hay lặp id ⇒ chặn — kéo thả trên bản cũ."""
    db, svc = _svc()
    cd = _cong_doan(db, "CD-SX1")
    khac = _cong_doan(db, "CD-SX2")
    a = svc.create(dict(ten="A", cong_doan_id=cd.id))
    b = svc.create(dict(ten="B", cong_doan_id=cd.id))
    x = svc.create(dict(ten="X", cong_doan_id=khac.id))
    for ids in ([a.id], [a.id, b.id, x.id], [a.id, a.id], [b.id, x.id]):
        with pytest.raises(SanXuatKcsTieuChiValidationError):
            svc.sap_xep(cd.id, ids)
    assert [r.thu_tu for r in SanXuatKcsTieuChiRepository(db).cua_cong_doan(cd.id)] == [1, 2]


# ---- Chép sang công đoạn khác ----------------------------------------------------------------
def test_chep_sang_nhieu_cong_doan_bo_cau_da_co_noi_duoi_thu_tu():
    db, svc = _svc()
    cd2 = _cong_doan(db, "CD-CH2")
    cd3 = _cong_doan(db, "CD-CH3")
    svc.create(dict(ten="B", cong_doan_id=cd2.id))

    kq = svc.chep([cd2.id, cd3.id], ["A", " B ", "A", ""])

    assert kq == {
        "da_chep": 3, "bo_qua": 1,
        "theo_dich": [
            {"cong_doan_id": cd2.id, "da_chep": 1, "bo_qua": 1},
            {"cong_doan_id": cd3.id, "da_chep": 2, "bo_qua": 0},
        ],
    }
    repo = SanXuatKcsTieuChiRepository(db)
    assert [(r.ten, r.thu_tu) for r in repo.cua_cong_doan(cd2.id)] == [("B", 1), ("A", 2)]
    assert [(r.ten, r.thu_tu) for r in repo.cua_cong_doan(cd3.id)] == [("A", 1), ("B", 2)]
    assert len({r.ma for r in repo.cua_cong_doan(cd2.id) + repo.cua_cong_doan(cd3.id)}) == 4


def test_chep_danh_sach_rong_bi_chan():
    db, svc = _svc()
    cd = _cong_doan(db, "CD-CH-R")
    with pytest.raises(SanXuatKcsTieuChiValidationError):
        svc.chep([cd.id], ["", "   "])
    with pytest.raises(SanXuatKcsTieuChiValidationError):
        svc.chep([], ["A"])


def test_chep_vao_cong_doan_ma_thi_khong_dich_nao_duoc_ghi():
    db, svc = _svc()
    cd = _cong_doan(db, "CD-CH-OK")
    with pytest.raises(SanXuatKcsTieuChiValidationError):
        svc.chep([cd.id, 999], ["A"])
    assert SanXuatKcsTieuChiRepository(db).cua_cong_doan(cd.id) == []


# ---- Cửa khai-bao: nguồn hai ngăn ------------------------------------------------------------
def _khai_bao(db, q=None):
    from app.routers.san_xuat_kcs_tieu_chi import khai_bao
    return khai_bao(db, None, q)


def test_khai_bao_gom_ca_cong_doan_dang_dung_chua_co_tieu_chi():
    """Ngăn trái liệt kê MỌI công đoạn đang dùng (chưa có tiêu chí thì `hang_muc: []`), xếp theo
    giai đoạn rồi mã; công đoạn ngừng dùng chỉ hiện nếu đã có tiêu chí."""
    from app.models.cong_doan import CongDoan

    db, svc = _svc()
    da_khai = _cong_doan(db, "CD-B", nhom="finishing")
    _cong_doan(db, "CD-C", nhom="print")
    _cong_doan(db, "CD-A", nhom="prepress")
    ngung = _cong_doan(db, "CD-D", nhom="print")
    ngung_co = _cong_doan(db, "CD-E", nhom="print")
    svc.create(dict(ten="Mục 1", cong_doan_id=da_khai.id))
    svc.create(dict(ten="Mục E", cong_doan_id=ngung_co.id))
    db.get(CongDoan, ngung.id).active = False
    db.get(CongDoan, ngung_co.id).active = False
    db.commit()

    out = _khai_bao(db)
    assert [(g.nhom, [(c.ma, len(c.hang_muc)) for c in g.cong_doan]) for g in out.giai_doan] == [
        ("prepress", [("CD-A", 0)]),
        ("print", [("CD-C", 0), ("CD-E", 1)]),
        ("finishing", [("CD-B", 1)]),
    ]
    assert out.giai_doan[1].cong_doan[0].nhom == "print"


def test_khai_bao_tim_khop_cau_chu_tra_du_tieu_chi_cua_cong_doan():
    """`q` tìm tương đối bỏ dấu: khớp câu chữ của MỘT tiêu chí thì trả công đoạn kèm ĐỦ tiêu chí
    của nó (để thấy ngữ cảnh); khớp mã/tên công đoạn cũng vậy; không khớp gì thì rỗng."""
    db, svc = _svc()
    cd_be = _cong_doan(db, "CD-BE", nhom="finishing")
    cd_in = _cong_doan(db, "CD-IN", nhom="print")
    svc.create(dict(ten="Đường bế sắc nét", cong_doan_id=cd_be.id))
    svc.create(dict(ten="Không bavia", cong_doan_id=cd_be.id))
    svc.create(dict(ten="Chồng màu đúng", cong_doan_id=cd_in.id))

    out = _khai_bao(db, "duong be")
    assert [(c.ma, [h.ten for h in c.hang_muc]) for g in out.giai_doan for c in g.cong_doan] == [
        ("CD-BE", ["Đường bế sắc nét", "Không bavia"]),
    ]

    out = _khai_bao(db, "cd-in")
    assert [(c.ma, len(c.hang_muc)) for g in out.giai_doan for c in g.cong_doan] == [("CD-IN", 1)]

    assert _khai_bao(db, "khong-co-gi").giai_doan == []


def test_khai_bao_khong_chay_theo_so_cong_doan_va_hang_muc():
    """Cả hai ngăn = số truy vấn CỐ ĐỊNH, thêm công đoạn/hạng mục không làm nhảy (N+1)."""
    db, svc = _svc()
    eng = db.get_bind()

    def dem(q=None) -> int:
        n = {"n": 0}

        def _ghi(*_a):
            n["n"] += 1

        event.listen(eng, "before_cursor_execute", _ghi)
        try:
            _khai_bao(db, q)
        finally:
            event.remove(eng, "before_cursor_execute", _ghi)
        return n["n"]

    def dung(dot: int, so: int) -> None:
        for i in range(so):
            cd = _cong_doan(db, f"CD-N{dot}-{i}")
            for j in range(3):
                svc.create(dict(ten=f"Mục {j}", cong_doan_id=cd.id))
            _cong_doan(db, f"CD-M{dot}-{i}")      # công đoạn chưa khai

    dung(1, 3)
    db.expire_all()
    nho, nho_q = dem(), dem("muc")
    dung(2, 12)
    db.expire_all()
    assert dem() == nho <= 2
    assert dem("muc") == nho_q <= 3
