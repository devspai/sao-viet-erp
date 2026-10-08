/** Màn PHIẾU THU (đặc tả PT-1 … PT-4, A.16 – A.18) — khuôn lưới danh sách chung `lds-*` (08/10/2026),
 *  đối xứng màn Phiếu chi.
 *
 *  Khuôn trang: đầu trang (tiêu đề + nút "Lập phiếu thu") → thẻ lọc (hàng lọc nhanh trạng thái có số;
 *  ô tìm, thanh lọc chung `ThanhLoc`: kỳ theo Ngày tạo / Ngày thu + điều kiện; nút Cột) → lưới kiểu
 *  bảng tính + dòng Cộng + chân phân trang. Bấm dòng mở ngăn chi tiết kiểu 3 bên phải.
 *  Mọi lọc chạy ở MÁY CHỦ. Số trên hàng lọc nhanh (`the_loc`) tính theo kỳ + bộ lọc, KHÔNG theo mục
 *  đang chọn. Mục "Chờ thu" chỉ hiện khi còn phiếu CŨ chờ thu (phiếu mới lập là đã thu).
 *
 *  Thu cọc lập ở Đơn hàng bán, thu hoá đơn lập ở Công nợ phải thu; ở đây chỉ lập khoản thu khác.
 */
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, api, type PaymentReceiptRow, type PaymentVoucherRow } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { useCan } from "../../../auth/permissions";
import type { NavigateFn } from "../../../components/AppShell";
import { Button } from "../../../components/Button";
import {
  ChonCot, LocNhanhTrangThai, OTim, useCotAn, useThuTuCot, xepCot, type MucLocNhanh,
} from "../../../components/LuoiDs";
import { GoiYPhim } from "../shared/BangPhieu";
import { soPhieuCong } from "../shared/PhieuGon";
import { useTrangPhieu, type CauHinhTrangPhieu } from "../shared/trangPhieu";
import { ReceiptsDrawer } from "./components/ReceiptsDrawer";
import { COT_PHIEU_THU, ReceiptsTable } from "./components/ReceiptsTable";
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

  // Nối dây trang sổ (kỳ, thẻ, lọc, URL, tải + cùng kỳ, SSE, liên thông, ngăn): khuôn chung. Ngăn tự
  // nạp bản mới nhất của phiếu đang mở (route đọc MỘT phiếu thu).
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
  };
  const sp = useTrangPhieu(cauHinh, token, eventTick, focusQuery);
  const { the, setThe, loc, rows, mo, setMo, load, soThe } = sp;

  // Tab "Chờ thu" chỉ có khi còn phiếu cũ chờ thu: mở từ link `the=cho` lúc đã hết thì về Tất cả.
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

  const muc = useMemo<MucLocNhanh[]>(() => [
    { key: "tat_ca", label: "Tất cả", count: soThe?.tat_ca },
    { key: "xong", label: "Đã thu", mau: "la", count: soThe?.xong },
    // Chỉ phiếu CŨ còn chờ thu; hết thì ẩn (trừ khi đang đứng ở mục đó — effect trên tự về Tất cả).
    ...(!((soThe?.cho ?? 0) > 0) && the !== "cho"
      ? []
      : [{ key: "cho", label: "Chờ thu", mau: "cam" as const, count: soThe?.cho }]),
    { key: "thieu", label: "Thiếu chứng từ gốc", mau: "vang", count: soThe?.thieu_chung_tu },
    { key: "da_huy", label: "Đã hủy", mau: "xam", count: soThe?.da_huy },
  ], [soThe, the]);
  // Trạng thái trong nút Lọc = các mục đang hiện của hàng lọc nhanh (đọc/ghi thẳng mục đang chọn).
  const dieuKien = useMemo(
    () => [
      dkTrangThaiPhieu({
        muc: muc.map((m) => ({ id: m.key, nhan: m.label })),
        n: soThe, dang: the, dat: (id) => setThe(id as TheLocPT),
      }),
      ...dieuKienPhieu(CAU_HINH_LOC_PT, sp.taiKhoan),
    ],
    [muc, soThe, the, setThe, sp.taiKhoan],
  );
  // Dòng Cộng: số phiếu khớp với tổng tiền máy chủ cộng (có tính tab + ô Chứng từ).
  const soXong = soPhieuCong({ the, chungTu: loc.chung_tu, n: soThe, tong: sp.tong });
  const [cotAn, setCotAn] = useCotAn(MAN);
  const [thuTu, setThuTu] = useThuTuCot(MAN);
  const cotHien = xepCot(COT_PHIEU_THU, thuTu).filter((c) => !cotAn.has(c.key));

  return (
    <main className="kt-trang lds">
      <header className="lds-dau">
        <h1 className="lds-dau__ten">Phiếu thu</h1>
        <div className="lds-dau__nut">
          {coLap && (
            <Button variant="accent" onClick={() => setLapKhac(true)}>
              <Plus size={15} aria-hidden="true" /> Lập phiếu thu
            </Button>
          )}
        </div>
      </header>
      {loiMo && <p className="kt-o__loi" role="alert">{loiMo}</p>}

      <section className="lds-loc">
        <LocNhanhTrangThai muc={muc} dang={the} onChon={(k) => setThe(k as TheLocPT)} />
        <div className="lds-loc__thanh tl-thanh" role="search">
          <OTim value={sp.tim} onChange={sp.setTim} placeholder="Tìm số phiếu, người nộp, số hoá đơn"
            ariaLabel="Tìm phiếu thu" />
          <ThanhLoc ky={sp.ky} moc={MOC_PT} onKy={sp.setKy} dieuKien={dieuKien} loc={loc} onLoc={sp.setLoc} />
          <ChonCot cot={COT_PHIEU_THU} an={cotAn} onAn={setCotAn} thuTu={thuTu} onThuTu={setThuTu} />
        </div>
      </section>

      <ReceiptsTable
        cot={cotHien}
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
        tongTien={sp.tongTien}
        soXong={soXong}
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
