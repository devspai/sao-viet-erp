/** Màn PHIẾU THU (đặc tả PT-1 … PT-4, A.16 – A.18) — đối xứng màn Phiếu chi, cùng bộ khung chung kế toán.
 *
 *  Khuôn trang: đầu trang (tiêu đề + một câu + nút rust) → hàng thẻ lọc → thanh lọc (ô tìm, thanh lọc
 *  chung `ThanhLoc`: kỳ theo Ngày tạo / Ngày thu + điều kiện, "n phiếu") → bảng + chân phân trang. Bấm dòng mở ngăn chi tiết bên phải.
 *  Mọi lọc chạy ở MÁY CHỦ; kỳ lọc theo NGÀY THU. Số trên thẻ lọc (`the_loc`) tính theo kỳ + bộ lọc,
 *  KHÔNG theo thẻ đang chọn. Thẻ "Chờ thu" chỉ hiện khi còn phiếu CŨ chờ thu (phiếu mới lập là đã thu).
 *
 *  Thu cọc lập ở Đơn hàng bán, thu hoá đơn lập ở Công nợ phải thu; ở đây chỉ lập khoản thu khác.
 */
import { Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, api, type PaymentReceiptRow, type PaymentVoucherRow } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { useCan } from "../../../auth/permissions";
import type { NavigateFn } from "../../../components/AppShell";
import { GoiYPhim } from "../shared/BangPhieu";
import { vietSo } from "../shared/dinhDang";
import { TheLoc, type TheLocMuc } from "../shared/TheLoc";
import { theLocSo, useTrangPhieu, type CauHinhTrangPhieu } from "../shared/trangPhieu";
import { ReceiptsDrawer } from "./components/ReceiptsDrawer";
import { ReceiptsTable } from "./components/ReceiptsTable";
import { OtherReceiptDialog } from "./modals/OtherReceiptDialog";
import { PaymentReceiptDialog } from "./PaymentReceiptDialog";
import { PAGE_SIZE } from "./shared/constants";
import {
  CAU_HINH_LOC_PT,
  LOC_TRONG,
  MOC_PT,
  dangLoc,
  locLenUrl,
  locTuUrl,
  thamSoLoc,
  thamSoTai,
  type LocPT,
  type TheLocPT,
} from "./shared/loc";
import { dieuKienPhieu, dkTrangThaiPhieu } from "../shared/locPhieu";
import { ThanhLoc } from "../../thanh-loc/ThanhLoc";
import "../ke-toan.css";

/** Mã màn — khoá nhớ kỳ và dấu `man` trên URL (đặc tả A.18). */
const MAN = "ke-toan-phieu-thu";

