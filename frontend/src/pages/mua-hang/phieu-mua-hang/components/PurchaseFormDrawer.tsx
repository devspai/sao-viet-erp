// Ngăn TẠO / SỬA đơn mua hàng — bản A (docs/mockups/mua-hang-phuong-an-A.html màn A4, chốt
// 07/10/2026). Khuôn form đơn đặt hàng của Shopify: mỗi nhà cung cấp một bảng (mỗi nhà là một
// đơn), mỗi dòng một hàng ngang Số lượng, Đơn giá, VAT, Thành tiền; tiền tổng ở thẻ "Tóm tắt chi
// phí" cột phải. Chiết khấu + ghi chú dòng mở bằng nút ba chấm dưới dòng ("Item options" của Stripe).
// ⚠️ KHỐI CẤM XÉ — TÂM THUẾ: `lineDiscountAmount`, `lineVatAmount`, `lineTotal` ở shared/helpers.
// Hàm `save` (validate + gọi API) CỐ Ý Ở LẠI SHELL và truyền xuống làm handler của <form>.
import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { PurchaseRequestRow, SupplierRow } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { Icon } from "../../../../components/Icons";
import { KhungKho } from "../../../../components/kho-giay/KhungKho";
import { NganPhai } from "../../../ke-toan/shared/NganPhai";
// Đơn vị lưu bằng MÃ (`cai`), tên hiển thị ("cái") nằm ở danh mục Đơn vị — xem pages/tenDonVi.ts.
import { tenDonVi } from "../../../tenDonVi";
import {
  applySupplierPrices,
  bestSupplierIdForLines,
  chaoGiaChoMatHang,
  lineDiscountAmount,
  lineTotal,
  lineVatAmount,
} from "../shared/helpers";
import { dongDuocChon } from "../shared/types";
import type { FormLine, FormState, PhieuSeTao } from "../shared/types";
import { LineSupplierPicker } from "./LineSupplierPicker";
import { OMuaCho } from "../../mua-cho/OMuaCho";
import { StatusBadge } from "./purchaseCells";
import "../../../ke-toan/ke-toan.css";
import "../../../kho-ngan-a.css";
import "../../yeu-cau-mua-hang/components/yc-form-a.css";
import "./don-form-a.css";

const so = (n: number) => Math.round(n).toLocaleString("vi-VN");
const MUC_VAT = [0, 5, 8, 10];

/** Chữ viết tắt cho ô tròn đầu bảng NCC: hai chữ đầu của hai từ cuối tên ("Giấy An Phát" → AP). */
function vietTat(ten: string): string {
  const tu = ten.replace(/^(công ty|cty)\s+(tnhh|cp|cổ phần)?\s*(thương mại|tm)?\s*/i, "").trim().split(/\s+/);
  return tu.slice(-2).map((t) => t[0] ?? "").join("").toUpperCase();
}

