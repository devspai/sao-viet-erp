"""LƯỚI Kế hoạch vật tư — mỗi dòng là MỘT Ô (lệnh/bài × mặt hàng), spec
`docs/spec-ke-hoach-vat-tu-mot-o-mot-phieu.md` §5 (07/10/2026).

Không tính thêm con số nào: ghép ba nguồn đã có thành dòng người dùng đọc được —

* bảng cân đối (`KeHoachVatTuService.can_doi`) cho số cần, đã xuất, phần thiếu theo bảng, từng bước;
* giữ chỗ (`GiuChoService.giu_theo_chu_the_hang`) cho phần đã giữ trong kho / trên đơn đang về;
* mạch phiếu (`KeHoachVatTuService.mach`) cho phiếu của ô, phiếu trùng, phần đặt cho lệnh.

Kết quả là dict thuần JSON (đi qua cache 45 giây của `can_doi_cache`); lọc, nhóm, cắt trang làm
SAU cache ở `chon_trang`. Hai ngăn (lệnh, mặt hàng) cắt từ cùng bản này nên số luôn khớp lưới.
"""
from __future__ import annotations

from datetime import date, datetime

from ..models.purchase import LOAI_MUA_CHO_LSX
from .giu_cho_service import EPS_GIU, GiuChoService, _k_dong, _k_nhom
from .kho_giay import nhan_kho
from .mach_mua import BUOC_DAT, BUOC_MOI, BUOC_NHAP, BUOC_TRA, tom_tat

#: Tình trạng của dòng — hợp đồng với FE (`client.ts` `TinhTrangO`). Thứ tự = nặng → nhẹ.
TT_CHUA_TINH = "chua_tinh"
TT_CAN_MUA = "can_mua"
TT_DANG_MUA = "dang_mua"
TT_CHUA_GIU = "chua_giu"
TT_CHO_VE = "cho_ve"
TT_CO_KHO = "co_kho"
TT_DA_XUAT = "da_xuat"
TINH_TRANG = (TT_CHUA_TINH, TT_CAN_MUA, TT_DANG_MUA, TT_CHUA_GIU, TT_CHO_VE, TT_CO_KHO,
              TT_DA_XUAT)
_NANG = {t: i for i, t in enumerate(TINH_TRANG)}

#: Nhãn bước của phiếu — dùng cho dòng Lịch sử (FE có bảng nhãn riêng cho cột).
_NHAN_BUOC = {
    BUOC_MOI: "Mới đề nghị", BUOC_TRA: "Đơn bị trả, chờ lập lại", "dang_lap_don": "Đang lập đơn",
    "cho_duyet": "Chờ duyệt", BUOC_DAT: "Đã đặt hàng", BUOC_NHAP: "Đã nhập kho",
}


