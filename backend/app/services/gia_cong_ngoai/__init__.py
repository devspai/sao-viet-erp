"""Gia công ngoài — service (spec docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md).

Một cửa ghi DUY NHẤT cho lần gia công: `mot_phan.mang_di`, `chot.chot` / `chot.mo_lai`,
`tron_goi.*`. Bàn tổ / KCS / Xếp lịch chỉ nhìn, không ghi.
"""
from __future__ import annotations

TT_CHO_MANG_DI = "cho_mang_di"
TT_DANG_O_NGOAI = "dang_o_ngoai"
TT_DANG_GIA_CONG = "dang_gia_cong"   # trọn gói, chưa chốt
TT_DA_XONG = "da_xong"
TT_DA_HUY = "da_huy"

# Câu chặn chung cho mọi cửa xưởng (bàn tổ, ghi mẻ, KCS) gặp công việc gia công ngoài.
CHAN_XUONG = (
    "Công việc Gia công ngoài — ghi nhận ở khối Gia công ngoài trên lệnh (Đã mang đi / Chốt số), "
    "không làm ở bàn tổ hay KCS."
)


class GiaCongXungDot(ValueError):
    """Lần gia công vừa bị người khác đổi (lệch `version`) — router dịch 409."""


def trang_thai(gcn) -> str:
    """Trạng thái DẪN XUẤT từ các mốc — không lưu cột (spec §2)."""
    if gcn.huy_luc is not None:
        return TT_DA_HUY
    if gcn.chot_luc is not None:
        return TT_DA_XONG
    if gcn.kieu == "tron_goi":
        return TT_DANG_GIA_CONG
    if gcn.mang_di_luc is not None:
        return TT_DANG_O_NGOAI
    return TT_CHO_MANG_DI


def kiem_version(gcn, expected: int | None) -> None:
    if expected is not None and int(expected) != int(gcn.version):
        raise GiaCongXungDot("Lần gia công vừa được người khác cập nhật — tải lại rồi làm tiếp.")


def la_gia_cong(cv) -> bool:
    return getattr(cv, "gia_cong_ngoai_id", None) is not None
