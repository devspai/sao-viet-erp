"""Thực hiện sản xuất — Giai đoạn 5/6: TÍCH HỢP tầng router (§16 chốt chặn · §17 · nghiệm thu §21).

Các test service lẻ (test_san_xuat_kcs / _kho / _dong_lenh) đã soi TỪNG luật. File này soi cái
service-lẻ KHÔNG chạm tới: **đường dây hội tụ ở router** — sau một thao tác gỡ điều kiện CUỐI (KCS
kiểm nốt công đoạn cuối / kiểm tới đủ mục tiêu), nhóm KHÔNG còn tự đóng (đóng lệnh là nút KCS bấm
tay, spec 2026-09-29).

Nghiệm thu §21 theo KCS theo lệnh (mg 0306): lỗi KCS tổ chưa bấm "Đã xem" KHÔNG chặn nhập kho phần
ĐẠT, và cũng KHÔNG chặn đóng lệnh — lỗi là thông báo một chiều cho tổ.

Tái dùng NGUYÊN dàn cảnh + helper từ các test G5: `_batch` (một lần kiểm của KCS), `_hoan_thanh_het`
(đánh dấu mọi việc của nhóm xong).
"""
from __future__ import annotations

from app.models.san_xuat import NHOM_DANG_SX
from app.models.stock_request import REQ_APPROVED, StockRequest
from app.repositories.san_xuat_repo import SanXuatRepository
from app.security import create_access_token
from app.services.san_xuat import kcs, kho

# Fixtures + helper dàn cảnh từ các test G5 (kéo cả cây fixture xếp lịch).
from tests.test_san_xuat_dong_lenh import _hoan_thanh_het, _muc_tieu
from tests.test_san_xuat_kcs import (  # noqa: F401
    _batch,
    _ghi_tot,
    admin,
    customer,
    db,
    lsx_svc,
    orders,
)


def _trang_thai_nhom(db, nhom_id):
    return SanXuatRepository(db).nhom(nhom_id).trang_thai


# --- Không còn tự đóng (spec 2026-09-29): KCS kiểm hết vẫn để KCS bấm "Đóng lệnh" --------------
def test_kcs_kiem_het_cong_doan_cuoi_qua_router_nhom_van_dang_sx(client, db, orders, lsx_svc, admin, customer):
    """Công đoạn cuối kiểm tới đủ mục tiêu, việc đã xong — trước đây tự đóng ĐỦ; nay nhóm VẪN
    `in_production` cho tới khi người KCS bấm đóng."""
    _to, cv, rb = _batch(db, orders, lsx_svc, admin, customer, dat=60, khong_dat=0, cuoi=True, tot=100)
    _muc_tieu(db, cv.nhom_id, 100)
    _hoan_thanh_het(db, cv.nhom_id)
    tok = create_access_token(str(rb["nguoi_kcs"].id))
    r = client.post(f"/api/san-xuat/kcs/cong-viec/{cv.id}/kiem", data={"so_dat": "40"},
                    headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 201, r.text
    db.expire_all()
    assert _trang_thai_nhom(db, cv.nhom_id) == NHOM_DANG_SX


# --- Nghiệm thu §21: lỗi chưa xem không chặn nhập kho ---------------------------
def test_loi_chua_xem_khong_chan_nhap_kho_phan_dat(db, orders, lsx_svc, admin, customer):
    _to, cv, rb = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)  # đạt 90, lỗi 10
    assert kcs.loi_cho_xem(db, [cv.department_id])
    _muc_tieu(db, cv.nhom_id, 90)
    _hoan_thanh_het(db, cv.nhom_id)

    yc = kho.tao_yeu_cau_nhap_kho_cong_doan(db, user=rb["nguoi_kcs"], cong_viec_id=cv.id)
    assert yc["so_luong"] == 90
    assert db.get(StockRequest, yc["request_id"]).trang_thai == REQ_APPROVED

    assert _trang_thai_nhom(db, cv.nhom_id) == NHOM_DANG_SX
