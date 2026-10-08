/** Vỏ NGĂN chi tiết dùng chung hai màn công nợ (phải trả NPT-2, phải thu NPTh-2 — đặc tả E "đối xứng
 *  tuyệt đối"), dựng trên `NganPhai`. Bố cục KIỂU 3 (docs/mockups/ke-toan-gon-3-phuong-an.html,
 *  07/10/2026): nội dung tab bên trái, cột thuộc tính xếp dọc bên phải.
 *
 *  Đầu ngăn: "{màn} > {đối tác}" — tên + thẻ mã — nút "In sao kê" và hồ sơ đối tác — hàng tab. Không
 *  còn dải số đầu ngăn: còn nợ, quá hạn, hạn sớm nhất, hạn mức, cho nợ, người liên hệ nằm ở cột
 *  thuộc tính (`oRayCongNo`), mỗi số nói một lần. Thân: khối lỗi kèm "Tải lại", câu đang tải, câu báo
 *  máy chủ cũ hơn giao diện, rồi tới nội dung tab của màn.
 */
import { ChevronRight, ExternalLink, Printer } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { soNgay } from "../../../utils/ky";
import { TheNho } from "./Cum";
import { ngay, tien, vietSo } from "./dinhDang";
import type { ORay } from "./LuoiGon";
import { NganPhai } from "./NganPhai";
import { vietSdt } from "./oCongNo";

/** Phần chi tiết một đối tác mà cột thuộc tính cần (chung hai màn). */
export type TongNganCongNo = {
  total_due: number;
  overdue_amount: number;
  credit_limit: number;
  vuot_han_muc: boolean;
  /** Ngày máy chủ tính nợ (hôm nay). */
  as_of: string;
  lien_he_ten?: string | null;
  lien_he_sdt?: string | null;
};

/** "trễ N ngày" (đỏ) / "còn N ngày" / "tới hạn hôm nay" của một hạn so với ngày máy chủ tính nợ. */
export function ChuHan({ han, homNay, gon = false, lop = { do: "kt-do", mo: "kt-mo", vang: "kt-ncn-vang" } }: {
  han: string;
  homNay: string;
  /** Ô hạn của lưới (152px): bỏ chữ "ngày" ("trễ 81", "còn 14"), tới hạn chỉ nói "tới hạn" — để bảng
   *  ngăn vừa khung 820px mà số không bị "…" cắt (đo 08/10). Chữ đủ nằm ở `title` của ô (`chuHanDu`)
   *  và ở cột thuộc tính. */
  gon?: boolean;
  /** Lớp màu: trong lưới `.lds-g` dùng `lds-do` / `lds-mu` / `lds-vang`. */
  lop?: { do: string; mo: string; vang: string };
}) {
  const d = soNgay(homNay, han);
  const ngayChu = (n: number) => (gon ? vietSo(n) : `${vietSo(n)} ngày`);
  if (d < 0) return <span className={`kt-ncn-ben ${lop.do}`}>{`trễ ${ngayChu(-d)}`}</span>;
  if (d === 0) return <span className={`kt-ncn-ben ${lop.vang}`}>{gon ? "tới hạn" : "tới hạn hôm nay"}</span>;
  return <span className={`kt-ncn-ben ${lop.mo}`}>{`còn ${ngayChu(d)}`}</span>;
}

/** Chữ đủ của một hạn ("20/08/2026 trễ 46 ngày") — `title` cho ô hạn hẹp. */
export function chuHanDu(han: string, homNay: string): string {
  const d = soNgay(homNay, han);
  return `${ngay(han)} ${d < 0 ? `trễ ${vietSo(-d)} ngày` : d === 0 ? "tới hạn hôm nay" : `còn ${vietSo(d)} ngày`}`;
}

/** Mục 1–5 của cột thuộc tính (đặc tả Task 8): còn nợ, quá hạn, hạn sớm nhất, hạn mức + cho nợ,
 *  người liên hệ. Mục riêng của từng màn (tài khoản nhận tiền / phụ trách) màn tự nối sau. */
