"""Màn "Theo dõi sản xuất" — Theo máy, Theo lệnh và dải bất thường (làm gọn 05/10/2026).

Cả ba đọc MỘT lượt nạp (`_nap`): tập lệnh = `_ids_trong_pham_vi` (đã phát hành, đúng phạm vi token)
→ `_bo_lenh_da_rung` (luật 28/09) → MỘT `boi_canh.nap()` → `tien_do.du_kien_xong` +
`trang_thai.co_canh_bao(den_vat_tu=None)` cho từng lệnh → trạng thái máy cho máy còn dùng hoặc còn
việc. Không `can_doi()`: cờ thiếu vật tư không vào màn này. Số câu SQL hằng theo số lệnh.

Dải bất thường đếm trên TOÀN tập còn sống, TRƯỚC ô tìm/khách/máy và trước chính mục đang chọn — gõ
tìm xong không được làm người ta tưởng sự cố đã hết. Vì vậy lượt nạp KHÔNG lọc theo ô tìm; ô tìm,
khách, máy chạy thêm MỘT câu `select(Lsx.id)` (`bang_theo_doi._loc_ban`, cùng phép với Hồ sơ lệnh)
rồi giao với tập đã nạp.

Trạng thái máy: bốn trạng thái dẫn xuất của `may_trang_thai` (hỏng, bảo trì, chặn xếp lệnh, có
phiếu sửa) — BỎ nhánh `dang_chay` của `trang_thai_may` vì nhánh đó đọc KẾ HOẠCH Xếp lịch, không
phải máy có chạy thật. Máy có chạy hay không đọc từ công việc `running`/`paused` đã nạp.

Không một số tiền nào.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from ...models.may_thiet_bi import MayThietBi
from ...models.san_xuat import BUOC_MAY, BUOC_THUE_NGOAI, CV_HOAN_THANH, SanXuatCongViec
from .. import may_trang_thai
from ..gio_xuong import thuc_te_hien_thi
from . import boi_canh, danh_sach, tien_do, trang_thai
from .bang_theo_doi import BoLoc, _bo_lenh_da_rung, _ids_trong_pham_vi, _may_danh_muc
from .boi_canh import BoiCanh

# Sáu mục của dải bất thường — thứ tự = thứ tự trên màn; giá trị đi thẳng ra `?bat_thuong=`.
CO_LENH = (
    trang_thai.CO_TRE_HAN, trang_thai.CO_SU_CO, trang_thai.CO_TAM_DUNG,
    trang_thai.CO_KCS_KHONG_DAT,
)
BT_MAY_HONG = "may_hong"
BT_CHUA_MAY = "chua_may"
BAT_THUONG = CO_LENH + (BT_MAY_HONG, BT_CHUA_MAY)

# Góc Theo lệnh không phân trang (tập còn sống); quá ngưỡng thì cắt và FE nói rõ "Hiện 200 trên N".
GIOI_HAN_THEO_LENH = 200


@dataclass
class _Nap:
    """Kết quả MỘT lượt nạp — dùng chung cho Theo máy, Theo lệnh và dải bất thường."""

    ids: list[int]
    bc: BoiCanh
    xong: dict[int, datetime | None]
    co: dict[int, list[str]]
    # Công việc CHƯA xong của tập đã nạp, khử trùng theo id (một ca in ghép phục vụ nhiều lệnh).
    cv_song: dict[int, SanXuatCongViec]
    # cv.id → các lệnh nó phục vụ, sắp theo mã.
    lenh_cua_cv: dict[int, list[int]]
    may: dict[int, MayThietBi]
    # Chỉ máy CÓ chuyện: may_id → một trong may_dung / bao_tri / khoa / co_phieu_sua.
    tt_may: dict[int, str]


def _la_gia_cong(cv: SanXuatCongViec) -> bool:
    return cv.loai_buoc == BUOC_THUE_NGOAI or cv.gia_cong_ngoai_id is not None


def _chua_may(cv: SanXuatCongViec) -> bool:
    return cv.loai_buoc == BUOC_MAY and cv.may_id is None and not _la_gia_cong(cv)


def _trang_thai_may_that(db: Session, may_ids: list[int]) -> dict[int, str]:
    """Trạng thái máy KHÔNG đọc kế hoạch: bỏ nhánh `dang_chay` của `trang_thai_may`.

    `trang_thai_may` chỉ điền "có phiếu sửa" cho máy không có chuyện gì khác, nên máy nó coi là
    "đang chạy theo kế hoạch" bị bỏ qua phần phiếu sửa. Gạt nhánh đó đi thì phải điền lại phiếu sửa
    cho chính những máy ấy — thêm MỘT câu, không theo số máy."""
    tt = {
        m: v["trang_thai"]
        for m, v in may_trang_thai.trang_thai_may(db, may_ids).items()
        if v["trang_thai"] != may_trang_thai.TT_DANG_CHAY
    }
    con_lai = [m for m in may_ids if m not in tt]
    for m in may_trang_thai.phieu_sua_dang_mo(db, con_lai):
        tt[m] = may_trang_thai.TT_CO_PHIEU_SUA
    return tt


def _nap(db: Session, sale_ids: set[int] | None, bay_gio: datetime) -> _Nap:
    ids = _bo_lenh_da_rung(db, _ids_trong_pham_vi(db, sale_ids), bay_gio=bay_gio)
    bc = boi_canh.nap(db, ids)
    xong = {i: tien_do.du_kien_xong(bc, i, bay_gio) for i in ids}
    co = {i: trang_thai.co_canh_bao(bc, i, bay_gio, xong=xong[i]) for i in ids}

    cv_song: dict[int, SanXuatCongViec] = {}
    lenh_cua_cv: dict[int, list[int]] = {}
    for i in sorted(ids, key=lambda i: (bc.lenh[i].ma or "", i)):
        for cv in bc.cong_viec_du(i):
            if cv.trang_thai == CV_HOAN_THANH:
                continue
            cv_song[cv.id] = cv
            ds = lenh_cua_cv.setdefault(cv.id, [])
            if i not in ds:
                ds.append(i)

    may = _may_danh_muc(db)
    co_viec = {cv.may_id for cv in cv_song.values() if cv.may_id is not None}
    may_xet = [m for m, mm in may.items() if mm.active or m in co_viec]
    return _Nap(
        ids=ids, bc=bc, xong=xong, co=co, cv_song=cv_song, lenh_cua_cv=lenh_cua_cv,
        may=may, tt_may=_trang_thai_may_that(db, may_xet),
    )


def _lenh_khop_loc(
    db: Session, sale_ids: set[int] | None, n: _Nap, *,
    q: str | None, khach_hang_id: int | None, may_id: int | None,
) -> set[int] | None:
    """Tập lệnh khớp ô tìm/khách/máy — `None` khi không ô nào được điền (không lọc)."""
    co_q = bool(q and q.strip())
    if not co_q and khach_hang_id is None and may_id is None:
        return None
    loc = BoLoc(q=q if co_q else None, khach_hang_id=khach_hang_id, may_id=may_id)
    return set(_ids_trong_pham_vi(db, sale_ids, loc=loc)) & set(n.ids)


def _lenh_bat_thuong(n: _Nap, khoa: str) -> set[int]:
    """Lệnh dính mục bất thường `khoa`. Hai mục máy quy về lệnh có BƯỚC CHƯA XONG dính máy đó."""
    if khoa in CO_LENH:
        return {i for i in n.ids if khoa in n.co[i]}
    if khoa == BT_MAY_HONG:
        hong = {m for m, tt in n.tt_may.items() if tt == may_trang_thai.TT_MAY_DUNG}
        chon = (cv for cv in n.cv_song.values() if cv.may_id in hong)
    else:
        chon = (cv for cv in n.cv_song.values() if _chua_may(cv))
    return {i for cv in chon for i in n.lenh_cua_cv[cv.id]}


def dem_bat_thuong(n: _Nap) -> dict[str, int]:
    """Số trên dải bất thường: bốn cờ đếm LỆNH, "máy hỏng" đếm MÁY, "bước chưa có máy" đếm BƯỚC."""
    dem = {k: len(_lenh_bat_thuong(n, k)) for k in CO_LENH}
    dem[BT_MAY_HONG] = sum(1 for tt in n.tt_may.values() if tt == may_trang_thai.TT_MAY_DUNG)
    dem[BT_CHUA_MAY] = sum(1 for cv in n.cv_song.values() if _chua_may(cv))
    return dem


def _khoa_sap_theo_lenh(n: _Nap, lsx_id: int) -> tuple:
    """Số cờ giảm dần → GẤP trước → hạn SX tăng (chưa có hạn xuống cuối) → mã."""
    lsx = n.bc.lenh[lsx_id]
    han = lsx.han_hoan_thanh_sx
    return (
        -len(n.co[lsx_id]), 0 if lsx.is_rush else 1,
        0 if han is not None else 1, han or date.max, lsx.ma or "", lsx_id,
    )


def _dong_lenh(n: _Nap, lsx_id: int) -> dict:
    bc = n.bc
    lsx = bc.lenh[lsx_id]
    don = bc.don.get(lsx.order_id)
    khach = bc.khach.get(don.customer_id) if don is not None and don.customer_id else None
    cv = danh_sach.buoc_hien_tai(bc, lsx_id)
    khau, khau_ct = trang_thai.khau(bc, lsx_id)
    xong = n.xong[lsx_id]
    tre_ngay = None
    if trang_thai.CO_TRE_HAN in n.co[lsx_id] and xong is not None and lsx.han_hoan_thanh_sx:
        tre_ngay = (xong.astimezone(tien_do.BUSINESS_TZ).date() - lsx.han_hoan_thanh_sx).days
    return {
        "lsx_id": lsx.id,
        "ma": lsx.ma,
        "ten": lsx.ten,
        "is_rush": bool(lsx.is_rush),
        "so_luong_dat": lsx.so_luong_dat,
        "don_vi_tinh": lsx.don_vi_tinh,
        "khach_hang": khach.name if khach is not None else None,
        "chang": danh_sach.chang(bc, lsx_id, cv),
        "buoc_hien_tai": cv.ten_cong_doan if cv is not None else None,
        "khau": khau,
        "khau_chi_tiet": khau_ct,
        "han_hoan_thanh_sx": lsx.han_hoan_thanh_sx,
        "du_kien_xong": thuc_te_hien_thi(xong),
        "canh_bao": list(n.co[lsx_id]),
        "tre_ngay": tre_ngay,
    }


def theo_lenh(
    db: Session, *, sale_ids: set[int] | None,
    q: str | None = None, khach_hang_id: int | None = None, may_id: int | None = None,
    bat_thuong: str | None = None, bay_gio: datetime | None = None,
) -> dict:
    """`{items, total, bat_thuong}` — mỗi lệnh còn sống một dòng, cắt ở `GIOI_HAN_THEO_LENH`."""
    bay_gio = bay_gio or datetime.now(timezone.utc)
    n = _nap(db, sale_ids, bay_gio)
    ids = list(n.ids)
    khop = _lenh_khop_loc(db, sale_ids, n, q=q, khach_hang_id=khach_hang_id, may_id=may_id)
    if khop is not None:
        ids = [i for i in ids if i in khop]
    if bat_thuong:
        chon = _lenh_bat_thuong(n, bat_thuong)
        ids = [i for i in ids if i in chon]
    ids.sort(key=lambda i: _khoa_sap_theo_lenh(n, i))
    return {
        "items": [_dong_lenh(n, i) for i in ids[:GIOI_HAN_THEO_LENH]],
        "total": len(ids),
        "bat_thuong": dem_bat_thuong(n),
    }
