"""Bước KCS cuối xét tiêu chí GỘP cả chuỗi (`docs/design-tieu-chi-kcs-lam-lai.md` §3, 08/10/2026).

Soi `services/san_xuat/kcs_checklist.py` qua đường thật `kcs.kiem_cong_doan` /
`chuoi_cong_doan_kcs`:
  · thứ tự gộp: lệnh phụ cùng nhóm trước, rồi lệnh chính từ đầu tới bước cuối; phân đoạn góp MỘT lần;
  · mọi tiêu chí gộp phải có kết quả; tiêu chí của X không đạt ⇒ phải có dòng lỗi quy về X;
  · công thức đạt / gửi kho KHÔNG đổi: đạt = phần chưa kiểm − Σ dòng lỗi (đơn vị bước cuối);
  · quy lỗi về lệnh phụ chỉ được từ bước cuối; bước giữa vẫn luật cũ; lệnh ngoài nhóm bị chặn.
"""
from __future__ import annotations

import pytest

from app.models.lsx import Lsx
from app.models.san_xuat import SanXuatCongViec
from app.models.san_xuat_kcs import SanXuatKcsBatch
from app.services.san_xuat import kcs, kho
from app.services.san_xuat.kcs_checklist import checklist_gop, chuoi_gop
from tests.test_san_xuat_kcs import _anh, _chuoi_hai_to, _ghi_tot  # noqa: F401
from tests.test_san_xuat_nhap_kho_tp import _gop_lenh_thu_hai_vao_nhom
from tests.test_san_xuat_thuc_thi import (  # noqa: F401
    admin,
    customer,
    db,
    lsx_svc,
    orders,
)

_TC_TRUOC = [{"tieu_chi_id": 11, "ma": "KM0011", "ten": "Đúng màu", "thu_tu": 1},
             {"tieu_chi_id": 12, "ma": "KM0012", "ten": "Không lem", "thu_tu": 2}]
_TC_SAU = [{"tieu_chi_id": 21, "ma": "KM0021", "ten": "Đủ số trong thùng", "thu_tu": 1}]


def _canh(db, orders, lsx_svc, admin, customer, ma):
    """Chuỗi hai bước có tiêu chí ở cả hai: `truoc` 2 tiêu chí, `sau` (cuối, 100 tốt) 1 tiêu chí."""
    truoc, sau, to_chiu, tt, nguoi = _chuoi_hai_to(db, orders, lsx_svc, admin, customer, ma)
    truoc.kcs_tieu_chi_json = _TC_TRUOC
    sau.kcs_tieu_chi_json = _TC_SAU
    db.commit()
    return truoc, sau, to_chiu, tt, nguoi


def _du(truoc, sau, *, truoc_2_dat=True):
    return [
        {"cong_viec_id": truoc.id, "thu_tu": 1, "dat": True},
        {"cong_viec_id": truoc.id, "thu_tu": 2, "dat": truoc_2_dat, "ghi_chu": "lem góc"},
        {"cong_viec_id": sau.id, "thu_tu": 1, "dat": True},
    ]


def _loi(cv, sl, mo_ta="Lem mực"):
    return {"cong_viec_id": cv.id, "so_luong": sl, "mo_ta": mo_ta, "anh": _anh()}


# --- Thứ tự gộp -------------------------------------------------------------------------------
def test_gop_theo_thu_tu_chuoi_mot_lenh(db, orders, lsx_svc, admin, customer):
    truoc, sau, *_ = _canh(db, orders, lsx_svc, admin, customer, "GOP-1")
    gop = checklist_gop(db, chuoi_gop(db, sau, truoc.lsx_id), truoc.lsx_id)
    assert [(m["cong_viec_id"], m["thu_tu"], m["ten"]) for m in gop] == [
        (truoc.id, 1, "Đúng màu"), (truoc.id, 2, "Không lem"), (sau.id, 1, "Đủ số trong thùng"),
    ]
    assert all(m["la_lenh_phu"] is False for m in gop)
    assert gop[0]["ten_cong_doan"] == truoc.ten_cong_doan and gop[0]["lsx_ma"]


def test_phan_doan_chi_gop_mot_lan_gan_phan_doan_cuoi(db, orders, lsx_svc, admin, customer):
    truoc, sau, *_ = _canh(db, orders, lsx_svc, admin, customer, "GOP-PD")
    lan2 = SanXuatCongViec(
        goi_id=truoc.goi_id, lsx_id=truoc.lsx_id, lsx_cong_doan_id=truoc.lsx_cong_doan_id,
        step_key=truoc.step_key, phan_doan_so=2, phan_doan_tong=2, ten_cong_doan=truoc.ten_cong_doan,
        trang_thai=truoc.trang_thai, department_id=truoc.department_id, don_vi_ra="cái",
        don_vi_vao="cái", kcs_tieu_chi_json=_TC_TRUOC,
    )
    db.add(lan2)
    db.commit()
    gop = checklist_gop(db, chuoi_gop(db, sau, truoc.lsx_id), truoc.lsx_id)
    assert [(m["cong_viec_id"], m["thu_tu"]) for m in gop] == [
        (lan2.id, 1), (lan2.id, 2), (sau.id, 1),
    ]


