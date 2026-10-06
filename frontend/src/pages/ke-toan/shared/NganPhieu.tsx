/** Mảnh dùng chung của ngăn chi tiết PHIẾU (phiếu chi, phiếu thu — đặc tả A.5, PC-2, PC-6, PT-2):
 *  đường dẫn có nút chép mã, dòng "nhãn — giá trị", băng "Đã hủy", menu "⋯" và khung Hủy phiếu.
 *
 *  Hủy phiếu là KHUNG viền đỏ ở đầu tab Chi tiết, lỗi nằm ngay trong khung (không banner sau lớp
 *  phủ). Thiếu lý do thì lỗi dưới ô; lỗi máy chủ cũng hiện trong khung.
 */
import { ArrowRight, Ban, Check, ChevronRight, CircleAlert, Copy, Ellipsis, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ApiError } from "../../../api/client";
import { amountInWords } from "../../../utils/format";
import { Cum, TheNho } from "./Cum";
import { ngay, tien, vietSo } from "./dinhDang";

/** Tab đang xem của ngăn từng màn — nhớ tới khi đóng trang (đặc tả A.5): mở phiếu khác vẫn ở đúng
 *  tab đó. Khoá theo màn ("phieu-chi", "phieu-thu"…). */
const TAB_NHO = new Map<string, string>();

export function useTabNho(khoa: string, macDinh = "tt"): [string, (t: string) => void] {
  const [tab, setTabTho] = useState(() => TAB_NHO.get(khoa) ?? macDinh);
  const setTab = (t: string) => {
    TAB_NHO.set(khoa, t);
    setTabTho(t);
  };
  return [tab, setTab];
}

/** "Vietcombank 0281000456789" — thiếu cả hai thì "—". */
export function soTaiKhoan(nganHang: string | null, so: string | null): string {
  return [nganHang, so].filter(Boolean).join(" ") || "—";
}

/** Số tiền lớn đầu ngăn: số VND + bằng chữ; ngoại tệ thì thẻ [USD 1.200] + "tỷ giá …" (không ghi
 *  "quy đổi" khi đã là VND). */
export function SoLonPhieu({ soVnd, so, tienTe, tyGia }: { soVnd: number; so: number; tienTe: string; tyGia: number }) {
  return (
    <>
      <span className="kt-ngan__tien">{tien(soVnd)}</span>
      {tienTe !== "VND" ? (
        <Cum className="kt-ngan__chu">
          <TheNho>{`${tienTe} ${vietSo(so)}`}</TheNho>
          <span>{`tỷ giá ${vietSo(tyGia)}`}</span>
        </Cum>
      ) : (
        <span className="kt-ngan__chu">{amountInWords(soVnd)}</span>
      )}
    </>
  );
}

/** Một đầu của tuyến tiền trong biên lai: vai ("Từ", "Tới"), tên, và các mẩu phụ (ngân hàng, số
 *  tài khoản, chi nhánh, địa chỉ) — mỗi mẩu một ô riêng, không nối bằng dấu. */
export type DauTuyen = { vai: string; ten: ReactNode; phu?: ReactNode[] };

/** Thẻ BIÊN LAI đầu ngăn phiếu (phương án B, docs/mockups/phieu-chi-ngan-chi-tiet-3-phuong-an.html —
 *  khuôn lệnh chuyển của Wise / biên lai app ngân hàng): dòng "Chuyển khoản ngày …", số tiền lớn +
 *  bằng chữ, rồi tuyến hai điểm Từ → Tới nối bằng một vạch. Thay số lớn + dải tóm tắt 4 ô + hộp
 *  "Dòng tiền": số tiền nói MỘT lần, tên người nhận không lặp ba chỗ. */
export function BienLaiPhieu({ dongDau, soVnd, so, tienTe, tyGia, tu, toi }: {
  dongDau: ReactNode;
  soVnd: number;
  so: number;
  tienTe: string;
  tyGia: number;
  tu: DauTuyen;
  toi: DauTuyen;
}) {
  const diem = (d: DauTuyen, cuoi: boolean) => (
    <div className={`kt-bl__diem${cuoi ? " kt-bl__diem--toi" : ""}`}>
      <span className="kt-bl__vai">{d.vai}</span>
      <b className="kt-bl__ten">{d.ten}</b>
      {d.phu && d.phu.some(Boolean) && <Cum className="kt-bl__phu">{d.phu.filter(Boolean).map((x, i) => <Fragment key={i}>{x}</Fragment>)}</Cum>}
    </div>
  );
  return (
    <section className="kt-bl" aria-label="Biên lai">
      <div className="kt-bl__so">
        <span className="kt-bl__dau">{dongDau}</span>
        <div className="kt-ngan__so">
          <SoLonPhieu soVnd={soVnd} so={so} tienTe={tienTe} tyGia={tyGia} />
        </div>
      </div>
      {/* Tuyến NẰM NGANG: Từ ▸ Tới cùng một hàng — xếp dọc thì thẻ cao gấp đôi mà hai bên trống. */}
      <div className="kt-bl__tuyen">
        {diem(tu, false)}
        <span className="kt-bl__mui" aria-hidden="true"><ArrowRight size={16} /></span>
        {diem(toi, true)}
      </div>
    </section>
  );
}

