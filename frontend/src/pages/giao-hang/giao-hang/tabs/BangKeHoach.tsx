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
import { KhoangTrong, NutCho, Pill, TraHang } from "../components/giaoHangCells";

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

  return (
    <div className="rc__tablewrap gh-bang">
      <table className="gh-tbl">
        <thead>
          <tr>
            <th className="gh-c-luot">Lượt</th>
            <th className="gh-c-kip">Xe và kíp</th>
            <th>Điểm giao</th>
            <th className="gh-c-td">Tiến độ</th>
            <th className="gh-c-km">Km</th>
            <th className="gh-c-tao">Ngày tạo</th>
            <th className="gh-c-nut" aria-label="Bước kế tiếp" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const khoa = khoaKhoi(it);
            return (
              <Dong key={khoa} it={it} khoa={khoa} canPlan={canPlan} canWrite={canWrite}
                moi={!!it.luot && it.luot.id === luotMoi} chon={khoa === dangMo}
                onMoNgan={onMoNgan} onLamLuot={onLamLuot} tt={tt} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Dong({
  it,
  khoa,
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
  const hen = gt && coKetQua(dau) ? soVoiHen(dau.ngay_can_giao, dau.thoi_gian_ket_thuc) : null;

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

  return (
    <tr data-khoa={khoa} aria-label={ten} tabIndex={0}
      className={`${moi ? "is-moi" : ""}${chon ? " is-chon" : ""}`}
      onClick={() => onMoNgan(it)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onMoNgan(it);
      }}>
      <td className="gh-c-luot">
        <div className="gh-ma-luot">{l ? l.code : gt ? "Giao thẳng" : dau.request_code}</div>
        <div className="gh-nho">
          {gt ? `Khách nhận ${ngayNgan(ngayIso(dau.thoi_gian_ket_thuc))}` : `Lấy hàng ${gioNgay(dau.gio_lay_hang)}`}
        </div>
      </td>
      <td className="gh-c-kip">
        <div className="gh-kip">
          {gt ? (
            <>
              <span className="gh-ncc">Nhà gia công</span>
              <span>{gt.nha_cung_cap_ten ?? "—"}</span>
            </>
          ) : (
            <>
              {(l?.xe_bien_so ?? dau.xe_bien_so) && <span className="gh-the gh-the--xe">{l?.xe_bien_so ?? dau.xe_bien_so}</span>}
              <span>{dau.employee_name}</span>
              {dau.phu_xe_name && <span className="gh-nho">phụ xe {dau.phu_xe_name}</span>}
            </>
          )}
        </div>
      </td>
      <td>
        <ol className="gh-ldiem">
          {ds.map((t, i) => (
            <li key={t.id}>
              <span className={`gh-so${coKetQua(t) ? " is-xong" : ""}`} aria-hidden="true">{i + 1}</span>
              <div className="gh-ldiem__khach">
                <div className="gh-ldiem__ten">{t.customer_name}</div>
                <div className="gh-ldiem__phu">
                  {t.order_code && <span className="gh-the">{t.order_code}</span>}
                  {t.dia_chi && <span>{diaChiGon(t.dia_chi)}</span>}
                </div>
              </div>
              <span className="gh-nho" title={`Hẹn giao ${ngay(t.ngay_can_giao)}`}>{ngayNgan(t.ngay_can_giao)}</span>
            </li>
          ))}
        </ol>
      </td>
      <td className="gh-c-td">
        <div className="gh-td">
          <Pill text={tinh.text} tone={tinh.tone} />
          {hen && (hen.tre ? <Pill text={hen.text} tone="warn" /> : <span className="gh-nho">{hen.text}</span>)}
          {l && daChay && (
            <>
              <span className="gh-vach" aria-hidden="true">
                {ds.map((t) => (
                  <i key={t.id} className={coKetQua(t) ? "x" : t.trang_thai === "dang_giao" ? "d" : undefined} />
                ))}
              </span>
              <span className="gh-nho">{xong} trên {ds.length} điểm</span>
            </>
          )}
        </div>
      </td>
      <td className="gh-c-km">{km > 0 ? so(km) : <span className="gh-nho">—</span>}</td>
      <td className="gh-c-tao">
        <div>{ngay(taoLuc)}</div>
        <div className="gh-nho">{taoLuc ? gioNgay(taoLuc).split(" ")[0] : ""}</div>
      </td>
      {/* Bấm nút không mở ngăn — nút làm thẳng bước kế tiếp. */}
      <td className="gh-c-nut" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {nut}
      </td>
    </tr>
  );
}
