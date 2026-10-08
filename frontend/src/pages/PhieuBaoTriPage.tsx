// Phiếu bảo trì — sinh ra từ chính LỊCH BẢO TRÌ đã khai trên máy.
//
// Chu kỳ KHÔNG khai ở màn này: nguồn là gói trong `may_thiet_bi.fields_theo_loai.lich_bao_tri`
// (tab "Lịch bảo trì" ở màn Thiết bị & Máy móc) — khai ở danh mục, thực hiện ở đây. Phiếu định kỳ
// ra đời bằng hai đường: ticker nền tự sinh khi TỚI HẠN, hoặc người dùng bấm một ô kỳ dự kiến trên
// màn Lịch. Không có nút đẻ hàng loạt (đã gỡ 12/08/2026 — một cú bấm ra 41 phiếu rác).
//
// "Quá hạn" / "Đã dời" là cờ DẪN XUẤT backend tính lúc đọc, không phải trạng thái lưu.
//
// Đóng phiếu có HAI cửa, cả hai chặn ở service: đủ ảnh chứng thực VÀ hết việc trong checklist
// (việc không phải làm thì đánh "không áp dụng" kèm lý do, đừng tick dối).
//
// Bố cục (07/10/2026): danh sách theo khuôn lưới chung `LuoiDs` của Báo giá; ngăn chi tiết theo
// phương án A2 của docs/mockups/ky-thuat-may-ngan-3-phuong-an.html; "Thêm việc ngoài lịch" là hộp
// thoại giữa màn.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth/useAuth";
import { useCan } from "../auth/permissions";
import { Button } from "../components/Button";
import { ChonNgay } from "../components/ChonNgay";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyRow } from "../components/EmptyState";
import { Icon } from "../components/Icons";
import {
  ChonCot, CuonLuoi, LocNhanhTrangThai, OTim, rongLuoi, useCauHinhLuoi, type CotLuoi, type MauTT,
} from "../components/LuoiDs";
import { mayThietBi, type Row } from "../api/rebuildCatalog";
import {
  kyThuatMay, NHAN_DON_VI_CHU_KY, NHAN_TT_BAO_TRI,
  type Anh, type BaoTri, type DuKien,
} from "../api/kyThuatMay";
import { trangHopLe } from "../components/Pager";
import { PhanTrangDayDu } from "../components/PhanTrangDayDu";
import { useTre } from "../lib/useTre";
import {
  AnhBox, BadgeBaoTri, CotPhieu, DongTT, HopThoai, NhatKyPhieu, ONhap, fmtNgay, hienChuDu, homNay, useManHep,
} from "./KyThuatMayChung";
import { LichBaoTri } from "./LichBaoTri";
import { NganPhai } from "./ke-toan/shared/NganPhai";
import { ThanhLoc } from "./thanh-loc/ThanhLoc";
import { dkTheoTab, type DieuKien } from "./thanh-loc/thanh-loc";
import { kyLenUrl, kyTuUrl, thamSoKy, type KyDS } from "./thanh-loc/ky-danh-sach";
import { useLocMan } from "./thanh-loc/useLocMan";
import { ngayDayDu, ngayGioDayDu } from "./loc-san-xuat/ngay";
import {
  LOC_BAO_TRI_TRONG, MOC_BAO_TRI, locBaoTriLenUrl, locBaoTriTuUrl, thamSoLocBaoTri,
  useDieuKienBaoTri, type LocBaoTri,
} from "./loc-ky-thuat-may/dieu-kien-ky-thuat-may";
import "./rebuild-catalog.css";
import "./ke-toan/ke-toan.css";
import "./ky-thuat-may.css";

// Kỳ + bộ lọc của chế độ Bảng, ghi lên URL `?man=`. Mốc MẶC ĐỊNH là Ngày kế hoạch (thay ô lọc
// tháng kế hoạch cũ, 06/10/2026) — chế độ Lịch không đọc bộ lọc này.
type LocMan = { ky: KyDS; loc: LocBaoTri };
const LOC_MAN_TRONG: LocMan = { ky: { loai: "tat_ca", moc: "ke_hoach" }, loc: LOC_BAO_TRI_TRONG };
const docLocMan = (p: URLSearchParams): LocMan => ({
  ky: kyTuUrl(p, MOC_BAO_TRI.map(([m]) => m), "ke_hoach"),
  loc: locBaoTriTuUrl(p),
});
const ghiLocMan = (t: LocMan) => ({ ...kyLenUrl(t.ky, "ke_hoach"), ...locBaoTriLenUrl(t.loc) });

interface Cot extends CotLuoi { w?: number; c?: boolean; title?: string }

/** Cột lưới, xếp theo nhóm nghĩa: Mã, Ngày, Máy, Việc, Hạn, Việc con, Trạng thái, Ảnh, Người. Bề rộng
 *  đủ cho chữ thật — tổng vượt khung thì lưới cuộn ngang như Báo giá, không ép cột hẹp rồi cắt "…".
 *  Người làm là cột co giãn cuối. */
const COT_BT: Cot[] = [
  { key: "ma", label: "Mã phiếu", coDinh: true, w: 110 },
  { key: "ngay", label: "Ngày tạo", w: 110 },
  { key: "may", label: "Máy", w: 270 },
  { key: "viec", label: "Việc bảo trì", w: 270 },
  { key: "han", label: "Hạn làm", w: 190 },
  { key: "vc", label: "Việc con", w: 120, title: "Việc con đã làm hoặc đánh không áp dụng, trên tổng số" },
  { key: "tt", label: "Trạng thái", w: 120 },
  { key: "anh", label: "Ảnh", w: 60, c: true },
  { key: "nguoi", label: "Người làm", title: "Người bấm xác nhận đã bảo trì xong" },
];

function chuKyChu(p: BaoTri): string {
  if (!p.chu_ky_so) return p.loai === "dot_xuat" ? "Ngoài lịch" : "—";
  return `${Number(p.chu_ky_so)} ${NHAN_DON_VI_CHU_KY[p.chu_ky_don_vi ?? ""] ?? p.chu_ky_don_vi ?? ""}`;
}

/** Khoảng cách tới hạn: phiếu còn dở thì trễ/còn bao nhiêu ngày; đã xong thì ngày xong; đã hủy thì
 *  nói là đã hủy (lý do ở tooltip). Tính theo ngày lịch của máy người dùng — cùng gốc với `homNay()`. */
