"""Lựa chọn của các ô lọc trong bảng "Bộ lọc nâng cao" (khách hàng, người duyệt…) ở ba danh sách
Kinh doanh. Máy chủ chỉ trả những giá trị ĐANG CÓ trong tầm nhìn của người xem, kèm số bản ghi."""
from __future__ import annotations

from pydantic import BaseModel


class LuaChonLoc(BaseModel):
    id: int
    ten: str
    so: int = 0
