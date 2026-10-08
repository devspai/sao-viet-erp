// Mẩu dùng chung của ba lưới Thu mua (Yêu cầu, Từng món, Đơn mua) trên khuôn lưới `lds` — cột chọn
// được ẩn/hiện/đổi chỗ, chip trạng thái, dòng trống. Ba lưới này mỗi cái được đặt ở HAI màn
// (Yêu cầu mua hàng + Mua hàng › Yêu cầu chờ xử lý; Mua hàng › Đơn mua + Kế toán › Đơn mua hàng) nên
// trạng thái cột sống ở màn cha (nút "Cột" nằm ở thanh lọc của màn) và mỗi màn có khoá nhớ riêng.
import {
  ChipTT,
  ChonCot,
  useCotAn,
  useThuTuCot,
  xepCot,
  type CotLuoi,
  type MauTT,
} from "../../components/LuoiDs";
import { EmptyRow } from "../../components/EmptyState";

export interface CotMH extends CotLuoi {
  /** Bề rộng; cột cuối (co giãn) không đặt. */
  w?: number;
  /** Cột số: canh phải. */
  n?: boolean;
}

export interface CotBang<C extends CotMH = CotMH> {
  /** Toàn bộ cột của lưới (mặc định). */
  cot: C[];
  an: Set<string>;
  setAn: (s: Set<string>) => void;
  thuTu: string[];
  setThuTu: (v: string[]) => void;
  /** Cột đang hiện, đã xếp theo thứ tự người xem kéo. */
  hien: C[];
}

/** Cột của một lưới ở MỘT màn. `khoa` phải khác nhau giữa các màn dùng chung một lưới. */
export function useCotBang<C extends CotMH>(khoa: string, cot: C[]): CotBang<C> {
  const [an, setAn] = useCotAn(khoa);
  const [thuTu, setThuTu] = useThuTuCot(khoa);
  const hien = xepCot(cot, thuTu).filter((c) => !an.has(c.key));
  return { cot, an, setAn, thuTu, setThuTu, hien };
}

/** Nút "Cột" của thanh lọc — gắn vào `chonCot` của `ThanhCongCuMuaHang`. */
export function ChonCotBang({ b }: { b: CotBang }) {
  return <ChonCot cot={b.cot} an={b.an} onAn={b.setAn} thuTu={b.thuTu} onThuTu={b.setThuTu} />;
}

/** Chip trạng thái theo bảng nhãn `trang-thai-mua` ({ label, mau }). */
export function ChipNhan({ nhan, title }: { nhan: { label: string; mau: MauTT } | undefined; title?: string }) {
  if (!nhan) return null;
  return (
    <ChipTT mau={nhan.mau} title={title}>
      {nhan.label}
    </ChipTT>
  );
}

/** Ba ca không có dòng nào: đang tải, lỗi, rỗng (có lọc thì kèm nút xoá lọc). */
export function DongRong({
  soCot,
  dangTai,
  loi,
  onThuLai,
  chuaCo,
  khongKhop,
  coLoc,
  onXoaLoc,
  goiY,
}: {
  soCot: number;
  dangTai: boolean;
  loi: string | null;
  onThuLai: () => void;
  /** Câu khi chưa có bản ghi nào và không lọc gì. */
  chuaCo: string;
  /** Câu khi đang lọc mà không dòng nào khớp. */
  khongKhop: string;
  coLoc: boolean;
  onXoaLoc: () => void;
  /** Gợi ý khi chưa có gì (chỉ hiện lúc không lọc). */
  goiY?: string;
}) {
  if (dangTai) return <EmptyRow colSpan={soCot} trangThai="dang-tai" />;
  if (loi) {
    return (
      <tr>
        <td colSpan={soCot} className="lds-trong">
          <span className="lds-do">{loi}</span>{" "}
          <button type="button" className="lds-lk" onClick={onThuLai}>
            Thử lại
          </button>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td colSpan={soCot} className="lds-trong">
        {coLoc ? (
          <>
            {khongKhop}{" "}
            <button type="button" className="lds-lk" onClick={onXoaLoc}>
              Xoá bộ lọc
            </button>
          </>
        ) : (
          <>
            {chuaCo}
            {goiY ? ` ${goiY}` : ""}
          </>
        )}
      </td>
    </tr>
  );
}
