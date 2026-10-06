/** Nối dây dùng chung của trang SỔ PHIẾU (Phiếu chi, Phiếu thu — đặc tả A.11, A.16, A.17, A.18).
 *
 *  - `useTrangPhieu`: toàn bộ nối dây của một trang sổ — kỳ (thanh lọc chung `ThanhLoc`, mốc của
 *    màn); thẻ, lọc, ô tìm lấy từ URL và ghi lên URL; trang hiệu lực; tải bảng + số cùng kỳ (bỏ câu
 *    trả lời cũ về muộn); nạp lại khi có sự kiện đẩy; liên thông `focusQuery`; tài khoản công ty cho
 *    điều kiện lọc; ngăn đang mở và ↑ ↓. Màn chỉ khai cấu hình (lời gọi API, hàm tham số, chữ lỗi).
 *  - `useTimTre`: ô tìm gửi máy chủ sau 350ms kể từ phím cuối (lỗi thật số 10).
 *  - `useTrangTheoKhoa`: trang gắn với bộ lọc đang xem — đổi kỳ / thẻ / lọc / tìm / cỡ trang thì tự
 *    về trang 1, KHÔNG qua một effect "setPage(1)" chạy sau (gây một lần tải thừa với trang cũ).
 *  - `cungKyTien`: dòng cùng kỳ của thẻ tiền ("12% so với 114.600.000").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  api,
  type CompanyBankAccountRow,
  type LocPhieu,
  type TheLoc as SoTheLoc,
} from "../../../api/client";
import type { KyDS } from "../../thanh-loc/ky-danh-sach";
import { doiSo, tien, vietSo } from "./dinhDang";
import { cungKyCua, kyTheoKhoang, useKyKeToan } from "./kyKeToan";
import type { TheLocMuc } from "./TheLoc";
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

/** Dòng cùng kỳ của thẻ "Đã chi" / "Đã thu": "12% so với 114.600.000". */
export function cungKyTien(nay: number, truoc: number): NonNullable<TheLocMuc["cungKy"]> {
  const d = doiSo(nay, truoc);
  if (d.phanTram == null) return { huong: d.huong, chu: `Cùng kỳ ${tien(truoc)}` };
  if (d.huong === "bang") return { huong: "bang", chu: `Bằng cùng kỳ ${vietSo(truoc)}` };
  return { huong: d.huong, chu: `${d.phanTram}% so với ${vietSo(truoc)}` };
}

/** Tham số lọc gửi máy chủ của một sổ phiếu (bảng, cùng kỳ, đếm "Khớp n phiếu"). */
export type ThamSoSo = Omit<LocPhieu, "status"> & { status?: string };

/** Trang danh sách mà lời gọi sổ trả về — phần trang dùng tới. */
type DanhSachSo<R> = { items: R[]; total: number; the_loc: SoTheLoc };

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
  /** Ngăn đang mở nhận bản mới của dòng sau mỗi lần tải (màn không có endpoint đọc một phiếu). */
  moTheoBang?: boolean;
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
  // So cùng kỳ năm trước: tự bật khi kỳ có khoảng ngày ("Tất cả" thì không so).
  const khoaKy = JSON.stringify(ky);
  const cungKy = useMemo(() => {
    const k = cungKyCua(ky);
    return k ? kyTheoKhoang(k, ky.moc) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khoaKy]);
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
  const [soThe, setSoThe] = useState<SoTheLoc | null>(null);
  const [soTheCung, setSoTheCung] = useState<SoTheLoc | null>(null);
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

  // Bảng + thẻ lọc kỳ này và số cùng kỳ năm trước: hai lời gọi song song, câu trả lời cũ về muộn bị bỏ.
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
    const cung = cungKy
      ? c.goiDanhSach(token, { ...c.thamSoLoc(the, loc, timTre, cungKy), page: 1, size: 1 }).catch(() => null)
      : Promise.resolve(null);
    Promise.all([chinh, cung])
      .then(([r, rc]) => {
        if (lan !== lanTai.current) return;
        setRows(coBang ? r.items : []);
        setTong(r.total);
        setSoThe(r.the_loc);
        setSoTheCung(rc?.the_loc ?? null);
        setLoi(null);
        if (c.moTheoBang) setMo((cu) => (cu ? r.items.find((x) => x.id === cu.id) ?? cu : cu));
      })
      .catch((e) => {
        if (lan !== lanTai.current) return;
        setRows([]);
        setLoi(e instanceof ApiError ? e.message : c.chuLoi);
      })
      .finally(() => {
        if (lan === lanTai.current) setLoading(false);
      });
  }, [token, the, loc, timTre, ky, cungKy, page, size]);

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
    soThe,
    /** Số cùng kỳ — null khi đã tắt so sánh. */
    soTheCung: cungKy ? soTheCung : null,
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

/** Bốn thẻ lọc chung của hai sổ phiếu: Tất cả (dòng cùng kỳ số phiếu), Đã chi/Đã thu (tiền + số
 *  phiếu + dòng cùng kỳ tiền), Thiếu chứng từ, Đã hủy. Màn chèn thẻ riêng (Gia công chờ chi, Chờ thu)
 *  vào giữa. `c` = số cùng kỳ (null khi tắt so sánh). */
export function theLocSo(
  n: SoTheLoc | null,
  c: SoTheLoc | null,
  chu: { nhanXong: string; phuThieu: string },
): { tatCa: TheLocMuc; xong: TheLocMuc; thieu: TheLocMuc; daHuy: TheLocMuc } {
  return {
    tatCa: {
      id: "tat_ca",
      nhan: "Tất cả",
      so: n ? vietSo(n.tat_ca) : "—",
      phu: "phiếu trong kỳ",
      cungKy: n && c ? { huong: doiSo(n.tat_ca, c.tat_ca).huong, chu: `Cùng kỳ ${vietSo(c.tat_ca)} phiếu` } : null,
    },
    xong: {
      id: "xong",
      nhan: chu.nhanXong,
      cham: "xanh",
      so: n ? tien(n.xong_tien) : "—",
      phu: n ? `${vietSo(n.xong)} phiếu` : undefined,
      cungKy: n && c ? cungKyTien(n.xong_tien, c.xong_tien) : null,
    },
    thieu: {
      id: "thieu",
      nhan: "Thiếu chứng từ",
      icon: "paperclip",
      so: n ? vietSo(n.thieu_chung_tu) : "—",
      phu: chu.phuThieu,
    },
    daHuy: { id: "da_huy", nhan: "Đã hủy", cham: "xam", so: n ? vietSo(n.da_huy) : "—", phu: "phiếu" },
  };
}
