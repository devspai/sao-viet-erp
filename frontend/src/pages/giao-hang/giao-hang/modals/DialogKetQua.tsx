// Hộp NHẬP KẾT QUẢ GIAO tại khách — phương án A (docs/mockups/nhap-ket-qua-giao-3-phuong-an.html,
// 13/10/2026): hộp thoại giữa màn cùng khuôn hộp Bắt đầu giao, thay ngăn kéo cao hết màn.
//   • Tiêu đề là tên khách và điểm thứ mấy của lượt; kết quả là ba ô bấm.
//   • Chuyến trong lượt: số đồng hồ lúc tới khách. SỐ TRƯỚC là số của ĐIỂM LIỀN TRƯỚC trên lộ trình
//     (điểm 1 thì là số rời kho), luôn đứng cạnh nhãn; gõ thấp hơn số đó là chặn (máy chủ cũng chặn).
//   • Nhận đủ thì số hàng là chữ; nhận thiếu mới mở ô gõ từng món.
//   • Người nhận lấy sẵn người nhận của yêu cầu, bấm "Người khác nhận" mới gõ.
//   • Nút Lưu luôn đậm; thiếu ô nào báo đỏ ngay dưới ô đó.
// ⚠️ Ô `km` (chuyến ngoài lượt) và ô SỐ ĐỒNG HỒ nuôi TIỀN KHOÁN KM của tài xế, và payload
// `ghiKetQua` là logic nghiệp vụ — sửa thì sửa có chủ đích.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { crud, type Row } from "../../../../api/rebuildCatalog";
import type { DeliveryTrip, KetQuaInput, LuotXeChiTiet } from "../../../../api/client";
import { api } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { OGoDinhDang } from "../../../../components/OGoDinhDang";
import { gomCum, nhanCum } from "../../gomCum";
import { so } from "../shared/helpers";
import type { DongConLai } from "../shared/types";

type KetQua = "thanh_cong" | "giao_thieu" | "that_bai";

const KET_QUA: { id: KetQua; nhan: string; tone: string }[] = [
  { id: "thanh_cong", nhan: "Nhận đủ", tone: "la" },
  { id: "giao_thieu", nhan: "Nhận thiếu", tone: "vang" },
  { id: "that_bai", nhan: "Không giao được", tone: "do" },
];

const LY_DO_HAY_GAP = ["Khách đóng cửa", "Không liên lạc được", "Khách hẹn ngày khác", "Sai địa chỉ"];

/** Số trước của điểm này trên lộ trình: điểm liền trước gần nhất đã có số, không có thì số rời kho.
 *  Lộ trình (`luot.diem`) đã xếp theo thứ tự chặng ở máy chủ. `nhan` đứng cạnh nhãn ô, `o` nằm
 *  trong câu ("số ở …"), `tu` trong câu chặng ("chặng từ … tới đây"). */
type SoTruoc = { so: number; nhan: string; o: string; tu: string };
function soTruoc(trip: DeliveryTrip, lo: LuotXeChiTiet | null): SoTruoc | null {
  const l = trip.luot;
  if (!l) return null;
  const ds = lo?.diem ?? [];
  const i = ds.findIndex((d) => d.id === trip.id);
  for (let k = i - 1; k >= 0; k--) {
    const s = ds[k].luot?.so_dong_ho;
    if (s == null) continue;
    const nhan = `Điểm ${k + 1} ${ds[k].customer_name ?? ""}`.trim();
    return { so: s, nhan, o: `điểm ${k + 1} ${ds[k].customer_name ?? ""}`.trim(), tu: `điểm ${k + 1}` };
  }
  if (i < 0 && l.so_dong_ho_gan_nhat != null)
    return { so: l.so_dong_ho_gan_nhat, nhan: "Số trước", o: "điểm trước", tu: "điểm trước" };
  return l.so_dong_ho_xuat_phat != null
    ? { so: l.so_dong_ho_xuat_phat, nhan: "Rời kho", o: "lúc rời kho", tu: "rời kho" }
    : null;
}

