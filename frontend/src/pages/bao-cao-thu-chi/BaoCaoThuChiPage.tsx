// BÁO CÁO THU CHI theo mục × tháng (11/10/2026) — mockup `docs/mockups/bao-cao-thu-chi-khuon-cong-no.html`,
// đặt vào khung của Tổng hợp công nợ phải trả (`ke-toan/bao-cao-cong-no`).
//
// Một lưới: dòng = mục (hoặc người nhận, người nộp), cột = các tháng của kỳ (kỳ dài hơn 12 tháng thì
// theo quý; kỳ gọn trong một tháng thì không có cột kỳ) + Cộng kỳ.
// Đầu bảng là dòng Chênh lệch thu − chi, rồi nhóm Thu, nhóm Chi. Lọc, xếp, cắt trang, cộng nhóm đều ở
// MÁY CHỦ (`/api/bao-cao-thu-chi`); giao diện chỉ vẽ.
//
// Bấm dòng mở ngăn phiếu của dòng; bấm ô số của một cột kỳ mở ngăn đã lọc sẵn đúng cột đó.
//
// Nút Bảng | Biểu đồ (12/10/2026, phương án C `docs/mockups/bao-cao-thu-chi-pinterest-3-phuong-an.html`):
// dạng biểu đồ (`BieuDoThuChi`) đọc chung kỳ, ô tìm, Lọc, thẻ lọc nhanh và chung một lần gọi máy chủ
// (không cắt trang). Dạng đang xem ghi lên URL (`xem=bieu-do`).
import { Banknote, Tag } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import {
  ApiError,
  api,
  type BaoCaoThuChi,
  type DongThuChi,
  type MucThuChi,
  type TheThuChi,
} from "../../api/client";
import { useCan } from "../../auth/permissions";
import { useAuth } from "../../auth/useAuth";
import type { NavigateFn } from "../../components/AppShell";
import { Button } from "../../components/Button";
import { EmptyRow } from "../../components/EmptyState";
import { Icon } from "../../components/Icons";
import {
  ChonCot, CuonLuoi, LocNhanhTrangThai, OTim, rongLuoi, soVN, useCauHinhLuoi,
  type CotLuoi, type MauTT, type MucLocNhanh,
} from "../../components/LuoiDs";
import { PhanTrangDayDu } from "../../components/PhanTrangDayDu";
import { homNayVN } from "../../utils/ky";
import { useDebounced } from "../../utils/useDebounced";
import { ThanhLoc } from "../thanh-loc/ThanhLoc";
import { khoangKy } from "../thanh-loc/ky-danh-sach";
import type { DieuKien } from "../thanh-loc/thanh-loc";
import { diChuyen } from "../ke-toan/shared/BangPhieu";
import { useKyKeToan } from "../ke-toan/shared/kyKeToan";
import { NhomNut } from "../ke-toan/shared/NhomNut";
import { docThamSoMan, useDongBoUrl } from "../ke-toan/shared/urlMan";
import { BieuDoThuChi } from "./BieuDoThuChi";
import { NganThuChi, type MoNgan } from "./NganThuChi";
import "../ke-toan/ke-toan.css";
import "./bao-cao-thu-chi.css";

/** Mã màn — khoá nhớ kỳ, dấu `man` trên URL, khoá cấu hình lưới. */
const MAN = "bao-cao-thu-chi";

/** Một mốc ngày duy nhất: ngày thực thu, thực chi (máy chủ tự chọn). Một mốc thì nút kỳ không hiện
 *  phần "Tính theo". */
const MOC: [string, string][] = [["thu_chi", "Ngày thu chi"]];

/** Bốn mục lọc nhanh; máy chủ đếm (`the_loc`) theo ô tìm + Lọc, không theo chính mục đang chọn. */
const THE: { key: TheThuChi; nhan: string; mau?: MauTT }[] = [
  { key: "all", nhan: "Tất cả" },
  { key: "thu", nhan: "Thu", mau: "xanh" },
  { key: "chi", nhan: "Chi", mau: "cam" },
  { key: "chua", nhan: "Chưa phân loại", mau: "vang" },
];

