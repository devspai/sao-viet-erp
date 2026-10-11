// Tab "Báo cáo lỗi" của màn KCS — đọc từ `GET /kcs/bao-cao`. Một màn, hai dạng xem (11/10/2026, mockup
// `docs/mockups/kcs-bao-cao-loi-bang-va-bieu-do.html`):
//
// Thanh lọc cùng khuôn tab Lệnh (ô tìm, kỳ theo ngày kiểm, nút Lọc khách / công đoạn), ba cách xem (theo
// công đoạn GÂY lỗi, theo tổ chịu, theo tiêu chí) và nút Bảng | Biểu đồ (máy nhớ theo người xem). Hàng số
// chung có so với kỳ trước liền kề cùng độ dài. Bảng: bảng ngày / bảng tiêu chí, bấm một dòng là lọc.
// Biểu đồ: `KcsBaoCaoBieuDo`, bấm thanh hay cột ngày là lọc. Cả hai dạng chung bảng "Các lần ghi lỗi"
// phân trang ở máy chủ. Bấm-lọc chỉ thu hẹp phần lỗi; hàng số theo thanh lọc. Lọc và số đều ở máy chủ.
import { useState } from "react";
import { createPortal } from "react-dom";
import { anhNho, type SxKcsBaoCao, type SxKcsChieu, type SxKcsLanLoi, type SxKcsNhietDong } from "../../api/client";
import { XemTruoc } from "../../components/DinhKemTep";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icons";
import { ChonCot, CuonLuoi, OTim, rongLuoi, useCauHinhLuoi, type CotLuoi } from "../../components/LuoiDs";
import { PhanTrangDayDu } from "../../components/PhanTrangDayDu";
import type { TepXem } from "../../components/tepDinhKem";
import { ngayGio, num } from "../keHoachSxShared";
import { dieuKienBcKcs, MOC_BC_KCS, type LocBcKcs } from "../loc-san-xuat/dieu-kien-kcs";
import { nhanChang } from "../lsxBuoc";
import { ThanhLoc } from "../thanh-loc/ThanhLoc";
import type { KyDS } from "../thanh-loc/ky-danh-sach";
import { KcsBaoCaoBieuDo, NHAN_CHIEU, type ChonBcKcs } from "./KcsBaoCaoBieuDo";

export type { ChonBcKcs };

const CACH_XEM: [SxKcsChieu, string][] = [
  ["cong_doan", "Theo công đoạn"],
  ["to", "Theo tổ"],
  ["tieu_chi", "Theo tiêu chí"],
];

type Dang = "bang" | "bieu_do";
const KHOA_DANG = "kcs-bc-dang";
function docDang(): Dang {
  try {
    return localStorage.getItem(KHOA_DANG) === "bang" ? "bang" : "bieu_do";
  } catch {
    return "bieu_do";
  }
}

interface CotBc extends CotLuoi { w?: number; n?: boolean; title?: string }

/** Cột cố định của bảng ngày; cột ngày (hoặc tháng) do máy chủ trả, luôn nằm giữa và trước "Cộng". */
const cotNgay = (tenCot: string, coLenh: boolean): CotBc[] => [
  { key: "ten", label: tenCot, coDinh: true, w: coLenh ? 220 : 240 },
  ...(coLenh ? [{ key: "lenh", label: "Lệnh", w: 116 }] : []),
  { key: "don_vi", label: "Đơn vị", w: 84 },
  { key: "lan", label: "Lần", w: 64, n: true, title: "Số lần ghi lỗi" },
  { key: "cong", label: "Cộng", w: 84, n: true },
];
const RONG_O_NGAY = 56;

