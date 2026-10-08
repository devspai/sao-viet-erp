// BẢNG YÊU CẦU MUA HÀNG dùng CHUNG cho màn Yêu cầu mua hàng và Mua hàng › Yêu cầu chờ xử lý
// (phương án 3, 07/10/2026). Trước đây hai màn có hai bảng viết riêng, hai bộ nhãn, nên cùng một yêu
// cầu chỗ ghi "Chờ Thu mua xử lý", chỗ ghi "Đang mua". Nay hai nơi chỉ khác việc khi bấm dòng.
// Khuôn lưới `lds` (08/10/2026): cột ẩn/hiện/đổi chỗ do màn cha giữ (`useCotBang`) vì nút "Cột" nằm ở
// thanh lọc của màn; mỗi màn một khoá nhớ.
import { useEffect, useRef } from "react";
import type { DepartmentPurchaseRequestRow, MuaChoLenh } from "../../../api/client";
import { CuonLuoi, ngayVN, soCotGhim, rongLuoi } from "../../../components/LuoiDs";
import { PhanTrangDayDu } from "../../../components/PhanTrangDayDu";
import { fmtDateTime } from "../../../utils/format";
import { OMuaCho } from "../mua-cho/OMuaCho";
import { ChipNhan, DongRong, type CotBang, type CotMH } from "../luoi-mua-hang";
import { TT_YEU_CAU } from "../trang-thai-mua";
import { coDonSong, dongSong, noiDung } from "../yeu-cau-mua-hang/shared/helpers";
import { SOURCE_TYPE_LABELS } from "../yeu-cau-mua-hang/shared/constants";
import "../trang-thai-mua.css";

/** Cột của lưới Yêu cầu. `chon` (ô tick ba trạng thái) chỉ hiện ở Mua hàng khi có yêu cầu tick được. */
export const COT_YEU_CAU: CotMH[] = [
  { key: "chon", label: "Chọn", coDinh: true, w: 40 },
  { key: "ma", label: "Mã yêu cầu", coDinh: true, w: 150 },
  { key: "ngay", label: "Ngày tạo", w: 104 },
  { key: "can", label: "Cần hàng", w: 200 },
  { key: "bo_phan", label: "Bộ phận", w: 140 },
  { key: "nd", label: "Nội dung", w: 300 },
  { key: "mua_cho", label: "Mua cho", w: 160 },
  { key: "mon", label: "Món có đơn", w: 116, n: true },
  { key: "tt", label: "Trạng thái", w: 150 },
  { key: "nguoi", label: "Người yêu cầu" },
];

/** Số ngày từ hôm nay (giờ máy) tới `ngay` yyyy-mm-dd; âm = quá hạn. */
export function conNgay(ngay: string): number {
  const d = new Date(`${ngay.slice(0, 10)}T00:00:00`);
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - h.getTime()) / 86_400_000);
}

/** Ngày cần + nhắc còn/quá mấy ngày (chỉ khi việc còn sống). Quá hạn đỏ, còn ≤ 3 ngày vàng. */
export function OCanHang({ ngay, xong }: { ngay: string | null; xong: boolean }) {
  if (!ngay) return <span className="lds-mu3">Không ghi</span>;
  const chu = ngayVN(ngay);
  if (xong) return <span title={chu}>{chu}</span>;
  const n = conNgay(ngay);
  return (
    <>
      <span title={chu}>{chu}</span>
      <span className={`lds-tag${n < 0 ? " lds-do" : n <= 3 ? " lds-vang" : ""}`}>
        {n < 0 ? `quá ${-n} ngày` : n === 0 ? "hôm nay" : `còn ${n} ngày`}
      </span>
    </>
  );
}

const XONG = new Set<string>(["done", "cancelled"]);

/** Tình trạng chọn món của MỘT yêu cầu ở bảng Mua hàng: `null` = không còn món chờ lập đơn. */
export type ChonMonYeuCau = "het" | "mot_phan" | "khong" | null;

/** Ô tick ba trạng thái (đủ / một phần / không) — một phần thì hiện gạch ngang. */
function OTickBa({ tt, nhan, onDoi }: { tt: Exclude<ChonMonYeuCau, null>; nhan: string; onDoi: () => void }) {
  const o = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (o.current) o.current.indeterminate = tt === "mot_phan";
  }, [tt]);
  return (
    <input ref={o} type="checkbox" className="lds-cb" checked={tt === "het"} aria-label={nhan}
      title={tt === "mot_phan" ? "Đang chọn một phần món của yêu cầu này" : undefined}
      onChange={onDoi} />
  );
}

