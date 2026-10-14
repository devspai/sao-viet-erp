"""Báo cáo thu chi theo mục × tháng (11/10/2026) — xem trên màn, ngăn phiếu, chuyển mục, Excel.

Gác bằng ô quyền RIÊNG `bao_cao_thu_chi` (phân hệ Báo cáo): Xem = xem + xuất Excel; Thao tác
(`update`) = chuyển phiếu sang mục khác. Sổ của cả công ty — không đọc phạm vi.
"""
# KHÔNG `from __future__ import annotations`: FastAPI đọc chú thích của `LocBaoCao.__init__` mà
# không có globals của module, chuỗi "date" sẽ không giải được.
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_permission
from ..models.user import User
from ..repositories.audit_repo import AuditLogRepository
from ..repositories.bao_cao_thu_chi_repo import BaoCaoThuChiRepository
from ..repositories.muc_thu_chi_repo import MucThuChiRepository
from ..schemas.bao_cao_thu_chi import (
    BaoCaoThuChiOut, ChuyenMucIn, ChuyenMucOut, PhieuCuaDongOut,
)
from ..services import bao_cao_thu_chi as bc_svc
from ..services import bao_cao_thu_chi_excel
from ..services.muc_thu_chi_service import MucThuChiError, MucThuChiService

router = APIRouter(prefix="/api/bao-cao-thu-chi", tags=["bao-cao-thu-chi"])
MODULE = "bao_cao_thu_chi"


def get_repo(db: Annotated[Session, Depends(get_db)]) -> BaoCaoThuChiRepository:
    return BaoCaoThuChiRepository(db)


Repo = Annotated[BaoCaoThuChiRepository, Depends(get_repo)]
Xem = Annotated[User, Depends(require_permission(MODULE, "read"))]


class LocBaoCao:
    """Tham số chung của bảng, ngăn phiếu và file Excel."""

    def __init__(
        self,
        tu_ngay: date = Query(...),
        den_ngay: date = Query(...),
        theo: str = Query("muc", pattern="^(muc|nguoi)$"),
        hinh_thuc: str | None = Query(default=None, pattern="^(cash|bank_transfer)$"),
        muc: list[int] = Query(default=[], description="id mục; 0 = chưa phân loại"),
    ) -> None:
        if den_ngay < tu_ngay:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                "Ngày cuối kỳ phải sau ngày đầu kỳ.")
        self.tu_ngay, self.den_ngay, self.theo = tu_ngay, den_ngay, theo
        self.hinh_thuc, self.muc = hinh_thuc, muc or None


Loc = Annotated[LocBaoCao, Depends()]


def _bang(repo, loc: LocBaoCao, q, the, page, size) -> dict:
    return bc_svc.bao_cao(
        repo, tu_ngay=loc.tu_ngay, den_ngay=loc.den_ngay, theo=loc.theo,
        hinh_thuc=loc.hinh_thuc, muc=loc.muc, q=q, the=the, page=page, size=size)


@router.get("", response_model=BaoCaoThuChiOut)
def xem_bao_cao(
    repo: Repo, _: Xem, loc: Loc,
    q: str | None = Query(default=None, max_length=100),
    the: str = Query("all", pattern="^(all|thu|chi|chua)$"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=500),
):
    return _bang(repo, loc, q, the, page, size)


@router.get("/phieu", response_model=PhieuCuaDongOut)
def phieu_cua_dong(
    repo: Repo, _: Xem, loc: Loc,
    ben: str = Query(..., pattern="^(thu|chi)$"),
    khoa: str = Query(..., max_length=255),
    cot: str | None = Query(default=None, max_length=16),
):
    try:
        return bc_svc.phieu_cua_dong(
            repo, tu_ngay=loc.tu_ngay, den_ngay=loc.den_ngay, ben=ben, theo=loc.theo, khoa=khoa,
            cot=cot, hinh_thuc=loc.hinh_thuc, muc=loc.muc)
    except bc_svc.BaoCaoThuChiError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from None


@router.post("/chuyen-muc", response_model=ChuyenMucOut)
def chuyen_muc(
    body: ChuyenMucIn, repo: Repo, db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission(MODULE, "update"))],
):
    try:
        n = bc_svc.chuyen_muc(
            repo, MucThuChiService(MucThuChiRepository(db)),
            phieu_chi_ids=body.phieu_chi_ids, phieu_thu_ids=body.phieu_thu_ids,
            muc_id=body.muc_id, audit=AuditLogRepository(db), actor_id=user.id)
    except (bc_svc.BaoCaoThuChiError, MucThuChiError) as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from None
    return {"so_phieu": n}


@router.get("/export.xlsx")
def xuat_excel(
    repo: Repo, _: Xem, loc: Loc,
    q: str | None = Query(default=None, max_length=100),
    the: str = Query("all", pattern="^(all|thu|chi|chua)$"),
) -> Response:
    bc = _bang(repo, loc, q, the, 1, None)
    return Response(
        content=bao_cao_thu_chi_excel.xuat_xlsx(bc),
        media_type=bao_cao_thu_chi_excel.MEDIA_XLSX,
        headers={"Content-Disposition": f'attachment; filename="{bao_cao_thu_chi_excel.ten_file(bc)}"'},
    )
