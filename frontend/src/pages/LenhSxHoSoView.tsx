// Hồ sơ MỘT lệnh sản xuất — lớp phủ CHỈ ĐỌC, mở từ Hồ sơ lệnh lẫn Theo dõi sản xuất (làm gọn
// 05/10/2026, đặc tả mục 4.2). Phần đầu: định danh, thẻ nhỏ, dòng cảnh báo có việc cụ thể, ba ô
// tổng quan, hàng neo năm mục. Thân: Công đoạn · Quy cách · Vật tư · Sau sản xuất · Nhật ký.
//
// ⚠️ KHÔNG MỘT NÚT GHI NÀO; KHÔNG MỘT SỐ TIỀN NÀO. Thứ đi RA khỏi màn chỉ có: liên kết sang đơn
// hàng bán, nút In phiếu công nghệ (đọc ra một tờ giấy, không tăng phiên bản).
//
// Khung trả về của máy chủ vẫn 13 khối (phiếu công nghệ dùng chung); gọn là việc của màn này.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, api } from "../api/client";
import type { LenhSxHoSoOut } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { useCan } from "../auth/permissions";
import { Button } from "../components/Button";
import { EmptyState as EmptyStateChung } from "../components/EmptyState";
import { Icon } from "../components/Icons";
import { BangLoi, EmptyState, ngay, ngayGio, num } from "./keHoachSxShared";
import { LsxHoSoCongDoan } from "./LsxHoSoCongDoan";
import { LsxHoSoNhatKy } from "./LsxHoSoNhatKy";
import { LsxHoSoQuyCach } from "./LsxHoSoQuyCach";
import { LsxHoSoSauSx } from "./LsxHoSoSauSx";
import { LsxHoSoVatTu } from "./LsxHoSoVatTu";
import { ngayNgan, soNgayTre } from "./lsxHoSoChung";
import { PillKhau, TheDaDong, TheGap, nhanKhau } from "./lsxKhau";
import { useNapTenDonVi } from "./tenDonVi";
import "./ke-hoach-sx.css";
import "./lenh-sx-chung.css";
import "./lenh-sx-ho-so.css";

const MUC: { id: string; ten: string }[] = [
  { id: "cong-doan", ten: "Công đoạn" },
  { id: "quy-cach", ten: "Quy cách" },
  { id: "vat-tu", ten: "Vật tư" },
  { id: "sau-sx", ten: "Sau sản xuất" },
  { id: "nhat-ky", ten: "Nhật ký" },
];

