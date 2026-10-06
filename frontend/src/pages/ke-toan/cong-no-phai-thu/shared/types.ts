// Kiểu dùng chung của màn Công nợ phải thu.

/** Ô bấm ngoài bảng mở ngăn ở đâu: dòng khách ("all"), số Quá hạn ("overdue" — tab Hoá đơn còn nợ
 *  lọc sẵn quá hạn), số Đã thu trong kỳ ("paid" — tab Đã thu). */
export type Bucket = "all" | "overdue" | "paid";

/** Mốc tuổi nợ đang lọc ở danh sách — ngăn lọc sẵn hoá đơn của mốc đó. */
export type TuoiDangLoc = { khoa: string; nhan: string };
