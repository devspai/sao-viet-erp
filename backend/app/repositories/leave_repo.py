"""Leave (Nghỉ phép) data access — the ONLY layer touching the DB for leave_types +
leave_requests. No business rules (those live in LeaveService)."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..models.employee import Employee
from ..models.leave import (
    STATUS_APPROVED,
    STATUS_PENDING,
    STATUS_REJECTED,
    LeaveRequest,
    LeaveType,
)
from ..models.role import SCOPE_ALL, SCOPE_DEPARTMENT, SCOPE_OWN
from .loc_don_nhan_su import LocDon, dem_theo_trang_thai, dk_ky, dk_nguoi, lua_chon_nhan_vien, lua_chon_phong
from .org_scope import dept_subtree_ids

COT_MOC = {"tao": (LeaveRequest.created_at, False)}

_DECIDED = (STATUS_APPROVED, STATUS_REJECTED)


class LeaveRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- leave_types --------------------------------------------------------

    def list_types(self, *, active_only: bool = False) -> list[LeaveType]:
        stmt = select(LeaveType)
        if active_only:
            stmt = stmt.where(LeaveType.is_active.is_(True))
        return list(self.db.execute(stmt.order_by(LeaveType.id)).scalars())

    def get_type(self, type_id: int) -> LeaveType | None:
        return self.db.get(LeaveType, type_id)

    def create_type(self, **fields) -> LeaveType:
        t = LeaveType(**fields)
        self.db.add(t)
        self.db.commit()
        self.db.refresh(t)
        return t

    def update_type(self, t: LeaveType, **fields) -> LeaveType:
        for key, value in fields.items():
            setattr(t, key, value)
        self.db.commit()
        self.db.refresh(t)
        return t

    def delete_type(self, t: LeaveType) -> None:
        self.db.delete(t)
        self.db.commit()

    # --- leave_requests -----------------------------------------------------

    def create_request(self, **fields) -> LeaveRequest:
        r = LeaveRequest(**fields)
        self.db.add(r)
        self.db.commit()
        self.db.refresh(r)
        return r

    def get_request(self, request_id: int) -> LeaveRequest | None:
        return self.db.get(LeaveRequest, request_id)

    def update_request(self, r: LeaveRequest, **fields) -> LeaveRequest:
        for key, value in fields.items():
            setattr(r, key, value)
        self.db.commit()
        self.db.refresh(r)
        return r

    def list_all(self, *, status: str | None = None, limit: int = 200) -> list[LeaveRequest]:
        stmt = select(LeaveRequest)
        if status is not None:
            stmt = stmt.where(LeaveRequest.status == status)
        stmt = stmt.order_by(LeaveRequest.status.asc(), LeaveRequest.start_date.desc(), LeaveRequest.id.desc()).limit(limit)
        return list(self.db.execute(stmt).scalars())

    # --- scope-aware reads (own = đơn của mình theo Employee.user_id; department =
    #     đơn của phòng NV; all = tất cả). Vì leave_requests KHÔNG có cột user/phòng, phải
    #     JOIN employees. Đây là điểm data-scope của RBAC (rbac_service.apply_scope). ------

    def _scope_condition(self, *, scope: str, actor):
        """WHERE thu hẹp đơn theo data-scope, hoặc None cho `all`. Owner = tài khoản login
        của NV (Employee.user_id), phòng = Employee.department_id."""
        if scope == SCOPE_ALL:
            return None
        if scope == SCOPE_OWN:
            return Employee.user_id == actor.id
        if scope == SCOPE_DEPARTMENT:
            # Subtree semantics (#26): phòng mình + mọi đơn vị con.
            dept_ids = dept_subtree_ids(self.db, actor.department_id)
            if not dept_ids:
                return Employee.user_id == actor.id
            return Employee.department_id.in_(dept_ids)
        raise ValueError(f"Unknown scope: {scope!r}")

    # --- danh sách có kỳ + bộ lọc + phân trang (06/10/2026) --------------------
    # SẮP XẾP: mới TẠO nhất lên đầu (chủ 23/09/2026). Lọc, đếm tab, cắt trang ĐỀU ở máy chủ và
    # dùng CHUNG một bộ điều kiện — số tab, tổng ở chân bảng và bảng không bao giờ lệch nhau.

    def _dk_loc(self, cond, loc: LocDon) -> list:
        """Phạm vi (`cond`) + kỳ + người + loại nghỉ — mọi điều kiện TRỪ trạng thái."""
        M = LeaveRequest
        dk: list = [] if cond is None else [cond]
        if loc.moc == "nghi":
            # Mốc NGHỈ: đơn có ngày nghỉ GIAO với kỳ (đơn 28/09–03/10 thuộc cả tháng 9 lẫn 10).
            if loc.den_ngay is not None:
                dk.append(M.start_date <= loc.den_ngay)
            if loc.tu_ngay is not None:
                dk.append(M.end_date >= loc.tu_ngay)
        else:
            dk += dk_ky(COT_MOC, loc)
        dk += dk_nguoi(M, loc)
        if loc.loai is not None:
            dk.append(M.leave_type_id == loc.loai)
        return dk

    def _loc(self, cond, loc: LocDon, status: str | None, limit: int,
             offset: int) -> tuple[list[LeaveRequest], int, dict]:
        M = LeaveRequest
        dk = self._dk_loc(cond, loc)
        dem = dem_theo_trang_thai(self.db, M, dk)
        if status is not None:
            dk.append(M.status == status)
        base = select(M).join(Employee, M.employee_id == Employee.id).where(*dk)
        total = int(self.db.execute(select(func.count()).select_from(base.subquery())).scalar_one())
        rows = list(self.db.execute(
            base.order_by(M.created_at.desc(), M.id.desc()).limit(limit).offset(offset)).scalars())
        return rows, total, dem

    def loc_cua_nv(self, employee_id: int, *, loc: LocDon, status: str | None, limit: int,
                   offset: int) -> tuple[list[LeaveRequest], int, dict]:
        """Tab "của tôi": `(trang, tổng, đếm theo trạng thái)`."""
        return self._loc(LeaveRequest.employee_id == employee_id, loc, status, limit, offset)

    def loc_scoped(self, *, scope: str, actor, loc: LocDon, status: str | None, limit: int,
                   offset: int) -> tuple[list[LeaveRequest], int, dict]:
        """Tab duyệt theo DATA-SCOPE. `loc.employee_id` chỉ THU HẸP bên trong phạm vi — gõ id
        người ngoài phạm vi thì `_scope_condition` vẫn cắt, kết quả rỗng chứ không lộ."""
        return self._loc(self._scope_condition(scope=scope, actor=actor), loc, status, limit, offset)

    def lua_chon(self, truong: str, *, scope: str, actor) -> list[dict]:
        cond = self._scope_condition(scope=scope, actor=actor)
        dk = [] if cond is None else [cond]
        if truong == "phong":
            return lua_chon_phong(self.db, LeaveRequest, dk)
        return lua_chon_nhan_vien(self.db, LeaveRequest, dk)

    def count_pending_scoped(self, *, scope: str, actor) -> int:
        """Số đơn ĐANG CHỜ DUYỆT trong scope người gọi — nuôi badge sidebar (COUNT ở DB,
        không len(list))."""
        stmt = (
            select(func.count(LeaveRequest.id))
            .select_from(LeaveRequest)
            .join(Employee, LeaveRequest.employee_id == Employee.id)
            .where(LeaveRequest.status == STATUS_PENDING)
        )
        cond = self._scope_condition(scope=scope, actor=actor)
        if cond is not None:
            stmt = stmt.where(cond)
        return int(self.db.execute(stmt).scalar_one())

    def count_my_unseen(self, employee_id: int) -> int:
        """Số đơn của NV đã ĐƯỢC QUYẾT (duyệt/từ chối) mà NV chưa xem — nuôi chuông Topbar."""
        stmt = select(func.count(LeaveRequest.id)).where(
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.status.in_(_DECIDED),
            LeaveRequest.seen_by_employee_at.is_(None),
        )
        return int(self.db.execute(stmt).scalar_one())

    def mark_my_seen(self, employee_id: int) -> None:
        """Đánh dấu mọi đơn đã-quyết-chưa-xem của NV là đã xem (đóng chuông)."""
        self.db.execute(
            update(LeaveRequest)
            .where(
                LeaveRequest.employee_id == employee_id,
                LeaveRequest.status.in_(_DECIDED),
                LeaveRequest.seen_by_employee_at.is_(None),
            )
            .values(seen_by_employee_at=datetime.now(timezone.utc))
        )
        self.db.commit()

    def list_for_quota(self, employee_id: int, leave_type_id: int, year: int) -> list[LeaveRequest]:
        """Đơn của 1 NV, 1 loại nghỉ, ĐÃ DUYỆT hoặc ĐANG CHỜ (giữ chỗ), có start_date trong
        `year` — để tính số ngày phép đã dùng/đang giữ khi kiểm hạn mức."""
        return list(
            self.db.execute(
                select(LeaveRequest).where(
                    LeaveRequest.employee_id == employee_id,
                    LeaveRequest.leave_type_id == leave_type_id,
                    LeaveRequest.status.in_((STATUS_APPROVED, STATUS_PENDING)),
                    LeaveRequest.start_date >= date(year, 1, 1),
                    LeaveRequest.start_date <= date(year, 12, 31),
                )
            ).scalars()
        )

    def list_overlapping(self, start: date, end: date, statuses: tuple[str, ...]) -> list[LeaveRequest]:
        """Đơn có khoảng ngày GIAO với [start, end] và status thuộc `statuses` — nuôi Lịch nghỉ."""
        return list(
            self.db.execute(
                select(LeaveRequest).where(
                    LeaveRequest.status.in_(statuses),
                    LeaveRequest.start_date <= end,
                    LeaveRequest.end_date >= start,
                ).order_by(LeaveRequest.employee_id, LeaveRequest.start_date)
            ).scalars()
        )

    def approved_in_range(self, start: date, end: date) -> list[LeaveRequest]:
        """Approved leave requests whose date range overlaps [start, end] — for the
        monthly timesheet (mark P/KL on covered days)."""
        return list(
            self.db.execute(
                select(LeaveRequest).where(
                    LeaveRequest.status == STATUS_APPROVED,
                    LeaveRequest.start_date <= end,
                    LeaveRequest.end_date >= start,
                )
            ).scalars()
        )

    def approved_for_employees(
        self, employee_ids: set[int], *, tu: date, den: date | None = None
    ) -> list[LeaveRequest]:
        """Đơn ĐÃ DUYỆT của một nhóm NV còn phủ từ ngày `tu` (tới `den` nếu có) — Thực hiện sản
        xuất đọc để hiện "nghỉ phép" ở ô chọn người và chặn giao việc/hỗ trợ đúng ngày nghỉ."""
        if not employee_ids:
            return []
        stmt = select(LeaveRequest).where(
            LeaveRequest.employee_id.in_(employee_ids),
            LeaveRequest.status == STATUS_APPROVED,
            LeaveRequest.end_date >= tu,
        )
        if den is not None:
            stmt = stmt.where(LeaveRequest.start_date <= den)
        return list(
            self.db.execute(
                stmt.order_by(LeaveRequest.employee_id, LeaveRequest.start_date)
            ).scalars()
        )
