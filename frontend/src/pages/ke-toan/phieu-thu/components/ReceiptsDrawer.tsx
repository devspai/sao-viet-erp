/** Ngăn CHI TIẾT một phiếu thu (đặc tả A.5, PT-2) — đối xứng ngăn Phiếu chi, vỏ chung `NganPhai`.
 *
 *  Đầu ngăn: đường dẫn "Phiếu thu > mã" + chép mã — người nộp + pill — "Xác nhận đã thu" (phiếu cũ
 *  chờ thu), "Sửa" (phiếu cũ chờ thu từ phiếu chi), "In phiếu", "⋯" — số tiền và bằng chữ — dải tóm
 *  tắt (Ngày thu, Hình thức, Nguồn, Người lập) — tab Chi tiết / Chứng từ / Lịch sử.
 *  Hủy phiếu và Xác nhận đã thu là KHUNG tại chỗ ở đầu tab Chi tiết, lỗi nằm ngay trong khung.
 *  Phiếu cọc ĐÃ THU máy chủ không cho hủy (hủy từ đơn bán) ⇒ mục menu mờ kèm lý do (lỗi thật số 3).
 */
import { ArrowDown, CircleAlert, ExternalLink, Pencil, Printer } from "lucide-react";
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
import { ngay, tien } from "../../shared/dinhDang";
import { NganPhai } from "../../shared/NganPhai";
import {
  BangDaHuy,
  Dong,
  DuongDanPhieu,
  KhungHuyPhieu,
  MenuThaoTac,
  SoLonPhieu,
  TienDot,
  soTaiKhoan,
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
  // Máy chủ chỉ cho hủy phiếu cọc khi còn chờ thu (`cancel_receipt`): đã thu thì hủy từ đơn bán.
  const lyDoKhongHuy =
    phieu.source_type === "order_deposit" && phieu.status !== "waiting_receipt" ? "Phiếu cọc đã thu — hủy từ đơn bán" : null;
  const heQuaHuy =
    // Chỉ hoá đơn còn hiệu lực mới "quay lại còn nợ": hoá đơn đã hủy máy chủ ép còn nợ về 0.
    phieu.source_type === "sales_invoice" && phieu.status === "received" && hoaDon?.status === "issued"
      ? `Hoá đơn ${hoaDon.invoice_number} sẽ quay lại còn nợ ${tien(hoaDon.remaining_amount + phieu.amount_vnd)}`
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
      tieuDe={phieu.payer_name || phieu.code}
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
              phu: lyDoKhongHuy ?? heQuaHuy,
              nguy: true,
              khoa: !!lyDoKhongHuy,
              onChon: () => {
                setTab("tt");
                setXacNhan(false);
                huy.moKhung();
              },
            }]} />
          )}
        </>
      }
      soLon={<SoLonPhieu soVnd={phieu.amount_vnd} so={phieu.amount} tienTe={phieu.currency} tyGia={phieu.exchange_rate} />}
      tomTat={[
        { nhan: "Ngày thu", giaTri: ngay(phieu.receipt_date) },
        { nhan: "Hình thức", giaTri: methodText(phieu) },
        { nhan: "Nguồn", giaTri: nguonO },
        { nhan: "Người lập", giaTri: phieu.created_by_name || "—" },
      ]}
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

          <div className="kt-luoi2">
            <div className="kt-hop">
              <div className="kt-hop__tieu">Thông tin phiếu</div>
              <div className="kt-hop__than">
                <dl className="kt-kv">
                  <Dong nhan="Nội dung thu">{phieu.content}</Dong>
                  <Dong nhan="Người nộp">{phieu.payer_name}</Dong>
                  <Dong nhan="Địa chỉ người nộp">{phieu.payer_address}</Dong>
                  {phieu.order_code && phieu.source_type !== "purchase_refund" && (
                    <Dong nhan="Đơn bán">
                      {onMoDonBan && phieu.order_id != null ? (
                        <button type="button" className="kt-lk" onClick={() => onMoDonBan(phieu.order_id!)}>
                          {phieu.order_code}
                        </button>
                      ) : (
                        phieu.order_code
                      )}
                    </Dong>
                  )}
                  {phieu.payment_voucher_code && (
                    <Dong nhan="Phiếu chi gốc">
                      {onMoPhieuChi ? (
                        <button type="button" className="kt-lk" onClick={() => onMoPhieuChi(phieu.payment_voucher_code!)}>
                          {phieu.payment_voucher_code}
                        </button>
                      ) : (
                        phieu.payment_voucher_code
                      )}
                    </Dong>
                  )}
                  <Dong nhan="Mã giao dịch ngân hàng">{phieu.bank_reference}</Dong>
                  <Dong nhan="Số chứng từ">{phieu.doc_no}</Dong>
                  <Dong nhan="Ghi chú">{phieu.note}</Dong>
                </dl>
              </div>
            </div>
            <div className="kt-hop">
              <div className="kt-hop__tieu">Dòng tiền</div>
              <div className="kt-dt-tien">
                <div className="kt-dt-tien__muc">
                  <span>Người nộp</span>
                  <b>{phieu.payer_name || "—"}</b>
                  <em>{methodText(phieu)}</em>
                </div>
                <div className="kt-dt-tien__mui">
                  <i><ArrowDown size={14} aria-hidden="true" /></i>
                  {tien(phieu.amount_vnd)}
                </div>
                {phieu.receipt_method === "bank_transfer" ? (
                  <div className="kt-dt-tien__muc">
                    <span>Vào tài khoản</span>
                    <b>{soTaiKhoan(phieu.company_bank_name, phieu.company_account_number)}</b>
                    <em className="kt-cum">
                      {phieu.company_account_holder && <span>{phieu.company_account_holder}</span>}
                      {phieu.company_bank_branch && <TheNho>{phieu.company_bank_branch}</TheNho>}
                    </em>
                  </div>
                ) : (
                  <div className="kt-dt-tien__muc">
                    <span>Vào</span>
                    <b>Quỹ tiền mặt</b>
                  </div>
                )}
              </div>
            </div>
          </div>

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
