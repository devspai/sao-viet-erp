// XẾP LỊCH — chọn KHOẢNG NGÀY xem (mockup A cải tiến mục 1, khuôn date range của Polaris): cột trái
// các khoảng hay dùng, bên phải hai ô Từ ngày / Đến ngày + lịch hai tháng. Áp dụng mới đổi lưới.
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { NGAY_NHAP_MAX, NGAY_NHAP_MIN, dauTuan, loiKhoangNgay, soNgayGiua, themNgay, ymd } from "./xlShared";

const THU_T2 = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function cuoiThang(y: number, m: number): string {
  return ymd(new Date(y, m + 1, 0));
}

function khoangNhanh(): { ten: string; tu: string; den: string }[] {
  const nay = new Date();
  const t2 = dauTuan(nay);
  const y = nay.getFullYear();
  const m = nay.getMonth();
  const hn = ymd(nay);
  return [
    { ten: "Tuần này", tu: t2, den: themNgay(t2, 6) },
    { ten: "2 tuần", tu: t2, den: themNgay(t2, 13) },
    { ten: "Tháng này", tu: ymd(new Date(y, m, 1)), den: cuoiThang(y, m) },
    { ten: "Tháng sau", tu: ymd(new Date(y, m + 1, 1)), den: cuoiThang(y, m + 1) },
    { ten: "30 ngày tới", tu: hn, den: themNgay(hn, 29) },
  ];
}

const ngan = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

export function XlKhoangNgay({
  tu, den, onApDung, onDong,
}: {
  tu: string;
  den: string;
  onApDung(tu: string, den: string): void;
  onDong(): void;
}) {
  const [a, setA] = useState(tu);
  const [b, setB] = useState(den);
  const [chonDen, setChonDen] = useState(false);
  const [thang, setThang] = useState(() => new Date(+tu.slice(0, 4), +tu.slice(5, 7) - 1, 1));
  const ref = useRef<HTMLDivElement>(null);
  const nhanh = khoangNhanh();
  const loi = loiKhoangNgay(a, b);
  const tuChon = !nhanh.some((k) => k.tu === a && k.den === b);

  useEffect(() => {
    const ngoai = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!ref.current?.contains(t) && !t.closest?.(".xa-kn")) onDong();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onDong(); };
    document.addEventListener("mousedown", ngoai);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", ngoai);
      document.removeEventListener("keydown", esc);
    };
  }, [onDong]);

  const bam = (d: string) => {
    if (!chonDen) {
      setA(d);
      setB(d);
      setChonDen(true);
      return;
    }
    if (d < a) {
      setB(a);
      setA(d);
    } else {
      setB(d);
    }
    setChonDen(false);
  };

  const veThang = (goc: Date, trai: boolean, phai: boolean) => {
    const y = goc.getFullYear();
    const m = goc.getMonth();
    const so = new Date(y, m + 1, 0).getDate();
    const lech = (new Date(y, m, 1).getDay() + 6) % 7;
    const hn = ymd(new Date());
    return (
      <div>
        <div className="xa-lp__ten">
          {trai ? <button type="button" aria-label="Tháng trước" onClick={() => setThang(new Date(y, m - 1, 1))}><ChevronLeft size={16} /></button> : <span />}
          <span>Tháng {m + 1} năm {y}</span>
          {phai ? <button type="button" aria-label="Tháng sau" onClick={() => setThang(new Date(y, m, 1))}><ChevronRight size={16} /></button> : <span />}
        </div>
        <div className="xa-lp__luoi">
          {THU_T2.map((t) => <span key={t} className="th">{t}</span>)}
          {Array.from({ length: lech }, (_, i) => <span key={`r${i}`} />)}
          {Array.from({ length: so }, (_, i) => {
            const d = ymd(new Date(y, m, i + 1));
            const lop = ["d"];
            if (new Date(y, m, i + 1).getDay() === 0) lop.push("d--cn");
            if (d === a) lop.push("d--dau");
            if (d === b) lop.push("d--cuoi");
            if (d > a && d < b) lop.push("d--trong");
            if (d === hn) lop.push("d--nay");
            return (
              <button key={d} type="button" className={lop.join(" ")} onClick={() => bam(d)} aria-label={d}>
                <span>{i + 1}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const thang2 = new Date(thang.getFullYear(), thang.getMonth() + 1, 1);
  const thuCua = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d)
    ? ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).getDay()]
    : "");

  return (
    <div className="xa-lp" ref={ref} role="dialog" aria-label="Chọn khoảng ngày">
      <div className="xa-lp__trai">
        {nhanh.map((k) => (
          <button key={k.ten} type="button" className={`xa-lp__muc${k.tu === a && k.den === b ? " on" : ""}`}
            onClick={() => { setA(k.tu); setB(k.den); setChonDen(false); setThang(new Date(+k.tu.slice(0, 4), +k.tu.slice(5, 7) - 1, 1)); }}>
            <span>{k.ten}</span><span className="xa-mo">{ngan(k.tu)} đến {ngan(k.den)}</span>
          </button>
        ))}
        <button type="button" className={`xa-lp__muc${tuChon ? " on" : ""}`} onClick={() => setChonDen(false)}>
          <span>Tự chọn</span><span className="xa-mo">bấm hai ngày trên lịch</span>
        </button>
      </div>
      <div className="xa-lp__phai">
        <div className="xa-lp__o">
          <label>
            <div className="xa-lp__nhan">Từ ngày <span className="xa-mo2">{thuCua(a)}</span></div>
            <input type="date" className={`xa-lp__nhap${!chonDen ? " on" : ""}`} value={a} min={NGAY_NHAP_MIN} max={NGAY_NHAP_MAX}
              onChange={(e) => setA(e.target.value)} />
          </label>
          <span className="xa-mui"><ArrowRight size={16} /></span>
          <label>
            <div className="xa-lp__nhan">Đến ngày <span className="xa-mo2">{thuCua(b)}</span></div>
            <input type="date" className={`xa-lp__nhap${chonDen ? " on" : ""}`} value={b} min={a || NGAY_NHAP_MIN} max={NGAY_NHAP_MAX}
              onChange={(e) => setB(e.target.value)} />
          </label>
        </div>
        <div className="xa-lp__thang2">
          {veThang(thang, true, false)}
          {veThang(thang2, false, true)}
        </div>
      </div>
      <div className="xa-lp__chan">
        {loi ? <span className="xa-lp__loi" role="alert">{loi}</span> : <span>{soNgayGiua(a, b)} ngày</span>}
        <span className="xa-mo2">Dài nhất 3 tháng</span>
        <span className="xa-gian" />
        <button type="button" className="xa-btn" onClick={onDong}>Huỷ</button>
        <button type="button" className="xa-btn xa-btn--xanh" disabled={!!loi} onClick={() => onApDung(a, b)}>Áp dụng</button>
      </div>
    </div>
  );
}