# --- Luật lưu ở bước cuối ---------------------------------------------------------------------
def test_kiem_thieu_ket_qua_hoac_khong_dat_ma_khong_ghi_loi_bi_chan(
        db, orders, lsx_svc, admin, customer):
    truoc, sau, _to, _tt, nguoi = _canh(db, orders, lsx_svc, admin, customer, "GOP-LUAT")
    lid = truoc.lsx_id
    with pytest.raises(ValueError, match="Còn 2 tiêu chí chưa ghi kết quả"):
        kcs.kiem_cong_doan(db, user=nguoi, cong_viec_id=sau.id, lsx_id=lid,
                           checklist_ket_qua=[{"cong_viec_id": sau.id, "thu_tu": 1, "dat": True}])
    with pytest.raises(ValueError, match="có tiêu chí không đạt nhưng chưa ghi lỗi"):
        kcs.kiem_cong_doan(db, user=nguoi, cong_viec_id=sau.id, lsx_id=lid,
                           checklist_ket_qua=_du(truoc, sau, truoc_2_dat=False),
                           cac_loi=[_loi(sau, 3, "Móp")])
    assert db.query(SanXuatKcsBatch).count() == 0

    res = kcs.kiem_cong_doan(db, user=nguoi, cong_viec_id=sau.id, lsx_id=lid,
                             checklist_ket_qua=_du(truoc, sau, truoc_2_dat=False),
                             cac_loi=[_loi(truoc, 4)])
    luu = db.get(SanXuatKcsBatch, res["kcs_batch_id"]).checklist_json
    assert luu == [
        {"cong_viec_id": truoc.id, "thu_tu": 1, "dat": True, "ghi_chu": None},
        {"cong_viec_id": truoc.id, "thu_tu": 2, "dat": False, "ghi_chu": "lem góc"},
        {"cong_viec_id": sau.id, "thu_tu": 1, "dat": True, "ghi_chu": None},
    ]


def test_so_dat_va_so_gui_kho_khong_doi_cong_thuc(db, orders, lsx_svc, admin, customer):
    """100 tốt ở bước cuối; lỗi 30 quy về bước trước + 20 của chính bước cuối ⇒ đạt 50 = gửi kho."""
    truoc, sau, _to, _tt, nguoi = _canh(db, orders, lsx_svc, admin, customer, "GOP-SO")
    res = kcs.kiem_cong_doan(db, user=nguoi, cong_viec_id=sau.id, lsx_id=truoc.lsx_id,
                             checklist_ket_qua=_du(truoc, sau, truoc_2_dat=False),
                             cac_loi=[_loi(truoc, 30), _loi(sau, 20, "Móp")])
    assert res["so_dat"] == 50 and res["so_loi"] == 50
    assert kho.so_con_gui_kho(db, sau, []) == 50


def _canh_nhom(db, orders, lsx_svc, admin, customer, ma):
    """`_canh` + lệnh còn lại của đơn vào CÙNG nhóm (lệnh phụ), công việc đầu của nó có tiêu chí.
    Bước cuối gắn nhóm để `chuoi_gop` tìm ra thành viên."""
    truoc, sau, to_chiu, tt, nguoi = _canh(db, orders, lsx_svc, admin, customer, ma)
    assert truoc.nhom_id is not None
    sau.nhom_id = truoc.nhom_id
    db.commit()
    _gop_lenh_thu_hai_vao_nhom(db, truoc)
    lenh = db.get(Lsx, truoc.lsx_id)
    phu = db.query(Lsx).filter(Lsx.order_id == lenh.order_id, Lsx.id != lenh.id).one()
    cv_phu = (db.query(SanXuatCongViec).filter_by(lsx_id=phu.id)
              .order_by(SanXuatCongViec.id).first())
    cv_phu.kcs_tieu_chi_json = [{"tieu_chi_id": 31, "ma": "KM0031", "ten": "Bồi phẳng", "thu_tu": 1}]
    db.commit()
    return truoc, sau, cv_phu, phu, nguoi


def _du_nhom(truoc, sau, cv_phu, *, phu_dat=True):
    return [{"cong_viec_id": cv_phu.id, "thu_tu": 1, "dat": phu_dat}] + _du(truoc, sau)


