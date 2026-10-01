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
    """`cach="cat"` = THÊM công đoạn (`chot_giay.them`); "khong_cat" = chốt không cắt."""
    if cach == "cat":
        kq = chot_giay.them(db, user=admin, team_id=n.to_cat.id, lsx_id=lsx_id, bai_ghep_id=None,
                            cong_doan_ids=ids if ids is not None else [n.cd.id])
    else:
        kq = chot_giay.chot(db, user=admin, team_id=n.to_cat.id, lsx_id=lsx_id, bai_ghep_id=None,
                            cach=cach, cong_doan_ids=[])
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


# --- Thêm bước cắt (luật mới: chèn NGAY TRƯỚC In, xem test_san_xuat_chot_giay_truoc_in.py) -----
def test_them_cat_tao_buoc_ngay_truoc_in_canh_toi_in_va_cong_viec_cung_goi(
        db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    cu = [(b.id, b.ten) for b in _tuyen(db, n.a.id)]
    in_ = _buoc_giay(db, n.a.id)
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
    # In nay chỉ chờ Cắt; chặng trước cũ của In chuyển sang Cắt.
    assert {c.id for c in sl.cong_viec_chang_truoc(cv_in)} == {cv_cat.id}
    assert {c.id for c in sl.cong_viec_chang_truoc(cv_cat)} == truoc_cu
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


def test_cong_doan_khong_khai_don_vi_thi_buoc_chen_van_co_don_vi(
        db, orders, lsx_svc, admin, customer):
    # Danh mục thật có công đoạn Cắt tờ để trống đơn vị — bước chèn thiếu đơn vị thì tổ Cắt không
    # ghi được mẻ ("chưa có đơn vị"). Vào = tờ nguyên, ra = đơn vị bước mang giấy nhận.
    n = _nen(db, orders, lsx_svc, admin, customer)
    trong = _cong_doan_cat(db, n.to_cat.id, ma="CD-TRONG", ten="Cắt trống")
    trong.don_vi_vao = trong.don_vi_ra = None
    db.commit()
    in_ = _buoc_giay(db, n.a.id)
    _chot(db, n, admin, n.a.id, ids=[trong.id, n.cd.id])
    moi = _tuyen(db, n.a.id)
    assert (moi[0].don_vi_vao, moi[0].don_vi_ra) == ("to_nguyen", in_.don_vi_vao)
    assert (moi[1].don_vi_vao, moi[1].don_vi_ra) == ("to", "to")
    assert _cv_buoc(db, moi[0].id).don_vi_ra == in_.don_vi_vao


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


# --- Xoá bước cắt / gỡ chốt "không cắt" ------------------------------------------------------
def test_xoa_buoc_them_tra_lai_tuyen_va_thu_tu(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    cu = [(b.id, b.thu_tu) for b in _tuyen(db, n.a.id)]
    canh_cu = db.query(LsxCongDoanPhuThuoc).count()
    kq = _chot(db, n, admin, n.a.id)
    cv_cat_id = kq["cong_viec_moi"][0]
    # "Gỡ chốt" chỉ dành cho "không cắt" — bước cắt thì xoá từng công đoạn.
    with pytest.raises(ChotGiayLoi, match="xoá từng công đoạn"):
        chot_giay.go_chot(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None)
    buoc_cat = db.get(SanXuatCongViec, cv_cat_id).lsx_cong_doan_id
    chot_giay.xoa(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None,
                  buoc_id=buoc_cat)
    db.commit()
    db.expire_all()
    assert [(b.id, b.thu_tu) for b in _tuyen(db, n.a.id)] == cu
    assert db.query(LsxCongDoanPhuThuoc).count() == canh_cu
    assert db.get(SanXuatCongViec, cv_cat_id) is None
    db.refresh(n.a)
    assert n.a.giay_chot_cach == "khong_cat"     # xoá hết bước cắt = không cắt
    chot_giay.go_chot(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None)
    db.commit()
    db.refresh(n.a)
    assert n.a.giay_chot_cach is None and n.a.giay_chot_luc is None
    # Gỡ xong chốt lại được.
    _chot(db, n, admin, n.a.id, cach="khong_cat", ids=[])


def test_xoa_khi_buoc_cat_co_me_bi_chan(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    kq = _chot(db, n, admin, n.a.id)
    from datetime import datetime, timezone

    luc = datetime(2026, 10, 1, 8, tzinfo=timezone.utc)
    cv_cat = db.get(SanXuatCongViec, kq["cong_viec_moi"][0])
    db.add(SanXuatBatch(cong_viec_id=cv_cat.id, bat_dau=luc, ket_thuc=luc,
                        tong=10, tot=10, don_vi="to"))
    db.commit()
    with pytest.raises(ChotGiayLoi, match="đã ghi sản lượng"):
        chot_giay.xoa(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None,
                      buoc_id=cv_cat.lsx_cong_doan_id)
    row = {d["id"]: d for d in chot_giay.danh_sach(db, team_id=n.to_cat.id)}[n.a.id]
    assert row["buoc_truoc_in"][0]["xoa_duoc"] is False


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
    kq = _chot(db, n, admin, n.a.id)
    buoc_cat = db.get(SanXuatCongViec, kq["cong_viec_moi"][0]).lsx_cong_doan_id
    chot_giay.xoa(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None,
                  buoc_id=buoc_cat)
    chot_giay.go_chot(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None)
    db.commit()
    rows = db.query(AuditLog).filter(AuditLog.target == f"lsx:{n.a.id}",
                                     AuditLog.action.like("san_xuat.%chot_giay")).all()
    assert [r.action for r in rows] == ["san_xuat.chot_giay", "san_xuat.chot_giay",
                                        "san_xuat.go_chot_giay"]
    assert "Cắt tờ" in rows[0].detail and n.a.ma in rows[0].detail
    assert "xoá" in rows[1].detail and "Cắt tờ" in rows[1].detail
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
    # Thêm bước cắt không còn đi qua POST /chot-giay.
    with pytest.raises(HTTPException) as e:
        r.chot_giay_ghi(ChotGiayIn(team_id=n.to_cat.id, lsx_id=n.a.id, cach="cat",
                                   cong_doan_ids=[n.cd.id]), db=db, user=admin)
    assert e.value.status_code == 409 and "Thêm công đoạn" in e.value.detail
    res = r.chot_giay_ghi(ChotGiayIn(team_id=n.to_cat.id, lsx_id=n.a.id, cach="khong_cat"),
                          db=db, user=admin)
    assert res["cach"] == "khong_cat" and res["to_mang_giay"] == [n.to_sx.id]
    with pytest.raises(HTTPException) as e:
        r.chot_giay_ghi(ChotGiayIn(team_id=n.to_cat.id, lsx_id=n.a.id, cach="khong_cat"),
                        db=db, user=admin)
    assert e.value.status_code == 409 and "Đã chốt" in e.value.detail
    r.chot_giay_go(GoChotGiayIn(team_id=n.to_cat.id, lsx_id=n.a.id), db=db, user=admin)
    db.expire_all()
    assert db.get(type(n.a), n.a.id).giay_chot_cach is None


# --- Cổng "chờ tổ Cắt" ở bước mang giấy (§4.7) -----------------------------------------------
def _kiem(db, cv):
    from app.services.san_xuat.dau_vao import kiem_bat_dau

    kiem_bat_dau(SanXuatSanLuongRepository(db), cv)


def test_in_bi_chan_khi_chua_chot(db, orders, lsx_svc, admin, customer):
    from app.models.employee import Employee
    from app.services.san_xuat import thuc_thi

    n = _nen(db, orders, lsx_svc, admin, customer)
    n.to_sx.has_piece_work = True
    nv = Employee(code="NV-CG-1", full_name="Thợ In", department_id=n.to_sx.id)
    db.add(nv)
    db.commit()
    cv_in = _cv_buoc(db, _buoc_giay(db, n.a.id).id)
    thuc_thi.phan_cong(db, user=admin, cong_viec_id=cv_in.id, employee_id=nv.id)
    with pytest.raises(ValueError, match=rf"^Chờ tổ Cắt chốt giấy cho {n.a.ma}"):
        thuc_thi.bat_dau(db, user=admin, cong_viec_id=cv_in.id)

    _chot(db, n, admin, n.a.id, cach="khong_cat", ids=[])
    assert thuc_thi.bat_dau(db, user=admin, cong_viec_id=cv_in.id)["trang_thai"] == CV_DANG_CHAY


def test_chi_tiet_bay_cau_cho_chot(db, orders, lsx_svc, admin, customer):
    from app.repositories.rbac_repo import RoleRepository
    from app.services.rbac_service import AuthorizationService
    from app.services.san_xuat import board

    n = _nen(db, orders, lsx_svc, admin, customer)
    cv_in = _cv_buoc(db, _buoc_giay(db, n.a.id).id)
    ct = board.chi_tiet_cong_viec(db, admin, AuthorizationService(RoleRepository(db)),
                                  cong_viec_id=cv_in.id)
    assert ct["cho_chot_giay"].startswith(f"Chờ tổ Cắt chốt giấy cho {n.a.ma}")
    _chot(db, n, admin, n.a.id, cach="khong_cat", ids=[])
    ct = board.chi_tiet_cong_viec(db, admin, AuthorizationService(RoleRepository(db)),
                                  cong_viec_id=cv_in.id)
    assert ct["cho_chot_giay"] is None


def test_chen_cat_in_van_cho_ban_giao_cua_cat(db, orders, lsx_svc, admin, customer):
    from app.services.san_xuat import ban_giao
    from tests.test_san_xuat_ban_giao import _batch

    n = _nen(db, orders, lsx_svc, admin, customer)
    cv_in = _cv_buoc(db, _buoc_giay(db, n.a.id).id)
    kq = _chot(db, n, admin, n.a.id)
    cv_cat = db.get(SanXuatCongViec, kq["cong_viec_moi"][0])
    assert chot_giay.ly_do_cho_chot(db, cv_in) is None
    with pytest.raises(ValueError, match=r"^Chưa nhận hàng từ công đoạn trước \(Cắt tờ\)"):
        _kiem(db, cv_in)

    # Bước cắt vừa chèn không bị cổng chờ chốt chặn — nó là chặng đầu tuyến.
    assert chot_giay.ly_do_cho_chot(db, cv_cat) is None
    _kiem(db, cv_cat)

    cv_cat.trang_thai = CV_DANG_CHAY
    cv_cat.don_vi_ra = cv_cat.don_vi_vao = "to"
    db.commit()
    bid = _batch(db, admin, cv_cat, tot=100)
    r = ban_giao.de_xuat(db, user=admin, nguon_cong_viec_id=cv_cat.id,
                         dich_cong_viec_id=cv_in.id, batch_ids=[bid])
    ban_giao.xac_nhan(db, user=admin, ban_giao_id=r["ban_giao_id"])
    _kiem(db, cv_in)


def test_khong_co_to_cat_thi_khong_chan(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    cv_in = _cv_buoc(db, _buoc_giay(db, n.a.id).id)
    assert chot_giay.ly_do_cho_chot(db, cv_in)
    n.to_cat.la_to_cat = False
    db.commit()
    assert chot_giay.ly_do_cho_chot(db, cv_in) is None
    _kiem(db, cv_in)
