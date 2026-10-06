// Ngăn CHI TIẾT công nợ một nhà cung cấp (đặc tả NPT-2) — vỏ `NganPhai` chung của kế toán.
//
// Đầu ngăn: "Công nợ phải trả > Nhà cung cấp" — tên + pill "Vượt hạn mức" — nút "Hồ sơ nhà cung cấp"
// — tóm tắt Còn nợ | Quá hạn | Hạn mức | Cho nợ — dải amber khi vượt hạn mức. Hai tab: "Còn nợ" (các
// đợt CÒN nợ, gom theo đơn, tích để trả nhiều đợt) và "Đã trả" (trong kỳ của trang / tất cả).
// Tích đợt ⇒ chân tối "Đã chọn n đợt … — Bỏ chọn — Trả n đợt" mở ngăn chồng `BatchPaymentDialog` với
// ẢNH CHỤP các đợt lúc bấm (ngăn dưới nạp lại / tải hỏng cũng không đổi form đang gõ).
// Tab "Đã trả" do máy chủ cắt trang (`PAID_PAGE` một trang); "Xem thêm" tải trang kế và nối vào.
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  type KyXem,
  type PayableItemRow,
  type PayablePaidRow,
  type PayablesDetail,
  type VoucherBatchResult,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import type { NavigateFn } from "../../../../components/AppShell";
import { NhomNut } from "../../shared/BoLocNangCao";
import { useChiTietCongNo } from "../../shared/chiTietCongNo";
import { tien, vietSo } from "../../shared/dinhDang";
import { NganCongNo } from "../../shared/NganCongNo";
import { useTabNho } from "../../shared/NganPhieu";
import { PAID_PAGE } from "../shared/constants";
import type { Bucket } from "../shared/types";
import { BatchPaymentDialog } from "./BatchPaymentDialog";
import { DaTraBlock, type PhamViDaTra } from "./DaTraBlock";
import { DotConNoBlock } from "./DotConNoBlock";

export type QuyenCongNoTra = {
  /** Lập phiếu chi (`phieu_chi.create`) — tích đợt và trả nhiều đợt. */
  lap: boolean;
  xemDonMua: boolean;
  xemNcc: boolean;
  xemPhieuChi: boolean;
};

type LoaiNo = "all" | "overdue";

