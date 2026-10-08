/** Thân trang CÔNG NỢ dùng chung hai màn (phải trả NPT-1, phải thu NPTh-1, đặc tả E "đối xứng tuyệt
 *  đối") — khuôn lưới danh sách chung `lds-*` (08/10/2026), giống các danh sách Kinh doanh. Màn chỉ
 *  khai chữ (tiêu đề, nhãn cột, đơn vị), cách đọc trường của một dòng và ngăn chi tiết.
 *
 *  Khuôn: đầu trang (tiêu đề) → thẻ lọc (hàng lọc nhanh Tất cả / Quá hạn / Vượt hạn mức có số từ
 *  `the_loc`; ô tìm, thanh lọc chung `ThanhLoc`: kỳ + điều kiện; "Còn nợ tới …"; "Xem cột": Tuổi nợ |
 *  Trong kỳ và liên hệ, nhớ ở localStorage; nút Cột) → lưới kiểu bảng tính, dòng Cộng CUỐI bảng đọc
 *  `tong_loc` của máy chủ (tổng của MỌI dòng khớp bộ lọc, không chỉ trang đang xem) → chân phân trang.
 *  Không còn khối tổng quan: mọi con số tổng nằm ở dòng Cộng; lọc theo mốc tuổi nợ vẫn ở thanh lọc
 *  (điều kiện Tuổi nợ).
 *
 *  Bấm dòng mở ngăn; bấm số quá hạn mở ngăn lọc sẵn quá hạn; bấm số trả / thu trong kỳ mở ngăn ở các
 *  lần trả / thu. Ba cột sắp được (Còn nợ, Hạn sớm nhất, Trả / Thu gần nhất) — sắp ở MÁY CHỦ.
 *
 *  Mỗi mốc trễ là một cột riêng (tiêu đề một hàng như mọi lưới lds). Cột tên đứng yên khi cuộn ngang
 *  (cột cố định của `CuonLuoi`).
 */
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";

import { ThanhLoc } from "../../thanh-loc/ThanhLoc";
import { dkTheoTab, type DieuKien } from "../../thanh-loc/thanh-loc";

import type { AgingBucket, CotSapXepCongNo, TongLocCongNo } from "../../../api/client";
import { EmptyRow } from "../../../components/EmptyState";
import {
  ChonCot, CuonLuoi, LocNhanhTrangThai, OTim, TieuDeSapXep, rongLuoi, soVN, useCauHinhLuoi,
  type CotLuoi, type MauTT, type MucLocNhanh,
} from "../../../components/LuoiDs";
import { PhanTrangDayDu } from "../../../components/PhanTrangDayDu";
import { homNayVN, soNgay } from "../../../utils/ky";
import { diChuyen } from "./BangPhieu";
import { ngay, trieu } from "./dinhDang";
import { THE_CONG_NO, dangLocCongNo, nhanMoc, sapXepHienTai, type LocThanhCongNo, type TheCongNo } from "./locCongNo";
import { vietSdt } from "./oCongNo";
import { MOC_CONG_NO, type useTrangCongNo } from "./trangCongNo";

/** Ngăn mở ở đâu: dòng ("all"), số quá hạn ("overdue"), số trả / thu trong kỳ ("paid"). */
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
  /** Hôm nay theo máy chủ — mốc của "còn n ngày / trễ n ngày" ở cột Hạn sớm nhất. */
  as_of?: string;
  /** Dòng Cộng theo bộ lọc (mọi trang). Máy chủ cũ không có ⇒ không vẽ dòng Cộng. */
  tong_loc?: TongLocCongNo | null;
};

