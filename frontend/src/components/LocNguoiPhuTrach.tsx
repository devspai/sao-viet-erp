// Hộp lọc "NV phụ trách" dùng chung cho các màn danh sách khối Kinh doanh (Tính giá thành · Báo giá ·
// Đơn hàng bán) — cùng dáng hộp lọc của Khách hàng.
//
// Danh sách người do MÁY CHỦ trả, đã cắt theo phạm vi của người xem (own = mình + nhóm dùng chung,
// department = cây phòng, all = hết) — FE không tự lọc thêm. Hộp LUÔN hiện (kể cả khi chỉ có
// mình), cùng hành vi với hộp lọc của Khách hàng.
import { useEffect, useState } from "react";
import { Select } from "./Select";
import { useAuth } from "../auth/useAuth";
import type { SaleOption } from "../api/client";
import "./loc-nguoi-phu-trach.css";

/** Dòng phụ dưới tên: vai trò + phòng; thiếu vế nào bỏ vế đó. */
function moTa(s: SaleOption): string | undefined {
  const phan = [s.vai_tro, s.phong_ban].filter((x): x is string => !!x && x.trim() !== "");
  return phan.length ? phan.join(" · ") : undefined;
}

export function LocNguoiPhuTrach({
  nap,
  value,
  onChange,
  tatCa = "Tất cả NV phụ trách",
  donVi,
}: {
  /** Gọi API danh sách người trong tầm nhìn (vd `api.orders.nguoiPhuTrach`). */
  nap: (token: string) => Promise<SaleOption[]>;
  value: number | null;
  onChange: (id: number | null) => void;
  tatCa?: string;
  /** Đơn vị đếm hiện bên phải tên ("đơn", "BG", "phiếu"). */
  donVi: string;
}) {
  const { token } = useAuth();
  const [opts, setOpts] = useState<SaleOption[]>([]);

  useEffect(() => {
    if (!token) return;
    nap(token).then(setOpts).catch(() => setOpts([]));
    // `nap` là hàm của module api — ổn định, không cần theo dõi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="loc-nguoi">
      <Select
        ariaLabel="Lọc theo NV phụ trách"
        value={value == null ? "" : String(value)}
        placeholder={tatCa}
        align="right"
        // Gõ tìm tương đối (không dấu) — `Select` lọc bằng `khopGanDung` trên tên + vai trò + phòng.
        searchable
        searchPlaceholder="Tìm tên, vai trò, phòng…"
        onChange={(v) => onChange(v ? Number(v) : null)}
        options={[
          { value: "", label: tatCa },
          ...opts.map((s) => ({
            value: String(s.id),
            label: s.name,
            sub: moTa(s),
            hint: s.so_kh ? `${s.so_kh} ${donVi}` : undefined,
          })),
        ]}
      />
    </div>
  );
}
