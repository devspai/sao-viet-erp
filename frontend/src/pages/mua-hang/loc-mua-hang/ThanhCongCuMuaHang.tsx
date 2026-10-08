// Thẻ lọc của Yêu cầu mua hàng, Mua hàng và Kế toán › Đơn mua hàng — cùng khuôn thẻ lọc dính mép
// trên lưới của các danh sách Kinh doanh (`lds-loc`, phương án A đã duyệt 07/10/2026).
// Dải đầu thẻ = lọc nhanh trạng thái có số (máy chủ đếm theo đúng ô tìm, kỳ và điều kiện đang áp);
// hàng dưới = ô tìm + `ThanhLoc` (kỳ + nút Lọc), dạt phải là nhóm Tiền (danh sách đơn) và "Xem theo".
// Trạng thái CHỈ chọn ở dải lọc nhanh — không nhân thêm thành ô "Trạng thái" trong nút Lọc (trước
// đây chọn một chip là hiện cả viên "Trạng thái: Chờ lập đơn ×" lẫn chip sáng: nói hai lần).
import type { ReactNode } from "react";
import { LocNhanhTrangThai, OTim } from "../../../components/LuoiDs";
import { ThanhLoc } from "../../thanh-loc/ThanhLoc";
import type { KyDS } from "../../thanh-loc/ky-danh-sach";
import type { DieuKien } from "../../thanh-loc/thanh-loc";
import type { MauTT } from "../trang-thai-mua";
import "../trang-thai-mua.css";

export type TabDem = { value: string; label: string; count?: number; mau?: MauTT };

/** Tab luôn hiện + các trạng thái ít gặp chỉ hiện khi có bản ghi (hoặc đang chọn). */
export function tabCoSo(
  chinh: string[],
  meta: Record<string, { label: string; mau?: MauTT }>,
  dem: Record<string, number> | null | undefined,
  dangChon: string,
  nhanTatCa = "Tất cả",
): TabDem[] {
  const tabs: TabDem[] = [{ value: "all", label: nhanTatCa, count: dem ? dem.tat_ca ?? 0 : undefined }];
  for (const [value, m] of Object.entries(meta)) {
    const so = dem ? dem[value] ?? 0 : undefined;
    if (chinh.includes(value) || (so ?? 0) > 0 || value === dangChon) {
      tabs.push({ value, label: m.label, count: so, mau: m.mau });
    }
  }
  return tabs;
}

export type NhomChip = {
  /** Chữ trước nhóm ("Hàng", "Tiền"); bỏ trống khi chỉ có một nhóm. */
  nhan?: string;
  tabs: TabDem[];
  tab: string;
  onTab: (v: string) => void;
  aria: string;
  /** Bấm lại chip đang chọn thì bỏ chọn (về `boChon`) — nhóm phụ như Tiền không có chip Tất cả. */
  boChon?: string;
};

function Nhom({ n }: { n: NhomChip }) {
  return (
    <div className="mh-tc__nhom">
      {n.nhan && <span className="mh-tc__nhan">{n.nhan}</span>}
      <LocNhanhTrangThai
        muc={n.tabs.map((t) => ({ key: t.value, label: t.label, count: t.count, mau: t.mau }))}
        dang={n.tab}
        onChon={(v) => n.onTab(n.tab === v && n.boChon !== undefined ? n.boChon : v)}
        ariaLabel={n.aria}
      />
    </div>
  );
}

export function ThanhCongCuMuaHang<L>({
  tabs,
  tab,
  onTab,
  ariaTabs,
  nhanNhom,
  nhomPhu,
  q,
  onQ,
  placeholder,
  ky,
  moc,
  onKy,
  dieuKien,
  loc,
  onLoc,
  ben,
  chonCot,
}: {
  tabs: TabDem[];
  tab: string;
  onTab: (v: string) => void;
  ariaTabs: string;
  /** Chữ trước nhóm chính (vd "Hàng") — chỉ cần khi có `nhomPhu`. */
  nhanNhom?: string;
  /** Nhóm chip thứ hai, độc lập với nhóm chính (vd "Tiền" của danh sách đơn) — nằm ở hàng công cụ. */
  nhomPhu?: NhomChip;
  q: string;
  onQ: (v: string) => void;
  placeholder: string;
  ky: KyDS;
  moc: [string, string][];
  onKy: (k: KyDS) => void;
  dieuKien: DieuKien<L>[];
  loc: L;
  onLoc: (l: L) => void;
  /** Dạt mép phải hàng công cụ, vd nút đoạn "Xem theo: Yêu cầu | Từng món". */
  ben?: ReactNode;
  /** Nút "Cột" của lưới đứng ngay dưới (`ChonCotBang`) — nằm cuối cùng ở mép phải. */
  chonCot?: ReactNode;
}) {
  return (
    <section className="lds-loc mh-tc">
      <div className="mh-tc__dai">
        <Nhom n={{ nhan: nhomPhu ? nhanNhom : undefined, tabs, tab, onTab, aria: ariaTabs }} />
      </div>
      <div className="lds-loc__thanh tl-thanh" role="search">
        <OTim value={q} onChange={onQ} placeholder={placeholder} ariaLabel={placeholder} />
        <ThanhLoc ky={ky} moc={moc} onKy={onKy} dieuKien={dieuKien} loc={loc} onLoc={onLoc} />
        {(nhomPhu || ben || chonCot) && (
          <div className="lds-loc__phai">
            {nhomPhu && <Nhom n={nhomPhu} />}
            {ben}
            {chonCot}
          </div>
        )}
      </div>
    </section>
  );
}
