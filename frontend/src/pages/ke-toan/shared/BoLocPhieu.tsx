/** Bộ lọc nâng cao của hai sổ phiếu — Phiếu chi và Phiếu thu (đặc tả PC-1, PT-1, A.18) — cùng các
 *  chip điều kiện đã áp. Hai màn có cùng sáu ô; màn nào khác chữ / danh sách nguồn thì khai `cauHinh`.
 *
 *  Bảng lọc giữ BẢN NHÁP riêng: sửa trong bảng không đổi danh sách, chỉ nút "Xem n phiếu" mới chép
 *  bản nháp vào bộ lọc của trang. Số "Khớp n phiếu" do máy chủ đếm (`demKhop`, `dem_only`), chờ
 *  350ms sau lần đổi cuối. Mỗi điều kiện đã áp là một chip; bấm chip mở lại bảng ở đúng ô đó.
 *
 *  Ô "Người lập" (`nguoi_lap_id`) CHƯA có: danh sách người dùng (`GET /api/users`) đòi quyền Nhân
 *  sự — màn kế toán không được mượn khoá màn khác.
 */
import { Fragment } from "react";
import type { ReactNode } from "react";

import type { CompanyBankAccountRow } from "../../../api/client";
import { BoLocNangCao, ChipDaAp, ChonNhieu, KhoangTien, NhomNut, O, chuKhoang, useBangLocNhap, type ChipLoc } from "./BoLocNangCao";
import { LOC_TRONG, boDieuKien, soDieuKien, type LocNangCao } from "./locPhieu";

const HINH_THUC: [string, string][] = [["", "Tất cả"], ["cash", "Tiền mặt"], ["bank_transfer", "Chuyển khoản"]];
const CHUNG_TU: [string, string][] = [["", "Tất cả"], ["co", "Đã có"], ["thieu", "Còn thiếu"]];

/** Chữ riêng của từng sổ. */
export type CauHinhBoLoc = {
  /** "Nguồn chi" / "Nguồn thu" — nhãn ô; chip luôn ghi ngắn "Nguồn". */
  nhanNguon: string;
  nguonLuaChon: [string, string][];
  /** "Trả từ tài khoản" / "Vào tài khoản". */
  nhanTaiKhoan: string;
  /** "Người nhận" / "Người nộp". */
  nhanTen: string;
  goiYTen: string;
};

export function tenTaiKhoan(tk: Pick<CompanyBankAccountRow, "bank_name" | "account_number">): string {
  return `${tk.bank_name} ${tk.account_number}`;
}

/** Nối nhiều giá trị cùng loại bằng chữ "và" (không dấu phẩy) — "và" chữ thường, giá trị đậm. */
export function noiVa(cac: string[]): ReactNode {
  return cac.map((c, i) => (
    <Fragment key={c}>
      {i > 0 && <span className="kt-va"> và </span>}
      {c}
    </Fragment>
  ));
}

/** Chip cho từng điều kiện đã áp — thứ tự theo bảng lọc. */
export function chipsLocPhieu(loc: LocNangCao, taiKhoan: CompanyBankAccountRow[] | null, ch: CauHinhBoLoc): ChipLoc[] {
  const chips: ChipLoc[] = [];
  const khoang = chuKhoang(loc.tien_tu, loc.tien_den);
  if (khoang) chips.push({ khoa: "tien", nhan: "Số tiền", giaTri: khoang });
  if (loc.hinh_thuc) {
    chips.push({ khoa: "hinh_thuc", nhan: "Hình thức", giaTri: HINH_THUC.find(([v]) => v === loc.hinh_thuc)?.[1] });
  }
  if (loc.nguon.length) {
    const ten = loc.nguon.map((n) => ch.nguonLuaChon.find(([v]) => v === n)?.[1] ?? n);
    chips.push({ khoa: "nguon", nhan: "Nguồn", giaTri: noiVa(ten) });
  }
  if (loc.tai_khoan_id != null) {
    const tk = taiKhoan?.find((t) => t.id === loc.tai_khoan_id);
    chips.push({ khoa: "tai_khoan_id", nhan: ch.nhanTaiKhoan, giaTri: tk ? tenTaiKhoan(tk) : `#${loc.tai_khoan_id}` });
  }
  if (loc.ten_nhan?.trim()) chips.push({ khoa: "ten_nhan", nhan: ch.nhanTen, giaTri: loc.ten_nhan.trim() });
  if (loc.chung_tu) {
    chips.push({ khoa: "chung_tu", nhan: "Chứng từ", giaTri: CHUNG_TU.find(([v]) => v === loc.chung_tu)?.[1] });
  }
  return chips;
}

