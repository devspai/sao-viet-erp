/** Mã chứng từ bấm được (YCMH/PMH/...) — dùng trong ô bảng và panel chi tiết
 *  để nhảy chéo trang tới đúng phiếu. Tự chặn nổi bọt để không kích hoạt
 *  onClick chọn dòng của <tr> chứa nó. Style: `.code-link` (purchase.css).
 *
 *  Không truyền `onOpen` (người xem không có quyền mở màn đích) ⇒ chỉ in mã dạng chữ thường,
 *  đừng để họ bấm vào rồi ăn màn chặn. */
export function CodeLink({
  code,
  onOpen,
  title,
}: {
  code: string;
  onOpen?: (code: string) => void;
  title?: string;
}) {
  if (!onOpen) return <span>{code}</span>;
  return (
    <button
      type="button"
      className="code-link"
      title={title ?? `Mở ${code}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(code);
      }}
    >
      {code}
    </button>
  );
}
