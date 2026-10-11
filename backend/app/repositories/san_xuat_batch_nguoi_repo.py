"""Data-access cho NGƯỜI LÀM từng lần ghi sản lượng (`san_xuat_batch_nguoi`, mg 0386).

Service `services/san_xuat/nguoi_ghi.py` chốt ai được tick; `nguoi_trong_me.py` đọc lại cho mọi
màn (ngăn công việc, tab Sản lượng, Sản lượng tôi tham gia, KCS)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.employee import Employee
from ..models.san_xuat_san_luong import SanXuatBatchNguoi


class SanXuatBatchNguoiRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def cua_nhieu(self, batch_ids: set[int]) -> list[tuple[SanXuatBatchNguoi, str | None]]:
        """(dòng, họ tên hiện tại) của mọi người trong các lần ghi — một truy vấn cho cả trang."""
        if not batch_ids:
            return []
        return [
            (r, ten) for r, ten in self.db.execute(
                select(SanXuatBatchNguoi, Employee.full_name)
                .join(Employee, Employee.id == SanXuatBatchNguoi.employee_id)
                .where(SanXuatBatchNguoi.batch_id.in_(batch_ids))
                .order_by(SanXuatBatchNguoi.batch_id, SanXuatBatchNguoi.id)
            ).all()
        ]

    def cua_batch(self, batch_id: int) -> list[SanXuatBatchNguoi]:
        return list(self.db.scalars(
            select(SanXuatBatchNguoi).where(SanXuatBatchNguoi.batch_id == batch_id)
            .order_by(SanXuatBatchNguoi.id)
        ))

    def nhan_vien_nhieu(self, ids: set[int]) -> dict[int, Employee]:
        if not ids:
            return {}
        return {e.id: e for e in self.db.scalars(select(Employee).where(Employee.id.in_(ids)))}

    def them(self, batch_id: int, employee_id: int, department_id: int | None, la_ho_tro: bool) -> None:
        self.db.add(SanXuatBatchNguoi(
            batch_id=batch_id, employee_id=employee_id, department_id=department_id,
            la_ho_tro=la_ho_tro,
        ))

    def xoa(self, row: SanXuatBatchNguoi) -> None:
        self.db.delete(row)
