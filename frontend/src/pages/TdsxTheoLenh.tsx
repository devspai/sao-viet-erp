// Góc "Theo lệnh" của màn Theo dõi sản xuất (làm gọn 05/10/2026, đặc tả 3.4; lên lưới chung 08/10/2026):
// mỗi lệnh còn sống một dòng, máy chủ đã sắp (số cờ giảm dần → GẤP → hạn SX → mã) và cắt ở 200 dòng.
//
// KHÔNG phân trang giả ở trình duyệt: quá 200 thì nói ra và mời thu hẹp bằng ô tìm.
// Khung (đầu trang, thẻ lọc, ô tìm, nút Cột) do trang vẽ; ở đây chỉ có tấm lưới.
import type { ReactNode } from "react";

import type { TdsxTheoLenhDong, TdsxTheoLenhOut } from "../api/client";
import { EmptyRow } from "../components/EmptyState";
import {
  ChipTT, CuonLuoi, ngayVN, rongLuoi, soCotGhim, soVN, tenKhachGon, xepCot, apLuoi, type CauHinhLuoi,
  type CotLuoi, type MauTT,
} from "../components/LuoiDs";
import { ngayDayDu, ngayGioDayDu } from "./loc-san-xuat/ngay";
import { ngayNgan } from "./lsxHoSoChung";
import { CO_NHAN, DaiChang, TheGap, buocThu, nhanKhau } from "./lsxKhau";

export interface CotTdsx extends CotLuoi {
  w?: number;
  n?: boolean;
}

/** Thứ tự theo nhóm nghĩa: Mã, hai ngày (Ngày tạo, Hạn SX), Khách, Sản phẩm, Số lượng, Đang ở (khâu),
 *  Vấn đề (cờ, cột cuối). */
export const COT_LENH: CotTdsx[] = [
  { key: "ma", label: "Lệnh", coDinh: true, w: 150 },
  { key: "ngay", label: "Ngày tạo", w: 104 },
  { key: "han", label: "Hạn SX", w: 190 },
  { key: "khach", label: "Khách hàng", w: 190 },
  { key: "sp", label: "Sản phẩm", w: 200 },
  { key: "sl", label: "Số lượng", w: 110, n: true },
  { key: "dang_o", label: "Đang ở", w: 270 },
  { key: "van_de", label: "Vấn đề" },
];

/** Màu chip của từng cờ — mỗi cờ một sắc. */
const MAU_CO: Record<string, MauTT> = {
  tre_han: "do",
  su_co: "cam",
  tam_dung: "vang",
  kcs_khong_dat: "cham",
  thieu_vat_tu: "slate",
};

/** Chip khâu cho lệnh đã xong sản xuất (Đang SX không chip: có dải chặng). Không trùng sắc cờ ở trên. */
const MAU_KHAU: Record<string, MauTT> = {
  dang_kcs: "tim",
  cho_nhap_kho: "xanh",
  san_sang_giao: "ngoc",
};
const MAU_KHAU_CHINH: Record<string, MauTT> = { sau_sx: "xam", da_giao: "la" };

const TRONG = new Set<string>();

