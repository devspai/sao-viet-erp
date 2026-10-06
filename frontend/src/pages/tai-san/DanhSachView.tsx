// Tab TÀI SẢN — bảng tra cứu "xưởng đang có những gì, còn lại bao nhiêu".
//
// Tìm · lọc · phân trang đều Ở MÁY CHỦ. Kéo cả bảng về rồi `filter` trong JS thì qua trang thứ
// hai con số bắt đầu sai mà không có lỗi nào bật ra — đã bị bác đúng chuyện này ở màn khác. Dải số
// đầu màn cũng do máy chủ cộng trên cả bộ lọc (`tong_gia`, `tong_con_lai`, `dem_loai`).
//
// Thiết kế lại 05/10/2026 (`2026-10-05-tai-san-ui-ux-tung-man.md`, màn 1):
//   • Dải 4 con số đầu màn; ô "Khấu hao tháng" bấm được, nhảy sang tab tháng.
//   • MỘT nút chính "Thêm tài sản" (mua mới) + mũi tên mở 3 cách thêm — trước có hai nút ngang
//     hàng "Thêm tài sản" / "Thêm tài sản đang dùng" (Carbon: tối đa một nút chính trên thanh).
//   • 06/10/2026: Loại / Bộ phận / Trạng thái / Giá mua thành điều kiện của thanh lọc chung
//     (`ThanhLoc`, kèm số đếm máy chủ), thêm dải kỳ theo Ngày tạo / bắt đầu dùng / thôi dùng; lọc
//     ghi lên URL. Trạng thái mặc định vẫn "Đang dùng".
//   • Bỏ cột Loại và Trạng thái: lọc "Đang dùng" thì cả cột chỉ lặp một chữ. Trạng thái chỉ hiện
//     thành thẻ cạnh tên khi KHÁC đang dùng; loại thành thẻ nhỏ dưới tên.
//   • ↑ ↓ chọn dòng, Enter mở ngăn; ngăn đang mở thì ↑ ↓ đổi tài sản (Linear).
//   • Ba kiểu màn trống: chưa có gì / lọc không ra / tìm không ra — mỗi kiểu một câu một nút.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ApiError, api, type Department } from "../../api/client";
import { NHAN_LOAI, NHAN_TRANG_THAI, taiSanApi, type TaiSanRow } from "../../api/taiSan";
import { useAuth } from "../../auth/useAuth";
import { useCan } from "../../auth/permissions";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icons";
import { ImportExcelDialog } from "../../components/ImportExcelDialog";
import { trangHopLe } from "../../components/Pager";
import { PhanTrangDayDu } from "../../components/PhanTrangDayDu";
import { useDebounced } from "../../utils/useDebounced";
import { kyLenUrl, kyTuUrl, thamSoKy, type KyDS } from "../thanh-loc/ky-danh-sach";
import { ThanhLoc } from "../thanh-loc/ThanhLoc";
import { useLocMan } from "../thanh-loc/useLocMan";
import { Badge, THANG_NAY, gioCuaMoc, ngay, ngayCuaMoc, taiXuong, thangNhan, tien, tienDon } from "./chung";
import { ChiTietDialog } from "./ChiTietDialog";
import { ThemTaiSanDialog, type KieuThem } from "./ThemTaiSanDialog";
import {
  LOC_TS_TRONG, MOC_TS, locTSLenUrl, locTSTuUrl, thamSoLocTS, useDieuKienTaiSan, type LocTaiSan,
} from "./dieu-kien-tai-san";

type LocMan = { ky: KyDS; loc: LocTaiSan };
const LOC_MAN_TRONG: LocMan = { ky: { loai: "tat_ca", moc: "tao" }, loc: LOC_TS_TRONG };
const docLocMan = (p: URLSearchParams): LocMan => ({
  ky: kyTuUrl(p, MOC_TS.map(([m]) => m), "tao"),
  loc: locTSTuUrl(p),
});
const ghiLocMan = (t: LocMan) => ({ ...kyLenUrl(t.ky, "tao"), ...locTSLenUrl(t.loc) });

interface TongQuan {
  dem_loai: Record<string, number>;
  dem_trang_thai: Record<string, number>;
  tong_gia: number;
  tong_con_lai: number;
}

