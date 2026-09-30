// BẬC THANG cho ô công thức (29/09/2026 — `docs/superpowers/specs/2026-09-29-o-cong-thuc-bac-thang-hai-che-do-design.md`).
//
// Mọi hàm ở đây chỉ ĐỌC dãy token phẳng để quyết định cách VẼ, hoặc biến đổi dãy token rồi trả dãy
// mới. Chuỗi lưu vẫn là token nối bằng một dấu cách, IF vẫn là `if(điều kiện, nếu đúng, nếu sai)`
// lồng kiểu Excel — không có "kiểu công thức bậc" nào được lưu xuống.
import { TOAN_TU, regexMoi } from "./formulaTokens";

/** Mấy hàm ĐA THAM SỐ mới đáng tách dòng theo tham số — `round/ceil/floor` chỉ bọc một biểu thức
 *  số học đơn giản, tách dòng chúng chỉ thêm rối. */
export const HAM_TACH_DONG = ["if", "max", "min"];

/** Một bậc = một lệnh `if` đủ bộ: `if ( điều kiện , nếu đúng , nếu sai )`. Chỉ số là vị trí token. */
export type Bac = { ifIdx: number; open: number; phay1: number; phay2: number; close: number };

/** Một DÒNG hiển thị = đoạn token liên tục [start, end) ở cấp thụt `cap`. `nhan` là nhãn mờ bên
 *  phải (không phải token, không lưu). `bac` chỉ có ở dòng điều kiện của một `if` đủ bộ. */
export type Dong = { start: number; end: number; cap: number; nhan?: string; dieuKien?: boolean; bac?: Bac };

/** Vị trí ngoặc khớp của từng token `(`/`)`; `-1` = không có cặp (hoặc không phải ngoặc). */
export function khopNgoac(toks: string[]): number[] {
  const khop = toks.map(() => -1);
  const ngan: number[] = [];
  toks.forEach((t, i) => {
    if (t === "(") ngan.push(i);
    else if (t === ")" && ngan.length) {
      const mo = ngan.pop()!;
      khop[mo] = i;
      khop[i] = mo;
    }
  });
  return khop;
}

type ThamSo = { start: number; end: number; phay: number };

/** Tham số của lệnh gọi mở ngoặc tại `open`, đoạn ruột kết thúc (không gồm) `het`. `end` GỒM dấu
 *  phẩy đứng sau tham số (dấu phẩy ở lại cuối dòng của tham số đó). */
function tachThamSo(toks: string[], khop: number[], open: number, het: number): ThamSo[] {
  if (open + 1 >= het) return [];
  const ra: ThamSo[] = [];
  let dau = open + 1;
  for (let j = open + 1; j < het; j++) {
    if (toks[j] === "(" && khop[j] > j && khop[j] < het) { j = khop[j]; continue; }
    if (toks[j] === ",") {
      ra.push({ start: dau, end: j + 1, phay: j });
      dau = j + 1;
    }
  }
  ra.push({ start: dau, end: het, phay: -1 });
  return ra;
}

const laGoi = (toks: string[], i: number, to: number, ds: string[]) =>
  ds.includes(toks[i]) && i + 1 < to && toks[i + 1] === "(";

/** Cắt dãy token thành các DÒNG. Kiểu code editor như trước (mở hàm đa tham số thì mỗi tham số
 *  một dòng thụt thêm một cấp, đóng ngoặc thì về cấp cũ), cộng BA luật của bậc thang:
 *
 *  1. `if ( điều kiện ,` chung một dòng — điều kiện ngắn, tách riêng chỉ làm dài thêm.
 *  2. Tham số THỨ BA của một `if` mà là TRỌN một `if(...)` (không có gì khác) thì `if` con vẽ CÙNG
 *     CẤP với `if` cha: chuỗi "nếu… không thì nếu…" thẳng một cột, 3 bậc hay 10 bậc đều vậy.
 *  3. Các `)` đóng của cả chuỗi gom về MỘT dòng.
 *
 *  Mọi trường hợp khác (`if` ở vế đúng, `if` giữa phép tính, `max/min`) giữ đúng cách thụt cũ. Các
 *  dòng phủ kín dãy token theo đúng thứ tự — con trỏ vẫn là một chỉ số trên mảng phẳng. */
