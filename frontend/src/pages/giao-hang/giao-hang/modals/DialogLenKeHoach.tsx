// Hộp LÊN ĐƠN GIAO HÀNG — chọn xe, tài xế, phụ xe, giờ lấy hàng, giờ dự kiến giao
// (tách từ pages/GiaoHangPage.tsx). ⚠️ Payload `plan` / `lenLuot` là logic nghiệp vụ — giữ nguyên văn.
//
// HAI chế độ, MỘT form (chủ chốt 18/09/2026 — "gom nhiều phiếu lại chạy 1 lượt"):
//   một yêu cầu   — nút "Lên đơn giao" ở từng dòng ⇒ `plan`.
//   `theoLuot`    — tick nhiều yêu cầu rồi "Lên lượt xe" ⇒ `lenLuot`: MỖI yêu cầu một chuyến, một
//                   phiếu kho, chung MỘT lượt xe; một yêu cầu hỏng là cả lô không lưu.
//
// Bố cục phương án B bản chỉnh (docs/mockups/giao-hang-len-don-phuong-an-B.html, chủ chọn
// 07/10/2026): việc chính của hộp là CHỌN XE VÀ NGƯỜI, nên bày thẳng hai danh sách kèm trạng thái
// (bấm hàng là chọn xe; mỗi người có nút Tài xế / Phụ xe), mỗi danh sách một ô tìm gần đúng vì thực
// tế sẽ dài. Hàng đã chọn GHIM trên đầu — gõ tìm không làm mất. Cột phải: yêu cầu, lượt, giờ, ghi
// chú. Không chữ đậm; chọn = viền đủ bốn cạnh.
import { useEffect, useState } from "react";
import type { DeliveryDriver, DeliveryDriverPick, DeliveryRequest } from "../../../../api/client";
import { api } from "../../../../api/client";
import type { Row } from "../../../../api/rebuildCatalog";
import { Button } from "../../../../components/Button";
import { boDau, khopGanDung } from "../../../../utils/timGanDung";
import {
  GIO_NHAP_MAX, GIO_NHAP_MIN, gioNhapHopLe, gioNhapSai,
} from "../../../../lib/gioNhap";
import { NganPhai } from "../../../ke-toan/shared/NganPhai";
import { Pill } from "../components/giaoHangCells";
import { NHAN_TRANG_THAI_NV } from "../shared/constants";
import { hanGiao, ngayThuan, sdtDoc, TONE_NV } from "../shared/helpers";
import { napNguonLenDon, nguonLenDonSan, type NguonLenDon } from "../shared/nguonLenDon";
import "../../../ke-toan/ke-toan.css";

/** Người rảnh lên trước, người nghỉ xuống cuối — thứ tự đọc từ trạng thái hôm nay. */
const THU_TU_NV = ["ranh", "co_lich", "dang_giao", "dang_tra_hang", "nghi"];

/** Mốc `datetime-local` (giờ máy, tròn phút) — hai ô giờ mở ra là BÂY GIỜ và bây giờ + 2 tiếng. */
function gioLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Chữ cái đầu mỗi từ — gõ "nvv" ra Nguyễn Văn Việt. */
const dauChu = (s: string) => boDau(s).split(" ").map((w) => w[0] ?? "").join("");

/** Hàng giữ chỗ lúc nguồn chưa về — khung ngăn đứng yên, không nhảy khi danh sách đổ vào. */
function GiuCho({ so }: { so: number }) {
  return (
    <div className="gh-ld__ds" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: so }, (_, i) => (
        <div key={i} className="gh-ld__hang gh-ld__hang--cho"><i /><i /><i /></div>
      ))}
    </div>
  );
}

/** Hai chữ cái của avatar: hai từ cuối của tên. */
const viet = (ten: string) => ten.trim().split(/\s+/).slice(-2).map((w) => w[0] ?? "").join("").toUpperCase();

