/** Ngăn CHI TIẾT một phiếu chi (đặc tả A.5, PC-2, PC-6) — vỏ chung `NganPhai`.
 *
 *  Đầu ngăn: đường dẫn "Phiếu chi > mã" + chép mã — người nhận + pill — "In phiếu", "⋯" — số tiền
 *  và bằng chữ — dải tóm tắt (Ngày chi, Hình thức, Nguồn, Người lập) — tab Chi tiết / Chứng từ /
 *  Lịch sử. Ngăn tự nạp lại phiếu và tệp đính kèm khi có sự kiện đẩy (`eventTick`).
 *  Hủy phiếu là KHUNG viền đỏ ở đầu tab Chi tiết, lỗi nằm ngay trong khung (không banner sau lớp phủ).
 *  Phiếu chi không sửa được: sai thì hủy (có lý do) rồi lập lại.
 */
import { ArrowDown, Check, CircleAlert, ExternalLink, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  api,
  type PaymentVoucherAttachment,
  type PaymentVoucherRow,
  type PurchaseRequestRow,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { taiVaInBangKe } from "../../../../utils/printBangKeTamUng";
import { NganPhai } from "../../shared/NganPhai";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, tien } from "../../shared/dinhDang";
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
import { printVoucher } from "../print";
import { STATUS_META, VOUCHER_METHOD_LABELS, nguonPhieu } from "../shared/list-constants";
import { TabLichSu, viecLichSu } from "./TabLichSu";



export type QuyenNgan = {
  /** Gán / xoá chứng từ (ô Lập của màn Phiếu chi). */
  lap: boolean;
  huy: boolean;
  in: boolean;
  /** Ô Xem của màn Đơn mua hàng (Kế toán) — mới mở được đơn và đọc số đợt giao. */
  xemDonMua: boolean;
};