function soVoiHan(p: BaoTri): { chu: string; kieu: "tre" | "nay" | "con" | "nhat" } {
  if (p.trang_thai === "hoan_thanh") return { chu: p.ngay_hoan_thanh ? `xong ${ngayDayDu(p.ngay_hoan_thanh)}` : "đã xong", kieu: "nhat" };
  if (p.trang_thai === "da_huy") return { chu: "đã hủy", kieu: "nhat" };
  const han = new Date(`${p.ngay_ke_hoach}T00:00:00`).getTime();
  const nay = new Date(`${homNay()}T00:00:00`).getTime();
  const lech = Math.round((han - nay) / 86400000);
  if (lech < 0) return { chu: `trễ ${-lech} ngày`, kieu: "tre" };
  if (lech === 0) return { chu: "hôm nay", kieu: "nay" };
  return { chu: `còn ${lech} ngày`, kieu: "con" };
}

const tenViec = (r: BaoTri) => r.goi_ten ?? (r.loai === "dot_xuat" ? "Bảo trì ngoài lịch" : "—");

/** Màu chấm của từng nút lọc nhanh. */
const MAU_LOC: Record<string, MauTT> = {
  can_lam: "vang", qua_han: "do", hom_nay: "cam", sap_toi: "xanh", hoan_thanh: "la", da_huy: "xam",
};

