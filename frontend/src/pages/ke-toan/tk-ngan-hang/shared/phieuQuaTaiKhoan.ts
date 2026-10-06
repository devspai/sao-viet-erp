/** Nối dây tab "Phiếu qua tài khoản" của ngăn tài khoản (đặc tả TK-2): phiếu chi ĐÃ CHI + phiếu thu
 *  ĐÃ THU trả từ / vào tài khoản này trong kỳ, do máy chủ lọc (`tai_khoan_id` + `tu_ngay`/`den_ngay`)
 *  và cắt trang.
 *
 *  - Hai sổ tải song song, mỗi sổ `CO_TRANG` dòng; gộp + xếp ngày giảm ở `gopPhieu`.
 *  - "Xem thêm" xin trang KẾ của từng sổ còn phiếu, nối không trùng dòng (`noiKhongTrung`).
 *  - Nạp lại (sự kiện đẩy, "Tải lại") lấy trang 1 cỡ `CO_TRANG × số trang đã mở` của từng sổ — danh
 *    sách đang đọc không co lại; kẹp trần 200 dòng của máy chủ như `useChiTietCongNo`.
 *  - Không có quyền xem sổ nào thì không gọi sổ đó (thủ quỹ chỉ có quyền Phiếu thu không bị 403).
 *  - Chỉ gọi khi tab đã mở: component tab gọi hook này chỉ được vẽ lúc tab "Phiếu qua tài khoản" mở.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, api } from "../../../../api/client";
import type { KyXem } from "../../../../utils/ky";
import { TRAN_LAN_TRA, noiKhongTrung } from "../../shared/chiTietCongNo";
import { dongChi, dongThu, gopPhieu } from "./helpers";
import type { DongPhieuTk } from "./types";

export const CO_TRANG = 20;

type TrangSo = { rows: DongPhieuTk[]; total: number };
type LoaiSo = "chi" | "thu";

export function usePhieuQuaTaiKhoan({
  token,
  taiKhoanId,
  ky,
  xemChi,
  xemThu,
  eventTick,
}: {
  token: string | null | undefined;
  taiKhoanId: number;
  ky: KyXem;
  xemChi: boolean;
  xemThu: boolean;
  eventTick: number;
}) {
  const [so, setSo] = useState<{ chi: TrangSo | null; thu: TrangSo | null }>({ chi: null, thu: null });
  const [loading, setLoading] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTaiThem, setDangTaiThem] = useState(false);

  const khoa = `${taiKhoanId}|${ky.tu}|${ky.den}|${xemChi}|${xemThu}`;
  // Số trang đã mở của từng sổ; đổi khoá thì về một trang.
  const soTrang = useRef({ khoa, chi: 1, thu: 1 });
  if (soTrang.current.khoa !== khoa) soTrang.current = { khoa, chi: 1, thu: 1 };

  const goi = useCallback(
    (t: string, loai: LoaiSo, page: number, size: number): Promise<TrangSo> => {
      const loc = { tai_khoan_id: taiKhoanId, tu_ngay: ky.tu, den_ngay: ky.den };
      return loai === "chi"
        ? api.accounting
            .vouchers(t, { ...loc, status: "paid", sort: "-voucher_date", page, size })
            .then((d) => ({ rows: d.items.map(dongChi), total: d.total }))
        : api.accounting
            .receipts(t, { ...loc, status: "received", sort: "-receipt_date", page, size })
            .then((d) => ({ rows: d.items.map(dongThu), total: d.total }));
    },
    [taiKhoanId, ky.tu, ky.den],
  );

  const lanTai = useRef(0);
  const reload = useCallback(() => {
    if (!token || (!xemChi && !xemThu)) return;
    const lan = ++lanTai.current;
    const tran = Math.max(1, Math.floor(TRAN_LAN_TRA / CO_TRANG));
    const sc = Math.min(soTrang.current.chi, tran);
    const st = Math.min(soTrang.current.thu, tran);
    soTrang.current = { ...soTrang.current, chi: sc, thu: st };
    setLoading(true);
    Promise.all([
      xemChi ? goi(token, "chi", 1, CO_TRANG * sc) : null,
      xemThu ? goi(token, "thu", 1, CO_TRANG * st) : null,
    ])
      .then(([chi, thu]) => {
        if (lan !== lanTai.current) return;
        setSo({ chi, thu });
        setLoi(null);
      })
      .catch((err) => {
        if (lan !== lanTai.current) return;
        // Im lặng không được giả làm "chưa có phiếu": tải hỏng thì xoá số cũ và nói rõ.
        setSo({ chi: null, thu: null });
        setLoi(err instanceof ApiError ? err.message : "Kiểm tra kết nối rồi bấm Tải lại.");
      })
      .finally(() => {
        if (lan === lanTai.current) setLoading(false);
      });
  }, [token, xemChi, xemThu, goi]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Sự kiện đẩy: nạp lại. Bỏ qua giá trị lúc mở — lần tải đầu đã lo.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const tickDau = useRef(eventTick);
  useEffect(() => {
    if (eventTick === tickDau.current) return;
    tickDau.current = eventTick;
    reloadRef.current();
  }, [eventTick]);

  const conThem = (s: TrangSo | null) => s != null && s.rows.length < s.total;

  const xemThem = () => {
    if (!token || dangTaiThem) return;
    const lan = lanTai.current;
    const khoaLuc = soTrang.current.khoa;
    const { chi, thu } = so;
    const trangChi = soTrang.current.chi + 1;
    const trangThu = soTrang.current.thu + 1;
    if (!conThem(chi) && !conThem(thu)) return;
    setDangTaiThem(true);
    Promise.all([
      conThem(chi) ? goi(token, "chi", trangChi, CO_TRANG) : null,
      conThem(thu) ? goi(token, "thu", trangThu, CO_TRANG) : null,
    ])
      .then(([c, t]) => {
        if (lan !== lanTai.current || khoaLuc !== soTrang.current.khoa) return;
        soTrang.current = {
          khoa: khoaLuc,
          chi: c ? trangChi : soTrang.current.chi,
          thu: t ? trangThu : soTrang.current.thu,
        };
        const noi = (cu: TrangSo | null, moi: TrangSo | null) =>
          cu && moi ? { rows: noiKhongTrung(cu.rows, moi.rows, (d) => d.id), total: moi.total } : cu;
        setSo((cu) => ({ chi: noi(cu.chi, c), thu: noi(cu.thu, t) }));
      })
      .catch((err) => {
        if (lan === lanTai.current) setLoi(err instanceof ApiError ? err.message : "Không tải thêm được phiếu.");
      })
      .finally(() => setDangTaiThem(false));
  };

  const rows = useMemo(() => gopPhieu(so.chi, so.thu), [so.chi, so.thu]);
  const tong = (so.chi?.total ?? 0) + (so.thu?.total ?? 0);
  const daTai = so.chi != null || so.thu != null;

  return { rows, tong, daTai, loading, loi, reload, xemThem, dangTaiThem };
}