export function BangYeuCau({
  cot,
  rows,
  loading,
  loi,
  onThuLai,
  chonId,
  onChon,
  khoaDong,
  coLoc,
  onXoaLoc,
  goiYTrong,
  total,
  page,
  size,
  onPage,
  onSize,
  chonMon,
  onMoLenh,
}: {
  cot: CotBang;
  rows: DepartmentPurchaseRequestRow[];
  loading: boolean;
  loi: string | null;
  onThuLai: () => void;
  chonId: number | null;
  onChon: (row: DepartmentPurchaseRequestRow) => void;
  /** Dòng bấm không được (vd Mua hàng: yêu cầu không còn chờ lập đơn) — chữ nhạt, không đổi trỏ. */
  khoaDong?: (row: DepartmentPurchaseRequestRow) => boolean;
  coLoc: boolean;
  onXoaLoc: () => void;
  goiYTrong: string;
  total: number;
  page: number;
  size: number;
  onPage: (p: number) => void;
  onSize: (n: number) => void;
  /** Mua hàng: tick món theo cả yêu cầu (chung lựa chọn với bảng Từng món). */
  chonMon?: { trangThai: (row: DepartmentPurchaseRequestRow) => ChonMonYeuCau; doi: (row: DepartmentPurchaseRequestRow) => void };
  onMoLenh?: (l: MuaChoLenh) => void;
}) {
  const coOChon = !!chonMon && rows.some((r) => chonMon.trangThai(r) !== null);
  const cotHien = cot.hien.filter((c) => c.key !== "chon" || coOChon);
  return (
    <div className="lds-sheet">
      <CuonLuoi ghim={soCotGhim(cotHien)}>
        <table className="lds-g" style={{ minWidth: rongLuoi(cotHien) }}>
          <colgroup>
            {cotHien.map((c) => (
              <col key={c.key} style={c.w ? { width: c.w } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {cotHien.map((c) =>
                c.key === "chon" ? (
                  <th key={c.key} className="mh-o-cot" aria-label="Chọn món của yêu cầu" />
                ) : (
                  <th key={c.key} className={c.n ? "n" : undefined}>
                    {c.label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {(loading && rows.length === 0) || loi || rows.length === 0 ? (
              <DongRong
                soCot={cotHien.length}
                dangTai={loading && rows.length === 0}
                loi={loi}
                onThuLai={onThuLai}
                chuaCo="Chưa có yêu cầu mua hàng nào."
                khongKhop="Không có yêu cầu nào khớp điều kiện đang lọc."
                coLoc={coLoc}
                onXoaLoc={onXoaLoc}
                goiY={goiYTrong}
              />
            ) : (
              rows.map((row) => {
                const song = dongSong(row);
                const coDon = song.filter(coDonSong).length;
                const nd = noiDung(row) || song[0]?.item_name || "";
                const khoa = khoaDong?.(row) ?? false;
                const tt = chonMon?.trangThai(row) ?? null;
                const mo = () => onChon(row);
                return (
                  <tr
                    key={row.id}
                    className={`lds-dong${khoa ? " mh-khoa" : ""}${chonId === row.id ? " is-chon" : ""}${row.workflow_status === "cancelled" ? " mh-cu" : ""}`}
                    tabIndex={khoa ? undefined : 0}
                    onClick={khoa ? undefined : mo}
                    onKeyDown={
                      khoa
                        ? undefined
                        : (e) => {
                            if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                              e.preventDefault();
                              mo();
                            }
                          }
                    }
                    title={song.map((l) => l.item_name).join("\n") || undefined}
                  >
                    {cotHien.map((c) => {
                      switch (c.key) {
                        case "chon":
                          return (
                            <td key={c.key} className="mh-o-cot" onClick={(e) => e.stopPropagation()}>
                              {tt && chonMon && <OTickBa tt={tt} nhan={`Chọn món của ${row.code}`} onDoi={() => chonMon.doi(row)} />}
                            </td>
                          );
                        case "ma":
                          return <td key={c.key}>{row.code}</td>;
                        case "ngay":
                          return <td key={c.key} title={fmtDateTime(row.created_at)}>{ngayVN(row.created_at)}</td>;
                        case "can":
                          return <td key={c.key}><OCanHang ngay={row.needed_date} xong={XONG.has(row.workflow_status)} /></td>;
                        case "bo_phan":
                          return (
                            <td key={c.key} title={row.requesting_department_name ?? undefined}>
                              {row.requesting_department_name || <span className="lds-mu3">Nội bộ</span>}
                            </td>
                          );
                        case "nd":
                          return (
                            <td key={c.key} title={nd || undefined}>
                              {nd || <span className="lds-mu3">Chưa ghi nội dung</span>}
                            </td>
                          );
                        case "mua_cho":
                          return (
                            <td key={c.key} onClick={(e) => e.stopPropagation()}>
                              <OMuaCho loai={[row.loai_mua]} lenh={row.mua_cho} onMoLenh={onMoLenh} />
                            </td>
                          );
                        case "mon":
                          return (
                            <td key={c.key} className="n">
                              {song.length === 0 ? (
                                <span className="lds-mu3">Không còn</span>
                              ) : (
                                <span className={coDon === 0 ? "lds-mu3" : coDon === song.length ? "lds-la" : undefined}>
                                  {coDon} trên {song.length}
                                </span>
                              )}
                            </td>
                          );
                        case "tt":
                          return <td key={c.key}><ChipNhan nhan={TT_YEU_CAU[row.workflow_status]} /></td>;
                        case "nguoi":
                          return (
                            <td key={c.key} title={row.requested_by_name || SOURCE_TYPE_LABELS[row.source_type]}>
                              {row.requested_by_name || SOURCE_TYPE_LABELS[row.source_type]}
                            </td>
                          );
                        default:
                          return <td key={c.key} />;
                      }
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </CuonLuoi>
      {total > 0 && (
        <PhanTrangDayDu
          trang={page}
          size={size}
          tong={total}
          soDong={rows.length}
          onTrang={onPage}
          onSize={onSize}
          loading={loading}
          donVi="yêu cầu"
          ariaLabel="Phân trang yêu cầu mua hàng"
        />
      )}
    </div>
  );
}
