// TAB "SẢN LƯỢNG" của bàn tổ (spec 2026-09-14 §6, sửa 2026-09-18 §7.3b).
//
// Trả lời "từ ngày này tới ngày kia, tổ (và các tổ trực thuộc) làm ra bao nhiêu, cho lệnh nào, ai có
// mặt". Mẻ có MỘT chủ (tổ của bước) nên bảng chia hai mục:
//   · MẺ CỦA TỔ — cộng vào dòng tổng;
//   · NGƯỜI CỦA TỔ ĐI LÀM Ở TỔ KHÁC — cùng con số của mẻ, KHÔNG cộng tổng (đếm hai lượt là sai
//     sản lượng xưởng).
// Mỗi mục là MỘT bảng phẳng, mỗi dòng một mẻ: lệnh · tổ · công đoạn · mẻ · công việc · số lượng ·
// người tham gia (19/09/2026 — bỏ kiểu bấm mở ba tầng LỆNH → CÔNG ĐOẠN → MẺ). Không chia ai
// được bao nhiêu, không số phút, không tiền — "ghi nhận thế thôi, đừng có chia bất cứ gì".
//
// Mọi thứ lọc · cắt trang · cộng tổng Ở MÁY CHỦ. Ngày là ngày BẮT ĐẦU mẻ theo giờ xưởng. Số luôn đi
// theo ĐƠN VỊ — không cộng tờ với cái.
import { useEffect, useMemo, useState } from "react";
import {
  ApiError, api,
  type SxSanLuongTo, type SxSlCongDoan, type SxSlKho, type SxSlLenh, type SxSlMe, type SxSlPhatSinh,
} from "../api/client";
import { useAuth } from "../auth/useAuth";
import { Icon } from "../components/Icons";
import { PhanTrangDayDu } from "../components/PhanTrangDayDu";
import {
  ChonCot, CuonLuoi, OTim, rongLuoi, soCotGhim, useCotAn, useThuTuCot, xepCot, type CotLuoi,
} from "../components/LuoiDs";
import { useDebounced } from "../utils/useDebounced";
import { EmptyState as EmptyStateChung } from "../components/EmptyState";
import { BangLoi, EmptyState, gioNgan, ngay, num } from "./keHoachSxShared";
import { nhanDonVi } from "./lsxBuoc";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dauThang(d: Date): string {
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function dv(ma: string | null | undefined): string {
  return ma ? ` ${nhanDonVi(ma)}` : "";
}

function khoaLenh(l: SxSlLenh): string {
  return `${l.nguon_loai}:${l.nguon_id ?? "-"}`;
}

type Muc = "chu" | "khach";

/** Tách công đoạn của từng lệnh theo mục; lệnh không còn công đoạn nào ở mục đó thì bỏ. */
function theoMuc(lenh: SxSlLenh[], muc: Muc): { l: SxSlLenh; cds: SxSlCongDoan[] }[] {
  return lenh
    .map((l) => ({ l, cds: l.cong_doan.filter((c) => c.la_khach === (muc === "khach")) }))
    .filter((x) => x.cds.length > 0);
}

/** Màn điện thoại (≤640px) ⇒ bảng 8 cột đổi sang THẺ mỗi lệnh một thẻ. Chỉ vẽ MỘT bố cục, không
 *  vẽ cả hai rồi ẩn bằng CSS (chữ nhân đôi, test bắt trùng). jsdom không có matchMedia ⇒ coi là rộng. */
function useManDienThoai(): boolean {
  const truyVan = "(max-width: 640px)";
  const coMq = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [hep, setHep] = useState(() => coMq && window.matchMedia(truyVan).matches);
  useEffect(() => {
    if (!coMq) return;
    const mq = window.matchMedia(truyVan);
    const doi = () => setHep(mq.matches);
    doi();
    mq.addEventListener("change", doi);
    return () => mq.removeEventListener("change", doi);
  }, [coMq]);
  return hep;
}

/** "01/09 → 19/09" — tóm tắt khoảng ngày cho nút Lọc đang thu gọn. */
function ngayNgan(v: string): string {
  return v ? `${v.slice(8, 10)}/${v.slice(5, 7)}` : "…";
}

/** Tổng số làm được theo công đoạn (gộp các lần chạy cùng tên + cùng đơn vị), giữ thứ tự bảng. */
function gomTheoCd(cds: SxSlCongDoan[]): { khoa: string; ten: string; tot: number }[] {
  const m = new Map<string, { khoa: string; ten: string; tot: number }>();
  for (const c of cds) {
    for (const s of c.san_luong) {
      const khoa = `${c.ten_cong_doan}|${s.don_vi ?? ""}`;
      const x = m.get(khoa) ?? { khoa, ten: c.ten_cong_doan || "—", tot: 0 };
      x.tot += s.tot;
      m.set(khoa, x);
    }
  }
  return [...m.values()];
}

function ngayDu(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Ngày đủ dd/mm/yyyy + khung giờ. Mẻ vắt qua ngày khác thì giờ kết thúc kèm luôn ngày của nó. */
function khungMe(m: SxSlMe): { ngay: string; gio: string | null } {
  // `ngay` là "YYYY-MM-DD" theo giờ xưởng — cắt thẳng ra, khỏi qua Date (lệch múi).
  const d = m.ngay ? `${m.ngay.slice(8, 10)}/${m.ngay.slice(5, 7)}/${m.ngay.slice(0, 4)}` : "—";
  if (!m.bat_dau) return { ngay: d, gio: null };
  const kt = m.ket_thuc ? new Date(m.ket_thuc) : null;
  const ktNgay = kt && !Number.isNaN(kt.getTime()) ? ngayDu(kt) : null;
  const duoi = !m.ket_thuc ? ""
    : ktNgay && ktNgay !== d ? ` → ${gioNgan(m.ket_thuc)} ${ktNgay}` : `–${gioNgan(m.ket_thuc)}`;
  return { ngay: d, gio: `${gioNgan(m.bat_dau)}${duoi}` };
}

/** mm → cm, số lẻ một chữ (78,5) — đúng cách xưởng ghi quy cách. */
function cm(mm: number): string {
  return (Math.round(mm) / 10).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

/** Giấy + ba khổ của lệnh: tên giấy + định lượng, rồi mỗi khổ một dòng "nhãn … dài × rộng" (cm). */
function QuyCachLenh({ qc }: { qc: SxSlLenh["quy_cach"] }) {
  if (!qc) return <span className="thsx-sl__trong">Chưa có quy cách</span>;
  const kho: [string, SxSlKho | null][] = [
    ["Tờ nguyên", qc.to_nguyen], ["Tờ in", qc.to_in], ["Con", qc.con],
  ];
  return (
    <div className="thsx-sl__qc">
      <div className="thsx-sl__qc-giay">
        <b>{qc.giay || "Chưa khai giấy"}</b>
        {qc.dinh_luong ? <span className="thsx-sl__qc-gsm thsx-num">{num(qc.dinh_luong)} gsm</span> : null}
      </div>
      <dl className="thsx-sl__qc-kho" aria-label="Quy cách dài × rộng, đơn vị cm">
        {kho.map(([nhan, k]) => (
          <div key={nhan}>
            <dt>{nhan}</dt>
            <dd className="thsx-num">{k ? <>{cm(k.dai)}<i>×</i>{cm(k.rong)}</> : "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Việc phát sinh của mẻ — khối riêng dưới tên việc khoán, KHÔNG cộng vào cột Số lượng. */
function PhatSinhMe({ ds }: { ds: SxSlMe["phat_sinh"] }) {
  if (!ds?.length) return null;
  return (
    <div className="thsx-sl__ps" title="Việc phát sinh — không cộng vào sản lượng">
      <span className="thsx-sl__ps-tieu">Phát sinh</span>
      <ul>
        {ds.map((p, i) => (
          <li key={i}>
            <span className="thsx-sl__ps-ten">{p.ten || "—"}</span>
            <span className="thsx-sl__ps-so">
              <b className="thsx-num">{num(p.so_luong)}</b>
              {p.don_vi_ten || p.don_vi ? ` ${p.don_vi_ten || p.don_vi}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mỗi người một dòng — tên tổ khách ghi nhỏ bên cạnh. */
function NguoiMe({ ds }: { ds: SxSlMe["nguoi"] }) {
  if (ds.length === 0) return <span className="thsx-sl__trong">Chưa ai vào mẻ</span>;
  return (
    <ul className="thsx-sl__ds-nguoi">
      {ds.map((n) => (
        <li key={n.employee_id}>
          {n.ho_ten}
          {n.to_ten && <span className="thsx-sl__to">{n.to_ten}</span>}
        </li>
      ))}
    </ul>
  );
}

interface CotSl extends CotLuoi { w?: number; n?: boolean }

/** Cột lưới sản lượng. Thứ tự: Lệnh → Ngày → Nội dung (tên, giấy, khổ) → Tổ, công đoạn, việc →
 *  Số lượng → Người. Lệnh và quy cách lặp lại ở mỗi dòng mẻ (lưới phẳng, không gộp ô). Số lượng là
 *  coDinh: dòng Cộng đặt số ở đúng cột này, ẩn cột thì dòng Cộng mất số. */
const COT_SL: CotSl[] = [
  { key: "lenh", label: "Lệnh sản xuất", coDinh: true, w: 130 },
  { key: "ngay", label: "Ngày làm", w: 104 },
  { key: "gio", label: "Giờ làm", w: 130 },
  { key: "ten", label: "Tên lệnh", w: 190 },
  { key: "giay", label: "Giấy", w: 170 },
  { key: "kn", label: "Khổ tờ nguyên (cm)", w: 135 },
  { key: "ki", label: "Khổ tờ in (cm)", w: 120 },
  { key: "kc", label: "Khổ con (cm)", w: 110 },
  { key: "to", label: "Tổ", w: 130 },
  { key: "cd", label: "Công đoạn", w: 150 },
  { key: "viec", label: "Công việc", w: 190 },
  { key: "ps", label: "Phát sinh", w: 170 },
  { key: "sl", label: "Số lượng", coDinh: true, w: 100, n: true },
  { key: "nguoi", label: "Người tham gia" },
];

function OSl({
  cot, l, c, m,
}: { cot: string; l: SxSlLenh; c: SxSlCongDoan; m: SxSlMe | null }) {
  const kho = (k: SxSlKho | null | undefined) =>
    k ? <td className="n">{cm(k.dai)}×{cm(k.rong)}</td> : <td className="n lds-mu3">—</td>;
  const trong = <td className="lds-mu3">—</td>;
  switch (cot) {
    case "lenh":
      return (
        <td title={l.ten || undefined}>
          {l.ma || "—"}
          {l.nguon_loai === "bai_ghep" && <span className="lds-tag">Bài ghép</span>}
        </td>
      );
    case "ngay":
      return m ? <td>{khungMe(m).ngay}</td> : trong;
    case "gio": {
      const g = m ? khungMe(m).gio : null;
      return g ? <td>{g}</td> : trong;
    }
    case "ten":
      return l.ten ? <td title={l.ten}>{l.ten}</td> : trong;
    case "giay": {
      const qc = l.quy_cach;
      if (!qc) return <td className="lds-mu3">Chưa có quy cách</td>;
      const ten = qc.giay || "Chưa khai giấy";
      return (
        <td title={`${ten}${qc.dinh_luong ? ` ${num(qc.dinh_luong)} gsm` : ""}`}>
          {qc.giay ? ten : <span className="lds-vang">{ten}</span>}
          {qc.dinh_luong ? <span className="lds-u">{num(qc.dinh_luong)} gsm</span> : null}
        </td>
      );
    }
    case "kn":
      return kho(l.quy_cach?.to_nguyen);
    case "ki":
      return kho(l.quy_cach?.to_in);
    case "kc":
      return kho(l.quy_cach?.con);
    case "to":
      return <td title={c.to_ten || undefined}>{c.to_ten || "—"}</td>;
    case "cd":
      return <td title={c.ten_cong_doan || undefined}>{c.ten_cong_doan || "—"}</td>;
    case "viec":
      if (!m) return trong;
      return m.viec_khoan_ten
        ? <td title={m.viec_khoan_ten}>{m.viec_khoan_ten}</td>
        : <td><span className="lds-vang">Chưa khai việc khoán</span></td>;
    case "ps": {
      const ds = m?.phat_sinh;
      if (!ds?.length) return trong;
      const chu = (p: SxSlPhatSinh) =>
        `${p.ten || "—"} ${num(p.so_luong)}${p.don_vi_ten || p.don_vi ? ` ${p.don_vi_ten || p.don_vi}` : ""}`;
      return (
        <td title={`Việc phát sinh, không cộng vào sản lượng\n${ds.map(chu).join("\n")}`}>
          {ds.map((p, i) => <span key={i} className="lds-tag" style={i === 0 ? { marginLeft: 0 } : undefined}>{chu(p)}</span>)}
        </td>
      );
    }
    case "sl":
      return m ? <td className="n">{num(m.tot)}</td> : <td className="n lds-mu3">—</td>;
    case "nguoi": {
      if (!m) return trong;
      if (m.nguoi.length === 0) return <td className="lds-mu3">Chưa ai vào mẻ</td>;
      return (
        <td title={m.nguoi.map((n) => `${n.ho_ten}${n.to_ten ? ` (${n.to_ten})` : ""}`).join("\n")}>
          {m.nguoi.map((n, i) => (
            <span key={n.employee_id} className="lds-tag" style={i === 0 ? { marginLeft: 0 } : undefined}>
              {n.ho_ten}
              {n.to_ten && <span className="lds-u lds-cam">{n.to_ten}</span>}
            </span>
          ))}
        </td>
      );
    }
    default:
      return <td />;
  }
}

/** Lưới PHẲNG, mỗi dòng MỘT mẻ (lệnh và quy cách lặp lại ở mỗi dòng). Sau các dòng mẻ của một lệnh
 *  là dòng Cộng của lệnh đó — mỗi công đoạn một dòng, vì các bước khác đơn vị (tờ, con, cái) nên cộng
 *  chung một số là sai; tên công đoạn đã nói số nào của ai. */
function BangMuc({
  muc, ds, cot,
}: { muc: Muc; ds: { l: SxSlLenh; cds: SxSlCongDoan[] }[]; cot: CotSl[] }) {
  const viTriSl = cot.findIndex((c) => c.key === "sl");
  return (
    <div className="lds-sheet">
      <CuonLuoi ghim={soCotGhim(cot)}>
        <table className="lds-g" style={{ minWidth: rongLuoi(cot) }}>
          <colgroup>
            {cot.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
          </colgroup>
          <thead>
            <tr>
              {cot.map((c) => (
                <th key={c.key} className={c.n ? "n" : undefined}>
                  {c.key === "to" && muc === "khach" ? "Tổ chủ mẻ" : c.label}
                </th>
              ))}
            </tr>
          </thead>
          {ds.map(({ l, cds }) => {
            // Công đoạn không có mẻ trên trang vẫn chiếm một dòng để không mất khỏi bảng.
            const dongCd = cds.map((c) => ({ c, me: c.me.length ? c.me : [null] }));
            const congCd = gomTheoCd(cds);
            const soMe = cds.reduce((a, c) => a + c.so_me, 0);
            const dongCong: ((typeof congCd)[number] | null)[] = congCd.length ? congCd : [null];
            return (
              <tbody key={`${muc}:${khoaLenh(l)}`}>
                {dongCd.map(({ c, me }) =>
                  me.map((m) => (
                    <tr key={`${c.cong_viec_id}:${m?.batch_id ?? "trong"}`} className="lds-dong">
                      {cot.map((k) => <OSl key={k.key} cot={k.key} l={l} c={c} m={m} />)}
                    </tr>
                  )),
                )}
                {dongCong.map((x, i) => {
                  const lead = (
                    <>
                      Cộng {l.ma || "lệnh"}{x && congCd.length > 1 ? ` ${x.ten}` : ""}
                      {i === 0 && <span className="lds-u">{soMe} mẻ</span>}
                      {i === 0 && muc === "khach" && <span className="lds-u">không cộng vào tổng của tổ</span>}
                    </>
                  );
                  return (
                    <tr key={x?.khoa ?? "trong"} className="lds-cong lds-nhom">
                      <td className="lead" colSpan={viTriSl}><span className="lds-dinh-trai">{lead}</span></td>
                      <td className="n">{x ? num(x.tot) : <span className="lds-mu3">—</span>}</td>
                      {cot.length - viTriSl - 1 > 0 ? <td colSpan={cot.length - viTriSl - 1} /> : null}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </CuonLuoi>
    </div>
  );
}

/** Điện thoại: mỗi lệnh MỘT thẻ — đầu thẻ là mã + quy cách, rồi từng công đoạn, mỗi mẻ một khối
 *  "ngày giờ … số lớn" + việc + người. Cùng dữ liệu, cùng cách cộng với bảng — chỉ đổi hình. */
function TheMuc({ muc, ds }: { muc: Muc; ds: { l: SxSlLenh; cds: SxSlCongDoan[] }[] }) {
  return (
    <div className="thsx-sl__the-ds">
      {ds.map(({ l, cds }) => {
        const congCd = gomTheoCd(cds);
        const soMe = cds.reduce((a, c) => a + c.so_me, 0);
        return (
          <article key={`${muc}:${khoaLenh(l)}`} className="thsx-sl__the">
            <header className="thsx-sl__the-dau">
              <b className="thsx-num">{l.ma || "—"}</b>
              {l.nguon_loai === "bai_ghep" && <span className="thsx-sl__nhan">Bài ghép</span>}
              {l.ten && <span className="thsx-sl__the-ten">{l.ten}</span>}
            </header>
            <div className="thsx-sl__the-qc"><QuyCachLenh qc={l.quy_cach} /></div>
            {cds.map((c) => (
              <section key={c.cong_viec_id} className="thsx-sl__the-cd">
                <h4>
                  <span>{c.ten_cong_doan || "—"}</span>
                  {c.to_ten && <span className="thsx-sl__the-to">{c.to_ten}</span>}
                </h4>
                {c.me.length === 0 ? (
                  <p className="thsx-sl__trong thsx-sl__the-trong">Không có mẻ trong khoảng này</p>
                ) : (
                  <ul className="thsx-sl__the-me">
                    {c.me.map((m) => {
                      const k = khungMe(m);
                      return (
                        <li key={m.batch_id}>
                          <div className="thsx-sl__the-me-dau">
                            <span className="thsx-num">
                              {k.ngay}
                              {k.gio && <span className="thsx-sl__phu-dong">{k.gio}</span>}
                            </span>
                            <b className="thsx-num thsx-sl__the-so">{num(m.tot)}</b>
                          </div>
                          <div className="thsx-sl__the-viec">
                            {m.viec_khoan_ten ?? <span className="thsx-sl__canh">Chưa khai việc khoán</span>}
                          </div>
                          <PhatSinhMe ds={m.phat_sinh} />
                          <NguoiMe ds={m.nguoi} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
            <footer className="thsx-sl__the-cong">
              <span className="thsx-sl__the-cong-nhan">
                Cộng <span className="lds-u">{soMe} mẻ</span>
                {muc === "khach" && <span className="thsx-sl__trong thsx-sl__the-cong-ghi">không cộng vào tổng của tổ</span>}
              </span>
              {congCd.map((x) => (
                <span key={x.khoa} className="thsx-sl__the-cong-cd">
                  {x.ten} <b className="thsx-num">{num(x.tot)}</b>
                </span>
              ))}
            </footer>
          </article>
        );
      })}
    </div>
  );
}

export function ThsxSanLuongTab({ teamId, eventTick }: { teamId: number; eventTick?: number }) {
  const { token } = useAuth();
  const [tu, setTu] = useState(() => dauThang(new Date()));
  const [den, setDen] = useState(() => ymd(new Date()));
  const [toId, setToId] = useState<number | null>(null);
  const [tim, setTim] = useState("");
  const timD = useDebounced(tim, 250);
  const [trang, setTrang] = useState(1);
  const [coTrang, setCoTrang] = useState(25); // lệnh / trang; máy chủ nhận tối đa 100
  const [data, setData] = useState<SxSanLuongTo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dangNap, setDangNap] = useState(false);
  const [lanNap, setLanNap] = useState(0); // bấm "Tải lại"
  const hep = useManDienThoai();
  // Điện thoại: ngày + đơn vị THU vào nút "Lọc" — bày hết ra thì bảng chỉ còn 1/4 màn hình.
  const [moLoc, setMoLoc] = useState(false);
  // Cột của lưới: ẩn / đổi chỗ nhớ theo máy người xem; hai lưới (của tổ, tổ khác) dùng chung.
  const [cotAn, setCotAn] = useCotAn("thsx-sl");
  const [thuTuCot, setThuTuCot] = useThuTuCot("thsx-sl");
  const cotHien = xepCot(COT_SL, thuTuCot).filter((c) => !cotAn.has(c.key));

  const ngaySai = !!tu && !!den && tu > den;

  // Đổi bàn ⇒ ô Đơn vị của bàn cũ không còn nghĩa.
  useEffect(() => { setToId(null); }, [teamId]);
  // Đổi bộ lọc ⇒ về trang 1. SSE (`eventTick`) thì GIỮ trang đang đứng.
  useEffect(() => { setTrang(1); }, [teamId, tu, den, toId, timD]);

  useEffect(() => {
    if (!token || ngaySai || !tu || !den) return;
    let huy = false;
    setDangNap(true);
    api.sanXuat.sanLuongTo(token, {
      team_id: teamId, tu, den, to_id: toId, tim: timD, trang, co_trang: coTrang,
    })
      .then((r) => { if (!huy) { setData(r); setErr(null); } })
      .catch((e: unknown) => {
        if (huy) return;
        setErr(e instanceof ApiError
          ? (e.isForbidden ? "Đơn vị này ngoài phạm vi của bạn." : e.message)
          : String(e));
      })
      .finally(() => { if (!huy) setDangNap(false); });
    return () => { huy = true; };
  }, [token, teamId, tu, den, toId, timD, trang, coTrang, ngaySai, eventTick, lanNap]);

  const capGoc = useMemo(() => {
    const cap = (data?.cac_to ?? []).map((t) => t.cap);
    return cap.length ? Math.min(...cap) : 0;
  }, [data?.cac_to]);
  const tron = !!data?.co_pham_vi_tron;
  const dsChu = useMemo(() => theoMuc(data?.lenh ?? [], "chu"), [data?.lenh]);
  const dsKhach = useMemo(() => theoMuc(data?.lenh ?? [], "khach"), [data?.lenh]);
  const tenTo = toId == null ? "Cả bàn này" : (data?.cac_to ?? []).find((t) => t.id === toId)?.ten ?? "Một tổ";
  const veMuc = (muc: Muc, ds: { l: SxSlLenh; cds: SxSlCongDoan[] }[]) =>
    hep ? <TheMuc muc={muc} ds={ds} /> : <BangMuc muc={muc} ds={ds} cot={cotHien} />;
  // Điện thoại giữ ô tìm cũ (thanh dính trên đầu); máy bàn dùng ô tìm của khuôn lưới.
  const oTimHep = (
    <div className="thsx-search">
      <Icon name="search" size={15} className="thsx-search__ic" />
      <input type="search" className="thsx-search__in" value={tim}
        onChange={(e) => setTim(e.target.value)}
        placeholder="Tìm mã / tên lệnh…" aria-label="Tìm lệnh" />
      {tim && (
        <button type="button" className="thsx-search__clear" aria-label="Xoá tìm" onClick={() => setTim("")}>
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
  const truongLoc = (
    <>
      <label className="thsx-sl__f">
        <span>Từ ngày</span>
        <input type="date" value={tu} max={den || undefined} min="2000-01-01"
          onChange={(e) => setTu(e.target.value)} />
      </label>
      <label className="thsx-sl__f">
        <span>Đến ngày</span>
        <input type="date" value={den} min={tu || undefined} max="2200-12-31"
          onChange={(e) => setDen(e.target.value)} />
      </label>
      <button type="button" className="thsx-trang__nut"
        onClick={() => { const nay = new Date(); setTu(dauThang(nay)); setDen(ymd(nay)); }}>
        Tháng này
      </button>
      <label className="thsx-sl__f">
        <span>Đơn vị</span>
        <select value={toId ?? ""} onChange={(e) => setToId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Cả bàn này</option>
          {(data?.cac_to ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {"   ".repeat(Math.max(0, t.cap - capGoc))}{t.ten}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  return (
    <section className={`thsx-sl${hep ? " thsx-sl--hep" : " lds"}`} aria-label="Sản lượng của tổ">
      {hep ? (
        <>
          <div className="thsx-subbar thsx-sl__loc-gon">
            {oTimHep}
            <button type="button" className={`thsx-sl__nut-loc${moLoc ? " is-mo" : ""}`}
              aria-expanded={moLoc} onClick={() => setMoLoc((v) => !v)}>
              <Icon name="calendar" size={14} />
              <span className="thsx-num">{ngayNgan(tu)} → {ngayNgan(den)}</span>
              {toId != null && <span className="thsx-sl__nut-loc-to" title={tenTo}>{tenTo}</span>}
              <Icon name="chevron" size={13} className="thsx-sl__nut-loc-mui" />
            </button>
          </div>
          {moLoc && <div className="thsx-subbar thsx-sl__loc">{truongLoc}</div>}
        </>
      ) : (
        <section className="lds-loc">
          <div className="lds-loc__thanh tl-thanh" role="search">
            <OTim value={tim} onChange={setTim} placeholder="Tìm mã / tên lệnh…" ariaLabel="Tìm lệnh" />
            {truongLoc}
            <ChonCot cot={COT_SL} an={cotAn} onAn={setCotAn} thuTu={thuTuCot} onThuTu={setThuTuCot} />
          </div>
        </section>
      )}

      {data && !ngaySai && (
        <div className="thsx-sl__tong" aria-label="Tổng theo bộ lọc">
          {tron ? (data.tong.length === 0 ? (
            <span className="thsx-sl__trong">Tổ không có mẻ nào trong khoảng này.</span>
          ) : (
            // MỘT dòng cho cả tổ — mỗi đơn vị một cụm số (tờ không cộng với cái), số mẻ cộng chung
            // ở cuối. Trước đây mỗi đơn vị một dòng "Mẻ của tổ · làm được…" lặp lại, chiếm nửa màn điện thoại.
            <p className="thsx-sl__tong-dong">
              <span className="thsx-sl__tong-nhan">Tổ làm được</span>
              {data.tong.map((t) => (
                <span key={t.don_vi ?? "—"} className="thsx-sl__chip">
                  <b className="thsx-num">{num(t.tot)}</b>{dv(t.don_vi)}
                  {t.hong > 0 && <span className="thsx-sl__hong-cum"> (hỏng <b className="thsx-num">{num(t.hong)}</b>)</span>}
                </span>
              ))}
              <span className="thsx-sl__phu">
                {num(data.tong.reduce((a, t) => a + t.so_me, 0))} mẻ
              </span>
            </p>
          )) : (
            // Quyền chỉ "Của tôi": không có tổng của tổ — thấy đúng các mẻ mình có mặt (§12.3).
            <span className="thsx-sl__phu">Bạn thấy các mẻ mình có mặt — không có dòng tổng của tổ.</span>
          )}
          {dangNap && <span className="thsx-sl__phu">Đang cập nhật…</span>}
        </div>
      )}

      <div className="thsx-ds__scroll">
        {ngaySai ? (
          <BangLoi text="Từ ngày phải trước hoặc bằng đến ngày." />
        ) : err ? (
          <BangLoi text={err} onRetry={() => setLanNap((n) => n + 1)} />
        ) : data == null ? (
          <EmptyStateChung trangThai="dang-tai" inline nhanTai="Đang nạp…" />
        ) : data.lenh.length === 0 ? (
          <EmptyState icon={timD ? "search" : "clipboard"}
            title={timD ? "Không có lệnh khớp tìm kiếm" : "Chưa có sản lượng"}
            sub={`Không có mẻ nào bắt đầu từ ${ngay(data.tu)} đến ${ngay(data.den)} trong phạm vi của bạn.`} />
        ) : (
          <>
            <h3 className="thsx-sl__muc">Mẻ của tổ</h3>
            {dsChu.length === 0
              ? <p className="thsx-sl__trong thsx-sl__muc-trong">Trang này không có mẻ nào của tổ.</p>
              : veMuc("chu", dsChu)}
            {dsKhach.length > 0 && (
              <>
                <h3 className="thsx-sl__muc thsx-sl__muc--khach">
                  Người của tổ đi làm ở tổ khác <span className="thsx-sl__muc-phu">— không cộng vào tổng</span>
                </h3>
                {veMuc("khach", dsKhach)}
              </>
            )}
          </>
        )}
      </div>
      {/* Chân phân trang theo LỆNH (máy chủ cắt trang), nằm sau các lưới của trang. */}
      {data && !ngaySai && !err && data.tong_lenh > 0 && (
        <div className={hep ? undefined : "lds-sheet"}>
          <PhanTrangDayDu trang={trang} size={coTrang} tong={data.tong_lenh} soDong={data.lenh.length}
            onTrang={setTrang} onSize={(n) => { setCoTrang(n); setTrang(1); }} loading={dangNap}
            donVi="lệnh" ariaLabel="Phân trang sản lượng theo lệnh" />
        </div>
      )}
    </section>
  );
}
