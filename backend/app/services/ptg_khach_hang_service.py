"""Khách hàng + ghi chú chọn Ở PHIẾU TÍNH GIÁ (chủ dự án chốt 04/10/2026).

Báo giá lập từ phiếu CHÉP khách / điểm giao / người nhận / ghi chú và không sửa được ở báo giá —
xem `quotation_service.QuotationService.chep_khach_tu_phieu`. Kế hoạch:
`docs/superpowers/plans/2026-10-04-khach-hang-o-phieu-tinh-gia.md`.
"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from ..models.customer import Customer, CustomerAddress
from ..models.phieu_tinh_gia import PhieuTinhGia
from ..repositories.audit_repo import AuditLogRepository
from ..repositories.customer_repo import CustomerRepository
from ..repositories.quotation_repo import QuotationRepository
from .quotation_service import QuotationService

#: Ô khách hàng của phiếu (trừ ghi chú — ghi chú là cột sẵn có, router tự gán).
O_KHACH = (
    "customer_id", "delivery_address", "contact_name_snapshot", "contact_phone_snapshot",
    "contact_title_snapshot", "contact_email_snapshot",
)
_O_NGUOI_NHAN = O_KHACH[1:]


def _qs(db: Session) -> QuotationService:
    return QuotationService(QuotationRepository(db), AuditLogRepository(db),
                            customers=CustomerRepository(db))


def ap_khach(db: Session, p: PhieuTinhGia, data: dict, *, actor, scope_khach: str | None) -> None:
    """Gán các ô khách có trong `data` vào phiếu (chưa commit).

    Đổi `customer_id` mà KHÔNG gửi kèm điểm giao / người nhận ⇒ điền điểm giao mặc định + liên hệ
    chính của khách mới (chọn cũ thuộc khách cũ, không còn hợp lệ). Khách phải nằm trong phạm vi
    Khách hàng của người chọn — ngoài phạm vi (hoặc không có quyền xem Khách hàng) ⇒ 403."""
    data = {k: v for k, v in data.items() if k in O_KHACH}
    if not data:
        return
    if "customer_id" in data and data["customer_id"] != p.customer_id:
        cid = data["customer_id"]
        if cid is not None:
            repo = CustomerRepository(db)
            c = repo.get_by_id(cid)
            if c is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy khách hàng.")
            if scope_khach is None or not repo.can_access(customer=c, scope=scope_khach, actor=actor):
                raise HTTPException(status.HTTP_403_FORBIDDEN,
                                    "Khách hàng này không nằm trong phạm vi bạn được xem.")
        p.customer_id = cid
        if not any(k in data for k in _O_NGUOI_NHAN):
            d = _qs(db)._customer_defaults(cid)
            p.delivery_address = d["delivery_address"]
            p.contact_name_snapshot = d["contact_name"]
            p.contact_phone_snapshot = d["contact_phone"]
            p.contact_title_snapshot = d["contact_title"]
            p.contact_email_snapshot = d["contact_email"]
    for k in _O_NGUOI_NHAN:
        if k in data:
            v = data[k]
            setattr(p, k, (v.strip() or None) if isinstance(v, str) else v)


def dong_bo_bao_gia_nhap(db: Session, p: PhieuTinhGia, *, actor) -> None:
    """Báo giá NHÁP của phiếu theo phiếu vừa lưu: khách/điểm giao/người nhận/ghi chú + số lượng /
    giá vốn từng sản phẩm. Không commit."""
    _qs(db).dong_bo_nhap_theo_phieu(p, actor=actor)


def ten_khach(db: Session, ids: set[int | None]) -> dict[int, str]:
    """{customer_id: tên} — một câu SQL cho cả trang danh sách."""
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    return dict(db.execute(select(Customer.id, Customer.name).where(Customer.id.in_(ids))).all())


def gan_khach_out(db: Session, p: PhieuTinhGia, out) -> None:
    """Đắp tên khách, MST, nhãn điểm giao vào bản trả về của MỘT phiếu (hai câu SQL)."""
    if p.customer_id is None:
        return
    row = db.execute(select(Customer.name, Customer.tax_code).where(Customer.id == p.customer_id)).first()
    if row is not None:
        out.customer_name, out.customer_tax_code = row
    if p.delivery_address:
        out.delivery_label = db.execute(
            select(CustomerAddress.label).where(
                CustomerAddress.customer_id == p.customer_id,
                CustomerAddress.address == p.delivery_address,
            ).limit(1)
        ).scalar_one_or_none()


def customer_ids_theo_ten(db: Session, like: str) -> Select:
    """Subquery id khách có tên khớp `like` — cho ô tìm kiếm danh sách phiếu."""
    return select(Customer.id).where(Customer.name.ilike(like))
