// BÁO CÁO KINH DOANH theo khách hàng (24/09/2026).
//
// Trả lời: trong kỳ, mỗi khách đặt những đơn nào, đơn gồm sản phẩm gì, đơn giá bao nhiêu, cọc phải
// thu / đã nhận bao nhiêu. Chủ chốt: chỉ ĐƠN ĐÃ CHỐT, vào kỳ theo NGÀY CHỐT, phạm vi theo ô quyền
// riêng `bao_cao_kinh_doanh` (sale chỉ thấy đơn mình bán — server lọc, màn này không lọc thêm).
//
// Thanh lọc chung (06/10/2026): kỳ theo NGÀY CHỐT (mặc định Tháng này), Khách hàng và Sale là điều
// kiện lọc ở MÁY CHỦ — trước đó màn tải cả kỳ rồi lọc trong trình duyệt. Xuất Excel gửi đúng bộ lọc
// đang áp nên file = bảng đang xem.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api, type BaoCaoKinhDoanh, type BaoCaoKinhDoanhDon, type BaoCaoKinhDoanhKhach } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { EmptyRow } from "../../components/EmptyState";
import { Icon } from "../../components/Icons";
import { fmtDate, money } from "../../utils/format";
import { ThanhLoc } from "../thanh-loc/ThanhLoc";
import { thamSoKy } from "../thanh-loc/ky-danh-sach";
import { useLocMan } from "../thanh-loc/useLocMan";
import {
  LOC_MAN_BCKD_TRONG,
  MOC_BCKD,
  locManBCKDLenUrl,
  locManBCKDTuUrl,
  thamSoLocBCKD,
  useDieuKienBCKD,
} from "./dieu-kien-bao-cao-kinh-doanh";
import "./bao-cao-kinh-doanh.css";

function Tien({ v, nhat = false }: { v: number | null | undefined; nhat?: boolean }) {
  if (!v) return <span className="bckd__khong">—</span>;
  return <span className={nhat ? "bckd__tien bckd__tien--nhat" : "bckd__tien"}>{money(v)}</span>;
}

// Bố cục bản ghi lồng (như màn lệnh sản xuất): ô Khách gộp dọc cả khối khách, ô Đơn/Sale/Tỷ lệ/
// Cọc gộp dọc cả khối đơn, mỗi mặt hàng một dòng. Không dùng dấu "·" nối thông tin — mỗi thông tin
// một cột, hoặc một dòng trong cùng ô.
function KhoiKhach({ k }: { k: BaoCaoKinhDoanhKhach }) {
  const soDongDon = (d: BaoCaoKinhDoanhDon) => Math.max(1, d.dong.length) + 1; // + dòng tổng đơn
  const soDongKhach = k.don.reduce((s, d) => s + soDongDon(d), 0);
  return (
    <tbody className="bckd__khoi">
      {k.don.map((d, di) => {
        const dong = d.dong.length ? d.dong : [null];
        return dong.map((ln, li) => (
          <tr key={`${d.order_id}-${li}`} className={li === 0 ? "bckd__dau-don" : undefined}>
            {di === 0 && li === 0 && (
              <td rowSpan={soDongKhach} className="bckd__o-khach">{k.ten}</td>
            )}
            {li === 0 && (
              <>
                <td rowSpan={soDongDon(d)} className="bckd__o-don">
                  <strong>{d.order_no}</strong>
                  <span>{fmtDate(d.ngay_chot)}</span>
                  {d.po_khach && <span>{d.po_khach}</span>}
                </td>
                <td rowSpan={soDongDon(d)}>{d.sale ?? <span className="bckd__khong">—</span>}</td>
                <td rowSpan={soDongDon(d)} className="bckd__so">
                  {d.ty_le_bao_gia == null ? <span className="bckd__khong">—</span> : <strong>{d.ty_le_bao_gia}%</strong>}
                </td>
              </>
            )}
            <td className="bckd__o-mh">{ln ? ln.ten || "—" : <span className="bckd__khong">Không có mặt hàng</span>}</td>
            <td className="bckd__so">{ln ? ln.so_luong.toLocaleString("vi-VN") : ""}</td>
            <td>{ln?.dvt ?? ""}</td>
            <td className="bckd__so">{ln && <Tien v={ln.don_gia} />}</td>
            <td className="bckd__so">{ln && <Tien v={ln.thanh_tien} />}</td>
            {li === 0 && (
              <td rowSpan={soDongDon(d)} className="bckd__o-coc">
                {!d.coc_pct && !d.coc_da_nhan ? (
                  <span className="bckd__khong">Không cọc</span>
                ) : (
                  <>
                    <span>Phải thu <Tien v={d.coc_phai_thu} /></span>
                    <span>Đã nhận <Tien v={d.coc_da_nhan} /></span>
                    {d.coc_con_thieu > 0 && (
                      <span className="bckd__thieu">Còn thiếu {money(d.coc_con_thieu)}</span>
                    )}
                  </>
                )}
              </td>
            )}
          </tr>
        )).concat(
          <tr key={`${d.order_id}-cong`} className="bckd__cong-don">
            <td colSpan={4}>Tổng có VAT</td>
            <td className="bckd__so"><Tien v={d.tong_vat} nhat /></td>
          </tr>,
        );
      })}
      <tr className="bckd__cong-khach">
        <td colSpan={8}>Cộng {k.so_don} đơn</td>
        <td className="bckd__so"><Tien v={k.tong_vat} nhat /></td>
        <td className="bckd__so">
          {k.coc_con_thieu > 0 ? (
            <span className="bckd__thieu">Còn thiếu {money(k.coc_con_thieu)}</span>
          ) : (
            <span className="bckd__khong">—</span>
          )}
        </td>
      </tr>
    </tbody>
  );
}

