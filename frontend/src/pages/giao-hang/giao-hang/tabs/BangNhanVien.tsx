// Tab "Nhân viên giao hàng" — bảng tài xế theo tháng (tách từ pages/GiaoHangPage.tsx).
//
// Phương án A (07/10/2026): mỗi người MỘT dòng (tên không xuống hàng), người đang có việc lên đầu,
// số 0 in mờ để mắt dừng ở số có nghĩa, hàng lọc nhanh trên đầu bảng vừa đếm vừa lọc.
//
// Lưới kiểu bảng tính chung (lds): đây là bảng TỔNG THEO THÁNG, không phân trang — máy chủ trả đủ
// mọi người một lần nên lọc trạng thái làm ngay trên danh sách đó.
import { useState } from "react";
import type { DeliveryDriver } from "../../../../api/client";
import { EmptyRow } from "../../../../components/EmptyState";
import {
  ChonCot, CuonLuoi, LocNhanhTrangThai, rongLuoi, soCotGhim, useCotAn, useThuTuCot, xepCot,
  type CotLuoi, type MauTT,
} from "../../../../components/LuoiDs";
import { NHAN_TRANG_THAI_NV } from "../shared/constants";
import { ChipGh } from "../components/giaoHangCells";
import { TONE_NV } from "../shared/helpers";

/** Thứ tự trạng thái: người đang chạy lên đầu, người nghỉ xuống cuối. */
const THU_TU = ["dang_giao", "dang_tra_hang", "co_lich", "ranh", "nghi"];

interface CotNv extends CotLuoi { w?: number; n?: boolean }
// Bốn cột SỐ đều căn phải — trộn trái/phải thì mắt phải nhảy qua nhảy lại để so hàng. Cột cuối
// (Km tháng) không đặt bề rộng để co giãn lấp phần còn lại của khung.
const COT_NV: CotNv[] = [
  { key: "ten", label: "Nhân viên", coDinh: true, w: 200 },
  { key: "trang_thai", label: "Trạng thái", w: 140 },
  { key: "dang", label: "Đang thực hiện", w: 170 },
  { key: "ke_tiep", label: "Chuyến kế tiếp", w: 170 },
  { key: "xong_ngay", label: "Đã giao hôm nay", w: 130, n: true },
  { key: "km_ngay", label: "Km hôm nay", w: 110, n: true },
  { key: "xong_thang", label: "Đã giao tháng", w: 120, n: true },
  { key: "km_thang", label: "Km tháng", n: true },
];

/** Sắc chấm của hàng lọc nhanh — cùng bộ sắc với chip trong dòng. */
function mauNv(k: string): MauTT {
  const t = TONE_NV[k] ?? "slate";
  return t === "on" ? "la" : t === "off" ? "xam" : t === "warn" ? "cam" : t;
}

function So({ n }: { n: number | null | undefined }) {
  const v = n ?? 0;
  // Số khác 0 chỉ đổi sang màu mực, không in đậm (chủ không thích chữ đậm, 07/10/2026).
  return v === 0 ? <span className="gh-mo">0</span> : <span className="gh-muc">{v.toLocaleString("vi-VN")}</span>;
}

