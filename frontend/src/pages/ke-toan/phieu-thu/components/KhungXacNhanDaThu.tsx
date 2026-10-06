/** Khung "Xác nhận đã thu" TẠI CHỖ trong ngăn phiếu thu (đặc tả PT-2) — thay hộp nổi cũ.
 *
 *  Chỉ còn cho phiếu CŨ lỡ nằm lại ở trạng thái chờ thu: từ 27/08/2026 phiếu thu lập ra là ĐÃ THU,
 *  nên với mọi phiếu mới khung này không bao giờ hiện. Giữ nhánh chứ không xoá hẳn: xoá là phiếu chờ
 *  còn sót trong DB thật hết đường chốt, mà chúng đang KHÔNG được trừ vào công nợ.
 *  Luật giữ nguyên bản cũ: chuyển khoản bắt mã giao dịch; gửi `bank_reference` đã cắt khoảng trắng,
 *  trống thì null; tiền mặt luôn gửi null. Lỗi (thiếu mã, lỗi máy chủ) nằm ngay trong khung, không rơi ra sau lớp phủ.
 */
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useState } from "react";

import { ApiError, type PaymentReceiptRow } from "../../../../api/client";
import { Cum, TheNho } from "../../shared/Cum";
import { tien } from "../../shared/dinhDang";
import { methodText } from "../shared/helpers";

export function KhungXacNhanDaThu({
  phieu,
  goi,
  onXong,
  onDong,
}: {
  phieu: PaymentReceiptRow;
  /** Gọi máy chủ: `markReceiptReceived(token, id, bankRef | null)`. */
  goi: (bankRef: string | null) => Promise<PaymentReceiptRow>;
  onXong: (p: PaymentReceiptRow) => void;
  onDong: () => void;
}) {
  const [maGd, setMaGd] = useState(phieu.bank_reference ?? "");
  const [loi, setLoi] = useState<string | null>(null);
  const [dang, setDang] = useState(false);
  const isBank = phieu.receipt_method === "bank_transfer";

  async function xacNhan() {
    if (isBank && !maGd.trim()) {
      setLoi("Thu qua ngân hàng phải có mã giao dịch hoặc số báo có.");
      return;
    }
    setDang(true);
    setLoi(null);
    try {
      // Tiền mặt luôn gửi null (như bản cũ): mã sót lại trên phiếu tiền mặt bị xoá, không giữ ngầm.
      onXong(await goi(isBank ? maGd.trim() || null : null));
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không xác nhận được phiếu thu.");
    } finally {
      setDang(false);
    }
  }

  return (
    <section className="kt-khung" aria-label={`Xác nhận đã thu ${phieu.code}`}>
      <h3>
        <CircleCheck size={18} aria-hidden="true" />
        {`Xác nhận đã thu ${phieu.code}`}
        <button type="button" className="kt-ic" aria-label="Đóng khung xác nhận" title="Đóng" onClick={onDong}>
          <X size={16} aria-hidden="true" />
        </button>
      </h3>
      <p className="kt-ghi">
        <Cum>
          <span>{`Đã nhận ${tien(phieu.amount_vnd)} của ${phieu.payer_name}`}</span>
          <TheNho>{methodText(phieu)}</TheNho>
        </Cum>
      </p>
      {isBank && (
        <div className={`kt-o${loi ? " kt-o--loi" : ""}`}>
          <label htmlFor="kt-ma-gd-xac-nhan">Mã giao dịch ngân hàng <em className="kt-bb">*</em></label>
          <input id="kt-ma-gd-xac-nhan" autoFocus maxLength={64} value={maGd} placeholder="Số tham chiếu trên sao kê"
            aria-invalid={loi ? true : undefined}
            onChange={(e) => {
              setMaGd(e.target.value);
              if (loi) setLoi(null);
            }} />
        </div>
      )}
      {loi && (
        <span className="kt-o__loi" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {loi}
        </span>
      )}
      <div className="kt-khung__nut">
        <button type="button" className="kt-btn kt-btn--tron" onClick={onDong}>Đóng</button>
        <button type="button" className="kt-btn kt-btn--chinh" disabled={dang} onClick={() => void xacNhan()}>
          {dang ? "Đang xác nhận…" : "Xác nhận đã thu"}
        </button>
      </div>
    </section>
  );
}
