"""Nhà gia công GIAO THẲNG cho khách (spec §4 bước 5)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...repositories.order_repo import OrderRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ..thanh_pham_khai_bao import cum_ban


def dong_don_dung_rieng(db: Session, lsx_id: int) -> bool:
    """Dòng đơn của lệnh đứng RIÊNG một cụm bán (cụm chỉ có đúng dòng đó). Cụm nhiều dòng (bìa +
    ruột một cuốn) thì một lệnh không giao thẳng thay cả cụm được."""
    lsx = SanXuatRepository(db).lsx(lsx_id)
    if lsx is None or not lsx.order_line_id:
        return False
    order = OrderRepository(db).get_by_id(lsx.order_id)
    if order is None:
        return False
    for cum in cum_ban(order):
        if any(ln.id == lsx.order_line_id for ln in cum.dong):
            return len(cum.dong) == 1
    return False
