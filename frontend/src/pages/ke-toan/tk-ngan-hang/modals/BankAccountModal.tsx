// Form THÊM / SỬA tài khoản ngân hàng công ty (đặc tả TK-3, A.2, A.3, A.5).
// Vỏ `KhungFormPhieu` → `NganPhai` (cùng độ rộng chung với mọi ngăn), cột ô tối đa 560px canh trái.
// Lỗi nằm TẠI Ô, con trỏ nhảy tới ô sai đầu tiên, nút Lưu luôn bấm được. Trùng số tài khoản: máy chủ
// đã chặn bằng khoá duy nhất (ngân hàng + số) và trả 409 ⇒ báo ngay dưới ô Số tài khoản. Esc đóng
// (form gõ dở thì hỏi trước). Ô "Đang hoạt động" đã bỏ — ngừng / dùng lại là thao tác riêng (TK-4).
import { CircleAlert } from "lucide-react";
import { useRef, useState } from "react";

import { ApiError, api } from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { NhomNut } from "../../shared/NhomNut";
import { KhungFormPhieu, OF, idO, nhayToiLoi, type LoiForm } from "../../shared/KhungFormPhieu";
import {
  THU_TU_O,
  formTrong,
  formTuTaiKhoan,
  loiFormTaiKhoan,
  payloadTaiKhoan,
} from "../shared/helpers";
import type { FormTaiKhoan, LoaiTien, TaiKhoan } from "../shared/types";

const TRUNG = "Tài khoản này đã có trong danh sách.";

export function BankAccountModal({
  editing,
  tang,
  onDong,
  onDaLuu,
}: {
  editing: TaiKhoan | null;
  /** 1 = mở từ ngăn tài khoản (chồng lên ngăn): Esc chỉ đóng form. */
  tang?: number;
  onDong: () => void;
  onDaLuu: (r: TaiKhoan) => void;
}) {
  const { token } = useAuth();
  const [dau] = useState<FormTaiKhoan>(() => (editing ? formTuTaiKhoan(editing) : formTrong()));
  const [f, setF] = useState<FormTaiKhoan>(dau);
  const [loi, setLoi] = useState<LoiForm>({});
  const [loiChung, setLoiChung] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const daBam = useRef(false);

  // Gõ lại ô nào thì lỗi của ô đó tự kiểm lại (sau lần bấm Lưu đầu); lỗi trùng số thì xoá khi đổi số.
  const doi = (moi: Partial<FormTaiKhoan>) => {
    const sau = { ...f, ...moi };
    setF(sau);
    if (daBam.current) setLoi(loiFormTaiKhoan(sau));
  };

  async function luu() {
    daBam.current = true;
    const l = loiFormTaiKhoan(f);
    setLoi(l);
    setLoiChung(null);
    if (Object.keys(l).length > 0) {
      nhayToiLoi(l, THU_TU_O);
      return;
    }
    if (!token) return;
    setDangLuu(true);
    try {
      const payload = payloadTaiKhoan(f, editing);
      const r = editing
        ? await api.accounting.updateCompanyAccount(token, editing.id, payload)
        : await api.accounting.createCompanyAccount(token, payload);
      onDaLuu(r);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const l2 = { account_number: TRUNG };
        setLoi(l2);
        nhayToiLoi(l2, THU_TU_O);
      } else {
        setLoiChung(err instanceof ApiError ? err.message : "Không lưu được tài khoản ngân hàng.");
      }
    } finally {
      setDangLuu(false);
    }
  }

  const oChu = (khoa: keyof FormTaiKhoan & string, nhan: string, toiDa: number, tuDong = false, goi?: string) => (
    <OF khoa={khoa} nhan={nhan} batBuoc loi={loi[khoa]} goi={goi}>
      <input id={idO(khoa)} type="text" autoFocus={tuDong} maxLength={toiDa} value={f[khoa] as string}
        aria-invalid={loi[khoa] ? true : undefined}
        onChange={(e) => doi({ [khoa]: e.target.value } as Partial<FormTaiKhoan>)} />
    </OF>
  );

  return (
    <KhungFormPhieu
      duongDan="Tài khoản ngân hàng"
      tieuDe={editing ? "Sửa tài khoản" : "Thêm tài khoản"}
      xemTruoc={null}
      dangLuu={dangLuu}
      loiChung={loiChung}
      onDong={onDong}
      chanDong={() => JSON.stringify(f) !== JSON.stringify(dau)}
      onSubmit={() => void luu()}
      nhanNut="Lưu tài khoản"
      nhanDangLuu="Đang lưu…"
      tang={tang}
      hep
    >
      <div className="kt-f__muc">
        {/* Mã trong ngoặc là chữ hiện ở vòng thẻ và tiêu đề ngăn ("VCB 0281 …") — không có thì dùng nguyên tên. */}
        {oChu("bank_name", "Ngân hàng", 255, true, "Ghi mã viết tắt trong ngoặc, ví dụ Vietcombank (VCB)")}
        {oChu("account_number", "Số tài khoản", 64)}
        {oChu("account_holder", "Chủ tài khoản", 255)}
        {oChu("bank_branch", "Chi nhánh", 255)}
      </div>
      <div className="kt-f__muc">
        <div className="kt-f__tieu">Dùng thế nào</div>
        <div className="kt-o" role="group" aria-labelledby="tkf-loai-tien">
          <span id="tkf-loai-tien" className="kt-o__nhan">Loại tiền</span>
          <div>
            <NhomNut<LoaiTien> giaTri={f.loaiTien} luaChon={[["VND", "VND"], ["USD", "USD"], ["khac", "Khác"]]}
              onDoi={(v) => doi({ loaiTien: v })} />
          </div>
        </div>
        {f.loaiTien === "khac" && (
          <OF khoa="tien_khac" nhan="Mã loại tiền" batBuoc loi={loi.tien_khac} goi="3 chữ cái in hoa, ví dụ EUR">
            <input id={idO("tien_khac")} type="text" maxLength={3} autoComplete="off" value={f.tienKhac}
              aria-invalid={loi.tien_khac ? true : undefined}
              onChange={(e) => doi({ tienKhac: e.target.value.replace(/[^a-z]/gi, "").toUpperCase() })} />
          </OF>
        )}
        <div className={`kt-o${loi.dung ? " kt-o--loi" : ""}`} role="group" aria-labelledby="tkf-dung">
          <span id="tkf-dung" className="kt-o__nhan">
            Dùng để
            <em className="kt-bb">*</em>
          </span>
          <label className="kt-ck-hang">
            <input id={idO("dung")} type="checkbox" className="kt-ck" checked={f.use_for_receipts}
              onChange={(e) => doi({ use_for_receipts: e.target.checked })} />
            <span>
              Nhận tiền
              <small>Hiện khi lập phiếu thu chuyển khoản</small>
            </span>
          </label>
          <label className="kt-ck-hang">
            <input type="checkbox" className="kt-ck" checked={f.use_for_payments}
              onChange={(e) => doi({ use_for_payments: e.target.checked })} />
            <span>
              Trả tiền
              <small>Hiện khi lập phiếu chi chuyển khoản</small>
            </span>
          </label>
          {loi.dung && (
            <span className="kt-o__loi" role="alert">
              <CircleAlert size={14} aria-hidden="true" />
              {loi.dung}
            </span>
          )}
        </div>
        <OF khoa="note" nhan="Ghi chú">
          <textarea id={idO("note")} maxLength={2000} value={f.note} onChange={(e) => doi({ note: e.target.value })} />
        </OF>
      </div>
    </KhungFormPhieu>
  );
}