export function TdsxTheoLenh({
  data,
  dangTai,
  rong,
  onMo,
  dangMo = null,
  luoi,
  cotAn = TRONG,
  thuTu = [],
}: {
  /** `null` = chưa có lượt nào về ⇒ hàng xương. */
  data: TdsxTheoLenhOut | null;
  dangTai: boolean;
  rong: ReactNode;
  onMo: (lsxId: number) => void;
  /** Lệnh đang mở hồ sơ — dòng đó viền đủ cạnh. */
  dangMo?: number | null;
  /** Cấu hình lưới của màn cha — có thì ghim + kéo độ rộng được. */
  luoi?: CauHinhLuoi;
  cotAn?: Set<string>;
  thuTu?: string[];
}) {
  const cotHien = apLuoi(luoi, xepCot(COT_LENH, thuTu).filter((c) => !cotAn.has(c.key)));
  return (
    <div className="lds-sheet">
      <CuonLuoi ghim={soCotGhim(cotHien, luoi?.ghim)}>
        <table className="lds-g tdsx-lenh" style={{ minWidth: rongLuoi(cotHien) }}>
          <caption className="sr-only">Lệnh đang sản xuất và vấn đề của từng lệnh</caption>
          <colgroup>
            {cotHien.map((c) => (
              <col key={c.key} style={c.w ? { width: c.w } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {cotHien.map((c) => (
                <th key={c.key} scope="col" className={c.n ? "n" : undefined}>
                  {c.label}
                  {luoi?.keo(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={dangTai && data ? "is-mo" : undefined}>
            {data === null ? (
              <EmptyRow colSpan={cotHien.length} trangThai="dang-tai" />
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={cotHien.length} className="lds-trong">
                  {rong}
                </td>
              </tr>
            ) : (
              data.items.map((r) => (
                <tr
                  key={r.lsx_id}
                  className={`lds-dong${r.lsx_id === dangMo ? " is-chon" : ""}`}
                  tabIndex={0}
                  onClick={() => onMo(r.lsx_id)}
                  onKeyDown={(e) => {
                    // Chỉ khi phím rơi đúng vào dòng; nút trong ô tự xử lý phím của nó.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onMo(r.lsx_id);
                    }
                  }}
                >
                  {cotHien.map((c) => (
                    <OLenh key={c.key} cot={c.key} r={r} />
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CuonLuoi>
      {data && data.total > data.items.length && (
        <p className="tdsx-cat" role="note">
          Hiện {soVN(data.items.length)} trên {soVN(data.total)} lệnh, thu hẹp bằng ô tìm.
        </p>
      )}
    </div>
  );
}

function OLenh({ cot, r }: { cot: string; r: TdsxTheoLenhDong }) {
  switch (cot) {
    case "ma":
      return (
        <td title={r.ten ? `${r.ma} - ${r.ten}` : r.ma}>
          <button
            type="button"
            className="tdsx-ma"
            data-lsx={r.lsx_id}
            // Cả dòng đã là điểm dừng Tab; nút giữ để đọc màn hình + trả tiêu điểm khi đóng hồ sơ.
            tabIndex={-1}
            aria-label={`Mở hồ sơ lệnh ${r.ma}${r.ten ? ` — ${r.ten}` : ""}`}
          >
            {r.ma}
          </button>
          {r.is_rush && <TheGap />}
        </td>
      );
    case "ngay":
      return <td title={ngayGioDayDu(r.created_at)}>{ngayDayDu(r.created_at)}</td>;
    case "khach":
      return r.khach_hang ? (
        <td title={r.khach_hang}>{tenKhachGon(r.khach_hang)}</td>
      ) : (
        <td className="lds-mu3">—</td>
      );
    case "sp":
      return (
        <td title={r.ten ?? undefined}>{r.ten ?? <span className="lds-mu3">Chưa đặt tên</span>}</td>
      );
    case "sl":
      return (
        <td className="n">
          {soVN(r.so_luong_dat)}
          {r.don_vi_tinh ? <span className="lds-u">{r.don_vi_tinh}</span> : null}
        </td>
      );
    case "dang_o": {
      if (r.khau === "dang_sx") {
        const thu = buocThu(r.chang);
        const buoc = r.buoc_hien_tai ?? "Chưa vào bước nào";
        return (
          <td title={thu ? `${buoc}, ${thu}` : buoc}>
            <DaiChang chang={r.chang} />
            <span className="tdsx-sau">{buoc}</span>
            {thu && <span className="lds-u">{thu}</span>}
          </td>
        );
      }
      const mau =
        (r.khau === "sau_sx" && r.khau_chi_tiet && MAU_KHAU[r.khau_chi_tiet]) || MAU_KHAU_CHINH[r.khau] || "slate";
      return (
        <td>
          <ChipTT mau={mau}>{nhanKhau(r.khau, r.khau_chi_tiet)}</ChipTT>
        </td>
      );
    }
    case "han": {
      const tre = r.canh_bao.includes("tre_han");
      return (
        <td>
          {ngayVN(r.han_hoan_thanh_sx)}
          {tre && r.du_kien_xong && <span className="lds-do tdsx-sau">dự kiến {ngayNgan(r.du_kien_xong)}</span>}
        </td>
      );
    }
    default:
      return (
        <td
          title={
            r.canh_bao.length === 0
              ? undefined
              : r.canh_bao
                  .map((c) => (c === "tre_han" && r.tre_ngay != null ? `Trễ ${r.tre_ngay} ngày` : (CO_NHAN[c] ?? c)))
                  .join("   ")
          }
        >
          {r.canh_bao.length === 0 ? (
            <span className="lds-mu3">—</span>
          ) : (
            r.canh_bao.map((c) => (
              <span key={c} className="tdsx-chip">
                <ChipTT mau={MAU_CO[c] ?? "slate"}>
                  {c === "tre_han" && r.tre_ngay != null ? `Trễ ${r.tre_ngay} ngày` : (CO_NHAN[c] ?? c)}
                </ChipTT>
              </span>
            ))
          )}
        </td>
      );
  }
}
