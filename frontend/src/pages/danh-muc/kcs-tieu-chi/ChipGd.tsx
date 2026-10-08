import { mauGd, nhanGd } from "./kcsTieuChi";

/** Chip giai đoạn — chỗ DUY NHẤT của màn Tiêu chí KCS có màu (§6 "Màu sắc"). */
export function ChipGd({ nhom }: { nhom: string }) {
  return <span className={`ktc-gd ktc-gd--${mauGd(nhom)}`}>{nhanGd(nhom)}</span>;
}
