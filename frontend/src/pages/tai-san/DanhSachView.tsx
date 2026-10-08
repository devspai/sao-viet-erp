// Tab TÀI SẢN — bảng tra cứu "xưởng đang có những gì, còn lại bao nhiêu".
//
// Tìm · lọc · phân trang đều Ở MÁY CHỦ. Kéo cả bảng về rồi `filter` trong JS thì qua trang thứ
// hai con số bắt đầu sai mà không có lỗi nào bật ra — đã bị bác đúng chuyện này ở màn khác. Số đếm
// trên dải tab, dòng nhóm và dòng Cộng cũng do máy chủ cộng trên cả bộ lọc (`dem_*`, `tong_*`, `nhom`).
//
// Thiết kế lại 05/10/2026 (`2026-10-05-tai-san-ui-ux-tung-man.md`, màn 1):
//   • Dải 4 con số đầu màn; ô "Khấu hao tháng" bấm được, nhảy sang tab tháng.
//   • MỘT nút chính "Thêm tài sản" (mua mới) + mũi tên mở 3 cách thêm — trước có hai nút ngang
//     hàng "Thêm tài sản" / "Thêm tài sản đang dùng" (Carbon: tối đa một nút chính trên thanh).
//   • 06/10/2026: Loại / Bộ phận / Trạng thái / Giá mua thành điều kiện của thanh lọc chung
//     (`ThanhLoc`, kèm số đếm máy chủ), thêm dải kỳ theo Ngày tạo / bắt đầu dùng / thôi dùng; lọc
//     ghi lên URL. Trạng thái mặc định vẫn "Đang dùng".
//   • Bỏ cột Loại và Trạng thái: lọc "Đang dùng" thì cả cột chỉ lặp một chữ. Trạng thái chỉ hiện
//     thành thẻ cạnh tên khi KHÁC đang dùng; loại thành thẻ nhỏ dưới tên.
//   • ↑ ↓ chọn dòng, Enter mở ngăn; ngăn đang mở thì ↑ ↓ đổi tài sản (Linear).
//   • Ba kiểu màn trống: chưa có gì / lọc không ra / tìm không ra — mỗi kiểu một câu một nút.
//
// Gọn theo phương án A 07/10/2026 (`docs/mockups/ke-toan-gon-3-phuong-an.html`, phần tài sản):
//   • Bỏ dải 4 số: số đếm nằm trên hàng lọc nhanh trạng thái, tiền nằm ở dòng nhóm và dòng Cộng.
//   • 08/10/2026: lưới danh sách chung `lds-*` (giống các danh sách Kinh doanh): 11 cột (người xem
//     ẩn / đổi chỗ được qua nút Cột), có cột "Tháng MM/YYYY" = mức trích tháng này. Dòng nhóm chèn khi
//     khoá nhóm của dòng đổi; tổng nhóm là số máy chủ cộng trên CẢ bộ lọc (`nhom[]`), không phải cộng
//     trang. "Nhóm theo" gửi `nhom_theo`, ghi lên URL (`nhom`).
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ApiError, api, type Department } from "../../api/client";
import {
  NHAN_TRANG_THAI, taiSanApi, type NhomTaiSan, type NhomTheo, type TaiSanRow,
} from "../../api/taiSan";
import { useAuth } from "../../auth/useAuth";
import { useCan } from "../../auth/permissions";
import { Button } from "../../components/Button";
import { EmptyRow } from "../../components/EmptyState";
import { Icon } from "../../components/Icons";
import { ImportExcelDialog } from "../../components/ImportExcelDialog";
import {
  ChonCot, CuonLuoi, LocNhanhTrangThai, OTim, rongLuoi, soCotGhim, useCotAn, useThuTuCot, xepCot,
  type CotLuoi, type MucLocNhanh,
} from "../../components/LuoiDs";
import { trangHopLe } from "../../components/Pager";
import { PhanTrangDayDu } from "../../components/PhanTrangDayDu";
import { useDebounced } from "../../utils/useDebounced";
import { kyLenUrl, kyTuUrl, thamSoKy, type KyDS } from "../thanh-loc/ky-danh-sach";
import { ThanhLoc } from "../thanh-loc/ThanhLoc";
import { useLocMan } from "../thanh-loc/useLocMan";
import { Badge, THANG_NAY, gioCuaMoc, ngay, ngayCuaMoc, taiXuong, thangNhan, tien, tienDon } from "./chung";
import { ChiTietDialog } from "./ChiTietDialog";
import { ThemTaiSanDialog, type KieuThem } from "./ThemTaiSanDialog";
import {
  LOC_TS_TRONG, MOC_TS, locTSLenUrl, locTSTuUrl, thamSoLocTS, useDieuKienTaiSan, type LocTaiSan,
} from "./dieu-kien-tai-san";
// Lớp `kt-g__nhom` (dòng nhóm) dùng chung với các màn kế toán.
import "../ke-toan/ke-toan.css";

