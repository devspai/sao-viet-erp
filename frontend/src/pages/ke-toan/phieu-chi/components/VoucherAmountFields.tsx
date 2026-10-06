/** Đợt giao + Số tiền (+ ngoại tệ) của form lập phiếu chi theo đơn mua (đặc tả PC-4).
 *
 *  ⚠️ TIỀN THẬT — trần `maxAmountVnd` và `amountVnd` do `PaymentVoucherDialog` tính; khối này
 *  CHỈ HIỂN THỊ, không tự tính lại tiền. Chọn đợt thì số tiền điền lại bằng `conNoDot()` của đợt
 *  đó (đổi đợt là đổi trần — giữ số cũ là bấm lập rồi ăn lỗi mà không hiểu vì sao).
 *
 *  - `ChonDotGiao`: danh sách nút tròn, mỗi đợt một dòng "Đợt 2 | Giao 28/09 | [Hoá đơn 0004571] |
 *    còn nợ 45.200.000 đ"; đợt đã trả đủ mờ và có thẻ "Đã trả đủ".
 *  - `VoucherAmountFields` (kiểu mới 06/10/2026): VND là ô tiền LỚN + bằng chữ + "Trả đủ" (= trần) +
 *    dải "sau phiếu này"; vượt trần thì câu đỏ của chính luật chặn hiện ngay khi gõ (`loiTran`).
 *    Link nhỏ "Trả bằng ngoại tệ" mới mở Loại tiền + Tỷ giá + "= … đ" (ô số thường, có phần lẻ).
 */
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import type { PaymentVoucherBaseInput, PurchaseRequestRow } from "../../../../api/client";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, tien } from "../../shared/dinhDang";
import { OTienLon, SauPhieu } from "../../shared/KhungFormPhieu";
import { conNoDot } from "../shared/helpers";
import type { LoaiPhieu } from "../shared/types";
import { idO, OF, OTienPhieu, type DatO, type LoiForm } from "./KhungFormPhieu";

export function ChonDotGiao({
  form,
  setForm,
  purchase,
  loi,
}: {
  form: PaymentVoucherBaseInput;
  setForm: Dispatch<SetStateAction<PaymentVoucherBaseInput>>;
  purchase: PurchaseRequestRow;
  loi: LoiForm;
}) {
  return (
    <div className={`kt-o kt-o--rong${loi.delivery_id ? " kt-o--loi" : ""}`}>
      <span className="kt-o__nhan" id={`${idO("delivery_id")}-nhan`}>
        Đợt giao<em className="kt-bb">*</em>
      </span>
      <div className="kt-dots" role="radiogroup" aria-labelledby={`${idO("delivery_id")}-nhan`}
        id={idO("delivery_id")} tabIndex={-1}>
        {purchase.deliveries.map((d) => {
          const on = form.delivery_id === d.id;
          const du = d.con_no <= 0;
          return (
            <button key={d.id} type="button" role="radio" aria-checked={on} className={on ? "on" : undefined}
              disabled={du && !on}
              onClick={() =>
                setForm((current) => ({ ...current, delivery_id: d.id, amount: conNoDot(purchase, d.id) }))
              }>
              <span className="kt-vong-chon" aria-hidden="true" />
              <Cum>
                <b>{`Đợt ${d.seq_no}`}</b>
                <span>{`Giao ${ngay(d.delivery_date)}`}</span>
                <TheNho>{d.invoice_number ? `Hoá đơn ${d.invoice_number}` : "Chưa có hoá đơn"}</TheNho>
              </Cum>
              {du ? (
                <span className="kt-pill kt-pill--xanh">Đã trả đủ</span>
              ) : (
                <span>
                  còn nợ <b>{tien(d.con_no)}</b>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {loi.delivery_id && (
        <span className="kt-o__loi" role="alert">{loi.delivery_id}</span>
      )}
    </div>
  );
}

export function VoucherAmountFields({
  loai,
  coDotGiao,
  form,
  setForm,
  set,
  maxAmountVnd,
  amountVnd,
  loi,
  loiTran,
}: {
  loai: LoaiPhieu;
  coDotGiao: boolean;
  form: PaymentVoucherBaseInput;
  setForm: Dispatch<SetStateAction<PaymentVoucherBaseInput>>;
  set: DatO;
  maxAmountVnd: number;
  amountVnd: number;
  loi: LoiForm;
  /** Câu vượt trần tính ngay khi gõ (cùng câu với luật chặn); có thì form cha khoá nút lập. */
  loiTran?: string | null;
}) {
  const vnd = form.currency.trim().toUpperCase() === "VND";
  const [moNgoaiTe, setMoNgoaiTe] = useState(!vnd);
  const hienNgoaiTe = moNgoaiTe || !vnd;
  const nhanTran = loai === "dat_coc" ? "Còn được cọc" : coDotGiao ? "Đợt còn nợ" : "Còn được chi";

  if (!hienNgoaiTe) {
    return (
      <>
        <OTienLon khoa="amount" nhan="Số tiền chi" value={form.amount} onChange={(v) => set("amount", v)}
          loi={loi.amount} vuot={loiTran} goiTrong="Nhập số tiền chi ra"
          nutDu={{ nhan: loai === "dat_coc" ? "Cọc tối đa" : "Trả đủ", so: maxAmountVnd }}
          con={<SauPhieu o={[{ nhan: nhanTran, tu: maxAmountVnd, den: maxAmountVnd - amountVnd }]} />} />
        <div>
          <button type="button" className="kt-lk" onClick={() => setMoNgoaiTe(true)}>
            Trả bằng ngoại tệ
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <OF khoa="amount" nhan="Số tiền" batBuoc loi={loi.amount ?? loiTran ?? undefined}
        goi={`Tối đa ${tien(maxAmountVnd)} ${loai === "dat_coc" ? "theo giá trị đơn đặt" : coDotGiao ? "là số còn nợ của đợt" : "là công nợ hiện tại"}.`}>
        <OTienPhieu khoa="amount" value={form.amount} onChange={(v) => set("amount", v)}
          hauTo={vnd ? "đ" : form.currency.trim().toUpperCase()} loi={!!loi.amount || !!loiTran} />
      </OF>
      <div className="kt-f__hang">
        <OF khoa="currency" nhan="Loại tiền" batBuoc loi={loi.currency}
          goi={form.voucher_type === "bank_transfer" ? "Theo loại tiền của tài khoản trả." : undefined}>
          <input id={idO("currency")} maxLength={3} readOnly={form.voucher_type === "bank_transfer"}
            value={form.currency}
            onChange={(e) => {
              const currency = e.target.value.toUpperCase();
              setForm((current) => ({
                ...current,
                currency,
                exchange_rate: currency === "VND" ? 1 : current.exchange_rate,
              }));
            }} />
        </OF>
        <OF khoa="exchange_rate" nhan="Tỷ giá" batBuoc loi={loi.exchange_rate}
          goi={`= ${tien(amountVnd)}`}>
          <input id={idO("exchange_rate")} type="number" min="0.000001" step="0.000001" disabled={vnd}
            value={form.exchange_rate} onChange={(e) => set("exchange_rate", Number(e.target.value))} />
        </OF>
      </div>
    </>
  );
}
