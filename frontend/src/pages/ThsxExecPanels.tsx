// PHA SAU của DRAWER Thực hiện sản xuất — Giai đoạn 3 (sản lượng · bàn giao · vật tư) + Giai đoạn 4
// (hỗ trợ chéo). Lớp "chia sản lượng từng mẻ" GỠ 18/09/2026 (mg `0322`): mẻ ghi theo CÔNG VIỆC
// KHOÁN, người tham gia chỉ là danh sách — sản xuất không chia, không nhân ra tiền. Gộp thẳng vào drawer `ThsxDrawer` (KHÔNG đẻ màn
// mới): mỗi mặt là một khối; biểu mẫu mở từ nút đầu khối hiện thành hộp thoại nổi (`ThsxModal`),
// còn thao tác trên từng dòng (sửa số, điều chỉnh, huỷ…) vẫn mở tại chỗ ngay dưới dòng đó.
//
// Component KHÔNG tự gọi API: mọi mặt GHI đi qua `exec.*` (controller lo khoá lạc quan + refetch +
// toast). Danh mục "Lý do & lỗi SX" ĐÃ GỠ (mg 0288): không khâu nào bắt nêu lý do nữa, chỗ nào cần
// nói thêm thì có ô mô tả TỰ DO tuỳ chọn.
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import type {
  SxWorkItemChiTiet, SxBatch, SxBanGiao, SxBanGiaoChangSau, SxHoTro, SxHoTroUngVien,
  SxBatchIn, SxBanGiaoDeXuatIn, SxBanGiaoSuaIn, SxBanGiaoDieuChinhIn,
  SxHoTroDeXuatIn, SxKhoanCongDoan, SxViecPhatSinhChon,
  SxKetQuaNhanh, SxSuCoIn, SxVatTuCap, SxVatTuCapLan, SxVatTuCapDoiChieu,
  SxVatTuDeNghiIn, SxVatTuDeNghiDongIn, SxTranGhi, SxVatTuNhapLaiIn,
} from "../api/client";
import { Button } from "../components/Button";
import { ChonNgay, ChonNgayGio } from "../components/ChonNgay";
import { Icon } from "../components/Icons";
import type { IconName } from "../components/Icons";
import { DonViChonTheoHang, MaterialCombobox } from "../components/MaterialCombobox";
import { Select, type SelectOption } from "../components/Select";
import { useAuth } from "../auth/useAuth";
import { GIO_NHAP_MAX, GIO_NHAP_MIN, gioNhapHopLe } from "../lib/gioNhap";
import { DANG_GIAY_NHAN, chuanKho, nhanDangKho, type DangGiay } from "../lib/khoGiay";
import { DecimalInput } from "./khoShared";
import { num, ngayGio, ngay, gioNgan } from "./keHoachSxShared";
import { VoucherDrawer } from "./KhoYeuCauPage";
import { nhanChang, nhanDonVi } from "./lsxBuoc";
import { tinhTrangChon } from "./thsxTinhTrangNguoi";

// ============================ hợp đồng hành động (controller cấp) ============================
export interface ThsxExec {
  // Đổi máy giữa chừng (§7.2 mở rộng 31/08/2026) — CHẠY thì đóng phiên máy cũ + mở phiên mới
  // CÙNG mốc (giờ máy cũ không mất); TẠM DỪNG thì chỉ đổi máy phân công, không mở phiên.
  doiMay: (mayId: number, lyDo?: string | null) => Promise<boolean>;
  // Báo sự cố tại tổ (31/08/2026) — KHÔNG có bảng sự cố riêng: ghi thẳng vào hộp thư "Báo máy
  // hỏng" của tổ sửa chữa, kèm neo về công việc/lệnh. Nhánh "Dừng sản xuất" gộp luôn cú tạm dừng.
  baoSuCo: (body: SxSuCoIn) => Promise<boolean>;
  taoBatch: (body: SxBatchIn) => Promise<SxKetQuaNhanh[] | null>;
  deXuatBanGiao: (body: SxBanGiaoDeXuatIn) => Promise<boolean>;
  suaBanGiao: (banGiaoId: number, body: SxBanGiaoSuaIn) => Promise<boolean>;
  xacNhanBanGiao: (banGiaoId: number, version: number) => Promise<boolean>;
  dieuChinhBanGiao: (banGiaoId: number, body: SxBanGiaoDieuChinhIn) => Promise<boolean>;
  xacNhanVatTu: (voucherId: number) => Promise<boolean>;
  // Đề nghị cấp vật tư theo công đoạn — `deNghiId` là id ĐỀ NGHỊ SẢN XUẤT, không phải id yêu cầu kho.
  deNghiVatTu: (congViecId: number, body: SxVatTuDeNghiIn) => Promise<boolean>;
  suaDeNghiVatTu: (congViecId: number, deNghiId: number, body: SxVatTuDeNghiIn) => Promise<boolean>;
  /** Tổ yêu cầu NHẬP LẠI vật tư thừa vào kho (spec 2026-10-01 §3.5). */
  nhapLaiVatTu: (congViecId: number, body: SxVatTuNhapLaiIn) => Promise<boolean>;
  deXuatHoTro: (body: SxHoTroDeXuatIn) => Promise<boolean>;
  xacNhanHoTro: (hoTroId: number, version: number) => Promise<boolean>;
  huyHoTro: (hoTroId: number, lyDo: string, version: number) => Promise<boolean>;
  // Băng "Danh mục đã đổi" của mẻ (§7.2b): ảnh chụp việc khoán/phát sinh lấy số MỚI.
  capNhatDanhMucMe: (batchId: number) => Promise<boolean>;
}

interface Props {
  chiTiet: SxWorkItemChiTiet;
  busy: boolean;
  hoTroUngVien: SxHoTroUngVien[];
  /** Ngày XƯỞNG máy chủ trả kèm danh sách ứng viên — để nói "nghỉ phép hôm nay". */
  ungVienHomNay?: string | null;
  /** Mở form đề xuất hỗ trợ — trang nạp lại tình trạng ứng viên cho tươi. */
  onMoChonNguoi?: () => void;
  exec: ThsxExec;
}

// ============================ helper thuần ==================================
export function toNum(s: string): number { const n = Number(s.replace(/,/g, "")); return Number.isFinite(n) ? n : 0; }
export function toDtLocal(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(" ", "T").slice(0, 16); // "YYYY-MM-DDTHH:mm"
}
export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** "Bây giờ" theo khuôn `datetime-local` — chỗ dựa khi công việc chưa có mốc dự kiến. */
function nowDtLocal(): string {
  const d = new Date();
  return `${todayYmd()}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const BG_TT: Record<string, { txt: string; cls: string }> = {
  proposed: { txt: "chờ xác nhận", cls: "thsx-x-pill--wait" },
  confirmed: { txt: "đã xác nhận", cls: "thsx-x-pill--ok" },
  adjusted: { txt: "đã điều chỉnh", cls: "thsx-x-pill--adj" },
};

/** Một đầu của lần giao: công đoạn nào, thuộc tổ nào, ai đứng ra, lúc nào. */
function BenBanGiao({ nhan, cd, to, ai, cho = false, isSender = false }: {
  nhan: string; cd?: string | null; to?: string | null; ai: ReactNode; cho?: boolean; isSender?: boolean;
}) {
  return (
    <div className={`thsx-hb-node ${isSender ? "thsx-hb-node--sender" : "thsx-hb-node--receiver"}`}>
      <div className="thsx-hb-node__head">
        <span className={`thsx-hb-node__chip ${isSender ? "thsx-hb-node__chip--sender" : "thsx-hb-node__chip--receiver"}`}>
          {isSender ? <Icon name="send" size={10} /> : <Icon name="check" size={10} />} {nhan}
        </span>
      </div>
      {/* Công đoạn · tổ trên MỘT dòng — tách hai dòng làm thẻ cao gấp đôi mà không thêm gì để đọc. */}
      <div className="thsx-hb-node__cd">
        {cd || "—"}{to && <span className="thsx-hb-node__to"> · {to}</span>}
      </div>
      <div className={`thsx-hb-node__ai${cho ? " is-wait" : ""}`}>
        {cho && <Icon name="clock" size={11} />}
        {ai}
      </div>
    </div>
  );
}
/** Bên giao đã điều chỉnh mà bên nhận CHƯA xác nhận lại số mới (`ban_giao.cho_xac_nhan_lai`). Số mới
 *  đã có hiệu lực — cờ này chỉ đòi bên nhận bấm Xác nhận lại. */
function choXacNhanLai(g: SxBanGiao): boolean {
  return g.trang_thai === "adjusted" && !g.xac_nhan_luc && !g.cung_to;
}
/** Lần giao bên nhận phải bấm: mới đề xuất, hoặc vừa bị bên giao điều chỉnh. */
function choBenNhan(g: SxBanGiao): boolean {
  return g.trang_thai === "proposed" || choXacNhanLai(g);
}
const HT_TT: Record<string, { txt: string; cls: string }> = {
  pending_both: { txt: "chờ hai bên", cls: "thsx-x-pill--wait" },
  confirmed: { txt: "đã chốt", cls: "thsx-x-pill--ok" },
  cancelled: { txt: "đã huỷ", cls: "thsx-x-pill--off" },
};
// Trạng thái YÊU CẦU KHO của một lần đề nghị — nhãn giữ Y HỆT `REQUEST_STATUS` (khoShared.tsx),
// chỉ đổi sang chữ thường cho khớp văn phong pill của file này. Đừng bịa nhãn khác cho cùng trạng thái.
const VT_TT: Record<string, { txt: string; cls: string }> = {
  approved: { txt: "chờ xử lý", cls: "thsx-x-pill--adj" },
  received: { txt: "kho tiếp nhận", cls: "thsx-x-pill--sky" },
  preparing: { txt: "đang chuẩn bị", cls: "thsx-x-pill--plum" },
  partial: { txt: "đã cấp một phần", cls: "thsx-x-pill--bad" },
  done: { txt: "hoàn tất", cls: "thsx-x-pill--ok" },
  rejected: { txt: "từ chối", cls: "thsx-x-pill--signal" },
  cancelled: { txt: "đã hủy", cls: "thsx-x-pill--gray" },
};
/** Ngưỡng "coi như bằng nhau" — khớp `_EPS` phía BE, để hàng khớp không hiện chênh lệch rác.
 *  Dùng cho số CÙNG THANG TỔ KHAI (kế hoạch ↔ đã yêu cầu, "số này có > 0 không"). */
const VT_EPS = 0.0005;
/** Ngưỡng riêng cho phép so ĐÃ QUA KHO. Hai bên lưu hai thang khác nhau: SX giữ 3 chữ số
 *  (`sl_yeu_cau_goc` là `Numeric(18,3)`), kho giữ 2 (`sl_de_nghi` là `Numeric(14,2)`), nên chỉ
 *  riêng làm tròn đã đẻ ra sai khác tới 0,005 — gấp 10 lần `VT_EPS`. Đo thật lúc nghiệm thu: tổ
 *  xin 554 tờ = 166,967 kg, kho cấp đúng 166,97 kg, `lech_thuc_te` ra +0,003 và dòng đeo badge
 *  vàng VĨNH VIỄN dù không ai làm gì sai. Giấy gần như không bao giờ ra số tròn 2 chữ số nên mọi
 *  dòng giấy đều dính, mà cờ lệch lại là tín hiệu DUY NHẤT của cả tính năng đối chiếu.
 *  0,005 = nửa bước lượng tử của `Numeric(_, 2)`: đúng phần sai khác mà cấu trúc bắt buộc phải có.
 *  KHÔNG nới `VT_EPS` lên bằng nó — hằng kia còn gác luật "có xin món này không" (`vtCanLyDo`,
 *  `vtCanTro`, `vtPayloadLines`), nới là đổi luôn luật bắt buộc ghi lý do. */
const VT_EPS_KHO = 0.005;

/** Số LẦN đề nghị CÓ XIN món này — nhân tử của dung sai `VT_EPS_KHO` (xem `vtCoLechThucTe`).
 *  Khớp theo cặp `hang_loai` + `hang_id`, đúng khoá mà `board.py::_vat_tu_cap` dùng để gom.
 *
 *  Dòng số 0 KHÔNG tính, dù nó vẫn nằm trong lần đề nghị đó: bản đối chiếu của sản xuất giữ cả
 *  dòng xin 0 (tổ đã sửa món đó về 0), nhưng `_lines_kho` không đẻ dòng kho cho chúng nên chúng
 *  không đi qua bước làm tròn về `Numeric(14,2)` nào — đếm vào là nới dung sai thêm 0,005 cho một
 *  lần không đóng góp sai số nào, tức bịt bớt cờ lệch THẬT. Xét ở thang GỐC (`sl_yeu_cau_goc`),
 *  đúng thang mà `board.py` cộng dồn để ra `lech_thuc_te`. */
export function vtSoLanCoMon(
  cacDeNghi: { dongs: (VtKhoaVao & { sl_yeu_cau_goc: number })[] }[],
  d: VtKhoaVao,
): number {
  // Cùng khoá với hàng đối chiếu (`vtKhoa`): giấy khác dạng/khổ là món khác.
  const k = vtKhoa(d);
  return cacDeNghi.filter(
    (l) => l.dongs.some((x) => vtKhoa(x) === k && x.sl_yeu_cau_goc > 0),
  ).length;
}

/** Kho thực xuất có LỆCH so với số tổ đã xin không — so ở thang KHO (`VT_EPS_KHO`).
 *  Tách khỏi JSX để test được: đây là vị ngữ quyết định badge vàng của cả bảng đối chiếu.
 *
 *  `soLan` = số lần đề nghị có chứa món này. `VT_EPS_KHO` là dung sai của MỘT lần làm tròn, nhưng
 *  `board.py` CỘNG DỒN `sl_yeu_cau_goc` qua mọi lần đề nghị của cùng một món, nên sai khác do làm
 *  tròn cũng cộng dồn: ba lần bổ sung mỗi lần lệch 0,004 là tổng 0,012 > 0,005 và badge vàng giả
 *  quay lại y như trước bản vá. Nhân dung sai theo số lần cộng vào là đúng chiều tích lũy đó.
 *  Sàn 1: món chưa có lần đề nghị nào (dòng kế hoạch thuần) vẫn phải giữ dung sai một lần. */
export function vtCoLechThucTe(
  d: Pick<SxVatTuCapDoiChieu, "lech_thuc_te">,
  soLan = 1,
): boolean {
  return Math.abs(d.lech_thuc_te) > VT_EPS_KHO * Math.max(1, soLan);
}

// ============================ khối chính ====================================
export function ThsxExecPanels({ chiTiet, busy, hoTroUngVien, ungVienHomNay = null, onMoChonNguoi, exec }: Props) {
  // Nút ghi theo QUYỀN TRÊN CHÍNH công việc này (máy chủ tính theo dòng quyền của tổ): ghi mẻ là
  // Thực hiện lệnh; bàn giao · hỗ trợ chéo là Xác nhận sản lượng; vật tư là Kho.
  const quyen = chiTiet.quyen ?? {};
  const canThucHien = !!quyen.run_order;
  const canXacNhan = !!quyen.confirm_output;
  const canKho = !!quyen.warehouse;
  const sl = chiTiet.san_luong;
  const conLai = Math.max(0, sl.tong_tot - sl.da_giao);
  // Tên người tham gia/được phân công — để gọi tên người nhận vật tư.
  const tenNguoi = new Map<number, string>();
  for (const k of chiTiet.khoang_tham_gia) tenNguoi.set(k.employee_id, k.ho_ten);
  for (const p of chiTiet.phan_cong) tenNguoi.set(p.employee_id, p.ho_ten);

  return (
    <>
      <SanLuongSection chiTiet={chiTiet} canAssign={canThucHien} busy={busy} exec={exec} />
      <BanGiaoSection
        chiTiet={chiTiet} canAssign={canXacNhan} busy={busy}
        conLai={conLai} exec={exec} />
      <VatTuSection chiTiet={chiTiet} canAssign={canKho} busy={busy} exec={exec} tenNguoi={tenNguoi} />
      <HoTroSection
        chiTiet={chiTiet} canAssign={canXacNhan} busy={busy}
        hoTroUngVien={hoTroUngVien} ungVienHomNay={ungVienHomNay} onMoChonNguoi={onMoChonNguoi} exec={exec} />
    </>
  );
}

// ─────────────────────────── SẢN LƯỢNG (§10-11) ───────────────────────────
function SanLuongSection({
  chiTiet, canAssign, busy, exec,
}: {
  /** `canAssign` = ghi mẻ + cập nhật ảnh chụp danh mục của mẻ (Thực hiện lệnh). */
  chiTiet: SxWorkItemChiTiet; canAssign: boolean; busy: boolean;
  exec: ThsxExec;
}) {
  const sl = chiTiet.san_luong;
  const cv = chiTiet.cong_viec;
  const buocCuoi = chiTiet.ban_giao_chang_sau.length === 0;
  const xong = cv.trang_thai === "completed";
  const conPhaiLam = !xong && sl.nhan_ra != null ? Math.max(sl.nhan_ra - sl.tong_tot, 0) : null;
  const dvRa = sl.don_vi ? <span className="thsx-metric-unit">{nhanChang(sl.don_vi)}</span> : null;
  const [formOpen, setFormOpen] = useState(false);
  const [ketQuaToa, setKetQuaToa] = useState<SxKetQuaNhanh[] | null>(null);

  return (
    <section className="thsx-psec thsx-x thsx-psec-card">
      <div className="thsx-psec__h">
        <span className="thsx-psec__title">
          <span className="thsx-psec__icon-badge thsx-psec__icon-badge--blue"><Icon name="layers" size={13} /></span> Sản lượng
        </span>
        {canAssign && (
          <Button variant="accent" onClick={() => setFormOpen(true)} disabled={busy} aria-haspopup="dialog" className="thsx-btn-primary-action">
            <Icon name="plus" size={13} /> Ghi mẻ
          </Button>
        )}
      </div>

      {/* Cùng luật ô tiến độ (27/09/2026): tổ chỉ ghi TỐT; đang chạy thì "Còn phải làm" = nhận −
          tốt, bấm Kết thúc thì phần đó thành LỖI. Không bày mục tiêu kế hoạch / "còn thiếu" nữa. */}
      <div className="thsx-batch-metric-strip">
        <div className="thsx-batch-metric-tile thsx-metric-tile--done">
          <span className="thsx-metric-lbl">Tốt</span>
          <span className="thsx-metric-val thsx-metric-val--done">{num(sl.tong_tot)}{dvRa}</span>
        </div>
        {!buocCuoi && <>
          <div className="thsx-batch-metric-tile">
            <span className="thsx-metric-lbl">Đã giao đi</span>
            <span className="thsx-metric-val">{num(sl.da_giao)}{dvRa}</span>
          </div>
          <div className="thsx-batch-metric-tile">
            <span className="thsx-metric-lbl">Chưa giao</span>
            <span className="thsx-metric-val">{num(Math.max(0, sl.tong_tot - sl.da_giao))}{dvRa}</span>
          </div>
        </>}
        {xong ? (
          sl.loi != null && (
            <div className={`thsx-batch-metric-tile${sl.loi > 0 ? " thsx-metric-tile--thieu" : ""}`}>
              <span className="thsx-metric-lbl">Lỗi</span>
              <span className={`thsx-metric-val${sl.loi > 0 ? " thsx-metric-val--thieu" : ""}`}>{num(sl.loi)}{dvRa}</span>
            </div>
          )
        ) : conPhaiLam != null && (
          <div className="thsx-batch-metric-tile">
            <span className="thsx-metric-lbl">Còn phải làm</span>
            <span className="thsx-metric-val">{num(conPhaiLam)}{dvRa}</span>
          </div>
        )}
      </div>

      {ketQuaToa && ketQuaToa.length > 0 && (
        <div className="thsx-x-toa-banner">
          <span className="thsx-x-toa-banner__title">Đã tự toả sang các lệnh sản xuất:</span>
          <ul className="thsx-x-toa-list">
            {ketQuaToa.map((k) => (
              <li key={k.lsx_id}>
                LSX #{k.lsx_id}: <b>{num(k.so_luong)}</b> {nhanDonVi(k.don_vi)}
                {k.ban_giao_id != null ? " · đã tự bàn giao" : ""}
              </li>
            ))}
          </ul>
          <button
            type="button" className="thsx-x-toa-close" aria-label="Đóng"
            onClick={() => setKetQuaToa(null)}
          >
            ×
          </button>
        </div>
      )}

      {formOpen && (
        <BatchForm cv={cv} khoan={chiTiet.khoan ?? null} busy={busy} batDauMacDinh={batDauGoiY(chiTiet, nowDtLocal())}
          tranGhi={chiTiet.tran_ghi ?? null}
          onXong={(kq) => { setFormOpen(false); setKetQuaToa(kq.length ? kq : null); }}
          exec={exec} />
      )}

      {sl.batches.length === 0 ? (
        <div className="thsx-empty-state-card">
          <div className="thsx-empty-state-ic-wrap"><Icon name="layers" size={16} /></div>
          <div className="thsx-empty-state-content">
            <span className="thsx-empty-state-title">Chưa ghi mẻ sản lượng nào.</span>
            <span className="thsx-empty-state-sub">Bấm nút <b>"+ Ghi mẻ"</b> ở trên để bắt đầu cập nhật sản lượng thực hiện.</span>
          </div>
        </div>
      ) : (
        <ul className="thsx-x-list">
          {sl.batches.map((b) => (
            <BatchRow key={b.id} b={b} canAssign={canAssign} busy={busy} exec={exec} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Giờ bắt đầu gợi ý cho mẻ mới: nối đuôi mẻ gần nhất, chưa có mẻ thì lúc bước bắt đầu chạy.
 *  KHÔNG lấy giờ kế hoạch: 16/09/2026 form để sẵn 17/09 20:00→22:50 cho một bước chạy từ 16/09 15:24,
 *  tổ bấm ghi luôn và mẻ nằm ở tương lai. Mốc nào ở sau `bayGio` (dữ liệu gõ nhầm cũ) thì bỏ qua. */
function batDauGoiY(chiTiet: SxWorkItemChiTiet, bayGio: string): string {
  const quaKhu = (s: string) => s !== "" && s <= bayGio;
  const cuoiMe = chiTiet.san_luong.batches.map((b) => toDtLocal(b.ket_thuc)).filter(quaKhu).sort();
  if (cuoiMe.length) return cuoiMe[cuoiMe.length - 1];
  const dauPhien = chiTiet.phien_chay.map((p) => toDtLocal(p.bat_dau)).filter(quaKhu).sort();
  return dauPhien[0] ?? "";
}

/** Giá khoán kèm ĐVT — chỉ để TỔ NHÌN (§7.1): bàn tổ không nhân gì ra tiền. */
function giaKhoan(v: { don_gia: number; don_vi: string; don_vi_ten: string | null }): string {
  return `${num(v.don_gia)} đ / ${v.don_vi_ten ?? nhanDonVi(v.don_vi)}`;
}

/** "đã nhận từ In 1.000 × 2 = 2.000, đã ghi 300" — CHỈ SỐ, không đơn vị (19/09/2026: mẻ chỉ ghi
 *  nhận con số, xưởng không muốn thấy tờ/con/cái ở form này). */
// Cùng tổ + cùng lệnh thì không có bàn giao, `da_nhan` là SẢN LƯỢNG bước trước — viết "đã nhận"
// ở đó là nói sai việc, tổ sẽ đi tìm bàn giao không tồn tại. Cùng chữ với câu máy chủ chặn.
function cauTranGhi(t: SxTranGhi): string {
  const quyDoi = Math.abs(t.he_so - 1) > 1e-9 ? ` × ${num(t.he_so)} = ${num(t.toi_da)}` : "";
  const dau = t.cung_to ? "đã làm được ở" : "đã nhận từ";
  return `${dau} ${t.nguon_ten} ${num(t.da_nhan)}${quyDoi}, đã ghi ${num(t.da_ghi)}`;
}

function shiftMinutesLocal(dtStr: string, minutes: number): string {
  const base = (dtStr && gioNhapHopLe(dtStr)) ? new Date(dtStr) : new Date();
  if (isNaN(base.getTime())) return nowDtLocal();
  base.setMinutes(base.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
}

function formatDurationLocal(batDau: string, ketThuc: string): string | null {
  if (!gioNhapHopLe(batDau) || !gioNhapHopLe(ketThuc)) return null;
  const t1 = new Date(batDau).getTime();
  const t2 = new Date(ketThuc).getTime();
  if (isNaN(t1) || isNaN(t2) || t2 <= t1) return null;
  const diffMin = Math.round((t2 - t1) / (1000 * 60));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}p`;
  if (h > 0) return `${h} giờ`;
  return `${m} phút`;
}

