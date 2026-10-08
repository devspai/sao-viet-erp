/** Ngăn tài khoản ngân hàng (đặc tả TK-2, khuôn A.5) — mở khi bấm thẻ, để XEM.
 *
 *  Đầu ngăn: "Tài khoản ngân hàng" — tiêu đề "MB 9331 3466 8" + pill — "Sửa" + "⋯" (Ngừng dùng / Dùng
 *  lại) cho người có quyền sửa — tóm tắt Thu trong kỳ | Chi trong kỳ | Số phiếu trong kỳ | Loại tiền
 *  (kỳ = kỳ đang chọn ở danh sách). Ba tab: Thông tin | Phiếu qua tài khoản (n) | Lịch sử (n).
 *
 *  Lịch sử: chưa có nhật ký theo đối tượng cho người không có quyền Nhật ký (`/api/audit` đòi quyền đó
 *  và không lọc theo tài khoản) — dựng từ `created_at` / `updated_at` / `is_active` của tài khoản,
 *  cùng cách tab Lịch sử của phiếu chi / phiếu thu.
 */
import { Pencil, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "../../../../auth/useAuth";
import type { NavigateFn } from "../../../../components/AppShell";
import type { KyXem } from "../../../../utils/ky";
import { BangRong } from "../../shared/BangPhieu";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, vietSo } from "../../shared/dinhDang";
import { NganPhai } from "../../shared/NganPhai";
import { Dong, MenuThaoTac, useTabNho } from "../../shared/NganPhieu";
import { TabLichSu, xepMoiNhat, type ViecLs } from "../../shared/TabLichSu";
import { nhomBon, soTienCoDau, tieuDeTaiKhoan } from "../shared/helpers";
import { usePhieuQuaTaiKhoan } from "../shared/phieuQuaTaiKhoan";
import type { SoLieuTk, TaiKhoan } from "../shared/types";

/** Dòng thời gian từ trường của tài khoản: lúc thêm, và lần thay đổi gần nhất nếu có (máy chủ chỉ
 *  giữ MỘT mốc `updated_at` — không biết đó là sửa hay ngừng/dùng lại, nên ghi trạng thái hiện tại). */
export function lichSuTaiKhoan(r: TaiKhoan): ViecLs[] {
  const viec: ViecLs[] = [
    {
      khoa: "them",
      moc: r.created_at,
      loai: "lap",
      ten: "Thêm tài khoản",
      chiTiet: (
        <Cum>
          <span>{r.bank_name}</span>
          <span>{nhomBon(r.account_number)}</span>
        </Cum>
      ),
      icon: <Plus size={14} aria-hidden="true" />,
    },
  ];
  if (r.updated_at && r.updated_at.slice(0, 19) !== r.created_at.slice(0, 19)) {
    viec.push({
      khoa: "doi",
      moc: r.updated_at,
      loai: "khac",
      ten: "Thay đổi gần nhất",
      chiTiet: (
        <Cum>
          <span>Trạng thái hiện tại</span>
          <TheNho>{r.is_active ? "Đang dùng" : "Ngừng dùng"}</TheNho>
        </Cum>
      ),
      icon: <Pencil size={14} aria-hidden="true" />,
    });
  }
  return xepMoiNhat(viec);
}