export type CauHinhThanCongNo<R> = {
  tieuDe: string;
  /** "nhà cung cấp" / "khách hàng". */
  donVi: string;
  /** "Nhà cung cấp" / "Khách hàng" — cột đầu. */
  nhanDoiTac: string;
  /** Cột số đợt / hoá đơn còn nợ: "Đợt" / "Hoá đơn"; rộng 56 / 72 ở bộ cột Tuổi nợ. */
  nhanKhoan: string;
  rongKhoan: number;
  /** "Mua trong kỳ" / "Bán trong kỳ". */
  nhanThemKy: string;
  /** "Trả trong kỳ" / "Thu trong kỳ". */
  nhanDaKy: string;
  /** "Trả gần nhất" / "Thu gần nhất". */
  nhanGanNhat: string;
  /** "chưa trả lần nào" / "chưa thu lần nào". */
  chuChuaGanNhat: string;
  /** "Đã trả hết" / "Đã thu hết". */
  chuHet: string;
  /** Có cột Phụ trách (chỉ phải thu). */
  coPhuTrach?: boolean;
  nhanTim: string;
  goiYTim: string;
  chuTai: string;
  chuLoi: string;
  chuChuaCo: string;
  ariaPhanTrang: string;
  id: (r: R) => number | null;
  ten: (r: R) => string;
  /** Số ngày cho nợ của đối tác (null = chưa đặt). */
  choNo: (r: R) => number | null;
  /** Tiền mua / bán trong kỳ. */
  themTrongKy: (r: R) => number;
  daTraTrongKy: (r: R) => number;
  /** Lần thu / trả gần nhất (cả lịch sử); null = chưa lần nào. */
  ganNhat: (r: R) => { ngay: string; tien: number } | null;
  lienHe: (r: R) => { ten?: string | null; sdt?: string | null; phuTrach?: string | null };
};

/** Hai bộ cột của lưới; lựa chọn nhớ chung cho hai màn. */
type BoCot = "tuoi" | "ky";
const KHOA_BO_COT = "kt-cong-no-cot";

function docBoCot(): BoCot {
  try {
    return window.localStorage.getItem(KHOA_BO_COT) === "ky" ? "ky" : "tuoi";
  } catch {
    return "tuoi";
  }
}

function ghiBoCot(v: BoCot) {
  try {
    window.localStorage.setItem(KHOA_BO_COT, v);
  } catch {
    // Trình duyệt chặn bộ nhớ: vẫn đổi cột, chỉ không nhớ.
  }
}

/** Cột tiền (mốc tuổi nợ, trong kỳ, số tiền): "1.234.567.890" cần ~107px kể cả đệm ⇒ đủ tới 9,99 tỷ. */
const RONG_TIEN = 112;
/** Cột Còn nợ: "12.345.678.900" ~114px ⇒ đủ tới 99 tỷ. */
const RONG_CON_NO = 120;
/** Cột của lưới: `w` bề rộng (cột cuối co giãn thì bỏ), `n` canh phải, `sx` cột sắp xếp ở máy chủ. */
interface CotCN extends CotLuoi {
  w?: number;
  n?: boolean;
  sx?: CotSapXepCongNo;
}

/** Ô số: 0 thành gạch mờ. */
function soHoacGach(n: number): ReactNode {
  return n > 0 ? soVN(n) : <span className="lds-mu3">–</span>;
}

/** Ô Hạn sớm nhất: ngày + "trễ N ngày" đỏ / "còn N ngày" mờ, đếm từ HÔM NAY (`as_of`), không từ cuối
 *  kỳ — `han_gan_nhat` là hạn của các khoản còn nợ tại hôm nay. */
function HanSom({ han, homNay, conNo }: { han: string | null; homNay: string; conNo: boolean }) {
  if (!han) return <span className="lds-mu3">{conNo ? "chưa đặt hạn nợ" : "–"}</span>;
  const d = soNgay(homNay, han);
  // Ngày bên trái, "còn / trễ" dạt phải: cột đọc dọc như hai cột, không dính chữ vào nhau.
  return (
    <span className="kt-cn-han">
      <span>{ngay(han)}</span>
      <span className={`kt-cn-ben ${d < 0 ? "lds-do" : "lds-mu"}`}>
        {d > 0 ? `còn ${soVN(d)} ngày` : d < 0 ? `trễ ${soVN(-d)} ngày` : "tới hạn"}
      </span>
    </span>
  );
}

/** Nút số trong ô (mở ngăn đúng chỗ) — không để Enter / bấm lọt lên dòng. */
function NutSo({ onBam, children }: { onBam: () => void; children: ReactNode }) {
  return (
    <button type="button" className="kt-so-nut"
      onClick={(e) => {
        e.stopPropagation();
        onBam();
      }}
      onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </button>
  );
}

/** Mục của hàng lọc nhanh → màu chấm (mỗi mục một sắc). */
const MAU_THE: Record<TheCongNo, MauTT | undefined> = { all: undefined, overdue: "do", vuot_han_muc: "vang" };

