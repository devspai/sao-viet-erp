// Mục "Vật tư" của hồ sơ một lệnh (đặc tả 4.2): MỘT bảng, ba nút lọc thay ba bảng. Giữ nguyên ba câu
// hỏi máy chủ đang trả lời, chỉ không bày một dòng ở hai bảng cùng lúc.
import { useState } from "react";

import type { LenhSxVatTu, LenhSxVatTuDong } from "../api/client";
import { BangCuon, Pill, VT_MAU, Trong, pillMeta, so, soHoac } from "./lsxHoSoChung";
import { nhanDonVi } from "./lsxBuoc";

type Loc = "hien_tai" | "sap_toi" | "da_cap";

const LOC: { key: Loc; label: string; rong: string }[] = [
  { key: "hien_tai", label: "Bước đang làm", rong: "Bước đang làm không cần vật tư nào theo bảng cân đối." },
  { key: "sap_toi", label: "Bước sắp tới đang thiếu", rong: "Không bước nào phía sau đang thiếu vật tư." },
  { key: "da_cap", label: "Kho đã cấp", rong: "Kho chưa xuất món nào cho lệnh này." },
];

function dongCua(vt: LenhSxVatTu, k: Loc): LenhSxVatTuDong[] {
  if (k === "hien_tai") return vt.hien_tai.dong;
  if (k === "sap_toi") return vt.canh_bao_sau;
  return vt.da_cap;
}

export function LsxHoSoVatTu({ vt }: { vt: LenhSxVatTu }) {
  // Mặc định chọn nút ĐẦU TIÊN có dòng.
  const [loc, setLoc] = useState<Loc>(() => LOC.find((l) => dongCua(vt, l.key).length > 0)?.key ?? "hien_tai");
  const dong = dongCua(vt, loc);
  const meta = LOC.find((l) => l.key === loc) ?? LOC[0];

  return (
    <>
      <div className="lhs-loc" role="group" aria-label="Lọc bảng vật tư">
        {LOC.map((l) => (
          <button
            key={l.key}
            type="button"
            className="lhs-chip"
            aria-pressed={loc === l.key}
            onClick={() => setLoc(l.key)}
          >
            {l.label} <span className="lhs-chip__n">{dongCua(vt, l.key).length}</span>
          </button>
        ))}
      </div>
      {dong.length === 0 ? (
        <Trong>{meta.rong}</Trong>
      ) : (
        <BangCuon>
          <table className="lsc-bang lhs-vt">
            <thead>
              <tr>
                <th scope="col">Mặt hàng</th>
                <th scope="col">Bước</th>
                <th scope="col" className="lsc-so">
                  Cần
                </th>
                <th scope="col" className="lsc-so">
                  Đã cấp
                </th>
                <th scope="col" className="lsc-so">
                  Thiếu
                </th>
                <th scope="col">Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {dong.map((v, i) => (
                <tr key={`${v.hang_loai}-${v.hang_id}-${v.buoc_id ?? "x"}-${i}`}>
                  <td>
                    {v.hang_ten ?? v.hang_ma ?? "—"}
                    {v.pham_vi === "bai_ghep" && (
                      <span className="lsc-phu">Của bài ghép {v.ma ?? ""}</span>
                    )}
                  </td>
                  <td>{v.ten_viec ?? "—"}</td>
                  <td className="lsc-so">
                    {v.nhu_cau_hien_thi ?? `${so(v.nhu_cau)} ${nhanDonVi(v.don_vi_goc)}`.trim()}
                  </td>
                  <td className="lsc-so">{soHoac(v.da_cap)}</td>
                  <td className="lsc-so">
                    {v.thieu != null && v.thieu > 0 ? <span className="lsc-do">{so(v.thieu)}</span> : "—"}
                  </td>
                  <td>
                    <Pill meta={pillMeta(VT_MAU, v.trang_thai)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </BangCuon>
      )}
    </>
  );
}