// =============================================================================
// Tab · Nhân viên giao hàng
// =============================================================================
export function BangNhanVien({ rows, loading, thang, onDoiThang }: {
  rows: DeliveryDriver[]; loading: boolean;
  thang: string; onDoiThang: (t: string) => void;
}) {
  const [loc, setLoc] = useState<string | null>(null);
  const [cotAn, setCotAn] = useCotAn("giao-hang-nv");
  const [thuTu, setThuTu] = useThuTuCot("giao-hang-nv");
  const cot = xepCot(COT_NV, thuTu).filter((c) => !cotAn.has(c.key));

  const dem = new Map<string, number>();
  for (const d of rows) dem.set(d.trang_thai, (dem.get(d.trang_thai) ?? 0) + 1);
  const coTrangThai = THU_TU.filter((k) => dem.has(k))
    .concat([...dem.keys()].filter((k) => !THU_TU.includes(k)));
  const hang = [...rows]
    .filter((d) => loc === null || d.trang_thai === loc)
    .sort((a, b) => {
      const x = THU_TU.indexOf(a.trang_thai), y = THU_TU.indexOf(b.trang_thai);
      return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
    });

  const o = (k: string, d: DeliveryDriver) => {
    switch (k) {
      case "ten":
        return <td key={k} title={d.ho_ten}>{d.ho_ten}</td>;
      case "trang_thai":
        return (
          <td key={k}>
            <ChipGh text={NHAN_TRANG_THAI_NV[d.trang_thai] ?? d.trang_thai} tone={TONE_NV[d.trang_thai] ?? "slate"} />
          </td>
        );
      case "dang":
        return d.chuyen_dang_thuc_hien
          ? <td key={k} title={d.chuyen_dang_thuc_hien}>{d.chuyen_dang_thuc_hien}</td>
          : <td key={k} className="lds-mu3">—</td>;
      case "ke_tiep":
        return d.chuyen_ke_tiep
          ? <td key={k} title={d.chuyen_ke_tiep}>{d.chuyen_ke_tiep}</td>
          : <td key={k} className="lds-mu3">—</td>;
      case "xong_ngay":
        return <td key={k} className="n"><So n={d.so_chuyen_xong} /></td>;
      case "km_ngay":
        return <td key={k} className="n"><So n={d.tong_km} /></td>;
      case "xong_thang":
        return <td key={k} className="n"><So n={d.so_chuyen_thang} /></td>;
      case "km_thang":
        return <td key={k} className="n"><So n={d.tong_km_thang} /></td>;
      default:
        return <td key={k} />;
    }
  };

  // Khung lọc đứng NGOÀI nhánh rỗng: hết người trong tháng này không có nghĩa là hết người —
  // ẩn ô chọn tháng lúc đó là nhốt người dùng ở đúng cái tháng trống, không quay lại được.
  return (
    <>
      <section className="lds-loc">
        {coTrangThai.length > 0 && (
          <LocNhanhTrangThai
            muc={[
              { key: "", label: "Tất cả", count: rows.length },
              ...coTrangThai.map((k) => ({
                key: k, label: NHAN_TRANG_THAI_NV[k] ?? k, mau: mauNv(k), count: dem.get(k),
              })),
            ]}
            dang={loc ?? ""}
            onChon={(k) => setLoc(k === "" || k === loc ? null : k)}
            ariaLabel="Lọc nhanh theo trạng thái nhân viên"
          />
        )}
        <div className="lds-loc__thanh tl-thanh">
          <label className="gh-nv-thang">
            <span>Tháng</span>
            <input className="input" type="month" value={thang}
              onChange={(e) => onDoiThang(e.target.value)} />
          </label>
          <span className="gh-nho">Hai cột cuối theo tháng đã chọn</span>
          <ChonCot cot={COT_NV} an={cotAn} onAn={setCotAn} thuTu={thuTu} onThuTu={setThuTu} />
        </div>
      </section>
      <div className="lds-sheet">
        <CuonLuoi ghim={soCotGhim(cot)}>
          <table className="lds-g" style={{ minWidth: rongLuoi(cot, 110) }}>
            <colgroup>
              {cot.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
            </colgroup>
            <thead>
              <tr>
                {cot.map((c) => <th key={c.key} className={c.n ? "n" : undefined}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && <EmptyRow colSpan={cot.length} trangThai="dang-tai" />}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={cot.length} className="lds-trong">
                    Chưa có nhân viên giao hàng nào. Bảng liệt kê người thuộc Bộ phận Giao hàng (bật ở màn Phòng ban), cộng người đã được phân chuyến.
                  </td>
                </tr>
              )}
              {hang.map((d) => (
                <tr key={d.employee_id} className="lds-dong gh-nv-dong">{cot.map((c) => o(c.key, d))}</tr>
              ))}
            </tbody>
          </table>
        </CuonLuoi>
      </div>
    </>
  );
}
