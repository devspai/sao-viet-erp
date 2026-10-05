// Góc "Theo máy" của màn Theo dõi sản xuất (làm gọn 05/10/2026, đặc tả 3.3): MỘT bảng, mỗi máy một
// dòng, chia nhóm đúng như máy chủ trả (Chưa có máy → từng nhóm máy theo danh mục → máy không còn
// trong danh mục → Gia công ngoài). Máy rảnh gập vào một dòng cuối bảng.
//
// ĐỌC, KHÔNG TÍNH LẠI: tình trạng, nhãn, nhóm, thứ tự đều do máy chủ dựng. Chỗ duy nhất FE quyết là
// màu pill và cách viết giờ ("14:30 hôm nay").
import { useState, type MouseEvent, type ReactNode } from "react";

import type { TdsxLsxThamChieu, TdsxMayDong, TdsxSanLuong, TdsxTheoMayOut, TdsxViec } from "../api/client";
import { Icon } from "../components/Icons";
import { Skeleton } from "./keHoachSxShared";
import { nhanChang } from "./lsxBuoc";
import { so } from "./lsxHoSoChung";
import { TheGap } from "./lsxKhau";
import { ChonLenhPopover, useChonLenh } from "./tdsxChonLenh";

const SO_COT = 6;

/** Màu theo `tinh_trang`. Đỏ: máy hỏng, việc tạm dừng. Vàng: máy cần điều độ để ý hoặc việc chờ
 *  xếp. Xám thép: đang chạy, đang ở nhà gia công. Khoá lạ ⇒ xám nhạt. */
