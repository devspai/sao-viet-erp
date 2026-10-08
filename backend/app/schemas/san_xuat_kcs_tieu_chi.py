"""Pydantic schemas — Danh mục HẠNG MỤC KIỂM KCS (mg `0285`: thuộc ĐÚNG MỘT công đoạn).

Từ mg `0381` (08/10/2026) một tiêu chí chỉ là MỘT câu chữ; `thu_tu` do máy chủ gán. Màn hai ngăn
(công đoạn | tiêu chí) đọc qua một hình dạng gom nhóm (`KcsKhaiBaoOut`), kéo thả qua `KcsSapXepIn`,
chép sang công đoạn khác qua `KcsChepIn`.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SanXuatKcsTieuChiIn(BaseModel):
    # `ma` sinh ngầm ở service (tiền tố `KM`) — người khai chỉ gõ câu chữ. `thu_tu` KHÔNG nhận:
    # thêm = nối cuối, đổi thứ tự đi `PUT /sap-xep`.
    ma: str | None = None
    cong_doan_id: int
    ten: str = Field(min_length=1, max_length=200)


class SanXuatKcsTieuChiRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ma: str
    cong_doan_id: int
    ten: str
    thu_tu: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SanXuatKcsTieuChiListOut(BaseModel):
    items: list[SanXuatKcsTieuChiRow]
    total: int
    page: int
    size: int


# --- Hình dạng ĐỌC cho màn hai ngăn -----------------------------------------------------------

class KcsKhaiBaoCongDoanOut(BaseModel):
    """Một CÔNG ĐOẠN kèm trọn danh sách tiêu chí của nó (`[]` = chưa khai)."""
    cong_doan_id: int
    ma: str
    ten: str
    nhom: str
    hang_muc: list[SanXuatKcsTieuChiRow]


class KcsKhaiBaoGiaiDoanOut(BaseModel):
    """Một GIAI ĐOẠN (`cong_doan.nhom`, "" = chưa khai nhóm) — nhóm của ngăn trái."""
    nhom: str
    cong_doan: list[KcsKhaiBaoCongDoanOut]


class KcsKhaiBaoOut(BaseModel):
    giai_doan: list[KcsKhaiBaoGiaiDoanOut]


# --- Kéo thả + chép ---------------------------------------------------------------------------

class KcsSapXepIn(BaseModel):
    """Thứ tự MỚI của TOÀN BỘ tiêu chí một công đoạn — lệch tập id (thiếu/thừa/lặp) ⇒ 422."""
    cong_doan_id: int
    ids: list[int]


class KcsSapXepOut(BaseModel):
    cong_doan_id: int
    hang_muc: list[SanXuatKcsTieuChiRow]


class KcsChepIn(BaseModel):
    """Chép các CÂU CHỮ sang nhiều công đoạn đích; câu đích đã có thì bỏ qua."""
    den_cong_doan_ids: list[int] = Field(min_length=1)
    tieu_chi: list[str] = Field(min_length=1)


class KcsChepDichOut(BaseModel):
    cong_doan_id: int
    da_chep: int
    bo_qua: int


class KcsChepOut(BaseModel):
    da_chep: int
    bo_qua: int
    theo_dich: list[KcsChepDichOut]