export function BoLocPhieu({
  cauHinh: ch,
  loc,
  onDoiLoc,
  demKhop,
  taiKhoan,
}: {
  cauHinh: CauHinhBoLoc;
  loc: LocNangCao;
  onDoiLoc: (l: LocNangCao) => void;
  /** Máy chủ đếm số phiếu khớp một bản nháp (cùng thẻ, kỳ và ô tìm đang xem). */
  demKhop: (nhap: LocNangCao) => Promise<number>;
  /** Tài khoản công ty; null = không có quyền xem Tài khoản ngân hàng ⇒ ẩn ô. */
  taiKhoan: CompanyBankAccountRow[] | null;
}) {
  // Bản nháp + đếm "Khớp n phiếu" + con trỏ theo chip: khuôn chung `useBangLocNhap`.
  const { mo, onMo, moBang, nhap, setNhap, doi, khop } = useBangLocNhap(loc, demKhop);

  return (
    <>
      <BoLocNangCao
        soDieuKien={soDieuKien(loc)}
        mo={mo}
        onMo={onMo}
        khop={khop}
        donVi="phiếu"
        onXoaHet={() => setNhap(LOC_TRONG)}
        onAp={() => onDoiLoc({ ...nhap, ten_nhan: nhap.ten_nhan?.trim() || undefined })}
      >
        <O nhan="Số tiền (đ)">
          <div data-o="tien">
            <KhoangTien tu={nhap.tien_tu} den={nhap.tien_den} onDoi={(tu, den) => doi({ tien_tu: tu, tien_den: den })} />
          </div>
        </O>
        <O nhan="Hình thức">
          <div data-o="hinh_thuc">
            <NhomNut giaTri={nhap.hinh_thuc ?? ""} luaChon={HINH_THUC}
              onDoi={(v) => doi({ hinh_thuc: (v || undefined) as LocNangCao["hinh_thuc"] })} />
          </div>
        </O>
        <O nhan={ch.nhanNguon} rong>
          <div data-o="nguon">
            <ChonNhieu giaTri={nhap.nguon} luaChon={ch.nguonLuaChon} onDoi={(v) => doi({ nguon: v })} />
          </div>
        </O>
        {taiKhoan && (
          <O nhan={ch.nhanTaiKhoan}>
            <div data-o="tai_khoan_id">
              <select aria-label={ch.nhanTaiKhoan} value={nhap.tai_khoan_id ?? ""}
                onChange={(e) => doi({ tai_khoan_id: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">Mọi tài khoản</option>
                {taiKhoan.map((tk) => (
                  <option key={tk.id} value={tk.id}>{tenTaiKhoan(tk)}</option>
                ))}
              </select>
            </div>
          </O>
        )}
        <O nhan={ch.nhanTen}>
          <div data-o="ten_nhan">
            <input aria-label={ch.nhanTen} placeholder={ch.goiYTen} value={nhap.ten_nhan ?? ""}
              onChange={(e) => doi({ ten_nhan: e.target.value })} />
          </div>
        </O>
        <O nhan="Chứng từ">
          <div data-o="chung_tu">
            <NhomNut giaTri={nhap.chung_tu ?? ""} luaChon={CHUNG_TU}
              onDoi={(v) => doi({ chung_tu: (v || undefined) as LocNangCao["chung_tu"] })} />
          </div>
        </O>
      </BoLocNangCao>
      <ChipDaAp
        chips={chipsLocPhieu(loc, taiKhoan, ch)}
        onBo={(khoa) => onDoiLoc(boDieuKien(loc, khoa))}
        onSua={(khoa) => moBang(khoa)}
        onXoaHet={() => onDoiLoc(LOC_TRONG)}
      />
    </>
  );
}
