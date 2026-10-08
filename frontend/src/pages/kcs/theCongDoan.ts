// Hàm thuần của form KCS cuối "xét theo công đoạn" (`docs/design-tieu-chi-kcs-lam-lai.md` §3a, cách
// 3): gom tiêu chí gộp thành thẻ công đoạn, tự điền mô tả từ mục hỏng, lý do khoá nút Lưu, kết quả
// từng tiêu chí gửi máy chủ. Tách khỏi component để test không cần DOM.
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

/** Một thẻ công đoạn — các tiêu chí gộp của MỘT công việc nguồn, theo thứ tự chuỗi. */
export interface TheCd {
  cvId: number;
  ten: string;
  /** Chữ phụ dưới tên khi tiêu chí thuộc lệnh phụ cùng nhóm. */
  phu: string | null;
  tieuChi: SxKcsChiTietTieuChi[];
}

export type TrangThaiThe =
  | { loai: "chua" }
  | { loai: "dat" }
  | { loai: "loi"; hong: Set<number>; so: string; moTa: string; suaTay: boolean; anh: AnhCho[] };

export const tenTieuChi = (tc: SxKcsChiTietTieuChi): string => tc.ten ?? tc.ma ?? `Tiêu chí #${tc.thu_tu}`;

/** "Lệnh phụ Bìa sách A5 LSX26-0004" cho tiêu chí gộp từ lệnh phụ, `null` nếu là của lệnh đang kiểm. */
export const nhanLenhPhu = (tc: SxKcsChiTietTieuChi): string | null =>
  tc.la_lenh_phu ? `Lệnh phụ ${[tc.ten_lenh, tc.lsx_ma].filter(Boolean).join(" ")}`.trim() : null;

/** Gom danh sách gộp thành thẻ theo công việc nguồn, giữ thứ tự máy chủ trả. Mục cũ thiếu
 *  `cong_viec_id` là của chính công việc đang kiểm (`cvMacDinh`). */
export function gomThe(checklist: SxKcsChiTietTieuChi[], cvMacDinh: number, tenMacDinh = "Công đoạn"): TheCd[] {
  const theo = new Map<number, TheCd>();
  for (const tc of checklist) {
    const cvId = tc.cong_viec_id ?? cvMacDinh;
    let the = theo.get(cvId);
    if (!the) {
      the = {
        cvId,
        ten: tc.ten_cong_doan || tenMacDinh,
        phu: nhanLenhPhu(tc),
        tieuChi: [],
      };
      theo.set(cvId, the);
    }
    the.tieuChi.push(tc);
  }
  return [...theo.values()];
}

/** "Đạt hết N công đoạn còn lại": chỉ thẻ CHƯA xét chuyển sang Đạt, thẻ đã chọn Có lỗi giữ nguyên. */
export function datHetConLai(the: TheCd[], tt: Map<number, TrangThaiThe>): Map<number, TrangThaiThe> {
  const moi = new Map(tt);
  for (const t of the) if ((tt.get(t.cvId)?.loai ?? "chua") === "chua") moi.set(t.cvId, { loai: "dat" });
  return moi;
}

/** Mô tả tự điền: tên các mục hỏng, mỗi mục một dòng, theo thứ tự tiêu chí. */
export function moTaTuDien(the: TheCd, hong: Set<number>): string {
  return the.tieuChi.filter((tc) => hong.has(tc.thu_tu)).map(tenTieuChi).join("\n");
}

/** Mô tả đang bày ở thẻ: đã sửa tay thì giữ chữ người gõ, chưa thì tự điền theo mục hỏng. */
export function moTaThe(the: TheCd, tt: Extract<TrangThaiThe, { loai: "loi" }>): string {
  return tt.suaTay ? tt.moTa : moTaTuDien(the, tt.hong);
}

const thuong = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** MỘT lý do khoá nút Lưu, theo thứ tự §3a — null là lưu được. Hai trần cuối (tổng lỗi, số ảnh) là
 *  của cả lần kiểm, tính trên mọi thẻ cộng dòng lỗi thủ công. */
export function lyDoKhoa(
  the: TheCd[],
  tt: Map<number, TrangThaiThe>,
  { chuaKiem, tongLoi, soAnh }: { chuaKiem: number; tongLoi: number; soAnh: number },
): string | null {
  const cua = (t: TheCd): TrangThaiThe => tt.get(t.cvId) ?? { loai: "chua" };
  const con = the.filter((t) => cua(t).loai === "chua").length;
  if (con > 0) return `Còn ${con} công đoạn chưa xét`;
  const loi = the.flatMap((t) => {
    const s = cua(t);
    return s.loai === "loi" ? [{ t, s }] : [];
  });
  const chuaTick = loi.find(({ s }) => s.hong.size === 0);
  if (chuaTick) return `Tick mục hỏng của ${thuong(chuaTick.t.ten)}`;
  for (const { t, s } of loi) {
    if (!(Number(s.so) > 0)) return `Gõ số lỗi cho ${thuong(t.ten)}`;
    if (s.anh.length === 0) return `Chụp ít nhất một ảnh lỗi ${thuong(t.ten)}`;
  }
  if (tongLoi > chuaKiem) return `Tổng lỗi vượt phần chưa kiểm (${num(chuaKiem)})`;
  if (soAnh > TOI_DA_ANH_MOI_LAN) return `Tối đa ${TOI_DA_ANH_MOI_LAN} ảnh mỗi lần kiểm`;
  return null;
}

/** Kết quả từng tiêu chí: thẻ Đạt ⇒ mọi mục đạt; thẻ Có lỗi ⇒ mục tick hỏng `dat=false`, còn lại đạt.
 *  Ghi chú từng tiêu chí đã bỏ (ghi chú chung của lần kiểm thay). */
export function ketQuaChecklist(the: TheCd[], tt: Map<number, TrangThaiThe>): SxKcsChecklistKetQuaIn[] {
  return the.flatMap((t) => {
    const s = tt.get(t.cvId);
    return t.tieuChi.map((tc) => ({
      cong_viec_id: t.cvId,
      thu_tu: tc.thu_tu,
      dat: !(s?.loai === "loi" && s.hong.has(tc.thu_tu)),
      ghi_chu: null,
    }));
  });
}
