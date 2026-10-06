/** Điều kiện lọc của Nhật ký hoạt động (06/10/2026) — thay hàng hộp chọn rời + chip nhóm + ô ngày
 *  rời bằng thanh lọc chung. Lọc vẫn ở máy chủ như cũ (`/api/audit`); giá trị chọn được lấy từ
 *  facets máy chủ đếm theo kỳ đang xem. Hàm thuần, không React.
 *
 *  Kỳ mặc định giữ đúng nghĩa cũ: 30 ngày gần nhất tính cả hôm nay (máy chủ cũng mặc định thế).
 *  "Tất cả" gửi `tat_ca=true` để máy chủ bỏ cửa sổ 30 ngày. */
import { Layers, SlidersHorizontal, Tag, User } from "lucide-react";

import type { AuditFacets, AuditQuery } from "../api/client";
import { congNgay, homNayVN } from "../utils/ky";
import type { GiaTriUrl } from "./ke-toan/shared/urlMan";
import { kyLenUrl, kyTuUrl, thamSoKy, type KyDS } from "./thanh-loc/ky-danh-sach";
import type { DieuKien } from "./thanh-loc/thanh-loc";

export type LocNhatKy = { hanh_dong: string[]; nhom: string[]; nguoi: string[]; loai: string[] };

export const LOC_NK_TRONG: LocNhatKy = { hanh_dong: [], nhom: [], nguoi: [], loai: [] };

export const MOC_NK: [string, string][] = [["tao", "Ngày ghi"]];

const SO_NGAY_MAC_DINH = 30;

export function kyNhatKyMacDinh(homNay: string = homNayVN()): KyDS {
  return { loai: "tuy", tu: congNgay(homNay, -(SO_NGAY_MAC_DINH - 1)), den: homNay, moc: "tao" };
}

export type LocManNhatKy = { ky: KyDS; loc: LocNhatKy };

const tach = (v: string | null) => (v ?? "").split(",").filter(Boolean);
const noi = (ds: string[]) => (ds.length ? ds.join(",") : undefined);

/** URL không có khoá `ky` ⇒ kỳ mặc định 30 ngày (không phải "Tất cả" như các màn khác). */
export function locNKTuUrl(p: URLSearchParams): LocManNhatKy {
  return {
    ky: p.has("ky") ? kyTuUrl(p, ["tao"], "tao") : kyNhatKyMacDinh(),
    loc: {
      hanh_dong: tach(p.get("hd")),
      nhom: tach(p.get("nhom")),
      nguoi: tach(p.get("nguoi")).filter((x) => /^\d+$/.test(x)),
      loai: tach(p.get("loai_dt")),
    },
  };
}

export function locNKLenUrl(t: LocManNhatKy): GiaTriUrl {
  const ky = kyLenUrl(t.ky, "tao");
  return {
    ...ky,
    // "Tất cả" phải ghi ra khoá — vắng khoá `ky` nghĩa là 30 ngày mặc định.
    ky: t.ky.loai === "tat_ca" ? "tat_ca" : ky.ky,
    hd: noi(t.loc.hanh_dong),
    nhom: noi(t.loc.nhom),
    nguoi: noi(t.loc.nguoi),
    loai_dt: noi(t.loc.loai),
  };
}

/** Phần kỳ của truy vấn: khoảng ngày + mốc, hoặc `tat_ca` khi không chặn ngày. */
export function thamSoKyNK(ky: KyDS): Pick<AuditQuery, "tu_ngay" | "den_ngay" | "moc" | "tat_ca"> {
  const k = thamSoKy(ky);
  if (!k.tu_ngay) return { tat_ca: true };
  return { tu_ngay: String(k.tu_ngay), den_ngay: String(k.den_ngay), moc: String(k.moc) };
}

/** Mã hành động gửi máy chủ. Máy chủ lọc theo `action`; "Nhóm" là chuyện trình bày nên dịch thành
 *  danh sách mã bằng chính facets. Chọn cả hai ⇒ phần giao (điều kiện nối nhau bằng VÀ). Không mã
 *  nào khớp ⇒ một mã không tồn tại để máy chủ trả rỗng thay vì trả tất cả. */
export function maHanhDong(loc: LocNhatKy, facets: AuditFacets | null): string[] | undefined {
  if (!loc.hanh_dong.length && !loc.nhom.length) return undefined;
  let ma: string[] = loc.hanh_dong;
  if (loc.nhom.length) {
    const theoNhom = new Set(
      (facets?.hanh_dong ?? []).filter((h) => loc.nhom.includes(h.nhom)).map((h) => h.ma),
    );
    ma = loc.hanh_dong.length ? loc.hanh_dong.filter((m) => theoNhom.has(m)) : [...theoNhom];
  }
  return ma.length ? ma : ["__khong_co__"];
}

export function dieuKienNhatKy(facets: AuditFacets | null): DieuKien<LocNhatKy>[] {
  return [
    {
      khoa: "nhom", nhan: "Nhóm", icon: Layers, kieu: "nhieu",
      tim: true, giaTri: (facets?.nhom ?? []).filter((n) => n.so_dong > 0)
        .map((n) => ({ value: n.khoa, nhan: n.nhan, so: n.so_dong })),
      doc: (l) => l.nhom,
      ghi: (l, v) => ({ ...l, nhom: v }),
    },
    {
      khoa: "hanh_dong", nhan: "Hành động", icon: SlidersHorizontal, kieu: "nhieu",
      tim: true, giaTri: (facets?.hanh_dong ?? []).map((h) => ({ value: h.ma, nhan: h.nhan, so: h.so_dong })),
      doc: (l) => l.hanh_dong,
      ghi: (l, v) => ({ ...l, hanh_dong: v }),
    },
    {
      khoa: "nguoi", nhan: "Người làm", icon: User, kieu: "nhieu",
      tim: true, giaTri: (facets?.nguoi ?? []).filter((n) => n.id !== null)
        .map((n) => ({ value: String(n.id), nhan: n.ten ?? `Tài khoản số ${n.id}`, so: n.so_dong })),
      doc: (l) => l.nguoi,
      ghi: (l, v) => ({ ...l, nguoi: v }),
    },
    {
      // Cần vì 12 màn danh mục dùng chung ba mã hành động.
      khoa: "loai", nhan: "Loại đối tượng", icon: Tag, kieu: "nhieu",
      tim: true, giaTri: (facets?.loai ?? []).map((l) => ({ value: l.loai, nhan: l.nhan })),
      doc: (l) => l.loai,
      ghi: (l, v) => ({ ...l, loai: v }),
    },
  ];
}
