"""Giá trị đã giao của đơn bán, theo từng lượt khách đã nhận (13/10/2026).

Hóa đơn gắn một lượt; giá trị lượt là số GỢI Ý điền sẵn. Trần ghi chỉ là tổng đơn gồm VAT trừ
phần đã ghi — người dùng bỏ trần từng lượt cùng ngày.

Giá trị một dòng = line_total × (1 + VAT) × thực nhận / số đặt. Tính CỘNG DỒN theo thứ tự giao
rồi lấy hiệu: làm tròn rơi hết vào lượt sau, giao đủ thì tổng các lượt bằng đúng tổng đơn gồm
VAT (`_order_total_with_vat`).
"""
from __future__ import annotations

from datetime import datetime, timezone
from fractions import Fraction
from zoneinfo import ZoneInfo


def _ngay_vn(luc: datetime | None):
    if luc is None:
        return None
    if luc.tzinfo is None:
        luc = luc.replace(tzinfo=timezone.utc)
    return luc.astimezone(ZoneInfo("Asia/Bangkok")).date()


def _gia_tri_cong_don(dong: dict, da_nhan: dict[int, int]) -> int:
    tong = Fraction(0)
    for lid, sl in da_nhan.items():
        ln = dong.get(lid)
        dat = int(ln.qty or 0) if ln is not None else 0
        if dat <= 0:
            continue
        tong += Fraction(
            int(ln.line_total or 0) * (100 + int(ln.vat_pct_estimate or 0)) * min(int(sl), dat), dat
        )
    return int(tong // 100)


def gia_tri_luot_giao(order, trips) -> list[dict]:
    """[{trip_id, ma, ngay_giao, gia_tri}] theo thứ tự `trips` (đã xếp theo lúc giao xong)."""
    dong = {ln.id: ln for ln in order.lines}
    da_nhan: dict[int, int] = {}
    truoc = 0
    ra: list[dict] = []
    for t in trips:
        for tl in t.lines or []:
            da_nhan[tl.order_line_id] = da_nhan.get(tl.order_line_id, 0) + int(tl.qty_giao or 0)
        sau = _gia_tri_cong_don(dong, da_nhan)
        ma = t.request.code if t.request is not None else f"#{t.id}"
        ra.append({
            "trip_id": t.id,
            "ma": ma if int(t.lan_thu or 1) <= 1 else f"{ma} lần {t.lan_thu}",
            "ngay_giao": _ngay_vn(t.thoi_gian_ket_thuc),
            "gia_tri": sau - truoc,
        })
        truoc = sau
    return ra
