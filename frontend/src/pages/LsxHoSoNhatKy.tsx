// Mục "Nhật ký" của hồ sơ một lệnh (đặc tả 4.2): `timeline` của máy chủ, MỚI NHẤT ở trên, có nút lọc.
// "Sản lượng, KCS" mặc định TẮT — hai loại này đã có bảng ở Công đoạn và Sau sản xuất.
import { useMemo, useState } from "react";

import type { LenhSxHoSoOut } from "../api/client";
import { ngayGio } from "./keHoachSxShared";
import { Kv, Trong } from "./lsxHoSoChung";

type Loc = "tat_ca" | "phat_hanh" | "chay" | "nguoi_may" | "su_co" | "kho";

/** Loại sự kiện của mỗi nút. Loại lạ (máy chủ thêm sau) chỉ hiện ở "Tất cả". */
const LOC: { key: Loc; label: string; loai: string[] }[] = [
  { key: "tat_ca", label: "Tất cả", loai: [] },
  { key: "phat_hanh", label: "Phát hành, đóng lệnh", loai: ["phat_hanh"] },
  { key: "chay", label: "Chạy máy", loai: ["bat_dau", "tam_dung", "ket_thuc", "dung"] },
  { key: "nguoi_may", label: "Người, máy", loai: ["giao_nguoi", "rut_nguoi", "doi_may"] },
  { key: "su_co", label: "Sự cố", loai: ["su_co"] },
  { key: "kho", label: "Kho", loai: ["de_nghi_nhap_kho", "kho_nhan"] },
];
const SL_KCS = ["san_luong", "kcs"];

export function LsxHoSoNhatKy({ d }: { d: LenhSxHoSoOut }) {
  const [loc, setLoc] = useState<Loc>("tat_ca");
  const [slKcs, setSlKcs] = useState(false);

  // Máy chủ trả cũ nhất trước; đảo một lần.
  const moiTruoc = useMemo(() => [...d.timeline].reverse(), [d.timeline]);
  const loai = LOC.find((l) => l.key === loc)?.loai ?? [];
  const hien = moiTruoc.filter((e) => {
    // Nút bật thêm hai loại này vào BẤT KỲ nút lọc nào đang chọn.
    if (SL_KCS.includes(e.loai)) return slKcs;
    return loc === "tat_ca" || loai.includes(e.loai);
  });

  return (
    <>
      <div className="lhs-kvs lhs-kvs--hai">
        <Kv k="Tạo lệnh lúc" v={d.thong_tin.tao_luc ? ngayGio(d.thong_tin.tao_luc) : null} />
        <Kv k="Bàn giao lúc" v={d.thong_tin.ban_giao_at ? ngayGio(d.thong_tin.ban_giao_at) : null} />
      </div>
      <div className="lhs-loc" role="group" aria-label="Lọc nhật ký">
        {LOC.map((l) => (
          <button
            key={l.key}
            type="button"
            className="lhs-chip"
            aria-pressed={loc === l.key}
            onClick={() => setLoc(l.key)}
          >
            {l.label}
          </button>
        ))}
        <button
          type="button"
          className="lhs-bat"
          aria-pressed={slKcs}
          onClick={() => setSlKcs((v) => !v)}
          title="Sản lượng và KCS đã có bảng riêng ở mục Công đoạn và Sau sản xuất"
        >
          Sản lượng, KCS
        </button>
      </div>
      {d.timeline.length === 0 ? (
        <Trong>Chưa có sự kiện nào, lệnh chưa được phát hành xuống xưởng.</Trong>
      ) : hien.length === 0 ? (
        <Trong>Không có sự kiện nào thuộc loại đang lọc.</Trong>
      ) : (
        <ol className="lhs-nk">
          {hien.map((e, i) => (
            <li key={i}>
              <span className="lhs-ds__luc">{ngayGio(e.luc)}</span>
              <span className="lhs-nk__nguoi">{e.nguoi ?? "—"}</span>
              <span>{e.noi_dung}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
