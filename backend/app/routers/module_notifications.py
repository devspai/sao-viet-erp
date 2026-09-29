"""Chấm đỏ thanh bên: MỘT tóm tắt cho mọi màn + đánh dấu đã xem khi mở màn."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import CurrentUser, get_authorization_service, get_module_notification_repository
from ..repositories.module_notification_repo import ModuleNotificationRepository
from ..schemas.module_notification import ModuleNotificationSummaryOut
from ..services.rbac_service import AuthorizationService
from ..services.thong_bao_man import kenh_hop_le, trang_thai

router = APIRouter(prefix="/api/module-notifications", tags=["module-notifications"])
Repo = Annotated[ModuleNotificationRepository, Depends(get_module_notification_repository)]
Authz = Annotated[AuthorizationService, Depends(get_authorization_service)]
Db = Annotated[Session, Depends(get_db)]


@router.get("/summary", response_model=ModuleNotificationSummaryOut)
def summary(db: Db, authz: Authz, user: CurrentUser) -> ModuleNotificationSummaryOut:
    return ModuleNotificationSummaryOut(kenh=trang_thai(db, authz, user))


@router.post("/{channel}/mark-read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(channel: str, repo: Repo, user: CurrentUser) -> Response:
    # Không đòi quyền màn: chỉ dời mốc "đã xem" của CHÍNH người gọi — người không có quyền màn
    # vẫn phải dọn được chấm của việc gửi đích danh cho họ (vd thợ bị đổi ca).
    if not kenh_hop_le(channel):
        raise HTTPException(status_code=404, detail="Không tìm thấy kênh thông báo.")
    repo.mark_read(user_id=user.id, channel=channel)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
