"""Lọc ở MÁY CHỦ cho hai danh sách của màn Lương (06/10/2026, Task 17 + 23 của kế hoạch "kỳ + bộ
lọc cho mọi danh sách").

* Bảng lương tháng: tìm tên / mã, Phòng / tổ, Chính thức / Thử việc — trước đây lọc trong trình
  duyệt. Một kỳ lương chỉ vài trăm dòng và mỗi dòng phải qua `_lines_out` (tên, tổ, BH…) nên lọc
  trên danh sách đã dựng, cùng một chỗ đếm số người từng tổ cho menu "Phòng / tổ".
* Tạm ứng: tab trạng thái + Loại + Tổ + Số tiền + kỳ ngày (Ngày tạo / Ngày ứng) + ô tìm, đếm tab và
  chia trang. Dữ liệu gốc là phiếu của MỘT kỳ lương trong phạm vi người xem (vài nghìn dòng là
  cùng) — tab "Chờ chi" / "Đã chi" phụ thuộc phiếu chi còn hiệu lực, thứ đã được tra một lượt cho cả
  kỳ, nên lọc trên danh sách kỳ thay vì dựng lại hai nhánh phiếu chi trong SQL.

Hàm thuần — không đụng DB, test được bằng đối tượng giả.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Iterable

from ..repositories.loc_danh_sach import trong_khoang_ngay
from ..repositories.tim_khong_dau import bo_dau

TAB_TAM_UNG = ("tat_ca", "cho_duyet", "cho_chi", "da_chi", "tu_choi")


def khop_tim(q: str | None, *phan: str | None) -> bool:
    """Tìm tương đối: không dấu, không hoa thường, ĐỦ mọi từ gõ là khớp (như `khopGanDung` của FE)."""
    tu = bo_dau(q).split()
    if not tu:
        return True
    chu = bo_dau(" ".join(p or "" for p in phan))
    return all(t in chu for t in tu)


def dem_theo_to(rows: Iterable[Any], *, ten_to: dict[int, str]) -> list[dict]:
    """`[{id, ten, so}]` — số dòng từng tổ, xếp theo tên. Dòng không có tổ thì không vào menu."""
    dem: dict[int, int] = {}
    for r in rows:
        did = getattr(r, "department_id", None)
        if did is not None:
            dem[int(did)] = dem.get(int(did), 0) + 1
    out = [{"id": d, "ten": ten_to.get(d) or f"Tổ #{d}", "so": n} for d, n in dem.items()]
    return sorted(out, key=lambda x: bo_dau(x["ten"]))


# --- Bảng lương tháng --------------------------------------------------------


def loc_bang_luong(lines: list, *, q: str | None = None, phong: int | None = None,
                   hd: str | None = None) -> tuple[list, list[dict]]:
    """Lọc dòng lương đã dựng (`LineOut`). Trả (dòng khớp, menu tổ đếm trên dòng khớp tìm + hợp
    đồng — chưa áp chính điều kiện tổ, để đổi tổ vẫn thấy số của tổ khác)."""
    def _hd(ln) -> bool:
        if hd == "tv":
            return bool(ln.is_probation)
        if hd == "ct":
            return not ln.is_probation
        return True

    truoc_to = [ln for ln in lines
                if _hd(ln) and khop_tim(q, ln.employee_name, ln.employee_code)]
    ten_to = {int(ln.department_id): (ln.department_name or "") for ln in lines
              if getattr(ln, "department_id", None) is not None}
    menu = dem_theo_to(truoc_to, ten_to=ten_to)
    if phong is not None:
        truoc_to = [ln for ln in truoc_to if getattr(ln, "department_id", None) == phong]
    return truoc_to, menu


# --- Tạm ứng ----------------------------------------------------------------


def tab_cua_tam_ung(status: str, co_phieu_chi: bool) -> str:
    """Tab trạng thái của một phiếu. "Chờ chi" = đã duyệt mà CHƯA có phiếu chi còn hiệu lực."""
    if status == "pending":
        return "cho_duyet"
    if status == "approved":
        return "da_chi" if co_phieu_chi else "cho_chi"
    if status == "paid":
        return "da_chi"
    return "tu_choi"   # rejected / cancelled


def loc_tam_ung(rows: list, *, emp_map: dict, phieu_chi: dict, tab: str = "tat_ca",
                q: str | None = None, loai: str | None = None, to: int | None = None,
                tien_tu: float | None = None, tien_den: float | None = None,
                tu_ngay: date | None = None, den_ngay: date | None = None, moc: str = "tao",
                ten_to: dict[int, str] | None = None) -> dict:
    """Lọc phiếu tạm ứng của một kỳ (đã cắt phạm vi). Trả:

    * `loc` — phiếu khớp mọi điều kiện VÀ thuộc tab đang đứng (thứ tự giữ nguyên);
    * `dem_theo_tab` — số phiếu mỗi tab sau mọi điều kiện (trừ tab);
    * `to_loc` — menu tổ đếm sau mọi điều kiện trừ tổ và tab;
    * `ids_tab` — id mọi phiếu của tab, BỎ QUA điều kiện (màn tỉa lựa chọn khi phiếu rời tab và
      nói "n phiếu đã chọn đang bị bộ lọc che").
    """
    def _to(a):
        e = emp_map.get(a.employee_id)
        return getattr(e, "department_id", None) if e is not None else None

    def _khop(a) -> bool:
        if loai and (a.kind or "tam_ung") != loai:
            return False
        tien = float(a.amount or 0)
        if tien_tu is not None and tien < tien_tu:
            return False
        if tien_den is not None and tien > tien_den:
            return False
        if tu_ngay is not None or den_ngay is not None:
            if moc == "ung":
                d = a.advance_date
                if (tu_ngay is not None and d < tu_ngay) or (den_ngay is not None and d > den_ngay):
                    return False
            elif not trong_khoang_ngay(a.created_at, tu_ngay, den_ngay):
                return False
        e = emp_map.get(a.employee_id)
        return khop_tim(q, getattr(e, "full_name", None), getattr(e, "code", None), a.code)

    tab_cua = {a.id: tab_cua_tam_ung(a.status, a.id in phieu_chi) for a in rows}
    truoc_to = [a for a in rows if _khop(a)]

    class _Dong:  # đối tượng mang department_id cho `dem_theo_to`
        __slots__ = ("department_id",)

        def __init__(self, d):
            self.department_id = d

    to_loc = dem_theo_to((_Dong(_to(a)) for a in truoc_to), ten_to=ten_to or {})
    khop = [a for a in truoc_to if to is None or _to(a) == to]
    dem = dict.fromkeys(TAB_TAM_UNG, 0)
    for a in khop:
        dem["tat_ca"] += 1
        dem[tab_cua[a.id]] += 1
    trong_tab = (lambda a: True) if tab == "tat_ca" else (lambda a: tab_cua[a.id] == tab)
    return {
        "loc": [a for a in khop if trong_tab(a)],
        "dem_theo_tab": dem,
        "to_loc": to_loc,
        "ids_tab": [a.id for a in rows if trong_tab(a)],
    }
