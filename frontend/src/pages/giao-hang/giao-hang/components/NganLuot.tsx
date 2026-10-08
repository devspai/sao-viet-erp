// Ngăn chi tiết một dòng của tab "Đơn giao hàng" (06/10/2026, mockup
// docs/mockups/giao-hang-phuong-an-B-chi-tiet.html) — vỏ `NganPhai` chung của hệ thống, 1180px.
//
//   Lộ trình — Rời kho → thẻ từng khách (nơi giao, người nhận, hẹn, lưu ý, hàng, kết quả) → Về kho.
//              Bước CẢ LƯỢT (gửi kho, lấy hàng, xuất phát, về kho) ở đầu ngăn; việc của RIÊNG một
//              điểm (nhập kết quả, trả hàng, đổi/huỷ) ở thẻ điểm đó.
//   Chứng từ — MỖI ĐƠN một bộ giấy tờ (chủ chốt "cách 1"): cột trái các đơn của lượt, bên phải chỉ
//              giấy tờ và tệp của đơn đang chọn (bảng hàng Yêu cầu / Đã giao / Còn nằm ở thẻ điểm
//              bên Lộ trình — nói một lần). Một chuyến = một đơn trong lượt, nên phiếu kho và tệp
//              đã gắn đúng đơn sẵn — không gom chung cả lượt.
//   Lịch sử  — các mốc trạng thái của mọi điểm, mới nhất trước.
//
// Đơn NHÀ GIA CÔNG GIAO THẲNG không xe, không kíp, không km: cột thuộc tính nói nhà gia công, lệnh
// nguồn, ngày khách nhận, người ghi nhận.
// Phương án A (docs/mockups/giao-hang-lam-lai-3-phuong-an.html, 07/10/2026): tóm tắt là dải chữ
// thường không đóng hộp, tab không mang số đếm, không nói lặp trạng thái / số lượng / mã.
// Ngăn MỘT đơn (chuyến lẻ, giao thẳng) theo phương án A của docs/mockups/giao-hang-chi-tiet-3-phuong-an.html
// (07/10/2026): bỏ thẻ viền, thân là các nhóm nhãn trái giá trị phải (`ChiTietDon`), nút của chuyến
// lên đầu ngăn. Lượt nhiều điểm vẫn giữ thẻ từng điểm trên lộ trình.
// Ngăn MỘT đơn theo kiểu 3 của ngăn Phiếu thu (08/10/2026): mã yêu cầu là tiêu đề + chip trạng thái chữ
// thường; thân trái là khách + lưu ý + lưới hàng kiểu bảng tính; mọi ô ngắn (nơi giao, người nhận, xe,
// nhà gia công, kết quả…) dồn vào cột thuộc tính bên phải (`RayThuocTinh`). Tab Chứng từ dùng lưới giấy
// tờ + ô kéo-thả tệp của kế toán (`TabChungTu`) cho cả ngăn lượt.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  BangGiaoItem, DeliveryHistory, DeliveryRequestDetail, DeliveryRequestLine, DeliveryTrip, DinhKemChuyen,
  LuotXeChiTiet,
} from "../../../../api/client";
import { api } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { Cum, TheNho } from "../../../ke-toan/shared/Cum";
import { RayThuocTinh } from "../../../ke-toan/shared/LuoiGon";
import { NganPhai } from "../../../ke-toan/shared/NganPhai";
import { TabChungTu } from "../../../ke-toan/shared/TabChungTu";
import { NHAN_TRANG_THAI_CHUYEN } from "../shared/constants";
import {
  buocLuot,
  coKetQua,
  gioNgay,
  lienKetBanDo,
  ngay,
  ngayIso,
  nhanChuyen,
  sdtDoc,
  soVoiHen,
  so,
  toneChuyen,
  trangThaiLuot,
  type BuocLuot,
  type FormLuot,
} from "../shared/helpers";
import { NutBuocChuyen, type ThaoTacChuyen } from "../tabs/BangKeHoach";
import { FormSoDongHo } from "./FormSoDongHo";
import { CHUA_CAM_HANG, ChipGh, Pill, TraHang } from "./giaoHangCells";
import "../../../ke-toan/ke-toan.css";

type Tab = "lo-trinh" | "chung-tu" | "lich-su";

/** Ô tóm tắt hai tầng: giá trị + dòng phụ nhỏ. Dải tóm tắt là một hàng chữ thường dưới tiêu đề
 *  (phương án A, 07/10/2026) — không dùng khối nền xám `tomTat` của NganPhai: ô dữ liệu không đóng hộp. */
const o2 = (chinh: ReactNode, phu?: ReactNode) => (
  <>
    {chinh}
    {phu != null && phu !== "" && <small className="gh-tom-phu">{phu}</small>}
  </>
);

