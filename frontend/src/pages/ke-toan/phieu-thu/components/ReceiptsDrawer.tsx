/** Ngăn CHI TIẾT một phiếu thu (đặc tả A.5, PT-2) — đối xứng ngăn Phiếu chi, vỏ chung `NganPhai`.
 *
 *  Đầu ngăn: đường dẫn "Phiếu thu > mã" + chép mã — người nộp + pill — "Xác nhận đã thu" (phiếu cũ
 *  chờ thu), "Sửa" (phiếu cũ chờ thu từ phiếu chi), "In phiếu", "⋯" — số tiền và bằng chữ — dải tóm
 *  tắt (Ngày thu, Hình thức, Nguồn, Người lập) — tab Chi tiết / Chứng từ / Lịch sử.
 *  Hủy phiếu và Xác nhận đã thu là KHUNG tại chỗ ở đầu tab Chi tiết, lỗi nằm ngay trong khung.
 *  Phiếu cọc ĐÃ THU máy chủ không cho hủy (hủy từ đơn bán) ⇒ mục menu mờ kèm lý do (lỗi thật số 3).
 */
import { CircleAlert, ExternalLink, Pencil, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  api,
  type PaymentReceiptAttachment,
  type PaymentReceiptRow,
  type SalesInvoiceRow,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, ngayGio, tien } from "../../shared/dinhDang";
import { NganPhai } from "../../shared/NganPhai";
import {
  BangDaHuy,
  BienLaiPhieu,
  DuongDanPhieu,
  KhungHuyPhieu,
  LuoiThongTin,
  MenuThaoTac,
  TienDot,
  useHuyPhieu,
  useTabNho,
} from "../../shared/NganPhieu";
import { TabChungTu } from "../../shared/TabChungTu";
import { TabLichSu, tenTheoId, viecHuy, viecLap, viecThemTep, xepMoiNhat, type ViecLs } from "../../shared/TabLichSu";
import { printReceipt } from "../print";
import { STATUS_META } from "../shared/constants";
import { methodText, sourceCode, sourceLabel } from "../shared/helpers";
import { KhungXacNhanDaThu } from "./KhungXacNhanDaThu";


export type QuyenNganThu = {
  /** Gán / xoá chứng từ (ô Lập của màn Phiếu thu). */
  lap: boolean;
  huy: boolean;
  /** Xác nhận đã thu phiếu cũ (ô Đổi trạng thái). */
  xacNhan: boolean;
  in: boolean;
  /** Sửa phiếu cũ chờ thu từ phiếu chi (ô Lập). */
  sua: boolean;
};

/** Phiếu cũ được xác nhận SAU khi lập (máy chủ ghi `received_at` = lúc lập cho phiếu mới). */
const LECH_XAC_NHAN_MS = 60_000;

/** Dòng thời gian của MỘT phiếu thu: lập, xác nhận đã thu (phiếu cũ), thêm chứng từ, hủy. */
export function viecLichSuThu(phieu: PaymentReceiptRow, tep: PaymentReceiptAttachment[]): ViecLs[] {
  const nguoi: [number | null, string | null][] = [
    [phieu.created_by_user_id, phieu.created_by_name],
    [phieu.received_by_user_id, phieu.received_by_name],
    [phieu.cancelled_by_user_id, phieu.cancelled_by_name],
  ];
  const tenLap =
    phieu.source_type === "sales_invoice"
      ? "Lập phiếu thu từ Công nợ phải thu"
      : phieu.source_type === "order_deposit"
        ? "Lập phiếu thu từ Đơn hàng bán"
        : "Lập phiếu thu";
  const ds: ViecLs[] = [
    viecLap(phieu.created_at, tenLap, phieu.amount_vnd, methodText(phieu), phieu.created_by_name),
  ];
  if (phieu.received_at && Date.parse(phieu.received_at) - Date.parse(phieu.created_at) > LECH_XAC_NHAN_MS) {
    ds.push({
      khoa: "xac-nhan",
      moc: phieu.received_at,
      loai: "lap",
      ten: "Xác nhận đã thu",
      chiTiet: phieu.received_by_name ? <span>{phieu.received_by_name}</span> : null,
    });
  }
  ds.push(...viecThemTep(tep, (id) => tenTheoId(id, nguoi), phieu.created_at));
  if (phieu.cancelled_at) ds.push(viecHuy(phieu.cancelled_at, phieu.cancelled_by_name, phieu.cancel_reason));
  return xepMoiNhat(ds);
}


