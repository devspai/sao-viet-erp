// Mục "Quy cách" của hồ sơ một lệnh (đặc tả 4.2): 8 ô hiện sẵn, "Xem đủ thông số" mở 9 ô còn lại.
// Ô trống (`null`, chuỗi rỗng, số 0 máy chủ ép từ `None`) KHÔNG hiện — lưới chỉ bày cái đã khai.
import { useState } from "react";
import type { ReactNode } from "react";

import type { LenhSxThongSo, LenhSxThongTin } from "../api/client";
import { nhanCachIn, num } from "./keHoachSxShared";
import { Kv, LOAI_LENH, khoMm, so } from "./lsxHoSoChung";

type O = { k: string; v: ReactNode };

function coGiaTri(v: ReactNode): boolean {
  return v !== null && v !== undefined && v !== "" && v !== 0;
}

function soMau(a: number | null, b: number | null): string | null {
  if (!a && !b) return null;
  return b ? `${a ?? 0} + ${b}` : `${a}`;
}

function muc(a: string[], b: string[]): string | null {
  if (a.length === 0 && b.length === 0) return null;
  return b.length > 0 ? `Mặt trước ${a.join(", ") || "—"}; mặt sau ${b.join(", ")}` : a.join(", ");
}

export function LsxHoSoQuyCach({ ts, tt }: { ts: LenhSxThongSo; tt: LenhSxThongTin }) {
  const [du, setDu] = useState(false);

  const coBan: O[] = [
    { k: "Giấy", v: ts.giay_ten },
    { k: "Định lượng", v: ts.dinh_luong ? `${so(ts.dinh_luong)} g/m²` : null },
    { k: "Khổ tờ in", v: khoMm(ts.kho_in_dai, ts.kho_in_rong) },
    { k: "Cách in", v: nhanCachIn(ts.quy_cach_in) },
    { k: "Số màu", v: soMau(ts.so_mau_a, ts.so_mau_b) },
    { k: "Con trên tờ", v: ts.so_con || null },
    { k: "Số tờ in", v: ts.so_to_ke_hoach ? num(ts.so_to_ke_hoach) : null },
    { k: "Số kẽm", v: ts.so_kem },
  ];
  const them: O[] = [
    { k: "Khổ nguyên", v: khoMm(ts.kho_nguyen_dai, ts.kho_nguyen_rong) },
    { k: "Khổ thành phẩm", v: khoMm(ts.dai_thanh_pham, ts.rong_thanh_pham) },
    { k: "Mực", v: muc(ts.muc_a, ts.muc_b) },
    { k: "Số trang", v: ts.so_trang },
    { k: "Trang mỗi tay", v: ts.trang_moi_tay },
    { k: "Số mảnh xả", v: ts.so_manh_xa },
    { k: "Số tờ nguyên", v: ts.so_to_nguyen ? num(ts.so_to_nguyen) : null },
    { k: "Loại lệnh", v: tt.loai ? (LOAI_LENH[tt.loai] ?? tt.loai) : null },
    { k: "Người bán", v: tt.sale },
  ];
  const hien = (du ? [...coBan, ...them] : coBan).filter((o) => coGiaTri(o.v));
  const conAn = them.filter((o) => coGiaTri(o.v)).length;

  return (
    <>
      {hien.length === 0 ? (
        <p className="lhs-trong">Phiếu tính giá chưa khai thông số nào cho lệnh này.</p>
      ) : (
        <div className="lhs-kvs">
          {hien.map((o) => (
            <Kv key={o.k} k={o.k} v={o.v} />
          ))}
        </div>
      )}
      {conAn > 0 && (
        <button type="button" className="lsc-link lhs-xemdu" aria-expanded={du} onClick={() => setDu((v) => !v)}>
          {du ? "Thu gọn thông số" : `Xem đủ thông số (thêm ${conAn} ô)`}
        </button>
      )}
      {ts.ghi_chu_ky_thuat && (
        <p className="lhs-ghichu">
          <b>Ghi chú kỹ thuật:</b> {ts.ghi_chu_ky_thuat}
        </p>
      )}
      {tt.ghi_chu && (
        <p className="lhs-ghichu">
          <b>Ghi chú lệnh:</b> {tt.ghi_chu}
        </p>
      )}
    </>
  );
}
