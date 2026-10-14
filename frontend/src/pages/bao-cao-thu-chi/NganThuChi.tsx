// NGĂN PHIẾU của MỘT dòng Báo cáo thu chi (một mục, hoặc một người nhận / người nộp).
//
// Đầu ngăn: dải số từng cột kỳ nối bằng "+" rồi "= Cả kỳ" — đọc một hàng là thấy con số ở bảng từ
// đâu ra; bấm một ô để chỉ xem phiếu của cột đó, bấm "Cả kỳ" bỏ lọc. Hai tab:
//   - Phiếu: từng phiếu (mới nhất lên đầu, máy chủ sắp), số phiếu bấm sang màn phiếu chi / phiếu thu.
//   - Người nhận / Người nộp (xem theo người thì là Mục): gom các phiếu đang lọc, tiền giảm dần.
// Người có quyền Thao tác của báo cáo (xem theo mục) chuyển được phiếu đã tích sang mục khác cùng loại.
import { ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  api,
  type CotKyThuChi,
  type DongThuChi,
  type LocBaoCaoThuChi,
  type MucThuChi,
  type PhieuCuaDongThuChi,
  type PhieuThuChi,
} from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { useCan } from "../../auth/permissions";
import type { NavigateFn } from "../../components/AppShell";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ChipTT, soVN } from "../../components/LuoiDs";
import { ngayDeDoc } from "../../utils/ky";
import { NganPhai } from "../ke-toan/shared/NganPhai";

/** Dòng đang mở + phần lọc sẵn khi mở từ một ô số của bảng. */
export type MoNgan = { dong: DongThuChi; cot: string | null };

type TabNgan = "phieu" | "nhom";

const HINH_THUC: Record<string, string> = { cash: "Tiền mặt", bank_transfer: "Chuyển khoản" };

