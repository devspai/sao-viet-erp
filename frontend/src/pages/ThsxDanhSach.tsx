// VIEW "DANH SÁCH BẢN GHI" của bàn tổ — mỗi LỆNH một lưới bước theo khuôn lưới kiểu bảng tính
// (components/LuoiDs). Đầu trang, ô tìm, bộ lọc, nút "Cột" do `ThucHienSxPage` giữ; ở đây chỉ nhận
// cột đang ẩn / thứ tự cột từ trang để mọi lưới của mọi lệnh cùng một bộ cột.
import { Icon } from "../components/Icons";
import type { SxLenhNhom, SxWorkItem } from "../api/client";
import { ChipKcs, ChipKhuon, ChipLoaiBuoc } from "../components/ChipBuoc";
import {
  ChipTT, CuonLuoi, rongLuoi, soCotGhim, xepCot, type CotLuoi, type MauTT,
} from "../components/LuoiDs";
import { num, ngayGio, thoiLuong } from "./keHoachSxShared";
import { nhanDonVi } from "./lsxBuoc";
import { ThsxLenhGroups } from "./ThsxLenhGroups";
import { ChamCho, type SxChoCuaViec } from "./thsxChoXacNhan";
import { slTot, sxNguonIcon, sxSerial } from "./thsxShared";

interface CotThsx extends CotLuoi { w?: number; n?: boolean }

/** Cột lưới bước của bàn tổ. Thứ tự: Mã → Ngày → Nội dung → Máy / Thời gian → Số lượng → Vật tư →
 *  Trạng thái. Trang cha dùng chính danh sách này cho nút "Cột". Công đoạn là coDinh vì ô này mang
 *  chấm chờ xác nhận, chip KCS, loại bước, khuôn: ẩn cột là mất tín hiệu việc chờ trên dòng. */
export const COT_THSX: CotThsx[] = [
  { key: "ma", label: "Mã lệnh", coDinh: true, w: 110 },
  { key: "nhan", label: "Tổ nhận lúc", w: 135 },
  { key: "cd", label: "Công đoạn", coDinh: true, w: 300 },
  { key: "qc", label: "Quy cách", w: 290 },
  { key: "may", label: "Máy / Trạm", w: 170 },
  { key: "tg", label: "Thời gian dự kiến", w: 150 },
  { key: "sl", label: "Sản lượng tốt", w: 120, n: true },
  { key: "vt", label: "Định mức vật tư", w: 240 },
  { key: "tt", label: "Trạng thái" },
];

/** Cùng sắc với chip đếm ở thanh lọc của bàn (chờ làm xanh dương, đang chạy xanh lá, tạm dừng vàng,
 *  hoàn thành xám) — mỗi trạng thái một sắc. */
const MAU_TT: Record<string, MauTT> = {
  released: "xanh",
  running: "la",
  paused: "vang",
  completed: "slate",
};
const NHAN_TT: Record<string, string> = {
  released: "Chờ làm",
  running: "Đang chạy",
  paused: "Tạm dừng",
  completed: "Hoàn thành",
};

interface Props {
  /** MỘT TRANG lệnh/bài ghép (máy chủ đã cắt, đếm theo lệnh); bảng bước nằm trong từng lệnh. */
  lenh: SxLenhNhom[];
  selectedId: number | null;
  onPick: (w: SxWorkItem) => void;
  /** Việc chờ tổ bấm theo công đoạn (§11.5) — chấm đỏ trên dòng lệnh + dòng công đoạn. */
  cho?: ReadonlyMap<number, SxChoCuaViec>;
  /** Cột đang ẩn + thứ tự cột người xem đã kéo (do trang cha giữ cùng nút "Cột"). */
  cotAn?: ReadonlySet<string>;
  thuTu?: string[];
}

/** Quy cách in: mỗi mẩu một thẻ nhỏ, không nối bằng dấu. Rỗng thì trả mảng rỗng. */
function mauQuyCach(qc: SxWorkItem["quy_cach"]): string[] {
  if (!qc) return [];
  const parts: string[] = [];
  if (qc.giay) parts.push(`${qc.giay}${qc.dinh_luong ? ` ${qc.dinh_luong}gsm` : ""}`);
  else if (qc.dinh_luong) parts.push(`${qc.dinh_luong}gsm`);
  if (qc.kho_in) parts.push(`Khổ ${qc.kho_in}`);
  if (qc.so_mau != null) parts.push(`${qc.so_mat ? `${qc.so_mat} mặt ` : ""}${qc.so_mau} màu`);
  if (qc.so_kem != null && qc.so_kem > 0) parts.push(`${qc.so_kem} kẽm`);
  return parts;
}

/** Thời gian làm dự kiến của bước (mất bao lâu để xong) — không phải một mốc ngày giờ. */
function phutChayGon(w: SxWorkItem): { main: string; sub?: string } | null {
  if (w.chay_phut == null || w.chay_phut <= 0) return null;
  const giua = Math.round(w.chay_phut);
  const lo = w.chay_phut_min == null ? giua : Math.round(w.chay_phut_min);
  const hi = w.chay_phut_max == null ? giua : Math.round(w.chay_phut_max);
  const sub = lo !== giua || hi !== giua
    ? `Nhanh nhất ${thoiLuong(lo)}\nChậm nhất ${thoiLuong(hi)}` : undefined;
  return { main: thoiLuong(giua), sub };
}

