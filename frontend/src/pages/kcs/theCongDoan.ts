// Hàm thuần của form Kiểm hàng bước cuối (`KcsKiemForm`). Từ 11/10/2026 form đi theo khuôn hộp Ghi
// lỗi: tiêu chí gộp cả chuỗi (kể cả lệnh phụ cùng nhóm) chia nhóm theo lệnh → công đoạn; tiêu chí
// không đạt thì tick, không tick là đạt. Tách khỏi component để test không cần DOM.
import type { SxKcsChecklistKetQuaIn, SxKcsChiTietTieuChi } from "../../api/client";
import { num } from "../keHoachSxShared";

/** Máy chủ nhận tối đa 10 ảnh cho MỘT lần kiểm (cộng mọi dòng lỗi), quá thì trả 400. */
export const TOI_DA_ANH_MOI_LAN = 10;

/** Một ảnh đang chờ gửi: file (đã nén nếu lợi) + URL xem ngay + cỡ gốc để nói đã nén bao nhiêu. */
export interface AnhCho {
  id: number;
  file: File;
  url: string;
  goc: number;
}

/** Tiêu chí gộp của MỘT công việc nguồn, theo thứ tự chuỗi. */
export interface TheCd {
  cvId: number;
  ten: string;
  /** Lệnh của công đoạn — `laPhu` khi là lệnh phụ cùng nhóm. */
  lsxMa: string | null;
  tenLenh: string | null;
  laPhu: boolean;
  tieuChi: SxKcsChiTietTieuChi[];
}

export const tenTieuChi = (tc: SxKcsChiTietTieuChi): string => tc.ten ?? tc.ma ?? `Tiêu chí #${tc.thu_tu}`;

/** "Lệnh phụ Bìa sách A5 LSX26-0004" cho tiêu chí gộp từ lệnh phụ, `null` nếu là của lệnh đang kiểm. */
export const nhanLenhPhu = (tc: SxKcsChiTietTieuChi): string | null =>
  tc.la_lenh_phu ? `Lệnh phụ ${[tc.ten_lenh, tc.lsx_ma].filter(Boolean).join(" ")}`.trim() : null;

/** Gom danh sách gộp theo công việc nguồn, giữ thứ tự máy chủ trả. Mục cũ thiếu `cong_viec_id` là
 *  của chính công việc đang kiểm (`cvMacDinh`). */
export function gomThe(checklist: SxKcsChiTietTieuChi[], cvMacDinh: number, tenMacDinh = "Công đoạn"): TheCd[] {
  const theo = new Map<number, TheCd>();
  for (const tc of checklist) {
    const cvId = tc.cong_viec_id ?? cvMacDinh;
    let the = theo.get(cvId);
    if (!the) {
      the = {
        cvId,
        ten: tc.ten_cong_doan || tenMacDinh,
        lsxMa: tc.lsx_ma ?? null,
        tenLenh: tc.ten_lenh ?? null,
        laPhu: Boolean(tc.la_lenh_phu),
        tieuChi: [],
      };
      theo.set(cvId, the);
    }
    the.tieuChi.push(tc);
  }
  return [...theo.values()];
}

/** Nhóm theo LỆNH (lệnh phụ trước, theo thứ tự chuỗi) — tên lệnh phụ chỉ nói một lần ở đầu nhóm. */
export function nhomTheoLenh(the: TheCd[]): { khoa: string; lsxMa: string | null; tenLenh: string | null; laPhu: boolean; cd: TheCd[] }[] {
  const out: { khoa: string; lsxMa: string | null; tenLenh: string | null; laPhu: boolean; cd: TheCd[] }[] = [];
  for (const t of the) {
    const khoa = t.laPhu ? `phu:${t.lsxMa ?? ""}` : "chinh";
    let n = out.find((x) => x.khoa === khoa);
    if (!n) {
      n = { khoa, lsxMa: t.lsxMa, tenLenh: t.tenLenh, laPhu: t.laPhu, cd: [] };
      out.push(n);
    }
    n.cd.push(t);
  }
  return out;
}

/** Khoá một dòng tick: tiêu chí `cv:thu_tu`, "Lỗi khác" là `KHAC`. */
export const KHAC = "khac";
export const khoaTc = (cvId: number, thuTu: number) => `${cvId}:${thuTu}`;

/** Một dòng đang tick. `cvId` = công đoạn chịu lỗi (tiêu chí: cố định; Lỗi khác: KCS chọn). */
export interface DongKiem {
  cvId: number;
  so: string;
  ghi: string;
  anh: AnhCho[];
}

/** Kết quả mọi tiêu chí gửi máy chủ: tiêu chí đang tick là không đạt, còn lại đạt. */
export function ketQuaChecklist(the: TheCd[], dangTick: Set<string>): SxKcsChecklistKetQuaIn[] {
  return the.flatMap((t) => t.tieuChi.map((tc) => ({
    cong_viec_id: t.cvId,
    thu_tu: tc.thu_tu,
    dat: !dangTick.has(khoaTc(t.cvId, tc.thu_tu)),
    ghi_chu: null,
  })));
}

/** MỘT lý do chưa lưu được, theo thứ tự người kiểm gặp phải — null là lưu được. `dong` theo thứ tự
 *  trên màn, mỗi dòng kèm tên để nói. */
export function lyDoKiem(
  dong: { khoa: string; ten: string; d: DongKiem }[],
  { chuaKiem, dv }: { chuaKiem: number; dv: string },
): string | null {
  if (chuaKiem <= 0) return "Tổ chưa ghi thêm sản lượng từ lần kiểm trước";
  for (const { khoa, ten, d } of dong) {
    if (!(Number(d.so) > 0)) return `Nhập số lỗi cho ${ten}`;
    if (khoa === KHAC && !d.ghi.trim()) return "Ghi chú Lỗi khác là lỗi gì";
    if (d.anh.length === 0) return `Chụp ít nhất một ảnh cho ${ten}`;
  }
  const tong = dong.reduce((s, { d }) => s + (Number(d.so) > 0 ? Number(d.so) : 0), 0);
  if (tong > chuaKiem) return `Tổng lỗi vượt số chưa kiểm (${num(chuaKiem)} ${dv})`.replace(/ \)$/, ")");
  const soAnh = dong.reduce((n, { d }) => n + d.anh.length, 0);
  if (soAnh > TOI_DA_ANH_MOI_LAN) return `Tối đa ${TOI_DA_ANH_MOI_LAN} ảnh mỗi lần kiểm, bỏ bớt ${soAnh - TOI_DA_ANH_MOI_LAN} ảnh`;
  return null;
}
