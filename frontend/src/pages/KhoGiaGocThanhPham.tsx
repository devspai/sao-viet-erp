// Báo cáo kho · tab "Giá gốc thành phẩm" (design nhập kho thành phẩm §5).
//
// Thành phẩm KCS gửi kho nhập với giá gốc 0 — phần mềm không tính được giá thành, kế toán kho gõ tay
// sau. Danh sách theo LÔ GỐC (lô sinh qua điều chuyển không thành dòng riêng); gõ giá một lần là
// máy chủ lan xuống cả họ lô (dòng phiếu nhập + giá lô ⇒ báo cáo Nhập-Xuất-Tồn, giá trị phiếu xuất
// đã ghi sổ). Lọc + trang ở máy chủ; chỉ người có "Xem giá vốn" mới thấy tab này.
//
// Lưới chung (11/10/2026, khuôn Sản lượng của bàn tổ): [Tìm] [Kỳ theo ngày nhập] [Lọc] … [Cột] —
// Lọc gồm Trạng thái giá, Kho nhập, Khách hàng, Mặt hàng (chọn nhiều); cột kéo rộng, ghim, đổi chỗ.
import { CircleDot, Package, Users, Warehouse } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { OGoDinhDang } from "../components/OGoDinhDang";
import { api, ApiError, type ThanhPhamChuaGiaGocPage, type ThanhPhamChuaGiaGocRow } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyRow } from "../components/EmptyState";
import { ChonCot, CuonLuoi, OTim, rongLuoi, useCauHinhLuoi, type CotLuoi } from "../components/LuoiDs";
import { PhanTrangDayDu } from "../components/PhanTrangDayDu";
import { useDebounced } from "../utils/useDebounced";
import { XIcon } from "./danh-muc/icons";
import { fmtQty } from "./khoShared";
import { ThanhLoc } from "./thanh-loc/ThanhLoc";
import { khoangKy, type KyDS } from "./thanh-loc/ky-danh-sach";
import type { DieuKien, GiaTriDK } from "./thanh-loc/thanh-loc";
import "./kho-gia-goc.css";

const tien = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("vi-VN"));
const ngay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
/** Ô giá gõ kiểu "12.000" — chỉ giữ chữ số. Trống ⇒ null (chưa gõ gì). */
function docGia(s: string): number | null {
  const so = s.replace(/\D/g, "");
  return so === "" ? null : Number(so);
}

/** Điều kiện nút Lọc. `gia` vắng = mọi lô (đã có lẫn chưa có giá). Mặc định chỉ lô chưa có giá. */
type LocGG = { gia?: "chua" | "co"; kho: string[]; khach: string[]; hang: string[] };
const LOC_MAC_DINH: LocGG = { gia: "chua", kho: [], khach: [], hang: [] };
const MOC_GG: [string, string][] = [["nhap", "Ngày nhập"]];
const KY_MAC_DINH: KyDS = { loai: "tat_ca", moc: "nhap" };
const soId = (ds: string[]) => ds.map(Number).filter((n) => Number.isInteger(n));
const giaTriTu = (ds: { id: number; ten: string | null }[] | undefined): GiaTriDK[] =>
  (ds ?? []).map((x) => ({ value: String(x.id), nhan: x.ten ?? `#${x.id}` }));

interface CotGG extends CotLuoi { w?: number; n?: boolean }
const COT_GG: CotGG[] = [
  { key: "lo", label: "Mã lô", coDinh: true, w: 230 },
  { key: "ngay", label: "Ngày nhập", w: 104 },
  { key: "kho", label: "Kho nhập", w: 150 },
  { key: "mahang", label: "Mã hàng", w: 110 },
  { key: "hang", label: "Mặt hàng", w: 220 },
  { key: "lenh", label: "Lệnh", w: 110 },
  { key: "don", label: "Đơn hàng", w: 100 },
  { key: "khach", label: "Khách hàng", w: 200 },
  { key: "sl", label: "SL nhập", w: 110, n: true },
  { key: "ton", label: "Còn tồn", w: 110, n: true },
  { key: "giaban", label: "Giá bán (đơn)", w: 120, n: true },
  { key: "gia", label: "Giá gốc", w: 270 },
];

