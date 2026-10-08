/** Điều kiện lọc DÙNG CHUNG của hai sổ phiếu — Phiếu chi và Phiếu thu (đặc tả PC-1, PT-1, A.18),
 *  đặt trên thanh lọc chung `ThanhLoc` (06/10/2026).
 *
 *  Hai màn có cùng năm điều kiện: Số tiền (khoảng), Hình thức, Nguồn (nhiều), Tài khoản công ty và
 *  Chứng từ. Chỉ khác danh sách nguồn và chữ — phần đó do từng màn khai. Tên người nhận / người nộp
 *  tìm bằng ô tìm (máy chủ so cả tên người trong `q`). File này là hàm thuần, không React.
 */
import { ArrowLeftRight, Banknote, Landmark, Layers, Paperclip } from "lucide-react";

import type { CompanyBankAccountRow, LocPhieu, TheLoc as SoTheLoc } from "../../../api/client";
import { dkTheoTab, type DieuKien, type GiaTriDK } from "../../thanh-loc/thanh-loc";

/** Bộ lọc ĐÃ ÁP. `nguon` là khoá GIAO DIỆN — một khoá có thể gom nhiều `source_type` (xem `nguonGui`
 *  của từng màn). */
export type LocNangCao = {
  tien_tu?: number;
  tien_den?: number;
  hinh_thuc?: "cash" | "bank_transfer";
  nguon: string[];
  tai_khoan_id?: number;
  chung_tu?: "co" | "thieu";
};

export const LOC_TRONG: LocNangCao = { nguon: [] };

/** Phần tham số máy chủ do bộ lọc quyết định (không gồm thẻ, kỳ, ô tìm). */
export function thamSoNangCao(
  loc: LocNangCao,
  nguonGui: (nguon: string[]) => string[] = (n) => n,
): Pick<LocPhieu, "tien_tu" | "tien_den" | "hinh_thuc" | "nguon" | "tai_khoan_id"> {
  return {
    tien_tu: loc.tien_tu,
    tien_den: loc.tien_den,
    hinh_thuc: loc.hinh_thuc,
    nguon: nguonGui(loc.nguon),
    tai_khoan_id: loc.tai_khoan_id,
  };
}

export function soDieuKien(loc: LocNangCao): number {
  let n = 0;
  if (loc.tien_tu != null || loc.tien_den != null) n++;
  if (loc.hinh_thuc) n++;
  if (loc.nguon.length) n++;
  if (loc.tai_khoan_id != null) n++;
  if (loc.chung_tu) n++;
  return n;
}

/* ---------- Điều kiện trên thanh lọc ---------- */

const HINH_THUC: GiaTriDK[] = [
  { value: "cash", nhan: "Tiền mặt" },
  { value: "bank_transfer", nhan: "Chuyển khoản" },
];
const CHUNG_TU: GiaTriDK[] = [
  { value: "co", nhan: "Đã có" },
  { value: "thieu", nhan: "Còn thiếu" },
];

/** Chữ riêng của từng sổ. */
export type CauHinhLocPhieu = {
  /** "Nguồn chi" / "Nguồn thu". */
  nhanNguon: string;
  nguonLuaChon: [string, string][];
  /** "Trả từ tài khoản" / "Vào tài khoản". */
  nhanTaiKhoan: string;
};

export function tenTaiKhoan(tk: Pick<CompanyBankAccountRow, "bank_name" | "account_number">): string {
  return `${tk.bank_name} ${tk.account_number}`;
}

/** Điều kiện của một sổ phiếu. `taiKhoan` null = không có quyền xem Tài khoản ngân hàng ⇒ không có
 *  điều kiện tài khoản. */
