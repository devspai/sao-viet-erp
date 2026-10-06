// Hàm dùng chung của màn Công nợ phải thu.

export function methodText(value: string): string {
  return value === "bank_transfer" ? "Chuyển khoản" : "Tiền mặt";
}