const NHOM_THEO: [NhomTheo, string][] = [["loai", "Loại"], ["bo_phan", "Bộ phận"], ["khong", "Không nhóm"]];
const laNhomTheo = (v: string | null): v is NhomTheo => NHOM_THEO.some(([k]) => k === v);

type LocMan = { ky: KyDS; loc: LocTaiSan; nhom: NhomTheo };
const LOC_MAN_TRONG: LocMan = { ky: { loai: "tat_ca", moc: "tao" }, loc: LOC_TS_TRONG, nhom: "loai" };
const docLocMan = (p: URLSearchParams): LocMan => {
  const nhom = p.get("nhom");
  return {
    ky: kyTuUrl(p, MOC_TS.map(([m]) => m), "tao"),
    loc: locTSTuUrl(p),
    nhom: laNhomTheo(nhom) ? nhom : "loai",
  };
};
const ghiLocMan = (t: LocMan) => ({
  ...kyLenUrl(t.ky, "tao"), ...locTSLenUrl(t.loc), nhom: t.nhom === "loai" ? undefined : t.nhom,
});

interface TongQuan {
  dem_loai: Record<string, number>;
  dem_trang_thai: Record<string, number>;
  tong_gia: number;
  tong_hao_mon: number;
  tong_con_lai: number;
  tong_muc_thang: number;
  nhom: NhomTaiSan[];
  /** Cách nhóm của LẦN TẢI này — đổi nút nhóm xong, bảng cũ vẫn nhóm theo cách cũ tới khi về số. */
  nhomTheo: NhomTheo;
}

/** Khoá nhóm của một dòng — khớp `khoa` máy chủ trả trong `nhom[]`. */
function khoaNhom(r: TaiSanRow, theo: NhomTheo): string | null {
  if (theo === "loai") return r.loai === "ccdc" ? "ccdc" : "tscd";
  if (theo === "bo_phan") return r.bo_phan_id != null && r.bo_phan_ten ? String(r.bo_phan_id) : "chua_gan";
  return null;
}

/** Ô mức trích tháng: 0 thì "–" (đã khấu hao hết / đã thôi dùng). */
function oThang(v: number) {
  return v > 0 ? tien(v) : <span className="lds-mu3">–</span>;
}

interface CotTS extends CotLuoi {
  w?: number;
  n?: boolean;
}

/** Mã và Tên cố định (ghim khi cuộn ngang); dòng nhóm và dòng Cộng gộp hai ô đầu nên hai cột này
 *  luôn đứng đầu, đúng thứ tự. */
const COT_TS: CotTS[] = [
  { key: "ma", label: "Mã", coDinh: true, w: 90 },
  { key: "ten", label: "Tên", coDinh: true, w: 240 },
  { key: "sl", label: "SL", n: true, w: 56 },
  { key: "bo_phan", label: "Bộ phận", w: 130 },
  { key: "bat_dau", label: "Bắt đầu dùng", w: 112 },
  { key: "khau_hao_trong", label: "Khấu hao trong", n: true, w: 124 },
  { key: "gia", label: "Giá mua", n: true, w: 122 },
  { key: "da_kh", label: "Đã khấu hao", n: true, w: 122 },
  { key: "con_lai", label: "Còn lại", n: true, w: 122 },
  { key: "thang", label: `Tháng ${thangNhan(THANG_NAY)}`, n: true, w: 116 },
  { key: "ngay_tao", label: "Ngày tạo", w: 104 },
];

