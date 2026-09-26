"""Gia công ngoài — một cửa ghi DUY NHẤT cho mang đi / chốt / mở lại / trọn gói (spec 2026-09-26).

Quyền: ai sửa được lệnh (`san_xuat:update`) — không thêm vai, không thêm bit (spec §6). Tiền của
lần chỉ trả cho người có `kho:view_cost`. Mọi SSE bắn SAU commit.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_authorization_service, require_permission
from ..models.user import User
from ..repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ..schemas.gia_cong_ngoai import GiaCongNgoaiOut, NhaGiaCongOut
from ..services.gia_cong_ngoai.lan import lan_cua_lenh
from ..services.rbac_service import AuthorizationService

router = APIRouter(prefix="/api/gia-cong-ngoai", tags=["gia-cong-ngoai"])
MODULE = "san_xuat"
Authz = Annotated[AuthorizationService, Depends(get_authorization_service)]


def _chay(fn):
    """Lỗi nghiệp vụ → mã HTTP: quyền 403 · người khác vừa đổi 409 · ràng buộc 400."""
    from ..services.gia_cong_ngoai import GiaCongXungDot

    try:
        return fn()
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except GiaCongXungDot as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/nha-gia-cong", response_model=list[NhaGiaCongOut])
def nha_gia_cong(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission(MODULE, "read"))],
) -> list[dict]:
    """Ô chọn Nhà gia công của Kế hoạch SX — người kế hoạch không cần quyền Mua hàng."""
    return [{"id": s.id, "ten": s.name} for s in GiaCongNgoaiRepository(db).nha_gia_cong_options()]


def _xem_tien(authz: AuthorizationService, user: User) -> bool:
    """Tiền của lần gia công đi qua CÙNG cổng với mọi số tiền khác (`kho:view_cost`)."""
    return authz.can(user, "kho", "view_cost")


@router.get("/lenh/{lsx_id}", response_model=list[GiaCongNgoaiOut])
def cua_lenh(
    lsx_id: int,
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
) -> list[dict]:
    return lan_cua_lenh(db, lsx_id, xem_tien=_xem_tien(authz, user))
