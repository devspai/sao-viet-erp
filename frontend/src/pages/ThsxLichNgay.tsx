// LỊCH NGÀY của bàn THỰC HIỆN SẢN XUẤT — lưới CỘT NGÀY cùng khuôn với bàn Xếp lịch (15/09/2026),
// thay cho Gantt trục giờ cũ (`ThsxTimeline`, zoom Giờ/Ca/Ngày/Tuần — đã gỡ).
//
// Mỗi VIỆC một dòng: ô nhãn dính bên trái (mã, trạng thái / công đoạn, máy / sản phẩm, khách /
// số lượng), bên phải HAI LÀN (10/10/2026):
//   - làn trên: thanh KẾ HOẠCH `du_kien_bat_dau → du_kien_ket_thuc`, viền nét đứt, chữ "KH …";
//   - làn dưới: thanh THỰC TẾ trên đúng những ngày có phiên chạy thật, tô màu theo trạng thái, chữ
//     "Chạy từ …" / "Tạm dừng" / "Xong …". Chờ làm ⇒ chưa có làn dưới.
// Trước đây thanh tô màu trạng thái nằm ở chỗ KẾ HOẠCH mà lại ghi giờ chạy THẬT ("Chạy từ 10/10"
// trên ô 6/10), còn chạy thật chỉ là vạch xám mảnh — đọc ngược nhau.
//
// Thanh DÍNH THEO NGUYÊN NGÀY, không theo tỉ lệ giờ (15/09/2026, lượt 2): một bước của tổ dài vài
// phút tới vài giờ, vẽ theo giờ trên ô ngày 96px thì bước 4 phút ra vạch 6px. Bàn tổ đọc "ngày nào
// làm việc gì, xong chưa", nên thanh chiếm trọn các ô ngày nó chạm và giờ cụ thể viết trong thanh.
//
// CHỈ ĐỌC: tổ trưởng không dời lịch (§5.2/§10.1) — không kéo–thả, bấm dòng/thanh chỉ phát `onChon(w)`.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as SuKienChuot } from "react";
import type { SxThucTeKhoang, SxWorkItem } from "../api/client";
import { Icon } from "../components/Icons";
import { ChipKcs, ChipKhuon, ChipLoaiBuoc } from "../components/ChipBuoc";
import { khungLuoi, moc, mocNgay, nhanNgay, ngayGio, soNgayGiua, themNgay } from "./xlShared";
import { slThucTe, sxSerial, ttMeta } from "./thsxShared";
import { ChamCho, type SxChoCuaViec } from "./thsxChoXacNhan";

interface Props {
  /** Ngày đầu cửa sổ (YYYY-MM-DD). */
  tu: string;
  soNgay: number;
  /** Việc CÓ GIỜ chạm cửa sổ, đã lọc + sắp theo giờ bắt đầu ở controller. */
  viec: SxWorkItem[];
  selectedId: number | null;
  onChon: (w: SxWorkItem) => void;
  /** Việc chờ tổ bấm theo công đoạn (§11.5) — chấm đỏ ở ô nhãn của dòng. */
  cho?: ReadonlyMap<number, SxChoCuaViec>;
  /** Đang lọc theo từ khoá? Lưới rỗng thì báo "không khớp" thay vì "khoảng ngày trống". */
  dangTim?: boolean;
}

/** "Bây giờ" dạng ISO naive theo đồng hồ máy người xem — cùng hệ với `du_kien_*` (giờ nhà máy,
 *  không múi). KHÔNG dùng `toISOString()`: chuỗi đó là giờ UTC, lệch 7 tiếng — qua nửa đêm là
 *  tô nhầm cột hôm nay. */
