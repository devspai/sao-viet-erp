/** MỘT độ rộng cho MỌI ngăn mở từ bên phải của cả hệ thống (kế toán, đơn hàng, giao hàng, tồn kho…).
 *
 *  Độ rộng là biến CSS `--kt-ngan-w` đặt ở gốc tài liệu: kéo ngăn nào thì mọi ngăn đổi theo, kể cả
 *  ngăn chồng (cùng độ rộng nên che kín ngăn dưới). Nhớ trong localStorage một khoá duy nhất; số
 *  lưu rác thì về mặc định.
 *
 *  07/10/2026: nới mặc định 920 → 1180px (ngăn Tồn kho cần hai cột: dự báo + ảnh/tem). Đổi luôn khoá
 *  lưu — số cũ 920 nằm trong localStorage của mọi người, giữ khoá cũ thì không ai thấy chuẩn mới.
 *  Mọi số (kể cả mặc định) đều kẹp trong [480, sát thanh bên].
 */
export const DO_RONG_MAC_DINH = 1180;
export const DO_RONG_MIN = 480;
export const KHOA_LUU = "kt-ngan-rong-2";

/** Rộng nhất = sát thanh bên (232px). Màn hẹp hơn 712px thì vẫn giữ tối thiểu 480px. */
export function doRongToiDa(): number {
  return Math.max(DO_RONG_MIN, window.innerWidth - 232);
}

/** Mặc định 1180px nhưng không vượt mức trần của màn hiện tại (màn 1366px ⇒ 1134px). */
function macDinh(): number {
  return Math.min(DO_RONG_MAC_DINH, doRongToiDa());
}

/** Độ rộng đang đặt trên gốc tài liệu trong phiên này (NaN nếu chưa đặt). */
function dangDat(): number {
  return parseFloat(document.documentElement.style.getPropertyValue("--kt-ngan-w"));
}

const kep = (n: number) => Math.min(doRongToiDa(), Math.max(DO_RONG_MIN, n));

export function docDoRong(): number {
  try {
    const n = Number(localStorage.getItem(KHOA_LUU));
    return n >= DO_RONG_MIN ? kep(n) : macDinh();
  } catch {
    // localStorage bị chặn: giữ số vừa kéo trong phiên (đang nằm trên gốc tài liệu) thay vì
    // nhảy về mặc định mỗi lần mở ngăn mới hay đổi cỡ cửa sổ.
    const v = dangDat();
    return Number.isFinite(v) && v >= DO_RONG_MIN ? kep(v) : macDinh();
  }
}

/** Đặt độ rộng (kẹp trong [480, sát thanh bên]) cho mọi ngăn và nhớ lại. */
export function ghiDoRong(px: number): void {
  const w = Math.round(kep(px));
  document.documentElement.style.setProperty("--kt-ngan-w", `${w}px`);
  try {
    localStorage.setItem(KHOA_LUU, String(w));
  } catch {
    /* bỏ qua — vẫn đổi được độ rộng trong phiên, `docDoRong` đọc lại từ biến CSS */
  }
}

/** "Mở rộng": đang rộng hết thì trả về mặc định (đã kẹp), không thì bung sát thanh bên.
 *  So với số ĐÃ KẸP nên trên màn hẹp nút này không bao giờ làm ngăn hẹp lại. */
export function batTatRongHet(): void {
  const toiDa = doRongToiDa();
  const v = dangDat();
  const hienTai = Math.min(Number.isFinite(v) ? v : docDoRong(), toiDa);
  ghiDoRong(hienTai >= toiDa - 4 ? macDinh() : toiDa);
}
