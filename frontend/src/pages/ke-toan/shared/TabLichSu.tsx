/** Tab Lịch sử của ngăn phiếu chi / phiếu thu (đặc tả A.5, PC-2, PT-2): dòng thời gian mới nhất ở
 *  trên; mỗi việc một vòng icon (lập: xanh, hủy: đỏ, còn lại xám), tên việc đậm, dưới là chi tiết +
 *  người làm, giờ ở cột phải.
 *
 *  Chưa có endpoint nhật ký THEO ĐỐI TƯỢNG cho phiếu (`/api/audit` đòi quyền Nhật ký và không lọc
 *  theo phiếu) — dòng thời gian dựng từ chính các trường của phiếu và của tệp đính kèm. Tệp đã xoá
 *  không còn dấu vết ở máy chủ nên việc "Xoá chứng từ" không hiện ở đây.
 */
import { Ban, Check, Paperclip } from "lucide-react";
import type { ReactNode } from "react";

import { Cum, TheNho } from "./Cum";
import { ngay, ngayGio, tien } from "./dinhDang";
import type { TepChungTu } from "./tepChungTu";

export type ViecLs = {
  khoa: string;
  moc: string;
  loai: "lap" | "huy" | "khac";
  ten: string;
  chiTiet: ReactNode;
  them?: ReactNode;
  /** Biểu tượng trong vòng thay cho biểu tượng mặc định theo `loai` (ghim giấy cho "khac"). */
  icon?: ReactNode;
};

/** Tên người theo id: máy chủ chỉ trả id người tải tệp — đối chiếu với những người đã có tên trên
 *  chính phiếu (người lập, người hủy…). */
export function tenTheoId(id: number | null, nguoi: [number | null, string | null][]): string | null {
  if (id == null) return null;
  return nguoi.find(([i]) => i === id)?.[1] ?? null;
}

/** Việc "Lập phiếu": số tiền — thẻ hình thức — người lập. */
export function viecLap(moc: string, ten: string, soTien: number, hinhThuc: string, nguoi: string | null): ViecLs {
  return {
    khoa: "lap",
    moc,
    loai: "lap",
    ten,
    chiTiet: (
      <Cum>
        <span>{tien(soTien)}</span>
        <TheNho>{hinhThuc}</TheNho>
        {nguoi && <span>{nguoi}</span>}
      </Cum>
    ),
  };
}

/** Tệp tải cùng một phút, cùng một người = một lần "Thêm n chứng từ". */
export function viecThemTep(tep: TepChungTu[], tenNguoi: (id: number | null) => string | null, mocDuPhong: string): ViecLs[] {
  const nhom = new Map<string, TepChungTu[]>();
  for (const t of tep) {
    const k = `${(t.uploaded_at ?? "").slice(0, 16)}|${t.uploaded_by ?? ""}`;
    nhom.set(k, [...(nhom.get(k) ?? []), t]);
  }
  return [...nhom].map(([k, cac]) => {
    const nguoi = tenNguoi(cac[0].uploaded_by);
    return {
      khoa: `tep-${k}`,
      moc: cac[0].uploaded_at ?? mocDuPhong,
      loai: "khac" as const,
      ten: `Thêm ${cac.length} chứng từ`,
      chiTiet: (
        <Cum>
          {cac.map((t) => (
            <TheNho key={t.id}>{t.file_name}</TheNho>
          ))}
          {nguoi && <span>{nguoi}</span>}
        </Cum>
      ),
    };
  });
}

/** Việc "Hủy phiếu" — người hủy, lý do trong hộp xám. */
export function viecHuy(moc: string, nguoi: string | null, lyDo: string | null): ViecLs {
  return {
    khoa: "huy",
    moc,
    loai: "huy",
    ten: "Hủy phiếu",
    chiTiet: nguoi ? <span>{nguoi}</span> : null,
    them: lyDo ? <div className="kt-bang-xam">{lyDo}</div> : null,
  };
}

/** Mới nhất lên đầu. */
export function xepMoiNhat(ds: ViecLs[]): ViecLs[] {
  return [...ds].sort((a, b) => (a.moc < b.moc ? 1 : a.moc > b.moc ? -1 : 0));
}

export function TabLichSu({ viec }: { viec: ViecLs[] }) {
  return (
    <div className="kt-ls">
      {viec.map((v) => (
        <div key={v.khoa} className="kt-ls__muc">
          <span className={`kt-ls__dau${v.loai === "lap" ? " kt-ls__dau--xanh" : v.loai === "huy" ? " kt-ls__dau--do" : ""}`}>
            {v.icon ?? (v.loai === "lap" ? <Check size={14} aria-hidden="true" /> : v.loai === "huy"
              ? <Ban size={14} aria-hidden="true" /> : <Paperclip size={14} aria-hidden="true" />)}
          </span>
          <div className="kt-ls__nd">
            <b>{v.ten}</b>
            {v.chiTiet}
            {v.them}
          </div>
          {/* Mốc chỉ có NGÀY (chứng từ công nợ) thì không bịa giờ "07:00" từ nửa đêm UTC. */}
          <span className="kt-ls__gio">{v.moc.length <= 10 ? ngay(v.moc) : ngayGio(v.moc)}</span>
        </div>
      ))}
    </div>
  );
}