def _f(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def so_vn(x: float) -> str:
    """12345,5 → "12.345,5" — số trong câu ghi chú, cùng kiểu FE in số."""
    x = round(_f(x), 2)
    nguyen, _, le = f"{abs(x):,.2f}".partition(".")
    le = le.rstrip("0")
    s = nguyen.replace(",", ".") + ("," + le if le else "")
    return ("-" if x < 0 else "") + s


def khoa_chu(lsx_id, bai_ghep_id) -> str:
    return f"l:{lsx_id}" if lsx_id is not None else f"b:{bai_ghep_id}"


def khoa_hang(h: tuple) -> str:
    return f"{h[0]}:{h[1]}:{h[2]}:{h[3]}"


def _iso(v):
    return v.isoformat() if isinstance(v, (date, datetime)) else v


def dung_luoi(giu: GiuChoService) -> dict:
    """Bản đầy đủ của lưới: `{"dong": [...], "lenh": {chu: …}, "hang": {hang: …}}`."""
    kh = giu.kh
    with kh.nho_phieu_mua():
        bang = kh.can_doi()
        gom = giu._gom_theo_chu_the(bang)
        giu._them_mo_coi(gom)
        tt_by_chu = giu.giu_theo_chu_the_hang(bang, gom)
        dang_ve = kh._hang_dang_ve()
    mach = kh.mach
    theo_o = mach["theo_o"]
    giu_rows = giu.repo.tat_ca()
    # Màn và Excel đọc TÊN đơn vị trong danh mục ("tờ", "bản kẽm"), không đọc mã ("to", "kem").
    ten_dv = {r.ma: r.ten for r in kh.don_vi.all_rows()}
    for nhom in bang.get("items", []):
        if nhom.get("don_vi_goc"):
            nhom["don_vi_goc"] = ten_dv.get(nhom["don_vi_goc"], nhom["don_vi_goc"])
    for o in gom.values():
        for h in o["hang"].values():
            if h.get("don_vi_goc"):
                h["don_vi_goc"] = ten_dv.get(h["don_vi_goc"], h["don_vi_goc"])

    # ---- chỉ mục phụ ----
    nhom_theo_hang: dict[tuple, dict] = {}
    buoc_theo_o: dict[tuple, list[dict]] = {}
    tt_lenh: dict[tuple, dict] = {}
    for nhom in bang.get("items", []):
        if nhom.get("loai_nhom") != "vat_tu":
            continue
        hang = _k_nhom(nhom)
        nhom_theo_hang[hang] = nhom
        for d in nhom.get("dong", []):
            chu = (d.get("lsx_id"), d.get("bai_ghep_id"))
            buoc_theo_o.setdefault((chu, hang), []).append(d)
            tt_lenh.setdefault(chu, {"ten_sp": d.get("ten_sp")})
    dong_ve: dict[int, dict] = {}          # id dòng đơn đang về → {ma, ngay, con_ve, hang}
    for hang, ds in dang_ve.items():
        for ngay, sl, ma, lid in ds:
            dong_ve[lid] = {"ma": ma, "ngay": ngay, "con_ve": sl, "hang": hang}
    ma_don: dict[int, str] = {lid: v["ma"] for lid, v in dong_ve.items()}
    for m in mach["mach"]:
        for d in m["don"]:
            ma_don.setdefault(d["line_id"], d["ma"])
    giu_theo_o: dict[tuple, list] = {}
    for r in giu_rows:
        giu_theo_o.setdefault(((r.lsx_id, r.bai_ghep_id), _k_dong(r)), []).append(r)

    # ---- dòng ----
    dong: list[dict] = []
    for chu, o in gom.items():
        for hang, h in o["hang"].items():
            dong.append(_dong(chu, hang, h, o, buoc_theo_o.get((chu, hang), []),
                              theo_o.get((hang, chu[0], chu[1])), mach,
                              giu_theo_o.get((chu, hang), []), ma_don))

    # ---- lệnh ----
    lenh: dict[str, dict] = {}
    for chu, o in gom.items():
        tt = tt_by_chu[chu]
        k = khoa_chu(*chu)
        lenh[k] = {
            "chu": k, "lsx_id": chu[0], "bai_ghep_id": chu[1], "ma": o["ma"],
            "ten_sp": (tt_lenh.get(chu) or {}).get("ten_sp"),
            "khach_ten": o.get("khach_ten"), "han_giao_khach": _iso(o.get("han_giao_khach")),
            "is_rush": bool(o.get("is_rush")), "ngoai_pham_vi": bool(o.get("ngoai_pham_vi")),
            "bat": bool(tt["bat"]),
            "lich_su": _lich_su_lenh(chu, mach, giu_rows, nhom_theo_hang, ma_don),
        }

    # ---- mặt hàng ----
    hang_out: dict[str, dict] = {}
    dong_theo_hang: dict[str, list[dict]] = {}
    for d in dong:
        dong_theo_hang.setdefault(d["hang"], []).append(d)
    for kh_str, ds in dong_theo_hang.items():
        h0 = ds[0]
        hang = (h0["hang_loai"], h0["hang_id"], h0["kho_rong"], h0["kho_dai"])
        nhom = nhom_theo_hang.get(hang) or {}
        hang_out[kh_str] = _hang(hang, h0, nhom, ds, dang_ve.get(hang, []), mach, theo_o,
                                 giu_rows, lenh)
    return {"dong": dong, "lenh": lenh, "hang": hang_out}


def _dong(chu, hang, h, o, buoc, ph_o, mach, giu_rs, ma_don) -> dict:
    """Một ô trên lưới."""
    dvt = h.get("don_vi_goc") or ""
    can = sum(_f(d.get("nhu_cau")) for d in buoc)
    da_xuat = sum(_f(d.get("da_cap")) for d in buoc)
    thieu_bang = sum(_f(d.get("thieu")) for d in buoc)
    khong_ro = any(d.get("trang_thai") == "khong_ro" for d in buoc)
    giu_kho = _f(h.get("da_giu_kho"))
    giu_ve = _f(h.get("da_giu_dang_ve"))
    da_giu = min(can, da_xuat + giu_kho + giu_ve) if buoc else giu_kho + giu_ve
    con_thieu = max(0.0, can - da_giu)
    if con_thieu <= EPS_GIU:
        con_thieu = 0.0
    ngoai = bool(o.get("ngoai_pham_vi"))

    phieu = (ph_o or {}).get("phieu")
    trung = (ph_o or {}).get("trung") or []
    okey = (hang, chu[0], chu[1])
    don_cua_phieu = {d["line_id"] for d in (phieu or {}).get("don", [])}
    du_tu = sorted({ma_don.get(r.purchase_request_line_id) or "" for r in giu_rs
                    if r.nguon != "kho" and r.purchase_request_line_id is not None
                    and r.purchase_request_line_id not in don_cua_phieu} - {""})

    # ---- tình trạng ----
    if ngoai:
        tinh = TT_CHO_VE if giu_ve > EPS_GIU else TT_CO_KHO
    elif khong_ro:
        tinh = TT_CHUA_TINH
    elif can - da_xuat <= EPS_GIU:
        tinh = TT_DA_XUAT
    elif con_thieu <= 0:
        tinh = TT_CHO_VE if giu_ve > EPS_GIU else TT_CO_KHO
    elif thieu_bang <= EPS_GIU:
        # Bảng nói hàng đủ (tồn, phần đặt cho mình, phần dư đang về) mà ô chưa giữ hết.
        tinh = TT_CHUA_GIU
    elif phieu is not None:
        tinh = TT_DANG_MUA
    else:
        tinh = TT_CAN_MUA

    # ---- ngày có hàng ----
    if tinh == TT_DA_XUAT:
        ngay = {"loai": "da_xuat", "ngay": None}
    elif tinh == TT_CO_KHO:
        ngay = {"loai": "co_san", "ngay": None}
    elif tinh == TT_CHO_VE:
        ngays = [r.ngay_ve for r in giu_rs if r.nguon != "kho" and r.ngay_ve]
        ngay = {"loai": "ngay_ve", "ngay": _iso(max(ngays)) if ngays else None}
    elif phieu is not None and phieu.get("ngay_ve"):
        ngay = {"loai": "hen", "ngay": _iso(phieu["ngay_ve"])}
    else:
        ngay = {"loai": None, "ngay": None}

    # ---- ghi chú ----
    ghi_chu: list[str] = []
    if ngoai:
        ghi_chu.append("Lệnh không còn trong kế hoạch, nên nhả hàng đã giữ")
    if khong_ro:
        ly = next((d.get("ly_do_canh_bao") for d in buoc if d.get("ly_do_canh_bao")), None)
        ghi_chu.append(ly or "Chưa quy đổi được đơn vị")
    if trung:
        ghi_chu.append(f"{len(trung)} phiếu trùng")
    if phieu is not None and tinh not in (TT_DA_XUAT, TT_CHUA_TINH):
        phan = _f((phieu.get("phan_o") or {}).get(okey))
        da_dat = [d for d in phieu["don"] if d["buoc"] in (BUOC_DAT, BUOC_NHAP)
                  and d["hang"] == hang]
        if da_dat:
            phan = min(phan, sum(_f(mach["dat_cho"].get(d["line_id"], {}).get(okey))
                                 for d in da_dat))
        hut = (can - da_xuat) - giu_kho - phan
        if hut > EPS_GIU and phieu.get("o"):
            ghi_chu.append(f"Phiếu thiếu {so_vn(hut)} {dvt}".rstrip())

    khoa_mua = []
    if tinh == TT_CAN_MUA:
        for d in buoc:
            if _f(d.get("thieu")) > 0:
                khoa_mua.append({
                    "hang_loai": hang[0], "hang_id": hang[1], "kho_rong": hang[2],
                    "kho_dai": hang[3], "lsx_id": d.get("lsx_id"),
                    "bai_ghep_id": d.get("bai_ghep_id"), "buoc_id": d.get("buoc_id"),
                })

    return {
        "khoa": f"{khoa_chu(*chu)}|{khoa_hang(hang)}",
        "chu": khoa_chu(*chu), "lsx_id": chu[0], "bai_ghep_id": chu[1], "ma": o["ma"],
        "hang": khoa_hang(hang), "hang_loai": hang[0], "hang_id": hang[1],
        "kho_rong": hang[2], "kho_dai": hang[3],
        "hang_ma": h.get("hang_ma"), "hang_ten": h.get("hang_ten") or h.get("hang_ma") or "",
        "dvt": dvt,
        "can": round(can, 4), "da_xuat": round(da_xuat, 4), "giu_kho": round(giu_kho, 4),
        "giu_ve": round(giu_ve, 4), "da_giu": round(da_giu, 4), "con_thieu": round(con_thieu, 4),
        "so_de_nghi": round(thieu_bang, 4) if tinh == TT_CAN_MUA else 0.0,
        "phieu": (_phieu_json(phieu) | {"phan": round(_f((phieu.get("phan_o") or {}).get(okey)), 4)}
                  if phieu is not None else None),
        "trung": [_phieu_json(m) for m in trung],
        "du_tu": du_tu,
        "ngay_co_hang": ngay,
        "tinh_trang": tinh,
        "ghi_chu": ghi_chu,
        "buoc": [{
            "buoc_id": d.get("buoc_id"), "ten_viec": d.get("ten_viec"),
            "can": round(_f(d.get("nhu_cau")), 4), "da_xuat": round(_f(d.get("da_cap")), 4),
            "thieu": round(_f(d.get("thieu")), 4),
        } for d in buoc],
        "khoa_mua": khoa_mua,
    }


def _phieu_json(m: dict | None) -> dict | None:
    t = tom_tat(m)
    if t is None:
        return None
    t["co_the_huy"] = m["buoc"] in (BUOC_MOI, BUOC_TRA)
    return t


def _hang(hang, h0, nhom, ds, ve, mach, theo_o, giu_rows, lenh) -> dict:
    """Thông tin cả mặt hàng — dòng nhóm "theo mặt hàng" và ngăn mặt hàng."""
    dvt = h0["dvt"]
    ton = _f(nhom.get("ton"))
    dang_ve = sum(sl for _n, sl, _m, _l in ve)
    can = sum(d["can"] for d in ds)
    da_giu = sum(d["da_giu"] for d in ds)
    con_thieu = sum(d["con_thieu"] for d in ds)
    con_can = sum(max(0.0, d["can"] - d["da_xuat"]) for d in ds)
    dat_du = min(dang_ve, max(0.0, ton + dang_ve - con_can)) if dang_ve > EPS_GIU else 0.0
    ma_lenh = {(lv["lsx_id"], lv["bai_ghep_id"]): lv["ma"] for lv in lenh.values()}
    tinh_o = {(d["lsx_id"], d["bai_ghep_id"]): d for d in ds}

    # ---- đơn đang chạy của mặt hàng ----
    don: list[dict] = []
    da_co: set[int] = set()
    mach_theo_dong = {d["line_id"]: (m, d) for m in mach["mach"] for d in m["don"]}
    giu_theo_dong: dict[int, list] = {}
    for r in giu_rows:
        if r.nguon != "kho" and r.purchase_request_line_id is not None and _k_dong(r) == hang:
            giu_theo_dong.setdefault(r.purchase_request_line_id, []).append(r)
    for ngay, sl, ma, lid in ve:
        da_co.add(lid)
        peg = mach["peg"].get(lid, {})
        don.append(_don_json(ma, BUOC_DAT, ngay, sl, peg, giu_theo_dong.get(lid, []), ma_lenh,
                             da_dat=True))
    for m in mach["mach"]:
        if not m["song"] or m["hang"] != hang:
            continue
        for d in m["don"]:
            if d["line_id"] in da_co or d["buoc"] in (BUOC_TRA, BUOC_NHAP, BUOC_DAT):
                continue
            da_co.add(d["line_id"])
            phan = {k: v for k, v in (m.get("phan_o") or {}).items()}
            don.append(_don_json(d["ma"], d["buoc"], d["ngay_ve"], d["so_dat"] or 0.0, phan, [],
                                 ma_lenh, da_dat=False))

    # ---- phiếu nên huỷ ----
    nen_huy: list[dict] = []
    da_xet: set[int] = set()
    for (h, lsx_id, bg_id), o in theo_o.items():
        if h != hang:
            continue
        for m in o["trung"]:
            if m["yc_line_id"] in da_xet:
                continue
            da_xet.add(m["yc_line_id"])
            nen_huy.append(_huy_json(m, ma_lenh, f"lệnh đã có phiếu {o['phieu']['ma']}"))
    for m in mach["mach"]:
        if not m["song"] or m["hang"] != hang or m["yc_line_id"] in da_xet:
            continue
        if m["buoc"] not in (BUOC_MOI, BUOC_TRA, "dang_lap_don", "cho_duyet"):
            continue
        cac_o = [(o["okey"][1], o["okey"][2]) for o in m["o"]]
        if not cac_o:
            # Yêu cầu Mua tồn / Theo yêu cầu cố ý không gắn lệnh — lệnh hết thiếu không phải lý do
            # huỷ nó (08/10/2026). Chỉ yêu cầu Cho lệnh SX mà mất liên kết mới đáng gợi ý.
            if (con_thieu <= EPS_GIU and m["buoc"] == BUOC_MOI
                    and m.get("loai_mua") == LOAI_MUA_CHO_LSX):
                da_xet.add(m["yc_line_id"])
                nen_huy.append(_huy_json(m, ma_lenh, "không lệnh nào còn thiếu mặt hàng này"))
            continue
        ly = None
        if all(c not in tinh_o for c in cac_o):
            ly = "lệnh không còn cần"
        elif all(c not in tinh_o or tinh_o[c]["tinh_trang"] in (TT_CO_KHO, TT_DA_XUAT, TT_CHO_VE)
                 for c in cac_o) and not any(
                     _f(mach["peg"].get(d["line_id"], {}).get(o["okey"]))
                     for d in m["don"] for o in m["o"]):
            ly = "lệnh đã đủ hàng"
        if ly:
            da_xet.add(m["yc_line_id"])
            nen_huy.append(_huy_json(m, ma_lenh, ly))

    ghi_chu = []
    if dat_du > EPS_GIU:
        ghi_chu.append(f"Đặt dư {so_vn(dat_du)} {dvt}".rstrip())
    khong_can = sum(1 for n in nen_huy if not n["ly_do"].startswith("lệnh đã có phiếu"))
    if khong_can:
        ghi_chu.append(f"{khong_can} phiếu không còn cần")

    return {
        "hang": khoa_hang(hang), "hang_loai": hang[0], "hang_id": hang[1],
        "kho_rong": hang[2], "kho_dai": hang[3],
        "kho": nhan_kho(hang[2], hang[3]) if hang[0] == "giay" and hang[2] else None,
        "hang_ma": h0["hang_ma"], "hang_ten": h0["hang_ten"], "dvt": dvt,
        "ton": round(ton, 4), "dang_ve": round(dang_ve, 4),
        "can": round(can, 4), "da_giu": round(da_giu, 4), "con_thieu": round(con_thieu, 4),
        "dat_du": round(dat_du, 4),
        "don": don, "nen_huy": nen_huy, "ghi_chu": ghi_chu,
        "lich_su": _lich_su_hang(hang, mach, giu_rows, ma_lenh, dvt, h0["hang_ten"]),
    }


def _don_json(ma, buoc, ngay, so, phan: dict, giu_rs, ma_lenh, *, da_dat: bool) -> dict:
    dat_cho = [{"ma": ma_lenh.get((k[1], k[2]), ""), "so": round(_f(v), 4)}
               for k, v in phan.items() if _f(v) > EPS_GIU]
    tong_dat = min(_f(so), sum(x["so"] for x in dat_cho))
    du = max(0.0, _f(so) - tong_dat)
    cua_o = {(k[1], k[2]) for k in phan}
    giu_du: dict[str, float] = {}
    for r in giu_rs:
        if (r.lsx_id, r.bai_ghep_id) in cua_o:
            continue
        m = ma_lenh.get((r.lsx_id, r.bai_ghep_id), "")
        giu_du[m] = giu_du.get(m, 0.0) + _f(r.so_luong)
    giu_ds = [{"ma": k, "so": round(v, 4)} for k, v in giu_du.items() if v > EPS_GIU]
    return {
        "ma": ma, "buoc": buoc, "ngay_ve": _iso(ngay), "so": round(_f(so), 4),
        "dat_cho": dat_cho, "du": round(du, 4), "giu_du": giu_ds,
        "du_trong": round(max(0.0, du - sum(x["so"] for x in giu_ds)), 4),
        "da_dat": da_dat,
    }


def _huy_json(m, ma_lenh, ly_do) -> dict:
    t = _phieu_json(m)
    t["lap_cho"] = [ma_lenh.get((o["okey"][1], o["okey"][2]), "") for o in m["o"]]
    t["ly_do"] = ly_do
    return t


def _ten_hang(nhom_theo_hang, hang) -> tuple[str, str]:
    n = nhom_theo_hang.get(hang) or {}
    return (n.get("hang_ten") or n.get("hang_ma") or "", n.get("don_vi_goc") or "")


def _lich_su_lenh(chu, mach, giu_rows, nhom_theo_hang, ma_don) -> list[dict]:
    """Vết của lệnh: lập yêu cầu, lập đơn, giữ hàng — mới trước."""
    ra: list[dict] = []
    for m in mach["mach"]:
        if not any((o["okey"][1], o["okey"][2]) == chu for o in m["o"]):
            continue
        ten, dvt = _ten_hang(nhom_theo_hang, m["hang"])
        so = next((o["so_luong"] for o in m["o"] if (o["okey"][1], o["okey"][2]) == chu), None)
        so_txt = f" {so_vn(so)} {dvt}".rstrip() if so is not None else ""
        ra.append({"luc": _iso(m["yc_tao_luc"]),
                   "chu": f"Lập yêu cầu {m['yc_ma']} mua {ten}{so_txt}"})
        for d in m["don"]:
            ra.append({"luc": _iso(d["tao_luc"]),
                       "chu": f"Thu mua lập đơn {d['ma']} từ yêu cầu {m['yc_ma']}, nay ở bước "
                              f"{_NHAN_BUOC.get(d['buoc'], d['buoc']).lower()}"})
    for r in giu_rows:
        if (r.lsx_id, r.bai_ghep_id) != chu:
            continue
        ten, dvt = _ten_hang(nhom_theo_hang, _k_dong(r))
        noi = ("trong kho" if r.nguon == "kho"
               else f"trên đơn {ma_don.get(r.purchase_request_line_id) or 'đang về'}")
        ra.append({"luc": _iso(r.created_at),
                   "chu": f"Giữ {so_vn(r.so_luong)} {dvt} {ten} {noi}".replace("  ", " ")})
    ra.sort(key=lambda x: x["luc"] or "", reverse=True)
    return ra


def _lich_su_hang(hang, mach, giu_rows, ma_lenh, dvt, ten) -> list[dict]:
    ra: list[dict] = []
    for m in mach["mach"]:
        if m["hang"] != hang:
            continue
        cho = ", ".join(x for x in (ma_lenh.get((o["okey"][1], o["okey"][2]), "")
                                    for o in m["o"]) if x) or "không lệnh nào"
        ra.append({"luc": _iso(m["yc_tao_luc"]), "chu": f"Lập yêu cầu {m['yc_ma']} cho {cho}"})
        for d in m["don"]:
            ra.append({"luc": _iso(d["tao_luc"]),
                       "chu": f"Thu mua lập đơn {d['ma']} từ yêu cầu {m['yc_ma']}"})
    for r in giu_rows:
        if _k_dong(r) != hang:
            continue
        noi = "trong kho" if r.nguon == "kho" else "trên đơn đang về"
        ra.append({"luc": _iso(r.created_at),
                   "chu": f"Giữ {so_vn(r.so_luong)} {dvt} cho "
                          f"{ma_lenh.get((r.lsx_id, r.bai_ghep_id), '')} {noi}"})
    ra.sort(key=lambda x: x["luc"] or "", reverse=True)
    return ra


# ================== LỌC · NHÓM · CẮT TRANG (sau cache) ==================


def _khop_q(d: dict, lv: dict, k: str) -> bool:
    if not k:
        return True
    cac = [d["ma"], lv.get("ten_sp") or "", d["hang_ma"] or "", d["hang_ten"] or ""]
    for p in [d.get("phieu")] + d.get("trung", []):
        if p:
            cac += [p.get("ma") or "", p.get("yc_ma") or ""]
    cac += d.get("du_tu", [])
    return any(k in (c or "").lower() for c in cac)


def chon_trang(luoi: dict, *, xem: str = "lenh", q: str | None = None,
               tinh_trang: str | None = None, hang_loai: str | None = None,
               page: int = 1, size: int = 20) -> dict:
    """Lọc dòng → đếm theo tình trạng (trước tab) → nhóm → cắt trang theo NHÓM.

    `tinh_trang="co_ghi_chu"` = dòng có ghi chú, hoặc thuộc mặt hàng có ghi chú (đặt dư, phiếu không
    còn cần)."""
    k = (q or "").strip().lower()
    lenh, hang = luoi["lenh"], luoi["hang"]
    ds = [d for d in luoi["dong"]
          if (not hang_loai or d["hang_loai"] == hang_loai)
          and _khop_q(d, lenh.get(d["chu"], {}), k)]

    def co_ghi_chu(d):
        return bool(d["ghi_chu"]) or bool((hang.get(d["hang"]) or {}).get("ghi_chu"))

    dem = {"tat_ca": len(ds), **{t: 0 for t in TINH_TRANG}, "co_ghi_chu": 0}
    for d in ds:
        dem[d["tinh_trang"]] += 1
        if co_ghi_chu(d):
            dem["co_ghi_chu"] += 1
    if tinh_trang == "co_ghi_chu":
        ds = [d for d in ds if co_ghi_chu(d)]
    elif tinh_trang:
        ds = [d for d in ds if d["tinh_trang"] == tinh_trang]

    nhom: dict[str, list[dict]] = {}
    khoa_nhom = "chu" if xem == "lenh" else "hang"
    for d in ds:
        nhom.setdefault(d[khoa_nhom], []).append(d)
    for rows in nhom.values():
        rows.sort(key=lambda d: (_NANG[d["tinh_trang"]],
                                 (d["hang_ten"] if xem == "lenh" else d["ma"]) or ""))

    def nang(rows):
        return min(_NANG[d["tinh_trang"]] for d in rows)

    if xem == "lenh":
        thu_tu = sorted(nhom, key=lambda c: (
            nang(nhom[c]), lenh[c].get("han_giao_khach") or "9999", lenh[c]["ma"] or ""))
    else:
        thu_tu = sorted(nhom, key=lambda h: (nang(nhom[h]), hang[h]["hang_ten"] or ""))

    size = max(1, min(int(size or 20), 200))
    tong = len(thu_tu)
    so_trang = max(1, -(-tong // size))
    page = max(1, min(int(page or 1), so_trang))
    cat = thu_tu[(page - 1) * size: page * size]
    items = []
    for c in cat:
        dau = dict(lenh[c] if xem == "lenh" else hang[c])
        dau.pop("lich_su", None)
        if xem == "hang":
            dau.pop("don", None)
            dau.pop("nen_huy", None)
        items.append({"khoa": c, "lenh": dau if xem == "lenh" else None,
                      "hang": dau if xem == "hang" else None, "dong": nhom[c]})
    return {"items": items, "tong_nhom": tong, "tong_dong": len(ds), "page": page,
            "size": size, "dem": dem}


def mot_lenh(luoi: dict, chu: str) -> dict | None:
    lv = luoi["lenh"].get(chu)
    if lv is None:
        return None
    return {"lenh": lv, "dong": sorted([d for d in luoi["dong"] if d["chu"] == chu],
                                       key=lambda d: (_NANG[d["tinh_trang"]], d["hang_ten"]))}


def mot_hang(luoi: dict, hang: str) -> dict | None:
    hv = luoi["hang"].get(hang)
    if hv is None:
        return None
    return {"hang": hv, "dong": sorted([d for d in luoi["dong"] if d["hang"] == hang],
                                       key=lambda d: (_NANG[d["tinh_trang"]], d["ma"]))}


# ================== XUẤT EXCEL ==================

_NHAN_TT = {
    TT_CHUA_TINH: "Chưa tính được", TT_CAN_MUA: "Cần mua", TT_DANG_MUA: "Đang mua",
    TT_CHUA_GIU: "Chưa giữ", TT_CHO_VE: "Chờ hàng về", TT_CO_KHO: "Có trong kho",
    TT_DA_XUAT: "Đã xuất kho",
}


def _ngay_vn(s) -> str:
    if not s:
        return ""
    d = date.fromisoformat(str(s)[:10])
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def _ngay_co_hang_chu(n: dict) -> str:
    loai = (n or {}).get("loai")
    if loai == "da_xuat":
        return "Đã xuất"
    if loai == "co_san":
        return "Có sẵn"
    if loai == "ngay_ve":
        return _ngay_vn(n.get("ngay"))
    if loai == "hen":
        return f"hẹn {_ngay_vn(n.get('ngay'))}"
    return ""


def xuat_xlsx(luoi: dict, *, xem: str = "lenh", q: str | None = None,
              tinh_trang: str | None = None, hang_loai: str | None = None) -> bytes:
    """Đúng các dòng đang lọc (mọi trang), thứ tự như lưới, một dòng một ô."""
    from io import BytesIO

    from openpyxl import Workbook
    from openpyxl.styles import Font

    trang = chon_trang(luoi, xem=xem, q=q, tinh_trang=tinh_trang, hang_loai=hang_loai,
                       page=1, size=200)
    tong = trang["tong_nhom"]
    nhom = list(trang["items"])
    p = 2
    while len(nhom) < tong:
        nhom += chon_trang(luoi, xem=xem, q=q, tinh_trang=tinh_trang, hang_loai=hang_loai,
                           page=p, size=200)["items"]
        p += 1
    wb = Workbook()
    ws = wb.active
    ws.title = "Kế hoạch vật tư"
    dau = ["Lệnh", "Sản phẩm", "Khách", "Ngày giao", "Mặt hàng", "Khổ", "ĐVT", "Cần", "Đã giữ",
           "Còn thiếu", "Phiếu mua", "Bước của phiếu", "Ngày có hàng", "Tình trạng", "Ghi chú"]
    ws.append(dau)
    for c in ws[1]:
        c.font = Font(bold=True)
    for n in nhom:
        for d in n["dong"]:
            lv = luoi["lenh"].get(d["chu"], {})
            ph = d.get("phieu")
            phieu = ph["ma"] if ph else (("dư từ " + ", ".join(d["du_tu"])) if d["du_tu"] else "")
            ws.append([
                d["ma"], lv.get("ten_sp") or "", lv.get("khach_ten") or "",
                _ngay_vn(lv.get("han_giao_khach")), d["hang_ten"],
                nhan_kho(d["kho_rong"], d["kho_dai"]) if d["hang_loai"] == "giay" and d["kho_rong"]
                else "",
                d["dvt"], d["can"], d["da_giu"], d["con_thieu"], phieu,
                _NHAN_BUOC.get(ph["buoc"], "") if ph else "",
                _ngay_co_hang_chu(d["ngay_co_hang"]), _NHAN_TT[d["tinh_trang"]],
                "; ".join(d["ghi_chu"]),
            ])
    for col, w in zip("ABCDEFGHIJKLMNO", (14, 26, 26, 12, 28, 14, 9, 11, 11, 11, 20, 20, 13, 15, 40)):
        ws.column_dimensions[col].width = w
    out = BytesIO()
    wb.save(out)
    return out.getvalue()
