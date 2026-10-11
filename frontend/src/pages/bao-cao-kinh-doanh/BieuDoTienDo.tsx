// Cách xem "Biểu đồ" của Báo cáo kinh doanh — phương án C (11/10/2026), mockup
// docs/mockups/bao-cao-kinh-doanh-3-phuong-an.html mục C.
//
// Một tờ báo cáo tiến độ đọc từ trên xuống: đầu tờ (công ty, tên báo cáo, kỳ, tính tới, phạm vi) →
// "ống tiến độ" bốn thanh CÙNG MỘT THƯỚC (chốt, giao, xuất hoá đơn, thu) để thấy tiền kẹt ở khâu nào →
// bảng theo khách (hoặc theo sale) có thanh % trong ô và cột "Cần chú ý" → Tổng cộng → chú thích.
// Không có giá vốn / lãi gộp: giá thành gốc do kế toán điền, chưa có.
import { useMemo, useState } from "react";
import type { BaoCaoKinhDoanh, BaoCaoKinhDoanhDon } from "../../api/client";
import { ChipTT, type MauTT } from "../../components/LuoiDs";
import { COMPANY } from "../../constants/company";
import { fmtDateISO, money } from "../../utils/format";

type NhomTheo = "khach" | "sale";

interface Nhom {
  key: string;
  ten: string;
  don: BaoCaoKinhDoanhDon[];
  tong_vat: number;
  gia_tri_giao: number;
  da_xuat_hd: number;
  da_thu: number;
  con_phai_thu: number;
}

const DON_TIEN = ["tong_vat", "gia_tri_giao", "da_xuat_hd", "da_thu", "con_phai_thu"] as const;

function cong(key: string, ten: string, don: BaoCaoKinhDoanhDon[]): Nhom {
  const n: Nhom = { key, ten, don, tong_vat: 0, gia_tri_giao: 0, da_xuat_hd: 0, da_thu: 0, con_phai_thu: 0 };
  for (const d of don) for (const c of DON_TIEN) n[c] += d[c];
  return n;
}

function nhomLai(bc: BaoCaoKinhDoanh, theo: NhomTheo): Nhom[] {
  if (theo === "khach") return bc.khach.map((k) => cong(String(k.customer_id ?? "khong"), k.ten, k.don));
  const m = new Map<string, BaoCaoKinhDoanhDon[]>();
  for (const k of bc.khach) for (const d of k.don) {
    const ten = d.sale ?? "(Chưa gắn sale)";
    m.set(ten, [...(m.get(ten) ?? []), d]);
  }
  return [...m.entries()]
    .sort(([a], [b]) => (a.startsWith("(") ? 1 : b.startsWith("(") ? -1 : a.localeCompare(b, "vi")))
    .map(([ten, don]) => cong(ten, ten, don));
}

const phanTram = (v: number, tren: number) => (tren > 0 ? Math.round((v * 100) / tren) : null);
const ngayThang = (iso: string) => fmtDateISO(iso).slice(0, 5);
const soNgay = (tu: string, den: string) => Math.round((Date.parse(den) - Date.parse(tu)) / 86_400_000);

interface ChuY {
  mau: MauTT;
  chu: string;
  /** Số đơn dính, để người xem biết bấm vào đơn nào ở cách xem Bảng. */
  don: string[];
}

/** Việc còn sống của một nhóm đơn, tính theo ngày "tính tới" của báo cáo. Đơn xong hết (giao đủ, thu
 *  đủ) thì không chip nào. Mỗi loại một màu, không loại nào trùng màu loại khác. */
