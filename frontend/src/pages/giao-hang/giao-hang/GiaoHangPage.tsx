// Màn Giao hàng — docs/prd-giao-hang.md §10.
//
// BA TAB, MỖI TAB MỘT Ô QUYỀN (luật "một ô = một tab", chốt 15/08/2026):
//   Đơn giao hàng          ← can_read        (tab mặc định)
//   Yêu cầu giao           ← can_plan
//   Nhân viên giao hàng    ← can_view_drivers
//
// Phạm vi LỌC DÒNG chứ không ẩn tab — máy chủ đã lọc, FE không tự suy lại. Và trạng thái của
// YÊU CẦU do máy chủ tính (hàm của các lần giao), FE chỉ hiển thị: tính lại ở đây là hai nơi
// hiểu khác nhau.
//
// Tab "Đơn giao hàng" là BẢNG mỗi dòng một lượt xe / một lần nhà gia công giao thẳng / một chuyến
// ngoài lượt (06/10/2026); bấm dòng mở ngăn chi tiết `NganLuot` (lộ trình, chứng từ từng đơn,
// lịch sử). Nút bước kế tiếp của cả lượt nằm ngay trên dòng.
//
// Shell (tách từ pages/GiaoHangPage.tsx): state + `load()` + `moChiTiet()` + bộ tab + chỗ mount ba
// bảng, drawer chi tiết và ba hộp thoại.
import { useCallback, useEffect, useState } from "react";
import type {
  BangGiaoItem,
  DeliveryDriver,
  DeliveryRequest,
  DeliveryRequestDetail,
  DeliveryTrip,
} from "../../../api/client";
import { api } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { useCan } from "../../../auth/permissions";
import { Button } from "../../../components/Button";
import { Icon } from "../../../components/Icons";
import { PhanTrangDayDu } from "../../../components/PhanTrangDayDu";
import { DrawerChiTiet } from "./components/DrawerChiTiet";
import { NganLuot } from "./components/NganLuot";
import { DialogDoiChuyen } from "./modals/DialogDoiChuyen";
import { DialogKetQua } from "./modals/DialogKetQua";
import { DialogLenKeHoach } from "./modals/DialogLenKeHoach";
import { DialogYeuCauXuatKho } from "./modals/DialogYeuCauXuatKho";
import { ThanhLoc } from "../../thanh-loc/ThanhLoc";
import { thamSoKy } from "../../thanh-loc/ky-danh-sach";
import { useLocMan } from "../../thanh-loc/useLocMan";
import {
  LOC_GH_TRONG,
  MOC_DON,
  MOC_YC,
  locGHLenUrl,
  locGHTuUrl,
  thamSoLocDon,
  thamSoLocYC,
  useDieuKienDonGiao,
  useDieuKienYeuCau,
} from "./shared/dieu-kien-giao-hang";
import { BangChoLenKeHoach } from "./tabs/BangChoLenKeHoach";
import { BangKeHoach, khoaKhoi } from "./tabs/BangKeHoach";
import type { BuocLuot, FormLuot } from "./shared/helpers";
import { BangNhanVien } from "./tabs/BangNhanVien";
import type { TabId } from "./shared/types";
import "../../rebuild-catalog.css";
import "../../giao-hang.css";
import "../../kho-request.css";

// Phân trang máy chủ (CLAUDE.md/best-practice, khớp Đơn hàng bán + Tính giá). Tab Đơn giao hàng
// đếm theo KHỐI (một lượt = một khối), không theo đơn. Đây là cỡ MẶC ĐỊNH — ô Dòng/trang đổi được.
const PAGE_SIZE = 25;
// Tab "Yêu cầu giao" lọc "chờ lên kế hoạch" ở MÁY CHỦ (NOT EXISTS chuyến, 06/10/2026) nên trang
// hoá + đếm thật như tab Đơn giao hàng; bỏ cửa sổ 200 dòng cắt ở trình duyệt.

/** Chữ ô tìm gửi máy chủ chậm một nhịp — gõ "DH-0012" không bắn bảy lượt tải cả bảng khối. */
function useTre(chu: string, ms = 300): string {
  const [tre, setTre] = useState(chu);
  useEffect(() => {
    const h = window.setTimeout(() => setTre(chu), ms);
    return () => window.clearTimeout(h);
  }, [chu, ms]);
  return tre;
}

