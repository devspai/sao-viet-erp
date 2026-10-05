"""Data access cho chấm đỏ thanh bên — thông báo theo KÊNH (= khoá module của màn)."""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.orm import Session

from ..models.module_notification import ModuleNotification, ModuleNotificationRead

CHANNEL_THU_MUA = "thu_mua"
CHANNEL_KE_TOAN = "ke_toan"


@dataclass(frozen=True)
class DieuKienKenh:
    """Một vế "người gọi được thấy dòng phát rộng nào" của một kênh.

    `quyen` None = dòng chỉ đòi Xem; `phong_ids` None = mọi phòng, () = chỉ dòng không gắn phòng."""
    kenh: str
    quyen: str | None
    phong_ids: tuple[int, ...] | None


class ModuleNotificationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        *,
        channel: str,
        event_type: str,
        actor_user_id: int | None,
        recipient_user_id: int | None = None,
        source_code: str | None = None,
        required_action: str | None = None,
        department_id: int | None = None,
        commit: bool = True,
    ) -> ModuleNotification:
        row = ModuleNotification(
            channel=channel,
            event_type=event_type,
            actor_user_id=actor_user_id,
            recipient_user_id=recipient_user_id,
            source_code=(source_code or "").strip() or None,
            required_action=required_action,
            department_id=department_id,
        )
        self.db.add(row)
        if commit:
            self.db.commit()
            self.db.refresh(row)
        else:
            self.db.flush()
        return row

    def da_co(self, *, kenh: str, loai: str, ma: str | None) -> bool:
        return self.db.execute(
            select(ModuleNotification.id).where(
                ModuleNotification.channel == kenh,
                ModuleNotification.event_type == loai,
                ModuleNotification.source_code == ma,
            ).limit(1)
        ).first() is not None

    def moi_nhat(self, user_id: int, dieu_kien: list[DieuKienKenh]) -> dict[str, dict]:
        """Mỗi kênh: dòng MỚI NHẤT người gọi chưa xem và được thấy. MỘT câu gom + (nếu có) MỘT câu
        lấy chi tiết. Dòng đích danh (`recipient_user_id` = mình) không xét quyền."""
        N, R = ModuleNotification, ModuleNotificationRead
        # Gom kênh cùng (quyền, phạm vi phòng) vào MỘT `channel IN (…)`: mỗi kênh một nhánh AND là
        # ~56 phép so sánh dựng lại mỗi request (~20 ms CPU, đo 30/09/2026) — endpoint này nằm trong
        # chùm badge mọi người gọi giữa ca. Nghĩa y hệt: OR các nhánh cùng điều kiện phụ = IN.
        nhom: dict[tuple, list[str]] = {}
        for d in dieu_kien:
            phong = None if d.phong_ids is None else tuple(sorted(d.phong_ids))
            nhom.setdefault((d.quyen, phong), []).append(d.kenh)
        ve = []
        for (quyen, phong), kenhs in nhom.items():
            c = [
                N.channel.in_(kenhs),
                N.required_action.is_(None) if quyen is None else N.required_action == quyen,
            ]
            if phong is not None:
                c.append(
                    or_(N.department_id.is_(None), N.department_id.in_(phong))
                    if phong else N.department_id.is_(None)
                )
            ve.append(and_(*c))
        phat_rong = and_(N.recipient_user_id.is_(None), or_(*ve)) if ve else false()
        gom = (
            select(N.channel, func.max(N.id))
            .select_from(N)
            .outerjoin(R, and_(R.user_id == user_id, R.channel == N.channel))
            .where(
                N.id > func.coalesce(R.last_read_notification_id, 0),
                or_(N.actor_user_id.is_(None), N.actor_user_id != user_id),
                or_(N.recipient_user_id == user_id, phat_rong),
            )
            .group_by(N.channel)
        )
        ids = [i for _k, i in self.db.execute(gom).all()]
        if not ids:
            return {}
        rows = self.db.execute(
            select(N.id, N.channel, N.event_type, N.source_code).where(N.id.in_(ids))
        ).all()
        return {r.channel: {"id": r.id, "loai": r.event_type, "ma": r.source_code} for r in rows}

    def mark_read(self, *, user_id: int, channel: str) -> None:
        latest_id = self.db.execute(
            select(func.max(ModuleNotification.id)).where(ModuleNotification.channel == channel)
        ).scalar_one()
        row = self.db.execute(
            select(ModuleNotificationRead).where(
                ModuleNotificationRead.user_id == user_id,
                ModuleNotificationRead.channel == channel,
            )
        ).scalar_one_or_none()
        if row is None:
            self.db.add(ModuleNotificationRead(
                user_id=user_id, channel=channel, last_read_notification_id=int(latest_id or 0),
            ))
        else:
            row.last_read_notification_id = int(latest_id or 0)
        self.db.commit()
