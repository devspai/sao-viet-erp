"""Dự báo tồn cho màn Tồn kho: tồn hôm nay − lệnh sắp lĩnh + hàng đang về.

CHỈ ĐỌC và KHÔNG có luật riêng: "lệnh cần bao nhiêu, theo thứ tự nào" lấy nguyên từ bảng cân đối
vật tư (`bang_can_doi` — chung bản cache 45 giây với màn Kế hoạch vật tư), "đang về" và "phiếu mua
đang chạy" lấy từ đúng hai hàm bảng cân đối dùng (`dang_ve_va_vet_mua`). Hai màn nhìn một bộ số.

Mặt hàng chưa lệnh nào cần thì bảng cân đối không có nhóm của nó — vẫn trả dòng (cần 0) để màn
Tồn kho bày được hàng đang về và phiếu mua đã có, khỏi lập yêu cầu mua chồng.
"""
from __future__ import annotations

from .can_doi_cache import bang_can_doi
from .mua_cho import gop_mua_cho, mua_cho_theo_dong_don


def _khoa4(hang: tuple) -> tuple[str, int, int, int]:
    h = tuple(hang)
    return (h[0], int(h[1]), int(h[2]), int(h[3])) if len(h) == 4 else (h[0], int(h[1]), 0, 0)


class DuBaoTonService:
    def __init__(self, kh, giu) -> None:
        self.kh = kh
        self.giu = giu

    def du_bao(self, hangs: list[tuple]) -> list[dict]:
        """`hangs` = khoá tồn của các dòng trên màn (cặp `(loai, id)` hoặc khoá 4 phần)."""
        khoas = sorted({_khoa4(h) for h in hangs})
        if not khoas:
            return []
        # Một bản nhớ phiếu mua cho cả lượt: bảng cân đối (nếu cache nguội) và phần đang về bên dưới
        # cùng đọc một danh sách phiếu thay vì mỗi chỗ tự nạp lại.
        with self.kh.nho_phieu_mua():
            return self._du_bao(khoas)

    def _du_bao(self, khoas: list[tuple]) -> list[dict]:
        bang = bang_can_doi(self.kh, self.giu)
        nhom_theo_khoa = {
            (n["hang_loai"], int(n["hang_id"]), int(n.get("kho_rong") or 0), int(n.get("kho_dai") or 0)): n
            for n in bang.get("items", [])
            if n.get("loai_nhom") == "vat_tu"
        }
        dang_ve, vet = self.kh.dang_ve_va_vet_mua(khoas)
        # "Mua cho" của mọi dòng đơn đang về — một lượt cho cả màn.
        mc = mua_cho_theo_dong_don(
            self.kh.db, [d for k in khoas for *_x, d in dang_ve.get(k, [])])

        out: list[dict] = []
        for k in khoas:
            nhom = nhom_theo_khoa.get(k)
            lenh = self._lenh_cua(nhom) if nhom else []
            ve: dict[tuple, float] = {}
            ve_mc: dict[tuple, list] = {}
            for ngay, sl, ma, dong_id in dang_ve.get(k, []):
                ve[(ngay, ma)] = ve.get((ngay, ma), 0.0) + float(sl)
                ve_mc.setdefault((ngay, ma), []).append(mc.get(dong_id))
            out.append({
                "hang_loai": k[0], "hang_id": k[1], "kho_rong": k[2], "kho_dai": k[3],
                "ton_toan_xuong": (nhom.get("ton") if nhom else None),
                "can_lenh": sum(x["can"] for x in lenh),
                "dang_ve": sum(ve.values()),
                "lenh": lenh,
                "ve": [self._ve_json(ngay, ma, sl, ve_mc.get((ngay, ma), []))
                       for (ngay, ma), sl in sorted(ve.items(), key=lambda x: (x[0][0], x[0][1] or ""))],
                "phieu_mua": list(vet.get(k, [])),
            })
        return out

    @staticmethod
    def _ve_json(ngay, ma, sl, muc) -> dict:
        loai, lenh = gop_mua_cho(muc)
        return {"ma": ma, "ngay_ve": ngay, "sl": sl, "mua_cho": lenh, "loai_mua_cac": loai}

    @staticmethod
    def _lenh_cua(nhom: dict) -> list[dict]:
        """Gộp dòng của bảng theo CHỦ THỂ (lệnh / bài): một lệnh ăn cùng món ở hai bước vẫn là một
        lệnh phải lĩnh. Giữ thứ tự xuất hiện = thứ tự ăn tồn của engine."""
        theo: dict[tuple, dict] = {}
        for d in nhom.get("dong", []):
            can = d.get("con_phai_co")
            if d.get("loai") != "vat_tu" or not can or can <= 0:
                continue
            chu = (d.get("lsx_id"), d.get("bai_ghep_id"))
            x = theo.get(chu)
            # Giữ chỗ gộp sẵn theo (chủ thể, mặt hàng) trên MỖI dòng — lấy một lần, không cộng.
            giu = float(d.get("da_giu_kho") or 0) + float(d.get("da_giu_dang_ve") or 0)
            if x is None:
                theo[chu] = {
                    "ma": d["ma"], "lsx_id": d.get("lsx_id"), "bai_ghep_id": d.get("bai_ghep_id"),
                    "ten_viec": d.get("ten_viec"), "khach_ten": d.get("khach_ten"),
                    "han_sx": d.get("han_sx"), "can": float(can), "da_giu": giu,
                }
            else:
                x["can"] += float(can)
                x["da_giu"] = max(x["da_giu"], giu)
                if d.get("han_sx") and (x["han_sx"] is None or str(d["han_sx"]) < str(x["han_sx"])):
                    x["han_sx"] = d["han_sx"]
        return list(theo.values())
