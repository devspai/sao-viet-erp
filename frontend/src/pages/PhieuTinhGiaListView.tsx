// MASTER của "Tính giá" — danh sách phiếu tính giá (giá vốn). Bấm dòng → detail. Nút "+ Lập phiếu
// tính giá" mở form nháp. Lưới đặc kiểu bảng tính (phương án A, 07/10/2026 — components/LuoiDs).
import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type PhieuTinhGiaListItem,
  type PhieuTinhGiaStatsOut,
} from "../api/client";
import { useCan } from "../auth/permissions";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { EmptyRow } from "../components/EmptyState";
import {
  CuonLuoi,
  ChipTT,
  ChonCot,
  LocNhanhTrangThai,
  OTim,
  TieuDeSapXep,
  ngayVN,
  soVN,
  tenKhachGon,
  rongLuoi,
  useCauHinhLuoi,
  type CotLuoi,
  type MauTT,
  type MucLocNhanh,
} from "../components/LuoiDs";
import { LocNguoiPhuTrach } from "../components/LocNguoiPhuTrach";
import { PhanTrangDayDu } from "../components/PhanTrangDayDu";
import { LOC_TG_TRONG, locTGLenUrl, locTGTuUrl, thamSoLocTG, useDieuKienTinhGia, type LocTinhGia } from "./loc-kinh-doanh/dieu-kien-tinh-gia";
import { ThanhLoc } from "./thanh-loc/ThanhLoc";
import { dkTheoTab } from "./thanh-loc/thanh-loc";
import { kyLenUrl, kyTuUrl, thamSoKy, type KyDS } from "./thanh-loc/ky-danh-sach";
import { useLocMan } from "./thanh-loc/useLocMan";
import "./tinh-gia.css";

const PAGE_SIZE = 25;

// Phiếu tính giá chỉ có một mốc ngày: ngày lập.
const MOC_TG: [string, string][] = [["tao", "Ngày tạo"]];
type LocMan = { ky: KyDS; loc: LocTinhGia };
const LOC_MAN_TRONG: LocMan = { ky: { loai: "tat_ca", moc: "tao" }, loc: LOC_TG_TRONG };
const docLocMan = (p: URLSearchParams): LocMan => ({ ky: kyTuUrl(p, ["tao"], "tao"), loc: locTGTuUrl(p) });
const ghiLocMan = (t: LocMan) => ({ ...kyLenUrl(t.ky, "tao"), ...locTGLenUrl(t.loc) });

// Cột của lưới, đúng thứ tự hiện: Mã, Ngày tạo, Khách, Hàng, Số lượng, Tiền, Trạng thái, chứng từ
// kế tiếp (Báo giá), Người, Ghi chú cuối (giãn theo chỗ trống).
// `sx` = khoá sắp xếp gửi máy chủ; `n` = cột số (căn phải).
const COT: (CotLuoi & { w?: number; n?: boolean; sx?: string; goiY?: string })[] = [
  { key: "ma", label: "Mã phiếu", coDinh: true, w: 135, sx: "ma" },
  { key: "ngay", label: "Ngày tạo", w: 100, sx: "ngay" },
  { key: "khach", label: "Khách hàng", w: 200 },
  { key: "sp", label: "Sản phẩm", w: 210 },
  // Số lượng = Σ SL CÁC SẢN PHẨM trong phiếu (không phải ô SL mặc định đầu phiếu) — có vậy SL × giá
  // vốn mỗi sp mới ra tổng giá vốn.
  { key: "sl", label: "Số lượng", w: 100, n: true, sx: "so_luong", goiY: "Tổng số lượng của các sản phẩm trong phiếu" },
  { key: "gv", label: "Giá vốn mỗi sp", w: 115, n: true, sx: "gia_von_don" },
  { key: "tong", label: "Tổng giá vốn", w: 120, n: true, sx: "tong_gia_von" },
  { key: "tt", label: "Trạng thái", w: 115 },
  { key: "bg", label: "Báo giá", w: 100 },
  { key: "nguoi", label: "Người lập", w: 135 },
  { key: "gc", label: "Ghi chú" },
];

