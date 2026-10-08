"""MUA CHO — món yêu cầu / dòng đơn mua này mua cho lệnh nào, hay cho tồn kho (08/10/2026).

Cột "Mua cho" có mặt ở mọi màn hiện món, yêu cầu, đơn mua, yêu cầu nhập kho, hàng sắp về. Nguồn
duy nhất: `yeu_cau_mua_nguon_lenh` (lập lúc bấm Đề nghị mua ở Kế hoạch vật tư) khớp với DÒNG yêu
cầu theo (hang_loai, hang_id, khổ). Liên kết lập trước mg 0378 có khổ 0 · 0 ⇒ khớp theo mặt hàng.

Nạp theo LÔ: ba câu SQL bất kể bao nhiêu dòng — gọi một lần cho cả trang danh sách, đừng gọi trong
vòng lặp (canh bởi tests/test_mua_hang_khong_n_cong_1.py).
"""
from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select

from ..models.purchase import (
    LOAI_MUA_CHO_LSX,
    LOAI_MUA_THEO_YEU_CAU,
    LOAI_MUA_TON,
    DepartmentPurchaseRequest,
    DepartmentPurchaseRequestLine,
    YeuCauMuaNguonLenh,
)

# Thứ tự hiện trong ô: lệnh trước, rồi tồn kho, rồi theo yêu cầu.
_THU_TU = (LOAI_MUA_CHO_LSX, LOAI_MUA_TON, LOAI_MUA_THEO_YEU_CAU)


def nap_mua_cho(db, dong_yc_ids: Iterable[int | None]) -> dict[int, dict]:
    """`{id dòng yêu cầu: {"loai_mua", "yeu_cau_id", "yeu_cau_ma", "lenh": [...]}}`.

    Mỗi phần tử `lenh`: `{"loai": "lsx" | "bai", "id", "ma", "so_luong"}` — `so_luong` là số đề
    nghị cho lệnh đó (đơn vị gốc), None với liên kết cũ."""
    ids = sorted({int(i) for i in dong_yc_ids if i})
    if not ids:
        return {}
    dong = db.execute(
        select(
            DepartmentPurchaseRequestLine.id,
            DepartmentPurchaseRequestLine.department_request_id,
            DepartmentPurchaseRequestLine.hang_loai,
            DepartmentPurchaseRequestLine.hang_id,
            DepartmentPurchaseRequestLine.kho_rong,
            DepartmentPurchaseRequestLine.kho_dai,
            DepartmentPurchaseRequest.code,
            DepartmentPurchaseRequest.loai_mua,
        )
        .join(
            DepartmentPurchaseRequest,
            DepartmentPurchaseRequest.id == DepartmentPurchaseRequestLine.department_request_id,
        )
        .where(DepartmentPurchaseRequestLine.id.in_(ids))
    ).all()
    yc_ids = sorted({d.department_request_id for d in dong})
    nguon: dict[int, list] = {}
    if yc_ids:
        for n in db.execute(
            select(YeuCauMuaNguonLenh)
            .where(YeuCauMuaNguonLenh.department_request_id.in_(yc_ids))
            .order_by(YeuCauMuaNguonLenh.id)
        ).scalars():
            nguon.setdefault(n.department_request_id, []).append(n)
    lsx_ids = {n.lsx_id for ds in nguon.values() for n in ds if n.lsx_id}
    bai_ids = {n.bai_ghep_id for ds in nguon.values() for n in ds if n.bai_ghep_id}
    ten: dict[tuple, str] = {}
    if lsx_ids or bai_ids:
        from ..repositories.purchase_repo import DepartmentPurchaseRequestRepository

        ten = DepartmentPurchaseRequestRepository(db).ma_chu_the(lsx_ids, bai_ids)

    ra: dict[int, dict] = {}
    for d in dong:
        ds = nguon.get(d.department_request_id, [])
        cung_hang = [n for n in ds if (n.hang_loai, n.hang_id) == (d.hang_loai, d.hang_id)]
        kho = (int(d.kho_rong or 0), int(d.kho_dai or 0))
        khop = [n for n in cung_hang if (int(n.kho_rong or 0), int(n.kho_dai or 0)) == kho]
        if not khop:
            khop = [n for n in cung_hang if not n.kho_rong and not n.kho_dai]
        lenh = []
        for n in khop:
            k = ("lsx", n.lsx_id) if n.lsx_id else ("bai", n.bai_ghep_id)
            lenh.append({
                "loai": k[0],
                "id": k[1],
                "ma": ten.get(k, ""),
                "so_luong": float(n.so_luong) if n.so_luong is not None else None,
            })
        ra[d.id] = {
            "loai_mua": d.loai_mua,
            "yeu_cau_id": d.department_request_id,
            "yeu_cau_ma": d.code,
            "lenh": lenh,
        }
    return ra


