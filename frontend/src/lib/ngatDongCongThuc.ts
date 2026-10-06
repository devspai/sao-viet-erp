// Ngắt một câu công thức dài thành nhiều dòng để ĐỌC được — dùng chung cho bảng giá vốn (Tính giá)
// và bong bóng công thức (`CongThucTip`). Tách khỏi PhieuTinhGiaDetailView ngày 06/10/2026.
import { HAM_TOAN } from "../pages/danh-muc/formulaTokens";

/** Câu hàm dài hơn mức này (ký tự) mới ngắt dòng — `max ( a , b )` ngắn đứng một dòng là đọc được. */
const NGAT_KHI_DAI = 70;

/** Ngắt một lời gọi hàm thành nhiều dòng, các vế thụt vào một bậc, hàm lồng thì thụt tiếp.
 *  KHÔNG đổi chữ nào của công thức — chỉ chèn chỗ xuống dòng.
 *  · `if ( đk , đúng , sai )`: LUÔN ngắt, điều kiện đứng cùng dòng với `if`.
 *  · hàm khác (`max`, `min`…): chỉ ngắt khi câu dài quá `NGAT_KHI_DAI`, mỗi vế một dòng.
 *  Câu không phải TRỌN MỘT lời gọi hàm (`a + max(...)`), hoặc ngoặc lệch, thì trả nguyên một dòng. */
export function ngatDongIf(s: string, sau = 0): { sau: number; text: string }[] {
  const t = s.trim();
  const motDong = [{ sau, text: t }];
  const m = /^([a-zA-Z_]+)\s*\(/.exec(t);
  if (!m || !(m[1] === "if" || (HAM_TOAN as readonly string[]).includes(m[1]))) return motDong;
  const laIf = m[1] === "if";
  if (!laIf && t.length <= NGAT_KHI_DAI) return motDong;
  // Ngoặc mở của hàm phải đóng đúng ở ký tự cuối — `max(...) + 5` thì để nguyên một dòng.
  let sauNgoac = 0;
  const phay: number[] = [];
  for (let i = m[0].length - 1; i < t.length; i++) {
    const c = t[i];
    if (c === "(") sauNgoac++;
    else if (c === ")") {
      sauNgoac--;
      if (sauNgoac === 0 && i !== t.length - 1) return motDong;
    } else if (c === "," && sauNgoac === 1) phay.push(i);
  }
  if (sauNgoac !== 0 || (laIf && phay.length !== 2)) return motDong;
  const cat = [m[0].length, ...phay.map((p) => p + 1)];
  const ve = cat.map((dau, k) => t.slice(dau, k < phay.length ? phay[k] : -1).trim());
  const dau = laIf ? [{ sau, text: `if ( ${ve[0]} ,` }] : [{ sau, text: `${m[1]} (` }];
  const con = (laIf ? ve.slice(1) : ve).map((v, k, arr) => {
    const dong = ngatDongIf(v, sau + 1);
    dong[dong.length - 1].text += k < arr.length - 1 ? " ," : " )";
    return dong;
  });
  return [...dau, ...con.flat()];
}