export function oRayCongNo({
  tong,
  hanCacKhoan,
  choNo,
  sauNgay,
  chuCanh,
  onDatHoSo,
}: {
  tong: TongNganCongNo;
  /** Hạn của các khoản CÒN nợ (> 0) — lấy hạn nhỏ nhất; khoản chưa có hạn truyền null. */
  hanCacKhoan: (string | null)[];
  /** Số ngày cho nợ; null = chưa đặt, 0 = trả ngay. */
  choNo: number | null;
  /** "sau mỗi đợt giao" / "sau mỗi hoá đơn". */
  sauNgay: string;
  /** Câu giải thích khi vượt hạn mức (tooltip) — vd "Chỉ là cảnh báo, vẫn đặt mua được." */
  chuCanh: string;
  /** Cùng hành vi nút hồ sơ đối tác; không có = không có quyền xem hồ sơ. */
  onDatHoSo?: () => void;
}): ORay[] {
  const han = hanCacKhoan.filter((h): h is string => !!h).sort()[0] ?? null;
  const hm = tong.credit_limit > 0 ? tong.credit_limit : 0;
  const coDieuKhoan = hm > 0 || choNo != null;
  const pt = hm > 0 ? Math.round((tong.total_due / hm) * 100) : 0;
  const lopPt = tong.vuot_han_muc || pt > 100 ? "kt-do" : pt > 80 ? "kt-ncn-vang" : "kt-mo";
  const sdt = tong.lien_he_sdt ? vietSdt(tong.lien_he_sdt) : null;

  return [
    { nhan: `Còn nợ tới ${ngay(tong.as_of)}`, giaTri: <span style={{ fontSize: 18 }}>{tien(tong.total_due)}</span> },
    { nhan: "Quá hạn", giaTri: tong.overdue_amount > 0 ? <span className="kt-do">{tien(tong.overdue_amount)}</span> : "không có" },
    {
      nhan: "Hạn sớm nhất",
      giaTri: han && (
        <>
          <span>{ngay(han)}</span>
          <ChuHan han={han} homNay={tong.as_of} />
        </>
      ),
    },
    ...(coDieuKhoan
      ? [
          {
            nhan: "Hạn mức",
            giaTri:
              hm > 0 ? (
                <>
                  {tien(hm)}
                  {tong.total_due > 0 && (
                    <span className={`kt-ncn-ben ${lopPt}`} title={tong.vuot_han_muc ? chuCanh : undefined}>
                      {`đã dùng ${vietSo(pt)}%`}
                    </span>
                  )}
                </>
              ) : (
                "chưa đặt"
              ),
          },
          {
            nhan: "Cho nợ",
            // 0 và "chưa đặt" là HAI ca khác hẳn — gộp là hiểu sai cả cột Quá hạn.
            giaTri: choNo == null ? "chưa đặt" : choNo === 0 ? "trả ngay, không cho nợ" : `${vietSo(choNo)} ngày ${sauNgay}`,
          },
        ]
      : [
          {
            nhan: "Hạn mức và cho nợ",
            giaTri: (
              <>
                chưa đặt
                {onDatHoSo && (
                  <button type="button" className="kt-lk kt-ncn-ben" onClick={onDatHoSo}>
                    Đặt trong hồ sơ
                  </button>
                )}
              </>
            ),
          },
        ]),
    {
      nhan: "Người liên hệ",
      giaTri: (tong.lien_he_ten || sdt) && (
        <>
          {tong.lien_he_ten}
          {sdt && <span className={tong.lien_he_ten ? "kt-ncn-ben kt-mo" : "kt-mo"}>{sdt}</span>}
        </>
      ),
    },
  ];
}

