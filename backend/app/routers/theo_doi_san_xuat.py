"""Router màn "Theo dõi sản xuất" — bốn góc nhìn: Kanban (Task 15), Theo máy · Theo ca · Gantt
(Task 16).

Prefix `/api/theo-doi-san-xuat`. RBAC MODULE = `theo_doi_san_xuat` — ô quyền ĐÃ TỒN TẠI từ Task 1
của loạt (seed `app/seed.py:92`, migration `_migrate_hai_man_chi_doc` ở `app/db_migrations.py`),
KHÔNG khai lại ở đây.

Copy đúng khuôn `routers/lenh_san_xuat.py`: `sale_ids` LUÔN sinh từ
`pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)` — phạm vi lấy từ TOKEN, không bao giờ từ
URL. `/meta` là NGOẠI LỆ có chủ ý: cột Kanban là DANH MỤC `cong_doan` (Ruling C113, xem docstring
`services/lenh_sx/bang_theo_doi.py`) — hằng cho MỌI người xem cùng một khung cột, không phải một
facet dẫn xuất từ dữ liệu riêng của người gọi như ô lọc Máy (`danh_sach.bo_loc`). Vẫn gác bằng
đúng quyền `theo_doi_san_xuat:read` — không lộ cấu trúc danh mục cho người không có quyền vào màn.

`/theo-may` và `/theo-ca` dùng đường dẫn tiếng Việt kebab (Ruling C115, task-16-brief.md) — plan
gốc viết `/machines`/`/shifts`, nhưng cả router này lẫn cả repo đều dùng kebab tiếng Việt
(`/api/lenh-san-xuat/bo-loc`, `/api/cong-doan/phong-ban`...). `/gantt` giữ nguyên (từ mượn, tiếng
Việt viết y hệt).
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_authorization_service, require_permission
from ..models.user import User
from ..schemas.theo_doi_san_xuat import (
    BoLocOut, GanttOut, KanbanMetaOut, KanbanOut, TheoCaOut, TheoLenhOut, TheoMayOut,
)
from ..services.lenh_sx import bang_theo_doi, danh_sach, pham_vi, theo_doi
from ..services.rbac_service import AuthorizationService

router = APIRouter(prefix="/api/theo-doi-san-xuat", tags=["theo-doi-san-xuat"])
MODULE = "theo_doi_san_xuat"
Authz = Annotated[AuthorizationService, Depends(get_authorization_service)]

# Khai kiểu `Literal` để giá trị lạ bị chặn ở CỬA bằng 422 thay vì lọt xuống service rồi lặng lẽ
# trả về một tập RỖNG mà người dùng đọc thành "không có việc nào" — cùng khuôn (và cùng lý do)
# `routers/lenh_san_xuat.py:45-53`. Dựng từ chính hằng của service/model, không gõ lại chuỗi:
# `Literal[X]` với `X` là TUPLE tương đương `Literal[*X]` ở runtime.
UuTien = Literal[danh_sach.UU_TIEN_CHO_PHEP]
NhomCongDoan = Literal[bang_theo_doi.NHOM_CONG_DOAN]
TrangThaiViec = Literal[bang_theo_doi.TRANG_THAI_VIEC_CHO_PHEP]
# `?ca_id=` của `/theo-ca` (Task 18a, Ruling C134) — SỐ để chọn một ca thật, hoặc chuỗi sentinel
# `CA_ID_NGOAI_CA` ("ngoai_ca") để chọn rổ "Ngoài ca" (`CaOut.id=None`, không có số nào đại diện
# cho nó). `/gantt` KHÔNG khai tham số này — xem docstring `bang_theo_doi.gantt` mục W1.
CaId = int | Literal[bang_theo_doi.CA_ID_NGOAI_CA] | None
# `?bat_thuong=` — một trong sáu mục của dải bất thường; giá trị lạ (kể cả `thieu_vat_tu`) ăn 422.
BatThuong = Literal[theo_doi.BAT_THUONG]


def _thanh_loc(
    q: Annotated[str | None, Query(max_length=120)] = None,
    khach_hang_id: int | None = None,
    may_id: int | None = None,
    cong_doan_id: int | None = None,
    nhom_cong_doan: NhomCongDoan | None = None,
    cong_nhan_id: int | None = None,
    trang_thai_viec: TrangThaiViec | None = None,
    uu_tien: UuTien | None = None,
) -> bang_theo_doi.BoLoc:
    """Thanh lọc CHUNG của cả bốn góc nhìn (Ruling C121) — MỘT khai báo, bốn cửa.

    Khai riêng ở từng route thì hai tab sớm muộn nhận hai tập tham số lệch nhau, và người dùng gạt
    một ô lọc rồi đổi tab sẽ thấy con số nhảy mà không hiểu vì sao. Giá trị chọn được lấy từ
    `GET /bo-loc` (mỗi mục có `id` để gán thẳng vào đây và `ten` để bày cho người dùng đọc).

    Task 18a mở RỘNG dùng chung này sang `/theo-ca` và `/gantt` — cả BỐN góc nhìn của màn giờ đọc
    đúng MỘT khai báo tham số, không còn ngoại lệ nào.
    """
    return bang_theo_doi.BoLoc(
        q=q,
        khach_hang_id=khach_hang_id,
        may_id=may_id,
        cong_doan_id=cong_doan_id,
        nhom_cong_doan=nhom_cong_doan,
        cong_nhan_id=cong_nhan_id,
        trang_thai_viec=trang_thai_viec,
        uu_tien=uu_tien,
    )


ThanhLoc = Annotated[bang_theo_doi.BoLoc, Depends(_thanh_loc)]


@router.get("/meta", response_model=KanbanMetaOut)
def meta(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
):
    """Khung cột của board — chính danh mục `cong_doan` + cột "Khác" cố định. Xem docstring
    `services/lenh_sx/bang_theo_doi.meta`."""
    return bang_theo_doi.meta(db)


@router.get("/bo-loc", response_model=BoLocOut)
def bo_loc(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
):
    """Nguồn của thanh lọc màn này — endpoint RIÊNG, gác ĐÚNG ô quyền `theo_doi_san_xuat`
    (Ruling C121).

    CẤM cho FE gọi `/api/lenh-san-xuat/bo-loc` thay: endpoint kia gác ô `lenh_san_xuat`, nên vai
    chỉ có quyền vào màn theo dõi (QC, tổ trưởng) sẽ ăn 403 GIỮA luồng — đúng vết thương đã ghi ở
    `frontend/src/api/client.ts:10755-10758`. Xem `bang_theo_doi.bo_loc` cho từng nhóm và cho
    danh sách những gì đã BỎ.

    Mỗi mục MÁY kèm hai cờ: `ngung_dung` (đã thanh lý) và `co_viec` (Ruling C133 — có ít nhất một
    công việc CHƯA hoàn thành thuộc lệnh đã phát hành TRONG PHẠM VI người gọi, tức đúng phạm vi
    `/theo-may` khi không truyền cửa sổ). `co_viec` là GỢI Ý hiển thị, KHÔNG phải bộ lọc.
    """
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return bang_theo_doi.bo_loc(db, sale_ids=sale_ids)


@router.get("/theo-lenh", response_model=TheoLenhOut)
def theo_lenh(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    q: Annotated[str | None, Query(max_length=120)] = None,
    khach_hang_id: int | None = None,
    may_id: int | None = None,
    bat_thuong: BatThuong | None = None,
):
    """Góc Theo lệnh: mỗi lệnh còn sống một dòng + số của dải bất thường (một yêu cầu mỗi lượt)."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi.theo_lenh(
        db, sale_ids=sale_ids, q=q, khach_hang_id=khach_hang_id, may_id=may_id,
        bat_thuong=bat_thuong,
    )