export function PurchaseFormDrawer({
  mode,
  setMode,
  editing,
  form,
  setForm,
  setLine,
  save,
  saving,
  formError,
  suppliers,
  minPurchaseDate,
  expectedReceiptMinDate,
  phieuSeTao,
  nguon = [],
}: {
  mode: "create" | "edit";
  setMode: Dispatch<SetStateAction<null | "create" | "edit">>;
  editing: PurchaseRequestRow | null;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  setLine: (index: number, patch: Partial<FormLine>) => void;
  /** Chính là `save` của shell — đừng bê nó vào đây. */
  save: (e: FormEvent) => Promise<void>;
  saving: boolean;
  formError: string | null;
  suppliers: SupplierRow[];
  minPurchaseDate: string;
  expectedReceiptMinDate: string;
  phieuSeTao: PhieuSeTao[];
  /** Yêu cầu nguồn (mã + bộ phận) — thẻ nhỏ cạnh tiêu đề lúc lập đơn từ yêu cầu. */
  nguon?: { code: string; bo_phan: string | null; needed_date: string }[];
}) {
  const [moTuyChon, setMoTuyChon] = useState<Set<number>>(new Set());
  const taoMoi = mode !== "edit";
  const nccCua = (id: number | null | undefined) => suppliers.find((s) => s.id === id) ?? null;

  // Nhóm dòng theo NCC: lúc TẠO mỗi NCC thành một đơn; dòng chưa chọn NCC gom nhóm đầu (việc còn
  // phải làm). Lúc SỬA cả phiếu thuộc MỘT NCC — một nhóm duy nhất.
  const nhom = new Map<number | "chua", number[]>();
  form.lines.forEach((line, i) => {
    const k = taoMoi ? (line.supplier_id ?? "chua") : (form.supplier_id ?? "chua");
    nhom.set(k, [...(nhom.get(k) ?? []), i]);
  });
  const khoaNhom = [...nhom.keys()].sort((a, b) => (a === "chua" ? -1 : b === "chua" ? 1 : 0));

  const tinhNhom = (idx: number[]) => {
    const ds = idx.map((i) => form.lines[i]).filter(dongDuocChon);
    const hang = ds.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.expected_unit_price) || 0), 0);
    return {
      hang,
      giam: ds.reduce((s, l) => s + lineDiscountAmount(l), 0),
      vat: ds.reduce((s, l) => s + lineVatAmount(l), 0),
      tong: ds.reduce((s, l) => s + lineTotal(l), 0),
    };
  };
  const tongCong = form.lines.filter(dongDuocChon).reduce((s, l) => s + lineTotal(l), 0);
  const soMon = form.lines.filter(dongDuocChon).length;
  const soDon = taoMoi ? phieuSeTao.length : 1;
  const canNhat = nguon.map((n) => n.needed_date).filter(Boolean).sort()[0];
  // Đơn gom món của nhiều yêu cầu ⇒ ghi mã yêu cầu dưới tên vật tư; một yêu cầu thì tiêu đề đã nói.
  const nhieuYeuCau = new Set(form.lines.map((l) => l.yeu_cau_ma).filter(Boolean)).size > 1;

  function dongBang(line: FormLine, index: number) {
    const chon = dongDuocChon(line);
    const laGiay = line.hang_loai === "giay";
    const dang = line.kho_rong && line.kho_dai ? "to" : "cuon";
    const dv = tenDonVi(line.unit) ?? line.unit;
    const tuyChon = moTuyChon.has(index) || (Number(line.discount_percent) || 0) > 0;
    // Giá sổ: giá cùng dạng + khổ của NCC đang chọn — chỉ hiện khi đơn giá gõ LỆCH sổ.
    const so_ = line.supplier_id
      ? chaoGiaChoMatHang(line, suppliers).find((c) => c.supplier_id === line.supplier_id && !c.khac_kho)
      : undefined;
    const giaSo = so_ ? (so_.gia_quy_doi ?? so_.unit_price) : null;
    const lech = giaSo != null && line.expected_unit_price > 0 ? line.expected_unit_price - giaSo : 0;
    const thanhTien = line.quantity > 0 && line.expected_unit_price > 0 ? lineTotal(line) : null;
    return (
      <tr key={index} className={chon ? undefined : "kna-mo"}>
        <td>
          <div className="dfa-ten">
            {taoMoi && (
              <input
                type="checkbox"
                aria-label={`Đưa ${line.item_name} vào đơn`}
                checked={chon}
                onChange={(e) => setLine(index, { chon: e.target.checked })}
              />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="kna-hang__ten" title="Vật tư do bộ phận đề nghị khai, Thu mua không sửa được">
                {line.item_name}
                {nhieuYeuCau && line.yeu_cau_ma && <span className="ycd-tag dfa-yc">{line.yeu_cau_ma}</span>}
              </div>
              <div className="ycf-phu">
                {laGiay && chon && (
                  <KhungKho
                    ariaLabel="Khổ mua"
                    dang={dang}
                    coTheDoiDang={false}
                    rong={line.kho_rong ?? 0}
                    dai={line.kho_dai ?? 0}
                    onChange={(v) => setLine(index, { kho_rong: v.rong, kho_dai: v.dai })}
                  />
                )}
                {taoMoi && chon && (
                  <span className="dfa-ncc">
                    <LineSupplierPicker
                      line={line}
                      suppliers={suppliers}
                      onPick={(chao) =>
                        setLine(index, {
                          supplier_id: chao?.supplier_id ?? null,
                          // Chọn NCC là lấy luôn GIÁ CỦA CHÍNH HỌ. NCC bán khổ khác: không có giá
                          // cùng khổ ⇒ để trống đơn giá cho người lập gõ theo báo giá.
                          ...(chao?.khac_kho
                            ? { expected_unit_price: 0, vat_percent: chao.vat_percent }
                            : chao
                              ? {
                                  // ĐVT giữ nguyên của DÒNG (đơn vị gốc). KHÔNG lấy `chao.unit`.
                                  unit: line.unit || chao.unit,
                                  // ⚠️ GIÁ ĐÃ QUY ĐỔI về đơn vị của dòng, không phải giá thô
                                  // (29/08/2026): NCC báo 1.020.000đ/ram, dòng tính tờ ⇒ 2.040đ/tờ.
                                  expected_unit_price: chao.gia_quy_doi ?? chao.unit_price,
                                  vat_percent: chao.vat_percent,
                                }
                              : {}),
                        })
                      }
                    />
                  </span>
                )}
                {chon && !tuyChon && (
                  <button type="button" className="ycf-them"
                    onClick={() => setMoTuyChon((s) => new Set(s).add(index))}>
                    <Icon name="plus" size={11} /> Chiết khấu, ghi chú
                  </button>
                )}
                {!chon && <span className="kna-mo">Không vào đơn này, dòng yêu cầu vẫn mở</span>}
              </div>
              {chon && tuyChon && (
                <div className="dfa-tuy">
                  <label className="ycf-gi dfa-gi--nho">
                    <span>Giảm</span>
                    <input
                      inputMode="decimal"
                      aria-label="Giảm giá phần trăm"
                      value={line.discount_percent > 0 ? String(line.discount_percent) : ""}
                      onChange={(e) => setLine(index, { discount_percent: Math.min(100, Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, "")) || 0) })}
                    />
                    <span>%</span>
                  </label>
                  {lineDiscountAmount(line) > 0 && <span className="kna-mo">trừ {so(lineDiscountAmount(line))} đ</span>}
                  <input
                    className="ycf-ghi"
                    aria-label="Ghi chú dòng"
                    placeholder="Ghi chú dòng"
                    value={line.note ?? ""}
                    onChange={(e) => setLine(index, { note: e.target.value })}
                  />
                </div>
              )}
            </div>
          </div>
        </td>
        <td>
          <OMuaCho loai={line.loai_mua ? [line.loai_mua] : []} lenh={line.mua_cho} donVi={dv} />
        </td>
        <td className="n">
          {/* SỐ LƯỢNG MUA sửa được: mua khổ to hơn rồi tề, NCC chỉ bán chẵn ram… Mặc định = số yêu cầu. */}
          <label className={`ycf-gi dfa-gi${chon && !(line.quantity > 0) ? " loi" : ""}`}>
            <input
              inputMode="decimal"
              disabled={!chon}
              required={chon}
              aria-label={`Số lượng mua ${line.item_name}`}
              value={line.quantity > 0 ? String(line.quantity) : ""}
              onChange={(e) => setLine(index, { quantity: Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, "")) || 0 })}
            />
            <span title="Đơn vị do bộ phận đề nghị khai">{dv}</span>
          </label>
        </td>
        <td className="n">
          <label className={`ycf-gi dfa-gi${chon && !(line.expected_unit_price > 0) ? " loi" : ""}`}>
            <input
              inputMode="numeric"
              disabled={!chon}
              aria-label="Đơn giá dự kiến"
              value={line.expected_unit_price > 0 ? line.expected_unit_price.toLocaleString("vi-VN") : ""}
              onChange={(e) => setLine(index, { expected_unit_price: Number(e.target.value.replace(/\D/g, "")) || 0 })}
            />
            <span>đ/{dv}</span>
          </label>
          {chon && lech !== 0 && (
            <div className={`dfa-duoi${lech > 0 ? " ycd-vang" : ""}`}>
              {lech > 0 ? "Cao" : "Thấp"} hơn giá sổ {so(Math.abs(lech))}
            </div>
          )}
        </td>
        <td className="n">
          <select
            className="kna-o dfa-vat"
            aria-label="Thuế GTGT phần trăm"
            disabled={!chon}
            value={line.vat_percent ?? 0}
            onChange={(e) => setLine(index, { vat_percent: Number(e.target.value) })}
          >
            {[...new Set([...MUC_VAT, Number(line.vat_percent) || 0])].sort((a, b) => a - b).map((v) => (
              <option key={v} value={v}>{v} %</option>
            ))}
          </select>
        </td>
        <td className="n">
          {thanhTien != null && chon ? (
            <span className="kna-so" title={`${so(thanhTien)} đ`}>{so(thanhTien)}</span>
          ) : (
            <span className="kna-mo">Chưa tính</span>
          )}
        </td>
      </tr>
    );
  }

  const chan = (
    <>
      <span className="ycf-xt">
        {taoMoi ? (
          <span>
            <b>{soMon} món</b> vào {soDon} đơn. Lưu xong mỗi đơn ở trạng thái Nháp.
          </span>
        ) : (
          <span><b>{soMon} món</b></span>
        )}
      </span>
      <span className="rc__spacer" />
      <Button variant="ghost" onClick={() => setMode(null)} disabled={saving}>Huỷ</Button>
      <Button type="submit" form="dmh-form" variant="accent" loading={saving}>
        {taoMoi ? (soDon > 1 ? `Lưu ${soDon} đơn` : "Lưu đơn") : "Lưu thay đổi"}
      </Button>
    </>
  );

  return (
    <NganPhai
      duongDan={taoMoi ? "Mua hàng > Lập đơn từ yêu cầu" : `Mua hàng > ${editing?.code ?? ""}`}
      tieuDe={taoMoi ? "Đơn mua hàng mới" : (editing?.code ?? "Sửa đơn mua hàng")}
      the={
        taoMoi ? (
          nguon.length ? (
            <span className="dfa-the">
              {nguon.map((n) => (
                <span key={n.code} className="ycd-tag">Từ <b>{n.code}</b></span>
              ))}
              {[...new Set(nguon.map((n) => n.bo_phan).filter(Boolean))].map((b) => (
                <span key={b} className="ycd-tag">{b}</span>
              ))}
            </span>
          ) : undefined
        ) : editing ? (
          <StatusBadge status={editing.status} />
        ) : undefined
      }
      chan={chan}
      onDong={() => setMode(null)}
    >
      <form id="dmh-form" className="kna" onSubmit={save}>
        {formError && <div className="kna-canh kna-canh--do" role="alert">{formError}</div>}
        <div className="kna-luoi dfa-luoi">
          <div className="kna-cot">
            {taoMoi && (
              <div className="dfa-dau">
                <h3>{soDon > 0 ? `Sẽ tạo ${soDon} đơn` : "Chọn nhà cung cấp cho từng món"}</h3>
                <span className="kna-mo">Món cùng nhà cung cấp gom vào một đơn</span>
              </div>
            )}
            {khoaNhom.map((k) => {
              const idx = nhom.get(k) ?? [];
              const ncc = k === "chua" ? null : nccCua(k);
              return (
                <section key={String(k)} className="kna-the kna-the--cat">
                  <div className="kna-the__dau dfa-ncc-dau">
                    {ncc ? (
                      <>
                        <span className="dfa-av">{vietTat(ncc.name)}</span>
                        <h3>{ncc.name}</h3>
                        {ncc.credit_days ? <span className="kna-tag">Cho nợ {ncc.credit_days} ngày</span> : null}
                      </>
                    ) : (
                      <h3 className="ycd-do">{taoMoi ? "Chưa chọn nhà cung cấp" : "Chọn nhà cung cấp ở cột phải"}</h3>
                    )}
                  </div>
                  <div className="lds-bang lds-bang--nhap dfa-bang dfa-bang--tien">
                    <table className="lds-g kna-tren" style={{ minWidth: 816 }}>
                      <colgroup>
                        <col />
                        <col style={{ width: 140 }} />
                        <col style={{ width: 136 }} />
                        <col style={{ width: 160 }} />
                        <col style={{ width: 80 }} />
                        <col style={{ width: 100 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Vật tư</th>
                          <th>Mua cho</th>
                          <th className="n">Số lượng</th>
                          <th className="n">Đơn giá</th>
                          <th className="n">VAT</th>
                          <th className="n">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>{idx.map((i) => dongBang(form.lines[i], i))}</tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>

          <div className="kna-cot">
            <section className="kna-the">
              <div className="kna-the__than kna-form">
                {/* Ô NCC ở ĐẦU PHIẾU chỉ cho chế độ SỬA: phiếu đã tồn tại thì thuộc MỘT nhà cung
                    cấp. Lúc TẠO NCC gán ở từng DÒNG rồi nhóm thành N đơn. */}
                {!taoMoi && (
                  <label className="kna-o-truong">
                    <span>Nhà cung cấp <em>*</em></span>
                    <select
                      className="kna-o"
                      required
                      value={form.supplier_id ?? ""}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        setForm({ ...form, supplier_id: id, lines: applySupplierPrices(form.lines, suppliers, id) });
                      }}
                    >
                      <option value="">Chọn nhà cung cấp</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.id === bestSupplierIdForLines(form.lines, suppliers) ? " (giá thấp nhất)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="kna-o-truong">
                  <span>Ngày cần hàng <em>*</em></span>
                  <input
                    className="kna-o"
                    type="date"
                    required
                    min={minPurchaseDate}
                    value={form.needed_date ?? ""}
                    onChange={(e) => setForm({ ...form, needed_date: e.target.value })}
                  />
                  {/* Chỉ nhắc khi ô đã đổi khác ngày yêu cầu — trùng nhau thì ô đã nói rồi. */}
                  {canNhat && taoMoi && form.needed_date !== canNhat && (
                    <small className="kna-mo">Yêu cầu cần {canNhat.split("-").reverse().join("/")}.</small>
                  )}
                </label>
                {/* NGÀY NHẬN HÀNG CHỈ Ở CHẾ ĐỘ SỬA (chủ chốt 28/08/2026): lúc TẠO phiếu tách N đơn
                    theo NCC mà ô chỉ có MỘT, đóng cùng ngày lên cả N đơn là bơm số sai vào đường
                    cung của kế hoạch vật tư. */}
                {!taoMoi && (
                  <label className="kna-o-truong">
                    <span>Dự kiến nhận hàng</span>
                    <input
                      className="kna-o"
                      type="date"
                      min={expectedReceiptMinDate}
                      value={form.expected_receipt_date ?? ""}
                      onChange={(e) => setForm({ ...form, expected_receipt_date: e.target.value })}
                    />
                  </label>
                )}
                <label className="kna-o-truong">
                  <span>Nội dung, mục đích <em>*</em></span>
                  <textarea
                    className="kna-o ycf-ta"
                    required
                    rows={3}
                    value={form.content ?? ""}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    placeholder="VD: mua giấy cho đơn hàng ĐH-2026-031"
                  />
                </label>
              </div>
            </section>

            <section className="kna-the">
              <div className="kna-the__dau"><h3>Tóm tắt chi phí</h3></div>
              <div className="kna-the__than dfa-cs">
                {khoaNhom.filter((k) => k !== "chua").map((k) => {
                  const t = tinhNhom(nhom.get(k) ?? []);
                  const ten = nccCua(k as number)?.name ?? "";
                  return (
                    <div key={String(k)} className="dfa-cs__nhom">
                      <div className="dfa-cs__nh"><span>{ten}</span><b className="kna-so">{so(t.tong)} đ</b></div>
                      <div className="dfa-cs__con"><span>Tiền hàng</span><span className="kna-so">{so(t.hang)}</span></div>
                      {t.giam > 0 && <div className="dfa-cs__con"><span>Chiết khấu</span><span className="kna-so">{so(-t.giam)}</span></div>}
                      <div className="dfa-cs__con"><span>VAT</span><span className="kna-so">{so(t.vat)}</span></div>
                    </div>
                  );
                })}
                {nhom.has("chua") && taoMoi && (
                  <div className="dfa-cs__con ycd-do">
                    <span>{(nhom.get("chua") ?? []).filter((i) => dongDuocChon(form.lines[i])).length} món chưa có nhà cung cấp</span>
                  </div>
                )}
                <div className="dfa-cs__tong">
                  <span>{soDon > 1 ? `Tổng ${soDon} đơn` : "Tổng"}</span>
                  <b className="kna-so">{so(tongCong)} đ</b>
                </div>
              </div>
            </section>
          </div>
        </div>
      </form>
    </NganPhai>
  );
}