const HINH_THUC: { value: "cash" | "bank_transfer"; nhan: string }[] = [
  { value: "cash", nhan: "Tiền mặt" },
  { value: "bank_transfer", nhan: "Chuyển khoản" },
];

const CO_MAC_DINH = 50;
/** Dạng biểu đồ cần đủ mọi dòng (vòng cơ cấu, Kết quả kỳ) — lấy một lượt, trần của máy chủ. */
const CO_BIEU_DO = 500;

type Dang = "bang" | "bieu";

/** Cột lưới: `w` bề rộng (cột tên co giãn thì bỏ), `n` canh phải; `cot` = khoá cột kỳ của máy chủ. */
interface CotTC extends CotLuoi {
  w?: number;
  n?: boolean;
  cot?: string;
}

type LocTC = { ht?: "cash" | "bank_transfer"; muc: string[] };
const LOC_TRONG: LocTC = { muc: [] };

/** Ô số: 0 thành gạch mờ. Số âm (chênh lệch) dùng dấu trừ thật. */
function oSo(n: number): ReactNode {
  if (!n) return <span className="lds-mu3">–</span>;
  return n < 0 ? `−${soVN(-n)}` : soVN(n);
}

/** ↑ ↓ giữa các dòng mục / người (bỏ qua dòng nhóm Thu, Chi); Enter mở ngăn — như `diChuyen`. */
function diChuyenDong(e: KeyboardEvent<HTMLTableRowElement>, onMo: () => void) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") {
    diChuyen(e, onMo);
    return;
  }
  const xuong = e.key === "ArrowDown";
  let ke = xuong ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
  while (ke && !ke.classList.contains("lds-dong")) ke = xuong ? ke.nextElementSibling : ke.previousElementSibling;
  if (ke instanceof HTMLElement) {
    e.preventDefault();
    ke.focus();
  }
}

