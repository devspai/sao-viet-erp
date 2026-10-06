"""Pydantic schemas — danh mục Xe giao hàng (mã = biển số).

MỨC khoán km không ở đây: nó là cấu hình LƯƠNG, schema nằm trong `schemas/delivery.py` cạnh bảng
bậc của phòng.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .loc_danh_muc import DemDieuKien


class XeIn(BaseModel):
    ma: str = Field(min_length=1, max_length=30)          # BIỂN SỐ
    ten: str = Field(min_length=1, max_length=150)
    tai_trong: float | None = Field(default=None, gt=0)   # tấn; để trống được
    #: Xe này ăn MỨC nào — BẮT BUỘC (14/09/2026). Để `None` ở schema cho câu lỗi tiếng Việt của
    #: `XeService._validate` thay vì câu 422 tiếng Anh của pydantic.
    muc_khoan_km_id: int | None = None
    ghi_chu: str | None = None
    active: bool = True


class XeRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ma: str
    ten: str
    tai_trong: float | None = None
    muc_khoan_km_id: int | None = None
    ghi_chu: str | None = None
    active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class XeListOut(BaseModel):
    items: list[XeRow]
    total: int
    page: int
    size: int
    # Giá trị + số đếm của từng điều kiện lọc (thanh lọc chung) — xem `schemas/loc_danh_muc`.
    dem: DemDieuKien = {}
