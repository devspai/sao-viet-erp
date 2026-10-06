// Ngăn CHI TIẾT một tài sản — bấm vào dòng ở tab Tài sản hoặc tab Khấu hao từng tháng là mở.
//
// Mọi thao tác dồn về đây, bảng danh sách không có cột Thao tác (spec 05/10/2026 mục 4).
//
// Thiết kế lại 05/10/2026 (`2026-10-05-tai-san-ui-ux-tung-man.md`, màn 2):
//   • Ngăn là "xem bên cạnh": lớp phủ nhẹ, không làm mờ danh sách; ↑ ↓ (nút ở đầu ngăn, hoặc
//     phím khi con trỏ không nằm trong ô nhập) đổi sang tài sản kế bên, khỏi đóng-mở.
//   • Hàng nút ngay dưới tiêu đề: hai việc hay làm (Chuyển bộ phận, Sửa chữa lớn) + Sửa, còn lại
//     vào "⋯". Thôi dùng là việc hiếm, khó quay lại — không đứng ngang hàng nút thường.
//   • Ngăn RỘNG, hai cột (chủ duyệt 05/10/2026 sau khi xem bản một cột: "thông tin nhìn xấu"):
//     cột chính = thẻ lớn "Giá trị còn lại" + thanh tiến độ + lịch khấu hao; cột bên = thông tin
//     dạng nhãn-trên-giá-trị và lịch sử dạng dòng thời gian (mới nhất ở trên). Không chân "Đóng".
//   • Chuyển bộ phận / Sửa chữa lớn / Thôi dùng mở HỘP giữa màn có khung "Sau khi lưu" so số cũ
//     với số mới (ThaoTacDialogs.tsx).
//   • Thôi dùng xong có thông báo kèm Hoàn tác thay cho hộp hỏi lại.
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, type Department } from "../../api/client";
import {
  KIEU_THOI_DUNG,
  NHAN_BIEN_DONG,
  NHAN_LOAI,
  NHAN_TRANG_THAI,
  taiSanApi,
  type BienDong,
  type DongDuKien,
  type TaiSanChiTiet,
} from "../../api/taiSan";
import { useCan } from "../../auth/permissions";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon } from "../../components/Icons";
import { Badge, BangLoi, KhungNgan, ThongBao, ngay, quyDoiNam, thangNhan, tienDon } from "./chung";
import { ChuyenBoPhanKhung, SuaChuaLonKhung, ThoiDungKhung } from "./ThaoTacDialogs";
import { LichKhauHao, ThemTaiSanDialog } from "./ThemTaiSanDialog";

type Mo = "sua" | "giong" | "chuyen" | "sua_lon" | "thoi" | "dung_lai" | "xoa" | null;

const TEN_KIEU = Object.fromEntries(KIEU_THOI_DUNG.map((k) => [k.ma, k.nhan]));

function moTaBienDong(b: BienDong, tenBoPhan: (id: number | null) => string): string {
  if (b.loai === "dieu_chuyen") return `Sang ${tenBoPhan(b.bo_phan_moi_id)}`;
  if (b.loai === "nang_cap") {
    return `Tiền sửa ${tienDon(b.so_tien)}, dùng thêm ${b.so_thang_con_lai ?? 0} tháng`;
  }
  if (b.loai === "thoi_dung") return TEN_KIEU[b.kieu_thoi_dung ?? ""] ?? "";
  return "";
}

const phanTram = (x: number) => x.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

