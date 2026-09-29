// Nén ảnh NGAY TRÊN MÁY người dùng trước khi tải lên.
//
// Vì sao cần: thợ chụp ảnh chứng thực bằng điện thoại, mỗi tấm 4–8MB. Một phiếu 5 tấm là ~30MB đẩy
// qua wifi xưởng — chậm tới mức người ta bỏ dở giữa chừng, mà phiếu không có ảnh thì không đóng
// được. Nén còn cạnh dài 1600px / JPEG 80% thì mỗi tấm ~350–450KB: vẫn nhìn rõ bộ phận máy, vết
// dầu, dao bế mòn (thứ tấm ảnh này sinh ra để chứng minh), nhưng nhẹ hơn ~15 lần.
//
// LUẬT QUAN TRỌNG: nén hỏng thì trả lại FILE GỐC, không bao giờ chặn người dùng. HEIC của iPhone
// nhiều trình duyệt không giải mã được — thà tải lên 6MB còn hơn báo lỗi cho một người đang đứng
// giữa xưởng cầm điện thoại.
export const CANH_TOI_DA = 1600;
export const CHAT_LUONG = 0.8;
/** Dưới ngưỡng này thì nén cũng chẳng bớt bao nhiêu, mà còn làm mờ thêm một lần. */
export const NGUONG_BO_QUA = 600 * 1024;

export interface KetQuaNen {
  /** File để tải lên — là file gốc nếu không nén được hoặc nén không lợi. */
  file: File;
  goc: number;
  sau: number;
  daNen: boolean;
}

/** "6,2 MB" / "380 KB" — để nói với người dùng đã tiết kiệm được bao nhiêu. */
export function coChu(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function doiDuoiJpg(ten: string): string {
  const goc = ten.replace(/\.[^.]+$/, "");
  return `${goc || "anh"}.jpg`;
}

export async function nenAnh(file: File): Promise<KetQuaNen> {
  return nenTheo(file, CANH_TOI_DA, CHAT_LUONG, NGUONG_BO_QUA);
}

async function nenTheo(
  file: File,
  canhDai: number,
  chatLuong: number,
  nguong: number,
): Promise<KetQuaNen> {
  const goc = file.size;
  const nguyen: KetQuaNen = { file, goc, sau: goc, daNen: false };

  // GIF: nén là mất ảnh động. Không phải ảnh: để nguyên, backend tự chặn nếu không hợp lệ.
  if (!laAnhNenDuoc(file) || goc <= nguong) {
    return nguyen;
  }

  try {
    // `imageOrientation: "from-image"` để ảnh chụp dọc bằng điện thoại không bị quay ngang: vẽ lên
    // canvas là mất thẻ EXIF, không khai cờ này thì ảnh nằm nghiêng sau khi nén.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const ti = Math.min(1, canhDai / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * ti));
    const h = Math.max(1, Math.round(bitmap.height * ti));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return nguyen;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((ok) =>
      canvas.toBlob(ok, "image/jpeg", chatLuong));
    // Ảnh nhỏ sẵn, hoặc PNG chụp màn hình nhiều mảng phẳng: JPEG có khi còn to hơn ⇒ giữ bản gốc.
    if (!blob || blob.size >= goc) return nguyen;

    return {
      file: new File([blob], doiDuoiJpg(file.name), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      }),
      goc,
      sau: blob.size,
      daNen: true,
    };
  } catch {
    return nguyen;   // HEIC không giải mã được, canvas bị chặn… — tải bản gốc, đừng chặn người dùng
  }
}

// --- Nén TỰ ĐỘNG ở tầng gửi request (mọi FormData đi qua `request()` trong api/client.ts) --------
//
// Trước 28/09/2026 chỉ hai màn (Kỹ thuật máy, KCS) tự nén; giao hàng, kho, mua hàng, phiếu chi/thu,
// đơn hàng, báo giá đều đẩy ảnh gốc 4–8 MB qua Wi-Fi xưởng. Nay tầng request nén mọi ảnh lớn hơn
// ngưỡng. Ngưỡng cao hơn `NGUONG_BO_QUA` và cạnh dài rộng hơn `CANH_TOI_DA` có chủ đích: ở đây nén
// cho CẢ những ảnh cần đọc chữ (hoá đơn, chứng từ chụp), nên giữ nét hơn chỗ chỉ để chứng thực. Ảnh
// đã được màn tự nén trước đó (~400 KB) nằm dưới ngưỡng nên không bị nén lần hai.
export const NEN_TU_DONG_CANH_DAI = 2048;
export const NEN_TU_DONG_CHAT_LUONG = 0.82;
export const NEN_TU_DONG_NGUONG = 1.5 * 1024 * 1024;

export interface TuyChonNen {
  canhDai?: number;
  chatLuong?: number;
  nguongBytes?: number;
}

const DUOI_ANH = /\.(jpe?g|png|webp|heic|heif|bmp)$/i;

/** Ảnh raster nén được (jpeg/png/webp/heic…). GIF (ảnh động) và SVG (vector) KHÔNG nén. HEIC có
 *  trình duyệt để `type` rỗng nên xét thêm đuôi tên tệp. */
function laAnhNenDuoc(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/gif" || t === "image/svg+xml") return false;
  if (t.startsWith("image/")) return true;
  return t === "" && DUOI_ANH.test(file.name || "");
}

/** Tệp này có đáng đem nén không (ảnh nén được và lớn hơn ngưỡng). Rẻ, không đọc nội dung tệp. */
export function laAnhCanNen(file: File, nguongBytes = NEN_TU_DONG_NGUONG): boolean {
  return typeof File !== "undefined" && file instanceof File && laAnhNenDuoc(file) && file.size > nguongBytes;
}

/** Nén nếu là ảnh lớn; mọi trường hợp khác (không phải ảnh, nhỏ sẵn, nén hỏng, nén không lợi) trả
 *  lại CHÍNH tệp gốc. */
export async function nenNeuLaAnh(file: File, tc: TuyChonNen = {}): Promise<File> {
  const nguong = tc.nguongBytes ?? NEN_TU_DONG_NGUONG;
  if (!laAnhCanNen(file, nguong)) return file;
  const kq = await nenTheo(
    file,
    tc.canhDai ?? NEN_TU_DONG_CANH_DAI,
    tc.chatLuong ?? NEN_TU_DONG_CHAT_LUONG,
    nguong,
  );
  return kq.file;
}
