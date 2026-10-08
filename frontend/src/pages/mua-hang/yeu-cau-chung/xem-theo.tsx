// "Xem theo: Yêu cầu | Từng món" + bộ nạp danh sách món — dùng chung cho màn Yêu cầu mua hàng và
// Mua hàng › Yêu cầu chờ xử lý (phương án 3, 07/10/2026). Chế độ đang xem nhớ theo màn trên máy này.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type TinhTrangMon, type YeuCauMonListOut } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import type { TabDem } from "../loc-mua-hang/ThanhCongCuMuaHang";
import { TT_MON } from "../trang-thai-mua";

export type XemTheo = "yc" | "mon";

export function useXemTheo(khoa: string, macDinh: XemTheo): [XemTheo, (v: XemTheo) => void] {
  const [v, setV] = useState<XemTheo>(() => {
    try {
      const luu = localStorage.getItem(khoa);
      return luu === "yc" || luu === "mon" ? luu : macDinh;
    } catch {
      return macDinh;
    }
  });
  const dat = (moi: XemTheo) => {
    setV(moi);
    try {
      localStorage.setItem(khoa, moi);
    } catch {
      /* trình duyệt chặn lưu thì thôi, chỉ là nhớ chế độ xem */
    }
  };
  return [v, dat];
}

export function NutXemTheo({ v, onDoi }: { v: XemTheo; onDoi: (v: XemTheo) => void }) {
  return (
    <div className="mh-seg" role="group" aria-label="Xem theo">
      <button type="button" aria-pressed={v === "yc"} onClick={() => onDoi("yc")}>Yêu cầu</button>
      <button type="button" aria-pressed={v === "mon"} onClick={() => onDoi("mon")}>Từng món</button>
    </div>
  );
}

/** Chip tình trạng món: luôn hiện các bước chính, Đơn nháp / Bị trả lại / Đã huỷ chỉ hiện khi có. */
const MON_CHINH: TinhTrangMon[] = ["cho_lap", "cho_duyet", "cho_hang", "mot_phan", "du", "nhap_kho"];
export function tabMon(dem: Record<string, number> | null | undefined, dangChon: string): TabDem[] {
  const tabs: TabDem[] = [{ value: "all", label: "Tất cả", count: dem ? dem.tat_ca ?? 0 : undefined }];
  for (const k of Object.keys(TT_MON) as TinhTrangMon[]) {
    const so = dem ? dem[k] ?? 0 : undefined;
    if (MON_CHINH.includes(k) || (so ?? 0) > 0 || k === dangChon) {
      tabs.push({ value: k, label: TT_MON[k].label, mau: TT_MON[k].mau, count: so });
    }
  }
  return tabs;
}

/** Nạp danh sách món theo bộ lọc. `bat=false` thì không gọi (đang xem theo Yêu cầu). */
export function useMonYeuCau({
  bat,
  q,
  tinhTrang,
  page,
  size,
  khoaLoc,
  tick,
}: {
  bat: boolean;
  q: string;
  tinhTrang: string;
  page: number;
  size: number;
  /** JSON của tham số kỳ + điều kiện — cùng chuỗi màn đang gửi cho danh sách yêu cầu. */
  khoaLoc: string;
  tick: number;
}) {
  const { token } = useAuth();
  const [data, setData] = useState<YeuCauMonListOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const luot = useRef(0);
  const nap = useCallback(() => {
    if (!token || !bat) return;
    const l = ++luot.current;
    setLoading(true);
    setLoi(null);
    api.departmentPurchaseRequests
      .mon(token, { q: q.trim() || undefined, tinh_trang: tinhTrang === "all" ? null : tinhTrang, page, size }, JSON.parse(khoaLoc))
      .then((d) => l === luot.current && setData(d))
      .catch(() => {
        if (l !== luot.current) return;
        setData(null);
        setLoi("Không tải được danh sách món.");
      })
      .finally(() => l === luot.current && setLoading(false));
  }, [token, bat, q, tinhTrang, page, size, khoaLoc]);
  useEffect(() => {
    nap();
  }, [nap, tick]);
  return { data, loading, loi, nap };
}
