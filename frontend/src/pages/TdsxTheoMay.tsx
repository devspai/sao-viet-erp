// Góc "Theo máy" của màn Theo dõi sản xuất (làm gọn 05/10/2026, đặc tả 3.3; lên lưới chung 08/10/2026):
// MỘT bảng, mỗi máy một dòng, chia nhóm đúng như máy chủ trả (Chưa có máy → từng nhóm máy theo danh
// mục → máy không còn trong danh mục → Gia công ngoài). Máy rảnh gập vào một dòng cuối bảng. Tiêu đề
// nhóm là hàng `lds-so`. Khung (đầu trang, thẻ lọc, nút Cột) do trang vẽ; ở đây chỉ có tấm lưới.
//
// ĐỌC, KHÔNG TÍNH LẠI: tình trạng, nhãn, nhóm, thứ tự đều do máy chủ dựng. Chỗ duy nhất FE quyết là
// màu chip và cách viết giờ ("14:30 hôm nay").
import { useState, type MouseEvent, type ReactNode } from "react";

import type { TdsxLsxThamChieu, TdsxMayDong, TdsxSanLuong, TdsxTheoMayOut, TdsxViec } from "../api/client";
import { EmptyRow } from "../components/EmptyState";
import { Icon } from "../components/Icons";
import { ChipTT, CuonLuoi, rongLuoi, soCotGhim, xepCot, type MauTT } from "../components/LuoiDs";
import type { CotTdsx } from "./TdsxTheoLenh";
import { nhanChang } from "./lsxBuoc";
import { so } from "./lsxHoSoChung";
import { TheGap } from "./lsxKhau";
import { ChonLenhPopover, useChonLenh } from "./tdsxChonLenh";

/** Thứ tự: Máy (mã), Tình trạng, Đang chạy, Sản lượng tốt, Kế hoạch xong, Kế tiếp (cột cuối). */
export const COT_MAY: CotTdsx[] = [
  { key: "may", label: "Máy", coDinh: true, w: 160 },
  { key: "tinh_trang", label: "Tình trạng", w: 160 },
  { key: "dang_chay", label: "Đang chạy", w: 330 },
  { key: "san_luong", label: "Sản lượng tốt", w: 270 },
  { key: "ke_hoach", label: "Kế hoạch xong", w: 170 },
  { key: "ke_tiep", label: "Kế tiếp" },
];

/** Màu theo `tinh_trang` — mỗi tình trạng một sắc. Đỏ: máy hỏng. Cam: việc tạm dừng. Tím: bảo trì.
 *  Xám: khoá. Vàng: có phiếu sửa. Cyan: chờ xếp máy. Chàm: chờ mang đi gia công. Xanh: đang chạy.
 *  Ngọc: đang ở nhà gia công. Khoá lạ / trống ⇒ slate. */
const MAU_TINH_TRANG: Record<string, MauTT> = {
  may_dung: "do",
  tam_dung: "cam",
  bao_tri: "tim",
  khoa: "xam",
  co_phieu_sua: "vang",
  cho_xep_may: "cyan",
  dang_chay: "xanh",
  o_nha_gia_cong: "ngoc",
  trong: "slate",
  cho_mang_di: "cham",
};

/** Đếm dòng của một nhóm theo đúng thứ nhóm chứa. */
function demNhom(loai: string, n: number): string {
  if (loai === "chua_may") return `${n} bước`;
  if (loai === "gia_cong") return `${n} nhà gia công`;
  return `${n} máy`;
}

/** Giờ xưởng (máy chủ gửi không nhãn múi ⇒ trình duyệt đọc theo giờ máy, cũng là giờ xưởng).
 *  Trong ngày: "14:30 hôm nay"; khác ngày: "14:30 06/10". Hỏng/rỗng ⇒ "–". */