export function VouchersDrawer({
  dau,
  eventTick,
  quyen,
  len,
  xuong,
  onDong,
  onDoi,
  onMoDonMua,
  onMoPhieuThu,
  onMoYeuCau,
}: {
  /** Dòng của bảng — vẽ ngay, rồi ngăn tự nạp bản mới nhất. */
  dau: PaymentVoucherRow;
  eventTick: number;
  quyen: QuyenNgan;
  len?: () => void;
  xuong?: () => void;
  onDong: () => void;
  /** Phiếu vừa đổi (hủy, thêm/xoá chứng từ) — trang nạp lại bảng và thẻ lọc. */
  onDoi: () => void;
  onMoDonMua?: (code: string) => void;
  onMoPhieuThu: (code: string) => void;
  /** Mở màn Yêu cầu mua hàng theo mã — chỉ truyền khi người xem có ô Xem của màn đó. */
  onMoYeuCau?: (code: string) => void;
}) {
  const { token } = useAuth();
  const [phieu, setPhieu] = useState<PaymentVoucherRow>(dau);
  const [tep, setTep] = useState<PaymentVoucherAttachment[]>([]);
  const [don, setDon] = useState<PurchaseRequestRow | null>(null);
  // Tab đang xem nhớ tới khi đóng trang (đặc tả A.5).
  const [tab, setTab] = useTabNho("phieu-chi");
  const [lamMoi, setLamMoi] = useState(0);
  const [loi, setLoi] = useState<string | null>(null);
  const id = dau.id;


  // Đổi sang phiếu khác (↑ ↓): bỏ mọi thứ đang dở của phiếu trước.
  useEffect(() => {
    setPhieu(dau);
    setTep([]);
    setDon(null);
    setLoi(null);
    huy.datLai();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Nạp lại phiếu + tệp: lúc mở, khi có sự kiện đẩy, và sau mỗi thao tác trong ngăn.
  useEffect(() => {
    if (!token) return;
    let conHieuLuc = true;
    api.accounting.voucher(token, id)
      .then((p) => conHieuLuc && setPhieu(p))
      .catch(() => undefined);
    api.accounting.voucherAttachments(token, id)
      .then((r) => conHieuLuc && setTep(r.items))
      .catch(() => conHieuLuc && setTep([]));
    return () => {
      conHieuLuc = false;
    };
  }, [token, id, eventTick, lamMoi]);

  // Số của đợt giao (Giá trị — Trừ cọc — Còn nợ) nằm ở đơn mua, không ở phiếu.
  const donId = phieu.source_type === "purchase_request" ? phieu.purchase_request_id : null;
  useEffect(() => {
    if (!token || donId == null || !quyen.xemDonMua) return;
    let conHieuLuc = true;
    api.purchaseRequests.get(token, donId)
      .then((d) => conHieuLuc && setDon(d))
      .catch(() => conHieuLuc && setDon(null));
    return () => {
      conHieuLuc = false;
    };
  }, [token, donId, quyen.xemDonMua, eventTick, lamMoi]);

  const thayDoi = () => {
    setLamMoi((n) => n + 1);
    onDoi();
  };

  // Khung hủy phiếu (PC-6).
  const huy = useHuyPhieu(
    token ? (lyDo) => api.accounting.cancelVoucher(token, phieu.id, lyDo) : null,
    (p: PaymentVoucherRow) => {
      setPhieu(p);
      thayDoi();
    },
  );

  const nguon = nguonPhieu(phieu);
  const coThuLai = phieu.receipt_received_amount + phieu.receipt_pending_amount > 0;
  const lyDoKhongHuy = coThuLai ? "Phiếu đã có phiếu thu lại — hủy phiếu thu trước" : null;
  const huyDuoc = quyen.huy && phieu.status === "paid";
  const viec = viecLichSu(phieu, tep);

  function inPhieu() {
    setLoi(null);
    if (!printVoucher(phieu)) setLoi("Trình duyệt đang chặn cửa sổ in. Cho phép cửa sổ bật lên rồi thử lại.");
  }

  const nguonO: ReactNode =
    phieu.source_type === "purchase_request" && nguon.ma && onMoDonMua ? (
      <button type="button" className="kt-lk" onClick={() => onMoDonMua(nguon.ma!)}>
        {`${nguon.loai} ${nguon.ma}`}
      </button>
    ) : (
      [nguon.loai, nguon.ma].filter(Boolean).join(" ")
    );

  const dot = don && phieu.delivery_id != null ? don.deliveries.find((d) => d.id === phieu.delivery_id) ?? null : null;

  return (
    <NganPhai
      duongDan={<DuongDanPhieu loai="Phiếu chi" ma={phieu.code} />}
      tieuDe={phieu.supplier_name || phieu.code}
      the={<span className={`kt-tt kt-tt--${phieu.status === "paid" ? "xanh" : "xam"}`}>{STATUS_META[phieu.status].label}</span>}
      hanhDong={
        <>
          {quyen.in && (
            <button type="button" className="kt-btn" onClick={inPhieu}>
              <Printer size={16} aria-hidden="true" />
              In phiếu
            </button>
          )}
          {quyen.in && phieu.source_type === "salary_advance" && token && (
            <button type="button" className="kt-btn"
              onClick={() => {
                setLoi(null);
                taiVaInBangKe(token, phieu.id).catch((e: Error) => setLoi(e.message));
              }}>
              In bảng kê
            </button>
          )}
          {huyDuoc && (
            <MenuThaoTac muc={[{
              nhan: "Hủy phiếu",
              phu: lyDoKhongHuy ?? "Phiếu còn trong sổ với dấu Đã hủy",
              nguy: true,
              khoa: !!lyDoKhongHuy,
              onChon: () => {
                setTab("tt");
                huy.moKhung();
              },
            }]} />
          )}
        </>
      }
      soLon={<SoLonPhieu soVnd={phieu.amount_vnd} so={phieu.amount} tienTe={phieu.currency} tyGia={phieu.exchange_rate} />}
      tomTat={[
        { nhan: "Ngày chi", giaTri: ngay(phieu.voucher_date) },
        { nhan: "Hình thức", giaTri: VOUCHER_METHOD_LABELS[phieu.voucher_type] },
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
          {huy.mo && (
            <KhungHuyPhieu ma={phieu.code} huy={huy}
              ghi="Phiếu vẫn còn trong sổ với dấu Đã hủy, in ra có chữ ĐÃ HỦY. Cần chi lại thì lập phiếu mới." />
          )}

          <div className="kt-luoi2">
            <div className="kt-hop">
              <div className="kt-hop__tieu">Thông tin phiếu</div>
              <div className="kt-hop__than">
                <dl className="kt-kv">
                  <Dong nhan="Nội dung chi">{phieu.content}</Dong>
                  <Dong nhan="Người nhận">
                    {phieu.voucher_type === "cash" ? phieu.cash_recipient_name : phieu.beneficiary_account_holder}
                  </Dong>
                  {phieu.voucher_type === "cash" && (
                    <>
                      <Dong nhan="Địa chỉ người nhận">{phieu.cash_recipient_address}</Dong>
                      <Dong nhan="Giấy tờ (CCCD)">{phieu.cash_recipient_identity}</Dong>
                    </>
                  )}
                  <Dong nhan="Mã giao dịch ngân hàng">{phieu.bank_reference}</Dong>
                  <Dong nhan="Số chứng từ">{phieu.doc_no}</Dong>
                  {phieu.invoice_number && (
                    <Dong nhan="Hoá đơn">
                      <Cum>
                        <span>{phieu.invoice_number}</span>
                        {phieu.invoice_date && <TheNho>{`Ngày ${ngay(phieu.invoice_date)}`}</TheNho>}
                      </Cum>
                    </Dong>
                  )}
                  <Dong nhan="Số hợp đồng">{phieu.contract_number}</Dong>
                  {phieu.source_request_codes.length > 0 && (
                    <Dong nhan="Yêu cầu mua">
                      <Cum>
                        {phieu.source_request_codes.map((ma) =>
                          onMoYeuCau ? (
                            <button key={ma} type="button" className="kt-lk" onClick={() => onMoYeuCau(ma)}>{ma}</button>
                          ) : (
                            <span key={ma}>{ma}</span>
                          ),
                        )}
                      </Cum>
                    </Dong>
                  )}
                  <Dong nhan="Ghi chú">{phieu.note}</Dong>
                </dl>
              </div>
            </div>
            <div className="kt-hop">
              <div className="kt-hop__tieu">Dòng tiền</div>
              <div className="kt-dt-tien">
                {phieu.voucher_type === "bank_transfer" ? (
                  <>
                    <div className="kt-dt-tien__muc">
                      <span>Trả từ tài khoản</span>
                      <b>{soTaiKhoan(phieu.company_bank_name, phieu.company_account_number)}</b>
                      <em className="kt-cum">
                        {phieu.company_account_holder && <span>{phieu.company_account_holder}</span>}
                        {phieu.company_bank_branch && <TheNho>{phieu.company_bank_branch}</TheNho>}
                      </em>
                    </div>
                    <div className="kt-dt-tien__mui">
                      <i><ArrowDown size={14} aria-hidden="true" /></i>
                      {tien(phieu.amount_vnd)}
                    </div>
                    <div className="kt-dt-tien__muc">
                      <span>Tài khoản người nhận</span>
                      <b>{soTaiKhoan(phieu.beneficiary_bank_name, phieu.beneficiary_account_number)}</b>
                      <em className="kt-cum">
                        {phieu.beneficiary_account_holder && <span>{phieu.beneficiary_account_holder}</span>}
                        {phieu.beneficiary_bank_branch && <TheNho>{phieu.beneficiary_bank_branch}</TheNho>}
                      </em>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="kt-dt-tien__muc">
                      <span>Trả từ</span>
                      <b>Quỹ tiền mặt</b>
                    </div>
                    <div className="kt-dt-tien__mui">
                      <i><ArrowDown size={14} aria-hidden="true" /></i>
                      {tien(phieu.amount_vnd)}
                    </div>
                    <div className="kt-dt-tien__muc">
                      <span>Người nhận</span>
                      <b>{phieu.cash_recipient_name || phieu.supplier_name || "—"}</b>
                      {phieu.cash_recipient_address && <em>{phieu.cash_recipient_address}</em>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {coThuLai && (
            <div className="kt-bang-xam">
              <span className="kt-cum">
                {phieu.receipt_received_amount > 0 && <span>{`Đã thu lại ${tien(phieu.receipt_received_amount)}`}</span>}
                {phieu.receipt_pending_amount > 0 && <span>{`Chờ thu ${tien(phieu.receipt_pending_amount)}`}</span>}
                <button type="button" className="kt-lk" onClick={() => onMoPhieuThu(phieu.code)}>Xem phiếu thu</button>
              </span>
            </div>
          )}

          {phieu.source_type === "purchase_request" && (
            <div className="kt-hop">
              <div className="kt-hop__tieu">
                {phieu.payment_stage === "advance" ? "Đặt cọc cho đơn mua" : "Trả cho đợt giao"}
                {onMoDonMua && nguon.ma && (
                  <button type="button" className="kt-lk" onClick={() => onMoDonMua(nguon.ma!)}>
                    Mở đơn mua
                    <ExternalLink size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="kt-hop__than kt-hop__than--luoi">
                {phieu.payment_stage === "advance" ? (
                  <span className="kt-mo">Phiếu đặt cọc không gắn đợt giao. Cọc trừ dần vào công nợ của cả đơn.</span>
                ) : phieu.delivery_seq_no == null ? (
                  <span className="kt-mo">Đơn không theo dõi theo đợt giao.</span>
                ) : (
                  <>
                    <div className="kt-dong-dot">
                      <b>{`Đợt ${phieu.delivery_seq_no}`}</b>
                      {dot && (
                        <Cum className="kt-mo">
                          <span>{`Giao ${ngay(dot.delivery_date)}`}</span>
                          {dot.invoice_number && <TheNho>{`Hoá đơn ${dot.invoice_number}`}</TheNho>}
                          {dot.lines.slice(0, 2).map((l) => (
                            <TheNho key={l.id}>{l.item_name}</TheNho>
                          ))}
                          {dot.lines.length > 2 && <span>{`và ${dot.lines.length - 2} mặt hàng khác`}</span>}
                        </Cum>
                      )}
                      {dot && dot.con_no <= 0 && (
                        <span className="kt-pill kt-pill--xanh">
                          <Check size={14} aria-hidden="true" />
                          Đợt đã trả đủ
                        </span>
                      )}
                    </div>
                    {dot && (
                      <TienDot o={[
                        { nhan: "Giá trị đợt", so: dot.amount },
                        { nhan: "Trừ cọc", so: dot.coc_bu },
                        { nhan: "Phiếu này", so: phieu.amount_vnd },
                        { nhan: "Còn nợ", so: dot.con_no },
                      ]} />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "ct" && token && (
        <TabChungTu tep={tep} daHuy={phieu.status === "cancelled"} coQuyen={quyen.lap} onDoi={thayDoi}
          taiMot={(f) => api.accounting.uploadVoucherAttachment(token, phieu.id, f)}
          xoaMot={(tepId) => api.accounting.deleteVoucherAttachment(token, phieu.id, tepId)}
          chuKeo="Kéo ảnh hoá đơn hoặc ủy nhiệm chi vào đây" chuChuaCo="Chưa có chứng từ. Kéo ảnh biên nhận vào đây" />
      )}

      {tab === "ls" && <TabLichSu viec={viec} />}
    </NganPhai>
  );
}
