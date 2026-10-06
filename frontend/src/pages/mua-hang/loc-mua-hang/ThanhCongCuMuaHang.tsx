// Thẻ lọc của hai tab màn Mua hàng (06/10/2026) — thay `ToolbarChuan` ở màn này. Cùng khuôn với hộp
// Đơn mua hàng của Kế toán (`InboxToolbar`): hàng 1 = tab trạng thái có số (máy chủ đếm theo đúng ô
// tìm, kỳ và điều kiện đang áp); hàng 2 = ô tìm + thanh lọc chung `ThanhLoc`.
import { Icon } from "../../../components/Icons";
import { ThanhLoc } from "../../thanh-loc/ThanhLoc";
import type { KyDS } from "../../thanh-loc/ky-danh-sach";
import { dkTheoTab, type DieuKien } from "../../thanh-loc/thanh-loc";

export type TabDem = { value: string; label: string; count?: number };

/** Tab luôn hiện + các trạng thái ít gặp chỉ hiện khi có bản ghi (hoặc đang chọn). */
export function tabCoSo(
  chinh: string[],
  meta: Record<string, { label: string }>,
  dem: Record<string, number> | null,
  dangChon: string,
): TabDem[] {
  const tabs: TabDem[] = [{ value: "all", label: "Tất cả", count: dem ? dem.tat_ca ?? 0 : undefined }];
  for (const [value, m] of Object.entries(meta)) {
    const so = dem ? dem[value] ?? 0 : undefined;
    if (chinh.includes(value) || (so ?? 0) > 0 || value === dangChon) {
      tabs.push({ value, label: m.label, count: so });
    }
  }
  return tabs;
}

export function ThanhCongCuMuaHang<L>({
  tabs,
  tab,
  onTab,
  ariaTabs,
  q,
  onQ,
  placeholder,
  ky,
  moc,
  onKy,
  dieuKien,
  loc,
  onLoc,
}: {
  tabs: TabDem[];
  tab: string;
  onTab: (v: string) => void;
  ariaTabs: string;
  q: string;
  onQ: (v: string) => void;
  placeholder: string;
  ky: KyDS;
  moc: [string, string][];
  onKy: (k: KyDS) => void;
  dieuKien: DieuKien<L>[];
  loc: L;
  onLoc: (l: L) => void;
}) {
  // "Trạng thái" trong nút Lọc = hàng tab trạng thái (đọc/ghi thẳng tab đang chọn, không state thứ hai).
  const dkDu: DieuKien<L>[] = [
    dkTheoTab<L>({
      tabs: tabs.map((t) => ({ id: t.value, nhan: t.label, so: t.count })),
      tatCa: "all",
      dang: tab,
      dat: onTab,
    }),
    ...dieuKien,
  ];
  return (
    <section className="acct-dmh__toolbar-card">
      <div className="acct-toolbar__top-row">
        <div className="acct-toolbar__tabs" role="tablist" aria-label={ariaTabs}>
          {tabs.map((t) => {
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                className={`acct-toolbar__tab${active ? " is-active" : ""}`}
                onClick={() => onTab(t.value)}
              >
                <span>{t.label}</span>
                {t.count != null && (
                  <span className="acct-toolbar__tab-count">{t.count.toLocaleString("vi-VN")}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="acct-toolbar__main-row tl-thanh">
        <form
          className="acct-toolbar__search-wrap"
          role="search"
          onSubmit={(event) => event.preventDefault()}
        >
          <Icon name="search" size={16} className="acct-toolbar__search-icon" />
          <input
            className="acct-toolbar__search-input"
            value={q}
            onChange={(event) => onQ(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
          {q && (
            <button
              type="button"
              className="acct-toolbar__clear-search"
              onClick={() => onQ("")}
              title="Xóa từ khóa"
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </form>
        <ThanhLoc ky={ky} moc={moc} onKy={onKy} dieuKien={dkDu} loc={loc} onLoc={onLoc} />
      </div>
    </section>
  );
}