export function dieuKienPhieu(ch: CauHinhLocPhieu, taiKhoan: CompanyBankAccountRow[] | null): DieuKien<LocNangCao>[] {
  const ds: DieuKien<LocNangCao>[] = [
    {
      khoa: "tien", nhan: "Số tiền", icon: Banknote, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.tien_tu, l.tien_den],
      ghi: (l, tu, den) => ({ ...l, tien_tu: tu, tien_den: den }),
    },
    {
      khoa: "hinh_thuc", nhan: "Hình thức", icon: ArrowLeftRight, kieu: "mot", giaTri: HINH_THUC,
      doc: (l) => l.hinh_thuc,
      ghi: (l, v) => ({ ...l, hinh_thuc: v as LocNangCao["hinh_thuc"] }),
    },
    {
      khoa: "nguon", nhan: ch.nhanNguon, icon: Layers, kieu: "nhieu",
      giaTri: ch.nguonLuaChon.map(([value, nhan]) => ({ value, nhan })),
      doc: (l) => l.nguon,
      ghi: (l, v) => ({ ...l, nguon: v }),
    },
  ];
  if (taiKhoan) {
    ds.push({
      khoa: "tai_khoan", nhan: ch.nhanTaiKhoan, icon: Landmark, kieu: "mot",
      tim: true, giaTri: taiKhoan.map((tk) => ({ value: String(tk.id), nhan: tenTaiKhoan(tk) })),
      doc: (l) => (l.tai_khoan_id == null ? undefined : String(l.tai_khoan_id)),
      ghi: (l, v) => ({ ...l, tai_khoan_id: v == null ? undefined : Number(v) }),
    });
  }
  ds.push({
    khoa: "chung_tu", nhan: "Chứng từ", icon: Paperclip, kieu: "mot", giaTri: CHUNG_TU,
    doc: (l) => l.chung_tu,
    ghi: (l, v) => ({ ...l, chung_tu: v as LocNangCao["chung_tu"] }),
  });
  return ds;
}

/** Điều kiện "Trạng thái" trong nút Lọc = hàng thẻ lọc của sổ (07/10/2026): đọc/ghi thẳng thẻ đang
 *  chọn, không state thứ hai. `muc` là các thẻ CÓ BẢNG (Phiếu chi bỏ "Gia công chờ chi" — thẻ đó
 *  thay cả bảng lẫn thanh lọc). Số đếm lấy từ `the_loc` máy chủ trả. */
export function dkTrangThaiPhieu(o: {
  /** Chỉ cần mã + nhãn của mục dải tab (`MucTab`). */
  muc: { id: string; nhan: string }[];
  n: SoTheLoc | null;
  dang: string;
  dat: (id: string) => void;
}): DieuKien<LocNangCao> {
  const so = (id: string): number | undefined => {
    if (!o.n) return undefined;
    if (id === "xong") return o.n.xong;
    if (id === "thieu") return o.n.thieu_chung_tu;
    if (id === "da_huy") return o.n.da_huy;
    if (id === "cho") return o.n.cho;
    return undefined;
  };
  return dkTheoTab<LocNangCao>({
    tabs: o.muc.map((m) => ({ id: m.id, nhan: m.nhan, so: so(m.id) })),
    tatCa: "tat_ca",
    dang: o.dang,
    dat: o.dat,
  });
}

/* ---------- URL (đặc tả A.18) ---------- */

/** Số nguyên dương an toàn từ URL; rác thì undefined. */
export function soDuong(v: string | null): number | undefined {
  if (v == null || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** Bộ lọc → khoá URL. `nguonUrl` = cặp [khoá giao diện, mã ngắn trên URL] của màn.
 *  Giá trị mặc định ⇒ undefined (khoá bị bỏ khỏi URL). */
export function locNangCaoLenUrl(loc: LocNangCao, nguonUrl: [string, string][]): Record<string, string | undefined> {
  const nguon = loc.nguon
    .map((n) => nguonUrl.find(([k]) => k === n)?.[1])
    .filter((n): n is string => !!n);
  return {
    tien_tu: loc.tien_tu != null ? String(loc.tien_tu) : undefined,
    tien_den: loc.tien_den != null ? String(loc.tien_den) : undefined,
    hinh_thuc: loc.hinh_thuc,
    nguon: nguon.length ? nguon.join(",") : undefined,
    tk: loc.tai_khoan_id != null ? String(loc.tai_khoan_id) : undefined,
    chung_tu: loc.chung_tu,
  };
}

/** Khoá URL → bộ lọc. Giá trị rác thì bỏ qua từng khoá (không làm hỏng cả bộ lọc). */
export function locNangCaoTuUrl(p: URLSearchParams, nguonUrl: [string, string][]): LocNangCao {
  const loc: LocNangCao = { nguon: [] };
  const tienTu = soDuong(p.get("tien_tu"));
  const tienDen = soDuong(p.get("tien_den"));
  if (tienTu != null) loc.tien_tu = tienTu;
  if (tienDen != null) loc.tien_den = tienDen;
  const ht = p.get("hinh_thuc");
  if (ht === "cash" || ht === "bank_transfer") loc.hinh_thuc = ht;
  loc.nguon = (p.get("nguon") ?? "")
    .split(",")
    .map((m) => nguonUrl.find(([, ngan]) => ngan === m)?.[0])
    .filter((n): n is string => !!n);
  const tk = soDuong(p.get("tk"));
  if (tk != null && tk > 0) loc.tai_khoan_id = tk;
  const ct = p.get("chung_tu");
  if (ct === "co" || ct === "thieu") loc.chung_tu = ct;
  return loc;
}
