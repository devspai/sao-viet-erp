// Ngăn "Kiểm hàng" ở công đoạn CUỐI của lệnh (KCS theo lệnh, mg 0306). Từ 11/10/2026 dựng theo khuôn
// hộp Ghi lỗi công đoạn giữa (`KcsGhiLoiGiua`) và đi cùng logic của nó:
//   1. Tiêu chí gộp cả chuỗi (kể cả lệnh phụ cùng nhóm), chia nhóm theo lệnh → công đoạn. Tên lệnh
//      phụ nói một lần ở đầu nhóm. Cuối danh sách là "Lỗi khác, không có trong danh sách".
//   2. Tiêu chí không đạt thì tick → ô Số lỗi tự đặt con trỏ, ghi chú (không bắt buộc) và ảnh mở ra.
//      KHÔNG tick = đạt — bỏ hẳn bước bấm "Đạt / Có lỗi" từng công đoạn (chủ chốt 11/10/2026).
//      Lỗi khác: ghi chú bắt buộc, chọn được công đoạn gây lỗi.
//   3. Ảnh vẫn bắt buộc ở mọi dòng lỗi bước cuối (09/10/2026).
//   4. Đối chiếu (chỉ xem) bên phải: Quy cách | Tổ đã ghi | Tệp của lệnh; ngăn hẹp đổi thành tab.
//   5. Thanh đáy: lần này kiểm bao nhiêu, đạt, lỗi, MỘT lý do chưa lưu được, nút Lưu.
// Mỗi lần kiểm bao TRỌN phần tổ đã làm mà chưa kiểm: đạt = phần đó − tổng lỗi (máy chủ tính lại cùng
// công thức). Mỗi dòng tick là một dòng lỗi gửi kèm `thu_tu` + công đoạn chịu; máy chủ ghép mô tả
// "Tên tiêu chí: ghi chú", cất số theo tiêu chí và báo về tổ của công đoạn chịu. Lần kiểm đã ghi KHÔNG
// sửa được — ghi sai thì ghi lần mới.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApiError, api,
  type SxKcsCongDoan, type SxKcsKiemKetQua, type SxKcsLenhDau, type SxKcsMe,
} from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { XemTruoc } from "../../components/DinhKemTep";
import { Icon } from "../../components/Icons";
import { ChipTT } from "../../components/LuoiDs";
import type { TepXem } from "../../components/tepDinhKem";
import { nenAnh } from "../../lib/anhNen";
import { NganPhai, useDongNgan } from "../ke-toan/shared/NganPhai";
import { gioNgan, ngay, num } from "../keHoachSxShared";
import { nhanChangLenh } from "../lsxBuoc";
import { useNapTenDonVi } from "../tenDonVi";
import { KcsQuyCach, KcsTepLenh, demTep, useTepNhomKcs } from "./KcsDoiChieu";
import { KcsLanKiemList } from "./KcsLanKiemList";
import { CHIP_CONG_DOAN } from "./kcsSoDo";
import {
  type AnhCho, type DongKiem, KHAC, TOI_DA_ANH_MOI_LAN, gomThe, ketQuaChecklist, khoaTc, lyDoKiem,
  nhomTheoLenh, tenTieuChi,
} from "./theCongDoan";
import "../ke-toan/ke-toan.css";
import "../thuc-hien-sx.css";
import "./kcs-ghi-loi.css";
import "./kcs-kiem-form.css";

const LOI_QUA_SO_ANH = `Tối đa ${TOI_DA_ANH_MOI_LAN} ảnh mỗi lần kiểm.`;
const ME_HIEN = 5;
const LAN_KIEM_HIEN = 3;
const EPS = 1e-9;

/** Tab của khung Đối chiếu bên phải. */
type TabDoiChieu = "qc" | "me" | "tep";

/** Lần ghi sản lượng kèm phần CHƯA KIỂM của nó. Mỗi lần kiểm bao trọn phần chưa kiểm lúc đó, nên
 *  phần chưa kiểm luôn là các lần ghi MỚI NHẤT — đi từ lần mới nhất trừ dần. */
interface MeKiem extends SxKcsMe {
  chua: number;
  tt: "chua" | "mot_phan" | "da";
}

