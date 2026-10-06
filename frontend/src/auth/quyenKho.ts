// Dòng quyền THEO KHO (05/10/2026): mỗi kho đã khai báo là một dòng `ton_kho_<id kho>` trong ma trận
// phân quyền (máy chủ: `services/quyen_kho.py`). Xem = mục kho đó hiện trên thanh bên + số tồn, lô
// của kho; ô chi tiết `set_threshold` = khai ngưỡng tồn của kho đó.

export const khoaTonKho = (khoId: number) => `ton_kho_${khoId}`;

export const laKhoaTonKho = (moduleKey: string) => /^ton_kho_\d+$/.test(moduleKey);

/** Có Xem ở ÍT NHẤT một dòng kho. */
export const xemKhoNao = (readable: ReadonlySet<string> | null | undefined) =>
  !!readable && [...readable].some(laKhoaTonKho);
