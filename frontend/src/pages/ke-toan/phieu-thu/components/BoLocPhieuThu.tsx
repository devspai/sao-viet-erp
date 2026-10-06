/** Bộ lọc nâng cao màn Phiếu thu (đặc tả PT-1, A.18) — khuôn chung `BoLocPhieu` của hai sổ phiếu,
 *  chỉ khai chữ và danh sách Nguồn thu. Bản nháp, đếm "Khớp n phiếu", chip: xem `shared/BoLocPhieu`.
 */
import type { CompanyBankAccountRow } from "../../../../api/client";
import { BoLocPhieu, type CauHinhBoLoc } from "../../shared/BoLocPhieu";
import { NGUON_LUA_CHON, type LocPT } from "../shared/loc";

const CAU_HINH: CauHinhBoLoc = {
  nhanNguon: "Nguồn thu",
  nguonLuaChon: NGUON_LUA_CHON,
  nhanTaiKhoan: "Vào tài khoản",
  nhanTen: "Người nộp",
  goiYTen: "Gõ tên người nộp",
};

export function BoLocPhieuThu(props: {
  loc: LocPT;
  onDoiLoc: (l: LocPT) => void;
  /** Máy chủ đếm số phiếu khớp một bản nháp (cùng thẻ, kỳ và ô tìm đang xem). */
  demKhop: (nhap: LocPT) => Promise<number>;
  /** Tài khoản công ty nhận tiền; null = không có quyền xem Tài khoản ngân hàng ⇒ ẩn ô. */
  taiKhoan: CompanyBankAccountRow[] | null;
}) {
  return <BoLocPhieu cauHinh={CAU_HINH} {...props} />;
}
