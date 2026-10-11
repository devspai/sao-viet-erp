// Hộp TẠM DỪNG việc (mockup `ban-to-hop-thoai-B.html#tam-dung`). Lý do bắt buộc (luật máy chủ);
// nút chỉ sáng khi đã ghi. Kết thúc / Bắt đầu / Tiếp tục bấm là chạy, không qua hộp nào.
import { useState } from "react";

import { ThsxHop } from "./ThsxHop";

export function ThsxTamDungHop({
  phuDe, busy, onDong, onTamDung,
}: {
  phuDe?: string;
  busy: boolean;
  onDong: () => void;
  onTamDung: (lyDo: string) => void;
}) {
  const [lyDo, setLyDo] = useState("");
  const ok = lyDo.trim() !== "";
  const gui = () => { if (ok && !busy) onTamDung(lyDo.trim()); };

  return (
    <ThsxHop tieuDe="Tạm dừng việc" phuDe={phuDe} co="hep" dienThoai="day"
      nutChinh="Tạm dừng" nutChinhKhoa={!ok} dangGui={busy} onDong={onDong} onChinh={gui} onPhimTat={gui}>
      <label className="thsx-f">
        <span className="thsx-f__n">Vì sao dừng <span className="thsx-f__req">*</span></span>
        <textarea className="thsx-x-in thsx-hop-ta" autoFocus rows={3} value={lyDo}
          placeholder="Ví dụ thay dao cắt khoảng 20 phút" onChange={(e) => setLyDo(e.target.value)} />
      </label>
      <div className="thsx-bao thsx-bao--xam">
        Phiên chạy đóng lại, giờ máy ngừng tính từ lúc bấm. Bấm Tiếp tục để chạy phiên mới.
      </div>
    </ThsxHop>
  );
}
