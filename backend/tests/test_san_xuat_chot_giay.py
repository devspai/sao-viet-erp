"""Tổ Cắt chốt giấy sau phát hành + cổng "chờ tổ Cắt" (spec giấy theo khổ §4.6–4.7).

Nền: hai lệnh thật phát hành vào một tổ (fixture bàn tổ — bước In đã có dòng giấy), một tổ mang cờ
`la_to_cat` có quyền Thực hiện lệnh cho admin, một công đoạn "Cắt tờ" thuộc tổ đó. Soi tầng service.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.models.audit import AuditLog
from app.models.cong_doan import CongDoan
from app.models.department import Department
from app.models.lsx import LsxCongDoan, LsxCongDoanPhuThuoc, LsxCongDoanVatTu
from app.models.san_xuat import CV_DANG_CHAY, SanXuatCongViec
from app.models.san_xuat_san_luong import SanXuatBatch
from app.models.user import User
from app.repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from app.services.san_xuat import chot_giay
from app.services.san_xuat.chot_giay import ChotGiayLoi
from tests.quyen_to_fixtures import cap_quyen_to
from tests.test_san_xuat_board import (  # noqa: F401
    _phat_hanh_vao_to,
    _to_moi,
    admin,
    customer,
    db,
    lsx_svc,
    orders,
)


def _cong_doan_cat(db, to_id: int, ma="CD-CAT-TO", ten="Cắt tờ") -> CongDoan:
    cd = CongDoan(ma=ma, ten=ten, nhom="prepress", cong_thuc_gia="so_luong * don_gia")
    db.add(cd)
    db.flush()
    cd.department_ids = [to_id]
    cd.don_vi_vao = cd.don_vi_ra = "to"
    db.flush()
    return cd


def _nen(db, orders, lsx_svc, admin, customer) -> SimpleNamespace:
    to_sx = _to_moi(db, ten="Tổ SX chốt giấy", ma="TO-SX-CG")
    a, b, goi = _phat_hanh_vao_to(db, orders, lsx_svc, admin, customer, to_sx.id)
    to_cat = Department(name="Tổ Cắt CG", code="TO-CAT-CG", la_san_xuat=True, la_to_cat=True)
    db.add(to_cat)
    db.flush()
    cap_quyen_to(db, admin, to_cat)
    cd = _cong_doan_cat(db, to_cat.id)
    db.commit()
    return SimpleNamespace(to_sx=to_sx, to_cat=to_cat, a=a, b=b, goi=goi, cd=cd)


def _tuyen(db, lsx_id) -> list[LsxCongDoan]:
    return (db.query(LsxCongDoan).filter(LsxCongDoan.lsx_id == lsx_id)
            .order_by(LsxCongDoan.thu_tu, LsxCongDoan.id).all())


def _buoc_giay(db, lsx_id) -> LsxCongDoan:
    return (db.query(LsxCongDoan).join(LsxCongDoanVatTu,
                                      LsxCongDoanVatTu.lsx_cong_doan_id == LsxCongDoan.id)
            .filter(LsxCongDoan.lsx_id == lsx_id, LsxCongDoanVatTu.hang_loai == "giay")
            .order_by(LsxCongDoan.thu_tu).first())


def _cv_buoc(db, buoc_id) -> SanXuatCongViec:
    return db.query(SanXuatCongViec).filter(SanXuatCongViec.lsx_cong_doan_id == buoc_id).one()


def _chot(db, n, admin, lsx_id, cach="cat", ids=None):
    kq = chot_giay.chot(db, user=admin, team_id=n.to_cat.id, lsx_id=lsx_id, bai_ghep_id=None,
                        cach=cach, cong_doan_ids=ids if ids is not None else [n.cd.id])
    db.commit()
    return kq


# --- Danh sách ------------------------------------------------------------------------------
def test_danh_sach_co_lenh_mang_giay_va_ton_dung_kho(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    ds = {d["id"]: d for d in chot_giay.danh_sach(db, team_id=n.to_cat.id)}
    assert {n.a.id, n.b.id} <= set(ds)
    d = ds[n.a.id]
    assert d["chu_the"] == "lsx" and d["chot"] is None and d["sua_duoc"] is True
    assert d["giay"] and d["giay"][0]["kho_rong"] > 0 and d["giay"][0]["kho_dai"] > 0
    assert d["giay"][0]["nhan_kho"].endswith("mm")
    assert isinstance(d["giay"][0]["ton_to_dung_kho"], float)
    assert [c["id"] for c in d["cong_doan_chen_duoc"]] == [n.cd.id]
    # Tổ không mang cờ thì không có khối này.
    assert chot_giay.danh_sach(db, team_id=n.to_sx.id) == []


def test_khong_cat_ghi_chot(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    so_buoc = len(_tuyen(db, n.a.id))
    _chot(db, n, admin, n.a.id, cach="khong_cat", ids=[])
    db.refresh(n.a)
    assert n.a.giay_chot_cach == "khong_cat" and n.a.giay_chot_boi_id == admin.id
    assert n.a.giay_chot_luc is not None
    assert len(_tuyen(db, n.a.id)) == so_buoc
    d = {x["id"]: x for x in chot_giay.danh_sach(db, team_id=n.to_cat.id)}[n.a.id]
    assert d["chot"]["cach"] == "khong_cat"
    with pytest.raises(ChotGiayLoi, match="Đã chốt"):
        _chot(db, n, admin, n.a.id, cach="khong_cat", ids=[])


# --- Chèn bước cắt ---------------------------------------------------------------------------
def test_chen_cat_tao_buoc_dau_tuyen_canh_toi_buoc_in_va_cong_viec_cung_goi(
        db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    cu = [(b.id, b.ten) for b in _tuyen(db, n.a.id)]
    in_ = _buoc_giay(db, n.a.id)
    vi_tri_in = [i for i, (bid, _) in enumerate(cu) if bid == in_.id][0]
    cv_in = _cv_buoc(db, in_.id)
    sl = SanXuatSanLuongRepository(db)
    truoc_cu = {c.id for c in sl.cong_viec_chang_truoc(cv_in)}

    kq = _chot(db, n, admin, n.a.id)

    moi = _tuyen(db, n.a.id)
    assert moi[0].chen_boi_to_cat and moi[0].ten == "Cắt tờ" and moi[0].thu_tu == 0
    assert moi[0].department_id == n.to_cat.id
    assert [(b.id, b.ten) for b in moi[1:]] == cu
    assert [b.thu_tu for b in moi] == list(range(len(moi)))
    canh = db.query(LsxCongDoanPhuThuoc).filter_by(buoc_truoc_id=moi[0].id).all()
    assert [c.buoc_sau_id for c in canh] == [in_.id]

    cv_cat = _cv_buoc(db, moi[0].id)
    assert kq["cong_viec_moi"] == [cv_cat.id]
    assert cv_cat.goi_id == n.goi.id and cv_cat.department_id == n.to_cat.id
    assert cv_cat.nhom_id == cv_in.nhom_id
    db.expire_all()
    assert {c.id for c in sl.cong_viec_chang_truoc(cv_in)} == truoc_cu | {cv_cat.id}
    assert sl.cong_viec_chang_truoc(cv_cat) == []
    # Bước đứng ngay sau Cắt theo thu_tu nhưng không phải bước mang giấy KHÔNG chờ Cắt.
    if vi_tri_in > 0:
        dau_cu = _cv_buoc(db, cu[0][0])
        assert cv_cat.id not in {c.id for c in sl.cong_viec_chang_truoc(dau_cu)}
    assert [c.id for c in sl.cong_viec_chang_sau(cv_cat)] == [cv_in.id]


def test_chen_hai_cong_doan_noi_chuoi(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    cd2 = _cong_doan_cat(db, n.to_cat.id, ma="CD-XEN", ten="Xén giấy")
    db.commit()
    in_ = _buoc_giay(db, n.a.id)
    _chot(db, n, admin, n.a.id, ids=[cd2.id, n.cd.id])
    moi = _tuyen(db, n.a.id)
    assert [b.ten for b in moi[:2]] == ["Xén giấy", "Cắt tờ"]
    assert all(b.chen_boi_to_cat for b in moi[:2])
    sau = {c.buoc_truoc_id: c.buoc_sau_id for c in db.query(LsxCongDoanPhuThuoc).filter(
        LsxCongDoanPhuThuoc.buoc_truoc_id.in_([moi[0].id, moi[1].id]))}
    assert sau == {moi[0].id: moi[1].id, moi[1].id: in_.id}


def test_cong_doan_khong_thuoc_to_bi_tu_choi(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    khac = _cong_doan_cat(db, n.to_sx.id, ma="CD-KHAC", ten="Bồi")
    db.commit()
    with pytest.raises(ChotGiayLoi, match="không thuộc tổ này"):
        _chot(db, n, admin, n.a.id, ids=[khac.id])
    with pytest.raises(ChotGiayLoi, match="ít nhất một công đoạn"):
        _chot(db, n, admin, n.a.id, ids=[])


def test_to_khong_co_co_bi_tu_choi(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    with pytest.raises(ChotGiayLoi, match="không phải tổ Cắt"):
        chot_giay.chot(db, user=admin, team_id=n.to_sx.id, lsx_id=n.a.id, bai_ghep_id=None,
                       cach="khong_cat", cong_doan_ids=[])


def test_khong_quyen_run_order_bi_tu_choi(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    u = User(username="khach_cat", name="Khách", password_hash="x")
    db.add(u)
    db.flush()
    cap_quyen_to(db, u, n.to_cat, viec=())
    db.commit()
    with pytest.raises(PermissionError):
        chot_giay.chot(db, user=u, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None,
                       cach="khong_cat", cong_doan_ids=[])


# --- Gỡ chốt ---------------------------------------------------------------------------------
def test_go_chot_xoa_dung_buoc_chen_va_tra_thu_tu(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    cu = [(b.id, b.thu_tu) for b in _tuyen(db, n.a.id)]
    canh_cu = db.query(LsxCongDoanPhuThuoc).count()
    kq = _chot(db, n, admin, n.a.id)
    cv_cat_id = kq["cong_viec_moi"][0]
    chot_giay.go_chot(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None)
    db.commit()
    db.expire_all()
    assert [(b.id, b.thu_tu) for b in _tuyen(db, n.a.id)] == cu
    assert db.query(LsxCongDoanPhuThuoc).count() == canh_cu
    assert db.get(SanXuatCongViec, cv_cat_id) is None
    db.refresh(n.a)
    assert n.a.giay_chot_cach is None and n.a.giay_chot_luc is None
    # Gỡ xong chốt lại được.
    _chot(db, n, admin, n.a.id, cach="khong_cat", ids=[])


def test_go_chot_khi_buoc_cat_co_me_bi_chan(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    kq = _chot(db, n, admin, n.a.id)
    from datetime import datetime, timezone

    luc = datetime(2026, 10, 1, 8, tzinfo=timezone.utc)
    db.add(SanXuatBatch(cong_viec_id=kq["cong_viec_moi"][0], bat_dau=luc, ket_thuc=luc,
                        tong=10, tot=10, don_vi="to"))
    db.commit()
    with pytest.raises(ChotGiayLoi, match="đã ghi sản lượng"):
        chot_giay.go_chot(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None)
    row = {d["id"]: d for d in chot_giay.danh_sach(db, team_id=n.to_cat.id)}[n.a.id]
    assert row["sua_duoc"] is False


def test_go_chot_khi_in_da_bat_dau_bi_chan(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    _chot(db, n, admin, n.a.id, cach="khong_cat", ids=[])
    cv_in = _cv_buoc(db, _buoc_giay(db, n.a.id).id)
    cv_in.trang_thai = CV_DANG_CHAY
    db.commit()
    with pytest.raises(ChotGiayLoi, match="Bước mang giấy đã bắt đầu"):
        chot_giay.go_chot(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None)


# --- Phát hành cập nhật / audit / báo tổ ------------------------------------------------------
def test_phat_hanh_cap_nhat_giu_buoc_chen(db, orders, lsx_svc, admin, customer):
    from app.services.san_xuat import release_update

    n = _nen(db, orders, lsx_svc, admin, customer)
    kq = _chot(db, n, admin, n.a.id)
    release_update.phat_hanh_cap_nhat(db, nguon="lsx", id=n.a.id, ly_do="Đổi máy", actor=admin)
    db.expire_all()
    cv = db.get(SanXuatCongViec, kq["cong_viec_moi"][0])
    assert cv is not None and cv.department_id == n.to_cat.id


def test_audit_chot_va_go_chot(db, orders, lsx_svc, admin, customer):
    from app.audit_registry import tra

    n = _nen(db, orders, lsx_svc, admin, customer)
    _chot(db, n, admin, n.a.id)
    chot_giay.go_chot(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None)
    db.commit()
    rows = db.query(AuditLog).filter(AuditLog.target == f"lsx:{n.a.id}",
                                     AuditLog.action.like("san_xuat.%chot_giay")).all()
    assert [r.action for r in rows] == ["san_xuat.chot_giay", "san_xuat.go_chot_giay"]
    assert "Cắt tờ" in rows[0].detail and n.a.ma in rows[0].detail
    assert tra("san_xuat.chot_giay").nhan == "Tổ Cắt chốt giấy"
    assert tra("san_xuat.go_chot_giay").nhan == "Tổ Cắt gỡ chốt giấy"


def test_phat_hanh_bao_to_cat(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    assert chot_giay.to_cat_can_bao(db, n.a.id) == [n.to_cat.id]
    _chot(db, n, admin, n.a.id, cach="khong_cat", ids=[])
    assert chot_giay.to_cat_can_bao(db, n.a.id) == []
    n.to_cat.la_to_cat = False
    db.commit()
    assert chot_giay.to_cat_can_bao(db, n.b.id) == []


def test_router_chot_va_loi_nghiep_vu(db, orders, lsx_svc, admin, customer):
    from fastapi import HTTPException

    from app.routers import san_xuat as r
    from app.schemas.san_xuat import ChotGiayDongOut, ChotGiayIn, GoChotGiayIn

    n = _nen(db, orders, lsx_svc, admin, customer)
    ds = r.chot_giay_ds(db=db, user=admin, team_id=n.to_cat.id)
    assert n.a.id in {ChotGiayDongOut.model_validate(d).id for d in ds}
    res = r.chot_giay_ghi(ChotGiayIn(team_id=n.to_cat.id, lsx_id=n.a.id, cach="cat",
                                     cong_doan_ids=[n.cd.id]), db=db, user=admin)
    assert res["cach"] == "cat" and res["to_mang_giay"] == [n.to_sx.id]
    with pytest.raises(HTTPException) as e:
        r.chot_giay_ghi(ChotGiayIn(team_id=n.to_cat.id, lsx_id=n.a.id, cach="khong_cat"),
                        db=db, user=admin)
    assert e.value.status_code == 409 and "Đã chốt" in e.value.detail
    r.chot_giay_go(GoChotGiayIn(team_id=n.to_cat.id, lsx_id=n.a.id), db=db, user=admin)
    db.expire_all()
    assert db.get(type(n.a), n.a.id).giay_chot_cach is None