/** Menu "⋯" — đóng khi bấm ra ngoài hoặc Esc. */
function MenuKhac({ muc }: { muc: { nhan: string; phu: string; nguy?: boolean; onClick: () => void }[] }) {
  const [mo, setMo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMo(false); };
    const phim = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setMo(false); } };
    document.addEventListener("mousedown", dong);
    document.addEventListener("keydown", phim);
    return () => {
      document.removeEventListener("mousedown", dong);
      document.removeEventListener("keydown", phim);
    };
  }, [mo]);
  if (muc.length === 0) return null;
  return (
    <div className="ts-menu" ref={ref}>
      <button type="button" className="btn btn--secondary ts-menu__nut" aria-haspopup="menu"
        aria-expanded={mo} aria-label="Thao tác khác" title="Thao tác khác" onClick={() => setMo((v) => !v)}>
        <Icon name="menu" size={16} />
      </button>
      {mo && (
        <div className="ts-menu__ds" role="menu">
          {muc.map((m) => (
            <button key={m.nhan} type="button" role="menuitem"
              className={`ts-menu__muc${m.nguy ? " ts-menu__muc--nguy" : ""}`}
              onClick={() => { setMo(false); m.onClick(); }}>
              <span>{m.nhan}</span>
              <small>{m.phu}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChiTietDialog({
  token,
  taiSanId,
  boPhan: boPhanNgoai,
  onClose,
  onChanged,
  onTruoc,
  onSau,
}: {
  token: string;
  taiSanId: number;
  /** Có thì dùng luôn, không thì ngăn tự nạp (tab Khấu hao từng tháng không giữ danh mục). */
  boPhan?: Department[];
  onClose: () => void;
  /** Có thay đổi (thêm / sửa / thao tác / xoá) — nơi gọi nạp lại bảng của nó. */
  onChanged: () => void;
  /** Tài sản trước / sau trong danh sách đang lọc — không truyền là đầu / cuối danh sách. */
  onTruoc?: () => void;
  onSau?: () => void;
}) {
  const can = useCan();
  const taoDuoc = can("tai_san", "create");
  const suaDuoc = can("tai_san", "update");
  const xoaDuoc = can("tai_san", "delete");

  const [ct, setCt] = useState<TaiSanChiTiet | null>(null);
  const [lich, setLich] = useState<DongDuKien[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [mo, setMo] = useState<Mo>(null);
  const [ban, setBan] = useState(false);
  const [loiXacNhan, setLoiXacNhan] = useState<string | null>(null);
  const [thongBao, setThongBao] = useState<{ chu: string; hoanTac?: () => void } | null>(null);
  const [boPhanTu, setBoPhanTu] = useState<Department[]>([]);
  const boPhan = boPhanNgoai ?? boPhanTu;

  const nap = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        taiSanApi.chiTiet(token, taiSanId), taiSanApi.duKien(token, taiSanId),
      ]);
      setCt(a);
      setLich(b);
      setLoi(null);
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không mở được tài sản này.");
    }
  }, [token, taiSanId]);

  // Đổi tài sản (↑ ↓) thì đóng khung thao tác đang mở — nó thuộc tài sản cũ.
  useEffect(() => { setMo(null); void nap(); }, [nap]);
  useEffect(() => {
    if (boPhanNgoai) return;
    api.rbac.departments(token).then(setBoPhanTu).catch(() => setBoPhanTu([]));
  }, [token, boPhanNgoai]);

  // Phím ↑ ↓ đổi tài sản — trừ khi con trỏ đang ở ô nhập, hoặc có ngăn/hộp khác đè lên.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.closest("input, select, textarea, [role='listbox'], .dmodal")) return;
      if (mo || document.querySelector(".cdlg-overlay, .dmodal-overlay")) return;
      const fn = e.key === "ArrowUp" ? onTruoc : onSau;
      if (fn) { e.preventDefault(); fn(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onTruoc, onSau, mo]);

  const tenBoPhan = (id: number | null) =>
    boPhan.find((b) => b.id === id)?.name ?? "bộ phận khác";

  function xong() {
    setMo(null);
    void nap();
    onChanged();
  }

  async function xacNhan(fn: () => Promise<unknown>, sau: () => void) {
    setBan(true);
    setLoiXacNhan(null);
    try {
      await fn();
      sau();
    } catch (e) {
      setLoiXacNhan(e instanceof ApiError ? e.message : "Không làm được. Thử lại.");
    } finally {
      setBan(false);
    }
  }

  const nutDau = (onTruoc || onSau) ? (
    <>
      <button type="button" className="ts-nut-icon" disabled={!onTruoc} onClick={onTruoc}
        aria-label="Tài sản trước" title="Tài sản trước (↑)">
        <Icon name="chevron" size={17} className="ts-xoay-len" />
      </button>
      <button type="button" className="ts-nut-icon" disabled={!onSau} onClick={onSau}
        aria-label="Tài sản sau" title="Tài sản sau (↓)">
        <Icon name="chevron" size={17} />
      </button>
    </>
  ) : undefined;

  // Đổi tài sản bằng ↑ ↓ thì giữ nội dung cũ tới khi bản mới về — khỏi chớp màn "Đang mở…".
  // Lúc đang nạp vẫn trả CÙNG cây (Fragment → KhungNgan rộng) với lúc đã có số: khác cây là React
  // dựng lại ngăn, ngăn hẹp trượt vào rồi bật rộng ra — chủ chê "khựng" 05/10/2026.
  if (!ct) {
    return (
      <>
        <KhungNgan rong onClose={onClose} nutDau={nutDau}
          tieuDe={loi ? "Không mở được" : <span className="rc-skel ts-skel--tieude" aria-label="Đang mở" />}>
          <BangLoi loi={loi} />
          {!loi && (
            <div className="ts-ct" aria-hidden="true">
              <div className="ts-ct__chinh">
                <div className="ts-hero ts-hero--cho">
                  <span className="rc-skel" style={{ width: 90 }} />
                  <span className="rc-skel" style={{ width: 220, height: 22 }} />
                  <span className="rc-skel" style={{ width: "100%", height: 8 }} />
                </div>
              </div>
              <div className="ts-ct__ben">
                <div className="ts-the-ben">
                  {[70, 120, 90, 110].map((w, i) => <span key={i} className="rc-skel" style={{ width: w }} />)}
                </div>
              </div>
            </div>
          )}
        </KhungNgan>
      </>
    );
  }

  const daThoi = ct.trang_thai === "da_giam";
  const mucThang = ct.so_thang_con > 0 ? Math.floor(ct.co_so_trich / ct.so_thang_con) : 0;
  const coLichSu = ct.bien_dong.length > 0;
  const thoiDung = ct.bien_dong.find((b) => b.loai === "thoi_dung" || b.loai === "ghi_giam");
  const lichSu = [...ct.bien_dong].sort((a, b) => a.ngay.localeCompare(b.ngay) || a.id - b.id);
  const cuoiLich = lich && lich.length > 0 ? lich[lich.length - 1] : null;
  // Đã thôi dùng thì máy chủ trả còn lại = 0 (món đã ra khỏi xưởng), nhưng kế toán cần đúng số
  // còn lại LÚC thôi dùng để ghi giảm bên phần mềm kế toán.
  const conLai = daThoi ? Math.max(ct.nguyen_gia - ct.hao_mon_luy_ke, 0) : ct.con_lai;
  const pct = ct.nguyen_gia > 0 ? Math.min(100, (ct.hao_mon_luy_ke / ct.nguyen_gia) * 100) : 0;
  const thangConLai = lich && ct.luy_ke_den
    ? lich.filter((d) => `${d.nam}-${String(d.thang).padStart(2, "0")}` > ct.luy_ke_den).length
    : 0;

  const mucKhac = [
    ...(taoDuoc ? [{
      nhan: "Thêm cái giống thế này", phu: "Chép sẵn loại, số tháng, bộ phận", onClick: () => setMo("giong"),
    }] : []),
    ...(suaDuoc && !daThoi ? [{
      nhan: "Thôi dùng", phu: "Bán, thanh lý, hỏng hoặc mất", nguy: true, onClick: () => setMo("thoi"),
    }] : []),
    ...(xoaDuoc && !coLichSu ? [{
      nhan: "Xoá", phu: "Chỉ khi nhập nhầm", nguy: true,
      onClick: () => { setLoiXacNhan(null); setMo("xoa"); },
    }] : []),
  ];

  const hetVao = cuoiLich ? `${String(cuoiLich.thang).padStart(2, "0")}/${cuoiLich.nam}` : null;
  // Lịch sử MỚI NHẤT ở trên (như mọi dòng hoạt động); "Bắt đầu dùng" luôn là mốc cuối cùng.
  const lichSuMoi = [...lichSu].reverse();

  return (
    <>
      <KhungNgan
        rong
        nhanTren={
          <>
            <span>{ct.ma}</span>
            <Badge he={ct.trang_thai}>{NHAN_TRANG_THAI[ct.trang_thai] ?? ct.trang_thai}</Badge>
          </>
        }
        tieuDe={ct.ten}
        phuDe={(suaDuoc || taoDuoc || xoaDuoc) ? (
          <div className="ts-thaotac">
            {suaDuoc && !daThoi && (
              <>
                <Button variant="secondary" type="button" onClick={() => setMo("chuyen")}>
                  <Icon name="transfer" size={15} /> Chuyển bộ phận
                </Button>
                <Button variant="secondary" type="button" onClick={() => setMo("sua_lon")}>
                  <Icon name="wrench" size={15} /> Sửa chữa lớn
                </Button>
                <Button variant="secondary" type="button" onClick={() => setMo("sua")}>
                  <Icon name="edit" size={15} /> Sửa
                </Button>
              </>
            )}
            {suaDuoc && daThoi && (
              <Button variant="secondary" type="button"
                onClick={() => { setLoiXacNhan(null); setMo("dung_lai"); }}>
                Dùng lại
              </Button>
            )}
            <MenuKhac muc={mucKhac} />
          </div>
        ) : undefined}
        onClose={onClose}
        nutDau={nutDau}
      >
        <BangLoi loi={loi} />

        <div className="ts-ct">
          <div className="ts-ct__chinh">
            {/* Con số người ta mở ngăn để xem: còn lại bao nhiêu, đã đi được bao xa, bao giờ hết. */}
            <section className="ts-hero" aria-label="Tóm tắt khấu hao">
              <div className="ts-hero__chinh">
                <span className="ts-hero__nhan">{daThoi ? "Còn lại lúc thôi dùng" : "Giá trị còn lại"}</span>
                <strong className="ts-hero__so">{tienDon(conLai)}</strong>
                <span className="ts-hero__phu">
                  trên giá mua {tienDon(ct.nguyen_gia)}
                  {ct.tien_sua_chua_lon > 0 && <span className="ts-phu-tag">gồm sửa chữa lớn {tienDon(ct.tien_sua_chua_lon)}</span>}
                </span>
                <div className="ts-hero__thanh" role="img" aria-label={`Đã khấu hao ${phanTram(pct)}%`}>
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="ts-hero__moc">
                  <span>Đã khấu hao <strong>{tienDon(ct.hao_mon_luy_ke)}</strong> ({phanTram(pct)}%)</span>
                  {!daThoi && ct.con_lai > 0 && hetVao && <span>Hết vào <strong>{hetVao}</strong></span>}
                </div>
              </div>
              <dl className="ts-hero__ben">
                {daThoi ? (
                  <>
                    <div><dt>Thôi dùng từ</dt><dd>{ngay(ct.ngay_giam)}</dd></div>
                    {thoiDung?.kieu_thoi_dung && (
                      <div><dt>Lý do</dt><dd>{TEN_KIEU[thoiDung.kieu_thoi_dung]}</dd></div>
                    )}
                  </>
                ) : ct.con_lai <= 0 ? (
                  <div><dt>Trạng thái</dt><dd>Đã khấu hao hết</dd></div>
                ) : (
                  <>
                    <div><dt>Mỗi tháng</dt><dd>{tienDon(mucThang)}</dd></div>
                    <div><dt>Còn</dt><dd>{thangConLai} tháng</dd></div>
                  </>
                )}
                {ct.luy_ke_den && (
                  <div><dt>Số tính tới</dt><dd>hết {thangNhan(ct.luy_ke_den)}</dd></div>
                )}
              </dl>
            </section>

            <section className="ts-muc">
              <h3 className="ts-muc__ten">Lịch khấu hao</h3>
              {lich === null ? <p className="rc-field__hint">Đang tải…</p> : (
                <LichKhauHao lich={lich} denThang={ct.luy_ke_den} />
              )}
            </section>
          </div>

          <aside className="ts-ct__ben">
            <section className="ts-the-ben">
              <h3 className="ts-muc__ten">Thông tin</h3>
              <dl className="ts-tt">
                <div>
                  <dt>Bộ phận dùng</dt>
                  <dd className={ct.bo_phan_ten ? undefined : "ts-mo"}>{ct.bo_phan_ten ?? "Chưa chọn"}</dd>
                </div>
                <div>
                  <dt>Người giữ</dt>
                  <dd className={ct.nguoi_quan_ly ? undefined : "ts-mo"}>{ct.nguoi_quan_ly ?? "Chưa chọn"}</dd>
                </div>
                <div>
                  <dt>Loại</dt>
                  <dd>{NHAN_LOAI[ct.loai] ?? ct.loai}{ct.so_luong > 1 && <span className="ts-phu-tag">{ct.so_luong} cái</span>}</dd>
                </div>
                <div>
                  <dt>Bắt đầu dùng</dt>
                  <dd>{ngay(ct.ngay_su_dung)}</dd>
                </div>
                <div>
                  <dt>Khấu hao trong</dt>
                  <dd>{ct.so_thang} tháng{ct.so_thang >= 12 && <span className="ts-mo"> = {quyDoiNam(ct.so_thang)}</span>}</dd>
                </div>
                {ct.nguon_vao === "dau_ky" && (
                  <div>
                    <dt>Mang sang từ sổ cũ</dt>
                    <dd>{tienDon(ct.hao_mon_dau_ky)} trong {ct.thang_da_trich_dau_ky} tháng</dd>
                  </div>
                )}
                {ct.so_hoa_don && (
                  <div>
                    <dt>Số hoá đơn mua</dt>
                    <dd>{ct.so_hoa_don}</dd>
                  </div>
                )}
                {daThoi && thoiDung?.ly_do && (
                  <div>
                    <dt>Ghi chú thôi dùng</dt>
                    <dd>{thoiDung.ly_do}</dd>
                  </div>
                )}
                {ct.ghi_chu && (
                  <div>
                    <dt>Ghi chú</dt>
                    <dd>{ct.ghi_chu}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="ts-the-ben">
              <h3 className="ts-muc__ten">Lịch sử</h3>
              <ol className="ts-dongthoi">
                {lichSuMoi.map((b) => (
                  <li key={b.id} className={`ts-dongthoi__muc ts-dongthoi__muc--${b.loai}`}>
                    <div className="ts-dongthoi__dau">
                      <strong>{NHAN_BIEN_DONG[b.loai] ?? b.loai}</strong>
                      <time>{ngay(b.ngay)}</time>
                    </div>
                    {moTaBienDong(b, tenBoPhan) && <p>{moTaBienDong(b, tenBoPhan)}</p>}
                    {b.ly_do && <p className="ts-dongthoi__lydo">{b.ly_do}</p>}
                  </li>
                ))}
                <li className="ts-dongthoi__muc ts-dongthoi__muc--bat_dau">
                  <div className="ts-dongthoi__dau">
                    <strong>Bắt đầu dùng</strong>
                    <time>{ngay(ct.ngay_su_dung)}</time>
                  </div>
                  {ct.nguon_vao === "dau_ky" && <p>Tính tiếp trên phần mềm từ tháng {thangNhan(ct.moc_tu_ngay)}</p>}
                </li>
              </ol>
            </section>
          </aside>
        </div>
      </KhungNgan>

      {mo === "chuyen" && (
        <ChuyenBoPhanKhung token={token} taiSan={ct} boPhan={boPhan}
          onClose={() => setMo(null)} onDone={xong} />
      )}
      {mo === "sua_lon" && (
        <SuaChuaLonKhung token={token} taiSan={ct} lich={lich}
          onClose={() => setMo(null)} onDone={xong} />
      )}
      {mo === "thoi" && (
        <ThoiDungKhung token={token} taiSan={ct} lich={lich} onClose={() => setMo(null)}
          onDone={() => {
            xong();
            setThongBao({
              chu: `Đã thôi dùng ${ct.ten}.`,
              hoanTac: () => {
                setThongBao(null);
                taiSanApi.boThoiDung(token, ct.id).then(xong).catch((e) =>
                  setLoi(e instanceof ApiError ? e.message : "Không hoàn tác được. Thử lại."));
              },
            });
          }} />
      )}

      {(mo === "sua" || mo === "giong") && (
        <ThemTaiSanDialog
          token={token}
          tren
          kieu={ct.nguon_vao === "dau_ky" ? "dang_dung" : "moi"}
          taiSan={mo === "sua" ? ct : null}
          mau={mo === "giong" ? {
            loai: ct.loai, so_thang: ct.so_thang, bo_phan_id: ct.bo_phan_id,
            nguoi_quan_ly_id: ct.nguoi_quan_ly_id,
          } : null}
          boPhan={boPhan}
          onClose={() => setMo(null)}
          onSaved={() => { void nap(); onChanged(); }}
        />
      )}

      <ConfirmDialog
        open={mo === "dung_lai"}
        busy={ban}
        error={loiXacNhan}
        title={`Dùng lại ${ct.ten}?`}
        message="Khấu hao chạy tiếp từ tháng đã dừng, như chưa từng thôi dùng."
        confirmLabel="Dùng lại"
        onConfirm={() => xacNhan(() => taiSanApi.boThoiDung(token, ct.id), xong)}
        onCancel={() => setMo(null)}
      />
      <ConfirmDialog
        open={mo === "xoa"}
        danger
        busy={ban}
        error={loiXacNhan}
        title={`Xoá ${ct.ten}?`}
        message="Chỉ xoá khi nhập nhầm — xoá rồi không khôi phục được. Máy đã bán hay hỏng thì dùng Thôi dùng để giữ lịch sử."
        confirmLabel="Xoá tài sản"
        onConfirm={() => xacNhan(() => taiSanApi.xoa(token, ct.id), () => { onChanged(); onClose(); })}
        onCancel={() => setMo(null)}
      />

      {thongBao && (
        <ThongBao chu={thongBao.chu} onHoanTac={thongBao.hoanTac} onTat={() => setThongBao(null)} />
      )}
    </>
  );
}
