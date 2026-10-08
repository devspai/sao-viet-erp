// Danh sách các LẦN KIỂM của một công đoạn (mới nhất trước) — màn KCS, dưới mỗi công đoạn trong chuỗi.
// Công đoạn giữa (`chiLoi`) chỉ bày các lần GHI LỖI — đạt chỉ kiểm ở công đoạn cuối (19/09/2026).
// Chỉ hiển thị — không có nút "Đã xem": mở tab KCS của ngăn chi tiết bàn tổ là tổ đã xem (18/09/2026,
// xem `ThsxKetQuaKcs`).
//
// Ảnh lỗi bày như "Tệp của lệnh" (mỗi ảnh một dòng, bấm là mở hộp xem trước ngay trên trang) — mở tab
// mới thì mất ngăn đang xem. Dòng phụ là giờ + người kiểm: ảnh chỉ tải lên cùng lúc ghi lần kiểm, máy
// chủ không lưu cỡ tệp.
//
// Lỗi quy về công đoạn khác (19/09/2026): KCS bắt ở bước sau nhưng tính cho bước trước — dòng lỗi gắn
// nhãn "Tính cho …".
//
// Kết quả tiêu chí gom THEO CÔNG ĐOẠN (08/10/2026, §3a): bước cuối xét tiêu chí gộp cả chuỗi, mỗi
// kết quả khoá theo cặp (`cong_viec_id`, `thu_tu`) — kết quả cũ thiếu `cong_viec_id` là của chính
// công việc lần kiểm. Công đoạn có lỗi lên đầu, mỗi mục hỏng một dòng; công đoạn đạt một dòng "Đạt".
//
// Bàn tổ (tab KCS) KHÔNG dùng danh sách lần kiểm này mà dùng `KcsLoiCuaTo` — chỉ lỗi tổ chịu, phẳng,
// không lần kiểm đạt/số đạt/tiêu chí (19/09/2026). Danh sách lần kiểm đầy đủ là của phía KCS.
import { useState } from "react";
import { createPortal } from "react-dom";
import { type SxKcsChiTietTieuChi, type SxKcsLanKiem } from "../../api/client";
import { XemTruoc } from "../../components/DinhKemTep";
import { Icon } from "../../components/Icons";
import type { TepXem } from "../../components/tepDinhKem";
import { ngayGio, num } from "../keHoachSxShared";
import { nhanDonVi } from "../lsxBuoc";
import { DongTep } from "../ThsxDongTep";
import { KCS_KET_LUAN } from "./kcsNhan";
import { nhanLenhPhu, tenTieuChi } from "./theCongDoan";
import "../thuc-hien-sx.css";

export interface NhomKetQua {
  cvId: number | null;
  ten: string;
  /** "Lệnh phụ …" khi công đoạn thuộc lệnh phụ — hai lệnh cùng có bước In thì phải phân biệt được. */
  phu: string | null;
  hong: { ten: string; ghiChu: string | null }[];
}

/** Gom kết quả một lần kiểm theo công đoạn nguồn: có lỗi lên đầu, giữ thứ tự xuất hiện. */
export function ketQuaTheoCongDoan(lk: SxKcsLanKiem, checklist: SxKcsChiTietTieuChi[]): NhomKetQua[] {
  const cvCua = (id: number | null | undefined) => id ?? lk.cong_viec_id ?? null;
  const tenTc = new Map(checklist.map((t) => [`${cvCua(t.cong_viec_id)}:${t.thu_tu}`, tenTieuChi(t)]));
  const tenCd = new Map(checklist.map((t) => [cvCua(t.cong_viec_id), t.ten_cong_doan]));
  const phuCd = new Map(checklist.map((t) => [cvCua(t.cong_viec_id), nhanLenhPhu(t)]));
  const nhom = new Map<number | null, NhomKetQua>();
  for (const c of lk.checklist) {
    const cv = cvCua(c.cong_viec_id);
    let g = nhom.get(cv);
    if (!g) {
      g = { cvId: cv, ten: tenCd.get(cv) || (cv === lk.cong_viec_id ? lk.cong_doan_ten : null) || "Công đoạn", phu: phuCd.get(cv) ?? null, hong: [] };
      nhom.set(cv, g);
    }
    if (!c.dat) g.hong.push({ ten: tenTc.get(`${cv}:${c.thu_tu}`) ?? `Tiêu chí #${c.thu_tu}`, ghiChu: c.ghi_chu ?? null });
  }
  const ds = [...nhom.values()];
  return [...ds.filter((g) => g.hong.length > 0), ...ds.filter((g) => g.hong.length === 0)];
}

