// Phần "đối chiếu" của màn KCS (09/10/2026, `docs/design-kcs-ghi-loi-giua.md` §3b): quy cách chạy máy
// và tệp Kế hoạch SX đính kèm lệnh — CHỈ XEM. Dùng chung cho hộp Ghi lỗi công đoạn giữa và sơ đồ nhóm
// (nút "Tệp của lệnh" ở đầu, tab Quy cách của khung công đoạn). Thêm/xoá tệp vẫn ở hồ sơ lệnh của Kế
// hoạch SX; tệp đổi thì AppShell tăng `dinhKemDem` (sự kiện `lsx_dinh_kem_changed`) và nơi dùng nạp lại.
import { useEffect, useState } from "react";
import { ApiError, api, type SxQuyCachThe, type SxTepLenhNhom } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { MucInHang } from "../../components/MucIn";
import type { TepXem } from "../../components/tepDinhKem";
import { coChu } from "../../lib/anhNen";
import { ngayGio } from "../keHoachSxShared";
import { DongTep } from "../ThsxDongTep";
import { dongQuyCach } from "../ThsxQuyCach";
import "../ke-hoach-sx.css";
import "../thuc-hien-sx.css";

/** Tệp của cả nhóm thành phẩm chứa lệnh `lsxId` — `null` khi đang tải. `dinhKemDem` là bộ đếm theo
 *  lệnh của AppShell; chưa biết trước nhóm gồm lệnh nào nên tệp lệnh nào đổi cũng nạp lại (một GET nhỏ). */
export function useTepNhomKcs(lsxId: number, dinhKemDem?: Record<number, number>) {
  const { token } = useAuth();
  const nhip = Object.values(dinhKemDem ?? {}).reduce((a, b) => a + b, 0);
  const [nhom, setNhom] = useState<SxTepLenhNhom[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let bo = false;
    api.sanXuat.kcsTepNhom(token, lsxId)
      .then((r) => { if (!bo) { setNhom(r); setLoi(null); } })
      .catch((e) => { if (!bo) setLoi(e instanceof ApiError ? e.message : "Không tải được tệp của lệnh."); });
    return () => { bo = true; };
  }, [token, lsxId, nhip]);
  return { nhom, loi };
}

export const demTep = (nhom: SxTepLenhNhom[] | null) => (nhom ?? []).reduce((n, g) => n + g.items.length, 0);

/** Danh sách tệp theo lệnh — mỗi lệnh một nhãn nhỏ, lệnh chưa có tệp thì nói rõ nơi thêm. */
export function KcsTepLenh({
  nhom, loi, onXem,
}: { nhom: SxTepLenhNhom[] | null; loi?: string | null; onXem: (t: TepXem) => void }) {
  if (loi) return <p className="kdc-trong" role="alert">{loi}</p>;
  if (nhom == null) return <p className="kdc-trong">Đang tải tệp…</p>;
  if (nhom.length === 0) return <p className="kdc-trong">Lệnh chưa có tệp đính kèm.</p>;
  return (
    <div className="kdc-tep">
      {nhom.map((g) => (
        <div key={g.lsx_id}>
          <div className="kdc-tep__lenh">
            <span>{g.lsx_ma}</span>
            {g.lsx_ten && <span>{g.lsx_ten}</span>}
          </div>
          {g.items.length === 0 ? (
            <p className="kdc-trong">Lệnh chưa có tệp đính kèm. Kế hoạch SX thêm ở hồ sơ lệnh, thêm xong tự hiện ở đây.</p>
          ) : (
            <ul className="thsx-tep__ds kdc-tep__ds">
              {g.items.map((t) => (
                <DongTep key={t.id} onXem={onXem}
                  t={{ ten_tep: t.ten_tep, file_url: t.file_url, content_type: t.content_type }}
                  meta={(
                    <span className="kdc-tep__meta">
                      <span>{coChu(t.kich_thuoc)}</span>
                      {t.nguoi_tai_ten && <span>{t.nguoi_tai_ten}</span>}
                      <span>{ngayGio(t.tai_luc)}</span>
                    </span>
                  )} />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/** Quy cách chạy máy dạng bảng nhãn–chữ + khối Mực in của màn lệnh + dặn dò kỹ thuật của bước. */
export function KcsQuyCach({ qc, danDo }: { qc: SxQuyCachThe | null; danDo: string | null }) {
  const coMuc = Boolean(qc?.muc_a?.length || qc?.muc_b?.length);
  // Dặn dò chung của lệnh (trong quy cách) và dặn dò riêng của bước — trùng chữ thì nói một lần.
  const dando = [...new Set([danDo?.trim(), qc?.ghi_chu_ky_thuat?.trim()].filter(Boolean))] as string[];
  return (
    <div className="kdc-qc">
      {qc ? (
        <table className="kdc-qc__bang">
          <tbody>
            {dongQuyCach(qc).map(([k, nhan, chu]) => (
              <tr key={k}><td>{nhan}</td><td>{chu}</td></tr>
            ))}
          </tbody>
        </table>
      ) : <p className="kdc-trong">Lệnh phát hành trước khi có ảnh chụp quy cách, chưa có gì để đối chiếu.</p>}
      {qc && coMuc && (
        <div className="khsx-kv khsx-kv--span thsx-muc kdc-qc__muc">
          <span className="khsx-kv__key">Mực in</span>
          <MucInHang mucA={qc.muc_a ?? []} mucB={qc.muc_b ?? []}
            quyCachIn={qc.cach_in ?? (qc.muc_b?.length ? "hai_mat" : "mot_mat")} disabled onChange={() => {}} />
        </div>
      )}
      <div className="kdc-qc__dando">
        <span className="kdc-nhan">Dặn dò kỹ thuật</span>
        {dando.length > 0
          ? dando.map((d) => <p key={d}>{d}</p>)
          : <span className="kdc-mu4">Kế hoạch không ghi dặn dò cho công đoạn này.</span>}
      </div>
    </div>
  );
}
