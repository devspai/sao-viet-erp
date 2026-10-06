/** Màn TÀI KHOẢN NGÂN HÀNG (đặc tả TK-1 … TK-4, A.5, A.16–A.18) — dựng trên bộ khung chung kế toán.
 *
 *  Khuôn trang: đầu trang (nút chính rust "Thêm tài khoản") → thanh lọc chung `ThanhLoc` (kỳ theo ngày
 *  giao dịch — thu/chi trên thẻ tính trong kỳ; điều kiện Ngân hàng, Trạng thái lọc ở máy chủ) → lưới
 *  thẻ tài khoản, thẻ cuối viền đứt "Thêm tài khoản". Tài khoản ngừng dùng gom cuối.
 *  Bấm thẻ mở ngăn xem (TK-2); Sửa mở form (TK-3) chồng lên ngăn; Ngừng dùng / Dùng lại hỏi một lần
 *  (TK-4) rồi gọi `toggle-active`.
 *
 *  Lỗi 1 (đã sửa): trang chỉ tải danh sách tài khoản + thu/chi trong kỳ — KHÔNG tải tài khoản / danh
 *  sách nhà cung cấp (thủ quỹ chỉ có quyền xem tài khoản từng bị 403). Lỗi 14: tab tài khoản nhà cung
 *  cấp chết đã gỡ hẳn.
 *
 *  Thu/chi trong kỳ: máy chủ BỎ tài khoản không có phiếu ⇒ thẻ điền 0. Kỳ có khoảng ngày thì gọi thêm
 *  một lần cho cùng kỳ năm trước; "Tất cả" = từ đầu sổ tới hôm nay, không so. Sự kiện đẩy (`eventTick`) nạp lại cả trang lẫn ngăn đang mở.
 */
import { Ban, CircleDot, Landmark, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, api } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { useCan } from "../../../auth/permissions";
import type { NavigateFn } from "../../../components/AppShell";
import { BangRong } from "../shared/BangPhieu";
import { HopHoi } from "../shared/HopHoi";
import { cungKyCua, kyKeToanLenUrl, kyKeToanTuUrl, khoangSo } from "../shared/kyKeToan";
import { ThanhLoc } from "../../thanh-loc/ThanhLoc";
import type { KyDS } from "../../thanh-loc/ky-danh-sach";
import type { DieuKien, GiaTriDK } from "../../thanh-loc/thanh-loc";
import { useLocMan } from "../../thanh-loc/useLocMan";
import { NganTaiKhoan } from "./components/NganTaiKhoan";
import { TheTaiKhoan } from "./components/TheTaiKhoan";
import { BankAccountModal } from "./modals/BankAccountModal";
import { MAN, soLieuCua, soLieuTheoId, tieuDeTaiKhoan, xepTaiKhoan } from "./shared/helpers";
import type { SoLieuTk, TaiKhoan } from "./shared/types";
import "../ke-toan.css";

const khongDi: NavigateFn = () => undefined;

/** Kỳ ở màn này là kỳ GIAO DỊCH (thu/chi qua tài khoản) — một mốc, mặc định "Tháng này" như cũ. */
const MOC_TK: [string, string][] = [["gd", "Ngày giao dịch"]];
type LocTk = { ngan_hang?: string; trang_thai?: "dang_dung" | "ngung" };
type LocManTk = { ky: KyDS; loc: LocTk };
const LOC_MAN_TRONG: LocManTk = { ky: { loai: "thang", moc: "gd" }, loc: {} };
const docLocMan = (p: URLSearchParams): LocManTk => {
  const tt = p.get("tt");
  return {
    ky: kyKeToanTuUrl(p, MOC_TK, "gd", "thang"),
    loc: {
      ngan_hang: p.get("nh")?.trim().slice(0, 200) || undefined,
      trang_thai: tt === "dang_dung" || tt === "ngung" ? tt : undefined,
    },
  };
};
const ghiLocMan = (t: LocManTk) => ({ ...kyKeToanLenUrl(t.ky, "gd", "thang"), nh: t.loc.ngan_hang, tt: t.loc.trang_thai });

const TRANG_THAI: GiaTriDK[] = [
  { value: "dang_dung", nhan: "Đang dùng" },
  { value: "ngung", nhan: "Ngừng dùng" },
];

/** Ô "Ngân hàng": các ngân hàng đang có tài khoản công ty, kèm số tài khoản (máy chủ đếm). */
function useNganHangLoc(token: string | null | undefined, tick: number): GiaTriDK[] {
  const [ds, setDs] = useState<GiaTriDK[]>([]);
  useEffect(() => {
    if (!token) return;
    api.accounting
      .nganHangLoc(token)
      .then((r) => setDs(r.map((o) => ({ value: o.ten, nhan: o.ten, so: o.so }))))
      .catch(() => setDs([]));
  }, [token, tick]);
  return ds;
}