export function KcsLanKiemList({
  lanKiem: tatCa, checklist = [], chiLoi = false,
}: {
  lanKiem: SxKcsLanKiem[];
  /** Tiêu chí (gộp ở bước cuối) — để đổi cặp (`cong_viec_id`, `thu_tu`) trong kết quả ra tên. */
  checklist?: SxKcsChiTietTieuChi[];
  /** Công đoạn GIỮA: KCS chỉ ghi lỗi — bỏ lần ghi không lỗi (dữ liệu cũ), không bày đạt/tiêu chí. */
  chiLoi?: boolean;
}) {
  const [xem, setXem] = useState<TepXem | null>(null);
  const lanKiem = chiLoi ? tatCa.filter((lk) => lk.loi.length > 0) : tatCa;
  if (lanKiem.length === 0) {
    return <p className="kcs-lk__trong">{chiLoi ? "Chưa ghi lỗi nào." : "Chưa có lần kiểm nào."}</p>;
  }
  return (
    <>
      <ul className="kcs-lk">
        {lanKiem.map((lk) => {
          const kl = KCS_KET_LUAN[lk.ket_luan] ?? { nhan: lk.ket_luan, cls: "" };
          const dv = nhanDonVi(lk.don_vi);
          // Mỗi mục hỏng một dòng: tên tiêu chí có thể tự chứa dấu phẩy nên không nối chung một câu được.
          const nhomKq = ketQuaTheoCongDoan(lk, checklist);
          const soCdLoi = nhomKq.filter((g) => g.hong.length > 0).length;
          return (
            // Hàng phẳng: vạch trái mang màu kết luận, không badge/chip/viên thuốc (19/09/2026).
            <li key={lk.id} className={`kcs-lk__it kcs-lk__it--${chiLoi ? "dat_mot_phan" : lk.ket_luan}`}>
              <div className="kcs-lk__dau">
                <span className="kcs-lk__kq">
                  {chiLoi ? (
                    <span className="kcs-lk__so">lỗi <b className="is-loi">{num(lk.so_loi)}</b> {dv}</span>
                  ) : (
                    <>
                      <span className="kcs-lk__kl">{kl.nhan}</span>
                      <span className="kcs-lk__so">
                        đạt <b>{num(lk.so_dat)}</b>{" · "}lỗi{" "}
                        <b className={lk.so_loi > 0 ? "is-loi" : undefined}>{num(lk.so_loi)}</b> {dv}
                      </span>
                    </>
                  )}
                </span>
                <span className="kcs-lk__luc">{ngayGio(lk.luc)}</span>
              </div>
              <p className="kcs-lk__phu">
                <span>{lk.nguoi_kiem ?? "—"}</span>
                {!chiLoi && nhomKq.length > 0 && <span>Công đoạn: {nhomKq.length - soCdLoi}/{nhomKq.length} đạt</span>}
              </p>
              {!chiLoi && nhomKq.length > 0 && (
                  <ul className="kcs-lk__tc-ds">
                    {nhomKq.map((g) => (
                      <li key={g.cvId ?? "x"} className={`kcs-lk__tc-it${g.hong.length ? " is-khong" : ""}`}>
                        <Icon name={g.hong.length ? "x" : "check"} size={12} className="kcs-lk__tc-ic" />
                        <span className="kcs-lk__tc-ten">
                          {g.ten}
                          {g.phu && <span className="kcs-lk__tc-lenh">{g.phu}</span>}
                        </span>
                        <span className="kcs-lk__tc-kq">{g.hong.length ? `${g.hong.length} mục hỏng` : "Đạt"}</span>
                        {g.hong.map((h, i) => (
                          <span key={i} className="kcs-lk__tc-gc">
                            {h.ten}{h.ghiChu && <span className="kcs-lk__tc-gc-phu"> ({h.ghiChu})</span>}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
              )}
              {lk.ghi_chu && <p className="kcs-lk__gc">Ghi chú: {lk.ghi_chu}</p>}
              {lk.loi.map((l) => {
                const khac = l.cong_doan_id != null && lk.cong_viec_id != null && l.cong_doan_id !== lk.cong_viec_id;
                return (
                  // Lỗi thụt vào dưới lần kiểm, không lồng thẻ.
                  <div key={l.id} className="kcs-lk__loi">
                    <div className="kcs-lk__loi-dau">
                      <span className="kcs-lk__loi-mota">{l.mo_ta || "Lỗi"}</span>
                      <span className="kcs-lk__loi-sl">{num(l.so_luong)} {nhanDonVi(l.don_vi ?? lk.don_vi)}</span>
                    </div>
                    <p className="kcs-lk__loi-phu">
                      {khac && (
                        <span className="kcs-lk__chiu" title="KCS quy lỗi này về công đoạn đứng trước — tổ đó chịu trách nhiệm">
                          Tính cho <b>{l.cong_doan_ten ?? "công đoạn trước"}</b>
                          {l.to_chiu_ten ? ` (${l.to_chiu_ten})` : ""}{" · "}
                        </span>
                      )}
                      <span className={l.da_xem_luc ? "kcs-lk__xem is-da" : "kcs-lk__xem"}>
                        {l.da_xem_luc
                          ? `Tổ đã xem${l.nguoi_xem ? ` (${l.nguoi_xem})` : ""} · ${ngayGio(l.da_xem_luc)}`
                          : "Tổ chưa xem"}
                      </span>
                    </p>
                    {l.anh.length > 0 && (
                      <ul className="thsx-tep__ds kcs-lk__anh">
                        {l.anh.map((a) => (
                          <DongTep key={a.id} onXem={setXem}
                            t={{ ten_tep: a.file_name, file_url: a.file_url, content_type: a.file_type ?? null }}
                            meta={`${ngayGio(lk.luc)}${lk.nguoi_kiem ? ` · ${lk.nguoi_kiem}` : ""}`} />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
      {/* Ra thẳng body: ngăn chi tiết bàn tổ có transform trượt vào nên `position: fixed` bị nhốt trong ngăn. */}
      {xem && createPortal(<XemTruoc tep={xem} onDong={() => setXem(null)} />, document.body)}
    </>
  );
}

/** Lỗi KCS TỔ CHỊU của một công đoạn — danh sách PHẲNG, mới nhất trước: lỗi KCS bắt ngay ở công đoạn
 *  này (trừ lỗi KCS đã quy sang công đoạn khác) + lỗi bắt ở bước sau quy về đây (`lan_kiem_buoc_sau`,
 *  máy chủ đã chỉ giữ lỗi quy về công đoạn này). Mỗi lỗi: mô tả + số, dòng phụ "bắt ở … · ai · lúc
 *  nào · đã xem", ảnh bên dưới. Không bày lần kiểm đạt/số đạt — tổ chỉ cần biết lỗi (19/09/2026). */
export function loiCuaTo(congViecId: number, lanKiem: SxKcsLanKiem[], buocSau: SxKcsLanKiem[] = []) {
  const tai = lanKiem.flatMap((lk) => lk.loi
    .filter((l) => l.cong_doan_id == null || l.cong_doan_id === congViecId)
    .map((l) => ({ lk, l })));
  const sau = buocSau.flatMap((lk) => lk.loi.map((l) => ({ lk, l })));
  return [...tai, ...sau].sort((x, y) => (y.lk.luc ?? "").localeCompare(x.lk.luc ?? ""));
}

export function KcsLoiCuaTo({ congViecId, dong }: {
  congViecId: number;
  dong: ReturnType<typeof loiCuaTo>;
}) {
  const [xem, setXem] = useState<TepXem | null>(null);
  return (
    <>
      <ul className="kcs-bs">
        {dong.map(({ lk, l }) => (
          <li key={l.id} className="kcs-bs__it">
            <div className="kcs-bs__dau">
              <span className="kcs-bs__mota">{l.mo_ta || "Lỗi"}</span>
              <span className="kcs-bs__so">{num(l.so_luong)} {nhanDonVi(l.don_vi ?? lk.don_vi)}</span>
            </div>
            <p className="kcs-bs__phu">
              {lk.cong_viec_id != null && lk.cong_viec_id !== congViecId && (
                <>Bắt ở <b>{lk.cong_doan_ten ?? "công đoạn sau"}</b>{" · "}</>
              )}
              {lk.nguoi_kiem ?? "—"} · {ngayGio(lk.luc)}
              {" · "}
              <span className={l.da_xem_luc ? "kcs-bs__xem is-da" : "kcs-bs__xem"}>
                {l.da_xem_luc ? `đã xem ${ngayGio(l.da_xem_luc)}` : "chưa xem"}
              </span>
            </p>
            {l.anh.length > 0 && (
              <ul className="thsx-tep__ds kcs-bs__anh">
                {l.anh.map((a) => (
                  <DongTep key={a.id} onXem={setXem}
                    t={{ ten_tep: a.file_name, file_url: a.file_url, content_type: a.file_type ?? null }}
                    meta={ngayGio(lk.luc)} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {xem && createPortal(<XemTruoc tep={xem} onDong={() => setXem(null)} />, document.body)}
    </>
  );
}
