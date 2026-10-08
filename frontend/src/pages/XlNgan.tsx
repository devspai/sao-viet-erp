// XẾP LỊCH — NGĂN CHI TIẾT một lệnh (mockup A cải tiến mục 7, 08/10/2026). Vỏ là `NganPhai` dùng
// chung (rộng 1180px, kéo mép trái, Esc, ↑ ↓ đổi lệnh); thân hai cột như hộp chi tiết cũ:
//   trái  — Bắt đầu lệnh (± 15 phút, hoàn tác) · Phát hành cùng nhau (cụm) · Từ bắt đầu tới xong;
//   phải  — Quy trình (từng bước dính lệnh nào) · Quy cách và vật tư.
// Tab "Lịch sử phát hành" giữ nguyên luồng so hai phiên bản của hộp cũ.
import {
  AlertCircle, ArrowLeft, ArrowRight, Box, Building2, CalendarClock, Check, Clock, Copy, ExternalLink,
  FileText, FoldVertical, Layers, Link2, Moon, Package, PackageCheck, PauseCircle, PlayCircle, Printer,
  RotateCcw, Scissors, Send, Sparkles, Sun, Tag, Target, Trash2, Truck, UserRound, Users, CalendarX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type {
  XlChiTiet, XlCongDoan, XlGoiPhatHanh, XlNoi, XlSoSanh, XlVatTu,
} from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { NganPhai } from "./ke-toan/shared/NganPhai";
import { IconTT } from "./XlLuoi";
import {
  congPhut, gio, gioChu, moc, quangDongHo, soNgayDu, thuNgay, thuNgayGio, type XlPhanTachNghi,
} from "./xlShared";
import "./ke-toan/ke-toan.css";

/** Bộ màu + biểu tượng theo loại bước — cùng bộ của hộp chi tiết cũ (`.xl-c-icon--*`). */
function theBuoc(ten: string): { ic: ReactNode; mau: string; vien: string } {
  const t = ten.toLowerCase();
  if (t.includes("ctp") || t.includes("bản") || t.includes("kẽm")) return { ic: <Layers size={19} />, mau: "xa-m-cham", vien: "#4f46e5" };
  if (t.includes("cắt") || t.includes("xả")) return { ic: <Scissors size={19} />, mau: "xa-m-cat", vien: "#d97706" };
  if (t.includes("in")) return { ic: <Printer size={19} />, mau: "xa-m-in", vien: "#0891b2" };
  if (t.includes("cán") || t.includes("màng") || t.includes("phủ") || t.includes("uv") || t.includes("ép kim")) return { ic: <Sparkles size={19} />, mau: "xa-m-can", vien: "#9333ea" };
  if (t.includes("bế") || t.includes("dập")) return { ic: <Box size={19} />, mau: "xa-m-tp", vien: "#e11d48" };
  if (t.includes("dán") || t.includes("gấp") || t.includes("đóng cuốn") || t.includes("khâu")) return { ic: <FoldVertical size={19} />, mau: "xa-m-xanh", vien: "#2563eb" };
  if (t.includes("kcs") || t.includes("đóng gói") || t.includes("giao")) return { ic: <PackageCheck size={19} />, mau: "xa-m-la", vien: "#16a34a" };
  return { ic: <Box size={19} />, mau: "xa-m-xam", vien: "#64748b" };
}

const TT_BUOC: Record<string, string> = {
  released: "Chờ chạy", running: "Đang chạy", paused: "Tạm dừng", completed: "Xong",
};

/** "T2 12/10 14:00 đến 18:00" — cùng ngày thì vế sau chỉ ghi giờ. */
function tuDen(a: string | null, b: string | null): string {
  if (!a || !b) return "";
  return a.slice(0, 10) === b.slice(0, 10) ? `${thuNgayGio(a)} đến ${b.slice(11, 16)}` : `${thuNgayGio(a)} đến ${thuNgayGio(b)}`;
}

function DuTre({ du }: { du: number | null }) {
  if (du === null) return null;
  return du >= 0
    ? <span className="xa-nho xa-nho--la">còn dư {du} ngày</span>
    : <span className="xa-nho xa-nho--do">trễ {-du} ngày</span>;
}

function TrangThaiLenh({ ct }: { ct: XlChiTiet }) {
  if (ct.trang_thai === "da_dong") return <span className="xa-vien xa-vien--xam">Đã đóng</span>;
  if (ct.trang_thai === "da_phat_hanh") return <span className="xa-vien xa-vien--la">Đã phát hành</span>;
  if (!ct.bat_dau_at) return <span className="xa-vien xa-vien--vang">Chưa xếp lịch</span>;
  return <span className="xa-vien xa-vien--xanh">Có lịch, chưa phát hành</span>;
}

/** Câu nói một dải nối từ phía bước của lệnh đang mở. */
function cauLien(l: XlNoi): ReactNode {
  const ma = <span className="xa-ma">{l.ma_khac}</span>;
  if (l.loai === "cho") {
    return l.luc_khac
      ? <>Chờ bước {l.thu_tu_khac} {l.ten_buoc_khac} của {l.ten_lenh_khac} {ma} xong lúc {thuNgayGio(l.luc_khac)}</>
      : <>Chờ bước {l.thu_tu_khac} {l.ten_buoc_khac} của {l.ten_lenh_khac} {ma}. Lệnh đó chưa xếp lịch nên chưa biết lúc nào xong.</>;
  }
  if (l.loai === "doi") {
    return <>{l.ten_lenh_khac} {ma} chờ bước này xong mới vào bước {l.thu_tu_khac} {l.ten_buoc_khac}. Bước này xong muộn bao nhiêu, lệnh đó xong muộn bấy nhiêu.</>;
  }
  return (
    <>In chung một tờ với {ma} {l.ten_lenh_khac}{l.bai_ghep_ma ? `, bài ghép ${l.bai_ghep_ma}` : ""}.
      {l.luc_nay ? ` Một lượt máy lúc ${thuNgayGio(l.luc_nay)} cho cả hai lệnh.` : ""}</>
  );
}

/** Lý do hai lệnh trong cụm dính nhau, nhìn từ lệnh đang mở. */
function lyDoCum(lien: XlNoi[], khacId: number): string[] {
  const ra = new Set<string>();
  for (const l of lien.filter((z) => z.lsx_id_khac === khacId)) {
    if (l.loai === "cho") ra.add(`lệnh này chờ lệnh kia ở bước ${l.thu_tu}`);
    else if (l.loai === "doi") ra.add(`lệnh kia chờ lệnh này ở bước ${l.thu_tu_khac}`);
    else ra.add(`in chung bước ${l.thu_tu}${l.bai_ghep_ma ? ` bài ${l.bai_ghep_ma}` : ""}`);
  }
  return [...ra];
}

/** Số đêm thanh vắt qua — "Ngoài ca 3 đêm". */
function soDem(a: string | null, b: string | null): number {
  const x = moc(a?.slice(0, 10) + "T00:00");
  const y = moc(b?.slice(0, 10) + "T00:00");
  return x !== null && y !== null ? Math.round((y - x) / 86_400_000) : 0;
}

export function XlNgan({
  ct, dangTai, suaDuoc, duyetDuoc, dangGhi, goi, vatTu, truocDo,
  onDoiGio, onHoanTac, onBoLich, onPhatHanh, onThuHoi, onCapNhat, onDong, onMoLenh, onMoHoSo, onSoSanh, len, xuong,
}: {
  ct: XlChiTiet | null;
  dangTai: boolean;
  suaDuoc: boolean;
  duyetDuoc: boolean;
  dangGhi: boolean;
  goi: XlGoiPhatHanh | null;
  vatTu?: XlVatTu;
  /** Mốc bắt đầu TRƯỚC lần dời gần nhất của chính lệnh này (để "từ 13:45 Hoàn tác"). */
  truocDo: string | null;
  onDoiGio(gio: string): void;
  onHoanTac(): void;
  onBoLich(): void;
  onPhatHanh(): void;
  onThuHoi(): void;
  onCapNhat(): void;
  onDong(): void;
  onMoLenh(lsxId: number): void;
  /** Lệnh đã phát hành/đã đóng ⇒ Hồ sơ lệnh sản xuất; chưa phát hành ⇒ lệnh ở Kế hoạch sản xuất. */
  onMoHoSo(lsxId: number, daPhatHanh: boolean): void;
  onSoSanh(a: number, b: number): Promise<XlSoSanh>;
  len?: () => void;
  xuong?: () => void;
}) {
  const [tab, setTab] = useState("chi-tiet");
  const [chep, setChep] = useState(false);
  const [chon, setChon] = useState<number[]>([]);
  const [soSanh, setSoSanh] = useState<XlSoSanh | null>(null);
  const [loiSoSanh, setLoiSoSanh] = useState<string | null>(null);
  const [nhapGio, setNhapGio] = useState("");
  const refSoSanh = useRef(onSoSanh);
  refSoSanh.current = onSoSanh;
  const capA = chon.length === 2 ? Math.min(chon[0], chon[1]) : null;
  const capB = chon.length === 2 ? Math.max(chon[0], chon[1]) : null;

  const lsxId = ct?.lsx_id;
  useEffect(() => { setChon([]); setSoSanh(null); setLoiSoSanh(null); }, [lsxId]);
  useEffect(() => { setNhapGio((ct?.bat_dau_at ?? "").slice(0, 16)); }, [ct?.bat_dau_at, lsxId]);
  useEffect(() => {
    if (capA == null || capB == null) { setSoSanh(null); return; }
    let huy = false;
    setSoSanh(null);
    setLoiSoSanh(null);
    refSoSanh.current(capA, capB)
      .then((r) => { if (!huy) setSoSanh(r); })
      .catch((e) => { if (!huy) setLoiSoSanh(e?.message ?? "Không so được."); });
    return () => { huy = true; };
  }, [capA, capB]);

  const phienBans = goi?.co_goi ? (goi.phien_bans ?? []) : [];

  if (!ct) {
    return (
      <NganPhai tieuDe={dangTai ? "Đang tải lệnh" : "Không mở được lệnh"} onDong={onDong} len={len} xuong={xuong}>
        <EmptyState trangThai="dang-tai" inline nhanTai="Đang tải dữ liệu lệnh sản xuất…" />
      </NganPhai>
    );
  }

  const daXep = !!ct.bat_dau_at;
  const daPhatHanh = ct.trang_thai === "da_phat_hanh";
  const daDong = ct.trang_thai === "da_dong";
  const soDaBatDau = goi?.co_goi ? (goi.so_da_bat_dau ?? 0) : 0;
  const khoaThuHoi = !!goi?.co_goi && goi.cho_phep_thu_hoi === false;
  const capNhatDuoc = !!goi?.co_goi && goi.cho_phep_cap_nhat === true && soDaBatDau > 0;
  const daChayDo = ct.co_thuc_te && !!ct.thuc_bat_dau_lenh;
  const daXongHet = ct.co_thuc_te && ct.so_buoc > 0 && ct.so_buoc_xong >= ct.so_buoc && !!ct.ket_thuc_thuc_te;
  const ketThuc = ct.ket_thuc_thuc_te ?? ct.ket_thuc;
  const phanTach = (ct as { phan_tach_nghi?: XlPhanTachNghi | null }).phan_tach_nghi ?? null;
  const sua = suaDuoc && !daDong && !dangGhi;
  const cum = ct.cum;
  const khac = cum ? cum.lsx.filter((z) => z.lsx_id !== ct.lsx_id) : [];
  const coBuocCho = ct.cong_doans.filter((c) => c.cho_tu).length;

  // Câu "Bước N chưa tính được giờ …" đã hiện ngay trên thẻ bước đó — ở đầu ngăn chỉ giữ ghi chú cấp lệnh.
  const ghiChu = ct.ghi_chu.filter((g) => !/^Bước \d+ /.test(g));
  const doi = (phut: number) => { if (ct.bat_dau_at) onDoiGio(congPhut(ct.bat_dau_at, phut)); };

  // ---------------------------------------------------------------- trái
  const theBatDau = (
    <section className="xa-ng-the">
      <div className="xa-ng-the__dau">
        <span className="xa-oic xa-m-rust"><PlayCircle size={15} /></span>
        {daXongHet ? "Đã xong" : daChayDo ? "Bắt đầu phần còn lại" : "Bắt đầu lệnh"}
      </div>
      {daXongHet ? (
        <div className="xa-ng-moc">
          <div className="xa-ng-o"><div className="xa-ng-o__nhan"><CalendarClock size={13} />Vào việc</div>
            <div className="xa-ng-o__gt">{thuNgayGio(ct.thuc_bat_dau_lenh)}</div></div>
          <div className="xa-ng-mui"><span><ArrowRight size={13} /></span></div>
          <div className="xa-ng-o xa-ng-o--xong"><div className="xa-ng-o__nhan"><Target size={13} />Xong thực tế</div>
            <div className="xa-ng-o__gt">{thuNgayGio(ct.ket_thuc_thuc_te)}</div></div>
        </div>
      ) : (
        <>
          <div className="xa-ng-moc">
            <label className={`xa-ng-o${sua ? " xa-ng-o--nhap" : ""}`}>
              <div className="xa-ng-o__nhan"><CalendarClock size={13} />Bắt đầu</div>
              {sua ? (
                <input type="datetime-local" value={nhapGio} min="2000-01-01T00:00" max="2099-12-31T23:59" aria-label="Giờ bắt đầu"
                  onChange={(e) => setNhapGio(e.target.value)}
                  onBlur={() => { if (nhapGio && nhapGio !== (ct.bat_dau_at ?? "").slice(0, 16)) onDoiGio(`${nhapGio}:00`); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              ) : (
                <div className="xa-ng-o__gt">{daXep ? thuNgayGio(ct.bat_dau_at) : "Chưa xếp lịch"}</div>
              )}
            </label>
            <div className="xa-ng-mui"><span><ArrowRight size={13} /></span></div>
            <div className="xa-ng-o xa-ng-o--xong">
              <div className="xa-ng-o__nhan"><Target size={13} />Dự kiến xong</div>
              <div className="xa-ng-o__gt">{daXep ? thuNgayGio(ct.ket_thuc) : "—"}</div>
            </div>
          </div>
          {daXep && sua && (
            <div className="xa-ng-doi">
              <div className="xa-nhom-nut">
                <button type="button" onClick={() => doi(-15)}><ArrowLeft size={13} />15 phút</button>
                <button type="button" onClick={() => doi(15)}>15 phút<ArrowRight size={13} /></button>
              </div>
              <span>hoặc kéo thanh trên lịch</span>
              {truocDo && (
                <span className="xa-ng-vua">từ {truocDo.slice(0, 10) === (ct.bat_dau_at ?? "").slice(0, 10) ? truocDo.slice(11, 16) : thuNgayGio(truocDo)}
                  <button type="button" className="xa-lk" onClick={onHoanTac}><RotateCcw size={14} />Hoàn tác</button>
                </span>
              )}
            </div>
          )}
          {!daXep && <p className="xa-ng-ghi">Gõ giờ bắt đầu ở trên hoặc kéo lệnh từ khay Chờ xếp lịch thả vào lịch.</p>}
          {daChayDo && (
            <div className="xa-ng-canh"><PlayCircle size={16} />
              <span>Lệnh đã vào việc {thuNgayGio(ct.thuc_bat_dau_lenh)}, xong {ct.so_buoc_xong} trên {ct.so_buoc} bước. Giờ ở trên là giờ bắt đầu phần còn lại; không lùi được xuống dưới bước đã xong.</span>
            </div>
          )}
          {ct.co_thuc_te && ct.ket_thuc_thuc_te && (
            <div className="xa-ng-canh" style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1e40af" }}>
              <Clock size={16} />
              <span>Theo việc đã làm, dự kiến xong {thuNgayGio(ct.ket_thuc_thuc_te)}
                {ct.lech_ket_thuc_phut != null && Math.abs(ct.lech_ket_thuc_phut) > 15
                  ? `, ${ct.lech_ket_thuc_phut > 0 ? "muộn" : "sớm"} ${quangDongHo(Math.abs(ct.lech_ket_thuc_phut))} so với kế hoạch.` : ", đúng kế hoạch."}</span>
            </div>
          )}
        </>
      )}
      {ghiChu.length > 0 && (
        <div className="xa-ng-canh"><AlertCircle size={16} /><span>{ghiChu.map((g, i) => <span key={i} style={{ display: "block" }}>{g}</span>)}</span></div>
      )}
      <div className="xa-ng-han">
        {([["Hạn xong sản xuất", ct.han_hoan_thanh_sx, <Target size={14} key="t" />], ["Hạn giao khách", ct.han_giao_khach, <Truck size={14} key="g" />]] as const).map(([ten, h, ic]) => (
          <div key={ten} className={`xa-ng-han__o${h ? "" : " xa-ng-han__o--trong"}`}>
            <div className="xa-ng-han__nhan">{ic}{ten}</div>
            <div className="xa-ng-han__dong">
              {h ? <><span>{thuNgay(h)}</span>{daXep && <DuTre du={soNgayDu(ketThuc, h)} />}</> : <span className="xa-mo">Chưa có hạn</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const theCum = cum && (
    <section className="xa-ng-the">
      <div className="xa-ng-the__dau">
        <span className="xa-oic xa-m-cham"><Link2 size={15} /></span>Phát hành cùng nhau
        <span className="xa-gian" /><span className="xa-phu">{cum.lsx.length} lệnh{cum.phu ? ` ${cum.phu}` : ""}</span>
      </div>
      {[cum.lsx.find((z) => z.lsx_id === ct.lsx_id), ...khac].filter(Boolean).map((z) => {
        const nay = z!.lsx_id === ct.lsx_id;
        const ly = nay ? [] : lyDoCum(ct.lien, z!.lsx_id);
        return (
          <div key={z!.lsx_id} className={`xa-ng-cum${nay ? " xa-ng-cum--nay" : ""}`}>
            <IconTT tt={z!.trang_thai} />
            <div><span className="xa-ma">{z!.ma}</span> {z!.ten}</div>
            {nay ? <span className="xa-mo" style={{ fontSize: 12 }}>lệnh này</span>
              : <button type="button" className="xa-btn" onClick={() => onMoLenh(z!.lsx_id)}><ExternalLink size={13} />Mở</button>}
            {(ly.length > 0 || (!nay && !z!.co_lich)) && (
              <div className="xa-ly">
                {ly.map((t) => <span key={t} className="xa-nho xa-nho--vang">{t}</span>)}
                {!nay && !z!.co_lich && <span className="xa-nho">chưa xếp lịch</span>}
              </div>
            )}
          </div>
        );
      })}
      <p className="xa-ng-ghi">Phát hành lệnh nào thì cả {cum.lsx.length} lệnh cùng xuống xưởng.</p>
    </section>
  );

  const tong = daXep ? Math.max(0, ((moc(ct.ket_thuc) ?? 0) - (moc(ct.bat_dau_at) ?? 0)) / 60_000) : 0;
  const chay = ct.chay_phut || 0;
  const cho = ct.cho_phut || 0;
  const nghi = Math.max(0, tong - chay - cho);
  const pt = (v: number) => (tong > 0 ? Math.round((v / tong) * 100) : 0);
  const dem = soDem(ct.bat_dau_at, ct.ket_thuc);
  const theThoiGian = daXep && !daXongHet && (
    <section className="xa-ng-the">
      <div className="xa-ng-the__dau">
        <span className="xa-oic xa-m-xanh"><Clock size={15} /></span>Từ bắt đầu tới xong
        <span className="xa-gian" /><span>{quangDongHo(tong)}</span>
      </div>
      <div className="xa-ng-thanh">
        <span className="a" style={{ width: `${pt(chay)}%` }} />
        {cho > 0 && <span className="c" style={{ width: `${pt(cho)}%` }} />}
        <span className="b" style={{ width: `${Math.max(0, 100 - pt(chay) - pt(cho))}%` }} />
      </div>
      <div className={`xa-ng-so${cho > 0 && nghi > 0 ? " xa-ng-so--ba" : ""}`}>
        <div className="xa-ng-so__o xa-ng-so__o--chay"><div className="xa-ng-so__dau"><PlayCircle size={13} />Máy chạy</div><div className="xa-ng-so__gt">{gioChu(chay)}</div></div>
        {cho > 0 && <div className="xa-ng-so__o xa-ng-so__o--cho"><div className="xa-ng-so__dau"><Link2 size={13} />Chờ lệnh khác</div><div className="xa-ng-so__gt">{quangDongHo(cho)}</div></div>}
        {nghi > 0 && <div className="xa-ng-so__o xa-ng-so__o--nghi"><div className="xa-ng-so__dau"><PauseCircle size={13} />{dem > 0 ? `Ngoài ca ${dem} đêm` : "Nghỉ và ngoài ca"}</div><div className="xa-ng-so__gt">{quangDongHo(nghi)}</div></div>}
      </div>
      {nghi > 0 && phanTach?.cac_ca?.map((c) => (
        <div key={`${c.ten}${c.tu}`} className="xa-ng-dong">
          <span className="xa-oic xa-m-cat"><Sun size={15} /></span>
          <div><div className="xa-ng-dong__ten">{c.ten}</div>
            <div className="xa-ng-dong__phu">{c.tu} đến {c.den} mỗi ngày làm{c.nghi_tu && <span className="xa-nho">nghỉ {c.nghi_tu} đến {c.nghi_den}</span>}</div></div>
          <span className="xa-ng-dong__gt" />
        </div>
      ))}
      {phanTach && phanTach.nghi_giua_ca_phut > 0 && (
        <div className="xa-ng-dong">
          <span className="xa-oic xa-m-xam"><PauseCircle size={15} /></span>
          <div><div className="xa-ng-dong__ten">Nghỉ giữa ca</div>
            <div className="xa-ng-dong__phu">{phanTach.nghi_giua_ca.map((k, i) => <span key={i} className="xa-nho">{k.tu} đến {k.den}{k.so_lan > 1 ? ` ${k.so_lan} lần` : ""}</span>)}</div></div>
          <span className="xa-ng-dong__gt">{gioChu(phanTach.nghi_giua_ca_phut)}</span>
        </div>
      )}
      {phanTach && phanTach.ngoai_ca_phut > 0 && (
        <div className="xa-ng-dong">
          <span className="xa-oic xa-m-cham"><Moon size={15} /></span>
          <div><div className="xa-ng-dong__ten">Ngoài ca</div>
            <div className="xa-ng-dong__phu">{phanTach.ngoai_ca.map((k, i) => <span key={i} className="xa-nho">từ {k.tu} tới {k.den}{k.so_lan > 1 ? ` ${k.so_lan} lần` : ""}</span>)}</div></div>
          <span className="xa-ng-dong__gt">{gioChu(phanTach.ngoai_ca_phut)}</span>
        </div>
      )}
      {phanTach && phanTach.ngay_nghi_phut > 0 && (
        <div className="xa-ng-dong">
          <span className="xa-oic xa-m-xam"><CalendarX size={15} /></span>
          <div><div className="xa-ng-dong__ten">Ngày nghỉ</div>
            <div className="xa-ng-dong__phu xa-ng-dong__phu--cot">
              {phanTach.ngay_nghi.map((n, i) => (
                <span key={i}>
                  <span className={`xa-cl ${n.loai === "work" ? "xa-cl--bu" : n.ten ? "xa-cl--le" : "xa-cl--nghi"}`}>{n.ten ? "Nghỉ lễ" : "Nghỉ tuần"}</span>
                  {thuNgay(n.ngay)}{n.ten ? ` ${n.ten}` : ""}
                </span>
              ))}
            </div></div>
          <span className="xa-ng-dong__gt">{gioChu(phanTach.ngay_nghi_phut)}</span>
        </div>
      )}
      {phanTach && phanTach.gia_cong_ngoai_phut > 0 && (
        <div className="xa-ng-dong">
          <span className="xa-oic xa-m-tp"><Truck size={15} /></span>
          <div><div className="xa-ng-dong__ten">Gia công ngoài</div><div className="xa-ng-dong__phu">bên gia công giữ hàng</div></div>
          <span className="xa-ng-dong__gt">{gioChu(phanTach.gia_cong_ngoai_phut)}</span>
        </div>
      )}
    </section>
  );

  // ---------------------------------------------------------------- phải
  const buoc = (c: XlCongDoan) => {
    const t = theBuoc(c.ten);
    const chung = c.lien.some((l) => l.loai === "chung");
    const choPhut = c.cho_tu && c.du_kien_bat_dau ? ((moc(c.du_kien_bat_dau) ?? 0) - (moc(c.cho_tu) ?? 0)) / 60_000 : 0;
    const sl = c.so_luong_vao != null && c.so_luong_vao > 0
      ? `${c.so_luong_vao.toLocaleString("vi-VN")} ${c.don_vi_vao_ten ?? c.don_vi_vao ?? ""}` : null;
    return (
      <div key={c.id} className="xa-ng-buoc">
        <span className="xa-ng-so-tt" style={{ borderColor: t.vien, color: t.vien }}>{c.thu_tu}</span>
        <div className={`xa-ng-buoc__the${choPhut > 0 ? " xa-ng-buoc__the--cho" : chung ? " xa-ng-buoc__the--chung" : ""}`}>
          <span className={`xa-oic xa-oic--lon ${t.mau}`}>{t.ic}</span>
          <div style={{ minWidth: 0 }}>
            <div className="xa-ng-buoc__ten">
              {c.ten}
              {c.song_song && <span className="xa-nho" title="Cùng lớp với bước khác nên hai bước không chặn nhau; lịch cấp lệnh vẫn xếp lần lượt.">song song được</span>}
              {c.bai_ghep_ma && <span className="xa-nho xa-nho--tim">bài ghép {c.bai_ghep_ma}</span>}
              {c.trang_thai && <span className="xa-nho">{TT_BUOC[c.trang_thai] ?? c.trang_thai}</span>}
            </div>
            <div className="xa-ng-buoc__phu">
              <span className="xa-ng-buoc__may">{c.may_ten ? <Printer size={13} /> : <Users size={13} />}
                {c.may_ten ?? c.to_ten ?? "Chưa gán máy"}
                {c.may_ke_hoach_ten && <span className="xa-mo2" title="Xưởng đã đổi máy so với kế hoạch">kế hoạch {c.may_ke_hoach_ten}</span>}
              </span>
              {sl ? <span className="xa-nho">{sl}</span> : <span className="xa-nho">chưa khai số lượng vào</span>}
              {c.so_nguoi_chuan > 0 && <span className="xa-nho">{c.so_nguoi_chuan} người</span>}
            </div>
          </div>
          <div className="xa-ng-buoc__phai">
            {c.la_thue_ngoai ? <span className="xa-vien xa-vien--cam">Gia công ngoài</span>
              : c.chay_phut > 0 ? <span className="xa-vien xa-vien--xanh">{gioChu(c.chay_phut)}</span>
                : <span className="xa-vien xa-vien--vang">Chưa tính được giờ</span>}
            {choPhut > 0 && <span className="xa-vien xa-vien--vang"><Clock size={13} />chờ {quangDongHo(choPhut)}</span>}
            {c.du_kien_bat_dau && c.du_kien_ket_thuc !== c.du_kien_bat_dau && <span className="xa-ng-buoc__ly">{tuDen(c.du_kien_bat_dau, c.du_kien_ket_thuc)}</span>}
          </div>
          {!c.la_thue_ngoai && c.chay_phut <= 0 && c.canh_bao && (
            <div className="xa-ng-buoc__kh xa-chu-vang">{c.canh_bao}</div>
          )}
          {(c.ke_hoach_bat_dau || c.thuc_bat_dau) && (
            <div className="xa-ng-buoc__kh">
              <span>Kế hoạch đã phát hành {gio(c.ke_hoach_bat_dau)} đến {gio(c.ke_hoach_ket_thuc)}</span>
              <span>Thực tế {c.thuc_bat_dau ? `${gio(c.thuc_bat_dau)} đến ${c.thuc_ket_thuc ? gio(c.thuc_ket_thuc) : "đang chạy"}` : "chưa vào việc"}
                {c.lech_phut != null && Math.abs(c.lech_phut) > 15 && ` ${c.lech_phut > 0 ? "muộn" : "sớm"} ${quangDongHo(Math.abs(c.lech_phut))}`}</span>
            </div>
          )}
          {c.lien.map((l, k) => (
            <div key={k} className={`xa-ng-lien xa-ng-lien--${l.loai}`}>
              {l.loai === "chung" ? <Layers size={15} /> : <Link2 size={15} />}
              <span>{cauLien(l)}</span>
              <button type="button" className="xa-btn" onClick={() => onMoLenh(l.lsx_id_khac)}><ExternalLink size={13} />Mở lệnh</button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const theQuyTrinh = (
    <section className="xa-ng-the">
      <div className="xa-ng-the__dau">
        <span className="xa-oic xa-m-rust"><Layers size={15} /></span>Quy trình sản xuất
        <span className="xa-gian" /><span className="xa-phu">{ct.cong_doans.length} bước</span>
        {coBuocCho > 0 && <span className="xa-nho xa-nho--vang">{coBuocCho} bước chờ lệnh khác</span>}
      </div>
      {ct.cong_doans.length === 0
        ? <p className="xa-ng-ghi">Lệnh chưa có quy trình. Khai quy trình ở Kế hoạch sản xuất.</p>
        : <div className="xa-ng-buoc-ds">{ct.cong_doans.map(buoc)}</div>}
    </section>
  );

  const theQuyCach = (
    <section className="xa-ng-the">
      <div className="xa-ng-the__dau"><span className="xa-oic xa-m-can"><Tag size={15} /></span>Quy cách và vật tư</div>
      <div className="xa-ng-qc">
        <div className="xa-ng-qc__o"><div className="xa-ng-qc__nhan"><Package size={13} />Sản lượng đặt</div>
          <div className="xa-ng-qc__gt">{ct.so_luong_dat.toLocaleString("vi-VN")} {ct.don_vi_tinh ?? ""}</div></div>
        <div className="xa-ng-qc__o"><div className="xa-ng-qc__nhan"><FileText size={13} />Tờ in</div>
          <div className="xa-ng-qc__gt">{ct.so_to_ke_hoach.toLocaleString("vi-VN")} tờ{ct.so_con > 1 && <span className="xa-nho">{ct.so_con} con một tờ</span>}</div></div>
        {ct.so_kem && <div className="xa-ng-qc__o"><div className="xa-ng-qc__nhan"><Layers size={13} />Kẽm</div><div className="xa-ng-qc__gt">{ct.so_kem} tấm</div></div>}
        <div className="xa-ng-qc__o xa-ng-qc__o--rong"><div className="xa-ng-qc__nhan"><FileText size={13} />Giấy</div>
          <div className="xa-ng-qc__gt">{ct.giay ?? <span className="xa-mo">Chưa chọn giấy</span>}
            {ct.kho_in && <span className="xa-nho">khổ {ct.kho_in}</span>}
            {ct.so_mau && <span className="xa-nho">{ct.so_mau} màu</span>}
            {vatTu && vatTu.muc !== "ok" && <span className={`xa-nho ${vatTu.muc === "do" ? "xa-nho--do" : "xa-nho--vang"}`}>{vatTu.chu}</span>}
            {vatTu && vatTu.muc === "ok" && <span className="xa-nho xa-nho--la">đủ vật tư</span>}
          </div></div>
        {ct.sale_name && <div className="xa-ng-qc__o"><div className="xa-ng-qc__nhan"><UserRound size={13} />Kinh doanh</div><div className="xa-ng-qc__gt">{ct.sale_name}</div></div>}
        {ct.nguoi_phu_trach_ten && <div className="xa-ng-qc__o"><div className="xa-ng-qc__nhan"><UserRound size={13} />Phụ trách</div><div className="xa-ng-qc__gt">{ct.nguoi_phu_trach_ten}</div></div>}
      </div>
      {ct.luu_y_gui_xuong && <div className="xa-ng-luu-y"><AlertCircle size={16} /><span>Dặn xưởng: {ct.luu_y_gui_xuong}</span></div>}
    </section>
  );

  // ---------------------------------------------------------------- lịch sử phát hành
  const chonPhienBan = (so: number) => setChon((cu) => (cu.includes(so) ? cu.filter((x) => x !== so) : cu.length < 2 ? [...cu, so] : [cu[1], so]));
  const lichSu = (
    <div className="xa-ng-ls">
      {phienBans.length === 0 ? (
        <p className="xa-ng-ghi">Lệnh chưa phát hành nên chưa có phiên bản nào.</p>
      ) : (
        <>
          <div className="xa-ng-ls__goi">
            {chon.length === 0 ? "Bấm chọn hai phiên bản để so giờ và máy từng bước."
              : chon.length === 1 ? `Đã chọn phiên bản ${chon[0]}, bấm thêm một phiên bản nữa.`
                : `Đang so phiên bản ${capA} với ${capB}.`}
            {chon.length > 0 && <button type="button" className="xa-lk" onClick={() => setChon([])}>Bỏ chọn</button>}
          </div>
          {phienBans.map((p) => (
            <button key={p.so} type="button" className={`xa-ng-ls__muc${chon.includes(p.so) ? " xa-ng-ls__muc--chon" : ""}`} onClick={() => chonPhienBan(p.so)}>
              <span className="xa-nho">Phiên bản {p.so}</span>
              <span className={`xa-nho ${p.loai === "cap_nhat" ? "xa-nho--vang" : "xa-nho--la"}`}>{p.loai === "cap_nhat" ? "cập nhật" : "phát hành"}</span>
              <span className="xa-ng-ls__ly">{p.ly_do || "Không ghi lý do"}</span>
              <span className="xa-mo">{gio(p.luc)}</span>
            </button>
          ))}
          {capA != null && capB != null && (
            <div className="xa-ng-ls__so">
              {loiSoSanh && <p className="xa-chu-do">{loiSoSanh}</p>}
              {!soSanh && !loiSoSanh && <p className="xa-mo">Đang đối chiếu…</p>}
              {soSanh && (soSanh.dong.some((d) => d.doi_gio || d.doi_may) ? soSanh.dong.filter((d) => d.doi_gio || d.doi_may).map((d) => (
                <div key={d.cong_viec_id} className="xa-ng-ls__dong">
                  <span>{d.ten}</span>
                  <span>
                    {d.doi_gio && <span style={{ display: "block" }}><span className="xa-ng-ls__cu">{gio(d.a.bat_dau)}</span> thành {gio(d.b.bat_dau)}</span>}
                    {d.doi_may && <span style={{ display: "block" }}><span className="xa-ng-ls__cu">máy {d.a.may_ten ?? "chưa gán"}</span> thành máy {d.b.may_ten ?? "chưa gán"}</span>}
                  </span>
                </div>
              )) : <p className="xa-mo">Không có bước nào đổi giờ hay đổi máy giữa hai phiên bản này. Lịch sử chi tiết chỉ lưu từ 10/09/2026.</p>)}
            </div>
          )}
        </>
      )}
    </div>
  );

  // ---------------------------------------------------------------- chân
  const nPhatHanh = cum ? cum.lsx.length : 1;
  const chan = (
    <div className="xa-ng-chan">
      <button type="button" className="xa-btn" onClick={onDong}>Đóng</button>
      <span className="xa-gian" />
      {duyetDuoc && daPhatHanh && khoaThuHoi && (
        <span className="xa-goi-y"><AlertCircle size={14} />Đã có {soDaBatDau} trên {goi?.so_cong_viec ?? 0} việc dưới xưởng bắt đầu, không rút cả gói về được.</span>
      )}
      {!daPhatHanh && !daDong && khac.length > 0 && duyetDuoc && daXep && (
        <span className="xa-goi-y"><Link2 size={14} />{khac.map((z) => z.ma).join(" và ")} xuống xưởng cùng lúc</span>
      )}
      {suaDuoc && daXep && !daPhatHanh && !daDong && (
        <button type="button" className="xa-btn xa-btn--do" disabled={dangGhi} onClick={onBoLich}><Trash2 size={14} />Bỏ lịch</button>
      )}
      {duyetDuoc && daPhatHanh && (
        <button type="button" className="xa-btn xa-btn--do" disabled={dangGhi || khoaThuHoi} onClick={onThuHoi}
          title={khoaThuHoi ? "Thu hồi cả gói sẽ xoá việc thợ đã làm. Dùng Phát hành cập nhật cho phần chưa bắt đầu." : undefined}>
          <RotateCcw size={14} />{nPhatHanh > 1 ? `Thu hồi cả cụm, ${nPhatHanh} lệnh` : "Thu hồi phát hành"}
        </button>
      )}
      {duyetDuoc && daPhatHanh && capNhatDuoc && (
        <button type="button" className="xa-btn xa-btn--xanh" disabled={dangGhi} onClick={onCapNhat}
          title={`Đẩy lịch mới xuống xưởng cho ${goi?.so_chua_bat_dau ?? 0} việc chưa bắt đầu; ${soDaBatDau} việc đã chạy giữ nguyên.`}>
          <Send size={14} />Phát hành cập nhật
        </button>
      )}
      {duyetDuoc && daXep && !daPhatHanh && !daDong && (
        <button type="button" className="xa-btn xa-btn--xanh" disabled={dangGhi} onClick={onPhatHanh}>
          <Send size={14} />{nPhatHanh > 1 ? `Phát hành cả cụm, ${nPhatHanh} lệnh` : "Phát hành"}
        </button>
      )}
    </div>
  );

  const chepMa = () => {
    navigator.clipboard?.writeText(ct.ma).then(() => { setChep(true); window.setTimeout(() => setChep(false), 1500); }).catch(() => {});
  };

  return (
    <NganPhai
      duongDan="Xếp lịch"
      tieuDe={ct.ten || ct.ma}
      the={<TrangThaiLenh ct={ct} />}
      phuDe={(
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span className="xa-chip-dau">{ct.ma}
            <button type="button" className="xa-sao" title="Chép mã lệnh" aria-label="Chép mã lệnh" onClick={chepMa}>
              {chep ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </span>
          {ct.is_rush && <span className="xa-gap">Gấp</span>}
          {ct.customer_name && <span className="xa-chip-dau"><Building2 size={13} />{ct.customer_name}</span>}
          {ct.order_no && <span className="xa-chip-dau"><FileText size={13} />Đơn {ct.order_no}</span>}
          {ct.customer_po_no && <span className="xa-chip-dau"><Tag size={13} />PO {ct.customer_po_no}</span>}
        </span>
      )}
      hanhDong={(
        <button type="button" className="xa-btn" onClick={() => onMoHoSo(ct.lsx_id, daPhatHanh || daDong)}>
          <ExternalLink size={14} />{daPhatHanh || daDong ? "Mở hồ sơ lệnh" : "Mở ở Kế hoạch sản xuất"}
        </button>
      )}
      tabs={[{ id: "chi-tiet", nhan: "Chi tiết" }, { id: "lich-su", nhan: "Lịch sử phát hành" }]}
      tab={tab}
      onTab={setTab}
      chan={chan}
      len={len}
      xuong={xuong}
      onDong={onDong}
    >
      <div className="xa">
        {tab === "chi-tiet" ? (
          <div className="xa-ng">
            <div className="xa-ng-cot">{theBatDau}{theCum}{theThoiGian}</div>
            <div className="xa-ng-cot">{theQuyTrinh}{theQuyCach}</div>
          </div>
        ) : lichSu}
      </div>
    </NganPhai>
  );
}