export type OThongTin = { nhan: string; giaTri: ReactNode; rong?: boolean };

/** Lưới thông tin hai cột của tab Chi tiết (nhãn nhỏ trên, giá trị dưới — khuôn tóm tắt chứng từ
 *  của Xero): dày hơn danh sách một cột mà không phải đóng hộp. Ô trống không hiện. */
export function LuoiThongTin({ o }: { o: OThongTin[] }) {
  const con = o.filter((x) => x.giaTri != null && x.giaTri !== "" && x.giaTri !== false);
  if (con.length === 0) return null;
  return (
    <dl className="kt-ltt">
      {con.map((x) => (
        <div key={x.nhan} className={x.rong ? "kt-ltt__o kt-ltt__o--rong" : "kt-ltt__o"}>
          <dt>{x.nhan}</dt>
          <dd>{x.giaTri}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Dải bốn số của đợt / hoá đơn mà phiếu áp vào: Giá trị — Trừ cọc — Phiếu này — Còn nợ. */
export function TienDot({ o }: { o: { nhan: string; so: number }[] }) {
  return (
    <div className="kt-tien-dot">
      {o.map((x) => (
        <div key={x.nhan}><span>{x.nhan}</span><b>{vietSo(x.so)}</b></div>
      ))}
    </div>
  );
}

/** Đường dẫn đầu ngăn: "Phiếu chi > PC-…" + nút chép mã. */
export function DuongDanPhieu({ loai, ma }: { loai: string; ma: string }) {
  const [daChep, setDaChep] = useState(false);
  function chepMa() {
    void navigator.clipboard?.writeText(ma).then(
      () => {
        setDaChep(true);
        window.setTimeout(() => setDaChep(false), 1500);
      },
      () => undefined,
    );
  }
  return (
    <>
      {loai}
      <ChevronRight size={14} aria-hidden="true" />
      <span>{ma}</span>
      <button type="button" className="kt-ic" aria-label={daChep ? "Đã chép mã phiếu" : "Chép mã phiếu"}
        title={daChep ? "Đã chép" : "Chép mã phiếu"} onClick={chepMa}>
        {daChep ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      </button>
    </>
  );
}

/** Một dòng "nhãn — giá trị" của khối Thông tin phiếu; ô trống không hiện dòng. */
export function Dong({ nhan, children }: { nhan: string; children: ReactNode }) {
  if (children == null || children === "" || children === false) return null;
  return (
    <>
      <dt>{nhan}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** Băng xám "Đã hủy ngày …, lý do: …" — một lần, mọi tab đều thấy. */
export function BangDaHuy({ moc, lyDo }: { moc: string | null; lyDo: string | null }) {
  return (
    <div className="kt-bang-xam">
      <Ban size={16} aria-hidden="true" />
      <span>
        {`Đã hủy ngày ${ngay(moc)}`}
        {lyDo ? `, lý do: ${lyDo}` : ""}
      </span>
    </div>
  );
}

export type MucMenu = {
  nhan: string;
  /** Dòng phụ: hệ quả, hoặc lý do không làm được khi `khoa`. */
  phu: string;
  nguy?: boolean;
  khoa?: boolean;
  onChon: () => void;
};

/** Nút "⋯ Thao tác khác" + menu. Bấm ngoài thì đóng; Esc chỉ đóng menu (không đóng cả ngăn). */
export function MenuThaoTac({ muc }: { muc: MucMenu[] }) {
  const [mo, setMo] = useState(false);
  const nut = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => {
      if (!(e.target instanceof Node) || !nut.current?.parentElement?.contains(e.target)) setMo(false);
    };
    document.addEventListener("mousedown", dong);
    return () => document.removeEventListener("mousedown", dong);
  }, [mo]);
  return (
    <span onKeyDown={(e) => {
      if (e.key === "Escape" && mo) {
        e.preventDefault();
        setMo(false);
        nut.current?.focus();
      }
    }}>
      <button ref={nut} type="button" className="kt-btn kt-btn--ic" aria-label="Thao tác khác" title="Thao tác khác"
        aria-haspopup="menu" aria-expanded={mo} onClick={() => setMo((m) => !m)}>
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {mo && (
        <div className="kt-menu" role="menu">
          {muc.map((m) => (
            <button key={m.nhan} type="button" role="menuitem" className={m.nguy ? "kt-nguy" : undefined} disabled={m.khoa}
              onClick={() => {
                setMo(false);
                m.onChon();
              }}>
              <span>{m.nhan}</span>
              <small>{m.phu}</small>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** Trạng thái khung Hủy phiếu. `goiHuy` gọi máy chủ; xong thì `onXong` nhận phiếu đã hủy.
 *  `goiHuy` null (chưa có token) ⇒ bấm Hủy không gọi gì, như bản cũ. */
export function useHuyPhieu<T>(goiHuy: ((lyDo: string) => Promise<T>) | null, onXong: (p: T) => void) {
  const [mo, setMo] = useState(false);
  const [lyDo, setLyDoTho] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangHuy, setDangHuy] = useState(false);

  const setLyDo = (v: string) => {
    setLyDoTho(v);
    if (loi) setLoi(null);
  };

  async function xacNhan() {
    if (!goiHuy) return;
    if (!lyDo.trim()) {
      setLoi("Ghi lý do để người xem sổ sau này hiểu vì sao phiếu bị hủy.");
      return;
    }
    setDangHuy(true);
    setLoi(null);
    try {
      const p = await goiHuy(lyDo.trim());
      setMo(false);
      setLyDoTho("");
      onXong(p);
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không hủy được phiếu.");
    } finally {
      setDangHuy(false);
    }
  }

  return {
    mo,
    lyDo,
    loi,
    dangHuy,
    setLyDo,
    xacNhan,
    moKhung: () => {
      setMo(true);
      setLoi(null);
    },
    dong: () => setMo(false),
    /** Đổi sang phiếu khác: bỏ khung đang dở. */
    datLai: () => {
      setMo(false);
      setLyDoTho("");
      setLoi(null);
    },
    /** Đã gõ lý do — đóng ngăn phải hỏi trước. */
    goDo: () => mo && lyDo.trim() !== "",
  };
}

/** Khung viền đỏ "Hủy phiếu …" ở đầu tab Chi tiết (đặc tả PC-6, PT-2). */
export function KhungHuyPhieu({ ma, ghi, huy }: {
  ma: string;
  /** Câu hệ quả, vd "Phiếu vẫn còn trong sổ với dấu Đã hủy, in ra có chữ ĐÃ HỦY. Cần chi lại thì lập phiếu mới." */
  ghi: string;
  huy: ReturnType<typeof useHuyPhieu<unknown>>;
}) {
  return (
    <section className="kt-khung kt-khung--do" aria-label={`Hủy phiếu ${ma}`}>
      <h3>
        <Ban size={18} className="kt-do" aria-hidden="true" />
        {`Hủy phiếu ${ma}`}
        <button type="button" className="kt-ic" aria-label="Đóng khung hủy" title="Đóng" onClick={huy.dong}>
          <X size={16} aria-hidden="true" />
        </button>
      </h3>
      <p className="kt-ghi">{ghi}</p>
      <div className={`kt-o${huy.loi ? " kt-o--loi" : ""}`}>
        <label htmlFor="kt-ly-do-huy">Lý do hủy <em className="kt-bb">*</em></label>
        <textarea id="kt-ly-do-huy" autoFocus value={huy.lyDo} placeholder="VD: Ghi nhầm số tiền nên lập lại phiếu đúng"
          aria-invalid={huy.loi ? true : undefined}
          onChange={(e) => huy.setLyDo(e.target.value)} />
        {huy.loi && (
          <span className="kt-o__loi" role="alert">
            <CircleAlert size={14} aria-hidden="true" />
            {huy.loi}
          </span>
        )}
      </div>
      <div className="kt-khung__nut">
        <button type="button" className="kt-btn kt-btn--tron" onClick={huy.dong}>Đóng</button>
        <button type="button" className="kt-btn kt-btn--do" disabled={huy.dangHuy} onClick={() => void huy.xacNhan()}>
          {huy.dangHuy ? "Đang hủy…" : "Hủy phiếu"}
        </button>
      </div>
    </section>
  );
}
