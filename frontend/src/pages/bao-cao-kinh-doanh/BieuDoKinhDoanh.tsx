// Cách xem "Biểu đồ" của Báo cáo kinh doanh — phương án A (12/10/2026) của
// docs/mockups/bao-cao-kinh-doanh-bieu-do-3-phuong-an.html (theo ảnh Executive Sales Dashboard).
//
// Hàng năm thẻ (Chốt đơn → Còn phải thu, thanh phần trăm trên doanh số có VAT) → cột chốt đơn theo
// ngày (tháng, quý khi kỳ dài) kèm đường luỹ kế | vòng cơ cấu doanh số hai tab Theo khách | Theo mặt
// hàng → thanh còn phải thu theo khách | thanh đơn lớn nhất.
//
// Vẽ từ CHÍNH báo cáo của bảng, máy chủ không thêm phép tính nào. Chỉ ngày chốt có ngày: đã giao, đã
// thu không có ngày nên không vẽ theo thời gian. Bấm khách → Bảng lọc khách đó; bấm một cột thời gian
// → Bảng với kỳ đúng khoảng đó; bấm một đơn → Bảng tô các dòng của đơn. Không có giá vốn / lãi gộp.
import { useMemo, useState } from "react";

import type { BaoCaoKinhDoanh, BaoCaoKinhDoanhDon, BaoCaoKinhDoanhKhach } from "../../api/client";
import {
  ChuGiai, ChuGiaiVong, HangThe, KhungCot, Khoi, MAU_DT, MAU_KHAC, OTip, TOI_DA_LAT, TabKhoi, ThanhNgang,
  VongCoCau, phanTram, rePhai, tenNgan, trieu, type DongThanh, type Lat, type Tip,
} from "../../components/BieuDo";
import { soVN } from "../../components/LuoiDs";

const MAU = { chot: "#334155", giao: "#10b981", hd: "#8b5cf6", thu: "#2563eb", con: "#f97316", luyKe: "#f97316" };

// ---------- trục thời gian theo ngày chốt ----------

type O = { khoa: string; nhan: string; tipNhan: string; tu: string; den: string; v: number; soDon: number };

