"""Thông báo chưa đọc theo màn nghiệp vụ.

Một sự kiện chỉ lưu một lần theo ``channel``; mỗi người dùng giữ mốc id cuối đã đọc. Cách này
không nhân bản cùng một thông báo cho mọi kế toán/thu mua và vẫn giữ được trạng thái qua refresh.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ModuleNotification(Base):
    __tablename__ = "module_notifications"
    # Badge đếm "id > mốc đã đọc" theo kênh (mg `0344`).
    __table_args__ = (
        Index("ix_module_notifications_channel_id", "channel", "id"),
        # Dòng đích danh của một người theo kênh — vế `recipient_user_id = tôi` của tóm tắt (mg 0346).
        Index("ix_module_notifications_recipient_channel", "recipient_user_id", "channel", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # NULL = gửi cho mọi người có quyền đọc kênh; có id = gửi đích danh (vd quyết định PMH chỉ
    # báo cho người lập, không làm badge của mọi nhân viên mua hàng cùng nhảy).
    recipient_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Ô quyền người nhận PHẢI có trên module = kênh (vd `approve`); NULL = chỉ cần Xem màn (mg 0346).
    required_action: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Phòng của BẢN GHI gây ra thông báo — lọc theo phạm vi `department` của người nhận (mg 0346).
    # NULL = không gắn phòng (ai đủ quyền đều thấy).
    department_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False, index=True
    )


class ModuleNotificationRead(Base):
    __tablename__ = "module_notification_reads"
    __table_args__ = (
        UniqueConstraint("user_id", "channel", name="uq_module_notification_read_user_channel"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    channel: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    last_read_notification_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )
