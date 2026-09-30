/** Cắt chuỗi công thức thành token — MỘT bản cho cả màn danh mục.
 *
 *  Trước 15/08/2026 có 4 bản chép tay trong `RebuildCatalogPage.tsx` (ba chỗ vẽ chip + một chỗ
 *  kiểm tra) và một bản nữa ở `QuyDoiCuaDonVi.tsx`. Bản của hàm KIỂM TRA quên `,` trong lớp ký
 *  tự — không làm nó báo đỏ (regex chỉ bỏ qua ký tự không khớp), nhưng nghĩa là dấu phẩy đi qua
 *  mà chẳng ai soi. Năm bản thì sớm muộn lệch nhau một ký tự, và lệch ở đâu thì không ai biết.
 *
 *  ⚠️ Regex có cờ `g` nên nó GIỮ TRẠNG THÁI (`lastIndex`) giữa các lần gọi. Đừng export chính nó
 *  rồi dùng chung — hai chỗ gọi xen kẽ là kết quả nhảy cóc. Ở đây mỗi lần cắt tạo một regex mới.
 */

/** Ký tự được coi là toán tử/dấu ngăn trong công thức. Gồm cả so sánh (chỉ dùng trong `if(...)`). */
export const TOAN_TU = ["+", "-", "*", "/", "(", ")", ",", ">=", "<=", "==", "!=", ">", "<"] as const;

/** Hàm toán được phép — khớp với bộ `safe_eval` bên backend (`services/thanh_phan_engine.py`). */
export const HAM_TOAN = ["ceil", "floor", "round", "max", "min", "abs", "if"] as const;

/** Mỗi lần gọi một regex MỚI (xem ⚠️ trên) — export dạng hàm tạo, không export chính regex. */
export function regexMoi(): RegExp {
  // So sánh 2 ký tự (>=, <=, ==, !=) phải đứng TRƯỚC lớp ký tự đơn — không thì ">=" bị cắt vụn
  // thành ">" rồi "=" rời (mỗi lần chạy alternation, JS thử theo đúng thứ tự viết).
  //
  // `\S` cuối cùng (29/09/2026): ký tự lạ (`;` của Excel tiếng Việt, `≤`, `×`, `=` đơn…) thành một
  // token RIÊNG thay vì bị nuốt im lặng — trước đây dán `if(a;b;c)` là mất sạch dấu `;` không dấu
  // vết. Nay nó hiện chip đỏ và ô công thức báo đúng chỗ.
  return /[a-zA-Z_][a-zA-Z0-9_]*|\d+(?:\.\d+)?|>=|<=|==|!=|[+\-*/(),<>]|\s+|\S/g;
}

/** Chuỗi công thức → mảng token (giữ cả khoảng trắng để chỗ vẽ chip dựng lại đúng hình). */
export function catToken(bieuThuc: string): string[] {
  return bieuThuc.match(regexMoi()) ?? [];
}

export function laToanTu(token: string): boolean {
  return (TOAN_TU as readonly string[]).includes(token);
}

export function laSo(token: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(token);
}