function canChuY(don: BaoCaoKinhDoanhDon[], tinhToi: string): ChuY[] {
  const qua: BaoCaoKinhDoanhDon[] = [];
  const gan: BaoCaoKinhDoanhDon[] = [];
  const xa: BaoCaoKinhDoanhDon[] = [];
  const chuaThu: BaoCaoKinhDoanhDon[] = [];
  const thieuCoc: BaoCaoKinhDoanhDon[] = [];
  for (const d of don) {
    if (d.giao !== "du") {
      if (d.ngay_giao) {
        const con = soNgay(tinhToi, d.ngay_giao);
        (con < 0 ? qua : con <= 7 ? gan : xa).push(d);
      }
      if (d.coc_con_thieu > 0) thieuCoc.push(d);
    } else if (d.thu !== "du") {
      chuaThu.push(d);
    }
  }
  const hen = (ds: BaoCaoKinhDoanhDon[], mot: string, nhieu: string) => {
    const ngay = [...new Set(ds.map((d) => d.ngay_giao as string))].sort();
    if (ds.length === 1) return `${mot} ${ngayThang(ngay[0])}`;
    return ngay.length === 1 ? `${ds.length} đơn ${nhieu} ${ngayThang(ngay[0])}` : `${ds.length} đơn ${nhieu} từ ${ngayThang(ngay[0])}`;
  };
  const ra: ChuY[] = [];
  const them = (ds: BaoCaoKinhDoanhDon[], mau: MauTT, chu: string) => {
    if (ds.length) ra.push({ mau, chu, don: ds.map((d) => d.order_no) });
  };
  them(qua, "do", qua.length ? hen(qua, "Quá hẹn giao", "quá hẹn giao") : "");
  them(chuaThu, "tim", chuaThu.length === 1 ? "Giao xong chưa thu đủ" : `${chuaThu.length} đơn giao xong chưa thu đủ`);
  them(gan, "cam", gan.length ? hen(gan, "Hẹn giao", "hẹn giao") : "");
  them(thieuCoc, "vang", thieuCoc.length === 1 ? "Thiếu cọc" : `${thieuCoc.length} đơn thiếu cọc`);
  them(xa, "slate", xa.length ? hen(xa, "Hẹn giao", "hẹn giao") : "");
  return ra;
}

/** Thanh % trong ô: một màu, độ dài theo % của doanh số có VAT của chính dòng đó. */
function ThanhO({ v, tren, ten }: { v: number; tren: number; ten: string }) {
  const p = phanTram(v, tren);
  return (
    <div className="bckd-bd__o" title={`${ten}: ${money(v)}${p == null ? "" : ` (${p}%)`}`}>
      <span className="bckd-bd__ray"><i style={{ width: `${Math.min(100, p ?? 0)}%` }} /></span>
      <span className="bckd-bd__pt">{p == null ? "—" : `${p}%`}</span>
    </div>
  );
}

const PHAM_VI: Record<string, string> = {
  all: "toàn công ty",
  department: "khách của phòng bạn",
  own: "khách bạn phụ trách",
};

export function phamViChu(p: string): string {
  return PHAM_VI[p] ?? p;
}

export function kyChu(tu: string | null, den: string | null): string {
  if (tu && den) return `từ ${fmtDateISO(tu)} đến ${fmtDateISO(den)}`;
  if (tu) return `từ ${fmtDateISO(tu)}`;
  if (den) return `đến ${fmtDateISO(den)}`;
  return "mọi thời gian";
}

