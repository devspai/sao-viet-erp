// Dạng "Biểu đồ" của Báo cáo công nợ — phương án A (12/10/2026) của
// docs/mockups/bao-cao-cong-no-bieu-do-3-phuong-an.html (theo ảnh Accounts Receivable Overview).
//
// Năm thẻ (còn nợ cuối kỳ, chưa tới hạn, quá hạn, tỷ lệ quá hạn, số đối tượng có quá hạn) → cột còn
// nợ theo sáu mốc hạn | vòng theo đối tượng hai tab Còn nợ | Quá hạn | cầu nối đầu kỳ tới cuối kỳ →
// cột ba màu tăng, giảm, còn nợ của từng đối tượng.
//
// Số tổng lấy từ dòng Cộng và tổng mốc hạn máy chủ cộng sẵn (mọi dòng khớp lọc). Các khối theo đối
// tượng dùng trang đầu máy chủ xếp theo còn nợ giảm dần (`sap_xep=con_no`, 10 dòng), phần còn lại
// gộp "Các đối tượng khác" = Cộng trừ 10 dòng đó. Máy chủ chỉ cộng cả kỳ, không chia tháng.
import { useState } from "react";

import type { BaoCaoCongNo, CongNoDong } from "../../../api/client";
import {
  ChuGiai, ChuGiaiVong, HangThe, KhungCot, Khoi, MAU_DT, MAU_KHAC, OTip, TabKhoi, VongCoCau,
  phanTram, rePhai, tenNgan, trieu, type Lat, type Tip,
} from "../../../components/BieuDo";
import { soVN } from "../../../components/LuoiDs";
import type { TabSo } from "./SoChiTietDrawer";
import { chieuDong } from "./shared/chieu";

/** Màu sáu mốc hạn theo thứ tự máy chủ trả: chưa tới hạn xanh lá, trễ dần vàng → cam → đỏ đậm. */
const MAU_HAN = ["#10b981", "#facc15", "#f59e0b", "#f97316", "#ef4444", "#991b1b"];
const MAU = { tang: "#8b5cf6", giam: "#2563eb", con: "#f97316", dau: "#94a3b8" };

/** Nhãn mốc dưới chân cột, hai dòng: "Chưa / tới hạn", "1–7 / ngày", "trên 60 / ngày". */
function nhanChan(i: number, label: string): [string, string] {
  if (i === 0) return ["Chưa", "tới hạn"];
  return [label.replace(/^Trễ\s*/i, "").replace(/\s*ngày$/i, "").replace(/^>\s*/, "trên "), "ngày"];
}

/** Nhãn chân cột theo đối tượng: tối đa 14 chữ, rê chuột ra tên đủ. */
const catTen = (t: string) => (t.length > 14 ? `${t.slice(0, 13)}…` : t);

