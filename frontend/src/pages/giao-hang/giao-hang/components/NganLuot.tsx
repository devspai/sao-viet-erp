// Ngăn chi tiết một dòng của tab "Đơn giao hàng" (06/10/2026, mockup
// docs/mockups/giao-hang-phuong-an-B-chi-tiet.html) — vỏ `NganPhai` chung của hệ thống, 920px.
//
//   Lộ trình — Rời kho → thẻ từng khách (nơi giao, người nhận, hẹn, lưu ý, hàng, kết quả) → Về kho.
//              Bước CẢ LƯỢT (gửi kho, lấy hàng, xuất phát, về kho) ở đầu ngăn; việc của RIÊNG một
//              điểm (nhập kết quả, trả hàng, đổi/huỷ) ở thẻ điểm đó.
//   Chứng từ — MỖI ĐƠN một bộ giấy tờ (chủ chốt "cách 1"): cột trái các đơn của lượt, bên phải chỉ
//              giấy tờ, hàng và tệp của đơn đang chọn. Một chuyến = một đơn trong lượt, nên phiếu
//              kho và tệp đã gắn đúng đơn sẵn — không gom chung cả lượt.
//   Lịch sử  — các mốc trạng thái của mọi điểm, mới nhất trước.
//
// Đơn NHÀ GIA CÔNG GIAO THẲNG không xe, không kíp, không km: bốn ô đầu ngăn đổi thành nhà gia
// công, lệnh nguồn, số đã giao, người ghi nhận.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BangGiaoItem, DeliveryHistory, DeliveryRequestDetail, DeliveryTrip, LuotXeChiTiet } from "../../../../api/client";
import { api } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { NganPhai } from "../../../ke-toan/shared/NganPhai";
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
import { DinhKemChuyenBox } from "./DinhKemChuyenBox";
import { FormSoDongHo } from "./FormSoDongHo";
import { CHUA_CAM_HANG, Pill, TraHang } from "./giaoHangCells";
import "../../../ke-toan/ke-toan.css";

type Tab = "lo-trinh" | "chung-tu" | "lich-su";

