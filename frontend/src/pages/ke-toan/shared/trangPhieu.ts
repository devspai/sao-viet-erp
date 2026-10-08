/** Nối dây dùng chung của trang SỔ PHIẾU (Phiếu chi, Phiếu thu — đặc tả A.11, A.16, A.17, A.18).
 *
 *  - `useTrangPhieu`: toàn bộ nối dây của một trang sổ — kỳ (thanh lọc chung `ThanhLoc`, mốc của
 *    màn); thẻ, lọc, ô tìm lấy từ URL và ghi lên URL; trang hiệu lực; tải bảng (bỏ câu trả lời cũ
 *    về muộn); nạp lại khi có sự kiện đẩy; liên thông `focusQuery`; tài khoản công ty cho
 *    điều kiện lọc; ngăn đang mở và ↑ ↓. Màn chỉ khai cấu hình (lời gọi API, hàm tham số, chữ lỗi).
 *  - `useTimTre`: ô tìm gửi máy chủ sau 350ms kể từ phím cuối (lỗi thật số 10).
 *  - `useTrangTheoKhoa`: trang gắn với bộ lọc đang xem — đổi kỳ / thẻ / lọc / tìm / cỡ trang thì tự
 *    về trang 1, KHÔNG qua một effect "setPage(1)" chạy sau (gây một lần tải thừa với trang cũ).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  api,
  type CompanyBankAccountRow,
  type LocPhieu,
  type TheLoc as SoTheLoc,
} from "../../../api/client";
import type { KyDS } from "../../thanh-loc/ky-danh-sach";
import { useKyKeToan } from "./kyKeToan";
import { docThamSoMan, useDongBoUrl, type GiaTriUrl } from "./urlMan";

/** `tim` là chữ đang gõ, `timTre` là chữ đã gửi — chờ 350ms sau phím cuối. `datCaHai` đặt ngay
 *  cả hai (bỏ lọc, mở từ liên thông). */
export function useTimTre(dau: string) {
  const [tim, setTim] = useState(dau);
  const [timTre, setTimTre] = useState(dau);
  useEffect(() => {
    if (tim === timTre) return;
    const hen = window.setTimeout(() => setTimTre(tim), 350);
    return () => window.clearTimeout(hen);
  }, [tim, timTre]);
  const datCaHai = (v: string) => {
    setTim(v);
    setTimTre(v);
  };
  return { tim, setTim, timTre, datCaHai };
}

/** Trang hiệu lực theo `khoaLoc` (chuỗi JSON của mọi thứ ảnh hưởng danh sách): khoá đổi ⇒ trang 1. */
export function useTrangTheoKhoa(khoaLoc: string) {
  const [trangTho, setTrangTho] = useState({ khoa: khoaLoc, so: 1 });
  const trang = trangTho.khoa === khoaLoc ? trangTho.so : 1;
  return { trang, datTrang: (so: number) => setTrangTho({ khoa: khoaLoc, so }) };
}

export type ThamSoSo = Omit<LocPhieu, "status"> & { status?: string };

/** Trang danh sách mà lời gọi sổ trả về — phần trang dùng tới. */
type DanhSachSo<R> = {
  items: R[];
  total: number;
  the_loc: SoTheLoc;
  total_paid_amount?: number;
  total_received_amount?: number;
};

/** Cấu hình một trang sổ phiếu. `T` là mã thẻ lọc (luôn có "tat_ca"), `L` là bộ lọc nâng cao. */
export type CauHinhTrangPhieu<R extends { id: number }, T extends string, L> = {
  /** Mã màn — khoá nhớ kỳ và dấu `man` trên URL. */
  man: string;
  /** [mã, nhãn] các mốc ngày kỳ tính theo; mốc đầu là mặc định. */
  moc: [string, string][];
  locTuUrl: (p: URLSearchParams | null) => { the: T; tim: string; loc: L };
  locLenUrl: (tt: { the: T; tim: string; loc: L }) => GiaTriUrl;
  locTrong: L;
  thamSoLoc: (the: T, loc: L, tim: string, ky: KyDS) => ThamSoSo;
  thamSoTai: (the: T, loc: L, tim: string, ky: KyDS, page: number, size: number) => ThamSoSo;
  goiDanhSach: (token: string, p: ThamSoSo) => Promise<DanhSachSo<R>>;
  /** Thẻ không xem bảng (Phiếu chi "Gia công chờ chi"): vẫn tải số thẻ lọc, bảng để trống. */
  theKhongBang?: (the: T) => boolean;
  /** Câu lỗi khi tải hỏng mà máy chủ không nói gì. */
  chuLoi: string;
  coTrang: number;
  /** Có ô Xem của màn Tài khoản ngân hàng ⇒ nạp tài khoản công ty cho điều kiện lọc. */
  coXemTaiKhoan: boolean;
  mucDichTaiKhoan: "pay" | "receive";
  /** Việc thêm khi có sự kiện đẩy (vd nạp lại hàng gia công chờ chi). */
  onSuKien?: () => void;
};

const TAT_CA = "tat_ca";

