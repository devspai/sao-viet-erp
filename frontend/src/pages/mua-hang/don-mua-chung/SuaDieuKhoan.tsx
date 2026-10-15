// Hộp SỬA ĐIỀU KHOẢN của đơn mua — hạn trả, cọc dự kiến, số hợp đồng. Mở từ chữ "Sửa" ở mục Điều
// khoản cột phải ngăn đơn. Phương án A (15/10/2026): hỏi đúng một câu "hạn trả tính từ đâu" (ngày
// hoá đơn từng đợt hay một ngày chốt cho cả đơn); số ngày NCC cho nợ thuộc hồ sơ NCC nên chỉ nhắc
// kèm lối sang đó, không sửa ở đây. Luật giữ nguyên khối Hợp đồng cũ:
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
import { money } from "../../../utils/format";
import { moTaHanTra } from "./hanTra";
import "../trang-thai-mua.css";

export function SuaDieuKhoan({
  row,
  onDong,
  onLuu,
  onMoNcc,
}: {
  row: PurchaseRequestRow;
  onDong: () => void;
  onLuu: (next: PurchaseRequestRow) => void;
  /** Thiếu = không có quyền xem màn Nhà cung cấp ⇒ chỉ nhắc bằng chữ. */
  onMoNcc?: (supplierId: number) => void;
}) {
  const { token } = useAuth();
  const [soHopDong, setSoHopDong] = useState(row.contract_number ?? "");
  const [ngayChot, setNgayChot] = useState(row.debt_cutoff_date ?? "");
  const [theoChot, setTheoChot] = useState(!!row.debt_cutoff_date);
  const [coc, setCoc] = useState(String(row.deposit_expected || ""));
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const cocKhoa = !["draft", "pending_approval", "rejected"].includes(row.status);
  const tranCoc = row.total_estimate ?? 0;
  const cocVuot = !cocKhoa && Math.round(Number(coc) || 0) > tranCoc;

  async function luu() {
    if (!token || busy) return;
    if (theoChot && !ngayChot) {
      setLoi("Chọn ngày chốt công nợ, hoặc chọn tính hạn từ ngày hoá đơn.");
      return;
    }
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
          debt_cutoff_date: theoChot ? ngayChot || null : null,
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
      {/* Mỗi ô một dòng: nhãn trái, ô phải, lời nhắc là chữ nhỏ ngay dưới ô (07/10/2026). */}
      <div className="mh-dk">
        <div className="mh-dk__dong">
          <span className="mh-dk__nhan">Hạn trả tính từ</span>
          <span className="mh-dk__o">
            <span className="mh-dk__chon" role="radiogroup" aria-label="Hạn trả tính từ">
              <label>
                <input type="radio" name="han-tra" checked={!theoChot} onChange={() => setTheoChot(false)} />
                <span>Ngày hoá đơn của từng đợt giao</span>
              </label>
              <label>
                <input type="radio" name="han-tra" checked={theoChot} onChange={() => setTheoChot(true)} />
                <span>Một ngày chốt công nợ cho cả đơn</span>
              </label>
            </span>
            {theoChot && (
              <ChonNgay className="input mh-dk__ngay mh-dk__ngay--lui" value={ngayChot ?? ""} onChange={(v) => setNgayChot(v)} />
            )}
            <small className="mh-dk__ncc">
              {row.supplier_credit_days == null
                ? "Nhà cung cấp này chưa khai số ngày cho nợ nên chưa suy ra được hạn trả."
                : row.supplier_credit_days === 0
                  ? "Nhà cung cấp này cho nợ 0 ngày (trả ngay)."
                  : `Nhà cung cấp này cho nợ ${row.supplier_credit_days} ngày.`}{" "}
              Số ngày cho nợ đặt ở hồ sơ nhà cung cấp.
              {onMoNcc && row.supplier_id != null && (
                <>
                  {" "}
                  <button type="button" className="mh-lk" onClick={() => onMoNcc(row.supplier_id as number)}>
                    Mở hồ sơ nhà cung cấp
                  </button>
                </>
              )}
            </small>
          </span>
        </div>
        <div className="mh-dk__dong">
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
                  aria-label="Cọc dự kiến"
                  aria-invalid={cocVuot || undefined}
                />
                <span>đ</span>
              </span>
            )}
            <small className={`mh-dk__nhac${cocVuot ? " is-loi" : ""}`}>
              {cocKhoa
                ? "Đã khoá vì đơn đã duyệt: đây là số người duyệt đồng ý."
                : `Tối đa ${money(tranCoc)}. Kế toán lập phiếu chi cọc sẽ thấy số này điền sẵn. Đơn được duyệt xong là không đổi được nữa.`}
            </small>
          </span>
        </div>
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
        <p className="mh-dk__ket" aria-live="polite">
          Sau khi lưu, hạn trả của đơn:{" "}
          <span>
            {theoChot && !ngayChot
              ? "chọn ngày chốt để tính"
              : (() => {
                  const h = moTaHanTra(row.supplier_credit_days, theoChot ? ngayChot : null);
                  return h.phu && !h.chuaRo ? `${h.chinh} (${h.phu})` : h.chinh.toLowerCase();
                })()}
          </span>
        </p>
      </div>
    </ConfirmDialog>
  );
}
