// Bước của lệnh và tuyến bước NGANG dùng chung của hai màn chỉ-xem (12/10/2026): ngăn đơn của Theo dõi
// sản xuất, ngăn lệnh và dòng bảng của Hồ sơ lệnh. Chấm xám đặc là xong, xanh lá là đang chạy, đỏ là
// dừng, viền cam là thuê ngoài, vòng to là bước hàng đang nằm. 13/10/2026 (ngăn hai cột): routing dọc
// cũ gỡ, thay bằng bảng Các bước (`ChamBuoc`) và tab Lịch sử (`LichSu`).
//
// Lớp CSS ở `lenh-sx-chung.css` (tiền tố `lsc-tuyen`, `lsa-`). Tệp nào dùng thì tự import CSS đó.
import type { LenhSxChang, LenhSxRoutingNode } from "../api/client";

/** MỘT bước của lệnh — khớp `BuocDonOut` (Theo dõi) và dựng được từ `RoutingNodeOut` (Hồ sơ). */
export interface BuocDoc {
  ten: string | null;
  to: string | null;
  ngoai: boolean;
  nha_cung_cap: string | null;
  /** `xong` · `chay` · `dung` · `cho`. */
  trang_thai: string;
  hien_tai: boolean;
  hoan_thanh_luc: string | null;
  kcs_khong_dat: number;
}