/** Nút "Thêm tài sản" tách đôi: thân = mua mới (việc hay làm nhất), mũi tên = menu ba cách. */
function NutThem({ onChon }: { onChon: (k: KieuThem | "excel") => void }) {
  const [mo, setMo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMo(false); };
    const phim = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setMo(false); };
    document.addEventListener("mousedown", dong);
    document.addEventListener("keydown", phim);
    return () => {
      document.removeEventListener("mousedown", dong);
      document.removeEventListener("keydown", phim);
    };
  }, [mo]);
  const chon = (k: KieuThem | "excel") => { setMo(false); onChon(k); };
  return (
    <div className="ts-tach" ref={ref}>
      <Button variant="accent" type="button" onClick={() => onChon("moi")}>
        <Icon name="plus" size={15} /> Thêm tài sản
      </Button>
      <button type="button" className="btn btn--accent ts-tach__mui" aria-haspopup="menu"
        aria-expanded={mo} aria-label="Cách thêm khác" onClick={() => setMo((v) => !v)}>
        <Icon name="chevron" size={15} />
      </button>
      {mo && (
        <div className="ts-menu__ds ts-menu__ds--phai" role="menu">
          <button type="button" role="menuitem" className="ts-menu__muc" onClick={() => chon("moi")}>
            <span>Mua mới</span><small>Máy, dụng cụ vừa mua về</small>
          </button>
          <button type="button" role="menuitem" className="ts-menu__muc" onClick={() => chon("dang_dung")}>
            <span>Đang dùng từ trước</span><small>Đã chạy trước khi dùng phần mềm</small>
          </button>
          <hr />
          <button type="button" role="menuitem" className="ts-menu__muc" onClick={() => chon("excel")}>
            <span>Nhập nhiều từ Excel</span><small>Cho danh sách máy đang dùng</small>
          </button>
        </div>
      )}
    </div>
  );
}

