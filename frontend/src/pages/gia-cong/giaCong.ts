/** Hàm THUẦN của Gia công ngoài (spec docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md).
 *  Không gọi API, không React — vitest soi thẳng. */
import type { GiaCongNgoaiLan, GiaCongNoiVe, GiaCongTrangThai, LsxLoaiBuoc } from "../../api/client";

/** Tối thiểu một bước cần có để suy dải — `EditRow` của bảng routing khớp kiểu này. */
export interface BuocDai {
  /** `step_key` — khớp `LsxCongDoanPhuThuoc.buoc_truoc_id`/`buoc_sau_id` ở server. */
  key: string;
  ten: string;
  loai_buoc: LsxLoaiBuoc;
  nha_cung_cap_id: number | null;
  /** Tiền nhiệm TRỰC TIẾP của bước này (cạnh DAG `truoc → bước này`). */
  phu_thuoc_step_keys: string[];
}

export interface ViTriDai {
  /** Tên bước liền trước CÙNG lần (null = bước này mở đầu lần). */
  truoc: string | null;
  /** Tên bước liền sau CÙNG lần (null = bước này là cuối lần). */
  sau: string | null;
  /** Bước cuối của lần — nơi khai đơn giá CẢ lần. */
  laCuoi: boolean;
}

/** Lệnh có khai ÍT NHẤT một cạnh phụ thuộc không — routing tuyến tính cũ (chưa từng khai cạnh
 *  nào) thì "liền nhau" lùi về so THỨ TỰ MẢNG, đúng luật server (`_quet_dai_thue_ngoai`). */
function coCanhNao(rows: BuocDai[]): boolean {
  return rows.some((r) => r.phu_thuoc_step_keys.length > 0);
}

/** Có cạnh DAG `a → c` không (c liệt `a.key` trong tiền nhiệm trực tiếp của nó). */
function coCanh(a: BuocDai, c: BuocDai): boolean {
  return c.phu_thuoc_step_keys.includes(a.key);
}

function cungLan(rows: BuocDai[], a: BuocDai | undefined, c: BuocDai | undefined): boolean {
  if (!a || !c) return false;
  if (a.loai_buoc !== "thue_ngoai" || c.loai_buoc !== "thue_ngoai") return false;
  if (a.nha_cung_cap_id == null || a.nha_cung_cap_id !== c.nha_cung_cap_id) return false;
  // "Liền nhau" đi theo CẠNH DAG — hai nhánh song song của cùng một bước cha KHÔNG liền nhau, dù
  // đứng sát nhau trong mảng `rows`. Routing KHÔNG khai cạnh nào (tuyến tính cũ) thì lùi về so
  // thứ tự mảng, cùng luật `_quet_dai_thue_ngoai` (`services/gia_cong_ngoai/lan.py`).
  return !coCanhNao(rows) || coCanh(a, c);
}

/** Vị trí của bước `i` trong DẢI gia công. Cùng luật với máy chủ lúc phát hành
 *  (`services/gia_cong_ngoai/lan.py::gom_lan_khi_phat_hanh` → `_quet_dai_thue_ngoai` +
 *  `_canh_ke_tiep`): các bước Thuê ngoài LIỀN NHAU theo CẠNH DAG (không phải theo thứ tự bảng),
 *  CÙNG nhà gia công ⇒ MỘT lần. `null` khi bước không phải thuê ngoài. */
export function viTriTrongDai(rows: BuocDai[], i: number): ViTriDai | null {
  const r = rows[i];
  if (!r || r.loai_buoc !== "thue_ngoai") return null;
  const truoc = cungLan(rows, rows[i - 1], r) ? rows[i - 1].ten : null;
  const sau = cungLan(rows, r, rows[i + 1]) ? rows[i + 1].ten : null;
  return { truoc, sau, laCuoi: sau == null };
}

export const NHAN_TRANG_THAI: Record<GiaCongTrangThai, string> = {
  cho_mang_di: "Chờ mang đi",
  dang_o_ngoai: "Đang ở nhà gia công",
  dang_gia_cong: "Đang gia công trọn gói",
  da_xong: "Đã xong",
  da_huy: "Đã huỷ",
};

export const NHAN_NOI_VE: Record<GiaCongNoiVe, string> = {
  xuong: "Về xưởng làm tiếp",
  kho: "Nhập kho thành phẩm",
  khach: "Giao thẳng cho khách",
};