function TabPhieu({
  taiKhoan,
  ky,
  eventTick,
  quyen,
  navigate,
}: {
  taiKhoan: TaiKhoan;
  ky: KyXem;
  eventTick: number;
  quyen: { xemChi: boolean; xemThu: boolean };
  navigate: NavigateFn;
}) {
  const { token } = useAuth();
  const p = usePhieuQuaTaiKhoan({
    token, taiKhoanId: taiKhoan.id, ky, xemChi: quyen.xemChi, xemThu: quyen.xemThu, eventTick,
  });

  if (!quyen.xemChi && !quyen.xemThu) {
    return <p className="kt-mo">Cần quyền xem Phiếu chi hoặc Phiếu thu để xem phiếu qua tài khoản này.</p>;
  }
  const anMot = !quyen.xemChi
    ? "Không hiện phiếu chi vì bạn chưa có quyền xem Phiếu chi."
    : !quyen.xemThu
      ? "Không hiện phiếu thu vì bạn chưa có quyền xem Phiếu thu."
      : null;

  if (!p.daTai) {
    return (
      <BangRong loading={p.loi == null} loi={p.loi} coLoc={false} onTaiLai={p.reload} onBoLoc={() => undefined}
        chuTai="Đang tải phiếu qua tài khoản…" chuLoi="Không tải được phiếu qua tài khoản." chuChuaCo={null} />
    );
  }

  const moPhieu = (loai: "chi" | "thu", ma: string) =>
    loai === "chi"
      ? navigate("ke-toan-phieu-chi", { focusVoucherQuery: ma })
      : navigate("ke-toan-phieu-thu", { focusReceiptQuery: ma });

  return (
    <>
      {anMot && <p className="kt-mo">{anMot}</p>}
      {p.rows.length === 0 ? (
        <p className="kt-mo">Chưa có phiếu nào qua tài khoản này trong kỳ.</p>
      ) : (
        <div className="lds-bang">
          <table className="lds-g">
            <colgroup>
              <col style={{ width: 102 }} />
              <col style={{ width: 170 }} />
              <col />
              <col style={{ width: 140 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Mã phiếu</th>
                <th>Nội dung</th>
                <th className="n">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((d) => (
                <tr key={`${d.loai}-${d.id}`}>
                  <td>{ngay(d.ngay)}</td>
                  <td>
                    <button type="button" className="kt-lk" onClick={() => moPhieu(d.loai, d.ma)}>{d.ma}</button>
                  </td>
                  <td>{d.noiDung}</td>
                  <td className={d.loai === "thu" ? "n lds-la" : "n"}>{soTienCoDau(d.soTien, d.loai)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p.loi && (
        <p className="kt-o__loi" role="alert">{p.loi}</p>
      )}
      {p.rows.length > 0 && p.rows.length < p.tong && (
        <div className="kt-hang-loc">
          <span className="kt-mo">{`Hiện ${vietSo(p.rows.length)} trên ${vietSo(p.tong)} phiếu`}</span>
          <button type="button" className="kt-btn kt-btn--nho" disabled={p.dangTaiThem} onClick={p.xemThem}>
            {p.dangTaiThem ? "Đang tải…" : "Xem thêm"}
          </button>
        </div>
      )}
    </>
  );
}

export function NganTaiKhoan({
  taiKhoan,
  soLieu,
  ky,
  eventTick,
  coSua,
  quyen,
  navigate,
  len,
  xuong,
  onDong,
  onSua,
  onDoiTrangThai,
}: {
  taiKhoan: TaiKhoan;
  /** Thu/chi trong kỳ của tài khoản (đã điền 0); null = chưa tải được ⇒ "—". */
  soLieu: SoLieuTk | null;
  ky: KyXem;
  eventTick: number;
  /** Quyền sửa tài khoản (`tk_ngan_hang:update`) — Sửa, Ngừng dùng / Dùng lại. */
  coSua: boolean;
  /** Quyền xem từng sổ phiếu: không có thì không gọi sổ đó. */
  quyen: { xemChi: boolean; xemThu: boolean };
  navigate: NavigateFn;
  len?: () => void;
  xuong?: () => void;
  onDong: () => void;
  onSua: () => void;
  onDoiTrangThai: () => void;
}) {
  const [tab, setTab] = useTabNho("tai-khoan-ngan-hang");
  const lichSu = lichSuTaiKhoan(taiKhoan);
  const r = taiKhoan;

  const so = (n: number | undefined, loai: "thu" | "chi"): ReactNode =>
    n == null ? "—" : <span className={loai === "thu" && n ? "kt-lon kt-xanh" : "kt-lon"}>{`${soTienCoDau(n, loai)} đ`}</span>;

  return (
    <NganPhai
      duongDan="Tài khoản ngân hàng"
      tieuDe={tieuDeTaiKhoan(r)}
      the={<span className={`kt-tt ${r.is_active ? "kt-tt--xanh" : "kt-tt--xam"}`}>{r.is_active ? "Đang dùng" : "Ngừng dùng"}</span>}
      hanhDong={
        coSua ? (
          <>
            <button type="button" className="kt-btn" onClick={onSua}>
              <Pencil size={16} aria-hidden="true" />
              Sửa
            </button>
            <MenuThaoTac
              muc={[
                r.is_active
                  ? { nhan: "Ngừng dùng", phu: "Phiếu mới không chọn được tài khoản này", onChon: onDoiTrangThai }
                  : { nhan: "Dùng lại", phu: "Phiếu mới chọn lại được tài khoản này", onChon: onDoiTrangThai },
              ]}
            />
          </>
        ) : undefined
      }
      tomTat={[
        { nhan: "Thu trong kỳ", giaTri: so(soLieu?.thu, "thu") },
        { nhan: "Chi trong kỳ", giaTri: so(soLieu?.chi, "chi") },
        { nhan: "Số phiếu trong kỳ", giaTri: soLieu ? `${vietSo(soLieu.so_phieu)} phiếu` : "—" },
        { nhan: "Loại tiền", giaTri: r.currency },
      ]}
      tabs={[
        { id: "tt", nhan: "Thông tin" },
        // `so_phieu` đếm CẢ hai sổ; thiếu quyền một sổ thì số đó không khớp phần được xem ⇒ bỏ số.
        { id: "pg", nhan: "Phiếu qua tài khoản", dem: quyen.xemChi && quyen.xemThu ? soLieu?.so_phieu : undefined },
        { id: "ls", nhan: "Lịch sử", dem: lichSu.length },
      ]}
      tab={tab}
      onTab={setTab}
      len={len}
      xuong={xuong}
      onDong={onDong}
    >
      {tab === "pg" ? (
        <TabPhieu taiKhoan={r} ky={ky} eventTick={eventTick} quyen={quyen} navigate={navigate} />
      ) : tab === "ls" ? (
        <>
          <TabLichSu viec={lichSu} />
          <p className="kt-mo">
            Máy chủ chỉ giữ lúc thêm và lần thay đổi gần nhất của tài khoản. Từng lần sửa, ngừng dùng, dùng lại kèm
            người làm xem ở màn Nhật ký.
          </p>
        </>
      ) : (
        <div className="kt-hop">
          <div className="kt-hop__than">
            <dl className="kt-kv">
              <Dong nhan="Ngân hàng">{r.bank_name}</Dong>
              <Dong nhan="Chi nhánh">{r.bank_branch}</Dong>
              <Dong nhan="Chủ tài khoản">{r.account_holder}</Dong>
              <Dong nhan="Dùng để">
                {r.use_for_receipts || r.use_for_payments ? (
                  <Cum>
                    {r.use_for_receipts && <TheNho>Nhận tiền</TheNho>}
                    {r.use_for_payments && <TheNho>Trả tiền</TheNho>}
                  </Cum>
                ) : null}
              </Dong>
              <Dong nhan="Ghi chú">{r.note}</Dong>
            </dl>
          </div>
        </div>
      )}
    </NganPhai>
  );
}
