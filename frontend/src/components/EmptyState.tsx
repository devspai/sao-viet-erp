import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icons";
import "./empty-state.css";

/** Ba ca của một danh sách rỗng — KHÁC NHAU, đừng gộp.
 *
 *  `dang-tai` : đã gọi máy chủ, chưa có trả lời.
 *  `rong`     : máy chủ trả lời rồi, đúng là không có gì.
 *  `loi`      : gọi hỏng (mất mạng, máy chủ chết, hết hạn đăng nhập).
 *
 *  Vì sao phải tách: trước 08/08/2026 nhiều màn gộp `loi` vào `rong` nên khi backend chết, bảng in
 *  "Chưa có yêu cầu nào" — hệ NÓI SAI SỰ THẬT, người dùng tưởng sạch việc rồi bỏ đi. Đúng sự cố
 *  ngày 05/08/2026. Gộp `dang-tai` vào `rong` thì nhẹ hơn nhưng vẫn xấu: mỗi lần tải bảng chớp một
 *  nhịp "chưa có gì" rồi mới ra dữ liệu. */
export type TrangThaiRong = "dang-tai" | "rong" | "loi";

export interface EmptyStateProps {
  trangThai?: TrangThaiRong;
  /** Icon minh hoạ cho ca `rong`. Ca `dang-tai` và `loi` dùng icon riêng, không nhận ở đây. */
  icon?: IconName;
  /** Câu chính của ca `rong`. Dùng động từ "Chưa có…", KHÔNG dùng "Không có…" — xem ghi chú dưới. */
  title?: string;
  sub?: string;
  /** Nút gợi ý việc tiếp theo ở ca `rong` (vd "Xoá bộ lọc", "Tạo yêu cầu đầu tiên"). */
  action?: ReactNode;
  /** Câu lỗi thật từ máy chủ. Chỉ dùng cho ca `loi`. */
  loi?: string | null;
  /** Bấm để gọi lại. Thiếu hàm này thì ca `loi` không có nút — người dùng phải tự F5. */
  onThuLai?: () => void;
  /** Câu chính của ca `loi` (mặc định "Không đọc được dữ liệu"). Tách khỏi `title` vì nhiều màn
   *  truyền `title` của ca rỗng chung với `trangThai` động — dùng chung là ca lỗi in ra "Chưa có…". */
  tieuDeLoi?: string;
  /** Chữ trên nút gọi lại (mặc định "Thử lại"). */
  nhanThuLai?: string;
  /** Bỏ viền + nền, dùng khi đã nằm trong khung có viền sẵn (vd trong ô của bảng). */
  inline?: boolean;
  /** Chữ của ca `dang-tai` khi cần nói rõ đang tải gì (vd "Đang tải phiếu…"). Mặc định "Đang tải…". */
  nhanTai?: string;
  /** Ca `dang-tai` bản GỌN: canh trái, không đệm — cho chỗ chật trong form/thẻ/hộp thoại, nơi
   *  khối canh giữa đệm 24px làm nhảy bố cục. */
  gon?: boolean;
}

/** "Chưa có" chứ không phải "Không có".
 *
 *  "Không có" nghe như một phán quyết (sẽ không bao giờ có); "Chưa có" đúng sự thật hơn — dữ liệu
 *  chưa được nhập, và thường người đang đọc chính là người sẽ nhập. Chốt cho toàn hệ. */
export function EmptyState({
  trangThai = "rong",
  icon = "box",
  title,
  sub,
  action,
  loi,
  onThuLai,
  tieuDeLoi,
  nhanThuLai = "Thử lại",
  inline,
  nhanTai = "Đang tải…",
  gon,
}: EmptyStateProps) {
  const cls = `empty-state${inline ? " empty-state--inline" : ""}`;

  // Chờ = vòng xoay nhỏ + một dòng chữ mờ, HIỆN TRỄ ~0,3 giây (Carbon/Atlassian): mạng nhanh thì
  // người dùng không thấy chớp gì cả. Icon đồng hồ 40px cũ trông như "đang đợi lâu", đã bỏ.
  if (trangThai === "dang-tai") {
    return (
      <div
        className={`${cls} empty-state--tai${gon ? " empty-state--gon" : ""}`}
        role="status"
        aria-busy="true"
      >
        <span className="empty-state__spin" aria-hidden="true" />
        <span className="empty-state__tai">{nhanTai}</span>
      </div>
    );
  }

  if (trangThai === "loi") {
    return (
      <div className={`${cls} empty-state--loi`} role="alert">
        <span className="empty-state__tile">
          <Icon name="alert" size={22} />
        </span>
        <p className="empty-state__title">{tieuDeLoi ?? "Không đọc được dữ liệu"}</p>
        {/* Hiện NGUYÊN VĂN câu lỗi của máy chủ. Nuốt đi rồi in câu chung chung thì người dùng
            không phân biệt được "mất mạng" với "hết hạn đăng nhập" — hai việc phải xử khác nhau. */}
        <p className="empty-state__sub">
          {loi || "Máy chủ không trả lời. Kiểm tra đường mạng rồi thử lại."}
        </p>
        {onThuLai && (
          <div className="empty-state__action">
            <button type="button" className="btn btn--ghost" onClick={onThuLai}>
              {nhanThuLai}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cls}>
      {/* Icon nằm trong ô vuông nền nhạt (kiểu Blankslate của GitHub Primer) — icon trơ 44px xám
          trông như hình lỗi, nhất là icon dấu X. */}
      <span className="empty-state__tile">
        <Icon name={icon} size={22} />
      </span>
      <p className="empty-state__title">{title ?? "Chưa có dữ liệu"}</p>
      {sub && <p className="empty-state__sub">{sub}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}

const SO_HANG_XUONG = 5;
// Độ rộng thanh xương xoay vòng cho khỏi đều tăm tắp như hàng rào.
const DO_RONG_XUONG = [62, 80, 48, 70, 56, 74];

/** Bản dùng TRONG `<tbody>`: tự bọc `<tr><td colSpan>`.
 *
 *  `colSpan` phải khớp số cột ĐANG hiện — có bảng ẩn/hiện cột theo quyền (vd cột Thao tác chỉ hiện
 *  khi có quyền sửa), nên truyền biểu thức chứ đừng gõ số cứng. Lệch là ô rỗng thụt hẳn một cột. */
export function EmptyRow({
  colSpan,
  ...props
}: EmptyStateProps & { colSpan: number }) {
  // Bảng đang tải → vài hàng xương (skeleton) đúng số cột, như Stripe/Linear/GitHub: giữ chỗ
  // cho bảng khỏi nhảy khi dữ liệu về, và nhìn là biết "bảng đang lên" chứ không phải bảng rỗng.
  if ((props.trangThai ?? "rong") === "dang-tai") {
    return (
      <>
        {Array.from({ length: SO_HANG_XUONG }, (_, i) => (
          <tr key={`sk-${i}`} className="empty-state__skel-row" aria-hidden={i > 0 || undefined}>
            {Array.from({ length: Math.max(1, colSpan) }, (_, j) => (
              <td key={j}>
                <span
                  className="empty-state__skel"
                  style={{ width: `${DO_RONG_XUONG[(i + j) % DO_RONG_XUONG.length]}%` }}
                />
                {i === 0 && j === 0 && <span className="empty-state__sr">Đang tải…</span>}
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  }
  return (
    <tr>
      <td colSpan={colSpan} className="empty-state__cell">
        <EmptyState {...props} inline />
      </td>
    </tr>
  );
}