def gop_mua_cho(muc: Iterable[dict | None]) -> tuple[list[str], list[dict]]:
    """Gộp "mua cho" của nhiều dòng (cả yêu cầu, cả đơn): các loại có mặt theo thứ tự hiển thị và
    lệnh gộp theo (loai, id), cộng số — một phần thiếu số thì cả lệnh thành None (không đoán)."""
    loai: set[str] = set()
    gop: dict[tuple, dict] = {}
    for m in muc:
        if not m:
            continue
        loai.add(m["loai_mua"])
        for l in m["lenh"]:
            k = (l["loai"], l["id"])
            if k not in gop:
                gop[k] = dict(l)
                continue
            cu = gop[k]["so_luong"]
            gop[k]["so_luong"] = (
                None if cu is None or l["so_luong"] is None else cu + l["so_luong"]
            )
    return [x for x in _THU_TU if x in loai], list(gop.values())


def mua_cho_theo_dot(db, dot_ids: Iterable[int | None]) -> dict[int, dict[tuple, dict]]:
    """Yêu cầu nhập kho lập từ đợt giao: `{dot_id: {(hang_loai, hang_id, kho_rong, kho_dai):
    {"loai_mua_cac", "lenh"}}}` — gộp mọi dòng đơn cùng mặt hàng + khổ. 4 câu SQL cả trang."""
    from ..repositories.purchase_repo import PurchaseRequestRepository

    rows = PurchaseRequestRepository(db).dong_don_theo_dot(dot_ids)
    if not rows:
        return {}
    nap = nap_mua_cho(db, [r[5] for r in rows])
    gom: dict[int, dict[tuple, list]] = {}
    for dot, hl, hid, kr, kd, dyc in rows:
        k = (hl, hid, int(kr or 0), int(kd or 0))
        gom.setdefault(dot, {}).setdefault(k, []).append(nap.get(dyc) if dyc else None)
    ra: dict[int, dict[tuple, dict]] = {}
    for dot, theo in gom.items():
        for k, muc in theo.items():
            loai, lenh = gop_mua_cho(muc)
            ra.setdefault(dot, {})[k] = {"loai_mua_cac": loai, "lenh": lenh}
    return ra


def mua_cho_cua_dong(theo_hang: dict[tuple, dict] | None, hang_loai, hang_id, kho_rong,
                     kho_dai) -> dict:
    """Ô "Mua cho" của MỘT dòng yêu cầu nhập: khớp mặt hàng + khổ; không khớp khổ (kho đổi khổ khi
    nhập) thì gộp mọi khổ cùng mặt hàng."""
    if not theo_hang:
        return {"loai_mua_cac": [], "lenh": []}
    k = (hang_loai, hang_id, int(kho_rong or 0), int(kho_dai or 0))
    if k in theo_hang:
        return theo_hang[k]
    cung = [v for kk, v in theo_hang.items() if kk[:2] == k[:2]]
    loai = [x for x in _THU_TU if any(x in v["loai_mua_cac"] for v in cung)]
    _, lenh = gop_mua_cho({"loai_mua": "", "lenh": v["lenh"]} for v in cung)
    return {"loai_mua_cac": loai, "lenh": lenh}


def mua_cho_theo_dong_don(db, dong_don_ids: Iterable[int | None]) -> dict[int, dict]:
    """`{id dòng ĐƠN mua: mục "mua cho" của dòng yêu cầu nó lập từ}` — 4 câu SQL cả màn."""
    from ..repositories.purchase_repo import PurchaseRequestRepository

    noi = PurchaseRequestRepository(db).dong_yc_cua_dong_don(dong_don_ids)
    nap = nap_mua_cho(db, noi.values())
    return {pl: nap[dyc] for pl, dyc in noi.items() if dyc in nap}
