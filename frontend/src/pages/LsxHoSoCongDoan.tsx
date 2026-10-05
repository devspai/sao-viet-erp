// Mục "Công đoạn" của hồ sơ một lệnh (đặc tả 4.2): MỘT bảng từ `routing.nodes` thay cho ba khối cũ
// (Công đoạn & routing, Tổ máy người, Sản lượng theo lượt ghi). Bấm một dòng có dữ liệu để mở dòng
// chi tiết: các mẻ, giao/rút người, đổi máy, sự cố của bước.
import { Fragment, useMemo, useState } from "react";

import type { LenhSxHoSoOut, LenhSxRoutingNode } from "../api/client";
import { ChipKhuon } from "../components/ChipBuoc";
import { Icon } from "../components/Icons";
import { ngayGio } from "./keHoachSxShared";
import {
  BangCuon,
  MUC_DO,
  Pill,
  TT_BUOC,
  Trong,
  pillMeta,
  so,
  soDv,
  soHoac,
  tongMeTheoDonVi,
} from "./lsxHoSoChung";
import { nhanChang } from "./lsxBuoc";

export function LsxHoSoCongDoan({ d }: { d: LenhSxHoSoOut }) {
  const nodes = d.routing.nodes;
  const [mo, setMo] = useState<Set<number>>(() => new Set());

  // Bước cùng `lop` chạy song song được — máy chủ đã sắp theo (lop, thu_tu).
  const demLop = useMemo(() => {
    const m = new Map<number, number>();
    for (const n of nodes) m.set(n.lop, (m.get(n.lop) ?? 0) + 1);
    return m;
  }, [nodes]);

  if (nodes.length === 0) {
    return <Trong>Lệnh chưa có bước công đoạn nào. Chuỗi công đoạn lập ở màn Kế hoạch sản xuất.</Trong>;
  }

  function bat(id: number) {
    setMo((cu) => {
      const moi = new Set(cu);
      if (moi.has(id)) moi.delete(id);
      else moi.add(id);
      return moi;
    });
  }

  return (
    <BangCuon>
      <table className="lsc-bang lhs-cd">
        <caption className="lsc-sr">Các bước công đoạn của lệnh</caption>
        <thead>
          <tr>
            <th scope="col">Bước</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Máy, người</th>
            <th scope="col">Kế hoạch</th>
            <th scope="col">Thực tế</th>
            <th scope="col" className="lsc-so">
              Tốt, hỏng
            </th>
            <th scope="col" className="lsc-so">
              Vào → ra
            </th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n, i) => {
            const cvId = n.cong_viec_id;
            const me = cvId == null ? [] : d.san_luong.batch.filter((b) => b.cong_viec_id === cvId);
            const suKien = cvId == null ? [] : d.nhan_luc.lich_su.filter((e) => e.cong_viec_id === cvId);
            const suCo = cvId == null ? [] : d.su_co.filter((s) => s.cong_viec_id === cvId);
            const coChiTiet = me.length > 0 || suKien.length > 0 || suCo.length > 0;
            const dangMo = coChiTiet && mo.has(n.id);
            return (
              <Fragment key={n.id}>
                <tr className={n.la_buoc_hien_tai ? "is-now" : undefined}>
                  <td>
                    <span className="lhs-cd__buoc">
                      {coChiTiet ? (
                        <button
                          type="button"
                          className="lhs-cd__mo"
                          aria-expanded={dangMo}
                          aria-controls={`lhs-cd-${n.id}`}
                          onClick={() => bat(n.id)}
                        >
                          <Icon name="chevron" size={13} className={dangMo ? "is-mo" : undefined} />
                          <span>
                            {i + 1}. {n.ten ?? "—"}
                          </span>
                        </button>
                      ) : (
                        <span className="lhs-cd__ten">
                          {i + 1}. {n.ten ?? "—"}
                        </span>
                      )}
                    </span>
                    <span className="lsc-cum lhs-cd__the">
                      {n.la_buoc_ghep && (
                        <span className="lsc-tag">
                          {n.bai_ghep_ma ? `Bài ghép ${n.bai_ghep_ma}` : "Bài ghép"}
                        </span>
                      )}
                      {(demLop.get(n.lop) ?? 0) > 1 && <span className="lsc-tag">Song song</span>}
                      <ChipKhuon
                        can_khuon={n.can_khuon}
                        khuon={{
                          ma: n.khuon_be_ma,
                          so_ke: n.khuon_be_so_ke,
                          tinh_trang: n.khuon_be_tinh_trang,
                          da_nhan: n.khuon_da_nhan,
                        }}
                      />
                    </span>
                  </td>
                  <td>
                    {n.trang_thai ? (
                      <Pill meta={pillMeta(TT_BUOC, n.trang_thai)} />
                    ) : (
                      <span className="lsc-phu">Chưa phát hành</span>
                    )}
                  </td>
                  <td>
                    <MayNguoi n={n} />
                  </td>
                  <td className="lhs-cd__gio">
                    {n.du_kien_bat_dau || n.du_kien_ket_thuc ? (
                      <>
                        {n.du_kien_bat_dau ? ngayGio(n.du_kien_bat_dau) : "—"}
                        <span className="lsc-phu">→ {n.du_kien_ket_thuc ? ngayGio(n.du_kien_ket_thuc) : "—"}</span>
                      </>
                    ) : (
                      <span className="lsc-phu">Chưa xếp lịch</span>
                    )}
                  </td>
                  <td className="lhs-cd__gio">
                    <ThucTe n={n} me={me} />
                  </td>
                  <td className="lsc-so">
                    {me.length === 0
                      ? "—"
                      : tongMeTheoDonVi(me).map((t) => (
                          <span key={t.don_vi ?? ""} className="lhs-cd__sl">
                            {soDv(t.tot, t.don_vi)}
                            {t.hong > 0 && <span className="lsc-phu">{so(t.hong)} hỏng</span>}
                          </span>
                        ))}
                  </td>
                  <td className="lsc-so">
                    {soHoac(n.so_luong_vao)} {nhanChang(n.don_vi_vao)} → {soHoac(n.so_luong_ra)}{" "}
                    {nhanChang(n.don_vi_ra)}
                  </td>
                </tr>
                {dangMo && (
                  <tr className="lhs-cd__ct" id={`lhs-cd-${n.id}`}>
                    <td colSpan={7}>
                      {n.la_buoc_ghep && (
                        <p className="lhs-ghichu">
                          Số trên dòng này là của cả ca in ghép, không riêng lệnh này.
                        </p>
                      )}
                      {me.length > 0 && (
                        <ul className="lhs-ds">
                          {me.map((b) => (
                            <li key={b.id}>
                              <span className="lhs-ds__luc">{b.ket_thuc ? ngayGio(b.ket_thuc) : "—"}</span>
                              <span>
                                Ghi {soDv(b.tot, b.don_vi)} tốt
                                {b.hong > 0 ? `, ${so(b.hong)} hỏng` : ""}
                                {b.mo_ta_loi ? `, lỗi: ${b.mo_ta_loi}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {suKien.length > 0 && (
                        <ul className="lhs-ds">
                          {suKien.map((e, k) => (
                            <li key={k}>
                              <span className="lhs-ds__luc">{ngayGio(e.luc)}</span>
                              <span>
                                {e.loai === "giao_nguoi"
                                  ? `Giao ${e.nguoi ?? "người"} vào bước`
                                  : e.loai === "rut_nguoi"
                                    ? `Rút ${e.nguoi ?? "người"} khỏi bước${e.ly_do ? `, lý do: ${e.ly_do}` : ""}`
                                    : `Đổi máy ${e.may_cu ?? "—"} → ${e.may_moi ?? "—"}${e.ly_do ? `, lý do: ${e.ly_do}` : ""}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {suCo.length > 0 && (
                        <ul className="lhs-ds">
                          {suCo.map((s) => (
                            <li key={s.id}>
                              <span className="lhs-ds__luc">{s.thoi_diem ? ngayGio(s.thoi_diem) : "—"}</span>
                              <span>
                                Sự cố {s.ma}
                                {s.bo_phan_hong ? `, ${s.bo_phan_hong}` : ""}
                                {s.muc_do ? `, mức ${MUC_DO[s.muc_do] ?? s.muc_do}` : ""}
                                {s.mo_ta ? `: ${s.mo_ta}` : ""}
                                {s.phieu ? `. Phiếu sửa ${s.phieu.ma}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </BangCuon>
  );
}

/** Máy hoặc tổ, hoặc thẻ Gia công ngoài + nhà gia công; kèm người. Bước máy chưa có máy ghi đỏ. */
function MayNguoi({ n }: { n: LenhSxRoutingNode }) {
  const ngoai = n.loai_buoc === "thue_ngoai";
  const thieuMay = n.loai_buoc === "may" && !n.may && n.trang_thai !== "completed";
  return (
    <span className="lhs-cd__may">
      {ngoai ? (
        <span className="lsc-cum">
          <span className="lsc-tag">Gia công ngoài</span>
          {n.nha_cung_cap ?? "Chưa chọn nhà gia công"}
        </span>
      ) : thieuMay ? (
        <span className="lsc-do">Chưa có máy</span>
      ) : (
        <span>{n.may ?? n.to ?? "—"}</span>
      )}
      {n.nguoi.length > 0 && <span className="lsc-phu">{n.nguoi.join(", ")}</span>}
    </span>
  );
}

/** Thực tế: mẻ đầu → hoàn thành (hoặc "đến nay"); chưa có mẻ nào thì "chưa bắt đầu". */
function ThucTe({ n, me }: { n: LenhSxRoutingNode; me: LenhSxHoSoOut["san_luong"]["batch"] }) {
  const dau = me
    .map((b) => b.bat_dau)
    .filter((v): v is string => !!v)
    .sort()[0];
  if (!dau) return <span className="lsc-phu">Chưa bắt đầu</span>;
  return (
    <>
      {ngayGio(dau)}
      <span className="lsc-phu">→ {n.hoan_thanh_luc ? ngayGio(n.hoan_thanh_luc) : "đến nay"}</span>
    </>
  );
}
