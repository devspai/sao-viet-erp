// DẢI TUYẾN NHỎ trên từng dòng của lưới bàn tổ (09/10/2026, mockup `ban-to-ngan-A-tinh-chinh.html`).
//
// Một đường ray + một chấm mỗi bước của lệnh: xám đã xong, xanh lá đang làm, trắng chưa tới, viền cam
// thuê ngoài, viền cyan KCS cuối; chấm to viền đậm là việc của dòng này, vòng đôi là bước khác cũng
// của tổ mình. Rê chuột lên chấm đọc tên bước, tổ làm, trạng thái và số liệu của bước — đúng những gì
// dải routing to dưới đầu lệnh cũ từng in, để lưới phẳng không làm mất thông tin nào.
//
// CHỈ ĐỌC — không mở gì.
import type { SxRoutingBuoc } from "../api/client";
import { nhanDonVi } from "./lsxBuoc";
import { buocHangDangO, cauViTri, viTriHang } from "./thsxTuyen";

const TTN: Record<string, string> = {
  completed: "đã xong",
  running: "đang làm",
  paused: "tạm dừng",
};

const so = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });

function tieuDe(o: SxRoutingBuoc, n: number, laMe: boolean, cungTo: boolean): string {
  const ai = laMe ? "việc này của tổ mình" : cungTo ? "tổ mình, việc khác" : (o.to_ten || "chưa rõ tổ");
  const dong = [`${n}. ${o.ten_cong_doan}, ${ai}, ${TTN[o.trang_thai] ?? "chưa tới"}`];
  const dv = o.don_vi ? ` ${nhanDonVi(o.don_vi)}` : "";
  if (o.ke_hoach != null) dong.push(`Kế hoạch ${so(o.ke_hoach)}${dv}`);
  if (o.thuc_te > 0) dong.push(`Đã làm tốt ${so(o.thuc_te)}${dv}`);
  if (o.da_giao_sang_toi != null) dong.push(`Đã giao sang tổ mình ${so(o.da_giao_sang_toi)}${dv}`);
  if (o.da_nhan != null) dong.push(`Tổ mình đã nhận ${so(o.da_nhan)}`);
  if (o.phan_doan_tong > 1) dong.push(`Chia ${o.phan_doan_tong} phân đoạn`);
  if (o.chay_chung) dong.push("Chạy chung bài ghép");
  return dong.join("\n");
}

export function ThsxTuyenNho({ dai, congViecId, stepKey }: {
  dai: SxRoutingBuoc[];
  congViecId: number;
  stepKey?: string | null;
}) {
  const v = viTriHang(dai, congViecId, stepKey);
  if (!v) return null;
  const N = dai.length;
  const pos = (n: number) => (N === 1 ? 0 : ((n - 1) / (N - 1)) * 100);
  const c = buocHangDangO(dai);
  return (
    <span className="thsx-tk" role="img" aria-label={cauViTri(v, dai, false)}>
      <span className="thsx-tk__ln"><span className="thsx-tk__fill" style={{ width: `${pos(c)}%` }} /></span>
      {dai.map((o, i) => {
        const n = i + 1;
        const laMe = n === v.m;
        const cungTo = !laMe && o.la_cua_toi;
        const dang = o.trang_thai === "running" || o.trang_thai === "paused";
        const cls = [
          "thsx-tk__dt",
          o.trang_thai === "completed" ? "is-xong" : dang ? "is-dang" : "",
          o.thue_ngoai ? "is-ngoai" : "",
          o.la_kcs_cuoi ? "is-kcs" : "",
          laMe ? "is-me" : "",
          cungTo ? "is-cungto" : "",
        ].filter(Boolean).join(" ");
        return <i key={`${o.thu_tu}-${o.step_key ?? i}`} className={cls} style={{ left: `${pos(n)}%` }}
          title={tieuDe(o, n, laMe, cungTo)} />;
      })}
    </span>
  );
}

/** Chú giải dưới lưới — đọc màu chấm không cần đoán. */
export function ThsxTuyenChuGiai() {
  return (
    <div className="thsx-tk-cg" aria-label="Chú giải dải tuyến">
      <span><i className="thsx-tk__dt is-xong" />Đã xong</span>
      <span><i className="thsx-tk__dt is-dang" />Đang làm</span>
      <span><i className="thsx-tk__dt" />Chưa tới</span>
      <span><i className="thsx-tk__dt is-ngoai" />Thuê ngoài</span>
      <span><i className="thsx-tk__dt is-kcs" />KCS cuối</span>
      <span><i className="thsx-tk__dt is-me" />Việc của dòng này</span>
      <span><i className="thsx-tk__dt is-cungto" />Bước khác cũng của tổ mình</span>
      <span>Rê chuột lên chấm để xem tên bước và tổ</span>
    </div>
  );
}