export function AccountingBankAccountsPage({
  navigate = khongDi,
  eventTick = 0,
}: {
  navigate?: NavigateFn;
  eventTick?: number;
}) {
  const { token } = useAuth();
  const can = useCan();
  // Khoá RIÊNG của màn Tài khoản ngân hàng (tách 10/08/2026) — cùng luật với máy chủ.
  const coSua = can("tk_ngan_hang", "update");
  const xemChi = can("phieu_chi", "read");
  const xemThu = can("phieu_thu", "read");

  const [locMan, setLocMan] = useLocMan(MAN, LOC_MAN_TRONG, docLocMan, ghiLocMan);
  const khoaKy = JSON.stringify(locMan.ky);
  const ky = useMemo(() => khoangSo(locMan.ky), [khoaKy]); // eslint-disable-line react-hooks/exhaustive-deps
  const cungKy = useMemo(() => cungKyCua(locMan.ky), [khoaKy]); // eslint-disable-line react-hooks/exhaustive-deps
  const { ngan_hang: nganHang, trang_thai: trangThai } = locMan.loc;
  const coLoc = !!nganHang || !!trangThai;
  // Số lần đổi danh sách tài khoản (thêm / sửa / ngừng) — để ô "Ngân hàng" nạp lại số đếm.
  const [doiTk, setDoiTk] = useState(0);
  const nganHangLoc = useNganHangLoc(token, doiTk + eventTick);
  const dieuKien = useMemo<DieuKien<LocTk>[]>(
    () => [
      {
        khoa: "ngan_hang", nhan: "Ngân hàng", icon: Landmark, kieu: "mot", tim: true, giaTri: nganHangLoc,
        doc: (l) => l.ngan_hang,
        ghi: (l, v) => ({ ...l, ngan_hang: v }),
      },
      {
        khoa: "trang_thai", nhan: "Trạng thái", icon: CircleDot, kieu: "mot", giaTri: TRANG_THAI,
        doc: (l) => l.trang_thai,
        ghi: (l, v) => ({ ...l, trang_thai: v as LocTk["trang_thai"] }),
      },
    ],
    [nganHangLoc],
  );

  const [rows, setRows] = useState<TaiKhoan[] | null>(null);
  const [soLieu, setSoLieu] = useState<Map<number, SoLieuTk> | null>(null);
  const [soCung, setSoCung] = useState<Map<number, SoLieuTk> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);

  const lanTai = useRef(0);
  const load = useCallback(() => {
    if (!token) return;
    const lan = ++lanTai.current;
    setLoading(true);
    Promise.all([
      api.accounting.companyAccounts(token, false, null, { ngan_hang: nganHang, trang_thai: trangThai }),
      api.accounting.thongKeTaiKhoan(token, { tu_ngay: ky.tu, den_ngay: ky.den }),
      cungKy ? api.accounting.thongKeTaiKhoan(token, { tu_ngay: cungKy.tu, den_ngay: cungKy.den }) : null,
    ])
      .then(([ds, tk, tkCung]) => {
        if (lan !== lanTai.current) return;
        setRows(ds);
        setSoLieu(soLieuTheoId(tk));
        setSoCung(tkCung ? soLieuTheoId(tkCung) : null);
        setLoi(null);
      })
      .catch((err) => {
        if (lan !== lanTai.current) return;
        // Tải hỏng thì nói rõ — không để trống mà trông như "chưa có tài khoản".
        setLoi(err instanceof ApiError ? err.message : "Không tải được tài khoản ngân hàng.");
      })
      .finally(() => {
        if (lan === lanTai.current) setLoading(false);
      });
  }, [token, ky, cungKy, nganHang, trangThai]);

  useEffect(() => {
    load();
  }, [load, eventTick]);

  const ds = rows ? xepTaiKhoan(rows) : [];
  const [moId, setMoId] = useState<number | null>(null);
  const viTri = moId == null ? -1 : ds.findIndex((r) => r.id === moId);
  const dangMo = viTri >= 0 ? ds[viTri] : null;

  const [form, setForm] = useState<{ editing: TaiKhoan | null; tang: number } | null>(null);
  const moThem = () => setForm({ editing: null, tang: 0 });

  const [hoi, setHoi] = useState<TaiKhoan | null>(null);
  const [loiHoi, setLoiHoi] = useState<string | null>(null);
  const [dangDoi, setDangDoi] = useState(false);
  const moHoi = (r: TaiKhoan) => {
    setLoiHoi(null);
    setHoi(r);
  };
  async function doiTrangThai() {
    if (!token || !hoi || dangDoi) return;
    setDangDoi(true);
    setLoiHoi(null);
    try {
      await api.accounting.toggleCompanyAccount(token, hoi.id);
      setHoi(null);
      load();
      setDoiTk((n) => n + 1);
    } catch (err) {
      setLoiHoi(err instanceof ApiError ? err.message : "Không đổi được trạng thái tài khoản.");
    } finally {
      setDangDoi(false);
    }
  }

  return (
    <main className="kt-trang">
      <header className="kt-ph">
        <div>
          <h1>Tài khoản ngân hàng</h1>
          <p>Tài khoản công ty dùng khi lập phiếu chuyển khoản.</p>
        </div>
        {coSua && (
          <div className="kt-ph__nut">
            <button type="button" className="kt-btn kt-btn--chinh" onClick={moThem}>
              <Plus size={16} aria-hidden="true" />
              Thêm tài khoản
            </button>
          </div>
        )}
      </header>

      <div className="kt-tb tl-thanh">
        <ThanhLoc ky={locMan.ky} moc={MOC_TK} onKy={(k) => setLocMan({ ...locMan, ky: k })} dieuKien={dieuKien}
          loc={locMan.loc} onLoc={(l) => setLocMan({ ...locMan, loc: l })} />
      </div>

      {loi || rows == null || rows.length === 0 ? (
        <BangRong
          loading={loading && rows == null && !loi}
          loi={loi}
          coLoc={coLoc}
          onTaiLai={load}
          onBoLoc={() => setLocMan({ ...locMan, loc: {} })}
          chuKhongKhop="Không có tài khoản nào khớp bộ lọc"
          onLap={coSua ? moThem : undefined}
          chuTai="Đang tải tài khoản ngân hàng…"
          chuLoi="Không tải được tài khoản ngân hàng."
          chuChuaCo={<span>Chưa có tài khoản ngân hàng nào. Thêm tài khoản để lập phiếu chuyển khoản.</span>}
          nutLap="Thêm tài khoản"
        />
      ) : (
        <div className="kt-tks">
          {ds.map((r) => (
            <TheTaiKhoan key={r.id} r={r} soLieu={soLieuCua(soLieu, r.id)} cung={soLieuCua(soCung, r.id)}
              dangXem={r.id === moId} onMo={() => setMoId(r.id)} />
          ))}
          {coSua && (
            <button type="button" className="kt-tk kt-tk--them" onClick={moThem}>
              <Plus size={22} aria-hidden="true" />
              <b>Thêm tài khoản</b>
              <span className="kt-mo">Nhập ngân hàng và số tài khoản</span>
            </button>
          )}
        </div>
      )}

      {dangMo && (
        <NganTaiKhoan
          key={dangMo.id}
          taiKhoan={dangMo}
          soLieu={soLieuCua(soLieu, dangMo.id)}
          ky={ky}
          eventTick={eventTick}
          coSua={coSua}
          quyen={{ xemChi, xemThu }}
          navigate={navigate}
          len={viTri > 0 ? () => setMoId(ds[viTri - 1].id) : undefined}
          xuong={viTri < ds.length - 1 ? () => setMoId(ds[viTri + 1].id) : undefined}
          onDong={() => setMoId(null)}
          onSua={() => setForm({ editing: dangMo, tang: 1 })}
          onDoiTrangThai={() => moHoi(dangMo)}
        />
      )}

      {form && (
        <BankAccountModal
          editing={form.editing}
          tang={form.tang}
          onDong={() => setForm(null)}
          onDaLuu={() => {
            setForm(null);
            load();
            setDoiTk((n) => n + 1);
          }}
        />
      )}

      {hoi && (
        <HopHoi
          icon={hoi.is_active ? <Ban size={18} aria-hidden="true" /> : <RotateCcw size={18} aria-hidden="true" />}
          tieuDe={`${hoi.is_active ? "Ngừng dùng" : "Dùng lại"} tài khoản ${tieuDeTaiKhoan(hoi)}?`}
          nhanChinh={hoi.is_active ? "Ngừng dùng" : "Dùng lại"}
          nhanDangLam="Đang lưu…"
          dangLam={dangDoi}
          loi={loiHoi}
          onDong={() => setHoi(null)}
          onXacNhan={() => void doiTrangThai()}
        >
          {hoi.is_active ? (
            <>
              <p>Phiếu mới sẽ không chọn được tài khoản này.</p>
              <p>Phiếu cũ vẫn giữ nguyên số tài khoản đã ghi. Muốn dùng lại thì mở tài khoản và chọn "Dùng lại".</p>
            </>
          ) : (
            <p>Phiếu mới chọn lại được tài khoản này khi lập phiếu chuyển khoản.</p>
          )}
        </HopHoi>
      )}
    </main>
  );
}