export function gioXuong(v: string | null | undefined, bayGio: Date = new Date()): string {
  if (!v) return "–";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "–";
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const cungNgay =
    d.getFullYear() === bayGio.getFullYear() &&
    d.getMonth() === bayGio.getMonth() &&
    d.getDate() === bayGio.getDate();
  if (cungNgay) return `${hm} hôm nay`;
  return `${hm} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const TRONG = new Set<string>();

export function TdsxTheoMay({
  data,
  dangTai,
  rong,
  onMo,
  cotAn = TRONG,
  thuTu = [],
}: {
  /** `null` = chưa có lượt nào về ⇒ hàng xương. */
  data: TdsxTheoMayOut | null;
  /** Đang tải lại (realtime/đổi lọc) ⇒ giữ nội dung cũ, làm mờ. */
  dangTai: boolean;
  /** Ô báo khi bảng không có dòng nào — trang quyết câu chữ (lỗi, lọc rỗng, chưa có gì). */
  rong: ReactNode;
  onMo: (lsxId: number) => void;
  cotAn?: Set<string>;
  thuTu?: string[];
}) {
  const [moTrong, setMoTrong] = useState(false);
  const [chon, moChon, dongChon] = useChonLenh();
  const cotHien = xepCot(COT_MAY, thuTu).filter((c) => !cotAn.has(c.key));
  const soCot = cotHien.length;

  /** Một việc phục vụ một lệnh ⇒ mở thẳng; từ hai lệnh ⇒ bật bảng chọn, không đoán. */
  function bam(ds: TdsxLsxThamChieu[], e: MouseEvent<HTMLButtonElement>) {
    if (ds.length === 1) {
      onMo(ds[0].lsx_id);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    moChon(ds, r.left, r.bottom + 4);
  }

  const coDong = !!data && (data.nhom.length > 0 || data.may_trong.length > 0);
  const mo = dangTai ? "is-mo" : undefined;

  return (
    <>
      <div className="lds-sheet">
        <CuonLuoi ghim={soCotGhim(cotHien)}>
          <table className="lds-g tdsx-may" style={{ minWidth: rongLuoi(cotHien) }}>
            <caption className="sr-only">Máy, việc đang chạy và việc kế tiếp</caption>
            <colgroup>
              {cotHien.map((c) => (
                <col key={c.key} style={c.w ? { width: c.w } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {cotHien.map((c) => (
                  <th key={c.key} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            {data === null ? (
              <tbody>
                <EmptyRow colSpan={soCot} trangThai="dang-tai" />
              </tbody>
            ) : !coDong ? (
              <tbody>
                <tr>
                  <td colSpan={soCot} className="lds-trong">
                    {rong}
                  </td>
                </tr>
              </tbody>
            ) : (
              <>
                {data.nhom.map((g) => (
                  <tbody key={`${g.loai}:${g.ten}`} className={mo}>
                    <tr className="lds-so">
                      <td colSpan={soCot}>
                        {g.ten || "Chưa phân nhóm"}
                        <span className="tdsx-nhom__dem">{demNhom(g.loai, g.dong.length)}</span>
                      </td>
                    </tr>
                    {g.dong.map((d) => (
                      <DongMay key={d.khoa} d={d} cot={cotHien} chuaMay={g.loai === "chua_may"} onBam={bam} />
                    ))}
                  </tbody>
                ))}
                {data.nhom.length === 0 && (
                  <tbody>
                    <tr>
                      <td colSpan={soCot} className="lds-trong">
                        {rong}
                      </td>
                    </tr>
                  </tbody>
                )}
                {data.may_trong.length > 0 && (
                  <tbody className={mo}>
                    <tr className="lds-so tdsx-trong">
                      <td colSpan={soCot}>
                        <button
                          type="button"
                          className="tdsx-trong__nut"
                          aria-expanded={moTrong}
                          onClick={() => setMoTrong((v) => !v)}
                        >
                          <Icon name="chevron" size={14} className={moTrong ? undefined : "tdsx-trong__gap"} />
                          {data.may_trong.length} máy đang trống
                        </button>
                      </td>
                    </tr>
                    {moTrong &&
                      data.may_trong.map((d) => (
                        <DongMay key={d.khoa} d={d} cot={cotHien} chuaMay={false} onBam={bam} />
                      ))}
                  </tbody>
                )}
              </>
            )}
          </table>
        </CuonLuoi>
      </div>
      {chon && <ChonLenhPopover state={chon} onDong={dongChon} onChon={onMo} nhan="Bài ghép" />}
    </>
  );
}

type Bam = (ds: TdsxLsxThamChieu[], e: MouseEvent<HTMLButtonElement>) => void;

/** Dòng máy: không bấm cả dòng (một dòng có thể mang nhiều lệnh) — chỉ các nút mã lệnh trong ô mở hồ sơ.
 *  Mang `lds-dong` để cột Máy ghim được và rê chuột tô `--rule-hair` như mọi lưới. */
function DongMay({
  d,
  cot,
  chuaMay,
  onBam,
}: {
  d: TdsxMayDong;
  cot: CotTdsx[];
  chuaMay: boolean;
  onBam: Bam;
}) {
  const tamDung = d.dang_chay?.trang_thai === "paused";
  return (
    <tr className="lds-dong">
      {cot.map((c) => {
        switch (c.key) {
          case "may":
            return (
              <td key={c.key} title={chuaMay ? undefined : (d.ten ?? undefined)}>
                {chuaMay ? "–" : (d.ten ?? "–")}
                {!chuaMay && d.ngung_dung && <span className="lds-tag">Ngừng dùng</span>}
              </td>
            );
          case "tinh_trang":
            return (
              <td key={c.key}>
                <ChipTT mau={MAU_TINH_TRANG[d.tinh_trang] ?? "slate"}>{d.nhan_tinh_trang}</ChipTT>
              </td>
            );
          case "dang_chay":
            return (
              <td key={c.key} title={d.dang_chay ? chuViec(d.dang_chay) : undefined}>
                {d.dang_chay ? <Viec v={d.dang_chay} them={d.dang_chay_them} onBam={onBam} /> : "–"}
              </td>
            );
          case "san_luong":
            return (
              <td key={c.key} title={chuSanLuong(d.san_luong)}>
                <SanLuong s={d.san_luong} tamDung={tamDung} />
              </td>
            );
          case "ke_hoach":
            return (
              <td key={c.key}>
                {chuaMay
                  ? d.ke_hoach_bat_dau
                    ? `bắt đầu ${gioXuong(d.ke_hoach_bat_dau)}`
                    : "–"
                  : gioXuong(d.ke_hoach_xong)}
              </td>
            );
          default:
            return (
              <td key={c.key}>
                {d.ke_tiep.length === 0 ? (
                  "–"
                ) : (
                  <>
                    {d.ke_tiep.map((v) => (
                      <TheKeTiep key={v.cong_viec_id} v={v} onBam={onBam} />
                    ))}
                    {d.ke_tiep_them > 0 && <span className="lds-mu tdsx-sau">+{d.ke_tiep_them}</span>}
                  </>
                )}
              </td>
            );
        }
      })}
    </tr>
  );
}

/** Chữ đủ của ô "Đang chạy" cho `title` (ô cắt "…"): mã lệnh/bài, tên bước, sản phẩm. Nối bằng " - ". */
function chuViec(v: TdsxViec): string {
  const mot = v.lsx.length === 1 ? v.lsx[0] : null;
  const ma = v.bai_ma && v.lsx.length > 1 ? `Bài ${v.bai_ma}` : (mot?.ma ?? (v.lsx.length > 1 ? `${v.lsx.length} lệnh` : null));
  return [ma, v.ten_buoc, mot?.ten].filter(Boolean).join(" - ");
}

/** Chữ đủ của ô "Sản lượng tốt" cho `title`: số + đơn vị, mỗi đơn vị cách nhau bằng khoảng trắng rộng. */
function chuSanLuong(s: TdsxSanLuong | null): string | undefined {
  if (!s) return undefined;
  if (s.tot == null) {
    const t = s.theo_don_vi.map((x) => `${so(x.tot)} ${nhanChang(x.don_vi)}`.trim()).join("   ");
    return s.ca_bai ? `${t} (cả bài)` : t;
  }
  const dv = nhanChang(s.don_vi);
  const t = s.ke_hoach != null ? `${so(s.tot)} trên ${so(s.ke_hoach)}` : so(s.tot);
  return `${t}${dv ? ` ${dv}` : ""}${s.ca_bai ? " (cả bài)" : ""}`;
}

/** Ô "Đang chạy" trên MỘT dòng: việc thường = mã lệnh + GẤP + tên bước + sản phẩm; việc ghép = "Bài <mã>"
 *  + số lệnh. Tên bước và sản phẩm mờ, chữ dài cắt "…" (title của ô có đủ). */
function Viec({ v, them, onBam }: { v: TdsxViec; them: number; onBam: Bam }) {
  const mot = v.lsx.length === 1 ? v.lsx[0] : null;
  const rush = v.lsx.some((l) => l.is_rush);
  return (
    <>
      {v.bai_ma && v.lsx.length > 1 ? (
        <>
          <button
            type="button"
            className="tdsx-ma"
            onClick={(e) => onBam(v.lsx, e)}
            aria-label={`Bài ghép ${v.bai_ma}, ${v.lsx.length} lệnh, chọn lệnh để mở hồ sơ`}
          >
            Bài {v.bai_ma}
          </button>
          <span className="lds-tag">{v.lsx.length} lệnh</span>
        </>
      ) : mot ? (
        <button
          type="button"
          className="tdsx-ma"
          data-lsx={mot.lsx_id}
          onClick={(e) => onBam(v.lsx, e)}
          aria-label={`Mở hồ sơ lệnh ${mot.ma}${mot.ten ? ` — ${mot.ten}` : ""}`}
        >
          {mot.ma}
        </button>
      ) : v.lsx.length > 1 ? (
        <button type="button" className="tdsx-ma" onClick={(e) => onBam(v.lsx, e)}>
          {v.lsx.length} lệnh
        </button>
      ) : null}
      {rush && <TheGap />}
      {them > 0 && (
        <span className="lds-tag" title="Máy đang ghi nhận nhiều việc chạy cùng lúc">
          +{them}
        </span>
      )}
      {v.ten_buoc && <span className="lds-mu tdsx-sau">{v.ten_buoc}</span>}
      {mot?.ten && <span className="lds-mu tdsx-sau">{mot.ten}</span>}
    </>
  );
}

/** "x trên y <đơn vị>" + thanh mảnh cùng dòng. Mẻ lẫn đơn vị ⇒ từng đơn vị một mẩu, không thanh, không cộng. */
function SanLuong({ s, tamDung }: { s: TdsxSanLuong | null; tamDung: boolean }) {
  if (!s) return <>–</>;
  const caBai = s.ca_bai ? <span className="lds-mu tdsx-sau">(cả bài)</span> : null;
  if (s.tot == null) {
    return (
      <>
        {s.theo_don_vi.map((x) => (
          <span key={x.don_vi ?? ""} className="tdsx-sl__dv">
            {so(x.tot)} {nhanChang(x.don_vi)}
          </span>
        ))}
        {caBai}
      </>
    );
  }
  const dv = nhanChang(s.don_vi);
  const pct = s.ke_hoach && s.ke_hoach > 0 ? Math.min(100, Math.round((s.tot / s.ke_hoach) * 100)) : null;
  return (
    <>
      <span className={tamDung ? "lds-do" : undefined}>
        {s.ke_hoach != null ? `${so(s.tot)} trên ${so(s.ke_hoach)}` : so(s.tot)}
        {dv && ` ${dv}`}
      </span>
      {pct != null && (
        <span
          className={`tdsx-thanh${tamDung ? " tdsx-thanh--do" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`Đạt ${pct}% sản lượng kế hoạch`}
        >
          <i style={{ width: `${pct}%` }} />
        </span>
      )}
      {caBai}
    </>
  );
}

