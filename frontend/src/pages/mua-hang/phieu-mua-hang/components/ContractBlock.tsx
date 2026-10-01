// Khối HỢP ĐỒNG & CHỨNG TỪ trong drawer chi tiết đơn (tách từ pages/PurchaseRequestsPage.tsx).
import { useRef, useState } from "react";
import {
  ApiError,
  api,
  anhNho, assetUrl,
  type PurchaseAttachmentRow,
  type PurchaseRequestRow,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { Button } from "../../../../components/Button";
import { Icon } from "../../../../components/Icons";
import { fmtDate, hanTraTuMoc, money } from "../../../../utils/format";
import { ATTACHMENT_IMAGE_TYPES } from "../shared/constants";

/**
 * HỢP ĐỒNG & CHỨNG TỪ — số hợp đồng, cọc dự kiến, ảnh/PDF hợp đồng.
 *
 * Cố ý KHÔNG đẻ danh mục hợp đồng và không đẻ màn mới (Đ3): hợp đồng ở đây là một con số để đối
 * chiếu cộng vài cái ảnh. Tách khỏi form Sửa phiếu vì form đó chỉ mở được với phiếu nháp/bị từ
 * chối, mà hợp đồng thường ký SAU khi phiếu đã duyệt — bắt sửa ở màn nháp là không bao giờ điền
 * được.
 *
 * "Cọc dự kiến" chỉ để NHẮC — nó KHÔNG vào công thức công nợ (tiền cọc THẬT luôn là một phiếu chi
 * loại Đặt cọc; cho số này vào công thức là trừ cọc hai lần). Nhưng nó ĐƯỢC dùng để điền sẵn số
 * tiền khi kế toán lập phiếu Đặt cọc, nên phải khai đúng.
 *
 * CỌC KHOÁ SAU KHI DUYỆT (chủ chốt 06/08/2026): đó là con số người duyệt đã đồng ý; cho sửa sau
 * là đổi số đã ký mà không ai duyệt lại. Số hợp đồng và ảnh thì KHÔNG khoá — hợp đồng ký sau.
 */
export function ContractBlock({
  row,
  canUpdate,
  onChanged,
  onError,
}: {
  row: PurchaseRequestRow;
  canUpdate: boolean;
  onChanged: (next: PurchaseRequestRow) => void;
  onError: (message: string | null) => void;
}) {
  const { token } = useAuth();
  const [soHopDong, setSoHopDong] = useState(row.contract_number ?? "");
  const [ngayChot, setNgayChot] = useState(row.debt_cutoff_date ?? "");
  const [coc, setCoc] = useState(String(row.deposit_expected || ""));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Input file THẬT bị ẩn; cái người dùng thấy là một nút theo khuôn `.pdot__pick` — cùng nút với
  // hộp Ghi đợt giao ngay dưới. Ô `<input type=file>` trần ("Chọn tệp | Không có tệp nào được
  // chọn") là giao diện mặc định của trình duyệt, lạc hẳn khỏi phần còn lại của hộp thoại.
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Cọc chỉ sửa được khi phiếu còn ở nháp / chờ duyệt / bị từ chối — khớp chốt bên service.
  const cocKhoa = !["draft", "pending_approval", "rejected"].includes(row.status);
  // TRẦN CỌC = tổng dự kiến của đơn (chủ chốt 15/08/2026). Cọc là ứng trước một phần của chính
  // đơn này nên không thể vượt giá trị đơn — mà số khai thừa không nằm yên: nó thành hạn mức
  // lập phiếu chi cọc, tiền ra khỏi két rồi mới có người hỏi.
  // Chặn ở đây chỉ để báo SỚM; luật thật nằm ở `PurchaseService._chan_coc_vuot_tong`.
  const tranCoc = row.total_estimate ?? 0;
  const cocVuot = !cocKhoa && Math.round(Number(coc) || 0) > tranCoc;
  const hopDong = row.attachments.filter((a) => a.kind === "hop_dong");
  const banDau =
    (row.contract_number ?? "") === soHopDong.trim() &&
    (row.debt_cutoff_date ?? "") === ngayChot &&
    (row.deposit_expected || 0) === (Number(coc) || 0);

  async function luu() {
    if (!token || busy || cocVuot) return;
    setBusy(true);
    onError(null);
    try {
      onChanged(
        await api.purchaseRequests.updateContract(token, row.id, {
          contract_number: soHopDong.trim() || null,
          // Chuỗi rỗng phải hoá `null`, không gửi "" — server nhận `date | None`, "" là 422.
          debt_cutoff_date: ngayChot || null,
          // Cọc đã khoá thì gửi lại ĐÚNG số cũ — server chỉ chặn khi số THAY ĐỔI, nhờ vậy sửa
          // riêng số hợp đồng trên đơn đã duyệt vẫn lưu được.
          deposit_expected: cocKhoa
            ? row.deposit_expected
            : Math.max(0, Math.round(Number(coc) || 0)),
        }),
      );
    } catch (err) {
      onError(
        err instanceof ApiError ? err.message : "Không lưu được thông tin hợp đồng.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function tai(list: FileList | null) {
    if (!token || !list?.length) return;
    setUploading(true);
    onError(null);
    try {
      let moi = row;
      for (const file of Array.from(list)) {
        moi = await api.purchaseRequests.uploadAttachment(
          token,
          row.id,
          file,
          "hop_dong",
        );
      }
      onChanged(moi);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Không tải được file lên.");
    } finally {
      setUploading(false);
    }
  }

  async function xoa(attachment: PurchaseAttachmentRow) {
    if (!token) return;
    setUploading(true);
    onError(null);
    try {
      onChanged(
        await api.purchaseRequests.deleteAttachment(token, row.id, attachment.id),
      );
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Không xóa được file.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="acct-tab2-container">
      {/* Thẻ 1: Thông tin Hợp đồng & Công nợ */}
      <section className="acct-card-section">
        <header className="acct-card-section__head">
          <span className="acct-card-section__title">
            <Icon name="fileText" size={15} />
            Hợp đồng &amp; Điều khoản chốt nợ
          </span>
          {canUpdate && (
            <Button
              type="button"
              variant="ghost"
              loading={busy}
              disabled={banDau || cocVuot}
              onClick={luu}
            >
              Lưu hợp đồng
            </Button>
          )}
        </header>

        <div className="acct-contract-grid">
          <label className="purchase__field">
            <span>Số hợp đồng</span>
            <input
              className="input"
              maxLength={64}
              readOnly={!canUpdate}
              value={soHopDong}
              onChange={(e) => setSoHopDong(e.target.value)}
              placeholder="Chưa có hợp đồng"
            />
          </label>

          <label className="purchase__field">
            <span>Ngày chốt công nợ</span>
            <input
              className="input"
              type="date"
              readOnly={!canUpdate}
              value={ngayChot}
              onChange={(e) => setNgayChot(e.target.value)}
            />
          </label>
        </div>

        {/* Hướng dẫn ngày chốt công nợ */}
        <div className="acct-field-hint" style={{ marginTop: 10 }}>
          {ngayChot && (row.supplier_credit_days ?? null) !== null ? (
            <>
              NCC cho nợ <strong>{row.supplier_credit_days} ngày</strong> kể từ mốc này ⇒ hạn
              trả <strong>{hanTraTuMoc(ngayChot, row.supplier_credit_days)}</strong>. Qua ngày đó
              chưa trả mới tính quá hạn.
            </>
          ) : ngayChot ? (
            <>
              NCC <strong>chưa khai số ngày cho nợ</strong> nên chưa suy ra hạn trả được — khai
              ở danh mục Nhà cung cấp.
            </>
          ) : (
            <>
              Mốc NCC chốt sổ cho đơn này. Bỏ trống thì hạn trả tính từ{" "}
              <strong>ngày hoá đơn</strong> của từng đợt như cũ.
            </>
          )}
        </div>

        {/* Khối Cọc dự kiến */}
        <div style={{ marginTop: 14 }}>
          <label className="purchase__field">
            <span>Cọc dự kiến{cocKhoa && " (đã duyệt — khoá)"}</span>
            {cocKhoa || !canUpdate ? (
              <span className="input purchase__number-input pdot__readonly-money">
                {money(Number(coc) || 0)}
              </span>
            ) : (
              <input
                className="input purchase__number-input"
                type="number"
                min={0}
                step={1000}
                max={tranCoc || undefined}
                value={coc}
                onChange={(e) => setCoc(e.target.value)}
                placeholder="0"
                aria-invalid={cocVuot || undefined}
              />
            )}
          </label>
          <div className={`acct-field-hint${cocVuot ? " acct-field-hint--error" : ""}`}>
            {cocKhoa ? (
              <>
                Đơn đã duyệt nên cọc khoá — đây là con số người duyệt đã đồng ý.
                Cần đổi thì lùi phiếu về nháp rồi duyệt lại.
              </>
            ) : cocVuot ? (
              <>
                Cọc đang lớn hơn tổng dự kiến của đơn ({money(tranCoc)}). Cọc là ứng
                trước một phần của chính đơn này nên không thể vượt giá trị đơn.
              </>
            ) : (
              <>
                Tối đa {money(tranCoc)} (tổng dự kiến của đơn). Số này dùng để điền sẵn khi kế toán lập phiếu chi cọc.
              </>
            )}
          </div>
        </div>
      </section>

      {/* Thẻ 2: Chứng từ & File hợp đồng */}
      <section className="acct-card-section">
        <header className="acct-card-section__head">
          <span className="acct-card-section__title">
            <Icon name="paperclip" size={15} />
            Chứng từ &amp; File đính kèm ({hopDong.length} file)
          </span>
        </header>

        <div className="pdot__files">
          {hopDong.length === 0 ? (
            <p className="pdot__empty">Chưa đính kèm ảnh/PDF hợp đồng nào.</p>
          ) : (
            <div className="pdot__filegrid">
              {hopDong.map((a) => {
                const href = assetUrl(a.file_url) ?? "#";
                const isImage = ATTACHMENT_IMAGE_TYPES.includes(a.file_type ?? "");
                return (
                  <div className="pdot__file" key={a.id}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      title={
                        a.uploaded_by_name
                          ? `${a.file_name}\n${a.uploaded_by_name} tải lên ${fmtDate(a.uploaded_at)}`
                          : a.file_name
                      }
                    >
                      {isImage ? (
                        <img
                          className="pdot__thumb"
                          src={anhNho(a.file_url) ?? href}
                          alt={a.file_name}
                        />
                      ) : (
                        <span className="pdot__thumb pdot__thumb--pdf">
                          <Icon name="fileText" size={22} />
                        </span>
                      )}
                    </a>
                    {canUpdate && (
                      <button
                        type="button"
                        className="pdot__filex"
                        aria-label={`Xóa ${a.file_name}`}
                        disabled={uploading}
                        onClick={() => xoa(a)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {canUpdate && (
            <div style={{ marginTop: 10 }}>
              <input
                type="file"
                hidden
                multiple
                accept="image/*,application/pdf"
                ref={fileRef}
                onChange={(e) => {
                  tai(e.target.files);
                  e.target.value = "";
                }}
              />
              <div
                className="acct-upload-zone"
                onClick={() => !uploading && fileRef.current?.click()}
              >
                <div className="acct-upload-zone__icon">
                  <Icon name="fileText" size={20} />
                </div>
                <div className="acct-upload-zone__title">
                  {uploading
                    ? "Đang tải file lên…"
                    : hopDong.length > 0
                      ? "Bấm để thêm ảnh / PDF hợp đồng khác"
                      : "Bấm để chọn ảnh / PDF hợp đồng đính kèm"}
                </div>
                <div className="acct-upload-zone__sub">Hỗ trợ ảnh (PNG, JPG) hoặc PDF, tối đa 10 MB mỗi file</div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