/** Ô giá gốc của một lô. Định dạng "1.850" NGAY khi gõ nhưng giữ con trỏ đứng sau đúng chữ số vừa gõ
 *  — định dạng lại cả chuỗi mà không đặt lại con trỏ thì sửa số ở giữa là con trỏ nhảy về cuối. Xoá
 *  trúng dấu chấm thì xoá luôn chữ số cạnh nó, không thì bấm xoá mà chẳng có gì xảy ra. Ô trống lúc
 *  rời đi = thôi sửa (giá cũ hiện lại) — để trống mà hiện "0" mờ thì không ai biết đó là 0 hay rỗng. */
function OGiaGoc({ row, dang, dv, onDoi, onBo, onLuu }: {
  row: ThanhPhamChuaGiaGocRow;
  dang: string | undefined;
  dv: string;
  onDoi: (s: string) => void;
  onBo: () => void;
  onLuu: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const conTro = useRef<number | null>(null);
  const gia = dang == null ? null : docGia(dang);
  const doi = gia != null && gia !== row.don_gia;

  useLayoutEffect(() => {
    const el = ref.current;
    const n = conTro.current;
    if (n == null || !el) return;
    conTro.current = null;
    let pos = 0;
    for (let dem = 0; pos < el.value.length && dem < n; pos++) if (/\d/.test(el.value[pos])) dem++;
    el.setSelectionRange(pos, pos);
  });

  return (
    <div className="kgg-gia">
      <OGoDinhDang
        ref={ref}
        className={`rc-input kgg-gia__o${doi ? " is-doi" : ""}`}
        inputMode="numeric"
        aria-label={`Giá gốc lô ${row.ma_lo}`}
        placeholder={row.don_gia > 0 ? "Gõ giá mới" : "Chưa có giá"}
        value={dang ?? (row.don_gia > 0 ? tien(row.don_gia) : "")}
        onChange={(e) => {
          const el = e.target;
          let so = el.value.replace(/\D/g, "");
          let truoc = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, "").length;
          const cu = (dang ?? (row.don_gia > 0 ? tien(row.don_gia) : "")).replace(/\D/g, "");
          const kieu = (e.nativeEvent as InputEvent).inputType;
          if (so === cu && kieu === "deleteContentBackward" && truoc > 0) {
            so = so.slice(0, truoc - 1) + so.slice(truoc);
            truoc -= 1;
          } else if (so === cu && kieu === "deleteContentForward" && truoc < so.length) {
            so = so.slice(0, truoc) + so.slice(truoc + 1);
          }
          const g = docGia(so);
          // Bộ gõ tiếng Việt còn giữ từ đang gõ thì đừng dời con trỏ — dời là vùng gõ của nó lệch.
          if (!(e.nativeEvent as InputEvent).isComposing) conTro.current = truoc;
          onDoi(g == null ? "" : tien(g));
        }}
        onBlur={() => {
          if (dang != null && (gia == null || gia === row.don_gia)) onBo();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && doi) onLuu();
          if (e.key === "Escape" && dang != null) { e.preventDefault(); onBo(); }
        }}
      />
      <span className="kgg-gia__dv">đ/{dv || "đv"}</span>
      {/* Luôn giữ chỗ cho nút — nút mọc ra/biến mất mà chiếm chỗ thì cả bảng nở ra co vào theo
          từng phím gõ, và ở màn hẹp nút bị đẩy ra ngoài khung, phải kéo ngang mới thấy. */}
      <span className="kgg-gia__nut" style={{ visibility: doi ? "visible" : "hidden" }} aria-hidden={!doi}>
        <button type="button" className="btn btn--accent btn--sm" tabIndex={doi ? 0 : -1}
          onMouseDown={(e) => e.preventDefault()} onClick={onLuu}>
          Lưu
        </button>
        <button type="button" className="kgg-gia__bo" tabIndex={doi ? 0 : -1}
          title="Bỏ, giữ giá cũ (Esc)" aria-label={`Bỏ giá đang gõ của lô ${row.ma_lo}`}
          onMouseDown={(e) => e.preventDefault()} onClick={onBo}>
          <XIcon size={13} />
        </button>
      </span>
    </div>
  );
}

