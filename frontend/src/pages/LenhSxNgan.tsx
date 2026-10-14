// Ngăn MỘT lệnh của màn Hồ sơ lệnh sản xuất — hai cột (phương án A, 13/10/2026, khuôn Moltin).
// Mockup: `docs/mockups/chi-tiet-lenh-theo-doi-3-phuong-an.html`.
//   Tổng quan — cột chính: Sản lượng (đặt, làm ra ở bước cuối, KCS cuối, nhập kho, đã giao) và bảng
//   Các bước (tổ và máy, làm ra trên kế hoạch, hẹn xong, xong lúc). Cột phải: Lệnh, Quy cách,
//   Nhập kho, Sự cố.
//   Lịch sử — nhật ký của lệnh theo ngày, mới nhất lên đầu, dòng giao người cùng phút gộp một.
// Lệnh gia công trọn gói chỉ có MỘT bước.
//
// ⚠️ CHỈ XEM, KHÔNG MỘT SỐ TIỀN NÀO. Dữ liệu từ `GET /api/lenh-san-xuat/{id}/ngan`.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ApiError, api } from "../api/client";
import type { LenhSxNganOut, LenhSxRoutingNode, LenhSxSuCo, LenhSxThongSo, LenhSxTimeline } from "../api/client";
import { useCan } from "../auth/permissions";
import { useAuth } from "../auth/useAuth";
import { ngayVN, soVN } from "../components/LuoiDs";
import { NganPhai } from "./ke-toan/shared/NganPhai";
import { nhanCachIn } from "./keHoachSxShared";
import "./ke-toan/ke-toan.css";
import { PillKhau, TheDaDong, TheGap } from "./lsxKhau";
import { ChamBuoc, LichSu, buocTronGoi, buocTuNode, gioNgan, type DongLichSu } from "./lsxRoutingDoc";

/** Một cặp nhãn–giá trị của cột phải: giá trị chính, dòng phụ mờ (mỗi mẩu một dòng, không nối dấu). */
function O({ k, v, phu }: { k: string; v: ReactNode; phu?: (string | null | undefined)[] }) {
  const p = (phu ?? []).filter(Boolean) as string[];
  return (
    <div className="kt-ray__o">
      <dt>{k}</dt>
      <dd>
        {v}
        {p.map((x, i) => (
          <small key={i} className="lsa-phu">{x}</small>
        ))}
      </dd>
    </div>
  );
}

const so = (n: number | null | undefined) => soVN(n ?? 0);

/** Quy cách đủ cho cột phải. Thiếu số thì bỏ dòng đó. */
function QuyCach({ t }: { t: LenhSxThongSo }) {
  const mau = t.so_mau_a != null || t.so_mau_b != null ? `In ${t.so_mau_a ?? 0}/${t.so_mau_b ?? 0} màu` : null;
  const kho = (a: number | null, b: number | null) => (a && b ? `${soVN(a)} x ${soVN(b)}` : null);
  return (
    <dl className="kt-ray">
      {(t.dai_thanh_pham || t.so_trang) && (
        <O
          k="Thành phẩm"
          v={kho(t.dai_thanh_pham, t.rong_thanh_pham) ? `${kho(t.dai_thanh_pham, t.rong_thanh_pham)} mm` : "Chưa khai khổ"}
          phu={[t.so_trang && t.so_trang > 2 ? `${soVN(t.so_trang)} trang` : null]}
        />
      )}
      {t.giay_ten && (
        <O
          k="Giấy"
          v={t.dinh_luong ? `${t.giay_ten} ${soVN(t.dinh_luong)} g/m²` : t.giay_ten}
          phu={[
            kho(t.kho_nguyen_dai, t.kho_nguyen_rong) && `khổ nguyên ${kho(t.kho_nguyen_dai, t.kho_nguyen_rong)}`,
            kho(t.kho_in_dai, t.kho_in_rong) && `khổ in ${kho(t.kho_in_dai, t.kho_in_rong)}`,
          ]}
        />
      )}
      {mau && <O k="In" v={mau} phu={[nhanCachIn(t.quy_cach_in)]} />}
      {t.so_con > 0 && (
        <O
          k="Bình bài"
          v={`${soVN(t.so_con)} con một tờ in`}
          phu={[t.trang_moi_tay && t.trang_moi_tay > 1 ? `${soVN(t.trang_moi_tay)} trang một tay` : null, t.so_kem ? `${soVN(t.so_kem)} kẽm` : null]}
        />
      )}
      {t.so_to_nguyen > 0 && (
        <O k="Giấy cần" v={`${soVN(t.so_to_nguyen)} tờ nguyên`} phu={[t.so_to_ke_hoach > 0 ? `ra ${soVN(t.so_to_ke_hoach)} tờ in` : null]} />
      )}
      {t.ghi_chu_ky_thuat && <O k="Ghi chú" v={t.ghi_chu_ky_thuat} />}
    </dl>
  );
}

