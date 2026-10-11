// Bong bóng CÔNG THỨC — rê chuột (hoặc focus/chạm) vào chữ neo thì hiện, rời ra thì tắt.
//
// Vì sao không bày công thức ra luôn: công thức là thứ để KIỂM khi nghi, không phải thứ đọc mỗi lần
// mở. Bày ra thì một câu `if (…)` dài ba dòng chiếm nửa thẻ, đẩy con số chính ra khỏi tầm mắt.
//
// 10/10/2026: chuyển sang CÙNG khuôn bong bóng trắng với ô lượng ở chuỗi công đoạn màn Tính giá
// (`BuocVatTu` › `OLuong`) — tiêu đề là tên món, thẻ "Công thức" bằng chữ, thẻ "Thế số"
// "= thế số = kết quả". Vẽ qua `HoverTip` (portal + toạ độ `fixed`) nên bảng vật tư `overflow: hidden`
// không cắt mất.
import type { CSSProperties, ReactNode } from "react";
import { ngatDongIf } from "../lib/ngatDongCongThuc";
import { HoverTip } from "./HoverTip";
import "./cong-thuc-tip.css";

/** "công thức = thế số = kết quả" → từng vế. Tách ở dấu `=` ĐỨNG RIÊNG (có khoảng trắng hai bên)
 *  nên `<=` / `>=` trong điều kiện `if` không bị cắt. */
function tachVe(s: string): string[] {
  return s
    .split(/\s=\s/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Vế CUỐI của câu diễn giải — con số đã ra ("… = 1.180.000 tờ in" → "1.180.000 tờ in"). Dùng cho
 *  dòng tóm tắt hiện sẵn khi công thức đầy đủ đã giấu vào bong bóng. */
export function ketQuaDienGiai(s: string): string {
  const ve = tachVe(s);
  return ve[ve.length - 1] ?? s;
}

/** Công thức có `if`: mỗi khối một dòng, thụt theo độ sâu. */
function CongThuc({ text }: { text: string }) {
  const dong = ngatDongIf(text);
  if (dong.length <= 1) return <>{text}</>;
  return (
    <>
      {dong.map((l, i) => (
        <span key={i} className="hover-tip__if-dong" style={{ "--sau": l.sau } as CSSProperties}>
          {l.text}
        </span>
      ))}
    </>
  );
}

export function CongThucTip({
  congThuc,
  them,
  ghiChu,
  tieuDe,
  children,
}: {
  /** Chuỗi "công thức = thế số = kết quả" (diễn giải server trả). */
  congThuc?: string | null;
  /** Dòng nối tiếp sau kết quả, vd "÷ 9.000/giờ = 131 giờ 7 phút". */
  them?: string | null;
  /** Dòng chú thích nhỏ cuối bong bóng, vd nguồn tính. */
  ghiChu?: string | null;
  /** Đầu bong bóng — thường là tên món / tên khoản đang rê. */
  tieuDe?: string;
  children: ReactNode;
}) {
  const ve = tachVe(congThuc ?? "");
  if (ve.length === 0 && !them && !ghiChu) return <>{children}</>;

  // Một vế thì chính nó là thế số; nhiều vế thì vế đầu là công thức bằng chữ, phần còn lại thế số.
  const goc = ve.length > 1 ? ve[0] : null;
  const theSo = (ve.length > 1 ? ve.slice(1) : ve).join(" = ");

  return (
    <HoverTip tieuDe={tieuDe} rong={560} lopNeo="cong-thuc-tip__neo" neo={children}>
      {(goc || theSo || them) && (
        <dl className="hover-tip__dong">
          {goc && (
            <div className="hover-tip__hang">
              <dt>Công thức</dt>
              <dd><CongThuc text={goc} /></dd>
            </div>
          )}
          {(theSo || them) && (
            <div className="hover-tip__hang">
              <dt>Thế số</dt>
              <dd className="hover-tip__so">
                {theSo && <span className="cong-thuc-tip__dong">= <CongThuc text={theSo} /></span>}
                {them && <span className="cong-thuc-tip__dong">{them}</span>}
              </dd>
            </div>
          )}
        </dl>
      )}
      {ghiChu && <p className="hover-tip__luu-y">{ghiChu}</p>}
    </HoverTip>
  );
}