export default function GiaoHangPage({ eventTick = 0 }: { eventTick?: number }) {
  const { token } = useAuth();
  const can = useCan();
  const canPlan = can("giao_hang", "plan");
  const canViewDrivers = can("giao_hang", "view_drivers");
  const canWrite = can("giao_hang", "create");
  const canCancel = can("giao_hang", "cancel");

  const [tab, setTab] = useState<TabId>("ke-hoach");
  const [khoi, setKhoi] = useState<BangGiaoItem[]>([]);
  const [khoiPage, setKhoiPage] = useState(1);
  const [khoiSize, setKhoiSize] = useState(PAGE_SIZE);
  const [khoiTotal, setKhoiTotal] = useState(0);
  const [soDon, setSoDon] = useState(0);
  const [choLenKeHoachRows, setChoLenKeHoachRows] = useState<DeliveryRequest[]>([]);
  const [reqPage, setReqPage] = useState(1);
  const [reqSize, setReqSize] = useState(PAGE_SIZE);
  const [reqTotal, setReqTotal] = useState(0);
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [detail, setDetail] = useState<DeliveryRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Lên đơn: MỘT yêu cầu (nút ở dòng) hoặc NHIỀU yêu cầu chung một lượt xe (tick + "Lên lượt xe").
  const [planFor, setPlanFor] = useState<
    { requests: DeliveryRequest[]; theoLuot: boolean } | null
  >(null);
  // Lượt vừa lập — khối của nó được làm nổi + cuộn tới (bước kế tiếp: gửi yêu cầu xuất kho).
  const [luotMoi, setLuotMoi] = useState<number | null>(null);
  const [ketQuaFor, setKetQuaFor] = useState<DeliveryTrip | null>(null);
  const [xuatKhoFor, setXuatKhoFor] = useState<DeliveryTrip | null>(null);
  const [doiFor, setDoiFor] = useState<DeliveryTrip | null>(null);
  // Ngăn chi tiết của MỘT dòng tab Đơn giao hàng. Giữ bản chụp cuối: bảng tải lại (SSE, lọc) mà
  // dòng rơi khỏi trang thì ngăn vẫn đứng, không tự đóng giữa lúc người ta đang đọc.
  const [ngan, setNgan] = useState<{ khoa: string; form: FormLuot | null } | null>(null);
  const [nganItem, setNganItem] = useState<BangGiaoItem | null>(null);
  // Báo của nút bước kế tiếp bấm ngay trên dòng bảng (ngăn có dòng báo riêng của nó).
  const [tin, setTin] = useState<string | null>(null);
  const [canhBaoDong, setCanhBaoDong] = useState<string[]>([]);
  // Tháng đang xem ở tab Nhân viên. `YYYY-MM` theo giờ ĐỊA PHƯƠNG — `toISOString()` trả UTC nên
  // đầu/cuối tháng có thể nhảy sang tháng bên cạnh.
  const [thang, setThang] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  // Kỳ + điều kiện của HAI tab danh sách — ghi lên URL (`?man=giao-hang`), nhớ khi sang màn khác.
  const [locMan, setLocMan] = useLocMan("giao-hang", LOC_GH_TRONG, locGHTuUrl, locGHLenUrl);
  const dkDon = useDieuKienDonGiao();
  const dkYc = useDieuKienYeuCau();
  const [timDon, setTimDon] = useState("");
  const [timYc, setTimYc] = useState("");
  const qDon = useTre(timDon.trim());
  const qYc = useTre(timYc.trim());
  const khoaDon = JSON.stringify({
    q: qDon || undefined, ...thamSoKy(locMan.kyDon), ...thamSoLocDon(locMan.locDon),
  });
  const khoaYc = JSON.stringify({
    q: qYc || undefined, ...thamSoKy(locMan.kyYc), ...thamSoLocYC(locMan.locYc),
  });
  // Đổi lọc ⇒ về trang 1 (đang ở trang 5 mà lọc còn 2 trang là bảng trống).
  useEffect(() => setKhoiPage(1), [khoaDon]);
  useEffect(() => setReqPage(1), [khoaYc]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const viec: Promise<unknown>[] = [
      api.giaoHang
        .bangGiao(token, { page: khoiPage, size: khoiSize, loc: JSON.parse(khoaDon) })
        .then((r) => {
          setKhoi(r.items);
          setKhoiTotal(r.total);
          setSoDon(r.so_don);
        }),
      api.giaoHang
        .requests(token, {
          choLenKeHoach: true, page: reqPage, size: reqSize, loc: JSON.parse(khoaYc),
        })
        .then((r) => {
          setReqTotal(r.total);
          setChoLenKeHoachRows(r.items);
        }),
    ];
    // Tab nào không có ô thì KHÔNG gọi — gọi rồi nuốt 403 là che mất lỗi cấu hình thật.
    if (canViewDrivers)
      viec.push(api.giaoHang.nhanVien(token, { thang }).then((r) => setDrivers(r.items)));
    Promise.all(viec)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được dữ liệu"))
      .finally(() => setLoading(false));
    // `thang` PHẢI có ở đây — thiếu thì đổi tháng mà bảng đứng im.
  }, [token, canViewDrivers, thang, khoiPage, khoiSize, reqPage, reqSize, khoaDon, khoaYc]);

  // `eventTick` tăng mỗi sự kiện SSE ⇒ bảng tự tải lại. Tài xế không phải F5 để biết kho đã
  // soạn xong hàng chưa (CLAUDE.md: gửi/thông báo nội bộ phải tức thì).
  useEffect(() => {
    load();
  }, [load, eventTick]);

  useEffect(() => {
    if (!ngan) return;
    const it = khoi.find((k) => khoaKhoi(k) === ngan.khoa);
    if (it) setNganItem(it);
  }, [ngan, khoi]);

  useEffect(() => {
    if (!tin) return;
    const h = window.setTimeout(() => setTin(null), 8000);
    return () => window.clearTimeout(h);
  }, [tin]);

  // Nổi một lúc rồi thôi — để lâu thì dòng đó trông như "có gì bất thường".
  useEffect(() => {
    if (luotMoi == null) return;
    const h = window.setTimeout(() => setLuotMoi(null), 6000);
    return () => window.clearTimeout(h);
  }, [luotMoi]);

  /** Gọi một hành động rồi tải lại; lỗi hiện lên banner thay vì nuốt im. Trả Promise để nút tự
   *  khoá tới khi lệnh xong (bấm hai lần liền là hai lệnh). */
  const lam = useCallback(
    (viec: Promise<unknown>, loiMacDinh: string) =>
      viec
        .then(load)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : loiMacDinh)),
    [load],
  );

  const lamLuot = useCallback(
    (b: Extract<BuocLuot, { lam: unknown }>) => {
      if (!token) return Promise.resolve();
      setTin(null);
      setCanhBaoDong([]);
      setError(null);
      return b.lam(token)
        .then((r) => {
          setTin(b.bao(r));
          setCanhBaoDong(r.canh_bao);
          load();
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không thao tác được"));
    },
    [token, load],
  );

  const moNgan = (it: BangGiaoItem, form?: FormLuot) => {
    setNgan({ khoa: khoaKhoi(it), form: form ?? null });
    setNganItem(it);
  };
  const viTriNgan = ngan ? khoi.findIndex((k) => khoaKhoi(k) === ngan.khoa) : -1;

  const moChiTiet = useCallback(
    (requestId: number) => {
      if (!token) return;
      api.giaoHang
        .request(token, requestId)
        .then(setDetail)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không mở được chi tiết"));
    },
    [token],
  );

  const tabs: { id: TabId; label: string; count: number; hien: boolean }[] = [
    { id: "ke-hoach", label: "Đơn giao hàng", count: soDon, hien: true },
    {
      id: "cho-len-ke-hoach",
      label: "Yêu cầu giao",
      count: reqTotal,
      hien: canPlan,
    },
    { id: "nhan-vien", label: "Nhân viên giao hàng", count: drivers.length, hien: canViewDrivers },
  ];
  const tabHien = tabs.filter((t) => t.hien);
  const tabDang = tabHien.some((t) => t.id === tab) ? tab : "ke-hoach";

  return (
    // `.rc` là KHUNG TRANG (max-width 1200 · canh giữa · padding) — màn top-level nào cũng phải
    // có. `.kho-list` chỉ là móc chỉnh bảng của ba màn Kho, KHÔNG mang layout: để mình nó thì nội
    // dung dán sát hai mép màn hình. Ba màn Kho không lộ ra lỗi này vì `KhoPage` bọc `.rc` sẵn.
    <main className="rc">
      <header className="rc__head">
        <div className="rc__headrow">
          <h1 className="rc__title">Giao hàng</h1>
        </div>
      </header>

      <div className="rc__toolbar">
        <div className="gh-seg" role="tablist">
          {tabHien.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tabDang === t.id}
              className={`gh-seg__btn${tabDang === t.id ? " is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <span className="gh-seg__n">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="rc__spacer" />
        <Button variant="ghost" onClick={load}>
          <Icon name="refresh" size={16} /> Tải lại
        </Button>
      </div>

      {/* Ô tìm + kỳ + điều kiện của tab đang mở — mỗi tab một bộ riêng (mốc ngày, điều kiện khác). */}
      {tabDang === "ke-hoach" && (
        <div className="rc__toolbar tl-thanh">
          <div className="rc__search-wrapper">
            <Icon name="search" size={15} className="rc__search-icon" />
            <input
              className="rc__search"
              value={timDon}
              onChange={(e) => setTimDon(e.target.value)}
              placeholder="Tìm mã yêu cầu / mã đơn / khách / mã lượt…"
              aria-label="Tìm đơn giao hàng"
            />
          </div>
          <ThanhLoc
            ky={locMan.kyDon}
            moc={MOC_DON}
            onKy={(kyDon) => setLocMan({ ...locMan, kyDon })}
            dieuKien={dkDon}
            loc={locMan.locDon}
            onLoc={(locDon) => setLocMan({ ...locMan, locDon })}
          />
        </div>
      )}
      {tabDang === "cho-len-ke-hoach" && (
        <div className="rc__toolbar tl-thanh">
          <div className="rc__search-wrapper">
            <Icon name="search" size={15} className="rc__search-icon" />
            <input
              className="rc__search"
              value={timYc}
              onChange={(e) => setTimYc(e.target.value)}
              placeholder="Tìm mã yêu cầu / mã đơn / khách…"
              aria-label="Tìm yêu cầu giao"
            />
          </div>
          <ThanhLoc
            ky={locMan.kyYc}
            moc={MOC_YC}
            onKy={(kyYc) => setLocMan({ ...locMan, kyYc })}
            dieuKien={dkYc}
            loc={locMan.locYc}
            onLoc={(locYc) => setLocMan({ ...locMan, locYc })}
          />
        </div>
      )}

      {error && (
        <div className="banner banner--error" role="alert" style={{ marginBottom: "var(--sp-4)" }}>
          <span>{error}</span>
        </div>
      )}

      {tabDang === "ke-hoach" && tin && (
        <div className="banner banner--success" role="status" style={{ marginBottom: "var(--sp-4)" }}>{tin}</div>
      )}
      {tabDang === "ke-hoach" && canhBaoDong.map((c) => (
        <div key={c} className="banner banner--warn" role="status" style={{ marginBottom: "var(--sp-4)" }}>{c}</div>
      ))}

      {tabDang === "ke-hoach" && token && (
        <BangKeHoach items={khoi} loading={loading} coLoc={khoaDon !== "{}"}
          canPlan={canPlan} canWrite={canWrite} luotMoi={luotMoi}
          dangMo={ngan?.khoa ?? null} onMoNgan={moNgan} onLamLuot={lamLuot}
          onKetQua={canWrite ? setKetQuaFor : undefined}
          onGuiDeNghi={canPlan ? setXuatKhoFor : undefined}
          onDaLay={canWrite
            ? (t) => lam(api.giaoHang.daLayHang(token, t.id), "Không ghi được đã lấy hàng")
            : undefined}
          onBatDau={canWrite
            ? (t) => lam(api.giaoHang.batDauGiao(token, t.id), "Không bắt đầu giao được")
            : undefined}
          onDaTra={canWrite
            ? (t) => lam(api.giaoHang.daTraHang(token, t.id), "Không lập được phiếu trả kho")
            : undefined}
        />
      )}
      {/* Máy chủ cắt trang theo KHỐI (một lượt xe = một khối, chuyến ngoài lượt cũng một khối) nên
          tổng & số trang phải đếm khối — đếm theo `soDon` thì "tổng" và "số trang" nói hai đại lượng
          khác nhau. Số đơn giao vẫn nói kèm ở ghi chú. */}
      {tabDang === "ke-hoach" && !error && khoiTotal > 0 && (
        <PhanTrangDayDu
          trang={khoiPage}
          size={khoiSize}
          tong={khoiTotal}
          soDong={khoi.length}
          onTrang={setKhoiPage}
          onSize={(n) => {
            setKhoiSize(n);
            setKhoiPage(1);
          }}
          loading={loading}
          donVi="lượt giao"
          ghiChu={`gồm ${soDon} đơn giao`}
          ariaLabel="Phân trang đơn giao hàng"
        />
      )}

      {tabDang === "cho-len-ke-hoach" && (
        <BangChoLenKeHoach rows={choLenKeHoachRows} loading={loading} coLoc={khoaYc !== "{}"}
          onMo={moChiTiet}
          onLenKeHoach={(r) => setPlanFor({ requests: [r], theoLuot: false })}
          onLenLuot={(rs) => setPlanFor({ requests: rs, theoLuot: true })} />
      )}
      {tabDang === "cho-len-ke-hoach" && !error && reqTotal > 0 && (
        <PhanTrangDayDu
          trang={reqPage}
          size={reqSize}
          tong={reqTotal}
          soDong={choLenKeHoachRows.length}
          onTrang={setReqPage}
          onSize={(n) => {
            setReqSize(n);
            setReqPage(1);
          }}
          loading={loading}
          donVi="yêu cầu"
          ariaLabel="Phân trang yêu cầu giao"
        />
      )}

      {tabDang === "nhan-vien" && (
        <BangNhanVien rows={drivers} loading={loading} thang={thang} onDoiThang={setThang} />
      )}

      {detail && (
        <DrawerChiTiet
          detail={detail}
          canCancel={canCancel}
          onClose={() => setDetail(null)}
          onHuy={
            canCancel && token
              ? (lyDo) =>
                  api.giaoHang
                    .cancelRequest(token, detail.request.id, lyDo)
                    .then(() => {
                      setDetail(null);
                      load();
                    })
                    .catch((e: unknown) =>
                      setError(e instanceof Error ? e.message : "Không huỷ được"))
              : undefined
          }
        />
      )}

      {/* Ngăn đứng TRƯỚC ba hộp thoại trong DOM: cùng z-index thì hộp mở sau (Nhập kết quả, Đổi /
          huỷ…) nằm trên ngăn. */}
      {ngan && nganItem && token && (
        <NganLuot
          key={ngan.khoa}
          item={nganItem}
          token={token}
          canPlan={canPlan}
          canWrite={canWrite}
          formDau={ngan.form}
          onDoi={load}
          onDong={() => setNgan(null)}
          len={viTriNgan > 0 ? () => moNgan(khoi[viTriNgan - 1]) : undefined}
          xuong={viTriNgan >= 0 && viTriNgan < khoi.length - 1 ? () => moNgan(khoi[viTriNgan + 1]) : undefined}
          onKetQua={canWrite ? setKetQuaFor : undefined}
          onGuiDeNghi={canPlan ? setXuatKhoFor : undefined}
          onDaLay={canWrite
            ? (t) => lam(api.giaoHang.daLayHang(token, t.id), "Không ghi được đã lấy hàng")
            : undefined}
          onBatDau={canWrite
            ? (t) => lam(api.giaoHang.batDauGiao(token, t.id), "Không bắt đầu giao được")
            : undefined}
          onDaTra={canWrite
            ? (t) => lam(api.giaoHang.daTraHang(token, t.id), "Không lập được phiếu trả kho")
            : undefined}
          onDoiChuyen={canPlan ? setDoiFor : undefined}
        />
      )}

      {planFor && token && (
        <DialogLenKeHoach
          requests={planFor.requests}
          theoLuot={planFor.theoLuot}
          token={token}
          onClose={() => setPlanFor(null)}
          onXong={(luotId) => {
            setPlanFor(null);
            // Lên lượt xong ⇒ về tab Đơn giao hàng, dòng lượt đó nổi lên: bước kế tiếp (gửi yêu
            // cầu xuất kho cả lượt) nằm ngay trên dòng.
            if (luotId != null) {
              setTab("ke-hoach");
              setKhoiPage(1);
              setLuotMoi(luotId);
            }
            load();
          }}
        />
      )}

      {xuatKhoFor && token && (
        <DialogYeuCauXuatKho
          trip={xuatKhoFor}
          token={token}
          onClose={() => setXuatKhoFor(null)}
          onXong={() => {
            setXuatKhoFor(null);
            load();
          }}
        />
      )}

      {doiFor && token && (
        <DialogDoiChuyen
          trip={doiFor}
          token={token}
          onClose={() => setDoiFor(null)}
          onXong={() => {
            setDoiFor(null);
            load();
          }}
        />
      )}

      {ketQuaFor && token && (
        <DialogKetQua
          trip={ketQuaFor}
          token={token}
          onClose={() => setKetQuaFor(null)}
          onXong={() => {
            setKetQuaFor(null);
            load();
          }}
        />
      )}
    </main>
  );
}