export function tinhDong(toks: string[]): Dong[] {
  const khop = khopNgoac(toks);
  const out: Dong[] = [];
  // Nhãn của THAM SỐ đang vẽ ("nếu đúng", "còn lại"…) — gắn vào dòng ĐẦU TIÊN tham số đó sinh ra.
  let nhanCho: string | undefined;
  const day = (d: Dong) => {
    if (nhanCho !== undefined) {
      d.nhan = nhanCho;
      nhanCho = undefined;
    }
    out.push(d);
  };

  const ve = (from: number, to: number, cap: number) => {
    let dau = from;
    const chot = (end: number, them?: Partial<Dong>) => {
      if (end > dau) day({ start: dau, end, cap, ...them });
      dau = end;
    };
    const veThamSo = (a: ThamSo, capCon: number, nhan?: string) => {
      nhanCho = nhan;
      ve(a.start, a.end, capCon);
      nhanCho = undefined;
    };

    let i = from;
    while (i < to) {
      if (!laGoi(toks, i, to, HAM_TACH_DONG)) { i++; continue; }
      const open = i + 1;
      const close = khop[open] > open && khop[open] < to ? khop[open] : -1;
      const het = close >= 0 ? close : to;

      if (toks[i] !== "if") {
        chot(open + 1);
        for (const a of tachThamSo(toks, khop, open, het)) veThamSo(a, cap + 1);
        dau = Math.max(dau, het);
        i = close >= 0 ? close + 1 : to;
        continue;
      }

      // Gom cả chuỗi else-if trước, vì nhãn cần biết chuỗi dài mấy bậc.
      const chuoi: { ifIdx: number; open: number; close: number; ts: ThamSo[] }[] = [];
      let k = i;
      for (;;) {
        const o = k + 1;
        const c = khop[o] > o && khop[o] < to ? khop[o] : -1;
        const ts = tachThamSo(toks, khop, o, c >= 0 ? c : to);
        chuoi.push({ ifIdx: k, open: o, close: c, ts });
        const sai = ts[2];
        if (c < 0 || ts.length !== 3 || !sai) break;
        const conDau = sai.start;
        if (!(toks[conDau] === "if" && toks[conDau + 1] === "(" && khop[conDau + 1] === sai.end - 1)) break;
        k = conDau;
      }

      const n = chuoi.length;
      chuoi.forEach((m, j) => {
        const [dk, dung, sai, ...thua] = m.ts;
        const bac = dk && dung && sai && dk.phay >= 0 && dung.phay >= 0 && m.close >= 0
          ? { ifIdx: m.ifIdx, open: m.open, phay1: dk.phay, phay2: dung.phay, close: m.close }
          : undefined;
        const nhanDk = n > 1 ? `điều kiện ${j + 1}` : "điều kiện";
        if (dk && dk.phay >= 0
          && !toks.slice(dk.start, dk.end).some((_, x) => laGoi(toks, dk.start + x, dk.end, HAM_TACH_DONG))) {
          chot(dk.end, { dieuKien: true, nhan: nhanDk, bac });
        } else {
          chot(m.open + 1, { dieuKien: true, nhan: nhanDk, bac });
          if (dk) veThamSo(dk, cap + 1);
        }
        dau = Math.max(dau, dk ? dk.end : m.open + 1);
        if (dung) { veThamSo(dung, cap + 1, "nếu đúng"); dau = Math.max(dau, dung.end); }
        // Bậc không phải bậc cuối: tham số thứ ba chính là `if` kế tiếp, vẽ ở vòng sau cùng cấp.
        if (j === n - 1) {
          if (sai) { veThamSo(sai, cap + 1, n > 1 ? "còn lại" : "nếu sai"); dau = Math.max(dau, sai.end); }
          for (const a of thua) { veThamSo(a, cap + 1); dau = Math.max(dau, a.end); }
        }
      });

      const trong = chuoi[n - 1].close;
      const ngoai = chuoi[0].close;
      if (trong >= 0 && ngoai >= 0) {
        dau = trong;        // dòng `) ) )` bắt đầu ở ngoặc đóng TRONG CÙNG
        i = ngoai + 1;
      } else {
        dau = Math.max(dau, to);
        i = to;
      }
    }
    chot(to);
  };

  ve(0, toks.length, 0);
  return out;
}