export function DialogKetQua({
  trip,
  luotCt = null,
  token,
  onClose,
  onXong,
}: {
  trip: DeliveryTrip;
  /** Cả lượt của chuyến (lộ trình đã xếp) — để biết điểm thứ mấy và số của điểm liền trước. */
  luotCt?: LuotXeChiTiet | null;
  token: string;
  onClose: () => void;
  onXong: () => void;
}) {
  const luot = trip.luot ?? null;
  const [ketQua, setKetQua] = useState<KetQua>("thanh_cong");
  const [km, setKm] = useState("");
  const [soDongHo, setSoDongHo] = useState("");
  const coTenSan = !!trip.nguoi_nhan?.trim();
  const [nguoiKhac, setNguoiKhac] = useState(!coTenSan);
  const [nguoiNhan, setNguoiNhan] = useState("");
  const [lyDo, setLyDo] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [baoThieu, setBaoThieu] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [xacNhanKm, setXacNhanKm] = useState(false);
  const [hoiXacNhan, setHoiXacNhan] = useState(false);
  const [xeId, setXeId] = useState(trip.vehicle_id ? String(trip.vehicle_id) : "");
  const [xeDs, setXeDs] = useState<Row[]>([]);
  const [nhan, setNhan] = useState<Record<number, string>>({});
  const [conLai, setConLai] = useState<DongConLai[] | null>(null);

  useEffect(() => {
    if (trip.luot) return;
    crud("/api/xe").list(token, { active: true })
      .then(async (r) => {
        const ds = r.items;
        if (trip.vehicle_id && !ds.some((x) => x.id === trip.vehicle_id)) {
          const cu = await crud("/api/xe").get(token, trip.vehicle_id).catch(() => null);
          if (cu) ds.push(cu);
        }
        setXeDs(ds);
      })
      .catch(() => setXeDs([]));
  }, [token, trip.vehicle_id, trip.luot]);

  useEffect(() => {
    api.giaoHang
      .request(token, trip.request_id)
      .then((d) => {
        const ds = d.request.lines
          .map((l) => ({
            order_line_id: l.order_line_id,
            mo_ta: l.mo_ta,
            don_vi_tinh: l.don_vi_tinh,
            con: l.qty - l.da_giao,
            cum_khoa: l.cum_khoa, cum_ten: l.cum_ten, cum_dvt: l.cum_dvt,
          }))
          .filter((l) => l.con > 0);
        setConLai(ds);
        setNhan(Object.fromEntries(
          gomCum(ds).map((c) => [c.dau.order_line_id, String(Math.min(...c.dong.map((d) => d.con)))]),
        ));
      })
      .catch(() => setConLai([]));
  }, [token, trip.request_id]);

  // `conLai` null = đang tải hàng của yêu cầu ⇒ chưa có cụm nào.
  const cum = gomCum(conLai ?? []);
  const truoc = soTruoc(trip, luotCt);
  const soGo = soDongHo === "" ? null : Number(soDongHo);
  // Gõ dở thì số nào cũng nhỏ — chỉ báo thấp khi đã gõ đủ số chữ số của số trước.
  const thap = truoc != null && soGo != null && soGo < truoc.so
    && soDongHo.length >= String(truoc.so).length;
  const chang = soGo != null && truoc != null && soGo >= truoc.so ? soGo - truoc.so : null;
  const kmLon = !luot && ((km === "" ? 0 : Number(km)) > 500 || hoiXacNhan);
  const nhanHang = ketQua !== "that_bai";
  const ten = nguoiKhac ? nguoiNhan.trim() : (trip.nguoi_nhan ?? "").trim();
  const tongCon = cum.reduce((s, c) => s + Math.min(...c.dong.map((d) => d.con)), 0);
  const tongNhan = cum.reduce((s, c) => s + Number(nhan[c.dau.order_line_id] ?? 0), 0);

  const thieuSo = luot ? soDongHo === "" : km === "";
  const thieuTen = nhanHang && !ten;
  const thieuLyDo = ketQua === "that_bai" && !lyDo.trim();

  const gui = () => {
    setBaoThieu(true);
    if (thieuSo || thieuTen || thieuLyDo || thap || (kmLon && !xacNhanKm)) return;
    setLoi(null);
    const body: KetQuaInput = {
      ket_qua: ketQua,
      ...(luot ? { so_dong_ho: Number(soDongHo) } : { km: Number(km) }),
      xac_nhan_km_lon: xacNhanKm,
    };
    if (xeId && !luot) body.vehicle_id = Number(xeId);
    if (nhanHang) body.nguoi_nhan_thuc_te = ten;
    // Cụm bán nhận cùng nhau: gửi dòng đầu cụm, máy chủ ghi cho mọi dòng của cụm.
    if (ketQua === "giao_thieu")
      body.so_thuc_nhan = cum.map((c) => ({
        order_line_id: c.dau.order_line_id,
        qty: Number(nhan[c.dau.order_line_id] ?? 0),
      }));
    if (ketQua === "that_bai") {
      body.ly_do_that_bai = lyDo.trim();
      body.huong_xu_ly = "tra_ve";
    }
    setDangGui(true);
    api.giaoHang
      .ghiKetQua(token, trip.id, body)
      .then(onXong)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Không ghi được kết quả";
        setLoi(msg);
        if (msg.includes("bất thường")) {
          setXacNhanKm(false);
          setHoiXacNhan(true);
        }
      })
      .finally(() => setDangGui(false));
  };

  const stt = luotCt ? luotCt.diem.findIndex((d) => d.id === trip.id) : -1;
  const phuDe = luot
    ? `${stt >= 0 ? `Điểm ${stt + 1} trên ${luotCt!.diem.length} của lượt` : "Lượt"} ${luot.code}. Yêu cầu ${trip.request_code ?? ""}`
    : `Yêu cầu ${trip.request_code ?? ""}`;

  return createPortal(
    <ConfirmDialog
      open
      title={`Tới ${trip.customer_name ?? trip.request_code ?? ""}`}
      cancelLabel="Thôi"
      confirmLabel="Lưu kết quả"
      busy={dangGui}
      error={loi}
      confirmDisabled={thap}
      onConfirm={gui}
      closeOnBackdrop={false}
      onCancel={onClose}
    >
      <div className="gh-kq">
        <p className="gh-kq__phu">{phuDe}</p>

        <span className="gh-kq__nhan" id="gh-kq-kq">Kết quả</span>
        <div className="gh-kq__chon" role="radiogroup" aria-labelledby="gh-kq-kq">
          {KET_QUA.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={ketQua === k.id}
              className={ketQua === k.id ? `is-${k.tone}` : undefined}
              onClick={() => setKetQua(k.id)}>
              {k.nhan}
            </button>
          ))}
        </div>

        {luot ? (
          <>
            <label className="gh-kq__nhan gh-kq__nhan--hai" htmlFor="gh-kq-so">
              <span>Số đồng hồ lúc tới khách</span>
              {truoc && <span>{truoc.nhan} <em>{so(truoc.so)} km</em></span>}
            </label>
            <span className={`gh-dh__o${(baoThieu && thieuSo) || thap ? " is-loi" : ""}`}>
              <OGoDinhDang id="gh-kq-so" autoFocus inputMode="numeric" autoComplete="off"
                placeholder="Đọc số trên đồng hồ xe"
                value={soDongHo === "" ? "" : so(Number(soDongHo))}
                onChange={(e) => setSoDongHo(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9))} />
              <span>km</span>
            </span>
            {thap ? (
              <p className="gh-kq__loi">
                Thấp nhất là {so(truoc!.so)} km, số {truoc!.o === "lúc rời kho" ? "" : "ở "}{truoc!.o}.
                {" "}Đồng hồ không chạy lùi, đọc lại số trên đồng hồ xe.
              </p>
            ) : baoThieu && thieuSo ? (
              <p className="gh-kq__loi">Gõ số đồng hồ lúc tới khách</p>
            ) : chang != null && truoc ? (
              <p className="gh-kq__chang">
                <span>Chặng từ {truoc.tu} tới đây</span>
                <span className="gh-kq__km">{so(chang)} km</span>
              </p>
            ) : null}
          </>
        ) : (
          <>
            <label className="gh-kq__nhan" htmlFor="gh-kq-km">Số km thực tế</label>
            <span className={`gh-dh__o${baoThieu && thieuSo ? " is-loi" : ""}`}>
              {/* type=number: trên máy tính gõ chữ không lọt vào; min 0 vì 0 km là số THẬT. */}
              <input id="gh-kq-km" type="number" min="0" step="1" autoFocus autoComplete="off" value={km}
                onChange={(e) => setKm(e.target.value)} />
              <span>km</span>
            </span>
            {baoThieu && thieuSo && <p className="gh-kq__loi">Gõ số km thực tế</p>}
            {xeDs.length > 0 && (
              <>
                <label className="gh-kq__nhan" htmlFor="gh-kq-xe">Xe đã chạy chuyến</label>
                <select id="gh-kq-xe" className="input" value={xeId} onChange={(e) => setXeId(e.target.value)}>
                  <option value="">Chọn xe</option>
                  {xeDs.map((x) => (
                    <option key={x.id} value={x.id}>
                      {String(x.ma ?? "")}{x.ten ? ` ${String(x.ten)}` : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
            {kmLon && (
              <label className="gh-kq__xn">
                <input type="checkbox" checked={xacNhanKm} onChange={(e) => setXacNhanKm(e.target.checked)} />
                Xác nhận {km} km là đúng
              </label>
            )}
          </>
        )}

        {nhanHang && (
          <>
            <span className="gh-kq__nhan">
              {ketQua === "thanh_cong" ? "Khách nhận" : "Khách nhận được bao nhiêu"}
            </span>
            {conLai === null && <p className="gh-kq__phu">Đang tải hàng của yêu cầu…</p>}
            {conLai?.length === 0 && <p className="gh-kq__phu">Không còn hàng nào để giao.</p>}
            <ul className="gh-kq__hang">
              {cum.map((c) => {
                const conCum = Math.min(...c.dong.map((d) => d.con));
                return (
                  <li key={c.dau.order_line_id}>
                    <span>
                      {nhanCum(c)}
                      {ketQua === "giao_thieu" && <small>đi {so(conCum)} {c.donVi}</small>}
                    </span>
                    {ketQua === "thanh_cong" ? (
                      <span className="gh-kq__sl">{so(conCum)} {c.donVi}</span>
                    ) : (
                      <span className="gh-kq__sl">
                        <input type="number" min="0" step="1" max={conCum}
                          aria-label={`Số thực nhận — ${c.ten}`}
                          value={nhan[c.dau.order_line_id] ?? ""}
                          onChange={(e) => setNhan((p) => ({ ...p, [c.dau.order_line_id]: e.target.value }))} />
                        {" "}{c.donVi}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {ketQua === "giao_thieu" && tongCon > tongNhan && (
              <p className="gh-kq__phu">Phần khách không nhận quay về kho, máy tự lập đề nghị nhập trả.</p>
            )}

            <span className="gh-kq__nhan">Người nhận</span>
            {nguoiKhac ? (
              <>
                <input className={`input${baoThieu && thieuTen ? " is-loi" : ""}`} aria-label="Người nhận hàng"
                  value={nguoiNhan} placeholder="Tên người nhận" autoFocus={coTenSan}
                  onChange={(e) => setNguoiNhan(e.target.value)} />
                {baoThieu && thieuTen && <p className="gh-kq__loi">Gõ tên người nhận hàng</p>}
                {coTenSan && (
                  <Button variant="ghost" onClick={() => { setNguoiKhac(false); setNguoiNhan(""); }}>
                    Là {trip.nguoi_nhan}
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="gh-kq__ten">{trip.nguoi_nhan}</div>
                <p className="gh-kq__phu">Người nhận trên yêu cầu giao</p>
                <Button variant="ghost" onClick={() => setNguoiKhac(true)}>Người khác nhận</Button>
              </>
            )}
          </>
        )}

        {ketQua === "that_bai" && (
          <>
            <label className="gh-kq__nhan" htmlFor="gh-kq-ly-do">Lý do</label>
            <div className="gh-kq__ly-do">
              {LY_DO_HAY_GAP.map((x) => (
                <button key={x} type="button" aria-pressed={lyDo === x}
                  className={lyDo === x ? "is-chon" : undefined} onClick={() => setLyDo(x)}>
                  {x}
                </button>
              ))}
            </div>
            <input id="gh-kq-ly-do" className={`input${baoThieu && thieuLyDo ? " is-loi" : ""}`}
              value={lyDo} placeholder="Hoặc gõ lý do khác" onChange={(e) => setLyDo(e.target.value)} />
            {baoThieu && thieuLyDo && <p className="gh-kq__loi">Chọn hoặc gõ lý do</p>}
            <div className="banner banner--warn" role="status">
              Hàng của lần này quay về kho. Muốn giao lại thì lập yêu cầu giao mới.
            </div>
          </>
        )}
      </div>
    </ConfirmDialog>,
    document.body,
  );
}
