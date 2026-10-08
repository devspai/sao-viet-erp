// Tab "Tổng quan" của ngăn vật tư — phương án B (docs/mockups/ton-kho-gon-3-phuong-an.html).
//
// Trên cùng một câu kết luận một dòng. Thân chia đôi:
//   trái  = phép tính Dự kiến còn dạng hoá đơn (Đang có, từng việc xuất/về, = Dự kiến còn) + dải
//           tồn theo ngày có ghi số ở hai vạch mức; rê chuột ở biểu đồ sáng dòng tương ứng;
//   phải  = Lô trong kho (nhập trước lấy trước), Mức tồn ở kho này (bấm để sửa), Giá (chỉ người xem
//           được giá).
// Mỗi số chỉ hiện một lần trong ngăn — đầu ngăn không còn dải số to.
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Camera, Gauge, Info, ShoppingCart } from "lucide-react";

import { ApiError, api, anhNho, assetUrl, type DuBaoTonRow, type HangLoai, type SoGiaOut, type StockLot,
  type StockThreshold } from "../../api/client";
import { fmtDateISO, money } from "../../utils/format";
import { fmtQty } from "../khoShared";
import { homNayIso, type DuBao, type SuKien } from "./duBao";
import { OMuaCho } from "../mua-hang/mua-cho/OMuaCho";

export interface MatHangTongQuan {
  hang_loai: HangLoai;
  hang_id: number;
  ten: string;
  dvt: string;
  ton: number;
  /** Σ còn lại × đơn giá của các lô (chỉ dùng khi xem được giá). */
  giaTri: number;
}

const ngayNgan = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "chưa hạn");

// Trạng thái thô của đơn mua (máy chủ trả nguyên) → chữ ngắn cạnh mã đơn.
const NHAN_PMH: Record<string, string> = {
  approved: "đã duyệt, chưa đặt",
  purchased: "đã đặt nhà cung cấp",
  partially_received: "đã giao một phần",
};

function tenViec(s: SuKien) {
  return s.loai === "lenh" ? s.lenh.ma : s.ma ?? "Đơn mua";
}

/** Ảnh nhỏ cạnh tên ở đầu ngăn: có ảnh thì bấm để phóng to (đổi / xoá ngay trong lớp phóng to),
 *  chưa có thì bấm để thêm. Cập nhật thẳng danh mục gốc. */