/** Mọi `if` đủ bộ trong công thức, theo vị trí chữ `if`. */
export function timBac(toks: string[]): Map<number, Bac> {
  const ra = new Map<number, Bac>();
  for (const d of tinhDong(toks)) if (d.bac) ra.set(d.bac.ifIdx, d.bac);
  return ra;
}

/** Chỉ số các token là KHUNG của lệnh gọi hàm (tên hàm, ngoặc của nó, dấu phẩy ngăn tham số) — vẽ
 *  nhạt hơn ngoặc/dấu của phép tính để mắt bám vào nội dung. */
export function khungHam(toks: string[], ham: string[]): Set<number> {
  const khop = khopNgoac(toks);
  const ra = new Set<number>();
  toks.forEach((t, i) => {
    if (!ham.includes(t) || toks[i + 1] !== "(") return;
    const open = i + 1;
    const het = khop[open] > open ? khop[open] : toks.length;
    ra.add(i);
    ra.add(open);
    if (khop[open] > open) ra.add(khop[open]);
    for (const a of tachThamSo(toks, khop, open, het)) if (a.phay >= 0) ra.add(a.phay);
  });
  return ra;
}

/** Nhân đôi bậc: chép `if ( điều kiện , nếu đúng ,` ngay dưới bậc đó, thêm một `)` đóng cho nó.
 *  Kết quả vẫn là IF lồng hợp lệ — bản sao nhận vế "nếu sai" cũ của bậc làm vế sai của mình. */
export function nhanDoiBac(toks: string[], b: Bac): string[] {
  const ban = toks.slice(b.ifIdx, b.phay2 + 1);
  const t = [...toks];
  t.splice(b.close, 0, ")");
  t.splice(b.phay2 + 1, 0, ...ban);
  return t;
}

/** Xoá bậc: bỏ `if ( điều kiện , nếu đúng ,` cùng dấu `)` của nó — vế "nếu sai" đứng lại đúng chỗ. */
export function xoaBac(toks: string[], b: Bac): string[] {
  const t = [...toks];
  t.splice(b.close, 1);
  t.splice(b.ifIdx, b.phay2 - b.ifIdx + 1);
  return t;
}

const LA_TEN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Nối token thành chữ gọn kiểu Excel: `if(sl_vao <= 3000, 700000 + so_kem * 100000)` — không cách
 *  thừa quanh ngoặc/phẩy, tên hàm dính ngoặc, dấu trừ đơn dính số. Chỉ để HIỆN/CHÉP; chuỗi lưu vẫn
 *  là token nối bằng một dấu cách. */
export function noiGon(toks: string[], ham: string[]): string {
  let s = "";
  let truoc: string | undefined;
  let truDon = false;
  for (const t of toks) {
    const khongCach = truoc === undefined || truoc === "(" || t === ")" || t === ","
      || (t === "(" && ham.includes(truoc)) || truDon;
    truDon = t === "-" && (truoc === undefined || truoc === "(" || truoc === ","
      || (TOAN_TU as readonly string[]).includes(truoc) && truoc !== ")");
    s += (khongCach ? "" : " ") + t;
    truoc = t;
  }
  return s;
}

/** Chế độ Dạng chữ: in theo đúng hình bậc thang (mỗi dòng một đoạn của `tinhDong`, thụt 2 cách
 *  mỗi cấp) để nhìn ở chế độ nào cũng cùng một dáng. */
export function inDangChu(toks: string[], ham: string[]): string {
  return tinhDong(toks).map((d) => "  ".repeat(d.cap) + noiGon(toks.slice(d.start, d.end), ham)).join("\n");
}

