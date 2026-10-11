/** Chỉ tổ LÁ nhận việc (luật tổ lá 07/10/2026) — tổ cha trên menu chỉ là nhóm gập/mở, không có
 *  bàn riêng (10/10/2026: bàn gộp việc mọi tổ con bị chê rối, một lệnh hiện mấy dòng của mấy tổ).
 *
 *  `teams` về PHẲNG theo thứ tự cây kèm `cap`: một tổ là cha khi hàng ngay sau nó sâu hơn. */
export function toLaDauTien(teams: { id: number; cap: number }[], teamId: number): number | null {
  const i = teams.findIndex((t) => t.id === teamId);
  if (i < 0) return null;
  const goc = teams[i].cap;
  if (!(teams[i + 1]?.cap > goc)) return null;
  for (let j = i + 1; j < teams.length && teams[j].cap > goc; j++) {
    if (!(teams[j + 1]?.cap > teams[j].cap)) return teams[j].id;
  }
  return null;
}
