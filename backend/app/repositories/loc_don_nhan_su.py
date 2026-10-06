"""Mảnh lọc dùng chung cho các danh sách phiếu/đơn của người lao động (06/10/2026): Nhật ký chấm
công, Yêu cầu chỉnh công, Đi muộn/về sớm, Nghỉ phép, Tăng ca.

Cả năm bảng có `employee_id` và phạm vi xem đi qua bảng `employees` (phòng của người lao động). Mỗi
repo tự dựng điều kiện PHẠM VI; ở đây chỉ gom phần giống nhau: điều kiện kỳ / nhân viên / phòng ban,
đếm theo trạng thái cho thanh tab, và danh sách giá trị (kèm số bản ghi) cho menu lọc.

Mọi truy vấn ở đây đã JOIN `employees` — điều kiện phạm vi viết trên `Employee` dùng được luôn.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.department import Department
from ..models.employee import Employee
from .loc_danh_sach import dk_khoang_ngay


@dataclass
class LocDon:
    """Bộ lọc chung. `moc` = kỳ tính theo cột nào (mã do từng màn khai, vd `tao`, `ngay_cong`)."""
    tu_ngay: date | None = None
    den_ngay: date | None = None
    moc: str = "tao"
    employee_id: int | None = None
    phong: int | None = None
    # Riêng từng màn — màn không dùng thì bỏ trống.
    loai: int | None = None            # Nghỉ phép: loại nghỉ
    kieu: list[str] = field(default_factory=list)   # Đi muộn/về sớm: late/early/half/mid
    diem: int | None = None            # Nhật ký: điểm chấm công


def dk_ky(cot_moc: dict, loc: LocDon) -> list:
    """Điều kiện kỳ theo mốc. `cot_moc[moc]` = (cột, là cột Date)."""
    if loc.tu_ngay is None and loc.den_ngay is None:
        return []
    cot, la_ngay = cot_moc[loc.moc]
    return dk_khoang_ngay(cot, loc.tu_ngay, loc.den_ngay, cot_ngay=la_ngay)


def dk_nguoi(model, loc: LocDon) -> list:
    """Nhân viên + Phòng ban (phòng TRỰC TIẾP của người lao động, cùng luật Hồ sơ nhân sự)."""
    dk: list = []
    if loc.employee_id is not None:
        dk.append(model.employee_id == loc.employee_id)
    if loc.phong is not None:
        dk.append(Employee.department_id == loc.phong)
    return dk


def dem_theo_trang_thai(db: Session, model, dk: list) -> dict[str, int]:
    """`{trang_thai: số}` + `tat_ca` trên CÙNG điều kiện của bảng (trừ điều kiện trạng thái)."""
    rows = db.execute(
        select(model.status, func.count(model.id))
        .join(Employee, model.employee_id == Employee.id)
        .where(*dk)
        .group_by(model.status)
    ).all()
    dem = {str(s): int(n) for s, n in rows}
    dem["tat_ca"] = sum(dem.values())
    return dem


def lua_chon_nhan_vien(db: Session, model, dk: list) -> list[dict]:
    """Người lao động có bản ghi trong phạm vi `dk` + số bản ghi — giá trị của điều kiện Nhân viên."""
    rows = db.execute(
        select(Employee.id, Employee.full_name, func.count(model.id))
        .select_from(model)
        .join(Employee, model.employee_id == Employee.id)
        .where(*dk)
        .group_by(Employee.id, Employee.full_name)
        .order_by(Employee.full_name)
    ).all()
    return [{"id": i, "ten": t or f"NV#{i}", "so": int(n)} for i, t, n in rows]


def lua_chon_phong(db: Session, model, dk: list) -> list[dict]:
    """Phòng ban của người lao động có bản ghi trong phạm vi `dk` + số bản ghi."""
    rows = db.execute(
        select(Department.id, Department.name, func.count(model.id))
        .select_from(model)
        .join(Employee, model.employee_id == Employee.id)
        .join(Department, Employee.department_id == Department.id)
        .where(*dk)
        .group_by(Department.id, Department.name)
        .order_by(Department.name)
    ).all()
    return [{"id": i, "ten": t, "so": int(n)} for i, t, n in rows]


def trang(page: int, size: int) -> tuple[int, int]:
    """(limit, offset) của trang."""
    return size, max(0, (page - 1) * size)
