/** Thẻ tài khoản ngân hàng (đặc tả TK-1, khuôn Mercury): vòng 40px chữ viết tắt ngân hàng — tên +
 *  chi nhánh — pill trạng thái — số tài khoản 20px nhóm 4 số + nút "Chép" — chủ tài khoản — hai ô
 *  "Thu trong kỳ" (xanh) / "Chi trong kỳ" — thẻ nhỏ mục đích + loại tiền.
 *
 *  Ngừng dùng: nền --paper, pill xám (không đỏ), hai ô đổi thành "Ngừng từ …" / "Phiếu cũ vẫn giữ số
 *  này". "Ngừng từ" là `updated_at` — lần đổi gần nhất máy chủ giữ.
 *
 *  Cả thẻ bấm được (chuột / Enter) để mở ngăn; nút "Chép" chỉ chép, không mở ngăn.
 */
import { ArrowDown, ArrowUp, Check, CircleAlert, Copy } from "lucide-react";
import { useState } from "react";

import { TheNho } from "../../shared/Cum";
import { doiSo, ngay, vietSo } from "../../shared/dinhDang";
import { nhomBon, soChep, soTienCoDau, tieuDeTaiKhoan, vietTat } from "../shared/helpers";
import type { SoLieuTk, TaiKhoan } from "../shared/types";

function OSo({ nhan, so, cung, loai }: { nhan: string; so: number | null; cung: number | null; loai: "thu" | "chi" }) {
  const d = so != null && cung != null ? doiSo(so, cung) : null;
  return (
    <div>
      <span>{nhan}</span>
      <b className={so == null || so === 0 ? "kt-mo" : loai === "thu" ? "kt-xanh" : undefined}>
        {so == null ? "—" : soTienCoDau(so, loai)}
      </b>
      {d && cung != null && (
        <small className="kt-cung-ky">
          {d.huong === "len" && <ArrowUp size={14} aria-hidden="true" />}
          {d.huong === "xuong" && <ArrowDown size={14} aria-hidden="true" />}
          {`Cùng kỳ ${vietSo(cung)}`}
        </small>
      )}
    </div>
  );
}

export function TheTaiKhoan({
  r,
  soLieu,
  cung,
  dangXem,
  onMo,
}: {
  r: TaiKhoan;
  /** Thu/chi trong kỳ (đã điền 0); null = chưa có số ⇒ "—". */
  soLieu: SoLieuTk | null;
  /** Cùng kỳ năm trước; null = tắt so sánh / chưa có. */
  cung: SoLieuTk | null;
  dangXem: boolean;
  onMo: () => void;
}) {
  // "cho" = chưa bấm; "xong" / "loi" hiện thoáng rồi về "cho". Trình duyệt chặn (không HTTPS, không cấp
  // quyền) thì báo ngắn "Không chép được" — đừng im lặng để người dùng tưởng đã chép.
  const [chepXong, setChepXong] = useState<"cho" | "xong" | "loi">("cho");
  const bao = (kq: "xong" | "loi") => {
    setChepXong(kq);
    window.setTimeout(() => setChepXong("cho"), kq === "xong" ? 1500 : 2000);
  };
  const chep = () => {
    const bang = navigator.clipboard;
    if (!bang) {
      bao("loi");
      return;
    }
    bang.writeText(soChep(r.account_number)).then(() => bao("xong"), () => bao("loi"));
  };

  return (
    <article
      className={`kt-tk${r.is_active ? "" : " kt-tk--ngung"}${dangXem ? " kt-dang-xem" : ""}`}
      aria-label={`Tài khoản ${tieuDeTaiKhoan(r)}`}
      tabIndex={0}
      onClick={onMo}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onMo();
        }
      }}
    >
      <div className="kt-tk__dau">
        <span className="kt-tk__vong" aria-hidden="true">{vietTat(r.bank_name)}</span>
        <div>
          <div className="kt-tk__nh">{r.bank_name}</div>
          <div className="kt-tk__cn">{/^chi nhánh/i.test(r.bank_branch.trim()) ? r.bank_branch : `Chi nhánh ${r.bank_branch}`}</div>
        </div>
        <span className={`kt-tt ${r.is_active ? "kt-tt--xanh" : "kt-tt--xam"}`}>{r.is_active ? "Đang dùng" : "Ngừng dùng"}</span>
      </div>
      <div className="kt-tk__so">
        {nhomBon(r.account_number)}
        <button type="button" className="kt-btn kt-btn--nho"
          onClick={(e) => {
            e.stopPropagation();
            chep();
          }}>
          {chepXong === "xong" ? <Check size={14} aria-hidden="true" />
            : chepXong === "loi" ? <CircleAlert size={14} aria-hidden="true" />
              : <Copy size={14} aria-hidden="true" />}
          {chepXong === "xong" ? "Đã chép" : chepXong === "loi" ? "Không chép được" : "Chép"}
        </button>
      </div>
      <div className="kt-tk__chu">{r.account_holder}</div>
      {r.is_active ? (
        <>
          <div className="kt-tk__so-lieu">
            <OSo nhan="Thu trong kỳ" so={soLieu?.thu ?? null} cung={cung?.thu ?? null} loai="thu" />
            <OSo nhan="Chi trong kỳ" so={soLieu?.chi ?? null} cung={cung?.chi ?? null} loai="chi" />
          </div>
          <div className="kt-tk__the">
            {r.use_for_receipts && <TheNho>Nhận tiền</TheNho>}
            {r.use_for_payments && <TheNho>Trả tiền</TheNho>}
            <TheNho>{r.currency}</TheNho>
          </div>
        </>
      ) : (
        <div className="kt-tk__so-lieu">
          <div>
            <span>Ngừng từ</span>
            <b className="kt-mo">{ngay(r.updated_at)}</b>
          </div>
          <div>
            <span>Phiếu cũ</span>
            <b className="kt-mo">vẫn giữ số này</b>
          </div>
        </div>
      )}
    </article>
  );
}