// Trạng thái phiếu — khớp đúng điều kiện lọc ở máy chủ (`_DK_TRANG_THAI`, routers/phieu_tinh_gia.py).
function trangThai(it: PhieuTinhGiaListItem): { key: string; nhan: string; mau: MauTT } {
  if (it.so_thanh_phan === 0) return { key: "draft", nhan: "Nháp", mau: "slate" };
  if (it.tong_gia_von > 0) return { key: "calculated", nhan: "Đã tính giá", mau: "la" };
  return { key: "dang_tinh", nhan: "Đang tính", mau: "xanh" };
}

export function PhieuTinhGiaListView({
  onOpen,
  onNew,
  onMoBaoGia,
}: {
  onOpen: (id: number) => void;
  // Mở form phiếu NHÁP — không tạo bản ghi. Phiếu chỉ vào DB khi có sản phẩm + bấm Tính giá.
  onNew: () => void;
  /** Mở báo giá lập từ phiếu (cột Báo giá). Vắng ⇒ mã chỉ là chữ. */
  onMoBaoGia?: (quoteId: number) => void;
}) {
  const { token } = useAuth();
  // Vai không có ô "Thêm mới" ở phân hệ Tính giá thì KHÔNG bày nút lập phiếu: bấm vào chỉ mở được
  // form rỗng rồi ăn 403 lúc lưu — người dùng nhập xong cả phiếu mới biết mình không có quyền.
  const taoDuoc = useCan()("tinh_gia_thanh", "create");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<PhieuTinhGiaListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [tongGiaVon, setTongGiaVon] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PhieuTinhGiaStatsOut | null>(null);
  const luoi = useCauHinhLuoi("tinh-gia");

  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("-ngay");
  // Hộp lọc người lập — null = tất cả người trong tầm nhìn.
  const [nguoi, setNguoi] = useState<number | null>(null);
  // Dải kỳ + bộ lọc nâng cao — ghi lên URL, nhớ theo màn khi mở phiếu rồi quay lại.
  const [locMan, setLocMan] = useLocMan("tinh-gia", LOC_MAN_TRONG, docLocMan, ghiLocMan);
  const dkRieng = useDieuKienTinhGia();
  const thamSo = { ...thamSoKy(locMan.ky), ...thamSoLocTG(locMan.loc) };
  const khoaLoc = JSON.stringify(thamSo);

  // Debounce ô tìm kiếm.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, statusFilter, sort, nguoi, khoaLoc]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api.phieuTinhGia
      .list(token, {
        q: debouncedQ || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        nguoi,
        sort,
        page,
        size,
        loc: JSON.parse(khoaLoc),
      })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
        setTongGiaVon(r.tong_gia_von ?? 0);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Không tải được danh sách phiếu."))
      .finally(() => setLoading(false));
    // Số trên tab theo ĐÚNG bộ lọc đang áp (ô tìm, kỳ, bộ lọc) — không thì tab nói 120 mà bảng 3 dòng.
    api.phieuTinhGia
      .stats(token, nguoi, { q: debouncedQ || undefined, ...JSON.parse(khoaLoc) })
      .then(setStats)
      .catch(() => setStats(null));
  }, [token, debouncedQ, statusFilter, sort, page, size, nguoi, khoaLoc]);

  useEffect(() => {
    load();
  }, [load]);

  const tabTrangThai: MucLocNhanh[] = [
    { key: "all", label: "Tất cả", count: stats?.all ?? 0 },
    { key: "calculated", label: "Đã tính giá", count: stats?.calculated ?? 0, mau: "la" },
    { key: "dang_tinh", label: "Đang tính", count: stats?.dang_tinh ?? 0, mau: "xanh" },
    { key: "draft", label: "Phiếu nháp", count: stats?.draft ?? 0, mau: "slate" },
  ];
  // "Trạng thái" trong nút Lọc đọc/ghi thẳng tab — không đẻ state lọc thứ hai.
  const dieuKien = [
    dkTheoTab<LocTinhGia>({
      tabs: tabTrangThai.map((t) => ({ id: t.key, nhan: t.label, so: t.count })),
      tatCa: "all",
      dang: statusFilter,
      dat: setStatusFilter,
    }),
    ...dkRieng,
  ];
  const hien = (k: string) => !luoi.an.has(k);
  const cotHien = luoi.rongHien(luoi.xep(COT).filter((c) => hien(c.key)));
  const viTriTong = cotHien.findIndex((c) => c.key === "tong");

  return (
    <main className="rdx-cost tg-page lds">
      <header className="lds-dau">
        <h1 className="lds-dau__ten">Tính giá thành</h1>
        {/* Chỉ MỞ FORM, không POST: phiếu rỗng không được sinh ra rồi bỏ lại trong DB. */}
        {taoDuoc && (
          <div className="lds-dau__nut">
            <Button variant="accent" onClick={onNew}>
              <PlusIcon /> Lập phiếu tính giá
            </Button>
          </div>
        )}
      </header>

      {error ? (
        <div className="banner banner--error" role="alert">
          <span>{error}</span>
          <button type="button" className="lds-btn lds-btn--xs" onClick={load}>
            Tải lại
          </button>
        </div>
      ) : null}

      <section className="lds-loc">
        <LocNhanhTrangThai muc={tabTrangThai} dang={statusFilter} onChon={setStatusFilter} />
        <div className="lds-loc__thanh tl-thanh" role="search">
          <OTim value={q} onChange={setQ} placeholder="Tìm mã phiếu, khách hàng, sản phẩm" ariaLabel="Tìm phiếu tính giá" />
          <ThanhLoc
            ky={locMan.ky}
            moc={MOC_TG}
            onKy={(ky) => setLocMan({ ...locMan, ky })}
            dieuKien={dieuKien}
            loc={locMan.loc}
            onLoc={(loc) => setLocMan({ ...locMan, loc })}
          />
          <LocNguoiPhuTrach
            nap={api.phieuTinhGia.nguoiLap}
            value={nguoi}
            onChange={setNguoi}
            tatCa="Tất cả người lập"
            donVi="phiếu"
          />
          <ChonCot cot={COT} {...luoi.chonCot} />
        </div>
      </section>

      <div className="lds-sheet">
        <CuonLuoi ghim={luoi.soGhim(cotHien)}>
          <table className="lds-g" style={{ minWidth: rongLuoi(cotHien) }}>
            <colgroup>
              {cotHien.map((c) => (
                <col key={c.key} style={c.w ? { width: c.w } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {cotHien.map((c) => (
                  <th key={c.key} className={c.n ? "n" : undefined} title={c.goiY}>
                    {c.sx ? <TieuDeSapXep label={c.label} cot={c.sx} sort={sort} onSort={setSort} /> : c.label}
                    {luoi.keo(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <EmptyRow colSpan={cotHien.length} trangThai="dang-tai" />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={cotHien.length} className="lds-trong">
                    {debouncedQ ? "Không tìm thấy phiếu phù hợp. " : "Chưa có phiếu tính giá nào. "}
                    {debouncedQ ? (
                      <button type="button" className="lds-lk" onClick={() => setQ("")}>Xóa tìm kiếm</button>
                    ) : taoDuoc ? (
                      <button type="button" className="lds-lk" onClick={onNew}>Lập phiếu đầu tiên</button>
                    ) : null}
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  // Tên ở ĐẦU PHIẾU (`ten_san_pham`) là chữ ĐÓNG BĂNG, không chạy theo tên hàng bên trong:
                  // phiếu 1 món → lấy tên món (sửa trong phiếu là ngoài này đổi theo); nhiều món → tên
                  // cụm đầu phiếu + thẻ "+N" (rê chuột xem đủ tên từng món); chưa có món → còn gì hiện nấy.
                  const trong = it.ten_thanh_phans ?? [];
                  const motMon = trong.length === 1;
                  const chinh = motMon ? trong[0] : it.ten_san_pham || trong[0] || "";
                  const con = motMon ? [] : it.ten_san_pham ? trong : trong.slice(1);
                  const tt = trangThai(it);
                  return (
                    <tr
                      key={it.id}
                      className="lds-dong"
                      tabIndex={0}
                      onClick={() => onOpen(it.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpen(it.id);
                        }
                      }}
                    >
                      {cotHien.map((c) => {
                        switch (c.key) {
                          case "ma":
                            return <td key={c.key}>{it.ma}</td>;
                          case "ngay":
                            return <td key={c.key}>{ngayVN(it.ngay)}</td>;
                          case "khach":
                            return (
                              <td key={c.key} title={it.customer_name ?? undefined}>
                                {it.customer_name ? tenKhachGon(it.customer_name) : <span className="lds-mu3">Chưa chọn</span>}
                              </td>
                            );
                          case "sp":
                            return (
                              <td key={c.key} title={trong.length > 1 ? trong.join("\n") : chinh || undefined}>
                                {chinh || "—"}
                                {con.length > 0 ? <span className="lds-tag">+{con.length}</span> : null}
                              </td>
                            );
                          case "sl":
                            return <td key={c.key} className="n">{soVN(it.so_luong)}</td>;
                          case "gv":
                            return (
                              <td key={c.key} className="n">{it.gia_von_don ? soVN(it.gia_von_don) : <span className="lds-mu3">—</span>}</td>
                            );
                          case "tong":
                            return (
                              <td key={c.key} className="n">{it.tong_gia_von ? soVN(it.tong_gia_von) : <span className="lds-mu3">—</span>}</td>
                            );
                          case "tt":
                            return <td key={c.key}><ChipTT mau={tt.mau}>{tt.nhan}</ChipTT></td>;
                          case "bg":
                            return (
                              <td key={c.key}>
                                {it.bao_gia_ma ? (
                                  onMoBaoGia && it.bao_gia_id ? (
                                    <button
                                      type="button"
                                      className="lds-lk"
                                      title={`Mở ${it.bao_gia_ma}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onMoBaoGia(it.bao_gia_id!);
                                      }}
                                    >
                                      {it.bao_gia_ma}
                                    </button>
                                  ) : (
                                    it.bao_gia_ma
                                  )
                                ) : (
                                  <span className="lds-mu3">{tt.key === "calculated" ? "Chưa lập" : "—"}</span>
                                )}
                              </td>
                            );
                          case "nguoi":
                            return <td key={c.key}>{it.ktv ?? "—"}</td>;
                          default:
                            return (
                              <td key={c.key} className="lds-mu" title={it.ghi_chu?.trim() || undefined}>{it.ghi_chu?.trim() ?? ""}</td>
                            );
                        }
                      })}
                    </tr>
                  );
                })
              )}
              {/* Dòng Cộng: Σ tổng giá vốn của MỌI phiếu khớp bộ lọc (máy chủ cộng), không chỉ trang đang xem. */}
              {items.length > 0 && viTriTong > 0 ? (
                <tr className="lds-cong lds-nhom">
                  <td className="lead" colSpan={viTriTong}>
                    <span className="lds-dinh-trai">Cộng {total.toLocaleString("vi-VN")} phiếu</span>
                  </td>
                  <td className="n">{soVN(tongGiaVon)}</td>
                  {cotHien.length - viTriTong - 1 > 0 ? <td colSpan={cotHien.length - viTriTong - 1} /> : null}
                </tr>
              ) : null}
            </tbody>
          </table>
        </CuonLuoi>
        {!error && total > 0 ? (
          <PhanTrangDayDu
            trang={page}
            size={size}
            tong={total}
            soDong={items.length}
            onTrang={setPage}
            onSize={(n) => {
              setSize(n);
              setPage(1);
            }}
            loading={loading}
            donVi="phiếu"
            ariaLabel="Phân trang phiếu tính giá"
          />
        ) : null}
      </div>
    </main>
  );
}

// ---------- Inline icons ----------
const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
