/** Nối dây dùng chung của trang CÔNG NỢ (phải trả, phải thu — đặc tả NPT-1, NPTh-1, A.11, A.17,
 *  A.18). Màn chỉ khai lời gọi API; hook lo:
 *
 *  - kỳ (thanh lọc chung `ThanhLoc`, mặc định "Tháng này"; "Tất cả" = từ đầu sổ tới hôm nay), nhóm
 *    nút, mốc tuổi nợ, ô tìm (trễ 350ms) và các điều kiện — lấy từ URL lúc mở và ghi lên URL khi đổi;
 *  - trang hiệu lực: đổi kỳ / lọc / tìm / cỡ trang thì tự về trang 1;
 *  - tải bảng (một lời; dòng Cộng của bảng là `tong_loc` trong chính câu trả lời — số cùng kỳ năm
 *    trước đã thôi tải từ 07/10/2026 vì khối tổng quan đọc nó đã bỏ), câu trả lời cũ về muộn bị bỏ;
 *    tải hỏng thì XOÁ số cũ (im lặng không được giả làm số 0);
 *  - số trên nhóm nút "Tất cả n | Quá hạn n | Vượt hạn mức n": máy chủ đếm sẵn trong CHÍNH câu trả
 *    lời của bảng (`the_loc`, sau kỳ + mốc tuổi + tìm + bộ lọc đang áp, trước nút đang chọn) — bấm
 *    nút nào thì bảng ra đúng số đó, không tốn lời gọi riêng;
 *  - nạp lại khi có sự kiện đẩy.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, type CotSapXepCongNo, type LocCongNo, type TheLocCongNo } from "../../../api/client";
import { khoangSo, useKyKeToan } from "./kyKeToan";
import {
  LOC_CONG_NO_TRONG,
  congNoLenUrl,
  congNoTuUrl,
  doiSapXep,
  sapXepLenUrl,
  sapXepTuUrl,
  thamSoCongNo,
  type LocNangCaoCongNo,
  type SapXepCongNo,
  type TheCongNo,
  type TrangThaiCongNo,
} from "./locCongNo";
import { useTimTre, useTrangTheoKhoa } from "./trangPhieu";
import { docThamSoMan, useDongBoUrl } from "./urlMan";

/** Phần trả về của `payables` / `receivables` mà hook dùng tới. */
type TomTatCongNo = { items: unknown[]; total: number; page: number; the_loc?: TheLocCongNo };

/** Mốc kỳ của sổ công nợ: một mốc — ngày trên chứng từ (giao hàng, hoá đơn, phiếu chi / thu). */
export const MOC_CONG_NO: [string, string][] = [["ps", "Ngày chứng từ"]];

export type CauHinhTrangCongNo<S extends TomTatCongNo> = {
  /** Mã màn — khoá nhớ kỳ và dấu `man` trên URL. */
  man: string;
  coTrang: number;
  goi: (token: string, p: LocCongNo) => Promise<S>;
  /** Câu lỗi khi tải hỏng mà máy chủ không nói gì. */
  chuLoi: string;
  /** Trạng thái lọc lúc MỞ màn thay cho URL (liên thông mở màn theo một khách): lần tải đầu đã
   *  mang đúng ô tìm, không tải thừa một lượt rỗng. Chỉ đọc lúc mở. */
  dau?: TrangThaiCongNo;
};

