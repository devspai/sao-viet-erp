/** Thân trang CÔNG NỢ dùng chung hai màn (phải trả NPT-1, phải thu NPTh-1, đặc tả E "đối xứng tuyệt
 *  đối"). Màn chỉ khai: chữ (tiêu đề, nhãn cột, đơn vị), bốn số tổng quan, cách đọc trường của một dòng
 *  (mã, tên, số đã trả / đã thu trong kỳ), bộ lọc nâng cao của màn và ngăn chi tiết.
 *
 *  Khuôn: đầu trang → chọn kỳ → khối TỔNG QUAN (chưa có số thì nói rõ "để trống, KHÔNG phải bằng 0")
 *  → thanh lọc (nhóm nút có số, ô tìm, bộ lọc, "n …") → bảng + thẻ điện thoại + chân phân trang. Bấm
 *  dòng mở ngăn; bấm số Quá hạn / Đã trả (thu) mở ngăn đúng chỗ đó.
 */
import { ChevronRight, Search } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import type { AgingBucket } from "../../../api/client";
import { PhanTrangDayDu } from "../../../components/PhanTrangDayDu";
import { homNayVN } from "../../../utils/ky";
import { BangRong, diChuyen } from "./BangPhieu";
import { ChonKy } from "./ChonKy";
import type { ChipLoc } from "./BoLocNangCao";
import { Cum, TheNho } from "./Cum";
import { ngay, tien, vietSo } from "./dinhDang";
import { THE_CONG_NO, dangLocCongNo, nhanMoc, type TheCongNo } from "./locCongNo";
import { ConHan, OHanMuc } from "./oCongNo";
import { TongQuanCongNo, type SoTongQuan } from "./TongQuanCongNo";
import type { useTrangCongNo } from "./trangCongNo";

/** Ngăn mở ở đâu: dòng ("all"), số Quá hạn ("overdue"), số Đã trả / Đã thu trong kỳ ("paid"). */
export type NoiMoCongNo = "all" | "overdue" | "paid";

/** Phần chung của một dòng công nợ (nhà cung cấp / khách hàng). */
export type DongCongNo = {
  total_due: number;
  overdue_amount: number;
  han_gan_nhat: string | null;
  credit_limit: number;
  vuot_han_muc: boolean;
  vuot_bao_nhieu: number;
  aging?: Record<string, { count: number }>;
};

type TomTatTrang<R> = {
  items: R[];
  total: number;
  page: number;
  aging: AgingBucket[];
  den_ngay: string | null;
  /** Hôm nay theo máy chủ — mốc của "còn n ngày / trễ n ngày" ở cột hạn gần nhất. */
  as_of?: string;
};

export type CauHinhThanCongNo<R> = {
  tieuDe: string;
  moTa: string;
  /** "nhà cung cấp" / "khách hàng". */
  donVi: string;
  /** "Nhà cung cấp" / "Khách hàng" — cột đầu. */
  nhanDoiTac: string;
  /** "Hạn trả gần nhất" / "Hạn thu gần nhất". */
  nhanHan: string;
  /** "Đã trả trong kỳ" / "Đã thu trong kỳ". */
  nhanDaTra: string;
  /** "Đã trả hết" / "Đã thu hết". */
  chuHet: string;
  /** "khoản" / "hoá đơn" — dòng phụ dưới tên. */
  donViKhoan: string;
  nhanTim: string;
  goiYTim: string;
  chuTai: string;
  chuLoi: string;
  chuChuaCo: string;
  ariaPhanTrang: string;
  id: (r: R) => number | null;
  ten: (r: R) => string;
  daTraTrongKy: (r: R) => number;
};

