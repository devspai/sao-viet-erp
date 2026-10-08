// Form ngày đặc biệt (tách từ pages/ChamCongPage.tsx). Bố cục: tờ lịch xem trước bên trái ô ngày + tên,
// loại ngày chọn bằng ba thẻ (màu khớp huy hiệu ở bảng ngày đặc biệt), hưởng lương là công tắc.
import { BriefcaseBusiness, CalendarDays, Check, Coins, PartyPopper, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  api,
  type SpecialDay,
  type SpecialDayInput,
} from "../../../../api/client";
import { ChonNgay, type MauDanhDau } from "../../../../components/ChonNgay";
import "./special-day-form.css";

type Loai = "off" | "work" | "off1x";

const LOAI: { id: Loai; ten: string; mo: string; ic: ReactNode }[] = [
  { id: "off", ten: "Nghỉ lễ", mo: "Ngày lẽ ra đi làm nhưng được nghỉ", ic: <PartyPopper size={17} /> },
  { id: "work", ten: "Làm bù", mo: "Đi làm vào ngày lẽ ra được nghỉ", ic: <BriefcaseBusiness size={17} /> },
  { id: "off1x", ten: "Nghỉ không lương", mo: "Ai đi làm cộng 1 công lương chính, không nhân hệ số", ic: <Coins size={17} /> },
];

const MAU_LOAI: Record<Loai, MauDanhDau> = { off: "la", work: "xanh", off1x: "vang" };

const THU = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** Tờ lịch nhỏ: dải tháng, số ngày to, thứ — đổi ngay theo ô ngày. */
function ToLich({ ngay, loai }: { ngay: string; loai: Loai }) {
  const m = ngay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return <div className={`ndb-to ndb-to--${loai} ndb-to--trong`}><CalendarDays size={22} /></div>;
  }
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return (
    <div className={`ndb-to ndb-to--${loai}`} aria-hidden="true">
      <span className="ndb-to__thang">Tháng {+m[2]}</span>
      <span className="ndb-to__ngay">{+m[3]}</span>
      <span className="ndb-to__thu">{THU[d.getDay()]}</span>
    </div>
  );
}

export function SpecialDayForm({
  token,
  special,
  year,
  daKhai = [],
  onClose,
  onSaved,
}: {
  token: string;
  special: SpecialDay | null;
  year: number;
  /** Ngày đặc biệt đã khai trong năm — chấm màu trên lịch, và báo khi chọn trùng. */
  daKhai?: SpecialDay[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SpecialDayInput>({
    day: special?.day ?? `${year}-01-01`,
    kind: special?.kind ?? "off",
    name: special?.name ?? "",
    is_paid: special?.is_paid ?? true,
    note: special?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function set<K extends keyof SpecialDayInput>(k: K, v: SpecialDayInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  const loai = (form.kind ?? "off") as Loai;
  const khac = daKhai.filter((d) => d.id !== special?.id);
  const danhDau = Object.fromEntries(khac.map((d) => [d.day, { mau: MAU_LOAI[d.kind], ten: d.name }]));
  const trung = khac.find((d) => d.day === form.day);
  const luuDuoc = !busy && !!form.name.trim() && !!form.day;

  useEffect(() => {
    const phim = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", phim);
    return () => window.removeEventListener("keydown", phim);
  }, [busy, onClose]);

  async function save() {
    if (!luuDuoc) return;
    setBusy(true);
    setError(null);
    try {
      if (special) await api.calendar.updateSpecialDay(token, special.id, form);
      else await api.calendar.createSpecialDay(token, form);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi khi lưu.");
      setBusy(false);
    }
  }

  return (
    <div className="ns-modal" role="dialog" aria-modal="true" aria-labelledby="ndb-tieu-de"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="ndb" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <header className="ndb-dau">
          <span className="ndb-dau__ic"><CalendarDays size={18} /></span>
          <div className="ndb-dau__chu">
            <h2 id="ndb-tieu-de">{special ? "Sửa ngày đặc biệt" : "Thêm ngày đặc biệt"}</h2>
            <p>Ngày lễ, ngày nghỉ hay ngày làm bù của năm {year}</p>
          </div>
          <button type="button" className="ndb-x" aria-label="Đóng" onClick={onClose} disabled={busy}><X size={17} /></button>
        </header>

        <div className="ndb-than">
          {error && <div className="ndb-loi">{error}</div>}

          <div className="ndb-dong-ngay">
            <ToLich ngay={form.day} loai={loai} />
            <div className="ndb-cot">
              <div className="ndb-o">
                <span className="ndb-o__nhan">Ngày</span>
                <ChonNgay value={form.day} onChange={(v) => set("day", v)} min="2000-01-01" max="2099-12-31"
                  danhDau={danhDau} aria-label="Ngày" required hienThu />
                {trung && <span className="ndb-trung">Ngày này đã khai là {trung.name}</span>}
              </div>
              <label className="ndb-o">
                <span className="ndb-o__nhan">Tên ngày</span>
                <input autoFocus required value={form.name} placeholder="vd Quốc khánh"
                  onChange={(e) => set("name", e.target.value)} />
              </label>
            </div>
          </div>

          <div className="ndb-nhom" role="radiogroup" aria-label="Loại ngày">
            <span className="ndb-o__nhan">Loại ngày</span>
            <div className="ndb-the-ds">
              {LOAI.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={loai === l.id}
                  className={`ndb-the ndb-the--${l.id}${loai === l.id ? " is-chon" : ""}`}
                  onClick={() => set("kind", l.id)}>
                  <span className="ndb-the__ic">{l.ic}</span>
                  <span className="ndb-the__ten">{l.ten}</span>
                  <span className="ndb-the__mo">{l.mo}</span>
                  <span className="ndb-the__dau"><Check size={12} /></span>
                </button>
              ))}
            </div>
          </div>

          {loai === "off" && (
            <label className="ndb-gat">
              <span className="ndb-gat__chu">
                <span>Hưởng nguyên lương</span>
                <span className="ndb-gat__mo">Cộng 1 công vào bảng công cho mọi người</span>
              </span>
              <input type="checkbox" role="switch" checked={!!form.is_paid}
                onChange={(e) => set("is_paid", e.target.checked)} />
              <span className="ndb-gat__nut" aria-hidden="true" />
            </label>
          )}
          {loai === "off1x" && (
            <div className="ndb-goi-y">
              Ngày nghỉ không lương. Ai đi làm được cộng thêm 1 công lương chính, không nhân hệ số lễ
              và không bị trần công tháng.
            </div>
          )}

          <label className="ndb-o">
            <span className="ndb-o__nhan">Ghi chú <span className="ndb-mo">không bắt buộc</span></span>
            <input value={form.note ?? ""} placeholder="vd mùng 1 Tết Âm lịch"
              onChange={(e) => set("note", e.target.value)} />
          </label>
        </div>

        <footer className="ndb-chan">
          <span className="ndb-phim"><kbd>Esc</kbd> để đóng</span>
          <button type="button" className="ndb-nut" onClick={onClose} disabled={busy}>Huỷ</button>
          <button type="submit" className="ndb-nut ndb-nut--chinh" disabled={!luuDuoc}>
            <Check size={15} />{busy ? "Đang lưu…" : special ? "Lưu thay đổi" : "Thêm ngày"}
          </button>
        </footer>
      </form>
    </div>
  );
}
