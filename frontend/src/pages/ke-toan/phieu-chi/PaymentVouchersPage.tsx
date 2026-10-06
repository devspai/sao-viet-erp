/** Màn PHIẾU CHI (đặc tả PC-1 … PC-6, A.16 – A.18) — màn đầu tiên dựng trên bộ khung chung kế toán.
 *
 *  Khuôn trang: đầu trang (tiêu đề + một câu + nút rust) → hàng thẻ lọc → thanh lọc (ô tìm, thanh lọc
 *  chung `ThanhLoc`: kỳ theo Ngày tạo / Ngày chi + điều kiện, "n phiếu") → bảng + chân phân trang. Bấm dòng mở ngăn chi tiết bên phải.
 *  Mọi lọc chạy ở MÁY CHỦ; số trên thẻ lọc (`the_loc`) tính theo kỳ + bộ lọc, KHÔNG theo thẻ đang chọn.
 *
 *  ⚠️ TIỀN THẬT: lập phiếu chi = tiền đã rời két, không sửa được — sai thì hủy (có lý do) rồi lập lại.
 */
import { Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, api, type GiaCongChoChi, type PaymentVoucherRow } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { useCan } from "../../../auth/permissions";
import type { NavigateFn } from "../../../components/AppShell";
import { VOUCHER_PAGE_LABEL } from "../../../constants/features";
import { GoiYPhim } from "../shared/BangPhieu";
import { vietSo } from "../shared/dinhDang";
import { TheLoc, type TheLocMuc } from "../shared/TheLoc";
import { theLocSo, useTrangPhieu, type CauHinhTrangPhieu } from "../shared/trangPhieu";
import { HangChoGiaCong } from "./components/HangChoGiaCong";
import { VouchersDrawer } from "./components/VouchersDrawer";
import { VouchersTable } from "./components/VouchersTable";
import { LapPhieuChiGiaCongModal } from "./modals/LapPhieuChiGiaCongModal";
import { StandaloneVoucherDialog } from "./modals/StandaloneVoucherDialog";
import { PAGE_SIZE } from "./shared/list-constants";
import {
  CAU_HINH_LOC_PC,
  LOC_TRONG,
  MOC_PC,
  dangLoc,
  locLenUrl,
  locTuUrl,
  thamSoLoc,
  thamSoTai,
  type LocPC,
  type TheLocPC,
} from "./shared/loc";
import { dieuKienPhieu, dkTrangThaiPhieu } from "../shared/locPhieu";
import { ThanhLoc } from "../../thanh-loc/ThanhLoc";
import "../ke-toan.css";

/** Mã màn — khoá nhớ kỳ và dấu `man` trên URL (đặc tả A.18). */
const MAN = "ke-toan-phieu-chi";

