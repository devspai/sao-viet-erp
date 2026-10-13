// Danh sách NGƯỜI chọn tài xế / phụ xe — dùng chung cho ngăn Lên đơn và ngăn Đổi chuyến (12/10/2026,
// chủ chọn phương án A: đổi chuyến dùng đúng danh sách của Lên đơn, thấy ai rảnh / có lịch).
//
// Vai trò do NÚT trên hàng quyết định, không phải thuộc tính của người: hôm nay lái, mai đi phụ. Một
// người không vừa tài xế vừa phụ xe — bấm vai kia là đổi vai. Hàng đã chọn đứng yên chỗ cũ, ô tìm không
// lọc mất nó; người rảnh xếp trước, người nghỉ xuống cuối.
import { useState } from "react";
import type { DeliveryDriver, DeliveryDriverPick } from "../../../../api/client";
import { boDau, khopGanDung } from "../../../../utils/timGanDung";
import { NHAN_TRANG_THAI_NV } from "../shared/constants";
import { TONE_NV } from "../shared/helpers";
import { Pill } from "./giaoHangCells";

const THU_TU_NV = ["ranh", "co_lich", "dang_giao", "dang_tra_hang", "nghi"];

/** Chữ cái đầu mỗi từ — gõ "nvv" ra Nguyễn Văn Việt. */
const dauChu = (s: string) => boDau(s).split(" ").map((w) => w[0] ?? "").join("");

/** Hai chữ cái của avatar: hai từ cuối của tên. */
const viet = (ten: string) => ten.trim().split(/\s+/).slice(-2).map((w) => w[0] ?? "").join("").toUpperCase();

/** Hàng giữ chỗ lúc nguồn chưa về — khung ngăn đứng yên, không nhảy khi danh sách đổ vào. */
export function GiuCho({ so }: { so: number }) {
  return (
    <div className="gh-ld__ds" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: so }, (_, i) => (
        <div key={i} className="gh-ld__hang gh-ld__hang--cho"><i /><i /><i /></div>
      ))}
    </div>
  );
}

export function ChonKipXe({
  taiXe,
  trangThai,
  dangNap,
  employeeId,
  phuXeId,
  onEmployee,
  onPhuXe,
}: {
  taiXe: DeliveryDriverPick[];
  trangThai: Map<number, DeliveryDriver>;
  dangNap: boolean;
  employeeId: string;
  phuXeId: string;
  onEmployee: (id: string) => void;
  onPhuXe: (id: string) => void;
}) {
  const [tim, setTim] = useState("");

  const thuTu = (id: number) => {
    const k = THU_TU_NV.indexOf(trangThai.get(id)?.trang_thai ?? "");
    return k < 0 ? THU_TU_NV.length : k;
  };
  const conChon = (id: number) => String(id) === employeeId || String(id) === phuXeId;
  const loc = taiXe
    .filter((t) => conChon(t.id) || khopGanDung(`${t.full_name} ${t.code ?? ""} ${dauChu(t.full_name)}`, tim))
    .sort((a, b) => thuTu(a.id) - thuTu(b.id));

  const chonTaiXe = (id: string) => {
    onEmployee(employeeId === id ? "" : id);
    if (phuXeId === id) onPhuXe("");
  };
  const chonPhuXe = (id: string) => {
    onPhuXe(phuXeId === id ? "" : id);
    if (employeeId === id) onEmployee("");
  };

  const hang = (t: DeliveryDriverPick) => {
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

  return (
    <>
      <div className="gh-ld__dau">
        <h3>Người</h3>
        <span className="gh-nho">bấm Tài xế hoặc Phụ xe trên hàng</span>
        <span className="rc__spacer" />
        {(dangNap || taiXe.length > 0) && (
          <input className="input gh-ld__tim" type="search" value={tim} aria-label="Tìm người"
            disabled={dangNap} placeholder="Tìm tên, mã nhân viên, chữ cái đầu"
            onChange={(e) => setTim(e.target.value)} />
        )}
      </div>
      {dangNap ? <GiuCho so={5} /> : taiXe.length === 0 ? (
        <p className="rc__sub gh-ld__rong">
          Chưa ai được cấp ô Giao hàng ngoài bạn. Tài xế phải có tài khoản đăng nhập và vai của họ
          phải bật ô Giao hàng, nếu không họ không bấm được “Bắt đầu giao”.
        </p>
      ) : (
        <div className="gh-ld__ds gh-ld__ds--nv" role="group" aria-label="Người">
          {loc.map(hang)}
          {loc.every((t) => conChon(t.id)) && tim && (
            <div className="gh-ld__khong">Không có ai khớp «{tim}»</div>
          )}
        </div>
      )}
      {trangThai.size > 0 && taiXe.length > 0 && (
        <p className="gh-ld__goi">Người rảnh xếp trước, người nghỉ xuống cuối. Số chuyến là số đã giao hôm nay.</p>
      )}
    </>
  );
}