export interface NutLan {
  mangDi: boolean;
  chot: boolean;
  moLai: boolean;
  xuatGiay: boolean;
  huyTronGoi: boolean;
}

/** Nút nào hiện với lần này — cùng các chốt chặn của máy chủ (Task 6–9), để người dùng không bấm
 *  vào một nút chắc chắn bị từ chối. Máy chủ vẫn là nơi quyết. */
export function nutCuaLan(l: GiaCongNgoaiLan): NutLan {
  const motPhan = l.kieu === "mot_phan";
  const conMo = l.trang_thai === "cho_mang_di" || l.trang_thai === "dang_o_ngoai";
  return {
    mangDi: motPhan && conMo
      && (l.sl_cho_mang_di > 0 || (l.trang_thai === "cho_mang_di" && !l.co_buoc_truoc)),
    chot: l.trang_thai === "dang_o_ngoai" || l.trang_thai === "dang_gia_cong",
    moLai: l.trang_thai === "da_xong" && l.phieu_chi == null,
    xuatGiay: l.kieu === "tron_goi" && l.trang_thai === "dang_gia_cong" && l.xuong_cap_giay
      && l.xuat_giay == null,
    huyTronGoi: l.kieu === "tron_goi" && l.trang_thai === "dang_gia_cong",
  };
}

/** Giá trị điền sẵn của mini-form Chốt — "hai click" (spec §7). */
export function goiYChot(l: GiaCongNgoaiLan): { sl: string; noiVe: GiaCongNoiVe | null; dich: number | null } {
  const sl = l.sl_goi_y_chot ?? l.sl_gui ?? l.sl_dat;
  return {
    sl: sl != null ? String(sl) : "",
    noiVe: l.noi_ve_hop_le[0] ?? null,
    dich: l.chang_sau.length === 1 ? l.chang_sau[0].id : null,
  };
}

const so = (n: number) => n.toLocaleString("vi-VN");

/** Dòng tóm tắt sau khi xong (spec §7): "Nguyễn A mang đi 1.660 · Nguyễn A chốt 1.650 · 247.500đ".
 *  `dvTen` dịch mã đơn vị sang tên danh mục (không in thẳng mã). Không có quyền xem tiền thì
 *  `thanh_tien` là null ⇒ không có đoạn tiền. */
export function tomTat(l: GiaCongNgoaiLan, dvTen: (ma: string | null) => string): string {
  const phan: string[] = [];
  if (l.mang_di_boi_ten && l.sl_gui != null) {
    phan.push(`${l.mang_di_boi_ten} mang đi ${so(l.sl_gui)} ${dvTen(l.don_vi_gui)}`.trim());
  }
  if (l.chot_boi_ten && l.sl_cuoi != null) {
    const ve = l.noi_ve ? ` — ${NHAN_NOI_VE[l.noi_ve].toLowerCase()}` : "";
    phan.push(`${l.chot_boi_ten} chốt ${so(l.sl_cuoi)} ${dvTen(l.don_vi)}`.trim() + ve);
  }
  if (l.thanh_tien != null) phan.push(`${so(l.thanh_tien)}đ`);
  if (l.phieu_chi) phan.push(`Phiếu chi ${l.phieu_chi.code}`);
  return phan.join(" · ");
}

type DongChia = NonNullable<GiaCongNgoaiLan["chia_theo_lenh"]>[number];

/** Ô "Nhận" của bảng chia về từng lệnh: số chốt × `he_so_nhan` theo đơn vị bước nhận. Bước nhận ăn
 *  tờ ghép (Cắt, Bế — hệ số 1) thì kèm số con nó sẽ ra, để người chốt thấy phần của lệnh. Máy chủ
 *  cũ chưa trả `he_so_nhan` ⇒ lùi về số con/tờ như trước. */
export function soNhanChia(sl: number, c: DongChia, dvTen: (ma: string | null) => string): string {
  const lam = (n: number) => so(Math.round(n * 1000) / 1000);
  const heSo = c.he_so_nhan ?? c.so_con;
  const nhan = `${lam(sl * heSo)} ${dvTen(c.don_vi)}`.trim();
  return heSo !== c.so_con ? `${nhan} (ra ${lam(sl * c.so_con)} con)` : nhan;
}