/** Nhóm nghìn bằng khoảng trắng HẸP, chỉ để nhìn: `700000` → `700 000`. KHÔNG dùng dấu chấm — cú
 *  pháp lấy `.` làm dấu thập phân, hiện `700.000` là người ta gõ lại đúng thế và máy hiểu là 700. */
export function nhomNghin(so: string): string {
  const m = /^(\d+)(\.\d+)?$/.exec(so);
  if (!m || m[1].length < 4) return so;
  return m[1].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (m[2] ?? "");
}

/** Token KHÔNG bỏ khoảng trắng kèm vị trí trong chuỗi — để chỉ lỗi về đúng dòng ở chế độ Dạng chữ.
 *  Cùng regex với `catToken` nên chỉ số khớp một-một với dãy token của công thức. */
export function viTriToken(chuoi: string): { tok: string; i: number }[] {
  const re = regexMoi();
  const ra: { tok: string; i: number }[] = [];
  for (let m = re.exec(chuoi); m; m = re.exec(chuoi)) if (m[0].trim()) ra.push({ tok: m[0], i: m.index });
  return ra;
}

/** Bỏ dấu tiếng Việt để gõ "mau" vẫn ra "Số màu pha". */
export function boDau(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

/** Kiểm công thức — trả lỗi ĐẦU TIÊN kèm chỉ số token gây ra nó (để tô đỏ đúng chip / chỉ đúng
 *  dòng), `idx = null` khi lỗi không gắn vào token nào. `bienHopLe = null` ⇒ không kiểm tên biến.
 *
 *  Hai thói quen của Excel tiếng Việt — `;` ngăn tham số, `IF` viết hoa — CHỈ BÁO, không tự sửa
 *  (chủ chốt 29/09/2026): câu báo nói luôn cách sửa. */
export function kiemCongThuc(
  toks: string[], bienHopLe: string[] | null, ham: string[],
): { loi: string | null; idx: number | null } {
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (LA_TEN.test(t)) {
      if (ham.includes(t)) continue;
      if (ham.includes(t.toLowerCase())) {
        return { loi: `Viết thường: "${t.toLowerCase()}" thay cho "${t}"`, idx: i };
      }
      if (bienHopLe && !bienHopLe.includes(t)) {
        return { loi: `Biến hoặc hàm "${t}" không được hỗ trợ trong hệ thống`, idx: i };
      }
      continue;
    }
    if (/^\d/.test(t)) {
      if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
        return {
          loi: `"${t}" được hiểu là ${Number(t)} — số không dùng dấu chấm nghìn, viết liền "${t.replace(/\./g, "")}"`,
          idx: i,
        };
      }
      continue;
    }
    if ((TOAN_TU as readonly string[]).includes(t)) continue;
    if (t === ";") return { loi: `Dấu ";" — dùng dấu phẩy "," để ngăn các phần của hàm`, idx: i };
    return { loi: `Ký tự "${t}" không đọc được`, idx: i };
  }

  const khop = khopNgoac(toks);
  const thua = toks.findIndex((t, i) => t === ")" && khop[i] < 0);
  if (thua >= 0) return { loi: "Thừa dấu đóng ngoặc", idx: thua };
  const thieu = toks.findIndex((t, i) => t === "(" && khop[i] < 0);
  if (thieu >= 0) return { loi: "Thiếu dấu đóng ngoặc", idx: thieu };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!HAM_TACH_DONG.includes(t) || toks[i + 1] !== "(") continue;
    const n = tachThamSo(toks, khop, i + 1, khop[i + 1]).length;
    if (t === "if" && n !== 3) {
      return { loi: `Hàm if cần đủ 3 phần (điều kiện, nếu đúng, nếu sai) — đang có ${n}`, idx: i };
    }
    if (t !== "if" && n < 2) return { loi: `Hàm ${t} cần ít nhất 2 tham số`, idx: i };
  }
  return { loi: null, idx: null };
}
