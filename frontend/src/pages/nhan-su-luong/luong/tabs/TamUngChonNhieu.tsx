// Thanh "chọn nhiều" của tab Tạm ứng (25/09/2026): duyệt / từ chối nhiều phiếu, lập phiếu chi và
// xuất Excel cho nhiều phiếu đã duyệt một lượt — chủ: lập phiếu cho cả xưởng một cú mà bắt duyệt,
// lập phiếu chi từng người là bất tiện.
//
// Thanh đi theo TAB trạng thái (xem `dieu-kien-tam-ung.ts`): tab Chờ duyệt chỉ có Duyệt / Từ chối (ô
// `luong:approve`), tab Chờ chi chỉ có Lập phiếu chi (`phieu_chi:create`) / Xuất Excel (`luong:export`).
// Lựa chọn GIỮ qua trang / điều kiện lọc / ô tìm ⇒ thanh phải nói rõ bao nhiêu phiếu đã chọn đang bị
// bộ lọc che, và cho "Chỉ xem phiếu đã chọn" để soát trước khi bấm. Từ 06/10/2026 danh sách lọc và
// chia trang ở máy chủ: máy chủ trả kèm id mọi phiếu khớp lọc (`ids_loc`) để đếm phần bị che.
import { api, type SalaryAdvance } from "../../../../api/client";
import { money } from "../shared/helpers";
import type { TabTrangThai } from "./dieu-kien-tam-ung";

/** Tải file chuyển khoản (khuôn lô lương BIZ MBBank) — cả kỳ, hoặc chỉ `ids` đang tick. */
export async function taiFileChuyenKhoan(
  token: string,
  year: number,
  month: number,
  ids?: number[],
): Promise<void> {
  const url = await api.luong.advancesXlsxBlobUrl(token, year, month, ids);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ck-luong-ung-${year}-${String(month).padStart(2, "0")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function TamUngChonNhieu({
  tab,
  coPhieuTrongTab,
  idsLoc,
  daChon,
  dangChonTatCa,
  onChonTatCa,
  onBoChon,
  chiXemChon,
  setChiXemChon,
  busy,
  canDuyet,
  canLapPhieuChi,
  canXuat,
  onDuyet,
  onTuChoi,
  onLapPhieuChi,
  onXuatExcel,
}: {
  tab: TabTrangThai;
  /** Tab đang đứng có phiếu nào không (bỏ qua bộ lọc). */
  coPhieuTrongTab: boolean;
  /** Id mọi phiếu của tab KHỚP bộ lọc, mọi trang (máy chủ trả). */
  idsLoc: Set<number>;
  daChon: SalaryAdvance[];
  dangChonTatCa: boolean;
  /** Nạp mọi phiếu khớp lọc từ máy chủ rồi thêm vào lựa chọn. */
  onChonTatCa: () => void;
  onBoChon: () => void;
  chiXemChon: boolean;
  setChiXemChon: (v: boolean) => void;
  busy: boolean;
  canDuyet: boolean;
  canLapPhieuChi: boolean;
  canXuat: boolean;
  onDuyet: (advs: SalaryAdvance[]) => void;
  onTuChoi: (advs: SalaryAdvance[]) => void;
  onLapPhieuChi: (advs: SalaryAdvance[]) => void;
  onXuatExcel: (advs: SalaryAdvance[]) => void;
}) {
  const choDuyet = tab === "cho_duyet" && canDuyet;
  const choChi = tab === "cho_chi" && (canLapPhieuChi || canXuat);
  if ((!choDuyet && !choChi) || !coPhieuTrongTab) return null;

  const idChon = new Set(daChon.map((a) => a.id));
  const biChe = daChon.filter((a) => !idsLoc.has(a.id)).length;
  const chuaChonHet = [...idsLoc].some((id) => !idChon.has(id));
  const tong = daChon.reduce((s, a) => s + a.amount, 0);

  return (
    <div className="lg-tu-chon" role="toolbar" aria-label="Thao tác nhiều phiếu">
      {chuaChonHet && idsLoc.size > 0 && (
        <button
          type="button"
          className="btn btn--ghost"
          disabled={dangChonTatCa}
          onClick={onChonTatCa}
          title="Chọn mọi phiếu khớp bộ lọc, ở mọi trang — phiếu đã chọn trước đó vẫn giữ"
        >
          Chọn tất cả {idsLoc.size} phiếu đang lọc
        </button>
      )}
      {daChon.length > 0 && (
        <>
          <span className="lg-tu-chon__dem">
            Đã chọn <b>{daChon.length}</b> phiếu — tổng {money(tong)}đ
            {biChe > 0 && (
              <span className="lg-tu-chon__che">
                {" "}
                — {biChe} phiếu đang không hiện vì bộ lọc
              </span>
            )}
          </span>
          {(biChe > 0 || chiXemChon) && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setChiXemChon(!chiXemChon)}
            >
              {chiXemChon ? "Xem lại theo bộ lọc" : "Chỉ xem phiếu đã chọn"}
            </button>
          )}
          {choDuyet && (
            <>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => onDuyet(daChon)}
              >
                Duyệt {daChon.length} phiếu
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() => onTuChoi(daChon)}
              >
                Từ chối {daChon.length} phiếu
              </button>
            </>
          )}
          {choChi && canLapPhieuChi && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => onLapPhieuChi(daChon)}
            >
              Lập phiếu chi cho {daChon.length} phiếu
            </button>
          )}
          {choChi && canXuat && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => onXuatExcel(daChon)}
              title="File chuyển khoản theo mẫu lô lương BIZ MBBank — chỉ những phiếu đang chọn"
            >
              Xuất Excel {daChon.length} phiếu
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onBoChon}>
            Bỏ chọn
          </button>
        </>
      )}
    </div>
  );
}
