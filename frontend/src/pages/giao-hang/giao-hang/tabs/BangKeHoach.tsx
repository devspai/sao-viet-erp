// Tab "Đơn giao hàng" — BẢNG mỗi dòng một khối của `/bang-giao` (06/10/2026, mockup
// docs/mockups/giao-hang-phuong-an-B-chi-tiet.html): một LƯỢT XE, một lần NHÀ GIA CÔNG GIAO THẲNG,
// hoặc một chuyến ngoài lượt. Ô "Điểm giao" kể đủ từng khách: tên, mã đơn, nơi giao rút gọn, ngày
// hẹn. Bấm dòng ⇒ ngăn chi tiết (`NganLuot`); nút bước kế tiếp của cả lượt nằm ngay trên dòng.
//
// Bản trước là danh sách KHỐI đóng/mở (18/09/2026): không có cột, không thấy nơi giao, và đơn giao
// thẳng bị vẽ như chuyến xe (tài xế là người chốt, giờ lấy = giờ giao = giờ chốt).
import { useEffect, type ReactNode } from "react";
import type { BangGiaoItem, DeliveryTrip } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { EmptyState } from "../../../../components/EmptyState";
import {
  buocLuot,
  coKetQua,
  diaChiGon,
  gioNgay,
  ngay,
  ngayIso,
  ngayNgan,
  nhanChuyen,
  so,
  soVoiHen,
  toneChuyen,
  trangThaiLuot,
  type BuocLuot,
  type FormLuot,
} from "../shared/helpers";
import { ChipGh, KhoangTrong, NutCho, TraHang } from "../components/giaoHangCells";
import { CuonLuoi, soCotGhim, ChipTT, rongLuoi, tenKhachGon, xepCot, type CotLuoi } from "../../../../components/LuoiDs";

export const khoaKhoi = (it: BangGiaoItem) =>
  it.luot ? `l${it.luot.id}` : it.trip ? `t${it.trip.id}` : "";

export type ThaoTacChuyen = {
  onGuiDeNghi?: (t: DeliveryTrip) => void;
  onDaLay?: (t: DeliveryTrip) => Promise<unknown>;
  onBatDau?: (t: DeliveryTrip) => Promise<unknown>;
  onKetQua?: (t: DeliveryTrip) => void;
  onDaTra?: (t: DeliveryTrip) => Promise<unknown>;
};

/** Nút đưa MỘT chuyến ngoài lượt đi tiếp — mỗi trạng thái "đang chạy" đúng một nút. Dòng bảng và
 *  thẻ điểm trong ngăn dùng chung, để hai chỗ không nói hai kiểu. */
export function NutBuocChuyen({ t, tt }: { t: DeliveryTrip; tt: ThaoTacChuyen }): ReactNode {
  if (t.giao_thang) return null;
  if (t.trang_thai === "da_len_ke_hoach" && !t.yeu_cau_kho_ma && tt.onGuiDeNghi)
    return <Button variant="accent" onClick={() => tt.onGuiDeNghi!(t)}>Gửi yêu cầu xuất kho</Button>;
  if (t.trang_thai === "dang_chuan_bi" && tt.onDaLay)
    return <NutCho bam={() => tt.onDaLay!(t)}>Đã lấy hàng</NutCho>;
  if (t.trang_thai === "da_lay_hang" && tt.onBatDau)
    return <NutCho bam={() => tt.onBatDau!(t)}>Bắt đầu giao</NutCho>;
  if (t.trang_thai === "dang_giao" && tt.onKetQua)
    return <Button variant="accent" onClick={() => tt.onKetQua!(t)}>Nhập kết quả</Button>;
  return <TraHang t={t} onDaTra={tt.onDaTra ? () => tt.onDaTra!(t) : undefined} />;
}