/** Ô tóm tắt hai tầng: giá trị + dòng phụ nhỏ. */
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

  // Hàng + lịch sử nằm ở chi tiết YÊU CẦU — nạp lại mỗi khi một điểm đổi trạng thái.
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
    : gt
      ? [
          { nhan: "Nhà gia công", giaTri: o2(gt.nha_cung_cap_ten ?? "—", gt.nha_cung_cap_sdt ? sdtDoc(gt.nha_cung_cap_sdt) : null) },
          { nhan: "Từ lệnh", giaTri: gt.lsx_ma ?? "—" },
          { nhan: "Đã giao", giaTri: daGiaoChuyen(dau, chiTiet[dau.request_id]) },
          // Ngày khách nhận theo biên bản (kế toán ghi hoá đơn theo ngày này) — khác lúc bấm chốt.
          {
            nhan: "Khách nhận",
            giaTri: o2(ngay(ngayIso(dau.thoi_gian_ket_thuc)), soVoiHen(dau.ngay_can_giao, dau.thoi_gian_ket_thuc)?.text ?? null),
          },
          { nhan: "Ghi nhận", giaTri: o2(dau.employee_name ?? "—", gioNgay(dau.created_at ?? dau.thoi_gian_ket_thuc)) },
        ]
      : [
          { nhan: "Xe", giaTri: o2(dau.xe_bien_so ?? "—", dau.xe_ten) },
          { nhan: "Tài xế", giaTri: o2(dau.employee_name ?? "—", dau.phu_xe_name ? `phụ xe ${dau.phu_xe_name}` : null) },
          { nhan: "Lấy hàng", giaTri: o2(gioNgay(dau.gio_lay_hang), `giao dự kiến ${gioNgay(dau.gio_du_kien_giao)}`) },
          { nhan: "Km", giaTri: dau.tong_km > 0 ? `${so(dau.tong_km)} km` : "—" },
        ];

  const hanhDong = l && mo === null && buoc.length > 0
    ? buoc.map((b, i) => (
        <Button key={b.nhan} variant={i === 0 ? "accent" : "ghost"} disabled={dangGui}
          onClick={() => ("form" in b ? moO(b.form) : lam(b))}>
          {b.nhan}
        </Button>
      ))
    : undefined;

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
      tieuDe={l ? l.code : dau.request_code}
      the={<Pill text={tinh.text} tone={tinh.tone} />}
      hanhDong={hanhDong}
      tomTat={tomTat}
      tabs={[
        { id: "lo-trinh", nhan: l ? "Lộ trình" : "Chi tiết", ...(l ? { dem: ds.length } : {}) },
        { id: "chung-tu", nhan: "Chứng từ" },
        { id: "lich-su", nhan: "Lịch sử", dem: lichSu.length },
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
            theDiem(dau, 0)
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
          <ChungTuDon key={tc.id} t={tc} ct={chiTiet[tc.request_id]} giaoThang={!!gt} nhieuDon={ds.length > 1} token={token}
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

/** Số đã giao của chuyến (cộng các dòng) kèm đơn vị khi mọi dòng chung một đơn vị. */
function daGiaoChuyen(t: DeliveryTrip, ct?: DeliveryRequestDetail): string {
  const tong = t.lines.reduce((n, x) => n + x.qty_giao, 0);
  const dv = new Set((ct?.request.lines ?? []).map((x) => x.don_vi_tinh ?? x.dvt ?? ""));
  return dv.size === 1 ? `${so(tong)} ${[...dv][0]}`.trim() : so(tong);
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
  const dong = ct?.request.lines ?? [];
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
            {t.request_code && <span className="gh-the">{t.request_code}</span>}
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
            <b>{ngay(t.ngay_can_giao)}</b>
            {t.phieu_xuat && <span className="gh-nho">phiếu kho {t.phieu_xuat.ma}</span>}
          </dd>
        </div>
      </dl>
      {t.luu_y_giao && <div className="gh-dt__luu">{t.luu_y_giao}</div>}
      {dong.length > 0 && (
        <div className="gh-dt__hang">
          <table>
            <thead>
              <tr><th>Hàng giao</th><th className="r">Số lượng</th></tr>
            </thead>
            <tbody>
              {dong.map((x) => (
                <tr key={x.id}>
                  <td>{x.mo_ta ?? x.hang_ten}</td>
                  <td className="r gh-num">{so(x.qty)} {x.don_vi_tinh ?? x.dvt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {coKetQua(t) && !giaoThang && (
        <div className="gh-dt__kq">
          <span>Tới <b>{gioNgay(t.thoi_gian_ket_thuc)}</b></span>
          {t.luot?.so_dong_ho != null && <span>Đồng hồ <b>{so(t.luot.so_dong_ho)}</b></span>}
          {t.km != null && <span>{t.luot ? "Chặng" : "Km"} <b>{so(t.km)} km</b></span>}
          {t.nguoi_nhan_thuc_te && <span>Ký nhận <b>{t.nguoi_nhan_thuc_te}</b></span>}
          {t.ly_do_that_bai && <span>Lý do <b>{t.ly_do_that_bai}</b></span>}
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

function ChungTuDon({
  t,
  ct,
  giaoThang,
  nhieuDon,
  token,
  onDemTep,
}: {
  t: DeliveryTrip;
  ct?: DeliveryRequestDetail;
  giaoThang: boolean;
  /** Lượt nhiều đơn ⇒ nói trạng thái của đơn đang chọn; một đơn thì đầu ngăn đã nói. */
  nhieuDon: boolean;
  token: string;
  onDemTep: (n: number) => void;
}) {
  const dong = ct?.request.lines ?? [];
  const daKy = coKetQua(t) && !!t.nguoi_nhan_thuc_te;
  const px = t.phieu_xuat ? nhanPhieuKho(t.phieu_xuat.trang_thai, "xuat") : null;
  const pt = t.phieu_tra ? nhanPhieuKho(t.phieu_tra.trang_thai, "tra") : null;
  const ghiChu = t.ly_do_that_bai ? `Lý do: ${t.ly_do_that_bai}`
    : coKetQua(t) && !giaoThang && t.ghi_chu_ket_qua ? `Ghi chú: ${t.ghi_chu_ket_qua}` : null;
  return (
    <div className="gh-ctd__mat">
      <div className="gh-ctd__dau">
        <div className="gh-dt__ten">
          <b>{t.customer_name}</b>
          <div className="gh-dt__the">
            {t.order_code && <span className="gh-the">{t.order_code}</span>}
            {t.customer_po_no && <span className="gh-the">PO {t.customer_po_no}</span>}
          </div>
        </div>
        {nhieuDon && <Pill text={nhanChuyen(t)} tone={toneChuyen(t.trang_thai)} />}
      </div>

      <section className="gh-hop">
        <h3 className="gh-hop__tieu">Giấy tờ của đơn</h3>
        <ul className="gh-gt">
          <li>
            <span className="gh-gt__loai">Phiếu giao hàng</span>
            <span className="gh-gt__so">{t.request_code}</span>
            <span className="gh-gt__tt">
              {daKy ? <Pill text="Khách đã ký" tone="on" />
                : giaoThang && coKetQua(t) ? <Pill text="Đã giao" tone="on" />
                  : <Pill text="Chưa giao" tone="warn" />}
            </span>
            <span className="gh-gt__ai gh-nho">
              {daKy && <>{t.nguoi_nhan_thuc_te} {gioNgay(t.thoi_gian_ket_thuc)}</>}
            </span>
          </li>
          {giaoThang ? (
            <li>
              <span className="gh-gt__loai">Phiếu xuất kho</span>
              <span className="gh-gt__so gh-nho">Không qua kho</span>
              <span className="gh-gt__tt" />
              <span className="gh-gt__ai gh-nho">Nhà gia công giao thẳng cho khách</span>
            </li>
          ) : t.phieu_xuat ? (
            <li>
              <span className="gh-gt__loai">Phiếu xuất kho</span>
              <span className="gh-gt__so">{t.phieu_xuat.ma}</span>
              <span className="gh-gt__tt">
                <Pill text={px!.text} tone={px!.tone} />
              </span>
              <span className="gh-gt__ai gh-nho">
                {t.phieu_xuat.boi_ten} {gioNgay(t.phieu_xuat.luc)}
              </span>
            </li>
          ) : (
            <li>
              <span className="gh-gt__loai">{t.yeu_cau_kho_ma ? "Yêu cầu xuất kho" : "Phiếu xuất kho"}</span>
              <span className="gh-gt__so">{t.yeu_cau_kho_ma ?? <span className="gh-nho">—</span>}</span>
              <span className="gh-gt__tt">
                <Pill text={t.yeu_cau_kho_ma ? "Chờ kho lập phiếu" : "Chưa gửi kho"} tone="warn" />
              </span>
              <span className="gh-gt__ai" />
            </li>
          )}
          {(t.phieu_tra || t.tra_hang_ma) && (
            <li>
              <span className="gh-gt__loai">Phiếu nhập trả</span>
              <span className="gh-gt__so">{t.phieu_tra?.ma ?? t.tra_hang_ma}</span>
              <span className="gh-gt__tt">
                {pt
                  ? <Pill text={pt.text} tone={pt.tone} />
                  : <Pill text={t.tra_hang_trang_thai === "done" ? "Kho đã nhận lại" : "Chờ kho nhận lại"}
                      tone={t.tra_hang_trang_thai === "done" ? "on" : "warn"} />}
              </span>
              <span className="gh-gt__ai gh-nho">
                {t.phieu_tra && <>{t.phieu_tra.boi_ten} {gioNgay(t.phieu_tra.luc)}</>}
              </span>
            </li>
          )}
        </ul>
      </section>

      <section className="gh-hop">
        <h3 className="gh-hop__tieu">Hàng của đơn</h3>
        {dong.length === 0 ? (
          <p className="rc__sub gh-hop__than">Đang tải…</p>
        ) : (
          <table className="gh-hop__bang">
            <thead>
              <tr>
                <th>Mặt hàng</th>
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
                    <td className="r gh-num">{so(x.qty)} {dv}</td>
                    <td className="r gh-num">{so(x.da_giao)} {dv}</td>
                    <td className={`r gh-num${con > 0 ? "" : " gh-nho"}`}>{con > 0 ? <b>{so(con)} {dv}</b> : "0"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {ghiChu && <p className="gh-nho gh-hop__than">{ghiChu}</p>}
      </section>

      <section className="gh-hop gh-hop--tep">
        <DinhKemChuyenBox tripId={t.id} token={token} tieuDe="Tệp đính kèm của đơn" onDem={onDemTep} />
      </section>
    </div>
  );
}
