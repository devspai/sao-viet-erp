/** Bộ lọc nâng cao của hai màn công nợ (đặc tả NPT-1, NPTh-1, A.18) cùng các chip đã áp.
 *
 *  Ô chung: Còn nợ (khoảng) — Hạn trả / Hạn thu (nhóm nút) — Hạn mức (nhóm nút) — Khác: "Hiện cả …
 *  đã trả hết". Màn nào khác chữ thì khai `cauHinh`. Bảng lọc giữ BẢN NHÁP riêng: chỉ nút "Xem n …"
 *  mới chép vào bộ lọc của trang; số "Khớp n …" do máy chủ đếm (`demKhop`, `dem_only`), chờ 350ms
 *  sau lần đổi cuối.
 *
 *  Màn nào cần thêm ô thì cắm qua `oSauNo` (ngay sau "Còn nợ" — phía thu: "Người phụ trách") hoặc
 *  `oThem` (sau "Hạn mức" — phía thu: "Nhãn khách hàng"); khoá `phu_trach_id`
 *  và `nhan` đã có sẵn trong `LocNangCaoCongNo` nên chip, đếm, tham số máy chủ và URL tự chạy.
 *  `chipThem` chỉ dành cho điều kiện NGOÀI `LocNangCaoCongNo`.
 *
 *  Chip đứng đầu (`chipDau`, vd "Tuổi nợ: Trễ 31–60 ngày") không thuộc bảng lọc — nó đến từ khối
 *  tổng quan — nhưng nằm chung hàng chip và chung link "Xoá hết".
 */
import type { ReactNode } from "react";

import { BoLocNangCao, ChipDaAp, KhoangTien, NhomNut, O, useBangLocNhap, type ChipLoc } from "./BoLocNangCao";
import {
  HAN_MUC_LUA_CHON,
  HAN_TRA_LUA_CHON,
  LOC_CONG_NO_TRONG,
  boDieuKienCongNo,
  chipsLocCongNo,
  soDieuKienCongNo,
  type LocNangCaoCongNo,
} from "./locCongNo";

export type CauHinhBoLocCongNo = {
  /** "nhà cung cấp" / "khách hàng" — chữ "Khớp n …" và nút "Xem n …". */
  donVi: string;
  /** "Hạn trả" / "Hạn thu". */
  nhanHan: string;
  /** Chữ của ô tích: "Hiện cả nhà cung cấp đã trả hết". */
  chuHet: string;
  /** Giá trị chip của ô tích: "nhà cung cấp đã trả hết". */
  nhanHet: string;
  /** Có thì hiện ô tích "thiếu hoá đơn" trong nhóm Khác (chỉ màn phải trả) — đây là chữ của ô. */
  chuThieuHd?: string;
  /** Dịch mã người phụ trách ra tên cho chip (màn phải thu). */
  tenPhuTrach?: (id: number) => string | undefined;
};

/** Ô thêm của từng màn (vd "Người phụ trách", "Nhãn khách hàng" bên phải thu). Cần bản nháp thì
 *  truyền hàm — nhận `nhap` và `doi` của bảng lọc. */
export type OThemCongNo =
  | ReactNode
  | ((b: { nhap: LocNangCaoCongNo; doi: (moi: Partial<LocNangCaoCongNo>) => void }) => ReactNode);

