/** Tab SAO KÊ của ngăn công nợ (phương án 2, 06/10/2026): số dư đầu kỳ → từng chứng từ theo ngày với
 *  số dư chạy → số dư cuối kỳ. Số lấy từ sổ chi tiết của máy chủ (cùng luồng chứng từ với báo cáo sổ
 *  chi tiết, có test đối chiếu) — giao diện chỉ đổi chiều cột cho dễ đọc.
 *
 *  Hai bên đọc ngược chiều nợ/có:
 *  - TK 131 (phải thu): hoá đơn ghi NỢ (khách nợ thêm), phiếu thu ghi CÓ. Số dư = nợ − có.
 *  - TK 331 (phải trả): đợt giao ghi CÓ (mình nợ thêm), phiếu chi ghi NỢ. Số dư = có − nợ.
 *  Nên ở đây chỉ còn hai cột "tăng" (Bán ra / Nhận hàng) và "giảm" (Đã thu / Đã trả), số dư dương
 *  luôn là "còn nợ" — người đọc không phải nhớ bên nào là nợ.
 *
 *  Kỳ mặc định = kỳ đang xem ở trang. "In sao kê" ở đầu ngăn mở bản in của đúng bảng đang hiện.
 */
import { useEffect, useRef, useState } from "react";

import { ApiError, api, type KyXem, type SoChiTietCongNo, type SoChiTietDong } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { PrintSheet } from "../../../components/PrintSheet";
import { LOAI_KY, homNayVN, loiKhoang, tinhKy, type LoaiKy } from "../../../utils/ky";
import { ngay, vietSo } from "./dinhDang";

export type BenCongNo = "receivables" | "payables";

/** Chữ của từng bên. */
const CHU: Record<BenCongNo, { tang: string; giam: string; soDu: string; doiTac: string; loaiPhieu: string }> = {
  receivables: { tang: "Bán ra", giam: "Đã thu", soDu: "Số dư = khách còn nợ mình", doiTac: "Khách hàng", loaiPhieu: "phieu_thu" },
  payables: { tang: "Nhận hàng", giam: "Đã trả", soDu: "Số dư = mình còn nợ nhà cung cấp", doiTac: "Nhà cung cấp", loaiPhieu: "phieu_chi" },
};

/** Tiền tăng / giảm / số dư của một dòng sổ, đã quy về chiều "còn nợ". */
export function chieuCongNo(ben: BenCongNo, d: Pick<SoChiTietDong, "no" | "co" | "luy_ke_no" | "luy_ke_co">) {
  return ben === "receivables"
    ? { tang: d.no, giam: d.co, du: d.luy_ke_no - d.luy_ke_co }
    : { tang: d.co, giam: d.no, du: d.luy_ke_co - d.luy_ke_no };
}

/** Tải sổ chi tiết của một đối tác cho một khoảng ngày. Câu trả lời cũ về muộn bị bỏ; tải hỏng thì
 *  xoá số cũ (im lặng không được giả làm số đúng). `lan` đổi ⇒ tải lại (sự kiện đẩy, vừa lập phiếu). */
export function useSoCongNo(ben: BenCongNo, id: number, ky: KyXem | null, lan = 0) {
  const { token } = useAuth();
  const [so, setSo] = useState<SoChiTietCongNo | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const luot = useRef(0);
  const tu = ky?.tu;
  const den = ky?.den;

  useEffect(() => {
    if (!token || !tu || !den) return;
    const l = ++luot.current;
    setDangTai(true);
    api.accounting
      .saoKeDoiTac(token, ben, id, { tuNgay: tu, denNgay: den })
      .then((d) => {
        if (l !== luot.current) return;
        setSo(d);
        setLoi(null);
      })
      .catch((err) => {
        if (l !== luot.current) return;
        setSo(null);
        setLoi(err instanceof ApiError ? err.message : "Không tải được sao kê.");
      })
      .finally(() => {
        if (l === luot.current) setDangTai(false);
      });
  }, [token, ben, id, tu, den, lan]);

  return { so, loi, dangTai };
}

type ChonKy = "trang" | LoaiKy;

