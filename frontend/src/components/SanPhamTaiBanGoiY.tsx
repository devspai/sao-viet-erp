// Ô TÊN SẢN PHẨM có gợi ý hàng khách đã đặt (11/10/2026). Một ô gánh cả hai việc: gõ tên rồi đi tiếp
// = sản phẩm mới; chọn một dòng gợi ý = tái bản mã đó (gắn mã + nạp NGUYÊN cấu hình kỹ thuật đã từng
// chốt đơn). Trước đây tách hai ô "Tên sản phẩm" + "Sản phẩm tái bản" kèm câu nhắc trùng tên — người
// lập phiếu phải tự hiểu ba thứ liên quan nhau thế nào. Gợi ý chỉ lấy mã CỦA KHÁCH đầu phiếu; chưa
// chọn khách thì ô là ô gõ tên thường, không có danh sách.
//
// Tái dùng nguyên bộ CSS `.kho-combo*` sẵn có trong repo (global, xem `cssKhongCuop.test.ts`) —
// cùng một ngôn ngữ thị giác cho "gõ tên, chọn gợi ý".
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { api, type SanPhamTaiBanGoiY as GoiY } from "../api/client";
import { boDau } from "../utils/timGanDung";

export function SanPhamTaiBanGoiY({
  token,
  customerId,
  value,
  onChange,
  onChon,
  placeholder,
  ariaLabel = "Tên sản phẩm",
}: {
  token: string;
  /** Khách đầu phiếu. Null = chưa chọn khách ⇒ không gợi ý. */
  customerId: number | null;
  value: string;
  onChange: (ten: string) => void;
  /** Chọn một hàng cũ của khách ⇒ tái bản mã đó. */
  onChon: (id: number) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [opts, setOpts] = useState<GoiY[]>([]);
  const [open, setOpen] = useState(false);
  // Đang chờ kết quả lượt gõ hiện tại — chưa có kết quả thì KHÔNG được nói "khách chưa đặt hàng nào".
  const [dangTim, setDangTim] = useState(false);
  const [active, setActive] = useState(-1);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const coGoiY = customerId != null;

  useEffect(() => {
    if (!open || customerId == null) return;
    let huy = false;
    setDangTim(true);
    const t = setTimeout(() => {
      api.phieuTinhGia
        .timSanPhamTaiBan(token, customerId, value.trim(), 20)
        .then((items) => {
          if (huy) return;
          // Tên gõ trùng hệt một hàng cũ ⇒ đẩy dòng đó lên đầu để thấy ngay lúc gõ.
          const k = boDau(value.trim());
          const xep = k ? [...items].sort((a, b) => Number(boDau(b.ten) === k) - Number(boDau(a.ten) === k)) : items;
          setOpts(xep);
          setActive(-1);
        })
        .catch(() => {})
        .finally(() => !huy && setDangTim(false));
    }, 200);
    return () => {
      huy = true;
      clearTimeout(t);
    };
  }, [value, open, token, customerId]);

  function reposition() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  function chon(o: GoiY) {
    onChon(o.id);
    setOpen(false);
  }

  const list = (
    <ul
      className="kho-combo__list"
      role="listbox"
      style={rect ? { top: rect.top, left: rect.left, width: rect.width } : undefined}
    >
      <li className="kho-combo__empty" role="presentation">
        {dangTim && opts.length === 0
          ? "Đang tìm…"
          : opts.length > 0
          ? "Hàng khách đã đặt, chọn để tái bản"
          : value.trim()
            ? "Khách chưa đặt hàng nào tên như vậy, đây là sản phẩm mới."
            : "Khách chưa đặt hàng nào."}
      </li>
      {opts.map((o, i) => (
        <li
          key={o.id}
          role="option"
          aria-selected={i === active}
          className={`kho-combo__opt${i === active ? " is-active" : ""}`}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            chon(o);
          }}
        >
          <span className="kho-combo__name">{o.ten}</span>
          <span className="kho-combo__code">
            {o.so_thanh_phan > 0 ? o.ma : `${o.ma} chưa có cấu hình`}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="kho-combo" ref={rootRef}>
      <input
        ref={inputRef}
        className="tg-input"
        type="text"
        value={value}
        placeholder={placeholder ?? (coGoiY ? "Gõ tên mới hoặc chọn hàng khách đã đặt" : "VD Thân hộp / Ruột / Bìa")}
        aria-label={ariaLabel}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          if (coGoiY) setOpen(true);
        }}
        onFocus={() => coGoiY && setOpen(true)}
        onKeyDown={(e) => {
          if (!coGoiY) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, opts.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, -1));
          } else if (e.key === "Enter") {
            // Chưa chủ động chọn dòng nào (active = -1) thì Enter KHÔNG tự gắn tái bản — gõ tên mới
            // rồi Enter không được biến thành in lại hàng cũ.
            if (!open || active < 0 || active >= opts.length) return;
            e.preventDefault();
            chon(opts[active]);
          } else if (e.key === "Escape" || e.key === "Tab") {
            setOpen(false);
          }
        }}
      />
      {open && coGoiY && createPortal(list, document.body)}
    </div>
  );
}
