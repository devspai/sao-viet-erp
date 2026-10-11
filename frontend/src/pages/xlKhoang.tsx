// Khoảng ngày của đầu màn LỊCH — dùng chung bàn Xếp lịch và Lịch bàn tổ (10/10/2026): ba cỡ nhìn
// Tuần / 2 tuần / Tháng, số tuần ISO, nhãn "5 → 18 tháng 10".
import { ArrowRight } from "lucide-react";

import { dauTuan, themNgay, ymd } from "./xlShared";

export type CoNhin = "tuan" | "hai_tuan" | "thang";
export const CO_NHIN: { id: CoNhin; ten: string }[] = [
  { id: "tuan", ten: "Tuần" }, { id: "hai_tuan", ten: "2 tuần" }, { id: "thang", ten: "Tháng" },
];

/** Khoảng của một cỡ nhìn chứa ngày `moc`: tuần bắt đầu thứ Hai, tháng từ ngày 1 tới ngày cuối. */
export function khoangTheoCo(co: CoNhin, moc: string): [string, string] {
  const [y, m, d] = moc.split("-").map(Number);
  if (co === "thang") return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
  const t2 = dauTuan(new Date(y, m - 1, d));
  return [t2, themNgay(t2, co === "tuan" ? 6 : 13)];
}

export function laCoNhin(tu: string, den: string): CoNhin | null {
  for (const c of CO_NHIN) {
    const [a, b] = khoangTheoCo(c.id, tu);
    if (a === tu && b === den) return c.id;
  }
  return null;
}

/** Số tuần ISO của một ngày — "Tuần 41" như lịch Google/Outlook. */
export function soTuan(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const thu = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - thu);
  const dauNam = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - dauNam.getTime()) / 86_400_000 + 1) / 7);
}

/** "5 → 18 tháng 10" + năm mờ; khác tháng thì ghi ngày/tháng hai đầu. */
export function NhanKhoang({ tu, den }: { tu: string; den: string }) {
  const [y1, m1, d1] = tu.split("-").map(Number);
  const [y2, m2, d2] = den.split("-").map(Number);
  const mui = <ArrowRight size={13} className="xa-kn__mt" />;
  if (y1 !== y2) return <span className="xa-kn__chu">{d1}/{m1}/{y1}{mui}{d2}/{m2}/{y2}</span>;
  return (
    <span className="xa-kn__chu">
      {m1 === m2 ? <>{d1}{mui}{d2} tháng {m2}</> : <>{d1}/{m1}{mui}{d2}/{m2}</>}
      <span className="xa-kn__nam">{y2}</span>
    </span>
  );
}