export function BieuDoTienDo({ bc }: { bc: BaoCaoKinhDoanh }) {
  const [theo, setTheo] = useState<NhomTheo>("khach");
  const nhom = useMemo(() => nhomLai(bc, theo), [bc, theo]);
  const t = bc.tong;
  const ong: { ten: string; v: number; dam?: boolean }[] = [
    { ten: "Chốt đơn", v: t.tong_vat, dam: true },
    { ten: "Đã giao", v: t.gia_tri_giao },
    { ten: "Đã xuất hoá đơn", v: t.da_xuat_hd },
    { ten: "Đã thu", v: t.da_thu },
  ];
  // Một thước cho cả bốn thanh: thanh dài nhất (thường là Chốt đơn; hoá đơn có thể vượt chốt khi
  // xuất dư) là 100% bề rộng.
  const thuoc = Math.max(1, ...ong.map((o) => o.v));

  return (
    <div className="bckd-bd">
      <div className="bckd-bd__to">
        <header className="bckd-bd__dau">
          <div className="bckd-bd__cty">{COMPANY.name}</div>
          <h2>Tình hình bán hàng và thực hiện đơn</h2>
          <p>
            Đơn chốt {kyChu(bc.tu_ngay, bc.den_ngay)}. Giao, hoá đơn, thu tính tới {fmtDateISO(bc.tinh_toi)}. Phạm vi{" "}
            {phamViChu(bc.pham_vi)}.
          </p>
        </header>
        <div className="bckd-bd__ong" role="list" aria-label="Tiến độ từ chốt đơn tới thu tiền">
          {ong.map((o) => {
            const p = phanTram(o.v, t.tong_vat);
            return (
              <div key={o.ten} className="bckd-bd__ong-hang" role="listitem" title={`${o.ten}: ${money(o.v)}${p == null ? "" : ` (${p}% doanh số có VAT)`}`}>
                <span className="bckd-bd__ong-ten">{o.ten}</span>
                <span className="bckd-bd__ong-ray">
                  <i className={o.dam ? "is-dam" : undefined} style={{ width: `${(o.v * 100) / thuoc}%` }} />
                </span>
                <span className="bckd-bd__ong-so">{money(o.v)}</span>
                <span className="bckd-bd__ong-pt">{p == null ? "—" : `${p}%`}</span>
              </div>
            );
          })}
          <div className="bckd-bd__ong-hang" role="listitem">
            <span className="bckd-bd__ong-ten">Còn phải thu</span>
            <span />
            <span className="bckd-bd__ong-so">{money(t.con_phai_thu)}</span>
            <span className="bckd-bd__ong-pt">{phanTram(t.con_phai_thu, t.tong_vat) == null ? "—" : `${phanTram(t.con_phai_thu, t.tong_vat)}%`}</span>
          </div>
        </div>
      </div>

      <div className="bckd-bd__to">
        <div className="bckd-bd__nhom">
          <span>Nhóm theo</span>
          <div className="bckd-sg" role="group" aria-label="Nhóm theo">
            <button type="button" aria-pressed={theo === "khach"} onClick={() => setTheo("khach")}>Khách</button>
            <button type="button" aria-pressed={theo === "sale"} onClick={() => setTheo("sale")}>Sale</button>
          </div>
        </div>
        <div className="bckd-bd__cuon">
          <table className="lds-g bckd-bd__bang">
            <colgroup>
              <col />
              <col style={{ width: 56 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 220 }} />
            </colgroup>
            <thead>
              <tr>
                <th>{theo === "khach" ? "Khách hàng" : "Sale"}</th>
                <th className="n">Đơn</th>
                <th className="n">Doanh số có VAT</th>
                <th>Đã giao</th>
                <th>Đã xuất HĐ</th>
                <th>Đã thu</th>
                <th className="n">Còn phải thu</th>
                <th>Cần chú ý</th>
              </tr>
            </thead>
            <tbody>
              {nhom.map((n) => (
                <tr key={n.key}>
                  <td title={n.ten}>{n.ten}</td>
                  <td className="n">{n.don.length}</td>
                  <td className="n">{money(n.tong_vat)}</td>
                  <td><ThanhO v={n.gia_tri_giao} tren={n.tong_vat} ten="Đã giao" /></td>
                  <td><ThanhO v={n.da_xuat_hd} tren={n.tong_vat} ten="Đã xuất hoá đơn" /></td>
                  <td><ThanhO v={n.da_thu} tren={n.tong_vat} ten="Đã thu" /></td>
                  <td className="n">{money(n.con_phai_thu)}</td>
                  <td className="bckd-bd__chu-y">
                    {canChuY(n.don, bc.tinh_toi).map((c) => (
                      <ChipTT key={c.chu} mau={c.mau} title={c.don.join(", ")}>{c.chu}</ChipTT>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="lds-cong">
                <td>Tổng cộng {nhom.length} {theo === "khach" ? "khách" : "sale"}</td>
                <td className="n">{t.so_don}</td>
                <td className="n">{money(t.tong_vat)}</td>
                <td><ThanhO v={t.gia_tri_giao} tren={t.tong_vat} ten="Đã giao" /></td>
                <td><ThanhO v={t.da_xuat_hd} tren={t.tong_vat} ten="Đã xuất hoá đơn" /></td>
                <td><ThanhO v={t.da_thu} tren={t.tong_vat} ten="Đã thu" /></td>
                <td className="n">{money(t.con_phai_thu)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="bckd-bd__chu-thich">
          % tính trên doanh số có VAT của dòng. Đã giao quy ra tiền: số đã giao nhân tiền có VAT của từng mặt hàng. Đã thu gồm
          cả tiền cọc. Hoá đơn và phiếu thu đã huỷ không tính. Hẹn giao xét theo ngày {fmtDateISO(bc.tinh_toi)}: quá hẹn, trong
          7 ngày tới, xa hơn.
        </p>
      </div>
    </div>
  );
}
