// Ngăn CHI TIẾT một yêu cầu giao (bấm mã ở tab Yêu cầu giao) — phương án A
// (docs/mockups/giao-hang-chi-tiet-3-phuong-an.html, chủ chọn 07/10/2026): khuôn trang chi tiết Stripe.
//
// Vỏ `NganPhai` chung như mọi ngăn: tiêu đề + thẻ trạng thái + nút ("Lên đơn giao" chính, "Huỷ yêu
// cầu" phụ — bấm mới mở ô lý do, không đứng sẵn một khối đỏ), dải bốn ô tóm tắt, tab Chi tiết / Lịch
// sử. Thân một cột: từng nhóm có tiêu đề nhỏ, nhãn trái giá trị phải, vạch mảnh ngăn nhóm, không hộp.
// Nhóm nào chưa có gì (chưa có chuyến, chưa có tệp) thì KHÔNG hiện — không dựng thẻ rỗng.
import { useState } from "react";
import type { DeliveryRequestDetail } from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { Button } from "../../../../components/Button";
import { NganPhai } from "../../../ke-toan/shared/NganPhai";
import { NHAN_TRANG_THAI_CHUYEN, NHAN_TRANG_THAI_YC } from "../shared/constants";
import {
  gioNgay, hanGiao, lienKetBanDo, ngay, ngayThuan, nhanChuyen, sdtDoc, so, TONE_YC, toneChuyen,
} from "../shared/helpers";
import { DinhKemChuyenBox } from "./DinhKemChuyenBox";
import { Pill } from "./giaoHangCells";
import "../../../ke-toan/ke-toan.css";

type Tab = "chi-tiet" | "lich-su";