export function PaymentReceiptsPage({
  navigate,
  eventTick = 0,
  focusQuery = null,
}: {
  navigate: NavigateFn;
  eventTick?: number;
  /** Liên thông từ Phiếu chi / Đơn hàng bán / Công nợ phải thu: điền sẵn ô tìm (mã phiếu). */
  focusQuery?: string | null;
}) {
  const { token } = useAuth();
  const can = useCan();
  // Khoá RIÊNG của màn Phiếu thu. `create` = LẬP/SỬA phiếu + gán chứng từ.
  const coLap = can("phieu_thu", "create");
  const coXacNhan = can("phieu_thu", "manage_status");
  const coHuy = can("phieu_thu", "cancel");
  const coIn = can("phieu_thu", "export");
  const coXemTaiKhoan = can("tk_ngan_hang", "read");
  // Link sang màn khác — theo ô Xem của CHÍNH màn đó, không mượn khoá.
  const coXemCongNo = can("cong_no_phai_thu", "read");
  const coXemDonBan = can("don_hang_ban", "read");
  const coXemPhieuChi = can("phieu_chi", "read");

  const [loiMo, setLoiMo] = useState<string | null>(null);
  const [lapKhac, setLapKhac] = useState(false);
  const [sua, setSua] = useState<{ voucher: PaymentVoucherRow; receipt: PaymentReceiptRow } | null>(null);

  // Nối dây trang sổ (kỳ, thẻ, lọc, URL, tải + cùng kỳ, SSE, liên thông, ngăn): khuôn chung. Không có
  // endpoint đọc MỘT phiếu thu ⇒ ngăn đang mở nhận bản mới của dòng sau mỗi lần tải.
  const cauHinh: CauHinhTrangPhieu<PaymentReceiptRow, TheLocPT, LocPT> = {
    man: MAN,
    moc: MOC_PT,
    locTuUrl,
    locLenUrl,
    locTrong: LOC_TRONG,
    thamSoLoc,
    thamSoTai,
    goiDanhSach: (t, p) => api.accounting.receipts(t, p),
    chuLoi: "Không tải được danh sách phiếu thu.",
    coTrang: PAGE_SIZE,
    coXemTaiKhoan,
    mucDichTaiKhoan: "receive",
    moTheoBang: true,
  };
  const sp = useTrangPhieu(cauHinh, token, eventTick, focusQuery);
  const { the, setThe, loc, rows, mo, setMo, load, soThe, soTheCung } = sp;

  // Thẻ "Chờ thu" chỉ có khi còn phiếu cũ chờ thu: mở từ link `the=cho` lúc đã hết thì về Tất cả.
  useEffect(() => {
    if (the === "cho" && soThe && soThe.cho === 0) setThe("tat_ca");
  }, [the, soThe, setThe]);

  // Lỗi 11: "Thu hoá đơn" mở Công nợ phải thu, ngăn của đúng khách — mã khách nằm ở hoá đơn bán.
  const moCongNoCuaPhieu = useCallback(
    async (row: PaymentReceiptRow) => {
      let khach = { id: null as number | null, name: row.customer_name || row.payer_name };
      if (token && row.order_id != null && row.sales_invoice_id != null) {
        try {
          const r = await api.accounting.salesInvoices(token, row.order_id);
          const hd = r.items.find((h) => h.id === row.sales_invoice_id);
          if (hd) khach = { id: hd.customer_id, name: hd.customer_name };
        } catch {
          // Không đọc được hoá đơn: vẫn mở Công nợ phải thu, tìm theo tên khách.
        }
      }
      navigate("ke-toan-cong-no-phai-thu", { focusReceivableCustomer: khach });
    },
    [token, navigate],
  );

  const moNguon = useCallback(
    (row: PaymentReceiptRow): (() => void) | undefined => {
      if (row.source_type === "sales_invoice" && coXemCongNo) return () => void moCongNoCuaPhieu(row);
      if (row.source_type === "order_deposit" && coXemDonBan && row.order_id != null) {
        const id = row.order_id;
        return () => navigate("don-hang-ban", { openOrderId: id });
      }
      if (row.source_type === "purchase_refund" && coXemPhieuChi && row.payment_voucher_code) {
        const ma = row.payment_voucher_code;
        return () => navigate("ke-toan-phieu-chi", { focusVoucherQuery: ma });
      }
      return undefined;
    },
    [coXemCongNo, coXemDonBan, coXemPhieuChi, moCongNoCuaPhieu, navigate],
  );

  // "Sửa" phiếu cũ chờ thu từ phiếu chi (PT-4): cần phiếu chi gốc để tính "Còn được thu".
  async function moSua(row: PaymentReceiptRow) {
    if (!token || row.payment_voucher_id == null) return;
    setLoiMo(null);
    try {
      const voucher = await api.accounting.voucher(token, row.payment_voucher_id);
      setMo(null);
      setSua({ voucher, receipt: row });
    } catch (e) {
      setLoiMo(e instanceof ApiError ? e.message : "Không tải được phiếu chi gốc.");
    }
  }

  const muc = useMemo<TheLocMuc[]>(() => {
    const chung = theLocSo(soThe, soTheCung, { nhanXong: "Đã thu", phuThieu: "chưa có báo có hoặc biên nhận" });
    const ds = [chung.tatCa, chung.xong, chung.thieu];
    if (soThe && soThe.cho > 0) {
      ds.push({ id: "cho", nhan: "Chờ thu", cham: "amber", so: vietSo(soThe.cho), phu: "phiếu cũ chưa xác nhận" });
    }
    ds.push(chung.daHuy);
    return ds;
  }, [soThe, soTheCung]);
  // Trạng thái trong nút Lọc = hàng thẻ lọc (đọc/ghi thẳng thẻ đang chọn).
  const dieuKien = useMemo(
    () => [
      dkTrangThaiPhieu({ muc, n: soThe, dang: the, dat: (id) => setThe(id as TheLocPT) }),
      ...dieuKienPhieu(CAU_HINH_LOC_PT, sp.taiKhoan),
    ],
    [muc, soThe, the, setThe, sp.taiKhoan],
  );

  return (
    <main className="kt-trang">
      <header className="kt-ph">
        <div>
          <h1>Phiếu thu</h1>
          <p>Sổ tiền vào. Thu cọc lập ở Đơn hàng bán, thu hoá đơn lập ở Công nợ phải thu.</p>
        </div>
        {coLap && (
          <div className="kt-ph__nut">
            <button type="button" className="kt-btn kt-btn--chinh" onClick={() => setLapKhac(true)}>
              <Plus size={16} aria-hidden="true" />
              Lập phiếu thu
            </button>
          </div>
        )}
      </header>

      <TheLoc muc={muc} dangChon={the} onChon={(id) => setThe(id as TheLocPT)} />

      <div className="kt-tb tl-thanh">
        <label className="kt-tim">
          <Search size={16} aria-hidden="true" />
          <input aria-label="Tìm phiếu thu" placeholder="Tìm mã phiếu, người nộp, số hoá đơn, mã đơn bán" value={sp.tim}
            onChange={(e) => sp.setTim(e.target.value)} />
        </label>
        <ThanhLoc ky={sp.ky} moc={MOC_PT} onKy={sp.setKy} dieuKien={dieuKien} loc={loc} onLoc={sp.setLoc} />
        <span className="kt-tb__dem">{`${vietSo(sp.tong)} phiếu`}</span>
      </div>
      {loiMo && <p className="kt-o__loi" role="alert">{loiMo}</p>}
      <ReceiptsTable
        rows={rows}
        loading={sp.loading}
        loi={sp.loi}
        onTaiLai={load}
        dangXem={mo?.id ?? null}
        onMo={(id) => setMo(rows.find((r) => r.id === id) ?? null)}
        coLoc={dangLoc(the, loc, sp.timTre)}
        onBoLoc={sp.boLoc}
        onLap={coLap ? () => setLapKhac(true) : undefined}
        trang={sp.page}
        size={sp.size}
        tong={sp.tong}
        onTrang={sp.datTrang}
        onSize={sp.setSize}
        moNguon={moNguon}
      />
      <GoiYPhim />

      {mo && (
        <ReceiptsDrawer
          dau={mo}
          eventTick={eventTick}
          quyen={{ lap: coLap, huy: coHuy, xacNhan: coXacNhan, in: coIn, sua: coLap }}
          len={sp.len}
          xuong={sp.xuong}
          onDong={() => setMo(null)}
          onDoi={load}
          onSua={(row) => void moSua(row)}
          onMoNguon={moNguon}
          onMoDonBan={coXemDonBan ? (orderId) => navigate("don-hang-ban", { openOrderId: orderId }) : undefined}
          onMoPhieuChi={coXemPhieuChi ? (code) => navigate("ke-toan-phieu-chi", { focusVoucherQuery: code }) : undefined}
          onMoCongNo={coXemCongNo ? (khach) => navigate("ke-toan-cong-no-phai-thu", { focusReceivableCustomer: khach }) : undefined}
        />
      )}
      {lapKhac && (
        <OtherReceiptDialog
          onClose={() => setLapKhac(false)}
          onMoTaiKhoan={() => navigate("ke-toan-tai-khoan-ngan-hang")}
          onSaved={(saved) => {
            setLapKhac(false);
            setMo(saved);
            load();
          }}
        />
      )}
      {sua && (
        <PaymentReceiptDialog
          key={sua.receipt.id}
          voucher={sua.voucher}
          receipt={sua.receipt}
          onClose={() => setSua(null)}
          onSaved={(saved) => {
            setSua(null);
            setMo(saved);
            load();
          }}
        />
      )}
    </main>
  );
}