export function useTrangPhieu<R extends { id: number }, T extends string, L>(
  ch: CauHinhTrangPhieu<R, T, L>,
  token: string | null | undefined,
  eventTick: number,
  focusQuery: string | null,
) {
  // Hàm cấu hình đổi danh tính mỗi lần vẽ — giữ trong ref để không kéo theo `load`.
  const chRef = useRef(ch);
  chRef.current = ch;

  const [ky, setKy] = useKyKeToan(ch.man, ch.moc, ch.moc[0][0]);
  // Mở từ link / tải lại trang: thẻ, ô tìm và bộ lọc lấy từ URL (kỳ do `useKyKeToan` tự đọc).
  const [dauUrl] = useState(() => ch.locTuUrl(docThamSoMan(ch.man)));
  const [the, setThe] = useState<T>(dauUrl.the);
  const [loc, setLoc] = useState<L>(dauUrl.loc);
  // Ô tìm (`q`) và ô tên người trong bộ lọc (`nhan`) là hai tham số riêng, sống cùng nhau.
  const { tim, setTim, timTre, datCaHai: datTim } = useTimTre(dauUrl.tim);
  useDongBoUrl(ch.man, ch.locLenUrl({ the, tim: timTre, loc }));
  const [size, setSize] = useState(ch.coTrang);
  // Trang gắn với bộ lọc đang xem: đổi kỳ / thẻ / lọc / tìm / cỡ trang thì tự về trang 1.
  const { trang: page, datTrang } = useTrangTheoKhoa(JSON.stringify([the, timTre, loc, ky, size]));

  const [rows, setRows] = useState<R[]>([]);
  const [tong, setTong] = useState(0);
  const [tongTien, setTongTien] = useState<number | null>(null);
  const [soThe, setSoThe] = useState<SoTheLoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [taiKhoan, setTaiKhoan] = useState<CompanyBankAccountRow[] | null>(null);
  const [mo, setMo] = useState<R | null>(null);

  const boLoc = () => {
    setThe(TAT_CA as T);
    setLoc(chRef.current.locTrong);
    datTim("");
  };

  // Liên thông: điền mã vào ô tìm, bỏ mọi lọc và mở kỳ "Tất cả" (phiếu có thể đã lập từ lâu).
  useEffect(() => {
    if (!focusQuery) return;
    datTim(focusQuery);
    setThe(TAT_CA as T);
    setLoc(chRef.current.locTrong);
    setKy({ loai: "tat_ca", moc: ky.moc });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusQuery]);

  // Bảng + số dải tab (`the_loc`) trong MỘT lời gọi; câu trả lời cũ về muộn bị bỏ.
  const lanTai = useRef(0);
  const load = useCallback(() => {
    if (!token) return;
    const c = chRef.current;
    const lan = ++lanTai.current;
    setLoading(true);
    const coBang = !c.theKhongBang?.(the);
    const chinh = c.goiDanhSach(
      token,
      coBang ? c.thamSoTai(the, loc, timTre, ky, page, size) : c.thamSoTai(TAT_CA as T, loc, timTre, ky, 1, 1),
    );
    chinh
      .then((r) => {
        if (lan !== lanTai.current) return;
        setRows(coBang ? r.items : []);
        setTong(r.total);
        setTongTien(coBang ? (r.total_paid_amount ?? r.total_received_amount ?? null) : null);
        setSoThe(r.the_loc);
        setLoi(null);
      })
      .catch((e) => {
        if (lan !== lanTai.current) return;
        setRows([]);
        setTongTien(null);
        setLoi(e instanceof ApiError ? e.message : c.chuLoi);
      })
      .finally(() => {
        if (lan === lanTai.current) setLoading(false);
      });
  }, [token, the, loc, timTre, ky, page, size]);

  useEffect(() => {
    load();
  }, [load]);

  // Sự kiện đẩy (SSE): nạp lại bảng, thẻ lọc và việc riêng của màn; ngăn đang mở tự nạp theo `eventTick`.
  // `eventTick` là bộ đếm cộng dồn từ lúc mở app: bỏ giá trị lúc MỞ MÀN (lần tải đầu đã lo), nếu
  // không thì mở màn sau sự kiện đẩy đầu tiên sẽ tải hai lượt liền nhau.
  const moiNhat = useRef(load);
  moiNhat.current = load;
  const tickDau = useRef(eventTick);
  useEffect(() => {
    if (eventTick === tickDau.current) return;
    tickDau.current = eventTick;
    moiNhat.current();
    chRef.current.onSuKien?.();
  }, [eventTick]);

  // Tài khoản công ty cho điều kiện tài khoản của thanh lọc — chỉ khi có ô Xem của màn Tài khoản ngân hàng.
  const { coXemTaiKhoan, mucDichTaiKhoan } = ch;
  useEffect(() => {
    if (!token || !coXemTaiKhoan) {
      setTaiKhoan(null);
      return;
    }
    api.accounting
      .companyAccounts(token, false, mucDichTaiKhoan)
      .then(setTaiKhoan)
      .catch(() => setTaiKhoan(null));
  }, [token, coXemTaiKhoan, mucDichTaiKhoan]);

  // Ngăn đang mở: ↑ ↓ đổi sang phiếu trước/sau trong trang đang xem.
  const viTri = mo ? rows.findIndex((r) => r.id === mo.id) : -1;
  const len = viTri > 0 ? () => setMo(rows[viTri - 1]) : undefined;
  const xuong = viTri >= 0 && viTri < rows.length - 1 ? () => setMo(rows[viTri + 1]) : undefined;

  return {
    ky,
    setKy,
    the,
    setThe,
    loc,
    setLoc,
    tim,
    setTim,
    timTre,
    size,
    setSize,
    page,
    datTrang,
    rows,
    tong,
    /** Tổng tiền phiếu đã xong theo kỳ + bộ lọc (mọi trang) — dòng Cộng của bảng. */
    tongTien,
    soThe,
    loading,
    loi,
    load,
    boLoc,
    taiKhoan,
    mo,
    setMo,
    len,
    xuong,
  };
}