export function useTrangCongNo<S extends TomTatCongNo>(
  ch: CauHinhTrangCongNo<S>,
  token: string | null | undefined,
  eventTick: number,
) {
  // Hàm cấu hình đổi danh tính mỗi lần vẽ — giữ trong ref để không kéo theo `load`.
  const chRef = useRef(ch);
  chRef.current = ch;

  const [kyDS, setKy] = useKyKeToan(ch.man, MOC_CONG_NO, "ps", "thang");
  // Sổ công nợ luôn cần một khoảng ngày thật — "Tất cả" = từ đầu sổ tới hôm nay.
  const khoaKy = JSON.stringify(kyDS);
  const ky = useMemo(() => khoangSo(kyDS), [khoaKy]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dauUrl] = useState(() => ch.dau ?? congNoTuUrl(docThamSoMan(ch.man)));
  const [the, setThe] = useState<TheCongNo>(dauUrl.the);
  // Mốc tuổi đang lọc. Tách khỏi `the`: hai bộ lọc CHỒNG nhau được ("vượt hạn mức" + "trễ trên 60 ngày").
  const [tuoi, setTuoi] = useState<string | null>(dauUrl.tuoi);
  const [loc, setLoc] = useState<LocNangCaoCongNo>(dauUrl.loc);
  const { tim, setTim, timTre, datCaHai: datTim } = useTimTre(dauUrl.tim);
  // Sắp xếp ở MÁY CHỦ (bảng đủ cột). Liên thông mở màn theo một khách thì về thứ tự mặc định.
  const [sx, setSx] = useState<SapXepCongNo | null>(() => (ch.dau ? null : sapXepTuUrl(docThamSoMan(ch.man))));
  useDongBoUrl(ch.man, { ...congNoLenUrl({ the, tuoi, tim: timTre, loc }), sx: sapXepLenUrl(sx) });
  const [size, setSize] = useState(ch.coTrang);
  const { trang: page, datTrang } = useTrangTheoKhoa(JSON.stringify([the, tuoi, timTre, loc, ky.tu, ky.den, size, sx]));

  const boSapXep = useCallback(() => setSx(null), []);
  const [data, setData] = useState<S | null>(null);
  // Bộ lọc ĐÃ SINH RA `data` — câu trả lời cũ có thể về sau khi ô tìm / nút đã đổi.
  const [ttData, setTtData] = useState<TrangThaiCongNo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);

  const lanTai = useRef(0);
  const load = useCallback(() => {
    if (!token) return;
    const c = chRef.current;
    const lan = ++lanTai.current;
    const tt = { the, tuoi, tim: timTre, loc };
    setLoading(true);
    c.goi(token, { ...thamSoCongNo(tt, ky), page, size, sap_xep: sx?.cot, chieu: sx?.chieu })
      .then((r) => {
        if (lan !== lanTai.current) return;
        setData(r);
        setTtData(tt);
        setLoi(null);
        // Máy chủ kẹp trang về trang cuối khi danh sách co lại.
        if (r.page !== page) datTrang(r.page);
      })
      .catch((e) => {
        if (lan !== lanTai.current) return;
        setData(null);
        setTtData(null);
        setLoi(e instanceof ApiError ? e.message : c.chuLoi);
      })
      .finally(() => {
        if (lan === lanTai.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, the, tuoi, timTre, loc, ky, page, size, sx]);

  useEffect(() => {
    load();
  }, [load]);

  // Sự kiện đẩy (SSE): nạp lại bảng (số trên nhóm nút đi cùng câu trả lời). Bỏ giá trị `eventTick`
  // lúc MỞ MÀN — nó là bộ đếm cộng dồn từ lúc mở app, lần tải đầu đã lo; giữ thì mở màn sau sự
  // kiện đẩy đầu tiên sẽ tải hai lượt liền nhau.
  const moiNhat = useRef(load);
  moiNhat.current = load;
  const tickDau = useRef(eventTick);
  useEffect(() => {
    if (eventTick === tickDau.current) return;
    tickDau.current = eventTick;
    moiNhat.current();
  }, [eventTick]);

  const tl = data?.the_loc;
  const demThe: Record<TheCongNo, number> | null = tl
    ? { all: tl.tat_ca, overdue: tl.qua_han, vuot_han_muc: tl.vuot_han_muc }
    : null;

  const boLoc = () => {
    setThe("all");
    setTuoi(null);
    setLoc(LOC_CONG_NO_TRONG);
    datTim("");
  };

  return {
    /** Kỳ trên thanh lọc. */
    kyDS,
    setKy,
    /** Khoảng ngày thật của kỳ (đã thay "Tất cả" bằng từ đầu sổ tới hôm nay). */
    ky,
    the,
    setThe,
    tuoi,
    setTuoi,
    loc,
    setLoc,
    tim,
    setTim,
    timTre,
    /** Đặt ô tìm ngay, không chờ 350ms (liên thông mở màn theo tên). */
    datTim,
    page,
    datTrang,
    size,
    setSize,
    /** Cột đang sắp (null = mặc định: còn nợ giảm dần). */
    sx,
    /** Bấm tiêu đề cột: cùng cột thì đảo chiều. */
    datSapXep: (cot: CotSapXepCongNo) => setSx((cu) => doiSapXep(cu, cot)),
    /** Về thứ tự mặc định (còn nợ giảm dần). */
    boSapXep,
    data,
    /** Bộ lọc (nhóm nút, mốc tuổi, ô tìm, bộ lọc nâng cao) của lượt tải đã sinh ra `data`. */
    ttData,
    demThe,
    loading,
    loi,
    /** Nạp lại bảng và số trên nhóm nút — sự kiện đẩy, hoặc người dùng vừa đổi dữ liệu (lập phiếu). */
    load,
    boLoc,
  };
}
