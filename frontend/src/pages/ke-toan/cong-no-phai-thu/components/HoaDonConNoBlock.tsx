// Tab "Còn nợ" của ngăn Công nợ phải thu — kiểu 3 (docs/mockups/ke-toan-gon-3-phuong-an.html, 07/10/2026):
// MỘT lưới `.lds-g` (khung `.lds-bang`) các hoá đơn bán CÒN nợ.
//
// KHÔNG tick nhiều hoá đơn: máy chủ chưa có đường thu nhiều hoá đơn một lượt — mỗi dòng giữ nút "Thu"
// riêng, mở ngăn chồng Thu tiền hoá đơn (`ThuTienHoaDon`). Có máy chủ thu gộp rồi mới thêm ô chọn.
//
// Hàng đầu: "Nhóm theo đơn bán" + nhóm nút "Đơn bán | Hạn thu".
// - Đơn bán: dòng nhóm (mã đơn mở Đơn hàng bán, "N hoá đơn" mờ, 4 ô tổng) rồi các hoá đơn của đơn.
// - Hạn thu: bỏ dòng nhóm, xếp hoá đơn theo hạn thu tăng dần, hoá đơn chưa có hạn ở cuối; mã đơn bán
//   đứng sau số hoá đơn.
// Cột: Hoá đơn (số + ký hiệu) | Ngày | Hạn thu | Giá trị | Trừ cọc | Đã thu | Còn nợ | nút. Trừ cọc
// (`deposit_offset_amount`) và Đã thu (`direct_received_amount`) là HAI cột — cọc không phải tiền thu
// trong đợt này. Khách chưa đặt cho nợ thì Hạn thu là gạch mờ: cột thuộc tính đã nói "chưa đặt", không
// lặp chữ ở từng dòng. Dòng Cộng cuối bảng.
//
// Bề rộng: xem `rong` trong thân (đo font thật 08/10); Hoá đơn co giãn có chỗ tối thiểu; tổng tối thiểu 818px vừa cột
// trái của ngăn ở độ rộng mặc định, hẹp hơn thì khung `.lds-bang` cuộn ngang.
import { Fragment, useState, type ReactNode } from "react";

import type { ReceivableItemRow } from "../../../../api/client";
import { ngay, vietSo } from "../../shared/dinhDang";
import { ChuHan, chuHanDu, HangXep, OTien } from "../../shared/NganCongNo";

type Xep = "don" | "han";

const CO_GIAN = 84;

const cong = (ds: ReceivableItemRow[], k: "amount" | "deposit_offset_amount" | "direct_received_amount" | "remaining_amount") =>
  ds.reduce((s, r) => s + r[k], 0);

function OHanThu({ row, homNay, khachChuaDatHan }: { row: ReceivableItemRow; homNay: string; khachChuaDatHan: boolean }) {
  if (row.due_date && !row.chua_dat_han) {
    return (
      <>
        <span>{ngay(row.due_date)}</span>
        <ChuHan han={row.due_date} homNay={homNay} gon lop={{ do: "lds-do", mo: "lds-mu", vang: "lds-vang" }} />
      </>
    );
  }
  return <span className="lds-mu3">{khachChuaDatHan ? "–" : "chưa đặt hạn"}</span>;
}

