// Thẻ lọc của Yêu cầu mua hàng, Mua hàng và Kế toán › Đơn mua hàng — cùng khuôn thẻ lọc dính mép
// trên lưới của các danh sách Kinh doanh (`lds-loc`, phương án A đã duyệt 07/10/2026).
// Một hàng: ô tìm + `ThanhLoc` (kỳ + nút Lọc), dạt phải là "Xem theo" và nút Cột.
// Trạng thái (và nhóm Tiền của danh sách đơn) nằm TRONG nút Lọc (10/10/2026, bỏ dải chip ngoài):
// mỗi nhóm thành một điều kiện "mot" đứng đầu menu, giá trị kèm số máy chủ đếm; chọn rồi thì hiện
// khối "Trạng thái | Chờ lập đơn | ×" cạnh nút Lọc như mọi điều kiện khác. Cha vẫn giữ state rời
// (`tab`, `nhomPhu.tab`) — ở đây chỉ gói chúng vào bộ lọc chung rồi tách ra khi đổi.
import type { ReactNode } from "react";
import { CircleDot, Wallet } from "lucide-react";
import { OTim } from "../../../components/LuoiDs";
import { ThanhLoc } from "../../thanh-loc/ThanhLoc";
import type { KyDS } from "../../thanh-loc/ky-danh-sach";
import type { DieuKien } from "../../thanh-loc/thanh-loc";
import type { MauTT } from "../trang-thai-mua";
import "../trang-thai-mua.css";

export type TabDem = { value: string; label: string; count?: number; mau?: MauTT };

/** Giá trị luôn có trong menu + các trạng thái ít gặp chỉ có khi có bản ghi (hoặc đang chọn). */
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
  /** Tên điều kiện trong nút Lọc ("Tiền"). */
  nhan?: string;
  tabs: TabDem[];
  tab: string;
  onTab: (v: string) => void;
  aria: string;
  /** Giá trị "không lọc" của nhóm (nhóm Tiền: "") — bấm × trên khối là về giá trị này. */
  boChon?: string;
};

/** Bộ lọc của màn + hai ô ẩn mang trạng thái chính và nhóm phụ. */
type LocGop<L> = L & { _tt?: string; _phu?: string };

export function ThanhCongCuMuaHang<L>({
  tabs,
  tab,
  onTab,
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
  /** Tên điều kiện trạng thái chính trong nút Lọc (vd "Hàng"); mặc định "Trạng thái". */
  nhanNhom?: string;
  /** Nhóm thứ hai, độc lập với nhóm chính (vd "Tiền" của danh sách đơn). */
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
  const giaTri = (ds: TabDem[], bo: string) =>
    ds.filter((t) => t.value !== bo).map((t) => ({ value: t.value, nhan: t.label, so: t.count }));
  const boPhu = nhomPhu?.boChon ?? "";
  const locGop: LocGop<L> = {
    ...loc,
    _tt: tab === "all" ? undefined : tab,
    _phu: !nhomPhu || nhomPhu.tab === boPhu ? undefined : nhomPhu.tab,
  };
  const dkGop: DieuKien<LocGop<L>>[] = [
    {
      khoa: "trang_thai", nhan: nhanNhom ?? "Trạng thái", icon: CircleDot, kieu: "mot",
      giaTri: giaTri(tabs, "all"),
      doc: (l) => l._tt,
      ghi: (l, v) => ({ ...l, _tt: v }),
    },
    ...(nhomPhu
      ? [{
          khoa: "nhom_phu", nhan: nhomPhu.nhan ?? "", icon: Wallet, kieu: "mot" as const,
          giaTri: giaTri(nhomPhu.tabs, boPhu),
          doc: (l: LocGop<L>) => l._phu,
          ghi: (l: LocGop<L>, v: string | undefined) => ({ ...l, _phu: v }),
        }]
      : []),
    ...(dieuKien as DieuKien<LocGop<L>>[]),
  ];
  const onLocGop = (l: LocGop<L>) => {
    const { _tt, _phu, ...con } = l;
    if ((_tt ?? "all") !== tab) onTab(_tt ?? "all");
    if (nhomPhu && (_phu ?? boPhu) !== nhomPhu.tab) nhomPhu.onTab(_phu ?? boPhu);
    // Chỉ đổi trạng thái thì đừng ghi lại bộ lọc của màn (khỏi ghi URL, khỏi nạp thừa).
    if (JSON.stringify(con) !== JSON.stringify(loc)) onLoc(con as unknown as L);
  };
  return (
    <section className="lds-loc mh-tc">
      <div className="lds-loc__thanh tl-thanh" role="search">
        <OTim value={q} onChange={onQ} placeholder={placeholder} ariaLabel={placeholder} />
        <ThanhLoc ky={ky} moc={moc} onKy={onKy} dieuKien={dkGop} loc={locGop} onLoc={onLocGop} />
        {(ben || chonCot) && (
          <div className="lds-loc__phai">
            {ben}
            {chonCot}
          </div>
        )}
      </div>
    </section>
  );
}