export function ThanTrangCongNo<R extends DongCongNo, S extends TomTatTrang<R>>({
  ch,
  sp,
  dieuKien,
  dangXem,
  onMo,
  ngan,
}: {
  ch: CauHinhThanCongNo<R>;
  sp: ReturnType<typeof useTrangCongNo<S>>;
  /** Điều kiện lọc của màn (mốc tuổi nợ + các điều kiện còn lại) trên thanh lọc chung. */
  dieuKien: DieuKien<LocThanhCongNo>[];
  /** Mã dòng đang mở ngăn. */
  dangXem: number | null;
  onMo: (row: R, noi?: NoiMoCongNo) => void;
  ngan?: ReactNode;
}) {
  const { data, the, tuoi, loc } = sp;
  const rows = data?.items ?? [];
  const tong = data?.tong_loc ?? null;
  // "Hạn sớm nhất" luôn đếm từ hôm nay. Còn nợ thì máy chủ tính tới CUỐI KỲ đang xem (đã chặn ở hôm
  // nay; kỳ đã qua ⇒ dư cuối kỳ của sổ) — "Còn nợ tới" đọc đúng mốc đó.
  const homNay = data?.as_of ?? homNayVN();
  const moc = data?.den_ngay ?? homNay;
  const coLoc = dangLocCongNo({ the, tuoi, tim: sp.timTre, loc });
  const sx = sapXepHienTai(sp.sx);
  const [boCot, setBoCot] = useState<BoCot>(docBoCot);
  const doiBoCot = (v: BoCot) => {
    setBoCot(v);
    ghiBoCot(v);
  };
  // Mỗi bộ cột nhớ cột ẩn / thứ tự riêng (khoá theo màn: phải trả / phải thu).
  const khoaMan = `cong-no:${ch.donVi}`;
  const luoiTuoi = useCauHinhLuoi(`${khoaMan}:tuoi`);
  const luoiKy = useCauHinhLuoi(`${khoaMan}:ky`);
  // Bộ cột đang xem không có cột đang sắp (Hạn sớm nhất chỉ ở Tuổi nợ, Trả / Thu gần nhất chỉ ở Trong kỳ)
  // ⇒ trả sắp xếp về mặc định, kẻo bảng sắp theo một cột không hiện mũi tên ở đâu cả.
  const cotSap = sp.sx?.cot;
  const boSapXep = sp.boSapXep;
  useEffect(() => {
    if ((boCot === "ky" && cotSap === "han") || (boCot === "tuoi" && cotSap === "gan_nhat")) boSapXep();
  }, [boCot, cotSap, boSapXep]);
  // Tải hỏng: nói một lần, trong dòng rỗng của lưới — câu lỗi của màn (kèm lời máy chủ nếu có) và luật
  // sống còn: số đang để trống, không phải bằng 0.
  const chuLoiDu = sp.loi ? (sp.loi === ch.chuLoi ? ch.chuLoi : `${ch.chuLoi} ${sp.loi}`) : null;

  const muc: MucLocNhanh[] = THE_CONG_NO.map(([id, nhan]) => ({
    key: id,
    label: nhan,
    mau: MAU_THE[id],
    count: sp.demThe?.[id],
  }));
  // "Trạng thái" trong nút Lọc = hàng lọc nhanh Tất cả / Quá hạn / Vượt hạn mức (đọc/ghi thẳng mục đang chọn).
  const dkDu: DieuKien<LocThanhCongNo>[] = [
    dkTheoTab<LocThanhCongNo>({
      tabs: THE_CONG_NO.map(([id, nhan]) => ({ id, nhan, so: sp.demThe?.[id] })),
      tatCa: "all",
      dang: the,
      dat: (id) => sp.setThe(id as TheCongNo),
    }),
    ...dieuKien,
  ];
  const mo = (row: R, noi: NoiMoCongNo = "all") => {
    if (ch.id(row) != null) onMo(row, noi);
  };
  const chuHet = ch.chuHet.toLocaleLowerCase("vi");
  const soKhoanCua = (row: R) => Object.values(row.aging ?? {}).reduce((s, c) => s + c.count, 0);

  // ---------- Hai bộ cột ----------
  const aging = data?.aging ?? [];
  const chuaToi = aging[0];
  const tre = aging.slice(1);
  const cotTuoi: CotCN[] = [
    { key: "ten", label: ch.nhanDoiTac, coDinh: true, w: 220 },
    { key: "khoan", label: ch.nhanKhoan, n: true, w: ch.rongKhoan },
    { key: "con_no", label: "Còn nợ", n: true, w: RONG_CON_NO, sx: "con_no" },
    { key: "chua_toi", label: chuaToi ? nhanMoc(chuaToi.label) : "Chưa tới hạn", n: true, w: RONG_TIEN },
    ...tre.map((b): CotCN => ({ key: `tre:${b.key}`, label: nhanMoc(b.label), n: true, w: 118 })),
    // Hạn sớm nhất: đo 08/10 "19/07/2026 trễ 81 ngày" 172px, chừa số ngày ba chữ số.
    { key: "han", label: "Hạn sớm nhất", w: 184, sx: "han" },
    { key: "han_muc", label: "Hạn mức", n: true, w: 84 },
    { key: "da_dung", label: "Đã dùng", n: true, w: 76 },
  ];
  const cotKy: CotCN[] = [
    { key: "ten", label: ch.nhanDoiTac, coDinh: true, w: 220 },
    { key: "khoan", label: ch.nhanKhoan, n: true, w: 70 },
    { key: "con_no", label: "Còn nợ", n: true, w: RONG_CON_NO, sx: "con_no" },
    { key: "them_ky", label: ch.nhanThemKy, n: true, w: RONG_TIEN },
    { key: "da_ky", label: ch.nhanDaKy, n: true, w: RONG_TIEN },
    { key: "gan_nhat", label: ch.nhanGanNhat, w: 130, sx: "gan_nhat" },
    { key: "tien_gan_nhat", label: "Số tiền", n: true, w: RONG_TIEN },
    { key: "cho_no", label: "Cho nợ", n: true, w: 86 },
    ...(ch.coPhuTrach ? [{ key: "phu_trach", label: "Phụ trách", w: 140 } as CotCN] : []),
    { key: "lien_he", label: "Người liên hệ", w: 150 },
    { key: "sdt", label: "Điện thoại", w: 120 },
  ];
  const cotDay = boCot === "tuoi" ? cotTuoi : cotKy;
  const luoi = boCot === "tuoi" ? luoiTuoi : luoiKy;
  const cotHien = luoi.rongHien(luoi.xep(cotDay).filter((c) => !luoi.an.has(c.key)));

  /** Ô của một dòng đối tác theo khoá cột. */
  const oDong = (c: CotCN, row: R) => {
    const ten = ch.ten(row);
    const choNo = ch.choNo(row);
    const ganNhat = ch.ganNhat(row);
    const lh = ch.lienHe(row);
    const daTra = ch.daTraTrongKy(row);
    const pt = row.credit_limit > 0 ? Math.round((row.total_due / row.credit_limit) * 100) : null;
    switch (c.key) {
      case "ten":
        return <td key={c.key} title={ten}>{ten}</td>;
      case "khoan":
        return <td key={c.key} className="n lds-mu">{soHoacGach(soKhoanCua(row))}</td>;
      case "con_no":
        return (
          <td key={c.key} className="n">
            {row.total_due > 0 ? soVN(row.total_due) : <span className="lds-mu3">{chuHet}</span>}
          </td>
        );
      case "chua_toi":
        return <td key={c.key} className="n">{soHoacGach(row.aging?.[chuaToi?.key ?? ""]?.amount ?? 0)}</td>;
      case "han":
        return <td key={c.key}><HanSom han={row.han_gan_nhat} homNay={homNay} conNo={row.total_due > 0} /></td>;
      case "han_muc":
        return (
          <td key={c.key} className="n">
            {row.credit_limit > 0 ? trieu(row.credit_limit) : <span className="lds-mu3">chưa đặt</span>}
          </td>
        );
      case "da_dung":
        return (
          <td key={c.key} className="n">
            {pt == null ? (
              <span className="lds-mu3">–</span>
            ) : (
              <span className={row.vuot_han_muc || pt > 100 ? "lds-do" : pt > 80 ? "lds-vang" : undefined}>
                {`${soVN(pt)}%`}
              </span>
            )}
          </td>
        );
      case "them_ky":
        return <td key={c.key} className="n">{soHoacGach(ch.themTrongKy(row))}</td>;
      case "da_ky":
        return (
          <td key={c.key} className="n">
            {daTra > 0 ? <NutSo onBam={() => mo(row, "paid")}>{soVN(daTra)}</NutSo> : soHoacGach(0)}
          </td>
        );
      case "gan_nhat":
        return (
          <td key={c.key}>{ganNhat ? ngay(ganNhat.ngay) : <span className="lds-mu3">{ch.chuChuaGanNhat}</span>}</td>
        );
      case "tien_gan_nhat":
        return <td key={c.key} className="n">{ganNhat ? soVN(ganNhat.tien) : null}</td>;
      case "cho_no":
        return (
          <td key={c.key} className="n">
            {choNo == null ? <span className="lds-mu3">chưa đặt</span> : choNo > 0 ? `${soVN(choNo)} ngày` : "trả ngay"}
          </td>
        );
      case "phu_trach":
        return <td key={c.key} title={lh.phuTrach || undefined}>{lh.phuTrach}</td>;
      case "lien_he":
        return <td key={c.key} title={lh.ten || undefined}>{lh.ten || <span className="lds-mu3">chưa có</span>}</td>;
      case "sdt":
        return <td key={c.key} className="lds-mu">{lh.sdt ? vietSdt(lh.sdt) : null}</td>;
      default: {
        // Cột mốc trễ: chữ đỏ khi có tiền, bấm mở ngăn lọc sẵn các khoản quá hạn.
        if (c.key.startsWith("tre:")) {
          const x = row.aging?.[c.key.slice(4)]?.amount ?? 0;
          if (x > 0) {
            return (
              <td key={c.key} className="n lds-do">
                <NutSo onBam={() => mo(row, "overdue")}>{soVN(x)}</NutSo>
              </td>
            );
          }
          return <td key={c.key} className="n">{soHoacGach(0)}</td>;
        }
        return <td key={c.key} />;
      }
    }
  };

  /** Ô của dòng Cộng (số máy chủ cộng trên cả bộ lọc) theo khoá cột; cột không có số thì ô trống. */
  const oCong = (c: CotCN, t: TongLocCongNo) => {
    switch (c.key) {
      case "khoan":
        return <td key={c.key} className="n">{soVN(t.so_khoan)}</td>;
      case "con_no":
        return <td key={c.key} className="n">{soVN(t.con_no)}</td>;
      case "chua_toi":
        return <td key={c.key} className="n">{soHoacGach(t.aging[chuaToi?.key ?? ""] ?? 0)}</td>;
      case "han":
        return <td key={c.key} className="lds-mu">{t.qua_han > 0 ? `quá hạn ${soVN(t.qua_han)}` : null}</td>;
      case "them_ky":
        return <td key={c.key} className="n">{soHoacGach(t.trong_ky_1)}</td>;
      case "da_ky":
        return <td key={c.key} className="n">{soHoacGach(t.trong_ky_2)}</td>;
      default:
        if (c.key.startsWith("tre:")) {
          const x = t.aging[c.key.slice(4)] ?? 0;
          return <td key={c.key} className={`n${x > 0 ? " lds-do" : ""}`}>{soHoacGach(x)}</td>;
        }
        return <td key={c.key} />;
    }
  };

  /** Tiêu đề: cột sắp được là nút của kit (`aria-sort` trên `th`), còn lại là chữ. Chiều đầu của mỗi cột
   *  do `sp.datSapXep` quyết (`CHIEU_DAU`: Hạn / Gần nhất tăng, Còn nợ giảm), nên nút chỉ báo "đã bấm"
   *  và kit chỉ lo vẽ nhãn + mũi tên theo chuỗi sort dựng từ `sx`. */
  const thCot = (c: CotCN) =>
    c.sx ? (
      <th
        key={c.key}
        className={c.n ? "n" : undefined}
        aria-sort={sx.cot === c.sx ? (sx.chieu === "asc" ? "ascending" : "descending") : "none"}
      >
        <TieuDeSapXep
          label={c.label}
          cot={c.sx}
          sort={sx.cot === c.sx ? (sx.chieu === "desc" ? `-${c.sx}` : c.sx) : ""}
          onSort={() => sp.datSapXep(c.sx!)}
        />
        {luoi.keo(c.key)}
      </th>
    ) : (
      <th key={c.key} className={c.n ? "n" : undefined}>{c.label}{luoi.keo(c.key)}</th>
    );

  const dongProps = (row: R) => {
    const id = ch.id(row);
    return {
      className: `lds-dong${id != null && id === dangXem ? " is-chon" : ""}`,
      tabIndex: id != null ? 0 : undefined,
      onClick: () => mo(row),
      onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => diChuyen(e, () => mo(row)),
    };
  };

  const total = data?.total ?? 0;

  return (
    <main className="kt-trang lds">
      {/* Hàng đầu (08/10/2026): tên màn + nút chuyển bộ cột dạng viên (đổi cả lưới, không phải bộ lọc nên
          không nằm trong thẻ lọc) + mốc của cột Còn nợ dạt phải. Thẻ lọc bên dưới chỉ còn tìm, lọc, Cột. */}
      <header className="lds-dau">
        <h1 className="lds-dau__ten">{ch.tieuDe}</h1>
        <div className="lds-xem" role="group" aria-label="Xem cột">
          {([["tuoi", "Tuổi nợ"], ["ky", "Trong kỳ và liên hệ"]] as const).map(([v, nhan]) => (
            <button key={v} type="button" aria-pressed={boCot === v}
              className={`lds-xem__nut${boCot === v ? " is-active" : ""}`} onClick={() => doiBoCot(v)}>
              {nhan}
            </button>
          ))}
        </div>
        {/* Tải hỏng thì câu lỗi nằm MỘT chỗ — dòng rỗng của lưới bên dưới. */}
        <div className="lds-dau__nut">
          {data ? <span className="lds-mu kt-cn-moc">{`Còn nợ tới ${ngay(moc)}`}</span> : null}
        </div>
      </header>

      <section className="lds-loc">
        <LocNhanhTrangThai muc={muc} dang={the} onChon={(k) => sp.setThe(k as TheCongNo)} />
        <div className="lds-loc__thanh tl-thanh" role="search">
          <OTim value={sp.tim} onChange={sp.setTim} placeholder={ch.goiYTim} ariaLabel={ch.nhanTim} />
          <ThanhLoc ky={sp.kyDS} moc={MOC_CONG_NO} onKy={sp.setKy} dieuKien={dkDu} loc={{ tuoi, loc }}
            onLoc={(l) => {
              sp.setTuoi(l.tuoi);
              sp.setLoc(l.loc);
            }} />
          <ChonCot cot={cotDay} {...luoi.chonCot} />
        </div>
      </section>

      <div className="lds-sheet" aria-busy={sp.loading || undefined}>
        <CuonLuoi ghim={luoi.soGhim(cotHien)}>
          <table className="lds-g" style={{ minWidth: rongLuoi(cotHien) }}>
            <colgroup>
              {cotHien.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
            </colgroup>
            <thead>
              <tr>{cotHien.map(thCot)}</tr>
            </thead>
            <tbody>
              {sp.loading && rows.length === 0 && !chuLoiDu ? (
                <EmptyRow colSpan={cotHien.length} trangThai="dang-tai" />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={cotHien.length} className="lds-trong">
                    {chuLoiDu ? (
                      <>
                        <span role="alert">
                          <span className="lds-do">{chuLoiDu}</span>{" "}
                          <span className="lds-mu">Các con số đang để trống, KHÔNG phải bằng 0.</span>
                        </span>{" "}
                        <button type="button" className="lds-lk" onClick={sp.load}>Thử lại</button>
                      </>
                    ) : coLoc ? (
                      <>
                        {`Không có ${ch.donVi} nào khớp điều kiện đang lọc.`}{" "}
                        <button type="button" className="lds-lk" onClick={sp.boLoc}>Xoá bộ lọc</button>
                      </>
                    ) : (
                      `${ch.chuChuaCo}.`
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={ch.id(row) ?? ch.ten(row)} {...dongProps(row)}>
                    {cotHien.map((c) => oDong(c, row))}
                  </tr>
                ))
              )}
              {/* Dòng Cộng: Σ của MỌI dòng khớp bộ lọc (máy chủ cộng `tong_loc`), không chỉ trang đang xem. */}
              {rows.length > 0 && tong ? (
                <tr className="lds-cong lds-nhom">
                  <td className="lead">
                    <span className="lds-dinh-trai">
                      {`Cộng ${soVN(tong.so_doi_tac)} ${ch.donVi}`}
                      {/* Cột Hạn sớm nhất bị ẩn: số quá hạn của dòng Cộng chuyển lên nhãn, không mất. */}
                      {boCot === "tuoi" && !cotHien.some((c) => c.key === "han") && tong.qua_han > 0 ? (
                        <span className="lds-mu">{`quá hạn ${soVN(tong.qua_han)}`}</span>
                      ) : null}
                    </span>
                  </td>
                  {cotHien.slice(1).map((c) => oCong(c, tong))}
                </tr>
              ) : null}
            </tbody>
          </table>
        </CuonLuoi>
        {total > 0 && (
          <PhanTrangDayDu trang={sp.page} size={sp.size} tong={total} soDong={rows.length}
            onTrang={sp.datTrang} onSize={sp.setSize} loading={sp.loading} donVi={ch.donVi} ariaLabel={ch.ariaPhanTrang} />
        )}
      </div>

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