const TT_SU_CO: Record<string, string> = {
  cho_tiep_nhan: "Chờ kỹ thuật tiếp nhận",
  da_tao_phieu: "Đã tạo phiếu sửa",
  tu_choi: "Kỹ thuật từ chối",
};

function trangThaiSuCo(s: LenhSxSuCo): string {
  if (s.phieu?.trang_thai === "da_sua_xong") return "Đã sửa xong";
  if (s.phieu) return `Đang sửa ${s.phieu.ma}`;
  return TT_SU_CO[s.trang_thai ?? ""] ?? "Chưa rõ";
}

/** Số đạt / không đạt trong câu KCS máy chủ dựng ("… 240 đạt và 10 không đạt (Có lỗi)"). */
function kcsCoLoi(noiDung: string): boolean {
  const m = /([\d.,]+) không đạt/.exec(noiDung);
  return !!m && Number(m[1].replace(",", ".")) > 0;
}

/** Nhật ký lệnh ⇒ dòng tab Lịch sử: mới nhất lên đầu, giao người cùng phút gộp một dòng. */
function dongLichSu(tl: LenhSxTimeline[]): DongLichSu[] {
  const ra: DongLichSu[] = [];
  const ds = [...tl].reverse();
  for (let i = 0; i < ds.length; i++) {
    const e = ds[i];
    if (e.loai === "giao_nguoi") {
      const phut = gioNgan(e.luc);
      const nhom: LenhSxTimeline[] = [];
      while (i < ds.length && ds[i].loai === "giao_nguoi" && gioNgan(ds[i].luc) === phut) nhom.push(ds[i++]);
      i--;
      if (nhom.length > 1) {
        const theoViec = new Map<string, number>();
        for (const x of nhom) theoViec.set(x.ten_viec ?? "Bước", (theoViec.get(x.ten_viec ?? "Bước") ?? 0) + 1);
        ra.push({
          luc: e.luc,
          noi_dung: `Giao ${nhom.length} người vào ${theoViec.size} bước`,
          phu: [...theoViec].map(([t, n]) => `${t} ${n} người`),
        });
        continue;
      }
    }
    const loi = e.loai === "su_co" || e.loai === "tam_dung" || (e.loai === "kcs" && kcsCoLoi(e.noi_dung));
    ra.push({
      luc: e.luc,
      noi_dung: e.noi_dung,
      phu: e.loai === "giao_nguoi" || e.loai === "rut_nguoi" || e.loai === "doi_may" ? null : e.nguoi,
      mau: loi ? "do" : e.loai === "kho_nhan" ? "la" : null,
    });
  }
  return ra;
}

/** "Tổ và máy" của một bước: tổ (hoặc thẻ Thuê ngoài) rồi máy, người ở dòng phụ. */
function ToVaMay({ n }: { n: LenhSxRoutingNode }) {
  const ngoai = n.loai_buoc === "thue_ngoai" || !!n.nha_cung_cap;
  const nguoi = n.nguoi.length === 0 ? null : n.nguoi.length <= 2 ? n.nguoi.join(" và ") : `${n.nguoi.length} người`;
  return (
    <>
      {ngoai ? (
        <span className="lsa-the-ngoai">Thuê ngoài</span>
      ) : (
        <span>{n.to ?? <span className="lsa-mu">Chưa giao tổ</span>}</span>
      )}
      {ngoai && n.nha_cung_cap && <small className="lsa-phu">{n.nha_cung_cap}</small>}
      {n.may && <small className="lsa-phu">{n.may}</small>}
      {nguoi && <small className="lsa-phu">{nguoi}</small>}
    </>
  );
}