@router.get("/kanban", response_model=KanbanOut)
def kanban(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    loc: ThanhLoc,
):
    """Một card mỗi lệnh đã phát hành trong phạm vi người gọi, ĐÃ áp thanh lọc (Ruling C121 — lọc
    ở SQL, xem `bang_theo_doi._loc_ban`). Xem docstring `bang_theo_doi.kanban`."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return bang_theo_doi.kanban(db, sale_ids=sale_ids, loc=loc)


@router.get("/theo-may", response_model=TheoMayOut)
def theo_may(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    q: Annotated[str | None, Query(max_length=120)] = None,
    khach_hang_id: int | None = None,
    bat_thuong: BatThuong | None = None,
):
    """Góc Theo máy: mỗi máy một dòng chia nhóm + số của dải bất thường (một yêu cầu mỗi lượt)."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi.theo_may(
        db, sale_ids=sale_ids, q=q, khach_hang_id=khach_hang_id, bat_thuong=bat_thuong,
    )


@router.get("/theo-ca", response_model=TheoCaOut)
def theo_ca(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    loc: ThanhLoc,
    ngay: date | None = None,
    ca_id: CaId = None,
):
    """Công việc theo TỪNG CA của một ngày xưởng, mặc định hôm nay (Task 16, Ruling C115: đường
    dẫn `/theo-ca`, KHÔNG phải `/shifts`). Xem docstring `bang_theo_doi.theo_ca`.

    Task 18a: nhận đủ 8 tham số của `loc` (thu hẹp TẬP LỆNH ở SQL, trước `boi_canh.nap()`, giống hệt
    `/kanban`/`/theo-may`) CỘNG tham số riêng `ca_id` — lọc CỘT CA được trả về, áp SAU cửa sổ `ngay`
    đã có, không thêm câu SQL nào (Ruling C134). `ca_id` là số để chọn một ca thật, hoặc chuỗi
    `"ngoai_ca"` (`bang_theo_doi.CA_ID_NGOAI_CA`) để chọn riêng rổ "Ngoài ca" — vắng mặt thì trả cả
    hai như cũ, số lạ không khớp ca nào thì trả `{"ca": []}`.
    """
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return bang_theo_doi.theo_ca(db, sale_ids=sale_ids, ngay=ngay, loc=loc, ca_id=ca_id)


@router.get("/gantt", response_model=GanttOut)
def gantt(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    loc: ThanhLoc,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=bang_theo_doi.PAGE_SIZE_GANTT_TOI_DA)
    ] = bang_theo_doi.PAGE_SIZE_GANTT_MAC_DINH,
):
    """MỘT dòng mỗi LỆNH (Task 16, Ruling C118), phân trang Ở SQL (Ruling C119). Xem docstring
    `bang_theo_doi.gantt`.

    Task 18a: nhận đủ 8 tham số của `loc`, áp TRƯỚC cả đếm `total` lẫn cắt trang (Ruling C121 +
    cảnh báo riêng ở docstring service — lọc sau khi cắt trang là lọc trên một trang chứ không phải
    trên tập). KHÔNG nhận `ca_id`: một dòng Gantt gộp nhiều ca, lọc ở thang đó vô nghĩa (Ruling
    C134) — xin ca thì dùng `/theo-ca`.
    """
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return bang_theo_doi.gantt(db, sale_ids=sale_ids, loc=loc, page=page, page_size=page_size)
