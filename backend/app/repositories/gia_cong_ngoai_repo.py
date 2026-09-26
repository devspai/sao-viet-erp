"""Truy vấn của LẦN GIA CÔNG NGOÀI — spec 2026-09-26. Mọi SELECT của module nằm ở đây."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.purchase import SUPPLIER_ACTIVE, Supplier


class GiaCongNgoaiRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Nhà gia công ----------------------------------------------------------------------
    def nha_gia_cong_options(self) -> list[Supplier]:
        """NCC ĐANG HOẠT ĐỘNG có tích "Nhận gia công", theo tên — nguồn DUY NHẤT của ô chọn."""
        return list(self.db.scalars(
            select(Supplier)
            .where(Supplier.nhan_gia_cong.is_(True), Supplier.status == SUPPLIER_ACTIVE)
            .order_by(Supplier.name, Supplier.id)
        ))

    def nha_gia_cong(self, supplier_id: int | None) -> Supplier | None:
        """Một NCC CÒN chọn được làm nhà gia công — None nếu không có / ngưng / chưa tích."""
        if not supplier_id:
            return None
        s = self.db.get(Supplier, int(supplier_id))
        if s is None or not s.nhan_gia_cong or s.status != SUPPLIER_ACTIVE:
            return None
        return s
