/** Nối dây dùng chung của NGĂN công nợ (phải trả NPT-2, phải thu NPTh-2): tải chi tiết một nhà cung
 *  cấp / khách hàng cùng các lần trả / lần thu do máy chủ cắt trang (`paid_page` / `paid_size`).
 *
 *  - Tải lần đầu và nạp lại lấy trang 1 với cỡ `coTrang × số trang đã mở` — nạp lại (sự kiện đẩy,
 *    vừa lập phiếu) không làm co danh sách người dùng đang đọc. Đổi `khoa` (bản ghi, phạm vi, kỳ)
 *    thì về một trang.
 *  - "Xem thêm" tải trang kế rồi NỐI vào, bỏ dòng đã có (`noiKhongTrung`): giữa hai lần tải có phiếu
 *    mới thì trang kế trượt một dòng, dòng cuối trang trước sẽ về lại lần nữa.
 *  - Câu trả lời cũ về muộn bị bỏ; tải hỏng thì XOÁ số cũ (im lặng không được giả làm số đúng).
 *  - Sự kiện đẩy (`eventTick` đổi so với lúc mở) ⇒ nạp lại.
 *  - Máy chủ nhận `paid_size` tối đa `TRAN_LAN_TRA` (200). Đã mở quá số đó thì nạp lại chỉ lấy đủ số
 *    trang trọn vừa trần, và "Xem thêm" đi tiếp từ trang ngay sau — không 422, không hụt dòng.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, type TrangDaTra } from "../../../api/client";

/** Nối `moi` vào sau `cu`, bỏ dòng trùng khoá (kể cả trùng ngay trong `moi`). Không có gì mới thì
 *  trả lại chính `cu`. */
export function noiKhongTrung<T>(cu: T[], moi: T[], khoa: (x: T) => string | number): T[] {
  const da = new Set(cu.map(khoa));
  const them: T[] = [];
  for (const x of moi) {
    const k = khoa(x);
    if (da.has(k)) continue;
    da.add(k);
    them.push(x);
  }
  return them.length ? [...cu, ...them] : cu;
}

type CoLanTra<P> = { paid: P[]; paid_total?: number };

/** Trần `paid_size` của máy chủ (`routers/accounting.py`, `le=200`). */
export const TRAN_LAN_TRA = 200;

export function useChiTietCongNo<P, D extends CoLanTra<P>>({
  token,
  khoa,
  coTrang,
  goi,
  khoaDong,
  eventTick,
  chuLoi,
  chuLoiThem,
  onTai,
}: {
  token: string | null | undefined;
  /** Mọi thứ quyết định nội dung (mã bản ghi, phạm vi lần trả, kỳ) — đổi thì tải lại từ một trang. */
  khoa: string;
  /** Cỡ một trang lần trả / lần thu. */
  coTrang: number;
  goi: (token: string, trang: TrangDaTra) => Promise<D>;
  /** Khoá của một lần trả / lần thu (mã phiếu) — để nối trang không trùng dòng. */
  khoaDong: (p: P) => string | number;
  eventTick: number;
  chuLoi: string;
  chuLoiThem: string;
  /** Việc thêm sau mỗi lần tải thành công (vd bỏ đợt đã trả xong khỏi lựa chọn). */
  onTai?: (d: D) => void;
}) {
  const [detail, setDetail] = useState<D | null>(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTaiThem, setDangTaiThem] = useState(false);

  // Hàm của màn đổi danh tính mỗi lần vẽ — giữ trong ref để không kéo theo `reload`.
  const moi = useRef({ goi, khoaDong, onTai, chuLoi, chuLoiThem });
  moi.current = { goi, khoaDong, onTai, chuLoi, chuLoiThem };

  // Số trang lần trả đã mở; đổi khoá thì về một trang (đặt ngay lúc vẽ, trước lần tải của khoá mới).
  const soTrang = useRef({ khoa, so: 1 });
  if (soTrang.current.khoa !== khoa) soTrang.current = { khoa, so: 1 };

  const lanTai = useRef(0);
  const reload = useCallback(() => {
    if (!token) return;
    const lan = ++lanTai.current;
    // Kẹp về số trang TRỌN vừa trần: "Xem thêm" sau đó xin trang `so + 1` cỡ `coTrang` là đúng dòng kế.
    const so = Math.min(soTrang.current.so, Math.max(1, Math.floor(TRAN_LAN_TRA / coTrang)));
    soTrang.current = { khoa: soTrang.current.khoa, so };
    setLoading(true);
    moi.current
      .goi(token, { paid_page: 1, paid_size: coTrang * so })
      .then((d) => {
        if (lan !== lanTai.current) return;
        setDetail(d);
        setLoi(null);
        moi.current.onTai?.(d);
      })
      .catch((err) => {
        if (lan !== lanTai.current) return;
        setDetail(null);
        setLoi(err instanceof ApiError ? err.message : moi.current.chuLoi);
      })
      .finally(() => {
        if (lan === lanTai.current) setLoading(false);
      });
    // `khoa` là phụ thuộc thật: đổi khoá ⇒ hàm mới ⇒ effect tải lại.
  }, [token, khoa, coTrang]);

  useEffect(() => {
    reload();
  }, [reload]);

  // "Xem thêm": trang kế, NỐI vào các lần đã tải. Lần nạp lại chen giữa thì bỏ kết quả.
  const xemThem = () => {
    if (!token || !detail || dangTaiThem) return;
    const lan = lanTai.current;
    const trang = soTrang.current.so + 1;
    const khoaLuc = soTrang.current.khoa;
    setDangTaiThem(true);
    moi.current
      .goi(token, { paid_page: trang, paid_size: coTrang })
      .then((d) => {
        if (lan !== lanTai.current || khoaLuc !== soTrang.current.khoa || !Array.isArray(d.paid)) return;
        soTrang.current = { khoa: khoaLuc, so: trang };
        setDetail((cu) =>
          cu
            ? { ...cu, paid: noiKhongTrung(cu.paid, d.paid, moi.current.khoaDong), paid_total: d.paid_total ?? cu.paid_total }
            : cu,
        );
      })
      .catch((err) => {
        if (lan === lanTai.current) setLoi(err instanceof ApiError ? err.message : moi.current.chuLoiThem);
      })
      .finally(() => setDangTaiThem(false));
  };

  // Sự kiện đẩy: nạp lại. Bỏ qua giá trị lúc mở — lần tải đầu đã lo.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const tickDau = useRef(eventTick);
  useEffect(() => {
    if (eventTick === tickDau.current) return;
    tickDau.current = eventTick;
    reloadRef.current();
  }, [eventTick]);

  return { detail, setDetail, loading, loi, reload, xemThem, dangTaiThem };
}
