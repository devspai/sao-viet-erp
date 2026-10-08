"""Repository — sổ tài sản cố định & công cụ dụng cụ.

KHÔNG kế thừa `CatalogRepo`: tài sản không phải danh mục phẳng (ghi tăng kèm nhiều dòng chi phí,
sổ có trạng thái và bảng mốc cơ sở), ép vào nền chung là đẻ một loạt cờ mà mỗi cờ đúng một chỗ.

Lọc + cắt trang làm ở SQL, KHÔNG kéo cả bảng về rồi cắt trong Python. Truy vấn trả danh sách
tài sản nạp sẵn `moc`: hao mòn lũy kế của từng dòng tính từ bảng mốc, không nạp sẵn là N+1.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..models.department import Department
from ..models.employee import Employee
from ..models.tai_san import LOAI_CCDC, TaiSan
from .loc_danh_sach import dk_khoang_ngay

#: Mốc của dải kỳ: (cột, là cột Date). `su_dung` = ngày bắt đầu dùng, `giam` = ngày thôi dùng.
COT_MOC = {
    "tao": (TaiSan.created_at, False),
    "su_dung": (TaiSan.ngay_su_dung, True),
    "giam": (TaiSan.ngay_giam, True),
}


@dataclass(frozen=True)
class LocTaiSan:
    """Bộ lọc của sổ tài sản — một gói cho cả danh sách, dải số đầu màn và các số đếm."""

    q: str | None = None
    loai: str | None = None
    bo_phan_id: int | None = None
    trang_thai: str | None = None
    gia_tu: int | None = None
    gia_den: int | None = None
    tu_ngay: date | None = None
    den_ngay: date | None = None
    moc: str = "tao"


#: Cách nhóm danh sách: theo loại (TSCĐ trước CCDC), theo bộ phận, hoặc không nhóm.
NHOM_LOAI, NHOM_BO_PHAN, NHOM_KHONG = "loai", "bo_phan", "khong"


class TaiSanRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Đọc ------------------------------------------------------------------------------

    def lay(self, tai_san_id: int) -> TaiSan | None:
        return self.db.get(TaiSan, tai_san_id)

    def lay_kem_chi_tiet(self, tai_san_id: int) -> TaiSan | None:
        """Nạp sẵn dòng chi phí + chứng từ + mốc — màn chi tiết đọc cả ba, tránh N+1."""
        stmt = (
            select(TaiSan)
            .options(
                selectinload(TaiSan.chi_phi),
                selectinload(TaiSan.bien_dong),
                selectinload(TaiSan.moc),
            )
            .where(TaiSan.id == tai_san_id)
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def tim_theo_ma(self, ma: str) -> TaiSan | None:
        return self.db.execute(select(TaiSan).where(TaiSan.ma == ma)).scalar_one_or_none()

    @staticmethod
    def _sap_theo(nhom_theo: str) -> tuple:
        """Khoá ORDER BY theo cách nhóm. Bộ phận trống xếp CUỐI bằng khoá `IS NULL` (không dùng
        NULLS LAST để SQLite lẫn Postgres chạy như nhau); trong nhóm luôn theo mã."""
        if nhom_theo == NHOM_LOAI:
            return (case((TaiSan.loai == LOAI_CCDC, 1), else_=0), TaiSan.ma)
        if nhom_theo == NHOM_BO_PHAN:
            return (Department.name.is_(None), Department.name, TaiSan.bo_phan_id, TaiSan.ma)
        return (TaiSan.ma,)

    def danh_sach(
        self, loc: LocTaiSan, *, offset: int = 0, limit: int = 50, nhom_theo: str = NHOM_KHONG
    ) -> tuple[list[TaiSan], int]:
        conds = self._dieu_kien(loc)
        tong = self.db.execute(
            select(func.count()).select_from(TaiSan).where(*conds)
        ).scalar_one()
        q = select(TaiSan).options(selectinload(TaiSan.moc)).where(*conds)
        if nhom_theo == NHOM_BO_PHAN:
            q = q.outerjoin(Department, Department.id == TaiSan.bo_phan_id)
        rows = list(
            self.db.execute(
                q.order_by(*self._sap_theo(nhom_theo))
                .offset(max(int(offset), 0))
                .limit(max(int(limit), 1))
            ).scalars()
        )
        return rows, int(tong)

    @staticmethod
    def _dieu_kien(loc: LocTaiSan) -> list:
        conds = []
        if loc.q:
            kw = f"%{loc.q.strip()}%"
            conds.append(or_(TaiSan.ma.ilike(kw), TaiSan.ten.ilike(kw)))
        if loc.loai:
            conds.append(TaiSan.loai == loc.loai)
        if loc.bo_phan_id:
            conds.append(TaiSan.bo_phan_id == loc.bo_phan_id)
        if loc.trang_thai:
            conds.append(TaiSan.trang_thai == loc.trang_thai)
        if loc.gia_tu is not None:
            conds.append(TaiSan.nguyen_gia >= loc.gia_tu)
        if loc.gia_den is not None:
            conds.append(TaiSan.nguyen_gia <= loc.gia_den)
        cot, la_ngay = COT_MOC[loc.moc]
        conds += dk_khoang_ngay(cot, loc.tu_ngay, loc.den_ngay, cot_ngay=la_ngay)
        return conds

    def dem_theo_loai(self, loc: LocTaiSan) -> dict[str, int]:
        """Số tài sản mỗi loại theo các bộ lọc KHÁC loại — thẻ lọc Loại hiện số đếm của cả hai
        lựa chọn cùng lúc, nên không lọc theo loại đang chọn."""
        conds = self._dieu_kien(replace(loc, loai=None))
        return {
            loai: int(n)
            for loai, n in self.db.execute(
                select(TaiSan.loai, func.count()).where(*conds).group_by(TaiSan.loai)
            )
        }

    def dem_theo_trang_thai(self, loc: LocTaiSan) -> dict[str, int]:
        """Như `dem_theo_loai` nhưng cho thẻ lọc Trạng thái (bỏ điều kiện trạng thái đang chọn)."""
        conds = self._dieu_kien(replace(loc, trang_thai=None))
        return {
            tt: int(n)
            for tt, n in self.db.execute(
                select(TaiSan.trang_thai, func.count()).where(*conds).group_by(TaiSan.trang_thai)
            )
        }

    def dem_theo_bo_phan(self) -> list[tuple[int, str, int]]:
        """Thẻ lọc Bộ phận: bộ phận đang có tài sản, kèm số tài sản — xếp theo tên."""
        return [
            (int(i), ten, int(n))
            for i, ten, n in self.db.execute(
                select(Department.id, Department.name, func.count(TaiSan.id))
                .join(TaiSan, TaiSan.bo_phan_id == Department.id)
                .group_by(Department.id, Department.name)
                .order_by(Department.name)
            )
        ]

    def tat_ca_theo_loc(self, loc: LocTaiSan, nhom_theo: str = NHOM_KHONG) -> list[TaiSan]:
        """Mọi tài sản khớp bộ lọc, KHÔNG cắt trang — để cộng dải số đầu màn (tổng giá mua, còn
        lại) và tổng theo nhóm cho đúng cả sổ chứ không chỉ trang đang xem. Nạp sẵn `moc` như
        `danh_sach`, sắp theo cùng khoá nên nhóm ra đúng thứ tự trên bảng."""
        conds = self._dieu_kien(loc)
        q = select(TaiSan).options(selectinload(TaiSan.moc)).where(*conds)
        if nhom_theo == NHOM_BO_PHAN:
            q = q.outerjoin(Department, Department.id == TaiSan.bo_phan_id)
        return list(self.db.execute(q.order_by(*self._sap_theo(nhom_theo))).scalars())

    def ten_cac_bo_phan(self, ids: set[int]) -> dict[int, str]:
        """Tên bộ phận theo id — một truy vấn cho cả danh sách."""
        ids = {i for i in ids if i}
        if not ids:
            return {}
        return {
            int(i): ten
            for i, ten in self.db.execute(
                select(Department.id, Department.name).where(Department.id.in_(ids))
            )
        }

    def ma_lon_nhat(self, tien_to: str) -> str | None:
        """Mã lớn nhất đang có theo tiền tố — nền sinh số kế tiếp."""
        return self.db.execute(
            select(func.max(TaiSan.ma)).where(TaiSan.ma.like(f"{tien_to}%"))
        ).scalar_one_or_none()

    def ten_bo_phan(self, bo_phan_id: int) -> str | None:
        bp = self.db.get(Department, bo_phan_id)
        return bp.name if bp is not None else None

    # --- Nhân viên (người quản lý) --------------------------------------------------------

    def nhan_vien(self, nhan_vien_id: int) -> Employee | None:
        return self.db.get(Employee, nhan_vien_id)

    def nhan_vien_bo_phan(self, bo_phan_id: int, trang_thai) -> list[Employee]:
        """Nhân viên của một bộ phận đang ở các trạng thái `trang_thai`, xếp theo tên."""
        return list(
            self.db.execute(
                select(Employee)
                .where(
                    Employee.department_id == bo_phan_id,
                    Employee.status.in_(list(trang_thai)),
                )
                .order_by(Employee.full_name, Employee.id)
            ).scalars()
        )

    # --- Ghi ------------------------------------------------------------------------------

    def them(self, obj) -> None:
        self.db.add(obj)

    def commit(self) -> None:
        self.db.commit()

    def flush(self) -> None:
        self.db.flush()

    def rollback(self) -> None:
        self.db.rollback()

    def xoa(self, obj) -> None:
        self.db.delete(obj)
