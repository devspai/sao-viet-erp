"""Schema màn "Theo dõi sản xuất" (làm gọn 05/10/2026) — ô lọc, Theo máy, Theo lệnh.

Không một số tiền nào. Mốc giờ trả ra là giờ xưởng không nhãn múi (`lich_hien_thi` /
`thuc_te_hien_thi`), FE đọc thẳng thành phần ngày giờ.
"""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from .lenh_san_xuat import LenhSxChang


class BoLocMucOut(BaseModel):
    """MỘT ô chọn. `id` là CHUỖI cho mọi nhóm (FE so khớp một kiểu); FastAPI tự ép về `int` ở
    tham số khai kiểu số."""

    id: str
    ten: str | None = None


class BoLocMayMucOut(BoLocMucOut):
    """Ô chọn MÁY: `ngung_dung` = `may_thiet_bi.active=False`; `co_viec` = còn ít nhất một công
    việc chưa xong trong phạm vi người gọi — GỢI Ý hiển thị, không phải bộ lọc."""

    ngung_dung: bool = False
    co_viec: bool = False


class BoLocOut(BaseModel):
    may: list[BoLocMayMucOut] = []
    khach_hang: list[BoLocMucOut] = []


class LsxThamChieuOut(BaseModel):
    """MỘT lệnh mà một công việc đang gánh — `ma` để đọc, `lsx_id` để mở hồ sơ."""

    lsx_id: int
    ma: str
    ten: str | None = None
    is_rush: bool = False


# --- Làm gọn 05/10/2026: dải bất thường + góc Theo lệnh -------------------------------------------
class DemBatThuongOut(BaseModel):
    """Số trên dải bất thường — đếm trên TOÀN tập còn sống trong phạm vi, trước ô tìm/khách/máy."""

    tre_han: int = 0
    su_co: int = 0
    tam_dung: int = 0
    kcs_khong_dat: int = 0
    may_hong: int = 0
    chua_may: int = 0


class TheoLenhDongOut(BaseModel):
    """MỘT lệnh còn sống. `canh_bao` ⊆ `tre_han` / `su_co` / `tam_dung` / `kcs_khong_dat`.
    `du_kien_xong` là giờ xưởng không nhãn múi; `tre_ngay` chỉ có khi `tre_han`."""

    lsx_id: int
    ma: str
    ten: str | None = None
    is_rush: bool = False
    so_luong_dat: int
    don_vi_tinh: str | None = None
    khach_hang: str | None = None
    chang: list[LenhSxChang] = []
    buoc_hien_tai: str | None = None
    khau: str
    khau_chi_tiet: str | None = None
    han_hoan_thanh_sx: date | None = None
    du_kien_xong: datetime | None = None
    canh_bao: list[str] = []
    tre_ngay: int | None = None


class TheoLenhOut(BaseModel):
    items: list[TheoLenhDongOut] = []
    total: int = 0
    bat_thuong: DemBatThuongOut


# --- Góc Theo máy (làm gọn 05/10/2026, đặc tả 3.3) ------------------------------------------------
class TdsxViecOut(BaseModel):
    """MỘT công việc trên dòng máy. `bai_ma` có khi là việc GHÉP; `lsx` là mọi lệnh nó phục vụ —
    từ hai lệnh trở lên giao diện bắt chọn, không đoán lấy cái đầu."""

    cong_viec_id: int
    ten_buoc: str | None = None
    trang_thai: str
    bai_ma: str | None = None
    lsx: list[LsxThamChieuOut] = []


class TdsxSanLuongDonViOut(BaseModel):
    don_vi: str | None = None
    tot: float


class TdsxSanLuongOut(BaseModel):
    """`tot = None` khi mẻ ghi lẫn đơn vị — khi đó chỉ có `theo_don_vi`, không vẽ thanh."""

    tot: float | None = None
    ke_hoach: float | None = None
    don_vi: str | None = None
    theo_don_vi: list[TdsxSanLuongDonViOut] = []
    ca_bai: bool = False


class TdsxMayDongOut(BaseModel):
    """MỘT dòng của bảng Theo máy: một máy, một nhà gia công, hoặc một bước chưa có máy.
    `khoa` duy nhất trong cả bảng (`may:<id>`, `ncc:<tên>`, `cv:<id>`)."""

    khoa: str
    may_id: int | None = None
    ten: str | None = None
    ngung_dung: bool = False
    tinh_trang: str
    nhan_tinh_trang: str
    dang_chay: TdsxViecOut | None = None
    dang_chay_them: int = 0
    san_luong: TdsxSanLuongOut | None = None
    ke_hoach_xong: datetime | None = None
    ke_hoach_bat_dau: datetime | None = None
    ke_tiep: list[TdsxViecOut] = []
    ke_tiep_them: int = 0


class TdsxNhomMayOut(BaseModel):
    """`loai` ∈ `chua_may` / `may` / `may_da_xoa` / `gia_cong`; nhóm `may` mang `ten = loai_may`."""

    loai: str
    ten: str
    dong: list[TdsxMayDongOut] = []


class TheoMayOut(BaseModel):
    nhom: list[TdsxNhomMayOut] = []
    may_trong: list[TdsxMayDongOut] = []
    bat_thuong: DemBatThuongOut
