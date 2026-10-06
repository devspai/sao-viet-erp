/** Tài khoản công ty NHẬN tiền cho các form thu (phiếu thu khác, phiếu thu lại tiền đã chi, khung Thu
 *  tiền của Công nợ phải thu): tài khoản đang dùng, chiều nhận, đúng loại tiền của phiếu. Tải hỏng thì
 *  có câu lỗi riêng — KHÔNG giả làm "chưa có tài khoản". */
import { useEffect, useState } from "react";

import { api, type CompanyBankAccountRow } from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";

export function useTaiKhoanNhan(tienTe: string): {
  taiKhoan: CompanyBankAccountRow[];
  dangTai: boolean;
  loiTai: string | null;
} {
  const { token } = useAuth();
  const [taiKhoan, setTaiKhoan] = useState<CompanyBankAccountRow[]>([]);
  const [dangTai, setDangTai] = useState(!!token);
  const [loiTai, setLoiTai] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let song = true;
    setDangTai(true);
    setLoiTai(null);
    api.accounting
      .companyAccounts(token, true, "receive")
      .then((ds) => song && setTaiKhoan(ds.filter((t) => t.currency === tienTe)))
      .catch(() => song && setLoiTai("Không tải được danh sách tài khoản ngân hàng."))
      .finally(() => song && setDangTai(false));
    return () => {
      song = false;
    };
  }, [token, tienTe]);

  return { taiKhoan, dangTai, loiTai };
}