export function DanhSachView({ onXemThang }: { onXemThang?: () => void }) {
  const { token } = useAuth();
  const can = useCan();
  const taoDuoc = can("tai_san", "create");

  const [rows, setRows] = useState<TaiSanRow[]>([]);
  const [tong, setTong] = useState(0);
  const [tongQuan, setTongQuan] = useState<TongQuan | null>(null);
  const [khauHaoThang, setKhauHaoThang] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  /** Sổ trống hẳn (không phải chỉ lọc ra rỗng) — để màn trống nói đúng câu. */
  const [soTrong, setSoTrong] = useState(false);

  const [q, setQ] = useState("");
  const qCham = useDebounced(q, 300);
  const [locMan, setLocManGoc] = useLocMan("tai-san", LOC_MAN_TRONG, docLocMan, ghiLocMan);
  const setLocMan = (t: LocMan) => { setLocManGoc(t); setPage(1); };
  const khoaLoc = JSON.stringify({ ...thamSoKy(locMan.ky), ...thamSoLocTS(locMan.loc) });
  const trangThai = locMan.loc.trang_thai;

  const [boPhan, setBoPhan] = useState<Department[]>([]);
  const [them, setThem] = useState<KieuThem | null>(null);
  const [nhapExcel, setNhapExcel] = useState(false);
  const [xemId, setXemId] = useState<number | null>(null);
  const bangRef = useRef<HTMLTableSectionElement>(null);

  // Máy chủ tính "Đã khấu hao" tới hết tháng TRƯỚC (tháng đang chạy chưa hết thì chưa tính). Mốc
  // ấy nằm ở tooltip tiêu đề cột — chủ 08/09/2026 không muốn dòng "hết MM/YYYY" hiện ra bảng.
  const denThang = rows[0]?.luy_ke_den ? thangNhan(rows[0].luy_ke_den) : "";

  const nap = useCallback(() => {
    if (!token) return;
    setDangTai(true);
    setLoi(null);
    taiSanApi
      .danhSach(token, {
        q: qCham, ...JSON.parse(khoaLoc),
        offset: (page - 1) * size, limit: size,
      })
      .then(async (kq) => {
        setRows(kq.items);
        setTong(kq.total);
        setTongQuan({
          dem_loai: kq.dem_loai ?? {}, dem_trang_thai: kq.dem_trang_thai ?? {},
          tong_gia: kq.tong_gia ?? 0, tong_con_lai: kq.tong_con_lai ?? 0,
        });
        // Xoá nốt dòng cuối trang 3 ⇒ trang đó rỗng trơn, người dùng tưởng mất sạch dữ liệu.
        const ve = trangHopLe(page, kq.total, size);
        if (ve) setPage(ve);
        if (kq.total === 0) {
          const ca = await taiSanApi.danhSach(token, { limit: 1 });
          setSoTrong(ca.total === 0);
        } else {
          setSoTrong(false);
        }
      })
      .catch((e) => setLoi(e instanceof ApiError ? e.message : "Không tải được danh sách tài sản."))
      .finally(() => setDangTai(false));
    const [nam, thang] = THANG_NAY.split("-").map(Number);
    taiSanApi.bangThang(token, nam, thang)
      .then((b) => setKhauHaoThang(b.tong_muc_trich))
      .catch(() => setKhauHaoThang(null));
  }, [token, qCham, khoaLoc, page, size]);

  useEffect(() => { nap(); }, [nap]);

  useEffect(() => {
    if (!token) return;
    api.rbac.departments(token).then(setBoPhan).catch(() => setBoPhan([]));
  }, [token]);

  const doiLoc = (fn: () => void) => { fn(); setPage(1); };
  // "Bỏ lọc" ở màn trống: bỏ ô tìm, kỳ và mọi điều kiện — kể cả thẻ "Đang dùng" mặc định.
  const boLoc = () => doiLoc(() => { setQ(""); setLocManGoc({ ky: { loai: "tat_ca", moc: locMan.ky.moc }, loc: {} }); });
  const dieuKien = useDieuKienTaiSan(tongQuan?.dem_loai ?? {}, tongQuan?.dem_trang_thai ?? {});

  const nhanDem = trangThai === "dang_dung" ? "Đang dùng" : trangThai === "da_giam" ? "Đã thôi dùng" : "Tài sản";

  // ↑ ↓ trên bảng: chuyển con trỏ giữa các dòng; Enter mở ngăn.
  function phimDong(e: KeyboardEvent<HTMLTableRowElement>, id: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setXemId(id);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const dong = e.currentTarget;
    const ke = (e.key === "ArrowDown" ? dong.nextElementSibling : dong.previousElementSibling) as HTMLElement | null;
    ke?.focus();
  }

  const viTri = xemId === null ? -1 : rows.findIndex((r) => r.id === xemId);
  const doiSang = (i: number) => {
    const r = rows[i];
    if (!r) return;
    setXemId(r.id);
    bangRef.current?.querySelector<HTMLElement>(`[data-id="${r.id}"]`)?.scrollIntoView({ block: "nearest" });
  };

  function chonThem(k: KieuThem | "excel") {
    if (k === "excel") setNhapExcel(true);
    else setThem(k);
  }

  return (
    <>
      <div className="ts-so" aria-label="Tóm tắt">
        <div className="ts-so__o"><span>{nhanDem}</span><strong>{tien(tong)}</strong></div>
        <div className="ts-so__o"><span>Tổng giá mua</span><strong>{tienDon(tongQuan?.tong_gia)}</strong></div>
        {trangThai !== "da_giam" && (
          <div className="ts-so__o" title="Tài sản đã thôi dùng không tính">
            <span>Giá trị còn lại</span><strong>{tienDon(tongQuan?.tong_con_lai)}</strong>
          </div>
        )}
        {khauHaoThang !== null && (
          <button type="button" className="ts-so__o ts-so__o--bam" onClick={onXemThang}
            title="Mở tab Khấu hao từng tháng">
            <span>Khấu hao tháng {thangNhan(THANG_NAY)}</span>
            <strong>{tienDon(khauHaoThang)}</strong>
            <Icon name="chevron" size={15} className="ts-xoay-phai" />
          </button>
        )}
      </div>

      <div className="ts-loc tl-thanh">
        <label className="ts-tim">
          <Icon name="search" size={15} />
          <input placeholder="Tìm theo mã hoặc tên" value={q} aria-label="Tìm theo mã hoặc tên"
            onChange={(e) => doiLoc(() => setQ(e.target.value))} />
        </label>
        <ThanhLoc ky={locMan.ky} moc={MOC_TS} onKy={(ky) => setLocMan({ ...locMan, ky })}
          dieuKien={dieuKien} loc={locMan.loc} onLoc={(loc) => setLocMan({ ...locMan, loc })} />
        {taoDuoc && <div className="ts-loc__phai"><NutThem onChon={chonThem} /></div>}
      </div>

      {loi && (
        <div className="banner banner--error" role="alert" style={{ marginBottom: "var(--sp-4)" }}>
          <span>{loi}</span>
          <button type="button" className="btn btn--ghost" onClick={nap}>Tải lại</button>
        </div>
      )}

      <div className="ts-bang">
        {/* `table-layout: fixed` — cột không khai chỉ được phần thừa. Tổng đúng 100%. */}
        <table>
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "3%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên</th>
              <th>Bộ phận</th>
              <th>Bắt đầu dùng</th>
              <th>Ngày tạo</th>
              <th className="ts-num">Giá mua</th>
              <th className="ts-num" title={denThang ? `Tính tới hết tháng ${denThang}` : undefined}>
                Đã khấu hao
              </th>
              <th className="ts-num">Giá trị còn lại</th>
              <th aria-label="Mở" />
            </tr>
          </thead>
          <tbody ref={bangRef}>
            {dangTai && rows.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} className="rc-skel__row">
                  {Array.from({ length: 9 }).map((__, j) => (
                    <td key={j}><span className="rc-skel" style={{ width: "70%" }} /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="ts-trong-td">
                  <div className="ts-trong">
                    {soTrong ? (
                      <>
                        <span className="ts-trong__ic"><Icon name="box" size={20} /></span>
                        <h3>Chưa có tài sản nào</h3>
                        <p>Thêm máy vừa mua, hoặc nhập danh sách máy đang dùng từ Excel. Phần mềm tự chia giá mua ra từng tháng.</p>
                        {taoDuoc && (
                          <div className="ts-trong__nut">
                            <Button variant="accent" type="button" onClick={() => setThem("moi")}>
                              <Icon name="plus" size={15} /> Thêm tài sản
                            </Button>
                            <button type="button" className="ts-lienket" onClick={() => setNhapExcel(true)}>
                              Nhập từ Excel
                            </button>
                          </div>
                        )}
                      </>
                    ) : qCham ? (
                      <>
                        <h3>Không tìm thấy “{qCham}”</h3>
                        <p>Thử tìm bằng mã (TS-0001) hoặc một chữ trong tên.</p>
                        <div className="ts-trong__nut">
                          <Button variant="secondary" type="button" onClick={() => doiLoc(() => setQ(""))}>
                            Xoá ô tìm
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3>Không có tài sản khớp bộ lọc</h3>
                        <p>Thử bỏ bớt điều kiện lọc.</p>
                        <div className="ts-trong__nut">
                          <Button variant="secondary" type="button" onClick={boLoc}>Bỏ lọc</Button>
                        </div>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const hetKhauHao = r.trang_thai === "dang_dung" && r.con_lai <= 0;
                // Đã thôi dùng: máy chủ trả còn lại = 0; hiện số còn lại LÚC thôi dùng cho khớp
                // ngăn chi tiết và tab tháng.
                const daThoi = r.trang_thai === "da_giam";
                const conLai = daThoi ? Math.max(r.nguyen_gia - r.hao_mon_luy_ke, 0) : r.con_lai;
                const pct = r.nguyen_gia > 0 ? Math.min(100, (r.hao_mon_luy_ke / r.nguyen_gia) * 100) : 0;
                return (
                  <tr key={r.id} data-id={r.id} tabIndex={0}
                    className={`ts-dong${xemId === r.id ? " is-chon" : ""}`}
                    onClick={() => setXemId(r.id)}
                    onKeyDown={(e) => phimDong(e, r.id)}>
                    <td className="ts-ma">{r.ma}</td>
                    <td>
                      <div className="ts-ten">
                        {r.ten}
                        {daThoi && <Badge he="da_giam">{NHAN_TRANG_THAI.da_giam}</Badge>}
                        {hetKhauHao && <Badge he="het">Đã khấu hao hết</Badge>}
                      </div>
                      <div className="ts-phu">
                        <span className="ts-phu-tag">{NHAN_LOAI[r.loai] ?? r.loai}</span>
                        {daThoi && r.ngay_giam && <span className="ts-phu-tag">thôi dùng {ngay(r.ngay_giam)}</span>}
                        {r.so_luong > 1 && <span className="ts-phu-tag">{r.so_luong} cái</span>}
                      </div>
                    </td>
                    <td className={r.bo_phan_ten ? "ts-bp" : "ts-bp ts-mo"}>{r.bo_phan_ten ?? "Chưa chọn"}</td>
                    <td>{ngay(r.ngay_su_dung)}</td>
                    <td title={gioCuaMoc(r.created_at)}>{ngayCuaMoc(r.created_at)}</td>
                    <td className="ts-num">
                      {r.tien_sua_chua_lon > 0 && (
                        <span className="ts-cong" title={`Gồm sửa chữa lớn ${tienDon(r.tien_sua_chua_lon)}`}
                          aria-label={`Gồm sửa chữa lớn ${tienDon(r.tien_sua_chua_lon)}`}>+</span>
                      )}
                      {tien(r.nguyen_gia)}
                    </td>
                    <td className="ts-num">{tien(r.hao_mon_luy_ke)}</td>
                    <td className="ts-num" title={daThoi ? "Còn lại lúc thôi dùng" : `Đã khấu hao ${Math.round(pct)}%`}>
                      <span className={conLai <= 0 || daThoi ? "ts-mo" : undefined}>{tien(conLai)}</span>
                      <span className="ts-thanh"><i style={{ width: `${pct}%` }} /></span>
                    </td>
                    <td className="ts-dong__mui"><Icon name="chevron" size={15} className="ts-xoay-phai" /></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Điện thoại: bảng bảy cột không vừa — mỗi tài sản một thẻ. */}
        {rows.length > 0 && (
          <ul className="ts-the-ds">
            {rows.map((r) => {
              const daThoi = r.trang_thai === "da_giam";
              const conLai = daThoi ? Math.max(r.nguyen_gia - r.hao_mon_luy_ke, 0) : r.con_lai;
              const pct = r.nguyen_gia > 0 ? Math.min(100, (r.hao_mon_luy_ke / r.nguyen_gia) * 100) : 0;
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => setXemId(r.id)}>
                    <span className="ts-the-ds__hang"><strong>{r.ten}</strong><span className="ts-ma">{r.ma}</span></span>
                    <span className="ts-the-ds__hang">
                      <span className="ts-mo">{r.bo_phan_ten ?? "Chưa chọn bộ phận"}</span>
                      <span className="ts-the-ds__so">Còn lại <strong>{tienDon(conLai)}</strong></span>
                    </span>
                    <span className="ts-thanh"><i style={{ width: `${pct}%` }} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {tong > 0 && (
        <PhanTrangDayDu trang={page} size={size} tong={tong} soDong={rows.length}
          onTrang={setPage} onSize={(n) => { setSize(n); setPage(1); }} loading={dangTai}
          donVi="tài sản" ariaLabel="Phân trang danh sách tài sản" />
      )}
      {rows.length > 0 && (
        <p className="ts-phim">
          <kbd>↑</kbd> <kbd>↓</kbd> chọn dòng, <kbd>Enter</kbd> mở chi tiết. Ngăn đang mở thì
          {" "}<kbd>↑</kbd> <kbd>↓</kbd> đổi tài sản, <kbd>Esc</kbd> đóng.
        </p>
      )}

      {token && them && (
        <ThemTaiSanDialog
          token={token}
          kieu={them}
          boPhan={boPhan}
          onClose={() => setThem(null)}
          onSaved={nap}
          onNhapExcel={() => { setThem(null); setNhapExcel(true); }}
        />
      )}

      {token && nhapExcel && (
        <ImportExcelDialog
          kieu="ba-buoc"
          ten="tài sản đang dùng"
          luat="Ô để trống phần mềm tự điền như form: loại theo giá, số tháng, số tiền đã khấu hao tới tháng tính tiếp."
          moTaMau="Mỗi dòng một tài sản đang dùng."
          chay={(file, mode) => taiSanApi.importExcel(token, file, mode)}
          taiMau={async () => taiXuong(await taiSanApi.mauExcel(token), "Mau tai san dang dung.xlsx")}
          onClose={() => setNhapExcel(false)}
          onImported={() => { setNhapExcel(false); nap(); }}
        />
      )}

      {token && xemId !== null && (
        <ChiTietDialog token={token} taiSanId={xemId} boPhan={boPhan}
          onClose={() => {
            const id = xemId;
            setXemId(null);
            // Trả con trỏ về đúng dòng vừa xem — đi tiếp bằng ↑ ↓ khỏi phải bấm chuột.
            window.setTimeout(() => bangRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus(), 0);
          }}
          onChanged={nap}
          onTruoc={viTri > 0 ? () => doiSang(viTri - 1) : undefined}
          onSau={viTri >= 0 && viTri < rows.length - 1 ? () => doiSang(viTri + 1) : undefined} />
      )}
    </>
  );
}