const TONG_TRONG = { so_don: 0, tong_vat: 0, coc_phai_thu: 0, coc_da_nhan: 0, coc_con_thieu: 0 };

export function BaoCaoKinhDoanhPage() {
  const { token } = useAuth();
  const [locMan, setLocMan] = useLocMan("bao-cao-kinh-doanh", LOC_MAN_BCKD_TRONG, locManBCKDTuUrl, locManBCKDLenUrl);
  const { ky, loc } = locMan;
  const dieuKien = useDieuKienBCKD();
  const thamSo = useMemo(() => ({ ...thamSoKy(ky), ...thamSoLocBCKD(loc) }), [ky, loc]);
  const khoaThamSo = JSON.stringify(thamSo);
  const [data, setData] = useState<BaoCaoKinhDoanh | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dangXuat, setDangXuat] = useState(false);

  const tai = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.baoCaoKinhDoanh.xem(token, JSON.parse(khoaThamSo)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không tải được báo cáo.");
    } finally {
      setLoading(false);
    }
  }, [token, khoaThamSo]);

  useEffect(() => {
    void tai();
  }, [tai]);

  const khachHien = data?.khach ?? [];
  const tong = data?.tong ?? TONG_TRONG;

  async function xuatExcel() {
    if (!token) return;
    setDangXuat(true);
    try {
      const { url, ten } = await api.baoCaoKinhDoanh.xuatExcel(token, thamSo);
      const a = document.createElement("a");
      a.href = url;
      a.download = ten;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không xuất được file.");
    } finally {
      setDangXuat(false);
    }
  }

  return (
    <main className="bckd">
      <header className="bckd__head">
        <div>
          <h1 className="bckd__title">Báo cáo kinh doanh</h1>
          <p className="bckd__sub">Đơn đã chốt trong kỳ theo khách hàng, đơn hàng và mặt hàng</p>
        </div>
        <Button variant="ghost" onClick={() => void xuatExcel()} disabled={dangXuat || !data || khachHien.length === 0}>
          <Icon name="table" size={14} />{" "}
          {dangXuat ? "Đang xuất…" : loc.khach == null ? "Xuất Excel" : "Xuất Excel khách này"}
        </Button>
      </header>

      <section className="bckd__loc tl-thanh" aria-label="Kỳ báo cáo và bộ lọc">
        <ThanhLoc
          ky={ky}
          moc={MOC_BCKD}
          onKy={(k) => setLocMan({ ky: k, loc })}
          dieuKien={dieuKien}
          loc={loc}
          onLoc={(l) => setLocMan({ ky, loc: l })}
        />
      </section>

      {error && <div className="banner banner--error" role="alert">{error}</div>}

      <section className="bckd__kpi" aria-label="Tổng hợp">
        <div><span>Số đơn</span><strong>{tong.so_don}</strong></div>
        <div><span>Doanh số (có VAT)</span><strong>{money(tong.tong_vat)}</strong></div>
        <div><span>Cọc phải thu</span><strong>{money(tong.coc_phai_thu)}</strong></div>
        <div><span>Cọc đã nhận</span><strong>{money(tong.coc_da_nhan)}</strong></div>
        <div className={tong.coc_con_thieu ? "is-thieu" : ""}>
          <span>Cọc còn thiếu</span><strong>{money(tong.coc_con_thieu)}</strong>
        </div>
      </section>

      <div className="bckd__bang-khung">
        <table className="bckd__bang">
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th>Đơn hàng</th>
              <th>Sale</th>
              <th className="bckd__so">Tỷ lệ báo giá</th>
              <th>Mặt hàng</th>
              <th className="bckd__so">SL</th>
              <th>ĐVT</th>
              <th className="bckd__so">Đơn giá</th>
              <th className="bckd__so">Thành tiền</th>
              <th>Cọc</th>
            </tr>
          </thead>
          {loading ? (
            <tbody><EmptyRow colSpan={10} trangThai="dang-tai" /></tbody>
          ) : khachHien.length === 0 ? (
            <tbody><tr><td colSpan={10} className="bckd__trong">Không có đơn đã chốt nào trong kỳ này.</td></tr></tbody>
          ) : (
            khachHien.map((k) => <KhoiKhach key={k.customer_id ?? "khong-gan"} k={k} />)
          )}
        </table>
      </div>
    </main>
  );
}