export function ThsxDanhSach({
  lenh, selectedId, onPick, cho, cotAn, thuTu,
}: Props) {
  const cotHien = xepCot(COT_THSX, thuTu ?? []).filter((c) => !cotAn?.has(c.key));
  return (
    <div className="thsx-ds__scroll">
      <ThsxLenhGroups
        lenh={lenh}
        selectedId={selectedId}
        cho={cho}
        render={(viec) => (
          <DsBang
            viec={viec}
            cot={cotHien}
            selectedId={selectedId}
            onPick={onPick}
            cho={cho}
          />
        )}
      />
    </div>
  );
}

/** Lưới bước CỦA MỘT LỆNH. Nhãn "đang chạy / tạm dừng" của lệnh nằm ở dòng lệnh (`LenhDigest`),
 *  ở đây chỉ còn lưới — khỏi đếm hai lần trên cùng một màn. */
function DsBang({
  viec, cot, selectedId, onPick, cho,
}: {
  viec: SxWorkItem[];
  cot: CotThsx[];
  selectedId: number | null;
  onPick: (w: SxWorkItem) => void;
  cho?: ReadonlyMap<number, SxChoCuaViec>;
}) {
  if (viec.length === 0) return null;

  return (
    <div className="lds-sheet thsx-lds-sheet">
      <CuonLuoi ghim={soCotGhim(cot)}>
        <table className="lds-g" style={{ minWidth: rongLuoi(cot) }}>
          <colgroup>
            {cot.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
          </colgroup>
          <thead>
            <tr>
              {cot.map((c) => <th key={c.key} className={c.n ? "n" : undefined}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {viec.map((w) => {
              const chon = w.id === selectedId;
              const mo = () => onPick(w);
              return (
                <tr
                  key={w.id}
                  className={`lds-dong${chon ? " is-chon" : ""}`}
                  tabIndex={0}
                  aria-current={chon ? "true" : undefined}
                  onClick={mo}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mo(); } }}
                >
                  {cot.map((c) => <OThsx key={c.key} cot={c.key} w={w} cho={cho?.get(w.id)} />)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CuonLuoi>
    </div>
  );
}

function OThsx({ cot, w, cho }: { cot: string; w: SxWorkItem; cho?: SxChoCuaViec }) {
  switch (cot) {
    case "ma":
      return (
        <td title={w.nguon_ten ? `${w.nguon_ten}${w.khach_hang ? `\n${w.khach_hang}` : ""}` : undefined}>
          <span className="sxm-o">
            <span className="sxm-o__the thsx-lds-ic"><Icon name={sxNguonIcon(w.nguon_loai)} size={13} /></span>
            <span className="sxm-o__ct">{sxSerial(w.nguon_ma)}</span>
          </span>
        </td>
      );
    case "nhan":
      return w.nhan_luc
        ? <td title="Lúc tổ nhận việc (phát hành xuống tổ)">{ngayGio(w.nhan_luc)}</td>
        : <td className="lds-mu3">—</td>;
    case "cd":
      return (
        <td title={w.ten_cong_doan || undefined}>
          <span className="sxm-o">
            <span className="sxm-o__ct">{w.ten_cong_doan || "—"}</span>
            <span className="sxm-o__the thsx-lds-chips">
              <ChamCho c={cho} />
              <ChipKcs so_lan={w.kcs_so_lan} loi={w.kcs_loi} />
              <ChipLoaiBuoc loai_buoc={w.loai_buoc} nha_cung_cap={w.nha_cung_cap} />
              <ChipKhuon can_khuon={!!w.khuon} khuon={{ ...(w.khuon ?? {}), da_nhan: w.khuon_da_nhan }} />
            </span>
          </span>
        </td>
      );
    case "qc": {
      const mau = mauQuyCach(w.quy_cach);
      if (mau.length === 0) return <td className="lds-mu3">—</td>;
      return (
        <td title={mau.join("\n")}>
          {mau.map((m, i) => (
            <span key={m} className="lds-tag" style={i === 0 ? { marginLeft: 0 } : undefined}>{m}</span>
          ))}
        </td>
      );
    }
    case "may":
      return w.may ? <td title={w.may}>{w.may}</td> : <td className="lds-mu3">—</td>;
    case "tg": {
      const d = phutChayGon(w);
      return d ? <td title={d.sub}>{d.main}</td> : <td className="lds-mu3">—</td>;
    }
    case "sl":
      // CHỈ số tốt (28/09/2026). Nhận / lỗi / tiến độ xem trong ngăn chi tiết.
      return <td className="n">{slTot(w)}</td>;
    case "vt": {
      const vt = w.dinh_muc_vat_tu;
      if (!vt || vt.length === 0) return <td className="lds-mu3">—</td>;
      const v = vt[0];
      const ten = (v.ten || "").trim() || "—";
      const rest = vt.length - 1;
      return (
        <td title={vt.map((x) => `${x.ten || ""} ${num(x.so_luong)}${x.don_vi ? ` ${nhanDonVi(x.don_vi)}` : ""}`).join("\n")}>
          <span className="sxm-o">
            <span className="sxm-o__ct">{ten}</span>
            {v.so_luong != null && (
              <span className="sxm-o__the lds-u">{num(v.so_luong)}{v.don_vi ? ` ${nhanDonVi(v.don_vi)}` : ""}</span>
            )}
            {rest > 0 && <span className="sxm-o__the lds-tag">+{rest} khác</span>}
          </span>
        </td>
      );
    }
    case "tt":
      // CHỈ nhãn (28/09/2026). Bắt đầu / Tạm dừng / Kết thúc làm ở chân ngăn chi tiết (bấm dòng để mở).
      return (
        <td>
          <ChipTT mau={MAU_TT[w.trang_thai] ?? "xanh"}>{NHAN_TT[w.trang_thai] ?? NHAN_TT.released}</ChipTT>
        </td>
      );
    default:
      return <td />;
  }
}
