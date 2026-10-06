// Ô nhỏ dùng lại trong ngăn Công nợ phải trả: hoá đơn của đợt / lần trả, hạn trả của một đợt.
// Mẩu thông tin đứng cạnh nhau KHÔNG nối bằng "·" hay dấu phẩy — `Cum` + `TheNho` (đặc tả A.9).
import { FileText } from "lucide-react";

import { assetUrl, type PayableItemRow } from "../../../../api/client";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay } from "../../shared/dinhDang";
import { TheTre } from "../../shared/TheTre";

/** Số hoá đơn + ngày + file đính kèm (nhiều đợt cùng số = cùng MỘT hoá đơn).
 *
 *  `files` = ảnh/PDF hoá đơn đính lúc GHI ĐỢT GIAO bên Thu mua — CHỈ ĐỌC ở đây (mở tab mới). Số hoá
 *  đơn và file độc lập: có số mà chưa có ảnh vẫn bình thường (ghi tay trước, chụp ảnh sau). */
export function HoaDon({
  so,
  ngayHd,
  files,
}: {
  so: string | null;
  ngayHd?: string | null;
  files?: { id: number; file_name: string; file_url: string; file_type: string | null }[];
}) {
  if (!so && !(files && files.length)) return <span className="kt-mo">Chưa ghi</span>;
  return (
    <Cum>
      {so ? <span>{so}</span> : <span className="kt-mo">Chưa ghi số</span>}
      {ngayHd && <span className="kt-mo">{ngay(ngayHd)}</span>}
      {files && files.length > 0 && (
        <a className="kt-lk" href={assetUrl(files[0].file_url) ?? "#"} target="_blank" rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={files.length > 1 ? `Xem ${files[0].file_name} và ${files.length - 1} tệp khác` : `Xem ${files[0].file_name}`}>
          <FileText size={14} aria-hidden="true" />
          {files.length > 1 && <span>{files.length}</span>}
        </a>
      )}
    </Cum>
  );
}

/** Hạn trả của MỘT đợt giao. Đợt chưa có hạn không bao giờ vào cột Quá hạn nên phải đeo thẻ — máy
 *  chủ đã đẩy nó lên đầu, đây là nửa còn lại của việc chống giấu nợ. */
export function HanTra({ row }: { row: PayableItemRow }) {
  if (row.da_tat_toan) return <span className="kt-mo">Đã trả xong</span>;
  if (row.chua_dat_han) return <TheNho>{row.delivery_id == null ? "Không theo đợt" : "Chưa đặt hạn"}</TheNho>;
  return (
    <Cum>
      <span>{ngay(row.due_date)}</span>
      <TheTre soNgay={row.overdue_days} moc={row.aging_bucket} />
    </Cum>
  );
}