export function BieuDoCongNo({ ben, data, chu, coLoc, onMoc, onMo, onCoQuaHan }: {
  ben: "receivables" | "payables";
  data: BaoCaoCongNo;
  chu: { doiTac: string; donVi: string; tang: string; giam: string };
  /** Đang có lọc dòng: số khoản của dải mốc (toàn màn) không còn khớp, thẻ đổi sang phần trăm. */
  coLoc: boolean;
  /** Sang Bảng, Lọc tuổi nợ đúng mốc này. */
  onMoc: (key: string) => void;
  onMo: (d: CongNoDong, tab: TabSo) => void;
  onCoQuaHan: () => void;
}) {
  const [tab, setTab] = useState<"con" | "qh">("con");
  const [tip, setTip] = useState<Tip>(null);

  const s = chieuDong(ben, data.tong);
  const moc = data.aging;
  const tien = (k: string) => data.tong_aging?.[k] ?? 0;
  const chuaHan = moc[0] ? tien(moc[0].key) : 0;
  const qh = moc.slice(1).reduce((a, b) => a + tien(b.key), 0);
  const soKhoan = (ds: typeof moc) => ds.reduce((a, b) => a + b.count, 0);
  const qhCua = (d: CongNoDong) => moc.slice(1).reduce((a, b) => a + (d.aging?.[b.key]?.amount ?? 0), 0);

  const the = [
    { nhan: "Còn nợ cuối kỳ", mau: MAU.con, so: soVN(s.cuoi), phu: `${soVN(data.total)} ${chu.donVi}` },
    { nhan: "Chưa tới hạn", mau: MAU_HAN[0], so: soVN(chuaHan),
      phu: coLoc ? `${phanTram(chuaHan, s.cuoi)}% còn nợ` : `${soVN(moc[0]?.count ?? 0)} khoản` },
    { nhan: "Quá hạn", mau: MAU_HAN[4], so: soVN(qh),
      phu: coLoc ? `${phanTram(qh, s.cuoi)}% còn nợ` : `${soVN(soKhoan(moc.slice(1)))} khoản` },
    { nhan: "Tỷ lệ quá hạn", mau: MAU_HAN[5], so: `${phanTram(qh, s.cuoi)}%`, phu: "trên còn nợ cuối kỳ" },
    { nhan: `${chu.doiTac} có quá hạn`, mau: MAU_HAN[2], so: `${soVN(data.dem_the?.qua_han ?? 0)} / ${soVN(data.dem_the?.all ?? 0)}`,
      phu: "bấm để lọc", onClick: onCoQuaHan },
  ];

  // Vòng theo đối tượng (10 đối tượng nợ nhiều nhất + "khác")
  const dong = data.items;
  const giaTri = (d: CongNoDong) => (tab === "con" ? chieuDong(ben, d).cuoi : qhCua(d));
  const lat: Lat[] = dong.map((d, i) => ({
    khoa: `${d.doi_tuong_id ?? "khac"}-${d.ten}`, ten: tenNgan(d.ten), tenDu: d.ten, v: giaTri(d), mau: MAU_DT[i % MAU_DT.length],
    onClick: () => onMo(d, tab === "qh" ? "dot" : "so"),
  })).filter((l) => l.v > 0);
  // Màu bám đối tượng (giữ nguyên khi đổi tab); tab Quá hạn xếp lại theo số quá hạn.
  if (tab === "qh") lat.sort((a, b) => b.v - a.v);
  const conLai = (tab === "con" ? s.cuoi : qh) - dong.reduce((a, d) => a + giaTri(d), 0);
  if (data.total > dong.length && conLai > 0.5) {
    lat.push({ khoa: "khac", ten: `Các ${chu.donVi} khác`, v: conLai, mau: MAU_KHAC });
  }
  const tongLat = lat.reduce((a, l) => a + l.v, 0);

  // Cầu nối: đầu kỳ + tăng − giảm = cuối kỳ (theo số đã trừ trả trước để cầu khép).
  const dau = s.dau - s.dauTruoc;
  const dinh = dau + s.tang;
  const cuoi = dinh - s.giam;
  const coTruoc = s.truoc > 0 || s.dauTruoc > 0;
  const cau: { ten: string; a: number; b: number; mau: string; so: string }[] = [
    { ten: "Đầu kỳ", a: 0, b: dau, mau: MAU.dau, so: trieu(dau) },
    { ten: chu.tang, a: dau, b: dinh, mau: MAU.tang, so: `+${trieu(s.tang)}` },
    { ten: chu.giam, a: cuoi, b: dinh, mau: MAU.giam, so: s.giam < 0 ? `+${trieu(-s.giam)}` : `−${trieu(s.giam)}` },
    { ten: "Cuối kỳ", a: 0, b: cuoi, mau: MAU.con, so: trieu(cuoi) },
  ];

  // Cột ba màu theo đối tượng
  const cotDt = dong.map((d) => ({ ten: d.ten, d, ...chieuDong(ben, d) }));
  if (data.total > dong.length) {
    const cong = (k: "tang" | "giam" | "cuoi") => cotDt.reduce((a, x) => a + x[k], 0);
    cotDt.push({ ten: `Các ${chu.donVi} khác`, d: null as unknown as CongNoDong, dau: 0, dauTruoc: 0, truoc: 0,
      tang: Math.max(0, s.tang - cong("tang")), giam: Math.max(0, s.giam - cong("giam")), cuoi: Math.max(0, s.cuoi - cong("cuoi")) });
  }
  const BA = [["tang", chu.tang, MAU.tang], ["giam", chu.giam, MAU.giam], ["cuoi", "Còn nợ", MAU.con]] as const;

  return (
    <div className="bd bccn-bd" onMouseLeave={() => setTip(null)}>
      <HangThe the={the} />

      <div className="bd-hang bccn-bd__hang--2">
        <Khoi tieu="Còn nợ chia theo hạn" ph="số ngày trễ, bấm cột để lọc bảng">
          <KhungCot h={250} chanHaiDong nhan={moc.map((b, i) => nhanChan(i, b.label))} gia={moc.map((b) => tien(b.key))}>
            {({ y, xGiua, cw }) => {
              const bw = Math.min(46, cw * 0.6);
              return moc.map((b, i) => {
                const v = tien(b.key);
                return (
                  <g key={b.key}>
                    <rect x={xGiua(i) - bw / 2} y={y(v)} width={bw} height={Math.max(v ? 2 : 0, y(0) - y(v))} rx={3}
                      fill={MAU_HAN[i] ?? MAU_KHAC} className="bam" onClick={() => onMoc(b.key)}
                      {...rePhai(setTip, b.label, `${soVN(v)} đ`, ...(coLoc ? [] : [`${soVN(b.count)} khoản`]))} />
                    {v > 0 && <text x={xGiua(i)} y={y(v) - 5} textAnchor="middle" className="bd-nhan-cot">{trieu(v)}</text>}
                  </g>
                );
              });
            }}
          </KhungCot>
        </Khoi>

        <Khoi tieu={`Theo ${chu.donVi}`} ph={data.total > dong.length ? `${dong.length} ${chu.donVi} nợ nhiều nhất` : undefined}>
          <TabKhoi tab={[["con", "Còn nợ"], ["qh", "Quá hạn"]]} dang={tab} onDoi={setTab} />
          {tongLat > 0 ? (
            <div className="bd-dn">
              <VongCoCau lat={lat} giua={`${trieu(tongLat)} tr`} nhan={tab === "con" ? "còn nợ" : "quá hạn"} datTip={setTip} size={170} />
              <ChuGiaiVong lat={lat} />
            </div>
          ) : (
            <p className="bd-trong">{tab === "con" ? `Không ${chu.donVi} nào còn nợ.` : `Không ${chu.donVi} nào quá hạn.`}</p>
          )}
        </Khoi>

        <Khoi tieu="Từ đầu kỳ tới cuối kỳ" ph={coTruoc ? "đã trừ số trả trước" : undefined}>
          <KhungCot h={250} nhan={cau.map((c) => c.ten)} gia={[dau, dinh, cuoi, 0]}>
            {({ y, xGiua, cw }) => {
              const bw = Math.min(56, cw * 0.56);
              return cau.map((c, i) => {
                const tren = Math.max(c.a, c.b), duoi = Math.min(c.a, c.b);
                return (
                  <g key={c.ten}>
                    <rect x={xGiua(i) - bw / 2} y={y(tren)} width={bw} height={Math.max(1, y(duoi) - y(tren))} rx={3} fill={c.mau}
                      {...rePhai(setTip, c.ten, `${i === 2 ? "−" : ""}${soVN(Math.abs(c.b - c.a))} đ`)} />
                    <text x={xGiua(i)} y={y(tren) - 5} textAnchor="middle" className="bd-nhan-cot">{c.so}</text>
                    {i < 3 && (
                      <line x1={xGiua(i) + bw / 2} x2={xGiua(i + 1) - bw / 2} y1={y(i === 2 ? cuoi : c.b)} y2={y(i === 2 ? cuoi : c.b)}
                        stroke="var(--ash-3)" strokeDasharray="3 3" />
                    )}
                  </g>
                );
              });
            }}
          </KhungCot>
        </Khoi>
      </div>

      <Khoi tieu={`${chu.tang}, ${chu.giam.toLowerCase()} và còn nợ theo ${chu.donVi}`}
        ph={data.total > dong.length ? `${dong.length} ${chu.donVi} nợ nhiều nhất` : undefined}
        phai={<ChuGiai muc={BA.map(([, ten, mau]) => ({ ten, mau }))} />}>
        <KhungCot h={220} nhan={cotDt.map((x) => catTen(tenNgan(x.ten)))} gia={cotDt.flatMap((x) => [x.tang, x.giam, x.cuoi])}>
          {({ y, xGiua, cw }) => {
            const bw = Math.min(30, (cw * 0.7) / 3);
            return cotDt.map((x, i) => (
              <g key={`${x.ten}-${i}`}>
                {BA.map(([k, ten, mau], j) => (
                  <rect key={k} x={xGiua(i) - bw * 1.5 + j * bw + 1} y={Math.min(y(0), y(x[k]))} width={bw - 2} height={Math.max(x[k] ? 1 : 0, Math.abs(y(0) - y(x[k])))}
                    rx={2} fill={mau} className={x.d ? "bam" : undefined} onClick={x.d ? () => onMo(x.d, "so") : undefined}
                    {...rePhai(setTip, x.ten, `${ten} ${soVN(x[k])} đ`)} />
                ))}
              </g>
            ));
          }}
        </KhungCot>
      </Khoi>

      <OTip tip={tip} />
    </div>
  );
}
