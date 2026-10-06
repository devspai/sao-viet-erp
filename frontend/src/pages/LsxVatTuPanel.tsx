// Tab "Vật tư" của màn chi tiết lệnh — MỘT bảng vật tư, bước dùng là một cột.
//
// [06/10/2026] Trước đây bày theo chuỗi bước: mỗi bước một thẻ, bước có vật tư thì một bảng 1–2
// dòng lặp lại đầu cột, bước không có thì ba dòng chỉ để nói "không tiêu hao", rồi khối TỔNG GOM
// ở cuối nói lại cùng những món đó. Lệnh 6 bước 2 món phải cuộn qua 6 thẻ mới tới câu "cần gì".
// Nay theo lối tab Thành phần của Odoo: vật tư đứng đầu, một dòng một món (đã gom), ô "Dùng ở
// bước" nói nó ăn ở đâu và tính trên bao nhiêu. Chuỗi bước thu thành dải chip trên đầu bảng.
//
// Màn này CHỈ NÓI CẦN. Không tồn, không thiếu, không "phải mua" — ba thứ đó phải trừ tồn + hàng
// đang về + phần kho đã cấp, mà màn lệnh không biết và không nên biết. Hai chỗ cùng tính tồn thì
// sớm muộn lệch nhau, lúc lệch không biết tin bên nào.
import { Fragment } from "react";
import { Icon } from "../components/Icons";
import { num } from "./keHoachSxShared";
import { nhanDonVi } from "./lsxBuoc";
import { useNapTenDonVi } from "./tenDonVi";
import type { BangKeVatTu, BuocKe, NhomVatTu, TongKe } from "./lsxVatTu";

/** Nhãn tình trạng khuôn — cùng bộ mã với danh mục Khuôn. Mã lạ thì hiện mã trần, không nuốt. */
const TINH_TRANG: Record<string, string> = {
  dang_dung: "đang dùng",
  dang_dat_lam: "đang đặt làm",
  hong: "hỏng",
  thanh_ly: "đã thanh lý",
};

const NHOM: { ma: NhomVatTu; nhan: string }[] = [
  { ma: "nvl", nhan: "NVL chính" },
  { ma: "vat_tu", nhan: "Phụ liệu" },
  { ma: "dung_cu", nhan: "Dụng cụ / Khuôn" },
];

/** Một lần một món được ăn ở một bước — nuôi ô "Dùng ở bước". */
interface LanDung {
  buoc: BuocKe;
  so_luong: number | null;
}

/** Tìm các bước ăn món `t` bằng cách dò ngược `buocs[].dong` theo khoá (+ đơn vị, cùng luật gom
 *  của `gomTong`). Không dựa `t.buocs`: ở bài ghép khối tổng là bảng cân đối server, `buocs` rỗng,
 *  nhưng phần ăn ở bước CHUNG vẫn dò được từ thẻ bước. */
function lanDungCua(t: TongKe, buocs: BuocKe[]): LanDung[] {
  const ra: LanDung[] = [];
  for (const b of buocs) {
    const khop = b.dong.filter(
      (d) => d.khoa === t.khoa && (t.nhom === "dung_cu" || (d.don_vi ?? "") === (t.don_vi ?? "")),
    );
    if (khop.length === 0) continue;
    const sl = t.nhom === "dung_cu" ? null : khop.reduce((s, d) => s + (d.so_luong ?? 0), 0);
    ra.push({ buoc: b, so_luong: sl });
  }
  return ra;
}