function bayGioIso(): string {
  const n = new Date();
  const p = (v: number) => String(v).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}T${p(n.getHours())}:${p(n.getMinutes())}`;
}

/** Mốc kết thúc THỰC của việc đã xong: phiên chạy khép sau cùng. Không có ⇒ null. */
function ketThucThucTe(w: SxWorkItem): string | null {
  let cuoi: string | null = null;
  for (const p of w.thuc_te ?? []) {
    if (p.ket_thuc && (cuoi === null || p.ket_thuc > cuoi)) cuoi = p.ket_thuc;
  }
  return cuoi;
}

/** Ngày (YYYY-MM-DD) của một mốc. Mốc KẾT THÚC đúng 00:00 thuộc về ngày TRƯỚC — việc xong lúc
 *  nửa đêm không chạm sang ngày hôm sau. */
function ngayCua(iso: string | null | undefined, laKetThuc = false): string | null {
  const m = iso?.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return laKetThuc && m[2] === "00" && m[3] === "00" ? themNgay(m[1], -1) : m[1];
}

const hm = (iso: string | null | undefined) => iso?.match(/[T ](\d{2}:\d{2})/)?.[1] ?? "";
/** "2026-09-15…" → "15/9" — cùng kiểu với đầu cột ngày. */
const dm = (iso: string | null | undefined) => {
  const d = ngayCua(iso);
  return d ? `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}` : "";
};

export interface ONgay {
  /** Chỉ số ô ngày đầu / cuối (0-based) trong cửa sổ, đã kẹp. */
  dau: number;
  cuoi: number;
  tranTrai: boolean;
  tranPhai: boolean;
}

/** Các ô ngày mà quãng `tuIso → denIso` chạm, kẹp vào cửa sổ `[cuaSoTu, +soNgay)`. `null` = nằm
 *  hẳn ngoài cửa sổ hoặc thiếu mốc. Thiếu mốc cuối thì coi như việc gọn trong ngày bắt đầu. */
export function oNgay(
  tuIso: string | null | undefined,
  denIso: string | null | undefined,
  cuaSoTu: string,
  soNgay: number,
): ONgay | null {
  const a = ngayCua(tuIso);
  const b = ngayCua(denIso ?? tuIso, true);
  if (!a || !b) return null;
  const i = soNgayGiua(cuaSoTu, a) - 1;
  const j = Math.max(i, soNgayGiua(cuaSoTu, b) - 1);
  if (j < 0 || i > soNgay - 1) return null;
  return { dau: Math.max(0, i), cuoi: Math.min(soNgay - 1, j), tranTrai: i < 0, tranPhai: j > soNgay - 1 };
}

/** Các dải NGÀY có chạy thật, gộp liền nhau. `mo` = trong dải có phiên đang mở (chưa bấm Kết thúc). */
export function dayThucTe(
  phien: SxThucTeKhoang[] | null | undefined,
  cuaSoTu: string,
  soNgay: number,
  bayGio: string,
): { dau: number; cuoi: number; mo: boolean }[] {
  const co: (0 | 1 | 2)[] = Array.from({ length: soNgay }, () => 0);
  for (const p of phien ?? []) {
    const o = oNgay(p.bat_dau, p.ket_thuc ?? bayGio, cuaSoTu, soNgay);
    if (!o) continue;
    for (let k = o.dau; k <= o.cuoi; k++) co[k] = Math.max(co[k], p.ket_thuc ? 1 : 2) as 1 | 2;
  }
  const ra: { dau: number; cuoi: number; mo: boolean }[] = [];
  for (let k = 0; k < soNgay; k++) {
    if (!co[k]) continue;
    const last = ra[ra.length - 1];
    if (last && last.cuoi === k - 1) {
      last.cuoi = k;
      last.mo = last.mo || co[k] === 2;
    } else {
      ra.push({ dau: k, cuoi: k, mo: co[k] === 2 });
    }
  }
  return ra;
}

/** Cỡ chữ trong thanh theo bề rộng: `du` ≥120px, `gon` 84–119px (bỏ chữ dẫn — "08:17–08:21" rộng
 *  ~70px), `mini` <84px (một mốc giờ — icon ở dòng 1 đã nói trạng thái). */
export type CoThanh = "du" | "gon" | "mini";

export function coThanh(rong: number): CoThanh {
  return rong >= 120 ? "du" : rong >= 84 ? "gon" : "mini";
}

/** Chữ trong thanh KẾ HOẠCH (làn trên): giờ dự kiến, khác ngày thì ngày đầu → ngày cuối. */
export function chuKeHoach(w: SxWorkItem, co: CoThanh): string {
  const a = w.du_kien_bat_dau;
  const b = w.du_kien_ket_thuc;
  const motNgay = ngayCua(a) === ngayCua(b, true);
  if (co === "mini") return motNgay ? hm(a) : `→ ${dm(b)}`;
  const truoc = co === "gon" ? "" : "KH ";
  if (!motNgay) return `${truoc}${dm(a)} → ${dm(b)}`;
  // Kế hoạch 0 phút (bắt đầu = kết thúc) ra "08:21–08:21" chỉ là nhiễu.
  return hm(a) === hm(b) ? `${truoc}${hm(a)}` : `${truoc}${hm(a)}–${hm(b)}`;
}

/** Chữ trong thanh THỰC TẾ (làn dưới) — thanh đã đứng đúng ngày chạy thật, nên chỉ kèm ngày khi
 *  thanh trải nhiều ngày (một mình giờ không biết rơi vào ngày nào của thanh). Chờ làm ⇒ "" (không
 *  có thanh thực tế). */
export function chuThucTe(w: SxWorkItem, co: CoThanh, nhieuNgay: boolean): string {
  switch (w.trang_thai) {
    case "running": {
      const mo = (w.thuc_te ?? []).filter((p) => !p.ket_thuc).map((p) => p.bat_dau).sort().pop();
      if (!mo) return co === "mini" ? "Chạy" : "Đang chạy";
      if (co === "mini") return hm(mo);
      return `${co === "gon" ? "Từ" : "Chạy từ"} ${nhieuNgay ? `${dm(mo)} ` : ""}${hm(mo)}`;
    }
    case "paused":
      return co === "mini" ? "Dừng" : "Tạm dừng";
    case "completed": {
      const kt = ketThucThucTe(w);
      if (!kt) return co === "mini" ? "Xong" : "Đã xong";
      if (co === "mini") return nhieuNgay ? dm(kt) : hm(kt);
      return `Xong ${nhieuNgay ? `${dm(kt)} ` : ""}${hm(kt)}`;
    }
    default:
      return "";
  }
}

/** Tổng phút trong cửa sổ `[tu, tu + soNgay)` cho dòng tóm tắt "Trong khoảng này tổ đã chạy …"
 *  (10/10/2026): `thucTe` = phiên chạy thật cắt theo cửa sổ; `keHoach` = phút chạy dự kiến
 *  (`chay_phut`) chia theo phần quãng kế hoạch nằm trong cửa sổ — quãng kế hoạch có thể vắt qua
 *  đêm, cộng thẳng độ dài quãng là đếm cả giờ nghỉ. */
export function phutTrongCuaSo(viec: SxWorkItem[], tu: string, soNgay: number, nowMs: number): { keHoach: number; thucTe: number } {
  const a = mocNgay(tu);
  const b = a + soNgay * 86_400_000;
  const giao = (t0: number, t1: number) => Math.max(0, Math.min(t1, b) - Math.max(t0, a));
  let keHoach = 0;
  let thucTe = 0;
  for (const w of viec) {
    const s = moc(w.du_kien_bat_dau);
    const e = moc(w.du_kien_ket_thuc);
    if (s !== null && e !== null && e >= s) {
      const g = giao(s, e);
      if (w.chay_phut != null && w.chay_phut > 0) keHoach += e > s ? w.chay_phut * (g / (e - s)) : (s >= a && s < b ? w.chay_phut : 0);
      else keHoach += g / 60_000;
    }
    for (const p of w.thuc_te ?? []) {
      const t0 = moc(p.bat_dau);
      const t1 = p.ket_thuc ? moc(p.ket_thuc) : nowMs;
      if (t0 !== null && t1 !== null) thucTe += giao(t0, t1) / 60_000;
    }
  }
  return { keHoach, thucTe };
}

export function ThsxLichNgay({ tu, soNgay, viec, selectedId, onChon, dangTim = false, cho }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Bề ngang KHUNG (không phải cửa sổ trình duyệt): bàn tổ còn cột Hàng chờ bên trái nên lưới hẹp
  // hơn cửa sổ. Cột ngày CO/GIÃN cho vừa đúng số ngày đã chọn — giãn khi khung thừa chỗ (khỏi mảng
  // trắng bên phải), co khi khung thiếu: ở 1280px mở Hàng chờ, cỡ gốc 168px của bàn Xếp lịch cho nút
  // "7 Ngày" thấy đúng 2,7 ngày (đo 15/09/2026). Co không dưới nấc nhỏ nhất của màn hẹp (96/64/36).
  const [khungW, setKhungW] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const doLai = () => setKhungW(el.clientWidth);
    doLai();
    const ro = new ResizeObserver(doLai);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const coSo = khungLuoi(typeof window !== "undefined" ? window.innerWidth : 1440, soNgay);
  const nhanW = coSo.nhanW;
  const dongH = coSo.dongH;
  const san = Math.min(coSo.ngayW, khungLuoi(480, soNgay).ngayW);
  const ngayW = khungW > 0 ? Math.max(san, Math.floor((khungW - nhanW) / soNgay)) : coSo.ngayW;
  // Ô dưới 60px không chứa nổi "T3 15/9" + "2 việc" — đầu cột xuống kiểu gọn (số ngày + chấm).
  const oHep = ngayW < 60;
  // Khoảng hở hai bên thanh để hai việc liền ngày không dính thành một khối.
  const le = oHep ? 2 : 4;
  const rongLuoi = ngayW * soNgay;
  const tongW = nhanW + rongLuoi;
  const ngays = useMemo(() => Array.from({ length: soNgay }, (_, i) => themNgay(tu, i)), [tu, soNgay]);

  // "Bây giờ" chỉ còn dùng để tô cột HÔM NAY và kéo đuôi phiên đang mở — nhích mỗi phút cho
  // qua nửa đêm là cột hôm nay tự dời.
  const [bayGio, setBayGio] = useState(bayGioIso);
  useEffect(() => {
    const h = setInterval(() => setBayGio(bayGioIso()), 60_000);
    return () => clearInterval(h);
  }, []);
  const iNay = ngays.indexOf(bayGio.slice(0, 10));

  const oCuaViec = useMemo(() => {
    const m = new Map<number, ONgay | null>();
    for (const w of viec) m.set(w.id, oNgay(w.du_kien_bat_dau, w.du_kien_ket_thuc, tu, soNgay));
    return m;
  }, [viec, tu, soNgay]);

  // Số việc chạm từng ngày — dòng nhỏ "N việc" dưới ngày. Đếm theo ĐÚNG ô thanh đang chiếm.
  const demNgay = useMemo(() => {
    const dem = Array.from({ length: soNgay }, () => 0);
    for (const o of oCuaViec.values()) {
      if (!o) continue;
      for (let k = o.dau; k <= o.cuoi; k++) dem[k] += 1;
    }
    return dem;
  }, [oCuaViec, soNgay]);

  // Đổi khoảng ngày ⇒ đưa cột HÔM NAY vào tầm nhìn: 7 ngày ở 602px chỉ thấy T2–T5, hôm nay là CN
  // thì mở màn ra không thấy việc của hôm nay.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || khungW <= 0 || iNay < 0) return;
    const trai = iNay * ngayW;
    const hienDen = el.scrollLeft + el.clientWidth - nhanW;
    if (trai >= el.scrollLeft && trai + ngayW <= hienDen) return;
    el.scrollLeft = Math.max(0, trai - ngayW);
    // Chỉ chạy khi đổi khoảng / lần đo đầu — không giật về hôm nay mỗi lần người dùng tự cuộn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tu, soNgay, khungW > 0]);

  // Chọn việc (từ Hàng chờ hay từ lưới) ⇒ cuộn tới thanh của nó nếu đang khuất.
  useEffect(() => {
    const el = scrollRef.current;
    if (selectedId == null || !el) return;
    const o = oCuaViec.get(selectedId);
    if (!o) return;
    const trai = o.dau * ngayW;
    const hienTu = el.scrollLeft;
    const hienDen = el.scrollLeft + el.clientWidth - nhanW;
    if (trai >= hienTu && trai < hienDen) return;
    el.scrollTo({ left: Math.max(0, trai - 8), behavior: "smooth" });
  }, [selectedId, oCuaViec, ngayW, nhanW]);

  return (
    <div className="thsx-ln" ref={scrollRef}>
      {/* Đầu cột ngày — dính đỉnh */}
      <div className="thsx-ln__head" style={{ width: tongW }}>
        <div className="thsx-ln__head-nhan" style={{ width: nhanW }}>
          <span className="thsx-num">{viec.length}</span> việc trong khoảng
        </div>
        {ngays.map((d, i) => {
          const n = nhanNgay(d);
          const dem = demNgay[i] ?? 0;
          const cls = `thsx-ln__ngay${oHep ? " thsx-ln__ngay--hep" : ""}${i === iNay ? " thsx-ln__ngay--nay" : ""}${n.thu === "CN" ? " thsx-ln__ngay--cn" : ""}`;
          return (
            <div key={d} className={cls} style={{ width: ngayW }}
              title={`${i === iNay ? "Hôm nay " : ""}${n.thu} ${n.so}${dem ? `\n${dem} việc` : ""}`}>
              {oHep ? (
                <>
                  <span className="thsx-ln__so thsx-num">{d.slice(8, 10)}</span>
                  <span className="thsx-ln__thu">{n.thu}</span>
                  {dem > 0 && <span className="thsx-ln__cham" />}
                </>
              ) : (
                <>
                  <span className="thsx-ln__ngay-dong1">
                    <span className="thsx-ln__thu">{n.thu}</span>
                    <span className="thsx-ln__so thsx-num">{n.so}</span>
                  </span>
                  <span className="thsx-ln__dem thsx-num">{dem > 0 ? `${dem} việc` : " "}</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="thsx-ln__body" style={{ width: tongW }}>
        {/* Lớp NỀN kéo hết chiều cao khung: dải nhãn + vạch cột ngày + tô cột hôm nay/CN. Có ít việc
            thì phần dưới vẫn là lưới, không phải mảng trắng. */}
        <div className="thsx-ln__nen" aria-hidden="true">
          <div className="thsx-ln__nen-nhan" style={{ width: nhanW }} />
          {ngays.map((d, i) => (
            <span
              key={d}
              className={`thsx-ln__nen-cot${i === iNay ? " thsx-ln__nen-cot--nay" : ""}${nhanNgay(d).thu === "CN" ? " thsx-ln__nen-cot--cn" : ""}`}
              style={{ left: nhanW + i * ngayW, width: ngayW }}
            />
          ))}
        </div>

        {viec.length === 0 && (
          // Dính mép trái + rộng đúng khung nhìn: lưới 30 ngày rộng hơn khung nhiều lần, căn giữa theo
          // cả lưới là hộp rơi ra ngoài màn (đo ở 602px: hộp nằm ở left 584px).
          <div className="thsx-ln__trong" style={{ width: khungW || undefined }}>
            <div className="thsx-ln__trong-hop">
              <Icon name="calendar" size={24} />
              {dangTim ? (
                <>
                  <h3>Không có việc nào khớp từ khoá</h3>
                  <p>Trong khoảng ngày này không việc nào khớp. Xoá từ khoá ở ô tìm, hoặc dời khoảng ngày bằng ◀ ▶.</p>
                </>
              ) : (
                <>
                  <h3>Không có việc nào trong khoảng ngày này</h3>
                  <p>Dời khoảng ngày bằng ◀ ▶, hoặc xem việc chưa định giờ ở Hàng chờ.</p>
                </>
              )}
            </div>
          </div>
        )}

        {viec.map((w) => {
          const sel = w.id === selectedId;
          const meta = ttMeta(w.trang_thai);
          const ma = w.nguon_ma || sxSerial(w.nguon_ma);
          const cd = w.ten_cong_doan || "";
          const o = oCuaViec.get(w.id) ?? null;
          const sl = w.so_luong_ra != null || w.so_luong_vao != null ? slThucTe(w) : [];
          const acts = dayThucTe(w.thuc_te, tu, soNgay, bayGio);
          const thucTeTitle = (w.thuc_te ?? [])
            .map((p) => `${ngayGio(p.bat_dau)} → ${p.ket_thuc ? ngayGio(p.ket_thuc) : "đang chạy"}`)
            .join("\n");
          const keHoachTitle = `Kế hoạch: ${ngayGio(w.du_kien_bat_dau)} → ${ngayGio(w.du_kien_ket_thuc)}`;
          const chon = (e: SuKienChuot) => { e.stopPropagation(); onChon(w); };

          // Làn trên — KẾ HOẠCH.
          let thanh = null;
          if (o) {
            const trai = o.dau * ngayW + (o.tranTrai ? 0 : le);
            const rong = (o.cuoi + 1) * ngayW - (o.tranPhai ? 0 : le) - trai;
            const chu = chuKeHoach(w, coThanh(rong));
            thanh = (
              <button
                type="button"
                className={`thsx-ln__kh${sel ? " is-chon" : ""}${o.tranTrai ? " is-tran-trai" : ""}${o.tranPhai ? " is-tran-phai" : ""}`}
                style={{ left: trai, width: rong }}
                title={keHoachTitle}
                aria-label={`${ma}${cd ? ` ${cd}` : ""}, ${meta.label}, ${chuKeHoach(w, "du")}`}
                aria-pressed={sel}
                onClick={chon}
              >
                {o.tranTrai && <Icon name="chevron" size={11} className="thsx-ln__mui thsx-rot90" />}
                {rong >= 40 && <span className="thsx-ln__chu thsx-num">{chu}</span>}
                {o.tranPhai && <Icon name="chevron" size={11} className="thsx-ln__mui thsx-rot270" />}
              </button>
            );
          }

          // Làn dưới — THỰC TẾ, đúng các ngày có phiên chạy. Chữ trạng thái đặt ở dải cuối (mới nhất).
          const thuc = acts.map((p, i) => {
            const trai = p.dau * ngayW + le;
            const rong = (p.cuoi + 1) * ngayW - le - trai;
            const cuoi = i === acts.length - 1;
            const chu = cuoi ? chuThucTe(w, coThanh(rong), p.cuoi > p.dau) : "";
            return (
              <button
                key={`a${p.dau}`}
                type="button"
                tabIndex={-1}
                className={`thsx-ln__tt-thanh thsx-ln__tt-thanh--${w.trang_thai}${p.mo ? " is-mo" : ""}${sel ? " is-chon" : ""}`}
                style={{ left: trai, width: rong }}
                title={`Thực tế:\n${thucTeTitle}`}
                aria-hidden="true"
                onClick={chon}
              >
                {cuoi && rong >= 40 && (
                  <>
                    <Icon name={meta.icon} size={12} />
                    <span className="thsx-ln__chu thsx-num">{chu}</span>
                  </>
                )}
              </button>
            );
          });

          return (
            <div
              key={w.id}
              className={`thsx-ln__hang${sel ? " thsx-ln__hang--chon" : ""}`}
              style={{ height: dongH }}
              onClick={() => onChon(w)}
            >
              {/* Ô nhãn: mỗi mẩu một ô riêng, tách bằng khoảng trống — không nối bằng dấu. */}
              <div className="thsx-ln__nhan" style={{ width: nhanW }}>
                <div className="thsx-ln__ma">
                  <span className="thsx-ln__ma-text thsx-num">{ma}</span>
                  <span className={`thsx-ln__tt thsx-ln__tt--${w.trang_thai}`} role="img" aria-label={meta.label} title={meta.label}>
                    <Icon name={meta.icon} size={12} />
                  </span>
                  <ChipKcs so_lan={w.kcs_so_lan} loi={w.kcs_loi} />
                  <ChamCho c={cho?.get(w.id)} />
                </div>
                <div className="thsx-ln__dong">
                  <span className="thsx-ln__cd" title={cd}>{cd || "—"}</span>
                  {w.may && <span className="thsx-ln__mo" title={w.may}>{w.may}</span>}
                </div>
                {(w.nguon_ten || w.khach_hang) && (
                  <div className="thsx-ln__dong thsx-ln__phu">
                    {w.nguon_ten && <span title={w.nguon_ten}>{w.nguon_ten}</span>}
                    {w.khach_hang && <span className="thsx-ln__mo" title={w.khach_hang}>{w.khach_hang}</span>}
                  </div>
                )}
                <div className="thsx-ln__dong thsx-ln__sl">
                  {sl.map((m) => <span key={m} className="thsx-num">{m}</span>)}
                  <ChipLoaiBuoc loai_buoc={w.loai_buoc === "may" ? null : w.loai_buoc} nha_cung_cap={w.nha_cung_cap} />
                  <ChipKhuon can_khuon={!!w.khuon} khuon={{ ...(w.khuon ?? {}), da_nhan: w.khuon_da_nhan }} />
                </div>
              </div>

              <div className="thsx-ln__luoi" style={{ width: rongLuoi }}>
                {thanh}
                {thuc}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
