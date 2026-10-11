// Mảnh dùng chung của màn KCS phương án B nâng cấp (09/10/2026, `docs/mockups/kcs-phuong-an-B-nang-cap.html`):
// nhãn tình trạng lệnh, ô chuỗi nhỏ ở danh sách (rê chuột hiện từng công đoạn), biểu tượng trạng thái
// công đoạn của sơ đồ nhóm.
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SxKcsChuoiNut, SxKcsTinhTrang } from "../../api/client";
import type { MauTT } from "../../components/LuoiDs";
import { Icon } from "../../components/Icons";

/** Mỗi tình trạng một sắc riêng (luật chip trạng thái). "Chờ kiểm" ghép thêm số ở nơi vẽ. */
export const TINH_TRANG_LENH: Record<SxKcsTinhTrang, { nhan: string; mau: MauTT }> = {
  cho_kiem: { nhan: "Chờ kiểm", mau: "vang" },
  chua_gui_kho: { nhan: "Chưa gửi kho", mau: "cam" },
  cho_dong: { nhan: "Chờ đóng lệnh", mau: "tim" },
  cho_to: { nhan: "Chờ tổ làm", mau: "slate" },
  dang_lam: { nhan: "Đang làm", mau: "cyan" },
  da_xong: { nhan: "Đã xong", mau: "la" },
  da_dong: { nhan: "Đã đóng", mau: "xam" },
};

export type TrangThaiNut = SxKcsChuoiNut["trang_thai"];

export const NHAN_NUT: Record<TrangThaiNut, string> = {
  xong: "Đã xong", chay: "Đang làm", chua: "Chưa làm", loi: "Gây lỗi",
};

/** Trạng thái chạy của công việc → ô sơ đồ (chưa tính lỗi). */
export function nutTuTrangThai(trangThai: string): TrangThaiNut {
  if (trangThai === "completed") return "xong";
  return trangThai === "running" || trangThai === "paused" ? "chay" : "chua";
}

/** Chip trạng thái chạy của công đoạn ở đầu bảng chi tiết. */
export const CHIP_CONG_DOAN: Record<string, { nhan: string; mau: MauTT }> = {
  released: { nhan: "Chưa làm", mau: "slate" },
  running: { nhan: "Đang làm", mau: "cyan" },
  paused: { nhan: "Tạm dừng", mau: "cam" },
  completed: { nhan: "Đã xong", mau: "la" },
};

export function IconNut({ tt }: { tt: TrangThaiNut }) {
  return (
    <span className={`kcsb-ic kcsb-ic--${tt}`} aria-hidden="true">
      {tt === "xong" ? <Icon name="check" size={10} /> : tt === "loi" ? "!" : null}
    </span>
  );
}

/** Ô "Chuỗi" của danh sách: một ô vuông mỗi công đoạn; rê chuột (hoặc focus bàn phím) hiện bảng tên
 *  + tình trạng từng công đoạn. Bảng vẽ qua portal, toạ độ cố định — lưới cuộn ngang sẽ cắt mất bảng
 *  nếu nó nằm trong ô. */
export function ChuoiNho({ ma, chuoi, noiVao }: { ma: string; chuoi: SxKcsChuoiNut[]; noiVao?: string | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [o, setO] = useState<{ x: number; y: number } | null>(null);
  if (chuoi.length === 0) return <span className="lds-mu3">—</span>;
  const mo = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setO({ x: Math.min(r.left, window.innerWidth - 346), y: r.bottom + 6 });
  };
  return (
    <span ref={ref} className="kcsb-cn" tabIndex={0} aria-label={`Chuỗi công đoạn ${ma}`}
      onMouseEnter={mo} onMouseLeave={() => setO(null)} onFocus={mo} onBlur={() => setO(null)}>
      {chuoi.map((c, i) => (
        <span key={i} className="kcsb-cn__o">
          {i > 0 && <span className="kcsb-cn__gach" />}
          <i className={`kcsb-cn__vuong kcsb-cn--${c.trang_thai}${c.la_kcs_cuoi ? " is-cuoi" : ""}`} />
        </span>
      ))}
      {o && createPortal(
        <div className="kcsb-cn-pop" style={{ left: o.x, top: o.y }} role="tooltip">
          <div className="kcsb-cn-pop__dau">
            {noiVao ? `${ma} ghép vào lệnh chính ở ${noiVao}` : ma}
          </div>
          {chuoi.map((c, i) => (
            <div key={i} className="kcsb-cn-pop__d">
              <i className={`kcsb-cn__vuong kcsb-cn--${c.trang_thai}`} />
              <span className="kcsb-cn-pop__ten">
                {i + 1}. {c.ten}{c.la_kcs_cuoi && <span className="lds-tag kcsb-tag">Cuối</span>}
              </span>
              <span className={c.trang_thai === "loi" ? "lds-do" : "lds-mu"}>{NHAN_NUT[c.trang_thai]}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}

/** Chú giải bốn màu của ô chuỗi — đứng trên thanh lọc. */
export function ChuGiaiChuoi() {
  return (
    <span className="kcsb-cg" aria-label="Chú giải ô chuỗi">
      {(["xong", "chay", "chua", "loi"] as const).map((k) => (
        <span key={k} className="kcsb-cg__m"><i className={`kcsb-cn__vuong kcsb-cn--${k}`} />{NHAN_NUT[k]}</span>
      ))}
    </span>
  );
}
