// Gia công ngoài trên DÒNG bảng lệnh của Kế hoạch SX. Trước đây bảng không có gì nói lệnh đang
// nằm ở nhà gia công: lệnh trọn gói hiện "6 bước / Cắt 2" + "Đã phát hành" y như lệnh đang chạy ở
// xưởng, người kế hoạch phải mở từng lệnh mới biết hàng đang ở đâu.
import type { LsxListGiaCong } from "../../api/client";
import { Icon } from "../../components/Icons";
import { NHAN_NGAN } from "./giaCong";
import "./giaCongDong.css";

const conMo = (g: LsxListGiaCong) => g.trang_thai !== "da_xong";

/** Lệnh trọn gói: cả lệnh ở nhà gia công — thay hẳn ô "số bước / tổ đầu" (lệnh không xuống tổ). */
export function laTronGoi(g: LsxListGiaCong | null | undefined): g is LsxListGiaCong {
  return g?.kieu === "tron_goi";
}

/** Ô "Đang làm ở đâu" của lệnh trọn gói. */
export function OTronGoi({ g }: { g: LsxListGiaCong }) {
  return (
    <div className="gcd">
      <span className={`gcd__chip ${conMo(g) ? "gcd__chip--mo" : "gcd__chip--xong"}`}>
        <Icon name="truck" size={12} />
        Gia công trọn gói
      </span>
      <span className="gcd__ncc" title={g.nha_cung_cap_ten}>{g.nha_cung_cap_ten}</span>
      {/* Xưởng cấp giấy mà chưa gửi đề nghị xuất — nhà gia công đang chờ giấy. Gửi xong chip rụng
          (máy chủ phát SSE, bảng tự nạp). */}
      {g.cho_cap_giay && (
        <span className="gcd__chip gcd__chip--nho gcd__chip--cho-giay"
          title="Mở lệnh, bấm “Chọn giấy” ở khối Gia công ngoài để kho xuất giấy">
          Chờ cấp giấy
        </span>
      )}
    </div>
  );
}

/** Chip phụ dưới ô số bước của lệnh có MỘT PHẦN đi gia công — chỉ khi còn lần đang mở (lần đã
 *  nhận về là chuyện đã qua, bảng không cần nhắc). */
export function ChipMotPhan({ g }: { g: LsxListGiaCong }) {
  if (!conMo(g)) return null;
  const them = g.so_lan_mo > 1 ? ` và ${g.so_lan_mo - 1} lần khác` : "";
  const tieuDe = [
    `${g.ten_viec} ở ${g.nha_cung_cap_ten}${them}`,
    g.bai_ghep_ma ? `Đi chung bài ghép ${g.bai_ghep_ma}` : null,
  ].filter(Boolean).join("\n");
  return (
    <span className={`gcd__chip gcd__chip--nho gcd__chip--${g.trang_thai}`} title={tieuDe}>
      <Icon name="truck" size={11} />
      <span className="gcd__viec">{g.ten_viec}</span>
      <span className="gcd__tt">{NHAN_NGAN[g.trang_thai]}</span>
    </span>
  );
}

/** Pill trạng thái thay "Đã phát hành" cho lệnh trọn gói đang ở ngoài. */
export function PillTronGoi({ g }: { g: LsxListGiaCong }) {
  return (
    <span
      className={`khsx-pill gcd__pill ${conMo(g) ? "gcd__pill--mo" : "gcd__pill--xong"}`}
      title="Lệnh đã giao trọn gói cho nhà gia công, không xuống xưởng"
    >
      <span className="khsx-pill__dot" aria-hidden="true" />
      {conMo(g) ? "Ở nhà gia công" : "Đã nhận về"}
    </span>
  );
}
