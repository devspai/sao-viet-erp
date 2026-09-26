"""Body / response của `/api/gia-cong-ngoai` — spec 2026-09-26."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class MangDiIn(BaseModel):
    version: int
    sl_gui: float | None = Field(default=None, gt=0)


class ChotIn(BaseModel):
    version: int
    sl_cuoi: float = Field(gt=0)
    noi_ve: str = Field(pattern="^(xuong|kho|khach)$")
    dich_cong_viec_id: int | None = None


class MoLaiIn(BaseModel):
    version: int


class TronGoiIn(BaseModel):
    nha_cung_cap_id: int = Field(gt=0)
    sl_dat: float = Field(gt=0)
    don_gia: float | None = Field(default=None, ge=0)
    xuong_cap_giay: bool = False


class HuyTronGoiIn(BaseModel):
    version: int
    ly_do: str = Field(min_length=3, max_length=500)


class XuatGiayIn(BaseModel):
    version: int


class XuatGiayOut(BaseModel):
    id: int
    ma: str
    trang_thai: str


class NhaGiaCongOut(BaseModel):
    id: int
    ten: str


class PhieuChiNganOut(BaseModel):
    id: int
    code: str


class ChangSauOut(BaseModel):
    id: int
    ten: str


class LichSuOut(BaseModel):
    luc: datetime | None = None
    ai: str = ""
    viec: str = ""
    chi_tiet: str = ""


class GiaCongNgoaiOut(BaseModel):
    id: int
    lsx_id: int
    lsx_ma: str
    kieu: str
    trang_thai: str
    nha_cung_cap_id: int
    nha_cung_cap_ten: str
    ten_viec: str
    don_vi: str | None = None
    don_gia: float | None = None          # None khi không có quyền xem tiền
    thanh_tien: float | None = None
    sl_dat: float | None = None
    xuong_cap_giay: bool = False
    don_vi_gui: str | None = None
    sl_cho_mang_di: float = 0
    co_buoc_truoc: bool = False
    mang_di_boi_ten: str | None = None
    mang_di_luc: datetime | None = None
    sl_gui: float | None = None
    sl_goi_y_chot: float | None = None
    chot_boi_ten: str | None = None
    chot_luc: datetime | None = None
    sl_cuoi: float | None = None
    noi_ve: str | None = None
    noi_ve_hop_le: list[str] = []
    chang_sau: list[ChangSauOut] = []
    huy_boi_ten: str | None = None
    huy_luc: datetime | None = None
    ly_do_huy: str | None = None
    phieu_chi: PhieuChiNganOut | None = None
    lich_su: list[LichSuOut] = []
    xuat_giay: XuatGiayOut | None = None
    version: int