export function BaoCaoThuChiPage({ navigate, locMuc = null }: {
  navigate?: NavigateFn;
  /** Mở từ số "Đã dùng" ở danh mục Mục thu chi: lọc sẵn đúng mục này, kỳ 12 tháng gần nhất. */
  locMuc?: number | null;
}) {
  const { token } = useAuth();
  const can = useCan();
  const coChuyen = can("bao_cao_thu_chi", "update");

  // ---------- kỳ ----------
  // Kỳ dùng chung thanh lọc của mọi danh sách, nhớ theo màn + ghi lên URL. Mặc định Tháng này. "Tất
  // cả" bị bỏ: từ đầu sổ tới nay là hàng trăm cột quý. Kỳ có sẵn (tháng, quý, năm) chặn ở hôm nay —
  // báo cáo tính theo ngày đã thu, đã chi, ngày tương lai chỉ đẻ cột trống.
  const [ky, setKy] = useKyKeToan(MAN, MOC, MOC[0][0], "thang");
  const homNay = homNayVN();
  const khoang = khoangKy(ky, homNay) ?? khoangKy({ loai: "thang", moc: ky.moc }, homNay)!;
  const tuNgay = khoang.tu;
  const denNgay = ky.loai !== "tuy" && khoang.den > homNay && khoang.tu <= homNay ? homNay : khoang.den;

  // ---------- bộ lọc ----------
  const [theo, setTheo] = useState<"muc" | "nguoi">("muc");
  const [the, setThe] = useState<TheThuChi>("all");
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState<LocTC>(LOC_TRONG);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(CO_MAC_DINH);
  const qTre = useDebounced(q.trim());
  const [dang, setDang] = useState<Dang>(() => (docThamSoMan(MAN)?.get("xem") === "bieu-do" ? "bieu" : "bang"));
  useDongBoUrl(MAN, { xem: dang === "bieu" ? "bieu-do" : undefined });
  // Cột kỳ được tô sau khi bấm một tháng ở dạng biểu đồ; đổi kỳ / cách xem thì bỏ tô.
  const [hl, setHl] = useState<string | null>(null);
  useEffect(() => setHl(null), [tuNgay, denNgay, theo]);
  const trangGui = dang === "bieu" ? 1 : page;
  const coGui = dang === "bieu" ? CO_BIEU_DO : size;
  const mucGui = useMemo(() => loc.muc.map(Number), [loc.muc]);
  const khoaMuc = loc.muc.join(",");
  useEffect(() => setPage(1), [the, qTre, loc.ht, khoaMuc, tuNgay, denNgay, theo, size]);
  useEffect(() => {
    if (locMuc == null) return;
    setLoc({ muc: [String(locMuc)] });
    setThe("all");
    setTheo("muc");
    setKy({ loai: "12t", moc: ky.moc });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi có liên thông mới
  }, [locMuc]);

  // Danh mục mục thu, mục chi (đang dùng) — cho ô Lọc → Mục và hộp "Chuyển sang mục…".
  const [mucThu, setMucThu] = useState<MucThuChi[]>([]);
  const [mucChi, setMucChi] = useState<MucThuChi[]>([]);
  useEffect(() => {
    if (!token) return;
    api.mucThuChi.list(token, "thu").then((r) => setMucThu(r.items)).catch(() => setMucThu([]));
    api.mucThuChi.list(token, "chi").then((r) => setMucChi(r.items)).catch(() => setMucChi([]));
  }, [token]);

  // ---------- tải bảng ----------
  const [data, setData] = useState<BaoCaoThuChi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dangXuat, setDangXuat] = useState(false);

  // Câu trả lời cũ về muộn (gõ nhanh, đổi kỳ liên tục) bị bỏ.
  const luot = useRef(0);
  const load = useCallback(() => {
    if (!token) return;
    const l = ++luot.current;
    setLoading(true);
    setError(null);
    api.baoCaoThuChi
      .bang(token, { tuNgay, denNgay, theo, hinhThuc: loc.ht ?? null, muc: mucGui, q: qTre, the, page: trangGui, size: coGui })
      .then((d) => {
        if (l === luot.current) setData(d);
      })
      .catch((cause) => {
        if (l !== luot.current) return;
        setData(null);
        setError(cause instanceof ApiError ? cause.message : "Không tải được báo cáo thu chi.");
      })
      .finally(() => {
        if (l === luot.current) setLoading(false);
      });
  }, [token, tuNgay, denNgay, theo, loc.ht, mucGui, qTre, the, trangGui, coGui]);
  useEffect(load, [load]);

  async function xuatExcel() {
    if (!token) return;
    setDangXuat(true);
    try {
      const { url, ten } = await api.baoCaoThuChi.xlsx(token, {
        tuNgay, denNgay, theo, hinhThuc: loc.ht ?? null, muc: mucGui, q: qTre, the,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = ten;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không xuất được file.");
    } finally {
      setDangXuat(false);
    }
  }

  // Thông báo nhỏ sau khi chuyển mục — tự tắt sau 4 giây.
  const [bao, setBao] = useState<string | null>(null);
  useEffect(() => {
    if (!bao) return;
    const t = setTimeout(() => setBao(null), 4000);
    return () => clearTimeout(t);
  }, [bao]);

  // ---------- ngăn ----------
  const [xem, setXem] = useState<MoNgan | null>(null);

  const doiTheo = (v: "muc" | "nguoi") => {
    if (v === theo) return;
    setTheo(v);
    setQ("");
    setXem(null);
  };

  // ---------- lưới ----------
  const luoi = useCauHinhLuoi(MAN);
  const cotKy = data?.cot ?? [];
  const cotDay: CotTC[] = [
    { key: "ten", label: theo === "muc" ? "Mục" : "Người nhận, nộp", coDinh: true },
    ...cotKy.map((c): CotTC => ({ key: `k:${c.khoa}`, label: c.nhan, n: true, w: c.nhan.length > 12 ? 176 : 140, cot: c.khoa })),
    { key: "cong", label: "Cộng kỳ", n: true, w: 150 },
  ];
  const cotHien = luoi.rongHien(luoi.xep(cotDay).filter((x) => !luoi.an.has(x.key)));
  const rows = data?.dong ?? [];
  const total = data?.total ?? 0;
  const donVi = theo === "muc" ? "mục" : "người";
  const coLoc = the !== "all" || !!qTre || loc.ht != null || loc.muc.length > 0;

  const xoaLoc = () => {
    setThe("all");
    setQ("");
    setLoc(LOC_TRONG);
  };

  const khoaDong = (d: DongThuChi) => `${d.ben}:${d.khoa}`;
  // Bảng tải lại (sau khi chuyển mục) thì ngăn đang mở nhận dòng mới cùng khoá — dải số đầu ngăn,
  // ↑ ↓ bám đúng bảng đang thấy.
  useEffect(() => {
    if (!xem || !data) return;
    const moi = data.dong.find((d) => d.ben === xem.dong.ben && d.khoa === xem.dong.khoa);
    if (moi && moi !== xem.dong) setXem({ ...xem, dong: moi });
  }, [data, xem]);
  const mo = (d: DongThuChi, cot: string | null = null) => setXem({ dong: d, cot });
  const doiDang = (v: Dang) => {
    setDang(v);
    setHl(null);
  };
  /** Bấm một tháng ở biểu đồ: sang bảng, tô cột tháng đó. */
  const xemThang = (khoa: string | null) => {
    setDang("bang");
    setHl(khoa);
  };
  const lopHl = (x: CotTC) => (hl != null && x.cot === hl ? " bctc-hl" : "");
  // Cột vừa tô có thể nằm ngoài khung (kỳ nhiều tháng) — cuộn ngang tới nó khi bảng đã vẽ.
  const manRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (dang !== "bang" || hl == null) return;
    manRef.current?.querySelector("th.bctc-hl")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [dang, hl, data]);
  const viTri = xem ? rows.findIndex((d) => khoaDong(d) === khoaDong(xem.dong)) : -1;

  const oDong = (x: CotTC, d: DongThuChi) => {
    if (x.key === "ten") {
      return <td key={x.key} title={d.ten}>{d.ten}</td>;
    }
    if (x.key === "cong") return <td key={x.key} className="n">{oSo(d.cong)}</td>;
    const v = d.o[x.cot ?? ""] ?? 0;
    if (!v) return <td key={x.key} className={`n${lopHl(x)}`}>{oSo(0)}</td>;
    return (
      <td key={x.key} className={`n${lopHl(x)}`}>
        <button type="button" className="kt-so-nut" aria-label={`Xem phiếu ${x.label} của ${d.ten}`}
          onClick={(e) => {
            e.stopPropagation();
            mo(d, x.cot ?? null);
          }}
          onKeyDown={(e) => e.stopPropagation()}>
          {soVN(v)}
        </button>
      </td>
    );
  };

  /** Ô số của dòng tổng (Chênh lệch, nhóm Thu / Chi): chỉ đọc. */
  const oTong = (x: CotTC, t: { o: Record<string, number>; cong: number }) => {
    if (x.key === "ten") return null;
    if (x.key === "cong") return <td key={x.key} className="n">{oSo(t.cong)}</td>;
    return <td key={x.key} className={`n${lopHl(x)}`}>{oSo(t.o[x.cot ?? ""] ?? 0)}</td>;
  };

  const coThu = (data?.nhom.thu.so_dong ?? 0) > 0;
  const coChi = (data?.nhom.chi.so_dong ?? 0) > 0;

  const nhomVa = (ben: "thu" | "chi") => {
    const ds = rows.filter((d) => d.ben === ben);
    if (!data || ds.length === 0) return null;
    const t = data.nhom[ben];
    return [
      <tr key={`nhom-${ben}`} className="lds-nhom bctc-nhom">
        <td>
          <span className="lds-dinh-trai">
            {ben === "thu" ? "Thu" : "Chi"}
            <span className="lds-mu3 bctc-dem">{`${soVN(t.so_dong)} ${donVi}`}</span>
          </span>
        </td>
        {cotHien.map((x) => oTong(x, t))}
      </tr>,
      ...ds.map((d) => (
        <tr key={khoaDong(d)}
          className={`lds-dong bctc-con${xem && khoaDong(xem.dong) === khoaDong(d) ? " is-chon" : ""}`} tabIndex={0}
          aria-label={`Xem phiếu của ${d.ten}`}
          onClick={() => mo(d)} onKeyDown={(e) => diChuyenDong(e, () => mo(d))}>
          {cotHien.map((x) => oDong(x, d))}
        </tr>
      )),
    ];
  };

  // ---------- lọc ----------
  const muc: MucLocNhanh[] = THE.map((t) => ({ key: t.key, label: t.nhan, mau: t.mau, count: data?.the_loc?.[t.key] }));
  const giaTriMuc = useMemo(() => {
    // Tên mục thu trùng tên mục chi (hiếm) thì thêm bên trong ngoặc để phân biệt.
    const tenThu = new Set(mucThu.map((m) => m.ten));
    const tenChi = new Set(mucChi.map((m) => m.ten));
    return [
      ...mucThu.map((m) => ({ value: String(m.id), nhan: tenChi.has(m.ten) ? `${m.ten} (thu)` : m.ten })),
      ...mucChi.map((m) => ({ value: String(m.id), nhan: tenThu.has(m.ten) ? `${m.ten} (chi)` : m.ten })),
      { value: "0", nhan: "Chưa phân loại" },
    ];
  }, [mucThu, mucChi]);
  const dieuKien: DieuKien<LocTC>[] = [
    {
      khoa: "ht", nhan: "Hình thức", icon: Banknote, kieu: "mot",
      giaTri: HINH_THUC.map((h) => ({ value: h.value, nhan: h.nhan })),
      doc: (l) => l.ht,
      ghi: (l, v) => ({ ...l, ht: v as LocTC["ht"] }),
    },
    {
      khoa: "muc", nhan: "Mục", icon: Tag, kieu: "nhieu", tim: true,
      giaTri: giaTriMuc,
      doc: (l) => l.muc,
      ghi: (l, v) => ({ ...l, muc: v }),
    },
  ];

  const timGoiY = theo === "muc" ? "Tìm mục" : "Tìm người nhận, người nộp";

  return (
    <main ref={manRef} className="kt-trang lds bctc">
      <header className="lds-dau">
        <h1 className="lds-dau__ten">Báo cáo thu chi</h1>
        <div className="lds-dau__nut">
          <Button variant="ghost" onClick={() => void xuatExcel()} disabled={dangXuat || !data}
            title="Đúng bảng đang xem ra file .xlsx">
            <Icon name="table" size={14} /> {dangXuat ? "Đang xuất…" : "Xuất Excel"}
          </Button>
        </div>
      </header>

      <section className="lds-loc">
        <LocNhanhTrangThai muc={muc} dang={the} onChon={(k) => setThe(k as TheThuChi)} />
        <div className="lds-loc__thanh tl-thanh" role="search">
          <OTim value={q} onChange={setQ} placeholder={timGoiY} ariaLabel={timGoiY} />
          <ThanhLoc ky={ky} moc={MOC} onKy={setKy} boLoaiKy={["tat_ca"]}
            dieuKien={dieuKien} loc={loc} onLoc={setLoc} onXoaHet={xoaLoc} />
          <div className="lds-loc__phai">
            <NhomNut giaTri={theo} luaChon={[["muc", "Theo mục"], ["nguoi", "Theo người nhận, nộp"]]} onDoi={doiTheo} />
            <NhomNut giaTri={dang} luaChon={[["bang", "Bảng"], ["bieu", "Biểu đồ"]]} onDoi={doiDang} />
            {dang === "bang" && <ChonCot cot={cotDay} {...luoi.chonCot} />}
          </div>
        </div>
      </section>

      {dang === "bieu" ? (
        <div className={loading ? "bctc-dang-tai" : undefined} aria-busy={loading || undefined}>
          {data && rows.length > 0 ? (
            <BieuDoThuChi data={data} theo={theo} onMo={(d) => mo(d)} onThang={xemThang} />
          ) : (
            <p className="lds-sheet lds-trong bctc-bd__rong">
              {loading && !error ? "Đang tải…" : error ? (
                <span role="alert">
                  <span className="lds-do">{error}</span>{" "}
                  <button type="button" className="lds-lk" onClick={load}>Thử lại</button>
                </span>
              ) : coLoc ? (
                <>
                  {`Không có ${donVi} nào khớp điều kiện đang lọc.`}{" "}
                  <button type="button" className="lds-lk" onClick={xoaLoc}>Xoá bộ lọc</button>
                </>
              ) : "Kỳ này chưa thu, chưa chi khoản nào."}
            </p>
          )}
        </div>
      ) : (
      <div className="lds-sheet" aria-busy={loading || undefined}>
        <CuonLuoi ghim={luoi.soGhim(cotHien)}>
          <table className="lds-g" style={{ minWidth: rongLuoi(cotHien, 280) }}>
            <colgroup>
              {cotHien.map((x) => <col key={x.key} style={x.w ? { width: x.w } : undefined} />)}
            </colgroup>
            <thead>
              <tr>
                {cotHien.map((x) => (
                  <th key={x.key} className={`${x.n ? "n" : ""}${lopHl(x)}` || undefined}>{x.label}{luoi.keo(x.key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Chênh lệch đứng ĐẦU, chỉ khi có cả Thu lẫn Chi: Σ mọi dòng khớp lọc, máy chủ cộng. */}
              {rows.length > 0 && data && coThu && coChi ? (
                <tr className="lds-cong lds-nhom">
                  <td className="lead">
                    <span className="lds-dinh-trai">Chênh lệch thu − chi</span>
                  </td>
                  {cotHien.map((x) => oTong(x, data.chenh_lech))}
                </tr>
              ) : null}
              {loading && rows.length === 0 && !error ? (
                <EmptyRow colSpan={cotHien.length} trangThai="dang-tai" />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={cotHien.length} className="lds-trong">
                    {error ? (
                      <span role="alert">
                        <span className="lds-do">{error}</span>{" "}
                        <span className="lds-mu">Các con số đang để trống, không phải bằng 0.</span>{" "}
                        <button type="button" className="lds-lk" onClick={load}>Thử lại</button>
                      </span>
                    ) : coLoc ? (
                      <>
                        {`Không có ${donVi} nào khớp điều kiện đang lọc.`}{" "}
                        <button type="button" className="lds-lk" onClick={xoaLoc}>Xoá bộ lọc</button>
                      </>
                    ) : (
                      "Kỳ này chưa thu, chưa chi khoản nào."
                    )}
                  </td>
                </tr>
              ) : (
                <>
                  {nhomVa("thu")}
                  {nhomVa("chi")}
                </>
              )}
            </tbody>
          </table>
        </CuonLuoi>
        {total > 0 && (
          <PhanTrangDayDu trang={page} size={size} tong={total} soDong={rows.length} onTrang={setPage}
            onSize={setSize} loading={loading} donVi={donVi} ariaLabel="Phân trang báo cáo thu chi" />
        )}
      </div>
      )}
      {data && (
        <p className="bctc-chan lds-mu">Đơn vị: đồng. Tính theo ngày thực thu, thực chi; phiếu đã huỷ không tính.</p>
      )}

      {xem && (
        <NganThuChi
          mo={xem}
          theo={theo}
          loc={{ tuNgay, denNgay, theo, hinhThuc: loc.ht ?? null, muc: mucGui }}
          cotKy={cotKy}
          mucThu={mucThu}
          mucChi={mucChi}
          // Dòng mục cố định (id âm: Trả nhà cung cấp…) gom phiếu sinh từ nghiệp vụ — không chuyển được.
          coChuyen={coChuyen && theo === "muc" && !(xem.dong.muc_id != null && xem.dong.muc_id < 0)}
          onClose={() => setXem(null)}
          len={viTri > 0 ? () => mo(rows[viTri - 1]) : undefined}
          xuong={viTri >= 0 && viTri < rows.length - 1 ? () => mo(rows[viTri + 1]) : undefined}
          onDaChuyen={(n, ten) => {
            setBao(`Đã chuyển ${soVN(n)} phiếu sang «${ten}».`);
            load();
          }}
          navigate={navigate}
        />
      )}

      {bao && (
        <div className="bctc-bao" role="status" aria-live="polite">
          <span>{bao}</span>
          <button type="button" className="bctc-bao__x" aria-label="Đóng thông báo" onClick={() => setBao(null)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
