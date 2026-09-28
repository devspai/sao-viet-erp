"""Badge thông báo chưa đọc dùng chung cho Thu mua và Kế toán."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..deps import (
    CurrentUser,
    get_authorization_service,
    get_module_notification_repository,
)
from ..repositories.module_notification_repo import CHANNELS, ModuleNotificationRepository
from ..schemas.module_notification import ModuleNotificationSummaryOut
from ..services.rbac_service import AuthorizationService


router = APIRouter(prefix="/api/module-notifications", tags=["module-notifications"])
Repo = Annotated[ModuleNotificationRepository, Depends(get_module_notification_repository)]
Authz = Annotated[AuthorizationService, Depends(get_authorization_service)]


@router.get("/summary", response_model=ModuleNotificationSummaryOut)
def summary(repo: Repo, authz: Authz, user: CurrentUser) -> ModuleNotificationSummaryOut:
    # Kiểm quyền TRƯỚC khi đếm: kênh không được xem trả 0 và không tốn câu SQL nào — vừa không
    # rò số sự kiện của màn người gọi không được xem, vừa khỏi đếm phí cho mọi tab mỗi lần mở app.
    duoc_xem = [c for c in CHANNELS if authz.can(user, c, "read")]
    counts = repo.unread_counts(user.id, duoc_xem) if duoc_xem else {c: 0 for c in CHANNELS}
    return ModuleNotificationSummaryOut(**counts)


@router.post("/{channel}/mark-read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(channel: str, repo: Repo, authz: Authz, user: CurrentUser) -> Response:
    if channel not in CHANNELS:
        raise HTTPException(status_code=404, detail="Không tìm thấy kênh thông báo.")
    if not authz.can(user, channel, "read"):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem màn này.")
    repo.mark_read(user_id=user.id, channel=channel)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
