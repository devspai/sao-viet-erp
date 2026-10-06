/** Thanh lọc màn Theo dõi sản xuất (06/10/2026). Không có kỳ — màn là ảnh chụp "bây giờ" của xưởng.
 *
 *  Lọc ở MÁY CHỦ (`/api/theo-doi-san-xuat/theo-may|theo-lenh`). Giá trị ô Khách / Máy lấy từ
 *  `/bo-loc` sẵn có của màn. "Máy" chỉ góc Theo lệnh nhận — góc Theo máy không khai điều kiện này.
 *  "Bất thường" cùng một trạng thái với dải bất thường phía trên (bấm dải hay chọn ở đây là một). */
import { AlertTriangle, CircleDot, Cog, Users } from "lucide-react";

import type {
  LenhSxKhau, TdsxBatThuong, TdsxBoLocOut, TdsxDemBatThuong, TdsxLocParams,
} from "../../api/client";
import { KHAU_NHAN } from "../lsxKhau";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu } from "../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";

export type LocTdsx = { khach?: number; may?: number; bat_thuong?: TdsxBatThuong; khau?: LenhSxKhau };

export const LOC_TDSX_TRONG: LocTdsx = {};

/** Sáu mục bất thường, thứ tự CỐ ĐỊNH (đặc tả 3.1). Khoá là hợp đồng với `?bat_thuong=`. */
export const BAT_THUONG: { key: TdsxBatThuong; nhan: string; ten: string }[] = [
  { key: "tre_han", nhan: "lệnh trễ hạn", ten: "Lệnh trễ hạn" },
  { key: "su_co", nhan: "sự cố đang mở", ten: "Sự cố đang mở" },
  { key: "tam_dung", nhan: "việc tạm dừng", ten: "Việc tạm dừng" },
  { key: "kcs_khong_dat", nhan: "KCS không đạt", ten: "KCS không đạt" },
  { key: "may_hong", nhan: "máy hỏng", ten: "Máy hỏng" },
  { key: "chua_may", nhan: "bước chưa có máy", ten: "Bước chưa có máy" },
];

const batThuong = (v: string | null | undefined): TdsxBatThuong | undefined =>
  BAT_THUONG.find((b) => b.key === v)?.key;

/** "Trạng thái" của góc Theo lệnh = khâu ở cột "Đang ở" (07/10/2026). Chữ lấy từ `KHAU_NHAN`. */
const KHAU: GiaTriDK[] = (Object.keys(KHAU_NHAN) as LenhSxKhau[]).map((k) => ({ value: k, nhan: KHAU_NHAN[k] }));
const khau = (v: string | null | undefined): LenhSxKhau | undefined =>
  v != null && v in KHAU_NHAN ? (v as LenhSxKhau) : undefined;

/** Tham số máy chủ; `coMay=false` (góc Theo máy) thì không gửi `may_id` và `khau`. */
export function thamSoLocTdsx(loc: LocTdsx, coMay: boolean): TdsxLocParams {
  return {
    khach_hang_id: loc.khach,
    may_id: coMay ? loc.may : undefined,
    bat_thuong: loc.bat_thuong,
    khau: coMay ? loc.khau : undefined,
  };
}

export function locTdsxTuUrl(p: URLSearchParams): LocTdsx {
  return {
    khach: soTuUrl(p.get("khach")), may: soTuUrl(p.get("may")), bat_thuong: batThuong(p.get("bt")),
    khau: khau(p.get("khau")),
  };
}

export function locTdsxLenUrl(loc: LocTdsx): GiaTriUrl {
  return { khach: soLenUrl(loc.khach), may: soLenUrl(loc.may), bt: loc.bat_thuong, khau: loc.khau };
}

export function dieuKienTdsx(
  boLoc: TdsxBoLocOut | null,
  dem: TdsxDemBatThuong | null,
  coMay: boolean,
): DieuKien<LocTdsx>[] {
  const khach: GiaTriDK[] = (boLoc?.khach_hang ?? []).map((k) => ({ value: k.id, nhan: k.ten ?? `Khách #${k.id}` }));
  const may: GiaTriDK[] = (boLoc?.may ?? []).map((m) => ({
    value: m.id,
    nhan: (m.ten ?? `Máy #${m.id}`) + (m.ngung_dung ? " (ngừng dùng)" : ""),
  }));
  const bt: GiaTriDK[] = BAT_THUONG.map((b) => ({ value: b.key, nhan: b.ten, so: dem?.[b.key] }));
  const ds: DieuKien<LocTdsx>[] = [];
  if (coMay) {
    ds.push({
      khoa: "khau", nhan: "Trạng thái", icon: CircleDot, kieu: "mot", giaTri: KHAU,
      doc: (l) => l.khau,
      ghi: (l, v) => ({ ...l, khau: khau(v) }),
    });
  }
  ds.push(
    {
      khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true, giaTri: khach,
      doc: (l) => idThanhChu(l.khach),
      ghi: (l, v) => ({ ...l, khach: chuThanhId(v) }),
    },
  );
  if (coMay) {
    ds.push({
      khoa: "may", nhan: "Máy", icon: Cog, kieu: "mot", tim: true, giaTri: may,
      doc: (l) => idThanhChu(l.may),
      ghi: (l, v) => ({ ...l, may: chuThanhId(v) }),
    });
  }
  ds.push({
    khoa: "bat_thuong", nhan: "Bất thường", icon: AlertTriangle, kieu: "mot", giaTri: bt,
    doc: (l) => l.bat_thuong,
    ghi: (l, v) => ({ ...l, bat_thuong: batThuong(v) }),
  });
  return ds;
}