export function LenhSxNgan({
  lsxId,
  pv,
  onDong,
  len,
  xuong,
  eventTick,
  onMoDon,
}: {
  lsxId: number;
  /** Phiên bản in trên tờ giấy đã quét (deep link `#lsx=&pv=`). Nhỏ hơn phiên bản hiện tại ⇒ băng. */
  pv?: number | null;
  onDong: () => void;
  len?: () => void;
  xuong?: () => void;
  /** Nhịp SSE ĐÃ GỘP của màn. */
  eventTick?: number;
  onMoDon?: (orderId: number) => void;
}) {
  const { token } = useAuth();
  const can = useCan();
  const [d, setD] = useState<LenhSxNganOut | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [tab, setTab] = useState("tong_quan");

  const nap = useCallback(() => {
    if (!token) return;
    api.lenhSanXuat
      .ngan(token, lsxId)
      .then((r) => {
        setD(r);
        setLoi(null);
      })
      .catch((e) => {
        const st = e instanceof ApiError ? e.status : 0;
        setLoi(
          st === 403
            ? "Lệnh này nằm ngoài phạm vi của bạn."
            : st === 404
              ? "Không tìm thấy lệnh này trong danh sách lệnh đã phát hành."
              : e instanceof ApiError
                ? e.message
                : "Máy chủ không phản hồi.",
        );
      });
  }, [token, lsxId]);

  useEffect(() => {
    setD(null);
    setLoi(null);
    nap();
  }, [nap]);

  const tickDau = useRef(eventTick);
  useEffect(() => {
    if (eventTick === tickDau.current) return;
    tickDau.current = eventTick;
    nap();
  }, [eventTick, nap]);

  // --- in phiếu công nghệ (cần quyền Sản xuất như endpoint PDF) ------------------------------------
  const [dangIn, setDangIn] = useState(false);
  const [inLoi, setInLoi] = useState<string | null>(null);
  async function inPhieu() {
    if (!token || dangIn) return;
    setDangIn(true);
    setInLoi(null);
    try {
      const url = await api.lenhSanXuat.phieuCongNghePdf(token, lsxId);
      const w = window.open(url, "_blank");
      if (!w) {
        URL.revokeObjectURL(url);
        setInLoi("Trình duyệt đã chặn cửa sổ mới. Cho phép mở cửa sổ cho trang này rồi bấm lại.");
        return;
      }
      try {
        w.opener = null;
      } catch {
        /* cùng gốc thì không rơi vào đây */
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      const st = e instanceof ApiError ? e.status : 0;
      setInLoi(st === 403 ? "Bạn không có quyền in phiếu của lệnh này." : "Không in được phiếu công nghệ. Thử lại sau.");
    } finally {
      setDangIn(false);
    }
  }

  const tt = d?.thong_tin;
  const td = d?.tien_do;
  const xongSx = td ? td.khau !== "dang_sx" : false;
  const dvt = tt?.don_vi_tinh ?? "";

  // Chỗ vướng: mỗi cờ đang bật một câu. Đèn vật tư lấy NGUYÊN câu máy chủ. Lệnh đã xong sản xuất
  // thì sự cố, tạm dừng, vật tư không còn giữ lệnh.
  const vuong: string[] = [];
  if (td && !xongSx) {
    if (td.canh_bao.includes("su_co")) vuong.push("Có sự cố máy đang mở");
    if (td.canh_bao.includes("tam_dung")) vuong.push(td.buoc_hien_tai ? `Tạm dừng ở ${td.buoc_hien_tai}` : "Đang tạm dừng");
    if (td.canh_bao.includes("thieu_vat_tu")) vuong.push(td.vat_tu_chu ?? "Thiếu vật tư");
  }

  const nodes = d && !d.tron_goi ? d.routing.nodes : [];
  const cuoi = nodes.length ? nodes[nodes.length - 1] : null;
  const hut = !!cuoi && (cuoi.lam_ra ?? 0) < cuoi.so_luong_ra;

  // KCS cuối đọc theo NHÓM (máy chủ gộp): lệnh Bìa không có bước KCS cuối, cuốn sách kiểm ở lệnh Ruột.
  const kcsCuoi = d?.kcs_cuoi;
  const ycKho = d?.kho.yeu_cau.filter((y) => y.trang_thai !== "cancelled" && y.trang_thai !== "rejected") ?? [];
  const khoNhan = ycKho.reduce((s, y) => s + y.so_luong_xac_nhan, 0);
  const soLenhNhom = d?.kho.so_lenh_trong_nhom ?? 0;
  const khoChung = soLenhNhom > 1;

  // Ở xưởng: lần bắt đầu chạy đầu tiên tới lúc bước cuối xong.
  const batDau = d?.timeline.find((e) => e.loai === "bat_dau")?.luc ?? null;
  const moc = nodes.map((n) => n.hoan_thanh_luc).filter((x): x is string => !!x).sort();
  const xongLuc = xongSx && moc.length ? moc[moc.length - 1] : null;
  const lichSu = d ? dongLichSu(d.timeline) : [];

  const tongQuan = d && tt && td && (
    <>
      {inLoi && (
        <p className="lsn-do" role="alert">
          {inLoi}
        </p>
      )}
      {pv != null && d.phien_ban != null && pv < d.phien_ban && (
        <div className="banner banner--warn" role="status">
          Phiếu giấy v{pv}, lệnh hiện tại đã là v{d.phien_ban}
        </div>
      )}
      {vuong.length > 0 && (
        <ul className="lsn-vuong" aria-label="Đang vướng">
          {vuong.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      )}

      <section className="lsa-the" aria-labelledby="lsa-sl">
        <h3 className="lsa-the__h" id="lsa-sl">
          Sản lượng
          {tt.ten && <span className="lsa-mu">{tt.ten}</span>}
        </h3>
        <div className="lsa-so">
          <div>
            <div className="lsa-so__l">Đặt</div>
            <div className="lsa-so__v">
              {so(tt.so_luong_dat)}
              {dvt && <small>{dvt}</small>}
            </div>
          </div>
          <div>
            <div className="lsa-so__l">Làm ra</div>
            {d.tron_goi || !cuoi ? (
              <div className="lsa-so__v lsa-mu">—</div>
            ) : (
              <>
                <div className={`lsa-so__v${xongSx && hut ? " lsa-cam" : ""}`}>
                  {so(cuoi.lam_ra)}
                  {cuoi.don_vi_ra_ten && <small>{cuoi.don_vi_ra_ten}</small>}
                </div>
                <div className="lsa-so__p">ở {cuoi.ten ?? "bước cuối"}</div>
              </>
            )}
          </div>
          <div>
            <div className="lsa-so__l">Đạt KCS cuối</div>
            {!kcsCuoi || kcsCuoi.so_lan === 0 ? (
              <div className="lsa-so__v lsa-mu">Chưa kiểm</div>
            ) : (
              <>
                <div className="lsa-so__v">{so(kcsCuoi.dat)}</div>
                {kcsCuoi.khong_dat > 0 && <div className="lsa-so__p lsa-do">{so(kcsCuoi.khong_dat)} không đạt</div>}
              </>
            )}
          </div>
          <div>
            <div className="lsa-so__l">Nhập kho</div>
            <div className="lsa-so__v">{so(khoNhan)}</div>
            {khoChung && <div className="lsa-so__p">chung {soLenhNhom} lệnh</div>}
          </div>
          <div>
            <div className="lsa-so__l">Đã giao</div>
            <div className="lsa-so__v">{so(td.da_giao)}</div>
          </div>
        </div>
        {cuoi && !d.tron_goi && xongSx && hut && (
          <p className="lsa-chan">
            Mọi bước đã kết thúc. Bước cuối làm ra {so(cuoi.lam_ra)} trên {so(cuoi.so_luong_ra)}
            {cuoi.don_vi_ra_ten ? ` ${cuoi.don_vi_ra_ten}` : ""} kế hoạch.
          </p>
        )}
      </section>

      <section className="lsa-the" aria-labelledby="lsa-buoc">
        <h3 className="lsa-the__h" id="lsa-buoc">
          Các bước
          {d.phien_ban != null && <span className="lsa-mu">phiên bản {d.phien_ban}</span>}
        </h3>
        {d.tron_goi ? (
          <table className="lsa-g">
            <tbody>
              <tr>
                <td className="lsa-g__cham"><ChamBuoc b={buocTronGoi(d.tron_goi.nha_cung_cap, d.tron_goi.xong)} /></td>
                <td>
                  Gia công trọn gói
                  {d.tron_goi.nha_cung_cap && <small className="lsa-phu">{d.tron_goi.nha_cung_cap}</small>}
                </td>
                <td className="n">{d.tron_goi.xong ? "Đã nhận hàng về" : "Đang ở nhà gia công"}</td>
              </tr>
            </tbody>
          </table>
        ) : nodes.length === 0 ? (
          <p className="lsa-mu">Lệnh chưa có bước nào.</p>
        ) : (
          <div className="lsa-cuon">
            <table className="lsa-g lsa-g--buoc">
              <colgroup>
                <col style={{ width: 22 }} />
                <col />
                <col style={{ width: "30%" }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr>
                  <th aria-label="Trạng thái" />
                  <th>Bước</th>
                  <th>Tổ và máy</th>
                  <th className="n">Làm ra / kế hoạch</th>
                  <th className="n">Xong lúc</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => {
                  const b = buocTuNode(n);
                  if (xongSx) b.hien_tai = false;
                  const thieu = b.trang_thai === "xong" && (n.lam_ra ?? 0) < n.so_luong_ra;
                  return (
                    <tr key={n.id} className={b.hien_tai ? "is-o" : undefined}>
                      <td className="lsa-g__cham"><ChamBuoc b={b} /></td>
                      <td>
                        {n.ten ?? "Bước chưa đặt tên"}
                        {n.la_buoc_ghep && <small className="lsa-phu">{n.bai_ghep_ma ? `in ghép bài ${n.bai_ghep_ma}` : "in ghép"}</small>}
                        {b.trang_thai === "chay" && <small className="lsa-phu lsa-la">Đang chạy</small>}
                        {b.trang_thai === "dung" && <small className="lsa-phu lsa-do">Tạm dừng</small>}
                        {(n.kcs_khong_dat ?? 0) > 0 && <small className="lsa-phu lsa-do">KCS không đạt {so(n.kcs_khong_dat)}</small>}
                      </td>
                      <td><ToVaMay n={n} /></td>
                      <td className="n">
                        <span className={thieu ? "lsa-cam" : undefined}>{so(n.lam_ra)}</span>
                        <span className="lsa-mu"> / {so(n.so_luong_ra)}</span>
                        {n.don_vi_ra_ten && <small className="lsa-phu">{n.don_vi_ra_ten}</small>}
                      </td>
                      <td className="n">
                        {gioNgan(n.hoan_thanh_luc) || <span className="lsa-mu">Chưa xong</span>}
                        {n.du_kien_ket_thuc && <small className="lsa-phu">hẹn {gioNgan(n.du_kien_ket_thuc)}</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );

  const cot = d && tt && td && (
    <>
      <h3 className="kt-ngan__muc">Lệnh</h3>
      <dl className="kt-ray">
        <O k="Hạn giao khách" v={tt.han_giao_khach ? ngayVN(tt.han_giao_khach) : <span className="lsa-mu">Chưa hẹn</span>} />
        {!xongSx && <O k="Dự kiến xong" v={td.du_kien_xong ? gioNgan(td.du_kien_xong) : <span className="lsa-mu">Chưa ước được</span>} />}
        <O
          k="Ở xưởng"
          v={batDau ? (xongLuc ? `${gioNgan(batDau)} tới ${gioNgan(xongLuc)}` : `từ ${gioNgan(batDau)}`) : <span className="lsa-mu">Chưa bắt đầu</span>}
        />
        {tt.nhom_ten && <O k="Thành phẩm" v={tt.nhom_ten} phu={[khoChung ? `chung ${soLenhNhom} lệnh` : null]} />}
      </dl>

      <h3 className="kt-ngan__muc">Quy cách</h3>
      <QuyCach t={d.thong_so} />

      <h3 className="kt-ngan__muc">Nhập kho</h3>
      {ycKho.length === 0 ? (
        <p className="lsa-mu lsa-nho">Chưa có đề nghị nhập kho</p>
      ) : (
        <dl className="kt-ray">
          {ycKho.map((y) => (
            <O
              key={y.id}
              k={y.ma ?? "Đề nghị nhập"}
              v={
                <>
                  {so(y.so_luong_xac_nhan)}
                  {y.so_luong_xac_nhan < y.so_luong_yeu_cau && <span className="lsa-mu"> trên {so(y.so_luong_yeu_cau)}</span>}
                  {/* Số kho theo đơn vị của MÓN; `y.don_vi` là mã ("cuon"), in tên của lệnh. */}
                  {dvt && <span className="lsa-mu"> {dvt}</span>}
                </>
              }
              phu={[y.xac_nhan_luc ? `kho nhận ${gioNgan(y.xac_nhan_luc)}` : "chờ kho nhận"]}
            />
          ))}
        </dl>
      )}

      {d.su_co.length > 0 && (
        <>
          <h3 className="kt-ngan__muc">Sự cố</h3>
          <dl className="kt-ray">
            {d.su_co.map((s) => (
              <O
                key={s.id}
                k={s.ma}
                v={s.ten_viec ?? s.bo_phan_hong ?? "Sự cố máy"}
                phu={[s.may, gioNgan(s.thoi_diem), trangThaiSuCo(s)]}
              />
            ))}
          </dl>
        </>
      )}
    </>
  );

  return (
    <NganPhai
      duongDan="Hồ sơ lệnh sản xuất"
      tieuDe={
        <>
          {tt?.ma ?? `Lệnh #${lsxId}`}
          {tt?.is_rush && <TheGap />}
        </>
      }
      the={
        td ? (
          <span className="lsn-the">
            <PillKhau khau={td.khau} ct={td.khau_chi_tiet} />
            {tt?.da_dong && <TheDaDong />}
          </span>
        ) : undefined
      }
      hanhDong={
        can("san_xuat", "read") ? (
          <button type="button" className="kt-btn" onClick={inPhieu} disabled={dangIn || !token}>
            {dangIn ? "Đang dựng phiếu…" : "In phiếu công nghệ"}
          </button>
        ) : undefined
      }
      phuDe={
        tt ? (
          <span className="lsn-phu">
            {tt.order_no &&
              (tt.order_id != null && onMoDon ? (
                <button type="button" className="lds-lk" onClick={() => onMoDon(tt.order_id as number)}>
                  Đơn {tt.order_no}
                </button>
              ) : (
                <span>Đơn {tt.order_no}</span>
              ))}
            {tt.khach_hang && <span>{tt.khach_hang}</span>}
            {tt.sale && <span>{tt.sale} phụ trách</span>}
          </span>
        ) : undefined
      }
      tabs={d ? [{ id: "tong_quan", nhan: "Tổng quan" }, { id: "lich_su", nhan: "Lịch sử", dem: lichSu.length }] : undefined}
      tab={tab}
      onTab={setTab}
      cot={tab === "tong_quan" && cot ? cot : undefined}
      len={len}
      xuong={xuong}
      onDong={onDong}
    >
      {loi && !d ? (
        <p className="lsn-do">{loi}</p>
      ) : !d || !tt || !td ? (
        <p className="lsn-mu">Đang tải…</p>
      ) : tab === "lich_su" ? (
        <LichSu dong={lichSu} rong="Lệnh chưa có việc nào được ghi." />
      ) : (
        tongQuan
      )}
    </NganPhai>
  );
}