const dd = (n: number) => String(n).padStart(2, "0");
const ngayUTC = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const isoTu = (ms: number) => {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${dd(t.getUTCMonth() + 1)}-${dd(t.getUTCDate())}`;
};
const NGAY = 86_400_000;
const cuoiThang = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Chia kỳ thành các ô: đến 31 ngày thì mỗi ngày một ô, đến 24 tháng thì mỗi tháng, dài hơn thì quý.
 *  Đầu trục là đầu kỳ (kỳ "Tất cả" thì ngày chốt sớm nhất); cuối trục là ngày "tính tới" (không vẽ
 *  những ngày chưa tới của tháng này). */
function chiaKy(bc: BaoCaoKinhDoanh, don: BaoCaoKinhDoanhDon[]): { o: O[]; don_vi: "ngày" | "tháng" | "quý" } {
  const ngay = don.map((d) => d.ngay_chot).filter((x): x is string => !!x).map((x) => x.slice(0, 10)).sort();
  if (!ngay.length) return { o: [], don_vi: "ngày" };
  const dau = bc.tu_ngay && bc.tu_ngay < ngay[0] ? bc.tu_ngay : ngay[0];
  let cuoi = bc.den_ngay && bc.den_ngay < bc.tinh_toi ? bc.den_ngay : bc.tinh_toi;
  if (!cuoi || cuoi < ngay[ngay.length - 1]) cuoi = ngay[ngay.length - 1];
  const soNgay = Math.round((ngayUTC(cuoi) - ngayUTC(dau)) / NGAY) + 1;
  const [y0, m0] = dau.split("-").map(Number);
  const [y1, m1] = cuoi.split("-").map(Number);
  const soThang = (y1 - y0) * 12 + (m1 - m0) + 1;
  const kep = (tu: string, den: string) => [tu < dau ? dau : tu, den > cuoi ? cuoi : den] as const;

  const o: O[] = [];
  let don_vi: "ngày" | "tháng" | "quý";
  if (soNgay <= 31) {
    don_vi = "ngày";
    for (let t = ngayUTC(dau); t <= ngayUTC(cuoi); t += NGAY) {
      const iso = isoTu(t);
      o.push({ khoa: iso, nhan: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, tipNhan: `Ngày ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`, tu: iso, den: iso, v: 0, soDon: 0 });
    }
  } else if (soThang <= 24) {
    don_vi = "tháng";
    const nhieuNam = y0 !== y1;
    for (let i = 0; i < soThang; i++) {
      const y = y0 + Math.floor((m0 - 1 + i) / 12), m = ((m0 - 1 + i) % 12) + 1;
      const [tu, den] = kep(`${y}-${dd(m)}-01`, `${y}-${dd(m)}-${dd(cuoiThang(y, m))}`);
      o.push({ khoa: `${y}-${dd(m)}`, nhan: nhieuNam ? `${m}/${String(y).slice(2)}` : `T${m}`, tipNhan: `Tháng ${m}/${y}`, tu, den, v: 0, soDon: 0 });
    }
  } else {
    don_vi = "quý";
    const q0 = Math.floor((m0 - 1) / 3), q1 = (y1 - y0) * 4 + Math.floor((m1 - 1) / 3);
    for (let i = q0; i <= q1; i++) {
      const y = y0 + Math.floor(i / 4), q = (i % 4) + 1, mDau = (q - 1) * 3 + 1;
      const [tu, den] = kep(`${y}-${dd(mDau)}-01`, `${y}-${dd(mDau + 2)}-${dd(cuoiThang(y, mDau + 2))}`);
      o.push({ khoa: `${y}-Q${q}`, nhan: `Q${q}/${String(y).slice(2)}`, tipNhan: `Quý ${q}/${y}`, tu, den, v: 0, soDon: 0 });
    }
  }
  for (const d of don) {
    if (!d.ngay_chot) continue;
    const n = d.ngay_chot.slice(0, 10);
    const x = o.find((c) => c.tu <= n && n <= c.den);
    if (x) {
      x.v += d.tong_vat;
      x.soDon += 1;
    }
  }
  return { o, don_vi };
}

// ---------- mặt hàng ----------

/** Tiền có VAT của một dòng mặt hàng (thành tiền chưa VAT cộng VAT của dòng). */
const vatDong = (thanhTien: number | null, vatPct: number) => (thanhTien ?? 0) * (1 + (vatPct || 0) / 100);

type DonKh = BaoCaoKinhDoanhDon & { kh: BaoCaoKinhDoanhKhach };

export function BieuDoKinhDoanh({ bc, onKhach, onKy, onDon }: {
  bc: BaoCaoKinhDoanh;
  /** Sang Bảng, lọc đúng khách này. */
  onKhach: (customerId: number) => void;
  /** Sang Bảng với kỳ chốt từ `tu` tới `den`. */
  onKy: (tu: string, den: string) => void;
  /** Sang Bảng, tô các dòng của đơn. */
  onDon: (orderId: number) => void;
}) {
  const [tab, setTab] = useState<"khach" | "mh">("khach");
  const [tip, setTip] = useState<Tip>(null);
  const t = bc.tong;

  const don: DonKh[] = useMemo(() => bc.khach.flatMap((k) => k.don.map((d) => ({ ...d, kh: k }))), [bc]);
  const { o, don_vi } = useMemo(() => chiaKy(bc, don), [bc, don]);
  const luyKe = useMemo(() => o.reduce<number[]>((a, c, i) => [...a, (a[i - 1] ?? 0) + c.v], []), [o]);

  // Màu khách theo hạng doanh số — giữ nguyên ở mọi khối.
  const khach = useMemo(() => [...bc.khach].sort((a, b) => b.tong_vat - a.tong_vat), [bc]);
  const mauKh = new Map(khach.map((k, i) => [k, i < TOI_DA_LAT ? MAU_DT[i] : MAU_KHAC]));
  const moKhach = (k: BaoCaoKinhDoanhKhach) => (k.customer_id != null ? () => onKhach(k.customer_id as number) : undefined);

  const pt = (v: number) => (t.tong_vat > 0 ? (100 * v) / t.tong_vat : 0);
  const the = [
    { nhan: "Chốt đơn", mau: MAU.chot, so: soVN(t.tong_vat), ray: 100, phu: `${t.so_don} đơn của ${t.so_khach} khách` },
    { nhan: "Đã giao", mau: MAU.giao, so: soVN(t.gia_tri_giao), ray: pt(t.gia_tri_giao), phu: `${phanTram(t.gia_tri_giao, t.tong_vat)}% doanh số có VAT` },
    { nhan: "Đã xuất hoá đơn", mau: MAU.hd, so: soVN(t.da_xuat_hd), ray: pt(t.da_xuat_hd), phu: `${phanTram(t.da_xuat_hd, t.tong_vat)}% doanh số có VAT` },
    { nhan: "Đã thu", mau: MAU.thu, so: soVN(t.da_thu), ray: pt(t.da_thu), phu: `${phanTram(t.da_thu, t.tong_vat)}% doanh số có VAT` },
    { nhan: "Còn phải thu", mau: MAU.con, so: soVN(t.con_phai_thu), ray: pt(t.con_phai_thu), phu: `${phanTram(t.con_phai_thu, t.tong_vat)}% doanh số có VAT` },
  ];

  // Vòng cơ cấu
  const lat: Lat[] = useMemo(() => {
    if (tab === "khach") {
      const ra: Lat[] = khach.slice(0, TOI_DA_LAT).map((k, i) => ({
        khoa: String(k.customer_id ?? `k${i}`), ten: tenNgan(k.ten), tenDu: k.ten, v: k.tong_vat, mau: MAU_DT[i],
        onClick: k.customer_id != null ? () => onKhach(k.customer_id as number) : undefined,
      }));
      if (khach.length > TOI_DA_LAT) {
        ra.push({ khoa: "khac", ten: "Khách khác", v: khach.slice(TOI_DA_LAT).reduce((a, k) => a + k.tong_vat, 0), mau: MAU_KHAC });
      }
      return ra;
    }
    const m = new Map<string, number>();
    for (const d of don) for (const l of d.dong) m.set(l.ten || "(Không tên)", (m.get(l.ten || "(Không tên)") ?? 0) + vatDong(l.thanh_tien, l.vat_pct));
    const ds = [...m].sort((a, b) => b[1] - a[1]);
    const ra: Lat[] = ds.slice(0, TOI_DA_LAT).map(([ten, v], i) => ({ khoa: ten, ten, v: Math.round(v), mau: MAU_DT[i] }));
    if (ds.length > TOI_DA_LAT) {
      ra.push({ khoa: "khac", ten: "Mặt hàng khác", v: Math.round(ds.slice(TOI_DA_LAT).reduce((a, x) => a + x[1], 0)), mau: MAU_KHAC });
    }
    return ra;
  }, [tab, khach, don, onKhach]);
  const tongLat = lat.reduce((a, l) => a + l.v, 0);

  // Còn phải thu theo khách
  const conThu = khach.filter((k) => k.con_phai_thu > 0).sort((a, b) => b.con_phai_thu - a.con_phai_thu);
  const conThuHien = conThu.slice(0, TOI_DA_LAT);
  const dongCon: DongThanh[] = conThuHien.map((k) => ({
    khoa: String(k.customer_id ?? k.ten), ten: tenNgan(k.ten), tenDu: k.ten, so: soVN(k.con_phai_thu), onClick: moKhach(k),
    doan: [
      { v: Math.min(k.da_thu, k.tong_vat), mau: MAU.thu, tip: [k.ten, `Đã thu ${soVN(k.da_thu)} đ`] },
      { v: k.con_phai_thu, mau: MAU.con, tip: [k.ten, `Còn phải thu ${soVN(k.con_phai_thu)} đ`] },
    ],
  }));
  const thuocCon = Math.max(1, ...conThuHien.map((k) => Math.max(k.tong_vat, k.da_thu + k.con_phai_thu)));

  // Đơn lớn nhất
  const donLon = [...don].sort((a, b) => b.tong_vat - a.tong_vat).slice(0, TOI_DA_LAT);
  const dongDon: DongThanh[] = donLon.map((d) => ({
    khoa: String(d.order_id), ten: `${d.order_no}  ${tenNgan(d.kh.ten)}`, tenDu: `${d.order_no} ${d.kh.ten}`, so: soVN(d.tong_vat),
    onClick: () => onDon(d.order_id),
    doan: [{ v: d.tong_vat, mau: mauKh.get(d.kh) ?? MAU_KHAC, tip: [`${d.order_no} ${d.kh.ten}`, `${soVN(d.tong_vat)} đ`] }],
  }));

  return (
    <div className="bd bckd-bd" onMouseLeave={() => setTip(null)}>
      <HangThe the={the} />

      <div className="bd-hang bckd-bd__hang--2">
        <Khoi tieu={`Chốt đơn theo ${don_vi}`} ph={`cột là tiền chốt trong ${don_vi}, đường là luỹ kế`}
          phai={<ChuGiai muc={[{ ten: `Chốt trong ${don_vi}`, mau: MAU.chot }, { ten: "Luỹ kế", mau: MAU.luyKe, duong: true }]} />}>
          <KhungCot h={260} nhan={o.map((c) => c.nhan)} gia={o.map((c) => c.v)} phai={{ gia: luyKe, mau: MAU.luyKe }}>
            {({ y, xGiua, cw, y2 }) => {
              const bw = Math.min(30, cw * 0.62);
              const diem = luyKe.map((v, i) => [xGiua(i), (y2 ?? y)(v)] as const);
              return (
                <>
                  {o.map((c, i) => c.v > 0 && (
                    <g key={c.khoa}>
                      <rect x={xGiua(i) - bw / 2} y={y(c.v)} width={bw} height={Math.max(1, y(0) - y(c.v))} rx={3} fill={MAU.chot}
                        className="bam" onClick={() => onKy(c.tu, c.den)}
                        {...rePhai(setTip, c.tipNhan, `${c.soDon} đơn ${soVN(c.v)} đ`)} />
                      {cw >= 26 && <text x={xGiua(i)} y={y(c.v) - 5} textAnchor="middle" className="bd-nhan-cot">{trieu(c.v)}</text>}
                    </g>
                  ))}
                  {diem.length > 1 && (
                    <polyline points={diem.map((p) => p.join(",")).join(" ")} fill="none" stroke={MAU.luyKe} strokeWidth={2} />
                  )}
                  {diem.map((p, i) => o[i].v > 0 && (
                    <circle key={i} cx={p[0]} cy={p[1]} r={4} fill="var(--canvas, #fff)" stroke={MAU.luyKe} strokeWidth={2}
                      {...rePhai(setTip, `Luỹ kế tới hết ${o[i].tipNhan.toLowerCase()}`, `${soVN(luyKe[i])} đ`)} />
                  ))}
                </>
              );
            }}
          </KhungCot>
        </Khoi>

        <Khoi tieu="Cơ cấu doanh số">
          <TabKhoi tab={[["khach", "Theo khách"], ["mh", "Theo mặt hàng"]]} dang={tab} onDoi={setTab} />
          {tongLat > 0 ? (
            <div className="bd-dn">
              <VongCoCau lat={lat} giua={`${trieu(tongLat)} tr`} nhan="có VAT" datTip={setTip} />
              <ChuGiaiVong lat={lat} />
            </div>
          ) : (
            <p className="bd-trong">Chưa có doanh số trong kỳ.</p>
          )}
        </Khoi>
      </div>

      <div className="bd-hang bckd-bd__hang--3">
        <Khoi tieu="Còn phải thu theo khách"
          ph={conThu.length > TOI_DA_LAT ? `${TOI_DA_LAT} khách còn phải thu nhiều nhất trong ${conThu.length}` : "đã thu và còn lại trên doanh số"}>
          {dongCon.length ? (
            <>
              <ThanhNgang dong={dongCon} thuoc={thuocCon} datTip={setTip} />
              <div className="bckd-bd__cg"><ChuGiai muc={[{ ten: "Đã thu", mau: MAU.thu }, { ten: "Còn phải thu", mau: MAU.con }]} /></div>
            </>
          ) : (
            <p className="bd-trong">Không khách nào còn phải thu.</p>
          )}
        </Khoi>
        <Khoi tieu="Đơn lớn nhất" ph="theo doanh số có VAT, bấm để xem ở dạng bảng">
          <ThanhNgang dong={dongDon} thuoc={donLon[0]?.tong_vat ?? 1} datTip={setTip} cotTen={230} />
        </Khoi>
      </div>

      <OTip tip={tip} />
    </div>
  );
}