/** Nút "Thêm tài sản" tách đôi: thân = mua mới (việc hay làm nhất), mũi tên = menu ba cách. */
function NutThem({ onChon }: { onChon: (k: KieuThem | "excel") => void }) {
  const [mo, setMo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMo(false); };
    const phim = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setMo(false); };
    document.addEventListener("mousedown", dong);
    document.addEventListener("keydown", phim);
    return () => {
      document.removeEventListener("mousedown", dong);
      document.removeEventListener("keydown", phim);
    };
  }, [mo]);
  const chon = (k: KieuThem | "excel") => { setMo(false); onChon(k); };
  return (
    <div className="ts-tach" ref={ref}>
      <Button variant="accent" type="button" onClick={() => onChon("moi")}>
        <Icon name="plus" size={15} /> Thêm tài sản
      </Button>
      <button type="button" className="btn btn--accent ts-tach__mui" aria-haspopup="menu"
        aria-expanded={mo} aria-label="Cách thêm khác" onClick={() => setMo((v) => !v)}>
        <Icon name="chevron" size={15} />
      </button>
      {mo && (
        <div className="ts-menu__ds ts-menu__ds--phai" role="menu">
          <button type="button" role="menuitem" className="ts-menu__muc" onClick={() => chon("moi")}>
            <span>Mua mới</span><small>Máy, dụng cụ vừa mua về</small>
          </button>
          <button type="button" role="menuitem" className="ts-menu__muc" onClick={() => chon("dang_dung")}>
            <span>Đang dùng từ trước</span><small>Đã chạy trước khi dùng phần mềm</small>
          </button>
          <hr />
          <button type="button" role="menuitem" className="ts-menu__muc" onClick={() => chon("excel")}>
            <span>Nhập nhiều từ Excel</span><small>Cho danh sách máy đang dùng</small>
          </button>
        </div>
      )}
    </div>
  );
}

/** Một dòng tài sản của lưới. Không thẻ loại / "N cái" dưới tên, không thanh tiến độ: loại đã nói ở
 *  dòng nhóm, số lượng có cột SL, còn bao nhiêu đọc ở cột Còn lại. */
function DongTaiSan({ r, cot, chon, onMo, onPhim }: {
  r: TaiSanRow;
  cot: CotTS[];
  chon: boolean;
  onMo: () => void;
  onPhim: (e: KeyboardEvent<HTMLTableRowElement>) => void;
}) {
  // Đã thôi dùng: máy chủ trả còn lại = 0; hiện số còn lại LÚC thôi dùng (mờ) cho khớp ngăn chi
  // tiết và tab tháng.
  const daThoi = r.trang_thai === "da_giam";
  const conLai = daThoi ? Math.max(r.nguyen_gia - r.hao_mon_luy_ke, 0) : r.con_lai;
  const o = (k: string) => {
    switch (k) {
      case "ma":
        return <td key={k} className="lds-mu" title={r.ma}>{r.ma}</td>;
      case "ten":
        return (
          <td key={k} title={daThoi && r.ngay_giam ? `${r.ten} (thôi dùng ${ngay(r.ngay_giam)})` : r.ten}>
            {/* Tên co lại + "…", chip không co — tên dài không nuốt mất chip "Đã thôi dùng". */}
            <div className="ts-g-ten">
              <span className="ts-g-ten__chu">{r.ten}</span>
              {daThoi && <Badge he="da_giam">{NHAN_TRANG_THAI.da_giam}</Badge>}
            </div>
          </td>
        );
      case "sl":
        return <td key={k} className="n">{tien(r.so_luong)}</td>;
      case "bo_phan":
        return (
          <td key={k} className={r.bo_phan_ten ? undefined : "lds-mu"} title={r.bo_phan_ten ?? undefined}>
            {r.bo_phan_ten ?? "Chưa chọn"}
          </td>
        );
      case "bat_dau":
        return <td key={k}>{ngay(r.ngay_su_dung)}</td>;
      case "khau_hao_trong":
        return <td key={k} className="n">{tien(r.so_thang)}<span className="ts-g-dv">tháng</span></td>;
      case "gia":
        return (
          <td key={k} className="n">
            {r.tien_sua_chua_lon > 0 && (
              <span className="ts-cong" title={`Gồm sửa chữa lớn ${tienDon(r.tien_sua_chua_lon)}`}
                aria-label={`Gồm sửa chữa lớn ${tienDon(r.tien_sua_chua_lon)}`}>+</span>
            )}
            {tien(r.nguyen_gia)}
          </td>
        );
      case "da_kh":
        return <td key={k} className="n">{tien(r.hao_mon_luy_ke)}</td>;
      case "con_lai":
        return (
          <td key={k} className={conLai <= 0 || daThoi ? "n lds-mu" : "n"}
            title={daThoi ? "Còn lại lúc thôi dùng" : undefined}>
            {tien(conLai)}
          </td>
        );
      case "thang":
        return <td key={k} className="n">{oThang(r.muc_thang_nay)}</td>;
      case "ngay_tao":
        return <td key={k} className="lds-mu" title={gioCuaMoc(r.created_at)}>{ngayCuaMoc(r.created_at)}</td>;
      default:
        return <td key={k} />;
    }
  };
  return (
    <tr data-id={r.id} tabIndex={0} className={`lds-dong${chon ? " is-chon" : ""}`}
      onClick={onMo} onKeyDown={onPhim}>
      {cot.map((c) => o(c.key))}
    </tr>
  );
}