export function NganLuot({
  item,
  token,
  canPlan,
  canWrite,
  formDau = null,
  onDoi,
  onDong,
  len,
  xuong,
  onDoiChuyen,
  ...tt
}: {
  item: BangGiaoItem;
  token: string;
  canPlan: boolean;
  canWrite: boolean;
  /** Bấm nút cần ô nhập ở dòng bảng ⇒ ngăn mở sẵn ô đó. */
  formDau?: FormLuot | null;
  /** Có thao tác làm đổi trạng thái ⇒ bảng (và ngăn) tải lại. */
  onDoi: () => void;
  onDong: () => void;
  len?: () => void;
  xuong?: () => void;
  onDoiChuyen?: (t: DeliveryTrip) => void;
} & ThaoTacChuyen) {
  const l = item.luot;
  const ds: DeliveryTrip[] = l ? l.diem : item.trip ? [item.trip] : [];
  const dau = ds[0];
  const gt = !l ? item.trip?.giao_thang ?? null : null;

  const [tab, setTab] = useState<Tab>("lo-trinh");
  const [mo, setMo] = useState<FormLuot | null>(formDau);
  const [ghiChu, setGhiChu] = useState("");
  const [dangGui, setDangGui] = useState(false);
  const [tin, setTin] = useState<string | null>(null);
  const [canhBao, setCanhBao] = useState<string[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [chiTiet, setChiTiet] = useState<Record<number, DeliveryRequestDetail>>({});
  const [chonDon, setChonDon] = useState<number | null>(dau?.id ?? null);
  const [demTep, setDemTep] = useState<Record<number, number>>({});

  // Lịch sử nằm ở chi tiết YÊU CẦU — nạp lại mỗi khi một điểm đổi trạng thái. Bảng hàng KHÔNG chờ
  // nó nữa: bảng giao gửi kèm `t.hang` (07/10/2026), chi tiết chỉ là đường dự phòng.
  const dsRef = useRef(ds);
  dsRef.current = ds;
  const khoaCt = ds.map((t) => `${t.request_id}:${t.trang_thai}:${t.tra_hang_trang_thai ?? ""}`).join("|");
  useEffect(() => {
    let thoi = false;
    Promise.all(dsRef.current.map((t) => api.giaoHang.request(token, t.request_id)
      .then((d) => [t.request_id, d] as const)
      .catch(() => null)))
      .then((kq) => {
        if (!thoi) setChiTiet(Object.fromEntries(kq.filter((x) => x != null)));
      });
    return () => {
      thoi = true;
    };
  }, [token, khoaCt]);

  // Số tệp của từng đơn cho cột trái tab Chứng từ — đếm một lần lúc mở tab.
  const daDemTep = useRef(false);
  useEffect(() => {
    if (tab !== "chung-tu" || daDemTep.current || dsRef.current.length < 2) return;
    daDemTep.current = true;
    Promise.all(dsRef.current.map((t) => api.giaoHang.dinhKemChuyen(token, t.id)
      .then((r) => [t.id, r.items.length] as const)
      .catch(() => null)))
      .then((kq) => setDemTep((c) => ({ ...Object.fromEntries(kq.filter((x) => x != null)), ...c })));
  }, [tab, token]);

  // Dòng báo THÀNH CÔNG tự tắt; cảnh báo thì giữ tới lần bấm sau — nó cần người đọc.
  useEffect(() => {
    if (!tin) return;
    const h = window.setTimeout(() => setTin(null), 8000);
    return () => window.clearTimeout(h);
  }, [tin]);

  if (!dau) return null;

  const lam = (b: Extract<BuocLuot, { lam: unknown }>) => {
    setLoi(null);
    setTin(null);
    setCanhBao([]);
    setDangGui(true);
    b.lam(token)
      .then((r) => {
        setTin(b.bao(r));
        setCanhBao(r.canh_bao);
        setMo(null);
        onDoi();
      })
      .catch((e: unknown) => setLoi(e instanceof Error ? e.message : "Không thao tác được"))
      .finally(() => setDangGui(false));
  };
  const moO = (f: FormLuot) => {
    setTin(null);
    setCanhBao([]);
    setLoi(null);
    setTab("lo-trinh");
    setMo(f);
  };

  const buoc = l ? buocLuot(l, canPlan, canWrite) : [];
  const tinh = l ? trangThaiLuot(l) : { text: nhanChuyen(dau), tone: toneChuyen(dau.trang_thai) };
  const xong = ds.filter(coKetQua).length;

  // Lịch sử gộp mọi điểm. Mỗi yêu cầu một sổ riêng — id không trùng giữa hai sổ.
  const lichSu: (DeliveryHistory & { khach: string | null })[] = ds
    .flatMap((t) => (chiTiet[t.request_id]?.lich_su ?? []).map((h) => ({ ...h, khach: t.customer_name })))
    .sort((a, b) => (a.luc < b.luc ? 1 : -1));

  const tomTat = l
    ? [
        { nhan: "Xe", giaTri: o2(l.xe_bien_so ?? "—", l.xe_ten) },
        { nhan: "Kíp", giaTri: o2(dau.employee_name ?? "—", dau.phu_xe_name ? `phụ xe ${dau.phu_xe_name}` : null) },
        {
          nhan: "Xuất phát",
          giaTri: l.so_dong_ho_xuat_phat != null
            ? o2(gioNgay(lucXuatPhat(ds, chiTiet)), `đồng hồ ${so(l.so_dong_ho_xuat_phat)}`)
            : o2("Chưa rời kho", `lấy hàng ${gioNgay(dau.gio_lay_hang)}`),
        },
        { nhan: "Đã chạy", giaTri: o2(`${so(l.tong_km)} km`, `${xong} trên ${ds.length} điểm`) },
      ]
    : [];

  // Nút của MỘT chuyến (không lượt) đứng ở đầu ngăn như mọi ngăn khác (phương án A 07/10/2026);
  // lượt nhiều điểm thì đầu ngăn là bước CẢ LƯỢT, nút riêng nằm ở thẻ từng điểm.
  const nutChuyen = !l ? (
    <>
      <NutBuocChuyen t={dau} tt={tt} />
      {CHUA_CAM_HANG.includes(dau.trang_thai) && onDoiChuyen && (
        <Button variant="ghost" onClick={() => onDoiChuyen(dau)}>Đổi / huỷ chuyến</Button>
      )}
    </>
  ) : undefined;
  const hanhDong = l && mo === null && buoc.length > 0
    ? buoc.map((b, i) => (
        <Button key={b.nhan} variant={i === 0 ? "accent" : "ghost"} disabled={dangGui}
          onClick={() => ("form" in b ? moO(b.form) : lam(b))}>
          {b.nhan}
        </Button>
      ))
    : nutChuyen;

  const theDiem = (t: DeliveryTrip, i: number) => (
    <TheDiem key={t.id} t={t} stt={l ? i + 1 : null} ct={chiTiet[t.request_id]} giaoThang={!!gt}
      nut={
        <>
          {l ? (
            <>
              {t.trang_thai === "dang_giao" && tt.onKetQua && (
                <Button variant="accent" onClick={() => tt.onKetQua!(t)}>Nhập kết quả</Button>
              )}
              <TraHang t={t} onDaTra={tt.onDaTra ? () => tt.onDaTra!(t) : undefined} />
            </>
          ) : (
            <NutBuocChuyen t={t} tt={tt} />
          )}
          {CHUA_CAM_HANG.includes(t.trang_thai) && onDoiChuyen && (
            <Button variant="ghost" onClick={() => onDoiChuyen(t)}>Đổi / huỷ chuyến</Button>
          )}
        </>
      } />
  );

  const tc = ds.find((t) => t.id === chonDon) ?? dau;

  return (
    <NganPhai
      duongDan={l ? "Lượt xe" : gt ? "Nhà gia công giao thẳng" : "Chuyến giao"}
      tieuDe={l ? l.code : <span className="kt-ngan__soLon">{dau.request_code}</span>}
      the={l ? <Pill text={tinh.text} tone={tinh.tone} /> : <ChipGh text={tinh.text} tone={tinh.tone} />}
      hanhDong={hanhDong}
      phuDe={l ? (
        <dl className="gh-kv">
          {tomTat.map((o) => (
            <div key={o.nhan}>
              <dt>{o.nhan}</dt>
              <dd>{o.giaTri}</dd>
            </div>
          ))}
        </dl>
      ) : undefined}
      cot={l ? undefined : <RayDon t={dau} />}
      // Tab không mang số đếm (luật chung).
      tabs={[
        { id: "lo-trinh", nhan: l ? "Lộ trình" : "Chi tiết" },
        { id: "chung-tu", nhan: "Chứng từ" },
        { id: "lich-su", nhan: "Lịch sử" },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as Tab)}
      len={len}
      xuong={xuong}
      onDong={onDong}
      chanDong={() => mo === "gui_kho" && ghiChu.trim() !== ""}
    >
      {tin && <div className="banner banner--success" role="status">{tin}</div>}
      {canhBao.map((c) => (
        <div key={c} className="banner banner--warn" role="status">{c}</div>
      ))}
      {loi && <div className="banner banner--error" role="alert">{loi}</div>}

      {tab === "lo-trinh" && (
        <>
          {l && mo === "gui_kho" && (
            <div className="gh-o-luot gh-form">
              <p className="rc__sub">
                Mỗi điểm một phiếu yêu cầu xuất kho ({l.so_cho_gui_kho} phiếu). Ghi chú phiếu tự mang mã
                lượt để kho biết các phiếu lên cùng một xe.
              </p>
              <label>
                Ghi chú cho kho <span className="gh-opt">(không bắt buộc)</span>
                <input className="input" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
              </label>
              <div className="gh-actions">
                <Button variant="accent" disabled={dangGui}
                  onClick={() => lam({
                    nhan: "", lam: (tk) => api.giaoHang.guiXuatKhoCaLuot(tk, l.id, ghiChu),
                    bao: (r) => `Đã gửi ${r.so_chuyen} phiếu yêu cầu xuất kho: ${r.phieu.join(", ")}.`,
                  })}>
                  Gửi {l.so_cho_gui_kho} phiếu
                </Button>
                <Button variant="ghost" onClick={() => setMo(null)}>Thôi</Button>
              </div>
            </div>
          )}
          {l && mo === "xuat_phat" && (
            <div className="gh-o-luot">
              <FormSoDongHo
                cheDo="xuat_phat"
                luot={l}
                moTa={`Xe rời kho với ${l.so_cho_bat_dau} điểm đã lấy hàng. Chặng tới khách đầu tiên trừ từ số này.`}
                nhanNut={`Bắt đầu giao ${l.so_cho_bat_dau} điểm`}
                gui={(n, xn) => api.giaoHang.batDauGiaoCaLuot(token, l.id, { so_dong_ho_xuat_phat: n, xac_nhan_km_lon: xn })
                  .then((r) => {
                    onDoi();
                    return r.canh_bao;
                  })}
                onXong={() => setMo(null)}
                onHuy={() => setMo(null)}
              />
            </div>
          )}
          {l && mo === "ve_kho" && (
            <div className="gh-o-luot">
              <FormSoDongHo
                cheDo="ve_kho"
                luot={l}
                moTa="Mọi điểm đã có kết quả. Chặng về kho tính tiền theo bậc km như các chặng khác, chia cho kíp của điểm giao cuối."
                nhanNut="Lưu về kho"
                gui={(n, xacNhan) => api.giaoHang.veKho(token, l.id, { so_dong_ho: n, xac_nhan_km_lon: xacNhan })
                  .then((r) => {
                    onDoi();
                    return r.canh_bao;
                  })}
                onXong={() => setMo(null)}
                onHuy={() => setMo(null)}
              />
            </div>
          )}
          {l && mo === null && buoc.length === 0 && l.so_dang_giao > 0 && canWrite && (
            <p className="rc__sub gh-goi-y">
              Tới khách nào thì bấm <b>Nhập kết quả</b> ở điểm đó, kèm số đồng hồ lúc tới.
            </p>
          )}

          {l ? (
            <ol className="gh-lt" aria-label="Lộ trình">
              <MocKho luot={l} loai="roi" luc={lucXuatPhat(ds, chiTiet)} />
              {ds.map((t, i) => (
                <li key={t.id}>
                  <span className={`gh-lt__moc${coKetQua(t) ? " is-xong" : t.trang_thai === "dang_giao" ? " is-dang" : ""}`}
                    aria-hidden="true">{i + 1}</span>
                  {theDiem(t, i)}
                </li>
              ))}
              <MocKho luot={l} loai="ve" />
            </ol>
          ) : (
            <ChiTietDon t={dau} ct={chiTiet[dau.request_id]} />
          )}
        </>
      )}

      {tab === "chung-tu" && (
        <div className={ds.length > 1 ? "gh-ctd" : undefined}>
          {ds.length > 1 && (
            <nav className="gh-ctd__ray" aria-label="Đơn trong lượt">
              {ds.map((t, i) => (
                <button key={t.id} type="button" aria-pressed={t.id === tc.id}
                  className={`gh-ctd__don${t.id === tc.id ? " is-chon" : ""}`}
                  onClick={() => setChonDon(t.id)}>
                  <span className={`gh-so${coKetQua(t) ? " is-xong" : ""}`} aria-hidden="true">{i + 1}</span>
                  <span className="gh-ctd__ten">
                    <b>{t.customer_name}</b>
                    <span className="gh-ctd__phu">
                      {t.order_code && <span className="gh-the">{t.order_code}</span>}
                      {demTep[t.id] != null && (
                        <span className="gh-nho">{demTep[t.id] > 0 ? `${demTep[t.id]} tệp` : "chưa có tệp"}</span>
                      )}
                    </span>
                  </span>
                </button>
              ))}
            </nav>
          )}
          <ChungTuDon key={tc.id} t={tc} giaoThang={!!gt} nhieuDon={ds.length > 1}
            maLaTieuDe={!l} token={token}
            onDemTep={(n) => setDemTep((c) => (c[tc.id] === n ? c : { ...c, [tc.id]: n }))} />
        </div>
      )}

      {tab === "lich-su" && (
        lichSu.length === 0 ? (
          <p className="rc__sub">Chưa có mốc nào.</p>
        ) : (
          <ul className="gh-ls">
            {lichSu.map((h) => (
              <li key={h.id}>
                <span className="gh-ls__luc">{gioNgay(h.luc)}</span>
                <span className="gh-ls__viec">
                  <span className="gh-ls__dong">
                    <b>{NHAN_TRANG_THAI_CHUYEN[h.den_trang_thai] ?? h.den_trang_thai}</b>
                    {ds.length > 1 && h.khach && <span className="gh-the">{h.khach}</span>}
                  </span>
                  <span className="gh-ls__dong gh-nho">
                    {h.nguoi_thao_tac_name && <span>{h.nguoi_thao_tac_name}</span>}
                    {h.ghi_chu && <span>{h.ghi_chu}</span>}
                    {h.ly_do && <span>Lý do: {h.ly_do}</span>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </NganPhai>
  );
}

/** Giờ xe rời kho = mốc "Đang giao" sớm nhất trong lịch sử các điểm. */
function lucXuatPhat(ds: DeliveryTrip[], ct: Record<number, DeliveryRequestDetail>): string | null {
  const ids = new Set(ds.map((t) => t.request_id));
  const moc = [...ids]
    .flatMap((id) => ct[id]?.lich_su ?? [])
    .filter((h) => h.den_trang_thai === "dang_giao")
    .map((h) => h.luc)
    .sort();
  return moc[0] ?? null;
}

function MocKho({ luot: l, loai, luc }: { luot: LuotXeChiTiet; loai: "roi" | "ve"; luc?: string | null }) {
  if (loai === "roi") {
    const da = l.so_dong_ho_xuat_phat != null;
    return (
      <li>
        <span className={`gh-lt__moc${da ? " is-xong" : ""}`} aria-hidden="true">{da ? "✓" : ""}</span>
        <div className={`gh-lt__kho${da ? "" : " is-cho"}`}>
          <b>{da ? "Rời kho" : "Chưa rời kho"}</b>
          {da && luc && <span>{gioNgay(luc)}</span>}
          {da && <span className="gh-nho">đồng hồ {so(l.so_dong_ho_xuat_phat)}</span>}
        </div>
      </li>
    );
  }
  const da = !!l.ve_kho_luc;
  return (
    <li>
      <span className={`gh-lt__moc${da ? " is-xong" : ""}`} aria-hidden="true">{da ? "✓" : ""}</span>
      <div className={`gh-lt__kho${da ? "" : " is-cho"}`}>
        <b>Về kho</b>
        {da ? (
          <>
            <span>{gioNgay(l.ve_kho_luc)}</span>
            <span className="gh-nho">đồng hồ {so(l.so_dong_ho_ve_kho)}</span>
            <span className="gh-nho">chặng về {so(l.km_ve_kho)} km</span>
          </>
        ) : (
          <span className="gh-nho">Mọi điểm có kết quả thì nút “Về kho” hiện ở đầu ngăn</span>
        )}
      </div>
    </li>
  );
}

/** Dòng hàng của chuyến: bảng giao gửi kèm sẵn (`t.hang`, nạp gộp cả trang) nên ngăn có bảng hàng
 *  ngay lúc mở; chỉ khi thiếu (chuyến không đi từ bảng giao) mới chờ chi tiết yêu cầu nạp riêng. */
function dongHang(t: DeliveryTrip, ct?: DeliveryRequestDetail): DeliveryRequestLine[] {
  return t.hang ?? ct?.request.lines ?? [];
}

/** Bảng hàng Yêu cầu / Đã giao / Còn trong thẻ từng điểm của lượt. */
function BangHang({ dong }: { dong: DeliveryRequestLine[] }) {
  if (dong.length === 0) return null;
  return (
    <table>
      <thead>
        <tr>
          <th>Hàng giao</th>
          <th className="r">Yêu cầu</th>
          <th className="r">Đã giao</th>
          <th className="r">Còn</th>
        </tr>
      </thead>
      <tbody>
        {dong.map((x) => {
          const dv = x.don_vi_tinh ?? x.dvt ?? "";
          const con = x.qty - x.da_giao;
          return (
            <tr key={x.id}>
              <td>{x.mo_ta ?? x.hang_ten}</td>
              <td className="r gh-num">{so(x.qty)} <span className="gh-nho">{dv}</span></td>
              <td className="r gh-num">{x.da_giao > 0 ? <>{so(x.da_giao)} <span className="gh-nho">{dv}</span></> : <span className="gh-mo">0</span>}</td>
              <td className="r gh-num">{con > 0 ? <>{so(con)} <span className="gh-nho">{dv}</span></> : <span className="gh-mo">0</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Ô số lượng của lưới hàng: số rồi đơn vị mờ; 0 thì gạch mờ như ô "Thu trước đó" của phiếu thu. */
function oSl(n: number, dv: string) {
  return n > 0 ? <>{so(n)} <span className="kt-mo">{dv}</span></> : <span className="kt-mo">–</span>;
}

/** Thân trái của ngăn MỘT đơn (kiểu 3, 08/10/2026): khách giao tới (chữ lớn như "Lý do nộp"), lưu ý khi
 *  giao, lưới hàng kiểu bảng tính như "Áp vào hoá đơn". Các ô ngắn nằm ở cột phải (`RayDon`). */
function ChiTietDon({ t, ct }: { t: DeliveryTrip; ct?: DeliveryRequestDetail }) {
  const dong = dongHang(t, ct);
  return (
    <>
      <div className="kt-ngan__muc">Giao cho</div>
      <div className="kt-ngan__ly gh-k3-khach">
        <span>{t.customer_name ?? "—"}</span>
        {t.order_code && <TheNho>{t.order_code}</TheNho>}
        {t.customer_po_no && <TheNho>PO {t.customer_po_no}</TheNho>}
      </div>

      {t.luu_y_giao && (
        <>
          <div className="kt-ngan__muc">Lưu ý khi giao</div>
          <p className="gh-k3-luu">{t.luu_y_giao}</p>
        </>
      )}

      {dong.length > 0 && (
        <>
          <div className="kt-ngan__muc">Hàng giao</div>
          <div className="kt-bang">
            <table className="kt-g" style={{ minWidth: 520 }}>
              <colgroup>
                <col />
                <col style={{ width: 136 }} />
                <col style={{ width: 136 }} />
                <col style={{ width: 136 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Mặt hàng</th>
                  <th className="kt-g__so">Yêu cầu</th>
                  <th className="kt-g__so">Đã giao</th>
                  <th className="kt-g__so">Còn</th>
                </tr>
              </thead>
              <tbody>
                {dong.map((x) => {
                  const dv = x.don_vi_tinh ?? x.dvt ?? "";
                  const ten = x.mo_ta ?? x.hang_ten ?? "";
                  return (
                    <tr key={x.id}>
                      <td title={ten}>{ten}</td>
                      <td className="kt-g__so">{oSl(x.qty, dv)}</td>
                      <td className="kt-g__so">{oSl(x.da_giao, dv)}</td>
                      <td className="kt-g__so">{oSl(x.qty - x.da_giao, dv)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/** Cột thuộc tính bên phải của ngăn MỘT đơn. Ô trống tự ẩn (`RayThuocTinh` bỏ giá trị null).
 *  Giao thẳng: không xe, không tài xế, không km — thay bằng nhà gia công, lệnh nguồn, ngày khách nhận
 *  theo biên bản (kế toán ghi hoá đơn theo ngày này, khác lúc bấm chốt) và người ghi nhận. */
function RayDon({ t }: { t: DeliveryTrip }) {
  const gt = t.giao_thang ?? null;
  const ketQua = coKetQua(t) && !gt;
  const hen = gt ? soVoiHen(t.ngay_can_giao, t.thoi_gian_ket_thuc) : null;
  return (
    <RayThuocTinh o={[
      { nhan: "Nơi giao", giaTri: (
        <Cum>
          <span>{t.dia_chi || "Chưa có địa chỉ"}</span>
          {t.dia_chi && (
            <a className="kt-lk" href={lienKetBanDo(t.dia_chi)} target="_blank" rel="noreferrer">Mở bản đồ</a>
          )}
        </Cum>
      ) },
      { nhan: "Người nhận", giaTri: (
        <Cum>
          <span>{t.nguoi_nhan || "—"}</span>
          {t.sdt_nguoi_nhan && (
            <a className="kt-lk" href={`tel:${t.sdt_nguoi_nhan.replace(/\s+/g, "")}`}>{sdtDoc(t.sdt_nguoi_nhan)}</a>
          )}
        </Cum>
      ) },
      // Giao thẳng: ô Khách nhận đã nói so với hẹn — khỏi nhắc hẹn lần nữa.
      { nhan: "Hẹn giao", giaTri: gt ? null : ngay(t.ngay_can_giao) },
      { nhan: "Nhà gia công", giaTri: gt ? (
        <Cum>
          <span>{gt.nha_cung_cap_ten ?? "—"}</span>
          {gt.nha_cung_cap_sdt && (
            <a className="kt-lk" href={`tel:${gt.nha_cung_cap_sdt.replace(/\s+/g, "")}`}>{sdtDoc(gt.nha_cung_cap_sdt)}</a>
          )}
        </Cum>
      ) : null },
      { nhan: "Từ lệnh", giaTri: gt ? gt.lsx_ma ?? "—" : null },
      { nhan: "Khách nhận", giaTri: gt ? (
        <Cum>
          <span>{ngay(ngayIso(t.thoi_gian_ket_thuc))}</span>
          {hen && <TheNho>{hen.text}</TheNho>}
        </Cum>
      ) : null },
      { nhan: "Xe", giaTri: gt ? null : (
        <Cum>
          <span>{t.xe_bien_so ?? "—"}</span>
          {t.xe_ten && <TheNho>{t.xe_ten}</TheNho>}
        </Cum>
      ) },
      { nhan: "Tài xế", giaTri: gt ? null : t.employee_name ?? "—" },
      { nhan: "Phụ xe", giaTri: gt ? null : t.phu_xe_name },
      { nhan: "Lấy hàng", giaTri: gt ? null : gioNgay(t.gio_lay_hang) },
      { nhan: "Giao dự kiến", giaTri: gt || !t.gio_du_kien_giao ? null : gioNgay(t.gio_du_kien_giao) },
      { nhan: "Tới nơi", giaTri: ketQua ? gioNgay(t.thoi_gian_ket_thuc) : null },
      { nhan: "Km", giaTri: gt ? null : t.km != null ? `${so(t.km)} km` : t.tong_km > 0 ? `${so(t.tong_km)} km` : null },
      { nhan: "Ký nhận", giaTri: ketQua ? t.nguoi_nhan_thuc_te : null },
      { nhan: "Lý do", giaTri: ketQua ? t.ly_do_that_bai : null },
      { nhan: "Ghi chú kết quả", giaTri: ketQua && !t.ly_do_that_bai ? t.ghi_chu_ket_qua : null },
      { nhan: "Ghi nhận", giaTri: gt ? (
        <Cum>
          <span>{t.employee_name ?? "—"}</span>
          <TheNho>{gioNgay(t.created_at ?? t.thoi_gian_ket_thuc)}</TheNho>
        </Cum>
      ) : null },
    ]} />
  );
}

function TheDiem({
  t,
  stt,
  ct,
  giaoThang,
  nut,
}: {
  t: DeliveryTrip;
  stt: number | null;
  ct?: DeliveryRequestDetail;
  giaoThang: boolean;
  nut: ReactNode;
}) {
  const dong = dongHang(t, ct);
  const dangGiao = t.trang_thai === "dang_giao";
  return (
    <article className={`gh-dt${dangGiao ? " is-dang" : ""}`}
      aria-label={stt != null ? `Điểm ${stt} ${t.customer_name ?? ""}` : (t.customer_name ?? undefined)}>
      <div className="gh-dt__dau">
        <div className="gh-dt__ten">
          <b>{t.customer_name}</b>
          <div className="gh-dt__the">
            {t.order_code && <span className="gh-the">{t.order_code}</span>}
            {t.customer_po_no && <span className="gh-the">PO {t.customer_po_no}</span>}
            {/* Ngăn một yêu cầu: mã đã là tiêu đề ngăn — chỉ lượt nhiều điểm mới cần thẻ mã. */}
            {stt != null && t.request_code && <span className="gh-the">{t.request_code}</span>}
          </div>
        </div>
        <div className="gh-dt__nut">
          {/* Ngăn một đơn đã nói trạng thái ở đầu ngăn — thẻ chỉ nói khi lượt có nhiều điểm. */}
          {stt != null && <Pill text={nhanChuyen(t)} tone={toneChuyen(t.trang_thai)} />}
          {nut}
        </div>
      </div>
      <dl className="gh-dt__luoi">
        <div>
          <dt>Nơi giao</dt>
          <dd>
            <span>{t.dia_chi || "Chưa có địa chỉ"}</span>
            {t.dia_chi && (
              <a className="gh-lk gh-nho" href={lienKetBanDo(t.dia_chi)} target="_blank" rel="noreferrer">
                Mở bản đồ
              </a>
            )}
          </dd>
        </div>
        <div>
          <dt>Người nhận</dt>
          <dd>
            <span>{t.nguoi_nhan || "—"}</span>
            {t.sdt_nguoi_nhan && (
              <a className="gh-lk" href={`tel:${t.sdt_nguoi_nhan.replace(/\s+/g, "")}`}>{sdtDoc(t.sdt_nguoi_nhan)}</a>
            )}
          </dd>
        </div>
        <div>
          <dt>Hẹn giao</dt>
          <dd>
            <span>{ngay(t.ngay_can_giao)}</span>
            {t.phieu_xuat && <span className="gh-nho">phiếu kho {t.phieu_xuat.ma}</span>}
          </dd>
        </div>
      </dl>
      {t.luu_y_giao && (
        <p className="gh-dt__luu"><span className="gh-nho">Lưu ý khi giao</span> {t.luu_y_giao}</p>
      )}
      {dong.length > 0 && (
        <div className="gh-dt__hang">
          <BangHang dong={dong} />
        </div>
      )}
      {coKetQua(t) && !giaoThang && (
        <div className="gh-dt__kq">
          <span>Tới <span className="gh-muc">{gioNgay(t.thoi_gian_ket_thuc)}</span></span>
          {t.luot?.so_dong_ho != null && <span>Đồng hồ <span className="gh-muc">{so(t.luot.so_dong_ho)}</span></span>}
          {t.km != null && <span>{t.luot ? "Chặng" : "Km"} <span className="gh-muc">{so(t.km)} km</span></span>}
          {t.nguoi_nhan_thuc_te && <span>Ký nhận <span className="gh-muc">{t.nguoi_nhan_thuc_te}</span></span>}
          {t.ly_do_that_bai && <span>Lý do <span className="gh-muc">{t.ly_do_that_bai}</span></span>}
          {!t.ly_do_that_bai && t.ghi_chu_ket_qua && <span>Ghi chú <span className="gh-muc">{t.ghi_chu_ket_qua}</span></span>}
        </div>
      )}
    </article>
  );
}

/** Trạng thái phiếu kho đọc theo việc của nó: phiếu xuất ghi sổ = hàng đã ra; phiếu nhập trả ghi
 *  sổ = kho đã nhận lại. */
function nhanPhieuKho(tt: string, loai: "xuat" | "tra"): { text: string; tone: "on" | "warn" } {
  if (tt === "posted") return { text: loai === "xuat" ? "Đã xuất kho" : "Kho đã nhận lại", tone: "on" };
  return { text: loai === "xuat" ? "Kho đang soạn" : "Chờ kho nhận lại", tone: "warn" };
}

/** Một dòng của lưới giấy tờ: loại giấy | số | trạng thái | ai, lúc nào. */
type DongGiay = { loai: string; so: ReactNode; tt: ReactNode; ai: ReactNode };

/** Tệp của MỘT chuyến trong khuôn ô kéo-thả + lưới ảnh của kế toán. Đếm tệp báo lên cho rail đơn. */
function TepChuyen({ tripId, token, onDem }: { tripId: number; token: string; onDem: (n: number) => void }) {
  const [tep, setTep] = useState<DinhKemChuyen[]>([]);
  const onDemRef = useRef(onDem);
  onDemRef.current = onDem;
  const nap = useCallback(() => {
    api.giaoHang.dinhKemChuyen(token, tripId)
      .then((r) => {
        setTep(r.items);
        onDemRef.current(r.items.length);
      })
      .catch(() => setTep([]));
  }, [token, tripId]);
  useEffect(nap, [nap]);
  return (
    <TabChungTu tep={tep} daHuy={false} coQuyen onDoi={nap}
      taiMot={(f) => api.giaoHang.themDinhKemChuyen(token, tripId, f)}
      xoaMot={(id) => api.giaoHang.xoaDinhKemChuyen(token, tripId, id)}
      chuKeo="Kéo ảnh hoá đơn hoặc biên bản khách ký vào đây"
      chuChuaCo="Chưa có tệp. Kéo ảnh hoá đơn hoặc biên bản khách ký vào đây" />
  );
}

function ChungTuDon({
  t,
  giaoThang,
  nhieuDon,
  maLaTieuDe,
  token,
  onDemTep,
}: {
  t: DeliveryTrip;
  giaoThang: boolean;
  /** Lượt nhiều đơn ⇒ nói trạng thái của đơn đang chọn; một đơn thì đầu ngăn đã nói. */
  nhieuDon: boolean;
  /** Mã yêu cầu đang là tiêu đề ngăn (ngăn một chuyến) ⇒ dòng phiếu giao hàng khỏi nhắc lại. */
  maLaTieuDe: boolean;
  token: string;
  onDemTep: (n: number) => void;
}) {
  const daKy = coKetQua(t) && !!t.nguoi_nhan_thuc_te;
  const px = t.phieu_xuat ? nhanPhieuKho(t.phieu_xuat.trang_thai, "xuat") : null;
  const pt = t.phieu_tra ? nhanPhieuKho(t.phieu_tra.trang_thai, "tra") : null;
  const mo = <span className="kt-mo">–</span>;

  const giay: DongGiay[] = [
    {
      loai: "Phiếu giao hàng",
      so: maLaTieuDe ? mo : t.request_code,
      // Giao thẳng đã xong mà một đơn: đầu ngăn đã nói "Giao thành công" — thôi nhắc.
      tt: daKy ? <ChipGh text="Khách đã ký" tone="on" />
        : giaoThang && coKetQua(t) ? (nhieuDon ? <ChipGh text="Đã giao" tone="on" /> : mo)
          : <ChipGh text="Chưa giao" tone="warn" />,
      ai: daKy ? <Cum><span>{t.nguoi_nhan_thuc_te}</span><TheNho>{gioNgay(t.thoi_gian_ket_thuc)}</TheNho></Cum> : null,
    },
    giaoThang
      ? { loai: "Phiếu xuất kho", so: <span className="kt-mo">Không qua kho</span>, tt: mo,
          ai: <span className="kt-mo">Nhà gia công giao thẳng cho khách</span> }
      : t.phieu_xuat
        ? { loai: "Phiếu xuất kho", so: t.phieu_xuat.ma, tt: <ChipGh text={px!.text} tone={px!.tone} />,
            ai: <Cum><span>{t.phieu_xuat.boi_ten}</span><TheNho>{gioNgay(t.phieu_xuat.luc)}</TheNho></Cum> }
        : { loai: t.yeu_cau_kho_ma ? "Yêu cầu xuất kho" : "Phiếu xuất kho", so: t.yeu_cau_kho_ma ?? mo,
            tt: <ChipGh text={t.yeu_cau_kho_ma ? "Chờ kho lập phiếu" : "Chưa gửi kho"} tone="warn" />, ai: null },
  ];
  if (t.phieu_tra || t.tra_hang_ma) {
    giay.push({
      loai: "Phiếu nhập trả",
      so: t.phieu_tra?.ma ?? t.tra_hang_ma,
      tt: pt
        ? <ChipGh text={pt.text} tone={pt.tone} />
        : <ChipGh text={t.tra_hang_trang_thai === "done" ? "Kho đã nhận lại" : "Chờ kho nhận lại"}
            tone={t.tra_hang_trang_thai === "done" ? "on" : "warn"} />,
      ai: t.phieu_tra ? <Cum><span>{t.phieu_tra.boi_ten}</span><TheNho>{gioNgay(t.phieu_tra.luc)}</TheNho></Cum> : null,
    });
  }

  return (
    <div className="gh-ctd__mat">
      {/* Một đơn: khách + mã đơn đã ở tab Chi tiết — tab này chỉ giấy tờ và tệp. */}
      {nhieuDon && (
        <div className="gh-ctd__dau">
          <div className="gh-dt__ten">
            <b>{t.customer_name}</b>
            <div className="gh-dt__the">
              {t.order_code && <span className="gh-the">{t.order_code}</span>}
              {t.customer_po_no && <span className="gh-the">PO {t.customer_po_no}</span>}
            </div>
          </div>
          <Pill text={nhanChuyen(t)} tone={toneChuyen(t.trang_thai)} />
        </div>
      )}

      <section>
        <div className="kt-ngan__muc">Giấy tờ của đơn</div>
        <div className="kt-bang">
          <table className="kt-g" style={{ minWidth: 620 }}>
            <colgroup>
              <col style={{ width: 150 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 160 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Giấy tờ</th>
                <th>Số</th>
                <th>Trạng thái</th>
                <th>Người làm</th>
              </tr>
            </thead>
            <tbody>
              {giay.map((g) => (
                <tr key={g.loai}>
                  <td>{g.loai}</td>
                  <td>{g.so}</td>
                  <td>{g.tt}</td>
                  <td style={{ whiteSpace: "normal" }}>{g.ai ?? mo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="kt-ngan__muc">Tệp đính kèm của đơn</div>
        <TepChuyen tripId={t.id} token={token} onDem={onDemTep} />
      </section>
    </div>
  );
}
