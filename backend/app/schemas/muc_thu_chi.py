"""Pydantic schemas — danh mục Mục thu chi."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .loc_danh_muc import DemDieuKien


class MucThuChiIn(BaseModel):
    ma: str | None = Field(default=None, max_length=30)  # bỏ trống → máy cấp MTC-####
    ten: str = Field(min_length=1, max_length=150)
    loai: str = Field(pattern="^(thu|chi)$")
    ghi_chu: str | None = Field(default=None, max_length=500)
    active: bool = True


class MucThuChiRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ma: str
    ten: str
    loai: str
    ghi_chu: str | None = None
    active: bool
    #: Mục cố định theo nguồn phiếu (id âm, không có dòng trong DB) — chỉ đọc.
    co_dinh: bool = False
    #: Nguồn phiếu của mục cố định (`gia_cong_ngoai`…) — form phiếu nguồn đó đọc tên mục từ đây.
    nguon: str | None = None
    #: Số phiếu (chi + thu, mọi trạng thái) đang mang mục — cột "Đã dùng".
    da_dung: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class MucThuChiListOut(BaseModel):
    items: list[MucThuChiRow]
    total: int
    page: int
    size: int
    dem: DemDieuKien = {}
