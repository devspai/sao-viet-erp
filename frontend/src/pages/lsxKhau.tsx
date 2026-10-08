// Nhãn và thẻ DÙNG CHUNG của hai màn Hồ sơ lệnh sản xuất + Theo dõi sản xuất + khung hồ sơ một
// lệnh (làm gọn 05/10/2026). Mọi chữ "khâu", "cờ", "chặng" nằm ĐÚNG MỘT chỗ ở đây: hai màn tự đặt
// tên là sớm muộn cùng một lệnh hiện hai chữ.
//
// Lớp CSS ở `lenh-sx-chung.css` (tiền tố `lsc-`). Tệp nào dùng thứ ở đây thì tự import tệp CSS đó.
import type { LenhSxChang, LenhSxKhau, LenhSxKhauChiTiet } from "../api/client";

/** Khâu của lệnh — tab của màn Hồ sơ lệnh, cột Đang ở của Theo lệnh, pill ở đầu hồ sơ. Khoá là hợp
 *  đồng với `trang_thai.KHAU` ở máy chủ. */
export const KHAU_NHAN: Record<LenhSxKhau, string> = {
  dang_sx: "Đang sản xuất",
  sau_sx: "Sau sản xuất",
  da_giao: "Đã giao đủ",
};

/** Chi tiết của khâu Sau sản xuất (`trang_thai.CT_*`). */
export const KHAU_CT_NHAN: Record<LenhSxKhauChiTiet, string> = {
  dang_kcs: "Đang KCS",
  cho_nhap_kho: "Chờ nhập kho",
  san_sang_giao: "Sẵn sàng giao",
};

/** Chữ của một lệnh theo khâu: Sau sản xuất thì nói luôn chi tiết, vì "Sau sản xuất" đứng một mình
 *  không trả lời được "giờ phải làm gì". Khoá lạ (máy chủ thêm sau) hiện chính chuỗi đó. */
export function nhanKhau(khau: string, ct: string | null | undefined): string {
  if (khau === "sau_sx" && ct) return KHAU_CT_NHAN[ct as LenhSxKhauChiTiet] ?? ct;
  return KHAU_NHAN[khau as LenhSxKhau] ?? khau;
}

const KHAU_MAU: Record<string, string> = {
  dang_sx: "lsc-pill--steel",
  sau_sx: "lsc-pill--amber",
  da_giao: "lsc-pill--moss",
};
/** Sau sản xuất tách màu theo chi tiết — ba chặng khác việc thì phải liếc là phân biệt. */
const KHAU_CT_MAU: Record<string, string> = {
  dang_kcs: "lsc-pill--plum",
  cho_nhap_kho: "lsc-pill--amber",
  san_sang_giao: "lsc-pill--teal",
};

/** Pill khâu: Đang sản xuất xanh dương, Đang KCS tím, Chờ nhập kho vàng, Sẵn sàng giao ngọc, Đã
 *  giao đủ lá. */
export function PillKhau({ khau, ct }: { khau: string; ct?: string | null }) {
  const mau = (khau === "sau_sx" && ct && KHAU_CT_MAU[ct]) || KHAU_MAU[khau] || "lsc-pill--off";
  return <span className={`lsc-pill ${mau}`}>{nhanKhau(khau, ct)}</span>;
}

/** Thẻ "Đã đóng lệnh" — KCS đã đóng lệnh (`lsx.trang_thai = da_dong`). Đi KÈM pill khâu, không
 *  thay nó: lệnh đã đóng vẫn có thể còn chờ nhập kho hay chờ giao. */
export function TheDaDong() {
  return <span className="lsc-tag">Đã đóng lệnh</span>;
}

/** Thẻ GẤP của hai màn này — viền đỏ, không nền (không dùng `ChipGap` của Kế hoạch SX: nó mang nền
 *  hồng đã bị gỡ khỏi app). */
export function TheGap() {
  return <span className="lsc-gap">GẤP</span>;
}

/** Bốn cờ của lệnh mà màn Theo dõi đếm (`trang_thai.co_canh_bao` không truyền đèn vật tư) — cộng
 *  `thieu_vat_tu` cho hồ sơ một lệnh. Thứ tự = thứ tự máy chủ trả. */
export const CO_NHAN: Record<string, string> = {
  tre_han: "Trễ hạn",
  su_co: "Sự cố đang mở",
  tam_dung: "Tạm dừng",
  kcs_khong_dat: "KCS không đạt",
  thieu_vat_tu: "Thiếu vật tư",
};

/** Nhãn đọc-ra-lời của một chặng — cho `title` và trình đọc màn hình. Màu không được đứng một mình
 *  mang tin. Khoá lạ rơi về chính chuỗi đó. */
const CHANG_LB: Record<string, string> = {
  xong: "đã xong",
  chay: "đang chạy",
  dung: "tạm dừng",
  cho: "chưa tới",
};

/** Dải chặng nhỏ: mỗi công đoạn một đốt, theo đúng thứ tự máy chủ trả (`danh_sach.chang`). Rỗng
 *  thì không vẽ gì — dải trống trông y hệt "mọi công đoạn chưa tới". */
export function DaiChang({ chang }: { chang: LenhSxChang[] }) {
  if (chang.length === 0) return null;
  const i = chang.findIndex((c) => c.hien_tai);
  const hienTai = i >= 0 ? chang[i] : null;
  return (
    <span
      className="lsc-chang"
      role="img"
      aria-label={
        hienTai
          ? `công đoạn ${i + 1} trên ${chang.length}, ${hienTai.ten} ${CHANG_LB[hienTai.trang_thai] ?? hienTai.trang_thai}`
          : `${chang.length} công đoạn`
      }
    >
      {chang.map((c, k) => (
        <i
          key={k}
          className={`lsc-chang__dot lsc-chang__dot--${c.trang_thai}${c.hien_tai ? " is-now" : ""}`}
          title={`${c.ten} — ${CHANG_LB[c.trang_thai] ?? c.trang_thai}`}
        />
      ))}
    </span>
  );
}

/** "bước i trên n" từ dải chặng; không có đốt hiện tại thì trả `null`. */
export function buocThu(chang: LenhSxChang[]): string | null {
  const i = chang.findIndex((c) => c.hien_tai);
  return i >= 0 ? `bước ${i + 1} trên ${chang.length}` : null;
}