export function PaymentVouchersPage({
  navigate,
  eventTick = 0,
  focusQuery = null,
}: {
  navigate: NavigateFn;
  eventTick?: number;
  /** Liên thông từ Phiếu thu / Tạm ứng: điền sẵn ô tìm (mã phiếu chi). */
  focusQuery?: string | null;
}) {
  const { token } = useAuth();
  const can = useCan();
  // Khoá RIÊNG của màn Phiếu chi. `create` = LẬP phiếu + gán chứng từ.
  const coLap = can("phieu_chi", "create");
  const coHuy = can("phieu_chi", "cancel");
  const coIn = can("phieu_chi", "export");
  // Mở đơn mua / đọc số đợt giao cần ô Xem của màn Đơn mua hàng (Kế toán) — không mượn khoá khác.
  const coXemDonMua = can("ke_toan", "read");
  const coXemTaiKhoan = can("tk_ngan_hang", "read");
  // Link mã yêu cầu mua nguồn trong ngăn — theo ô Xem của CHÍNH màn Yêu cầu mua hàng.
  const coXemYeuCau = can("yeu_cau_mua_hang", "read");

  const [gc, setGc] = useState<GiaCongChoChi[] | null>(null);
  const [gcLoi, setGcLoi] = useState<string | null>(null);
  const [lapRoi, setLapRoi] = useState(false);
  const [lapGc, setLapGc] = useState<GiaCongChoChi | null>(null);

  const taiGc = useCallback(() => {
    if (!token) return;
    api.giaCongNgoai
      .choChi(token)
      .then((r) => {
        setGc(r);
        setGcLoi(null);
      })
      .catch((e: unknown) => setGcLoi(e instanceof ApiError ? e.message : "Không tải được hàng gia công chờ chi."));
  }, [token]);
  useEffect(() => {
    taiGc();
  }, [taiGc]);

  // Nối dây trang sổ (kỳ, thẻ, lọc, URL, tải + cùng kỳ, SSE, liên thông, ngăn): khuôn chung. Sự kiện
  // đẩy nạp lại thêm hàng gia công chờ chi.
  const cauHinh: CauHinhTrangPhieu<PaymentVoucherRow, TheLocPC, LocPC> = {
    man: MAN,
    moc: MOC_PC,
    locTuUrl,
    locLenUrl,
    locTrong: LOC_TRONG,
    thamSoLoc,
    thamSoTai,
    goiDanhSach: (t, p) => api.accounting.vouchers(t, p),
    theKhongBang: (t) => t === "gc",
    chuLoi: "Không tải được danh sách phiếu chi.",
    coTrang: PAGE_SIZE,
    coXemTaiKhoan,
    mucDichTaiKhoan: "pay",
    onSuKien: taiGc,
  };
  const sp = useTrangPhieu(cauHinh, token, eventTick, focusQuery);
  const { the, setThe, loc, rows, mo, setMo, load } = sp;
  const { soThe, soTheCung } = sp;
  const muc = useMemo<TheLocMuc[]>(() => {
    const chung = theLocSo(soThe, soTheCung, { nhanXong: "Đã chi", phuThieu: "chưa có hoá đơn hoặc biên nhận" });
    return [
      chung.tatCa,
      chung.xong,
      chung.thieu,
      {
        id: "gc",
        nhan: "Gia công chờ chi",
        cham: "amber",
        // Gia công không có đơn giá (chủ chốt 07/10/2026) ⇒ thẻ đếm việc, không cộng tiền.
        so: gc == null ? "—" : `${gc.length} việc`,
        phu: gc == null ? undefined : "đã chốt chờ chi",
      },
      chung.daHuy,
    ];
  }, [soThe, soTheCung, gc]);
  // Trạng thái trong nút Lọc = các thẻ có bảng ("Gia công chờ chi" thay cả bảng nên không vào).
  const dieuKien = useMemo(
    () => [
      dkTrangThaiPhieu({ muc: muc.filter((m) => m.id !== "gc"), n: soThe, dang: the, dat: (id) => setThe(id as TheLocPC) }),
      ...dieuKienPhieu(CAU_HINH_LOC_PC, sp.taiKhoan),
    ],
    [muc, soThe, the, setThe, sp.taiKhoan],
  );

  return (
    <main className="kt-trang">
      <header className="kt-ph">
        <div>
          <h1>{VOUCHER_PAGE_LABEL}</h1>
          <p>Sổ tiền ra: mọi phiếu chi tiền mặt và chuyển khoản.</p>
        </div>
        {coLap && (
          <div className="kt-ph__nut">
            <button type="button" className="kt-btn kt-btn--chinh" onClick={() => setLapRoi(true)}>
              <Plus size={16} aria-hidden="true" />
              Lập phiếu chi
            </button>
          </div>
        )}
      </header>

      <TheLoc muc={muc} dangChon={the} onChon={(id) => setThe(id as TheLocPC)} />

      {the === "gc" ? (
        <HangChoGiaCong rows={gc} loi={gcLoi} onLap={coLap ? setLapGc : undefined} />
      ) : (
        <>
          <div className="kt-tb tl-thanh">
            <label className="kt-tim">
              <Search size={16} aria-hidden="true" />
              <input aria-label="Tìm phiếu chi" placeholder="Tìm mã phiếu, người nhận, nội dung, mã đơn mua" value={sp.tim}
                onChange={(e) => sp.setTim(e.target.value)} />
            </label>
            <ThanhLoc ky={sp.ky} moc={MOC_PC} onKy={sp.setKy} dieuKien={dieuKien} loc={loc} onLoc={sp.setLoc} />
            <span className="kt-tb__dem">{`${vietSo(sp.tong)} phiếu`}</span>
          </div>
          <VouchersTable
            rows={rows}
            loading={sp.loading}
            loi={sp.loi}
            onTaiLai={load}
            dangXem={mo?.id ?? null}
            onMo={(id) => setMo(rows.find((r) => r.id === id) ?? null)}
            coLoc={dangLoc(the, loc, sp.timTre)}
            onBoLoc={sp.boLoc}
            onLap={coLap ? () => setLapRoi(true) : undefined}
            trang={sp.page}
            size={sp.size}
            tong={sp.tong}
            onTrang={sp.datTrang}
            onSize={sp.setSize}
          />
          <GoiYPhim />
        </>
      )}

      {mo && (
        <VouchersDrawer
          dau={mo}
          eventTick={eventTick}
          quyen={{ lap: coLap, huy: coHuy, in: coIn, xemDonMua: coXemDonMua }}
          len={sp.len}
          xuong={sp.xuong}
          onDong={() => setMo(null)}
          onDoi={load}
          onMoDonMua={coXemDonMua ? (code) => navigate("ke-toan-don-mua-hang", { focusRequestCode: code }) : undefined}
          onMoPhieuThu={(code) => navigate("ke-toan-phieu-thu", { focusReceiptQuery: code })}
          onMoYeuCau={coXemYeuCau ? (code) => navigate("yeu-cau-mua-hang", { focusRequestCode: code }) : undefined}
        />
      )}
      {lapRoi && (
        <StandaloneVoucherDialog
          onClose={() => setLapRoi(false)}
          onMoTaiKhoan={() => navigate("ke-toan-tai-khoan-ngan-hang")}
          onSaved={(saved) => {
            setLapRoi(false);
            setMo(saved);
            load();
          }}
        />
      )}
      {lapGc && (
        <LapPhieuChiGiaCongModal
          row={lapGc}
          onClose={() => setLapGc(null)}
          onMoTaiKhoan={() => navigate("ke-toan-tai-khoan-ngan-hang")}
          onDone={(saved) => {
            setLapGc(null);
            setMo(saved);
            load();
            taiGc();
          }}
        />
      )}
    </main>
  );
}
