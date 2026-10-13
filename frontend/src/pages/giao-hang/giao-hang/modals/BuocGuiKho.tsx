// Bước ĐỀ NGHỊ XUẤT KHO — hẹn kho sau Lên đơn / Lên lượt (mg 0400, chủ chốt 12/10/2026,
// docs/mockups/giao-hang-buoc-gui-kho). Hai ô giờ lấy hàng / dự kiến giao của chuyến đã gỡ; giờ kho
// cần soạn xong hàng nằm ngay trên đề nghị xuất (Cần lúc), đúng cột kho vẫn đọc.
//
//   Lên đơn xong  — ngăn Lên đơn chuyển sang bước này (`moi`): đề nghị đã gửi kho, đây chỉ hẹn giờ.
//   Sửa sau       — nút Sửa ở dòng "Yêu cầu xuất kho" tab Chứng từ của ngăn lượt. Còn sửa được tới
//                   lúc kho lập phiếu (máy chủ chặn sau đó).
//
// Lượt nhiều khách: mỗi khách một đề nghị (phiếu in ra phải đúng một khách) nhưng chung MỘT xe tới
// lấy ⇒ một ô Cần lúc chung, ghi chú cho kho thì riêng từng đề nghị. Hàng khoá theo yêu cầu giao.
import { useEffect, useState } from "react";
import type { DeNghiKhoGiao } from "../../../../api/client";
import { api } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { ChonGio, ChonNgay } from "../../../../components/ChonNgay";
import { todayISO } from "../../../khoShared";
import { NganPhai } from "../../../ke-toan/shared/NganPhai";
import { ngayThuan } from "../shared/helpers";
import "../../../ke-toan/ke-toan.css";

const CHON_NGAY: { nhan: string; ngay: number }[] = [
  { nhan: "Hôm nay", ngay: 0 },
  { nhan: "Mai", ngay: 1 },
  { nhan: "+3 ngày", ngay: 3 },
];

