"""Tín hiệu SSE "danh mục tính giá đã đổi" — bắn ngay sau khi giao dịch ghi danh mục COMMIT.

Màn phiếu tính giá giữ trong bộ nhớ bốn danh mục nguồn (giấy · máy · công đoạn · vật tư) và lời
nhắc "danh mục đã đổi sau lần tính". Trước 04/10/2026 nó tự làm tươi MỖI LẦN cửa sổ được focus lại:
bốn danh mục + cả phiếu, dù không ai sửa gì — người hay chuyển cửa sổ là dội hàng trăm request.
Nay máy chủ BÁO khi thật sự có đổi, và báo được cả người khác sửa ở máy khác (nội bộ = real-time).

Bắt ở tầng Session thay vì từng route ghi danh mục: danh mục có nhiều đường ghi (form, nhập Excel,
bảng con chip / máy / khoán / giá theo phiên bản…), quên một đường là màn phiếu đứng số cũ. Gom loại
lúc flush, chỉ bắn sau commit; rollback thì bỏ. Ghi kiểu bulk (`update()`/SQL trần) không qua đây —
danh mục hiện không có đường nào như vậy.
"""
from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.orm import Session

from ..models.cong_doan import (
    CongDoan, CongDoanKhoan, CongDoanKhoanPhatSinh, CongDoanMay, CongDoanTo, CongDoanVatTu,
)
from ..models.may_thiet_bi import MayThietBi, NhomMay
from ..models.vat_lieu_kho import GiayGiaVersion, GiayNguyen, VatTuChip, VatTuInAn

LOAI_THEO_LOP: dict[type, str] = {
    GiayNguyen: "giay", GiayGiaVersion: "giay",
    VatTuInAn: "vat_tu", VatTuChip: "vat_tu",
    MayThietBi: "may", NhomMay: "may",
    CongDoan: "cong_doan", CongDoanTo: "cong_doan", CongDoanKhoan: "cong_doan",
    CongDoanKhoanPhatSinh: "cong_doan", CongDoanVatTu: "cong_doan", CongDoanMay: "cong_doan",
}
_KHOA = "danh_muc_doi"


def _gom(session: Session, _flush_context) -> None:
    loai: set[str] = session.info.setdefault(_KHOA, set())
    for obj in (*session.new, *session.deleted):
        ten = LOAI_THEO_LOP.get(type(obj))
        if ten:
            loai.add(ten)
    for obj in session.dirty:
        ten = LOAI_THEO_LOP.get(type(obj))
        if ten and session.is_modified(obj, include_collections=False):
            loai.add(ten)


def _phat(session: Session) -> None:
    loai = session.info.pop(_KHOA, None)
    if not loai:
        return
    try:
        from ..doi_tuong_nhan import MAN_DANH_MUC
        from ..realtime import hub

        hub.gui({"type": "danh_muc_doi", "loai": sorted(loai)}, quyen=MAN_DANH_MUC)
    except Exception:
        # Kênh đẩy hỏng KHÔNG được làm hỏng việc ghi danh mục — dữ liệu đã commit rồi.
        pass


def _bo(session: Session) -> None:
    session.info.pop(_KHOA, None)


event.listen(Session, "after_flush", _gom)
event.listen(Session, "after_commit", _phat)
event.listen(Session, "after_rollback", _bo)
