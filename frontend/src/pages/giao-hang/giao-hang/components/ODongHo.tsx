// Ô SỐ ĐỒNG HỒ dùng chung cho hộp Bắt đầu giao và hộp Về kho (phương án A, 13/10/2026): ô rộng hết
// hộp, chữ "km" nằm trong ô, gõ tới đâu chèn dấu chấm nghìn tới đó, không mũi tên tăng giảm, điện
// thoại bật bàn phím số. Giá trị là CHUỖI CHỮ SỐ (không dấu chấm) — nơi gọi tự đổi sang số.
import { OGoDinhDang } from "../../../../components/OGoDinhDang";
import { so } from "../shared/helpers";

export function ODongHo({
  id,
  nhan,
  chu,
  onDoi,
  onEnter,
}: {
  id: string;
  nhan: string;
  chu: string;
  onDoi: (chu: string) => void;
  onEnter?: () => void;
}) {
  return (
    <>
      <label className="gh-dh__nhan" htmlFor={id}>{nhan}</label>
      <span className="gh-dh__o">
        <OGoDinhDang id={id} autoFocus inputMode="numeric" autoComplete="off"
          placeholder="Đọc số trên đồng hồ xe"
          value={chu === "" ? "" : so(Number(chu))}
          onChange={(e) => onDoi(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9))}
          onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }} />
        <span>km</span>
      </span>
    </>
  );
}