def test_nhom_gop_ca_lenh_phu_dung_truoc(db, orders, lsx_svc, admin, customer):
    truoc, sau, cv_phu, phu, nguoi = _canh_nhom(db, orders, lsx_svc, admin, customer, "GOP-NH")
    ds = {c["cong_viec_id"]: c for c in kcs.chuoi_cong_doan_kcs(db, nguoi, truoc.lsx_id)["cong_doan"]}
    gop = ds[sau.id]["checklist"]
    assert [(m["cong_viec_id"], m["la_lenh_phu"]) for m in gop] == [
        (cv_phu.id, True), (truoc.id, False), (truoc.id, False), (sau.id, False),
    ]
    assert gop[0]["lsx_ma"] == phu.ma
    nguon = ds[sau.id]["nguon_loi"]
    assert nguon[0]["cong_viec_id"] == cv_phu.id and nguon[0]["lsx_ma"] == phu.ma
    assert [n["la_dang_kiem"] for n in nguon].count(True) == 1 and nguon[-1]["cong_viec_id"] == sau.id
    # Bước giữa không xét tiêu chí, không có danh sách nguồn lỗi.
    assert ds[truoc.id]["checklist"] == [] and ds[truoc.id]["nguon_loi"] == []


def test_nhom_quy_loi_ve_lenh_phu_tu_buoc_cuoi(db, orders, lsx_svc, admin, customer):
    truoc, sau, cv_phu, phu, nguoi = _canh_nhom(db, orders, lsx_svc, admin, customer, "GOP-NQ")
    res = kcs.kiem_cong_doan(db, user=nguoi, cong_viec_id=sau.id, lsx_id=truoc.lsx_id,
                             checklist_ket_qua=_du_nhom(truoc, sau, cv_phu, phu_dat=False),
                             cac_loi=[_loi(cv_phu, 6, "Bồi phồng")])
    [m] = res["bao_loi_nguon"]
    assert m["cong_viec_id"] == cv_phu.id and m["department_id"] == cv_phu.department_id
    assert res["so_dat"] == 94
    # Màn chuỗi của LỆNH PHỤ thấy lỗi bắt ở bước cuối của thân chính.
    ds = {c["cong_viec_id"]: c for c in kcs.chuoi_cong_doan_kcs(db, nguoi, phu.id)["cong_doan"]}
    assert ds[cv_phu.id]["loi_buoc_sau"] == [
        {"phat_hien_o": sau.ten_cong_doan, "don_vi": sau.don_vi_ra, "so_luong": 6.0}
    ]


def test_nhom_buoc_giua_khong_quy_loi_ve_lenh_phu(db, orders, lsx_svc, admin, customer):
    truoc, sau, cv_phu, _phu, nguoi = _canh_nhom(db, orders, lsx_svc, admin, customer, "GOP-NG")
    _ghi_tot(db, truoc, 50)
    with pytest.raises(ValueError, match="đứng trước"):
        kcs.kiem_cong_doan(db, user=nguoi, cong_viec_id=truoc.id, lsx_id=truoc.lsx_id,
                           cac_loi=[_loi(cv_phu, 1)])


def test_quy_loi_ve_lenh_ngoai_nhom_bi_chan(db, orders, lsx_svc, admin, customer):
    """Không gộp nhóm: lệnh kia của đơn là lệnh NGOÀI — bước cuối không quy lỗi về nó được."""
    truoc, sau, _to, _tt, nguoi = _canh(db, orders, lsx_svc, admin, customer, "GOP-NGOAI")
    lenh = db.get(Lsx, truoc.lsx_id)
    khac = db.query(Lsx).filter(Lsx.order_id == lenh.order_id, Lsx.id != lenh.id).one()
    cv_khac = db.query(SanXuatCongViec).filter_by(lsx_id=khac.id).first()
    with pytest.raises(ValueError, match="lệnh cùng nhóm"):
        kcs.kiem_cong_doan(db, user=nguoi, cong_viec_id=sau.id, lsx_id=truoc.lsx_id,
                           checklist_ket_qua=_du(truoc, sau), cac_loi=[_loi(cv_khac, 1)])


def test_buoc_cuoi_chua_gan_nhom_van_gop_theo_nhom_cua_lenh(db, orders, lsx_svc, admin, customer):
    """Việc cuối chưa gắn `nhom_id` — nhóm tra từ thành viên nhóm của lệnh chính."""
    truoc, sau, cv_phu, _phu, nguoi = _canh_nhom(db, orders, lsx_svc, admin, customer, "GOP-GH")
    lid = truoc.lsx_id
    sau.nhom_id = None
    db.commit()
    gop_truoc = [(m["cong_viec_id"]) for m in checklist_gop(db, chuoi_gop(db, sau, lid), lid)]
    assert gop_truoc[0] == cv_phu.id and gop_truoc[-1] == sau.id
