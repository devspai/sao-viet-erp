// Ngăn CHI TIẾT công nợ một khách hàng — phương án 2 (sổ chi tiết kiểu Xero, 06/10/2026), vỏ
// `NganCongNo` chung hai màn công nợ.
//
// Đầu ngăn: "Công nợ phải thu > Khách hàng" — tên + thẻ mã — "In sao kê" và "Hồ sơ khách hàng" — khối
// số: còn nợ tới hôm nay + quá hạn, vạch tuổi nợ (bấm mốc = lọc tab Còn nợ), hạn mức. Ba tab:
// - "Còn nợ": hoá đơn còn nợ; lọc theo mốc tuổi (từ khối số, từ mốc đang lọc ở danh sách, hoặc "Quá
//   hạn" khi bấm số Quá hạn ngoài bảng) hiện thành thẻ kèm "Bỏ lọc". "Thu" mở NGĂN CHỒNG thu tiền.
// - "Sao kê": số dư đầu kỳ, từng chứng từ với số dư chạy, số dư cuối kỳ; in được.
// - "Lịch sử": dòng thời gian mọi chứng từ với khách + các hoá đơn đã trễ.
//
// Ngăn chồng tự giữ nháp: Esc / Đóng của nó hỏi trước khi bỏ; phím chỉ thuộc lớp trên cùng nên ↑ ↓ và
// đổi tab của ngăn khách không chạm được nháp đang gõ.
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
import { useChiTietCongNo } from "../../shared/chiTietCongNo";
import { LichSuCongNo, type KhoanTre } from "../../shared/LichSuCongNo";
import { nhanLocNo, TheLocNo } from "../../shared/locNoNgan";
import { NganCongNo } from "../../shared/NganCongNo";
import { useTabNho } from "../../shared/NganPhieu";
import { TabSaoKe } from "../../shared/TabSaoKe";
import { PAID_PAGE } from "../shared/constants";
import type { Bucket, TuoiDangLoc } from "../shared/types";
import { HoaDonConNoBlock } from "./HoaDonConNoBlock";
import { ThuTienHoaDon } from "./ThuTienHoaDon";

export type QuyenCongNoThu = {
  /** Lập phiếu thu (`phieu_thu.create`) — nút "Thu". */
  thu: boolean;
  xemPhieuThu: boolean;
  xemKhach: boolean;
  xemDonBan: boolean;
};

const TAB = ["no", "sk", "ls"];

/** Hoá đơn có thuộc bộ lọc không: null = mọi hoá đơn, "overdue" = đang trễ, còn lại là khoá mốc
 *  tuổi. Máy chủ để `aging_bucket` TRỐNG khi chưa trễ, nên mốc "Chưa tới hạn" là "không trễ ngày
 *  nào" chứ không so khoá. */
function khopLoc(row: ReceivableItemRow, loc: string | null): boolean {
  if (loc == null) return true;
  if (loc === "overdue") return row.overdue_days > 0;
  if (loc === "chua_toi_han") return row.overdue_days <= 0;
  return row.aging_bucket === loc;
}