const MAU_TINH_TRANG: Record<string, string> = {
  may_dung: "lsc-pill--signal",
  tam_dung: "lsc-pill--signal",
  bao_tri: "lsc-pill--amber",
  khoa: "lsc-pill--amber",
  co_phieu_sua: "lsc-pill--amber",
  cho_xep_may: "lsc-pill--amber",
  dang_chay: "lsc-pill--steel",
  o_nha_gia_cong: "lsc-pill--steel",
  trong: "lsc-pill--off",
  cho_mang_di: "lsc-pill--off",
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

export function TdsxTheoMay({
  data,
  dangTai,
  rong,
  onMo,
}: {
  /** `null` = chưa có lượt nào về ⇒ khung xám. */
  data: TdsxTheoMayOut | null;
  /** Đang tải lại (realtime/đổi lọc) ⇒ giữ nội dung cũ, làm mờ. */
  dangTai: boolean;
  /** Ô báo khi bảng không có dòng nào — trang quyết câu chữ (lỗi, lọc rỗng, chưa có gì). */
  rong: ReactNode;
  onMo: (lsxId: number) => void;
}) {
  const [moTrong, setMoTrong] = useState(false);
  const [chon, moChon, dongChon] = useChonLenh();

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

  return (
    <>
      <div className="lsc-khung" tabIndex={0} role="group" aria-label="Bảng theo máy, cuộn ngang được bằng phím mũi tên">
        <table className="lsc-bang tdsx-may">
          <caption className="sr-only">Máy, việc đang chạy và việc kế tiếp</caption>
          <thead>
            <tr>
              <th scope="col">Máy</th>
              <th scope="col">Tình trạng</th>
              <th scope="col">Đang chạy</th>
              <th scope="col">Sản lượng tốt</th>
              <th scope="col">Kế hoạch xong</th>
              <th scope="col">Kế tiếp</th>
            </tr>
          </thead>
          {data === null ? (
            <Skeleton rows={8} cols={SO_COT} />
          ) : !coDong ? (
            <tbody>
              <tr className="lsc-bang__rong">
                <td colSpan={SO_COT}>{rong}</td>
              </tr>
            </tbody>
          ) : (
            <>
              {data.nhom.map((g) => (
                <tbody key={`${g.loai}:${g.ten}`} className={dangTai ? "is-mo" : undefined}>
                  <tr className="lsc-bang__nhom">
                    <td colSpan={SO_COT}>
                      {g.ten || "Chưa phân nhóm"}
                      <span className="tdsx-nhom__dem">{demNhom(g.loai, g.dong.length)}</span>
                    </td>
                  </tr>
                  {g.dong.map((d) => (
                    <DongMay key={d.khoa} d={d} chuaMay={g.loai === "chua_may"} onBam={bam} />
                  ))}
                </tbody>
              ))}
              {data.nhom.length === 0 && (
                <tbody>
                  <tr className="lsc-bang__rong">
                    <td colSpan={SO_COT}>{rong}</td>
                  </tr>
                </tbody>
              )}
              {data.may_trong.length > 0 && (
                <tbody className={dangTai ? "is-mo" : undefined}>
                  <tr className="tdsx-trong">
                    <td colSpan={SO_COT}>
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
                  {moTrong && data.may_trong.map((d) => <DongMay key={d.khoa} d={d} chuaMay={false} onBam={bam} />)}
                </tbody>
              )}
            </>
          )}
        </table>
      </div>
      {chon && <ChonLenhPopover state={chon} onDong={dongChon} onChon={onMo} nhan="Bài ghép" />}
    </>
  );
}

type Bam = (ds: TdsxLsxThamChieu[], e: MouseEvent<HTMLButtonElement>) => void;

function DongMay({ d, chuaMay, onBam }: { d: TdsxMayDong; chuaMay: boolean; onBam: Bam }) {
  const tamDung = d.dang_chay?.trang_thai === "paused";
  return (
    <tr>
      <td>
        {chuaMay ? (
          "–"
        ) : (
          <span className="lsc-cum">
            <b>{d.ten ?? "–"}</b>
            {d.ngung_dung && <span className="lsc-tag">Ngừng dùng</span>}
          </span>
        )}
      </td>
      <td>
        <span className={`lsc-pill ${MAU_TINH_TRANG[d.tinh_trang] ?? "lsc-pill--off"}`}>{d.nhan_tinh_trang}</span>
      </td>
      <td>
        {d.dang_chay ? <Viec v={d.dang_chay} them={d.dang_chay_them} onBam={onBam} /> : "–"}
      </td>
      <td>
        <SanLuong s={d.san_luong} tamDung={tamDung} />
      </td>
      <td className="tdsx-gio">
        {chuaMay
          ? d.ke_hoach_bat_dau
            ? `bắt đầu ${gioXuong(d.ke_hoach_bat_dau)}`
            : "–"
          : gioXuong(d.ke_hoach_xong)}
      </td>
      <td>
        {d.ke_tiep.length === 0 ? (
          "–"
        ) : (
          <span className="lsc-cum">
            {d.ke_tiep.map((v) => (
              <TheKeTiep key={v.cong_viec_id} v={v} onBam={onBam} />
            ))}
            {d.ke_tiep_them > 0 && <span className="lsc-phu">+{d.ke_tiep_them}</span>}
          </span>
        )}
      </td>
    </tr>
  );
}

/** Ô "Đang chạy": việc thường = mã lệnh + GẤP + tên bước + sản phẩm; việc ghép = "Bài <mã>" + số lệnh. */
function Viec({ v, them, onBam }: { v: TdsxViec; them: number; onBam: Bam }) {
  const mot = v.lsx.length === 1 ? v.lsx[0] : null;
  const rush = v.lsx.some((l) => l.is_rush);
  return (
    <>
      <span className="lsc-cum">
        {v.bai_ma && v.lsx.length > 1 ? (
          <>
            <button
              type="button"
              className="lsc-ma"
              onClick={(e) => onBam(v.lsx, e)}
              aria-label={`Bài ghép ${v.bai_ma}, ${v.lsx.length} lệnh, chọn lệnh để mở hồ sơ`}
            >
              Bài {v.bai_ma}
            </button>
            <span className="lsc-tag">{v.lsx.length} lệnh</span>
          </>
        ) : mot ? (
          <button
            type="button"
            className="lsc-ma"
            data-lsx={mot.lsx_id}
            onClick={(e) => onBam(v.lsx, e)}
            aria-label={`Mở hồ sơ lệnh ${mot.ma}${mot.ten ? ` — ${mot.ten}` : ""}`}
          >
            {mot.ma}
          </button>
        ) : v.lsx.length > 1 ? (
          <button type="button" className="lsc-ma" onClick={(e) => onBam(v.lsx, e)}>
            {v.lsx.length} lệnh
          </button>
        ) : null}
        {rush && <TheGap />}
        {them > 0 && (
          <span className="lsc-tag" title="Máy đang ghi nhận nhiều việc chạy cùng lúc">
            +{them}
          </span>
        )}
      </span>
      {v.ten_buoc && <span className="tdsx-buoc">{v.ten_buoc}</span>}
      {mot?.ten && <span className="lsc-phu">{mot.ten}</span>}
    </>
  );
}

/** "x trên y <đơn vị>" + thanh mảnh. Mẻ lẫn đơn vị ⇒ từng dòng theo đơn vị, không thanh, không cộng. */
function SanLuong({ s, tamDung }: { s: TdsxSanLuong | null; tamDung: boolean }) {
  if (!s) return <>–</>;
  const caBai = s.ca_bai ? <span className="lsc-phu">(cả bài)</span> : null;
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
      <span className={tamDung ? "lsc-do" : undefined}>
        {s.ke_hoach != null ? `${so(s.tot)} trên ${so(s.ke_hoach)}` : so(s.tot)}
        {dv && ` ${dv}`}
      </span>
      {pct != null && (
        <span
          className={`lsc-thanh${tamDung ? " lsc-thanh--do" : ""}`}
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
