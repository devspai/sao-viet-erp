"""Tổ Cắt chỉ thấy và thêm/xoá công đoạn TRƯỚC IN của tổ mình (spec dong-giay-theo-dau-vao §2, §3.0–3.3).

Phạm vi = công đoạn Giai đoạn "Trước In" (`cong_doan.nhom="prepress"`) VÀ tổ phụ trách mang cờ
`la_to_cat`. Cắt thành phẩm (tổ Cắt, giai đoạn sau in) chạy như bước thường, không hiện ở khối chốt
giấy. Lệnh cấu hình sẵn bước cắt trước In thì không khoá gì; tổ Cắt vẫn xoá / thêm được.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.models.cong_doan import CongDoan
from app.models.department import Department
from app.models.lsx import LsxCongDoan, LsxCongDoanPhuThuoc, LsxCongDoanVatTu
from app.models.san_xuat import CV_DANG_CHAY, SanXuatCongViec
from app.services.san_xuat import chot_giay, release
from app.services.san_xuat.chot_giay import ChotGiayLoi
from tests.quyen_to_fixtures import cap_quyen_to
from tests.test_san_xuat_board import (  # noqa: F401
    _hai_lsx_san_sang,
    _phat_hanh_vao_to,
    _to_moi,
    admin,
    customer,
    db,
    lsx_svc,
    orders,
)


def _cd(db, to_id: int, *, ma: str, ten: str, nhom: str, vao: str, ra: str) -> CongDoan:
    cd = CongDoan(ma=ma, ten=ten, nhom=nhom, cong_thuc_gia="so_luong * don_gia")
    db.add(cd)
    db.flush()
    cd.department_ids = [to_id]
    cd.don_vi_vao, cd.don_vi_ra = vao, ra
    db.flush()
    return cd


def _buoc_moi(lsx_id: int, cd: CongDoan, to_id: int, thu_tu: int) -> LsxCongDoan:
    return LsxCongDoan(lsx_id=lsx_id, thu_tu=thu_tu, cong_doan_id=cd.id, ten=cd.ten, nhom=cd.nhom,
                       department_id=to_id, loai_buoc="to", don_vi_vao=cd.don_vi_vao,
                       don_vi_ra=cd.don_vi_ra, so_luong_vao=0, so_luong_ra=0)


def _nen(db, orders, lsx_svc, admin, customer, *, cau_hinh: str | None = None) -> SimpleNamespace:
    """Hai lệnh một bước In có giấy, tổ Cắt + 2 công đoạn của tổ: Cắt tờ (Trước In) và Cắt thành
    phẩm (sau in). `cau_hinh` = công đoạn người lập lệnh ĐẶT SẴN vào lệnh `a` TRƯỚC khi phát hành
    ("cat_to" đứng trước In, "cat_tp" đứng sau In)."""
    to_sx = _to_moi(db, ten="Tổ SX trước in", ma="TO-SX-TI")
    to_cat = Department(name="Tổ Cắt TI", code="TO-CAT-TI", la_san_xuat=True, la_to_cat=True)
    db.add(to_cat)
    db.flush()
    cap_quyen_to(db, admin, to_cat)
    cat_to = _cd(db, to_cat.id, ma="CD-CAT-TO-TI", ten="Cắt tờ", nhom="prepress",
                 vao="to_nguyen", ra="to")
    cat_tp = _cd(db, to_cat.id, ma="CD-CAT-TP-TI", ten="Cắt thành phẩm", nhom="finishing",
                 vao="to", ra="to")
    db.commit()
    if cau_hinh is None:
        a, b, goi = _phat_hanh_vao_to(db, orders, lsx_svc, admin, customer, to_sx.id)
    else:
        a, b = _hai_lsx_san_sang(db, orders, lsx_svc, admin, customer)
        db.query(LsxCongDoan).filter(LsxCongDoan.lsx_id.in_([a.id, b.id])).update(
            {LsxCongDoan.department_id: to_sx.id}, synchronize_session=False)
        in_ = _in(db, a.id)
        if cau_hinh in ("cat_to", "cat_to_khong_giay", "cat_to_giay_chi_o_cat"):
            in_.thu_tu = 1
            buoc = _buoc_moi(a.id, cat_to, to_cat.id, 0)
            db.add(buoc)
            db.flush()
        if cau_hinh == "cat_to_khong_giay":
            pass   # người lập lệnh chỉ chọn giấy ở In (LSX26-0003, spec §1)
        elif cau_hinh in ("cat_to", "cat_to_giay_chi_o_cat"):
            g = next(v for v in in_.vat_tus if v.hang_loai == "giay")
            db.add(LsxCongDoanVatTu(
                lsx_cong_doan_id=buoc.id, hang_loai="giay", vat_tu_id=g.vat_tu_id,
                vat_tu_ma_snapshot=g.vat_tu_ma_snapshot, vat_tu_ten_snapshot=g.vat_tu_ten_snapshot,
                don_vi_snapshot=g.don_vi_snapshot, so_luong=0))
            if cau_hinh == "cat_to_giay_chi_o_cat":   # LSX26-0016: giấy chỉ ở Cắt tờ
                db.delete(g)
        else:
            db.add(_buoc_moi(a.id, cat_tp, to_cat.id, (in_.thu_tu or 0) + 1))
        db.flush()
        db.expire(a)
        lsx_svc._ap_chuoi_nguoc(a)
        db.commit()
        goi = release.phat_hanh(db, lsx_ids={a.id, b.id}, actor=admin)
        db.commit()
    return SimpleNamespace(to_sx=to_sx, to_cat=to_cat, a=a, b=b, goi=goi, cat_to=cat_to,
                           cat_tp=cat_tp)


def _tuyen(db, lsx_id) -> list[LsxCongDoan]:
    return (db.query(LsxCongDoan).filter(LsxCongDoan.lsx_id == lsx_id)
            .order_by(LsxCongDoan.thu_tu, LsxCongDoan.id).all())


def _in(db, lsx_id) -> LsxCongDoan:
    return (db.query(LsxCongDoan).filter(LsxCongDoan.lsx_id == lsx_id,
                                         LsxCongDoan.nhom == "print").one())


def _cv(db, buoc_id) -> SanXuatCongViec:
    return db.query(SanXuatCongViec).filter(SanXuatCongViec.lsx_cong_doan_id == buoc_id).one()


def _dong(db, n, lsx_id) -> dict:
    return {d["id"]: d for d in chot_giay.danh_sach(db, team_id=n.to_cat.id)}[lsx_id]


def _them(db, n, lsx_id, ids):
    kq = chot_giay.them(db, user=n.admin, team_id=n.to_cat.id, lsx_id=lsx_id, bai_ghep_id=None,
                        cong_doan_ids=ids)
    db.commit()
    db.expire_all()
    return kq


def _xoa(db, n, lsx_id, buoc_id):
    kq = chot_giay.xoa(db, user=n.admin, team_id=n.to_cat.id, lsx_id=lsx_id, bai_ghep_id=None,
                       buoc_id=buoc_id)
    db.commit()
    db.expire_all()
    return kq


def test_cong_doan_chen_duoc_chi_co_truoc_in(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    ids = {c["id"] for c in _dong(db, n, n.a.id)["cong_doan_chen_duoc"]}
    assert n.cat_to.id in ids
    assert n.cat_tp.id not in ids


def test_lenh_chua_cat_khoa_buoc_in_toi_khi_them(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    n.admin = admin
    in_ = _in(db, n.a.id)
    cv_in = _cv(db, in_.id)
    assert chot_giay.ly_do_cho_chot(db, cv_in) is not None
    d = _dong(db, n, n.a.id)
    assert d["buoc_truoc_in"] == [] and d["cau_hinh_san"] is False and d["chot"] is None

    kq = _them(db, n, n.a.id, [n.cat_to.id])

    tuyen = _tuyen(db, n.a.id)
    i_in = [b.id for b in tuyen].index(in_.id)
    cat = tuyen[i_in - 1]
    assert cat.cong_doan_id == n.cat_to.id and cat.chen_boi_to_cat
    assert [b.thu_tu for b in tuyen] == list(range(len(tuyen)))
    assert [c.buoc_sau_id for c in db.query(LsxCongDoanPhuThuoc)
            .filter_by(buoc_truoc_id=cat.id)] == [in_.id]
    g = [v for v in cat.vat_tus if v.hang_loai == "giay"]
    assert len(g) == 1
    assert g[0].dang_giay == "to" and float(g[0].so_luong) > 0
    assert {g[0].kho_rong, g[0].kho_dai} == {790, 1090}     # khổ NGUYÊN, không phải khổ in
    assert chot_giay.ly_do_cho_chot(db, _cv(db, in_.id)) is None
    assert chot_giay.buoc_lay_giay(db, ("lsx", n.a.id)).id == cat.id
    assert chot_giay.la_buoc_truoc_in_to_cat(db, cat)
    assert not chot_giay.la_buoc_truoc_in_to_cat(db, in_)
    db.refresh(n.a)
    assert n.a.giay_chot_cach == "cat"
    cv_cat = _cv(db, cat.id)
    assert kq["cong_viec_moi"] == [cv_cat.id]
    assert float(cv_cat.so_luong_vao or 0) > 0
    d = _dong(db, n, n.a.id)
    assert [b["buoc_id"] for b in d["buoc_truoc_in"]] == [cat.id]
    # Giấy hiện ở khối = dòng của bước LẤY giấy (tờ nguyên), không lặp dòng tờ in của In.
    assert len(d["giay"]) == 1 and {d["giay"][0]["kho_rong"], d["giay"][0]["kho_dai"]} == {790, 1090}


def test_lenh_cau_hinh_san_cat_khong_khoa(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer, cau_hinh="cat_to")
    tuyen = _tuyen(db, n.a.id)
    cat = next(b for b in tuyen if b.cong_doan_id == n.cat_to.id)
    in_ = _in(db, n.a.id)
    assert chot_giay.ly_do_cho_chot(db, _cv(db, cat.id)) is None
    assert chot_giay.ly_do_cho_chot(db, _cv(db, in_.id)) is None
    d = _dong(db, n, n.a.id)
    assert d["cau_hinh_san"] is True and d["chot"] is None
    assert [(b["buoc_id"], b["xoa_duoc"]) for b in d["buoc_truoc_in"]] == [(cat.id, True)]
    assert d["buoc_truoc_in"][0]["cong_doan_id"] == n.cat_to.id
    # Lệnh chưa xác nhận (b) nằm TRÊN lệnh cấu hình sẵn.
    ds = [x["id"] for x in chot_giay.danh_sach(db, team_id=n.to_cat.id)]
    assert ds.index(n.b.id) < ds.index(n.a.id)


def test_xoa_buoc_dat_san_thi_in_lay_giay(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer, cau_hinh="cat_to")
    n.admin = admin
    cat = next(b for b in _tuyen(db, n.a.id) if b.cong_doan_id == n.cat_to.id)
    cat_id, cv_cat_id = cat.id, _cv(db, cat.id).id
    in_ = _in(db, n.a.id)
    in_id = in_.id

    _xoa(db, n, n.a.id, cat_id)

    assert db.get(LsxCongDoan, cat_id) is None
    assert db.get(SanXuatCongViec, cv_cat_id) is None
    assert db.query(LsxCongDoanPhuThuoc).filter(
        (LsxCongDoanPhuThuoc.buoc_truoc_id == cat_id)
        | (LsxCongDoanPhuThuoc.buoc_sau_id == cat_id)).count() == 0
    assert [b.thu_tu for b in _tuyen(db, n.a.id)] == list(range(len(_tuyen(db, n.a.id))))
    db.refresh(n.a)
    assert n.a.giay_chot_cach == "khong_cat"
    assert chot_giay.ly_do_cho_chot(db, _cv(db, in_id)) is None
    assert chot_giay.buoc_lay_giay(db, ("lsx", n.a.id)).id == in_id


def test_xoa_noi_lai_canh_truoc_sau(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    n.admin = admin
    cd2 = _cd(db, n.to_cat.id, ma="CD-XEN-TI", ten="Xén giấy", nhom="prepress",
              vao="to_nguyen", ra="to_nguyen")
    db.commit()
    in_id = _in(db, n.a.id).id
    _them(db, n, n.a.id, [cd2.id, n.cat_to.id])
    tuyen = _tuyen(db, n.a.id)
    xen, cat = tuyen[0], tuyen[1]
    assert (xen.cong_doan_id, cat.cong_doan_id) == (cd2.id, n.cat_to.id)
    _xoa(db, n, n.a.id, cat.id)
    assert [c.buoc_sau_id for c in db.query(LsxCongDoanPhuThuoc)
            .filter_by(buoc_truoc_id=xen.id)] == [in_id]
    db.refresh(n.a)
    assert n.a.giay_chot_cach == "cat"     # còn Xén ⇒ vẫn là cắt


def test_khong_xoa_buoc_da_bat_dau(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer, cau_hinh="cat_to")
    n.admin = admin
    cat = next(b for b in _tuyen(db, n.a.id) if b.cong_doan_id == n.cat_to.id)
    _cv(db, cat.id).trang_thai = CV_DANG_CHAY
    db.commit()
    assert _dong(db, n, n.a.id)["buoc_truoc_in"][0]["xoa_duoc"] is False
    with pytest.raises(ChotGiayLoi, match="đã bắt đầu"):
        chot_giay.xoa(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None,
                      buoc_id=cat.id)


def test_buoc_cat_thanh_pham_khong_hien(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer, cau_hinh="cat_tp")
    tp = next(b for b in _tuyen(db, n.a.id) if b.cong_doan_id == n.cat_tp.id)
    d = _dong(db, n, n.a.id)
    assert d["buoc_truoc_in"] == [] and d["cau_hinh_san"] is False
    assert chot_giay.ly_do_cho_chot(db, _cv(db, _in(db, n.a.id).id)) is not None
    with pytest.raises(ChotGiayLoi):
        chot_giay.xoa(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None,
                      buoc_id=tp.id)
    with pytest.raises(ChotGiayLoi, match="không thuộc tổ này"):
        chot_giay.them(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None,
                       cong_doan_ids=[n.cat_tp.id])


def test_khong_cat_chi_khi_chua_co_buoc_cat(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer, cau_hinh="cat_to")
    with pytest.raises(ChotGiayLoi, match="Xoá công đoạn cắt"):
        chot_giay.chot(db, user=admin, team_id=n.to_cat.id, lsx_id=n.a.id, bai_ghep_id=None,
                       cach="khong_cat", cong_doan_ids=[])
    with pytest.raises(ChotGiayLoi, match="Thêm công đoạn"):
        chot_giay.chot(db, user=admin, team_id=n.to_cat.id, lsx_id=n.b.id, bai_ghep_id=None,
                       cach="cat", cong_doan_ids=[n.cat_to.id])


def test_router_them_xoa(db, orders, lsx_svc, admin, customer):
    from fastapi import HTTPException

    from app.routers import san_xuat as r
    from app.schemas.san_xuat import ChotGiayDongOut, ThemBuocCatIn, XoaBuocCatIn

    n = _nen(db, orders, lsx_svc, admin, customer)
    res = r.chot_giay_them(ThemBuocCatIn(team_id=n.to_cat.id, lsx_id=n.a.id,
                                         cong_doan_ids=[n.cat_to.id]), db=db, user=admin)
    assert res["to_mang_giay"]
    db.expire_all()
    d = ChotGiayDongOut.model_validate(_dong(db, n, n.a.id))
    assert d.chot is not None and d.chot.cach == "cat" and len(d.buoc_truoc_in) == 1
    with pytest.raises(HTTPException) as e:
        r.chot_giay_xoa(XoaBuocCatIn(team_id=n.to_cat.id, lsx_id=n.a.id,
                                     buoc_id=_in(db, n.a.id).id), db=db, user=admin)
    assert e.value.status_code == 409
    r.chot_giay_xoa(XoaBuocCatIn(team_id=n.to_cat.id, lsx_id=n.a.id,
                                 buoc_id=d.buoc_truoc_in[0].buoc_id), db=db, user=admin)
    db.expire_all()
    assert db.get(type(n.a), n.a.id).giay_chot_cach == "khong_cat"


def test_cau_hinh_san_cat_giay_chi_o_in_khong_ket(db, orders, lsx_svc, admin, customer):
    """I2 — đặt sẵn Cắt tờ nhưng chỉ chọn giấy ở In: bước cắt nhận mã giấy của In và thành bước
    lấy giấy; In không bị khoá; khối hiện đã xác nhận."""
    n = _nen(db, orders, lsx_svc, admin, customer, cau_hinh="cat_to_khong_giay")
    cat = next(b for b in _tuyen(db, n.a.id) if b.cong_doan_id == n.cat_to.id)
    in_ = _in(db, n.a.id)
    g = [v for v in cat.vat_tus if v.hang_loai == "giay"]
    assert len(g) == 1 and float(g[0].so_luong) > 0
    assert {g[0].kho_rong, g[0].kho_dai} == {790, 1090}
    assert chot_giay.buoc_lay_giay(db, ("lsx", n.a.id)).id == cat.id
    assert chot_giay.ly_do_cho_chot(db, _cv(db, in_.id)) is None
    assert chot_giay.can_chot(db, ("lsx", n.a.id)) is False
    d = _dong(db, n, n.a.id)
    assert d["cau_hinh_san"] is True


def test_cau_hinh_san_cat_khong_dong_giay_van_khong_khoa(db, orders, lsx_svc, admin, customer):
    """I2 — dữ liệu cũ: bước cắt đặt sẵn đã phát hành mà chưa mang dòng giấy ⇒ cổng vẫn mở, khối
    không báo "đã xác nhận" sai (cổng mở thật)."""
    n = _nen(db, orders, lsx_svc, admin, customer, cau_hinh="cat_to_khong_giay")
    cat = next(b for b in _tuyen(db, n.a.id) if b.cong_doan_id == n.cat_to.id)
    db.query(LsxCongDoanVatTu).filter(LsxCongDoanVatTu.lsx_cong_doan_id == cat.id).delete()
    db.commit()
    db.expire_all()
    in_ = _in(db, n.a.id)
    assert chot_giay.buoc_lay_giay(db, ("lsx", n.a.id)).id == in_.id
    assert chot_giay.ly_do_cho_chot(db, _cv(db, in_.id)) is None
    assert _dong(db, n, n.a.id)["cau_hinh_san"] is True


def test_them_lan_hai_noi_sau_buoc_cat_cu(db, orders, lsx_svc, admin, customer):
    """I3 — In đã có Cắt tờ, thêm Xén giấy rồi thêm nữa: chuỗi nối tiếp Cắt tờ → Xén → Xén₂ → In,
    khớp thứ tự `thu_tu` (nhãn "Nhận từ" + chuỗi ngược)."""
    n = _nen(db, orders, lsx_svc, admin, customer, cau_hinh="cat_to")
    n.admin = admin
    xen = _cd(db, n.to_cat.id, ma="CD-XEN-TI2", ten="Xén giấy", nhom="prepress",
              vao="to_nguyen", ra="to_nguyen")
    xen2 = _cd(db, n.to_cat.id, ma="CD-XEN-TI3", ten="Xén lại", nhom="prepress",
               vao="to_nguyen", ra="to_nguyen")
    db.commit()
    in_id = _in(db, n.a.id).id
    cat_id = next(b for b in _tuyen(db, n.a.id) if b.cong_doan_id == n.cat_to.id).id

    def _canh():
        ids = {b.id for b in _tuyen(db, n.a.id)}
        return {(c.buoc_truoc_id, c.buoc_sau_id) for c in db.query(LsxCongDoanPhuThuoc)
                if c.buoc_sau_id in ids}

    _them(db, n, n.a.id, [xen.id])
    b_xen = next(b for b in _tuyen(db, n.a.id) if b.cong_doan_id == xen.id)
    c = _canh()
    assert (cat_id, b_xen.id) in c and (b_xen.id, in_id) in c and (cat_id, in_id) not in c
    _them(db, n, n.a.id, [xen2.id])
    b_xen2 = next(b for b in _tuyen(db, n.a.id) if b.cong_doan_id == xen2.id)
    c = _canh()
    assert (b_xen.id, b_xen2.id) in c and (b_xen2.id, in_id) in c and (b_xen.id, in_id) not in c
    assert (cat_id, in_id) not in c
    thu_tu = [b.id for b in _tuyen(db, n.a.id)]
    assert thu_tu.index(cat_id) < thu_tu.index(b_xen.id) < thu_tu.index(b_xen2.id)         < thu_tu.index(in_id)
    assert chot_giay.buoc_lay_giay(db, ("lsx", n.a.id)).id == cat_id


def test_xoa_buoc_cat_duy_nhat_mang_giay_chuyen_giay_sang_in(db, orders, lsx_svc, admin, customer):
    """B1 — giấy chỉ đặt ở Cắt tờ, In không có dòng giấy; tổ Cắt xoá Cắt tờ ⇒ In nhận mã giấy, dẫn
    xuất theo đầu vào của In (tờ in, khổ in), In thành bước lấy giấy — lệnh không mất giấy."""
    n = _nen(db, orders, lsx_svc, admin, customer, cau_hinh="cat_to_giay_chi_o_cat")
    n.admin = admin
    in_ = _in(db, n.a.id)
    assert not [v for v in in_.vat_tus if v.hang_loai == "giay"]
    cat = next(b for b in _tuyen(db, n.a.id) if b.cong_doan_id == n.cat_to.id)
    ma_giay = next(v.vat_tu_id for v in cat.vat_tus if v.hang_loai == "giay")
    in_id = in_.id

    _xoa(db, n, n.a.id, cat.id)

    in_ = db.get(LsxCongDoan, in_id)
    g = [v for v in in_.vat_tus if v.hang_loai == "giay"]
    assert [v.vat_tu_id for v in g] == [ma_giay]
    assert g[0].dang_giay == "to"
    assert float(g[0].so_luong) == pytest.approx(float(in_.so_luong_vao))
    assert float(g[0].so_luong) > 0
    assert g[0].kho_rong > 0 and {g[0].kho_rong, g[0].kho_dai} != {790, 1090}   # khổ tờ in
    assert chot_giay.buoc_lay_giay(db, ("lsx", n.a.id)).id == in_id
    assert n.a.id in {d["id"] for d in chot_giay.danh_sach(db, team_id=n.to_cat.id)}
