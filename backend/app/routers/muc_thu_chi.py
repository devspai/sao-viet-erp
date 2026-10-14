"""Mục thu chi router — CRUD danh mục (thân sinh từ `routers/catalog_base.make_catalog_router`).

MODULE quyền = "dm_muc_thu_chi" (Cấu hình danh mục). ĐỌC mở thêm cho người lập phiếu chi / phiếu
thu (ô chọn mục trên form) và người xem Báo cáo thu chi (ô Lọc theo mục, Chuyển sang mục…).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_any_permission
from ..repositories.audit_repo import AuditLogRepository
from ..repositories.muc_thu_chi_repo import MucThuChiRepository
from ..schemas.muc_thu_chi import MucThuChiIn, MucThuChiListOut, MucThuChiRow
from ..services.muc_thu_chi_service import MucThuChiService
from .catalog_base import make_catalog_router

router = APIRouter(prefix="/api/muc-thu-chi", tags=["muc-thu-chi"])
MODULE = "dm_muc_thu_chi"
_doc_muc = require_any_permission(
    (MODULE, "read"), ("phieu_chi", "read"), ("phieu_thu", "read"), ("bao_cao_thu_chi", "read"))


def get_service(db: Annotated[Session, Depends(get_db)]) -> MucThuChiService:
    return MucThuChiService(MucThuChiRepository(db), AuditLogRepository(db))


Service = Annotated[MucThuChiService, Depends(get_service)]


def _dung_rows(svc: MucThuChiService, objs: list) -> list[MucThuChiRow]:
    """Dòng trả về kèm "Đã dùng" — một câu đếm cho cả trang. Mục cố định đến dạng dict."""
    rows = [MucThuChiRow.model_validate(o) for o in objs]
    dem = svc.da_dung([r.id for r in rows])
    return [r.model_copy(update={"da_dung": dem.get(r.id, 0)}) for r in rows]


make_catalog_router(
    router, ten="muc_thu_chi", ServiceDep=Service, module=MODULE, doc=_doc_muc,
    InModel=MucThuChiIn, RowModel=MucThuChiRow, ListModel=MucThuChiListOut,
    loc="loai",
    co_ky=True,         # thanh lọc chung: kỳ Ngày tạo + Đang dùng / Đã ngừng
    dem_them={"loai": "loai"},   # điều kiện "Bên" (Thu / Chi) trong nút Lọc
    dung_rows=_dung_rows,
    ma_goi_y=True,      # repo khai `ma_prefix = "MTC-"`
)
