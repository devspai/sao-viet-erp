/** Nhãn + màu trạng thái hợp tác của nhà cung cấp — dùng chung cho lưới, dải lọc nhanh và đầu ngăn. */
export const TT_NCC = {
  active: { mau: "la", label: "Đang hợp tác" },
  inactive: { mau: "xam", label: "Tạm ngừng" },
} as const;

export function ttNcc(status: string) {
  return TT_NCC[status as keyof typeof TT_NCC] ?? TT_NCC.inactive;
}
