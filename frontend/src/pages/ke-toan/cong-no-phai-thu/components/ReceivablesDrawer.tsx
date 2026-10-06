// Ngăn CHI TIẾT công nợ một khách hàng (đặc tả NPTh-2) — vỏ `NganCongNo` chung hai màn công nợ.
//
// Đầu ngăn: "Công nợ phải thu > Khách hàng" — tên + pill "Vượt hạn mức" — nút "Hồ sơ khách hàng" —
// tóm tắt Còn nợ | Quá hạn | Hạn mức (còn được nợ + vạch) | Cho nợ — dải amber khi vượt hạn mức. Hai
// tab có số: "Hoá đơn còn nợ" (lọc Tất cả / Quá hạn / mốc tuổi đang lọc ở danh sách; "Thu tiền" mở
// khung thu ngay dưới dòng — NPTh-3) và "Đã thu" (trong kỳ của trang / tất cả; máy chủ cắt trang).
//
// Khung Thu tiền đang gõ dở thì không để mất nháp lặng lẽ: đổi tab / đổi lọc làm dòng biến mất phải
// hỏi trước, ↑ ↓ sang khách khác tạm tắt, đóng ngăn hỏi trước.
import { useEffect, useMemo, useState } from "react";

import {
  api,
  type KyXem,
  type PaymentReceiptRow,
  type ReceivableItemRow,
  type ReceivableReceiptRow,
  type ReceivablesDetail,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import type { NavigateFn } from "../../../../components/AppShell";
import { homNayVN } from "../../../../utils/ky";
import { NhomNut } from "../../shared/BoLocNangCao";
import { useChiTietCongNo } from "../../shared/chiTietCongNo";
import type { PhamViDaTra } from "../../shared/KhungLanTra";
import { NganCongNo } from "../../shared/NganCongNo";
import { useTabNho } from "../../shared/NganPhieu";
import { PAID_PAGE } from "../shared/constants";
import type { Bucket, TuoiDangLoc } from "../shared/types";
import { DaThuBlock } from "./DaThuBlock";
import { HoaDonConNoBlock } from "./HoaDonConNoBlock";

export type QuyenCongNoThu = {
  /** Lập phiếu thu (`phieu_thu.create`) — nút "Thu tiền". */
  thu: boolean;
  xemPhieuThu: boolean;
  xemKhach: boolean;
  xemDonBan: boolean;
};

/** Lọc hoá đơn trong ngăn: "all" | "overdue" | khoá mốc tuổi đang lọc ở danh sách. */
type LocHoaDon = string;

/** Hoá đơn có thuộc nút lọc không. Máy chủ để `aging_bucket` TRỐNG khi chưa trễ, nên mốc "Chưa tới
 *  hạn" là "không trễ ngày nào" chứ không so khoá. */
function khopLoc(row: ReceivableItemRow, loc: LocHoaDon): boolean {
  if (loc === "all") return true;
  if (loc === "overdue") return row.overdue_days > 0;
  if (loc === "chua_toi_han") return row.overdue_days <= 0;
  return row.aging_bucket === loc;
}

const HOI_BO = "Bỏ nội dung đang nhập?";

export function ReceivablesDrawer({
  customerId,
  customerName,
  bucket,
  tuoi = null,
  ky,
  eventTick = 0,
  quyen,
  navigate,
  len,
  xuong,
  onClose,
  onChanged,
}: {
  customerId: number;
  customerName: string;
  bucket: Bucket;
  /** Mốc tuổi nợ đang lọc ở danh sách ⇒ tab hoá đơn lọc sẵn mốc đó. */
  tuoi?: TuoiDangLoc | null;
  /** Kỳ đang xem ở trang — tab Đã thu "Trong kỳ" lấy đúng kỳ này. */
  ky: KyXem;
  /** Sự kiện đẩy (SSE): đổi số ⇒ ngăn nạp lại. */
  eventTick?: number;
  quyen: QuyenCongNoThu;
  navigate: NavigateFn;
  len?: () => void;
  xuong?: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [tabNho, setTabNho] = useTabNho("cong-no-phai-thu", "no");
  const [tab, setTabTho] = useState(bucket === "paid" ? "thu" : bucket === "overdue" || tuoi ? "no" : tabNho);
  const [loc, setLocTho] = useState<LocHoaDon>(bucket === "overdue" ? "overdue" : tuoi ? tuoi.khoa : "all");
  const [phamVi, setPhamVi] = useState<PhamViDaTra>("ky");
  const [moThu, setMoThu] = useState<number | null>(null);
  const [formBan, setFormBan] = useState(false);
  const [daLap, setDaLap] = useState<PaymentReceiptRow | null>(null);
  /** Khung Thu tiền đang mở VÀ có nội dung gõ dở. */
  const banNhap = moThu != null && formBan;

  const tatCa = phamVi === "tat_ca";
  const { detail, setDetail, loading, loi, reload, xemThem, dangTaiThem } = useChiTietCongNo<
    ReceivableReceiptRow,
    ReceivablesDetail
  >({
    token,
    khoa: `${customerId}|${phamVi}|${ky.tu}|${ky.den}`,
    coTrang: PAID_PAGE,
    goi: (t, trang) =>
      api.accounting.receivablesDetail(t, customerId, tatCa, tatCa ? undefined : { tu_ngay: ky.tu, den_ngay: ky.den }, trang),
    khoaDong: (p) => p.receipt_id,
    eventTick,
    chuLoi: "Không tải được chi tiết công nợ.",
    chuLoiThem: "Không tải thêm được lần thu.",
  });

  // Thông báo "Đã lập PT-…" tự tắt sau vài giây.
  useEffect(() => {
    if (!daLap) return;
    const t = window.setTimeout(() => setDaLap(null), 8000);
    return () => window.clearTimeout(t);
  }, [daLap]);

  // Backend cũ hơn giao diện có thể thiếu `items`/`paid` — báo rõ, không sập, không coi là rỗng.
  const hopLe = detail != null && Array.isArray(detail.items) && Array.isArray(detail.paid);
  const items = useMemo(() => (hopLe ? detail!.items : []), [hopLe, detail]);
  const soConNo = items.filter((x) => x.remaining_amount > 0).length;
  const dangHien = useMemo(() => items.filter((x) => khopLoc(x, loc)), [items, loc]);

  // Đổi tab: khung Thu tiền (chỉ ở tab hoá đơn) sẽ bị gỡ ⇒ gõ dở thì hỏi trước.
  const setTab = (t: string) => {
    if (t === tab) return;
    if (banNhap && !window.confirm(HOI_BO)) return;
    setMoThu(null);
    setTabNho(t);
    setTabTho(t);
  };
  // Đổi nút lọc: chỉ hỏi khi dòng đang thu biến mất khỏi danh sách mới.
  const setLoc = (v: LocHoaDon) => {
    const dong = items.find((x) => x.invoice_id === moThu);
    const mat = dong != null && !khopLoc(dong, v);
    if (mat && banNhap && !window.confirm(HOI_BO)) return;
    if (mat) setMoThu(null);
    setLocTho(v);
  };

  /** Lập xong: dòng hoá đơn đổi NGAY (không đợi nạp lại), rồi mới nạp lại cho khớp máy chủ. */
  function daLapPhieu(row: ReceivableItemRow, receipt: PaymentReceiptRow) {
    const tienThu = receipt.amount_vnd ?? receipt.amount;
    setDetail((cu) =>
      cu
        ? {
            ...cu,
            total_due: Math.max(0, cu.total_due - tienThu),
            overdue_amount: row.overdue_days > 0 ? Math.max(0, cu.overdue_amount - tienThu) : cu.overdue_amount,
            items: cu.items.map((x) =>
              x.invoice_id === row.invoice_id
                ? {
                    ...x,
                    direct_received_amount: x.direct_received_amount + tienThu,
                    received_amount: x.received_amount + tienThu,
                    remaining_amount: Math.max(0, x.remaining_amount - tienThu),
                  }
                : x,
            ),
          }
        : cu,
    );
    setMoThu(null);
    setDaLap(receipt);
    reload();
    onChanged();
  }

  const moDon = quyen.xemDonBan
    ? (orderId: number) => {
        onClose();
        navigate("don-hang-ban", { openOrderId: orderId });
      }
    : undefined;
  const moPhieu = quyen.xemPhieuThu
    ? (code: string) => {
        onClose();
        navigate("ke-toan-phieu-thu", { focusReceiptQuery: code });
      }
    : undefined;

  const luaChonLoc: [string, string][] = [["all", "Tất cả"], ["overdue", "Quá hạn"]];
  if (tuoi) luaChonLoc.push([tuoi.khoa, tuoi.nhan]);
  // Hoá đơn còn nợ luôn tính tới HÔM NAY (máy chủ), kể cả khi trang đang xem một kỳ đã qua.
  const kyDaQua = ky.den < homNayVN();

  return (
    <NganCongNo
      nhanMan="Công nợ phải thu"
      nhanDoiTac="Khách hàng"
      tieuDe={detail?.customer_name ?? customerName}
      tong={hopLe ? detail : null}
      choNo={hopLe ? detail!.payment_term_days : null}
      sauNgay="sau hoá đơn"
      conDuocNo
      nutHoSo={
        quyen.xemKhach
          ? {
              nhan: "Hồ sơ khách hàng",
              onMo: () => {
                onClose();
                navigate("khach-hang");
              },
            }
          : undefined
      }
      chuCanh="Chỉ là cảnh báo, vẫn bán và thu bình thường."
      loi={loi}
      loading={loading}
      thieu={detail != null && !hopLe}
      chuThieu="Dữ liệu trả về thiếu phần hoá đơn hoặc lần thu: máy chủ đang chạy bản cũ hơn giao diện. Khởi động lại máy chủ rồi tải lại trang."
      onTaiLai={reload}
      tabs={
        hopLe
          ? [
              { id: "no", nhan: "Hoá đơn còn nợ", dem: soConNo },
              { id: "thu", nhan: "Đã thu", dem: detail!.paid_total ?? detail!.paid.length },
            ]
          : undefined
      }
      tab={tab}
      onTab={setTab}
      // Đang gõ dở thì tạm tắt ↑ ↓ sang khách khác (ngăn dựng lại là mất nháp).
      len={banNhap ? undefined : len}
      xuong={banNhap ? undefined : xuong}
      onDong={onClose}
      chanDong={() => banNhap}
    >
      {hopLe && tab === "no" && (
        <>
          <div className="kt-hang-loc">
            <NhomNut<string> giaTri={loc} luaChon={luaChonLoc} onDoi={setLoc} />
            {kyDaQua && <span className="kt-mo">Hoá đơn tính tới hôm nay</span>}
          </div>
          <HoaDonConNoBlock items={dangHien} customerName={detail!.customer_name || customerName} coThu={quyen.thu}
            moThu={moThu}
            onMoThu={(id) => {
              // Mở khung ở dòng khác thì khung đang gõ dở bị gỡ ⇒ hỏi. Đóng (null) thì khung đã tự hỏi.
              if (id != null && id !== moThu && banNhap && !window.confirm(HOI_BO)) return;
              setMoThu(id);
            }}
            onDaLap={daLapPhieu} onBan={setFormBan} onMoDon={moDon}
            onMoTaiKhoan={() => {
              onClose();
              navigate("ke-toan-tai-khoan-ngan-hang");
            }} />
        </>
      )}

      {hopLe && tab === "thu" && (
        <DaThuBlock detail={detail!} phamVi={phamVi} onPhamVi={setPhamVi} onMoPhieu={moPhieu} onXemThem={xemThem}
          dangTaiThem={dangTaiThem} />
      )}

      {daLap && (
        <div className="kt-bao" role="status">
          <span>{`Đã lập ${daLap.code}`}</span>
          {moPhieu && (
            <button type="button" onClick={() => moPhieu(daLap.code)}>
              Xem phiếu
            </button>
          )}
        </div>
      )}
    </NganCongNo>
  );
}