/** Thẻ việc kế tiếp: 4 số cuối mã lệnh (việc ghép nhiều lệnh: 4 số cuối mã bài). Rê chuột ra tên
 *  bước + sản phẩm. */
function TheKeTiep({ v, onBam }: { v: TdsxViec; onBam: Bam }) {
  const mot = v.lsx.length === 1 ? v.lsx[0] : null;
  if (!mot && v.lsx.length === 0) return null;
  const nhan = mot ? mot.ma.slice(-4) : `Bài ${(v.bai_ma ?? "").slice(-4)}`;
  const tieuDe = [v.ten_buoc, mot?.ten].filter(Boolean).join(", ");
  return (
    <button
      type="button"
      className={`tdsx-ke${v.lsx.some((l) => l.is_rush) ? " tdsx-ke--gap" : ""}`}
      data-lsx={mot?.lsx_id}
      title={tieuDe || undefined}
      aria-label={
        mot
          ? `Mở hồ sơ lệnh ${mot.ma}${tieuDe ? `, ${tieuDe}` : ""}`
          : `Bài ghép ${v.bai_ma ?? ""}, ${v.lsx.length} lệnh, chọn lệnh để mở hồ sơ`
      }
      onClick={(e) => onBam(v.lsx, e)}
    >
      {nhan}
    </button>
  );
}
