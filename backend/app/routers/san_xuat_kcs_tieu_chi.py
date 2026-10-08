"""Hạng mục kiểm KCS router — danh mục tiêu chí kiểm của từng công đoạn.

Ngoài CRUD phẳng (nền `make_catalog_router`) còn ba cửa cho màn hai ngăn
(`docs/design-tieu-chi-kcs-lam-lai.md`, 08/10/2026):
  · `GET /khai-bao`   — mọi công đoạn theo giai đoạn, kèm tiêu chí; `q` tìm tương đối.
  · `PUT /sap-xep`    — kéo thả: thứ tự mới của toàn bộ tiêu chí một công đoạn.
  · `POST /chep`      — chép câu chữ sang nhiều công đoạn, một giao dịch.

Thân CRUD sinh từ `routers/catalog_base.make_catalog_router`. Dependency INLINE.

MODULE quyền = "dm_kcs_tieu_chi".
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_permission, require_quyen_to
from ..models.cong_doan import NHOM as NHOM_CONG_DOAN
from ..repositories.audit_repo import AuditLogRepository
from ..repositories.san_xuat_kcs_tieu_chi_repo import (
    SanXuatKcsTieuChiRepository, cong_doan_gon, cong_doan_khop, hang_muc_theo_cong_doan,
)
from ..schemas.san_xuat_kcs_tieu_chi import (
    KcsChepIn, KcsChepOut, KcsKhaiBaoCongDoanOut, KcsKhaiBaoGiaiDoanOut, KcsKhaiBaoOut,
    KcsSapXepIn, KcsSapXepOut,
    SanXuatKcsTieuChiIn, SanXuatKcsTieuChiListOut, SanXuatKcsTieuChiRow,
)
from ..services.catalog_base import CatalogError
from ..services.san_xuat_kcs_tieu_chi_service import SanXuatKcsTieuChiService
from .catalog_base import loi_http, make_catalog_router

router = APIRouter(prefix="/api/san-xuat-kcs-tieu-chi", tags=["san-xuat-kcs-tieu-chi"])
MODULE = "dm_kcs_tieu_chi"

# Ai ĐỌC được danh mục này: người khai tiêu chí + Sản xuất (board KCS cần hiển thị checklist).
_DOC = require_quyen_to("read", (MODULE, "read"), ("san_xuat", "read"))
_SUA = require_permission(MODULE, "update")


def get_service(db: Annotated[Session, Depends(get_db)]) -> SanXuatKcsTieuChiService:
    return SanXuatKcsTieuChiService(SanXuatKcsTieuChiRepository(db), AuditLogRepository(db))


Service = Annotated[SanXuatKcsTieuChiService, Depends(get_service)]


# Ba cửa dưới đăng ký TRƯỚC `make_catalog_router`: FastAPI khớp route theo THỨ TỰ, để sau thì
# `GET/PUT /{item_id}` của nền CRUD nuốt mất (422 vì "khai-bao"/"sap-xep" không ép được sang int).
@router.get("/khai-bao", response_model=KcsKhaiBaoOut)
def khai_bao(
    db: Annotated[Session, Depends(get_db)],
    _=Depends(_DOC),
    # Kiểu `Annotated[..., Query()] = mặc định` để gọi thẳng hàm (bài test) vẫn nhận mặc định thật.
    q: Annotated[str | None, Query(max_length=200)] = None,
) -> KcsKhaiBaoOut:
    """Ngăn trái + ngăn phải của màn danh mục trong MỘT lần gọi: mọi công đoạn ĐANG DÙNG (kể cả
    chưa có tiêu chí — `hang_muc: []`) và công đoạn ngừng dùng mà còn tiêu chí, gom theo giai đoạn
    (`cong_doan.nhom`, thứ tự cố định, "" = chưa khai nhóm ở cuối), trong giai đoạn xếp theo mã.

    `q` tìm tương đối bỏ dấu: khớp mã/tên công đoạn hoặc câu chữ MỘT tiêu chí thì giữ công đoạn
    kèm ĐỦ tiêu chí của nó. Số truy vấn cố định — 2, thêm 1 khi có `q` (khoá ở
    `test_san_xuat_kcs_tieu_chi`)."""
    theo_cd = hang_muc_theo_cong_doan(db)
    khop = cong_doan_khop(db, q)
    theo_nhom: dict[str, list[KcsKhaiBaoCongDoanOut]] = {}
    for cd in sorted(cong_doan_gon(db), key=lambda c: (c.ma or "", c.id)):
        hm = theo_cd.get(cd.id, [])
        if not (cd.active or hm):
            continue
        if khop is not None and cd.id not in khop:
            continue
        theo_nhom.setdefault(cd.nhom or "", []).append(KcsKhaiBaoCongDoanOut(
            cong_doan_id=cd.id, ma=cd.ma or "", ten=cd.ten or "", nhom=cd.nhom or "",
            hang_muc=[SanXuatKcsTieuChiRow.model_validate(h) for h in hm],
        ))
    thu_tu = {ma: i for i, ma in enumerate(NHOM_CONG_DOAN)}
    khoa = sorted(theo_nhom, key=lambda ma: (thu_tu.get(ma, len(thu_tu)), ma))
    return KcsKhaiBaoOut(
        giai_doan=[KcsKhaiBaoGiaiDoanOut(nhom=ma, cong_doan=theo_nhom[ma]) for ma in khoa],
    )


@router.put("/sap-xep", response_model=KcsSapXepOut)
def sap_xep(payload: KcsSapXepIn, svc: Service, user=Depends(_SUA)) -> KcsSapXepOut:
    """Kéo thả: `ids` = thứ tự mới của TOÀN BỘ tiêu chí công đoạn. Lệch tập id ⇒ 422."""
    try:
        rows = svc.sap_xep(payload.cong_doan_id, payload.ids, actor_id=user.id)
    except CatalogError as e:
        raise loi_http(e) from None
    return KcsSapXepOut(
        cong_doan_id=payload.cong_doan_id,
        hang_muc=[SanXuatKcsTieuChiRow.model_validate(r) for r in rows],
    )


@router.post("/chep", response_model=KcsChepOut)
def chep(payload: KcsChepIn, svc: Service, user=Depends(_SUA)) -> KcsChepOut:
    """Chép câu chữ sang nhiều công đoạn — một giao dịch; câu đích đã có thì bỏ qua."""
    try:
        kq = svc.chep(payload.den_cong_doan_ids, payload.tieu_chi, actor_id=user.id)
    except CatalogError as e:
        raise loi_http(e) from None
    return KcsChepOut.model_validate(kq)


make_catalog_router(
    router, ten="san_xuat_kcs_tieu_chi", ServiceDep=Service, module=MODULE, doc=_DOC,
    InModel=SanXuatKcsTieuChiIn, RowModel=SanXuatKcsTieuChiRow, ListModel=SanXuatKcsTieuChiListOut,
    # Không có cột `active` (mg 0381): bỏ tiêu chí là xoá hẳn.
    co_active=False,
    # KHÔNG truyền excel_spec= — danh mục này khai theo cây (công đoạn → hạng mục), không có
    # cột phẳng để map vào một dòng Excel.
)
