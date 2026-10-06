"""Hạng mục kiểm KCS router — CRUD danh mục checklist kiểm tra chất lượng.

Ngoài CRUD phẳng (nền `make_catalog_router`) còn `GET .../khai-bao` trả sẵn ba tầng
Giai đoạn → Công đoạn → hạng mục cho màn khai báo (`docs/design-kcs-theo-cong-doan.md` mục 5).

Thân CRUD sinh từ `routers/catalog_base.make_catalog_router`. Dependency INLINE.

MODULE quyền = "dm_kcs_tieu_chi".
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_quyen_to
from ..repositories.audit_repo import AuditLogRepository
from ..repositories.san_xuat_kcs_tieu_chi_repo import SanXuatKcsTieuChiRepository
from ..models.cong_doan import NHOM as NHOM_CONG_DOAN
from ..repositories.san_xuat_kcs_tieu_chi_repo import (
    co_hang_muc, cong_doan_gon, hang_muc_theo_cong_doan,
)
from ..schemas.san_xuat_kcs_tieu_chi import (
    KcsCongDoanChonOut, KcsKhaiBaoCongDoanOut, KcsKhaiBaoGiaiDoanOut, KcsKhaiBaoOut,
    SanXuatKcsTieuChiIn, SanXuatKcsTieuChiListOut, SanXuatKcsTieuChiRow,
)
from ..services.san_xuat_kcs_tieu_chi_service import SanXuatKcsTieuChiService
from .catalog_base import make_catalog_router

router = APIRouter(prefix="/api/san-xuat-kcs-tieu-chi", tags=["san-xuat-kcs-tieu-chi"])
MODULE = "dm_kcs_tieu_chi"

# Ai ĐỌC được danh mục này: người khai tiêu chí + Sản xuất (board KCS Task 4/5 cần hiển thị
# checklist) — cùng lý do router Bù hao (nay đã gỡ) từng mở đọc cho Tính giá/Sản xuất.
_DOC = require_quyen_to("read", (MODULE, "read"), ("san_xuat", "read"))


def get_service(db: Annotated[Session, Depends(get_db)]) -> SanXuatKcsTieuChiService:
    return SanXuatKcsTieuChiService(SanXuatKcsTieuChiRepository(db), AuditLogRepository(db))


Service = Annotated[SanXuatKcsTieuChiService, Depends(get_service)]

# Đăng ký TRƯỚC `make_catalog_router`: FastAPI khớp route theo THỨ TỰ, để sau thì
# `GET /{item_id}` của nền CRUD nuốt mất đường này (422 vì "khai-bao" không ép được sang int).
@router.get("/khai-bao", response_model=KcsKhaiBaoOut)
def khai_bao(
    db: Annotated[Session, Depends(get_db)],
    _=Depends(_DOC),
    # Kiểu `Annotated[..., Query()] = mặc định` để gọi thẳng hàm (bài test) vẫn nhận mặc định thật.
    q: Annotated[str | None, Query(max_length=200)] = None,
    nhom: Annotated[Literal["prepress", "print", "finishing", "other"] | None, Query()] = None,
    bat_buoc: Annotated[bool | None, Query()] = None,
    active: Annotated[bool | None, Query()] = None,
    tu_ngay: Annotated[date | None, Query()] = None,
    den_ngay: Annotated[date | None, Query()] = None,
    moc: Annotated[Literal["tao"], Query()] = "tao",
) -> KcsKhaiBaoOut:
    """Ba tầng Giai đoạn → Công đoạn → hạng mục — hình dạng màn khai báo dùng thẳng.

    CHỈ liệt kê công đoạn ĐÃ khai hạng mục: đây là "danh sách công đoạn cần kiểm", không phải
    bản sao danh mục Công đoạn. Muốn thêm công đoạn vào bàn kiểm thì khai hạng mục đầu tiên
    cho nó (POST bản ghi thường). Giai đoạn xếp theo thứ tự cố định của `cong_doan.nhom`;
    công đoạn không khai nhóm rơi vào cụm cuối mang `nhom = ""`.

    ĐỌC CẢ hạng mục `active=False` — màn khai báo phải thấy dòng đang ngừng dùng để bật lại;
    chỉ đường PHÁT HÀNH mới lọc `active` (`SanXuatRepository.checklist_theo_cong_doan`).

    `cong_doan_chon` = công đoạn ĐANG DÙNG chưa khai hạng mục, cho ô chọn thêm công đoạn cần kiểm.
    Trả chung ở đây để màn chỉ gọi MỘT cửa, dưới đúng quyền KCS (xem `cong_doan_gon`).
    Tổng cộng 2 truy vấn, không chạy theo số công đoạn/hạng mục (khoá ở `test_san_xuat_kcs_tieu_chi`).

    Thanh lọc (06/10/2026) lọc Ở ĐÂY, không ở trình duyệt: `q` (tìm tương đối mã/tên công đoạn,
    câu chữ / hướng dẫn hạng mục), `bat_buoc`, `active`, kỳ `tu_ngay`/`den_ngay` theo ngày tạo hạng
    mục (`moc` chỉ có `tao`), `nhom` = giai đoạn. Cây chỉ giữ nhánh còn hạng mục khớp.
    `dem_theo_nhom` = số công đoạn mỗi giai đoạn SAU mọi lọc trừ `nhom` (số trên điều kiện Giai
    đoạn). `cong_doan_chon` không theo lọc — nó là ô chọn để khai thêm.
    """
    theo_cd = hang_muc_theo_cong_doan(
        db, q=q, bat_buoc=bat_buoc, active=active, tu_ngay=tu_ngay, den_ngay=den_ngay)
    cds = sorted(cong_doan_gon(db), key=lambda c: (c.ma or "", c.id))
    theo_nhom: dict[str, list[KcsKhaiBaoCongDoanOut]] = {}
    chon: list[KcsCongDoanChonOut] = []
    dem: dict[str, int] = {}
    # Ô chọn "công đoạn chưa khai" phải biết công đoạn nào ĐÃ khai — kể cả nhánh bị lọc mất.
    da_khai = theo_cd.keys() if not (q or bat_buoc is not None or active is not None
                                     or tu_ngay or den_ngay) else co_hang_muc(db)
    for cd in cds:
        if cd.id not in theo_cd:
            if cd.active and cd.id not in da_khai:
                chon.append(KcsCongDoanChonOut(
                    id=cd.id, ma=cd.ma or "", ten=cd.ten or "", nhom=cd.nhom or "",
                ))
            continue
        ma_nhom = cd.nhom or "other"
        dem[ma_nhom] = dem.get(ma_nhom, 0) + 1
        if nhom is not None and ma_nhom != nhom:
            continue
        theo_nhom.setdefault(cd.nhom or "", []).append(KcsKhaiBaoCongDoanOut(
            cong_doan_id=cd.id, ma=cd.ma or "", ten=cd.ten or "",
            hang_muc=[SanXuatKcsTieuChiRow.model_validate(h) for h in theo_cd[cd.id]],
        ))
    thu_tu = {ma: i for i, ma in enumerate(NHOM_CONG_DOAN)}
    khoa = sorted(theo_nhom, key=lambda ma: (thu_tu.get(ma, len(thu_tu)), ma))
    return KcsKhaiBaoOut(
        giai_doan=[KcsKhaiBaoGiaiDoanOut(nhom=ma, cong_doan=theo_nhom[ma]) for ma in khoa],
        cong_doan_chon=chon,
        dem_theo_nhom=dem,
    )


make_catalog_router(
    router, ten="san_xuat_kcs_tieu_chi", ServiceDep=Service, module=MODULE, doc=_DOC,
    InModel=SanXuatKcsTieuChiIn, RowModel=SanXuatKcsTieuChiRow, ListModel=SanXuatKcsTieuChiListOut,
    # KHÔNG truyền excel_spec= — danh mục này khai theo cây (công đoạn → hạng mục), không có
    # cột phẳng để map vào một dòng Excel.
)
