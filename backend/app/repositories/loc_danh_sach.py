"""Mảnh lọc dùng chung cho ba danh sách Kinh doanh — Tính giá thành, Báo giá, Đơn hàng bán.

Dải kỳ trên đầu bảng (06/10/2026, phương án A "khuôn Kế toán"): người dùng chọn một khoảng NGÀY
theo giờ Việt Nam. Cột mốc kiểu DateTime lưu UTC ⇒ đổi đầu/cuối ngày VN sang mốc tuyệt đối; cột
kiểu Date (hạn hiệu lực, ngày giao hẹn) so thẳng ngày.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

VN_TZ = timezone(timedelta(hours=7))


def hom_nay_vn() -> date:
    return datetime.now(timezone.utc).astimezone(VN_TZ).date()


def _dau_ngay(d: date) -> datetime:
    """00:00 giờ VN của ngày `d`, quy về UTC: SQLite (bộ test) cất mốc giờ dạng chuỗi không múi,
    ghép mốc +07:00 vào là so lệch 7 tiếng; Postgres thì UTC hay +07:00 đều như nhau."""
    return datetime(d.year, d.month, d.day, tzinfo=VN_TZ).astimezone(timezone.utc)


def trong_khoang_ngay(luc: datetime | None, tu: date | None, den: date | None) -> bool:
    """Bản Python của `dk_khoang_ngay` cho danh sách đã nạp sẵn vào bộ nhớ (vd danh bạ khách —
    lọc sau khi cắt phạm vi). Mốc không múi giờ coi là UTC (SQLite trả về như vậy)."""
    if tu is None and den is None:
        return True
    if luc is None:
        return False
    if luc.tzinfo is None:
        luc = luc.replace(tzinfo=timezone.utc)
    ngay = luc.astimezone(VN_TZ).date()
    return (tu is None or ngay >= tu) and (den is None or ngay <= den)


def dk_khoang_ngay(col, tu: date | None, den: date | None, *, cot_ngay: bool = False) -> list:
    """Điều kiện SQL cho "cột rơi vào [tu, den]" (cả hai đầu tính trọn ngày). Đầu nào bỏ trống thì
    không chặn đầu đó. `cot_ngay=True` khi cột là Date chứ không phải mốc giờ."""
    dk: list = []
    if cot_ngay:
        if tu is not None:
            dk.append(col >= tu)
        if den is not None:
            dk.append(col <= den)
        return dk
    if tu is not None:
        dk.append(col >= _dau_ngay(tu))
    if den is not None:
        dk.append(col < _dau_ngay(den + timedelta(days=1)))
    return dk
