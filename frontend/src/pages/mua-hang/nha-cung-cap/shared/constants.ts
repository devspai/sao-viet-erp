// Hằng số dùng chung của màn Nhà cung cấp (tách từ pages/SuppliersPage.tsx).
import type { SupplierInput } from "../../../../api/client";

/** Cỡ trang MẶC ĐỊNH — người dùng đổi ở ô Dòng/trang dưới chân bảng. */
export const PAGE_SIZE = 25;

export const REQUIRED_SUPPLIER_FIELDS: Array<[keyof SupplierInput, string]> = [
  ["name", "Tên nhà cung cấp"],
  ["supplier_group", "Nhóm"],
  ["tax_code", "Mã số thuế"],
  ["contact_name", "Người liên hệ"],
  ["phone", "Số điện thoại"],
  ["email", "Email"],
  ["address", "Địa chỉ"],
];