const COT_TC: CotBc[] = [
  { key: "ten", label: "Tiêu chí", coDinh: true, w: 260 },
  { key: "cong_doan", label: "Công đoạn", w: 200 },
  { key: "lenh", label: "Lệnh", w: 116 },
  { key: "to", label: "Tổ chịu", w: 180 },
  { key: "lan", label: "Lần ghi lỗi", w: 100, n: true, title: "Số lần ghi lỗi gắn tiêu chí này" },
  { key: "loi_cd", label: "Lỗi ghi ở công đoạn", w: 150, n: true, title: "Số lỗi KCS tick theo tiêu chí ngay ở công đoạn đó" },
  { key: "lan_xet", label: "Lần xét", w: 90, n: true, title: "Số lần kiểm bước cuối xét tiêu chí" },
  { key: "hong", label: "Hỏng", w: 80, n: true },
  { key: "ty_le", label: "Tỷ lệ hỏng" },
];

const COT_LAN: CotBc[] = [
  { key: "luc", label: "Lúc", coDinh: true, w: 128 },
  { key: "lenh", label: "Lệnh", w: 116 },
  { key: "khach", label: "Khách hàng", w: 190 },
  { key: "cong_doan", label: "Công đoạn gây lỗi", w: 190 },
  { key: "tieu_chi", label: "Tiêu chí hoặc mô tả", w: 240 },
  { key: "bat", label: "Bắt ở", w: 180 },
  { key: "so", label: "Số lỗi", w: 110, n: true },
  { key: "to", label: "Tổ chịu", w: 170 },
  { key: "anh", label: "Ảnh", w: 96 },
  { key: "nguoi", label: "Người ghi", w: 140 },
];

