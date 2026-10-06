"""Số đếm cho thanh lọc của các màn DANH MỤC dùng chung (`routers/catalog_base.make_catalog_router`).

Mỗi điều kiện lọc của màn (nhóm máy, giai đoạn, khách, đang dùng / đã ngừng…) nhận một danh sách
giá trị CÓ THẬT trong dữ liệu kèm số dòng — đếm ở máy chủ dưới đúng bộ lọc đang áp, trừ chính
điều kiện đó (giá trị đang không được chọn vẫn phải khoe số của nó).
"""
from __future__ import annotations

from pydantic import BaseModel


class DemGiaTri(BaseModel):
    """Một giá trị của một điều kiện lọc: `value` gửi lại máy chủ, `nhan` (nếu máy chủ biết — tên
    khách, tên tổ, tên mức khoán…) để hiện, `so` = số dòng mang giá trị đó."""

    value: str
    nhan: str | None = None
    so: int


#: `{tên tham số lọc: [giá trị…]}` — khoá `active` = Đang dùng (`true`) / Đã ngừng (`false`).
DemDieuKien = dict[str, list[DemGiaTri]]
