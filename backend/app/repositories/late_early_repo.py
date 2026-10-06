"""Phiếu đi muộn / về sớm / nghỉ nửa buổi — tầng DUY NHẤT chạm DB cho `late_early_requests`.
Không chứa luật nghiệp vụ (những thứ đó ở `LateEarlyService`). Chép khuôn `overtime_repo`."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import case, func, select, update
from sqlalchemy.orm import Session

from ..models.employee import Employee
from ..models.late_early import (
    STATUS_APPROVED,
    STATUS_PENDING,
    STATUS_REJECTED,
    LateEarlyRequest,
)
from ..models.role import SCOPE_ALL, SCOPE_DEPARTMENT, SCOPE_OWN
from ..models.attendance import WorkShift
from .loc_don_nhan_su import LocDon, dem_theo_trang_thai, dk_ky, dk_nguoi, lua_chon_nhan_vien, lua_chon_phong
from .org_scope import dept_subtree_ids

COT_MOC = {"tao": (LateEarlyRequest.created_at, False), "ngay_cong": (LateEarlyRequest.work_date, True)}

_DECIDED = (STATUS_APPROVED, STATUS_REJECTED)
_LIVE = (STATUS_PENDING, STATUS_APPROVED)


class LateEarlyRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- CRUD ---------------------------------------------------------------

    def create_request(self, **fields) -> LateEarlyRequest:
        r = LateEarlyRequest(**fields)
        self.db.add(r)
        self.db.commit()
        self.db.refresh(r)
        return r

    def get_request(self, request_id: int) -> LateEarlyRequest | None:
        return self.db.get(LateEarlyRequest, request_id)

    def update_request(self, r: LateEarlyRequest, **fields) -> LateEarlyRequest:
        for key, value in fields.items():
            setattr(r, key, value)
        self.db.commit()
        self.db.refresh(r)
        return r

    def list_by_employee(self, employee_id: int, *, limit: int = 100) -> list[LateEarlyRequest]:
        return list(
            self.db.execute(
                select(LateEarlyRequest)
                .where(LateEarlyRequest.employee_id == employee_id)
                .order_by(LateEarlyRequest.work_date.desc(), LateEarlyRequest.id.desc())
                .limit(limit)
            ).scalars()
        )

    # --- scope-aware reads (own = phiếu của mình theo Employee.user_id; department =
    #     phiếu của phòng/tổ mình + cây con; all = tất cả). Bảng KHÔNG có cột user/phòng nên
    #     phải JOIN employees — giống hệt overtime_repo / leave_repo. --------------------

    def _scope_condition(self, *, scope: str, actor):
        if scope == SCOPE_ALL:
            return None
        if scope == SCOPE_OWN:
            return Employee.user_id == actor.id
        if scope == SCOPE_DEPARTMENT:
            dept_ids = dept_subtree_ids(self.db, actor.department_id)
            if not dept_ids:
                return Employee.user_id == actor.id
            return Employee.department_id.in_(dept_ids)
        raise ValueError(f"Unknown scope: {scope!r}")

    # --- danh sách có kỳ + bộ lọc + phân trang (06/10/2026) --------------------

    def _dk_loc(self, *, scope: str, actor, loc: LocDon) -> list:
        """Phạm vi + kỳ + nhân viên + phòng — mọi điều kiện TRỪ trạng thái và kiểu vắng."""
        M = LateEarlyRequest
        dk: list = []
        cond = self._scope_condition(scope=scope, actor=actor)
        if cond is not None:
            dk.append(cond)
        return [*dk, *dk_ky(COT_MOC, loc), *dk_nguoi(M, loc)]

    @staticmethod
    def _thu_tu():
        # CHỜ DUYỆT lên đầu — đó là việc phải làm; trong nhóm thì ngày công mới nhất trước.
        M = LateEarlyRequest
        return (case((M.status == STATUS_PENDING, 0), else_=1), M.work_date.desc(), M.id.desc())

    def dem_theo_tab(self, *, scope: str, actor, loc: LocDon) -> dict[str, int]:
        return dem_theo_trang_thai(self.db, LateEarlyRequest, self._dk_loc(scope=scope, actor=actor, loc=loc))

    def loc_scoped(self, *, scope: str, actor, loc: LocDon, status: str | None,
                   limit: int, offset: int) -> tuple[list[LateEarlyRequest], int]:
        M = LateEarlyRequest
        dk = self._dk_loc(scope=scope, actor=actor, loc=loc)
        if status is not None:
            dk.append(M.status == status)
        base = select(M).join(Employee, M.employee_id == Employee.id).where(*dk)
        total = int(self.db.execute(select(func.count()).select_from(base.subquery())).scalar_one())
        rows = list(self.db.execute(base.order_by(*self._thu_tu()).limit(limit).offset(offset)).scalars())
        return rows, total

    def hang_kem_ca(self, *, scope: str, actor, loc: LocDon) -> list[tuple]:
        """(id, trạng thái, từ phút, đến phút, ca bắt đầu, ca kết thúc, ca qua đêm) của MỌI phiếu
        khớp kỳ / người — service suy KIỂU vắng theo ca mặc định của người lao động (luật kiểu vắng
        không viết được gọn bằng SQL). Đã xếp đúng thứ tự hiển thị."""
        M = LateEarlyRequest
        return [tuple(r) for r in self.db.execute(
            select(M.id, M.status, M.from_minute, M.to_minute,
                   WorkShift.start_minute, WorkShift.end_minute, WorkShift.is_overnight)
            .join(Employee, M.employee_id == Employee.id)
            .outerjoin(WorkShift, Employee.default_shift_id == WorkShift.id)
            .where(*self._dk_loc(scope=scope, actor=actor, loc=loc))
            .order_by(*self._thu_tu())
        ).all()]

    def lay_theo_ids(self, ids: list[int]) -> list[LateEarlyRequest]:
        """Nạp phiếu theo id, GIỮ thứ tự của `ids`."""
        if not ids:
            return []
        rows = {r.id: r for r in self.db.execute(
            select(LateEarlyRequest).where(LateEarlyRequest.id.in_(ids))).scalars()}
        return [rows[i] for i in ids if i in rows]

    def lua_chon(self, truong: str, *, scope: str, actor) -> list[dict]:
        dk: list = []
        cond = self._scope_condition(scope=scope, actor=actor)
        if cond is not None:
            dk.append(cond)
        if truong == "phong":
            return lua_chon_phong(self.db, LateEarlyRequest, dk)
        return lua_chon_nhan_vien(self.db, LateEarlyRequest, dk)

    def count_pending_scoped(self, *, scope: str, actor) -> int:
        """Số phiếu ĐANG CHỜ DUYỆT trong scope người gọi — nuôi badge sidebar (COUNT ở DB)."""
        stmt = (
            select(func.count(LateEarlyRequest.id))
            .select_from(LateEarlyRequest)
            .join(Employee, LateEarlyRequest.employee_id == Employee.id)
            .where(LateEarlyRequest.status == STATUS_PENDING)
        )
        cond = self._scope_condition(scope=scope, actor=actor)
        if cond is not None:
            stmt = stmt.where(cond)
        return int(self.db.execute(stmt).scalar_one())

    def count_my_unseen(self, employee_id: int) -> int:
        """Số phiếu của NV đã ĐƯỢC QUYẾT mà NV chưa xem — nuôi chuông Topbar."""
        stmt = select(func.count(LateEarlyRequest.id)).where(
            LateEarlyRequest.employee_id == employee_id,
            LateEarlyRequest.status.in_(_DECIDED),
            LateEarlyRequest.seen_by_employee_at.is_(None),
        )
        return int(self.db.execute(stmt).scalar_one())

    def mark_my_seen(self, employee_id: int) -> None:
        self.db.execute(
            update(LateEarlyRequest)
            .where(
                LateEarlyRequest.employee_id == employee_id,
                LateEarlyRequest.status.in_(_DECIDED),
                LateEarlyRequest.seen_by_employee_at.is_(None),
            )
            .values(seen_by_employee_at=datetime.now(timezone.utc))
        )
        self.db.commit()

    # --- nguồn cho Bảng công tháng + quỹ phép -------------------------------

    def approved_in_range(self, start: date, end: date) -> list[LateEarlyRequest]:
        """Phiếu ĐÃ DUYỆT có `work_date` trong [start, end] — Bảng công dùng để (a) MIỄN PHẠT
        đúng số phút đã xin, (b) hoàn công + trả lương phần vắng khi phiếu có trừ phép."""
        return list(
            self.db.execute(
                select(LateEarlyRequest).where(
                    LateEarlyRequest.status == STATUS_APPROVED,
                    LateEarlyRequest.work_date >= start,
                    LateEarlyRequest.work_date <= end,
                )
            ).scalars()
        )

    def count_pending_in_range(self, start: date, end: date) -> int:
        """Số phiếu CÒN CHỜ DUYỆT có `work_date` trong [start, end] — guard chốt công.

        Chốt công khi còn phiếu treo là mất tiền THẬT: snapshot đóng băng theo trạng thái lúc
        chốt, phiếu duyệt sau đó không vào được nữa ⇒ người lao động vẫn bị phạt đi trễ và mất
        chuyên cần dù đã xin phép đúng luật."""
        return self.db.execute(
            select(func.count()).select_from(LateEarlyRequest).where(
                LateEarlyRequest.status == STATUS_PENDING,
                LateEarlyRequest.work_date >= start,
                LateEarlyRequest.work_date <= end,
            )
        ).scalar_one()

    def live_for_day(self, employee_id: int, work_date: date, *,
                     exclude_id: int | None = None) -> list[LateEarlyRequest]:
        """Phiếu còn hiệu lực (chờ duyệt hoặc đã duyệt) của 1 NV trong 1 ngày công — nền cho luật
        'tối đa 1 phiếu/ngày'. `exclude_id` để đường SỬA không tự đếm chính phiếu đang sửa."""
        stmt = select(LateEarlyRequest).where(
            LateEarlyRequest.employee_id == employee_id,
            LateEarlyRequest.work_date == work_date,
            LateEarlyRequest.status.in_(_LIVE),
        )
        if exclude_id is not None:
            stmt = stmt.where(LateEarlyRequest.id != exclude_id)
        return list(self.db.execute(stmt).scalars())

    def leave_cong_used(self, employee_id: int, leave_type_id: int, year: int) -> float:
        """Σ ngày phép đã bị TRỪ bởi phiếu đi muộn/về sớm (approved + pending) trong năm dương lịch.

        Quỹ phép năm phải cộng cả kênh này, nếu không người ta xin nửa buổi có trừ phép thoải mái
        mà số dư phép không hề giảm."""
        stmt = select(func.coalesce(func.sum(LateEarlyRequest.leave_cong), 0)).where(
            LateEarlyRequest.employee_id == employee_id,
            LateEarlyRequest.leave_type_id == leave_type_id,
            LateEarlyRequest.status.in_(_LIVE),
            func.extract("year", LateEarlyRequest.work_date) == year,
        )
        return float(self.db.execute(stmt).scalar_one() or 0)