export function DrawerChiTiet({
  detail,
  canCancel,
  onClose,
  onHuy,
  onLenDon,
  len,
  xuong,
}: {
  detail: DeliveryRequestDetail;
  canCancel: boolean;
  onClose: () => void;
  /** Trả Promise: lỗi máy chủ hiện ngay trong ngăn, không rơi xuống màn phía sau. */
  onHuy?: (lyDo: string) => Promise<unknown>;
  /** Có khi người xem được lên đơn và yêu cầu còn chờ — mở ngăn Lên đơn giao hàng. */
  onLenDon?: () => void;
  len?: () => void;
  xuong?: () => void;
}) {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("chi-tiet");
  const [moHuy, setMoHuy] = useState(false);
  const [lyDo, setLyDo] = useState("");
  const [dangHuy, setDangHuy] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const r = detail.request;
  // Huỷ được khi CHƯA có chuyến, hoặc mọi chuyến đã huỷ (quản lý huỷ chuyến ⇒ "Chuyến đã huỷ").
  const huyDuoc = canCancel && !!onHuy && (
    (r.trang_thai === "cho_len_ke_hoach" && detail.trips.length === 0) || r.trang_thai === "chuyen_da_huy");
  const han = hanGiao(r.ngay_can_giao);
  const dvChung = r.lines.length > 0 && r.lines.every((l) => l.don_vi_tinh === r.lines[0].don_vi_tinh)
    ? r.lines[0].don_vi_tinh : null;
  const tongSo = r.lines.reduce((n, l) => n + l.qty, 0);

  const huy = () => {
    if (!onHuy) return;
    setLoi(null);
    setDangHuy(true);
    onHuy(lyDo.trim())
      .catch((e: unknown) => setLoi(e instanceof Error ? e.message : "Không huỷ được"))
      .finally(() => setDangHuy(false));
  };

  // Lịch sử: các mốc chuyến (mới nhất trước) + mốc Bán hàng gửi yêu cầu ở cuối — yêu cầu chưa lên
  // đơn vẫn có một dòng thật, không trơ "Chưa có lịch sử".
  const lichSu = [...detail.lich_su].sort((a, b) => (a.luc < b.luc ? 1 : -1));

  return (
    <NganPhai
      duongDan="Yêu cầu giao"
      tieuDe={r.code}
      the={<Pill text={NHAN_TRANG_THAI_YC[r.trang_thai] ?? r.trang_thai} tone={TONE_YC[r.trang_thai] ?? "slate"} />}
      hanhDong={(huyDuoc || onLenDon) ? (
        <>
          {huyDuoc && (
            <Button variant="ghost" className="gh-nut-do" aria-expanded={moHuy}
              onClick={() => {
                setMoHuy((m) => !m);
                setTab("chi-tiet");
              }}>
              Huỷ yêu cầu
            </Button>
          )}
          {onLenDon && <Button variant="accent" onClick={onLenDon}>Lên đơn giao</Button>}
        </>
      ) : undefined}
      phuDe={
        <dl className="gh-kv">
          <div>
            <dt>Khách hàng</dt>
            <dd>{r.customer_name ?? "—"}{r.order_code && <small className="gh-tom-phu">{r.order_code}</small>}</dd>
          </div>
          <div>
            <dt>Cần giao</dt>
            <dd>
              {han.tone ? <span><Pill text={han.text} tone={han.tone} /></span> : han.text}
              {han.tone && r.ngay_can_giao && <small className="gh-tom-phu">{ngayThuan(r.ngay_can_giao)}</small>}
            </dd>
          </div>
          <div>
            <dt>Người yêu cầu</dt>
            <dd>{r.created_by_name ?? "—"}<small className="gh-tom-phu">{ngay(r.created_at)}</small></dd>
          </div>
          <div>
            <dt>Hàng</dt>
            <dd>
              {r.lines.length} mặt hàng
              {dvChung != null && <small className="gh-tom-phu">{so(tongSo)} {dvChung}</small>}
            </dd>
          </div>
        </dl>
      }
      tabs={[
        { id: "chi-tiet", nhan: "Chi tiết" },
        { id: "lich-su", nhan: "Lịch sử" },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as Tab)}
      len={len}
      xuong={xuong}
      onDong={onClose}
      chanDong={() => moHuy && lyDo.trim() !== ""}
    >
      {tab === "chi-tiet" && (
        <>
          {moHuy && huyDuoc && (
            <div className="gh-huy">
              <label htmlFor="gh-huy-ly-do">Lý do huỷ</label>
              <div className="gh-huy__dong">
                <input id="gh-huy-ly-do" className="input" autoFocus value={lyDo}
                  placeholder="Ví dụ: khách lùi ngày nhận, Bán hàng sẽ gửi yêu cầu mới"
                  onChange={(e) => setLyDo(e.target.value)} />
                <Button variant="ghost" className="gh-nut-do gh-nut-do--vien" disabled={!lyDo.trim() || dangHuy}
                  onClick={huy}>
                  Xác nhận huỷ
                </Button>
                <Button variant="ghost" onClick={() => setMoHuy(false)}>Thôi</Button>
              </div>
              {r.order_code && <p className="gh-huy__goi">Bán hàng thấy lý do này ở đơn {r.order_code}.</p>}
              {loi && <div className="banner banner--error" role="alert" style={{ margin: "8px 0 0" }}>{loi}</div>}
            </div>
          )}

          <section className="gh-a-nhom">
            <h3>Giao tới</h3>
            <dl className="gh-a-rows">
              <dt>Địa chỉ</dt>
              <dd>
                <span>{r.dia_chi || "—"}</span>
                {r.dia_chi && (
                  <a className="gh-lk gh-lk--nho" href={lienKetBanDo(r.dia_chi)} target="_blank" rel="noreferrer">
                    Mở bản đồ
                  </a>
                )}
              </dd>
              <dt>Người nhận</dt>
              <dd>
                <span>{r.nguoi_nhan || "—"}</span>
                {r.sdt_nguoi_nhan && (
                  <a className="gh-lk gh-num" href={`tel:${r.sdt_nguoi_nhan.replace(/\s+/g, "")}`}>
                    {sdtDoc(r.sdt_nguoi_nhan)}
                  </a>
                )}
              </dd>
              {r.ghi_chu && (
                <>
                  <dt>Ghi chú</dt>
                  <dd>{r.ghi_chu}</dd>
                </>
              )}
            </dl>
          </section>

          <section className="gh-a-nhom">
            <h3>Hàng cần giao</h3>
            <table className="gh-a-hang">
              <thead>
                <tr>
                  <th>Mặt hàng</th>
                  <th className="r">Yêu cầu</th>
                  <th className="r">Đã giao</th>
                  <th className="r">Còn</th>
                </tr>
              </thead>
              <tbody>
                {r.lines.map((l) => {
                  const dv = l.don_vi_tinh ?? "";
                  const con = l.qty - l.da_giao;
                  return (
                    <tr key={l.id}>
                      <td>{l.mo_ta ?? l.hang_ten}</td>
                      <td className="r gh-num">{so(l.qty)} <span className="gh-nho">{dv}</span></td>
                      <td className="r gh-num">
                        {l.da_giao > 0 ? <>{so(l.da_giao)} <span className="gh-nho">{dv}</span></> : <span className="gh-mo">0</span>}
                      </td>
                      <td className="r gh-num">
                        {con > 0 ? <>{so(con)} <span className="gh-nho">{dv}</span></> : <span className="gh-mo">0</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {detail.trips.length > 0 && (
            <section className="gh-a-nhom">
              <h3>Chuyến giao</h3>
              <ul className="gh-a-chuyen">
                {detail.trips.map((t) => (
                  <li key={t.id}>
                    <Pill text={nhanChuyen(t)} tone={toneChuyen(t.trang_thai)} />
                    <span>{t.employee_name ?? "—"}</span>
                    <span className="gh-nho">lấy hàng {gioNgay(t.gio_lay_hang)}</span>
                    {t.luot && <span className="gh-the">{t.luot.code}</span>}
                    {t.yeu_cau_kho_ma && <span className="gh-the">{t.yeu_cau_kho_ma}</span>}
                    {t.km != null && <span className="gh-nho">{so(t.km)} km</span>}
                    {t.ly_do_that_bai && <span className="gh-nho">Lý do: {t.ly_do_that_bai}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail.trips[0] && (
            <section className="gh-a-nhom gh-a-nhom--tep">
              <DinhKemChuyenBox tripId={detail.trips[0].id} token={token} />
            </section>
          )}
        </>
      )}

      {tab === "lich-su" && (
        <ul className="gh-ls">
          {lichSu.map((h) => (
            <li key={h.id}>
              <span className="gh-ls__luc">{gioNgay(h.luc)}</span>
              <span className="gh-ls__viec">
                <span className="gh-ls__dong">{NHAN_TRANG_THAI_CHUYEN[h.den_trang_thai] ?? h.den_trang_thai}</span>
                <span className="gh-ls__dong gh-nho">
                  {h.nguoi_thao_tac_name && <span>{h.nguoi_thao_tac_name}</span>}
                  {h.ghi_chu && <span>{h.ghi_chu}</span>}
                  {h.ly_do && <span>Lý do: {h.ly_do}</span>}
                </span>
              </span>
            </li>
          ))}
          <li>
            <span className="gh-ls__luc">{gioNgay(r.created_at)}</span>
            <span className="gh-ls__viec">
              <span className="gh-ls__dong">Gửi yêu cầu giao</span>
              <span className="gh-ls__dong gh-nho">
                {r.created_by_name && <span>{r.created_by_name}</span>}
                {r.order_code && <span>từ đơn {r.order_code}</span>}
              </span>
            </span>
          </li>
        </ul>
      )}
    </NganPhai>
  );
}