export function ReceiptsDrawer({
  dau,
  eventTick,
  quyen,
  len,
  xuong,
  onDong,
  onDoi,
  onSua,
  onMoNguon,
  onMoDonBan,
  onMoPhieuChi,
  onMoCongNo,
}: {
  /** Dòng của bảng — trang nạp lại bảng thì truyền bản mới (cùng id). */
  dau: PaymentReceiptRow;
  eventTick: number;
  quyen: QuyenNganThu;
  len?: () => void;
  xuong?: () => void;
  onDong: () => void;
  /** Phiếu vừa đổi (hủy, xác nhận, thêm/xoá chứng từ) — trang nạp lại bảng và thẻ lọc. */
  onDoi: () => void;
  /** Mở form sửa phiếu cũ chờ thu (PT-4). */
  onSua: (row: PaymentReceiptRow) => void;
  /** Cách mở nơi nguồn; undefined = không mở được. */
  onMoNguon?: (row: PaymentReceiptRow) => (() => void) | undefined;
  onMoDonBan?: (orderId: number) => void;
  onMoPhieuChi?: (code: string) => void;
  /** Mở Công nợ phải thu, ngăn của đúng khách (lỗi thật số 11). */
  onMoCongNo?: (khach: { id: number | null; name: string }) => void;
}) {
  const { token } = useAuth();
  const [phieu, setPhieu] = useState<PaymentReceiptRow>(dau);
  const [tep, setTep] = useState<PaymentReceiptAttachment[]>([]);
  const [hd, setHd] = useState<SalesInvoiceRow | null | "loi">(null);
  // Tab đang xem nhớ tới khi đóng trang (đặc tả A.5).
  const [tab, setTab] = useTabNho("phieu-thu");
  const [lamMoi, setLamMoi] = useState(0);
  const [loi, setLoi] = useState<string | null>(null);
  const [xacNhan, setXacNhan] = useState(false);
  const id = dau.id;


  // Đổi sang phiếu khác (↑ ↓): bỏ mọi thứ đang dở của phiếu trước.
  useEffect(() => {
    setTep([]);
    setHd(null);
    setLoi(null);
    setXacNhan(false);
    huy.datLai();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Không có endpoint đọc MỘT phiếu thu: bản mới nhất đến từ bảng (trang nạp lại sau sự kiện đẩy).
  useEffect(() => {
    setPhieu(dau);
  }, [dau]);

  useEffect(() => {
    if (!token) return;
    let conHieuLuc = true;
    api.accounting.receiptAttachments(token, id)
      .then((r) => conHieuLuc && setTep(r.items))
      .catch(() => conHieuLuc && setTep([]));
    return () => {
      conHieuLuc = false;
    };
  }, [token, id, eventTick, lamMoi]);

  // Số của hoá đơn (Giá trị — Trừ cọc — Còn nợ) nằm ở hoá đơn bán, không ở phiếu.
  const donId = phieu.source_type === "sales_invoice" ? phieu.order_id : null;
  const hdId = phieu.sales_invoice_id;
  useEffect(() => {
    if (!token || donId == null || hdId == null) return;
    let conHieuLuc = true;
    api.accounting.salesInvoices(token, donId)
      .then((r) => conHieuLuc && setHd(r.items.find((h) => h.id === hdId) ?? "loi"))
      .catch(() => conHieuLuc && setHd("loi"));
    return () => {
      conHieuLuc = false;
    };
  }, [token, donId, hdId, eventTick, lamMoi]);

  const thayDoi = () => {
    setLamMoi((n) => n + 1);
    onDoi();
  };

  const huy = useHuyPhieu(
    token ? (lyDo) => api.accounting.cancelReceipt(token, phieu.id, lyDo) : null,
    (p: PaymentReceiptRow) => {
      setPhieu(p);
      thayDoi();
    },
  );

  const hoaDon = hd && hd !== "loi" ? hd : null;
  // Phiếu thu hoá đơn mà thiếu mã đơn / mã hoá đơn: không có gì để tải — nói không đọc được ngay.
  const khongDocDuocHd = hd === "loi" || donId == null || hdId == null;
  // Phiếu cọc đơn bán hủy được ngay tại đây, kể cả đã thu (06/10/2026) — màn Đơn hàng không có nút hủy cọc.
  const heQuaHuy =
    // Chỉ hoá đơn còn hiệu lực mới "quay lại còn nợ": hoá đơn đã hủy máy chủ ép còn nợ về 0.
    phieu.source_type === "sales_invoice" && phieu.status === "received" && hoaDon?.status === "issued"
      ? `Hoá đơn ${hoaDon.invoice_number} sẽ quay lại còn nợ ${tien(hoaDon.remaining_amount + phieu.amount_vnd)}`
      : phieu.source_type === "order_deposit" && phieu.status === "received"
        ? `${phieu.order_code ? `Đơn ${phieu.order_code}` : "Đơn bán"} sẽ bớt ${tien(phieu.amount_vnd)} đã cọc`
        : "Phiếu còn trong sổ với dấu Đã hủy";
  const huyDuoc = quyen.huy && phieu.status !== "cancelled";
  const choThu = phieu.status === "waiting_receipt";
  const suaDuoc = quyen.sua && choThu && phieu.source_type === "purchase_refund" && phieu.payment_voucher_id != null;
  const viec = viecLichSuThu(phieu, tep);
  const tt = STATUS_META[phieu.status];
  const ma = sourceCode(phieu);
  const moNguon = ma ? onMoNguon?.(phieu) : undefined;

  function inPhieu() {
    setLoi(null);
    if (!printReceipt(phieu)) setLoi("Trình duyệt đang chặn cửa sổ in. Cho phép cửa sổ bật lên rồi thử lại.");
  }

  const chuNguon = !ma ? sourceLabel(phieu) : phieu.source_type === "sales_invoice" ? `Hoá đơn ${ma}` : `${sourceLabel(phieu)} ${ma}`;
  const nguonO: ReactNode = moNguon ? (
    <button type="button" className="kt-lk" onClick={moNguon}>{chuNguon}</button>
  ) : (
    chuNguon
  );

  return (
    <NganPhai
      duongDan={<DuongDanPhieu loai="Phiếu thu" ma={phieu.code} />}
      tieuDe={phieu.content || phieu.payer_name || phieu.code}
      the={<span className={`kt-tt kt-tt--${tt.mau}`}>{tt.label}</span>}
      hanhDong={
        <>
          {quyen.xacNhan && choThu && (
            <button type="button" className="kt-btn kt-btn--chinh"
              onClick={() => {
                setTab("tt");
                setXacNhan(true);
              }}>
              Xác nhận đã thu
            </button>
          )}
          {suaDuoc && (
            <button type="button" className="kt-btn" onClick={() => onSua(phieu)}>
              <Pencil size={16} aria-hidden="true" />
              Sửa
            </button>
          )}
          {quyen.in && (
            <button type="button" className="kt-btn" onClick={inPhieu}>
              <Printer size={16} aria-hidden="true" />
              In phiếu
            </button>
          )}
          {huyDuoc && (
            <MenuThaoTac muc={[{
              nhan: "Hủy phiếu",
              phu: heQuaHuy,
              nguy: true,
              onChon: () => {
                setTab("tt");
                setXacNhan(false);
                huy.moKhung();
              },
            }]} />
          )}
        </>
      }
      // Biên lai (phương án B, cùng khuôn ngăn Phiếu chi): tiền đi TỪ người nộp TỚI tài khoản / quỹ.
      bienLai={
        <BienLaiPhieu
          dongDau={`${methodText(phieu)} ngày ${ngay(phieu.receipt_date)}`}
          soVnd={phieu.amount_vnd} so={phieu.amount} tienTe={phieu.currency} tyGia={phieu.exchange_rate}
          tu={{ vai: "Từ", ten: phieu.payer_name || "—", phu: [phieu.payer_address] }}
          toi={phieu.receipt_method === "bank_transfer"
            ? {
                vai: "Tới",
                ten: phieu.company_account_holder || "Tài khoản công ty",
                phu: [
                  phieu.company_bank_name,
                  phieu.company_account_number && <span className="kt-so-tk">{phieu.company_account_number}</span>,
                  phieu.company_bank_branch && <TheNho>{phieu.company_bank_branch}</TheNho>,
                ],
              }
            : { vai: "Tới", ten: "Quỹ tiền mặt" }}
        />
      }
      tabs={[
        { id: "tt", nhan: "Chi tiết" },
        { id: "ct", nhan: "Chứng từ", dem: tep.length },
        { id: "ls", nhan: "Lịch sử", dem: viec.length },
      ]}
      tab={tab}
      onTab={setTab}
      len={len}
      xuong={xuong}
      onDong={onDong}
      chanDong={huy.goDo}
    >
      {phieu.status === "cancelled" && <BangDaHuy moc={phieu.cancelled_at} lyDo={phieu.cancel_reason} />}
      {loi && <p className="kt-o__loi" role="alert"><CircleAlert size={14} aria-hidden="true" />{loi}</p>}

      {tab === "tt" && (
        <>
          {xacNhan && choThu && token && (
            <KhungXacNhanDaThu
              phieu={phieu}
              goi={(ref) => api.accounting.markReceiptReceived(token, phieu.id, ref)}
              onXong={(p) => {
                setXacNhan(false);
                setPhieu(p);
                thayDoi();
              }}
              onDong={() => setXacNhan(false)}
            />
          )}
          {huy.mo && (
            <KhungHuyPhieu ma={phieu.code} huy={huy}
              ghi="Phiếu vẫn còn trong sổ với dấu Đã hủy, in ra có chữ ĐÃ HỦY. Cần thu lại thì lập phiếu mới." />
          )}

          {/* Lưới thông tin hai cột (Xero): nội dung thu đã là tiêu đề, người nộp + tài khoản + số tiền
              ở biên lai — ở đây là phần CHỨNG TỪ của phiếu: nguồn, số sổ, ai lập / xác nhận, giấy tờ kèm. */}
          <LuoiThongTin o={[
            { nhan: phieu.source_type === "sales_invoice" ? "Hoá đơn" : "Nguồn", giaTri: nguonO },
            { nhan: "Số chứng từ kế toán", giaTri: phieu.doc_no },
            { nhan: "Người lập", giaTri: <Cum><span>{phieu.created_by_name || "—"}</span><TheNho>{ngayGio(phieu.created_at)}</TheNho></Cum> },
            { nhan: "Xác nhận đã thu", giaTri: phieu.received_by_name && (
              <Cum><span>{phieu.received_by_name}</span>{phieu.received_at && <TheNho>{ngayGio(phieu.received_at)}</TheNho>}</Cum>
            ) },
            { nhan: "Chứng từ kèm", giaTri: tep.length > 0
                  ? <button type="button" className="kt-lk" onClick={() => setTab("ct")}>{`${tep.length} tệp`}</button>
                  : <span className="kt-thieu">Chưa có báo có hoặc biên nhận</span> },
            { nhan: "Đơn bán", giaTri: phieu.order_code && phieu.source_type !== "purchase_refund" && (
              onMoDonBan && phieu.order_id != null ? (
                <button type="button" className="kt-lk" onClick={() => onMoDonBan(phieu.order_id!)}>{phieu.order_code}</button>
              ) : phieu.order_code
            ) },
            { nhan: "Phiếu chi gốc", giaTri: phieu.payment_voucher_code && (
              onMoPhieuChi ? (
                <button type="button" className="kt-lk" onClick={() => onMoPhieuChi(phieu.payment_voucher_code!)}>
                  {phieu.payment_voucher_code}
                </button>
              ) : phieu.payment_voucher_code
            ) },
            { nhan: "Mã giao dịch ngân hàng", giaTri: phieu.bank_reference },
            { nhan: "Ghi chú", giaTri: phieu.note, rong: true },
          ]} />


          {phieu.source_type === "sales_invoice" && (
            <div className="kt-hop">
              <div className="kt-hop__tieu">
                Áp vào hoá đơn
                {onMoCongNo && hoaDon && (
                  <button type="button" className="kt-lk"
                    onClick={() => onMoCongNo({ id: hoaDon.customer_id, name: hoaDon.customer_name })}>
                    Mở công nợ khách này
                    <ExternalLink size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="kt-hop__than kt-hop__than--luoi">
                {hoaDon ? (
                  <>
                    <div className="kt-dong-dot">
                      <b>{[hoaDon.invoice_symbol, hoaDon.invoice_number].filter(Boolean).join(" ")}</b>
                      <Cum className="kt-mo">
                        <span>{`Ngày ${ngay(hoaDon.invoice_date)}`}</span>
                        {hoaDon.due_date && <TheNho>{`Hạn thu ${ngay(hoaDon.due_date)}`}</TheNho>}
                        {hoaDon.status === "cancelled" && <TheNho>Hoá đơn đã hủy</TheNho>}
                      </Cum>
                    </div>
                    <TienDot o={[
                      { nhan: "Giá trị", so: hoaDon.amount_vnd },
                      { nhan: "Trừ cọc", so: hoaDon.deposit_offset_amount },
                      { nhan: "Phiếu này", so: phieu.amount_vnd },
                      { nhan: "Còn nợ", so: hoaDon.remaining_amount },
                    ]} />
                  </>
                ) : (
                  <span className="kt-mo">
                    {khongDocDuocHd ? "Không đọc được số của hoá đơn này." : "Đang tải hoá đơn…"}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "ct" && token && (
        <TabChungTu tep={tep} daHuy={phieu.status === "cancelled"} coQuyen={quyen.lap} onDoi={thayDoi}
          taiMot={(f) => api.accounting.uploadReceiptAttachment(token, phieu.id, f)}
          xoaMot={(tepId) => api.accounting.deleteReceiptAttachment(token, phieu.id, tepId)}
          chuKeo="Kéo ảnh báo có hoặc biên nhận vào đây" chuChuaCo="Chưa có chứng từ. Kéo ảnh báo có vào đây" />
      )}

      {tab === "ls" && <TabLichSu viec={viec} />}
    </NganPhai>
  );
}
