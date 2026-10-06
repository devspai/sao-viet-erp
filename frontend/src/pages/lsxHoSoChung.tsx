// Mảnh dùng chung của khung hồ sơ MỘT lệnh (`LenhSxHoSoView` + năm tệp mục `LsxHoSo*`).
// Lớp CSS: `lenh-sx-ho-so.css` (tiền tố `lhs-`) và pill của `lenh-sx-chung.css` (`lsc-pill--*`).
//
// ⚠️ ĐỌC, KHÔNG TÍNH LẠI qua nhiều bước: mọi con số lấy từ `LenhSxHoSoOut`. Chỗ duy nhất cộng ở đây
// là cộng các mẻ của CÙNG MỘT công việc theo TỪNG đơn vị (`tongMeTheoDonVi`) — không bao giờ cộng
// qua hai thang đo.
import type { ReactNode } from "react";

import type { LenhSxSanLuongBatch } from "../api/client";
import { nhanDonVi } from "./lsxBuoc";

/** Số thập phân của xưởng: bỏ đuôi `,0`, giữ tối đa 2 chữ số lẻ. */
export function so(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

/** `so()` nhưng 0 cũng ra "—" — cho ô máy chủ ép `None → 0`. */
export function soHoac(v: number | null | undefined): string {
  return v ? so(v) : "—";
}

/** "dd/mm" theo giờ máy người xem (giờ xưởng). Chuỗi rỗng/hỏng ⇒ "—". */
export function ngayNgan(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Số ngày `moc` (giờ thật) vượt `han` (ngày `YYYY-MM-DD`), theo ngày lịch của người xem. Âm hoặc 0
 *  = kịp. `null` khi thiếu một trong hai. */
export function soNgayTre(moc: string | null | undefined, han: string | null | undefined): number | null {
  if (!moc || !han) return null;
  const d = new Date(moc);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(han);
  if (Number.isNaN(d.getTime()) || !m) return null;
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((a - b) / 86_400_000);
}

export type PillMeta = { label: string; cls: string };

/** Nhãn an toàn cho chuỗi enum: giá trị lạ hiện chính chuỗi đó, không hiện ô trống. */
export function pillMeta(map: Record<string, PillMeta>, k: string | null | undefined): PillMeta | null {
  if (!k) return null;
  return map[k] ?? { label: k, cls: "lsc-pill--off" };
}

export function Pill({ meta }: { meta: PillMeta | null }) {
  if (!meta) return null;
  return <span className={`lsc-pill ${meta.cls}`}>{meta.label}</span>;
}

/** Trạng thái CÔNG VIỆC của một bước. `null` = bước chưa có công việc (chưa phát hành tới đó). */
export const TT_BUOC: Record<string, PillMeta> = {
  released: { label: "Chờ làm", cls: "lsc-pill--off" },
  running: { label: "Đang chạy", cls: "lsc-pill--steel" },
  paused: { label: "Tạm dừng", cls: "lsc-pill--signal" },
  completed: { label: "Hoàn thành", cls: "lsc-pill--moss" },
};

/** Màu cân đối vật tư — cùng chữ với màn Kế hoạch vật tư. */
export const VT_MAU: Record<string, PillMeta> = {
  xam: { label: "Đã cấp đủ", cls: "lsc-pill--off" },
  xanh: { label: "Đủ trong kho", cls: "lsc-pill--moss" },
  vang: { label: "Đủ nhờ hàng về", cls: "lsc-pill--amber" },
  do: { label: "Thiếu", cls: "lsc-pill--signal" },
  khong_ro: { label: "Chưa đánh giá được", cls: "lsc-pill--off" },
};

export const KCS_KET_LUAN: Record<string, PillMeta> = {
  dat: { label: "Đạt", cls: "lsc-pill--moss" },
  dat_mot_phan: { label: "Đạt một phần", cls: "lsc-pill--amber" },
  khong_dat: { label: "Không đạt", cls: "lsc-pill--signal" },
};

/** Yêu cầu nhập kho thành phẩm (trạng thái `StockRequest`). */
export const KHO_YC_TT: Record<string, PillMeta> = {
  draft: { label: "Nháp", cls: "lsc-pill--off" },
  pending: { label: "Chờ duyệt", cls: "lsc-pill--amber" },
  approved: { label: "Chờ kho nhận", cls: "lsc-pill--amber" },
  received: { label: "Kho đã tiếp nhận", cls: "lsc-pill--steel" },
  preparing: { label: "Kho đang lập phiếu", cls: "lsc-pill--steel" },
  partial: { label: "Nhận một phần", cls: "lsc-pill--steel" },
  done: { label: "Đã nhận đủ", cls: "lsc-pill--moss" },
  rejected: { label: "Kho từ chối", cls: "lsc-pill--signal" },
  cancelled: { label: "Đã huỷ", cls: "lsc-pill--off" },
};

/** Loại lệnh (`models/lsx.LOAI_LSX`). */
export const LOAI_LENH: Record<string, string> = {
  san_xuat_moi: "Sản xuất mới",
  bo_sung: "Bổ sung",
  bu: "Bù",
  lam_lai: "Làm lại",
  mau: "Mẫu",
  noi_bo: "Nội bộ",
};

export const MUC_DO: Record<string, string> = {
  nhe: "Nhẹ",
  trung_binh: "Trung bình",
  nghiem_trong: "Nghiêm trọng",
};

/** Câu khi tổng trộn nhiều thang đo — cùng chữ ở mọi chỗ. */
export const NHIEU_DON_VI = "Nhiều đơn vị, không cộng được";

/** Ô "nhãn — giá trị". */
export function Kv({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="lhs-kv">
      <span className="lhs-kv__k">{k}</span>
      <span className="lhs-kv__v">{v === null || v === undefined || v === "" ? "—" : v}</span>
    </div>
  );
}

/** Mục RỖNG phải nói vì sao rỗng. */
export function Trong({ children }: { children: ReactNode }) {
  return <p className="lhs-trong">{children}</p>;
}

/** Khung cuộn ngang riêng cho từng bảng (bảng khai `min-width`). */
export function BangCuon({ children }: { children: ReactNode }) {
  return <div className="lhs-bangwrap">{children}</div>;
}

/** "860 × 650 mm" — thiếu một chiều thì cả cặp vô nghĩa ⇒ `null`. */
export function khoMm(dai: number | null, rong: number | null): string | null {
  if (dai == null || rong == null) return null;
  return `${so(dai)} × ${so(rong)} mm`;
}

export type TongDonVi = { don_vi: string | null; tot: number; hong: number };

/** Cộng các mẻ của MỘT công việc, tách theo đơn vị (mã). Mỗi đơn vị một dòng — không cộng hai thang. */
export function tongMeTheoDonVi(batch: LenhSxSanLuongBatch[]): TongDonVi[] {
  const theo = new Map<string, TongDonVi>();
  for (const b of batch) {
    const k = b.don_vi ?? "";
    const t = theo.get(k) ?? { don_vi: b.don_vi, tot: 0, hong: 0 };
    t.tot += b.tot;
    t.hong += b.hong;
    theo.set(k, t);
  }
  return [...theo.values()];
}

/** "480 tờ" — số kèm TÊN đơn vị (không bày mã). */
export function soDv(v: number, dv: string | null): string {
  return dv ? `${so(v)} ${nhanDonVi(dv)}` : so(v);
}
