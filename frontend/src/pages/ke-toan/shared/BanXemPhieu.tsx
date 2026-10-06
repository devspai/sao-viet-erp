/** Bản xem trước tờ phiếu (mẫu 01-TT / 02-TT) đặt cạnh form lập phiếu — hiện dần theo từng phím
 *  gõ để soát tên, số tiền, số tiền bằng chữ trước khi bấm "Lập" (lập xong không sửa được).
 *  Cùng nhãn và thứ tự dòng với bản in thật (`utils/printTT200.ts`); ô còn trống để xám.
 *
 *  Kiểu mới (06/10/2026, docs/mockups/thu-tien-ngan-chong-phuong-an-3-ban-2.html): tờ A5 đứng
 *  (148 × 210), chữ Times như bản in; đầu tờ có địa chỉ công ty và mẫu số kèm thông tư; dòng "Số:"
 *  ghi sẵn phần mã máy chủ sẽ cấp (tiền tố + ngày lập), bốn ký tự cuối "tự cấp"; dưới chữ ký ghi tên
 *  người nộp / nhận và tên NGƯỜI LẬP lấy từ tài khoản đang đăng nhập.
 */
import { useAuth } from "../../../auth/useAuth";
import { COMPANY } from "../../../constants/company";
import { amountInWords, dmyParts } from "../../../utils/format";
import { homNayVN } from "../../../utils/ky";
import { MAU_TT200, type TT200Line } from "../../../utils/printTT200";

function Dong({ nhan, giaTri, goiY, nghieng }: { nhan: string; giaTri: string | null | undefined; goiY?: string; nghieng?: boolean }) {
  const co = !!giaTri?.trim();
  return (
    <div className="kt-xp__dong">
      <span>{nhan}:</span>
      {co ? nghieng ? <em>{giaTri}</em> : <b>{giaTri}</b> : <i>{goiY ?? ""}</i>}
    </div>
  );
}

/** Tên dưới chữ ký — tên quá dài (tên công ty) thì để trống cho người ký tự ghi. */
const tenKy = (t: string | null | undefined) => {
  const s = (t ?? "").trim();
  return s.length <= 22 ? s : "";
};

export function BanXemPhieu({
  kind,
  ngay,
  nguoi,
  diaChi,
  lyDo,
  dongPhu = [],
  soTien,
  soChungTu,
  tienTo,
}: {
  kind: "chi" | "thu";
  ngay: string | null;
  nguoi: string | null | undefined;
  diaChi?: string | null;
  lyDo: string;
  dongPhu?: TT200Line[];
  soTien: number;
  soChungTu: number;
  /** Tiền tố mã phiếu: "PT" (thu), "PC" (chi tiền mặt), "UNC" (chi chuyển khoản). */
  tienTo?: string;
}) {
  const { user } = useAuth();
  const mau = MAU_TT200[kind];
  const { d, m, y } = dmyParts(ngay);
  // Máy chủ cấp mã theo NGÀY LẬP (hôm nay), không theo ngày chứng từ: PT-yymmdd-XXXX.
  const ngayLap = homNayVN().slice(2).replace(/-/g, "");
  const nguoiKy = kind === "thu" ? "Người nộp tiền" : "Người nhận tiền";
  return (
    <div className="kt-xp">
      <div className="kt-xp__giay" aria-label={`Xem trước ${mau.title.toLowerCase()}`}>
        <div className="kt-xp__dau">
          <span>
            <b>{COMPANY.name}</b>
            {COMPANY.address}
          </span>
          <span className="kt-xp__mau">
            <b>{mau.formCode}</b>
            <i>(TT 200/2014/TT-BTC)</i>
          </span>
        </div>
        <h4>{mau.title}</h4>
        <div className="kt-xp__ngay">{`Ngày ${d} tháng ${m} năm ${y}`}</div>
        <div className="kt-xp__so">
          {`Số: ${tienTo ?? (kind === "thu" ? "PT" : "PC")}-${ngayLap}-`}
          <i>tự cấp</i>
        </div>
        <Dong nhan={mau.personLabel} giaTri={nguoi} goiY="chưa ghi" />
        {diaChi ? <Dong nhan="Địa chỉ" giaTri={diaChi} /> : null}
        <Dong nhan={mau.reasonLabel} giaTri={lyDo} goiY="chưa ghi" />
        {dongPhu.map((l) => (
          <Dong key={l.label} nhan={l.label} giaTri={l.value} />
        ))}
        <Dong nhan="Số tiền" giaTri={soTien > 0 ? `${Math.round(soTien).toLocaleString("vi-VN")} đồng` : null} goiY="chưa ghi" />
        <Dong nhan="Viết bằng chữ" giaTri={soTien > 0 ? `${amountInWords(soTien)}.` : null} nghieng />
        <Dong nhan="Kèm theo" giaTri={`${soChungTu} chứng từ gốc`} />
        <div className="kt-xp__ky">
          {mau.signers.map((s) => (
            <span key={s}>
              {s}
              <i>{s === nguoiKy ? tenKy(nguoi) : s === "Người lập phiếu" ? tenKy(user?.name) : ""}</i>
            </span>
          ))}
        </div>
      </div>
      <p className="kt-xp__cap">Bản in đổi theo từng phím gõ</p>
    </div>
  );
}