/** `2026-10-11T10:42:06` (giờ xưởng không nhãn múi) ⇒ `11/10`. Đọc thẳng thành phần ngày. */
export function ngayThang(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])}/${Number(m[2])}` : "";
}

/** Một bước "Gia công trọn gói" thay routing mẫu không ai ghi của lệnh trọn gói. */
export function buocTronGoi(nhaCungCap: string | null, xong: boolean): BuocDoc {
  return {
    ten: "Gia công trọn gói", to: null, ngoai: true, nha_cung_cap: nhaCungCap,
    trang_thai: xong ? "xong" : "chay", hien_tai: !xong, hoan_thanh_luc: null, kcs_khong_dat: 0,
  };
}

/** Trạng thái công việc (`released`/`running`/`paused`/`completed`) ⇒ chữ của tuyến bước. Cùng bảng
 *  với `theo_doi_don._TT_BUOC` phía máy chủ. */
const TT_CONG_VIEC: Record<string, string> = { completed: "xong", running: "chay", paused: "dung" };

/** Một nút routing của Hồ sơ lệnh ⇒ một bước của routing dọc. */
export function buocTuNode(n: LenhSxRoutingNode): BuocDoc {
  return {
    ten: n.ten,
    to: n.to,
    ngoai: n.loai_buoc === "thue_ngoai" || !!n.nha_cung_cap,
    nha_cung_cap: n.nha_cung_cap,
    trang_thai: (n.trang_thai && TT_CONG_VIEC[n.trang_thai]) || "cho",
    hien_tai: n.la_buoc_hien_tai,
    hoan_thanh_luc: n.hoan_thanh_luc,
    kcs_khong_dat: n.kcs_khong_dat ?? 0,
  };
}

/** Tuyến bước NGANG trong dòng bảng Hồ sơ lệnh: chấm nối nhau, tên ngắn ngay dưới chấm. Lệnh trọn
 *  gói chỉ có một chấm kèm tên nhà gia công. */
export function TuyenBuoc({
  chang,
  tronGoi,
  nhaGiaCong,
  xong,
}: {
  chang: LenhSxChang[];
  tronGoi?: boolean;
  nhaGiaCong?: string | null;
  /** Lệnh trọn gói đã qua khâu sản xuất ⇒ chấm xám đặc thay vòng "đang ở". */
  xong?: boolean;
}) {
  if (tronGoi) {
    return (
      <span className="lsc-tuyen lsc-tuyen--mot" role="img" aria-label={`Gia công trọn gói ${nhaGiaCong ?? ""}${xong ? " đã xong" : ""}`}>
        <span className={`lsc-tuyen__s is-ngoai ${xong ? "is-xong" : "is-chay is-o"}`}>
          <i aria-hidden="true" />
          <em>{nhaGiaCong ? `Gia công trọn gói ở ${nhaGiaCong}` : "Gia công trọn gói"}</em>
        </span>
      </span>
    );
  }
  if (chang.length === 0) return <span className="lds-mu3">Chưa có bước</span>;
  return (
    <span className="lsc-tuyen" role="img"
      aria-label={chang.map((c) => `${c.ten} ${c.trang_thai === "xong" ? "xong" : c.trang_thai === "chay" ? "đang chạy" : c.trang_thai === "dung" ? "tạm dừng" : "chưa tới"}`).join("; ")}>
      {chang.map((c, k) => (
        <span
          key={k}
          className={[
            "lsc-tuyen__s",
            `is-${c.trang_thai}`,
            c.ngoai ? "is-ngoai" : "",
            c.hien_tai && c.trang_thai !== "xong" ? "is-o" : "",
            c.kcs_loi ? "is-loi" : "",
          ].filter(Boolean).join(" ")}
          title={c.ten}
        >
          <i aria-hidden="true" />
          <em>{c.ten}</em>
        </span>
      ))}
    </span>
  );
}

// --- Ngăn hai cột (phương án A, 13/10/2026) — phần chung của ngăn lệnh và ngăn đơn ----------------

const VN_TZ = "Asia/Ho_Chi_Minh";

/** Mốc ⇒ thành phần giờ xưởng. Chuỗi không nhãn múi (`hoan_thanh_luc`, `du_kien_*`) đã là giờ xưởng
 *  ⇒ đọc thẳng; chuỗi có `Z`/`+hh:mm` (nhật ký, kho) là UTC thật ⇒ quy về Asia/Ho_Chi_Minh. */
function phanGio(iso: string | null | undefined): { y: number; m: number; d: number; h: string; p: string } | null {
  if (!iso) return null;
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) {
    const k = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
    return k ? { y: +k[1], m: +k[2], d: +k[3], h: k[4] ?? "00", p: k[5] ?? "00" } : null;
  }
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const x = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: VN_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(t).map((q) => [q.type, q.value]),
  );
  return { y: +x.year, m: +x.month, d: +x.day, h: x.hour === "24" ? "00" : x.hour, p: x.minute };
}

/** `11/10 14:22` — giờ xưởng, nhận cả chuỗi không nhãn múi lẫn UTC. */
export function gioNgan(iso: string | null | undefined): string {
  const g = phanGio(iso);
  return g ? `${g.d}/${g.m} ${g.h}:${g.p}` : "";
}

const THU = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

/** MỘT dòng của tab Lịch sử. `mau` tô chấm: `do` lỗi/sự cố, `la` hàng tới tay, `cam` thuê ngoài. */
export interface DongLichSu {
  luc: string;
  noi_dung: string;
  /** Dòng phụ mờ — mảng thì mỗi mẩu một dòng (không nối bằng dấu). */
  phu?: string | string[] | null;
  the?: string | null;
  mau?: "do" | "la" | "cam" | null;
}

/** Nhật ký chia theo NGÀY (giờ xưởng), mới nhất lên đầu; giờ bên trái, chấm, nội dung. Truyền đã sắp. */
export function LichSu({ dong, rong }: { dong: DongLichSu[]; rong?: string }) {
  if (dong.length === 0) return <p className="lsa-mu">{rong ?? "Chưa có việc nào."}</p>;
  const ra: { khoa: string; nhan: string; ds: (DongLichSu & { gio: string })[] }[] = [];
  for (const e of dong) {
    const g = phanGio(e.luc);
    if (!g) continue;
    const khoa = `${g.y}-${g.m}-${g.d}`;
    if (ra[ra.length - 1]?.khoa !== khoa) {
      ra.push({ khoa, nhan: `${THU[new Date(g.y, g.m - 1, g.d).getDay()]} ${g.d}/${g.m}`, ds: [] });
    }
    ra[ra.length - 1].ds.push({ ...e, gio: `${g.h}:${g.p}` });
  }
  return (
    <div className="lsa-tl">
      {ra.map((n) => (
        <section key={n.khoa} aria-label={n.nhan}>
          <h4 className="lsa-tl__ngay">{n.nhan}</h4>
          <ol>
            {n.ds.map((e, i) => (
              <li key={i}>
                <span className="lsa-tl__gio">{e.gio}</span>
                <i className={`lsa-tl__ch${e.mau ? ` is-${e.mau}` : ""}`} aria-hidden="true" />
                <div className="lsa-tl__nd">
                  {e.the && <span className="lsa-tl__the">{e.the}</span>}
                  {e.noi_dung}
                  {(Array.isArray(e.phu) ? e.phu : e.phu ? [e.phu] : []).map((x, k) => (
                    <small key={k}>{x}</small>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Chấm trạng thái MỘT bước ở cột đầu bảng Các bước — cùng màu với tuyến bước `lsc-tuyen`. */
export function ChamBuoc({ b }: { b: BuocDoc }) {
  const lop = [
    "lsa-cham",
    `is-${b.trang_thai}`,
    b.ngoai ? "is-ngoai" : "",
    b.hien_tai ? "is-o" : "",
    b.kcs_khong_dat > 0 ? "is-loi" : "",
  ].filter(Boolean).join(" ");
  return <i className={lop} aria-hidden="true" />;
}