export function AnhMatHang({ token, hangLoai, hangId, ten, anh: anhGoc, canEdit, onChanged }: {
  token: string;
  hangLoai: HangLoai;
  hangId: number;
  ten: string;
  anh: string | null;
  canEdit: boolean;
  onChanged: (url: string | null) => void;
}) {
  const [anh, setAnh] = useState<string | null>(anhGoc);
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [phong, setPhong] = useState(false);
  useEffect(() => setAnh(anhGoc), [anhGoc]);
  // Esc khi đang phóng to: chỉ đóng lớp phóng to, không đóng cả ngăn (bắt ở pha capture).
  useEffect(() => {
    if (!phong) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setPhong(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [phong]);

  async function chon(f: File) {
    setBusy(true);
    setLoi(null);
    try {
      const r = await api.matHang.uploadAnh(token, hangLoai, hangId, f);
      setAnh(r.anh_url);
      onChanged(r.anh_url);
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không tải được ảnh.");
    } finally {
      setBusy(false);
    }
  }
  async function xoa() {
    setBusy(true);
    setLoi(null);
    try {
      await api.matHang.xoaAnh(token, hangLoai, hangId);
      setAnh(null);
      setPhong(false);
      onChanged(null);
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không xoá được ảnh.");
    } finally {
      setBusy(false);
    }
  }
  const oChon = (nhan: ReactNode, lop: string, title?: string) => (
    <label className={lop} title={title}>
      {nhan}
      <input type="file" accept="image/*" hidden disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void chon(f);
          e.target.value = "";
        }} />
    </label>
  );

  return (
    <>
      {anh ? (
        <button type="button" className="tkh-anhnho" title="Phóng to ảnh" onClick={() => setPhong(true)}>
          <img src={anhNho(anh, 160) ?? undefined} alt={ten} />
        </button>
      ) : canEdit ? (
        oChon(<Camera aria-hidden="true" />, "tkh-anhnho tkh-anhnho--trong", busy ? "Đang tải ảnh…" : "Thêm ảnh")
      ) : (
        <span className="tkh-anhnho tkh-anhnho--trong tkh-anhnho--khoa" title="Chưa có ảnh"><Camera aria-hidden="true" /></span>
      )}
      {loi && <span className="tkh-loi">{loi}</span>}
      {phong && anh && (
        <div className="tkh-phong" role="dialog" aria-modal="true" aria-label="Ảnh vật tư" onClick={() => setPhong(false)}>
          <div className="tkh-phong__anh" onClick={(e) => e.stopPropagation()}>
            <img src={assetUrl(anh) ?? undefined} alt={ten} />
            {canEdit && (
              <div className="tkh-phong__nut">
                {oChon("Đổi ảnh", "tkh-btn tkh-btn--nho")}
                <button type="button" className="tkh-btn tkh-btn--nho" disabled={busy} onClick={() => void xoa()}>Xoá ảnh</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Dải tồn theo ngày: chấm cách đều theo THỨ TỰ việc (không theo ngày) để chuỗi dài mấy tháng
 *  cũng không bị ép; hai vạch mức có ghi số ở mép phải; rê chuột sáng dòng tương ứng ở bảng. */
function DuongTon({ ton, duBao, th, sang, onSang }: {
  ton: number;
  duBao: DuBao;
  th: StockThreshold | undefined;
  sang: number | null;
  onSang: (i: number | null) => void;
}) {
  const min = th?.nguong_ton ?? null;
  const max = th?.nguong_toi_da ?? null;
  const W = 760, H = 150, L = 10, T = 26, B = 136;
  const R = min != null ? 620 : 750;
  const sk = duBao.suKien;
  const n = sk.length + 1;
  const xOf = (i: number) => L + (i / Math.max(1, n - 1 + 0.4)) * (R - L);
  const vals = [ton, ...sk.map((s) => s.conLai), ...(min != null ? [min] : []), ...(max != null ? [max] : [])];
  const yMax = Math.max(...vals, 1) * 1.08;
  const yMin = Math.min(0, ...vals);
  const y = (v: number) => B - ((v - yMin) / (yMax - yMin)) * (B - T);
  let d = `M${L} ${y(ton)}`;
  sk.forEach((s, i) => {
    d += ` H${xOf(i + 1)} V${y(s.conLai)}`;
  });
  d += ` H${R}`;

  const svgRef = useRef<SVGSVGElement>(null);
  function khiRe(e: ReactMouseEvent<SVGRectElement>) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    const mx = (e.clientX - box.left) * (W / box.width);
    let i = -1;
    let gan = Infinity;
    sk.forEach((_, j) => {
      const dd = Math.abs(xOf(j + 1) - mx);
      if (dd < gan) {
        gan = dd;
        i = j;
      }
    });
    onSang(i >= 0 && gan <= 60 ? i : null);
  }
  const cuoi = sk[sk.length - 1];
  const mauDiem = (s: SuKien) => (s.vung === "do" ? "var(--tt-do-fg)" : s.vung === "cam" ? "var(--tt-cam-fg)" : "var(--ink)");
  return (
    <div className="tkh-bieu">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Tồn theo ngày: từ ${fmtQty(ton)} hôm nay tới ${fmtQty(duBao.duKien)} sau ${sk.length} việc`}>
        {min != null && max != null && (
          <rect x={L} y={y(max)} width={R - L} height={Math.max(0, y(min) - y(max))} fill="var(--tt-la-bg)" opacity=".55" />
        )}
        {max != null && <line x1={L} x2={R} y1={y(max)} y2={y(max)} stroke="var(--tt-cam-dot)" strokeDasharray="5 5" />}
        {min != null && <line x1={L} x2={R} y1={y(min)} y2={y(min)} stroke="var(--tt-do-dot)" strokeDasharray="5 5" />}
        {max != null && <text x={R + 10} y={y(max) + 5} fontSize="15" fill="var(--tt-cam-fg)">tối đa {fmtQty(max)}</text>}
        {min != null && <text x={R + 10} y={y(min) + 5} fontSize="15" fill="var(--tt-do-fg)">tối thiểu {fmtQty(min)}</text>}
        {yMin < 0 && <line x1={L} x2={R} y1={y(0)} y2={y(0)} stroke="var(--rule)" />}
        <path d={d} fill="none" stroke="var(--ink)" strokeWidth="2.2" />
        <circle cx={L} cy={y(ton)} r={4.5} fill="var(--canvas)" stroke="var(--ink)" strokeWidth="2.2" />
        <text x={L + 8} y={y(ton) - 9} fontSize="15" fill="var(--ash)">{fmtQty(ton)} hôm nay</text>
        {sk.map((s, i) => (
          <circle key={i} cx={xOf(i + 1)} cy={y(s.conLai)} r={sang === i ? 7 : 4.5} fill="var(--canvas)" strokeWidth="2.2"
            stroke={mauDiem(s)} />
        ))}
        {cuoi && (
          <text x={Math.min(xOf(sk.length) + 8, R - 150)} y={Math.max(16, y(cuoi.conLai) - 9)} fontSize="15" fill={mauDiem(cuoi)}>
            {fmtQty(cuoi.conLai)} từ {ngayNgan(cuoi.ngay)}
          </text>
        )}
        {sang != null && sk[sang] && (
          <line x1={xOf(sang + 1)} x2={xOf(sang + 1)} y1={T - 8} y2={B + 6} stroke="var(--ink)" strokeDasharray="3 3" opacity=".45" />
        )}
        <rect className="tkh-bieu__bat" x={0} y={0} width={W} height={H} fill="transparent" onMouseMove={khiRe} onMouseLeave={() => onSang(null)} />
      </svg>
    </div>
  );
}

/** Câu kết luận một dòng: trạng thái + vì sao + nên làm gì, một nút. */
function KetLuan({ duBao, th, dvt, ton, coTheMua, onMua, onXemDonMua }: {
  duBao: DuBao;
  th: StockThreshold | undefined;
  dvt: string;
  ton: number;
  coTheMua: boolean;
  onMua: () => void;
  onXemDonMua?: (ma: string) => void;
}) {
  const min = th?.nguong_ton ?? null;
  const max = th?.nguong_toi_da ?? null;
  const nL = duBao.suKien.filter((s) => s.loai === "lenh").length;
  const nV = duBao.suKien.filter((s) => s.loai === "ve").length;
  const viec = [nL && `${nL} lệnh xuất`, nV && `${nV} đợt hàng về`].filter(Boolean).join(" và ");
  let mau: "do" | "cam" | "la" | "tin";
  let tieu: string;
  let phu: ReactNode;
  let nut: ReactNode = null;

  if (duBao.canMua) {
    mau = "do";
    const tu = duBao.moc === "nay" || !duBao.moc ? "từ hôm nay" : `từ ngày ${ngayNgan(duBao.moc)}`;
    if (min != null) {
      tieu = duBao.thieu > 0 ? `Thiếu ${fmtQty(duBao.thieu)} ${dvt} so với tối thiểu ${tu}` : `Chạm mức tối thiểu ${tu}`;
      // Ai làm tồn thủng: chính tồn hôm nay, hay lệnh xuất trước khi hàng kịp về.
      const tonNay = `Đang có ${fmtQty(ton)} ${dvt}, ${ton < min ? "đã dưới" : "đang chạm"} tối thiểu ${fmtQty(min)}.`;
      const vi = !viec
        ? tonNay
        : duBao.duoiCuoi
          ? `${viec} đưa tồn xuống ${fmtQty(duBao.duKien)} ${dvt}, dưới tối thiểu ${fmtQty(min)}.`
          : `${ton <= min ? tonNay : `Lệnh xuất trước khi hàng về kéo tồn xuống ${fmtQty(duBao.thapNhat)} ${dvt}, dưới tối thiểu ${fmtQty(min)}.`} Hàng về sau đó mới đưa lên lại ${fmtQty(duBao.duKien)} ${dvt}.`;
      phu = <>{vi} {duBao.deNghi > 0 && (duBao.dich?.day
        ? <>Mua {fmtQty(duBao.deNghi)} {dvt} về trước ngày đó thì không lúc nào dưới tối thiểu.</>
        : <>Mua {fmtQty(duBao.deNghi)} {dvt} thì về lại mức {duBao.dich?.nhan.toLowerCase()} {fmtQty(duBao.dich?.so ?? 0)}.</>)}</>;
    } else {
      tieu = `Lệnh sắp xuất vượt tồn ${fmtQty(-duBao.thapNhat)} ${dvt}`;
      phu = <>Chưa đặt mức nên chỉ tính phần lệnh thiếu. Mua {fmtQty(duBao.deNghi)} {dvt} thì đủ cho các lệnh.</>;
    }
    if (coTheMua && duBao.deNghi > 0) {
      nut = (
        <button type="button" className="tkh-btn tkh-btn--chinh tkh-btn--nho" onClick={onMua}>
          <ShoppingCart aria-hidden="true" />Mua {fmtQty(duBao.deNghi)} {dvt}
        </button>
      );
    }
  } else if (duBao.trangThai === "vuot" && max != null) {
    mau = "cam";
    const sk = duBao.suKien.find((s) => s.conLai > max);
    const chuaLenh = nL ? "" : "Chưa lệnh nào cần mặt hàng này. ";
    if (duBao.mocVuot === "nay" || !sk) {
      tieu = `Đang quá tối đa ${fmtQty(duBao.duMax)} ${dvt}`;
      phu = `${chuaLenh}Đang có ${fmtQty(ton)} ${dvt}, trên mức tối đa ${fmtQty(max)}.`;
    } else {
      tieu = `${sk.tre ? "Từ hôm nay" : `Ngày ${ngayNgan(sk.ngay)}`} tồn lên ${fmtQty(sk.conLai)} ${dvt}, quá tối đa ${fmtQty(duBao.duMax)} ${dvt}`;
      phu = sk.loai === "ve"
        ? `${chuaLenh}${sk.tre ? "Đơn trễ" : "Đợt về"} ${sk.ma ?? ""} mang về ${fmtQty(sk.sl)} ${dvt}. Có thể hẹn nhà cung cấp giao chậm hoặc bớt số đặt.`
        : chuaLenh;
      if (sk.loai === "ve" && sk.ma && onXemDonMua) {
        const ma = sk.ma;
        nut = <button type="button" className="tkh-btn tkh-btn--nho" onClick={() => onXemDonMua(ma)}>Xem đơn mua</button>;
      }
    }
  } else if (duBao.suKien.length > 0) {
    mau = th ? "la" : "tin";
    tieu = nL ? `Đủ cho ${nL} lệnh sắp xuất` : th ? "Hàng về vẫn nằm trong mức" : "Chưa lệnh nào cần mặt hàng này";
    phu = th
      ? `Dự kiến còn ${fmtQty(duBao.duKien)} ${dvt}, nằm trong mức.`
      : `Dự kiến còn ${fmtQty(duBao.duKien)} ${dvt}. Chưa đặt mức nên máy không nhắc mua khi sắp hết.`;
  } else {
    mau = "tin";
    tieu = "Chưa lệnh nào cần mặt hàng này";
    phu = th ? "Không có đơn mua nào sắp về." : "Chưa đặt mức nên máy không nhắc mua khi sắp hết.";
  }
  return (
    <div className={`tkh-msg tkh-msg--${mau}`}>
      <i className="tkh-msg__cham" aria-hidden="true" />
      <p><span className="tkh-msg__tieu">{tieu}.</span> {phu}</p>
      {nut}
    </div>
  );
}

export function TongQuanTon({
  token,
  mh,
  loTon,
  th,
  duBao,
  duRow,
  loiDuBao,
  canSetThreshold,
  canViewCost,
  coTheMua,
  onMua,
  onDatNguong,
  onOpenVoucher,
  onXemDonMua,
}: {
  token: string;
  mh: MatHangTongQuan;
  /** Lô còn tồn, nhập trước đứng trước (FIFO). */
  loTon: StockLot[];
  th: StockThreshold | undefined;
  duBao: DuBao | null;
  duRow: DuBaoTonRow | undefined;
  loiDuBao: string | null;
  canSetThreshold: boolean;
  canViewCost: boolean;
  /** Có quyền lập yêu cầu mua hàng (Xem + Thao tác ở màn Yêu cầu mua hàng). */
  coTheMua: boolean;
  onMua: () => void;
  onDatNguong: () => void;
  onOpenVoucher: (id: number) => void;
  /** Mở màn Mua hàng đúng đơn này (chỉ khi người xem được màn đó). */
  onXemDonMua?: (ma: string) => void;
}) {
  const dvt = mh.dvt;

  // ---- Nhà cung cấp (giá quy về đơn vị gốc của mặt hàng). ----
  const [soGia, setSoGia] = useState<SoGiaOut | null>(null);
  useEffect(() => {
    if (!canViewCost) return;
    let song = true;
    api.matHang.soGia(token, mh.hang_loai, mh.hang_id)
      .then((d) => song && setSoGia(d))
      .catch(() => song && setSoGia(null));
    return () => {
      song = false;
    };
  }, [token, mh.hang_loai, mh.hang_id, canViewCost]);

  const tonToanXuong = duRow?.ton_toan_xuong;
  const homNay = homNayIso();
  // Dòng nào đang sáng (rê chuột ở biểu đồ hoặc ở bảng) — hai bên trỏ nhau.
  const [sang, setSang] = useState<number | null>(null);
  const trangThaiMua = (ma: string | null) => duRow?.phieu_mua.find((p) => p.ma === ma)?.trang_thai;
  const moTa = (s: SuKien): string | null =>
    s.loai === "lenh"
      ? s.lenh.ten_viec || (s.lenh.khach_ten ? `khách ${s.lenh.khach_ten}` : null)
      : NHAN_PMH[trangThaiMua(s.ma) ?? ""] ?? null;
  const min = th?.nguong_ton ?? null;
  const max = th?.nguong_toi_da ?? null;

  let ketLuan: JSX.Element | null = null;
  if (loiDuBao) {
    ketLuan = (
      <div className="tkh-msg tkh-msg--tin">
        <Info aria-hidden="true" className="tkh-msg__ic" />
        <p><span className="tkh-msg__tieu">Chưa tính được dự kiến.</span> {loiDuBao}</p>
      </div>
    );
  } else if (duBao) {
    ketLuan = <KetLuan duBao={duBao} th={th} dvt={dvt} ton={mh.ton} coTheMua={coTheMua} onMua={onMua} onXemDonMua={onXemDonMua} />;
  }

  // ---- Phép tính Dự kiến còn: từng việc một dòng; loại việc nào trống thì một dòng 0 giữ chỗ. ----
  const coLenh = duBao?.suKien.some((s) => s.loai === "lenh");
  const coVe = duBao?.suKien.some((s) => s.loai === "ve");
  const phieuMua = duRow?.phieu_mua ?? [];
  const chuaHenVe = [
    phieuMua.some((p) => p.loai === "ycmh") && `${phieuMua.filter((p) => p.loai === "ycmh").length} yêu cầu mua đang chờ`,
    phieuMua.some((p) => p.loai === "pmh") && `${phieuMua.filter((p) => p.loai === "pmh").length} đơn mua chưa hẹn ngày`,
  ].filter(Boolean).join(" và ") || "chưa có đơn mua";
  const oNgay = (s: SuKien) => {
    if (s.tre) return <span className="tkh-tre" title={`Hẹn ${ngayNgan(s.ngay)}`}>trễ {s.tre} ngày</span>;
    if (!s.ngay) return <span className="tkh-mo">chưa hạn</span>;
    return s.ngay.slice(0, 4) !== homNay.slice(0, 4) ? fmtDateISO(s.ngay) : ngayNgan(s.ngay);
  };
  const ghiChuCuoi = !duBao ? null
    : duBao.duoiCuoi ? <span className="tkh-do">{min != null ? `dưới tối thiểu ${fmtQty(min)}` : "lệnh xuất vượt tồn"}</span>
    : max != null && duBao.duKien > max ? <span className="tkh-cam">quá tối đa {fmtQty(duBao.duKien - max)}</span>
    : th ? <span className="tkh-mo">trong mức</span> : null;

  // ---- Giá ----
  const nccRe = soGia?.items.find((s) => s.gia_quy_doi != null);
  const binhQuan = mh.giaTri > 0 && mh.ton > 0 ? mh.giaTri / mh.ton : null;
  const dvGoc = soGia?.don_vi_goc_ten ?? soGia?.don_vi_goc ?? "";

  return (
    <div className="tkh-tq2">
      {ketLuan}
      {!duBao && !loiDuBao && <span className="rc-skel" style={{ width: "70%" }} />}

      <div className="tkh-tq2__than">
        <div className="tkh-tq2__cot">
          <section>
            <div className="tkh-muc">Dự kiến còn<span className="tkh-sp" /><span className="tkh-goi">{dvt}</span></div>
            <div className="lds-bang"><table className="lds-g">
              <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 140 }} /><col style={{ width: 88 }} /></colgroup>
              <tbody>
                <tr>
                  <td className="c lds-mu" />
                  <td>Đang có<span className="tkh-phu">{loTon.length} lô</span></td>
                  <td className="lds-mu">hôm nay</td>
                  <td className="n">{fmtQty(mh.ton)}</td>
                </tr>
                {duBao && !coLenh && (
                  <tr>
                    <td className="c lds-mu">−</td>
                    <td>Sắp xuất cho lệnh<span className="tkh-phu">chưa lệnh nào cần</span></td>
                    <td />
                    <td className="n lds-mu">0</td>
                  </tr>
                )}
                {duBao?.suKien.map((s, i) => (
                  <tr key={i} className={sang === i ? "tkh-sang" : undefined}
                    onMouseEnter={() => setSang(i)} onMouseLeave={() => setSang(null)}>
                    <td className="c lds-mu">{s.loai === "ve" ? "+" : "−"}</td>
                    <td>
                      {s.loai === "ve" ? "Sắp về" : "Xuất cho"}
                      {s.loai === "ve" && s.ma && onXemDonMua ? (
                        <button type="button" className="tkh-lk" onClick={() => onXemDonMua(s.ma as string)}>{s.ma}</button>
                      ) : <span className="tkh-ma">{tenViec(s)}</span>}
                      {moTa(s) && <span className="tkh-phu">{moTa(s)}</span>}
                      {s.loai === "ve" && s.loaiMua?.length ? (
                        <div className="tkh-mc"><OMuaCho loai={s.loaiMua} lenh={s.muaCho ?? []} /></div>
                      ) : null}
                    </td>
                    <td>{oNgay(s)}</td>
                    <td className={`n${s.loai === "ve" ? " lds-la" : ""}`}>{fmtQty(s.sl)}</td>
                  </tr>
                ))}
                {duBao && !coVe && (
                  <tr>
                    <td className="c lds-mu">+</td>
                    <td>Sắp về<span className="tkh-phu">{chuaHenVe}</span></td>
                    <td />
                    <td className="n lds-mu">0</td>
                  </tr>
                )}
                {duBao && (
                  <tr className="lds-cong">
                    <td className="c lds-mu">=</td>
                    <td>Dự kiến còn</td>
                    <td>{ghiChuCuoi}</td>
                    <td className="n">
                      <span className={duBao.duoiCuoi ? "tkh-do" : max != null && duBao.duKien > max ? "tkh-cam" : undefined}>
                        {fmtQty(duBao.duKien)}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table></div>
            {tonToanXuong != null && tonToanXuong > mh.ton + 1e-9 && (
              <p className="tkh-goi tkh-chu-thich">
                Lệnh xuất tính trên tồn toàn xưởng {fmtQty(tonToanXuong)} {dvt} (mọi kho), ở đây trừ vào tồn của kho này.
              </p>
            )}
          </section>

          {duBao && duBao.suKien.length > 0 && (
            <section>
              <div className="tkh-muc">Tồn theo ngày<span className="tkh-sp" /><span className="tkh-goi">mỗi chấm là một việc</span></div>
              <DuongTon ton={mh.ton} duBao={duBao} th={th} sang={sang} onSang={setSang} />
            </section>
          )}
        </div>

        <div className="tkh-tq2__cot">
          <section>
            <div className="tkh-muc">Lô trong kho<span className="tkh-sp" /><span className="tkh-goi">nhập trước lấy trước</span></div>
            {loTon.length === 0 ? (
              <p className="tkh-goi tkh-chu-thich">Không còn lô nào tồn.</p>
            ) : (
              <>
                <div className="lds-bang"><table className="lds-g">
                  <colgroup><col style={{ width: 40 }} /><col /><col style={{ width: 108 }} /><col style={{ width: 110 }} /><col style={{ width: 96 }} /></colgroup>
                  <thead><tr><th className="c">#</th><th>Phiếu nhập</th><th>Ngày nhập</th><th>Vị trí</th><th className="n">Còn lại</th></tr></thead>
                  <tbody>
                    {loTon.slice(0, 5).map((l, i) => (
                      <tr key={l.id}>
                        <td className="c lds-mu">{i + 1}</td>
                        <td>
                          {l.voucher_id != null ? (
                            <button type="button" className="tkh-lk tkh-lk--dau" onClick={() => onOpenVoucher(l.voucher_id!)}>{l.voucher_ma ?? l.ma_lo}</button>
                          ) : "Đầu kỳ"}
                          {l.trang_thai !== "available" && <span className="tkh-phu">chưa xuất được</span>}
                        </td>
                        <td>{fmtDateISO(l.ngay_nhap.slice(0, 10))}</td>
                        <td>{l.vi_tri ?? <span className="tkh-mo">chưa gắn</span>}</td>
                        <td className="n">{fmtQty(l.sl_con_lai)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                {loTon.length > 5 && <p className="tkh-goi tkh-chu-thich">Còn {loTon.length - 5} lô nữa ở tab Lô tồn.</p>}
              </>
            )}
          </section>

          <section>
            <div className="tkh-muc">
              Mức tồn ở kho này<span className="tkh-sp" />
              {th && canSetThreshold && <span className="tkh-goi">bấm số để sửa</span>}
            </div>
            {th ? (
              <div className="lds-bang"><table className="lds-g">
                <thead><tr><th className="n">Tối thiểu</th><th className="n">Tối đa</th><th>Nhắc mua</th></tr></thead>
                <tbody>
                  <tr className={canSetThreshold ? "lds-dong" : undefined} title={canSetThreshold ? "Sửa mức tồn" : undefined}
                    onClick={canSetThreshold ? onDatNguong : undefined}>
                    <td className="n">{fmtQty(th.nguong_ton)}<span className="tkh-dvt">{dvt}</span></td>
                    <td className="n">{th.nguong_toi_da != null ? <>{fmtQty(th.nguong_toi_da)}<span className="tkh-dvt">{dvt}</span></> : <span className="tkh-mo">không giới hạn</span>}</td>
                    <td>{th.canh_bao ? "Bật" : "Tắt"}</td>
                  </tr>
                </tbody>
              </table></div>
            ) : (
              <div className="tkh-chua-muc">
                <p className="tkh-goi">Chưa đặt mức nên máy không nhắc mua khi sắp hết, và mặt hàng không vào nhóm Cần mua.</p>
                {canSetThreshold && (
                  <button type="button" className={`tkh-btn tkh-btn--nho${duBao?.canMua ? "" : " tkh-btn--chinh"}`} onClick={onDatNguong}>
                    <Gauge aria-hidden="true" />Đặt mức
                  </button>
                )}
              </div>
            )}
          </section>

          {canViewCost && (binhQuan != null || (soGia && soGia.items.length > 0)) && (
            <section>
              <div className="tkh-muc">Giá</div>
              <div className="lds-bang"><table className="lds-g">
                <colgroup><col /><col style={{ width: 150 }} /></colgroup>
                <tbody>
                  {mh.giaTri > 0 && (
                    <tr><td>Giá trị tồn</td><td className="n">{money(mh.giaTri)}</td></tr>
                  )}
                  {binhQuan != null && (
                    <tr><td>Bình quân trong kho</td><td className="n">{money(binhQuan)}/{dvt}</td></tr>
                  )}
                  {soGia?.items.slice(0, 4).map((s) => (
                    <tr key={s.supplier_item_id}>
                      <td>
                        {s.supplier_name}
                        {s === nccRe && soGia.items.length > 1 && <span className="tkh-the" style={{ marginLeft: 8 }}>rẻ nhất</span>}
                      </td>
                      <td className="n">{s.gia_quy_doi != null ? `${money(s.gia_quy_doi)}/${dvGoc}` : <span className="tkh-mo">chưa quy đổi được</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {soGia && soGia.items.length > 0 && dvGoc && dvGoc !== dvt && (
                <p className="tkh-goi tkh-chu-thich">Nhà cung cấp báo giá theo {dvGoc}, đơn vị gốc của mặt hàng; tồn ở đây đếm theo {dvt}.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
