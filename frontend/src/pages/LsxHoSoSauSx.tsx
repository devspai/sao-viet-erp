// Mục "Sau sản xuất" của hồ sơ một lệnh (đặc tả 4.2): ba khung KCS lần cuối · Nhập kho · Giao hàng.
// Lô KCS giữa chuyền không hiện ở đây (đã có ở dòng mở ra của bước).
//
// Nút "Tạo yêu cầu giao hàng" là ĐIỀU HƯỚNG sang drawer đơn hàng (form đã có ở đó), không phải ghi.
import type { LenhSxHoSoOut } from "../api/client";
import { Button } from "../components/Button";
import { Icon } from "../components/Icons";
import { ngayGio } from "./keHoachSxShared";
import { KCS_KET_LUAN, KHO_YC_TT, NHIEU_DON_VI, Pill, Trong, pillMeta, so, soDv } from "./lsxHoSoChung";

export function LsxHoSoSauSx({
  d,
  choPhepLap,
  onMoDon,
}: {
  d: LenhSxHoSoOut;
  /** Người xem ghi được bên giao hàng (`giao_hang:create`). */
  choPhepLap: boolean;
  onMoDon?: (orderId: number) => void;
}) {
  const nhom = d.giao_hang.so_lenh_trong_nhom;
  const kcsCuoi = d.kcs.batch.filter((b) => b.la_kcs_cuoi);
  const gh = d.giao_hang;
  const chuaTinh = gh.hang.filter((h) => h.khong_tinh_duoc || h.so_toi_da == null);

  return (
    <div className="lhs-ba">
      <section className="lhs-o" aria-labelledby="lhs-kcs-h">
        <h4 className="lhs-o__h" id="lhs-kcs-h">
          KCS lần cuối
          {nhom > 1 && <span className="lsc-tag">Riêng lệnh này</span>}
        </h4>
        {kcsCuoi.length === 0 ? (
          <Trong>Chưa kiểm lần cuối.</Trong>
        ) : (
          <ul className="lhs-ds">
            {kcsCuoi.map((b) => (
              <li key={b.id}>
                <span className="lhs-ds__luc">{b.ket_thuc ? ngayGio(b.ket_thuc) : "—"}</span>
                <span className="lhs-ds__noi">
                  <span className="lsc-cum">
                    <Pill meta={pillMeta(KCS_KET_LUAN, b.ket_luan)} />
                    <span>
                      Nhận {soDv(b.so_luong_nhan, b.don_vi)}, đạt {so(b.so_luong_dat)}, không đạt{" "}
                      {so(b.so_luong_khong_dat)}
                    </span>
                  </span>
                  {b.ghi_chu && <span className="lsc-phu">{b.ghi_chu}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lhs-o" aria-labelledby="lhs-kho-h">
        <h4 className="lhs-o__h" id="lhs-kho-h">
          Nhập kho
          {d.kho.so_lenh_trong_nhom > 1 && (
            <span className="lsc-tag">Cả nhóm, {d.kho.so_lenh_trong_nhom} lệnh</span>
          )}
        </h4>
        {d.kho.yeu_cau.length === 0 ? (
          <Trong>Chưa đề nghị nhập kho.</Trong>
        ) : (
          <ul className="lhs-ds">
            {d.kho.yeu_cau.map((y) => (
              <li key={y.id}>
                <span className="lhs-ds__luc">{y.tao_luc ? ngayGio(y.tao_luc) : "—"}</span>
                <span className="lhs-ds__noi">
                  <span className="lsc-cum">
                    <b>{y.ma ?? "—"}</b>
                    <Pill meta={pillMeta(KHO_YC_TT, y.trang_thai)} />
                  </span>
                  <span className="lsc-phu">
                    Đề nghị {soDv(y.so_luong_yeu_cau, y.don_vi)}, kho đã nhận {so(y.so_luong_xac_nhan)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lhs-o" aria-labelledby="lhs-gh-h">
        <h4 className="lhs-o__h" id="lhs-gh-h">
          Giao hàng
          {nhom > 1 && <span className="lsc-tag">Cả nhóm, {nhom} lệnh</span>}
        </h4>
        <div className="lhs-o__b">
          <p className="lhs-o__so">
            {gh.don_vi_lech ? (
              NHIEU_DON_VI
            ) : (
              <>
                Đã nhập kho <b>{so(gh.da_nhap_kho)}</b>, đã giao <b>{so(gh.da_giao)}</b>
              </>
            )}
          </p>
          {gh.hang.length === 0 ? (
            <Trong>
              {gh.nhom_id == null
                ? "Lệnh chưa vào nhóm thành phẩm nào nên chưa có gì trong kho để giao."
                : "Kho chưa nhận lô thành phẩm nào của nhóm này."}
            </Trong>
          ) : (
            <ul className="lhs-ds">
              {gh.hang.map((h) => (
                <li key={`${h.hang_id}-${h.kho_id ?? "x"}`}>
                  <span className="lhs-ds__luc">{h.kho_ten ?? "—"}</span>
                  <span className="lhs-ds__noi">
                    <span>
                      Tồn {soDv(h.so_luong, h.don_vi)}, còn giao được{" "}
                      {h.khong_tinh_duoc || h.so_toi_da == null ? "chưa tính được" : so(h.so_toi_da)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {chuaTinh.length > 0 && (
            <p className="lhs-canh" role="note">
              <Icon name="alert" size={13} /> Có dòng chưa tính được số còn giao: tự đối chiếu kho trước khi
              lập phiếu.
            </p>
          )}
          {gh.co_the_giao && choPhepLap && gh.order_id != null && onMoDon && (
            <Button variant="secondary" onClick={() => onMoDon(gh.order_id as number)}>
              <Icon name="truck" size={14} /> Tạo yêu cầu giao hàng
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