function meChuaKiem(me: SxKcsMe[], chuaKiem: number): MeKiem[] {
  let con = chuaKiem;
  return me.map((m) => {
    const chua = Math.max(0, Math.min(con, m.so_luong));
    con -= chua;
    const tt = chua <= EPS ? "da" : chua >= m.so_luong - EPS ? "chua" : "mot_phan";
    return { ...m, chua, tt };
  });
}

function khoangGio(m: SxKcsMe): string {
  const kt = gioNgan(m.ket_thuc);
  return m.bat_dau ? `${gioNgan(m.bat_dau)}–${kt}` : kt;
}

function tenCongDoan(c: SxKcsCongDoan): string {
  return c.phan_doan_tong > 1 ? `${c.ten} (${c.phan_doan_so}/${c.phan_doan_tong})` : c.ten;
}

/** Ô số lỗi: chỉ chữ số và một dấu thập phân (phẩy gõ theo thói quen Việt đổi thành chấm). */
function chuanSo(v: string): string {
  const s = v.replace(",", ".").replace(/[^\d.]/g, "");
  const i = s.indexOf(".");
  return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
}

/** Huỷ ở thanh đáy đi cùng đường với Esc / nút ×: đang tick dở thì hỏi trước khi bỏ. */
function NutHuy({ disabled }: { disabled: boolean }) {
  const dong = useDongNgan();
  return <button type="button" className="btn btn--ghost" onClick={dong} disabled={disabled}>Huỷ</button>;
}

