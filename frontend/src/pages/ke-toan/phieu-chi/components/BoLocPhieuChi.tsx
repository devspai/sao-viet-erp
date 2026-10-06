/** Bộ lọc nâng cao màn Phiếu chi (đặc tả PC-1, A.18) — khuôn chung `BoLocPhieu` của hai sổ phiếu,
 *  chỉ khai chữ và danh sách Nguồn chi. Bản nháp, đếm "Khớp n phiếu", chip: xem `shared/BoLocPhieu`.
 */
import type { CompanyBankAccountRow } from "../../../../api/client";
import { BoLocPhieu, chipsLocPhieu, type CauHinhBoLoc } from "../../shared/BoLocPhieu";
import { NGUON_LUA_CHON, type LocPC } from "../shared/loc";

export { tenTaiKhoan } from "../../shared/BoLocPhieu";

const CAU_HINH: CauHinhBoLoc = {
  nhanNguon: "Nguồn chi",
  nguonLuaChon: NGUON_LUA_CHON,
  nhanTaiKhoan: "Trả từ tài khoản",
  nhanTen: "Người nhận",
  goiYTen: "Gõ tên người nhận",
};

/** Chip cho từng điều kiện đã áp — thứ tự theo bảng lọc. */
export function chipsLoc(loc: LocPC, taiKhoan: CompanyBankAccountRow[] | null) {
  return chipsLocPhieu(loc, taiKhoan, CAU_HINH);
}

export function BoLocPhieuChi(props: {
  loc: LocPC;
  onDoiLoc: (l: LocPC) => void;
  /** Máy chủ đếm số phiếu khớp một bản nháp (cùng thẻ, kỳ và ô tìm đang xem). */
  demKhop: (nhap: LocPC) => Promise<number>;
  /** Tài khoản công ty dùng để chi; null = không có quyền xem Tài khoản ngân hàng ⇒ ẩn ô. */
  taiKhoan: CompanyBankAccountRow[] | null;
}) {
  return <BoLocPhieu cauHinh={CAU_HINH} {...props} />;
}