function OBuoc({ t, buocs }: { t: TongKe; buocs: BuocKe[] }) {
  const lan = lanDungCua(t, buocs);
  const dv = t.don_vi ? nhanDonVi(t.don_vi) : "";
  // Phần tổng KHÔNG quy về bước nào trên màn này — ở bài ghép là vật tư bước riêng của từng lệnh
  // thành viên. Nói ra phần đó thay vì để người đọc cộng các dòng trên không ra tổng.
  const daQuy = lan.reduce((s, l) => s + (l.so_luong ?? 0), 0);
  const conLai = t.nhom === "dung_cu" || t.so_luong == null ? 0 : t.so_luong - daQuy;
  const nhieuDong = lan.length + (conLai > 1e-6 ? 1 : 0) > 1;

  return (
    <div className="khsx-vtbang__buocs">
      {lan.map((l) => (
        <div className="khsx-vtbang__lan" key={l.buoc.id}>
          <span className="khsx-vtbang__lan-ten">
            #{l.buoc.thu_tu} {l.buoc.ten}
          </span>
          {nhieuDong && l.so_luong != null && (
            <span className="khsx-vtbang__lan-sl">
              {num(l.so_luong)} {dv}
            </span>
          )}
          {t.nhom !== "dung_cu" && l.buoc.sl_vao > 0 && (
            <span className="khsx-vtbang__lan-co-so">
              tính trên {num(l.buoc.sl_vao)} {l.buoc.dv_vao}
            </span>
          )}
        </div>
      ))}
      {conLai > 1e-6 && (
        <div className="khsx-vtbang__lan">
          <span className="khsx-vtbang__lan-ten is-rieng">Bước riêng của từng lệnh</span>
          {nhieuDong && (
            <span className="khsx-vtbang__lan-sl">
              {num(conLai)} {dv}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function HangMon({ t, buocs }: { t: TongKe; buocs: BuocKe[] }) {
  const chu =
    t.nhom === "dung_cu" && t.chu_thich ? (TINH_TRANG[t.chu_thich] ?? t.chu_thich) : t.chu_thich;
  return (
    <tr>
      <td className="khsx-vtbang__ma">{t.ma || ""}</td>
      <td className="khsx-vtbang__ten">
        <span className="khsx-vtbang__ten-txt">{t.ten}</span>
        {chu && <span className="khsx-vtbang__sub">{chu}</span>}
      </td>
      <td className="khsx-vtbang__sl">{t.so_luong != null ? num(t.so_luong) : "—"}</td>
      <td className="khsx-vtbang__dv">{t.don_vi ? nhanDonVi(t.don_vi) : ""}</td>
      <td className="khsx-vtbang__buoc">
        <OBuoc t={t} buocs={buocs} />
      </td>
    </tr>
  );
}

/** `ke` tính SẴN ở màn cha (một lần cho cả ô tóm tắt trên đầu màn lẫn bảng này) — panel chỉ vẽ. */
export function LsxVatTuPanel({ ke }: { ke: BangKeVatTu }) {
  // Panel này mount từ HAI màn (Lệnh SX · Bài ghép 2) — tự nạp nhãn đơn vị thay vì trông chờ màn
  // cha, vì bên Bài ghép 2 không có ai nạp. Hook có cache chung nên gọi thêm không tốn lượt gọi.
  useNapTenDonVi();
  // Không có bước NÀO VÀ cũng chẳng có món nào ⇒ trống thật, mới báo trống. Ở bài ghép bước = bước
  // CHUNG có thể còn rỗng khi chưa gộp, nhưng khối tổng vẫn gồm vật tư bước riêng — vẫn phải hiện.
  if (ke.buocs.length === 0 && ke.tong.length === 0) {
    return <p className="khsx-muted">Lệnh chưa có công đoạn nào — khai công đoạn trước đã.</p>;
  }

  const thieuKhuon = ke.buocs.filter((b) => b.thieu_khuon);

  return (
    <div className="khsx-vtke">
      <div className="khsx-vtke__strip">
        <div className="khsx-vtke__strip-item">
          <span className="khsx-vtke__strip-lbl">Tổng nhu cầu</span>
          <span className="khsx-vtke__strip-val">
            <b>{ke.so_mon}</b> <small>món</small>
          </span>
        </div>
        {thieuKhuon.length > 0 && (
          <>
            <div className="khsx-vtke__strip-sep" aria-hidden="true" />
            <span className="khsx-vtke__strip-badge khsx-vtke__strip-badge--danger">
              <Icon name="alert" size={12} /> Thiếu khuôn bế
            </span>
            {thieuKhuon.map((b) => (
              <span className="khsx-vtke__strip-buoc" key={b.id}>
                #{b.thu_tu} {b.ten}
              </span>
            ))}
          </>
        )}
      </div>

      {ke.buocs.length > 0 && (
        <ol className="khsx-vtke__chuoi" aria-label="Chuỗi công đoạn">
          {ke.buocs.map((b, i) => (
            <li className="khsx-vtke__chuoi-o" key={b.id}>
              {i > 0 && (
                <span className="khsx-vtke__chuoi-mui" aria-hidden="true">
                  →
                </span>
              )}
              <span
                className={`khsx-vtke__chip${b.dong.length > 0 ? " is-co" : ""}${b.thieu_khuon ? " is-thieu" : ""}`}
                title={b.dong.length > 0 ? `${b.dong.length} món vật tư` : "Không dùng vật tư"}
              >
                #{b.thu_tu} {b.ten}
                {b.dong.length > 0 && <span className="khsx-vtke__chip-dem">{b.dong.length}</span>}
                {b.thieu_khuon && <Icon name="alert" size={11} />}
              </span>
            </li>
          ))}
        </ol>
      )}

      {ke.tong.length === 0 ? (
        <p className="khsx-muted">
          Chưa bước nào khai vật tư. Khai ở ô "Thêm vật tư" của từng bước trong tab Công đoạn.
        </p>
      ) : (
        <div className="khsx-vtbang__wrap">
          <table className="khsx-vtbang">
            <thead>
              <tr>
                <th className="khsx-vtbang__ma">Mã</th>
                <th className="khsx-vtbang__ten">Vật tư</th>
                <th className="khsx-vtbang__sl">Số lượng</th>
                <th className="khsx-vtbang__dv">ĐVT</th>
                <th className="khsx-vtbang__buoc">Dùng ở bước</th>
              </tr>
            </thead>
            <tbody>
              {NHOM.map(({ ma, nhan }) => {
                const dong = ke.tong.filter((t) => t.nhom === ma);
                if (dong.length === 0) return null;
                return (
                  <Fragment key={ma}>
                    <tr className="khsx-vtbang__nhom-r">
                      <td colSpan={5}>
                        {nhan} <span className="khsx-vtbang__nhom-dem">{dong.length}</span>
                      </td>
                    </tr>
                    {dong.map((t) => (
                      <HangMon t={t} buocs={ke.buocs} key={`${t.khoa}|${t.don_vi ?? ""}`} />
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="khsx-vtke__foot">
        <Icon name="alert" size={14} />
        <span>
          Đây là <b>tổng số cần</b> theo định mức kỹ thuật — Kiểm tra tồn kho, giữ chỗ và cấp phát
          tại <b>Kế hoạch vật tư</b>.
        </span>
      </div>
    </div>
  );
}