// =============================================================================
// Ngăn · Lên đơn giao hàng
// =============================================================================
export function DialogLenKeHoach({
  requests,
  theoLuot = false,
  token,
  onClose,
  onXong,
}: {
  requests: DeliveryRequest[];
  theoLuot?: boolean;
  token: string;
  onClose: () => void;
  /** `luotId` có khi lên theo lượt — màn ngoài mở luôn ngăn Lượt xe cho bước kế tiếp. */
  onXong: (luotId?: number) => void;
}) {
  const request = requests[0];
  const [employeeId, setEmployeeId] = useState("");
  // Phụ xe — TUỲ CHỌN, tối đa một người (mg 0231). Cùng danh sách với tài xế: vai trò do NÚT bấm
  // trên hàng quyết định, không phải thuộc tính của người. Hôm nay lái, mai đi phụ.
  const [phuXeId, setPhuXeId] = useState("");
  // XE — BẮT BUỘC (chủ chốt 12/09/2026). Đơn giá khoán km tra theo MỨC mà xe đang ăn, nên bỏ
  // trống là đẩy việc sang người đóng chuyến, lúc đó hàng đã đi rồi mới biết chuyến nào thiếu.
  const [xeId, setXeId] = useState("");
  // LƯỢT XE (PRD khoán km §14, chủ chốt 18/09/2026): người lên đơn quyết đơn nào đi chung một vòng
  // xe. Tiền km tính theo TỪNG CHẶNG giữa hai lần ghi số đồng hồ, nên gom đúng lượt là gom đúng
  // tiền. Nguồn nạp lượt mở của MỌI xe một lần: vừa nói xe nào "Đang chạy", vừa đổ ô Lượt xe.
  const [luot, setLuot] = useState<string>("moi");
  // Xe, lượt, người, trạng thái hôm nay, mức km — màn ngoài đã nạp TRƯỚC (shared/nguonLenDon) nên
  // thường có ngay lúc mở; vẫn nạp lại ngầm cho tươi. `null` = chưa có gì ⇒ hàng giữ chỗ.
  // Không có quyền xem tab Nhân viên ⇒ trạng thái rỗng, người vẫn chọn được, chỉ thiếu cột đó.
  const [nguon, setNguon] = useState<NguonLenDon | null>(() => nguonLenDonSan(token));
  const [timXe, setTimXe] = useState("");
  const [timNv, setTimNv] = useState("");
  const [lay, setLay] = useState(() => gioLocal(new Date()));
  const [giao, setGiao] = useState(() => gioLocal(new Date(Date.now() + 2 * 3_600_000)));
  const [ghiChu, setGhiChu] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [canhBao, setCanhBao] = useState<string[]>([]);
  const [dangGui, setDangGui] = useState(false);
  const gioSai = gioNhapSai(lay) || gioNhapSai(giao);

  useEffect(() => {
    let bo = false;
    napNguonLenDon(token).then((n) => { if (!bo) setNguon(n); });
    return () => { bo = true; };
  }, [token]);

  const dangNap = nguon === null;
  const xeDs = nguon?.xe ?? [];
  const luotTheoXe = nguon?.luotTheoXe ?? {};
  const taiXe = nguon?.taiXe ?? [];
  const trangThai = nguon?.trangThai ?? new Map<number, DeliveryDriver>();
  const mucDs = nguon?.muc ?? [];
  // Chưa nạp xong thì coi như CÓ xe — nút chính đứng khoá chờ, không lách được bước chọn xe.
  const canXe = theoLuot || dangNap || xeDs.length > 0;
  const thieuXe = canXe && !xeId;

  const luotDs = xeId ? luotTheoXe[xeId] ?? [] : [];
  const tenMuc = (id: unknown) => mucDs.find((m) => m.id === Number(id))?.ten ?? null;

  // ---- Danh sách xe: xe đã chọn ghim đầu, còn lại lọc theo ô tìm ----
  const xeChon = xeDs.find((x) => String(x.id) === xeId) ?? null;
  const xeLoc = xeDs.filter((x) => String(x.id) !== xeId && khopGanDung(
    [x.ma, x.ten, x.tai_trong != null ? `${x.tai_trong} tấn` : "", tenMuc(x.muc_khoan_km_id) ?? ""]
      .map((v) => String(v ?? "")).join(" "),
    timXe,
  ));

  // ---- Danh sách người: tài xế + phụ xe đã chọn ghim đầu ----
  const thuTu = (id: number) => {
    const k = THU_TU_NV.indexOf(trangThai.get(id)?.trang_thai ?? "");
    return k < 0 ? THU_TU_NV.length : k;
  };
  const nguoiChon = [employeeId, phuXeId].filter(Boolean)
    .map((id) => taiXe.find((t) => String(t.id) === id))
    .filter((t): t is DeliveryDriverPick => !!t);
  const nguoiLoc = taiXe
    .filter((t) => String(t.id) !== employeeId && String(t.id) !== phuXeId)
    .filter((t) => khopGanDung(`${t.full_name} ${t.code ?? ""} ${dauChu(t.full_name)}`, timNv))
    .sort((a, b) => thuTu(a.id) - thuTu(b.id));

  const chonTaiXe = (id: string) => {
    setEmployeeId((cu) => (cu === id ? "" : id));
    if (phuXeId === id) setPhuXeId("");
  };
  const chonPhuXe = (id: string) => {
    setPhuXeId((cu) => (cu === id ? "" : id));
    if (employeeId === id) setEmployeeId("");
  };

  const xongVoiCanhBao = (canh: string[], luotId?: number) => {
    if (canh.length) {
      setCanhBao(canh);
      window.setTimeout(() => onXong(luotId), 1500);
    } else {
      onXong(luotId);
    }
  };

  const gui = () => {
    setLoi(null);
    setDangGui(true);
    if (theoLuot) {
      api.giaoHang
        .lenLuot(token, {
          request_ids: requests.map((r) => r.id),
          employee_id: Number(employeeId),
          ...(phuXeId ? { phu_xe_employee_id: Number(phuXeId) } : {}),
          vehicle_id: Number(xeId),
          luot_xe_id: luot === "moi" ? "moi" : Number(luot),
          gio_lay_hang: new Date(lay).toISOString(),
          gio_du_kien_giao: new Date(giao).toISOString(),
          ghi_chu_phan_cong: ghiChu || null,
        })
        .then((r) => xongVoiCanhBao(r.canh_bao, r.luot_id))
        .catch((e: unknown) => setLoi(e instanceof Error ? e.message : "Không lưu được lượt xe"))
        .finally(() => setDangGui(false));
      return;
    }
    api.giaoHang
      .plan(token, {
        request_id: request.id,
        employee_id: Number(employeeId),
        ...(phuXeId ? { phu_xe_employee_id: Number(phuXeId) } : {}),
        ...(xeId
          ? { vehicle_id: Number(xeId), luot_xe_id: luot === "moi" ? "moi" as const : Number(luot) }
          : {}),
        gio_lay_hang: new Date(lay).toISOString(),
        gio_du_kien_giao: new Date(giao).toISOString(),
        ghi_chu_phan_cong: ghiChu || null,
      })
      .then((r) => xongVoiCanhBao(r.canh_bao))
      .catch((e: unknown) => setLoi(e instanceof Error ? e.message : "Không lưu được đơn giao hàng"))
      .finally(() => setDangGui(false));
  };

  const thieu = [thieuXe && "xe", !employeeId && "tài xế"].filter(Boolean) as string[];
  const khoa = thieu.length > 0 || !gioNhapHopLe(lay) || !gioNhapHopLe(giao) || dangGui;
  const taiXeChon = taiXe.find((t) => String(t.id) === employeeId);

  const hangXe = (x: Row) => {
    const id = String(x.id);
    const on = id === xeId;
    const mo = luotTheoXe[id] ?? [];
    const muc = tenMuc(x.muc_khoan_km_id);
    return (
      <button key={id} type="button" role="radio" aria-checked={on}
        className={`gh-ld__hang gh-ld__hang--xe${on ? " is-chon" : ""}`}
        onClick={() => {
          setXeId(on ? "" : id);
          setLuot("moi");
        }}>
        <span className={`gh-ld__rad${on ? " is-chon" : ""}`} aria-hidden="true" />
        <span className="gh-num">{String(x.ma ?? "")}</span>
        <span className="gh-ld__cat">{String(x.ten ?? "")}</span>
        <span className="gh-nho gh-num">
          {x.tai_trong != null ? `${Number(x.tai_trong).toLocaleString("vi-VN")} tấn` : ""}
        </span>
        <span className="gh-nho gh-ld__cat">{muc ?? ""}</span>
        <span>
          {mo.length > 0
            ? <Pill text={`Đang chạy ${mo[0].code}`} tone="cyan" />
            : <Pill text="Rảnh" tone="la" />}
        </span>
      </button>
    );
  };

  const hangNguoi = (t: DeliveryDriverPick) => {
    const id = String(t.id);
    const tt = trangThai.get(t.id);
    const la = id === employeeId ? "tai" : id === phuXeId ? "phu" : null;
    return (
      <div key={id} className={`gh-ld__hang gh-ld__hang--nv${la ? " is-chon" : ""}${tt?.trang_thai === "nghi" ? " is-mo" : ""}`}>
        <span className="gh-ld__av" aria-hidden="true">{viet(t.full_name)}</span>
        <span className="gh-ld__cat">
          {t.full_name}
          {t.code && <span className="gh-nho"> {t.code}</span>}
        </span>
        {/* Cột riêng: nằm trong ô tên thì tên dài cắt "…" mất luôn thẻ — đúng thứ cần thấy. */}
        <span>
          {!t.co_thao_tac && (
            <span className="gh-the">{t.co_tai_khoan === false ? "Chưa có tài khoản" : "Chưa cấp quyền"}</span>
          )}
        </span>
        <span>
          {tt && <Pill text={NHAN_TRANG_THAI_NV[tt.trang_thai] ?? tt.trang_thai} tone={TONE_NV[tt.trang_thai] ?? "slate"} />}
        </span>
        <span className={tt?.so_chuyen_xong ? "gh-muc" : "gh-mo"}>{tt ? `${tt.so_chuyen_xong} chuyến` : ""}</span>
        <span className="gh-ld__vai">
          <button type="button" aria-pressed={la === "tai"} aria-label={`Tài xế: ${t.full_name}`}
            className={la === "tai" ? "is-chon" : undefined} onClick={() => chonTaiXe(id)}>Tài xế</button>
          <button type="button" aria-pressed={la === "phu"} aria-label={`Phụ xe: ${t.full_name}`}
            className={la === "phu" ? "is-chon" : undefined} onClick={() => chonPhuXe(id)}>Phụ xe</button>
        </span>
      </div>
    );
  };

  const chan = (
    <>
      <span className="gh-nho">{thieu.length > 0 ? `Còn thiếu ${thieu.join(" và ")}.` : ""}</span>
      <span className="rc__spacer" />
      <Button variant="ghost" onClick={onClose}>Huỷ</Button>
      <Button variant="accent" disabled={khoa} onClick={gui}>
        {theoLuot ? `Lên lượt xe cho ${requests.length} đơn` : "Lên đơn giao hàng"}
      </Button>
    </>
  );

  return (
    <NganPhai
      duongDan="Giao hàng"
      tieuDe={theoLuot ? "Lên lượt xe" : "Lên đơn giao hàng"}
      the={<span className="gh-the">{theoLuot ? `${requests.length} yêu cầu` : request.code}</span>}
      chan={chan}
      onDong={onClose}
      chanDong={() => ghiChu.trim() !== ""}
    >
      <div className="gh-ld">
        <div className="gh-ld__trai">
          <div className="gh-ld__dau">
            <h3>Xe</h3>
            {canXe && <span className="gh-nho">bắt buộc</span>}
            <span className="rc__spacer" />
            {(dangNap || xeDs.length > 0) && (
              <input className="input gh-ld__tim" type="search" value={timXe} aria-label="Tìm xe"
                disabled={dangNap} placeholder="Tìm biển số, tên xe, tải trọng"
                onChange={(e) => setTimXe(e.target.value)} />
            )}
          </div>
          {dangNap ? <GiuCho so={3} /> : xeDs.length === 0 ? (
            <p className="rc__sub gh-ld__rong">
              {theoLuot
                ? "Chưa khai chiếc xe nào — lượt là vòng chạy của một chiếc xe, khai xe ở Cấu hình danh mục → Xe giao hàng trước."
                : "Chưa khai chiếc xe nào ở Cấu hình danh mục → Xe giao hàng."}
            </p>
          ) : (
            <div className="gh-ld__ds" role="radiogroup" aria-label="Xe">
              {xeChon && hangXe(xeChon)}
              {xeChon && timXe && <div className="gh-ld__ngan">Kết quả tìm</div>}
              {xeLoc.map(hangXe)}
              {xeLoc.length === 0 && timXe && (
                <div className="gh-ld__khong">Không có xe nào khớp «{timXe}»</div>
              )}
            </div>
          )}

          <div className="gh-ld__dau">
            <h3>Người</h3>
            <span className="gh-nho">bấm Tài xế hoặc Phụ xe trên hàng</span>
            <span className="rc__spacer" />
            {(dangNap || taiXe.length > 0) && (
              <input className="input gh-ld__tim" type="search" value={timNv} aria-label="Tìm người"
                disabled={dangNap} placeholder="Tìm tên, mã nhân viên, chữ cái đầu"
                onChange={(e) => setTimNv(e.target.value)} />
            )}
          </div>
          {dangNap ? <GiuCho so={5} /> : taiXe.length === 0 ? (
            <p className="rc__sub gh-ld__rong">
              Chưa ai được cấp ô Giao hàng ngoài bạn. Tài xế phải có tài khoản đăng nhập và vai của họ
              phải bật ô Giao hàng, nếu không họ không bấm được “Đã lấy hàng”.
            </p>
          ) : (
            <div className="gh-ld__ds gh-ld__ds--nv" role="group" aria-label="Người">
              {nguoiChon.map(hangNguoi)}
              {nguoiChon.length > 0 && timNv && <div className="gh-ld__ngan">Kết quả tìm</div>}
              {nguoiLoc.map(hangNguoi)}
              {nguoiLoc.length === 0 && timNv && (
                <div className="gh-ld__khong">Không có ai khớp «{timNv}»</div>
              )}
            </div>
          )}
          {trangThai.size > 0 && taiXe.length > 0 && (
            <p className="gh-ld__goi">Người rảnh xếp trước, người nghỉ xuống cuối. Số chuyến là số đã giao hôm nay.</p>
          )}
        </div>

        <div className="gh-ld__phai">
          {theoLuot ? (
            <section className="gh-ld__nhom">
              <h3 className="gh-ld__tieu">Các yêu cầu chung một lượt</h3>
              <ul className="gh-ld__yc">
                {requests.map((r) => {
                  const h = hanGiao(r.ngay_can_giao);
                  return (
                    <li key={r.id}>
                      <span className="gh-ld__cat">
                        {r.code}
                        <span className="gh-nho gh-ld__dong">
                          {r.customer_name}
                          {r.order_code && <span className="gh-the">{r.order_code}</span>}
                        </span>
                      </span>
                      {h.tone ? <Pill text={h.text} tone={h.tone} /> : <span className="gh-nho">{h.text}</span>}
                    </li>
                  );
                })}
              </ul>
              <p className="gh-ld__goi">Mỗi yêu cầu thành một đơn giao hàng riêng, chạy chung một lượt xe.</p>
            </section>
          ) : (
            <section className="gh-ld__nhom">
              <h3 className="gh-ld__tieu">Yêu cầu</h3>
              <dl className="gh-ld__kv">
                <div>
                  <dt>Khách</dt>
                  <dd>
                    {request.customer_name ?? "—"}
                    {request.order_code && <span className="gh-the">{request.order_code}</span>}
                  </dd>
                </div>
                <div>
                  <dt>Hàng</dt>
                  {request.lines.length === 0 ? <dd>—</dd> : request.lines.map((x) => (
                    <dd key={x.id} className="gh-ld__mon">
                      <span>{x.mo_ta ?? x.hang_ten}</span>
                      <span className="gh-num">
                        {x.qty.toLocaleString("vi-VN")}
                        {x.don_vi_tinh && <span className="gh-nho"> {x.don_vi_tinh}</span>}
                      </span>
                    </dd>
                  ))}
                </div>
                <div>
                  <dt>Giao tới</dt>
                  <dd>{request.dia_chi || "—"}</dd>
                  {(request.nguoi_nhan || request.sdt_nguoi_nhan) && (
                    <dd className="gh-nho">
                      {request.nguoi_nhan}
                      {request.sdt_nguoi_nhan && ` ${sdtDoc(request.sdt_nguoi_nhan)}`}
                    </dd>
                  )}
                </div>
                <div>
                  <dt>Cần giao</dt>
                  <dd>
                    {(() => {
                      const h = hanGiao(request.ngay_can_giao);
                      return h.tone
                        ? <><Pill text={h.text} tone={h.tone} /> <span className="gh-nho">{ngayThuan(request.ngay_can_giao)}</span></>
                        : h.text;
                    })()}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {xeId && (
            <section className="gh-ld__nhom">
              <label className="gh-ld__tieu" htmlFor="gh-ld-luot">Lượt xe</label>
              <select id="gh-ld-luot" className="input gh-ld__nhap" value={luot} onChange={(e) => setLuot(e.target.value)}>
                <option value="moi">Lượt mới — xe xuất phát từ kho</option>
                {/* Ô chọn gốc không chứa được thẻ nhỏ ⇒ nói thành câu, không nối mẩu bằng dấu. */}
                {luotDs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {`Ghép vào ${l.code} ngày ${ngayThuan(l.ngay)} đang có ${l.so_diem} điểm`}
                    {l.tai_xe ? ` do ${l.tai_xe} chạy` : ""}
                    {l.da_xuat_phat ? " (xe đã xuất phát)" : ""}
                  </option>
                ))}
              </select>
            </section>
          )}

          {/* Nhãn TRÁI ô PHẢI, mỗi giờ một dòng: cột phải hẹp, hai ô ngày-giờ đứng cạnh nhau thì
              tràn mép (ô ngày-giờ có bề rộng tối thiểu của trình duyệt). */}
          <section className="gh-ld__nhom">
            <h3 className="gh-ld__tieu">Thời gian</h3>
            <div className="gh-ld__dong-o">
              <label htmlFor="gh-ld-lay">Lấy hàng <span className="gh-bat-buoc">*</span></label>
              <input id="gh-ld-lay" className="input gh-ld__nhap" type="datetime-local" min={GIO_NHAP_MIN}
                max={GIO_NHAP_MAX} value={lay} onChange={(e) => setLay(e.target.value)} />
            </div>
            <div className="gh-ld__dong-o">
              <label htmlFor="gh-ld-giao">Dự kiến giao <span className="gh-bat-buoc">*</span></label>
              <input id="gh-ld-giao" className="input gh-ld__nhap" type="datetime-local" min={GIO_NHAP_MIN}
                max={GIO_NHAP_MAX} value={giao} onChange={(e) => setGiao(e.target.value)} />
            </div>
            {gioSai && (
              <div className="banner banner--warn" role="status" style={{ margin: 0 }}>
                {gioNhapSai(lay) && gioNhapSai(giao)
                  ? "Giờ lấy hàng và giờ dự kiến giao"
                  : gioNhapSai(lay) ? "Giờ lấy hàng" : "Giờ dự kiến giao"}{" "}
                không đọc được — năm phải 4 chữ số, trong khoảng 2000–2099.
              </div>
            )}
          </section>

          <section className="gh-ld__nhom">
            <label className="gh-ld__tieu" htmlFor="gh-ld-ghi-chu">Ghi chú cho kíp xe</label>
            <textarea id="gh-ld-ghi-chu" className="input gh-ld__nhap" rows={3} value={ghiChu}
              placeholder="Ví dụ: gọi trước cho bảo vệ KCN" onChange={(e) => setGhiChu(e.target.value)} />
          </section>

          {taiXeChon && !taiXeChon.co_thao_tac && (
            <div className="banner banner--warn" role="status" style={{ margin: 0 }}>
              {taiXeChon.full_name}{" "}
              {taiXeChon.co_tai_khoan === false ? "chưa có tài khoản" : "chưa được cấp quyền thao tác"}
              {" "}— vẫn phân chuyến được, nhưng bạn phải bấm hộ.
            </div>
          )}
          {phuXeId && (
            <p className="gh-ld__goi">Có phụ xe nên tiền chuyến chia theo tỷ lệ khai ở Phòng ban.</p>
          )}
          {canhBao.map((c) => (
            <div key={c} className="banner banner--warn" role="status" style={{ margin: 0 }}>{c}</div>
          ))}
          {loi && <div className="banner banner--error" role="alert" style={{ margin: 0 }}>{loi}</div>}
        </div>
      </div>
    </NganPhai>
  );
}