export function KhoGiaGocThanhPham({ token, onCount }: { token: string; onCount?: (n: number) => void }) {
  const [tim, setTim] = useState("");
  const timCham = useDebounced(tim.trim());
  const [ky, setKy] = useState<KyDS>(KY_MAC_DINH);
  const [loc, setLoc] = useState<LocGG>(LOC_MAC_DINH);
  const [trang, setTrang] = useState(1);
  const [coTrang, setCoTrang] = useState(25);
  const [data, setData] = useState<ThanhPhamChuaGiaGocPage | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Giá đang gõ dở theo lô (chưa lưu) — chuỗi hiển thị.
  const [nhap, setNhap] = useState<Record<number, string>>({});
  const [xacNhan, setXacNhan] = useState<{ row: ThanhPhamChuaGiaGocRow; gia: number } | null>(null);
  const [luuBusy, setLuuBusy] = useState(false);
  const [luuLoi, setLuuLoi] = useState<string | null>(null);
  const [thongBao, setThongBao] = useState<string | null>(null);
  const luoi = useCauHinhLuoi("kho-gia-goc");

  // Nút kỳ không nhận khoảng ngày ngược (giữ kỳ cũ), nên ở đây luôn là khoảng hợp lệ hoặc không có.
  const khoang = khoangKy(ky);
  const tu = khoang?.tu ?? "";
  const den = khoang?.den ?? "";
  const khoaLoc = JSON.stringify(loc);

  useEffect(() => { setTrang(1); }, [timCham, tu, den, khoaLoc]);
  useEffect(() => {
    let alive = true;
    setDangTai(true);
    const l = JSON.parse(khoaLoc) as LocGG;
    api.kho.baoCao.thanhPhamChuaGiaGoc(token, {
      q: timCham || undefined, gia: l.gia ?? "tat_ca", page: trang, size: coTrang,
      tu: tu || undefined, den: den || undefined,
      khoIds: soId(l.kho), khachHangIds: soId(l.khach), hangIds: soId(l.hang),
    })
      .then((r) => { if (alive) { setData(r); setLoi(null); onCount?.(r.total); } })
      .catch((e) => { if (alive) setLoi(e instanceof ApiError ? e.message : "Không tải được danh sách thành phẩm."); })
      .finally(() => { if (alive) setDangTai(false); });
    return () => { alive = false; };
  }, [token, timCham, trang, coTrang, tick, onCount, tu, den, khoaLoc]);

  async function luu() {
    if (!xacNhan || luuBusy) return;
    setLuuBusy(true);
    setLuuLoi(null);
    try {
      const r = await api.kho.phieu.suaGiaGoc(token, xacNhan.row.lot_id, xacNhan.gia);
      setThongBao(
        `Đã đổi giá gốc lô ${r.ma_lo}: ${tien(r.don_gia_cu)} → ${tien(r.don_gia)} đ`
        + (r.so_lo > 1 ? ` (áp cho ${r.so_lo} lô, gồm lô đã điều chuyển).` : "."),
      );
      boNhap(xacNhan.row.lot_id);
      setXacNhan(null);
      setTick((t) => t + 1);
    } catch (e) {
      setLuuLoi(e instanceof ApiError ? e.message : "Không lưu được giá gốc.");
    } finally {
      setLuuBusy(false);
    }
  }
  function boNhap(lotId: number) {
    setNhap((cu) => {
      if (!(lotId in cu)) return cu;
      const moi = { ...cu };
      delete moi[lotId];
      return moi;
    });
  }

  const dieuKien = useMemo<DieuKien<LocGG>[]>(() => [{
    khoa: "gia", nhan: "Trạng thái giá", icon: CircleDot, kieu: "mot",
    giaTri: [{ value: "chua", nhan: "Chưa có giá gốc" }, { value: "co", nhan: "Đã có giá gốc" }],
    doc: (l) => l.gia,
    ghi: (l, v) => ({ ...l, gia: v === "chua" || v === "co" ? v : undefined }),
  }, {
    khoa: "kho", nhan: "Kho nhập", icon: Warehouse, kieu: "nhieu", tim: true, giaTri: giaTriTu(data?.cac_kho),
    doc: (l) => l.kho,
    ghi: (l, v) => ({ ...l, kho: v }),
  }, {
    khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "nhieu", tim: true, giaTri: giaTriTu(data?.cac_khach),
    doc: (l) => l.khach,
    ghi: (l, v) => ({ ...l, khach: v }),
  }, {
    khoa: "hang", nhan: "Mặt hàng", icon: Package, kieu: "nhieu", tim: true, giaTri: giaTriTu(data?.cac_hang),
    doc: (l) => l.hang,
    ghi: (l, v) => ({ ...l, hang: v }),
  }], [data?.cac_kho, data?.cac_khach, data?.cac_hang]);

  const rows = data?.items ?? [];
  const cot = luoi.rongHien(luoi.xep(COT_GG).filter((c) => !luoi.an.has(c.key)));
  const coLoc = timCham !== "" || ky.loai !== "tat_ca" || khoaLoc !== JSON.stringify(LOC_MAC_DINH);
  const xoaLoc = () => { setTim(""); setKy(KY_MAC_DINH); setLoc({ ...LOC_MAC_DINH, gia: undefined }); };

  const o = (key: string, r: ThanhPhamChuaGiaGocRow) => {
    const dv = r.dvt_ten ?? r.dvt ?? "";
    switch (key) {
      case "lo":
        return (
          <td key={key} title={r.ma_lo}>
            {r.ma_lo}
            {r.so_lo > 1 && <span className="lds-tag" title="Lô đã điều chuyển sang kho khác, đi theo giá lô gốc">+{r.so_lo - 1} lô điều chuyển</span>}
          </td>
        );
      case "ngay":
        return <td key={key}>{ngay(r.ngay_nhap)}</td>;
      case "kho":
        return <td key={key} title={r.kho_ten ?? undefined}>{r.kho_ten ?? "—"}</td>;
      case "mahang":
        return <td key={key} className={r.ma_hang ? undefined : "lds-mu"}>{r.ma_hang ?? "—"}</td>;
      case "hang":
        return <td key={key} title={r.ten_hang ?? undefined}>{r.ten_hang ?? "—"}</td>;
      case "lenh":
        return <td key={key} className={r.lsx_ma ? undefined : "lds-mu"}>{r.lsx_ma ?? "—"}</td>;
      case "don":
        return <td key={key} className={r.order_ma ? undefined : "lds-mu"}>{r.order_ma ?? "—"}</td>;
      case "khach":
        return <td key={key} title={r.khach_hang ?? undefined} className={r.khach_hang ? undefined : "lds-mu"}>{r.khach_hang ?? "—"}</td>;
      case "sl":
        return <td key={key} className="n">{fmtQty(r.so_luong_nhap)} {dv}</td>;
      case "ton":
        return <td key={key} className="n">{fmtQty(r.sl_con_lai)} {dv}</td>;
      case "giaban":
        return <td key={key} className="n">{tien(r.don_gia_ban)}</td>;
      case "gia": {
        const dang = nhap[r.lot_id];
        return (
          <td key={key} className="kgg-o-gia">
            <OGiaGoc
              row={r}
              dang={dang}
              dv={dv}
              onDoi={(s) => setNhap((cu) => ({ ...cu, [r.lot_id]: s }))}
              onBo={() => boNhap(r.lot_id)}
              onLuu={() => {
                const gia = dang == null ? null : docGia(dang);
                if (gia == null || gia === r.don_gia) return;
                setLuuLoi(null);
                setXacNhan({ row: r, gia });
              }}
            />
          </td>
        );
      }
      default:
        return <td key={key} />;
    }
  };

  return (
    <div className="lds">
      {thongBao ? (
        <div className="banner banner--success" role="status">
          <span>{thongBao}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setThongBao(null)}>Đóng</button>
        </div>
      ) : (
        <div className="banner banner--info">
          <span>
            Thành phẩm KCS gửi kho nhập với giá gốc 0. Gõ giá gốc cho lô gốc — lô đã điều chuyển sang
            kho khác và phiếu xuất đã ghi sổ của các lô đó cập nhật theo. Kỳ đã khoá sổ thì không sửa được.
          </span>
        </div>
      )}

      <section className="lds-loc">
        <div className="lds-loc__thanh tl-thanh" role="search">
          <OTim value={tim} onChange={setTim} placeholder="Tìm mã lô, hàng, lệnh, đơn, khách" ariaLabel="Tìm lô thành phẩm" />
          <ThanhLoc ky={ky} moc={MOC_GG} onKy={setKy} dieuKien={dieuKien} loc={loc} onLoc={setLoc} />
          <ChonCot cot={COT_GG} {...luoi.chonCot} />
        </div>
      </section>

      <div className="lds-sheet">
        <CuonLuoi ghim={luoi.soGhim(cot)}>
          <table className="lds-g kgg-luoi" style={{ minWidth: rongLuoi(cot) }}>
            <colgroup>
              {cot.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
            </colgroup>
            <thead>
              <tr>{cot.map((c) => <th key={c.key} className={c.n ? "n" : undefined}>{c.label}{luoi.keo(c.key)}</th>)}</tr>
            </thead>
            <tbody>
              {dangTai && data == null ? (
                <EmptyRow colSpan={cot.length} trangThai="dang-tai" />
              ) : loi ? (
                <tr>
                  <td colSpan={cot.length} className="lds-trong">
                    <span className="lds-do">{loi}</span>{" "}
                    <button type="button" className="lds-lk" onClick={() => setTick((t) => t + 1)}>Thử lại</button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={cot.length} className="lds-trong">
                    {coLoc ? "Không có lô nào khớp điều kiện đang lọc." : "Chưa có lô thành phẩm nào nhập từ KCS."}{" "}
                    {coLoc && <button type="button" className="lds-lk" onClick={xoaLoc}>Xoá bộ lọc</button>}
                  </td>
                </tr>
              ) : rows.map((r) => (
                <tr key={r.lot_id}>
                  {cot.map((c) => o(c.key, r))}
                </tr>
              ))}
            </tbody>
          </table>
        </CuonLuoi>
        {!loi && data && data.total > 0 && (
          <PhanTrangDayDu trang={trang} size={coTrang} tong={data.total} soDong={rows.length}
            onTrang={setTrang} onSize={(n) => { setCoTrang(n); setTrang(1); }} loading={dangTai}
            donVi="lô gốc" ariaLabel="Phân trang giá gốc thành phẩm" />
        )}
      </div>

      <ConfirmDialog
        open={xacNhan != null}
        title="Đổi giá gốc thành phẩm"
        message={xacNhan
          ? `Lô ${xacNhan.row.ma_lo} (${xacNhan.row.ten_hang ?? "thành phẩm"}): giá gốc ${tien(xacNhan.row.don_gia)} → ${tien(xacNhan.gia)} đ/${xacNhan.row.dvt_ten ?? xacNhan.row.dvt ?? "đơn vị"}.`
            + (xacNhan.row.so_lo > 1 ? ` Áp luôn cho ${xacNhan.row.so_lo - 1} lô đã điều chuyển sang kho khác.` : "")
            + " Báo cáo Nhập-Xuất-Tồn và giá trị phiếu xuất đã ghi sổ của các lô này đổi theo."
          : undefined}
        confirmLabel="Lưu giá gốc"
        busy={luuBusy}
        error={luuLoi}
        onConfirm={luu}
        onCancel={() => { if (!luuBusy) setXacNhan(null); }}
      />
    </div>
  );
}