/** `dau(phai)`: hàng đầu màn (tiêu đề + nút đổi tab) do trang dựng — danh sách chỉ gài nút Thêm
 *  vào bên phải, vì dialog thêm và việc tải lại bảng nằm ở đây. */
export function DanhSachView({ dau }: { dau?: (phai: ReactNode) => ReactNode }) {
  const { token } = useAuth();
  const can = useCan();
  const taoDuoc = can("tai_san", "create");

  const [rows, setRows] = useState<TaiSanRow[]>([]);
  const [tong, setTong] = useState(0);
  const [tongQuan, setTongQuan] = useState<TongQuan | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  /** Sổ trống hẳn (không phải chỉ lọc ra rỗng) — để màn trống nói đúng câu. */
  const [soTrong, setSoTrong] = useState(false);

  const [q, setQ] = useState("");
  const qCham = useDebounced(q, 300);
  const [locMan, setLocManGoc] = useLocMan("tai-san", LOC_MAN_TRONG, docLocMan, ghiLocMan);
  const setLocMan = (t: LocMan) => { setLocManGoc(t); setPage(1); };
  const khoaLoc = JSON.stringify({
    ...thamSoKy(locMan.ky), ...thamSoLocTS(locMan.loc), nhom_theo: locMan.nhom,
  });
  const trangThai = locMan.loc.trang_thai;

  const [boPhan, setBoPhan] = useState<Department[]>([]);
  const [them, setThem] = useState<KieuThem | null>(null);
  const [nhapExcel, setNhapExcel] = useState(false);
  const [xemId, setXemId] = useState<number | null>(null);
  const bangRef = useRef<HTMLTableSectionElement>(null);
  const [cotAn, setCotAn] = useCotAn("tai-san");
  const [thuTu, setThuTu] = useThuTuCot("tai-san");
  const cotHien = xepCot(COT_TS, thuTu).filter((c) => !cotAn.has(c.key));

  // Máy chủ tính "Đã khấu hao" tới hết tháng TRƯỚC (tháng đang chạy chưa hết thì chưa tính). Mốc
  // ấy nằm ở tooltip tiêu đề cột — chủ 08/09/2026 không muốn dòng "hết MM/YYYY" hiện ra bảng.
  const denThang = rows[0]?.luy_ke_den ? thangNhan(rows[0].luy_ke_den) : "";

  const nap = useCallback(() => {
    if (!token) return;
    setDangTai(true);
    setLoi(null);
    const thamSo = JSON.parse(khoaLoc) as Record<string, unknown> & { nhom_theo: NhomTheo };
    taiSanApi
      .danhSach(token, {
        q: qCham, ...thamSo,
        offset: (page - 1) * size, limit: size,
      })
      .then(async (kq) => {
        setRows(kq.items);
        setTong(kq.total);
        setTongQuan({
          dem_loai: kq.dem_loai ?? {}, dem_trang_thai: kq.dem_trang_thai ?? {},
          tong_gia: kq.tong_gia ?? 0, tong_hao_mon: kq.tong_hao_mon ?? 0,
          tong_con_lai: kq.tong_con_lai ?? 0, tong_muc_thang: kq.tong_muc_thang ?? 0,
          nhom: kq.nhom ?? [], nhomTheo: thamSo.nhom_theo,
        });
        // Xoá nốt dòng cuối trang 3 ⇒ trang đó rỗng trơn, người dùng tưởng mất sạch dữ liệu.
        const ve = trangHopLe(page, kq.total, size);
        if (ve) setPage(ve);
        if (kq.total === 0) {
          const ca = await taiSanApi.danhSach(token, { limit: 1 });
          setSoTrong(ca.total === 0);
        } else {
          setSoTrong(false);
        }
      })
      .catch((e) => setLoi(e instanceof ApiError ? e.message : "Không tải được danh sách tài sản."))
      .finally(() => setDangTai(false));
  }, [token, qCham, khoaLoc, page, size]);

  useEffect(() => { nap(); }, [nap]);

  useEffect(() => {
    if (!token) return;
    api.rbac.departments(token).then(setBoPhan).catch(() => setBoPhan([]));
  }, [token]);

  const doiLoc = (fn: () => void) => { fn(); setPage(1); };
  // "Bỏ lọc" ở màn trống: bỏ ô tìm, kỳ và mọi điều kiện — kể cả thẻ "Đang dùng" mặc định. Cách
  // nhóm không phải điều kiện lọc nên giữ.
  const boLoc = () => doiLoc(() => {
    setQ("");
    setLocManGoc({ ky: { loai: "tat_ca", moc: locMan.ky.moc }, loc: {}, nhom: locMan.nhom });
  });
  const dieuKien = useDieuKienTaiSan(tongQuan?.dem_loai ?? {}, tongQuan?.dem_trang_thai ?? {});

  // Hàng lọc nhanh trạng thái: cùng một điều kiện `trang_thai` với thanh lọc, chỉ là lối bấm nhanh.
  const dem = tongQuan?.dem_trang_thai;
  const muc: MucLocNhanh[] = [
    { key: "dang_dung", label: NHAN_TRANG_THAI.dang_dung, mau: "la", count: dem ? dem.dang_dung ?? 0 : undefined },
    { key: "da_giam", label: NHAN_TRANG_THAI.da_giam, mau: "xam", count: dem ? dem.da_giam ?? 0 : undefined },
    { key: "tat_ca", label: "Tất cả", count: dem ? (dem.dang_dung ?? 0) + (dem.da_giam ?? 0) : undefined },
  ];
  const chonTab = (id: string) => setLocMan({
    ...locMan,
    loc: { ...locMan.loc, trang_thai: id === "dang_dung" || id === "da_giam" ? id : undefined },
  });

  const nhanCong = trangThai === "dang_dung" ? "đang dùng" : trangThai === "da_giam" ? "đã thôi dùng" : "tài sản";
  // Máy chủ tính còn lại của tài sản đã thôi dùng = 0 trong mọi tổng; dòng thì hiện còn lại LÚC
  // thôi dùng (mờ). Nói ra ở tooltip ô tổng khi danh sách có thể chứa dòng đã thôi dùng.
  const ghiConLai = trangThai === "dang_dung" ? undefined : "Tài sản đã thôi dùng tính 0";

  // ↑ ↓ trên bảng: chuyển con trỏ giữa các dòng tài sản (bỏ qua dòng nhóm); Enter mở ngăn.
  function phimDong(e: KeyboardEvent<HTMLTableRowElement>, id: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setXemId(id);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const xuong = e.key === "ArrowDown";
    let ke = (xuong ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null;
    while (ke && !ke.dataset.id) {
      ke = (xuong ? ke.nextElementSibling : ke.previousElementSibling) as HTMLElement | null;
    }
    ke?.focus();
  }

  const viTri = xemId === null ? -1 : rows.findIndex((r) => r.id === xemId);
  const doiSang = (i: number) => {
    const r = rows[i];
    if (!r) return;
    setXemId(r.id);
    bangRef.current?.querySelector<HTMLElement>(`[data-id="${r.id}"]`)?.scrollIntoView({ block: "nearest" });
  };

  function chonThem(k: KieuThem | "excel") {
    if (k === "excel") setNhapExcel(true);
    else setThem(k);
  }

  const nutThem = taoDuoc ? <NutThem onChon={chonThem} /> : null;

  // Dòng nhóm: chèn trước dòng đầu tiên của mỗi nhóm CÓ MẶT trong trang. Máy chủ đã sắp dòng theo
  // nhóm nên phân trang vẫn đúng thứ tự; số của nhóm là của cả nhóm theo bộ lọc.
  const nhomTheo = tongQuan?.nhomTheo ?? "khong";
  const nhomTheoKhoa = new Map((tongQuan?.nhom ?? []).map((g) => [g.khoa, g]));
  const dongBang: ReactNode[] = [];
  let khoaTruoc: string | null = null;
  for (const r of rows) {
    const k = khoaNhom(r, nhomTheo);
    const g = k != null && k !== khoaTruoc ? nhomTheoKhoa.get(k) : undefined;
    if (g) {
      const soCot = (c: CotTS) => {
        switch (c.key) {
          case "gia":
            return <td key={c.key} className="n">{tien(g.nguyen_gia)}</td>;
          case "da_kh":
            return <td key={c.key} className="n">{tien(g.hao_mon)}</td>;
          case "con_lai":
            return <td key={c.key} className="n" title={ghiConLai}>{tien(g.con_lai)}</td>;
          case "thang":
            return <td key={c.key} className="n">{oThang(g.muc_thang)}</td>;
          default:
            return <td key={c.key} />;
        }
      };
      dongBang.push(
        <tr key={`nhom-${g.khoa}`} className="kt-g__nhom lds-nhom">
          <td colSpan={2} title={g.ten}>
            <span className="lds-dinh-trai">
              <span>{g.ten}</span><span className="lds-mu ts-g-phu">{tien(g.so)} mục</span>
            </span>
          </td>
          {cotHien.slice(2).map(soCot)}
        </tr>,
      );
    }
    khoaTruoc = k;
    dongBang.push(<DongTaiSan key={r.id} r={r} cot={cotHien} chon={xemId === r.id}
      onMo={() => setXemId(r.id)} onPhim={(e) => phimDong(e, r.id)} />);
  }

  return (
    <>
      {dau ? dau(nutThem) : nutThem && <header className="lds-dau"><div className="lds-dau__nut">{nutThem}</div></header>}

      {loi && (
        <div className="banner banner--error" role="alert">
          <span>{loi}</span>
          <button type="button" className="btn btn--ghost" onClick={nap}>Tải lại</button>
        </div>
      )}

      <section className="lds-loc">
        <LocNhanhTrangThai muc={muc} dang={trangThai ?? "tat_ca"} onChon={chonTab} />
        <div className="lds-loc__thanh tl-thanh" role="search">
          <OTim value={q} onChange={(v) => doiLoc(() => setQ(v))} placeholder="Tìm theo mã hoặc tên"
            ariaLabel="Tìm theo mã hoặc tên" />
          <ThanhLoc ky={locMan.ky} moc={MOC_TS} onKy={(ky) => setLocMan({ ...locMan, ky })}
            dieuKien={dieuKien} loc={locMan.loc} onLoc={(loc) => setLocMan({ ...locMan, loc })} />
          <div className="ts-nhom-theo">
            <span className="ts-nhom-theo__nhan" id="ts-nhom-theo">Nhóm theo</span>
            <div className="ts-seg" role="group" aria-labelledby="ts-nhom-theo">
              {NHOM_THEO.map(([k, nhan]) => (
                <button key={k} type="button" aria-pressed={locMan.nhom === k}
                  className={locMan.nhom === k ? "on" : undefined}
                  onClick={() => setLocMan({ ...locMan, nhom: k })}>
                  {nhan}
                </button>
              ))}
            </div>
          </div>
          <ChonCot cot={COT_TS} an={cotAn} onAn={setCotAn} thuTu={thuTu} onThuTu={setThuTu} />
        </div>
      </section>

      <div className="lds-sheet">
        <CuonLuoi ghim={soCotGhim(cotHien)}>
          <table className="lds-g" style={{ minWidth: rongLuoi(cotHien) }}>
            <colgroup>
              {cotHien.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
            </colgroup>
            <thead>
              <tr>
                {cotHien.map((c) => (
                  <th key={c.key} className={c.n ? "n" : undefined}
                    title={c.key === "da_kh" && denThang ? `Tính tới hết tháng ${denThang}`
                      : c.key === "thang" ? "Mức khấu hao của tháng này" : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={bangRef}>
              {dangTai && rows.length === 0 ? (
                <EmptyRow colSpan={cotHien.length} trangThai="dang-tai" />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={cotHien.length} className="lds-trong ts-trong-td">
                    <div className="ts-trong">
                      {soTrong ? (
                        <>
                          <span className="ts-trong__ic"><Icon name="box" size={20} /></span>
                          <h3>Chưa có tài sản nào</h3>
                          <p>Thêm máy vừa mua, hoặc nhập danh sách máy đang dùng từ Excel. Phần mềm tự chia giá mua ra từng tháng.</p>
                          {taoDuoc && (
                            <div className="ts-trong__nut">
                              <Button variant="accent" type="button" onClick={() => setThem("moi")}>
                                <Icon name="plus" size={15} /> Thêm tài sản
                              </Button>
                              <button type="button" className="ts-lienket" onClick={() => setNhapExcel(true)}>
                                Nhập từ Excel
                              </button>
                            </div>
                          )}
                        </>
                      ) : qCham ? (
                        <>
                          <h3>Không tìm thấy “{qCham}”</h3>
                          <p>Thử tìm bằng mã (TS-0001) hoặc một chữ trong tên.</p>
                          <div className="ts-trong__nut">
                            <Button variant="secondary" type="button" onClick={() => doiLoc(() => setQ(""))}>
                              Xoá ô tìm
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3>Không có tài sản nào khớp điều kiện đang lọc.</h3>
                          <p>Thử bỏ bớt điều kiện lọc.</p>
                          <div className="ts-trong__nut">
                            <Button variant="secondary" type="button" onClick={boLoc}>Xoá bộ lọc</Button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {dongBang}
                  {tongQuan && (
                    <tr className="lds-cong lds-nhom">
                      <td className="lead" colSpan={2}>
                        <span className="lds-dinh-trai">{`Cộng ${tien(tong)} ${nhanCong}`}</span>
                      </td>
                      {cotHien.slice(2).map((c) => {
                        switch (c.key) {
                          case "gia":
                            return <td key={c.key} className="n">{tien(tongQuan.tong_gia)}</td>;
                          case "da_kh":
                            return <td key={c.key} className="n">{tien(tongQuan.tong_hao_mon)}</td>;
                          case "con_lai":
                            return <td key={c.key} className="n" title={ghiConLai}>{tien(tongQuan.tong_con_lai)}</td>;
                          case "thang":
                            return <td key={c.key} className="n">{oThang(tongQuan.tong_muc_thang)}</td>;
                          default:
                            return <td key={c.key} />;
                        }
                      })}
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </CuonLuoi>
        {tong > 0 && (
          <PhanTrangDayDu trang={page} size={size} tong={tong} soDong={rows.length}
            onTrang={setPage} onSize={(n) => { setSize(n); setPage(1); }} loading={dangTai}
            donVi="tài sản" ariaLabel="Phân trang danh sách tài sản" />
        )}
      </div>
      {rows.length > 0 && (
        <p className="ts-phim">
          <kbd>↑</kbd> <kbd>↓</kbd> chọn dòng, <kbd>Enter</kbd> mở chi tiết. Ngăn đang mở thì
          {" "}<kbd>↑</kbd> <kbd>↓</kbd> đổi tài sản, <kbd>Esc</kbd> đóng.
        </p>
      )}

      {token && them && (
        <ThemTaiSanDialog
          token={token}
          kieu={them}
          boPhan={boPhan}
          onClose={() => setThem(null)}
          onSaved={nap}
          onNhapExcel={() => { setThem(null); setNhapExcel(true); }}
        />
      )}

      {token && nhapExcel && (
        <ImportExcelDialog
          kieu="ba-buoc"
          ten="tài sản đang dùng"
          luat="Ô để trống phần mềm tự điền như form: loại theo giá, số tháng, số tiền đã khấu hao tới tháng tính tiếp."
          moTaMau="Mỗi dòng một tài sản đang dùng."
          chay={(file, mode) => taiSanApi.importExcel(token, file, mode)}
          taiMau={async () => taiXuong(await taiSanApi.mauExcel(token), "Mau tai san dang dung.xlsx")}
          onClose={() => setNhapExcel(false)}
          onImported={() => { setNhapExcel(false); nap(); }}
        />
      )}

      {token && xemId !== null && (
        <ChiTietDialog token={token} taiSanId={xemId} boPhan={boPhan}
          onClose={() => {
            const id = xemId;
            setXemId(null);
            // Trả con trỏ về đúng dòng vừa xem — đi tiếp bằng ↑ ↓ khỏi phải bấm chuột.
            window.setTimeout(() => bangRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus(), 0);
          }}
          onChanged={nap}
          onTruoc={viTri > 0 ? () => doiSang(viTri - 1) : undefined}
          onSau={viTri >= 0 && viTri < rows.length - 1 ? () => doiSang(viTri + 1) : undefined} />
      )}
    </>
  );
}