export function BangKeHoach({
  items,
  loading,
  coLoc = false,
  canPlan,
  canWrite,
  luotMoi,
  dangMo,
  onMoNgan,
  onLamLuot,
  cotAn,
  thuTu = [],
  pheTrang,
  ...tt
}: {
  items: BangGiaoItem[];
  loading: boolean;
  /** Đang áp ô tìm / kỳ / điều kiện — rỗng thì nói "không khớp" chứ không "chưa có". */
  coLoc?: boolean;
  canPlan: boolean;
  canWrite: boolean;
  /** Lượt vừa lập — dòng đó được làm nổi + cuộn tới. */
  luotMoi?: number | null;
  /** Khoá dòng đang mở ở ngăn — viền đủ bốn cạnh. */
  dangMo?: string | null;
  onMoNgan: (it: BangGiaoItem, form?: FormLuot) => void;
  onLamLuot: (b: Extract<BuocLuot, { lam: unknown }>) => Promise<unknown>;
  /** Cột người xem đã ẩn (nút "Cột"). */
  cotAn?: Set<string>;
  /** Thứ tự cột người xem đã kéo (nút "Cột"). */
  thuTu?: string[];
  /** Chân bảng (phân trang) — nằm TRONG khung lưới. */
  pheTrang?: ReactNode;
} & ThaoTacChuyen) {
  useEffect(() => {
    if (luotMoi == null) return;
    document.querySelector(`[data-khoa="l${luotMoi}"]`)
      ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [luotMoi, items]);

  if (!loading && items.length === 0 && coLoc)
    return (
      <KhoangTrong
        title="Không có đơn giao hàng nào khớp bộ lọc"
        desc="Đổi kỳ, bỏ bớt điều kiện hoặc xoá ô tìm để xem thêm đơn giao hàng."
      />
    );
  if (!loading && items.length === 0)
    return (
      <KhoangTrong
        title="Chưa có đơn giao hàng nào"
        desc="Đơn giao hàng sinh ra khi quản lý phân công tài xế cho một yêu cầu giao. Yêu cầu thì Bán hàng lập từ màn Đơn hàng bán, ở khối “Giao hàng” cuối trang đơn đã chốt."
      />
    );
  if (loading && items.length === 0) return <EmptyState trangThai="dang-tai" />;

  const cot = xepCot(COT_DON, thuTu).filter((c) => !cotAn?.has(c.key));
  return (
    <div className="lds-sheet">
      <CuonLuoi ghim={soCotGhim(cot)}>
        <table className="lds-g" style={{ minWidth: rongLuoi(cot, 190) }}>
          <colgroup>
            {cot.map((c) => (
              <col key={c.key} style={c.w ? { width: c.w } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {cot.map((c) => (
                <th key={c.key} className={c.n ? "n" : undefined} aria-label={c.key === "nut" ? "Bước kế tiếp" : undefined}>
                  {c.key === "nut" ? null : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const khoa = khoaKhoi(it);
              return (
                <Dong key={khoa} it={it} khoa={khoa} cot={cot.map((c) => c.key)} canPlan={canPlan} canWrite={canWrite}
                  moi={!!it.luot && it.luot.id === luotMoi} chon={khoa === dangMo}
                  onMoNgan={onMoNgan} onLamLuot={onLamLuot} tt={tt} />
              );
            })}
          </tbody>
        </table>
      </CuonLuoi>
      {pheTrang}
    </div>
  );
}

// Lưới phương án A (07/10/2026): mỗi lượt / chuyến MỘT dòng. Lượt nhiều điểm: Đơn, Khách, Giao tới,
// Hẹn giao nói điểm ĐẦU kèm thẻ "+N điểm"; đủ các điểm ở chú thích khi rê chuột và trong ngăn.
// Thứ tự: Lượt, Ngày tạo, Đơn, Khách, Giao tới, Hẹn giao, Xe và người giao, Tình trạng, So với hẹn, Km.
export const COT_DON: (CotLuoi & { w?: number; n?: boolean })[] = [
  { key: "luot", label: "Lượt", coDinh: true, w: 215 },
  { key: "ngay", label: "Ngày tạo", w: 100 },
  { key: "don", label: "Đơn", w: 110 },
  { key: "khach", label: "Khách hàng", w: 200 },
  { key: "toi", label: "Giao tới", w: 170 },
  { key: "hen", label: "Hẹn giao", w: 85 },
  { key: "xe", label: "Xe và người giao", w: 220 },
  { key: "tt", label: "Tình trạng", w: 200 },
  { key: "sovoi", label: "So với hẹn", w: 130 },
  { key: "km", label: "Km", w: 70, n: true },
  { key: "nut", label: "Bước kế tiếp", coDinh: true },
];

function Dong({
  it,
  khoa,
  cot,
  canPlan,
  canWrite,
  moi,
  chon,
  onMoNgan,
  onLamLuot,
  tt,
}: {
  it: BangGiaoItem;
  khoa: string;
  cot: string[];
  canPlan: boolean;
  canWrite: boolean;
  moi: boolean;
  chon: boolean;
  onMoNgan: (it: BangGiaoItem, form?: FormLuot) => void;
  onLamLuot: (b: Extract<BuocLuot, { lam: unknown }>) => Promise<unknown>;
  tt: ThaoTacChuyen;
}) {
  const l = it.luot;
  const t0 = it.trip;
  const ds = l ? l.diem : t0 ? [t0] : [];
  const dau = ds[0];
  const gt = !l ? t0?.giao_thang ?? null : null;
  if (!dau) return null;

  const ten = l ? `Lượt ${l.code}` : gt ? `Giao thẳng ${dau.request_code ?? ""}` : `Đơn giao ${dau.request_code ?? ""}`;
  const xong = ds.filter(coKetQua).length;
  const tinh = l ? trangThaiLuot(l) : { text: nhanChuyen(dau), tone: toneChuyen(dau.trang_thai) };
  const daChay = l ? l.so_dong_ho_xuat_phat != null || xong > 0 : false;
  const km = l ? l.tong_km : gt ? 0 : dau.tong_km;
  const taoLuc = l ? l.created_at : dau.created_at;
  const hen = !l && coKetQua(dau) ? soVoiHen(dau.ngay_can_giao, dau.thoi_gian_ket_thuc) : null;
  const them = ds.length - 1;
  const moiDiem = ds
    .map((t, i) => `${i + 1}. ${t.customer_name ?? ""}${t.order_code ? ` (${t.order_code})` : ""}${t.dia_chi ? `: ${t.dia_chi}` : ""}, hẹn ${ngay(t.ngay_can_giao)}`)
    .join("\n");

  let nut: ReactNode = null;
  if (l) {
    const b = buocLuot(l, canPlan, canWrite)[0];
    if (b && "form" in b)
      nut = <Button variant="accent" onClick={() => onMoNgan(it, b.form)}>{b.nhan}</Button>;
    else if (b)
      nut = <NutCho bam={() => onLamLuot(b)}>{b.nhan}</NutCho>;
    else if (canWrite && l.so_dang_giao > 0)
      nut = (
        <Button variant="ghost" onClick={() => onMoNgan(it)}>
          Nhập kết quả ({l.so_dang_giao} điểm)
        </Button>
      );
  } else {
    nut = <NutBuocChuyen t={dau} tt={tt} />;
  }

  const o = (k: string): ReactNode => {
    switch (k) {
      case "luot":
        return (
          <td key={k}>
            <span>{l ? l.code : gt ? "Giao thẳng" : dau.request_code}</span>
            <span className="lds-u">
              {gt ? `Khách nhận ${ngayNgan(ngayIso(dau.thoi_gian_ket_thuc))}` : `Lấy hàng ${gioNgay(dau.gio_lay_hang)}`}
            </span>
          </td>
        );
      case "ngay":
        return <td key={k} title={taoLuc ? gioNgay(taoLuc) : undefined}>{ngay(taoLuc)}</td>;
      case "don":
        return <td key={k} title={them > 0 ? moiDiem : undefined}>{dau.order_code ?? <span className="lds-mu3">—</span>}</td>;
      case "khach":
        return (
          <td key={k} title={them > 0 ? moiDiem : dau.customer_name ?? undefined}>
            <span>{tenKhachGon(dau.customer_name)}</span>
            {them > 0 ? <span className="lds-tag">+{them} điểm</span> : null}
          </td>
        );
      case "toi":
        return <td key={k} title={dau.dia_chi ?? undefined}>{dau.dia_chi ? diaChiGon(dau.dia_chi) : <span className="lds-mu3">—</span>}</td>;
      case "hen":
        return <td key={k} title={`Hẹn giao ${ngay(dau.ngay_can_giao)}`}>{ngayNgan(dau.ngay_can_giao)}</td>;
      case "xe":
        return gt ? (
          <td key={k} title={gt.nha_cung_cap_ten ?? undefined}>
            <ChipTT mau="tim" vuong>Nhà gia công</ChipTT>{" "}
            <span>{gt.nha_cung_cap_ten ?? "—"}</span>
          </td>
        ) : (
          <td key={k} title={dau.phu_xe_name ? `Phụ xe ${dau.phu_xe_name}` : undefined}>
            {(l?.xe_bien_so ?? dau.xe_bien_so) ? <span className="lds-tag gh-xe">{l?.xe_bien_so ?? dau.xe_bien_so}</span> : null}{" "}
            <span>{dau.employee_name}</span>
          </td>
        );
      case "tt":
        return (
          <td key={k}>
            <ChipGh text={tinh.text} tone={tinh.tone} />
            {l && daChay ? <span className="lds-u">{xong} trên {ds.length} điểm</span> : null}
          </td>
        );
      case "sovoi":
        return (
          <td key={k} className={hen?.tre ? "lds-do" : undefined}>
            {hen ? hen.text : <span className="lds-mu3">—</span>}
          </td>
        );
      case "km":
        return <td key={k} className="n">{km > 0 ? so(km) : <span className="lds-mu3">—</span>}</td>;
      case "nut":
        // Bấm nút không mở ngăn — nút làm thẳng bước kế tiếp.
        return (
          <td key={k} className="lds-nut" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {nut}
          </td>
        );
      default:
        return <td key={k} />;
    }
  };

  return (
    <tr data-khoa={khoa} aria-label={ten} tabIndex={0}
      className={`lds-dong${moi ? " is-moi" : ""}${chon ? " is-chon" : ""}`}
      onClick={() => onMoNgan(it)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onMoNgan(it);
      }}>
      {cot.map(o)}
    </tr>
  );
}