/** Hàng đầu tab Còn nợ (`.kt-ngan__muc`): câu nói đang nhóm / xếp thế nào bên trái, nhóm hai nút
 *  đổi cách xếp bên phải (nút đang chọn có viền, không tô nền đậm). */
export function HangXep<T extends string>({
  chu,
  giaTri,
  luaChon,
  onDoi,
}: {
  chu: string;
  giaTri: T;
  luaChon: [T, string][];
  onDoi: (v: T) => void;
}) {
  return (
    <div className="kt-ngan__muc">
      <span>{chu}</span>
      <div className="kt-dai-tab" role="group" aria-label="Xếp theo">
        {luaChon.map(([v, nhan]) => (
          <button key={v} type="button" aria-pressed={v === giaTri} className={v === giaTri ? "on" : undefined}
            onClick={() => onDoi(v)}>
            {nhan}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ô tiền của lưới ngăn công nợ: 0 ⇒ gạch mờ (không có gì), không phải "0". */
export function OTien({ so }: { so: number }) {
  return so > 0 ? <>{vietSo(so)}</> : <span className="lds-mu3">–</span>;
}

export function NganCongNo({
  nhanMan,
  nhanDoiTac,
  tieuDe,
  ma,
  coSo,
  nutHoSo,
  onInSaoKe,
  loi,
  loading,
  thieu,
  chuThieu,
  onTaiLai,
  children,
  ...vo
}: {
  /** "Công nợ phải trả" / "Công nợ phải thu". */
  nhanMan: string;
  /** "Nhà cung cấp" / "Khách hàng". */
  nhanDoiTac: string;
  tieuDe: string;
  /** Mã khách / mã NCC — thẻ dưới tên; không có thì thôi. */
  ma?: string | null;
  /** Đã có số (tải xong, đúng dạng) — In sao kê mới bấm được, câu "đang tải" thôi hiện. */
  coSo: boolean;
  /** Nút "Hồ sơ …"; không có = không có quyền xem hồ sơ. */
  nutHoSo?: { nhan: string; onMo: () => void };
  onInSaoKe: () => void;
  loi: string | null;
  loading: boolean;
  /** Có câu trả lời nhưng thiếu phần ngăn cần (máy chủ cũ hơn giao diện). */
  thieu: boolean;
  chuThieu: string;
  onTaiLai: () => void;
  children: ReactNode;
} & Pick<ComponentProps<typeof NganPhai>, "tabs" | "tab" | "onTab" | "len" | "xuong" | "onDong" | "chan" | "chanToi" | "chanDong" | "cot">) {
  return (
    <NganPhai
      {...vo}
      duongDan={
        <>
          {nhanMan}
          <ChevronRight size={14} aria-hidden="true" />
          {nhanDoiTac}
        </>
      }
      tieuDe={tieuDe}
      phuDe={ma ? <TheNho>{ma}</TheNho> : undefined}
      hanhDong={
        <>
          <button type="button" className="kt-btn kt-btn--nho" onClick={onInSaoKe} disabled={!coSo}>
            <Printer size={14} aria-hidden="true" />
            In sao kê
          </button>
          {nutHoSo && (
            <button type="button" className="kt-btn kt-btn--nho" onClick={nutHoSo.onMo}>
              <ExternalLink size={14} aria-hidden="true" />
              {nutHoSo.nhan}
            </button>
          )}
        </>
      }
    >
      {loi && (
        <div className="kt-khung kt-khung--do" role="alert">
          <p className="kt-ghi">{loi}</p>
          <div className="kt-khung__nut">
            <button type="button" className="kt-btn kt-btn--nho" onClick={onTaiLai}>Tải lại</button>
          </div>
        </div>
      )}
      {loading && !coSo && !thieu && !loi && <p className="kt-mo">Đang tải chi tiết công nợ…</p>}
      {thieu && (
        <p className="kt-canh" role="alert">
          {chuThieu}
        </p>
      )}
      {children}
    </NganPhai>
  );
}
