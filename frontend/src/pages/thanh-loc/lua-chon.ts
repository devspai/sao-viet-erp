/** Danh sách giá trị của một điều kiện lọc nạp từ máy chủ (khách hàng, người duyệt…), kèm số bản ghi. */
import { useEffect, useState } from "react";

import type { LuaChonLoc } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import type { GiaTriDK } from "./thanh-loc";

/** Nạp một lần khi có phiên; lỗi thì rỗng (thanh lọc vẫn chạy, chỉ thiếu giá trị để chọn). */
export function useLuaChonLoc(nap: (token: string) => Promise<LuaChonLoc[]>): GiaTriDK[] {
  const { token } = useAuth();
  const [ds, setDs] = useState<GiaTriDK[]>([]);
  useEffect(() => {
    if (!token) return;
    nap(token)
      .then((r) => setDs(r.map((o) => ({ value: String(o.id), nhan: o.ten, so: o.so }))))
      .catch(() => setDs([]));
    // `nap` là hàm của module api — ổn định.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return ds;
}

/** Đọc / ghi một mã số (id) vào ô lọc kiểu số của màn. */
export const idThanhChu = (n?: number) => (n == null ? undefined : String(n));
export const chuThanhId = (s?: string) => (s == null ? undefined : Number(s));