export function HoaDonConNoBlock({
  items,
  homNay,
  khachChuaDatHan,
  dangLoc,
  coThu,
  onThu,
  onMoDon,
}: {
  /** Hoá đơn đang hiện (đã lọc), giữ thứ tự máy chủ. */
  items: ReceivableItemRow[];
  /** Ngày máy chủ tính nợ — mốc của "còn N ngày". */
  homNay: string;
  /** Khách chưa đặt số ngày cho nợ (`payment_term_days` null). */
  khachChuaDatHan: boolean;
  /** Đang lọc ⇒ câu "rỗng" nói về bộ lọc. */
  dangLoc: boolean;
  /** Có quyền lập phiếu thu ⇒ có nút "Thu". */
  coThu: boolean;
  /** Bấm "Thu" ⇒ ngăn chồng thu tiền hoá đơn này. */
  onThu: (item: ReceivableItemRow) => void;
  /** Không có = không có quyền xem Đơn hàng bán ⇒ mã đơn là chữ thường. */
  onMoDon?: (orderId: number) => void;
}) {
  const [xep, setXep] = useState<Xep>("don");

  if (items.length === 0) {
    return <p className="kt-mo">{dangLoc ? "Không có hoá đơn nào còn nợ ở mục này." : "Không còn hoá đơn nào nợ."}</p>;
  }

  // Đo 08/10 với đệm ô 9px: ngày 82px ⇒ 102; nút Thu 62 ⇒ 64; Hạn thu gọn ("còn 14") 152; Trừ cọc 92 (đủ
  // 99 triệu), Giá trị / Đã thu 100 (đủ trăm triệu), Còn nợ 112. Lưới lds-g đệm ô 10px ⇒ mỗi cột +2px (nút
  // Thu giữ 64: ô nút đệm 8px). Hoá đơn co giãn: số đứng trước nên ký hiệu bị "…" trước (chữ đủ ở title).
  const rong: (number | null)[] = [null, 104, 154, 102, 94, 102, 114, ...(coThu ? [64] : [])];
  const toiThieu = rong.reduce<number>((t, w) => t + (w ?? CO_GIAN), 0);

  // Xếp theo hạn thì không còn dòng nhóm: mã đơn bán đứng sau số hoá đơn (thay ký hiệu — ký hiệu vẫn ở title).
  const dong = (row: ReceivableItemRow) => (
    <tr key={row.invoice_id}>
      <td title={[row.invoice_symbol, row.invoice_number, xep === "han" ? `đơn ${row.order_code}` : null].filter(Boolean).join(" ")}>
        <span>{row.invoice_number}</span>
        {xep === "han"
          ? <span className="lds-mu kt-ncn-ben">{row.order_code}</span>
          : row.invoice_symbol && <span className="lds-mu kt-ncn-ben">{row.invoice_symbol}</span>}
      </td>
      <td>{ngay(row.invoice_date)}</td>
      <td title={row.due_date && !row.chua_dat_han ? chuHanDu(row.due_date, homNay) : undefined}>
        <OHanThu row={row} homNay={homNay} khachChuaDatHan={khachChuaDatHan} />
      </td>
      <td className="n">{vietSo(row.amount)}</td>
      <td className="n"><OTien so={row.deposit_offset_amount} /></td>
      <td className="n"><OTien so={row.direct_received_amount} /></td>
      <td className="n"><OTien so={row.remaining_amount} /></td>
      {coThu && (
        <td className="lds-nut">
          {row.remaining_amount > 0 && (
            <button type="button" className="kt-btn kt-btn--nho" aria-label={`Thu tiền hoá đơn số ${row.invoice_number}`}
              onClick={() => onThu(row)}>
              Thu
            </button>
          )}
        </td>
      )}
    </tr>
  );

  let than: ReactNode;
  if (xep === "han") {
    const ds = [...items].sort((a, b) =>
      a.due_date === b.due_date ? 0 : a.due_date == null ? 1 : b.due_date == null ? -1 : a.due_date < b.due_date ? -1 : 1);
    than = ds.map(dong);
  } else {
    // Gom theo đơn bán, giữ thứ tự máy chủ (đơn xuất hiện trước đứng trước).
    const nhom = new Map<number, { code: string; ds: ReceivableItemRow[] }>();
    for (const row of items) {
      const g = nhom.get(row.order_id) ?? { code: row.order_code, ds: [] };
      g.ds.push(row);
      nhom.set(row.order_id, g);
    }
    than = [...nhom.entries()].map(([orderId, g]) => (
      <Fragment key={orderId}>
        <tr className="lds-cong lds-nhom">
          <td colSpan={3} title={`${g.code} ${vietSo(g.ds.length)} hoá đơn`}>
            <span className="lds-dinh-trai">
              {onMoDon ? (
                <button type="button" className="kt-lk" onClick={() => onMoDon(orderId)}>{g.code}</button>
              ) : (
                <span>{g.code}</span>
              )}
              <span className="lds-mu kt-ncn-ben">{`${vietSo(g.ds.length)} hoá đơn`}</span>
            </span>
          </td>
          <td className="n">{vietSo(cong(g.ds, "amount"))}</td>
          <td className="n"><OTien so={cong(g.ds, "deposit_offset_amount")} /></td>
          <td className="n"><OTien so={cong(g.ds, "direct_received_amount")} /></td>
          <td className="n"><OTien so={cong(g.ds, "remaining_amount")} /></td>
          {coThu && <td />}
        </tr>
        {g.ds.map(dong)}
      </Fragment>
    ));
  }

  return (
    <>
      <HangXep<Xep>
        chu={xep === "don" ? "Nhóm theo đơn bán" : "Xếp theo hạn thu, sớm nhất trên cùng"}
        giaTri={xep}
        luaChon={[["don", "Đơn bán"], ["han", "Hạn thu"]]}
        onDoi={setXep}
      />
      <div className="lds-bang">
        <table className="lds-g" style={{ minWidth: toiThieu }} aria-label="Hoá đơn còn nợ">
          <colgroup>
            {rong.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
          </colgroup>
          <thead>
            <tr>
              <th>Hoá đơn</th>
              <th>Ngày</th>
              <th>Hạn thu</th>
              <th className="n">Giá trị</th>
              <th className="n">Trừ cọc</th>
              <th className="n">Đã thu</th>
              <th className="n">Còn nợ</th>
              {coThu && <th aria-label="Thu tiền" />}
            </tr>
          </thead>
          <tbody>
            {than}
            <tr className="lds-cong">
              <td colSpan={3}>{`Cộng ${vietSo(items.length)} hoá đơn`}</td>
              <td className="n">{vietSo(cong(items, "amount"))}</td>
              <td className="n"><OTien so={cong(items, "deposit_offset_amount")} /></td>
              <td className="n"><OTien so={cong(items, "direct_received_amount")} /></td>
              <td className="n"><OTien so={cong(items, "remaining_amount")} /></td>
              {coThu && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
