// Hộp SỬA ĐIỀU KHOẢN của đơn mua — số hợp đồng, ngày chốt công nợ, cọc dự kiến. Mở từ chữ "Sửa"
// ở mục Điều khoản cột phải ngăn đơn (phương án 3). Luật giữ nguyên khối Hợp đồng cũ:
//  - Cọc dự kiến chỉ để NHẮC, không vào công thức công nợ (cọc thật là phiếu chi Đặt cọc).
//  - Cọc KHOÁ sau khi duyệt (con số người duyệt đã đồng ý); số hợp đồng và ngày chốt không khoá —
//    hợp đồng thường ký sau khi đơn đã duyệt.
//  - Trần cọc = tổng đơn; chặn ở đây chỉ để báo sớm, luật thật ở `PurchaseService._chan_coc_vuot_tong`.
import { useState } from "react";
import { ApiError, api, type PurchaseRequestRow } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { ChonNgay } from "../../../components/ChonNgay";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { OGoDinhDang } from "../../../components/OGoDinhDang";
import { hanTraTuMoc, money } from "../../../utils/format";
import "../trang-thai-mua.css";

export function SuaDieuKhoan({
  row,
  onDong,
  onLuu,
}: {
  row: PurchaseRequestRow;
  onDong: () => void;
  onLuu: (next: PurchaseRequestRow) => void;
}) {
  const { token } = useAuth();
  const [soHopDong, setSoHopDong] = useState(row.contract_number ?? "");
  const [ngayChot, setNgayChot] = useState(row.debt_cutoff_date ?? "");
  const [coc, setCoc] = useState(String(row.deposit_expected || ""));
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const cocKhoa = !["draft", "pending_approval", "rejected"].includes(row.status);
  const tranCoc = row.total_estimate ?? 0;
  const cocVuot = !cocKhoa && Math.round(Number(coc) || 0) > tranCoc;

  async function luu() {
    if (!token || busy) return;
    if (cocVuot) {
      setLoi(`Cọc lớn hơn tổng đơn (${money(tranCoc)}). Cọc là ứng trước một phần của chính đơn này.`);
      return;
    }
    setBusy(true);
    setLoi(null);
    try {
      onLuu(
        await api.purchaseRequests.updateContract(token, row.id, {
          contract_number: soHopDong.trim() || null,
          // Chuỗi rỗng phải hoá `null` — server nhận `date | None`, "" là 422.
          debt_cutoff_date: ngayChot || null,
          // Cọc đã khoá thì gửi lại ĐÚNG số cũ — server chỉ chặn khi số THAY ĐỔI.
          deposit_expected: cocKhoa ? row.deposit_expected : Math.max(0, Math.round(Number(coc) || 0)),
        }),
      );
      onDong();
    } catch (err) {
      setLoi(err instanceof ApiError ? err.message : "Không lưu được điều khoản.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open
      title={`Điều khoản đơn ${row.code}`}
      confirmLabel="Lưu điều khoản"
      busy={busy}
      error={loi}
      onConfirm={luu}
      onCancel={onDong}
    >
      {/* Mỗi ô một dòng: nhãn trái, ô phải, lời nhắc là chữ nhỏ ngay dưới ô (07/10/2026). Bản trước
          dồn bốn cột vào hộp 560px nên nhãn gãy ba dòng, ô hợp đồng cắt chữ, lời nhắc thành hộp xám. */}
      <div className="mh-dk">
        <label className="mh-dk__dong">
          <span className="mh-dk__nhan">Số hợp đồng</span>
          <span className="mh-dk__o">
            <input
              className="input"
              maxLength={64}
              value={soHopDong}
              onChange={(e) => setSoHopDong(e.target.value)}
              placeholder="Chưa có hợp đồng"
            />
          </span>
        </label>
        <label className="mh-dk__dong">
          <span className="mh-dk__nhan">Ngày chốt công nợ</span>
          <span className="mh-dk__o">
            <ChonNgay className="input mh-dk__ngay" value={ngayChot ?? ""} onChange={(v) => setNgayChot(v)} />
            <small className="mh-dk__nhac">
              {ngayChot && row.supplier_credit_days != null
                ? `Nhà cung cấp cho nợ ${row.supplier_credit_days} ngày kể từ mốc này, hạn trả ${hanTraTuMoc(ngayChot, row.supplier_credit_days)}.`
                : ngayChot
                  ? "Nhà cung cấp chưa khai số ngày cho nợ nên chưa suy ra hạn trả. Khai ở danh mục Nhà cung cấp."
                  : "Bỏ trống thì hạn trả tính từ ngày hoá đơn của từng đợt."}
            </small>
          </span>
        </label>
        <label className="mh-dk__dong">
          <span className="mh-dk__nhan">Cọc dự kiến</span>
          <span className="mh-dk__o">
            {cocKhoa ? (
              <span className="mh-dk__chu">{money(row.deposit_expected || 0)}</span>
            ) : (
              <span className={`mh-dk__tien${cocVuot ? " is-loi" : ""}`}>
                {/* Dấu chấm nghìn khi gõ: "5000000" phải đếm chữ số mới biết là năm triệu. */}
                <OGoDinhDang
                  inputMode="numeric"
                  value={Number(coc) > 0 ? Number(coc).toLocaleString("vi-VN") : ""}
                  onChange={(e) => setCoc(e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  aria-invalid={cocVuot || undefined}
                />
                <span>đ</span>
              </span>
            )}
            <small className={`mh-dk__nhac${cocVuot ? " is-loi" : ""}`}>
              {cocKhoa
                ? "Đã khoá vì đơn đã duyệt: đây là số người duyệt đồng ý. Cần đổi thì đưa đơn về nháp rồi duyệt lại."
                : `Tối đa ${money(tranCoc)}. Số này điền sẵn khi Kế toán lập phiếu chi cọc.`}
            </small>
          </span>
        </label>
      </div>
    </ConfirmDialog>
  );
}