export function LenhSxHoSoView({
  lsxId,
  pv,
  onClose,
  onMoDon,
  eventTick,
}: {
  lsxId: number;
  /** Phiên bản in trên tờ giấy đã quét (deep link `#lsx=&pv=`). Nhỏ hơn phiên bản hiện tại ⇒ băng
   *  cảnh báo; nội dung màn KHÔNG đổi theo `pv`. Mở tay từ bảng thì `null`. */
  pv?: number | null;
  onClose: () => void;
  /** Sang màn Đơn hàng bán, mở drawer của đơn (form tạo yêu cầu giao hàng nằm ở đó). */
  onMoDon?: (orderId: number) => void;
  /** Nhịp SSE ĐÃ GỘP của màn mẹ — hồ sơ tươi cùng nhịp với bảng phía sau. */
  eventTick?: number;
}) {
  const { token } = useAuth();
  const can = useCan();
  useNapTenDonVi();
  const [d, setD] = useState<LenhSxHoSoOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<{ text: string; thuLaiDuoc: boolean } | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api.lenhSanXuat
      .hoSo(token, lsxId)
      .then((r) => {
        setD(r);
        setLoi(null);
      })
      .catch((e) => {
        const st = e instanceof ApiError ? e.status : 0;
        setLoi({
          text:
            st === 403
              ? "Lệnh này nằm ngoài phạm vi của bạn."
              : st === 404
                ? "Không tìm thấy lệnh này trong danh sách lệnh đã phát hành."
                : e instanceof ApiError
                  ? e.message
                  : "Máy chủ không phản hồi.",
          thuLaiDuoc: st !== 403 && st !== 404,
        });
      })
      .finally(() => setLoading(false));
  }, [token, lsxId]);

  // `lsxId` đổi khi lớp phủ vẫn mở ⇒ xoá hồ sơ cũ TRƯỚC, để không bày mã lệnh cũ trong lúc chờ.
  useEffect(() => {
    setD(null);
    setLoi(null);
  }, [lsxId]);
  useEffect(() => {
    load();
  }, [load]);

  // Tươi theo nhịp đã gộp; giữ nội dung cũ tới khi lượt mới về (không chớp khung xám).
  const tickDau = useRef(eventTick ?? 0);
  useEffect(() => {
    const t = eventTick ?? 0;
    if (t === tickDau.current) return;
    tickDau.current = t;
    load();
  }, [eventTick, load]);

  const dongRef = useRef(onClose);
  dongRef.current = onClose;
  // Esc đóng + khoá cuộn nền trong lúc lớp phủ mở.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") dongRef.current();
    };
    document.addEventListener("keydown", f);
    const cuonCu = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", f);
      document.body.style.overflow = cuonCu;
    };
  }, []);

  const quayLaiRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    quayLaiRef.current?.focus();
  }, [lsxId]);

  // --- in phiếu công nghệ ----------------------------------------------------------------------
  const [dangIn, setDangIn] = useState(false);
  const [inLoi, setInLoi] = useState<string | null>(null);
  async function inPhieu() {
    if (!token || dangIn) return;
    setDangIn(true);
    setInLoi(null);
    try {
      // Endpoint đòi Bearer ⇒ kéo blob rồi mới mở.
      const url = await api.lenhSanXuat.phieuCongNghePdf(token, lsxId);
      const w = window.open(url, "_blank");
      if (!w) {
        URL.revokeObjectURL(url);
        setInLoi("Trình duyệt đã chặn cửa sổ mới. Cho phép mở cửa sổ cho trang này rồi bấm lại.");
        return;
      }
      try {
        w.opener = null;
      } catch {
        /* cùng gốc thì không rơi vào đây */
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      const st = e instanceof ApiError ? e.status : 0;
      setInLoi(
        st === 403
          ? "Bạn không có quyền in phiếu của lệnh này."
          : st === 404
            ? "Không tìm thấy lệnh sản xuất này, có thể lệnh không còn ở trạng thái đã phát hành."
            : "Không in được phiếu công nghệ. Thử lại sau.",
      );
    } finally {
      setDangIn(false);
    }
  }

  // --- neo năm mục: cuộn trong thân lớp phủ ----------------------------------------------------
  const thanRef = useRef<HTMLDivElement | null>(null);
  function toiMuc(id: string) {
    thanRef.current?.querySelector<HTMLElement>(`#lhs-muc-${id}`)?.scrollIntoView({ block: "start" });
  }

  const tt = d?.thong_tin;
  const td = d?.tien_do;

  // "bước i trên n" đếm từ routing (máy chủ đã sắp).
  const buoc = useMemo(() => {
    const nodes = d?.routing.nodes ?? [];
    const i = nodes.findIndex((n) => n.la_buoc_hien_tai);
    return i >= 0 ? `bước ${i + 1} trên ${nodes.length}` : null;
  }, [d]);

  // Dòng cảnh báo — mỗi cờ đang bật một dòng có việc cụ thể (thứ tự `CO_CANH_BAO`).
  const suCoMo = d?.su_co.filter((s) => s.trang_thai === "cho_tiep_nhan") ?? [];
  const suCoDangSua =
    d?.su_co.filter(
      (s) => s.trang_thai === "da_tao_phieu" && s.phieu && s.phieu.trang_thai !== "da_sua_xong",
    ) ?? [];
  const kcsHong = td?.canh_bao.includes("kcs_khong_dat")
    ? (d?.kcs.batch.filter((b) => b.ket_luan === "khong_dat") ?? [])
    : [];
  const soThieu = useMemo(() => {
    if (!d || !d.tien_do.canh_bao.includes("thieu_vat_tu")) return 0;
    const k = new Set<string>();
    for (const v of [...d.vat_tu.hien_tai.dong, ...d.vat_tu.canh_bao_sau]) {
      if ((v.thieu ?? 0) > 0) k.add(`${v.hang_loai}-${v.hang_id}`);
    }
    return Math.max(k.size, 1);
  }, [d]);

  const nhanTrenNen = useRef(false);
  const xongSx = td ? td.khau !== "dang_sx" : false;
  const pct = td ? Math.max(0, Math.min(100, Math.round(td.phan_tram))) : 0;
  const tamDung = !!td?.canh_bao.includes("tam_dung");
  const tre = td && tt && !xongSx ? soNgayTre(td.du_kien_xong, tt.han_hoan_thanh_sx) : null;

  return (
    <div
      className="lhs"
      onMouseDown={(e) => {
        nhanTrenNen.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || !nhanTrenNen.current) return;
        onClose();
      }}
    >
      <section className="lhs__panel" role="dialog" aria-modal="true" aria-labelledby="lhs-title">
        <div className="lhs__cuon" ref={thanRef}>
          <header className="lhs__dau">
            <div className="lhs__hang">
              <button type="button" ref={quayLaiRef} className="lhs__lui" onClick={onClose}>
                <Icon name="chevron" size={15} />
                Quay lại danh sách
              </button>
              <h2 className="lhs__ma" id="lhs-title">
                {tt?.ma ?? `Lệnh #${lsxId}`}
              </h2>
              {td && <PillKhau khau={td.khau} ct={td.khau_chi_tiet} />}
              {tt?.da_dong && <TheDaDong />}
              {tt?.is_rush && <TheGap />}
              {tt && <span className="lhs__ten">{tt.ten ?? "Chưa đặt tên"}</span>}
              <span className="lsc-spacer" />
              <Button variant="secondary" onClick={inPhieu} disabled={dangIn || !token}>
                <Icon name="printer" size={14} /> {dangIn ? "Đang dựng phiếu…" : "In phiếu công nghệ"}
              </Button>
            </div>
            {inLoi && (
              <p className="lhs__inloi" role="alert">
                <Icon name="alert" size={14} /> {inLoi}
              </p>
            )}

            {d && tt && (
              <div className="lhs__the">
                <span className="lhs-the">
                  <span className="lhs-the__k">Khách</span>
                  {tt.khach_hang ?? "—"}
                </span>
                <span className="lhs-the">
                  <span className="lhs-the__k">Đơn</span>
                  {tt.order_no && tt.order_id != null && onMoDon ? (
                    <button type="button" className="lsc-link" onClick={() => onMoDon(tt.order_id as number)}>
                      {tt.order_no}
                    </button>
                  ) : (
                    (tt.order_no ?? "—")
                  )}
                </span>
                <span className="lhs-the">
                  <span className="lhs-the__k">Phiên bản</span>
                  {d.phien_ban == null ? "Chưa phát hành" : d.phien_ban}
                </span>
                {tt.nhom_ten && (
                  <span className="lhs-the">
                    <span className="lhs-the__k">Nhóm</span>
                    {tt.nhom_ten}
                    {d.giao_hang.so_lenh_trong_nhom > 1 && (
                      <span className="lsc-phu lhs-the__phu">{d.giao_hang.so_lenh_trong_nhom} lệnh</span>
                    )}
                  </span>
                )}
              </div>
            )}

            {d && pv != null && d.phien_ban != null && pv < d.phien_ban && (
              <div className="banner banner--warn lhs__pv" role="status">
                Phiếu giấy v{pv}, lệnh hiện tại đã là v{d.phien_ban}
              </div>
            )}

            {d && (suCoMo.length > 0 || suCoDangSua.length > 0 || kcsHong.length > 0 || soThieu > 0) && (
              <ul className="lhs-canhbao" aria-label="Cảnh báo của lệnh">
                {suCoMo.map((s) => (
                  <li key={s.id} className="lhs-canhbao__do">
                    <b>Sự cố {s.ma}</b>
                    <span>
                      {[s.may, s.bo_phan_hong].filter(Boolean).join(", ") || "—"}
                      {s.mo_ta ? `: ${s.mo_ta}` : ""}
                    </span>
                    <span className="lsc-phu">từ {s.thoi_diem ? ngayGio(s.thoi_diem) : "—"}</span>
                    {s.may_dung && <span className="lsc-tag">Máy dừng</span>}
                  </li>
                ))}
                {suCoDangSua.map((s) => (
                  <li key={s.id} className="lhs-canhbao__vang">
                    <b>Sự cố {s.ma}</b>
                    <span>Đang sửa, phiếu {s.phieu?.ma}</span>
                    {s.may && <span className="lsc-phu">{s.may}</span>}
                  </li>
                ))}
                {kcsHong.map((b) => (
                  <li key={b.id} className="lhs-canhbao__do">
                    <b>KCS không đạt</b>
                    <span>Lô của bước {b.ten_viec ?? "—"}</span>
                    <span className="lsc-phu">{b.ket_thuc ? ngayGio(b.ket_thuc) : "—"}</span>
                  </li>
                ))}
                {soThieu > 0 && (
                  <li className="lhs-canhbao__do">
                    <b>Thiếu vật tư</b>
                    <span>{soThieu} mặt hàng đang thiếu</span>
                    <button type="button" className="lsc-link" onClick={() => toiMuc("vat-tu")}>
                      Xem mục Vật tư
                    </button>
                  </li>
                )}
              </ul>
            )}

            {d && tt && td && (
              <div className="lhs-tong" aria-label="Tổng quan lệnh">
                <div className="lhs-tong__o">
                  <span className="lhs-tong__k">Tiến độ</span>
                  {xongSx ? (
                    <>
                      <span className="lhs-tong__v">{nhanKhau(td.khau, td.khau_chi_tiet)}</span>
                      <span className="lsc-phu">Đã xong sản xuất</span>
                    </>
                  ) : (
                    <>
                      <span className="lhs-tong__v">
                        {td.buoc_hien_tai ?? "Chưa bắt đầu"}
                        {buoc && <span className="lsc-phu lhs-tong__phu">{buoc}</span>}
                      </span>
                      <span
                        className={`lsc-thanh${tamDung ? " lsc-thanh--do" : ""}`}
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuetext={`${pct} phần trăm${td.uoc_tinh ? ", ước tính" : ""}`}
                      >
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      <span className="lsc-phu">
                        {pct}%{" "}
                        {td.uoc_tinh
                          ? "ước theo thời lượng kế hoạch vì chưa ghi sản lượng"
                          : "đo theo sản lượng đã ghi"}
                      </span>
                    </>
                  )}
                </div>
                <div className="lhs-tong__o">
                  <span className="lhs-tong__k">Hạn xong sản xuất</span>
                  <span className="lhs-tong__v">{ngay(tt.han_hoan_thanh_sx)}</span>
                  {xongSx ? (
                    <span className="lsc-phu">Đã xong sản xuất</span>
                  ) : !td.du_kien_xong ? (
                    <span className="lsc-phu">Chưa đủ dữ liệu để dự kiến</span>
                  ) : tre !== null && tre > 0 ? (
                    <span className="lsc-do">
                      Dự kiến xong {ngayNgan(td.du_kien_xong)}, trễ {tre} ngày
                    </span>
                  ) : (
                    <span className="lsc-phu">Dự kiến xong {ngayNgan(td.du_kien_xong)}, kịp</span>
                  )}
                </div>
                <div className="lhs-tong__o">
                  <span className="lhs-tong__k">Đã giao khách</span>
                  <span className="lhs-tong__v">
                    {num(td.da_giao)} trên {num(tt.so_luong_dat)} {tt.don_vi_tinh ?? ""}
                  </span>
                  <span className="lsc-phu">Hạn giao khách {ngay(tt.han_giao_khach)}</span>
                </div>
              </div>
            )}

            {d && (
              <nav className="lhs-neo" aria-label="Các mục của hồ sơ">
                {MUC.map((m) => (
                  <button key={m.id} type="button" className="lhs-chip" onClick={() => toiMuc(m.id)}>
                    {m.ten}
                  </button>
                ))}
              </nav>
            )}
          </header>

          <div className="lhs__than">
            {loading && !d ? (
              <EmptyStateChung trangThai="dang-tai" inline nhanTai="Đang tải hồ sơ lệnh…" />
            ) : loi && !d ? (
              <EmptyState
                icon="alert"
                title={loi.text}
                sub={loi.thuLaiDuoc ? undefined : "Danh sách phía sau vẫn còn nguyên, quay lại và chọn lệnh khác."}
                action={
                  loi.thuLaiDuoc ? (
                    <Button variant="ghost" onClick={load}>
                      Thử lại
                    </Button>
                  ) : undefined
                }
              />
            ) : d && tt ? (
              <>
                {loi && <BangLoi text="Không làm mới được hồ sơ." onRetry={load} />}
                <section className="lhs-muc" id="lhs-muc-cong-doan" aria-labelledby="lhs-h-cong-doan">
                  <h3 id="lhs-h-cong-doan">Công đoạn</h3>
                  <LsxHoSoCongDoan d={d} />
                </section>
                <section className="lhs-muc" id="lhs-muc-quy-cach" aria-labelledby="lhs-h-quy-cach">
                  <h3 id="lhs-h-quy-cach">Quy cách</h3>
                  <LsxHoSoQuyCach ts={d.thong_so} tt={tt} />
                </section>
                <section className="lhs-muc" id="lhs-muc-vat-tu" aria-labelledby="lhs-h-vat-tu">
                  <h3 id="lhs-h-vat-tu">Vật tư</h3>
                  <LsxHoSoVatTu vt={d.vat_tu} />
                </section>
                <section className="lhs-muc" id="lhs-muc-sau-sx" aria-labelledby="lhs-h-sau-sx">
                  <h3 id="lhs-h-sau-sx">Sau sản xuất</h3>
                  <LsxHoSoSauSx d={d} choPhepLap={can("giao_hang", "create")} onMoDon={onMoDon} />
                </section>
                <section className="lhs-muc" id="lhs-muc-nhat-ky" aria-labelledby="lhs-h-nhat-ky">
                  <h3 id="lhs-h-nhat-ky">Nhật ký</h3>
                  <LsxHoSoNhatKy d={d} />
                </section>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