export function ThanTrangCongNo<R extends DongCongNo, S extends TomTatTrang<R>>({
  ch,
  sp,
  con,
  boLoc,
  dangXem,
  onMo,
  ngan,
}: {
  ch: CauHinhThanCongNo<R>;
  sp: ReturnType<typeof useTrangCongNo<S>>;
  /** Bốn số tổng quan từ số kỳ này và số cùng kỳ. */
  con: (data: S, cung: S | null) => SoTongQuan[];
  /** Bộ lọc nâng cao của màn; nhận chip "Tuổi nợ" đầu hàng. */
  boLoc: (dau: { chipDau: ChipLoc[]; onBoDau: (k: string | null) => void }) => ReactNode;
  /** Mã dòng đang mở ngăn. */
  dangXem: number | null;
  onMo: (row: R, noi?: NoiMoCongNo) => void;
  ngan?: ReactNode;
}) {
  const { data, dataCung, the, tuoi, loc, kyMan } = sp;
  const rows = data?.items ?? [];
  const denNgay = data?.den_ngay ?? kyMan.ky.den;
  // "Hạn gần nhất" luôn tính theo hôm nay, không theo cuối kỳ (xem `ConHan`).
  const homNay = data?.as_of ?? homNayVN();
  const nhanTuoi = nhanTuoiDangLoc(sp);
  const coLoc = dangLocCongNo({ the, tuoi, tim: sp.timTre, loc });
  const mo = (row: R, noi: NoiMoCongNo = "all") => {
    if (ch.id(row) != null) onMo(row, noi);
  };
  const nutSo = (row: R, so: number, noi: NoiMoCongNo, lop: string) =>
    so > 0 ? (
      <button type="button" className={lop}
        onClick={(e) => {
          e.stopPropagation();
          mo(row, noi);
        }}>
        {vietSo(so)}
      </button>
    ) : (
      <span className="kt-mo">—</span>
    );

  return (
    <main className="kt-trang">
      <header className="kt-ph">
        <div>
          <h1>{ch.tieuDe}</h1>
          <p>{ch.moTa}</p>
        </div>
      </header>

      <ChonKy kyMan={kyMan} />

      {data ? (
        <TongQuanCongNo con={con(data, dataCung)} aging={data.aging} dangChon={tuoi} onChon={sp.setTuoi} denNgay={denNgay} />
      ) : (
        <section className="kt-tq" aria-label="Tổng quan công nợ">
          <p className="kt-mo">
            {sp.loi ? "Chưa đọc được số liệu nên các con số đang để trống, KHÔNG phải bằng 0." : "Đang tải số tổng…"}
          </p>
        </section>
      )}

      <div className="kt-tb">
        <div className="kt-seg" role="group" aria-label={`Lọc ${ch.donVi} theo tình trạng nợ`}>
          {THE_CONG_NO.map(([v, nhan]) => (
            <button key={v} type="button" className={v === the ? "on" : undefined} aria-pressed={v === the}
              onClick={() => sp.setThe(v as TheCongNo)}>
              {nhan}
              {sp.demThe && <span className="kt-seg__n">{vietSo(sp.demThe[v])}</span>}
            </button>
          ))}
        </div>
        <label className="kt-tim">
          <Search size={16} aria-hidden="true" />
          <input aria-label={ch.nhanTim} placeholder={ch.goiYTim} value={sp.tim} onChange={(e) => sp.setTim(e.target.value)} />
        </label>
        {boLoc({
          chipDau: nhanTuoi ? [{ khoa: "tuoi", nhan: "Tuổi nợ", giaTri: nhanTuoi }] : [],
          onBoDau: (k) => {
            if (k === null || k === "tuoi") sp.setTuoi(null);
          },
        })}
        {data && <span className="kt-tb__dem">{`${vietSo(data.total)} ${ch.donVi}`}</span>}
      </div>

      {rows.length === 0 ? (
        <BangRong loading={sp.loading} loi={sp.loi} coLoc={coLoc} onTaiLai={sp.load} onBoLoc={sp.boLoc}
          chuTai={ch.chuTai} chuLoi={ch.chuLoi} chuKhongKhop={`Không có ${ch.donVi} nào khớp bộ lọc`}
          chuChuaCo={<b>{ch.chuChuaCo}</b>} />
      ) : (
        <div className="kt-bang" aria-busy={sp.loading || undefined}>
          <table className="kt-chinh">
            <colgroup>
              <col />
              <col style={{ width: "14%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: 36 }} />
            </colgroup>
            <thead>
              <tr>
                <th>{ch.nhanDoiTac}</th>
                <th className="kt-so">Còn nợ</th>
                <th className="kt-so">Quá hạn</th>
                <th>{ch.nhanHan}</th>
                <th className="kt-so">{ch.nhanDaTra}</th>
                <th>Hạn mức</th>
                <th aria-label="Mở" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = ch.id(row);
                const ten = ch.ten(row);
                const soKhoan = Object.values(row.aging ?? {}).reduce((s, c) => s + c.count, 0);
                return (
                  <tr key={id ?? ten} className={`kt-dong${id != null && id === dangXem ? " kt-dang-xem" : ""}`}
                    tabIndex={id != null ? 0 : undefined}
                    onClick={() => mo(row)}
                    onKeyDown={(e) => diChuyen(e, () => mo(row))}>
                    <td>
                      <span className="kt-ten" title={ten}>{ten}</span>
                      {row.total_due === 0 ? (
                        <span className="kt-phu"><TheNho>{ch.chuHet}</TheNho></span>
                      ) : soKhoan > 0 ? (
                        <span className="kt-phu">{`${vietSo(soKhoan)} ${ch.donViKhoan}`}</span>
                      ) : null}
                    </td>
                    <td className="kt-so">
                      {row.total_due > 0 ? <span className="kt-tien">{vietSo(row.total_due)}</span> : <span className="kt-mo">—</span>}
                    </td>
                    {/* Bấm số Quá hạn ⇒ ngăn mở sẵn các khoản quá hạn. */}
                    <td className="kt-so">{nutSo(row, row.overdue_amount, "overdue", "kt-so-nut kt-do")}</td>
                    <td>
                      {row.han_gan_nhat ? (
                        <>
                          <span>{ngay(row.han_gan_nhat)}</span>
                          <ConHan han={row.han_gan_nhat} homNay={homNay} />
                        </>
                      ) : (
                        <span className="kt-mo">—</span>
                      )}
                    </td>
                    <td className="kt-so">{nutSo(row, ch.daTraTrongKy(row), "paid", "kt-so-nut")}</td>
                    <td>
                      <OHanMuc row={row} />
                    </td>
                    <td className="kt-mui">{id != null && <ChevronRight size={16} aria-hidden="true" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Điện thoại: mỗi dòng một thẻ hai hàng (tên + còn nợ; quá hạn, hạn gần nhất, vượt hạn mức).
              Dòng không có mã không mở được ngăn ⇒ thẻ không phải nút. */}
          <div className="kt-the-dt">
            {rows.map((row) => {
              const id = ch.id(row);
              const ten = ch.ten(row);
              return (
                <div key={id ?? ten}
                  {...(id != null
                    ? { role: "button", tabIndex: 0, "aria-label": ten, onClick: () => mo(row),
                        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => diChuyen(e, () => mo(row)) }
                    : {})}>
                  <div className="kt-the-dt__h">
                    <span className="kt-ten">{ten}</span>
                    <span className="kt-tien">{row.total_due > 0 ? tien(row.total_due) : ch.chuHet}</span>
                  </div>
                  <div className="kt-the-dt__h">
                    <Cum className="kt-mo">
                      {row.overdue_amount > 0 && <span className="kt-do">{`Quá hạn ${vietSo(row.overdue_amount)}`}</span>}
                      {row.han_gan_nhat && <span>{`Hạn ${ngay(row.han_gan_nhat).slice(0, 5)}`}</span>}
                    </Cum>
                    {row.vuot_han_muc ? <span className="kt-tt kt-tt--do">Vượt hạn mức</span> : <span />}
                  </div>
                </div>
              );
            })}
          </div>
          <PhanTrangDayDu trang={sp.page} size={sp.size} tong={data?.total ?? 0} soDong={rows.length}
            onTrang={sp.datTrang} onSize={sp.setSize} loading={sp.loading} donVi={ch.donVi} ariaLabel={ch.ariaPhanTrang} />
        </div>
      )}

      {ngan}
    </main>
  );
}

/** Tên mốc tuổi nợ đang lọc ("Trễ 31–60 ngày") — chip "Tuổi nợ" và ngăn lọc sẵn mốc đó. */
export function nhanTuoiDangLoc(sp: {
  tuoi: string | null;
  data: { aging: AgingBucket[] } | null;
}): string | null {
  return sp.tuoi ? nhanMoc(sp.data?.aging.find((b) => b.key === sp.tuoi)?.label ?? sp.tuoi) : null;
}