export function ReceivablesDrawer({
  customerId,
  customerName,
  ma,
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
  /** Mã khách (từ dòng danh sách) — thẻ dưới tên. */
  ma?: string | null;
  bucket: Bucket;
  /** Mốc tuổi nợ đang lọc ở danh sách ⇒ tab Còn nợ lọc sẵn mốc đó. */
  tuoi?: TuoiDangLoc | null;
  /** Kỳ đang xem ở trang — kỳ mặc định của tab Sao kê. */
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
  const [tab, setTabTho] = useState(
    bucket === "paid" ? "sk" : bucket === "overdue" || tuoi ? "no" : TAB.includes(tabNho) ? tabNho : "no",
  );
  const [loc, setLoc] = useState<string | null>(bucket === "overdue" ? "overdue" : tuoi ? tuoi.khoa : null);
  const [dangThu, setDangThu] = useState<ReceivableItemRow | null>(null);
  const [daLap, setDaLap] = useState<PaymentReceiptRow | null>(null);
  const [dangIn, setDangIn] = useState(false);
  const [soLanLap, setSoLanLap] = useState(0);

  // Ngăn chỉ còn cần phần NỢ của chi tiết (lần thu nằm ở Sao kê / Lịch sử); vẫn đi qua khuôn chung
  // để có nạp lại theo sự kiện đẩy và bỏ câu trả lời cũ về muộn.
  const { detail, setDetail, loading, loi, reload } = useChiTietCongNo<ReceivableReceiptRow, ReceivablesDetail>({
    token,
    khoa: String(customerId),
    coTrang: PAID_PAGE,
    goi: (t, trang) =>
      api.accounting.receivablesDetail(t, customerId, false, { tu_ngay: ky.tu, den_ngay: ky.den }, trang),
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

  // Backend cũ hơn giao diện có thể thiếu `items`/`aging` — báo rõ, không sập, không coi là rỗng.
  const hopLe = detail != null && Array.isArray(detail.items) && Array.isArray(detail.aging);
  const conNo = useMemo(() => (hopLe ? detail!.items.filter((x) => x.remaining_amount > 0) : []), [hopLe, detail]);
  const dangHien = useMemo(() => conNo.filter((x) => khopLoc(x, loc)), [conNo, loc]);
  const tre = useMemo<KhoanTre[]>(
    () =>
      conNo
        .filter((x) => x.overdue_days > 0 && x.due_date)
        .map((x) => ({
          khoa: String(x.invoice_id),
          ten: `Hoá đơn số ${x.invoice_number}`,
          han: x.due_date as string,
          conNo: x.remaining_amount,
          soNgayTre: x.overdue_days,
        })),
    [conNo],
  );

  const setTab = (t: string) => {
    if (t === tab) return;
    setTabNho(t);
    setTabTho(t);
  };
  const chonLoc = (k: string | null) => {
    setLoc(k);
    if (k) setTab("no");
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
    setDangThu(null);
    setDaLap(receipt);
    setSoLanLap((n) => n + 1);
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

  const ten = detail?.customer_name || customerName;
  const lan = eventTick + soLanLap;
  const nhan = hopLe ? nhanLocNo(loc, detail!.aging, tuoi?.nhan) : null;

  return (
    <>
      <NganCongNo
        nhanMan="Công nợ phải thu"
        nhanDoiTac="Khách hàng"
        tieuDe={ten}
        ma={ma}
        tong={hopLe ? detail : null}
        choNo={hopLe ? detail!.payment_term_days : null}
        sauNgay="sau hoá đơn"
        nutHoSo={
          quyen.xemKhach
            ? {
                nhan: "Hồ sơ khách hàng",
                onMo: () => {
                  onClose();
                  navigate("khach-hang", { openCustomerId: customerId });
                },
              }
            : undefined
        }
        onInSaoKe={() => {
          setTab("sk");
          setDangIn(true);
        }}
        chuCanh="Chỉ là cảnh báo, vẫn bán và thu bình thường."
        dangLoc={loc}
        onLoc={chonLoc}
        loi={loi}
        loading={loading}
        thieu={detail != null && !hopLe}
        chuThieu="Dữ liệu trả về thiếu phần hoá đơn hoặc tuổi nợ: máy chủ đang chạy bản cũ hơn giao diện. Khởi động lại máy chủ rồi tải lại trang."
        onTaiLai={reload}
        tabs={
          hopLe
            ? [
                { id: "no", nhan: "Còn nợ", dem: conNo.length },
                { id: "sk", nhan: "Sao kê" },
                { id: "ls", nhan: "Lịch sử" },
              ]
            : undefined
        }
        tab={tab}
        onTab={setTab}
        len={len}
        xuong={xuong}
        onDong={onClose}
      >
        {hopLe && tab === "no" && (
          <>
            {nhan && (
              <div className="kt-hang-loc">
                <TheLocNo nhan={nhan} so={dangHien.length} onBo={() => setLoc(null)} />
              </div>
            )}
            <HoaDonConNoBlock items={dangHien} homNay={detail!.as_of} coThu={quyen.thu} onThu={setDangThu} onMoDon={moDon} />
          </>
        )}

        {hopLe && tab === "sk" && (
          <TabSaoKe ben="receivables" id={customerId} ten={ten} ma={ma} kyTrang={ky} lan={lan}
            dangIn={dangIn} onDongIn={() => setDangIn(false)} onMoPhieu={moPhieu} />
        )}

        {hopLe && tab === "ls" && (
          <LichSuCongNo ben="receivables" id={customerId} homNay={detail!.as_of} tre={tre} chuTre="chưa thu đủ" lan={lan}
            onMoPhieu={moPhieu} />
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

      {dangThu && (
        <ThuTienHoaDon
          key={dangThu.invoice_id}
          item={dangThu}
          customerId={customerId}
          customerName={ten}
          onDong={() => setDangThu(null)}
          onDaLap={(r) => daLapPhieu(dangThu, r)}
          onMoDon={moDon}
          onMoPhieu={moPhieu}
          onMoTaiKhoan={() => {
            onClose();
            navigate("ke-toan-tai-khoan-ngan-hang");
          }}
        />
      )}
    </>
  );
}
