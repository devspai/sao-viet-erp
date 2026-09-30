// POPUP công thức — hộp soạn công thức nổi GIỮA MÀN HÌNH, nền xung quanh mờ đi (29/09/2026).
//
// Trước đó ba bảng trong drawer Công đoạn (máy · đầu việc · vật tư của đầu việc) bung công thức
// bằng một HÀNG PHỤ chèn ngay dưới dòng (đẩy cả bảng tụt xuống), rồi 07/09/2026 đổi sang panel neo
// vào ô vừa bấm. Neo vào ô thì panel bị kẹp theo chỗ trống quanh ô: ô ở giữa màn là panel chỉ còn
// một khe cuộn vài dòng, công thức bậc thang dài không đọc nổi. Nay: giữa màn, rộng, nền mờ để mắt
// chỉ còn một chỗ nhìn. Tên máy/ô đang sửa đã nằm trên tiêu đề ô công thức nên không cần thấy dòng.
//
// Treo ở `document.body` để KHÔNG bị cắt bởi khung cuộn của bảng/drawer.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function FormulaPopover({ neo, nhan, onClose, onHuy, children }: {
  /** Ô vừa bấm. `null` = không mở. Ô rời DOM (dòng bị xoá) ⇒ hộp tự đóng. */
  neo: HTMLElement | null;
  /** Tên ô, dùng làm nhãn cho trình đọc màn hình (và để test gọi tên panel). */
  nhan: string;
  /** CHỐT: đóng panel, giữ nguyên công thức vừa sửa (drawer lưu sau, bằng nút "Lưu thay đổi"). */
  onClose: () => void;
  /** BỎ SỬA: trả ô về công thức lúc mở panel rồi đóng. Không truyền ⇒ không có nút "Huỷ", Esc chỉ đóng. */
  onHuy?: () => void;
  children: React.ReactNode;
}) {
  // Chỗ gọi hay truyền `onClose` là hàm mũi tên viết thẳng trong JSX — hàm mới mỗi lần render.
  // Để nó trong mảng phụ thuộc là cứ mỗi nhịp gõ chip lại gỡ/gắn lại cả bộ listener.
  const dongRef = useRef(onClose);
  dongRef.current = onClose;
  const huyRef = useRef(onHuy ?? onClose);
  huyRef.current = onHuy ?? onClose;

  useEffect(() => {
    if (!neo) return;
    if (!neo.isConnected) { dongRef.current(); return; }
    // Esc bắt ở pha BẮT rồi `preventDefault()` — đúng giao kèo nhường phím của
    // `components/Drawer.tsx`: lớp nào nuốt Esc thì đánh dấu, drawer thấy dấu là không tự đóng.
    // Nhường tiếp cho popover "Cú pháp" của chính ô công thức (nó nằm TRONG panel này, đóng panel
    // là nuốt luôn cả nó) — một nhịp Esc chỉ được gỡ MỘT lớp.
    //
    // Esc đi cùng đường với "Huỷ" (BỎ SỬA), không đi với "Xong": ở mọi hộp thoại khác trong màn này Esc
    // đều là "thôi, không làm nữa".
    const onKey = (e: KeyboardEvent) => {
      // Nhường cả lớp nhỏ BÊN TRONG ô công thức (gợi ý biến đang mở, bậc đang chọn — ô đánh dấu
      // `data-giu-esc`): Esc lúc đó là "ẩn gợi ý"/"bỏ chọn", không phải "huỷ cả công thức".
      if (e.key !== "Escape" || document.querySelector(".rc-syntax, [data-giu-esc]")) return;
      e.preventDefault();
      huyRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
    };
  }, [neo]);

  if (!neo) return null;
  return createPortal(
    // Bấm NỀN MỜ = CHỐT chứ không bỏ sửa (lỡ tay bấm ra nền mà mất sạch công thức thì tệ hơn nhiều
    // so với phải bấm "Huỷ" khi thật sự muốn bỏ). Đóng ở `click` và chỉ khi nhấn-nhả đều trên NỀN:
    // đóng ngay lúc `mousedown` thì nền biến mất giữa chừng, cú nhả chuột rơi xuống lớp nền của
    // drawer bên dưới và đóng luôn cả drawer. `mousedown` trên nền cũng chặn để ô gõ không mất focus.
    <div className="rc-ct-pop__nen"
      onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
      onClick={(e) => { if (e.target === e.currentTarget) dongRef.current(); }}>
      <div className="rc-ct-pop" role="dialog" aria-modal="true" aria-label={nhan}>
        {/* KHÔNG có ✕ (29/09/2026): ✕ ai cũng hiểu là "đóng", mà ở đây nó từng là "bỏ sửa" — bấm để
            đóng là mất phần vừa sửa. Bỏ sửa nay là nút chữ "Huỷ" đứng cạnh "Xong". */}
        <div className="rc-ct-pop__body">{children}</div>
        <div className="rc-ct-pop__foot">
          {onHuy && <button type="button" className="rc-ct-pop__huy" onClick={onHuy}
            title="Trả ô về công thức lúc mở">Huỷ</button>}
          <button type="button" className="rc-ct-pop__ok" onClick={onClose}>Xong</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
