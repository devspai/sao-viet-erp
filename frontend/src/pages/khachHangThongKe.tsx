/** Hồ sơ khách — ba tab số liệu THEO KỲ: Tổng quan, Lịch sử mua hàng, Lịch sử báo giá.
 *
 *  Một thanh chọn kỳ dùng chung ba tab. Mọi con số do máy chủ cộng (tiền chỉ tính đơn ĐÃ CHỐT),
 *  kèm số cùng kỳ năm trước. Lịch sử lọc, đếm, phân trang ở máy chủ.
 *
 *  Gọi API ít nhất có thể: thống kê của một kỳ tải MỘT lần rồi ba tab dùng chung; mỗi trang lịch
 *  sử đã tải được nhớ trong lúc hồ sơ còn mở, chuyển qua lại giữa các tab không tải lại.
 *  Mockup đã duyệt: docs/mockups/ho-so-khach-hang-thong-ke-theo-ky.html.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Download } from "lucide-react";

import {
  api,
  type BuocBieuDo,
  type CotBieuDo,
  type DongBaoGia,
  type KyXem,
  type ThongKeKhach,
  type TrangBaoGia,
  type TrangDon,
} from "../api/client";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { ChonNgay } from "../components/ChonNgay";
import {
  LOAI_KY,
  TEN_BUOC,
  buocTruc,
  buocTuDong,
  congNgay,
  homNayVN,
  loiKhoang,
  luiNam,
  ngayCuaMoc,
  ngayDeDoc,
  nhanCot,
  soCungKy,
  soNgay,
  tienGon,
  tinhKy,
  type LoaiKy,
} from "./khachHangSo";
import "./khach-hang-thong-ke.css";

type BuocChon = "auto" | BuocBieuDo;
export type TabSoLieu = "dashboard" | "orders" | "quotes";

/** Khoảng xem riêng của một tab, mở từ biểu đồ hoặc từ đường nối đơn ↔ báo giá. */
interface KhoanXem extends KyXem {
  ma: string; // khoá để tab dựng lại bộ lọc khi khoảng đổi
  nhan: ReactNode;
  q?: string;
  /** Số cùng kỳ của chính khoảng này (cột biểu đồ đã có sẵn, khỏi gọi thêm). */
  cu?: { doanh_so: number; so_don: number };
}

// Kỳ đang chọn được nhớ khi chuyển sang khách khác hay đóng mở lại hồ sơ (trong phiên làm việc).
const nho: { loai: LoaiKy; tuy: KyXem | null; soSanh: boolean; buoc: BuocChon } = {
  loai: "nam",
  tuy: null,
  soSanh: true,
  buoc: "auto",
};

const CO_TRANG = 50;

// =============================================================================
// Trạng thái dùng chung
// =============================================================================

export function useSoLieuKhach(customerId: number, moTab: (t: TabSoLieu) => void) {
  const { token } = useAuth();
  const homNay = useMemo(() => homNayVN(), []);
  const [loai, setLoaiState] = useState<LoaiKy>(nho.loai);
  const [tuy, setTuyState] = useState<KyXem | null>(nho.tuy);
  const [soSanh, setSoSanhState] = useState(nho.soSanh);
  const [buocChon, setBuocChonState] = useState<BuocChon>(nho.buoc);
  const [khoanDon, setKhoanDon] = useState<KhoanXem | null>(null);
  const [khoanBg, setKhoanBg] = useState<KhoanXem | null>(null);

  const ky = useMemo(() => tinhKy(loai, homNay, tuy), [loai, homNay, tuy]);
  const buoc: BuocBieuDo = buocChon === "auto" ? buocTuDong(ky) : buocChon;

  const boKhoan = useCallback(() => {
    setKhoanDon(null);
    setKhoanBg(null);
  }, []);
  const chonKy = useCallback((l: LoaiKy, k?: KyXem | null) => {
    nho.loai = l;
    setLoaiState(l);
    if (k !== undefined) {
      nho.tuy = k;
      setTuyState(k);
    }
    setKhoanDon(null);
    setKhoanBg(null);
  }, []);
  const setSoSanh = useCallback((v: boolean) => {
    nho.soSanh = v;
    setSoSanhState(v);
  }, []);
  const setBuocChon = useCallback((v: BuocChon) => {
    nho.buoc = v;
    setBuocChonState(v);
  }, []);

  // Bộ nhớ đệm theo khách: một yêu cầu y hệt chỉ gửi một lần trong lúc hồ sơ còn mở.
  const cache = useRef(new Map<string, Promise<unknown>>());
  const lay = useCallback(
    <T,>(khoa: string, goi: () => Promise<T>): Promise<T> => {
      const k = `${customerId}|${khoa}`;
      let p = cache.current.get(k) as Promise<T> | undefined;
      if (!p) {
        p = goi();
        cache.current.set(k, p);
        p.catch(() => cache.current.delete(k));
      }
      return p;
    },
    [customerId],
  );

  const [tk, setTk] = useState<ThongKeKhach | null>(null);
  const [loiTk, setLoiTk] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let huy = false;
    setLoiTk(null);
    lay(`tk|${ky.tu}|${ky.den}|${buoc}`, () => api.customers.thongKe(token, customerId, ky, buoc))
      .then((r) => !huy && setTk(r))
      .catch(() => !huy && setLoiTk("Không tải được số liệu của kỳ này."));
    return () => {
      huy = true;
    };
  }, [token, customerId, ky, buoc, lay]);
  // Đổi khách thì xoá số cũ ngay — đừng để số của khách trước nằm dưới tên khách mới.
  useEffect(() => {
    setTk(null);
    setKhoanDon(null);
    setKhoanBg(null);
  }, [customerId]);

  const xemCot = useCallback(
    (c: CotBieuDo, nhan: string) => {
      setKhoanDon({
        tu: c.tu,
        den: c.den,
        ma: `cot|${c.tu}|${c.den}`,
        nhan: (
          <>
            Đang xem riêng <b>{nhan}</b> (bấm từ biểu đồ).
          </>
        ),
        cu: { doanh_so: c.doanh_so_cu, so_don: c.so_don_cu },
      });
      moTab("orders");
    },
    [moTab],
  );
  /** Từ đơn sang báo giá sinh ra nó. Báo giá lập TRƯỚC đơn nên tìm lùi tới 10 năm, tới ngày đơn. */
  const xemBaoGia = useCallback(
    (ma: string, ngayDon: string) => {
      const den = ngayCuaMoc(ngayDon);
      setKhoanBg({
        tu: congNgay(den, -3650),
        den,
        ma: `bg|${ma}`,
        q: ma,
        nhan: (
          <>
            Đang xem báo giá <b>{ma}</b>.
          </>
        ),
      });
      moTab("quotes");
    },
    [moTab],
  );
  const xemDon = useCallback(
    (ma: string, ngay: string) => {
      const d = ngayCuaMoc(ngay);
      setKhoanDon({
        tu: d,
        den: d,
        ma: `don|${ma}`,
        q: ma,
        nhan: (
          <>
            Đang xem đơn <b>{ma}</b>.
          </>
        ),
      });
      moTab("orders");
    },
    [moTab],
  );

  return {
    customerId,
    homNay,
    loai,
    ky,
    tuy,
    chonKy,
    soSanh,
    setSoSanh,
    buocChon,
    setBuocChon,
    buoc,
    tk,
    loiTk,
    lay,
    khoanDon,
    khoanBg,
    boKhoan,
    xemCot,
    xemBaoGia,
    xemDon,
  };
}
export type SoLieuKhach = ReturnType<typeof useSoLieuKhach>;

