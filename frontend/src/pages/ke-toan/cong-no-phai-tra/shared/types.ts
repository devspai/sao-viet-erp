// Kiểu dùng chung của màn Công nợ phải trả.
/** Ô bấm ngoài bảng mở ngăn ở đâu: dòng NCC ("all"), số Quá hạn ("overdue" — tab Còn nợ lọc sẵn quá
 *  hạn), số Đã trả trong kỳ ("paid" — tab Đã trả). */
export type Bucket = "all" | "overdue" | "paid";