function BangSaoKe({ ben, so, onMoPhieu, inAn }: { ben: BenCongNo; so: SoChiTietCongNo; onMoPhieu?: (code: string) => void; inAn?: boolean }) {
  const c = CHU[ben];
  const dau = ben === "receivables" ? so.dau_no - so.dau_co : so.dau_co - so.dau_no;
  const cuoi = ben === "receivables" ? so.cuoi_no - so.cuoi_co : so.cuoi_co - so.cuoi_no;
  const tongTang = ben === "receivables" ? so.ps_no : so.ps_co;
  const tongGiam = ben === "receivables" ? so.ps_co : so.ps_no;
  const soTien = (n: number) => (n ? vietSo(n) : "");
  // Bản xem trên ngăn dùng lưới lds-g (lớp căn `n`, dòng mốc `lds-cong`); bản in giữ bảng `ps-tbl` cũ (lớp `r`).
  const lopSo = inAn ? "r" : "n";
  const lopMoc = inAn ? "kt-sk__moc" : "lds-cong";
  return (
    <table className={inAn ? "ps-tbl kt-sk-in" : "lds-g"}>
      {inAn ? (
        <colgroup>
          <col style={{ width: "14%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "24%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "14%" }} />
        </colgroup>
      ) : (
        // Chứng từ rộng 190: "DMH-261007-VBF4 đợt 1" đo 189px khi xếp công nợ phải trả. Diễn giải co giãn.
        <colgroup>
          <col style={{ width: 102 }} />
          <col style={{ width: 190 }} />
          <col />
          <col style={{ width: 116 }} />
          <col style={{ width: 116 }} />
          <col style={{ width: 116 }} />
        </colgroup>
      )}
      <thead>
        <tr>
          <th>Ngày</th>
          <th>Chứng từ</th>
          <th>Diễn giải</th>
          <th className={lopSo}>{c.tang}</th>
          <th className={lopSo}>{c.giam}</th>
          <th className={lopSo}>Số dư</th>
        </tr>
      </thead>
      <tbody>
        <tr className={lopMoc}>
          <td>{ngay(so.tu_ngay)}</td>
          <td />
          <td>Số dư đầu kỳ</td>
          <td />
          <td />
          <td className={lopSo}>{vietSo(dau)}</td>
        </tr>
        {so.dong.length === 0 && (
          <tr>
            <td colSpan={6} className={inAn ? "kt-mo" : "lds-trong"}>Không có chứng từ nào trong kỳ.</td>
          </tr>
        )}
        {so.dong.map((d, i) => {
          const s = chieuCongNo(ben, d);
          const laPhieu = d.loai === c.loaiPhieu;
          return (
            <tr key={`${d.so_ct}-${i}`}>
              <td>{ngay(d.ngay)}</td>
              <td>
                {laPhieu && onMoPhieu && !inAn ? (
                  <button type="button" className="kt-lk" onClick={() => onMoPhieu(d.so_ct)}>{d.so_ct}</button>
                ) : (
                  d.so_ct
                )}
              </td>
              <td>{d.dien_giai}</td>
              <td className={lopSo}>{soTien(s.tang)}</td>
              <td className={lopSo}>{soTien(s.giam)}</td>
              <td className={lopSo}>
                {inAn ? <b>{vietSo(s.du)}</b> : vietSo(s.du)}
              </td>
            </tr>
          );
        })}
        <tr className={inAn ? "kt-sk__moc kt-sk__moc--cuoi" : "lds-cong"}>
          <td>{ngay(so.den_ngay)}</td>
          <td />
          <td>Số dư cuối kỳ</td>
          <td className={lopSo}>{vietSo(tongTang)}</td>
          <td className={lopSo}>{vietSo(tongGiam)}</td>
          <td className={lopSo}>{vietSo(cuoi)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function TabSaoKe({
  ben,
  id,
  ten,
  ma,
  kyTrang,
  lan = 0,
  dangIn,
  onDongIn,
  onMoPhieu,
}: {
  ben: BenCongNo;
  id: number;
  ten: string;
  ma?: string | null;
  /** Kỳ đang xem ở trang — kỳ mặc định của sao kê. */
  kyTrang: KyXem;
  /** Đổi ⇒ tải lại. */
  lan?: number;
  /** Đang mở bản in (nút "In sao kê" ở đầu ngăn). */
  dangIn: boolean;
  onDongIn: () => void;
  /** Mở phiếu thu / phiếu chi; không có = không có quyền xem phiếu ⇒ số phiếu là chữ thường. */
  onMoPhieu?: (code: string) => void;
}) {
  const homNay = homNayVN();
  const [chon, setChon] = useState<ChonKy>("trang");
  const [tuy, setTuy] = useState<KyXem>(kyTrang);
  const loiTuy = chon === "tuy" ? loiKhoang(tuy.tu, tuy.den) : null;
  const ky: KyXem | null = chon === "trang" ? kyTrang : chon === "tuy" ? (loiTuy ? null : tuy) : tinhKy(chon, homNay);
  const { so, loi, dangTai } = useSoCongNo(ben, id, ky, lan);
  const c = CHU[ben];

  return (
    <>
      <div className="kt-hang-loc">
        <select className="kt-sk__chon" aria-label="Kỳ sao kê" value={chon} onChange={(e) => setChon(e.target.value as ChonKy)}>
          <option value="trang">{`Kỳ đang xem ${ngay(kyTrang.tu)} đến ${ngay(kyTrang.den)}`}</option>
          {LOAI_KY.map(([l, t]) => (
            <option key={l} value={l}>
              {l === "tuy" ? "Tuỳ chọn…" : `${t} ${ngay(tinhKy(l, homNay).tu)} đến ${ngay(tinhKy(l, homNay).den)}`}
            </option>
          ))}
        </select>
        {chon === "tuy" && (
          <>
            <input type="date" className="kt-sk__chon" aria-label="Từ ngày" min="2000-01-01" max={homNay} value={tuy.tu}
              onChange={(e) => setTuy({ ...tuy, tu: e.target.value })} />
            <input type="date" className="kt-sk__chon" aria-label="Đến ngày" min="2000-01-01" max={homNay} value={tuy.den}
              onChange={(e) => setTuy({ ...tuy, den: e.target.value })} />
          </>
        )}
        <span className="kt-mo">{c.soDu}</span>
      </div>
      {loiTuy && <p className="kt-do" role="alert">{loiTuy}</p>}
      {loi && <p className="kt-do" role="alert">{loi}</p>}
      {!so && dangTai && <p className="kt-mo">Đang tải sao kê…</p>}
      {so && (
        <div className={`lds-bang kt-sk-khung${dangTai ? " kt-sk-khung--tai" : ""}`} aria-busy={dangTai}>
          <BangSaoKe ben={ben} so={so} onMoPhieu={onMoPhieu} />
        </div>
      )}

      {dangIn && so && (
        <PrintSheet title="SAO KÊ CÔNG NỢ" docDate={ngay(homNay)} onClose={onDongIn}>
          <div className="ps-info">
            <div className="ps-info-grid">
              <div>
                <span className="ps-lbl">{`${c.doiTac}: `}</span>
                <b>{ten}</b>
              </div>
              <div>
                <span className="ps-lbl">Kỳ: </span>
                {`${ngay(so.tu_ngay)} đến ${ngay(so.den_ngay)}`}
              </div>
              {ma && (
                <div>
                  <span className="ps-lbl">Mã: </span>
                  {ma}
                </div>
              )}
              <div>
                <span className="ps-lbl">Đơn vị: </span>
                đồng
              </div>
            </div>
          </div>
          <div className="ps-sec">Chi tiết công nợ</div>
          <BangSaoKe ben={ben} so={so} inAn />
          <div className="ps-signs">
            <div>
              <div className="ps-role">{`Xác nhận của ${c.doiTac.toLowerCase()}`}</div>
              <div className="ps-hint">(Ký, ghi rõ họ tên, đóng dấu)</div>
              <div className="ps-sp" />
            </div>
            <div>
              <div className="ps-role">Người lập</div>
              <div className="ps-hint">(Ký, ghi rõ họ tên)</div>
              <div className="ps-sp" />
            </div>
          </div>
        </PrintSheet>
      )}
    </>
  );
}