// =============================================================================
// Mảnh nhỏ dùng chung
// =============================================================================

function Doi({ nay, cu, kieu = "pt", hien }: { nay: number; cu: number; kieu?: "pt" | "so"; hien: boolean }) {
  if (!hien) return null;
  const d = soCungKy(nay, cu, kieu);
  return <span className={`khtk__d khtk__d--${d.huong}`}>{d.chu}</span>;
}

/** Tỉ lệ đổi theo ĐIỂM phần trăm (tỉ lệ chốt 40% → 46% là ▲ 6 điểm, không phải ▲ 15%). */
function DoiDiem({ nay, cu, hien }: { nay: number | null; cu: number | null; hien: boolean }) {
  if (!hien || nay == null || cu == null) return null;
  const x = nay - cu;
  if (x === 0) return <span className="khtk__d khtk__d--bang">Bằng cùng kỳ</span>;
  return (
    <span className={`khtk__d khtk__d--${x > 0 ? "len" : "xuong"}`}>
      {x > 0 ? "▲" : "▼"} {Math.abs(x)} điểm
    </span>
  );
}

function The({ nhan, so, phu, canh }: { nhan: string; so: ReactNode; phu?: ReactNode; canh?: boolean }) {
  return (
    <div className={`khtk__kpi${canh ? " khtk__kpi--canh" : ""}`}>
      <div className="khtk__kpi-lbl">{nhan}</div>
      <div className="khtk__kpi-val">{so}</div>
      <div className="khtk__kpi-sub">{phu}</div>
    </div>
  );
}

function TheCho() {
  return (
    <div className="khtk__kpis" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div className="khtk__kpi" key={i}>
          <span className="kh__skel kh__skel--kpi" />
        </div>
      ))}
    </div>
  );
}

function DaiKhoan({ khoan, ky, onBo }: { khoan: KhoanXem; ky: string; onBo: () => void }) {
  return (
    <div className="khtk__khoan" role="status">
      <span>{khoan.nhan}</span>
      <button type="button" onClick={onBo}>
        Trở về {ky}
      </button>
    </div>
  );
}

function tenKy(sl: SoLieuKhach): string {
  if (sl.loai === "tuy") return `kỳ ${ngayDeDoc(sl.ky.tu)} – ${ngayDeDoc(sl.ky.den)}`;
  return (LOAI_KY.find(([l]) => l === sl.loai)?.[1] ?? "").toLowerCase();
}