export function NganThuChi({
  mo,
  theo,
  loc,
  cotKy,
  mucThu,
  mucChi,
  coChuyen,
  onClose,
  len,
  xuong,
  onDaChuyen,
  navigate,
}: {
  mo: MoNgan;
  theo: "muc" | "nguoi";
  /** Kỳ + Lọc đang áp ở bảng — ngăn đọc đúng tập phiếu làm ra con số của dòng. */
  loc: LocBaoCaoThuChi;
  /** Cột kỳ của bảng — để dải số hiện ngay lúc ngăn còn đang tải. */
  cotKy: CotKyThuChi[];
  mucThu: MucThuChi[];
  mucChi: MucThuChi[];
  /** Có nút "Chuyển sang mục…" (quyền Thao tác + đang xem theo mục). */
  coChuyen: boolean;
  onClose: () => void;
  len?: () => void;
  xuong?: () => void;
  onDaChuyen: (soPhieu: number, tenMuc: string) => void;
  navigate?: NavigateFn;
}) {
  const { token } = useAuth();
  const can = useCan();
  const { dong } = mo;
  const laThu = dong.ben === "thu";

  const [cot, setCot] = useState<string | null>(mo.cot);
  const [tab, setTab] = useState<TabNgan>("phieu");
  // Đổi dòng (↑ ↓) hay mở từ ô khác: về đúng phần được yêu cầu, tab Phiếu.
  useEffect(() => {
    setCot(mo.cot);
    setTab("phieu");
  }, [dong.ben, dong.khoa, mo.cot, loc.tuNgay, loc.denNgay, theo]);

  const [data, setData] = useState<PhieuCuaDongThuChi | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [lanTai, setLanTai] = useState(0);

  const khoaMuc = (loc.muc ?? []).join(",");
  // Câu trả lời cũ về muộn bị bỏ.
  const luot = useRef(0);
  useEffect(() => {
    if (!token) return;
    const l = ++luot.current;
    setDangTai(true);
    setLoi(null);
    api.baoCaoThuChi
      .phieu(token, {
        tuNgay: loc.tuNgay, denNgay: loc.denNgay, theo, hinhThuc: loc.hinhThuc ?? null,
        muc: khoaMuc ? khoaMuc.split(",").map(Number) : [],
        ben: dong.ben, khoa: dong.khoa, cot,
      })
      .then((d) => {
        if (l === luot.current) setData(d);
      })
      .catch((err) => {
        if (l !== luot.current) return;
        setData(null);
        setLoi(err instanceof ApiError ? err.message : "Không tải được phiếu của dòng này.");
      })
      .finally(() => {
        if (l === luot.current) setDangTai(false);
      });
  }, [token, loc.tuNgay, loc.denNgay, theo, loc.hinhThuc, khoaMuc, dong.ben, dong.khoa, cot, lanTai]);

  const items = useMemo(() => data?.items ?? [], [data]);

  // Ô tích để chuyển mục: mặc định tích hết các phiếu đang hiện.
  const [chon, setChon] = useState<Set<number>>(new Set());
  useEffect(() => setChon(new Set(items.map((p) => p.id))), [items]);
  const tatCa = items.length > 0 && items.every((p) => chon.has(p.id));

  // Gom theo người (xem theo mục) hoặc theo mục (xem theo người), tiền giảm dần.
  const nhom = useMemo(() => {
    const m = new Map<string, { ten: string; so: number; tien: number }>();
    for (const p of items) {
      const ten = theo === "muc" ? p.nguoi || "(không ghi người)" : p.muc_ten ?? "Chưa phân loại";
      const k = ten.toLowerCase();
      const g = m.get(k) ?? { ten, so: 0, tien: 0 };
      g.so += 1;
      g.tien += p.tien;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.tien - a.tien || a.ten.localeCompare(b.ten, "vi"));
  }, [items, theo]);

  const nhanNguoi = laThu ? "Người nộp tiền" : "Người nhận tiền";
  const nhanTab2 = theo === "muc" ? (laThu ? "Người nộp" : "Người nhận") : "Mục";

  // ---------- dải số ----------
  const cotDai = data?.cot ?? cotKy;
  const oCot = data?.o ?? dong.o;
  const cong = data?.cong ?? dong.cong;
  const nhanCot = (k: string) => cotDai.find((c) => c.khoa === k)?.nhan ?? k;
  const daiSo = (
    <div className="bctc-pt" aria-label="Số của dòng theo từng cột kỳ">
      {cotDai.map((c, i) => (
        <span key={c.khoa} className="bctc-pt__cum">
          {i > 0 && <span className="bctc-pt__dau" aria-hidden="true">+</span>}
          <button type="button" className={`bctc-pt__o${cot === c.khoa ? " on" : ""}`} aria-pressed={cot === c.khoa}
            onClick={() => setCot(cot === c.khoa ? null : c.khoa)}>
            <span className="bctc-pt__nhan">{c.nhan}</span>
            {/* Tháng không có phiếu: gạch như ô 0 ở bảng, khỏi một hàng số 0. */}
            <span className="bctc-pt__so">{oCot[c.khoa] ? soVN(oCot[c.khoa]) : "–"}</span>
          </button>
        </span>
      ))}
      {cotDai.length > 0 ? (
        <>
          <span className="bctc-pt__dau" aria-hidden="true">=</span>
          <button type="button" className={`bctc-pt__o bctc-pt__o--ca${cot == null ? " on" : ""}`}
            aria-pressed={cot == null} onClick={() => setCot(null)}>
            <span className="bctc-pt__nhan">Cả kỳ</span>
            <span className="bctc-pt__so">{soVN(cong)}</span>
          </button>
        </>
      ) : (
        // Kỳ gọn trong một tháng: không có cột kỳ, chỉ còn số cả kỳ — không có gì để bấm lọc.
        <span className="bctc-pt__o bctc-pt__o--ca">
          <span className="bctc-pt__nhan">Cả kỳ</span>
          <span className="bctc-pt__so">{soVN(cong)}</span>
        </span>
      )}
    </div>
  );

  // ---------- mở phiếu ----------
  const coMoPhieu = navigate != null && can(laThu ? "phieu_thu" : "phieu_chi", "read");
  const moPhieu = (p: PhieuThuChi) => {
    if (!navigate) return;
    if (p.loai === "thu") navigate("ke-toan-phieu-thu", { focusReceiptQuery: p.so });
    else navigate("ke-toan-phieu-chi", { focusVoucherQuery: p.so });
  };

  // ---------- chuyển mục ----------
  const mucCungLoai = (laThu ? mucThu : mucChi).filter((m) => !m.co_dinh && m.id !== dong.muc_id);
  const [hoi, setHoi] = useState(false);
  const [mucDich, setMucDich] = useState<string>("");
  const [dangChuyen, setDangChuyen] = useState(false);
  const [loiChuyen, setLoiChuyen] = useState<string | null>(null);
  const soChon = items.filter((p) => chon.has(p.id)).length;

  const moHoi = () => {
    setMucDich("");
    setLoiChuyen(null);
    setHoi(true);
  };

  async function chuyen() {
    if (!token || !mucDich) return;
    const ids = items.filter((p) => chon.has(p.id)).map((p) => p.id);
    if (ids.length === 0) return;
    const m = mucCungLoai.find((x) => String(x.id) === mucDich);
    setDangChuyen(true);
    setLoiChuyen(null);
    try {
      const r = await api.baoCaoThuChi.chuyenMuc(token, {
        ...(laThu ? { phieu_thu_ids: ids } : { phieu_chi_ids: ids }),
        muc_id: Number(mucDich),
      });
      setHoi(false);
      setLanTai((n) => n + 1);
      onDaChuyen(r.so_phieu, m?.ten ?? "");
    } catch (e) {
      setLoiChuyen(e instanceof ApiError ? e.message : "Không chuyển được phiếu.");
    } finally {
      setDangChuyen(false);
    }
  }

  const coLocNgan = cot != null;
  const soCot = 6 + (theo === "nguoi" ? 1 : 0) + (coChuyen ? 1 : 0);

  return (
    <NganPhai
      duongDan={
        <>
          Báo cáo thu chi
          <ChevronRight size={14} aria-hidden="true" />
          {theo === "muc" ? "Mục" : "Người nhận, nộp"}
        </>
      }
      tieuDe={dong.ten}
      the={laThu ? <ChipTT mau="xanh">Thu</ChipTT> : <ChipTT mau="cam">Chi</ChipTT>}
      hanhDong={
        coChuyen ? (
          <button type="button" className="kt-btn kt-btn--nho" onClick={moHoi}
            disabled={soChon === 0 || mucCungLoai.length === 0}
            title={mucCungLoai.length === 0 ? `Chưa có mục ${laThu ? "thu" : "chi"} nào khác để chuyển sang.` : "Chuyển các phiếu đã tích sang mục khác"}>
            Chuyển sang mục…
          </button>
        ) : undefined
      }
      soLon={daiSo}
      tabs={[
        { id: "phieu", nhan: "Phiếu", dem: data ? items.length : undefined },
        { id: "nhom", nhan: nhanTab2, dem: data ? nhom.length : undefined },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as TabNgan)}
      len={len}
      xuong={xuong}
      onDong={onClose}
    >
      {coLocNgan && (
        <div className="bctc-loc" role="group" aria-label="Đang lọc phiếu">
          {cot != null && (
            <button type="button" className="bctc-loc__x" onClick={() => setCot(null)} aria-label={`Bỏ lọc ${nhanCot(cot)}`}>
              {nhanCot(cot)}
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {loi && <p className="kt-do" role="alert">{loi}</p>}
      {!data && dangTai && !loi && <p className="kt-mo">Đang tải phiếu…</p>}
      {data && tab === "phieu" && (
        <div className={`lds-bang${dangTai ? " bctc-dang-tai" : ""}`} aria-busy={dangTai}>
          <table className="lds-g">
            <colgroup>
              {coChuyen && <col style={{ width: 40 }} />}
              <col style={{ width: 100 }} />
              <col style={{ width: 160 }} />
              {theo === "nguoi" && <col style={{ width: 190 }} />}
              <col style={{ width: 240 }} />
              <col />
              <col style={{ width: 120 }} />
              <col style={{ width: 132 }} />
            </colgroup>
            <thead>
              <tr>
                {coChuyen && (
                  <th className="c">
                    <input type="checkbox" className="lds-cb" checked={tatCa} aria-label="Chọn tất cả phiếu"
                      disabled={items.length === 0}
                      onChange={() => setChon(tatCa ? new Set() : new Set(items.map((p) => p.id)))} />
                  </th>
                )}
                <th>Ngày</th>
                <th>Số phiếu</th>
                {theo === "nguoi" && <th>Mục</th>}
                <th>{nhanNguoi}</th>
                <th>Lý do</th>
                <th>Hình thức</th>
                <th className="n">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={soCot} className="lds-trong">Không có phiếu nào.</td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={`${p.loai}-${p.id}`}>
                    {coChuyen && (
                      <td className="c">
                        <input type="checkbox" className="lds-cb" checked={chon.has(p.id)} aria-label={`Chọn phiếu ${p.so}`}
                          onChange={() => {
                            const s = new Set(chon);
                            if (s.has(p.id)) s.delete(p.id);
                            else s.add(p.id);
                            setChon(s);
                          }} />
                      </td>
                    )}
                    <td>{ngayDeDoc(p.ngay)}</td>
                    <td title={p.so}>
                      {coMoPhieu ? (
                        <button type="button" className="lds-lk" onClick={() => moPhieu(p)}
                          title={`Mở ${p.loai === "thu" ? "phiếu thu" : "phiếu chi"} ${p.so}`}>
                          {p.so}
                        </button>
                      ) : (
                        p.so
                      )}
                    </td>
                    {theo === "nguoi" && (
                      <td title={p.muc_ten ?? "Chưa phân loại"}>
                        {p.muc_ten ?? <span className="lds-vang">Chưa phân loại</span>}
                      </td>
                    )}
                    <td title={p.nguoi}>{p.nguoi || <span className="lds-mu3">–</span>}</td>
                    <td title={p.ly_do} className="lds-mu">{p.ly_do}</td>
                    <td className="lds-mu">{HINH_THUC[p.hinh_thuc] ?? p.hinh_thuc}</td>
                    <td className="n">{soVN(p.tien)}</td>
                  </tr>
                ))
              )}
              {items.length > 0 && (
                <tr className="lds-cong">
                  <td colSpan={soCot - 1}>{`Cộng ${soVN(items.length)} phiếu`}</td>
                  <td className="n">{soVN(data.tong)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {data && tab === "nhom" && (
        <div className={`lds-bang${dangTai ? " bctc-dang-tai" : ""}`} aria-busy={dangTai}>
          <table className="lds-g">
            <colgroup>
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 150 }} />
            </colgroup>
            <thead>
              <tr>
                <th>{theo === "muc" ? nhanNguoi : "Mục"}</th>
                <th className="n">Số phiếu</th>
                <th className="n">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {nhom.length === 0 ? (
                <tr>
                  <td colSpan={3} className="lds-trong">Không có phiếu nào.</td>
                </tr>
              ) : (
                nhom.map((g) => (
                  <tr key={g.ten}>
                    <td title={g.ten}>{g.ten}</td>
                    <td className="n">{soVN(g.so)}</td>
                    <td className="n">{soVN(g.tien)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={hoi}
        title={`Chuyển ${soVN(soChon)} phiếu ${laThu ? "thu" : "chi"} sang mục khác`}
        confirmLabel="Chuyển"
        cancelLabel="Huỷ"
        busy={dangChuyen}
        error={loiChuyen}
        confirmDisabled={!mucDich || soChon === 0}
        onConfirm={() => void chuyen()}
        onCancel={() => setHoi(false)}
      >
        <label className="bctc-chuyen">
          <span className="bctc-chuyen__nhan">{`Mục ${laThu ? "thu" : "chi"}`}</span>
          <select className="input" value={mucDich} onChange={(e) => setMucDich(e.target.value)} aria-label="Chọn mục đích">
            <option value="" disabled>Chọn mục…</option>
            {mucCungLoai.map((m) => (
              <option key={m.id} value={String(m.id)}>{m.ten}</option>
            ))}
          </select>
          <span className="bctc-chuyen__ghi lds-mu">
            Mục phải chọn khách hàng không có ở đây: mỗi phiếu loại đó cần đúng một khách.
          </span>
        </label>
      </ConfirmDialog>
    </NganPhai>
  );
}
