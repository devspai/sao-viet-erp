// Tab 1 của drawer Nhà cung cấp — "Thông tin chung & Pháp lý" (tách từ pages/SuppliersPage.tsx).
import type { Dispatch, SetStateAction } from "react";
import { ChevronDown } from "lucide-react";
import { Icon } from "../../../../components/Icons";
import type { SupplierInput, SupplierRow } from "../../../../api/client";
import { LocalField } from "../components/LocalField";
import { SaoNcc } from "../components/SaoNcc";
import { soNgayVi } from "../shared/helpers";

function docSoTienVnd(num: number | null | undefined): string {
  if (!num || num <= 0) return "";
  if (num >= 1_000_000_000) {
    const ty = (num / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
    return `${num.toLocaleString("vi-VN")} VNĐ (${ty} tỷ VNĐ)`;
  }
  if (num >= 1_000_000) {
    const trieu = (num / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
    return `${num.toLocaleString("vi-VN")} VNĐ (${trieu} triệu VNĐ)`;
  }
  return `${num.toLocaleString("vi-VN")} VNĐ`;
}

/** Khối SAO — chỉ ĐỌC, nằm trên đầu hồ sơ. */
function KhoiSao({ ncc }: { ncc: SupplierRow }) {
  const chuaCham = ncc.rating === null;

  if (chuaCham) {
    return (
      <div className="supplier__rating-card supplier__rating-card--new">
        <div className="supplier__rating-card-head">
          <div className="supplier__rating-big-score--new">
            Mới
          </div>
          <div>
            <div className="supplier__rating-title">Đối tác mới hợp tác</div>
            <div className="supplier__rating-sub">
              Chưa phát sinh đơn hàng nào đủ dữ liệu để chấm sao.
            </div>
          </div>
        </div>
        <div className="supplier__rating-new-tip">
          <Icon name="bulb" size={14} className="supplier__tip-ico" />
          Hệ thống sẽ tự động tính điểm đánh giá &amp; tỉ lệ đúng hẹn ngay sau khi đơn hàng đầu tiên hoàn tất.
        </div>
      </div>
    );
  }

  const ratingVal = ncc.rating ?? 5.0;
  const onTimePercent = ncc.rating_count > 0
    ? Math.round((ncc.on_time_count / ncc.rating_count) * 100)
    : 100;

  const isHigh = ratingVal >= 4.5;
  const isMid = ratingVal >= 3.5;

  return (
    <div className={`supplier__rating-card ${isHigh ? "supplier__rating-card--high" : isMid ? "supplier__rating-card--mid" : "supplier__rating-card--low"}`}>
      <div className="supplier__rating-card-top">
        <div className="supplier__rating-score-box">
          <span className={`supplier__rating-big-val ${isHigh ? "is-high" : isMid ? "is-mid" : "is-low"}`}>
            {ratingVal.toFixed(1)}
          </span>
          <div className="supplier__rating-stars-wrap">
            <SaoNcc rating={ratingVal} cao={20} />
            <span className="supplier__rating-tag">
              <Icon name={isHigh ? "trophy" : isMid ? "check" : "alert"} size={14} />
              {isHigh ? "Đối tác Uy tín Top 1" : isMid ? "Giao hàng Khá" : "Cần theo dõi sát"}
            </span>
          </div>
        </div>
      </div>

      <div className="supplier__rating-kpi-grid">
        <div className="supplier__rating-kpi-item">
          <span className="supplier__rating-kpi-label">Tổng đơn đã chấm</span>
          <span className="supplier__rating-kpi-value">{ncc.rating_count} đơn</span>
        </div>

        <div className="supplier__rating-kpi-item">
          <span className="supplier__rating-kpi-label">Tỷ lệ đúng hẹn</span>
          <div className="supplier__rating-kpi-value-row">
            <span className="supplier__rating-kpi-value" style={{ color: onTimePercent >= 80 ? "#047857" : "#b45309" }}>
              {onTimePercent}%
            </span>
            <span className="supplier__rating-kpi-sub">({ncc.on_time_count}/{ncc.rating_count} đơn)</span>
          </div>
          <div className="supplier__rating-bar">
            <div
              className={`supplier__rating-bar-fill ${onTimePercent >= 80 ? "is-green" : "is-amber"}`}
              style={{ width: `${onTimePercent}%` }}
            />
          </div>
        </div>

        <div className="supplier__rating-kpi-item">
          <span className="supplier__rating-kpi-label">Tình trạng trễ hạn</span>
          {ncc.late_count > 0 ? (
            <span className="supplier__rating-kpi-value" style={{ color: "#b91c1c" }}>
              {ncc.late_count} đơn (Trễ TB {soNgayVi(ncc.avg_late_days)} ngày)
            </span>
          ) : (
            <span className="supplier__rating-kpi-value" style={{ color: "#047857" }}>
              0 đơn trễ
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function SupplierInfoTab({
  form,
  setForm,
  selected,
}: {
  form: SupplierInput;
  setForm: Dispatch<SetStateAction<SupplierInput>>;
  selected: SupplierRow | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {selected && (
        <div className="supplier__form-card">
          <KhoiSao ncc={selected} />
        </div>
      )}

      {/* Card 1: Thông tin định danh & Pháp lý */}
      <div className="supplier__form-card">
        <div className="supplier__form-card-title">
          <Icon name="building" size={15} />
          <span>Thông tin định danh &amp; Pháp lý</span>
        </div>
        <div className="md-page__form-grid">
          <LocalField label="Tên nhà cung cấp" required>
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="VD: Công ty TNHH Giấy Việt Triều"
            />
          </LocalField>

          <LocalField label="Nhóm" required>
            <input
              className="input"
              required
              value={form.supplier_group ?? ""}
              onChange={(e) => setForm({ ...form, supplier_group: e.target.value })}
              placeholder="Giấy in, Mực & Hóa chất, Gia công ngoài..."
            />
          </LocalField>

          <LocalField label="Mã số thuế" required>
            <input
              className="input md-page__mono"
              required
              value={form.tax_code ?? ""}
              onChange={(e) => setForm({ ...form, tax_code: e.target.value })}
              placeholder="0101234567"
            />
          </LocalField>

          <LocalField label="Nhận gia công">
            <label
              className={`supplier__switch-field${
                form.nhan_gia_cong ? " supplier__switch-field--checked" : ""
              }`}
            >
              <span className="supplier__switch-label">Nhận gia công ngoài</span>
              <input
                type="checkbox"
                style={{ display: "none" }}
                checked={Boolean(form.nhan_gia_cong)}
                onChange={(e) => setForm({ ...form, nhan_gia_cong: e.target.checked })}
              />
              <div className="supplier__switch-toggle" />
            </label>
            <small className="supplier__hint">
              Hiện trong ô chọn "Nhà gia công" ở Kế hoạch sản xuất
            </small>
          </LocalField>
        </div>
      </div>

      {/* Card 2: Liên hệ & Hạn mức công nợ */}
      <div className="supplier__form-card">
        <div className="supplier__form-card-title">
          <Icon name="phone" size={15} />
          <span>Người liên hệ &amp; Hạn mức công nợ</span>
        </div>
        <div className="md-page__form-grid">
          <LocalField label="Người liên hệ" required>
            <input
              className="input"
              required
              value={form.contact_name ?? ""}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              placeholder="VD: Anh Nam (Kinh doanh)"
            />
          </LocalField>

          <LocalField label="Số điện thoại" required>
            <input
              className="input"
              required
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0988123456"
            />
          </LocalField>

          <LocalField label="Email" required>
            <input
              className="input"
              required
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="kinhdoanh@viettrieu.vn"
            />
          </LocalField>

          <LocalField label="Điều khoản thanh toán">
            <input
              className="input"
              value={form.payment_terms ?? ""}
              onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
              placeholder="Công nợ 30 ngày, Thanh toán ngay..."
            />
          </LocalField>

          <LocalField label="Hạn mức công nợ (VNĐ)">
            <div className="supplier__input-suffix-wrap">
              <input
                className="input"
                type="number"
                min={0}
                step={1000}
                value={form.credit_limit ? form.credit_limit : ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    credit_limit: Math.max(0, Math.round(Number(e.target.value) || 0)),
                  })
                }
                placeholder="Để trống = không đặt hạn mức"
              />
              <span className="supplier__input-suffix">VNĐ</span>
            </div>
            {Boolean(form.credit_limit) && (
              <span className="supplier__money-formatted">
                <Icon name="arrowRight" size={13} />
                {docSoTienVnd(form.credit_limit)}
              </span>
            )}
            <small className="supplier__hint">
              Để trống hoặc 0 = không đặt hạn mức, sẽ không bao giờ báo vượt.
            </small>
          </LocalField>

          <LocalField label="Số ngày cho nợ">
            <input
              className="input"
              type="number"
              min={0}
              step={1}
              value={form.credit_days ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  credit_days:
                    e.target.value === ""
                      ? null
                      : Math.max(0, Math.round(Number(e.target.value) || 0)),
                })
              }
              placeholder="Để trống = chưa đặt hạn"
            />
            <small className="supplier__hint">
              Để trống = <strong>chưa đặt hạn</strong>, đợt giao không vào cột Quá hạn. Nhập{" "}
              <strong>0</strong> = trả ngay.
            </small>
          </LocalField>

          <LocalField label="Trạng thái">
            <div className="supplier__select-wrap">
              <select
                className="input"
                value={form.status ?? "active"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as "active" | "inactive",
                  })
                }
              >
                <option value="active">Hoạt động (Active)</option>
                <option value="inactive">Tạm ngừng (Inactive)</option>
              </select>
              <ChevronDown className="supplier__select-arrow" size={16} />
            </div>
          </LocalField>
        </div>
      </div>

      {/* Card 3: Địa chỉ & Ghi chú */}
      <div className="supplier__form-card">
        <div className="supplier__form-card-title">
          <Icon name="mapPin" size={15} />
          <span>Địa chỉ &amp; Ghi chú</span>
        </div>
        <div className="md-page__form-grid">
          <LocalField label="Địa chỉ" wide required>
            <input
              className="input"
              required
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Số 15, Đường Cầu Diễn, Bắc Từ Liêm, Hà Nội"
            />
          </LocalField>

          <LocalField label="Ghi chú" wide>
            <textarea
              className="input purchase__textarea"
              value={form.note ?? ""}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Ghi chú thêm về năng lực, ưu đãi chiết khấu..."
            />
          </LocalField>
        </div>
      </div>
    </div>
  );
}
