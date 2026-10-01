// Tab VẬT TƯ của công đoạn (18/09/2026, mg `0316`): công đoạn tiêu thụ những món nào. Bước lệnh gắn
// công đoạn nào thì bung đúng danh sách này. Từ 01/10/2026 dòng KHÔNG còn công thức định mức:
// định mức do công thức của CHÍNH vật tư tính (danh mục Vật tư → tab Công thức định mức).
//
// Thay bảng "Đầu việc và định mức của tổ" (`DinhMucDauViec.tsx`, gỡ cùng ngày, mg `0320`) — trước
// đây vật tư treo DƯỚI từng đầu việc của tổ, nên muốn khai mực cho công đoạn In thì phải chọn một
// đầu việc trước đã. Nay một tầng phẳng: công đoạn → vật tư → công thức.
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../../auth/useAuth";
import { crud } from "../../../api/rebuildCatalog";
import { TrashIcon } from "../icons";
import type { Row, VatTuCongDoanRow } from "../types";

export function VatTuCongDoanField({ value, onChange }: {
  value: VatTuCongDoanRow[];
  onChange: (v: VatTuCongDoanRow[]) => void;
}) {
  const { token } = useAuth();
  // Danh mục Vật tư khác — nạp TẠI ĐÂY như ô cũ: đọc bản nhớ trước để bảng có tên ngay lúc mở.
  const [vatTu, setVatTu] = useState<Row[]>(
    () => (token && crud("/api/vat-lieu-kho/vat-tu-in-an").daNho(token, { active: true })) || []);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const { nho, moi } = crud("/api/vat-lieu-kho/vat-tu-in-an").thamChieu(token, { active: true });
    if (nho) setVatTu(nho);
    moi.then((items) => { if (alive) setVatTu(items); })
      .catch(() => { if (alive && !nho) setVatTu([]); });
    return () => { alive = false; };
  }, [token]);
  const theoId = useMemo(() => new Map(vatTu.map((v) => [Number(v.id), v])), [vatTu]);

  return <div className="rc-bands rc-bands--dinh-muc">
    <div className="rc-dm-vt">
      <table className="rc-dinh-muc-table">
        <thead><tr>
          <th className="rc-col--left">Mã</th>
          <th className="rc-col--left">Tên vật tư</th>
          <th className="rc-col--unit">ĐVT</th>
          <th className="rc-col--center" style={{ width: 36 }} />
        </tr></thead>
        <tbody>
          {value.length === 0 && <tr><td colSpan={4} className="rc-bands__empty">
            Chưa khai vật tư nào — chọn ở ô bên dưới.
          </td></tr>}
          {value.map((v, i) => { const vt = theoId.get(v.vat_tu_id); return (
            <tr key={v.vat_tu_id}>
              <td className="rc-col--left">{String(vt?.ma ?? `#${v.vat_tu_id}`)}</td>
              <td className="rc-col--left">{String(vt?.ten ?? "(đã gỡ khỏi danh mục)")}</td>
              <td className="rc-col--unit">{String(vt?.don_vi_gia ?? "—")}</td>
              <td className="rc-col--center">
                <button type="button" className="rc-bands__del" title="Bỏ vật tư khỏi công đoạn"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <TrashIcon />
                </button>
              </td>
            </tr>
          ); })}
        </tbody>
      </table>
      <select className="rc-dinh-muc-add__select" value="" aria-label="Thêm vật tư"
        onChange={(e) => { const id = Number(e.target.value); if (id)
          onChange([...value, { vat_tu_id: id }]); }}>
        <option value="">＋ chọn từ danh mục vật tư khác</option>
        {vatTu.filter((v) => !value.some((x) => x.vat_tu_id === Number(v.id))).map((v) => (
          <option key={v.id} value={v.id}>{String(v.ma)} · {String(v.ten)} ({String(v.don_vi_gia ?? "—")})</option>
        ))}
      </select>
      <p className="rc-dm-vt__note">
        Định mức khai ở danh mục Vật tư → tab Công thức định mức.
      </p>
    </div>
  </div>;
}