function phanTram(tyLe: number): string {
  return `${(tyLe * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

/** Bậc màu của một ô so với ô lớn nhất cùng dòng. */
function bac(v: number, max: number): string {
  if (!v || max <= 0) return "";
  const r = v / max;
  return r > 0.6 ? " is-h3" : r > 0.25 ? " is-h2" : " is-h1";
}

type Luoi = ReturnType<typeof useCauHinhLuoi>;

function BangNgay({ data, dong, cot, luoi, trong, chon, onChon }: {
  data: SxKcsBaoCao; dong: SxKcsNhietDong[]; cot: CotBc[]; luoi: Luoi; trong: React.ReactNode;
  chon: string | undefined; onChon: (ten: string) => void;
}) {
  const ngay = data.nhiet_cot;
  if (dong.length === 0) return <p className="kcsb-trong">{trong}</p>;
  const dau = cot.filter((c) => c.key !== "cong");
  const cuoi = cot.filter((c) => c.key === "cong");
  const th = (c: CotBc) => (
    <th key={c.key} className={c.n ? "n" : undefined} title={c.title}>{c.label}{luoi.keo(c.key)}</th>
  );
  const o = (c: CotBc, r: SxKcsNhietDong) => {
    switch (c.key) {
      case "ten": return <td key={c.key} title={r.ten}>{r.ten || "—"}</td>;
      case "lenh": return <td key={c.key} className="lds-mu">{r.lsx_ma ?? "—"}</td>;
      case "don_vi": return <td key={c.key} className="lds-mu">{nhanChang(r.don_vi) || "—"}</td>;
      case "lan": return <td key={c.key} className="n">{num(r.lan)}</td>;
      default: return <td key={c.key} className="n lds-do">{num(r.tong)}</td>;
    }
  };
  return (
    <CuonLuoi ghim={1}>
      <table className="lds-g kcsb-nhiet" style={{ minWidth: rongLuoi(cot) + ngay.length * RONG_O_NGAY }}>
        <colgroup>
          {dau.map((c) => <col key={c.key} style={{ width: c.w }} />)}
          {ngay.map((c) => <col key={c.khoa} />)}
          {cuoi.map((c) => <col key={c.key} style={{ width: c.w }} />)}
        </colgroup>
        <thead>
          <tr>
            {dau.map(th)}
            {ngay.map((c) => <th key={c.khoa} className="c">{c.nhan}</th>)}
            {cuoi.map(th)}
          </tr>
        </thead>
        <tbody>
          {dong.map((r, i) => {
            const max = Math.max(0, ...Object.values(r.o));
            return (
              <tr key={i} className={`kcsb-bam${chon === r.ten ? " is-chon" : ""}`} onClick={() => onChon(r.ten)}
                title={chon === r.ten ? "Bấm để bỏ chọn" : "Bấm để lọc theo dòng này"}>
                {dau.map((c) => o(c, r))}
                {ngay.map((c) => {
                  const v = r.o[c.khoa] ?? 0;
                  return <td key={c.khoa} className={`c kcsb-nhiet__o${bac(v, max)}`}>{v ? num(v) : ""}</td>;
                })}
                {cuoi.map((c) => o(c, r))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </CuonLuoi>
  );
}

type DongTc = SxKcsBaoCao["tieu_chi"][number];

function OTieuChi({ cot, r }: { cot: string; r: DongTc }) {
  switch (cot) {
    case "ten": return <td title={r.ten}>{r.ten}</td>;
    case "cong_doan": return <td className="lds-mu" title={r.cong_doan}>{r.cong_doan}</td>;
    case "lenh": return <td className="lds-mu">{r.lsx_ma ?? "—"}</td>;
    case "to": return <td className="lds-mu" title={r.to_ten ?? undefined}>{r.to_ten ?? "—"}</td>;
    case "lan": return <td className={`n ${r.lan ? "lds-do" : "lds-mu3"}`}>{num(r.lan)}</td>;
    case "loi_cd":
      return (
        <td className={`n ${r.loi_o_cong_doan ? "lds-do" : "lds-mu3"}`}>
          {r.loi_o_cong_doan ? `${num(r.loi_o_cong_doan)} ${nhanChang(r.don_vi)}` : "0"}
        </td>
      );
    case "lan_xet": return <td className="n">{num(r.lan_xet)}</td>;
    case "hong": return <td className={`n ${r.hong ? "lds-do" : "lds-mu3"}`}>{num(r.hong)}</td>;
    default: {
      const p = r.lan_xet > 0 ? Math.round((r.hong / r.lan_xet) * 100) : 0;
      return (
        <td>
          {r.hong
            ? <><span className="kcsb-vach" style={{ width: Math.max(4, p * 1.4) }} /><span className="lds-do">{p}%</span></>
            : <span className="lds-mu3">0%</span>}
        </td>
      );
    }
  }
}

function BangTieuChi({ data, cot, luoi, trong, chon, onChon }: {
  data: SxKcsBaoCao; cot: CotBc[]; luoi: Luoi; trong: React.ReactNode;
  chon: string | undefined; onChon: (ten: string) => void;
}) {
  const ds = data.tieu_chi;
  if (ds.length === 0) return <p className="kcsb-trong">{trong}</p>;
  const tong = {
    lan: ds.reduce((s, r) => s + r.lan, 0),
    lan_xet: ds.reduce((s, r) => s + r.lan_xet, 0),
    hong: ds.reduce((s, r) => s + r.hong, 0),
  };
  return (
    <CuonLuoi ghim={luoi.soGhim(cot)}>
      <table className="lds-g" style={{ minWidth: rongLuoi(cot) }}>
        <colgroup>
          {cot.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            {cot.map((c) => (
              <th key={c.key} className={c.n ? "n" : undefined} title={c.title}>{c.label}{luoi.keo(c.key)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ds.map((r, i) => (
            <tr key={i} className={`kcsb-bam${chon === r.ten ? " is-chon" : ""}`} onClick={() => onChon(r.ten)}
              title={chon === r.ten ? "Bấm để bỏ chọn" : "Bấm để lọc theo tiêu chí này"}>
              {cot.map((c) => <OTieuChi key={c.key} cot={c.key} r={r} />)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="lds-cong">
            {cot.map((c) => c.key === "ten"
              ? <td key={c.key}>{ds.length} tiêu chí trong kỳ</td>
              : c.key === "lan" || c.key === "lan_xet" || c.key === "hong"
                ? <td key={c.key} className="n">{num(tong[c.key])}</td>
                : <td key={c.key} />)}
          </tr>
        </tfoot>
      </table>
    </CuonLuoi>
  );
}

function OLan({ cot, r, onXem }: { cot: string; r: SxKcsLanLoi; onXem: (t: TepXem) => void }) {
  switch (cot) {
    case "luc": return <td className="lds-mu">{ngayGio(r.thoi_diem)}</td>;
    case "lenh": return <td>{r.lsx_ma ?? "—"}</td>;
    case "khach": return <td className="lds-mu" title={r.khach ?? undefined}>{r.khach ?? "—"}</td>;
    case "cong_doan": return <td title={r.cong_doan}>{r.cong_doan}</td>;
    case "tieu_chi": {
      const day = r.tieu_chi ? (r.ghi_chu ? `${r.tieu_chi}: ${r.ghi_chu}` : r.tieu_chi) : (r.ghi_chu ?? "Lỗi khác");
      return (
        <td title={day}>
          {r.tieu_chi ?? <span className="kcsb-the">Lỗi khác</span>}
          {r.ghi_chu ? <span className="lds-mu"> {r.tieu_chi ? `(${r.ghi_chu})` : r.ghi_chu}</span> : null}
        </td>
      );
    }
    case "bat": {
      const nhan = r.tai_cho ? "Tại công đoạn" : `Lọt tới ${r.noi_bat}`;
      return <td className="lds-mu" title={nhan}>{nhan}</td>;
    }
    case "so": return <td className="n lds-do">{num(r.so_luong)} <span className="lds-mu">{nhanChang(r.don_vi)}</span></td>;
    case "to": return <td className="lds-mu" title={r.to ?? undefined}>{r.to ?? "—"}</td>;
    case "anh":
      return (
        <td>
          {r.anh.length === 0 ? <span className="lds-mu3">—</span> : r.anh.map((a) => (
            <button key={a.file_url} type="button" className="kcsb-anh" title={`Xem ${a.file_name}`}
              onClick={() => onXem({ ten_tep: a.file_name, file_url: a.file_url, content_type: a.file_type ?? null })}>
              <img src={anhNho(a.file_url) ?? undefined} alt="" loading="lazy" />
            </button>
          ))}
        </td>
      );
    default: return <td className="lds-mu">{r.nguoi_ghi ?? "—"}</td>;
  }
}

function BangLanLoi({ data, loading, trang, coTrang, onTrang, onCoTrang }: {
  data: SxKcsBaoCao; loading: boolean; trang: number; coTrang: number;
  onTrang: (n: number) => void; onCoTrang: (n: number) => void;
}) {
  const luoi = useCauHinhLuoi("kcs-bc-lan-loi");
  const [xem, setXem] = useState<TepXem | null>(null);
  const cot = luoi.rongHien(luoi.xep(COT_LAN).filter((c) => !luoi.an.has(c.key)));
  return (
    <section className="lds-sheet kcsb-lan-loi" aria-label="Các lần ghi lỗi">
      <div className="kcsb-khung__dau kcsb-lan-loi__dau">
        <h4>Các lần ghi lỗi</h4>
        <span className="kcsb-khung__phu">mới nhất trước</span>
        <span className="kcsb-gian" />
        <ChonCot cot={COT_LAN} {...luoi.chonCot} />
      </div>
      {data.lan_loi.length === 0 ? (
        <p className="kcsb-trong">Không có lần ghi lỗi nào khớp điều kiện đang lọc.</p>
      ) : (
        <CuonLuoi ghim={luoi.soGhim(cot)}>
          <table className="lds-g" style={{ minWidth: rongLuoi(cot) }}>
            <colgroup>
              {cot.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
            </colgroup>
            <thead>
              <tr>
                {cot.map((c) => <th key={c.key} className={c.n ? "n" : undefined}>{c.label}{luoi.keo(c.key)}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.lan_loi.map((r) => (
                <tr key={r.loi_id}>{cot.map((c) => <OLan key={c.key} cot={c.key} r={r} onXem={setXem} />)}</tr>
              ))}
            </tbody>
          </table>
        </CuonLuoi>
      )}
      <PhanTrangDayDu trang={trang} size={coTrang} tong={data.lan_loi_tong} soDong={data.lan_loi.length}
        onTrang={onTrang} onSize={onCoTrang} loading={loading} donVi="lần ghi lỗi" />
      {xem && createPortal(<XemTruoc tep={xem} onDong={() => setXem(null)} />, document.body)}
    </section>
  );
}

/** Chênh so với kỳ trước. `tot` = chiều tăng là tốt hay xấu. */
function SoKyTruoc({ nay, truoc, tot, donVi = "", thapPhan = false }: {
  nay: number | null; truoc: number | null; tot: "tang" | "giam"; donVi?: string; thapPhan?: boolean;
}) {
  if (nay == null || truoc == null) return null;
  const d = nay - truoc;
  if (Math.abs(d) < (thapPhan ? 0.05 : 0.5)) return <small className="kcsb-kt kcsb-kt--ngang">bằng kỳ trước</small>;
  const xau = (d > 0) === (tot === "giam");
  const v = thapPhan ? Math.round(Math.abs(d) * 10) / 10 : Math.abs(d);
  return (
    <small className={`kcsb-kt ${xau ? "lds-do" : "lds-la"}`}>
      {d > 0 ? "↑" : "↓"} {num(v)}{donVi} so với kỳ trước
    </small>
  );
}

const GHI_CHU: Record<SxKcsChieu, string> = {
  cong_doan: "Mỗi ô là số lỗi do công đoạn đó gây ra trong ngày, bắt ở đâu cũng tính, đếm theo đơn vị nơi bắt. Lần là số lần ghi lỗi. Bấm một dòng để lọc.",
  to: "Mỗi ô là số lỗi báo về tổ đó trong ngày. Lỗi chưa rõ tổ không có trong bảng này. Bấm một dòng để lọc.",
  tieu_chi: "Lỗi ghi ở công đoạn: số lỗi KCS tick theo tiêu chí ngay ở công đoạn giữa, đơn vị của công đoạn đó. Lần xét và Hỏng đếm từ các lần kiểm bước cuối: Lần xét là số lần kiểm có tiêu chí đó, Hỏng là số lần KCS tick nó là mục hỏng. Lỗi khác và lỗi ghi qua \"Lỗi ở công đoạn khác\" không gắn tiêu chí nên chỉ có ở cách xem Theo công đoạn. Bấm một dòng để lọc.",
};

export function KcsBaoCaoLoi({
  data, loading, error, onThuLai, tim, onTim, ky, onKy, loc, onLoc, dangLoc, onXoaLoc,
  chon, onChon, xem, onXem, trang, coTrang, onTrang, onCoTrang,
}: {
  data: SxKcsBaoCao | null;
  loading: boolean;
  error: string | null;
  onThuLai: () => void;
  tim: string;
  onTim: (s: string) => void;
  ky: KyDS;
  onKy: (k: KyDS) => void;
  loc: LocBcKcs;
  onLoc: (l: LocBcKcs) => void;
  /** Có ô tìm, kỳ hay điều kiện nào đang chặn — để câu "không có" nói đúng và mời xoá lọc. */
  dangLoc: boolean;
  onXoaLoc: () => void;
  /** Bấm-lọc trên tab (thanh, cột ngày, dòng bảng). */
  chon: ChonBcKcs;
  onChon: (c: ChonBcKcs) => void;
  /** Cách xem nằm ở trang để Xuất Excel ra đúng bảng đang xem. */
  xem: SxKcsChieu;
  onXem: (x: SxKcsChieu) => void;
  trang: number;
  coTrang: number;
  onTrang: (n: number) => void;
  onCoTrang: (n: number) => void;
}) {
  const [dang, setDangState] = useState<Dang>(docDang);
  const setDang = (d: Dang) => {
    setDangState(d);
    try { localStorage.setItem(KHOA_DANG, d); } catch { /* chế độ riêng tư: chỉ không nhớ */ }
  };
  // Cột nhớ theo máy người xem: hai bảng ngày dùng chung một bộ, bảng tiêu chí một bộ riêng.
  const luoiNgay = useCauHinhLuoi("kcs-bc-ngay");
  const luoiTc = useCauHinhLuoi("kcs-bc-tieu-chi");
  const laTc = xem === "tieu_chi";
  const cotGoc = laTc ? COT_TC : xem === "to" ? cotNgay("Tổ chịu", false) : cotNgay("Công đoạn gây lỗi", true);
  const luoi = laTc ? luoiTc : luoiNgay;
  // Bảng ngày giữ nguyên thứ tự (cột ngày luôn ở giữa) nên không xếp lại, chỉ ẩn + đổi độ rộng.
  const cotHien = luoi.rongHien((laTc ? luoi.xep(cotGoc) : cotGoc).filter((c) => !luoi.an.has(c.key)));
  const dieuKien = dieuKienBcKcs(data);
  const coChon = Object.values(chon).some(Boolean);
  const bam = (k: SxKcsChieu | "ngay", gt: string) => onChon({ ...chon, [k]: chon[k] === gt ? undefined : gt });
  const trong = dangLoc || coChon ? (
    <>
      Không có lỗi nào khớp kỳ và điều kiện đang lọc.{" "}
      <button type="button" className="lds-lk" onClick={onXoaLoc}>Xoá bộ lọc</button>
    </>
  ) : laTc
    ? "Chưa có lỗi ghi theo tiêu chí và chưa lần kiểm bước cuối nào xét tiêu chí."
    : "Chưa có lỗi nào được ghi.";
  const kt = data?.ky_truoc ?? null;
  const nhanNgay = (k: string) => data?.truc.find((m) => m.khoa === k)?.nhan ?? k;
  return (
    <section className="kcsb-bc" aria-label="Báo cáo lỗi">
      <section className="lds-loc">
        <div className="lds-loc__thanh tl-thanh" role="search">
          <OTim value={tim} onChange={onTim} placeholder="Tìm mã lệnh, sản phẩm, khách hàng…" ariaLabel="Tìm trong báo cáo lỗi" />
          <ThanhLoc ky={ky} moc={MOC_BC_KCS} onKy={onKy} dieuKien={dieuKien} loc={loc} onLoc={onLoc} />
          {(["cong_doan", "to", "tieu_chi", "ngay"] as const).map((k) => chon[k] ? (
            <span key={k} className="kcsb-chon">
              <span>{k === "ngay" ? "Ngày" : NHAN_CHIEU[k]}</span>
              <span>{k === "ngay" ? nhanNgay(chon[k]!) : chon[k]}</span>
              <button type="button" title="Bỏ điều kiện này" aria-label="Bỏ điều kiện này"
                onClick={() => onChon({ ...chon, [k]: undefined })}>×</button>
            </span>
          ) : null)}
          {coChon && <button type="button" className="lds-lk kcsb-chon__xoa" onClick={() => onChon({})}>Xoá bộ lọc</button>}
          <span className="kcsb-gian" />
          <span className="kcsb-seg" role="group" aria-label="Cách xem">
            {CACH_XEM.map(([k, nhan]) => (
              <button key={k} type="button" aria-pressed={xem === k} className={xem === k ? "on" : undefined}
                onClick={() => onXem(k)}>{nhan}</button>
            ))}
          </span>
          <span className="kcsb-seg kcsb-seg--dang" role="group" aria-label="Dạng xem">
            <button type="button" aria-pressed={dang === "bang"} className={dang === "bang" ? "on" : undefined}
              onClick={() => setDang("bang")}><Icon name="table" size={14} />Bảng</button>
            <button type="button" aria-pressed={dang === "bieu_do"} className={dang === "bieu_do" ? "on" : undefined}
              onClick={() => setDang("bieu_do")}><Icon name="activity" size={14} />Biểu đồ</button>
          </span>
          {dang === "bang" && (laTc
            ? <ChonCot cot={cotGoc} {...luoiTc.chonCot} />
            : <ChonCot cot={cotGoc} an={luoiNgay.an} onAn={luoiNgay.chonCot.onAn}
                rong={luoiNgay.chonCot.rong} onRong={luoiNgay.chonCot.onRong} />)}
        </div>
      </section>
      <div className="kcsb-so" title={kt ? `Kỳ trước: ${kt.tu.split("-").reverse().join("/")} – ${kt.den.split("-").reverse().join("/")}` : undefined}>
        <span>Lượt kiểm<b>{data ? num(data.tong_luot) : "—"}</b>
          {data && kt && <SoKyTruoc nay={data.tong_luot} truoc={kt.tong_luot} tot="tang" />}</span>
        <span>Tỷ lệ đạt ở bước cuối<b>{data?.ty_le_dat != null ? phanTram(data.ty_le_dat) : "—"}</b>
          {data?.ty_le_dat != null && kt?.ty_le_dat != null && (
            <SoKyTruoc nay={data.ty_le_dat * 100} truoc={kt.ty_le_dat * 100} tot="tang" donVi=" điểm" thapPhan />
          )}</span>
        <span>Lần ghi lỗi<b className={data?.so_lan_ghi_loi ? "lds-do" : undefined}>{data ? num(data.so_lan_ghi_loi) : "—"}</b>
          {data && kt && <SoKyTruoc nay={data.so_lan_ghi_loi} truoc={kt.so_lan_ghi_loi} tot="giam" />}</span>
        <span>Lệnh có lỗi<b>{data ? num(data.so_lenh_loi) : "—"}</b>
          {data && kt && <SoKyTruoc nay={data.so_lenh_loi} truoc={kt.so_lenh_loi} tot="giam" />}</span>
      </div>
      {error ? (
        <div className="lds-sheet">
          <p className="kcsb-trong">
            <span className="lds-do">{error}</span>{" "}
            <button type="button" className="lds-lk" onClick={onThuLai}>Thử lại</button>
          </p>
        </div>
      ) : data == null ? (
        <div className="lds-sheet"><EmptyState trangThai="dang-tai" inline /></div>
      ) : dang === "bieu_do" ? (
        <>
          <KcsBaoCaoBieuDo data={data} xem={xem} chon={chon} onChon={bam} />
          <BangLanLoi data={data} loading={loading} trang={trang} coTrang={coTrang} onTrang={onTrang} onCoTrang={onCoTrang} />
        </>
      ) : (
        <>
          <div className="lds-sheet">
            {laTc ? (
              <BangTieuChi data={data} cot={cotHien} luoi={luoi} trong={trong} chon={chon.tieu_chi}
                onChon={(t) => bam("tieu_chi", t)} />
            ) : (
              <BangNgay data={data} dong={xem === "to" ? data.nhiet_to : data.nhiet_cong_doan} cot={cotHien} luoi={luoi}
                trong={trong} chon={chon[xem]} onChon={(t) => bam(xem, t)} />
            )}
          </div>
          <p className="kcsb-ghi">{GHI_CHU[xem]}</p>
          <BangLanLoi data={data} loading={loading} trang={trang} coTrang={coTrang} onTrang={onTrang} onCoTrang={onCoTrang} />
        </>
      )}
    </section>
  );
}
