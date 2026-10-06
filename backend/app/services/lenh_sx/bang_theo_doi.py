"""Phần dùng chung của màn "Theo dõi sản xuất": phạm vi, bộ lọc, luật rụng, nguồn ô lọc.

Làm gọn 05/10/2026: bốn góc nhìn cũ (Kanban · Theo máy · Theo ca · Gantt) đã xoá; hai góc mới ở
`theo_doi.py`. Tệp này giữ những gì cả hai góc mới và ô lọc cùng đọc, để không có hai bản sao.

--- BỘ LỌC CHỌN LỆNH, LỌC Ở SQL (Ruling C121) ----------------------------------------------------
`BoLoc` thu hẹp TẬP LỆNH ở SQL (`_loc_ban`) — ô tìm (mã/tên lệnh, số đơn, tên khách), khách, máy.
Lọc máy đi qua `danh_sach._co_buoc` (công việc riêng · công việc ghép · routing), cùng phép với
Hồ sơ lệnh: hai màn chọn cùng một máy phải ra cùng một tập lệnh.

--- LUẬT RỤNG (chốt 28/09/2026) ---------------------------------------------------------------------
`_bo_lenh_da_rung`: giao đủ + lần giao cuối quá `KANBAN_GIU_SAU_GIAO` + không còn việc đang chạy /
tạm dừng ⇒ không hiện ở Theo dõi. Lệnh đã rụng vẫn tra được ở Hồ sơ lệnh sản xuất.

Không một số tiền nào.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...models.bai_ghep_cong_doan import BaiGhepCongDoanMap
from ...models.customer import Customer
from ...models.lsx import Lsx, LsxCongDoan
from ...models.may_thiet_bi import MayThietBi
from ...models.order import Order
from ...models.san_xuat import CV_DANG_CHAY, CV_HOAN_THANH, CV_TAM_DUNG, SanXuatCongViec
from ...repositories.lenh_sx_doc_repo import LenhSxDocRepository
from . import danh_sach, pham_vi, trang_thai

# Hai trạng thái "đang có người làm" — lệnh giao đủ mà còn việc ở đây thì CHƯA rụng.
_DANG_LAM = (CV_DANG_CHAY, CV_TAM_DUNG)

# Lệnh giao đủ còn hiện thêm bấy nhiêu sau lần giao cuối.
KANBAN_GIU_SAU_GIAO = timedelta(days=3)


def _may_danh_muc(db: Session) -> dict[int, MayThietBi]:
    """DANH MỤC máy — TOÀN BỘ, kể cả `active=False`, sắp tên rồi mã. MỘT câu SQL.

    Nguồn chung của ô Máy (`bo_loc`) và khung bảng Theo máy (`theo_doi._nap`)."""
    return {
        m.id: m
        for m in db.execute(
            select(MayThietBi).order_by(MayThietBi.ten.asc(), MayThietBi.ma.asc())
        ).scalars()
    }


def _cv_trong_pham_vi(trong_pham_vi):
    """Subquery `id` của MỌI công việc thuộc các lệnh trong `trong_pham_vi` — công việc neo thẳng
    UNION công việc chung của bài ghép (với tới lệnh qua `bai_ghep_cong_doan_map`)."""
    return (
        select(SanXuatCongViec.id.label("id"))
        .where(SanXuatCongViec.lsx_id.in_(trong_pham_vi))
        .union(
            select(SanXuatCongViec.id.label("id"))
            .join(
                BaiGhepCongDoanMap,
                BaiGhepCongDoanMap.bai_ghep_cong_doan_id
                == SanXuatCongViec.bai_ghep_cong_doan_id,
            )
            .where(BaiGhepCongDoanMap.lsx_id.in_(trong_pham_vi))
        )
        .subquery()
    )


def _may_con_no_viec(db: Session, sale_ids: set[int] | None) -> set[int]:
    """Máy có ÍT NHẤT MỘT công việc chưa hoàn thành thuộc lệnh đã phát hành trong phạm vi. MỘT câu."""
    cv = _cv_trong_pham_vi(pham_vi.loc_lsx_da_phat_hanh(select(Lsx.id), sale_ids))
    return set(
        db.execute(
            select(SanXuatCongViec.may_id)
            .where(
                SanXuatCongViec.may_id.is_not(None),
                SanXuatCongViec.trang_thai != CV_HOAN_THANH,
                SanXuatCongViec.id.in_(select(cv.c.id)),
            )
            .distinct()
        ).scalars()
    )


@dataclass(frozen=True)
class BoLoc:
    """Ô lọc của Theo dõi. Trường `None` = không lọc."""

    q: str | None = None
    khach_hang_id: int | None = None
    may_id: int | None = None


def _loc_ban(stmt, loc: BoLoc | None):
    """Gắn bộ lọc vào một `select(Lsx.id)` đã mang sẵn phạm vi + đã phát hành. Tất cả ở SQL.

    Khách và ô tìm đi qua SUBQUERY trên `orders`, không `join`: phạm vi hẹp có thể đã join
    `orders` rồi (`pham_vi.loc_lsx_da_phat_hanh`)."""
    if loc is None:
        return stmt
    if loc.q and loc.q.strip():
        mau = f"%{loc.q.strip()}%"
        don_khop = (
            select(Order.id)
            .outerjoin(Customer, Customer.id == Order.customer_id)
            .where(or_(Order.order_no.ilike(mau), Customer.name.ilike(mau)))
        )
        stmt = stmt.where(
            or_(Lsx.ma.ilike(mau), Lsx.ten.ilike(mau), Lsx.order_id.in_(don_khop))
        )
    if loc.khach_hang_id is not None:
        stmt = stmt.where(
            Lsx.order_id.in_(select(Order.id).where(Order.customer_id == loc.khach_hang_id))
        )
    if loc.may_id is not None:
        stmt = stmt.where(
            danh_sach._co_buoc(SanXuatCongViec.may_id, LsxCongDoan.may_id, loc.may_id)
        )
    return stmt


def _ids_trong_pham_vi(
    db: Session, sale_ids: set[int] | None, *, loc: BoLoc | None = None,
) -> list[int]:
    """Id lệnh đã phát hành trong phạm vi người gọi, đã áp bộ lọc — MỘT câu."""
    stmt = _loc_ban(pham_vi.loc_lsx_da_phat_hanh(select(Lsx.id), sale_ids), loc)
    return list(db.execute(stmt).scalars())


def bo_loc(db: Session, *, sale_ids: set[int] | None) -> dict:
    """Nguồn ô lọc của Theo dõi — gác `theo_doi_san_xuat:read` (không mượn đường của Hồ sơ lệnh).

    `may`: DANH MỤC máy kèm `ngung_dung` và `co_viec` (gợi ý, không phải bộ lọc).
    `khach_hang`: khách của chính các lệnh trong phạm vi (`danh_sach.khach_trong_pham_vi`).
    `id` là CHUỖI cho cả hai nhóm. Số câu SQL hằng: máy (1) + `co_viec` (1) + khách (1)."""
    may_co_viec = _may_con_no_viec(db, sale_ids)
    return {
        "may": [
            {
                "id": str(m.id),
                "ten": m.ten,
                "ngung_dung": not bool(m.active),
                "co_viec": m.id in may_co_viec,
            }
            for m in _may_danh_muc(db).values()
        ],
        "khach_hang": [
            {"id": str(k["id"]), "ten": k["ten"]}
            for k in danh_sach.khach_trong_pham_vi(db, sale_ids)
        ],
    }


def _bo_lenh_da_rung(db: Session, ids: list[int], *, bay_gio: datetime | None = None) -> list[int]:
    """Bỏ khỏi `ids` lệnh ĐÃ RỤNG: giao hết (`trang_thai.giao_du`), lần giao cuối cách đây quá
    `KANBAN_GIU_SAU_GIAO`, và KHÔNG còn công việc đang chạy / tạm dừng. Ba câu nhẹ, chạy TRƯỚC
    `boi_canh.nap()` — lệnh cũ không bị nạp nặng mỗi lần mở màn."""
    if not ids:
        return ids
    repo = LenhSxDocRepository(db)
    giao_het = [
        i for i, l in repo.lenh_nhe(ids).items() if trang_thai.giao_du(l.so_luong_dat, l.da_giao)
    ]
    if not giao_het:
        return ids
    moc = (bay_gio or datetime.now(timezone.utc)) - KANBAN_GIU_SAU_GIAO
    rung = repo.giao_cuoi_truoc(giao_het, moc) - repo.lenh_con_viec_o_trang_thai(giao_het, _DANG_LAM)
    return [i for i in ids if i not in rung]
