// Hàm thuần của màn Tiêu chí KCS (`docs/design-tieu-chi-kcs-lam-lai.md` §6) — tách khỏi component
// để test được không cần DOM: tìm công đoạn đích trong hộp chép, đếm câu sẽ chép / bỏ qua, chuẩn
// hoá bản soạn, đổi chỗ khi kéo thả, gom theo giai đoạn.
import type { KcsKhaiBaoCongDoan } from "../../../api/client";
import { khopGanDung } from "../../../utils/timGanDung";
import { NHOM_CONG_DOAN } from "../../keHoachSxShared";

export type CongDoanTc = KcsKhaiBaoCongDoan;

/** Thứ tự giai đoạn cố định (như máy chủ); "" = công đoạn chưa khai giai đoạn, đứng cuối. */
export const THU_TU_GD = ["prepress", "print", "finishing", "other"] as const;

/** Sắc chip giai đoạn — CHỈ chip giai đoạn có màu (§6 "Màu sắc"), lấy từ bộ `--tt-*`. */
const MAU_GD: Record<string, string> = { prepress: "cyan", print: "xanh", finishing: "tim", other: "cam" };
export const mauGd = (nhom: string): string => MAU_GD[nhom] ?? "slate";

export const nhanGd = (nhom: string): string => NHOM_CONG_DOAN[nhom] ?? "Chưa xếp giai đoạn";

/** Chuỗi đem so khi tìm công đoạn: mã + tên + nhãn giai đoạn ("sau in boi" ra Bồi sóng). */
export const chuoiTimCongDoan = (cd: CongDoanTc): string => `${cd.ma} ${cd.ten} ${nhanGd(cd.nhom)}`;

/** Lọc danh sách đích theo ô tìm (ở trình duyệt — vài chục dòng, không phân trang). `chonDuoc` =
 *  các dòng khớp mà "Chọn cả N" sẽ tick: trừ nguồn và dòng đã chọn. */
export function locDich(
  ds: CongDoanTc[], q: string, nguonId: number | null, daChon: Set<number>,
): { khop: CongDoanTc[]; chonDuoc: CongDoanTc[] } {
  const khop = ds.filter((c) => khopGanDung(chuoiTimCongDoan(c), q));
  return {
    khop,
    chonDuoc: khop.filter((c) => c.cong_doan_id !== nguonId && !daChon.has(c.cong_doan_id)),
  };
}

/** Câu sẽ thêm mới / bỏ qua (đích đã có, so sau khi cắt khoảng trắng) khi chép `cau` vào `dich`. */
export function demChep(
  dich: CongDoanTc[], cau: string[],
): { moi: number; bo: number; trungTheoDich: Map<number, number> } {
  const sach = chuanCau(cau);
  const trungTheoDich = new Map<number, number>();
  let moi = 0;
  let bo = 0;
  for (const d of dich) {
    const co = new Set(d.hang_muc.map((h) => h.ten.trim()));
    const trung = sach.filter((c) => co.has(c)).length;
    trungTheoDich.set(d.cong_doan_id, trung);
    bo += trung;
    moi += sach.length - trung;
  }
  return { moi, bo, trungTheoDich };
}

/** Cắt khoảng trắng, bỏ câu rỗng, khử trùng giữ thứ tự — cùng luật máy chủ ở `chep`. */
export function chuanCau(ds: string[]): string[] {
  const out: string[] = [];
  for (const c of ds) {
    const t = c.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Mảng MỚI với phần tử ở `tu` chuyển sang vị trí `den` (kéo thả). Không đổi thì trả lại mảng cũ. */
export function doiCho<T>(ds: T[], tu: number, den: number): T[] {
  if (tu === den || tu < 0 || den < 0 || tu >= ds.length || den >= ds.length) return ds;
  const out = ds.slice();
  const [x] = out.splice(tu, 1);
  out.splice(den, 0, x);
  return out;
}

/** Gom theo giai đoạn đúng thứ tự cố định; giai đoạn không còn công đoạn nào thì không hiện. */
export function gomTheoGd(ds: CongDoanTc[]): { nhom: string; cong_doan: CongDoanTc[] }[] {
  const theo = new Map<string, CongDoanTc[]>();
  for (const c of ds) {
    const k = c.nhom || "";
    theo.set(k, [...(theo.get(k) ?? []), c]);
  }
  const khoa = [...THU_TU_GD, ...[...theo.keys()].filter((k) => !(THU_TU_GD as readonly string[]).includes(k))];
  return khoa.filter((k) => theo.has(k)).map((k) => ({ nhom: k, cong_doan: theo.get(k)! }));
}
