// Việc chờ tổ bấm mà công đoạn KHÔNG nằm trên bàn đang xem (spec §11.5, cờ `tren_ban` của máy chủ).
//
// Việc chờ bình thường gắn vào công đoạn của nó: chấm đỏ trên dòng, trên đầu lệnh, trên tab ngăn chi
// tiết nơi bấm (xem `thsxChoXacNhan.tsx`). Còn lại đúng những việc không có dòng nào để gắn chấm.
// Danh sách này chỉ hiện khi bật ô "chờ xác nhận" trên thanh lọc, và chỉ khi thật sự có việc như vậy.
//
// Bàn giao đến / KCS báo lỗi ngoài bàn (hiếm — phạm vi xác nhận rộng hơn phạm vi bàn): "Mở" ngăn chi
// tiết công đoạn, vào thẳng tab Nhận / KCS. Lỗi KCS không có nút "Đã xem" riêng: mở tab KCS
//    là tổ đã xem (18/09/2026, xem `ThsxKetQuaKcs`).
//
// Component không tự gọi API — mọi mặt ghi đi qua callback của controller (toast + nạp lại).
import type { SxChoXacNhan, SxChoXacNhanBanGiao, SxChoXacNhanKcsLoi } from "../api/client";
import { Button } from "../components/Button";
import { Icon } from "../components/Icons";
import { ngayGio, num } from "./keHoachSxShared";
import { nhanDonVi } from "./lsxBuoc";

export function ThsxChoNgoaiBan({
  data, busy, onMoBanGiao, onMoKcs,
}: {
  data: SxChoXacNhan | null;
  busy: boolean;
  onMoBanGiao: (dichCongViecId: number) => void;
  /** Mở ngăn chi tiết của công đoạn bị báo lỗi, tab KCS (có ảnh) — mở là tổ đã xem. */
  onMoKcs: (congViecId: number) => void;
}) {
  const bg = data?.ban_giao ?? [];
  const kl = data?.kcs_loi ?? [];
  const n = bg.length + kl.length;
  if (n === 0) return null;

  return (
    <div className="thsx-hopthu">
      <div className="thsx-hopthu__col">
        <div className="thsx-hopthu__h">
          <Icon name="users" size={14} />
          <span>Chờ tổ bạn xác nhận · công đoạn không nằm trên bàn này</span>
          <span className="thsx-hopthu__n thsx-num">{n}</span>
        </div>
        <ul className="thsx-hopthu__list">
          {kl.map((l) => <KcsLoiRow key={`kcs${l.loi_id}`} l={l} busy={busy} onMo={onMoKcs} />)}
          {bg.map((b) => <BanGiaoRow key={`bg${b.id}`} b={b} busy={busy} onMo={onMoBanGiao} />)}
        </ul>
      </div>
    </div>
  );
}

function KcsLoiRow({
  l, busy, onMo,
}: {
  l: SxChoXacNhanKcsLoi; busy: boolean;
  onMo: (congViecId: number) => void;
}) {
  return (
    <li className="thsx-hopthu__it">
      <div className="thsx-hopthu__main">
        <Icon name="shield" size={14} />
        <span className="thsx-hopthu__ten">KCS báo lỗi</span>
        {l.so_luong > 0 && <span className="thsx-num">{num(l.so_luong)} {nhanDonVi(l.don_vi)}</span>}
      </div>
      <p className="thsx-hopthu__mo">{l.mo_ta || "Lỗi"}</p>
      <p className="thsx-hopthu__mo">
        {[l.lsx_ma, l.ten_cong_doan].filter(Boolean).join(" · ")}
        {l.phat_hien_o ? ` · bắt ở ${l.phat_hien_o}` : ""}
        {l.nguoi_kiem ? ` · ${l.nguoi_kiem}` : ""}{l.luc ? ` · ${ngayGio(l.luc)}` : ""}
        {l.so_anh > 0 ? ` · ${l.so_anh} ảnh` : ""}
      </p>
      <div className="thsx-x-act thsx-x-act--row">
        {l.cong_viec_id != null && (
          <Button variant="accent" onClick={() => onMo(l.cong_viec_id!)} disabled={busy}>
            <Icon name="eye" size={13} /> Mở để xem
          </Button>
        )}
      </div>
    </li>
  );
}

function BanGiaoRow({
  b, busy, onMo,
}: {
  b: SxChoXacNhanBanGiao; busy: boolean; onMo: (dichCongViecId: number) => void;
}) {
  return (
    <li className="thsx-hopthu__it">
      <div className="thsx-hopthu__main">
        <Icon name="truck" size={14} />
        <span className="thsx-hopthu__ten">Bàn giao đến</span>
        <span className="thsx-num">{num(b.so_luong)} {nhanDonVi(b.don_vi)}</span>
      </div>
      <p className="thsx-hopthu__mo">
        {b.nguon_ten}{b.nguon_to_ten ? ` (${b.nguon_to_ten})` : ""} → {b.dich_ten}
        {b.lsx_ma ? ` · ${b.lsx_ma}` : ""}
      </p>
      <div className="thsx-x-act thsx-x-act--row">
        <Button variant="accent" onClick={() => onMo(b.dich_cong_viec_id)} disabled={busy}>
          <Icon name="arrowRight" size={13} /> Mở để xác nhận
        </Button>
      </div>
    </li>
  );
}