/** Form GHI MẺ theo CÔNG VIỆC KHOÁN (spec 2026-09-18 §7.1): chọn ĐÚNG MỘT việc của tổ (thấy đơn giá
 *  · ĐVT · ghi chú), gõ số của mẻ, rồi tick một hoặc nhiều VIỆC PHÁT SINH của chính việc đó kèm số
 *  lượng. Việc phát sinh KHÔNG cộng vào sản lượng; không có thành tiền ở đâu cả. Ô tìm hiện cho MỌI
 *  tổ, tìm tương đối (bỏ dấu, khớp một phần) ở máy chủ.
 *
 *  Số của mẻ là MỘT ô "Số lượng làm được" (18/09/2026): tổ không tự chia tổng/tốt/hỏng — hàng lỗi do
 *  KCS phát hiện và ghi. Máy chủ vẫn giữ luật `tong = tot + hong` nên gửi tong = tot = số đó, hong = 0. */
export function BatchForm({
  cv, khoan, busy, batDauMacDinh, tranGhi, onXong, exec,
}: {
  cv: SxWorkItemChiTiet["cong_viec"]; busy: boolean; batDauMacDinh: string;
  khoan: SxKhoanCongDoan | null;
  /** Trần theo routing (`dau_vao.tran_ghi`) — null = không trần (bước đầu, hệ số gõ tay…). */
  tranGhi: SxTranGhi | null;
  onXong: (ketQua: SxKetQuaNhanh[]) => void; exec: ThsxExec;
}) {
  const [batDau, setBatDau] = useState(batDauMacDinh);
  const [ketThuc, setKetThuc] = useState(nowDtLocal);
  const [soLuong, setSoLuong] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  // Việc phát sinh đã tick → số đang gõ. Có khoá = đã tick.
  const [psSl, setPsSl] = useState<Record<number, string>>({});
  const nSoLuong = toNum(soLuong);
  // Mẻ 0 hợp lệ — ca chỉ làm việc phát sinh (thay kẽm, lên khuôn) vẫn cần mẻ để ghi nhận; nhưng ô
  // phải được GÕ (kể cả số 0), để trống thì chưa cho lưu.
  const soLuongDaGo = soLuong.trim() !== "" && Number.isFinite(Number(soLuong.replace(/,/g, "")));
  const donVi = cv.don_vi_ra ?? cv.don_vi_vao ?? null;
  const donViHienThi = cv.don_vi_ra ? (nhanDonVi(cv.don_vi_ra) ?? cv.don_vi_ra) : (cv.don_vi_vao ? (nhanDonVi(cv.don_vi_vao) ?? cv.don_vi_vao) : "SP");

  function tickPs(p: SxViecPhatSinhChon) {
    setPsSl((cu) => {
      const moi = { ...cu };
      if (p.id in moi) delete moi[p.id];
      else moi[p.id] = "";
      return moi;
    });
  }
  const psTick = Object.entries(psSl);
  const psHopLe = psTick.every(([, s]) => toNum(s) > 0);

  // `gioNhapHopLe` chứ không phải `!!`: ô ngày-giờ của trình duyệt nhận cả năm 6 chữ số, gửi lên
  // là backend trả 422 mà tổ chỉ thấy "không ghi được".
  // Mẻ ghi SAU khi làm xong — máy chủ cũng từ chối giờ kết thúc ở tương lai.
  const ketThucTuongLai = gioNhapHopLe(ketThuc) && ketThuc > nowDtLocal();
  // Máy chủ cũng chặn (`dau_vao.kiem_tran_ghi`); form báo trước để tổ khỏi gõ rồi mới bị trả về.
  const vuotTran = tranGhi != null && nSoLuong > tranGhi.con_ghi_duoc + 0.0005;
  const hopLe = gioNhapHopLe(batDau) && gioNhapHopLe(ketThuc) && ketThuc > batDau && !ketThucTuongLai
    && soLuongDaGo && nSoLuong >= 0 && !vuotTran
    && psHopLe;

  const durationStr = formatDurationLocal(batDau, ketThuc);

  async function luu() {
    if (!hopLe || busy) return;
    const body: SxBatchIn = {
      bat_dau: batDau, ket_thuc: ketThuc, tong: nSoLuong, tot: nSoLuong, hong: 0,
      don_vi: donVi,
      mo_ta_loi: null,
      ghi_chu: ghiChu.trim() || null,
      phat_sinh: psTick.map(([id, s]) => ({ phat_sinh_id: Number(id), so_luong: toNum(s) })),
    };
    const ketQua = await exec.taoBatch(body);
    if (ketQua) onXong(ketQua);
  }

  function insertQuickQty(val: number) {
    setSoLuong((prev) => {
      const current = toNum(prev);
      const next = Math.max(0, current + val);
      if (tranGhi && next > tranGhi.con_ghi_duoc) {
        return tranGhi.con_ghi_duoc.toString();
      }
      return next.toString();
    });
  }

  return (
    <div onKeyDown={(e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && hopLe && !busy) {
        e.preventDefault();
        luu();
      }
    }}>
      <ThsxModal
        title="Ghi mẻ sản lượng mới" icon="activity" busy={busy} onClose={() => onXong([])}
        footer={<>
          <Button variant="ghost" onClick={() => onXong([])} disabled={busy}>Huỷ</Button>
          <Button variant="accent" onClick={luu} disabled={busy || !hopLe} className="thsx-glass-btn-save">
            <Icon name="check" size={13} /> Ghi mẻ sản lượng <span className="thsx-kbd-hint">(Ctrl + Enter)</span>
          </Button>
        </>}
      >
        {/* Khoán là cấu hình cố định của công đoạn — không còn radio/tìm/đổi nguồn lúc ghi mẻ. */}
        <div className="thsx-vk">
          <div className="thsx-vk__h">
            <span className="thsx-x-fld__l">Khoán công đoạn</span>
          </div>
          {khoan ? (
            <div className="thsx-vk__fixed">
              <div className="thsx-vk__opt is-on">
                <span className="thsx-vk__main">
                  <span className="thsx-vk__ten">{khoan.ten}</span>
                  {khoan.phat_sinh.length > 0 && (
                    <span className="thsx-vk__psn">{khoan.phat_sinh.length} việc phát sinh</span>
                  )}
                </span>
                <span className="thsx-vk__gia thsx-num">{giaKhoan(khoan)}</span>
              </div>
              {khoan.phat_sinh.length > 0 && (
                <div className="thsx-vk__psbox">
                  <span className="thsx-vk__psh">Việc phát sinh — không cộng vào sản lượng</span>
                  <ul className="thsx-vk__list" aria-label={`Việc phát sinh của ${khoan.ten}`}>
                    {khoan.phat_sinh.map((p) => {
                      const tick = p.id in psSl;
                      const sai = tick && psSl[p.id] !== "" && toNum(psSl[p.id]) <= 0;
                      return (
                        <li key={p.id} className={`thsx-vk__ps${tick ? " is-on" : ""}`}>
                          <label className="thsx-vk__opt thsx-vk__opt--ps">
                            <input type="checkbox" checked={tick} onChange={() => tickPs(p)} />
                            <span className="thsx-vk__main"><span className="thsx-vk__ten">{p.ten}</span></span>
                            <span className="thsx-vk__gia thsx-num">{giaKhoan(p)}</span>
                          </label>
                          {tick && (
                            <div className="thsx-vk__sl">
                              <input type="number" min={0} step="any" inputMode="decimal" autoFocus
                                className="thsx-x-in thsx-glass-in thsx-glass-in--num" placeholder="Số lượng"
                                aria-label={`Số lượng ${p.ten}`} value={psSl[p.id]}
                                onChange={(e) => setPsSl((cu) => ({ ...cu, [p.id]: e.target.value }))} />
                              <span className="thsx-vk__dv">{p.don_vi_ten ?? nhanDonVi(p.don_vi)}</span>
                              {sai && <span className="thsx-x-err thsx-glass-err">Phải lớn hơn 0</span>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="thsx-khoan-empty-badge">
              <Icon name="info" size={13} className="thsx-khoan-empty-ic" />
              <p className="thsx-x-hint">Công đoạn chưa cấu hình Khoán — vẫn có thể ghi mẻ sản lượng.</p>
            </div>
          )}
        </div>

        {/* Card Giới hạn sản lượng (tranGhi) */}
        {tranGhi && (
          <div className="thsx-capacity-card">
            <div className="thsx-capacity-card__h">
              <span className="thsx-capacity-card__title">
                <Icon name="barChart" size={13} /> Sản lượng khả dụng
              </span>
              <span className="thsx-capacity-card__stat thsx-num">
                Đã ghi: <b>{num(tranGhi.da_ghi)}</b> / {num(tranGhi.toi_da)}
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="thsx-capacity-progress-track">
              <div
                className={`thsx-capacity-progress-fill ${
                  tranGhi.con_ghi_duoc <= 0.0005 ? "is-full" : ""
                }`}
                style={{
                  width: `${Math.min(100, Math.max(0, (tranGhi.da_ghi / (tranGhi.toi_da || 1)) * 100))}%`,
                }}
              />
            </div>

            <div className="thsx-capacity-card__ftr">
              <span className="thsx-capacity-card__hint">
                {tranGhi.con_ghi_duoc > 0.0005 ? (
                  <>Còn ghi được tối đa <b>{num(tranGhi.con_ghi_duoc)}</b> — {cauTranGhi(tranGhi)}.</>
                ) : (
                  <>Hết số {tranGhi.cung_to ? "bước trước làm ra" : "đã nhận"} ({cauTranGhi(tranGhi)}) — chỉ ghi được mẻ 0 cho tới khi công đoạn trước {tranGhi.cung_to ? "làm" : "giao"} thêm.</>
                )}
              </span>
              {tranGhi.con_ghi_duoc > 0.0005 && (
                <button
                  type="button"
                  className="thsx-quick-max-btn"
                  onClick={() => setSoLuong(tranGhi.con_ghi_duoc.toString())}
                  title="Điền nhanh tối đa số lượng khả dụng"
                >
                  <Icon name="zap" size={12} /> Tối đa ({num(tranGhi.con_ghi_duoc)})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Khối Thời gian */}
        <div className="thsx-time-section">
          <div className="thsx-glass-time-grid thsx-x-grid2">
            <Field label="Bắt đầu">
              <ChonNgayGio className="thsx-x-in thsx-glass-in" min={GIO_NHAP_MIN} max={GIO_NHAP_MAX} aria-label="Bắt đầu"
                value={batDau} onChange={(v) => setBatDau(v)} />
            </Field>
            <Field label="Kết thúc">
              <ChonNgayGio className="thsx-x-in thsx-glass-in" min={GIO_NHAP_MIN} max={GIO_NHAP_MAX} aria-label="Kết thúc"
                value={ketThuc} onChange={(v) => setKetThuc(v)} />
            </Field>
          </div>

          {/* Quick preset time buttons & duration badge */}
          <div className="thsx-time-presets">
            <div className="thsx-time-presets__btns">
              {batDauMacDinh && batDau !== batDauMacDinh && (
                <button type="button" className="thsx-chip-btn" onClick={() => setBatDau(batDauMacDinh)}>
                  ⏮ Nối mẻ trước
                </button>
              )}
              <button type="button" className="thsx-chip-btn" onClick={() => setKetThuc(nowDtLocal())}>
                📍 Bây giờ
              </button>
              <button type="button" className="thsx-chip-btn" onClick={() => setKetThuc((cu) => shiftMinutesLocal(cu || nowDtLocal(), -15))}>
                -15p
              </button>
              <button type="button" className="thsx-chip-btn" onClick={() => setKetThuc((cu) => shiftMinutesLocal(cu || nowDtLocal(), -30))}>
                -30p
              </button>
            </div>
            {durationStr && (
              <span className="thsx-duration-badge" title="Tổng thời gian mẻ sản xuất">
                <Icon name="clock" size={12} /> {durationStr}
              </span>
            )}
          </div>
        </div>

        {ketThucTuongLai && (
          <span className="thsx-x-err thsx-glass-err">Giờ kết thúc đang ở sau lúc này — chỉ ghi mẻ đã làm xong.</span>
        )}

        {/* Ô Nhập Số Lượng & Quick Step Chips */}
        <div className="thsx-qty-field-group">
          <Field label="Số lượng làm được">
            <div className="thsx-qty-input-wrapper">
              <input type="number" min={0} className="thsx-x-in thsx-glass-in thsx-glass-in--num thsx-qty-input"
                aria-label="Số lượng làm được"
                placeholder="0" value={soLuong} onChange={(e) => setSoLuong(e.target.value)}
                inputMode="numeric" />
              <span className="thsx-input-unit-badge">{donViHienThi}</span>
            </div>
          </Field>

          {/* Quick Step Buttons */}
          <div className="thsx-quick-qty-chips">
            <span className="thsx-quick-qty-label">Cộng nhanh:</span>
            <button type="button" className="thsx-chip-btn" onClick={() => insertQuickQty(10)}>+10</button>
            <button type="button" className="thsx-chip-btn" onClick={() => insertQuickQty(50)}>+50</button>
            <button type="button" className="thsx-chip-btn" onClick={() => insertQuickQty(100)}>+100</button>
            <button type="button" className="thsx-chip-btn" onClick={() => insertQuickQty(1000)}>+1.000</button>
            {tranGhi && tranGhi.con_ghi_duoc > 0.0005 && (
              <button type="button" className="thsx-chip-btn thsx-chip-btn--accent" onClick={() => setSoLuong(tranGhi.con_ghi_duoc.toString())}>
                Max ({num(tranGhi.con_ghi_duoc)})
              </button>
            )}
            <button type="button" className="thsx-chip-btn thsx-chip-btn--danger" onClick={() => setSoLuong("0")}>Xoá (0)</button>
          </div>
        </div>

        {vuotTran && tranGhi && tranGhi.con_ghi_duoc > 0.0005 && (
          <span className="thsx-x-err thsx-glass-err">
            Vượt {tranGhi.cung_to ? "sản lượng" : "số nhận từ"} công đoạn trước — mẻ này ghi tối đa {num(tranGhi.con_ghi_duoc)}.
          </span>
        )}

        <Field label="Ghi chú">
          <input type="text" className="thsx-x-in thsx-glass-in" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)}
            placeholder="Tuỳ chọn" />
        </Field>
      </ThsxModal>
    </div>
  );
}

function formatBatchTime(batDau: string | null | undefined, ketThuc: string | null | undefined): string {
  if (!batDau) return "—";
  const d1 = new Date(batDau);
  if (Number.isNaN(d1.getTime())) return "—";
  const m1 = String(d1.getMonth() + 1).padStart(2, "0");
  const dt1 = String(d1.getDate()).padStart(2, "0");
  const hh1 = String(d1.getHours()).padStart(2, "0");
  const mm1 = String(d1.getMinutes()).padStart(2, "0");
  const str1 = `${dt1}/${m1} ${hh1}:${mm1}`;

  if (!ketThuc) return `${str1} → Đang chạy`;
  const d2 = new Date(ketThuc);
  if (Number.isNaN(d2.getTime())) return `${str1} → —`;

  const hh2 = String(d2.getHours()).padStart(2, "0");
  const mm2 = String(d2.getMinutes()).padStart(2, "0");

  if (d1.toDateString() === d2.toDateString()) {
    return `${str1} → ${hh2}:${mm2}`;
  }

  const m2 = String(d2.getMonth() + 1).padStart(2, "0");
  const dt2 = String(d2.getDate()).padStart(2, "0");
  return `${str1} → ${dt2}/${m2} ${hh2}:${mm2}`;
}

/** Giờ MỘT lần dừng máy của mẻ. Mốc khác ngày với mẻ (dừng qua nửa đêm) thì kèm ngày — chỉ ghi
 *  "00:21" là người đọc hiểu thành cùng ngày với mẻ. Chưa chạy lại (`ket_thuc` trống) thì nói thẳng. */
function khungDungMay(s: SxBatch["su_co"][number], meBatDau: string): string {
  if (!s.bat_dau) return "—";
  const ngayMe = new Date(meBatDau).toDateString();
  const moc = (v: string) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime()) || d.toDateString() === ngayMe) return gioNgan(v);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${gioNgan(v)}`;
  };
  return s.ket_thuc ? `${moc(s.bat_dau)}–${moc(s.ket_thuc)}` : `từ ${moc(s.bat_dau)}, chưa chạy lại`;
}

/** MỘT MẺ trong danh sách sản lượng. Gấp lại chỉ hiện giờ + việc khoán + số lượng; mở ra là ĐỌC
 *  TRỌN mẻ: việc khoán (ảnh chụp đơn giá · ĐVT), việc phát sinh, máy, ca, người tham gia, các lần
 *  dừng máy. KHÔNG chia sản lượng cho ai (gỡ 18/09/2026). Danh mục đổi sau lúc ghi ⇒ băng so sánh
 *  cũ → mới + nút lấy số mới; không bấm = giữ số cũ. */
export function BatchRow({
  b, canAssign, busy, exec,
}: {
  b: SxBatch; canAssign: boolean; busy: boolean; exec: ThsxExec;
}) {
  const [mo, setMo] = useState(false);
  // "Giữ số cũ" (§7.2b) KHÔNG gọi server — mẻ vốn giữ số lúc ghi cho tới khi có người bấm Cập nhật.
  // Nút chỉ gấp băng lại cho gọn trong lượt xem này; pill "danh mục đổi" ở đầu dòng vẫn treo, mở lại
  // màn thì băng hiện lại — hệ không bao giờ tự quên là số đang cũ.
  const [giuCu, setGiuCu] = useState(false);
  return (
    <li className="thsx-x-item">
      <button type="button" className="thsx-x-item__h" onClick={() => setMo((o) => !o)} aria-expanded={mo}>
        <Icon name="chevron" size={12} className={mo ? "" : "thsx-rot-90"} />
        <span className="thsx-x-item__time thsx-num">{formatBatchTime(b.bat_dau, b.ket_thuc)}</span>
        <span className={`thsx-x-item__viec${b.viec_khoan_ten ? "" : " is-trong"}`}>
          {b.viec_khoan_ten ?? "chưa khai việc khoán"}
        </span>
        {b.so_nguoi > 0 && <span className="thsx-x-item__kip thsx-num">{b.so_nguoi} người</span>}
        {b.danh_muc_doi.length > 0 && (
          <span className="thsx-x-item__doi" title="Danh mục đã đổi so với lúc ghi mẻ">
            <Icon name="alert" size={11} /> danh mục đổi
          </span>
        )}
        <span className="thsx-x-item__spacer" />
        <span className="thsx-batch-pill thsx-batch-pill--tot">
          {num(b.tot)}{b.don_vi ? ` ${nhanChang(b.don_vi)}` : ""}
        </span>
      </button>
      {mo && (
        <div className="thsx-x-item__body">
          {b.danh_muc_doi.length > 0 && giuCu && (
            <p className="thsx-vk-doi thsx-vk-doi--gon" role="status">
              <Icon name="alert" size={13} /> Mẻ đang giữ số lúc ghi — danh mục đã đổi.{" "}
              <button type="button" className="thsx-vk-doi__mo" onClick={() => setGiuCu(false)}>Xem thay đổi</button>
            </p>
          )}
          {b.danh_muc_doi.length > 0 && !giuCu && (
            <div className="thsx-vk-doi" role="status">
              <div className="thsx-vk-doi__h">
                <Icon name="alert" size={13} /> Danh mục đã đổi so với lúc ghi mẻ
              </div>
              <table className="thsx-vk-doi__tbl">
                <thead><tr><th>Mục</th><th>Lúc ghi</th><th>Danh mục nay</th></tr></thead>
                <tbody>
                  {/* `truong` KHÔNG duy nhất: việc khoán và từng việc phát sinh cùng có "don_gia". */}
                  {b.danh_muc_doi.map((d, i) => (
                    <tr key={`${i}:${d.nhan}`}>
                      <td>{d.nhan}</td>
                      <td className="thsx-vk-doi__cu">{d.cu ?? "—"}</td>
                      <td className="thsx-vk-doi__moi">{d.mat ? "đã gỡ khỏi danh mục" : (d.moi ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="thsx-x-hint">Không bấm Cập nhật thì mẻ giữ nguyên số lúc ghi.</p>
              <div className="thsx-x-act">
                {canAssign && (
                  <Button variant="secondary" disabled={busy || b.danh_muc_doi.every((d) => d.mat)}
                    title={b.danh_muc_doi.every((d) => d.mat) ? "Việc đã gỡ khỏi danh mục — không có số mới để lấy" : undefined}
                    onClick={() => void exec.capNhatDanhMucMe(b.id)}>
                    <Icon name="refresh" size={13} /> Cập nhật theo danh mục
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setGiuCu(true)}>Giữ số cũ</Button>
              </div>
            </div>
          )}
          <div className="thsx-batch-spec-grid">
            <div className="thsx-batch-spec-cell thsx-batch-spec-cell--full">
              <span className="thsx-batch-spec-label">Công việc khoán</span>
              <span className="thsx-batch-spec-val">
                {b.viec_khoan_ten ? (
                  <><b>{b.viec_khoan_ten}</b>{b.viec_khoan_don_gia != null && b.viec_khoan_don_vi
                    ? <span className="thsx-num"> · {num(b.viec_khoan_don_gia)} đ / {b.viec_khoan_don_vi_ten ?? nhanDonVi(b.viec_khoan_don_vi)}</span>
                    : null}</>
                ) : "chưa khai việc khoán"}
              </span>
            </div>
            {b.phat_sinh.length > 0 && (
              <div className="thsx-batch-spec-cell thsx-batch-spec-cell--full">
                <span className="thsx-batch-spec-label">Việc phát sinh (không cộng sản lượng)</span>
                <span className="thsx-batch-spec-val">
                  {b.phat_sinh.map((p) => (
                    <span key={p.id} className="thsx-vk-ps-dong">
                      <b>{p.ten ?? "—"}</b> · <span className="thsx-num">{num(p.so_luong)}</span>
                      {p.don_vi ? ` ${p.don_vi_ten ?? nhanDonVi(p.don_vi)}` : ""}
                      {p.don_gia != null && p.don_vi
                        ? <span className="thsx-vk-ps-dong__gia thsx-num"> ({num(p.don_gia)} đ / {p.don_vi_ten ?? nhanDonVi(p.don_vi)})</span>
                        : null}
                    </span>
                  ))}
                </span>
              </div>
            )}
            <div className="thsx-batch-spec-cell">
              <span className="thsx-batch-spec-label">Số lượng làm được</span>
              <span className="thsx-batch-spec-val thsx-num">
                <b>{num(b.tot)}</b>{b.don_vi ? ` ${nhanDonVi(b.don_vi)}` : ""}
              </span>
            </div>
            {b.may_ten && (
              <div className="thsx-batch-spec-cell">
                <span className="thsx-batch-spec-label">Máy</span>
                <span className="thsx-batch-spec-val"><b>{b.may_ten}</b></span>
              </div>
            )}
            {b.ca_ten && (
              <div className="thsx-batch-spec-cell">
                <span className="thsx-batch-spec-label">Ca</span>
                <span className="thsx-batch-spec-val"><b>{b.ca_ten}</b></span>
              </div>
            )}
            {b.nguoi_tham_gia.length > 0 && (
              <div className="thsx-batch-spec-cell">
                <span className="thsx-batch-spec-label">Người tham gia</span>
                <span className="thsx-batch-spec-val">
                  {b.nguoi_tham_gia.map((p) => (p.to_ten ? `${p.ho_ten} (${p.to_ten})` : p.ho_ten)).join(", ")}
                </span>
              </div>
            )}
            {b.su_co.length > 0 && (
              <div className="thsx-batch-spec-cell thsx-batch-spec-cell--full thsx-batch-spec-cell--bad">
                <span className="thsx-batch-spec-label">Dừng máy</span>
                <span className="thsx-batch-spec-val">{b.su_co.map((s) => `${khungDungMay(s, b.bat_dau)}: ${s.ly_do ?? ""}`).join(" • ")}</span>
              </div>
            )}
            {b.lot_vao.length > 0 && (
              <div className="thsx-batch-spec-cell thsx-batch-spec-cell--full">
                <span className="thsx-batch-spec-label">Lô vào</span>
                <span className="thsx-batch-spec-val">{b.lot_vao.map((l) => `${num(l.so_luong)}${l.don_vi ? ` ${nhanDonVi(l.don_vi)}` : ""}`).join(" • ")}</span>
              </div>
            )}
            {b.ghi_chu && (
              <div className="thsx-batch-spec-cell thsx-batch-spec-cell--full">
                <span className="thsx-batch-spec-label">Ghi chú</span>
                <span className="thsx-batch-spec-val">{b.ghi_chu}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// ─────────────────────────── BÀN GIAO (§11.2) ─────────────────────────────
function BanGiaoSection({
  chiTiet, canAssign, busy, conLai, exec,
}: {
  chiTiet: SxWorkItemChiTiet; canAssign: boolean; busy: boolean; conLai: number;
  exec: ThsxExec;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const di = chiTiet.ban_giao_di;
  // Bước cuối lệnh không có chặng sau ⇒ không bàn giao; thành phẩm vào kho qua KCS.
  const buocCuoi = chiTiet.ban_giao_chang_sau.length === 0;

  return (
    <section className="thsx-psec thsx-x thsx-psec-card">
      <div className="thsx-psec__h">
        <span className="thsx-psec__title">
          <span className="thsx-psec__icon-badge thsx-psec__icon-badge--cyan"><Icon name="truck" size={13} /></span> Bàn giao
        </span>
        {canAssign && !buocCuoi && (
          <Button variant="secondary" onClick={() => setFormOpen(true)} disabled={busy} aria-haspopup="dialog">
            <Icon name="send" size={13} /> Đề xuất giao
          </Button>
        )}
      </div>

      {buocCuoi && (
        <div className="thsx-empty-state-card thsx-empty-state-card--info">
          <div className="thsx-empty-state-ic-wrap"><Icon name="info" size={16} /></div>
          <span className="thsx-empty-state-title">Bước cuối của lệnh — không bàn giao; thành phẩm vào kho qua KCS kiểm và đề nghị nhập kho.</span>
        </div>
      )}
      {formOpen && !buocCuoi && (
        <BanGiaoForm chiTiet={chiTiet} conLai={conLai}
          busy={busy} onXong={() => setFormOpen(false)} exec={exec} />
      )}

      {di.length > 0 && (
        <ul className="thsx-x-list">
            {di.map((g) => (
              <BanGiaoRow key={g.id} g={g} phia="di" canAssign={canAssign} busy={busy} exec={exec}
                batches={chiTiet.san_luong.batches} conLai={conLai} />
            ))}
          </ul>
      )}
      {di.length === 0 && !buocCuoi && (
        <div className="thsx-empty-state-card">
          <div className="thsx-empty-state-ic-wrap"><Icon name="truck" size={16} /></div>
          <div className="thsx-empty-state-content">
            <span className="thsx-empty-state-title">Chưa giao đi lần nào.</span>
            <span className="thsx-empty-state-sub">Hàng công đoạn trước giao đến nằm ở tab Nhận.</span>
          </div>
        </div>
      )}
    </section>
  );
}

/** Tab "Nhận" của ngăn chi tiết (§11.5): bàn giao ĐẾN công đoạn này. Bên nhận Xác nhận / Điều chỉnh
 *  ngay tại đây — trước kia khối "Nhận về" nằm dưới Sản lượng và Giao đi của tab Bàn giao & Vật tư,
 *  phải cuộn mới thấy nút. Lần chờ nhận đứng đầu danh sách. */
export function ThsxNhanVe({
  chiTiet, busy, exec,
}: {
  chiTiet: SxWorkItemChiTiet; busy: boolean; exec: ThsxExec;
}) {
  const canXacNhan = !!chiTiet.quyen?.confirm_output;
  const den = chiTiet.ban_giao_den ?? [];
  const cho = den.filter(choBenNhan);
  const xong = den.filter((g) => !choBenNhan(g));
  // Bước trước cùng tổ + cùng lệnh thì hàng không qua bàn giao — danh sách trống là ĐÚNG, phải nói
  // ra, kẻo tổ đi tìm một lần giao không bao giờ có.
  const cungTo = (chiTiet.cong_doan_truoc ?? []).filter((c) => c.cung_to).map((c) => c.ten_cong_doan);

  // CHỈ các lần nhận (27/09/2026): tổ cần biết nhận mấy lần, mỗi lần bao nhiêu, từ công đoạn nào.
  // Khối "Công đoạn trước" (thực tế · giao sang · đã nhận) bỏ: ba ô tổng đó lặp lại chính các dòng
  // bên dưới. Câu "chưa nhận hàng thì chưa bắt đầu được" đã nằm ở chân ngăn.
  return (
    <section className="thsx-psec thsx-x">
      <div className="thsx-psec__h">
        <span className="thsx-psec__title"><Icon name="packageCheck" size={13} /> Các lần nhận</span>
        {den.length > 0 && <span className="thsx-psec__meta thsx-num">{den.length} lần</span>}
      </div>
      {den.length === 0 ? (
        <p className="thsx-note">
          {cungTo.length > 0
            ? `${cungTo.join(", ")} cùng tổ — hàng không qua bàn giao, bước đó làm ra bao nhiêu thì ghi mẻ được bấy nhiêu.`
            : "Chưa nhận lần nào từ công đoạn trước."}
        </p>
      ) : (
        <ul className="thsx-x-list">
          {[...cho, ...xong].map((g) => (
            <BanGiaoRow key={g.id} g={g} phia="den" canAssign={canXacNhan} busy={busy} exec={exec} />
          ))}
        </ul>
      )}
      {cho.length > 0 && !canXacNhan && (
        <p className="thsx-note">Xác nhận nhận hàng cần quyền Xác nhận sản lượng của tổ.</p>
      )}
    </section>
  );
}

/** Nhãn một chặng sau: tên bước (đã kèm "lần k/N" nếu tách) · nơi làm. Bước thuê ngoài nói rõ
 *  nhà gia công — "giao ra ngoài" chung chung thì tổ không biết hàng đi đâu. */
function nhanChangSau(c: SxBanGiaoChangSau): string {
  const noi = c.loai_buoc === "thue_ngoai"
    ? `Gia công ngoài${c.nha_cung_cap ? ` · ${c.nha_cung_cap}` : ""}`
    : c.to_ten;
  return `${c.ten_cong_doan}${noi ? ` · ${noi}` : ""}`;
}

/** Số giao theo mẻ: tổng TỐT của mẻ đã tick, không vượt phần còn chưa giao (bàn giao tạo trước khi
 *  có giao-theo-mẻ không gắn mẻ nào, nên mẻ cũ vẫn hiện "chưa giao" dù số đã đi rồi). Không còn mẻ
 *  nào để chọn ⇒ giao nốt phần lẻ. Máy chủ tính lại đúng công thức này — ô số không còn trên form. */
function soTheoMe(me: SxBatch[], chon: Set<number>, conLai: number): number {
  if (me.length === 0) return conLai;
  return Math.min(me.filter((b) => chon.has(b.id)).reduce((t, b) => t + b.tot, 0), conLai);
}

/** Danh sách mẻ tick chọn — dùng chung cho đề xuất mới và sửa mẻ của đề xuất còn chờ xác nhận. */
function MeChon({
  me, chon, onDoi, tong, dv,
}: {
  me: SxBatch[]; chon: Set<number>; onDoi: (next: Set<number>) => void; tong: number; dv: string;
}) {
  function bat(id: number) {
    const next = new Set(chon);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onDoi(next);
  }
  return (
    <div className="thsx-x-fld">
      <span className="thsx-x-fld__l">
        Mẻ giao ({chon.size}/{me.length}) · <b className="thsx-num">{num(tong)}</b>{dv}
      </span>
      <div className="thsx-x-chon">
        {me.map((b) => (
          <label key={b.id} className={`thsx-x-chon__o${chon.has(b.id) ? " is-on" : ""}`}>
            <input type="checkbox" checked={chon.has(b.id)} onChange={() => bat(b.id)} />
            <span className="thsx-x-chon__ten thsx-num">{formatBatchTime(b.bat_dau, b.ket_thuc)}</span>
            <span className="thsx-x-chon__phu thsx-num"><b>{num(b.tot)}</b>{dv}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Đề xuất bàn giao (§11.2, sửa 14/09/2026).
 *
 *  ĐÍCH không phải thứ để chọn: lệnh đã khai routing, backend trả đúng chặng sau. Chỉ khi bước sau
 *  tách lần chạy hoặc routing rẽ nhánh (nhiều chặng sau) tổ mới chọn một trong số đó. Bước cuối
 *  lệnh không mở form này (không bàn giao — thành phẩm vào kho qua KCS).
 *
 *  GIAO THEO MẺ: liệt kê các mẻ chưa giao, tick sẵn hết; số lượng = tổng tốt của mẻ đã tick, KHÔNG
 *  gõ tay. Đếm thực tế lệch thì bên nhận xác nhận rồi điều chỉnh (§11.3). */
function BanGiaoForm({
  chiTiet, conLai, busy, onXong, exec,
}: {
  chiTiet: SxWorkItemChiTiet; conLai: number;
  busy: boolean; onXong: () => void; exec: ThsxExec;
}) {
  const donVi = chiTiet.cong_viec.don_vi_ra ?? null;
  const dv = donVi ? ` ${nhanDonVi(donVi)}` : "";
  const changSau = chiTiet.ban_giao_chang_sau;
  const meChuaGiao = chiTiet.san_luong.batches.filter((b) => !b.da_ban_giao && b.tot > 0);
  const macDinh = changSau.find((c) => c.trang_thai !== "completed") ?? changSau[0];

  const [dich, setDich] = useState<number | null>(macDinh?.cong_viec_id ?? null);
  const [chon, setChon] = useState<Set<number>>(() => new Set(meChuaGiao.map((b) => b.id)));
  const tong = soTheoMe(meChuaGiao, chon, conLai);
  const hopLe = tong > 0
    && (meChuaGiao.length === 0 || chon.size > 0)
    && dich != null;

  async function luu() {
    if (dich == null) return;
    const body: SxBanGiaoDeXuatIn = {
      dich_cong_viec_id: dich,
      don_vi: donVi,
      batch_ids: meChuaGiao.filter((b) => chon.has(b.id)).map((b) => b.id),
    };
    if (await exec.deXuatBanGiao(body)) onXong();
  }

  return (
    <ThsxModal
      title="Đề xuất bàn giao" icon="truck" busy={busy} onClose={onXong}
      badge={donVi ? nhanDonVi(donVi) : null}
      footer={<>
        <Button variant="ghost" onClick={onXong} disabled={busy}>Huỷ</Button>
        <Button variant="accent" onClick={luu} disabled={busy || !hopLe}>
          <Icon name="send" size={13} /> Đề xuất
        </Button>
      </>}
    >
      <div className="thsx-x-fld">
        <span className="thsx-x-fld__l">Giao cho chặng sau</span>
        {changSau.length === 1 ? (
          <div className="thsx-x-dich">
            <Icon name="arrowRight" size={14} />
            <span className="thsx-x-dich__ten">{nhanChangSau(changSau[0])}</span>
            {changSau[0].du_kien_bat_dau && (
              <span className="thsx-x-dich__gio thsx-num">{ngayGio(changSau[0].du_kien_bat_dau)}</span>
            )}
          </div>
        ) : (
          <div className="thsx-x-chon" role="radiogroup" aria-label="Chặng sau">
            {changSau.map((c) => (
              <label key={c.cong_viec_id} className={`thsx-x-chon__o${dich === c.cong_viec_id ? " is-on" : ""}`}>
                <input type="radio" name="bg-dich" checked={dich === c.cong_viec_id}
                  onChange={() => setDich(c.cong_viec_id)} />
                <span className="thsx-x-chon__ten">{nhanChangSau(c)}</span>
                {c.trang_thai === "completed"
                  ? <span className="thsx-x-chon__phu">đã xong</span>
                  : c.du_kien_bat_dau && <span className="thsx-x-chon__phu thsx-num">{ngayGio(c.du_kien_bat_dau)}</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      {meChuaGiao.length > 0 ? (
        <MeChon me={meChuaGiao} chon={chon} onDoi={setChon} tong={tong} dv={dv} />
      ) : conLai > 0 ? (
        <p className="thsx-x-hint">Mọi mẻ đã giao — giao nốt phần lẻ <b className="thsx-num">{num(conLai)}</b>{dv}.</p>
      ) : (
        <p className="thsx-x-hint">Không còn sản lượng tốt để giao.</p>
      )}
    </ThsxModal>
  );
}

function BanGiaoRow({
  g, phia, canAssign, busy, exec, batches = [], conLai = 0,
}: {
  g: SxBanGiao; phia: "di" | "den"; canAssign: boolean; busy: boolean;
  exec: ThsxExec;
  /** Chỉ dòng "Giao đi": mẻ của công đoạn nguồn + phần còn chưa giao — để sửa mẻ. */
  batches?: SxBatch[]; conLai?: number;
}) {
  const [suaOpen, setSuaOpen] = useState(false);
  const [dcOpen, setDcOpen] = useState(false);
  const [lsOpen, setLsOpen] = useState(false);
  const st = choXacNhanLai(g)
    ? { txt: "chờ xác nhận lại", cls: "thsx-x-pill--wait" }
    : BG_TT[g.trang_thai] ?? { txt: g.trang_thai, cls: "thsx-x-pill--wait" };
  const dv = g.don_vi ? ` ${nhanDonVi(g.don_vi)}` : "";
  // Số đầu thẻ đọc nhãn CHẶNG ("tờ in") cho khớp khối Sản lượng ngay trên — `nhanDonVi` ra "tờ".
  const dvChang = g.don_vi ? ` ${nhanChang(g.don_vi)}` : "";
  const daXacNhan = g.trang_thai === "confirmed" || g.trang_thai === "adjusted";
  // Mẻ sửa được = mẻ chưa đi theo lần giao nào + mẻ của chính lần giao này.
  const meSua = batches.filter((b) => b.tot > 0 && (!b.da_ban_giao || g.batch_ids.includes(b.id)));
  // Nguồn (đi) sửa mẻ khi còn 'proposed'; đích (đến) CHỈ xác nhận khi 'proposed'. Điều chỉnh số đã
  // xác nhận là việc của BÊN GIAO (27/09/2026) — bên nhận đếm lệch thì báo bên giao sửa, rồi xác
  // nhận lại số mới.
  const canSua = canAssign && phia === "di" && g.trang_thai === "proposed" && meSua.length > 0;
  const canXac = canAssign && phia === "den" && choBenNhan(g);
  const canDc = canAssign && phia === "di" && daXacNhan;
  const stModClass = g.trang_thai === "confirmed" ? "thsx-handover-card--st-ok"
    : g.trang_thai === "adjusted" ? "thsx-handover-card--st-adj"
    : "thsx-handover-card--st-wait";
  const hasHistory = g.dieu_chinh.length > 0;

  return (
    <li className={`thsx-x-bg thsx-handover-card-v2 ${stModClass}`}>
      {/* Đầu thẻ: bao nhiêu + trạng thái + thao tác tác nghiệp. */}
      <div className="thsx-handover-card__head">
        <div className="thsx-handover-card__qty-val">
          {num(g.so_luong)}<small>{dvChang}</small>
          {g.batch_ids.length > 0 && <span className="thsx-handover-card__me">· {g.batch_ids.length} mẻ</span>}
          {g.cung_to && <span className="thsx-x-tag-ht">cùng tổ</span>}
        </div>
        <div className="thsx-handover-card__side">
          <span className={`thsx-x-pill ${st.cls}`}>{st.txt}</span>
          {canXac && (
            <Button variant="accent" onClick={() => void exec.xacNhanBanGiao(g.id, g.version)} disabled={busy}>
              <Icon name="check" size={13} /> Xác nhận
            </Button>
          )}
          {canSua && (
            <Button variant="ghost" onClick={() => { setSuaOpen((o) => !o); setDcOpen(false); }} disabled={busy}>
              <Icon name="pencil" size={12} /> Sửa mẻ
            </Button>
          )}
          {canDc && (
            <Button variant="ghost" onClick={() => { setDcOpen((o) => !o); setSuaOpen(false); }} disabled={busy}>
              <Icon name="edit" size={12} /> Điều chỉnh
            </Button>
          )}
        </div>
      </div>

      {/* Tuyến giao → nhận: mỗi bên công đoạn · tổ · ai · lúc nào. */}
      <div className="thsx-handover-card__route">
        <BenBanGiao
          nhan="Giao"
          isSender
          cd={g.nguon_cong_doan ?? (phia === "den" ? g.doi_tac_ten : null)}
          to={g.nguon_to}
          ai={<><b>{g.nguoi_de_xuat ?? "—"}</b>{g.de_xuat_luc && <span className="thsx-num"> · {ngayGio(g.de_xuat_luc)}</span>}</>}
        />
        <div className="thsx-handover-card__route-arrow-wrap" title="Hướng chuyển giao">
          <Icon name="arrowRight" size={14} className="thsx-handover-card__route-arrow" />
        </div>
        <BenBanGiao
          nhan="Nhận"
          cd={g.dich_cong_doan ?? (phia === "di" ? (g.doi_tac_ten || "Kho") : null)}
          to={g.dich_to}
          cho={g.xac_nhan_luc == null}
          ai={g.xac_nhan_luc == null ? "Chưa xác nhận"
            : g.cung_to ? "Tự nhận (cùng tổ)"
              : <><b>{g.nguoi_xac_nhan ?? "—"}</b><span className="thsx-num"> · {ngayGio(g.xac_nhan_luc)}</span></>}
        />
      </div>

      {hasHistory && (
        <div className="thsx-handover-card__foot">
          <div className="thsx-handover-card__foot-left" />
          <button type="button" className="thsx-adj-history-btn" aria-expanded={lsOpen} onClick={() => setLsOpen((o) => !o)}>
            <Icon name="history" size={11} /> Đã điều chỉnh {g.dieu_chinh.length} lần
            <Icon name="chevron" size={10} className="thsx-adj-chevron" style={{ transform: lsOpen ? "rotate(180deg)" : "none" }} />
          </button>
        </div>
      )}

      {lsOpen && (
        <ol className="thsx-audit-log-timeline" aria-label="Lịch sử điều chỉnh">
          {g.dieu_chinh.map((d, i) => (
            <li key={i} className="thsx-audit-log-item">
              <div className="thsx-audit-log-header">
                <span className="thsx-audit-log-time thsx-num">{ngayGio(d.luc)}</span>
                <span className="thsx-audit-log-user"><b>{d.nguoi ?? "—"}</b></span>
                <span className="thsx-audit-log-delta thsx-num">
                  {num(d.so_luong_truoc)} ➔ <b>{num(d.so_luong_sau)}</b>{dv}
                </span>
              </div>
              {d.mo_ta && <div className="thsx-audit-log-note">“{d.mo_ta}”</div>}
              {d.khong_nhat_quan && (
                <div className="thsx-audit-log-warn">
                  <Icon name="alert" size={11} /> Thấp hơn số công đoạn sau đã dùng
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {g.khong_nhat_quan && (
        <p className="thsx-note thsx-note--warn"><Icon name="alert" size={12} /> Số nhận không khớp số giao.</p>
      )}
      {suaOpen && (
        <SuaMeForm g={g} me={meSua} conLai={conLai} busy={busy}
          onXong={() => setSuaOpen(false)} exec={exec} />
      )}
      {dcOpen && (
        <DieuChinhForm g={g} busy={busy}
          onHuy={() => setDcOpen(false)} onXong={() => setDcOpen(false)} exec={exec} />
      )}
    </li>
  );
}

/** Sửa MẺ của lần giao còn chờ xác nhận — tick nhầm thì gỡ, sót thì thêm; số tính lại theo mẻ. */
function SuaMeForm({
  g, me, conLai, busy, onXong, exec,
}: {
  g: SxBanGiao; me: SxBatch[]; conLai: number; busy: boolean;
  onXong: () => void; exec: ThsxExec;
}) {
  const [chon, setChon] = useState<Set<number>>(() => new Set(g.batch_ids));
  // Phần còn lại tính cả số của chính lần giao này (nó sắp được thay bằng số mới).
  const tong = soTheoMe(me, chon, conLai + g.so_luong);
  const doi = chon.size !== g.batch_ids.length || g.batch_ids.some((id) => !chon.has(id));
  const dv = g.don_vi ? ` ${nhanDonVi(g.don_vi)}` : "";

  async function luu() {
    const body: SxBanGiaoSuaIn = {
      batch_ids: me.filter((b) => chon.has(b.id)).map((b) => b.id), expected_version: g.version,
    };
    if (await exec.suaBanGiao(g.id, body)) onXong();
  }

  return (
    <div className="thsx-x-form thsx-x-form--sub">
      <MeChon me={me} chon={chon} onDoi={setChon} tong={tong} dv={dv} />
      <div className="thsx-x-act">
        <Button variant="ghost" onClick={onXong} disabled={busy}>Huỷ</Button>
        <Button variant="accent" onClick={luu} disabled={busy || !doi || chon.size === 0 || tong <= 0}>
          <Icon name="check" size={13} /> Lưu
        </Button>
      </div>
    </div>
  );
}

export function DieuChinhForm({
  g, busy, onHuy, onXong, exec,
}: {
  g: SxBanGiao; busy: boolean;
  onHuy: () => void; onXong: () => void; exec: ThsxExec;
}) {
  const [slSau, setSlSau] = useState(String(g.so_luong));
  const [moTa, setMoTa] = useState("");
  const nSl = toNum(slSau);
  const hopLe = nSl > 0;
  const chenhLech = nSl - g.so_luong;

  async function luu() {
    const body: SxBanGiaoDieuChinhIn = {
      so_luong_sau: nSl, mo_ta: moTa.trim() || null, expected_version: g.version,
    };
    if (await exec.dieuChinhBanGiao(g.id, body)) onXong();
  }

  const adjustStepper = (delta: number) => {
    const nextVal = Math.max(0, nSl + delta);
    setSlSau(String(nextVal));
  };

  const handleChipClick = (chipText: string) => {
    if (!moTa) {
      setMoTa(chipText);
    } else if (!moTa.includes(chipText)) {
      setMoTa(`${moTa}, ${chipText}`);
    }
  };

  // Quick reason chips (bỏ: Bù hao bế, Hỏng mảng)
  const reasonChips = ["Đếm lại", "Gõ nhầm", "Giao thiếu", "Bổ sung"];

  const dv = g.don_vi ? nhanDonVi(g.don_vi) : "";
  // POPUP (27/09/2026), cùng khuôn hộp Ghi mẻ — form mở ngay trong dòng bị lẫn vào danh sách giao.
  // PORTAL ra khung drawer (`.thsx-panel--open`) — đúng chỗ hộp Ghi mẻ đứng: ô dòng giao
  // (`.thsx-x-bg`) tạo khung chứa riêng nên lớp phủ `fixed` bị nhốt trong ô đó; ra `body` thì lại
  // lệch sang giữa cả màn, không giống Ghi mẻ (nằm giữa drawer).
  return createPortal(
    <div onKeyDown={(e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && hopLe && !busy) {
        e.preventDefault();
        void luu();
      }
    }}>
      <ThsxModal
        title="Điều chỉnh số giao" icon="edit" busy={busy} onClose={onHuy}
        footer={
          <div className="thsx-modal-ftr-row">
            <span className="thsx-shortcut-badge">
              <kbd>Ctrl</kbd> + <kbd>↵</kbd> để lưu
            </span>
            <div className="thsx-modal-ftr-btns">
              <Button variant="ghost" onClick={onHuy} disabled={busy}>Huỷ</Button>
              <Button variant="accent" onClick={luu} disabled={busy || !hopLe}>
                <Icon name="check" size={13} /> Điều chỉnh
              </Button>
            </div>
          </div>
        }
      >
        <div className="thsx-dieuchinh-card">
          <div className="thsx-dieuchinh-card__header">
            <span className="thsx-dieuchinh-card__lbl">Công đoạn nhận:</span>
            <span className="thsx-dieuchinh-card__badge">
              <Icon name="arrowRight" size={11} /> {g.doi_tac_ten || "Công đoạn sau"}
            </span>
          </div>
          <div className="thsx-dieuchinh-card__grid">
            <div className="thsx-dieuchinh-stat">
              <span className="thsx-dieuchinh-stat__title">Số hiện tại</span>
              <span className="thsx-dieuchinh-stat__num">{num(g.so_luong)} {dv ? <small>{dv}</small> : null}</span>
            </div>
            <div className="thsx-dieuchinh-stat thsx-dieuchinh-stat--new">
              <span className="thsx-dieuchinh-stat__title">Số sau điều chỉnh</span>
              <span className="thsx-dieuchinh-stat__num">
                {slSau.trim() !== "" ? num(nSl) : "0"} {dv ? <small>{dv}</small> : null}
                {slSau.trim() !== "" && Math.abs(chenhLech) > 0.0001 && (
                  <span className={`thsx-delta-tag ${chenhLech > 0 ? "thsx-delta-tag--up" : "thsx-delta-tag--down"}`}>
                    <Icon name={chenhLech > 0 ? "plus" : "minus"} size={10} />
                    {chenhLech > 0 ? `+${num(chenhLech)}` : num(chenhLech)}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        <Field label={`Số lượng sau${dv ? ` (${dv})` : ""}`}>
          <div className="thsx-input-wrapper">
            <input type="number" min={0} className="thsx-x-in thsx-glass-in thsx-glass-in--num" value={slSau}
              onChange={(e) => setSlSau(e.target.value)} inputMode="numeric" />
            {dv && <span className="thsx-input-suffix">{dv}</span>}
          </div>
          <div className="thsx-stepper-group">
            <div className="thsx-stepper-segment">
              <button type="button" className="thsx-stepper-btn" onClick={() => adjustStepper(-100)}>-100</button>
              <button type="button" className="thsx-stepper-btn" onClick={() => adjustStepper(-10)}>-10</button>
              <button type="button" className="thsx-stepper-btn" onClick={() => adjustStepper(10)}>+10</button>
              <button type="button" className="thsx-stepper-btn" onClick={() => adjustStepper(100)}>+100</button>
            </div>
            {nSl !== g.so_luong && (
              <button type="button" className="thsx-stepper-btn thsx-stepper-btn--reset" onClick={() => setSlSau(String(g.so_luong))}>
                <Icon name="refresh" size={11} /> Khôi phục ({num(g.so_luong)})
              </button>
            )}
          </div>
        </Field>

        <Field label="Mô tả lý do điều chỉnh">
          <input type="text" className="thsx-x-in thsx-glass-in" value={moTa} onChange={(e) => setMoTa(e.target.value)}
            placeholder="Điều chỉnh vì sao? (tuỳ chọn)" />
          <div className="thsx-chip-group">
            {reasonChips.map((chip) => (
              <button key={chip} type="button" className={`thsx-chip-item ${moTa.includes(chip) ? "thsx-chip-item--active" : ""}`}
                onClick={() => handleChipClick(chip)}>
                <Icon name="plus" size={10} /> {chip}
              </button>
            ))}
          </div>
        </Field>

        {!g.cung_to && (
          <div className="thsx-notice-box">
            <div className="thsx-notice-box__icon">
              <Icon name="info" size={16} />
            </div>
            <div className="thsx-notice-box__text">
              Số mới sẽ gửi yêu cầu xác nhận lại cho đại diện tổ <b>{g.doi_tac_ten || "bên nhận"}</b>.
            </div>
          </div>
        )}
      </ThsxModal>
    </div>,
    document.querySelector(".thsx-panel--open") ?? document.body,
  );
}

// ────────────── VẬT TƯ: đề nghị cấp theo công đoạn + phiếu nhận về tổ ──────────────
// Khối này LUÔN hiện, kể cả chưa có phiếu nào: bản cũ `if (vt.length === 0) return null;` khiến tổ
// trưởng không có cửa nào để bắt đầu xin vật tư (spec §7).
//
// Hai luồng dữ liệu KHÁC NHAU cùng nằm một section:
//   · `chiTiet.vat_tu_cap` — các LẦN tổ ĐỀ NGHỊ + bản đối chiếu kế hoạch/yêu cầu/thực xuất.
//   · `chiTiet.vat_tu`     — phiếu kho ĐÃ ghi sổ, chờ tổ xác nhận NHẬN (giữ nguyên như cũ).
//
// Vật tư KHÔNG BAO GIỜ chặn bắt đầu/kết thúc công đoạn (spec §8) — không có gì ở đây gài vào
// `disabled` của hai nút đó.
/** `nhap_lai` = tổ trả vật tư thừa về kho (yêu cầu NHẬP): cùng form, không cột kế hoạch/lý do/giờ cần. */
type VtFormMode = "moi" | "sua" | "bo_sung" | "nhap_lai";

/** Đúng MỘT nút CTA hiện ở header. Thứ tự kiểm là CỐ ĐỊNH: `de_nghi_co_the_sua_id` trước, rồi
 *  "chưa từng đề nghị", cuối cùng mới tới bổ sung — `co_the_tao_bo_sung` có thể `true` ngay cả khi
 *  chưa có lần nào, đảo thứ tự là mời tổ trưởng "bổ sung" cho công đoạn chưa xin gì. */
function ctaMode(vt: SxVatTuCap): VtFormMode | null {
  if (vt.de_nghi_co_the_sua_id != null) return "sua";
  if (vt.cac_de_nghi.length === 0) return "moi";
  if (vt.co_the_tao_bo_sung) return "bo_sung";
  return null;
}

const VT_CTA: Record<VtFormMode, { txt: string; icon: "send" | "pencil" | "plus" | "packageCheck" }> = {
  moi: { txt: "Yêu cầu cấp vật tư", icon: "send" },
  sua: { txt: "Sửa đề nghị", icon: "pencil" },
  bo_sung: { txt: "Yêu cầu bổ sung", icon: "plus" },
  nhap_lai: { txt: "Yêu cầu nhập kho", icon: "packageCheck" },
};

function VatTuSection({
  chiTiet, canAssign, busy, exec, tenNguoi,
}: {
  chiTiet: SxWorkItemChiTiet; canAssign: boolean; busy: boolean; exec: ThsxExec;
  tenNguoi: Map<number, string>;
}) {
  const { token } = useAuth();
  const [formMode, setFormMode] = useState<VtFormMode | null>(null);
  const [phieuMo, setPhieuMo] = useState<number | null>(null);
  const vt = chiTiet.vat_tu;
  const cap = chiTiet.vat_tu_cap;
  const cta = ctaMode(cap);
  const cvId = chiTiet.cong_viec.id;
  const lanSua = cap.cac_de_nghi.find((d) => d.id === cap.de_nghi_co_the_sua_id) ?? null;

  // Drawer KHÔNG remount khi bấm sang việc khác (`ThsxDrawer` render không có `key`, `loadChiTiet`
  // không đặt `chiTiet = null` giữa chừng) nên khối này sống xuyên suốt: form đang mở dở của việc A
  // vẫn còn nguyên khi màn đã là việc B ⇒ bấm Gửi là B nhận vật tư của A. Đóng form khi đổi việc.
  useEffect(() => { setFormMode(null); setPhieuMo(null); }, [cvId]);

  // Dòng "Nhận từ bước trước" không phải thứ phải xin cấp — không tính vào mẫu số/tử số.
  const canXin = cap.doi_chieu.filter((d) => !d.nhan_tu);
  const tongMatHang = canXin.length;
  const daXinCount = canXin.filter((d) => d.sl_yeu_cau > VT_EPS).length;
  const coKcsDaXuat = chiTiet.vat_tu.some((v) => v.da_nhan);
  const trangThaiKho = chiTiet.vat_tu.length === 0 ? "Chưa xuất" : coKcsDaXuat ? "Đã xuất kho" : "Chờ nhận";
  const soPhieuDaNhan = vt.filter((v) => v.da_nhan).length;

  return (
    <>
    <section className="thsx-psec thsx-x thsx-psec-card">
      <div className="thsx-psec__h">
        <span className="thsx-psec__title">
          <span className="thsx-psec__icon-badge thsx-psec__icon-badge--amber"><Icon name="warehouse" size={13} /></span> Vật tư
        </span>
        {canAssign && (
          <span className="thsx-psec__acts">
            {cta != null && (
              <Button variant="accent" onClick={() => setFormMode(cta)} disabled={busy} aria-haspopup="dialog">
                <Icon name={VT_CTA[cta].icon} size={13} /> {VT_CTA[cta].txt}
              </Button>
            )}
            {/* Trả vật tư thừa về kho — logic chung mọi vật tư, mở được bất kể đã xin hay chưa. */}
            <Button variant="secondary" onClick={() => setFormMode("nhap_lai")} disabled={busy} aria-haspopup="dialog">
              <Icon name={VT_CTA.nhap_lai.icon} size={13} /> {VT_CTA.nhap_lai.txt}
            </Button>
          </span>
        )}
      </div>

      {tongMatHang > 0 && (
        <div className="thsx-vattu-kpi-strip">
          <div className="thsx-vattu-kpi-tile">
            <span className="thsx-metric-lbl">Tổng mặt hàng</span>
            <span className="thsx-metric-val thsx-num">{tongMatHang} <span className="thsx-metric-unit">món</span></span>
          </div>
          <div className="thsx-vattu-kpi-tile">
            <span className="thsx-metric-lbl">Tiến độ yêu cầu</span>
            <span className={`thsx-metric-val thsx-num ${daXinCount === tongMatHang ? "thsx-metric-val--done" : "thsx-metric-val--thieu"}`}>
              {daXinCount} / {tongMatHang} <span className="thsx-metric-unit">đã xin</span>
            </span>
          </div>
          <div className="thsx-vattu-kpi-tile">
            <span className="thsx-metric-lbl">Trạng thái kho</span>
            <span className="thsx-metric-val">{trangThaiKho}</span>
          </div>
        </div>
      )}

      {cap.du_lieu_cu && (
        <div className="thsx-vattu-alert-banner" role="status">
          <Icon name="alert" size={14} />
          <span>
            <b>Dữ liệu lịch sử (trước 31/08/2026):</b> Công đoạn chưa từng gửi đề nghị nên phiếu đang lấy theo lệnh sản xuất cũ.
          </span>
        </div>
      )}

      {cap.doi_chieu.length === 0 ? (
        <div className="thsx-empty-state-card">
          <div className="thsx-empty-state-ic-wrap"><Icon name="warehouse" size={16} /></div>
          <div className="thsx-empty-state-content">
            <span className="thsx-empty-state-title">Công đoạn này không có nhu cầu vật tư theo kế hoạch.</span>
            <span className="thsx-empty-state-sub">Vẫn gửi đề nghị được nếu tổ cần xin thêm.</span>
          </div>
        </div>
      ) : (
        <table className="thsx-vattu-matrix-tbl thsx-x-tbl">
          <thead>
            <tr>
              <th>Vật tư</th>
              <th className="r">Kế hoạch</th>
              <th className="r">Đã yêu cầu</th>
              <th className="r" title="Thực dùng = kho thực xuất − tổ nhập lại kho">Thực dùng</th>
              <th className="r">Chênh lệch</th>
              <th>Lý do</th>
            </tr>
          </thead>
          <tbody>
            {cap.doi_chieu.map((d) => {
              // Dung sai làm tròn cộng dồn theo số LẦN đề nghị có món này — xem `vtCoLechThucTe`.
              const soLan = vtSoLanCoMon(cap.cac_de_nghi, d);
              return (
              // Tô nền hàng kho xuất KHÁC số đã xin: đó là chỗ tổ trưởng KHÔNG chủ động được,
              // đáng chú ý hơn lệch kế-hoạch↔yêu-cầu (vốn là quyết định của chính tổ).
              <tr key={vtKhoa(d)}
                className={vtCoLechThucTe(d, soLan) ? "is-lech" : undefined}>
                <td className="thsx-vattu-name-cell"><b>{d.ten}</b>
                  {d.hang_loai === "giay" && nhanDangKho(d.dang_giay, d.kho_rong, d.kho_dai) && (
                    <div className="kho-lines__code">{nhanDangKho(d.dang_giay, d.kho_rong, d.kho_dai)}</div>
                  )}
                </td>
                <td className="r thsx-num">{num(d.sl_ke_hoach)}<span className="thsx-x-unit"> {nhanDonVi(d.dvt)}</span></td>
                <td className="r thsx-num">{num(d.sl_yeu_cau)}<span className="thsx-x-unit"> {nhanDonVi(d.dvt)}</span></td>
                {/* `sl_thuc_xuat` đọc thẳng từ dòng chứng từ nên LUÔN ở thang GỐC (board.py:
                    `_vat_tu_cap`) — dán nhãn `dvt` (thang tổ khai) vào đây là in sai đơn vị. */}
                <td className="r thsx-num"
                  title={d.sl_thuc_dung == null
                    ? `Nhập lại ${num(d.sl_nhap_lai)} ${nhanDonVi(d.dvt_goc)} — đã trừ ở dòng ${d.nhap_lai_vao}`
                    : d.nhan_tu
                      ? `Nhận ${num(d.sl_ke_hoach_goc)} − nhập lại ${num(d.sl_nhap_lai)} ${nhanDonVi(d.dvt_goc)}`
                      : `Xuất ${num(d.sl_thuc_xuat)} − nhập lại ${num(d.sl_nhap_lai)} ${nhanDonVi(d.dvt_goc)}`}>
                  {d.sl_thuc_dung == null ? (
                    // Dòng THÔNG TIN: trả khác khổ đã xuất, phần trừ đã nằm ở dòng đích.
                    <div className="kho-lines__code">
                      nhập lại {num(d.sl_nhap_lai)}<span className="thsx-x-unit"> {nhanDonVi(d.dvt_goc)}</span>
                      {" · "}trừ vào dòng {d.nhap_lai_vao}
                    </div>
                  ) : (
                    <>
                      {num(d.sl_thuc_dung)}<span className="thsx-x-unit"> {nhanDonVi(d.dvt_goc)}</span>
                      {d.nhan_tu ? (
                        d.sl_nhap_lai > VT_EPS && (
                          <div className="kho-lines__code">nhận {num(d.sl_ke_hoach_goc)} − nhập lại {num(d.sl_nhap_lai)}</div>
                        )
                      ) : (d.sl_nhap_lai > VT_EPS || d.sl_thuc_xuat > VT_EPS) && (
                        <div className="kho-lines__code">xuất {num(d.sl_thuc_xuat)} − nhập lại {num(d.sl_nhap_lai)}</div>
                      )}
                    </>
                  )}
                </td>
                <td className="r"><VtDeltaCell d={d} soLan={soLan} /></td>
                <td><VtLyDoCacLanCell ds={d.cac_ly_do} /></td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {formMode != null && (
        <VatTuDeNghiForm
          // `cvId` nằm trong key để dựng lại state form khi đổi việc — hai việc cùng chưa có đề
          // nghị thì `"moi-0"` giống hệt nhau, một mình `setFormMode(null)` ở trên vẫn hở nếu về
          // sau có đường nào mở form mà không đi qua nút CTA.
          key={`${cvId}-${formMode}-${lanSua?.id ?? 0}`}
          cv={chiTiet.cong_viec} cap={cap} mode={formMode} lanSua={lanSua} busy={busy}
          onHuy={() => setFormMode(null)} onXong={() => setFormMode(null)} exec={exec} />
      )}

      {cap.cac_de_nghi.length === 0 ? (
        <div className="thsx-empty-state-card thsx-empty-state-card--sm">
          <div className="thsx-empty-state-ic-wrap"><Icon name="history" size={14} /></div>
          <span className="thsx-empty-state-title">Chưa có lịch sử đề nghị vật tư nào cho công đoạn này.</span>
        </div>
      ) : (
        <ul className="thsx-x-list">
          {/* Mới nhất lên đầu (BE trả theo `lan_so` tăng dần) — khớp quy ước màn Kho. */}
          {[...cap.cac_de_nghi].reverse().map((d) => (
            <VtDeNghiLanRow key={d.id} d={d} tenNguoi={tenNguoi} />
          ))}
        </ul>
      )}

      {phieuMo != null && <PhieuKhoNoi voucherId={phieuMo} token={token ?? ""} onClose={() => setPhieuMo(null)} />}
    </section>

    {/* Phiếu xuất kho — khối RIÊNG, cùng khuôn khối Vật tư (đầu khối có huy hiệu, dải số, bảng). */}
    {vt.length > 0 && (
      <section className="thsx-psec thsx-x thsx-psec-card">
        <div className="thsx-psec__h">
          <span className="thsx-psec__title">
            <span className="thsx-psec__icon-badge thsx-psec__icon-badge--cyan"><Icon name="packageCheck" size={13} /></span> Phiếu xuất kho
          </span>
        </div>

        <div className="thsx-vattu-kpi-strip">
          <div className="thsx-vattu-kpi-tile">
            <span className="thsx-metric-lbl">Tổng phiếu</span>
            <span className="thsx-metric-val thsx-num">{vt.length} <span className="thsx-metric-unit">phiếu</span></span>
          </div>
          <div className="thsx-vattu-kpi-tile">
            <span className="thsx-metric-lbl">Đã nhận</span>
            <span className={`thsx-metric-val thsx-num ${soPhieuDaNhan === vt.length ? "thsx-metric-val--done" : ""}`}>
              {soPhieuDaNhan} / {vt.length}
            </span>
          </div>
          <div className="thsx-vattu-kpi-tile">
            <span className="thsx-metric-lbl">Chờ nhận</span>
            <span className={`thsx-metric-val thsx-num ${soPhieuDaNhan < vt.length ? "thsx-metric-val--thieu" : ""}`}>
              {vt.length - soPhieuDaNhan} <span className="thsx-metric-unit">phiếu</span>
            </span>
          </div>
        </div>

        <table className="thsx-vattu-matrix-tbl thsx-x-tbl">
          <thead>
            <tr>
              <th>Mã phiếu</th>
              <th>Trạng thái</th>
              <th>Nhận lúc</th>
              <th className="r">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {vt.map((v) => (
              <tr key={v.voucher_id}>
                <td className="thsx-vattu-name-cell">
                  <button type="button" className="thsx-x-vt__open" aria-haspopup="dialog"
                    title="Xem phiếu xuất kho" onClick={() => setPhieuMo(v.voucher_id)}>
                    <Icon name={v.da_nhan ? "packageCheck" : "box"} size={13}
                      className={v.da_nhan ? "thsx-x-vt__ic is-ok" : "thsx-x-vt__ic"} />
                    <b className="thsx-x-vt__ma">{v.ma}</b>
                  </button>
                </td>
                <td>
                  {v.da_nhan
                    ? <span className="thsx-vattu-badge thsx-vattu-badge--ok">✓ Đã nhận</span>
                    : <span className="thsx-vattu-badge thsx-vattu-badge--wait">Chờ nhận</span>}
                </td>
                <td className="thsx-num">{v.da_nhan && v.xac_nhan_luc ? ngayGio(v.xac_nhan_luc) : "—"}</td>
                <td className="r">
                  {!v.da_nhan && canAssign ? (
                    <Button variant="secondary" onClick={() => void exec.xacNhanVatTu(v.voucher_id)} disabled={busy}>
                      <Icon name="packageCheck" size={13} /> Xác nhận nhận
                    </Button>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )}
    </>
  );
}

/** Phiếu kho mở từ ngăn SX — CÙNG drawer phiếu của màn Kho, chỉ đọc (thao tác trên phiếu làm ở màn
 *  Kho). Hai việc phải lo vì drawer này nằm TRONG ngăn `.thsx-panel`:
 *  - Ngăn có `transform` nên `position: fixed` bên trong bị nhốt theo khung ngăn ⇒ đẩy ra `body`,
 *    lớp bọc đặt z-index trên ngăn (61).
 *  - Esc ở trang đóng cả ngăn ⇒ dời focus vào lớp này, tự bắt Esc rồi `preventDefault` để trang nhường.
 *  `canViewCost` để true như màn Đề nghị của Kho: backend tự ẩn giá với người không được xem. */
function PhieuKhoNoi({ voucherId, token, onClose }: { voucherId: number; token: string; onClose: () => void }) {
  const lopRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const truoc = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lopRef.current?.focus({ preventScroll: true });
    return () => { if (truoc?.isConnected) truoc.focus({ preventScroll: true }); };
  }, []);
  return createPortal(
    <div ref={lopRef} className="thsx-phieu-kho-lop" tabIndex={-1}
      onKeyDown={(e) => { if (e.key !== "Escape" || e.defaultPrevented) return; e.preventDefault(); onClose(); }}>
      <VoucherDrawer token={token} voucherId={voucherId} canCreate={false} canPost={false}
        canViewCost onClose={onClose} onChanged={() => {}} />
    </div>,
    document.body,
  );
}

/** Ô "Chênh lệch": Đã được trực quan hoá thành các Pill Badge tiếng Việt thân thiện, dễ nhận biết ngay. */
function VtDeltaCell({ d, soLan }: { d: SxVatTuCapDoiChieu; soLan: number }) {
  const soKh = d.sl_yeu_cau - d.sl_ke_hoach;
  const soYc = d.lech_thuc_te;
  const lechYc = vtCoLechThucTe(d, soLan);

  // 0. Giấy nhận từ bước trước (spec 2026-10-01 §5): trung tính — không phải thiếu, không phải đủ.
  if (d.nhan_tu) {
    return <span className="thsx-vattu-badge thsx-vattu-badge--nhan">Nhận từ {d.nhan_tu}</span>;
  }

  // 1. Tổ chưa xin cấp (đã yêu cầu = 0 & kế hoạch > 0)
  if (d.sl_yeu_cau <= VT_EPS && d.sl_ke_hoach > VT_EPS) {
    return <span className="thsx-vattu-badge thsx-vattu-badge--wait">⚠️ Chưa xin cấp</span>;
  }

  // 2. Cả 2 đều khớp 100%
  if (Math.abs(soKh) <= VT_EPS && !lechYc) {
    return <span className="thsx-vattu-badge thsx-vattu-badge--ok">✓ Đủ & Khớp</span>;
  }

  return (
    <div className="thsx-vattu-delta-col">
      {/* So với Kế Hoạch */}
      {Math.abs(soKh) > VT_EPS && (
        <span className={`thsx-vattu-badge ${soKh > 0 ? "thsx-vattu-badge--up" : "thsx-vattu-badge--down"}`}>
          {soKh > 0 ? `+${num(soKh)}` : `−${num(Math.abs(soKh))}`} {nhanDonVi(d.dvt)} {soKh > 0 ? "(Vượt KH)" : "(Thiếu)"}
        </span>
      )}
      {/* So với Kho (Thực xuất ↔ Yêu cầu) */}
      {lechYc && (
        <span className={`thsx-vattu-badge ${soYc > 0 ? "thsx-vattu-badge--up" : "thsx-vattu-badge--down"}`}>
          Kho {soYc > 0 ? `xuất dư +${num(soYc)}` : `thiếu −${num(Math.abs(soYc))}`} {nhanDonVi(d.dvt_goc)}
        </span>
      )}
    </div>
  );
}

function VtLyDoCacLanCell({ ds }: { ds: { lan_so: number; ly_do: string }[] }) {
  if (ds.length === 0) return <span className="thsx-x-unit">—</span>;
  return (
    <div className="thsx-x-vt-delta thsx-x-vt-delta--left">
      {ds.map((d, i) => (
        <span key={i} className="thsx-x-butru__mo">Lần {d.lan_so}: {d.ly_do}</span>
      ))}
    </div>
  );
}

function VtDeNghiLanRow({ d, tenNguoi }: { d: SxVatTuCapLan; tenNguoi: Map<number, string> }) {
  const [mo, setMo] = useState(false);
  const st = d.stock_request_trang_thai ? VT_TT[d.stock_request_trang_thai] : null;
  const ten = (id: number | null) => (id == null ? "—" : tenNguoi.get(id) ?? `NV #${id}`);
  return (
    <li className="thsx-x-item">
      <button type="button" className="thsx-x-item__h" onClick={() => setMo((o) => !o)} aria-expanded={mo}>
        <Icon name="chevron" size={12} className={mo ? "" : "thsx-rot-90"} />
        <span className="thsx-x-item__q">Lần {d.lan_so}</span>
        {d.loai === "bo_sung" && <span className="thsx-x-tag-ht">bổ sung</span>}
        <span className="thsx-x-item__spacer" />
        <span className="thsx-x-item__time thsx-num">{ngayGio(d.can_luc)}</span>
        {d.stock_request_ma ? (
          <span className={`thsx-x-pill ${st?.cls ?? "thsx-x-pill--wait"}`}>
            {st?.txt ?? d.stock_request_trang_thai}
          </span>
        ) : (
          <span className="thsx-x-pill thsx-x-pill--off">không cần cấp</span>
        )}
      </button>
      {mo && (
        <div className="thsx-x-item__body">
          <div className="thsx-x-kv"><span>Mã yêu cầu kho</span><span>{d.stock_request_ma ?? "—"}</span></div>
          <div className="thsx-x-kv"><span>Người tạo</span>
            <span>{ten(d.created_by_id)} · {ngayGio(d.created_at)}</span></div>
          {d.updated_by_id != null && d.updated_by_id !== d.created_by_id && (
            <div className="thsx-x-kv"><span>Người sửa cuối</span>
              <span>{ten(d.updated_by_id)} · {ngayGio(d.updated_at)}</span></div>
          )}
          {d.dongs.length > 0 && (
            <table className="thsx-x-tbl" style={{ marginTop: 8 }}>
              <thead><tr><th>Vật tư</th><th className="r">Xin cấp</th><th>Lý do</th></tr></thead>
              <tbody>
                {d.dongs.map((x) => (
                  <tr key={vtKhoa(x)}>
                    <td>
                      {x.ten}
                      {x.hang_loai === "giay" && nhanDangKho(x.dang_giay, x.kho_rong, x.kho_dai) && (
                        <div className="kho-lines__code">{nhanDangKho(x.dang_giay, x.kho_rong, x.kho_dai)}</div>
                      )}
                    </td>
                    <td className="r thsx-num">{num(x.sl_yeu_cau)}<span className="thsx-x-unit"> {nhanDonVi(x.dvt)}</span></td>
                    <td><span className="thsx-x-butru__mo">{x.ly_do_chenh_lech || "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}

// ---- Form đề nghị (dùng chung cho 3 mode) ---------------------------------------------------
interface VtDongForm {
  key: string;
  hang_loai: string;
  hang_id: number;          // 0 = dòng vừa thêm, chưa chọn mặt hàng
  ten: string;
  /** Giấy: dạng + khổ mm (spec giấy đếm tờ × khổ) — cùng mã khác dạng/khổ là hai dòng. */
  dang_giay: DangGiay | null;
  kho_rong: number;
  kho_dai: number;
  dvt: string;
  /** Đơn vị của dòng KẾ HOẠCH cùng mặt hàng — để biết tổ có đang khai bằng đơn vị khác không. */
  dvtKeHoach: string;
  sl_ke_hoach: number;
  sl_yeu_cau: number;
  /** Chuỗi THÔ đang gõ trong ô số. Giữ riêng vì `<input type="number">` điều khiển bằng SỐ sẽ nuốt
   *  dấu chấm đang gõ dở ("0." → trình duyệt trả "" → về 0), tức là không gõ nổi số lẻ — mà vật tư
   *  cân theo kg thì số lẻ là chuyện thường. */
  slText: string;
  ly_do_chenh_lech: string;
  /** Dòng đến TỪ kế hoạch: lần đầu phải lưu đủ kể cả khi = 0, nên không cho xoá (dùng "Về 0"). */
  tuKeHoach: boolean;
}

type VtKhoaVao = { hang_loai: string; hang_id: number; dang_giay?: string | null;
  kho_rong?: number; kho_dai?: number };

/** Khoá một dòng vật tư — phản chiếu `khoa_dong` của máy chủ: loại · mã · dạng · khổ (ngắn × dài;
 *  cuộn chỉ khổ rộng). Hàng khác chỉ loại · mã. */
export function vtKhoa(x: VtKhoaVao): string {
  if (x.hang_loai !== "giay") return `${x.hang_loai}:${x.hang_id}`;
  const [r, d] = chuanKho(x.kho_rong, x.kho_dai);
  const dang = x.dang_giay || (r && d ? "to" : "cuon");
  return `giay:${x.hang_id}:${dang}:${r}:${dang === "to" ? d : 0}`;
}

/** Dòng giấy NGOÀI kế hoạch — tổ phải tự nói dạng + khổ (dòng kế hoạch mang sẵn từ bước lệnh). */
function vtGiayTuKhai(d: VtDongForm): boolean {
  return d.hang_loai === "giay" && d.hang_id > 0 && !d.tuKeHoach;
}

/** Hiện/bắt buộc ô Lý do — CHỈ để ra mắt sớm ô nhập, KHÔNG bao giờ dùng làm `disabled` nút gửi.
 *  Quy đổi đơn vị thật nằm ở BE (spec §3: BE không tin số client), nên so bằng số thô ở đây sai
 *  một chút cũng không sao: người dùng vẫn gõ tay được, còn thiếu lý do thật thì BE trả 400 kèm
 *  câu tiếng Việt cụ thể. */
function vtCanLyDo(d: VtDongForm, loai: "lan_dau" | "bo_sung"): { hien: boolean; batBuoc: boolean } {
  if (loai === "bo_sung") {
    const batBuoc = d.sl_yeu_cau > VT_EPS;
    return { hien: batBuoc, batBuoc };
  }
  // Đơn vị HIỆU LỰC — phải gộp ĐÚNG như BE gộp (`vat_tu_de_nghi.py:_chuan_hoa`:
  // `dvt = ln.dvt or k_row.dvt or ""`). Từ vòng vá gốc, `vtDongKhoiTao` mode `sua` đã tự gộp
  // `d.dvt` với đơn vị kế hoạch ngay lúc dựng dòng, nên tới đây `d.dvt` thường ĐÃ mang đơn vị
  // hiệu lực và dòng dưới thành lớp THỪA cho ca đó. GIỮ NGUYÊN, đừng xoá vì tưởng dead code —
  // đây là lớp phòng thủ CÓ CHỦ ĐÍCH, khoá hợp đồng "FE xét đúng thứ BE xét" bất kể dòng được
  // dựng bằng đường nào (kể cả đường dựng khác sau này không đi qua `vtDongKhoiTao`).
  const dvtHieuLuc = d.dvt || d.dvtKeHoach;
  // Món kế hoạch mà KẾ HOẠCH cũng không có đơn vị, và tổ để 0: không có mốc nào để nói lệch ⇒ BE
  // miễn luật lý do cho đúng ca này ⇒ đừng gắn dấu `*` đòi bắt buộc. Vẫn MỞ ô để ai muốn ghi chú
  // thì ghi — chữ đó nay đi được tới BE (xem `vtPayloadLines`).
  // BE tự TÍNH LẠI vị ngữ này (biến `khong_doi_chieu`), nó KHÔNG đọc cờ `CB_KHONG_DOI_CHIEU` —
  // cờ đó chỉ sống trong bảng cân đối (`ke_hoach_vat_tu_service.py:1139`, đọc lại ở `:1210`). Sửa
  // cờ mà tưởng đang sửa luật lý do là sửa nhầm file.
  if (d.tuKeHoach && !dvtHieuLuc && d.sl_yeu_cau <= VT_EPS) return { hien: true, batBuoc: false };
  if (!d.tuKeHoach) {
    const co = d.sl_yeu_cau > VT_EPS;
    return { hien: co, batBuoc: co };
  }
  // Đổi đơn vị thật (tổ khai bằng đơn vị khác kế hoạch) — FE không quy đổi được nên KHÔNG đoán,
  // để BE phán. Dùng đơn vị HIỆU LỰC: `dvt` rỗng không phải "đổi đơn vị", nó chỉ là "dòng đã lưu
  // chưa mang đơn vị" — BE khi đó so thẳng theo đơn vị kế hoạch, và FE phải so y hệt.
  if (dvtHieuLuc !== d.dvtKeHoach) return { hien: true, batBuoc: false };
  const lech = Math.abs(d.sl_yeu_cau - d.sl_ke_hoach) > VT_EPS;
  return { hien: lech, batBuoc: lech };
}

/** Dòng đã chọn được mặt hàng nhưng Ô ĐƠN VỊ CỦA CHÍNH DÒNG ĐÓ đang trống. BE không nhận nổi một
 *  dòng như vậy khi tổ xin số dương (nó không biết quy ra đơn vị kho), và im lặng vứt ở FE thì tổ
 *  trưởng thấy toast xanh "Đã gửi" trong khi kho không bao giờ thấy món đó.
 *
 *  CỐ Ý chỉ xét `d.dvt`, KHÔNG gộp `d.dvtKeHoach` như `vtCanLyDo` — hai hàm trả lời hai câu hỏi
 *  khác nhau. `vtCanLyDo` hỏi "BE có đòi lý do không" nên phải gộp y hệt BE gộp. Hàm này hỏi "ô
 *  đơn vị trên màn có chữ gì không" — và màn đang hiện đúng `{d.dvt ? nhanDonVi(d.dvt) : "—"}`. Gộp vào đây là cho
 *  tổ gõ một số dương vào ô đơn vị hiện "—" rồi để BE âm thầm đọc nó theo đơn vị KẾ HOẠCH: đổi
 *  một lần chặn thừa lấy một lần lệch thang im lặng, tệ hơn. Lần chặn thừa cũng không phải ngõ
 *  cụt — câu của `vtCanTro` chỉ ngay đường thoát ("đưa dòng đó về 0 rồi gửi phần còn lại").
 *
 *  Từ vòng vá gốc, ca "dòng đã lưu `dvt=""`, kế hoạch nay có đơn vị" không còn rơi vào hàm này
 *  nữa: `vtDongKhoiTao` mode `sua` đã gộp đơn vị kế hoạch vào `d.dvt` ngay lúc dựng dòng, nên
 *  `d.dvt` ở đây tự nhiên có chữ và hàm trả `false` — KHÔNG cần sửa thân hàm. Hàm chỉ còn trả
 *  `true` cho ca thật sự không có mốc nào để gộp (dòng ngoài kế hoạch hiện tại, hoặc chính kế
 *  hoạch cũng chưa có đơn vị). */
function vtThieuDonVi(d: VtDongForm): boolean {
  // Giấy tự khai chưa chọn dạng: ô đơn vị trống vì CHƯA chọn dạng, `vtCanTro` nói đúng chuyện đó.
  if (vtGiayTuKhai(d) && !d.dang_giay) return false;
  return d.hang_id > 0 && !d.dvt;
}

/** Câu giải thích vì sao nút Gửi đang tắt — `null` nghĩa là gửi được. KHÔNG bao giờ để nút disabled
 *  câm: người dùng không đoán được mình thiếu gì. */
function vtCanTro(
  dongs: VtDongForm[], lines: SxVatTuDeNghiDongIn[],
  mode: VtFormMode, loai: "lan_dau" | "bo_sung",
): string | null {
  // CHỈ chặn khi tổ đang THẬT SỰ xin món đó. Dòng kế hoạch cũng có thể trống đơn vị — chặn cả khi
  // nó đang để 0 là để một món hỏng khoá chết cả công đoạn, mà dòng kế hoạch lại không xoá được nên
  // tổ trưởng hết đường. Đường thoát thật: đưa món đó về 0, gửi phần còn lại.
  // Cùng cách nói với băng cảnh báo trên thẻ dòng và với câu lỗi BE (`vat_tu_de_nghi.py`): KHÔNG
  // đóng đinh nguyên nhân vào "danh mục chưa khai" — ô đơn vị còn trống được vì snapshot của bước,
  // vì routing của dòng giấy, chứ không riêng danh mục.
  if (dongs.some((d) => vtThieuDonVi(d) && d.sl_yeu_cau > VT_EPS)) {
    return "Còn mặt hàng chưa có đơn vị tính nên chưa xin được — đưa dòng đó về 0 rồi gửi phần còn "
      + "lại, hoặc nhờ kỹ thuật kiểm lại đơn vị rồi xin lại.";
  }
  // Giấy tự khai: phải nói dạng, tờ phải đủ hai cạnh khổ — kho soạn theo lô đúng khổ.
  for (const d of dongs) {
    if (!vtGiayTuKhai(d) || d.sl_yeu_cau <= VT_EPS) continue;
    const ten = d.ten || "Giấy";
    if (!d.dang_giay) return `«${ten}»: chọn dạng giấy (tờ hoặc cuộn).`;
    const [r, k] = chuanKho(d.kho_rong, d.kho_dai);
    if (d.dang_giay === "to" && !(r && k)) return `«${ten}» là giấy tờ — khai đủ hai cạnh khổ (mm).`;
  }
  // Gõ số rồi quên chọn mặt hàng: cũng là một dòng sẽ bị loại trước khi rời trình duyệt.
  if (dongs.some((d) => d.hang_id <= 0 && d.sl_yeu_cau > VT_EPS)) {
    return "Còn dòng đã điền số nhưng chưa chọn mặt hàng.";
  }
  // Trùng mặt hàng: dùng ĐÚNG câu BE trả, để hai bên không nói hai kiểu về cùng một lỗi.
  const dem = new Map<string, number>();
  for (const d of dongs) {
    if (d.hang_id <= 0) continue;
    // Giấy tự khai chưa chọn dạng thì chưa tính trùng (chưa biết là dòng nào).
    if (vtGiayTuKhai(d) && !d.dang_giay) continue;
    const k = vtKhoa(d);
    dem.set(k, (dem.get(k) ?? 0) + 1);
  }
  if ([...dem.values()].some((n) => n > 1)) {
    return "Một mặt hàng cùng dạng, cùng khổ chỉ được khai một dòng — gộp số lượng lại.";
  }
  // Sửa được phép đưa HẾT về 0 (đó là đường tự huỷ yêu cầu, spec §5.3) nên không đòi số dương.
  // Tạo mới thì phải có cái gì đó để gửi: một lần đề nghị RỖNG vẫn thành `de_nghi_co_the_sua_id`
  // và khoá luôn đường "Yêu cầu bổ sung" cho tới khi sửa.
  if (mode !== "sua" && lines.length === 0) {
    if (mode === "nhap_lai") return "Chưa có dòng nào để nhập lại — thêm vật tư và điền số lượng.";
    return loai === "bo_sung"
      ? "Đề nghị bổ sung phải có ít nhất một mặt hàng với số lớn hơn 0."
      : "Chưa có dòng nào để gửi — thêm mặt hàng và điền số trước khi gửi.";
  }
  return null;
}

/** Dòng form → thân yêu cầu NHẬP LẠI: chỉ dòng dương, không lý do. Giấy mang dạng + khổ. */
export function vtPayloadNhapLai(dongs: VtDongForm[]): SxVatTuNhapLaiIn["lines"] {
  return vtPayloadLines(dongs, "bo_sung").map((l) => ({
    hang_loai: l.hang_loai, hang_id: l.hang_id, dvt: l.dvt, so_luong: l.sl_yeu_cau,
    ...(l.hang_loai === "giay"
      ? { dang_giay: l.dang_giay, kho_rong: l.kho_rong, kho_dai: l.kho_dai } : {}),
  }));
}

export function vtPayloadLines(dongs: VtDongForm[], loai: "lan_dau" | "bo_sung"): SxVatTuDeNghiDongIn[] {
  // Dòng KẾ HOẠCH giữ lại kể cả khi `dvt` rỗng (danh mục, snapshot của bước, hay routing của dòng
  // giấy — nguyên nhân nào cũng vậy): BE nhận được
  // `dvt=""` với số 0 và miễn luật lý do cho đúng ca đó. Lọc thẳng `!!d.dvt` như trước là vứt HẲN
  // dòng — kéo theo cả chữ người dùng vừa gõ vào ô Lý do (mà giao diện lại đang gắn dấu `*` đòi
  // bắt buộc), và bản đối chiếu thì ghi thiếu thứ họ khai.
  // Dòng NGOÀI kế hoạch vẫn phải có đơn vị, và chính bộ lọc NÀY vứt nó ở MỌI số lượng: nó có
  // `tuKeHoach === false` nên vế `(!!d.dvt || d.tuKeHoach)` rút về đúng `!!d.dvt` — nó không bao
  // giờ đi tới bộ lọc thứ hai. Bộ lọc thứ hai chỉ lo chuyện số 0. Thêm một lớp nữa: `vtCanTro`
  // tắt nút Gửi khi dòng như vậy đang xin số dương. Không có ngách nào lọt xuống BE.
  // KHÔNG gộp `d.dvtKeHoach` vào đây như `vtCanLyDo`: câu hỏi ở đây khác ("dòng này có được gửi
  // xuống BE không", không phải "có phải ghi lý do không"), và gộp cũng là no-op — dòng kế hoạch
  // đã được `d.tuKeHoach` giữ rồi, còn dòng ngoài kế hoạch thì `dvtKeHoach` luôn BẰNG `dvt`
  // (`themDong` và `MaterialCombobox.onPick` đặt cả hai cùng lúc; `vtDongKhoiTao` mode `sua` rơi
  // về `?? d.dvt` khi mặt hàng không có trong kế hoạch).
  const giu = dongs.filter((d) => d.hang_id > 0 && (!!d.dvt || d.tuKeHoach))
    // lần đầu: giữ MỌI dòng gốc kế hoạch kể cả 0 ("kế hoạch có, tổ không lấy"); dòng ngoài kế
    // hoạch mà = 0 thì bỏ. Bổ sung: chỉ dòng dương.
    .filter((d) => (loai === "lan_dau" ? d.tuKeHoach || d.sl_yeu_cau > VT_EPS : d.sl_yeu_cau > VT_EPS));
  return giu.map((d) => ({
    hang_loai: d.hang_loai, hang_id: d.hang_id,
    // Giấy mang dạng + khổ (ngắn × dài; cuộn chỉ khổ rộng) — máy chủ chuẩn hoá lại.
    ...(d.hang_loai === "giay"
      ? {
          dang_giay: d.dang_giay,
          kho_rong: chuanKho(d.kho_rong, d.kho_dai)[0],
          kho_dai: d.dang_giay === "cuon" ? 0 : chuanKho(d.kho_rong, d.kho_dai)[1],
        }
      : {}),
    dvt: d.dvt,
    sl_yeu_cau: d.sl_yeu_cau,
    // Ô Lý do ĐÓNG lại thì chữ cũ trong state phải thôi đi theo. Kéo một dòng đang lệch về đúng
    // kế hoạch (hoặc về 0 rồi xin lại đủ) làm ô biến mất, nhưng `d.ly_do_chenh_lech` vẫn giữ câu
    // gõ lần trước — gửi lên thì bảng đối chiếu ghi "554/554, không lệch" mà vẫn kèm lý do giải
    // thích một chỗ lệch KHÔNG CÒN TỒN TẠI (thấy khi nghiệm thu Task 10: hủy về 0 kèm lý do rồi
    // xin lại đủ 554, dòng vẫn đeo "tổ chưa cần cấp giấy"). Dùng ĐÚNG vị ngữ mà ô dùng để hiện.
    ly_do_chenh_lech: vtCanLyDo(d, loai).hien ? d.ly_do_chenh_lech.trim() || null : null,
  }));
}

/** Đơn vị mà lần đề nghị GẦN NHẤT đã dùng cho ĐÚNG mặt hàng này — `null` khi chưa lần nào xin nó.
 *
 *  Dùng làm đơn vị mặc định lúc tổ chọn mặt hàng ở form bổ sung. Trước đây dòng mới luôn nhận
 *  `don_vi_goc`, mà bảng đối chiếu lại gộp theo `(hang_loai, hang_id)` KHÔNG kèm đơn vị: một mặt
 *  hàng ôm hai `dvt` khác nhau thì `board.py` buộc phải hạ CẢ HÀNG về thang gốc (đúng — cộng 554
 *  tờ với 12 kg rồi in ra mới là nói dối). Hậu quả: tổ gõ lần 1 "554 tờ", xin bổ sung chút giấy
 *  mà form chỉ cho gõ kg, thế là cả dòng lật từ "554 to" sang "166,967 kg" rồi "178,967 kg" — tổ
 *  trưởng vốn nghĩ bằng tờ mở lại thấy đề nghị của chính mình ghi bằng kg. Bám theo đơn vị lần
 *  trước thì hàng vẫn một thang và không có gì phải lật.
 *
 *  Nhiều lần trước dùng nhiều đơn vị khác nhau ⇒ lấy của lần `lan_so` LỚN NHẤT (thói quen mới
 *  nhất của tổ). Dòng lưu với `dvt` rỗng KHÔNG tính là một câu trả lời — nó chỉ nghĩa là lúc đó
 *  routing/danh mục chưa nói được đơn vị, chép lại là chép cái trống. */
export function vtDvtLanTruoc(
  cacDeNghi: { lan_so: number; dongs: { hang_loai: string; hang_id: number; dvt: string }[] }[],
  hangLoai: string, hangId: number,
): string | null {
  let tot: { lanSo: number; dvt: string } | null = null;
  for (const lan of cacDeNghi) {
    for (const d of lan.dongs) {
      if (d.hang_loai !== hangLoai || d.hang_id !== hangId || !d.dvt) continue;
      if (tot == null || lan.lan_so > tot.lanSo) tot = { lanSo: lan.lan_so, dvt: d.dvt };
    }
  }
  return tot?.dvt ?? null;
}

function vtDongKhoiTao(cap: SxVatTuCap, mode: VtFormMode, lanSua: SxVatTuCapLan | null): VtDongForm[] {
  const kh = new Map(cap.ke_hoach.map((k) => [vtKhoa(k), k]));
  // Bổ sung: RỖNG — chỉ thêm đúng mặt hàng đang thiếu; liệt kê lại cả kế hoạch rồi bắt gõ lý do
  // cho từng dòng 0 là phiền vô ích (chỉ lần ĐẦU mới cần lưu đủ kế hoạch).
  if (mode === "bo_sung" || mode === "nhap_lai") return [];
  if (mode === "moi") {
    return cap.ke_hoach.map((k) => ({
      key: vtKhoa(k),
      hang_loai: k.hang_loai, hang_id: k.hang_id, ten: k.ten,
      dang_giay: k.dang_giay, kho_rong: k.kho_rong, kho_dai: k.kho_dai,
      dvt: k.dvt, dvtKeHoach: k.dvt,
      sl_ke_hoach: k.sl, sl_yeu_cau: k.sl, slText: String(k.sl),
      ly_do_chenh_lech: "", tuKeHoach: true,
    }));
  }
  // Sửa: điền số CỦA RIÊNG lần đang sửa (`dongs`), KHÔNG phải số cộng dồn của `doi_chieu` —
  // dùng nhầm là thổi phồng lần đang sửa bằng số của các lần trước.
  const ds: VtDongForm[] = (lanSua?.dongs ?? []).map((d) => {
    const k = vtKhoa(d);
    return {
      key: k,
      hang_loai: d.hang_loai, hang_id: d.hang_id, ten: d.ten,
      dang_giay: d.dang_giay, kho_rong: d.kho_rong, kho_dai: d.kho_dai,
      // Vá GỐC (không phải triệu chứng): dòng đã lưu có thể mang `dvt=""` (routing mập mờ lúc
      // gửi lần đầu) trong khi kế hoạch nay đã có đơn vị. BE gộp `ln.dvt or k_row.dvt` nên FE
      // phải hiện ĐÚNG thứ BE sẽ dùng — không được hiện "—" trên màn rồi tính theo "to" ở BE.
      dvt: d.dvt || (kh.get(k)?.dvt ?? d.dvt), dvtKeHoach: kh.get(k)?.dvt ?? d.dvt,
      sl_ke_hoach: d.sl_ke_hoach, sl_yeu_cau: d.sl_yeu_cau, slText: String(d.sl_yeu_cau),
      ly_do_chenh_lech: d.ly_do_chenh_lech ?? "", tuKeHoach: kh.has(k),
    };
  });
  // Sửa LẦN ĐẦU: kế hoạch có thể đã thêm mặt hàng sau lúc gửi — bù nốt vào (số xin = 0) để lần
  // đầu vẫn lưu đủ mọi vật tư kế hoạch.
  if (lanSua?.loai === "lan_dau") {
    const co = new Set(ds.map((d) => d.key));
    for (const k of cap.ke_hoach) {
      const key = vtKhoa(k);
      if (co.has(key)) continue;
      ds.push({
        key, hang_loai: k.hang_loai, hang_id: k.hang_id, ten: k.ten,
        dang_giay: k.dang_giay, kho_rong: k.kho_rong, kho_dai: k.kho_dai,
        dvt: k.dvt, dvtKeHoach: k.dvt, sl_ke_hoach: k.sl, sl_yeu_cau: 0, slText: "0",
        ly_do_chenh_lech: "", tuKeHoach: true,
      });
    }
  }
  return ds;
}

function VatTuDeNghiForm({
  cv, cap, mode, lanSua, busy, onHuy, onXong, exec,
}: {
  cv: SxWorkItemChiTiet["cong_viec"]; cap: SxVatTuCap; mode: VtFormMode;
  lanSua: SxVatTuCapLan | null; busy: boolean;
  onHuy: () => void; onXong: () => void; exec: ThsxExec;
}) {
  const { token } = useAuth();
  // Loại HIỆU LỰC quyết luật lý do + luật lọc dòng: sửa thì theo `loai` của chính lần đang sửa.
  const loaiHieuLuc: "lan_dau" | "bo_sung" =
    mode === "bo_sung" || mode === "nhap_lai" ? "bo_sung" : mode === "sua" ? (lanSua?.loai === "bo_sung" ? "bo_sung" : "lan_dau") : "lan_dau";
  // Giờ cần: sửa = giờ CỦA CHÍNH lần đó (chỉnh lại cái tổ đã chọn, không quay về mốc gốc).
  const [canLuc, setCanLuc] = useState(
    (mode === "sua" ? toDtLocal(lanSua?.can_luc) : toDtLocal(cv.du_kien_bat_dau)) || nowDtLocal(),
  );
  const nhapLai = mode === "nhap_lai";
  const [ghiChu, setGhiChu] = useState("");
  const [dongs, setDongs] = useState<VtDongForm[]>(() => vtDongKhoiTao(cap, mode, lanSua));
  const seq = useRef(0);
  const nganKeoRef = useRef<HTMLElement>(null);
  const nhanTrenNen = useRef(false);
  // Đưa focus vào ngăn kéo để Esc tới được `onKeyDown` của nó ngay cả khi chưa bấm ô nào.
  useEffect(() => { nganKeoRef.current?.focus({ preventScroll: true }); }, []);

  // "Đã yêu cầu luỹ kế" cho dòng bổ sung — nền để tổ trưởng biết mình đang xin thêm trên cái gì.
  const luyKe = new Map(cap.doi_chieu.map((d) => [vtKhoa(d), d]));

  function sua(key: string, patch: Partial<VtDongForm>) {
    setDongs((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }
  /** Đặt số lượng bằng NÚT (±1 / Về 0): số và chuỗi hiển thị đi cùng nhau. */
  function datSl(key: string, sl: number) {
    const v = Math.max(0, sl);
    sua(key, { sl_yeu_cau: v, slText: String(v) });
  }
  function themDong() {
    seq.current += 1;
    setDongs((ds) => [...ds, {
      key: `moi-${seq.current}`, hang_loai: "", hang_id: 0, ten: "",
      dang_giay: null, kho_rong: 0, kho_dai: 0, dvt: "", dvtKeHoach: "",
      sl_ke_hoach: 0, sl_yeu_cau: 0, slText: "", ly_do_chenh_lech: "", tuKeHoach: false,
    }]);
  }

  const lines = vtPayloadLines(dongs, loaiHieuLuc);
  // Chỉ chặn khi có thứ NÓI RA ĐƯỢC là thiếu — không bao giờ chặn vì "đoán là thiếu lý do"
  // (luật lý do thật nằm ở BE, và BE trả câu tiếng Việt cụ thể).
  // `moi`/`sua` (lần đầu) vẫn cho gửi TOÀN 0 khi công đoạn CÓ kế hoạch: đó chính là "tổ xác nhận
  // không cần cấp" (spec §5.3) — dòng kế hoạch vẫn nằm trong `lines` nên không bị chặn.
  const canTro = vtCanTro(dongs, lines, mode, loaiHieuLuc);
  const hopLe = (nhapLai || gioNhapHopLe(canLuc)) && canTro == null;

  async function luu() {
    if (nhapLai) {
      const okNl = await exec.nhapLaiVatTu(cv.id, {
        ghi_chu: ghiChu.trim() || null, lines: vtPayloadNhapLai(dongs),
      });
      if (okNl) onXong();
      return;
    }
    const body: SxVatTuDeNghiIn = { can_luc: canLuc, lines };
    // Sửa mà không tra ra lần nào ⇒ THOÁT, tuyệt đối không rơi sang nhánh tạo mới: đó là đẻ thêm
    // một lần đề nghị nữa (cộng dồn vào bản đối chiếu) thay vì sửa lần đang mở.
    if (mode === "sua" && lanSua == null) return;
    const ok = mode === "sua" && lanSua != null
      ? await exec.suaDeNghiVatTu(cv.id, lanSua.id, body)
      : await exec.deNghiVatTu(cv.id, body);
    if (ok) onXong();
  }

  const tieuDe = mode === "sua"
    ? `Sửa đề nghị${lanSua ? ` · Lần ${lanSua.lan_so}` : ""}`
    : mode === "bo_sung" ? "Yêu cầu bổ sung" : nhapLai ? "Nhập lại vật tư thừa" : "Yêu cầu mới";
  const soMatHang = lines.filter((l) => l.sl_yeu_cau > VT_EPS).length;

  // Cùng khuôn ngăn kéo "Yêu cầu mới" của màn Yêu cầu nhập xuất (`KhoDeNghiPage`): tổ trưởng xin
  // vật tư ở đây hay ở màn Kho cũng gặp một kiểu. PORTAL ra `body` vì `.thsx-panel--open` có
  // `transform` — render tại chỗ thì ngăn kéo bị nhốt trong khung drawer bàn tổ, không trượt từ mép
  // màn được. `zIndex` inline: `.rc-drawer__scrim` khai 60, thấp hơn chính drawer bàn tổ (61).
  return createPortal(
    <div className="rc-drawer__scrim" style={{ zIndex: 70 }}
      // Chỉ đóng khi nhấn VÀ thả đều trên nền: kéo bôi chữ trong ô rồi thả lệch ra ngoài không được
      // vứt mất những gì vừa gõ. `stopPropagation` vì sự kiện React đi xuyên portal, nổi về cây bàn tổ.
      onMouseDown={(e) => { nhanTrenNen.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        e.stopPropagation();
        if (nhanTrenNen.current && e.target === e.currentTarget && !busy) onHuy();
      }}>
      <aside ref={nganKeoRef} className="rc-drawer rc-drawer--wide" role="dialog" aria-modal="true"
        aria-label={`${nhapLai ? "Yêu cầu nhập kho" : "Yêu cầu cấp vật tư"} — ${tieuDe}`} tabIndex={-1}
        // Esc nuốt tại đây: trang nghe Esc ở `document` để đóng cả drawer bàn tổ, chỉ nhường phím
        // đã `defaultPrevented` (ô gợi ý mặt hàng đang xổ cũng tự nuốt Esc của nó).
        onKeyDown={(e) => {
          if (e.key !== "Escape" || e.defaultPrevented) return;
          e.preventDefault();
          if (!busy) onHuy();
        }}>
        <header className="rc-drawer__head">
          <div>
            <div className="rc-drawer__kicker">{nhapLai ? "Yêu cầu nhập kho" : "Yêu cầu cấp vật tư"}</div>
            <h2 className="rc-drawer__title">{tieuDe}</h2>
          </div>
          <button type="button" className="rc-drawer__x" onClick={onHuy} disabled={busy} aria-label="Đóng">
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="rc-drawer__body">
          <section className="rc-sec">
            <h3 className="rc-sec__title">Thông tin chung</h3>
            <div className="kho-info-grid">
              {nhapLai ? (
                <label className="kho-info-item">
                  <span className="kho-info-item__label">Ghi chú</span>
                  <input type="text" className="rc-input" maxLength={500} value={ghiChu} disabled={busy}
                    placeholder="Tuỳ chọn — vd. thừa do hỏng ít" onChange={(e) => setGhiChu(e.target.value)} />
                </label>
              ) : (
                <label className="kho-info-item">
                  <span className="kho-info-item__label">Giờ cần</span>
                  <ChonNgayGio className="rc-input" min={GIO_NHAP_MIN} max={GIO_NHAP_MAX} aria-label="Giờ cần"
                    value={canLuc} disabled={busy} onChange={(v) => setCanLuc(v)} />
                </label>
              )}
              {cv.nguon_ma && (
                <div className="kho-info-item">
                  <span className="kho-info-item__label">Cho lệnh</span>
                  <div className="kho-info-item__val">{cv.nguon_ma}</div>
                </div>
              )}
              <div className="kho-info-item">
                <span className="kho-info-item__label">Công đoạn</span>
                <div className="kho-info-item__val">{cv.ten_cong_doan}</div>
              </div>
            </div>
          </section>

          <section className="rc-sec">
            <h3 className="rc-sec__title">{nhapLai ? "Vật tư nhập lại kho" : "Vật tư yêu cầu"}</h3>
            <div className="kho-lines__wrap kho-lines-card">
              <table className="kho-lines thsx-vtdn">
                <thead className="kho-lines__head">
                  <tr>
                    <th style={{ width: 40, textAlign: "center" }}>STT</th>
                    <th style={{ minWidth: 180 }}>Vật tư</th>
                    {/* Bổ sung không có "kế hoạch" để so — nền của nó là số ĐÃ xin qua các lần trước. */}
                    {!nhapLai && (
                      <th className="kho-num" style={{ width: 120 }}>
                        {loaiHieuLuc === "bo_sung" ? "Đã yêu cầu" : "Kế hoạch"}
                      </th>
                    )}
                    <th style={{ width: 70, textAlign: "center" }}>ĐVT</th>
                    <th className="kho-num" style={{ width: 110 }}>{nhapLai ? "SL nhập lại" : "SL yêu cầu"}</th>
                    <th style={{ width: 56 }} aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {dongs.length === 0 && (
                    <tr>
                      <td colSpan={nhapLai ? 5 : 6} className="kho-lines__empty">
                        {nhapLai
                          ? "Thêm vật tư thừa tổ trả về kho — chọn mặt hàng, giấy thì chọn dạng và khổ."
                          : loaiHieuLuc === "bo_sung"
                          ? "Thêm đúng mặt hàng đang thiếu — đề nghị bổ sung là xin THÊM trên nền đã yêu cầu."
                          : "Công đoạn chưa có nhu cầu vật tư theo kế hoạch — thêm mặt hàng nếu tổ cần xin."}
                      </td>
                    </tr>
                  )}
                  {dongs.map((d, i) => {
                    const ly = nhapLai ? { hien: false, batBuoc: false } : vtCanLyDo(d, loaiHieuLuc);
                    const lk = luyKe.get(vtKhoa(d));
                    return (
                      <Fragment key={d.key}>
                        <tr>
                          <td className="kho-lines__code" style={{ textAlign: "center" }}>{i + 1}</td>
                          <td>
                            {d.tuKeHoach ? (
                              <>
                                <div className="kho-lines__name">{d.ten}</div>
                                {d.hang_loai === "giay" && (
                                  <div className="kho-lines__code">
                                    {nhanDangKho(d.dang_giay, d.kho_rong, d.kho_dai) || "chưa có khổ"}
                                  </div>
                                )}
                              </>
                            ) : (
                              <MaterialCombobox
                                token={token ?? ""} hangTen={d.ten || null} disabled={busy}
                                onPick={(m) => {
                                  // Ưu tiên đơn vị lần trước của CHÍNH mặt hàng này, chỉ rơi về đơn vị gốc
                                  // khi nó chưa từng được xin (xem `vtDvtLanTruoc`). KHÔNG gác thêm theo
                                  // `mode`: lần "moi" chưa có đề nghị nào nên hàm trả `null` và mọi thứ y
                                  // như cũ, còn lần "sua"/"bo_sung" thì bám lần trước mới là thứ đúng —
                                  // thêm điều kiện mode chỉ có thể làm dòng lật đơn vị trở lại.
                                  // Giấy: đơn vị đi theo DẠNG (tờ nguyên / đơn vị gốc của cuộn) — để trống,
                                  // chọn dạng xong ô ĐVT tự điền.
                                  const giay = m.hang_loai === "giay";
                                  const dv = giay ? "" : vtDvtLanTruoc(cap.cac_de_nghi, m.hang_loai, m.hang_id)
                                    ?? m.don_vi_goc ?? "";
                                  // Giấy mặc định dạng TỜ (spec 2026-10-01 §3.4): ô khổ hiện NGAY khi chọn
                                  // mã giấy, không đợi chọn dạng; đổi sang cuộn nếu cần.
                                  sua(d.key, {
                                    hang_loai: m.hang_loai, hang_id: m.hang_id, ten: m.ten,
                                    dang_giay: giay ? "to" : null, kho_rong: 0, kho_dai: 0,
                                    dvt: dv, dvtKeHoach: dv,
                                  });
                                }} />
                            )}
                            {vtGiayTuKhai(d) && (
                              <div className="kho-giay-kho">
                                <select className="rc-input" aria-label="Dạng giấy" disabled={busy}
                                  value={d.dang_giay ?? ""}
                                  onChange={(e) => {
                                    const dang = (e.target.value || null) as DangGiay | null;
                                    sua(d.key, {
                                      dang_giay: dang, dvt: "", dvtKeHoach: "",
                                      ...(dang === "cuon" ? { kho_dai: 0 } : {}),
                                    });
                                  }}>
                                  <option value="">Dạng…</option>
                                  {(Object.keys(DANG_GIAY_NHAN) as DangGiay[]).map((x) => (
                                    <option key={x} value={x}>{DANG_GIAY_NHAN[x]}</option>
                                  ))}
                                </select>
                                {d.dang_giay && (
                                  <>
                                    <DecimalInput className="rc-input kho-num" disabled={busy}
                                      value={d.kho_rong || null}
                                      onChange={(n) => sua(d.key, { kho_rong: n ?? 0 })}
                                      aria-label={d.dang_giay === "to" ? "Khổ giấy, cạnh thứ nhất (mm)" : "Khổ rộng cuộn (mm)"}
                                      placeholder={d.dang_giay === "to" ? "Rộng" : "Khổ rộng"} />
                                    {d.dang_giay === "to" && (
                                      <>
                                        <span aria-hidden="true">×</span>
                                        <DecimalInput className="rc-input kho-num" disabled={busy}
                                          value={d.kho_dai || null}
                                          onChange={(n) => sua(d.key, { kho_dai: n ?? 0 })}
                                          aria-label="Khổ giấy, cạnh thứ hai (mm)" placeholder="Dài" />
                                      </>
                                    )}
                                    <span className="kho-lines__code">mm</span>
                                  </>
                                )}
                              </div>
                            )}
                            {/* Giọng đi theo SỐ ĐANG XIN, không theo "có đơn vị hay không". Ở 0 thì dòng
                             *  này hợp lệ — BE nhận và miễn cả luật lý do, ô Lý do ngay dưới ghi "Tuỳ
                             *  chọn" — chữ ĐỎ ở đó là hai câu đọc ngược nhau. Có số dương mới là chặn
                             *  thật: `vtCanTro` đang tắt nút Gửi vì đúng dòng này, nên phải nói ra.
                             *  Không đóng đinh nguyên nhân vào "danh mục chưa khai": ô đơn vị còn trống
                             *  được vì snapshot của bước chốt trước lúc kỹ thuật khai, hoặc vì routing
                             *  chưa đủ để suy ra đơn vị đếm giấy — cùng lý do câu lỗi BE đã bỏ cách nói đó. */}
                            {vtThieuDonVi(d) && (d.sl_yeu_cau > VT_EPS ? (
                              <div className="kho-hint kho-hint--rust">
                                Chưa có đơn vị tính nên chưa xin được — nhờ kỹ thuật kiểm lại đơn vị, hoặc
                                để dòng này ở 0 rồi gửi những món còn lại.
                              </div>
                            ) : (
                              <div className="kho-hint">
                                Chưa có đơn vị tính — để ở 0 thì vẫn gửi được. Muốn xin món này thì nhờ
                                kỹ thuật kiểm lại đơn vị.
                              </div>
                            ))}
                          </td>
                          {/* Số nền mang ĐƠN VỊ CỦA NÓ ngay trong ô: tổ có thể khai bằng đơn vị khác kế
                              hoạch, cột ĐVT bên cạnh là đơn vị của số ĐANG XIN. */}
                          {!nhapLai && (
                            <td className="kho-num">
                              {loaiHieuLuc === "bo_sung"
                                ? (lk ? `${num(lk.sl_yeu_cau)} ${nhanDonVi(lk.dvt)}` : "—")
                                : (d.tuKeHoach ? `${num(d.sl_ke_hoach)} ${nhanDonVi(d.dvtKeHoach)}` : "—")}
                            </td>
                          )}
                          <td style={{ textAlign: "center" }}>
                            {vtGiayTuKhai(d) && d.dang_giay ? (
                              <DonViChonTheoHang token={token ?? ""} hangLoai="giay" hangId={d.hang_id}
                                dang={d.dang_giay} value={d.dvt} chiDoc disabled={busy}
                                onChange={(ma) => sua(d.key, { dvt: ma, dvtKeHoach: ma })} />
                            ) : (
                              <span className="badge-sem badge-sem--muted" style={{ fontSize: 12 }}>
                                {d.dvt ? nhanDonVi(d.dvt) : "—"}
                              </span>
                            )}
                          </td>
                          <td className="kho-num">
                            <input type="number" min={0} className="rc-input kho-num" inputMode="decimal"
                              value={d.slText} disabled={busy} aria-label={`Số lượng yêu cầu${d.ten ? ` — ${d.ten}` : ""}`}
                              onChange={(e) => sua(d.key, {
                                slText: e.target.value, sl_yeu_cau: Math.max(0, toNum(e.target.value)),
                              })}
                              // Rời ô thì chữ trong ô phải bằng ĐÚNG số sắp gửi. Gõ "-5" là ô hiện −5 mà
                              // payload gửi 0 — mà 0 có nghĩa nghiệp vụ hẳn hoi ("tổ xác nhận không cần
                              // cấp"), tức một dấu trừ gõ nhầm âm thầm đưa dòng kế hoạch về 0. Cùng lý do
                              // cho "1." bỏ dở, "1,5" dán kiểu Việt, hay ô xoá trắng: `<input type="number">`
                              // trả "" cho mọi giá trị chưa hợp lệ, nên số thật đã là 0 rồi.
                              onBlur={() => sua(d.key, { slText: String(d.sl_yeu_cau) })} />
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {/* Dòng KẾ HOẠCH không xoá được (lần đầu phải lưu đủ kế hoạch) — đường của nó
                                là "Về 0", một hành động có CHỦ Ý: "tổ xác nhận không cần cấp". */}
                            {d.tuKeHoach ? (
                              <button type="button" className="thsx-x-linkbtn" disabled={busy || d.sl_yeu_cau <= 0}
                                onClick={() => datSl(d.key, 0)}>Về 0</button>
                            ) : (
                              <button type="button" className="rc-bands__del" aria-label="Bỏ dòng" disabled={busy}
                                onClick={() => setDongs((ds) => ds.filter((x) => x.key !== d.key))}>
                                <Icon name="x" size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                        {ly.hien && (
                          <tr className="thsx-vtdn__lydo">
                            <td />
                            <td colSpan={5}>
                              <label className="thsx-vtdn__lydo-f">
                                <span className="kho-info-item__label">
                                  Lý do{ly.batBuoc && <span className="thsx-x-vt-req">*</span>}
                                </span>
                                <input type="text" className="rc-input" value={d.ly_do_chenh_lech} disabled={busy}
                                  onChange={(e) => sua(d.key, { ly_do_chenh_lech: e.target.value })}
                                  placeholder={ly.batBuoc ? "Bắt buộc — vì sao khác kế hoạch" : "Tuỳ chọn"} />
                              </label>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {/* Không cộng "Tổng SL" như màn Kho: các dòng ở đây khác đơn vị (kg mực, tờ giấy…),
                  cộng lại ra một con số vô nghĩa. */}
              <div className="kho-live-summary-bar">
                <span>{nhapLai ? "Đang nhập lại" : "Đang xin"} <strong>{soMatHang}</strong> mặt hàng</span>
              </div>
            </div>
            <button type="button" className="rc-bands__add" onClick={themDong} disabled={busy}>
              + Thêm dòng
            </button>
          </section>
        </div>

        <footer className="rc-drawer__foot">
          {/* Nút Gửi tắt thì câu lý do đứng NGAY cạnh nó, không nằm cuối bảng dài đã cuộn khuất. */}
          {canTro && <span className="kho-hint kho-hint--rust thsx-vtdn__cantro">{canTro}</span>}
          <Button variant="accent" onClick={luu} disabled={busy || !hopLe}>
            <Icon name={mode === "sua" ? "check" : "send"} size={13} />
            {mode === "sua" ? " Lưu thay đổi" : nhapLai ? " Gửi yêu cầu nhập kho" : " Gửi đề nghị"}
          </Button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

// ─────────────────────────── HỖ TRỢ CHÉO (§9) ─────────────────────────────
function HoTroSection({
  chiTiet, canAssign, busy, hoTroUngVien, ungVienHomNay, onMoChonNguoi, exec,
}: {
  chiTiet: SxWorkItemChiTiet; canAssign: boolean; busy: boolean;
  hoTroUngVien: SxHoTroUngVien[]; ungVienHomNay: string | null; onMoChonNguoi?: () => void;
  exec: ThsxExec;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const ht = chiTiet.ho_tro;

  return (
    <section className="thsx-psec thsx-x thsx-psec-card">
      <div className="thsx-psec__h">
        <span className="thsx-psec__title">
          <span className="thsx-psec__icon-badge thsx-psec__icon-badge--purple"><Icon name="users" size={13} /></span> Hỗ trợ chéo
        </span>
        {canAssign && (
          <Button variant="secondary" onClick={() => { onMoChonNguoi?.(); setFormOpen(true); }} disabled={busy} aria-haspopup="dialog">
            <Icon name="plus" size={13} /> Đề xuất hỗ trợ
          </Button>
        )}
      </div>

      {formOpen && (
        <HoTroForm hoTroUngVien={hoTroUngVien} homNay={ungVienHomNay} busy={busy}
          onXong={() => setFormOpen(false)} exec={exec} />
      )}

      {ht.length === 0 ? (
        <div className="thsx-empty-state-card">
          <div className="thsx-empty-state-ic-wrap"><Icon name="users" size={16} /></div>
          <div className="thsx-empty-state-content">
            <span className="thsx-empty-state-title">Chưa có thoả thuận hỗ trợ nào.</span>
            <span className="thsx-empty-state-sub">Tạo đề xuất hỗ trợ để điều chuyển nhân lực từ tổ khác.</span>
          </div>
        </div>
      ) : (
        <ul className="thsx-x-list">
          {ht.map((h) => (
            <HoTroRow key={h.id} h={h} busy={busy} exec={exec} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HoTroForm({
  hoTroUngVien, homNay, busy, onXong, exec,
}: {
  hoTroUngVien: SxHoTroUngVien[]; homNay: string | null; busy: boolean; onXong: () => void; exec: ThsxExec;
}) {
  const [toLoc, setToLoc] = useState<number | null>(null);
  const [empId, setEmpId] = useState<number | null>(null);
  const [ngayLv, setNgayLv] = useState(todayYmd());
  const [moTa, setMoTa] = useState("");
  // Tình trạng theo NGÀY LÀM đang chọn: đổi ngày là người nghỉ phép hôm đó tắt đi / bật lại.
  // Đang chạy việc ở tổ mình chỉ cảnh báo — thỏa thuận tính theo ngày, không theo giờ.
  const ttTheoId = new Map(hoTroUngVien.map((h) => [h.id, tinhTrangChon(h, { ngay: ngayLv, homNay })]));
  const ttChon = empId != null ? ttTheoId.get(empId) : undefined;
  const tenChon = empId != null ? hoTroUngVien.find((h) => h.id === empId)?.full_name : undefined;
  const hopLe = empId != null && !ttChon?.chan && !!ngayLv;

  // Ứng viên là thợ của MỌI tổ SX khác — hàng chục người, nên ô chọn phải tìm được (gõ không dấu,
  // mảnh tên, mã NV hoặc tên tổ) và lọc theo tổ. Nhóm theo tổ để mắt biết đang ở khúc nào.
  const theoTo = new Map<number | null, { ten: string; n: number }>();
  for (const h of hoTroUngVien) {
    const cur = theoTo.get(h.to_id);
    if (cur) cur.n += 1;
    else theoTo.set(h.to_id, { ten: h.to_ten ?? "Chưa có tổ", n: 1 });
  }
  const toOpts: SelectOption<number | null>[] = [
    { value: null, label: "Tất cả tổ", hint: String(hoTroUngVien.length) },
    ...[...theoTo.entries()]
      .sort((a, b) => a[1].ten.localeCompare(b[1].ten, "vi"))
      .map(([id, t]) => ({ value: id, label: t.ten, hint: String(t.n) })),
  ];
  // Trong mỗi tổ: rảnh hẳn → có tên ở việc chưa xong → đang chạy việc → không đi làm ngày đó (tắt).
  const thoOpts: SelectOption<number | null>[] = hoTroUngVien
    .filter((h) => toLoc == null || h.to_id === toLoc)
    .map((h) => ({ h, to: h.to_ten ?? "Chưa có tổ", t: ttTheoId.get(h.id)! }))
    .sort((a, b) => a.to.localeCompare(b.to, "vi") || a.t.hang - b.t.hang
      || a.h.full_name.localeCompare(b.h.full_name, "vi"))
    .map(({ h, to, t }) => ({
      value: h.id, label: h.full_name, hint: h.code ?? undefined,
      sub: [t.tomTat, t.ghiChu].filter(Boolean).join(" · "), subClassName: `thsx-x-sub--${t.muc}`,
      disabled: !!t.chan,
      group: toLoc == null ? to : undefined, search: to,
    }));

  function chonTo(id: number | null) {
    setToLoc(id);
    // Thợ đang chọn không thuộc tổ vừa lọc ⇒ bỏ chọn, khỏi gửi nhầm người đã khuất khỏi danh sách.
    if (id != null && empId != null && hoTroUngVien.find((h) => h.id === empId)?.to_id !== id) setEmpId(null);
  }

  async function luu() {
    const body: SxHoTroDeXuatIn = {
      employee_id: empId!, ngay_lam_viec: ngayLv,
      mo_ta: moTa.trim() || null,
    };
    if (await exec.deXuatHoTro(body)) onXong();
  }

  return (
    <ThsxModal
      title="Đề xuất hỗ trợ chéo" icon="users" busy={busy} onClose={onXong}
      footer={<>
        <Button variant="ghost" onClick={onXong} disabled={busy}>Huỷ</Button>
        <Button variant="accent" onClick={luu} disabled={busy || !hopLe}>
          <Icon name="check" size={13} /> Đề xuất
        </Button>
      </>}
    >
      {/* KHÔNG bọc bằng <Field> (thẻ <label>): nhãn bọc nút mở danh sách thì bấm chữ nhãn cũng
          bật danh sách, và ô tìm trong popover không gắn được với nhãn. */}
      <div className="thsx-x-grid-to">
        <div className="thsx-x-fld">
          <span className="thsx-x-fld__l">Tổ</span>
          <Select portal searchable value={toLoc} options={toOpts} onChange={chonTo} ariaLabel="Lọc theo tổ"
            searchPlaceholder="Gõ tên tổ…" className="thsx-x-seltrig" />
        </div>
        <div className="thsx-x-fld">
          <span className="thsx-x-fld__l">Thợ hỗ trợ (từ tổ khác)</span>
          <Select portal searchable value={empId} options={thoOpts} onChange={setEmpId}
            placeholder="— Chọn thợ —" searchPlaceholder="Gõ tên, mã NV hoặc tổ…" ariaLabel="Thợ hỗ trợ"
            className="thsx-x-seltrig" listClassName="thsx-x-sel-tt" />
        </div>
      </div>
      {/* Ô "Tỷ lệ (%)" GỠ 18/09/2026 (mg `0322`) — tỷ lệ chỉ để chia sản lượng, lớp chia đã gỡ. */}
      <Field label="Ngày làm">
        <ChonNgay className="thsx-x-in" aria-label="Ngày làm" value={ngayLv} onChange={(v) => setNgayLv(v)} />
      </Field>
      <Field label="Mô tả">
        <input type="text" className="thsx-x-in" value={moTa} onChange={(e) => setMoTa(e.target.value)} placeholder="Nội dung hỗ trợ (tuỳ chọn)" />
      </Field>
      {ttChon?.chan && (
        <p className="thsx-x-hint thsx-x-hint--err"><b>{tenChon}</b>: {ttChon.chan} — không đề xuất hỗ trợ được.</p>
      )}
      {ttChon?.canhBao && (
        <p className="thsx-x-hint thsx-x-hint--canh">
          <b>{tenChon}</b> {ttChon.canhBao.charAt(0).toLowerCase() + ttChon.canhBao.slice(1)} — hỏi tổ gốc trước khi đề xuất.
        </p>
      )}
      {hoTroUngVien.length === 0 && <p className="thsx-x-hint">Không có thợ tổ khác đang làm để đề xuất.</p>}
    </ThsxModal>
  );
}

function HoTroRow({
  h, busy, exec,
}: {
  h: SxHoTro; busy: boolean; exec: ThsxExec;
}) {
  const [huyOpen, setHuyOpen] = useState(false);
  const [lyDo, setLyDo] = useState("");
  const st = HT_TT[h.trang_thai] ?? { txt: h.trang_thai, cls: "thsx-x-pill--wait" };
  const chuaChot = h.trang_thai === "pending_both";

  return (
    <li className="thsx-x-ht">
      <div className="thsx-x-ht__main">
        <span className="thsx-x-ht__nm">{h.ho_ten}</span>
        <span className="thsx-x-ht__flow">{h.to_goc_ten ?? "?"} → {h.to_thuc_hien_ten ?? "?"}</span>
        <span className="thsx-x-item__spacer" />
        <span className={`thsx-x-pill ${st.cls}`}>{st.txt}</span>
      </div>
      <div className="thsx-x-ht__meta">
        <span className="thsx-num">{ngay(h.ngay_lam_viec)}</span>
        {chuaChot && (
          <span className="thsx-x-ht__flags">
            <span className={h.da_xac_nhan_goc ? "is-ok" : ""}>tổ gốc {h.da_xac_nhan_goc ? "✓" : "…"}</span>
            <span className={h.da_xac_nhan_thuc_hien ? "is-ok" : ""}>tổ làm {h.da_xac_nhan_thuc_hien ? "✓" : "…"}</span>
          </span>
        )}
        {h.mo_ta && <span className="thsx-x-ht__mo">{h.mo_ta}</span>}
      </div>
      {/* Nút theo cờ máy chủ tính cho CHÍNH người xem: bên mình đã đứng tên thì thôi hiện Xác nhận
          (bấm lại không đổi gì); huỷ khi đứng được cho một trong hai tổ. */}
      {(h.co_the_xac_nhan || h.co_the_huy) && (
        <div className="thsx-x-act thsx-x-act--row">
          {h.co_the_xac_nhan && (
            <Button variant="accent" onClick={() => void exec.xacNhanHoTro(h.id, h.version)} disabled={busy}>
              <Icon name="check" size={13} /> Xác nhận
            </Button>
          )}
          {h.co_the_huy && (
            <Button variant="ghost" onClick={() => setHuyOpen((o) => !o)} disabled={busy}>
              <Icon name="ban" size={12} /> Huỷ
            </Button>
          )}
        </div>
      )}
      {huyOpen && (
        <div className="thsx-x-form thsx-x-form--sub">
          <Field label="Lý do huỷ">
            <input type="text" className="thsx-x-in" value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="Tuỳ chọn" autoFocus />
          </Field>
          <div className="thsx-x-act">
            <Button variant="ghost" onClick={() => setHuyOpen(false)} disabled={busy}>Đóng</Button>
            <Button variant="secondary" disabled={busy}
              onClick={async () => { if (await exec.huyHoTro(h.id, lyDo.trim(), h.version)) setHuyOpen(false); }}>
              <Icon name="ban" size={13} /> Huỷ hỗ trợ
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

// ============================ nguyên liệu dùng chung ========================
/** Hộp thoại NỔI cho biểu mẫu mở từ nút ở đầu khối (Ghi mẻ · Đề xuất giao · Đề xuất hỗ trợ) — một
 *  khung chung để các khối nói cùng một kiểu. Yêu cầu cấp vật tư KHÔNG dùng khung này: nó mở thành
 *  ngăn kéo cùng khuôn màn Kho (xem `VatTuDeNghiForm`). Render TẠI CHỖ, không portal: lớp phủ
 *  `position: fixed` bám khung drawer bàn tổ (drawer có `transform`), biểu mẫu giữ nguyên các lớp
 *  `.thsx-x-*` của nó. Thân cuộn riêng, chân nút đứng yên.
 *
 *  Esc bắt ở CHÍNH hộp thoại rồi `preventDefault`: trang (`ThucHienSxPage`) nghe Esc ở `document`
 *  để đóng cả drawer và chỉ nhường phím đã bị nuốt. Nghe ở `window` như bản đầu thì drawer đóng
 *  TRƯỚC (document nổi bọt trước window), mất luôn việc đang mở. Ô gợi ý mặt hàng đang xổ danh
 *  sách tự nuốt Esc của nó, nên Esc đầu chỉ gập danh sách.
 *
 *  Bấm ra ngoài thì đóng, nhưng chỉ khi cả nhấn lẫn thả đều trên lớp phủ — kéo bôi chữ trong ô rồi
 *  thả chuột lệch ra ngoài không được xoá mất những gì vừa gõ. */
function ThsxModal({
  title, icon, badge, busy, onClose, footer, children,
}: {
  title: string; icon: IconName; badge?: ReactNode; busy: boolean;
  onClose: () => void; footer: ReactNode; children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const nhanTrenLopPhu = useRef(false);
  // Đưa focus vào hộp thoại để Esc tới được `onKeyDown` bên dưới ngay cả khi chưa bấm ô nào.
  useEffect(() => { dialogRef.current?.focus({ preventScroll: true }); }, []);

  return (
    <div className="thsx-batch-modal-overlay"
      onMouseDown={(e) => { nhanTrenLopPhu.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (nhanTrenLopPhu.current && e.target === e.currentTarget && !busy) onClose();
      }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        className="thsx-batch-modal-dialog thsx-glass-batch-card thsx-x-form"
        onKeyDown={(e) => {
          if (e.key !== "Escape" || e.defaultPrevented) return;
          e.preventDefault();
          if (!busy) onClose();
        }}>
        <div className="thsx-glass-batch-h">
          <div className="thsx-glass-batch-h-title">
            <Icon name={icon} size={14} className="thsx-pulse-icon" />
            <span>{title}</span>
          </div>
          <div className="thsx-batch-modal-h-right">
            {badge && <span className="thsx-glass-unit-badge">{badge}</span>}
            <button type="button" className="thsx-batch-modal-close" aria-label="Đóng" disabled={busy} onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="thsx-batch-modal-body">{children}</div>
        <div className="thsx-glass-form-ftr thsx-x-act">{footer}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="thsx-x-fld">
      <span className="thsx-x-fld__l">{label}</span>
      {children}
    </label>
  );
}
