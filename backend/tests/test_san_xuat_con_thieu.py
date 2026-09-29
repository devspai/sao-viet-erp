"""Con số CÒN THIẾU — dẫn xuất (docs/spec-thuc-te-vs-ke-hoach.md §2.3).

Ở mức BƯỚC nó chỉ để bày. Ở mức NHÓM, từ 17/09/2026 cổng đóng ĐỦ so chính số này (điều kiện
`dat_muc_tieu`, soi ở `test_san_xuat_dong_lenh.py`); file này chỉ chốt số XUẤT HIỆN đúng.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.san_xuat import CV_DANG_CHAY
from app.models.san_xuat_kcs import SanXuatKcsBatch
from app.models.san_xuat_san_luong import SanXuatBatch
from app.services.san_xuat import dong_lenh

# `_authz` đã có sẵn ở `tests/test_san_xuat_board.py:100` (và được `test_san_xuat_thuc_thi` re-export)
# — dựng đúng như `deps.get_authorization_service`, nhận `RoleRepository` chứ KHÔNG nhận `Session`.
# Đừng chép lần hai, tái dùng cho khớp mọi nơi khác trong bộ test module này.
from tests.test_san_xuat_thuc_thi import (  # noqa: F401
    _cvs, _mot_cv, _phat_hanh_vao_to, _to_khoan, _authz, admin, customer, db, lsx_svc, orders,
)

_T0 = datetime(2026, 8, 19, 8, 0, tzinfo=timezone.utc)


def test_buoc_chay_thieu_thi_con_thieu_bang_hieu(db, orders, lsx_svc, admin, customer):
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-CT1")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_ra = 10000
    cv.don_vi_ra = "tờ"
    db.add(SanXuatBatch(cong_viec_id=cv.id, bat_dau=_T0, ket_thuc=_T0 + timedelta(hours=2),
                        tong=9400, tot=9400, hong=0, don_vi="tờ"))
    db.commit()

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["muc_tieu"] == 10000.0
    assert ct["san_luong"]["con_thieu"] == 600.0
    assert ct["san_luong"]["don_vi"] == "tờ"


def test_chay_du_thi_con_thieu_bang_khong(db, orders, lsx_svc, admin, customer):
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-CT2")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_ra = 500
    cv.don_vi_ra = "tờ"
    db.add(SanXuatBatch(cong_viec_id=cv.id, bat_dau=_T0, ket_thuc=_T0 + timedelta(hours=1),
                        tong=520, tot=520, hong=0, don_vi="tờ"))
    db.commit()

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["con_thieu"] == 0.0   # chạy dư KHÔNG ra số âm


def test_buoc_khong_khai_muc_tieu_thi_khong_bia_so(db, orders, lsx_svc, admin, customer):
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-CT3")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_ra = None
    db.commit()

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["muc_tieu"] is None
    assert ct["san_luong"]["con_thieu"] is None


def test_nhom_co_so_con_thieu_ma_cong_dong_khong_doi(
    db, orders, lsx_svc, admin, customer,
):
    """Số còn thiếu XUẤT HIỆN ở nhóm, khớp với cảnh báo `thieu_muc_tieu` của hộp đóng lệnh.

    Kịch bản: CV còn `CV_DANG_CHAY`, KCS mới kiểm 9000/9400 tốt ⇒ đạt 8800/10000."""
    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-CT4")
    cv.trang_thai = CV_DANG_CHAY
    cv.la_kcs_cuoi = True
    cv.so_luong_ra = 10000
    cv.don_vi_ra = "cuốn"
    db.add(SanXuatBatch(cong_viec_id=cv.id, bat_dau=_T0, ket_thuc=_T0 + timedelta(hours=2),
                        tong=9400, tot=9400, hong=0, don_vi="cuốn"))
    # KCS mới kiểm 9000/9400 tốt: đạt 8800, lỗi 200.
    db.add(SanXuatKcsBatch(cong_viec_id=cv.id, bat_dau=_T0, ket_thuc=_T0, so_luong_nhan=9000,
                           so_luong_dat=8800, so_luong_khong_dat=200, don_vi="cuốn"))
    db.commit()

    tt = dong_lenh.tinh_trang_dong(db, cv.nhom_id)
    assert tt["muc_tieu"] == 10000.0
    # "Đã đạt" đếm số KCS ĐẠT (đi kho được), không đếm 9400 tốt tổ tự ghi.
    assert tt["da_dat"] == 8800.0
    cau = {c["ma"]: c["cau"] for c in tt["canh_bao"]}
    assert "thieu_muc_tieu" in cau and "8.800 / 10.000" in cau["thieu_muc_tieu"]
    assert "1.200" in cau["thieu_muc_tieu"]


def test_work_items_con_thieu_dung_tung_dong_khi_gop_nhieu_viec(
    db, orders, lsx_svc, admin, customer,
):
    """Canh nhánh nạp GỘP (`SanXuatSanLuongRepository.tong_tot_nhieu`, `board.work_items` dùng nó
    để tránh N+1): HAI công việc CÙNG một tổ, mỗi cái HAI batch, mục tiêu khác nhau hẳn nhau.

    Ba test mức-một-việc phía trên đều đi qua `chi_tiet_cong_viec` (dùng `tong_tot` đơn lẻ) hoặc
    nhóm chỉ có MỘT công việc — không cái nào phát hiện được `group_by` gán nhầm tổng sang id khác
    hay map tra sai key. Test này mới canh đúng chỗ đó: hai con số còn thiếu PHẢI khác nhau đúng
    theo đúng công việc của nó, không hoán đổi/chung một số."""
    from app.services.san_xuat import board

    to = _to_khoan(db, admin, ma="TO-CT6")
    _phat_hanh_vao_to(db, orders, lsx_svc, admin, customer, to.id)
    cvs = _cvs(db, to)
    assert len(cvs) >= 2, "cần ít nhất hai công việc cùng tổ để canh nạp gộp"
    cv1, cv2 = cvs[0], cvs[1]

    cv1.trang_thai = CV_DANG_CHAY
    cv1.so_luong_ra = 10000
    cv1.don_vi_ra = "tờ"
    cv2.trang_thai = CV_DANG_CHAY
    cv2.so_luong_ra = 3000
    cv2.don_vi_ra = "tờ"
    db.add_all([
        SanXuatBatch(cong_viec_id=cv1.id, bat_dau=_T0, ket_thuc=_T0 + timedelta(hours=1),
                     tong=4000, tot=4000, hong=0, don_vi="tờ"),
        SanXuatBatch(cong_viec_id=cv1.id, bat_dau=_T0 + timedelta(hours=1),
                     ket_thuc=_T0 + timedelta(hours=2), tong=3000, tot=3000, hong=0, don_vi="tờ"),
        SanXuatBatch(cong_viec_id=cv2.id, bat_dau=_T0, ket_thuc=_T0 + timedelta(hours=1),
                     tong=1000, tot=1000, hong=0, don_vi="tờ"),
        SanXuatBatch(cong_viec_id=cv2.id, bat_dau=_T0 + timedelta(hours=1),
                     ket_thuc=_T0 + timedelta(hours=2), tong=500, tot=500, hong=0, don_vi="tờ"),
    ])
    db.commit()

    # Hình PHẲNG (từng công việc) — mặc định `nhom="lenh"` gom theo lệnh từ 11/09/2026.
    res = board.work_items(db, admin, _authz(db), team_id=to.id, nhom="phang")
    by_id = {item["id"]: item for item in res["cong_viec"]}
    # cv1: tổng tốt 4000+3000=7000, mục tiêu 10000 ⇒ còn thiếu 3000.
    assert by_id[cv1.id]["con_thieu"] == 3000.0
    # cv2: tổng tốt 1000+500=1500, mục tiêu 3000 ⇒ còn thiếu 1500 — khác hẳn số của cv1. Nếu
    # `group_by`/map lệch key (vd gán nhầm tổng của cv1 cho cv2) thì một trong hai assert đỏ.
    assert by_id[cv2.id]["con_thieu"] == 1500.0


# --- Mốc chấm rút theo lượng THỰC NHẬN ------------------------------------------------------
def _giao_toi(db, dich_cv, so_luong: float, don_vi: str, *, nguon_cv_id: int | None = None):
    """Một bàn giao ĐÃ XÁC NHẬN đổ về `dich_cv` — đây là "thực nhận" của bước đó."""
    from app.models.san_xuat_san_luong import BG_XAC_NHAN, SanXuatBanGiao

    db.add(SanXuatBanGiao(
        nguon_cong_viec_id=nguon_cv_id or dich_cv.id,
        dich_cong_viec_id=dich_cv.id,
        so_luong=so_luong, don_vi=don_vi, trang_thai=BG_XAC_NHAN,
    ))
    db.commit()


def test_nhan_thieu_thi_moc_rut_theo_ti_le_khong_de_ke_hoach(
    db, orders, lsx_svc, admin, customer
):
    """Tổ trước giao thiếu ⇒ mốc chấm của tổ này rút theo tỉ lệ, KẾ HOẠCH giữ nguyên.

    Kế hoạch: vào 1.000 tờ → ra 1.000 cái. Thực nhận 960 tờ ⇒ mốc còn 960 cái. Làm đủ 960 thì
    KHÔNG thiếu gì — hụt 40 là của tổ trước, không đổ sang đây.
    """
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-TN1")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_vao, cv.don_vi_vao = 1000, "tờ"
    cv.so_luong_ra, cv.don_vi_ra = 1000, "cái"
    db.add(SanXuatBatch(cong_viec_id=cv.id, bat_dau=_T0, ket_thuc=_T0 + timedelta(hours=2),
                        tong=960, tot=960, hong=0, don_vi="cái"))
    db.commit()
    _giao_toi(db, cv, 960, "tờ")

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["thuc_nhan"] == 960.0
    assert ct["san_luong"]["muc_tieu"] == 960.0
    assert ct["san_luong"]["con_thieu"] == 0.0
    # Kế hoạch KHÔNG bị đè.
    assert ct["cong_viec"]["so_luong_vao"] == 1000.0
    assert ct["cong_viec"]["so_luong_ra"] == 1000.0
    assert ct["cong_viec"]["da_lam"] == 960.0


def test_nhan_du_ma_lam_thieu_thi_van_hut_dung_o_to_nay(db, orders, lsx_svc, admin, customer):
    """Nhận đủ 1.000 mà chỉ ra 960 ⇒ hụt 40 nằm ở CHÍNH tổ này — đúng địa chỉ."""
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-TN2")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_vao, cv.don_vi_vao = 1000, "tờ"
    cv.so_luong_ra, cv.don_vi_ra = 1000, "cái"
    db.add(SanXuatBatch(cong_viec_id=cv.id, bat_dau=_T0, ket_thuc=_T0 + timedelta(hours=2),
                        tong=1000, tot=960, hong=40, don_vi="cái"))
    db.commit()
    _giao_toi(db, cv, 1000, "tờ")

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["muc_tieu"] == 1000.0
    assert ct["san_luong"]["con_thieu"] == 40.0


def test_khong_ai_giao_toi_thi_giu_nguyen_moc_ke_hoach(db, orders, lsx_svc, admin, customer):
    """Bước ĐẦU chuỗi lấy vật tư từ kho, không ai bàn giao tới ⇒ mốc vẫn là kế hoạch, không tụt về 0."""
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-TN3")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_vao, cv.don_vi_vao = 1000, "tờ"
    cv.so_luong_ra, cv.don_vi_ra = 1000, "cái"
    db.add(SanXuatBatch(cong_viec_id=cv.id, bat_dau=_T0, ket_thuc=_T0 + timedelta(hours=2),
                        tong=900, tot=900, hong=0, don_vi="cái"))
    db.commit()

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["thuc_nhan"] is None
    assert ct["san_luong"]["muc_tieu"] == 1000.0
    assert ct["san_luong"]["con_thieu"] == 100.0


def test_moc_quy_doi_khi_vao_ra_khac_don_vi(db, orders, lsx_svc, admin, customer):
    """Nhận "tờ" mà ra "cái": 12 tờ → 1.188 cái. Nhận 11 tờ ⇒ mốc 1.089 cái, không phải 11."""
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-TN4")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_vao, cv.don_vi_vao = 12, "tờ"
    cv.so_luong_ra, cv.don_vi_ra = 1188, "cái"
    cv.he_so_quy_doi = 99                     # 99 cái/tờ — snapshot thật ghi kèm hệ số bình bài
    db.commit()
    _giao_toi(db, cv, 11, "tờ")

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["muc_tieu"] == 1089.0
    assert ct["san_luong"]["con_thieu"] == 1089.0


def test_nhan_du_bu_hao_thi_moc_khong_phinh_len(db, orders, lsx_svc, admin, customer):
    """Nhà in giao dư để bù hao (1.050 tờ cho 1.000 cái) — nhận dư KHÔNG bắt tổ làm nhiều hơn
    cam kết. Mốc chỉ rút xuống, không đẩy lên."""
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-TN5")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_vao, cv.don_vi_vao = 1000, "tờ"
    cv.so_luong_ra, cv.don_vi_ra = 1000, "cái"
    db.add(SanXuatBatch(cong_viec_id=cv.id, bat_dau=_T0, ket_thuc=_T0 + timedelta(hours=2),
                        tong=1000, tot=1000, hong=0, don_vi="cái"))
    db.commit()
    _giao_toi(db, cv, 1050, "tờ")

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["muc_tieu"] == 1000.0
    assert ct["san_luong"]["con_thieu"] == 0.0


def test_moc_rut_theo_he_so_quy_doi_khop_tran_ghi_me(db, orders, lsx_svc, admin, customer):
    """Bế 2 con/tờ, kế hoạch 1.580 tờ (có bù hao) → 3.000 con, nhận 1.200 tờ ⇒ mốc 2.400 con —
    CÙNG số trần ở hộp Ghi mẻ. Theo tỉ lệ kế hoạch thì ra 2.278,48 con: lẻ và lệch trần."""
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-TN7")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_vao, cv.don_vi_vao = 1580, "tờ"
    cv.so_luong_ra, cv.don_vi_ra = 3000, "con"
    cv.he_so_quy_doi = 2
    db.commit()
    _giao_toi(db, cv, 1200, "tờ")

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["muc_tieu"] == 2400.0
    assert ct["san_luong"]["con_thieu"] == 2400.0


def test_moc_rut_theo_ti_le_thi_lam_tron_xuong(db, orders, lsx_svc, admin, customer):
    """Bước không có hệ số ⇒ còn quy theo tỉ lệ, nhưng không bày nửa con: 2.278,48 ⇒ 2.278."""
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-TN8")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_vao, cv.don_vi_vao = 1580, "tờ"
    cv.so_luong_ra, cv.don_vi_ra = 3000, "con"
    cv.he_so_quy_doi = None
    db.commit()
    _giao_toi(db, cv, 1200, "tờ")

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["muc_tieu"] == 2278.0


def test_ban_giao_khac_don_vi_dau_vao_thi_khong_rut_moc(db, orders, lsx_svc, admin, customer):
    """Bàn giao ghi "con" mà bước nhận "tờ": không đem số đó chia cho `so_luong_vao` — chia bừa ra
    mốc bịa (đúng lỗi đã thấy trên dev: nhận 26.888 chia cho 68 ⇒ thiếu 7 triệu)."""
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-TN6")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_vao, cv.don_vi_vao = 68, "tờ"
    cv.so_luong_ra, cv.don_vi_ra = 18, "tờ"
    db.commit()
    _giao_toi(db, cv, 26888, "con")

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["thuc_nhan"] is None
    assert ct["san_luong"]["muc_tieu"] == 18.0
    assert ct["san_luong"]["con_thieu"] == 18.0


# --- Luật ô tiến độ: NHẬN − TỐT = LỖI (27/09/2026) ------------------------------------------
def test_ket_thuc_thi_nhan_tru_tot_thanh_loi(db, orders, lsx_svc, admin, customer):
    """Nhận 1.300, tốt 1.200, bấm Kết thúc ⇒ lỗi 100 — tổ không phải khai số lỗi."""
    from app.models.san_xuat import CV_HOAN_THANH
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-LOI1")
    cv.trang_thai = CV_DANG_CHAY
    cv.so_luong_vao, cv.don_vi_vao = 1300, "tờ"
    cv.so_luong_ra, cv.don_vi_ra = 1300, "tờ"
    db.add(SanXuatBatch(cong_viec_id=cv.id, bat_dau=_T0, ket_thuc=_T0 + timedelta(hours=2),
                        tong=1200, tot=1200, hong=0, don_vi="tờ"))
    db.commit()
    _giao_toi(db, cv, 1300, "tờ")

    sl = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)["san_luong"]
    assert (sl["nhan"], sl["nhan_ra"], sl["loi"]) == (1300.0, 1300.0, None)  # đang chạy: chưa có lỗi

    cv.trang_thai = CV_HOAN_THANH
    db.commit()
    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    assert ct["san_luong"]["loi"] == 100.0
    assert ct["cong_viec"]["loi"] == 100.0


def test_buoc_dau_chuoi_nhan_la_so_vao_lay_tu_kho(db, orders, lsx_svc, admin, customer):
    """Bước đầu không ai giao tới ⇒ số nhận = số vào kế hoạch (giấy lấy từ kho), lỗi tính trên đó."""
    from app.models.san_xuat import CV_HOAN_THANH
    from app.services.san_xuat import board

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-LOI2")
    cv.trang_thai = CV_HOAN_THANH
    cv.so_luong_vao, cv.don_vi_vao = 1910, "tờ"
    cv.so_luong_ra, cv.don_vi_ra = 1660, "tờ"
    db.add(SanXuatBatch(cong_viec_id=cv.id, bat_dau=_T0, ket_thuc=_T0 + timedelta(hours=2),
                        tong=1300, tot=1300, hong=0, don_vi="tờ"))
    db.commit()

    sl = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)["san_luong"]
    assert (sl["nhan"], sl["nhan_ra"], sl["loi"]) == (1910.0, 1910.0, 610.0)
