// Tab "Đơn mua hàng" của màn Mua hàng — phương án 3 (07/10/2026): bảng `BangDonMua` dùng CHUNG với
// Kế toán › Đơn mua hàng, hai nhóm lọc độc lập Hàng và Tiền (máy chủ lọc + đếm). Kỳ, Nhà cung cấp,
// Tiền cọc, Tổng tiền nằm trong thanh lọc chung `ThanhLoc`.
import type { Dispatch, SetStateAction } from "react";
import type { MuaChoLenh, NhomTien, PurchaseRequestRow } from "../../../../api/client";
import { Icon } from "../../../../components/Icons";
import { fmtDate } from "../../../../utils/format";
import type { KyDS } from "../../../thanh-loc/ky-danh-sach";
import type { DieuKien } from "../../../thanh-loc/thanh-loc";
import { BangDonMua, COT_DON } from "../../don-mua-chung/BangDonMua";
import { ChonCotBang, useCotBang } from "../../luoi-mua-hang";
import { ThanhCongCuMuaHang, tabCoSo, type TabDem } from "../../loc-mua-hang/ThanhCongCuMuaHang";
import { MOC_DON_MUA_HANG, type LocDonMuaHang } from "../../loc-mua-hang/dieu-kien-don-mua";
import { TT_DON, TT_TIEN } from "../../trang-thai-mua";
import type { PurchaseTab, StatusFilter } from "../shared/types";

/** Chip Hàng luôn hiện; Bị trả lại / Đã huỷ chỉ hiện khi có đơn (hoặc đang chọn). */
const TAB_CHINH = ["draft", "pending_approval", "approved", "purchased", "partially_received", "received"];

/** Bốn chip nhóm Tiền — luôn hiện đủ, kể cả số 0, để Kế toán và Thu mua nhìn cùng một hàng chip. */
export function tabTien(dem: Record<string, number> | null | undefined): TabDem[] {
  return (Object.keys(TT_TIEN) as NhomTien[]).map((k) => ({
    value: k,
    label: TT_TIEN[k].label,
    mau: TT_TIEN[k].mau,
    count: dem ? dem[k] ?? 0 : undefined,
  }));
}

export function PhieuListTab({
  coYcQuaHan,
  choMua,
  setTab,
  q,
  setQ,
  page,
  setPage,
  status,
  setStatus,
  tien,
  setTien,
  demTheoTab,
  demTien,
  ky,
  onKy,
  dieuKien,
  loc,
  onLoc,
  xoaLocThem,
  coLocThem,
  loading,
  listError,
  load,
  rows,
  selected,
  setSelectedId,
  openYcmh,
  onMoLenh,
  total,
  size,
  onSize,
}: {
  coYcQuaHan: boolean;
  choMua: { soLuong: number; somNhat: string | null };
  setTab: Dispatch<SetStateAction<PurchaseTab>>;
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  status: StatusFilter;
  setStatus: Dispatch<SetStateAction<StatusFilter>>;
  tien: NhomTien | "";
  setTien: Dispatch<SetStateAction<NhomTien | "">>;
  /** Số đơn theo trạng thái Hàng — máy chủ đếm sau lọc, trước hai nhóm (`tat_ca` = Tất cả). */
  demTheoTab: Record<string, number> | null;
  demTien: Record<string, number> | null;
  ky: KyDS;
  onKy: (k: KyDS) => void;
  dieuKien: DieuKien<LocDonMuaHang>[];
  loc: LocDonMuaHang;
  onLoc: (l: LocDonMuaHang) => void;
  /** Bỏ kỳ + điều kiện của thanh lọc (ô tìm và chip do tab này tự bỏ). */
  xoaLocThem: () => void;
  coLocThem: boolean;
  loading: boolean;
  listError: string | null;
  load: () => void;
  rows: PurchaseRequestRow[];
  selected: PurchaseRequestRow | null;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  /** Thiếu = không có ô Xem màn Yêu cầu mua hàng ⇒ mã chỉ hiện dạng chữ. */
  openYcmh?: (code: string) => void;
  onMoLenh?: (l: MuaChoLenh) => void;
  total: number;
  size: number;
  onSize: (size: number) => void;
}) {
  // Cột của lưới — nhớ riêng cho màn Mua hàng (Kế toán › Đơn mua hàng nhớ khoá khác).
  const cot = useCotBang("mh-don", COT_DON);
  const coLoc = q.trim() !== "" || status !== "all" || tien !== "" || coLocThem;
  const xoaLoc = () => {
    setQ("");
    setStatus("all");
    setTien("");
    xoaLocThem();
    setPage(1);
  };
  return (
    <>
      {/* Dải nhắc CHỈ hiện khi có yêu cầu đã quá ngày cần hàng — lời cảnh báo, không phải thanh
          trạng thái. Ngày bình thường không render gì cả (xem `coYcQuaHan`). */}
      {coYcQuaHan && (
        <div className="purchase__nhac" role="status">
          <Icon name="alert" size={14} />
          <span>
            <b>{choMua.soLuong}</b> yêu cầu đang chờ, sớm nhất cần {fmtDate(choMua.somNhat)}
          </span>
          <button type="button" className="purchase__nhac-xem" onClick={() => setTab("yeu-cau")}>
            Xem
          </button>
        </div>
      )}

      <ThanhCongCuMuaHang
        tabs={tabCoSo(TAB_CHINH, TT_DON, demTheoTab, status)}
        tab={status}
        ariaTabs="Lọc trạng thái hàng của đơn"
        nhanNhom="Hàng"
        onTab={(v) => {
          setStatus(v as StatusFilter);
          setPage(1);
        }}
        nhomPhu={{
          nhan: "Tiền",
          tabs: tabTien(demTien),
          tab: tien,
          boChon: "",
          aria: "Lọc tình trạng tiền của đơn",
          onTab: (v) => {
            setTien(v as NhomTien | "");
            setPage(1);
          },
        }}
        q={q}
        onQ={(v) => {
          setQ(v);
          setPage(1);
        }}
        placeholder="Tìm mã đơn, nhà cung cấp, mã yêu cầu…"
        ky={ky}
        moc={MOC_DON_MUA_HANG}
        onKy={onKy}
        dieuKien={dieuKien}
        loc={loc}
        onLoc={onLoc}
        chonCot={<ChonCotBang b={cot} />}
      />

      <BangDonMua
        cot={cot}
        rows={rows}
        loading={loading}
        loi={listError}
        onThuLai={load}
        chonId={selected?.id ?? null}
        onChon={(id) => setSelectedId(id)}
        openYcmh={openYcmh}
        onMoLenh={onMoLenh}
        coLoc={coLoc}
        onXoaLoc={xoaLoc}
        goiYTrong="Sang tab Yêu cầu chờ xử lý để chọn món rồi lập đơn mua."
        total={total}
        page={page}
        size={size}
        onPage={setPage}
        onSize={onSize}
      />
    </>
  );
}