export function PhieuBaoTriPage() {
  const { token } = useAuth();
  const can = useCan();
  const suaDuoc = can("phieu_bao_tri", "update");
  const taoDuoc = can("phieu_bao_tri", "create");
  const hepMan = useManHep();

  const [rows, setRows] = useState<BaoTri[]>([]);
  const [dem, setDem] = useState<Record<string, number>>({});
  const [tomTat, setTomTat] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [locMan, setLocMan] = useLocMan("phieu-bao-tri", LOC_MAN_TRONG, docLocMan, ghiLocMan);
  const dieuKien = useDieuKienBaoTri();
  const luoi = useCauHinhLuoi("phieu-bao-tri");
  const cotHien = luoi.rongHien(luoi.xep(COT_BT).filter((c) => !luoi.an.has(c.key)));
  const khoaLoc = JSON.stringify({ ...thamSoKy(locMan.ky), ...thamSoLocBaoTri(locMan.loc) });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const qTre = useTre(q);            // gõ xong 300ms mới hỏi máy chủ
  // Mặc định là VIỆC CẦN LÀM, không phải "tất cả": phiếu tích lại theo tháng, mở ra thấy cả đống
  // phiếu đã xong rồi phải cuộn tìm việc của hôm nay là sai ngay từ màn đầu.
  const [tab, setTab] = useState<string>("can_lam");
  const [mo, setMo] = useState<BaoTri | "new" | null>(null);
  const [may, setMay] = useState<Row[]>([]);
  const [loiMay, setLoiMay] = useState<string | null>(null);
  // Mặc định mở ra là BẢNG (user chốt 08/10/2026): đồng bộ mọi màn danh sách khác; Lịch là nút
  // chuyển ngay cạnh tiêu đề.
  const [xem, setXem] = useState<"lich" | "bang">("bang");
  const [thang, setThang] = useState(() => new Date());
  const [lichTick, setLichTick] = useState(0);   // đổi ⇒ lịch nạp lại (sau khi tạo/sửa/xoá phiếu)
  const [duKienMo, setDuKienMo] = useState<DuKien | null>(null);

  // Lọc + tìm kiếm + phân trang đều gửi LÊN SERVER. Lọc trên mảng đã tải chỉ lọc được trang đang
  // xem, mà con số trên nút lọc thì đếm ở DB ⇒ hai chỗ nói hai kiểu.
  const load = useCallback(() => {
    // Đang ở view LỊCH thì bảng đang bị ẩn — gọi API của bảng ở đây là tốn một request không ai nhìn.
    if (!token || xem !== "bang") return;
    setLoading(true);
    kyThuatMay.listBaoTri(token, {
      q: qTre.trim() || undefined,
      trang_thai: tab === "all" ? undefined : tab,
      ...JSON.parse(khoaLoc),
      page,
      size,
    })
      .then((r) => {
        setRows(r.items); setDem(r.dem ?? {}); setTotal(r.total); setError(null);
        const ve = trangHopLe(page, r.total, size);
        if (ve !== null) setPage(ve);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được danh sách."))
      .finally(() => setLoading(false));
  }, [token, qTre, tab, khoaLoc, page, size, xem]);

  useEffect(load, [load]);

  // Danh mục máy chỉ dùng cho ô "Máy" lúc THÊM VIỆC NGOÀI LỊCH ⇒ nạp lười. Trước đây gọi ngay
  // khi mở màn: 200 máy kèm cả túi JSON thông số của từng cái, tải về rồi phần lớn không ai dùng.
  useEffect(() => {
    if (!token || mo !== "new" || may.length > 0) return;
    setLoiMay(null);
    mayThietBi.list(token).then((r) => setMay(r.items))
      // Ô chọn máy rỗng trơn mà không nói gì thì người dùng tưởng xưởng chưa khai máy nào.
      .catch((e) => setLoiMay(e instanceof Error ? e.message : "Không tải được danh mục máy."));
  }, [token, mo, may.length]);

  // Số trên nút lọc ở chế độ Lịch nói chuyện TOÀN XƯỞNG nên hỏi riêng, KHÔNG dùng `dem` của danh
  // sách: `dem` đi theo bộ lọc đang xem. `size=1` để chỉ lấy phần đếm.
  useEffect(() => {
    if (!token) return;
    kyThuatMay.listBaoTri(token, { size: 1 })
      .then((r) => setTomTat(r.dem ?? {}))
      .catch(() => {});
  }, [token, lichTick]);

  // Đổi bộ lọc thì về trang 1: đứng ở trang 5 rồi lọc còn 2 trang là bảng trống trơn không rõ vì sao.
  const doiLoc = (fn: () => void) => { fn(); setPage(1); };
  const datLoc = (t: LocMan) => doiLoc(() => setLocMan(t));
  // Nút đếm toàn xưởng ⇒ bấm từ Lịch thì bỏ kỳ + điều kiện để bảng khớp đúng con số vừa bấm.
  const boLoc = () => setLocMan({ ...LOC_MAN_TRONG, ky: { loai: "tat_ca", moc: locMan.ky.moc } });

  // Nút lọc nhanh hiện ở CẢ hai chế độ: ở Lịch thì đếm toàn xưởng (`tomTat`), bấm vào là sang Bảng
  // đã lọc sẵn; ở Bảng thì đếm theo bộ lọc đang xem (`dem`). Quá hạn + Hôm nay + 7 ngày tới là ba
  // lát KHÔNG chồng nhau của Chưa làm. Bảng chưa nạp lượt đầu thì mượn số toàn xưởng.
  const nguon = xem === "bang" && Object.keys(dem).length > 0 ? dem : tomTat;
  const quaHanN = nguon.qua_han ?? 0;
  const tabs = [
    { id: "all", nhan: "Tất cả", so: (nguon.cho_thuc_hien ?? 0) + (nguon.hoan_thanh ?? 0) + (nguon.da_huy ?? 0) },
    { id: "can_lam", nhan: "Chưa làm", so: nguon.cho_thuc_hien ?? 0 },
    { id: "qua_han", nhan: "Quá hạn", so: quaHanN },
    { id: "hom_nay", nhan: "Hôm nay", so: (nguon.den_hom_nay ?? 0) - quaHanN },
    { id: "sap_toi", nhan: "7 ngày tới", so: nguon.sap_toi ?? 0 },
    { id: "hoan_thanh", nhan: NHAN_TT_BAO_TRI.hoan_thanh, so: nguon.hoan_thanh ?? 0 },
    { id: "da_huy", nhan: NHAN_TT_BAO_TRI.da_huy, so: nguon.da_huy ?? 0 },
  ];
  const tongTatCa = (tomTat.cho_thuc_hien ?? 0) + (tomTat.hoan_thanh ?? 0) + (tomTat.da_huy ?? 0);
  const chonLoc = (id: string) => {
    if (xem === "bang") { doiLoc(() => setTab(id)); return; }
    setXem("bang");
    doiLoc(() => { setTab(id); boLoc(); });
  };
  // Trạng thái trong nút Lọc = chính hàng lọc nhanh (đọc/ghi `tab`, về trang 1 như bấm nút).
  const dkDu: DieuKien<LocBaoTri>[] = [
    dkTheoTab<LocBaoTri>({
      tabs, tatCa: "all", dang: tab, dat: (id) => doiLoc(() => setTab(id)), anKhoi: true,
    }),
    ...dieuKien,
  ];

  const xoaLoc = () => doiLoc(() => { setQ(""); setTab("all"); setLocMan(LOC_MAN_TRONG); });
  const rong = tongTatCa === 0 ? (
    <>
      Chưa có phiếu nào. Mở chế độ Lịch: kỳ bảo trì sắp tới hiện mờ ở đúng ngày, bấm vào là tạo phiếu.{" "}
      <button type="button" className="lds-lk" onClick={() => setXem("lich")}>Mở lịch bảo trì</button>
    </>
  ) : (
    <>Không có phiếu nào khớp bộ lọc. <button type="button" className="lds-lk" onClick={xoaLoc}>Xoá bộ lọc</button></>
  );

  const o = (r: BaoTri, key: string): ReactNode => {
    switch (key) {
      case "ma": return r.ma;
      case "may": return <>{r.may_ma ?? "—"}{r.may_ten && <span className="ktm-phu">{r.may_ten}</span>}</>;
      case "viec": return (
        <span title={tenViec(r)}>
          {tenViec(r)}
          {r.loai !== "dot_xuat" && <span className="lds-tag">{chuKyChu(r)}</span>}
        </span>
      );
      // Hạn + khoảng cách tới hạn chung một ô; "trễ N ngày" màu đỏ ĐÃ là dấu quá hạn nên chip trạng
      // thái không nhắc "Quá hạn" lần nữa.
      case "han": {
        const han = soVoiHan(r);
        const chu = [
          r.da_doi ? `Đã dời, hạn ban đầu ${fmtNgay(r.ngay_ke_hoach_goc)}` : "",
          r.trang_thai === "da_huy" ? (r.ly_do_huy ?? "") : "",
        ].filter(Boolean).join("\n");
        return (
          <span title={chu || undefined}>
            {ngayDayDu(r.ngay_ke_hoach)}
            <span className={`ktm-phu ktm-han--${han.kieu}`}>{han.chu}</span>
          </span>
        );
      }
      // Việc đánh "không áp dụng" cũng tính là đã xử lý — nó mở được cửa đóng phiếu, nên cột phải
      // đếm, không thì phiếu đủ điều kiện xong mà cột vẫn hiện 3/4.
      case "vc": {
        const hm = r.hang_muc ?? [];
        if (hm.length === 0) return <span className="lds-mu3">không có</span>;
        const xong = hm.filter((h) => h.xong || h.bo_qua).length;
        return (
          <span className="ktm-viec">
            <span className="ktm-viec__vach"><span style={{ width: `${Math.round((xong / hm.length) * 100)}%` }} /></span>
            {xong}/{hm.length}
          </span>
        );
      }
      case "tt": return <BadgeBaoTri trangThai={r.trang_thai} />;
      case "anh": return r.so_anh > 0 ? String(r.so_anh) : "";
      case "ngay": return <span className="lds-mu" title={ngayGioDayDu(r.created_at)}>{ngayDayDu(r.created_at)}</span>;
      case "nguoi": return r.nguoi_thuc_hien ?? "";
      default: return null;
    }
  };

  return (
    <div className="ktm lds">
      <header className="lds-dau">
        <h1 className="lds-dau__ten">Phiếu bảo trì</h1>
        {/* Chuyển chế độ xem đứng cạnh tên màn: nó đổi cả màn hình bên dưới. */}
        <div className="ktm-xem" role="group" aria-label="Chế độ xem">
          <button type="button" className={`ktm-xem__nut${xem === "lich" ? " is-active" : ""}`}
            aria-pressed={xem === "lich"} onClick={() => setXem("lich")}>
            <Icon name="calendar" size={14} /> Lịch
          </button>
          <button type="button" className={`ktm-xem__nut${xem === "bang" ? " is-active" : ""}`}
            aria-pressed={xem === "bang"} onClick={() => setXem("bang")}>
            <Icon name="table" size={14} /> Bảng
          </button>
        </div>
        {/* Chỉ còn MỘT cách tạo phiếu định kỳ: bấm ô kỳ dự kiến trên màn Lịch. Nút dưới đây chỉ để
            lập phiếu NGOÀI LỊCH. */}
        <div className="lds-dau__nut">
          {taoDuoc && (
            <Button variant="accent" onClick={() => setMo("new")}>
              <Icon name="plus" size={15} /> Thêm việc ngoài lịch
            </Button>
          )}
        </div>
      </header>

      <section className="lds-loc">
        <LocNhanhTrangThai dang={xem === "bang" ? tab : ""} onChon={chonLoc}
          muc={tabs.map((t) => ({ key: t.id, label: t.nhan, count: t.so, mau: MAU_LOC[t.id] }))} />
        {xem === "bang" && (
          <div className="lds-loc__thanh tl-thanh" role="search">
            <OTim value={q} onChange={(v) => doiLoc(() => setQ(v))}
              placeholder="Tìm mã phiếu, máy, việc" ariaLabel="Tìm phiếu bảo trì" />
            <ThanhLoc
              ky={locMan.ky}
              moc={MOC_BAO_TRI}
              onKy={(ky) => datLoc({ ...locMan, ky })}
              dieuKien={dkDu}
              loc={locMan.loc}
              onLoc={(loc) => datLoc({ ...locMan, loc })}
            />
            {/* Điện thoại hiện thẻ chứ không hiện lưới nên không có cột để ẩn. */}
            {!hepMan && <ChonCot cot={COT_BT} {...luoi.chonCot} />}
          </div>
        )}
      </section>

      {error && (
        <div className="banner banner--error" role="alert">
          <span>{error}</span>
          <button type="button" className="lds-lk" onClick={load}>Tải lại</button>
        </div>
      )}

      {xem === "lich" ? (
        <LichBaoTri
          thang={thang}
          nap={lichTick}
          onDoiThang={setThang}
          onMoPhieu={(p) => setMo(p)}
          onTaoTuDuKien={(d) => setDuKienMo(d)}
        />
      ) : hepMan ? (
        // Điện thoại: mỗi phiếu là một THẺ, giữ nguyên mọi thông tin của lưới.
        <>
          <div className="ktm-the-ds">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={`sk-${i}`} className="ktm-the is-skel">
                  <span className="rc-skel" style={{ width: "45%" }} />
                  <span className="rc-skel" style={{ width: "75%" }} />
                  <span className="rc-skel" style={{ width: "60%" }} />
                </div>
              ))
            ) : rows.length === 0 ? <p className="ktm-the-rong">{rong}</p> : rows.map((r) => {
              const xong = (r.hang_muc ?? []).filter((h) => h.xong || h.bo_qua).length;
              const tong = (r.hang_muc ?? []).length;
              const han = soVoiHan(r);
              return (
                <button key={r.id} type="button" className="ktm-the" onClick={() => setMo(r)}>
                  <span className="ktm-the__dau">
                    <span className="ktm-ma">{r.ma}</span>
                    <BadgeBaoTri trangThai={r.trang_thai} />
                  </span>
                  <span className="ktm-the__than">
                    <span className="ktm-may-badge">{r.may_ma ?? "—"}</span>
                    <span className="ktm-the__goi">{tenViec(r)}</span>
                  </span>
                  <span className="ktm-the__meta">
                    <span>Hạn {fmtNgay(r.ngay_ke_hoach)}</span>
                    <span className={`ktm-han--${han.kieu}`}>{han.chu}</span>
                    {tong > 0 && <span>{xong}/{tong} việc</span>}
                    {r.so_anh > 0 && <span>{r.so_anh} ảnh</span>}
                    {r.nguoi_thuc_hien && <span>{r.nguoi_thuc_hien}</span>}
                    <span title={ngayGioDayDu(r.created_at)}>Tạo {ngayDayDu(r.created_at)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {total > 0 && (
            <PhanTrangDayDu trang={page} size={size} tong={total} soDong={rows.length}
              onTrang={setPage} onSize={(n) => { setSize(n); setPage(1); }} loading={loading}
              donVi="phiếu" ariaLabel="Phân trang phiếu bảo trì" />
          )}
        </>
      ) : (
        <div className="lds-sheet">
          <CuonLuoi ghim={luoi.soGhim(cotHien)}>
            <table className="lds-g" style={{ minWidth: rongLuoi(cotHien, 180) }}>
              <colgroup>
                {cotHien.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
              </colgroup>
              <thead>
                <tr>
                  {cotHien.map((c) => <th key={c.key} className={c.c ? "c" : undefined} title={c.title}>{c.label}{luoi.keo(c.key)}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  <EmptyRow colSpan={cotHien.length} trangThai="dang-tai" />
                ) : rows.length === 0 ? (
                  <tr><td colSpan={cotHien.length} className="lds-trong">{rong}</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className="lds-dong" tabIndex={0} onClick={() => setMo(r)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                        e.preventDefault();
                        setMo(r);
                      }
                    }}>
                    {cotHien.map((c) => {
                      const v = o(r, c.key);
                      return (
                        <td key={c.key} className={c.c ? "c" : undefined} onMouseEnter={hienChuDu}>{v}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CuonLuoi>
          {total > 0 && (
            <PhanTrangDayDu trang={page} size={size} tong={total} soDong={rows.length}
              onTrang={setPage} onSize={(n) => { setSize(n); setPage(1); }} loading={loading}
              donVi="phiếu" ariaLabel="Phân trang phiếu bảo trì" />
          )}
        </div>
      )}

      {mo === "new" ? (
        <ThemNgoaiLichHop may={may} loiMay={loiMay} onClose={() => setMo(null)}
          // Lập xong mở luôn phiếu: thêm ảnh, ghi chú, xác nhận xong đều ở ngăn chi tiết.
          onCreated={(p) => { load(); setLichTick((t) => t + 1); setMo(p); }} />
      ) : mo ? (
        <BaoTriDrawer
          phieu={mo}
          suaDuoc={suaDuoc}
          onClose={() => setMo(null)}
          onSaved={(p) => { load(); setLichTick((t) => t + 1); setMo(p); }}
        />
      ) : null}

      {duKienMo && (
        <XacNhanTaoTuDuKien
          duKien={duKienMo}
          onClose={() => setDuKienMo(null)}
          onCreated={(p) => {
            load();
            setLichTick((t) => t + 1);
            setDuKienMo(null);
            setMo(p);          // mở luôn phiếu vừa tạo: bấm ô lịch là để LÀM việc đó, không phải để ngắm
          }}
        />
      )}
    </div>
  );
}

/** Hộp thoại "Thêm việc ngoài lịch" — phiếu bảo trì đột xuất (máy kêu lạ, thuê hãng ngoài…). */
function ThemNgoaiLichHop({ may, loiMay, onClose, onCreated }: {
  may: Row[];
  loiMay: string | null;
  onClose: () => void;
  onCreated: (p: BaoTri) => void;
}) {
  const { token } = useAuth();
  const [mayId, setMayId] = useState("");
  const [ngay, setNgay] = useState(homNay());
  const [goiTen, setGoiTen] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  const gui = async () => {
    if (!token || dang) return;
    if (!mayId) { setLoi("Chưa chọn máy."); return; }
    setDang(true);
    setLoi(null);
    try {
      const p = await kyThuatMay.createBaoTri(token, {
        may_id: Number(mayId),
        loai: "dot_xuat",
        goi_ten: goiTen.trim() || null,
        ngay_ke_hoach: ngay,
        ghi_chu: ghiChu.trim() || null,
      });
      onCreated(p);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "Tạo phiếu không thành công.");
      setDang(false);
    }
  };

  return (
    <HopThoai tieuDe="Thêm việc ngoài lịch" nutChinh="Tạo phiếu" dangGui={dang} loi={loi}
      coNoiDung={!!(mayId || goiTen || ghiChu)} onGui={() => void gui()} onDong={onClose}>
      <div className="ktm-luoi2">
        <label className="ktm-f">
          <span className="ktm-f__nhan">Máy</span>
          <select className="ktm-o" value={mayId} onChange={(e) => setMayId(e.target.value)}>
            <option value="">Chọn máy</option>
            {may.map((m) => <option key={m.id} value={m.id}>{String(m.ma)} {String(m.ten)}</option>)}
          </select>
          {loiMay && <span className="ktm-f__goiy lds-do">{loiMay}</span>}
        </label>
        <label className="ktm-f">
          <span className="ktm-f__nhan">Hạn làm</span>
          <ChonNgay className="ktm-o" aria-label="Hạn làm" value={ngay} onChange={(v) => setNgay(v)} />
        </label>
      </div>
      <ONhap nhan="Việc bảo trì" giaTri={goiTen} khoa={false}
        placeholder="vd: Kiểm tra cảm biến nhiệt, thay dao bế mòn" onChange={setGoiTen} />
      <ONhap nhan="Ghi chú kỹ thuật" giaTri={ghiChu} khoa={false}
        placeholder="Thuê hãng ngoài thì ghi ở đây, vd: KT hãng Bobst VN sang xử lý lúc 14h"
        onChange={setGhiChu} />
    </HopThoai>
  );
}

/** Bấm một ô DỰ KIẾN trên lịch → xác nhận rồi tạo phiếu thật cho đúng gói, đúng ngày đó.
 *
 * Hỏi một nhịp chứ không tạo ngay: ô dự kiến nằm sát ô phiếu thật trên cùng một lưới, bấm nhầm là
 * đẻ phiếu mà không ai chủ ý. */
function XacNhanTaoTuDuKien({ duKien, onClose, onCreated }: {
  duKien: DuKien;
  onClose: () => void;
  onCreated: (p: BaoTri) => void;
}) {
  const { token } = useAuth();
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  const tao = async () => {
    if (!token) return;
    setDang(true);
    setLoi(null);
    try {
      const p = await kyThuatMay.createBaoTri(token, {
        may_id: duKien.may_id,
        goi_id: duKien.goi_id,
        loai: "dinh_ky",
        ngay_ke_hoach: duKien.ngay,
      });
      onCreated(p);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "Không tạo được phiếu.");
      setDang(false);
    }
  };

  return (
    <ConfirmDialog
      open
      title={
        <div className="ktm-dialog-title">
          <Icon name="calendar" size={18} />
          <span>Tạo phiếu bảo trì cho kỳ này?</span>
        </div>
      }
      confirmLabel="Tạo phiếu ngay"
      busy={dang}
      error={loi}
      onConfirm={tao}
      onCancel={onClose}
    >
      <div className="ktm-dukien-card">
        <div className="ktm-dukien-card__head">
          <span className="ktm-may-badge">{duKien.may_ma}</span>
          <strong className="ktm-dukien-card__goi">{duKien.goi_ten ?? "Bảo trì định kỳ"}</strong>
        </div>
        {duKien.may_ten && <p className="ktm-dukien-card__mayten">{duKien.may_ten}</p>}

        <div className="ktm-dukien-card__chips">
          <span className="ktm-meta-chip">
            <Icon name="calendar" size={12} /> Kế hoạch: <strong>{fmtNgay(duKien.ngay)}</strong>
          </span>
          {duKien.chu_ky_so && (
            <span className="ktm-meta-chip">
              <Icon name="refresh" size={12} /> Mỗi {duKien.chu_ky_so} {NHAN_DON_VI_CHU_KY[duKien.chu_ky_don_vi ?? ""] ?? duKien.chu_ky_don_vi}
            </span>
          )}
        </div>

        <p className="ktm-dukien-card__hint">
          ⚡ Tất cả hạng mục công việc trong gói sẽ được chép tự động sang phiếu mới và đưa vào danh sách <strong>Chờ thực hiện</strong>.
        </p>
      </div>
    </ConfirmDialog>
  );
}

/** Ngăn chi tiết phiếu bảo trì (phương án A2): trái là việc cần làm + ghi chú + ảnh, phải là cột
 *  thuộc tính + nút xác nhận xong / hủy phiếu ở đáy cột. */
function BaoTriDrawer({ phieu, suaDuoc, onClose, onSaved }: {
  phieu: BaoTri;
  suaDuoc: boolean;
  onClose: () => void;
  onSaved: (p: BaoTri) => void;
}) {
  const { token } = useAuth();
  const [hienTai, setHienTai] = useState<BaoTri>(phieu);
  const [loi, setLoi] = useState<string | null>(null);
  const [anh, setAnh] = useState<Anh[]>([]);
  const [anhTick, setAnhTick] = useState(0);
  const [tab, setTab] = useState("chi-tiet");
  const [goiTen, setGoiTen] = useState(phieu.goi_ten ?? "");
  const [ghiChu, setGhiChu] = useState(phieu.ghi_chu ?? "");
  const [luu, setLuu] = useState(false);
  const [dangDoi, setDangDoi] = useState(false);
  // hủy phiếu — dialog kèm lý do (lý do do chính dialog giữ)
  const [moHuy, setMoHuy] = useState(false);
  // ngày làm THẬT khi xác nhận xong (thợ làm thứ Bảy, thứ Hai mới vào bấm)
  const [ngayXong, setNgayXong] = useState(homNay());
  // kỳ kế tiếp (chỉ phiếu đã xong, thuộc một gói) + việc đang hỏi lý do "không áp dụng"
  const [kySau, setKySau] = useState<string | null>(null);
  const [boQuaViec, setBoQuaViec] = useState<{ id: string; ten: string } | null>(null);

  const xong = hienTai.trang_thai === "hoan_thanh";
  const daHuy = hienTai.trang_thai === "da_huy";
  const khoaSua = !suaDuoc || xong || daHuy;
  const doi = goiTen !== (hienTai.goi_ten ?? "") || ghiChu !== (hienTai.ghi_chu ?? "");

  useEffect(() => {
    setHienTai(phieu);
    setGoiTen(phieu.goi_ten ?? "");
    setGhiChu(phieu.ghi_chu ?? "");
  }, [phieu]);

  // Nạp lại ĐÚNG phiếu này sau khi ảnh đổi. Bản cũ kéo cả danh sách theo máy rồi `find`: phiếu nằm
  // ngoài trang đầu là không thấy ⇒ cờ `co_anh_sau` đứng im và nút "Xác nhận" vẫn khoá dù ảnh đã lên.
  useEffect(() => {
    if (!token || anhTick === 0) return;
    kyThuatMay.getBaoTri(token, hienTai.id).then(setHienTai).catch(() => {});
  }, [anhTick, token, hienTai.id]);

  // Ảnh nạp Ở ĐÂY một lần cho cả hai khối (trước/sau) — mỗi khối tự gọi là hai request giống hệt
  // nhau mỗi lần mở phiếu, thêm/xoá một tấm lại hai lần nữa.
  const napAnh = useCallback(() => {
    if (!token) return;
    kyThuatMay.listAnh(token, "bao_tri", hienTai.id).then(setAnh)
      // Ảnh lên rồi mà khối ảnh trống + nút xác nhận vẫn khoá, không lời nào — đúng cái bẫy này.
      .catch((e) => setLoi(e instanceof Error ? e.message : "Không tải được danh sách ảnh."));
  }, [token, hienTai.id]);
  useEffect(napAnh, [napAnh]);
  const anhDoi = () => { napAnh(); setAnhTick((t) => t + 1); };

  // Kỳ kế tiếp của gói — hỏi backend (`/bao-tri/han/{may_id}`) chứ không tự cộng chu kỳ ở FE: mốc
  // thật là ngày hoàn thành MỚI NHẤT của gói, phiếu đang mở có thể không phải cái mới nhất.
  useEffect(() => {
    setKySau(null);
    if (!token || hienTai.trang_thai !== "hoan_thanh" || !hienTai.goi_id) return;
    kyThuatMay.hanCuaMay(token, hienTai.may_id)
      .then((ds) => setKySau(ds.find((g) => g.goi_id === hienTai.goi_id)?.han ?? null))
      .catch(() => {});
  }, [token, hienTai.id, hienTai.trang_thai, hienTai.goi_id]);

  const luuPhieu = async () => {
    if (!token || luu) return;
    setLoi(null);
    setLuu(true);
    try {
      const p = await kyThuatMay.updateBaoTri(token, hienTai.id, {
        goi_ten: goiTen.trim() || null,
        ghi_chu: ghiChu.trim() || null,
      });
      setHienTai(p);
      onSaved(p);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "Lưu không thành công.");
    } finally {
      setLuu(false);
    }
  };

  const tick = async (
    hangMucId: string | null | undefined, giaTri: boolean,
    them?: { bo_qua?: boolean; ly_do?: string },
  ) => {
    if (!token || !hangMucId) return;
    try {
      const p = await kyThuatMay.tickHangMuc(token, hienTai.id, hangMucId, giaTri, them);
      setHienTai(p);
      onSaved(p);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "Không lưu được việc cần làm.");
    }
  };

  // Ném lỗi ra để dialog hủy tự hiện — thành công thì đóng dialog. Không nuốt lỗi ở đây, không thì
  // dialog đóng lại như đã hủy trong khi backend từ chối (vd phiếu vừa được người khác cho hoàn thành).
  const huyPhieu = async (ly_do: string) => {
    if (!token) return;
    const p = await kyThuatMay.huyBaoTri(token, hienTai.id, ly_do);
    setHienTai(p);
    onSaved(p);
    setMoHuy(false);
  };

  const doiTrangThai = async (tt: string) => {
    if (!token || dangDoi) return;
    setLoi(null);
    setDangDoi(true);
    try {
      const p = await kyThuatMay.trangThaiBaoTri(
        token, hienTai.id, tt, tt === "hoan_thanh" ? ngayXong : null,
      );
      setHienTai(p);
      onSaved(p);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "Không đổi được trạng thái.");
    } finally {
      setDangDoi(false);
    }
  };

  const hangMuc = hienTai.hang_muc ?? [];
  // "Đã xử lý" = tick xong HOẶC đánh không áp dụng — đây chính là điều kiện backend dùng để mở cửa
  // đóng phiếu, nên màn hình phải đếm y hệt, không thì nút khoá mà người dùng không hiểu vì sao.
  const daXuLy = hangMuc.filter((h) => h.xong || h.bo_qua).length;
  const conViec = hangMuc.length - daXuLy;
  const han = soVoiHan(hienTai);
  // Lý do nút khoá nói thẳng dưới nút (hai cửa thật của service), không giấu trong tooltip.
  const thieu = [
    conViec > 0 ? `còn ${conViec} việc chưa xử lý` : "",
    !hienTai.co_anh_sau ? "chưa có ảnh sau khi làm" : "",
  ].filter(Boolean);
  const lyDoKhoa = thieu.length > 0
    ? `${thieu.join(" và ").replace(/^./, (c) => c.toUpperCase())}.`
    : doi ? "Lưu thay đổi trước đã." : null;

  const cuoi = !suaDuoc ? undefined : !xong && !daHuy ? (
    <>
      <label className="ktm-f">
        <span className="ktm-f__nhan">Ngày làm xong</span>
        <ChonNgay className="ktm-o" aria-label="Ngày làm xong" value={ngayXong} max={homNay()}
          onChange={(v) => setNgayXong(v)} />
      </label>
      <Button variant="accent" disabled={!!lyDoKhoa || dangDoi} onClick={() => void doiTrangThai("hoan_thanh")}>
        {dangDoi ? "Đang lưu…" : "Xác nhận đã bảo trì xong"}
      </Button>
      {lyDoKhoa && <span className="ktm-ly">{lyDoKhoa}</span>}
      <Button variant="ghost" className="ktm-nut-do" onClick={() => { setMoHuy(true); setLoi(null); }}>
        Hủy phiếu
      </Button>
    </>
  ) : (
    // Một lối lùi DUY NHẤT để sửa phiếu ký nhầm / hủy nhầm — mở lại về hàng chờ.
    <Button variant="ghost" disabled={dangDoi} onClick={() => void doiTrangThai("cho_thuc_hien")}>
      {xong ? "Mở lại phiếu (ghi nhầm)" : "Mở lại phiếu (hủy nhầm)"}
    </Button>
  );

  const cot = (
    <CotPhieu cuoi={cuoi}>
      <DongTT nhan="Trạng thái"><BadgeBaoTri trangThai={hienTai.trang_thai} /></DongTT>
      {daHuy && <DongTT nhan="Lý do hủy"><span className="lds-do">{hienTai.ly_do_huy ?? "—"}</span></DongTT>}
      <DongTT nhan="Máy">
        {hienTai.may_ma ?? "—"}{hienTai.may_ten && <span className="ktm-phu">{hienTai.may_ten}</span>}
      </DongTT>
      <DongTT nhan="Chu kỳ">{chuKyChu(hienTai)}</DongTT>
      <DongTT nhan="Hạn làm">
        {fmtNgay(hienTai.ngay_ke_hoach)}
        {han.kieu !== "nhat" && <span className={`ktm-phu ktm-han--${han.kieu}`}>{han.chu}</span>}
      </DongTT>
      {/* "Đã dời" là dữ liệu CŨ — chức năng dời lịch đã gỡ, nhưng phiếu dời trước đó vẫn phải kể
          lại đúng để không mất vết. */}
      {hienTai.da_doi && (
        <DongTT nhan="Hạn ban đầu">
          <span title={hienTai.ly_do_doi ? `Lý do dời: ${hienTai.ly_do_doi}` : undefined}>
            {fmtNgay(hienTai.ngay_ke_hoach_goc)}
          </span>
        </DongTT>
      )}
      {xong && <DongTT nhan="Làm xong ngày">{fmtNgay(hienTai.ngay_hoan_thanh)}</DongTT>}
      {/* KHÔNG có ô "người nhận việc": ai bấm "Xác nhận đã bảo trì xong" thì chính người đó là
          người làm, và tên chỉ có SAU khi xong. */}
      <DongTT nhan="Người làm">
        {hienTai.nguoi_thuc_hien ?? <span className="lds-mu3">người bấm xác nhận</span>}
      </DongTT>
      {kySau && <DongTT nhan="Kỳ kế tiếp">{fmtNgay(kySau)}</DongTT>}
      <DongTT nhan="Ngày tạo"><span className="lds-mu">{fmtNgay(hienTai.created_at)}</span></DongTT>
    </CotPhieu>
  );

  return (
    <>
      <NganPhai
        tieuDe={<><span className="ktm-ngan-ma">{hienTai.ma}</span>{tenViec(hienTai)}</>}
        // In bằng chính cửa sổ trình duyệt + khối `@media print` trong ky-thuat-may.css — không
        // đẻ endpoint PDF cho một tờ giấy mang xuống xưởng.
        hanhDong={
          <button type="button" className="kt-ic ktm-in-nut" aria-label="In phiếu" title="In phiếu bảo trì"
            onClick={() => window.print()}>
            <Icon name="printer" size={16} />
          </button>
        }
        tabs={[{ id: "chi-tiet", nhan: "Chi tiết" }, { id: "lich-su", nhan: "Lịch sử thao tác" }]}
        tab={tab} onTab={setTab}
        onDong={onClose}
        chanDong={() => doi}
        cot={cot}
        chan={!khoaSua && tab === "chi-tiet" ? (
          <>
            <span className="kt-ngan__xt">{doi ? "Có thay đổi chưa lưu" : ""}</span>
            <Button variant="ghost" disabled={!doi || luu}
              onClick={() => { setGoiTen(hienTai.goi_ten ?? ""); setGhiChu(hienTai.ghi_chu ?? ""); }}>
              Bỏ thay đổi
            </Button>
            <Button variant="accent" disabled={!doi || luu} onClick={() => void luuPhieu()}>
              {luu ? "Đang lưu…" : "Lưu"}
            </Button>
          </>
        ) : undefined}
      >
        {tab === "lich-su" ? (
          <NhatKyPhieu loai="ky_thuat_bao_tri" phieuId={hienTai.id} />
        ) : (
          <div className="ktm-trai ktm-pbt">
            {loi && <div className="banner banner--error" role="alert">{loi}</div>}
            {hangMuc.length > 0 && (
              <section>
                <div className="ktm-viec-dau">
                  <span className="ktm-f__nhan">Việc cần làm</span>
                  <span className="ktm-viec">
                    <span className="ktm-viec__vach ktm-viec__vach--dai">
                      <span style={{ width: `${Math.round((daXuLy / hangMuc.length) * 100)}%` }} />
                    </span>
                    {daXuLy}/{hangMuc.length} đã xử lý
                  </span>
                </div>
                <div className="ktm-ds-viec">
                  {hangMuc.map((h, i) => (
                    <div key={h.id ?? i} className={`ktm-ds-viec__dong${h.xong ? " is-xong" : ""}${h.bo_qua ? " is-bo" : ""}`}>
                      <label className="ktm-ds-viec__chon">
                        <input type="checkbox" checked={!!h.xong} disabled={khoaSua || !h.id || !!h.bo_qua}
                          onChange={(e) => void tick(h.id, e.target.checked)} />
                        <span className="ktm-ds-viec__ten">{h.ten}</span>
                      </label>
                      {h.bo_qua && (
                        <span className="ktm-ds-viec__bo" title={h.ly_do_bo_qua ?? undefined}>
                          Không áp dụng{h.ly_do_bo_qua && <span className="lds-mu">{h.ly_do_bo_qua}</span>}
                        </span>
                      )}
                      {!khoaSua && h.id && !h.xong && (
                        h.bo_qua ? (
                          <button type="button" className="ktm-lk-nhat"
                            onClick={() => void tick(h.id, false, { bo_qua: false })}>Bỏ đánh dấu</button>
                        ) : (
                          <button type="button" className="ktm-lk-nhat"
                            onClick={() => setBoQuaViec({ id: h.id!, ten: h.ten })}>Không áp dụng</button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!khoaSua && (
              <ONhap nhan="Việc bảo trì" giaTri={goiTen} khoa={false}
                goiY={hienTai.goi_id ? "Sinh từ gói trong lịch bảo trì của máy. Sửa tên ở đây chỉ đổi trên phiếu này." : undefined}
                onChange={setGoiTen} />
            )}
            <ONhap nhan="Ghi chú kỹ thuật" giaTri={ghiChu} khoa={khoaSua}
              placeholder="Thuê hãng ngoài thì ghi ở đây, vd: KT hãng Bobst VN sang xử lý lúc 14h"
              onChange={setGhiChu} />
            <div className="ktm-luoi2">
              <AnhBox loai="bao_tri" phieuId={hienTai.id} giaiDoan="truoc"
                tieuDe="Ảnh trước khi làm" khoa={khoaSua} tatCaAnh={anh} onChanged={anhDoi} />
              <AnhBox loai="bao_tri" phieuId={hienTai.id} giaiDoan="sau"
                tieuDe="Ảnh sau khi làm" batBuoc canChu="cần ít nhất 1 ảnh"
                khoa={xong || daHuy || !suaDuoc} tatCaAnh={anh} onChanged={anhDoi} />
            </div>
          </div>
        )}
      </NganPhai>

      {/* Lý do "không áp dụng" — hỏi bằng dialog chứ không prompt(): lý do này đi thẳng vào nhật ký
          phiếu và là thứ người ta đọc lại khi máy hỏng ngay sau kỳ bảo trì. */}
      {boQuaViec && (
        <LyDoBoQuaDialog
          ten={boQuaViec.ten}
          onCancel={() => setBoQuaViec(null)}
          onConfirm={async (ly_do) => {
            await tick(boQuaViec.id, false, { bo_qua: true, ly_do });
            setBoQuaViec(null);
          }}
        />
      )}

      {moHuy && (
        <HuyPhieuDialog ma={hienTai.ma} onCancel={() => setMoHuy(false)} onConfirm={huyPhieu} />
      )}
    </>
  );
}

/** Hỏi lý do trước khi đánh một hạng mục là "không áp dụng lần này". */
function LyDoBoQuaDialog({ ten, onCancel, onConfirm }: {
  ten: string;
  onCancel: () => void;
  onConfirm: (lyDo: string) => Promise<void>;
}) {
  const [lyDo, setLyDo] = useState("");
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  return (
    <ConfirmDialog
      open
      title={
        <div className="ktm-dialog-title">
          <Icon name="alert" size={18} />
          <span>Việc này không phải làm lần này?</span>
        </div>
      }
      confirmLabel="Xác nhận không áp dụng"
      busy={dang}
      error={loi}
      onConfirm={async () => {
        if (!lyDo.trim()) { setLoi("Phải ghi lý do."); return; }
        setLoi(null);
        setDang(true);
        try {
          await onConfirm(lyDo.trim());
        } finally {
          setDang(false);
        }
      }}
      onCancel={onCancel}
    >
      <div className="ktm-boqua-form">
        <p className="ktm-boqua-form__viec"><strong>{ten}</strong></p>
        <label className="rc-field">
          <span className="rc-field__label">Lý do *</span>
          <input className="rc-input" value={lyDo} autoFocus
            placeholder="vd: máy này không có bộ lọc dầu"
            onChange={(e) => { setLyDo(e.target.value); setLoi(null); }} />
        </label>
        <p className="ktm-hint">
          Lý do được ghi vào nhật ký phiếu — người sau đọc lại biết vì sao việc này bỏ trống.
        </p>
      </div>
    </ConfirmDialog>
  );
}

/** Hỏi lý do trước khi HỦY phiếu bảo trì. Hủy ĐẢO ĐƯỢC (mở lại về hàng chờ) nên không cần đếm ngược,
 *  nhưng lý do là BẮT BUỘC — nó vào nhật ký để sau này biết vì sao kỳ này không làm. */
function HuyPhieuDialog({ ma, onCancel, onConfirm }: {
  ma: string;
  onCancel: () => void;
  onConfirm: (lyDo: string) => Promise<void>;
}) {
  const [lyDo, setLyDo] = useState("");
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  return (
    <ConfirmDialog
      open
      danger
      title={
        <div className="ktm-dialog-title">
          <Icon name="ban" size={18} />
          <span>Hủy phiếu {ma}?</span>
        </div>
      }
      confirmLabel="Hủy phiếu"
      busy={dang}
      error={loi}
      onConfirm={async () => {
        if (!lyDo.trim()) { setLoi("Phải ghi lý do hủy phiếu."); return; }
        setLoi(null);
        setDang(true);
        try {
          await onConfirm(lyDo.trim());
        } catch (e) {
          setLoi(e instanceof Error ? e.message : "Không hủy được phiếu.");
        } finally {
          setDang(false);
        }
      }}
      onCancel={onCancel}
    >
      <div className="ktm-boqua-form">
        <p className="ktm-hint">
          Phiếu chuyển sang <strong>Đã hủy</strong> — ngưng đếm việc, không tính quá hạn. Hủy nhầm thì
          mở lại được về hàng chờ, nhưng lý do vẫn được ghi vào nhật ký.
        </p>
        <label className="rc-field">
          <span className="rc-field__label">Lý do hủy *</span>
          <input className="rc-input" value={lyDo} autoFocus
            placeholder="vd: máy đã thanh lý"
            onChange={(e) => { setLyDo(e.target.value); setLoi(null); }} />
        </label>
      </div>
    </ConfirmDialog>
  );
}