export function KcsKiemForm({
  lenh, cd, dinhKemDem, onClose, onSaved,
}: {
  lenh: SxKcsLenhDau;
  cd: SxKcsCongDoan;
  /** Bộ đếm sự kiện tệp lệnh đổi (AppShell) — đổi là nạp lại tab Tệp của lệnh. */
  dinhKemDem?: Record<number, number>;
  onClose: () => void;
  onSaved: (r: SxKcsKiemKetQua) => void;
}) {
  const { token } = useAuth();
  // `don_vi` của công đoạn/lần ghi là mã CHẶNG dòng giấy (`to` = tờ in) — màn KCS không tự nạp nhãn.
  useNapTenDonVi();
  const dv = nhanChangLenh(cd.don_vi, lenh.don_vi_tinh);
  const tenCd = tenCongDoan(cd);
  const the = useMemo(() => gomThe(cd.checklist, cd.cong_viec_id, tenCd), [cd.checklist, cd.cong_viec_id, tenCd]);
  const nhom = useMemo(() => nhomTheoLenh(the), [the]);
  const tep = useTepNhomKcs(lenh.id, dinhKemDem);
  const tepLenh = tep.nhom?.filter((g) => g.lsx_id === lenh.id) ?? null;
  const soTep = demTep(tepLenh);

  // Công đoạn nhận được lỗi ở dòng Lỗi khác — danh sách máy chủ trả (chuỗi gộp, kể cả lệnh phụ).
  const nguonLoi = (cd.nguon_loi?.length ? cd.nguon_loi : [{ cong_viec_id: cd.cong_viec_id, ten: tenCd, to_ten: cd.to_ten, lsx_ma: lenh.ma }])
    .map((n) => ({
      cong_viec_id: n.cong_viec_id,
      nhan: n.lsx_ma && n.lsx_ma !== lenh.ma ? `${n.ten} (lệnh ${n.lsx_ma})` : n.ten,
      to_ten: n.to_ten,
    }));

  const [dong, setDong] = useState<Map<string, DongKiem>>(new Map());
  const [mo, setMo] = useState<string | null>(null);
  const [tab, setTab] = useState<"ghi" | "doi">("ghi");
  const [dc, setDc] = useState<TabDoiChieu>("qc");
  const [ghiChu, setGhiChu] = useState("");
  const [moHetMe, setMoHetMe] = useState(false);
  const [moHetLk, setMoHetLk] = useState(false);
  const [dangNen, setDangNen] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xem, setXem] = useState<TepXem | null>(null);

  // Tick xong thì con trỏ nhảy vào ô Số lỗi của dòng đó — đặt SAU khi dòng mở ra (ô mới có trong DOM).
  const [datConTro, setDatConTro] = useState<string | null>(null);
  const oSo = useRef(new Map<string, HTMLInputElement>());
  useEffect(() => {
    if (datConTro == null) return;
    oSo.current.get(datConTro)?.focus();
    setDatConTro(null);
  }, [datConTro]);

  const chupRef = useRef<HTMLInputElement>(null);
  const chonRef = useRef<HTMLInputElement>(null);
  const dichAnh = useRef<string>(KHAC);
  const idAnh = useRef(0);
  // URL `blob:` không tự mất khi ngăn đóng — dọn tay; ref để bản dọn lúc unmount thấy danh sách mới nhất.
  const anhRef = useRef<AnhCho[]>([]);
  useEffect(() => { anhRef.current = [...dong.values()].flatMap((d) => d.anh); }, [dong]);
  useEffect(() => () => { for (const a of anhRef.current) URL.revokeObjectURL(a.url); }, []);

  function sua(k: string, f: (d: DongKiem) => DongKiem) {
    setDong((m) => {
      const d = m.get(k);
      return d ? new Map(m).set(k, f(d)) : m;
    });
    setError(null);
  }
  function tick(k: string, cvId: number, bat: boolean) {
    if (bat) {
      setDong((m) => new Map(m).set(k, { cvId, so: "", ghi: "", anh: [] }));
      setMo(k);
      setDatConTro(k);
    } else {
      for (const a of dong.get(k)?.anh ?? []) URL.revokeObjectURL(a.url);
      setDong((m) => { const n = new Map(m); n.delete(k); return n; });
      if (mo === k) setMo(null);
    }
    setError(null);
  }
  function bamTen(k: string, cvId: number) {
    if (!dong.has(k)) tick(k, cvId, true);
    else setMo((x) => (x === k ? null : k));
  }

  // Tên + thứ tự của mọi dòng tick được, đúng thứ tự trên màn.
  const thuTuDong = useMemo(() => [
    ...the.flatMap((t) => t.tieuChi.map((tc) => ({ khoa: khoaTc(t.cvId, tc.thu_tu), ten: tenTieuChi(tc), thuTu: tc.thu_tu as number | null }))),
    { khoa: KHAC, ten: "Lỗi khác", thuTu: null as number | null },
  ], [the]);
  const dangTick = thuTuDong.flatMap((x) => {
    const d = dong.get(x.khoa);
    return d ? [{ ...x, d }] : [];
  });
  const soAnh = dangTick.reduce((n, { d }) => n + d.anh.length, 0);
  const duSoAnh = soAnh >= TOI_DA_ANH_MOI_LAN;
  const tongLoi = dangTick.reduce((s, { d }) => s + (Number(d.so) > 0 ? Number(d.so) : 0), 0);
  const chuaKiem = Math.max(0, cd.tot - cd.tong_dat - cd.tong_loi);
  const datLanNay = Math.max(0, chuaKiem - tongLoi);
  const keHoach = cd.so_luong_ra ?? null;
  const lyDo = lyDoKiem(dangTick, { chuaKiem, dv });

  // Số đã ghi theo tiêu chí ở các lần kiểm trước (dữ liệu trước 11/10 không có số theo tiêu chí).
  const daGhi = useMemo(() => {
    const m = new Map<string, number>();
    for (const lk of cd.lan_kiem ?? []) for (const k of lk.checklist) {
      if (k.dat || !(Number(k.so_luong) > 0)) continue;
      const kh = khoaTc(k.cong_viec_id ?? cd.cong_viec_id, k.thu_tu);
      m.set(kh, (m.get(kh) ?? 0) + Number(k.so_luong));
    }
    return m;
  }, [cd.lan_kiem, cd.cong_viec_id]);

  async function themAnh(input: HTMLInputElement) {
    const k = dichAnh.current;
    const ds = Array.from(input.files ?? []);
    // Xoá giá trị ô chọn: không thì chọn lại đúng tấm vừa bỏ, trình duyệt không bắn `change`.
    input.value = "";
    setError(null);
    let conDuoc = TOI_DA_ANH_MOI_LAN - soAnh;
    for (const f of ds) {
      if (conDuoc <= 0) { setError(LOI_QUA_SO_ANH); break; }
      if (!f.type.startsWith("image/")) { setError(`"${f.name}" không phải ảnh.`); continue; }
      // Ảnh điện thoại 4–8 MB/tấm: nén ngay khi thêm để lúc Lưu không phải đẩy vài chục MB qua wifi xưởng.
      setDangNen((n) => n + 1);
      const kq = await nenAnh(f);
      setDangNen((n) => n - 1);
      conDuoc -= 1;
      const moi = { id: ++idAnh.current, file: kq.file, url: URL.createObjectURL(kq.file), goc: kq.goc };
      // Nén xong mà dòng đã bỏ tick thì vứt ảnh, không gắn vào dòng đã xoá.
      setDong((m) => {
        const d = m.get(k);
        if (!d) { URL.revokeObjectURL(moi.url); return m; }
        return new Map(m).set(k, { ...d, anh: [...d.anh, moi] });
      });
    }
  }
  function moChonAnh(k: string, o: HTMLInputElement | null) {
    dichAnh.current = k;
    o?.click();
  }
  function boAnh(k: string, id: number) {
    const a = dong.get(k)?.anh.find((x) => x.id === id);
    if (a) URL.revokeObjectURL(a.url);
    sua(k, (d) => ({ ...d, anh: d.anh.filter((x) => x.id !== id) }));
  }

  async function luu() {
    if (!token || saving || dangNen > 0 || lyDo) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.sanXuat.kiemCongDoan(token, cd.cong_viec_id, {
        so_loi: tongLoi,
        checklist: ketQuaChecklist(the, new Set(dangTick.map((x) => x.khoa))),
        ghi_chu: ghiChu.trim() || null,
        lsx_id: lenh.id,
        loi: dangTick.map(({ thuTu, d }) => ({
          cong_viec_id: d.cvId === cd.cong_viec_id ? null : d.cvId,
          thu_tu: thuTu,
          so_luong: Number(d.so),
          mo_ta: d.ghi.trim(),
          files: d.anh.map((a) => a.file),
        })),
      });
      onSaved(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không lưu được kết quả kiểm.");
      setSaving(false);
    }
  }

  /** Một dòng tick: tiêu chí (cvId cố định) hoặc Lỗi khác (chọn công đoạn gây lỗi). */
  function dongTick(k: string, ten: string, cvMacDinh: number) {
    const d = dong.get(k);
    const khac = k === KHAC;
    const dangMo = d != null && mo === k;
    const truoc = daGhi.get(k) ?? 0;
    return (
      <div key={k} className={`kgl-dong${khac ? " kgl-dong--khac" : ""}`}>
        <div className="kgl-dong__h">
          <input type="checkbox" checked={d != null} aria-label={ten}
            onChange={(e) => tick(k, cvMacDinh, e.currentTarget.checked)} />
          <button type="button" className="kgl-dong__ten" onClick={() => bamTen(k, cvMacDinh)}>
            {khac ? "Lỗi khác, không có trong danh sách" : ten}
            {truoc > 0 && <span className="kgl-dong__ls">lần trước đã ghi {num(truoc)} {dv}</span>}
          </button>
        </div>
        {d && dangMo ? (
          <div className="kgl-dong__than">
            <label>
              <span className="kgl-nhan">Số lỗi</span>
              <span className="kgl-o-so">
                <input ref={(el) => { if (el) oSo.current.set(k, el); else oSo.current.delete(k); }}
                  inputMode="decimal" value={d.so} aria-label={`Số lỗi ${ten}`}
                  onChange={(e) => { const v = chuanSo(e.currentTarget.value); sua(k, (x) => ({ ...x, so: v })); }} />
                <span>{dv}</span>
              </span>
            </label>
            <label>
              <span className="kgl-nhan">Ghi chú <i>{khac ? "bắt buộc, ghi lỗi gì" : "không bắt buộc"}</i></span>
              <input className="kgl-o" value={d.ghi} aria-label={`Ghi chú ${ten}`}
                placeholder={khac ? "Ví dụ: rách gáy khi vào keo" : "Ví dụ: góc phải"}
                onChange={(e) => { const v = e.currentTarget.value; sua(k, (x) => ({ ...x, ghi: v })); }} />
            </label>
            {khac && nguonLoi.length > 1 && (
              <label className="kkf2-nguon">
                <span className="kgl-nhan">Lỗi do công đoạn nào</span>
                <select className="kgl-o" value={d.cvId} aria-label="Lỗi do công đoạn nào"
                  onChange={(e) => { const v = Number(e.currentTarget.value); sua(k, (x) => ({ ...x, cvId: v })); }}>
                  {nguonLoi.map((c) => (
                    <option key={c.cong_viec_id} value={c.cong_viec_id}>
                      {c.nhan}{c.to_ten ? ` — ${c.to_ten}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="kgl-dong__anh">
              <span className="kgl-nhan">Ảnh <i>ít nhất 1</i></span>
              {d.anh.map((a) => (
                <span key={a.id} className="kgl-anh">
                  <button type="button" className="kgl-anh__xem" title={`Xem ${a.file.name}`}
                    onClick={() => setXem({ ten_tep: a.file.name, file_url: a.url, content_type: a.file.type })}>
                    <img src={a.url} alt={a.file.name} />
                  </button>
                  <button type="button" className="kgl-anh__bo" aria-label={`Bỏ ảnh ${a.file.name}`} title="Bỏ ảnh"
                    onClick={() => boAnh(k, a.id)}>×</button>
                </span>
              ))}
              <button type="button" className="btn btn--ghost btn--sm" disabled={duSoAnh}
                title={duSoAnh ? LOI_QUA_SO_ANH : undefined} onClick={() => moChonAnh(k, chupRef.current)}>
                <Icon name="camera" size={13} /> Chụp ảnh
              </button>
              <button type="button" className="btn btn--ghost btn--sm kgl-chon-anh" disabled={duSoAnh}
                title={duSoAnh ? LOI_QUA_SO_ANH : undefined} onClick={() => moChonAnh(k, chonRef.current)}>
                <Icon name="upload" size={13} /> Chọn ảnh
              </button>
              {dangNen > 0 && dichAnh.current === k && <span className="kgl-mu">đang xử lý ảnh…</span>}
              <span className="kgl-gian" />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMo(null)}>Xong</button>
            </div>
          </div>
        ) : d && (
          <div className="kgl-dong__tom">
            {Number(d.so) > 0
              ? <span className="kt-tag">{num(Number(d.so))} {dv}</span>
              : <span className="kt-tag kt-tag--do">chưa nhập số</span>}
            {d.anh.length > 0
              ? <span className="kt-tag">{d.anh.length} ảnh</span>
              : <span className="kt-tag kt-tag--do">chưa có ảnh</span>}
            {khac && d.cvId !== cd.cong_viec_id && (
              <span className="kt-tag">{nguonLoi.find((c) => c.cong_viec_id === d.cvId)?.nhan}</span>
            )}
            {d.ghi.trim() && <span className="kt-tag kgl-tag-ghi" title={d.ghi.trim()}>{d.ghi.trim()}</span>}
            <button type="button" className="kgl-lk" onClick={() => { setMo(k); setDatConTro(k); }}>Sửa</button>
          </div>
        )}
      </div>
    );
  }

  // Lần ghi sản lượng của tổ (Đối chiếu) — mới nhất trước.
  const me = useMemo(() => meChuaKiem(cd.me ?? [], chuaKiem), [cd.me, chuaKiem]);
  const meHien = moHetMe ? me : me.slice(0, ME_HIEN);
  const bangMe = me.length === 0 ? <p className="kdc-trong">Tổ chưa ghi sản lượng lần nào.</p> : (
    <>
      <ul className="kkf-me">
        {meHien.map((m, i) => (
          <li key={m.id} className={`kkf-me__it kkf-me__it--${m.tt}`}>
            <div className="kkf-me__gio">
              <b>{khoangGio(m)}</b>
              <span>{ngay(m.ket_thuc ?? m.bat_dau)}</span>
            </div>
            <div className="kkf-me__giua">
              <span className="kkf-me__viec">Sản lượng lần {me.length - i}</span>
              <span className="kkf-me__nguoi">
                {m.nguoi.length > 0 ? m.nguoi.join(", ") : "Chưa ghi người làm"}
                {m.nguoi_ghi && <span className="kkf-me__ghi"> ghi: {m.nguoi_ghi}</span>}
              </span>
            </div>
            <div className="kkf-me__phai">
              <span className="kkf-me__sl">{num(m.so_luong)}<small>{nhanChangLenh(m.don_vi ?? cd.don_vi, lenh.don_vi_tinh)}</small></span>
              <span className={`kkf-me__tt kkf-me__tt--${m.tt}`}>
                {m.tt === "da" ? "Đã kiểm" : m.tt === "chua" ? "Chưa kiểm" : `Còn ${num(m.chua)} chưa kiểm`}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {me.length > ME_HIEN && (
        <button type="button" className="kgl-lk kgl-them" onClick={() => setMoHetMe((v) => !v)}>
          {moHetMe ? "Thu gọn" : `Xem thêm ${me.length - ME_HIEN} lần ghi cũ hơn`}
        </button>
      )}
    </>
  );
  const tabDc: { id: TabDoiChieu; nhan: string; dem?: number }[] = [
    { id: "qc", nhan: "Quy cách" },
    { id: "me", nhan: "Tổ đã ghi", dem: me.length },
    { id: "tep", nhan: "Tệp của lệnh", dem: tep.nhom ? soTep : undefined },
  ];
  const khoiDc = dc === "qc" ? <KcsQuyCach qc={cd.quy_cach} danDo={cd.ghi_chu_ky_thuat} />
    : dc === "me" ? bangMe
      : <KcsTepLenh nhom={tepLenh} loi={tep.loi} onXem={setXem} />;

  const lanKiem = cd.lan_kiem ?? [];
  const lkHien = moHetLk ? lanKiem : lanKiem.slice(0, LAN_KIEM_HIEN);
  const chip = CHIP_CONG_DOAN[cd.trang_thai];
  const coNhieuLenh = nhom.length > 1;
  const moGhi = chuaKiem > 0;

  return (
    <NganPhai
      tieuDe={`Kiểm hàng ${tenCd}`}
      phuDe={(
        <>
          <span className="kt-tag">{lenh.ma}</span>
          {lenh.ten && <span className="kgl-to">{lenh.ten}</span>}
          {cd.to_ten && <span className="kgl-to">{cd.to_ten}</span>}
          {cd.may && <span className="kgl-to">{cd.may}</span>}
          {chip && <ChipTT mau={chip.mau}>{chip.nhan}</ChipTT>}
        </>
      )}
      canhBao={(
        <div className="kgl-so">
          <span>{cd.gia_cong_ngoai ? "Nhà gia công trả về" : "Tổ đã làm"}<b>{num(cd.tot)}{keHoach != null ? ` / ${num(keHoach)}` : ""} {dv}</b></span>
          <span>Chưa kiểm<b>{num(chuaKiem)} {dv}</b></span>
        </div>
      )}
      onDong={onClose}
      chanDong={() => !saving && (dong.size > 0 || ghiChu.trim() !== "")}
      cauHoiBo="Bỏ kết quả đang kiểm?"
      chan={(
        <div className="kgl-day">
          <span className="kgl-day__tong">Lần này kiểm<b>{num(chuaKiem)} {dv}</b></span>
          <span className="kt-tag">Đạt <b>{num(datLanNay)}</b></span>
          <span className={`kt-tag${tongLoi > 0 ? " kt-tag--do" : ""}`}>Lỗi <b>{num(tongLoi)}</b></span>
          <span className={`kgl-day__ly${lyDo || error ? "" : " is-ok"}`} role="status">
            {error ?? lyDo ?? (tongLoi > 0
              ? "Lưu được. Lỗi báo ngay về tổ làm công đoạn"
              : "Lưu được. Không tick tiêu chí nào là tất cả đạt")}
          </span>
          <NutHuy disabled={saving} />
          <button type="button" className="btn btn--accent kgl-day__luu" onClick={luu}
            disabled={saving || dangNen > 0 || lyDo != null}>
            {saving ? "Đang lưu…" : dangNen > 0 ? "Đang xử lý ảnh…" : "Lưu kết quả kiểm"}
          </button>
        </div>
      )}
    >
      <div className="kgl" data-tab={tab}>
        {/* Chỉ hiện khi ngăn hẹp (điện thoại) — máy tính thấy cả hai cột, không cần tab. */}
        <div className="kgl-tabdt" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "ghi"} className={tab === "ghi" ? "on" : undefined}
            onClick={() => setTab("ghi")}>Kiểm</button>
          {tabDc.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === "doi" && dc === t.id}
              className={tab === "doi" && dc === t.id ? "on" : undefined}
              onClick={() => { setTab("doi"); setDc(t.id); }}>
              {t.nhan}{t.dem != null && <span className="kgl-dem">{t.dem}</span>}
            </button>
          ))}
        </div>

        <div className="kgl-trai">
          <section className="kgl-khoi" aria-label="Tiêu chí không đạt">
            <div className="kgl-khoi__h">Tick tiêu chí không đạt<span className="kgl-mu">Tiêu chí đạt thì để trống.</span></div>
            {!moGhi ? (
              <p className="kgl-trong">Tổ chưa ghi thêm sản lượng từ lần kiểm trước, chưa có gì để kiểm.</p>
            ) : (
              <>
                {the.length === 0 && (
                  <p className="kgl-trong">
                    Lệnh không giữ tiêu chí nào. Không có lỗi thì lưu là tất cả đạt; có lỗi thì ghi ở dòng Lỗi khác.
                  </p>
                )}
                {nhom.map((n) => (
                  <div key={n.khoa} className="kkf2-lenh">
                    {coNhieuLenh && (
                      <div className="kkf2-lenh__h">
                        {n.laPhu ? (n.tenLenh ?? "Lệnh phụ") : (lenh.ten ?? "Lệnh này")}
                        <span className="kgl-mu">{n.laPhu ? n.lsxMa : lenh.ma}</span>
                      </div>
                    )}
                    {n.cd.map((t) => (
                      <div key={t.cvId} className="kkf2-cd">
                        <div className="kkf2-cd__h">{t.ten}</div>
                        {t.tieuChi.map((tc) => dongTick(khoaTc(t.cvId, tc.thu_tu), tenTieuChi(tc), t.cvId))}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="kgl-khac-tach" />
                {dongTick(KHAC, "Lỗi khác", cd.cong_viec_id)}
                <label className="kkf2-ghi-chu">
                  <span className="kgl-nhan">Ghi chú cho lần kiểm <i>không bắt buộc</i></span>
                  <input className="kgl-o" value={ghiChu} aria-label="Ghi chú cho lần kiểm"
                    onChange={(e) => setGhiChu(e.currentTarget.value)} />
                </label>
              </>
            )}
          </section>

          <section className="kgl-khoi" aria-label="Các lần kiểm trước">
            <div className="kgl-khoi__h">
              Các lần kiểm trước{lanKiem.length > 0 && <span className="kgl-mu">{lanKiem.length} lần</span>}
            </div>
            <div className="kkf2-lk">
              <KcsLanKiemList lanKiem={lkHien} checklist={cd.checklist} />
            </div>
            {lanKiem.length > LAN_KIEM_HIEN && (
              <button type="button" className="kgl-lk kgl-them" onClick={() => setMoHetLk((v) => !v)}>
                {moHetLk ? "Thu gọn" : `Xem thêm ${lanKiem.length - LAN_KIEM_HIEN} lần cũ hơn`}
              </button>
            )}
          </section>
        </div>

        <section className="kgl-khoi kgl-phai" aria-label="Đối chiếu">
          <div className="kgl-khoi__h kgl-phai__h">Đối chiếu<span className="kgl-mu">chỉ xem</span></div>
          <div className="kgl-tab" role="tablist">
            {tabDc.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={dc === t.id}
                className={dc === t.id ? "on" : undefined} onClick={() => setDc(t.id)}>
                {t.id === "tep" && <Icon name="paperclip" size={13} />}
                {t.nhan}{t.dem != null && <span className="kgl-dem">{t.dem}</span>}
              </button>
            ))}
          </div>
          {khoiDc}
        </section>
      </div>

      {/* `capture`: điện thoại mở thẳng camera sau; máy tính bỏ qua cờ này và mở hộp chọn tệp. */}
      <input ref={chupRef} type="file" accept="image/*" capture="environment" hidden
        aria-label="Chụp ảnh lỗi" onChange={(e) => void themAnh(e.currentTarget)} />
      <input ref={chonRef} type="file" accept="image/*" multiple hidden
        aria-label="Chọn ảnh lỗi" onChange={(e) => void themAnh(e.currentTarget)} />
      {xem && createPortal(<XemTruoc tep={xem} onDong={() => setXem(null)} />, document.body)}
    </NganPhai>
  );
}
