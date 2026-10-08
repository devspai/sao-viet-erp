/** Màn PHIẾU CHI (đặc tả PC-1 … PC-6, A.16 – A.18) — khuôn lưới danh sách chung `lds-*`, giống các
 *  danh sách Kinh doanh (08/10/2026).
 *
 *  Khuôn trang: đầu trang (tiêu đề + nút "Lập phiếu chi") → thẻ lọc (hàng lọc nhanh trạng thái có số;
 *  ô tìm, thanh lọc chung `ThanhLoc`: kỳ theo Ngày tạo / Ngày chi + điều kiện; nút Cột) → lưới kiểu
 *  bảng tính + dòng Cộng + chân phân trang. Bấm dòng mở ngăn chi tiết kiểu 3 bên phải. Mục "Gia công
 *  chờ chi" thay cả bảng (chỉ hiện khi có việc).
 *  Mọi lọc chạy ở MÁY CHỦ; số trên hàng lọc nhanh (`the_loc`) tính theo kỳ + bộ lọc, KHÔNG theo mục đang chọn.
 *
 *  ⚠️ TIỀN THẬT: lập phiếu chi = tiền đã rời két, không sửa được — sai thì hủy (có lý do) rồi lập lại.
 */
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, api, type GiaCongChoChi, type PaymentVoucherRow } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { useCan } from "../../../auth/permissions";
import type { NavigateFn } from "../../../components/AppShell";
import { Button } from "../../../components/Button";
import {
  ChonCot, LocNhanhTrangThai, OTim, useCauHinhLuoi, type MucLocNhanh,
} from "../../../components/LuoiDs";
import { VOUCHER_PAGE_LABEL } from "../../../constants/features";
import { GoiYPhim } from "../shared/BangPhieu";
import { soPhieuCong } from "../shared/PhieuGon";
import { useTrangPhieu, type CauHinhTrangPhieu } from "../shared/trangPhieu";
import { COT_GIA_CONG, HangChoGiaCong } from "./components/HangChoGiaCong";
import { VouchersDrawer } from "./components/VouchersDrawer";
import { COT_PHIEU_CHI, VouchersTable } from "./components/VouchersTable";
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
  const moDonMua = coXemDonMua ? (code: string) => navigate("ke-toan-don-mua-hang", { focusRequestCode: code }) : undefined;
  const { the, setThe, loc, rows, mo, setMo, load } = sp;
  const { soThe } = sp;
  const muc = useMemo<MucLocNhanh[]>(() => [
    { key: "tat_ca", label: "Tất cả", count: soThe?.tat_ca },
    { key: "xong", label: "Đã chi", mau: "la", count: soThe?.xong },
    { key: "thieu", label: "Thiếu chứng từ gốc", mau: "vang", count: soThe?.thieu_chung_tu },
    // Gia công không có đơn giá (chủ chốt 07/10/2026) ⇒ mục đếm việc, không cộng tiền. Không có việc
    // (hoặc đang tải) thì ẩn — trừ khi đang đứng ở mục đó (vd mở từ link) hoặc tải LỖI: lỗi thì mục vẫn
    // hiện (không số) để bấm vào thấy câu lỗi, việc chờ chi không lặng lẽ biến mất.
    ...(the !== "gc" && !gcLoi && (gc?.length ?? 0) === 0
      ? []
      : [{ key: "gc", label: "Gia công chờ chi", mau: "cam" as const, count: gc?.length }]),
    { key: "da_huy", label: "Đã hủy", mau: "xam", count: soThe?.da_huy },
  ], [soThe, gc, gcLoi, the]);
  // Trạng thái trong nút Lọc = các tab có bảng ("Gia công chờ chi" thay cả bảng nên không vào).
  const dieuKien = useMemo(
    () => [
      dkTrangThaiPhieu({
        muc: muc.filter((m) => m.key !== "gc").map((m) => ({ id: m.key, nhan: m.label })),
        n: soThe, dang: the, dat: (id) => setThe(id as TheLocPC),
      }),
      ...dieuKienPhieu(CAU_HINH_LOC_PC, sp.taiKhoan),
    ],
    [muc, soThe, the, setThe, sp.taiKhoan],
  );
  // Dòng Cộng: số phiếu khớp với tổng tiền máy chủ cộng (có tính tab + ô Chứng từ).
  const soXong = soPhieuCong({ the, chungTu: loc.chung_tu, n: soThe, tong: sp.tong });
  const luoi = useCauHinhLuoi(MAN);
  const luoiGc = useCauHinhLuoi(`${MAN}:gia-cong`);
  const cotHien = luoi.rongHien(luoi.xep(COT_PHIEU_CHI).filter((c) => !luoi.an.has(c.key)));

  return (
    <main className="kt-trang lds">
      <header className="lds-dau">
        <h1 className="lds-dau__ten">{VOUCHER_PAGE_LABEL}</h1>
        <div className="lds-dau__nut">
          {coLap && (
            <Button variant="accent" onClick={() => setLapRoi(true)}>
              <Plus size={15} aria-hidden="true" /> Lập phiếu chi
            </Button>
          )}
        </div>
      </header>

      <section className="lds-loc">
        <LocNhanhTrangThai muc={muc} dang={the} onChon={(k) => setThe(k as TheLocPC)} />
        {/* Mục "Gia công chờ chi" không có bảng phiếu ⇒ ô tìm, bộ lọc không áp vào, ẩn đi; còn nút Cột
            của chính hàng gia công. */}
        {the === "gc" ? (
          <div className="lds-loc__thanh tl-thanh">
            <ChonCot cot={COT_GIA_CONG} {...luoiGc.chonCot} />
          </div>
        ) : (
          <div className="lds-loc__thanh tl-thanh" role="search">
            <OTim value={sp.tim} onChange={sp.setTim} placeholder="Tìm số phiếu, người nhận, lý do, mã đơn"
              ariaLabel="Tìm phiếu chi" />
            <ThanhLoc ky={sp.ky} moc={MOC_PC} onKy={sp.setKy} dieuKien={dieuKien} loc={loc} onLoc={sp.setLoc} />
            <ChonCot cot={COT_PHIEU_CHI} {...luoi.chonCot} />
          </div>
        )}
      </section>

      {the === "gc" ? (
        <HangChoGiaCong rows={gc} loi={gcLoi} onLap={coLap ? setLapGc : undefined} luoi={luoiGc} />
      ) : (
        <>
          <VouchersTable
            cot={cotHien}
            luoi={luoi}
            rows={rows}
            loading={sp.loading}
            loi={sp.loi}
            onTaiLai={load}
            dangXem={mo?.id ?? null}
            onMo={(id) => setMo(rows.find((r) => r.id === id) ?? null)}
            coLoc={dangLoc(the, loc, sp.timTre)}
            onBoLoc={sp.boLoc}
            onLap={coLap ? () => setLapRoi(true) : undefined}
            onMoDonMua={moDonMua}
            trang={sp.page}
            size={sp.size}
            tong={sp.tong}
            onTrang={sp.datTrang}
            onSize={sp.setSize}
            tongTien={sp.tongTien}
            soXong={soXong}
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
          onMoDonMua={moDonMua}
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
