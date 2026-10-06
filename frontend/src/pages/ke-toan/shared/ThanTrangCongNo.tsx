/** Thân trang CÔNG NỢ dùng chung hai màn (phải trả NPT-1, phải thu NPTh-1, đặc tả E "đối xứng tuyệt
 *  đối"). Màn chỉ khai: chữ (tiêu đề, nhãn cột, đơn vị), bốn số tổng quan, cách đọc trường của một dòng
 *  (mã, tên, số đã trả / đã thu trong kỳ), các điều kiện lọc của màn và ngăn chi tiết.
 *
 *  Khuôn: đầu trang → khối TỔNG QUAN (chưa có số thì nói rõ "để trống, KHÔNG phải bằng 0") → thanh
 *  lọc (nhóm nút có số, ô tìm, thanh lọc chung `ThanhLoc`: kỳ + điều kiện, "n …") → bảng + thẻ điện thoại + chân phân trang. Bấm
 *  dòng mở ngăn; bấm số Quá hạn / Đã trả (thu) mở ngăn đúng chỗ đó.
 *
 *  BẢNG ĐỦ CỘT (06/10/2026, docs/mockups/cong-no-phai-thu-danh-sach-3-phuong-an.html phương án 1 —
 *  khuôn Stripe Billing / Chargebee): đọc ngang một dòng là đủ để quyết định gọi ai, đòi bao nhiêu.
 *  Đối tác (mã, số khoản, vượt hạn mức) | Còn nợ + vạch tuổi nợ + quá hạn | Hạn gần nhất + cho nợ |
 *  Trong kỳ (thêm / đã thu-trả) | Thu-trả gần nhất | Liên hệ (+ phụ trách) | Hạn mức. Ba cột sắp được
 *  (Còn nợ, Hạn gần nhất, Thu-trả gần nhất) — sắp ở MÁY CHỦ. Màn hẹp ẩn Trong kỳ và Gần nhất.
 */
import { Search } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import { ThanhLoc } from "../../thanh-loc/ThanhLoc";
import { dkTheoTab, type DieuKien } from "../../thanh-loc/thanh-loc";

import type { AgingBucket, CotSapXepCongNo } from "../../../api/client";
import { PhanTrangDayDu } from "../../../components/PhanTrangDayDu";
import { homNayVN } from "../../../utils/ky";
import { BangRong, diChuyen } from "./BangPhieu";
import { Cum, TheNho } from "./Cum";
import { ngay, tien, vietSo } from "./dinhDang";
import { THE_CONG_NO, dangLocCongNo, nhanMoc, sapXepHienTai, type LocThanhCongNo, type TheCongNo } from "./locCongNo";
import { ChamTen, ConHan, OHanMucDong, VachTuoi, vietSdt } from "./oCongNo";
import { TongQuanCongNo, type SoTongQuan } from "./TongQuanCongNo";
import { MOC_CONG_NO, type useTrangCongNo } from "./trangCongNo";

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
  aging?: Record<string, { count: number; amount?: number }>;
};

type TomTatTrang<R> = {
  items: R[];
  total: number;
  page: number;
  aging: AgingBucket[];
  tu_ngay: string | null;
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
  /** Dòng "thêm" của cột Trong kỳ: "Mua thêm" / "Bán thêm". */
  nhanThem: string;
  /** Dòng "đã" của cột Trong kỳ: "Đã trả" / "Đã thu". */
  nhanDa: string;
  /** "Trả gần nhất" / "Thu gần nhất". */
  nhanGanNhat: string;
  /** "Chưa trả lần nào" / "Chưa thu lần nào". */
  chuChuaGanNhat: string;
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
  ma: (r: R) => string | null | undefined;
  /** Số ngày cho nợ của đối tác (null = chưa đặt). */
  choNo: (r: R) => number | null;
  /** Tiền mua / bán thêm trong kỳ. */
  themTrongKy: (r: R) => number;
  daTraTrongKy: (r: R) => number;
  /** Lần thu / trả gần nhất (cả lịch sử); null = chưa lần nào. */
  ganNhat: (r: R) => { ngay: string; tien: number } | null;
  lienHe: (r: R) => { ten?: string | null; sdt?: string | null; phuTrach?: string | null };
};