/** Số ô tìm gõ xong 300ms mới gửi — gõ "hộp bánh" không bắn 8 yêu cầu. */
function useGoXong(v: string, ms = 300): string {
  const [x, setX] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setX(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return x;
}

/** Số trang gắn với bộ lọc: lọc đổi thì về trang 1 NGAY trong lần dựng đó — đặt lại bằng effect
 *  sẽ bắn một yêu cầu thừa cho trang cũ của bộ lọc mới. */
function useTrangTheoLoc(khoa: string): [number, (t: number) => void] {
  const [x, setX] = useState({ khoa, trang: 1 });
  const trang = x.khoa === khoa ? x.trang : 1;
  return [trang, (t: number) => setX({ khoa, trang: t })];
}

function useDoRong<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function PhanTrang({ trang, tongSo, onTrang }: { trang: number; tongSo: number; onTrang: (t: number) => void }) {
  const soTrang = Math.max(1, Math.ceil(tongSo / CO_TRANG));
  if (soTrang <= 1) return null;
  return (
    <div className="khtk__trang">
      <span>
        {(trang - 1) * CO_TRANG + 1}–{Math.min(trang * CO_TRANG, tongSo)} trong {tongSo}
      </span>
      <Button variant="secondary" disabled={trang <= 1} onClick={() => onTrang(trang - 1)}>
        Trang trước
      </Button>
      <Button variant="secondary" disabled={trang >= soTrang} onClick={() => onTrang(trang + 1)}>
        Trang sau
      </Button>
    </div>
  );
}

// =============================================================================
// Thanh chọn kỳ
// =============================================================================

export function ThanhKy({ sl }: { sl: SoLieuKhach }) {
  const [tu, setTu] = useState(sl.ky.tu);
  const [den, setDen] = useState(sl.ky.den);
  const loi = sl.loai === "tuy" ? loiKhoang(tu, den) : null;
  useEffect(() => {
    setTu(sl.ky.tu);
    setDen(sl.ky.den);
  }, [sl.ky.tu, sl.ky.den]);

  const apTuy = (a: string, b: string) => {
    if (!loiKhoang(a, b)) sl.chonKy("tuy", { tu: a, den: b });
  };
  // Kỳ chưa hết (tháng này, năm nay…) thì cùng kỳ năm trước cũng chỉ tính tới ngày tương ứng.
  return (
    <div className="khtk__ky">
      <div className="khtk__seg" role="group" aria-label="Kỳ xem số liệu">
        {LOAI_KY.map(([l, t]) => (
          <button
            key={l}
            type="button"
            className={sl.loai === l ? "is-on" : undefined}
            aria-pressed={sl.loai === l}
            onClick={() => sl.chonKy(l, l === "tuy" ? { tu: sl.ky.tu, den: sl.ky.den } : undefined)}
          >
            {t}
          </button>
        ))}
      </div>
      {sl.loai === "tuy" && (
        <div className="khtk__tuy">
          <ChonNgay
            className="input"
            aria-label="Từ ngày"
            min="2000-01-01"
            max="2100-12-31"
            value={tu}
            onChange={(v) => {
              setTu(v);
              apTuy(v, den);
            }}
          />
          <span>đến</span>
          <ChonNgay
            className="input"
            aria-label="Đến ngày"
            min="2000-01-01"
            max="2100-12-31"
            value={den}
            onChange={(v) => {
              setDen(v);
              apTuy(tu, v);
            }}
          />
          {loi && <span className="khtk__loi">{loi}</span>}
        </div>
      )}
      <label className="khtk__so">
        <input type="checkbox" checked={sl.soSanh} onChange={(e) => sl.setSoSanh(e.target.checked)} />
        So với cùng kỳ năm trước
      </label>
      <div className="khtk__nhan">
        <b>
          {ngayDeDoc(sl.ky.tu)} – {ngayDeDoc(sl.ky.den)}
        </b>
        {sl.soSanh && (
          <span>
            so với {ngayDeDoc(luiNam(sl.ky.tu))} – {ngayDeDoc(luiNam(sl.ky.den))}
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Tổng quan
// =============================================================================

export function TabTongQuan({ sl, coDon, chinhSach }: { sl: SoLieuKhach; coDon: boolean; chinhSach: ReactNode }) {
  const { tk, soSanh } = sl;
  if (sl.loiTk) return <div className="banner banner--error" role="alert">{sl.loiTk}</div>;
  if (!tk)
    return (
      <div className="khtk__tab">
        <TheCho />
      </div>
    );
  const { don, don_cu: cu, bao_gia: bg, bao_gia_cu: bgCu, nhip } = tk;
  const tre = nhip ? nhip.so_ngay_tu_lan_cuoi - nhip.tb_ngay : 0;

  return (
    <div className="khtk__tab">
      <div className="khtk__kpis">
        <The
          nhan="Doanh số"
          so={tienGon(don.doanh_so)}
          phu={
            <>
              {/* Hai kỳ cùng 0 thì một dòng "Cùng kỳ 0 đ" là đủ, khỏi thêm nhãn "Cùng kỳ: 0". */}
              <Doi nay={don.doanh_so} cu={cu.doanh_so} hien={soSanh && (don.doanh_so > 0 || cu.doanh_so > 0)} />
              {soSanh && <span>Cùng kỳ {tienGon(cu.doanh_so)}</span>}
            </>
          }
        />
        <The
          nhan="Số đơn đã chốt"
          so={`${don.so_don} đơn`}
          phu={<Doi nay={don.so_don} cu={cu.so_don} kieu="so" hien={soSanh} />}
        />
        <The
          nhan="Trung bình một đơn"
          so={don.tb_don == null ? "—" : tienGon(don.tb_don)}
          phu={don.tb_don != null && cu.tb_don != null && <Doi nay={don.tb_don} cu={cu.tb_don} hien={soSanh} />}
        />
        <The
          nhan="Nhịp đặt hàng"
          so={nhip ? `${nhip.tb_ngay} ngày/đơn` : "—"}
          phu={
            nhip && sl.ky.den >= sl.homNay ? (
              <>
                <span>Lần cuối {nhip.so_ngay_tu_lan_cuoi} ngày trước</span>
                {tre > 7 ? (
                  <span className="khtk__pill khtk__pill--bad">Quá nhịp {tre} ngày</span>
                ) : tre > 0 ? (
                  <span className="khtk__pill khtk__pill--warn">Tới lúc đặt</span>
                ) : (
                  <span className="khtk__pill khtk__pill--ok">Đúng nhịp</span>
                )}
              </>
            ) : nhip ? (
              <span>Trung bình trong kỳ</span>
            ) : (
              <span>Cần ít nhất 2 đơn để tính</span>
            )
          }
        />
        <The
          nhan="Tỉ lệ chốt báo giá"
          so={bg.ti_le == null ? "—" : `${bg.ti_le}%`}
          phu={
            <>
              <span>
                {bg.da_chao ? `${bg.thang}/${bg.da_chao} báo giá đã gửi khách` : "Chưa gửi báo giá nào trong kỳ"}
              </span>
              <DoiDiem nay={bg.ti_le} cu={bgCu.ti_le} hien={soSanh} />
            </>
          }
        />
      </div>

      <section className="khtk__card">
        <div className="khtk__card-hd">
          <h3>Doanh số theo {TEN_BUOC[tk.buoc]}</h3>
          <span className="khtk__phu">Đơn vị: triệu đ</span>
          <div className="khtk__r">
            <div className="khtk__legend">
              <span>
                <i className="khtk__leg-nay" />
                Kỳ này
              </span>
              {soSanh && (
                <span>
                  <i className="khtk__leg-cu" />
                  Cùng kỳ năm trước
                </span>
              )}
            </div>
            <div className="khtk__seg khtk__seg--nho" role="group" aria-label="Bước biểu đồ">
              {(
                [
                  ["auto", "Tự động"],
                  ["tuan", "Tuần"],
                  ["thang", "Tháng"],
                  ["quy", "Quý"],
                ] as [BuocChon, string][]
              ).map(([b, t]) => (
                <button
                  key={b}
                  type="button"
                  className={sl.buocChon === b ? "is-on" : undefined}
                  aria-pressed={sl.buocChon === b}
                  onClick={() => sl.setBuocChon(b)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        {coDon ? (
          <>
            <BieuDo cot={tk.cot} buoc={tk.buoc} soSanh={soSanh} onChon={sl.xemCot} />
            <div className="khtk__hint">
              {tk.buoc !== sl.buoc && <>Kỳ dài nên gộp theo {TEN_BUOC[tk.buoc]}. </>}
              Bấm vào một cột để xem các đơn trong khoảng đó.
            </div>
          </>
        ) : (
          <div className="khtk__rong">Khách chưa có đơn nào. Biểu đồ sẽ hiện khi có đơn đầu tiên.</div>
        )}
      </section>

      <section className="khtk__card">
        <div className="khtk__card-hd">
          <h3>Nhịp và tần suất đặt hàng</h3>
        </div>
        <TanSuat tk={tk} ky={sl.ky} homNay={sl.homNay} />
      </section>

      <section className="khtk__card">
        <div className="khtk__card-hd">
          <h3>Sản phẩm mua trong kỳ</h3>
          <span className="khtk__phu">{don.so_don} đơn đã chốt</span>
        </div>
        {tk.san_pham.length === 0 ? (
          <div className="khtk__rong">Không có đơn đã chốt trong kỳ này.</div>
        ) : (
          <div className="khtk__tblwrap">
            <table className="khtk__tbl">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th className="khtk__num">Doanh số</th>
                  <th className="khtk__num">Tỉ trọng</th>
                  <th className="khtk__num">Số lần</th>
                  <th className="khtk__num">Lần cuối</th>
                </tr>
              </thead>
              <tbody>
                {tk.san_pham.map((p) => {
                  const pt = don.doanh_so > 0 ? Math.round((p.doanh_so / don.doanh_so) * 100) : 0;
                  return (
                    <tr key={p.ten}>
                      <td>
                        <div className="khtk__ma">{p.ten}</div>
                        {soSanh && (
                          <div className="khtk__duoi">
                            <Doi nay={p.doanh_so} cu={p.doanh_so_cu} hien />
                          </div>
                        )}
                      </td>
                      <td className="khtk__num">
                        <b>{tienGon(p.doanh_so)}</b>
                      </td>
                      <td className="khtk__num">
                        <div className="khtk__tytrong">
                          <span>
                            <i style={{ width: `${pt}%` }} />
                          </span>
                          {pt}%
                        </div>
                      </td>
                      <td className="khtk__num">{p.so_lan}</td>
                      <td className="khtk__num">{ngayDeDoc(p.lan_cuoi)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="khtk__chinh-sach">{chinhSach}</div>
    </div>
  );
}

function BieuDo({
  cot,
  buoc,
  soSanh,
  onChon,
}: {
  cot: CotBieuDo[];
  buoc: BuocBieuDo;
  soSanh: boolean;
  onChon: (c: CotBieuDo, nhan: string) => void;
}) {
  const [ref, W] = useDoRong<HTMLDivElement>();
  const [tro, setTro] = useState<number | null>(null);
  const H = 240,
    L = 40,
    B = 26,
    T = 10;
  const nhan = useMemo(() => cot.map((c, i) => nhanCot(c.tu, c.den, buoc, i === 0)), [cot, buoc]);
  const max = Math.max(1, ...cot.map((c) => Math.max(c.doanh_so, soSanh ? c.doanh_so_cu : 0)));
  const st = buocTruc(max);
  const dinh = Math.ceil(max / st) * st;
  const y = (v: number) => T + (H - T - B) * (1 - v / dinh);
  const w = cot.length ? (W - L) / cot.length : 0;
  const bw = Math.max(2, Math.min(46, w * (soSanh ? 0.36 : 0.6)));
  const cachNhan = Math.max(1, Math.ceil(cot.length / Math.max(1, Math.floor((W - L) / 52))));
  const vach: number[] = [];
  for (let v = 0; v <= dinh; v += st) vach.push(v);
  const c = tro != null ? cot[tro] : null;

  return (
    <div className="khtk__chart" ref={ref} onMouseLeave={() => setTro(null)}>
      {W > 0 && (
        <svg width={W} height={H} role="img" aria-label="Biểu đồ doanh số theo kỳ">
          {vach.map((v) => (
            <g key={v}>
              <line className="khtk__grid" x1={L} x2={W} y1={y(v)} y2={y(v)} />
              <text className="khtk__ax" x={L - 8} y={y(v) + 4} textAnchor="end">
                {Math.round(v / 1_000_000).toLocaleString("vi-VN")}
              </text>
            </g>
          ))}
          {cot.map((k, i) => {
            const cx = L + w * i + w / 2;
            const bx = soSanh ? cx + 1 : cx - bw / 2;
            return (
              <g key={k.tu}>
                {soSanh && k.doanh_so_cu > 0 && (
                  <rect className="khtk__bar-cu" x={cx - bw - 1} y={y(k.doanh_so_cu)} width={bw} height={H - B - y(k.doanh_so_cu)} rx={2} />
                )}
                {k.doanh_so > 0 && (
                  <rect
                    className={`khtk__bar${tro === i ? " is-tro" : ""}`}
                    x={bx}
                    y={y(k.doanh_so)}
                    width={bw}
                    height={H - B - y(k.doanh_so)}
                    rx={2}
                  />
                )}
                <rect
                  className="khtk__hot"
                  x={L + w * i}
                  y={0}
                  width={w}
                  height={H - B}
                  onMouseEnter={() => setTro(i)}
                  onClick={() => onChon(k, nhan[i].du)}
                >
                  <title>{nhan[i].du}</title>
                </rect>
                {i % cachNhan === 0 && (
                  <text className="khtk__ax" x={cx} y={H - 8} textAnchor="middle">
                    {nhan[i].ngan}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {c && tro != null && (
        <div
          className="khtk__tip"
          style={{
            left: Math.min(L + w * tro + w / 2 + 12, Math.max(0, W - 230)),
            top: Math.max(0, y(Math.max(c.doanh_so, soSanh ? c.doanh_so_cu : 0)) - 10),
          }}
        >
          <b>{nhan[tro].du}</b>
          <span>
            Kỳ này: {tienGon(c.doanh_so)}, {c.so_don} đơn
          </span>
          {soSanh && (
            <span>
              Cùng kỳ: {tienGon(c.doanh_so_cu)}, {c.so_don_cu} đơn
            </span>
          )}
          <span className="khtk__tip-goi">Bấm để xem các đơn</span>
        </div>
      )}
    </div>
  );
}

const THU = ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"];

interface O {
  khoa: string;
  cot: number;
  hang: number;
  tu: string;
  den: string;
  sau?: boolean; // sau hôm nay (chỉ để thấy ngày dự kiến)
}

/** Ô của lịch tần suất. Kỳ ≤ 1 năm: mỗi ô một NGÀY, cột = tuần (T2→CN), kiểu lịch đóng góp GitHub.
 *  Kỳ dài hơn: mỗi ô một TUẦN, mỗi hàng một năm — 10 năm vẫn gọn trong khung. */
function chiaO(tu: string, den: string, duKien: string | null): { theoNgay: boolean; o: O[]; soCot: number; nhanHang: string[] } {
  if (soNgay(tu, den) <= 371) {
    const thuDau = (new Date(tu + "T00:00:00Z").getUTCDay() + 6) % 7;
    const batDau = congNgay(tu, -thuDau);
    const cuoi = duKien && duKien > den ? duKien : den;
    const o: O[] = [];
    for (let d = tu; d <= cuoi; d = congNgay(d, 1)) {
      const k = soNgay(batDau, d);
      o.push({ khoa: d, cot: Math.floor(k / 7), hang: k % 7, tu: d, den: d, sau: d > den });
    }
    return { theoNgay: true, o, soCot: Math.floor(soNgay(batDau, cuoi) / 7) + 1, nhanHang: ["T2", "", "T4", "", "T6", "", ""] };
  }
  const y0 = Number(tu.slice(0, 4));
  const y1 = Number(den.slice(0, 4));
  const o: O[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let w = 0; w < 53; w++) {
      const a = congNgay(`${y}-01-01`, w * 7);
      const b = w === 52 ? `${y}-12-31` : congNgay(a, 6);
      if (a.slice(0, 4) !== String(y) || b < tu || a > den) continue;
      o.push({ khoa: a, cot: w, hang: y - y0, tu: a < tu ? tu : a, den: b > den ? den : b });
    }
  }
  return { theoNgay: false, o, soCot: 53, nhanHang: Array.from({ length: y1 - y0 + 1 }, (_, i) => String(y0 + i)) };
}

/** Nhịp + lịch tần suất đặt hàng THEO KỲ đang chọn (đổi cùng biểu đồ phía trên). Ô đậm theo giá
 *  trị đơn chốt — tháng nhiều đơn thì nhiều ô đậm, không chồng lên nhau như chấm trên trục. */
function TanSuat({ tk, ky, homNay }: { tk: ThongKeKhach; ky: KyXem; homNay: string }) {
  const [ref, W] = useDoRong<HTMLDivElement>();
  const n = tk.nhip;
  // Chuyện "có nên gọi" chỉ có nghĩa khi kỳ chạy tới hôm nay.
  const toiNay = ky.den >= homNay;
  const tre = n ? n.so_ngay_tu_lan_cuoi - n.tb_ngay : 0;

  const luoi = useMemo(() => {
    const duKien = toiNay && n && n.du_kien > homNay && soNgay(homNay, n.du_kien) <= 56 ? n.du_kien : null;
    const chia = chiaO(ky.tu, ky.den, duKien);
    const gop = new Map<string, { so: number; tien: number; huy: number }>();
    // Đơn rơi vào ô nào: ô ngày khớp đúng ngày; ô tuần thì tìm theo khoảng (ít ô, ít đơn — duyệt thẳng).
    const oCua = (ngay: string) =>
      chia.theoNgay ? ngay : chia.o.find((x) => x.tu <= ngay && ngay <= x.den)?.khoa;
    for (const d of tk.diem_don) {
      const k = oCua(d.ngay);
      if (!k) continue;
      const x = gop.get(k) ?? { so: 0, tien: 0, huy: 0 };
      if (d.huy) x.huy += 1;
      else {
        x.so += 1;
        x.tien += d.tong;
      }
      gop.set(k, x);
    }
    const maxTien = Math.max(1, ...[...gop.values()].map((x) => x.tien));
    // Nhãn tháng phía trên: ở cột đầu tiên chứa ngày 1 của tháng (hoặc cột đầu kỳ).
    const nhanCotTren = new Map<number, string>();
    if (chia.theoNgay) {
      for (const x of chia.o) {
        if ((x.tu.endsWith("-01") || x.tu === ky.tu) && !x.sau) {
          const m = Number(x.tu.slice(5, 7));
          const thang = m === 1 || x.tu === ky.tu ? `T${m}/${x.tu.slice(2, 4)}` : `T${m}`;
          if (!nhanCotTren.has(x.cot)) nhanCotTren.set(x.cot, thang);
        }
      }
    } else {
      for (let m = 1; m <= 12; m++) nhanCotTren.set(Math.floor(soNgay(`2001-01-01`, `2001-${String(m).padStart(2, "0")}-01`) / 7), `T${m}`);
    }
    return { ...chia, gop, maxTien, duKien, nhanCotTren };
  }, [tk.diem_don, ky.tu, ky.den, homNay, n, toiNay]);

  const soHang = luoi.nhanHang.length;
  const NHAN_TRAI = luoi.theoNgay ? 26 : 38;
  const GAP = 3;
  const o = Math.max(8, Math.min(luoi.theoNgay ? 20 : 14, Math.floor((W - NHAN_TRAI) / luoi.soCot) - GAP));
  const buoc = o + GAP;
  const cao = 18 + soHang * buoc;

  let cau: ReactNode;
  if (!n) cau = <>Kỳ này chưa đủ 2 đơn đã chốt để tính nhịp đặt hàng.</>;
  else if (!toiNay) cau = <>Trong kỳ khách đặt trung bình <b>{n.tb_ngay} ngày một lần</b>.</>;
  else if (tre > 7)
    cau = (
      <>
        Khách thường đặt <b>{n.tb_ngay} ngày một lần</b>, lần này đã <b>{n.so_ngay_tu_lan_cuoi} ngày</b> chưa đặt, quá nhịp{" "}
        {tre} ngày. Nên gọi hỏi nhu cầu.
      </>
    );
  else if (tre > 0)
    cau = (
      <>
        Khách thường đặt <b>{n.tb_ngay} ngày một lần</b>, đã {n.so_ngay_tu_lan_cuoi} ngày từ đơn cuối. Đã tới lúc đặt đơn mới.
      </>
    );
  else
    cau = (
      <>
        Khách thường đặt <b>{n.tb_ngay} ngày một lần</b>. Đơn tới dự kiến khoảng <b>{ngayDeDoc(n.du_kien)}</b>.
      </>
    );

  return (
    <div className="khtk__ts">
      <div className="khtk__ts-cau">{cau}</div>

      <div ref={ref} className="khtk__ts-luoi">
        {W > 0 && (
          <svg width={Math.min(W, NHAN_TRAI + luoi.soCot * buoc)} height={cao} role="img" aria-label="Lịch tần suất đặt hàng trong kỳ">
            {luoi.nhanHang.map((t, i) =>
              t ? (
                <text key={i} className="khtk__ax" x={0} y={18 + i * buoc + o - 1}>
                  {t}
                </text>
              ) : null,
            )}
            {[...luoi.nhanCotTren].map(([c, t]) => (
              <text key={c} className="khtk__ax" x={NHAN_TRAI + c * buoc} y={11}>
                {t}
              </text>
            ))}
            {luoi.o.map((x) => {
              const g = luoi.gop.get(x.khoa);
              const muc = g && g.so ? Math.max(1, Math.ceil((g.tien / luoi.maxTien) * 4)) : 0;
              const lop = [
                "khtk__o",
                `khtk__o--${muc}`,
                x.sau ? "khtk__o--sau" : "",
                luoi.theoNgay && x.khoa === homNay ? "khtk__o--nay" : "",
                x.khoa === luoi.duKien ? "khtk__o--dk" : "",
                g && g.huy && !g.so ? "khtk__o--huy" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const nhan = luoi.theoNgay ? `${THU[x.hang]}, ${ngayDeDoc(x.tu)}` : `Tuần ${ngayDeDoc(x.tu)} – ${ngayDeDoc(x.den)}`;
              return (
                <rect key={x.khoa} className={lop} x={NHAN_TRAI + x.cot * buoc} y={18 + x.hang * buoc} width={o} height={o} rx={2}>
                  <title>
                    {nhan}
                    {luoi.theoNgay && x.khoa === homNay ? " (hôm nay)" : ""}
                    {x.khoa === luoi.duKien ? " (dự kiến đơn tới)" : ""}
                    {g && g.so ? `: ${g.so} đơn, ${tienGon(g.tien)}` : x.sau ? "" : ": không có đơn"}
                    {g && g.huy ? `, ${g.huy} đơn huỷ` : ""}
                  </title>
                </rect>
              );
            })}
          </svg>
        )}
      </div>

      <div className="khtk__ts-chan">
        <div className="khtk__ts-so">
          <span>
            Số đơn<b>{n ? n.so_don : tk.diem_don.filter((d) => !d.huy).length}</b>
          </span>
          {n && (
            <>
              <span>
                Đơn cuối<b>{ngayDeDoc(n.lan_cuoi)}</b>
              </span>
              {toiNay && (
                <span>
                  Dự kiến đơn tới<b>{ngayDeDoc(n.du_kien)}</b>
                </span>
              )}
              <span>
                Nhanh nhất<b>{n.nhanh_nhat} ngày</b>
              </span>
              <span>
                Lâu nhất<b>{n.lau_nhat} ngày</b>
              </span>
            </>
          )}
        </div>
        <div className="khtk__ts-chu" aria-hidden="true">
          <span>Ít</span>
          {[0, 1, 2, 3, 4].map((m) => (
            <i key={m} className={`khtk__o--${m}`} />
          ))}
          <span>Nhiều</span>
          {luoi.duKien && (
            <>
              <i className="khtk__ts-dk" />
              <span>Dự kiến</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Lịch sử mua hàng
// =============================================================================

const NHOM_DON: [string, string][] = [
  ["", "Tất cả"],
  ["chot", "Đã chốt"],
  ["nhap", "Nháp"],
  ["huy", "Đã huỷ"],
];
const TT_DON: Record<string, [string, string]> = {
  ordered: ["Đã chốt", "xanh"],
  hoan_tat: ["Hoàn tất", "la"],
  draft: ["Nháp", "slate"],
  on_hold: ["Tạm giữ", "cam"],
  change_order: ["Đã đổi", "tim"],
  cancelled: ["Đã huỷ", "xam"],
};

export function TabMuaHang({ sl, code }: { sl: SoLieuKhach; code: string }) {
  const khoan = sl.khoanDon;
  return <LichSuDon key={khoan?.ma ?? "ky"} sl={sl} code={code} khoan={khoan} />;
}

function LichSuDon({ sl, code, khoan }: { sl: SoLieuKhach; code: string; khoan: KhoanXem | null }) {
  const { token } = useAuth();
  const [tim, setTim] = useState(khoan?.q ?? "");
  const q = useGoXong(tim.trim());
  const [nhom, setNhom] = useState("");
  const [sapXep, setSapXep] = useState("-ngay");
  const [kq, setKq] = useState<TrangDon | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangXuat, setDangXuat] = useState(false);
  const range: KyXem = khoan ?? sl.ky;
  const [trang, setTrang] = useTrangTheoLoc(`${range.tu}|${range.den}|${q}|${nhom}|${sapXep}`);
  useEffect(() => {
    if (!token) return;
    let huy = false;
    setLoi(null);
    const loc = { q, nhom, sap_xep: sapXep, trang, co: CO_TRANG };
    sl.lay(`don|${range.tu}|${range.den}|${q}|${nhom}|${sapXep}|${trang}`, () =>
      api.customers.orderHistory(token, sl.customerId, range, loc),
    )
      .then((r) => !huy && setKq(r))
      .catch(() => !huy && setLoi("Không tải được lịch sử mua hàng."));
    return () => {
      huy = true;
    };
    // range là object mới mỗi lần dựng — so theo hai ngày.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sl.customerId, sl.lay, range.tu, range.den, q, nhom, sapXep, trang]);

  async function xuat() {
    if (!token) return;
    setDangXuat(true);
    try {
      const url = await api.customers.orderCsvBlobUrl(token, sl.customerId, range, { q, nhom });
      const a = document.createElement("a");
      a.href = url;
      a.download = `lich-su-mua-hang-${code}-${range.tu}-${range.den}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setLoi("Xuất Excel không thành công.");
    } finally {
      setDangXuat(false);
    }
  }

  // Cùng kỳ: kỳ chung lấy từ thống kê đã tải; khoảng bấm từ biểu đồ lấy từ chính cột đó.
  // Đang gõ tìm thì không so — số cùng kỳ không lọc theo ô tìm, đặt cạnh nhau là so sai.
  const cu = q ? null : khoan ? khoan.cu ?? null : sl.tk ? { doanh_so: sl.tk.don_cu.doanh_so, so_don: sl.tk.don_cu.so_don } : null;
  const hienDoi = sl.soSanh && cu != null;
  const sx = (cot: "ngay" | "tien") => setSapXep((s) => (s === `-${cot}` ? cot : `-${cot}`));
  const mui = (cot: "ngay" | "tien") => (sapXep === cot ? "▲" : "▼");

  return (
    <div className="khtk__tab">
      {khoan && <DaiKhoan khoan={khoan} ky={tenKy(sl)} onBo={sl.boKhoan} />}
      {loi && <div className="banner banner--error" role="alert">{loi}</div>}
      {!kq ? (
        <TheCho />
      ) : (
        <div className="khtk__kpis">
          <The
            nhan="Giá trị đơn đã chốt"
            so={tienGon(kq.tien_chot)}
            phu={cu && <Doi nay={kq.tien_chot} cu={cu.doanh_so} hien={hienDoi} />}
          />
          <The
            nhan="Số đơn đã chốt"
            so={`${kq.dem.chot ?? 0} đơn`}
            phu={cu && <Doi nay={kq.dem.chot ?? 0} cu={cu.so_don} kieu="so" hien={hienDoi} />}
          />
          <The
            nhan="Trung bình một đơn"
            so={kq.dem.chot ? tienGon(Math.round(kq.tien_chot / kq.dem.chot)) : "—"}
            phu={
              cu &&
              kq.dem.chot > 0 &&
              cu.so_don > 0 && (
                <Doi nay={kq.tien_chot / kq.dem.chot} cu={cu.doanh_so / cu.so_don} hien={hienDoi} />
              )
            }
          />
          <The
            nhan="Đơn huỷ"
            so={`${kq.dem.huy ?? 0} đơn`}
            phu={<span>{kq.dem.huy ? `${tienGon(kq.tien_huy)} bị huỷ` : "Không có"}</span>}
          />
        </div>
      )}

      <section className="khtk__card">
        <div className="khtk__loc">
          <input
            type="search"
            className="input khtk__tim"
            placeholder="Tìm mã đơn, sản phẩm, mã báo giá…"
            value={tim}
            onChange={(e) => setTim(e.target.value)}
          />
          <div className="khtk__chips" role="group" aria-label="Lọc trạng thái đơn">
            {NHOM_DON.map(([v, t]) => {
              const so = kq ? (v ? kq.dem[v] ?? 0 : Object.values(kq.dem).reduce((a, b) => a + b, 0)) : null;
              return (
                <button
                  key={v}
                  type="button"
                  className={`khtk__chip${nhom === v ? " is-on" : ""}`}
                  aria-pressed={nhom === v}
                  onClick={() => setNhom(v)}
                >
                  {t} {so != null && <b>{so}</b>}
                </button>
              );
            })}
          </div>
          <Button variant="secondary" onClick={xuat} loading={dangXuat} disabled={!kq || kq.tong_so === 0}>
            <Download size={15} /> Xuất Excel
          </Button>
        </div>
        {!kq ? null : kq.items.length === 0 ? (
          <div className="khtk__rong">
            {q || nhom ? "Không có đơn nào khớp kỳ và bộ lọc đang chọn." : "Không có đơn nào trong kỳ này."}
          </div>
        ) : (
          <>
            <div className="khtk__tblwrap">
              <table className="khtk__tbl">
                <thead>
                  <tr>
                    <th className={`khtk__sx${sapXep.endsWith("ngay") ? " is-on" : ""}`} onClick={() => sx("ngay")}>
                      Mã đơn, ngày đặt <span className="khtk__mui">{mui("ngay")}</span>
                    </th>
                    <th>Sản phẩm</th>
                    <th>Từ báo giá</th>
                    <th
                      className={`khtk__num khtk__sx${sapXep.endsWith("tien") ? " is-on" : ""}`}
                      onClick={() => sx("tien")}
                    >
                      Giá trị <span className="khtk__mui">{mui("tien")}</span>
                    </th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {kq.items.map((o) => {
                    const [tt, tone] = TT_DON[o.status] ?? [o.status, "mute"];
                    return (
                      <tr key={o.id}>
                        <td>
                          <div className="khtk__ma">{o.order_no}</div>
                          <div className="khtk__nho">{ngayDeDoc(o.created_at)}</div>
                        </td>
                        <td className="khtk__sp">
                          {o.san_pham.length ? o.san_pham.join(", ") : <span className="khtk__mute">Chưa có dòng hàng</span>}
                          <div className="khtk__nho">
                            {o.san_pham.length > 1 && <span>{o.san_pham.length} dòng hàng</span>}
                            {o.order_kind === "bo_sung" && <span>Đơn bổ sung</span>}
                          </div>
                        </td>
                        <td>
                          {o.bao_gia_ma ? (
                            <button type="button" className="khtk__lnk" onClick={() => sl.xemBaoGia(o.bao_gia_ma!, o.created_at)}>
                              {o.bao_gia_ma}
                            </button>
                          ) : (
                            <span className="khtk__mute">—</span>
                          )}
                        </td>
                        <td className={`khtk__num${o.status === "cancelled" ? " khtk__gach" : ""}`}>
                          <b>{tienGon(o.tong)}</b>
                        </td>
                        <td>
                          <span className={`khtk__pill khtk__pill--${tone}`}>{tt}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {(nhom === "" || nhom === "chot") && (
                  <tfoot>
                    <tr>
                      <td colSpan={3}>
                        Cộng {kq.dem.chot ?? 0} đơn đã chốt khớp bộ lọc (không tính nháp, đơn huỷ)
                      </td>
                      <td className="khtk__num">{tienGon(kq.tien_chot)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <PhanTrang trang={trang} tongSo={kq.tong_so} onTrang={setTrang} />
          </>
        )}
      </section>
    </div>
  );
}

// =============================================================================
// Lịch sử báo giá
// =============================================================================

const NHOM_BG: [string, string][] = [
  ["", "Tất cả"],
  ["cho", "Đang chờ"],
  ["thanh_don", "Thành đơn"],
  ["tu_choi", "Từ chối"],
  ["het_han", "Hết hạn"],
  ["chua_gui", "Chưa gửi"],
  ["huy", "Đã huỷ"],
];
const KQ_BG: Record<string, [string, string]> = {
  cho: ["Đã gửi, chờ khách", "cyan"],
  thanh_don: ["Thành đơn", "tim"],
  tu_choi: ["Khách từ chối", "do"],
  het_han: ["Hết hạn", "cam"],
  huy: ["Đã huỷ", "xam"],
};
const CHUA_GUI: Record<string, string> = { draft: "Nháp", pending_approval: "Chờ duyệt", approved: "Đã duyệt, chưa gửi" };
const CHUA_GUI_SAC: Record<string, string> = { draft: "slate", pending_approval: "vang", approved: "xanh" };

export function TabBaoGia({ sl, onOpenQuote }: { sl: SoLieuKhach; onOpenQuote: (id: number) => void }) {
  const khoan = sl.khoanBg;
  return <LichSuBaoGia key={khoan?.ma ?? "ky"} sl={sl} khoan={khoan} onOpenQuote={onOpenQuote} />;
}

function HieuLuc({ b, homNay }: { b: DongBaoGia; homNay: string }) {
  if (b.nhom === "thanh_don" || b.nhom === "tu_choi" || b.nhom === "huy" || !b.valid_until)
    return <span className="khtk__mute">—</span>;
  const con = soNgay(homNay, b.valid_until);
  if (con < 0) return <span className="khtk__mute">Hết {ngayDeDoc(b.valid_until)}</span>;
  if (b.nhom === "chua_gui") return <span className="khtk__mute">Đến {ngayDeDoc(b.valid_until)}</span>;
  return (
    <>
      <span className={`khtk__pill khtk__pill--${con <= 7 ? "bad" : "ok"}`}>
        {con === 0 ? "Hết hạn hôm nay" : `Còn ${con} ngày`}
      </span>
      <div className="khtk__nho">đến {ngayDeDoc(b.valid_until)}</div>
    </>
  );
}

function LichSuBaoGia({
  sl,
  khoan,
  onOpenQuote,
}: {
  sl: SoLieuKhach;
  khoan: KhoanXem | null;
  onOpenQuote: (id: number) => void;
}) {
  const { token } = useAuth();
  const [tim, setTim] = useState(khoan?.q ?? "");
  const q = useGoXong(tim.trim());
  const [nhom, setNhom] = useState("");
  const [kq, setKq] = useState<TrangBaoGia | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const range: KyXem = khoan ?? sl.ky;
  const [trang, setTrang] = useTrangTheoLoc(`${range.tu}|${range.den}|${q}|${nhom}`);
  useEffect(() => {
    if (!token) return;
    let huy = false;
    setLoi(null);
    sl.lay(`bg|${range.tu}|${range.den}|${q}|${nhom}|${trang}`, () =>
      api.customers.quoteHistory(token, sl.customerId, range, { q, nhom, trang, co: CO_TRANG }),
    )
      .then((r) => !huy && setKq(r))
      .catch(() => !huy && setLoi("Không tải được lịch sử báo giá."));
    return () => {
      huy = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sl.customerId, sl.lay, range.tu, range.den, q, nhom, trang]);

  const { tk, soSanh } = sl;
  return (
    <div className="khtk__tab">
      {khoan && <DaiKhoan khoan={khoan} ky={tenKy(sl)} onBo={sl.boKhoan} />}
      {loi && <div className="banner banner--error" role="alert">{loi}</div>}
      {!tk ? (
        <TheCho />
      ) : (
        <div className="khtk__kpis">
          <The
            nhan="Báo giá đã lập"
            so={tk.bao_gia.so_bg}
            phu={<Doi nay={tk.bao_gia.so_bg} cu={tk.bao_gia_cu.so_bg} kieu="so" hien={soSanh} />}
          />
          <The
            nhan="Tổng giá trị đã báo"
            so={tienGon(tk.bao_gia.tong_gia_tri)}
            phu={<Doi nay={tk.bao_gia.tong_gia_tri} cu={tk.bao_gia_cu.tong_gia_tri} hien={soSanh} />}
          />
          <The
            nhan="Tỉ lệ thành đơn"
            so={tk.bao_gia.ti_le == null ? "—" : `${tk.bao_gia.ti_le}%`}
            phu={
              <>
                <span>
                  {tk.bao_gia.da_chao
                    ? `${tk.bao_gia.thang}/${tk.bao_gia.da_chao} đã gửi khách`
                    : "Chưa gửi báo giá nào trong kỳ"}
                </span>
                <DoiDiem nay={tk.bao_gia.ti_le} cu={tk.bao_gia_cu.ti_le} hien={soSanh} />
              </>
            }
          />
          <The
            nhan="Từ báo đến chốt"
            so={tk.bao_gia.tb_ngay_chot == null ? "—" : `${tk.bao_gia.tb_ngay_chot} ngày`}
            phu={<span>Trung bình</span>}
          />
          <The
            nhan="Đang chờ khách trả lời"
            canh={tk.dang_cho.sap_het_han > 0}
            so={`${tk.dang_cho.so} báo giá`}
            phu={
              <>
                <span>{tienGon(tk.dang_cho.tong)}</span>
                {tk.dang_cho.sap_het_han > 0 && (
                  <span className="khtk__pill khtk__pill--bad">{tk.dang_cho.sap_het_han} sắp hết hạn</span>
                )}
              </>
            }
          />
        </div>
      )}

      <section className="khtk__card">
        <div className="khtk__loc">
          <input
            type="search"
            className="input khtk__tim"
            placeholder="Tìm mã báo giá hoặc mã đơn…"
            value={tim}
            onChange={(e) => setTim(e.target.value)}
          />
          <div className="khtk__chips" role="group" aria-label="Lọc kết quả báo giá">
            {NHOM_BG.map(([v, t]) => {
              const so = kq ? (v ? kq.dem[v] ?? 0 : Object.values(kq.dem).reduce((a, b) => a + b, 0)) : null;
              // "Đã huỷ" hiếm — không có thì khỏi chiếm chỗ.
              if (v === "huy" && !so && nhom !== "huy") return null;
              return (
                <button
                  key={v}
                  type="button"
                  className={`khtk__chip${nhom === v ? " is-on" : ""}`}
                  aria-pressed={nhom === v}
                  onClick={() => setNhom(v)}
                >
                  {t} {so != null && <b>{so}</b>}
                </button>
              );
            })}
          </div>
        </div>
        {!kq ? null : kq.items.length === 0 ? (
          <div className="khtk__rong">
            {q || nhom ? "Không có báo giá nào khớp kỳ và bộ lọc đang chọn." : "Không có báo giá nào trong kỳ này."}
          </div>
        ) : (
          <>
            <div className="khtk__tblwrap">
              <table className="khtk__tbl">
                <thead>
                  <tr>
                    <th>Mã báo giá, ngày lập</th>
                    <th className="khtk__num">Giá trị</th>
                    <th>Hiệu lực</th>
                    <th>Kết quả</th>
                    <th>Thành đơn</th>
                  </tr>
                </thead>
                <tbody>
                  {kq.items.map((b) => {
                    const [kqChu, tone] =
                      b.nhom === "chua_gui" ? [CHUA_GUI[b.status] ?? "Chưa gửi", CHUA_GUI_SAC[b.status] ?? "slate"] : KQ_BG[b.nhom] ?? [b.status, "mute"];
                    return (
                      <tr key={b.id}>
                        <td>
                          <button
                            type="button"
                            className="khtk__lnk khtk__ma"
                            title={`Mở báo giá ${b.code}`}
                            onClick={() => onOpenQuote(b.id)}
                          >
                            {b.code}
                          </button>
                          {b.version > 1 && <span className="khtk__ban">Bản {b.version}</span>}
                          <div className="khtk__nho">{ngayDeDoc(b.created_at)}</div>
                        </td>
                        <td className="khtk__num">
                          <b>{tienGon(b.total)}</b>
                        </td>
                        <td>
                          <HieuLuc b={b} homNay={sl.homNay} />
                        </td>
                        <td>
                          <span className={`khtk__pill khtk__pill--${tone}`}>{kqChu}</span>
                        </td>
                        <td>
                          {b.don_ma && b.don_ngay ? (
                            <>
                              <button type="button" className="khtk__lnk" onClick={() => sl.xemDon(b.don_ma!, b.don_ngay!)}>
                                {b.don_ma}
                              </button>
                              <div className="khtk__nho">
                                sau {Math.max(0, soNgay(ngayCuaMoc(b.created_at), ngayCuaMoc(b.don_ngay)))} ngày
                              </div>
                            </>
                          ) : b.nhom === "thanh_don" ? (
                            <span className="khtk__mute">Chưa lên đơn</span>
                          ) : (
                            <span className="khtk__mute">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PhanTrang trang={trang} tongSo={kq.tong_so} onTrang={setTrang} />
          </>
        )}
      </section>
    </div>
  );
}