export function PayablesDrawer({
  supplierId,
  supplierName,
  bucket,
  ky,
  eventTick = 0,
  quyen,
  navigate,
  len,
  xuong,
  onClose,
  onChanged,
}: {
  supplierId: number;
  supplierName: string;
  bucket: Bucket;
  /** Kỳ đang xem ở trang — tab Đã trả "Trong kỳ" lấy đúng kỳ này. */
  ky: KyXem;
  /** Sự kiện đẩy (SSE): đổi số ⇒ ngăn nạp lại (lỗi 8). */
  eventTick?: number;
  quyen: QuyenCongNoTra;
  navigate: NavigateFn;
  len?: () => void;
  xuong?: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { token } = useAuth();
  // Tab nhớ theo màn; bấm thẳng số Quá hạn / Đã trả ngoài bảng thì mở đúng tab đó.
  const [tabNho, setTabNho] = useTabNho("cong-no-phai-tra", "no");
  const [tab, setTabTho] = useState(bucket === "paid" ? "tra" : bucket === "overdue" ? "no" : tabNho);
  const setTab = (t: string) => {
    setTabNho(t);
    setTabTho(t);
  };
  const [loaiNo, setLoaiNo] = useState<LoaiNo>(bucket === "overdue" ? "overdue" : "all");
  const [phamVi, setPhamVi] = useState<PhamViDaTra>("ky");
  const [chon, setChon] = useState<Set<number>>(new Set());
  const [moHang, setMoHang] = useState<string | null>(null);
  const [moTra, setMoTra] = useState<PayableItemRow[] | null>(null);
  const [daLap, setDaLap] = useState<VoucherBatchResult | null>(null);

  const chonDuoc = useCallback(
    (row: PayableItemRow) => quyen.lap && row.delivery_id != null && row.con_no > 0,
    [quyen.lap],
  );

  // Tải chi tiết + tab Đã trả cắt trang ở máy chủ + "Xem thêm" nối trang + sự kiện đẩy (lỗi 8):
  // khuôn chung `useChiTietCongNo`. `reload` cũng là đường gọi lại sau khi lập phiếu: `onChanged`
  // (báo trang) KHÔNG tự kéo lại chi tiết của chính ngăn đang mở.
  const tatCa = phamVi === "tat_ca";
  const { detail, loading, loi, reload, xemThem, dangTaiThem } = useChiTietCongNo<PayablePaidRow, PayablesDetail>({
    token,
    khoa: `${supplierId}|${phamVi}|${ky.tu}|${ky.den}`,
    coTrang: PAID_PAGE,
    goi: (t, trang) =>
      api.accounting.payablesDetail(t, supplierId, tatCa, tatCa ? undefined : { tu_ngay: ky.tu, den_ngay: ky.den }, trang),
    khoaDong: (p) => p.voucher_id,
    eventTick,
    chuLoi: "Không tải được chi tiết công nợ.",
    chuLoiThem: "Không tải thêm được lần trả.",
    onTai: (d) => {
      // Đợt đã trả xong / biến mất sau khi nạp lại thì bỏ khỏi lựa chọn.
      const conChon = new Set((Array.isArray(d.items) ? d.items : []).filter(chonDuoc).map((r) => r.delivery_id as number));
      setChon((cu) => {
        const giu = [...cu].filter((id) => conChon.has(id));
        return giu.length === cu.size ? cu : new Set(giu);
      });
    },
  });

  // Đổi phạm vi ⇒ khoá đổi ⇒ tải lại từ một trang.
  const doiPhamVi = setPhamVi;

  // Thông báo "Đã lập n phiếu chi" tự tắt sau vài giây.
  useEffect(() => {
    if (!daLap) return;
    const t = window.setTimeout(() => setDaLap(null), 8000);
    return () => window.clearTimeout(t);
  }, [daLap]);

  // Backend cũ hơn giao diện có thể thiếu `items`/`paid` — báo rõ, không sập, không coi là rỗng.
  const hopLe = detail != null && Array.isArray(detail.items) && Array.isArray(detail.paid);
  const items = useMemo(() => (hopLe ? detail!.items : []), [hopLe, detail]);
  // Số trên tab = số đợt CÒN nợ (lỗi 7) — đợt đã trả xong chỉ nằm đó để dò cọc, không đếm.
  const soConNo = items.filter((x) => x.con_no > 0).length;
  const khoanNo = useMemo(
    () => (loaiNo === "overdue" ? items.filter((x) => x.overdue_days > 0) : items),
    [items, loaiNo],
  );
  const dotDaChon = khoanNo.filter((row) => row.delivery_id != null && chon.has(row.delivery_id));
  const tongDaChon = dotDaChon.reduce((s, row) => s + row.con_no, 0);

  const moDon = quyen.xemDonMua
    ? (code: string) => {
        onClose();
        navigate("ke-toan-don-mua-hang", { focusRequestCode: code });
      }
    : undefined;
  const moPhieu = quyen.xemPhieuChi
    ? (code: string) => {
        onClose();
        navigate("ke-toan-phieu-chi", { focusVoucherQuery: code });
      }
    : undefined;

  const coChan = tab === "no" && dotDaChon.length > 0;

  return (
    <>
      <NganCongNo
        nhanMan="Công nợ phải trả"
        nhanDoiTac="Nhà cung cấp"
        tieuDe={detail?.supplier_name ?? supplierName}
        tong={hopLe ? detail : null}
        choNo={hopLe ? detail!.credit_days : null}
        sauNgay="sau mỗi đợt giao"
        nutHoSo={
          quyen.xemNcc
            ? {
                nhan: "Hồ sơ nhà cung cấp",
                onMo: () => {
                  onClose();
                  navigate("nha-cung-cap");
                },
              }
            : undefined
        }
        chuCanh="Chỉ là cảnh báo, vẫn đặt mua được."
        loi={loi}
        loading={loading}
        thieu={detail != null && !hopLe}
        chuThieu="Dữ liệu trả về thiếu phần công nợ theo đợt giao: máy chủ đang chạy bản cũ hơn giao diện. Khởi động lại máy chủ rồi tải lại trang."
        onTaiLai={reload}
        tabs={
          hopLe
            ? [
                { id: "no", nhan: "Còn nợ", dem: soConNo },
                { id: "tra", nhan: "Đã trả", dem: detail!.paid_total ?? detail!.paid.length },
              ]
            : undefined
        }
        tab={tab}
        onTab={setTab}
        len={len}
        xuong={xuong}
        onDong={onClose}
        chanToi={coChan}
        chan={
          coChan ? (
            <>
              <span className="kt-ngan__xt">
                {`Đã chọn ${vietSo(dotDaChon.length)} đợt`}
                <b>{tien(tongDaChon)}</b>
              </span>
              <button type="button" className="kt-btn kt-btn--tron" onClick={() => setChon(new Set())}>
                Bỏ chọn
              </button>
              <button type="button" className="kt-btn kt-btn--chinh" onClick={() => setMoTra(dotDaChon)}>
                {`Trả ${vietSo(dotDaChon.length)} đợt`}
              </button>
            </>
          ) : undefined
        }
      >
        {hopLe && tab === "no" && (
          <>
            <div className="kt-hang-loc">
              <NhomNut<LoaiNo> giaTri={loaiNo} luaChon={[["all", "Tất cả"], ["overdue", "Quá hạn"]]}
                onDoi={(v) => {
                  // Đổi danh sách đang hiện thì xoá lựa chọn: giữ tích cũ dễ khiến người dùng tưởng
                  // đợt đang ẩn vẫn được tính vào lượt trả.
                  setLoaiNo(v);
                  setChon(new Set());
                }} />
              {quyen.lap && soConNo > 0 && <span className="kt-mo">Tích các đợt muốn trả rồi bấm Trả ở thanh dưới.</span>}
            </div>
            <DotConNoBlock detail={detail!} khoanNo={khoanNo} chiQuaHan={loaiNo === "overdue"} coChon={quyen.lap}
              chonDuoc={chonDuoc} chon={chon} onChon={setChon} moHang={moHang} onMoHang={setMoHang} onMoDon={moDon} />
          </>
        )}

        {hopLe && tab === "tra" && (
          <DaTraBlock detail={detail!} phamVi={phamVi} onPhamVi={doiPhamVi} onMoPhieu={moPhieu} onMoDon={moDon}
            onXemThem={xemThem} dangTaiThem={dangTaiThem} />
        )}

        {daLap && (
          <div className="kt-bao" role="status">
            <span>{`Đã lập ${vietSo(daLap.vouchers.length)} phiếu chi`}</span>
            <button type="button"
              onClick={() => {
                // Phiếu vừa lập nằm trong kỳ trang thì xem "Trong kỳ", không thì "Tất cả".
                const trongKy = daLap.vouchers.every((v) => v.voucher_date >= ky.tu && v.voucher_date <= ky.den);
                doiPhamVi(trongKy ? "ky" : "tat_ca");
                setTab("tra");
                setDaLap(null);
              }}>
              Xem phiếu
            </button>
          </div>
        )}
      </NganCongNo>

      {moTra && (
        <BatchPaymentDialog
          supplierName={detail?.supplier_name ?? supplierName}
          items={moTra}
          onClose={() => setMoTra(null)}
          onMoTaiKhoan={() => navigate("ke-toan-tai-khoan-ngan-hang")}
          onSaved={(kq) => {
            setMoTra(null);
            setChon(new Set());
            setDaLap(kq);
            reload();
            onChanged();
          }}
        />
      )}
    </>
  );
}