/** Tiêu đề cột sắp được: nút trong `th`, `aria-sort` trên `th`. */
function ThSapXep({ cot, sx, onSap, className, children }: {
  cot: CotSapXepCongNo;
  sx: { cot: CotSapXepCongNo; chieu: "asc" | "desc" };
  onSap: (cot: CotSapXepCongNo) => void;
  className?: string;
  children: ReactNode;
}) {
  const dang = sx.cot === cot;
  return (
    <th className={className} aria-sort={dang ? (sx.chieu === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={`kt-sx${dang ? ` on kt-sx--${sx.chieu}` : ""}`} onClick={() => onSap(cot)}>
        {children}
      </button>
    </th>
  );
}

export function ThanTrangCongNo<R extends DongCongNo, S extends TomTatTrang<R>>({
  ch,
  sp,
  so,
  dieuKien,
  dangXem,
  onMo,
  ngan,
}: {
  ch: CauHinhThanCongNo<R>;
  sp: ReturnType<typeof useTrangCongNo<S>>;
  /** Bốn số tổng quan đọc từ một câu trả lời (kỳ này, và cùng kỳ nếu có). */
  so: (data: S) => SoTongQuan;
  /** Điều kiện lọc của màn (mốc tuổi nợ + các điều kiện còn lại) trên thanh lọc chung. */
  dieuKien: DieuKien<LocThanhCongNo>[];
  /** Mã dòng đang mở ngăn. */
  dangXem: number | null;
  onMo: (row: R, noi?: NoiMoCongNo) => void;
  ngan?: ReactNode;
}) {
  const { data, dataCung, the, tuoi, loc } = sp;
  const rows = data?.items ?? [];
  // `den_ngay` máy chủ đã chặn ở hôm nay — "Tháng này" trên thanh lọc là trọn tháng.
  const denNgay = data?.den_ngay ?? (sp.ky.den > homNayVN() ? homNayVN() : sp.ky.den);
  // "Hạn gần nhất" luôn tính theo hôm nay, không theo cuối kỳ (xem `ConHan`).
  const homNay = data?.as_of ?? homNayVN();
  const coLoc = dangLocCongNo({ the, tuoi, tim: sp.timTre, loc });
  const sx = sapXepHienTai(sp.sx);
  // "Trạng thái" trong nút Lọc = nhóm nút Tất cả / Quá hạn / Vượt hạn mức (đọc/ghi thẳng nút đang bấm).
  const dkDu: DieuKien<LocThanhCongNo>[] = [
    dkTheoTab<LocThanhCongNo>({
      tabs: THE_CONG_NO.map(([id, nhan]) => ({ id, nhan, so: sp.demThe?.[id] })),
      tatCa: "all",
      dang: the,
      dat: (id) => sp.setThe(id as TheCongNo),
    }),
    ...dieuKien,
  ];
  const mo =(row: R, noi: NoiMoCongNo = "all") => {
    if (ch.id(row) != null) onMo(row, noi);
  };

  return (
    <main className="kt-trang">
      <header className="kt-ph">
        <div>
          <h1>{ch.tieuDe}</h1>
          <p>{ch.moTa}</p>
        </div>
      </header>

      <div className="kt-tq-khung">
      {data ? (
        <TongQuanCongNo so={so(data)} cung={dataCung ? so(dataCung) : null}
          nhan={{ them: ch.nhanThem, da: ch.nhanDa, khoan: ch.donViKhoan }}
          aging={data.aging} dangChon={tuoi} onChon={sp.setTuoi} tuNgay={data.tu_ngay ?? sp.ky.tu} denNgay={denNgay} />
      ) : (
        <section className="kt-tq" aria-label="Tổng quan công nợ">
          <p className="kt-mo">
            {sp.loi ? "Chưa đọc được số liệu nên các con số đang để trống, KHÔNG phải bằng 0." : "Đang tải số tổng…"}
          </p>
        </section>
      )}
      </div>

      <div className="kt-tb tl-thanh">
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
        <ThanhLoc ky={sp.kyDS} moc={MOC_CONG_NO} onKy={sp.setKy} dieuKien={dkDu} loc={{ tuoi, loc }}
          onLoc={(l) => {
            sp.setTuoi(l.tuoi);
            sp.setLoc(l.loc);
          }} />
        {data && <span className="kt-tb__dem">{`${vietSo(data.total)} ${ch.donVi}`}</span>}
      </div>

      {rows.length === 0 ? (
        <BangRong loading={sp.loading} loi={sp.loi} coLoc={coLoc} onTaiLai={sp.load} onBoLoc={sp.boLoc}
          chuTai={ch.chuTai} chuLoi={ch.chuLoi} chuKhongKhop={`Không có ${ch.donVi} nào khớp bộ lọc`}
          chuChuaCo={<b>{ch.chuChuaCo}</b>} />
      ) : (
        <div className="kt-bang kt-bang--cn" aria-busy={sp.loading || undefined}>
          <table className="kt-chinh kt-du-cot">
            <colgroup>
              <col />
              <col style={{ width: 150 }} />
              <col style={{ width: 130 }} />
              <col className="kt-an-hep" style={{ width: 150 }} />
              <col className="kt-an-hep" style={{ width: 115 }} />
              <col className="kt-an-hep2" style={{ width: 170 }} />
              <col style={{ width: 140 }} />
            </colgroup>
            <thead>
              <tr>
                <th>{ch.nhanDoiTac}</th>
                <ThSapXep cot="con_no" sx={sx} onSap={sp.datSapXep} className="kt-so">Còn nợ</ThSapXep>
                <ThSapXep cot="han" sx={sx} onSap={sp.datSapXep}>{ch.nhanHan}</ThSapXep>
                <th className="kt-an-hep">Trong kỳ</th>
                <ThSapXep cot="gan_nhat" sx={sx} onSap={sp.datSapXep} className="kt-an-hep">{ch.nhanGanNhat}</ThSapXep>
                <th className="kt-an-hep2">Liên hệ</th>
                <th>Hạn mức</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = ch.id(row);
                const ten = ch.ten(row);
                const ma = ch.ma(row);
                const soKhoan = Object.values(row.aging ?? {}).reduce((s, c) => s + c.count, 0);
                const choNo = ch.choNo(row);
                const ganNhat = ch.ganNhat(row);
                const lh = ch.lienHe(row);
                const daTra = ch.daTraTrongKy(row);
                const them = ch.themTrongKy(row);
                return (
                  <tr key={id ?? ten} className={`kt-dong${id != null && id === dangXem ? " kt-dang-xem" : ""}`}
                    tabIndex={id != null ? 0 : undefined}
                    onClick={() => mo(row)}
                    onKeyDown={(e) => diChuyen(e, () => mo(row))}>
                    <td>
                      <span className="kt-ten kt-ten--xuong">{ten}</span>
                      <Cum className="kt-phu">
                        {ma && <TheNho>{ma}</TheNho>}
                        {row.total_due === 0 ? (
                          <TheNho>{ch.chuHet}</TheNho>
                        ) : soKhoan > 0 ? (
                          <span>{`${vietSo(soKhoan)} ${ch.donViKhoan}`}</span>
                        ) : null}
                        {row.vuot_han_muc && <span className="kt-pill kt-pill--do">Vượt hạn mức</span>}
                      </Cum>
                    </td>
                    <td className="kt-so">
                      {row.total_due > 0 ? <span className="kt-tien">{vietSo(row.total_due)}</span> : <span className="kt-mo">—</span>}
                      {data && <VachTuoi aging={row.aging} moc={data.aging} tong={row.total_due} />}
                      {/* Bấm số quá hạn ⇒ ngăn mở sẵn các khoản quá hạn. */}
                      {row.overdue_amount > 0 && (
                        <span className="kt-phu">
                          <button type="button" className="kt-so-nut kt-do"
                            onClick={(e) => {
                              e.stopPropagation();
                              mo(row, "overdue");
                            }}>
                            {`quá hạn ${vietSo(row.overdue_amount)}`}
                          </button>
                        </span>
                      )}
                    </td>
                    <td>
                      {row.han_gan_nhat ? (
                        <>
                          <span>{ngay(row.han_gan_nhat)}</span>
                          <ConHan han={row.han_gan_nhat} homNay={homNay} />
                        </>
                      ) : (
                        <span className="kt-mo">—</span>
                      )}
                      {choNo != null && <span className="kt-phu">{choNo > 0 ? `cho nợ ${vietSo(choNo)} ngày` : "trả ngay"}</span>}
                    </td>
                    <td className="kt-an-hep">
                      <span className="kt-hai-dong">
                        <span>
                          <i>{ch.nhanThem}</i>
                          {them > 0 ? vietSo(them) : <span className="kt-mo">—</span>}
                        </span>
                        <span>
                          <i>{ch.nhanDa}</i>
                          {daTra > 0 ? (
                            <button type="button" className="kt-so-nut"
                              onClick={(e) => {
                                e.stopPropagation();
                                mo(row, "paid");
                              }}>
                              {vietSo(daTra)}
                            </button>
                          ) : (
                            <span className="kt-mo">—</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="kt-an-hep">
                      {ganNhat ? (
                        <>
                          <span>{ngay(ganNhat.ngay)}</span>
                          <span className="kt-phu">{vietSo(ganNhat.tien)}</span>
                        </>
                      ) : (
                        <span className="kt-mo">{ch.chuChuaGanNhat}</span>
                      )}
                    </td>
                    <td className="kt-an-hep2">
                      {lh.ten || lh.sdt ? (
                        <>
                          <span className="kt-ten kt-ten--thuong">{lh.ten || "—"}</span>
                          {lh.sdt && <span className="kt-phu">{vietSdt(lh.sdt)}</span>}
                        </>
                      ) : (
                        <span className="kt-mo">Chưa có liên hệ</span>
                      )}
                      {lh.phuTrach && (
                        <span className="kt-phu">
                          <ChamTen ten={lh.phuTrach} />
                        </span>
                      )}
                    </td>
                    <td>
                      <OHanMucDong row={row} />
                    </td>
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
              const lhDt = ch.lienHe(row);
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
                  {(lhDt.ten || lhDt.sdt) && (
                    <Cum className="kt-mo">
                      {lhDt.ten && <span>{lhDt.ten}</span>}
                      {lhDt.sdt && <span>{vietSdt(lhDt.sdt)}</span>}
                    </Cum>
                  )}
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
