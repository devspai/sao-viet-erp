"""Pydantic schemas — Báo cáo thu chi theo mục × tháng."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class CotKy(BaseModel):
    khoa: str
    nhan: str


class DongThuChi(BaseModel):
    ben: str               # "thu" | "chi"
    khoa: str              # id mục ("0" = chưa phân loại) hoặc tên người (hạ chữ)
    ten: str
    chua: bool             # dòng có phiếu chưa phân loại
    muc_id: int | None = None
    o: dict[str, int]      # tiền từng cột kỳ
    cong: int


class TongNhom(BaseModel):
    o: dict[str, int]
    cong: int
    so_dong: int


class ChenhLech(BaseModel):
    o: dict[str, int]
    cong: int


class BaoCaoThuChiOut(BaseModel):
    tu_ngay: date
    den_ngay: date
    theo: str
    cot: list[CotKy]
    dong: list[DongThuChi]
    nhom: dict[str, TongNhom]
    chenh_lech: ChenhLech
    the_loc: dict[str, int]
    total: int
    page: int
    size: int


class PhieuThuChi(BaseModel):
    loai: str
    id: int
    so: str
    ngay: date
    tien: int
    nguoi: str
    ly_do: str
    hinh_thuc: str
    muc_id: int | None = None
    muc_ten: str | None = None


class PhieuCuaDongOut(BaseModel):
    cot: list[CotKy]
    o: dict[str, int]
    cong: int
    items: list[PhieuThuChi]
    tong: int


class ChuyenMucIn(BaseModel):
    phieu_chi_ids: list[int] = Field(default_factory=list)
    phieu_thu_ids: list[int] = Field(default_factory=list)
    muc_id: int


class ChuyenMucOut(BaseModel):
    so_phieu: int