function cachHomNay(n: number): string {
  const d = new Date(`${todayISO()}T00:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const soDoc = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });

export function BuocGuiKho({
  tripIds,
  token,
  moi = false,
  bao,
  canhBao = [],
  tang = 0,
  onXong,
}: {
  tripIds: number[];
  token: string;
  /** Vừa lên đơn: nút trái là "Để sau" và có câu nhắc đề nghị đang giữ ngày cần giao. */
  moi?: boolean;
  /** Dòng báo đầu ngăn, vd "Đã lên đơn … Kho thành phẩm đã nhận đề nghị." */
  bao?: string;
  /** Câu nhắc không chặn của bước lên đơn (tài xế đang ôm chuyến ở lượt khác…). */
  canhBao?: string[];
  /** 1 = mở chồng lên ngăn lượt (nút Sửa ở tab Chứng từ). */
  tang?: number;
  /** `daLuu` = vừa hẹn kho xong (màn ngoài nạp lại). */
  onXong: (daLuu: boolean) => void;
}) {
  const [ds, setDs] = useState<DeNghiKhoGiao[] | null>(null);
  const [ngay, setNgay] = useState("");
  const [gio, setGio] = useState("");
  const [ghiChu, setGhiChu] = useState<Record<number, string>>({});
  const [doi, setDoi] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const khoaTrip = tripIds.join(",");

  useEffect(() => {
    let bo = false;
    api.giaoHang.deNghiKho(token, tripIds)
      .then((r) => {
        if (bo) return;
        setDs(r);
        // Mở ra: ngày đang hẹn sớm nhất (vừa lên đơn thì là ngày cần giao), giờ chỉ điền khi mọi
        // đề nghị cùng một giờ — khác nhau thì để trống cho người hẹn lại một giờ chung.
        const ngays = r.map((d) => d.ngay_can ?? d.ngay_can_giao).filter((x): x is string => !!x).sort();
        setNgay(ngays[0] ?? todayISO());
        const gios = new Set(r.map((d) => (d.can_luc ? d.can_luc.slice(11, 16) : "")));
        setGio(gios.size === 1 ? [...gios][0] : "");
        setGhiChu(Object.fromEntries(r.map((d) => [d.trip_id, d.ghi_chu ?? ""])));
      })
      .catch((e: unknown) => { if (!bo) setLoi(e instanceof Error ? e.message : "Không mở được đề nghị xuất kho"); });
    return () => { bo = true; };
  }, [token, khoaTrip]); // eslint-disable-line react-hooks/exhaustive-deps

  const suaDuoc = (ds ?? []).filter((d) => d.sua_duoc);
  const motDon = (ds?.length ?? tripIds.length) === 1;
  const khoa = suaDuoc.length === 0;

  const luu = () => {
    setLoi(null);
    setDangGui(true);
    api.giaoHang.henKho(token, {
      ngay_can: ngay,
      gio_can: gio || null,
      dong: suaDuoc.map((d) => ({ trip_id: d.trip_id, ghi_chu: (ghiChu[d.trip_id] ?? "").trim() || null })),
    })
      .then(() => onXong(true))
      .catch((e: unknown) => setLoi(e instanceof Error ? e.message : "Không lưu được hẹn kho"))
      .finally(() => setDangGui(false));
  };

  const datGhi = (tripId: number, v: string) => {
    setDoi(true);
    setGhiChu((cu) => ({ ...cu, [tripId]: v }));
  };

  const goi = moi
    ? motDon
      ? "Để sau thì đề nghị giữ ngày cần giao."
      : `Lưu là cả ${ds?.length ?? tripIds.length} đề nghị nhận cùng Cần lúc.`
    : khoa ? "" : motDon ? "" : `Lưu là ${suaDuoc.length} đề nghị nhận cùng Cần lúc.`;

  const chan = (
    <>
      <span className="gh-nho">{goi}</span>
      <span className="rc__spacer" />
      <Button variant="ghost" onClick={() => onXong(false)}>{moi ? "Để sau" : "Đóng"}</Button>
      {!khoa && (
        <Button variant="accent" disabled={!ds || !ngay || dangGui} onClick={luu}>Lưu cho kho</Button>
      )}
    </>
  );

  const d0 = ds?.[0];
  return (
    <NganPhai
      duongDan="Giao hàng"
      tieuDe="Đề nghị xuất kho"
      the={<span className="gh-the">{motDon ? d0?.ma ?? "…" : `${ds?.length ?? tripIds.length} đề nghị`}</span>}
      chan={chan}
      onDong={() => onXong(false)}
      chanDong={() => doi}
      cauHoiBo="Bỏ hẹn kho đang nhập?"
      tang={tang}
    >
      <div className="gh-gk">
        {bao && <div className="banner banner--success" role="status" style={{ margin: 0 }}>{bao}</div>}
        {canhBao.map((c) => (
          <div key={c} className="banner banner--warn" role="status" style={{ margin: 0 }}>{c}</div>
        ))}
        {ds && khoa && (
          <div className="banner banner--info" role="status" style={{ margin: 0 }}>
            Kho đã lập phiếu nên không hẹn lại được nữa.
          </div>
        )}

        {ds === null ? (
          !loi && <p className="gh-nho">Đang mở đề nghị…</p>
        ) : (
          <>
            <section className="gh-gk__nhom">
              <div className="gh-gk__muc">
                Cần lúc <span className="gh-nho">{motDon ? "kho soạn xong hàng trước giờ này" : "chung cho cả lượt"}</span>
              </div>
              <div className="gh-gk__hang">
                <ChonNgay className="gh-gk__o" aria-label="Ngày cần" value={ngay} min={khoa ? undefined : todayISO()}
                  disabled={khoa} required onChange={(v) => { setDoi(true); setNgay(v); }} />
                <ChonGio className="gh-gk__o gh-gk__o--gio" aria-label="Giờ cần" value={gio} disabled={khoa}
                  onChange={(v) => { setDoi(true); setGio(v); }} />
                {!khoa && (
                  <span className="gh-gk__chip" role="group" aria-label="Chọn nhanh ngày cần">
                    {CHON_NGAY.map((c) => {
                      const n = cachHomNay(c.ngay);
                      return (
                        <button key={c.nhan} type="button" className={ngay === n ? "is-chon" : undefined}
                          aria-pressed={ngay === n} onClick={() => { setDoi(true); setNgay(n); }}>
                          {c.nhan}
                        </button>
                      );
                    })}
                  </span>
                )}
              </div>
              {!khoa && (
                <p className="gh-ld__goi">
                  {moi
                    ? motDon ? "Mở ra là ngày cần giao của yêu cầu." : `Mở ra là ngày cần giao sớm nhất trong ${ds.length} yêu cầu.`
                    : ""}
                  {" "}Để trống giờ thì kho chỉ thấy ngày.
                </p>
              )}
            </section>

            {motDon && d0 ? (
              <>
                <section className="gh-gk__nhom">
                  <div className="gh-gk__muc">Hàng xuất <span className="gh-nho">theo yêu cầu giao, không sửa ở đây</span></div>
                  <table className="gh-hop__bang gh-gk__bang">
                    <thead>
                      <tr><th>Hàng</th><th className="r">Số lượng</th><th>Xuất từ kho</th></tr>
                    </thead>
                    <tbody>
                      {d0.hang.map((h, i) => (
                        <tr key={i}>
                          <td>{h.ten ?? "—"}{h.ma && <span className="gh-the">{h.ma}</span>}</td>
                          <td className="r gh-num">{soDoc(h.so_luong)}{h.dvt && <span className="gh-nho"> {h.dvt}</span>}</td>
                          <td>{d0.kho_ten ?? "Kho thành phẩm"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <section className="gh-gk__nhom">
                  <label className="gh-gk__muc" htmlFor="gh-gk-ghi">Ghi chú cho kho <span className="gh-nho">không bắt buộc</span></label>
                  <textarea id="gh-gk-ghi" className="input gh-ld__nhap" rows={3} maxLength={500} disabled={khoa}
                    value={ghiChu[d0.trip_id] ?? ""} placeholder="Ví dụ: đóng thùng 50 cuốn, dán tem khách"
                    onChange={(e) => datGhi(d0.trip_id, e.target.value)} />
                </section>
              </>
            ) : (
              <section className="gh-gk__nhom">
                <div className="gh-gk__muc">
                  {ds.length} đề nghị <span className="gh-nho">hàng khoá theo yêu cầu giao, xuất từ {d0?.kho_ten ?? "Kho thành phẩm"}</span>
                </div>
                <div className="gh-gk__cuon">
                  <table className="gh-hop__bang gh-gk__bang">
                    <thead>
                      <tr><th>Đề nghị</th><th>Khách</th><th>Đơn</th><th>Hàng</th><th className="r">Số lượng</th><th>Ghi chú cho kho</th></tr>
                    </thead>
                    <tbody>
                      {ds.map((d) => (
                        <tr key={d.id}>
                          <td><span className="gh-the">{d.ma}</span></td>
                          <td>{d.customer_name ?? "—"}</td>
                          <td>{d.order_code ? <span className="gh-the">{d.order_code}</span> : "—"}</td>
                          <td>{d.hang.map((h, i) => <div key={i}>{h.ten ?? "—"}</div>)}</td>
                          <td className="r gh-num">
                            {d.hang.map((h, i) => (
                              <div key={i}>{soDoc(h.so_luong)}{h.dvt && <span className="gh-nho"> {h.dvt}</span>}</div>
                            ))}
                          </td>
                          <td>
                            {d.sua_duoc ? (
                              <input className="input gh-gk__ghi" maxLength={500} aria-label={`Ghi chú cho kho ${d.ma}`}
                                placeholder="Thêm ghi chú" value={ghiChu[d.trip_id] ?? ""}
                                onChange={(e) => datGhi(d.trip_id, e.target.value)} />
                            ) : (
                              <span className="gh-nho">{d.ghi_chu || "Kho đã lập phiếu"}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {!moi && d0?.ngay_can_giao && motDon && (
              <p className="gh-ld__goi">Khách cần hàng ngày {ngayThuan(d0.ngay_can_giao)}.</p>
            )}
          </>
        )}
        {loi && <div className="banner banner--error" role="alert" style={{ margin: 0 }}>{loi}</div>}
      </div>
    </NganPhai>
  );
}