export function BoLocCongNo({
  cauHinh: ch,
  loc,
  onDoiLoc,
  demKhop,
  chipDau = [],
  onBoDau,
  oSauNo,
  oThem,
  chipThem = [],
  onBoThem,
}: {
  cauHinh: CauHinhBoLocCongNo;
  loc: LocNangCaoCongNo;
  onDoiLoc: (l: LocNangCaoCongNo) => void;
  /** Máy chủ đếm số dòng khớp một bản nháp (cùng kỳ, nhóm nút, mốc tuổi và ô tìm đang xem). */
  demKhop: (nhap: LocNangCaoCongNo) => Promise<number>;
  chipDau?: ChipLoc[];
  /** Bỏ chip đầu theo khoá; khoá null = bỏ hết chip đầu ("Xoá hết"). */
  onBoDau?: (khoa: string | null) => void;
  /** Ô thêm, đứng ngay sau "Còn nợ". */
  oSauNo?: OThemCongNo;
  /** Ô thêm, đứng sau "Hạn mức", trước "Khác". */
  oThem?: OThemCongNo;
  /** Chip thêm của màn, đứng sau chip của bảng lọc. Bấm chip mở bảng ở ô `data-o` cùng khoá. */
  chipThem?: ChipLoc[];
  /** Bỏ chip thêm theo khoá; khoá null = bỏ hết ("Xoá hết"). */
  onBoThem?: (khoa: string | null) => void;
}) {
  // Bản nháp + đếm "Khớp n …" + con trỏ theo chip: khuôn chung `useBangLocNhap`.
  const { mo, onMo, moBang, nhap, setNhap, doi, khop } = useBangLocNhap(loc, demKhop);
  const khoaDau = new Set(chipDau.map((c) => c.khoa));
  const khoaThem = new Set(chipThem.map((c) => c.khoa));
  const ve = (o: OThemCongNo | undefined) => (typeof o === "function" ? o({ nhap, doi }) : o);

  return (
    <>
      <BoLocNangCao
        soDieuKien={soDieuKienCongNo(loc)}
        mo={mo}
        onMo={onMo}
        khop={khop}
        donVi={ch.donVi}
        duoiKhop=""
        onXoaHet={() => setNhap(LOC_CONG_NO_TRONG)}
        onAp={() => onDoiLoc(nhap)}
      >
        <O nhan="Còn nợ (đ)" rong>
          <div data-o="no">
            <KhoangTien tu={nhap.no_tu} den={nhap.no_den} onDoi={(tu, den) => doi({ no_tu: tu, no_den: den })} />
          </div>
        </O>
        {ve(oSauNo)}
        <O nhan={ch.nhanHan} rong>
          <div data-o="han_tra">
            <NhomNut giaTri={nhap.han_tra ?? ""} luaChon={HAN_TRA_LUA_CHON}
              onDoi={(v) => doi({ han_tra: v || undefined })} />
          </div>
        </O>
        <O nhan="Hạn mức" rong>
          <div data-o="han_muc">
            <NhomNut giaTri={nhap.han_muc ?? ""} luaChon={HAN_MUC_LUA_CHON}
              onDoi={(v) => doi({ han_muc: v || undefined })} />
          </div>
        </O>
        {ve(oThem)}
        <O nhan="Khác" rong>
          <div data-o="het">
            <label className="kt-ck-dong">
              <input type="checkbox" className="kt-ck" checked={!!nhap.ca_da_tra_het}
                onChange={(e) => doi({ ca_da_tra_het: e.target.checked || undefined })} />
              {ch.chuHet}
            </label>
          </div>
          {ch.chuThieuHd && (
            <div data-o="thieu_hd">
              <label className="kt-ck-dong">
                <input type="checkbox" className="kt-ck" checked={!!nhap.thieu_hoa_don}
                  onChange={(e) => doi({ thieu_hoa_don: e.target.checked || undefined })} />
                {ch.chuThieuHd}
              </label>
            </div>
          )}
        </O>
      </BoLocNangCao>
      <ChipDaAp
        chips={[...chipDau, ...chipsLocCongNo(loc, ch), ...chipThem]}
        onBo={(khoa) => {
          if (khoaDau.has(khoa)) onBoDau?.(khoa);
          else if (khoaThem.has(khoa)) onBoThem?.(khoa);
          else onDoiLoc(boDieuKienCongNo(loc, khoa));
        }}
        onSua={(khoa) => {
          if (!khoaDau.has(khoa)) moBang(khoa);
        }}
        onXoaHet={() => {
          onBoDau?.(null);
          onBoThem?.(null);
          onDoiLoc(LOC_CONG_NO_TRONG);
        }}
      />
    </>
  );
}
