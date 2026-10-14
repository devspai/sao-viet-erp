/** Ô MỤC THU / MỤC CHI trên form lập phiếu (11/10/2026) — chọn từ danh mục Mục thu chi, đặt ngay
 *  trên ô Lý do. Chỉ phiếu LẬP TAY có ô này và bắt buộc chọn; phiếu sinh từ nghiệp vụ (gia công…)
 *  thuộc mục cố định của nguồn (12/10/2026) nên không có ô, mục cố định cũng không nằm trong menu.
 *  Trả lại tiền cho khách / nhà cung cấp hoàn tiền lập từ ngăn công nợ (mục cố định), không qua đây.
 */
import { useEffect, useState } from "react";

import { api, type MucThuChi } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { OF, idO } from "./KhungFormPhieu";

/** Danh mục ít dòng, đổi hiếm — nhớ theo loại trong phiên trang, form mở lần hai khỏi chờ. */
const nho = new Map<string, MucThuChi[]>();

/** `chiDangDung` false = cả mục đã ngừng (bộ lọc danh sách phiếu). Kèm cả mục cố định (`co_dinh`) —
 *  bộ lọc cần chúng; ô chọn trên phiếu tự loại ra. */
export function useMucThuChi(
  loai: "thu" | "chi",
  chiDangDung = true,
): { ds: MucThuChi[]; dangTai: boolean; loi: string | null } {
  const { token } = useAuth();
  const khoa = `${loai}:${chiDangDung ? "dung" : "het"}`;
  const [ds, setDs] = useState<MucThuChi[]>(() => nho.get(khoa) ?? []);
  const [dangTai, setDangTai] = useState(!nho.has(khoa));
  const [loi, setLoi] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let bo = false;
    api.mucThuChi
      .list(token, loai, chiDangDung)
      .then((r) => {
        nho.set(khoa, r.items);
        if (!bo) setDs(r.items);
      })
      .catch(() => {
        if (!bo) setLoi("Không tải được danh mục mục thu chi.");
      })
      .finally(() => {
        if (!bo) setDangTai(false);
      });
    return () => {
      bo = true;
    };
  }, [token, loai, chiDangDung, khoa]);
  return { ds, dangTai, loi };
}

/** Mục cố định của một nguồn phiếu (vd `gia_cong_ngoai` → "Thuê gia công ngoài"), hoặc null. */
export function mucCoDinh(ds: MucThuChi[], nguon: string): MucThuChi | null {
  return ds.find((m) => m.co_dinh && m.nguon === nguon) ?? null;
}

export function OChonMuc({
  loai,
  ds,
  dangTai,
  loiTai,
  value,
  onChange,
  loi,
}: {
  loai: "thu" | "chi";
  ds: MucThuChi[];
  dangTai: boolean;
  loiTai: string | null;
  value: number | null | undefined;
  onChange: (id: number | null, muc: MucThuChi | null) => void;
  loi?: string;
}) {
  const nhan = loai === "chi" ? "Mục chi" : "Mục thu";
  const chon = ds.filter((m) => !m.co_dinh);
  const trong = !dangTai && chon.length === 0;
  return (
    <OF khoa="muc_thu_chi_id" nhan={nhan} batBuoc rong loi={loi}
      goi={loiTai ?? (dangTai ? "Đang tải danh mục…" : trong ? "Chưa có mục nào. Khai ở Cấu hình danh mục, Mục thu chi." : undefined)}>
      <select id={idO("muc_thu_chi_id")} value={value ?? ""} disabled={dangTai || trong}
        aria-invalid={loi ? true : undefined}
        onChange={(e) => {
          const id = e.target.value ? Number(e.target.value) : null;
          onChange(id, chon.find((m) => m.id === id) ?? null);
        }}>
        <option value="">{`Chọn ${nhan.toLowerCase()}`}</option>
        {chon.map((m) => (
          <option key={m.id} value={m.id}>{m.ten}</option>
        ))}
      </select>
    </OF>
  );
}
