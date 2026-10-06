"""Thanh lọc (06/10/2026) của hai màn khối sản xuất:

  · Bàn tổ — chế độ Bảng (`/work-items`, `nhom="lenh"`): kỳ `tu_ngay`/`den_ngay` theo mốc `moc`
    (`nhan` lúc tổ nhận lệnh — mặc định, `tao` ngày tạo lệnh, `du_kien` dự kiến bắt đầu), thay cặp
    `nhan_tu`/`nhan_den` cũ; mỗi lệnh trả thêm `tao_luc` cho cột "Ngày tạo".
  · Tiêu chí KCS (`/khai-bao`): `q` (bỏ dấu), `nhom`, `bat_buoc`, `active`, kỳ ngày tạo hạng mục —
    lọc ở máy chủ, cây chỉ giữ nhánh còn hạng mục khớp, `dem_theo_nhom` đếm sau lọc.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — đăng ký toàn bộ metadata
from app.db import Base, _dang_ky_ham_sqlite
from app.models.lsx import Lsx
from app.models.san_xuat import SanXuatCongViec
from app.models.san_xuat_kcs import SanXuatKcsTieuChi
from app.repositories.rbac_repo import RoleRepository
from app.repositories.san_xuat_kcs_tieu_chi_repo import SanXuatKcsTieuChiRepository
from app.schemas.lsx import HangChoItem
from app.schemas.san_xuat import WorkItemsOut
from app.services.gio_xuong import ve_gio_xuong
from app.services.rbac_service import AuthorizationService
from app.services.san_xuat import board
from app.services.san_xuat_kcs_tieu_chi_service import SanXuatKcsTieuChiService
from tests.test_san_xuat_kcs_tieu_chi import _cong_doan
from tests.test_san_xuat_lenh_phan_trang import (  # noqa: F401
    admin,
    customer,
    db,
    lsx_svc,
    orders,
    to_co_3_lenh_9_buoc,
    to_nhan_lech_ngay,
)


def _ban(db, admin, to_id, **kw):
    return board.work_items(db, admin, AuthorizationService(RoleRepository(db)), team_id=to_id, **kw)


def _lenh_cua_to(db, to_id) -> dict[int, list[SanXuatCongViec]]:
    out: dict[int, list[SanXuatCongViec]] = {}
    for cv in db.query(SanXuatCongViec).filter(SanXuatCongViec.department_id == to_id):
        out.setdefault(cv.lsx_id, []).append(cv)
    return out


# --- Bàn tổ ------------------------------------------------------------------------------------
def test_ban_to_moc_nhan_mac_dinh_la_ngay_xuong(db, admin, to_nhan_lech_ngay):
    to_id, tang = to_nhan_lech_ngay
    b = tang[0][1]
    nhan_b = min(cv.created_at for cv in _lenh_cua_to(db, to_id)[b])
    ngay = ve_gio_xuong(nhan_b.replace(tzinfo=timezone.utc)).date()
    kq = _ban(db, admin, to_id, tu_ngay=ngay, den_ngay=ngay)
    assert [l["lsx_id"] for l in kq["lenh"]] == [b]
    assert kq["trang"]["tong"] == 1
    assert _ban(db, admin, to_id, tu_ngay=ngay, den_ngay=ngay, moc="nhan")["trang"]["tong"] == 1


def test_ban_to_moc_tao_theo_ngay_tao_lenh_va_tra_tao_luc(db, admin, to_co_3_lenh_9_buoc):
    to_id = to_co_3_lenh_9_buoc
    a, b, c = sorted(_lenh_cua_to(db, to_id))
    for lid, luc in ((a, datetime(2026, 8, 1, 5, tzinfo=timezone.utc)),
                     (b, datetime(2026, 10, 2, 5, tzinfo=timezone.utc)),
                     (c, datetime(2026, 10, 20, 5, tzinfo=timezone.utc))):
        db.get(Lsx, lid).created_at = luc
    db.commit()

    kq = _ban(db, admin, to_id, tu_ngay=date(2026, 10, 1), den_ngay=date(2026, 10, 31), moc="tao")
    assert kq["trang"]["tong"] == 2
    assert {l["lsx_id"] for l in kq["lenh"]} == {b, c}
    # Pydantic nuốt im lặng khoá không khai — soi qua schema.
    out = WorkItemsOut.model_validate(kq)
    assert all(l.tao_luc is not None for l in out.lenh)
    assert {l.tao_luc.date() for l in out.lenh} == {date(2026, 10, 2), date(2026, 10, 20)}
    # Kết hợp tìm chữ (cùng JOIN lệnh) vẫn chạy.
    ma_b = db.get(Lsx, b).ma
    kq = _ban(db, admin, to_id, tu_ngay=date(2026, 10, 1), moc="tao", tim=ma_b)
    assert [l["lsx_id"] for l in kq["lenh"]] == [b]


def test_ban_to_moc_du_kien_bo_lenh_chua_xep_gio(db, admin, to_co_3_lenh_9_buoc):
    to_id = to_co_3_lenh_9_buoc
    theo = _lenh_cua_to(db, to_id)
    a, b, c = sorted(theo)
    for cv in theo[a]:
        cv.du_kien_bat_dau = datetime(2026, 11, 5, 8, tzinfo=timezone.utc)
        cv.du_kien_ket_thuc = datetime(2026, 11, 5, 10, tzinfo=timezone.utc)
    for cv in theo[b]:
        cv.du_kien_bat_dau = datetime(2026, 12, 1, 8, tzinfo=timezone.utc)
        cv.du_kien_ket_thuc = datetime(2026, 12, 1, 10, tzinfo=timezone.utc)
    for cv in theo[c]:
        cv.du_kien_bat_dau = None
        cv.du_kien_ket_thuc = None
    db.commit()

    kq = _ban(db, admin, to_id, tu_ngay=date(2026, 11, 1), den_ngay=date(2026, 11, 30), moc="du_kien")
    assert [l["lsx_id"] for l in kq["lenh"]] == [a]
    kq = _ban(db, admin, to_id, tu_ngay=date(2026, 11, 1), moc="du_kien")
    assert {l["lsx_id"] for l in kq["lenh"]} == {a, b}


def test_hang_cho_giu_san_pham_tom_tat():
    item = HangChoItem.model_validate({
        "order_id": 1, "order_no": "DH-1", "san_pham_tom_tat": "Hộp quà, Tờ rơi",
    })
    assert item.model_dump()["san_pham_tom_tat"] == "Hộp quà, Tờ rơi"


# --- Tiêu chí KCS ------------------------------------------------------------------------------
def _db_kcs():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    event.listen(eng, "connect", _dang_ky_ham_sqlite)
    Base.metadata.create_all(eng)
    return sessionmaker(bind=eng)()


def _khai_bao(db, **kw):
    from app.routers.san_xuat_kcs_tieu_chi import khai_bao
    return khai_bao(db, None, **kw)


def _cay(out) -> dict[str, list[str]]:
    """{mã công đoạn: [câu chữ hạng mục]} của cây trả về."""
    return {cd.ma: [h.ten for h in cd.hang_muc] for g in out.giai_doan for cd in g.cong_doan}


def _canh():
    db = _db_kcs()
    svc = SanXuatKcsTieuChiService(SanXuatKcsTieuChiRepository(db))
    in_ = _cong_doan(db, "CD-IN", nhom="print")
    be = _cong_doan(db, "CD-BE", nhom="finishing")
    chua = _cong_doan(db, "CD-CHUA", nhom="print")
    svc.create(dict(ten="Chồng màu đúng mẫu", cong_doan_id=in_.id, thu_tu=1))
    svc.create(dict(ten="Không bóng mực", cong_doan_id=in_.id, thu_tu=2, bat_buoc=False))
    m = svc.create(dict(ten="Đường bế sắc", cong_doan_id=be.id, thu_tu=1, active=False))
    db.get(SanXuatKcsTieuChi, m.id).created_at = datetime(2026, 9, 30, 16, 30, tzinfo=timezone.utc)
    for h in db.query(SanXuatKcsTieuChi).filter(SanXuatKcsTieuChi.id != m.id):
        h.created_at = datetime(2026, 9, 30, 17, 30, tzinfo=timezone.utc)   # 01/10 00:30 giờ VN
    db.commit()
    return db, chua


def test_tieu_chi_khong_loc_nhu_cu():
    db, chua = _canh()
    out = _khai_bao(db)
    assert _cay(out) == {"CD-IN": ["Chồng màu đúng mẫu", "Không bóng mực"], "CD-BE": ["Đường bế sắc"]}
    assert out.dem_theo_nhom == {"print": 1, "finishing": 1}
    assert [c.ma for c in out.cong_doan_chon] == ["CD-CHUA"]


def test_tieu_chi_tim_bo_dau_giu_nhanh_khop():
    db, _ = _canh()
    # Khớp câu chữ hạng mục: chỉ hạng mục đó.
    assert _cay(_khai_bao(db, q="chong mau")) == {"CD-IN": ["Chồng màu đúng mẫu"]}
    # Khớp mã công đoạn: cả công đoạn.
    assert _cay(_khai_bao(db, q="cd-be")) == {"CD-BE": ["Đường bế sắc"]}
    # Đang lọc mà công đoạn đã khai bị khuất vẫn KHÔNG rơi vào ô chọn "chưa khai".
    assert [c.ma for c in _khai_bao(db, q="chong mau").cong_doan_chon] == ["CD-CHUA"]


def test_tieu_chi_loc_co_va_giai_doan():
    db, _ = _canh()
    assert _cay(_khai_bao(db, bat_buoc=False)) == {"CD-IN": ["Không bóng mực"]}
    assert _cay(_khai_bao(db, active=False)) == {"CD-BE": ["Đường bế sắc"]}
    out = _khai_bao(db, nhom="finishing")
    assert _cay(out) == {"CD-BE": ["Đường bế sắc"]}
    assert out.dem_theo_nhom == {"print": 1, "finishing": 1}, "đếm giai đoạn không theo chính nó"
    assert _khai_bao(db, active=True).dem_theo_nhom == {"print": 1}


def test_tieu_chi_ky_ngay_tao_ranh_gio_vn():
    db, _ = _canh()
    out = _khai_bao(db, tu_ngay=date(2026, 10, 1), den_ngay=date(2026, 10, 31))
    assert _cay(out) == {"CD-IN": ["Chồng màu đúng mẫu", "Không bóng mực"]}
    h = out.giai_doan[0].cong_doan[0].hang_muc[0]
    assert h.created_at is not None
