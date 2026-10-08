// Tab KHẤU HAO TỪNG THÁNG — chọn tháng, nhìn bảng, xuất Excel. Hết.
//
// Từ 08/09/2026 KHÔNG còn kỳ (chủ: "nó chỉ theo dõi khấu hao thôi"): không nút Tính, không Chốt,
// không Mở lại. Máy chủ dựng bảng tại chỗ từ lịch của từng tài sản, hỏi lại tháng nào cũng ra
// đúng một số; "Đã khấu hao" ở tab Tài sản là cộng dồn chính lịch ấy tới hết tháng trước.
// Cầu nối sang phần mềm kế toán vẫn là file Excel — kế toán đọc rồi tự gõ định khoản. File Excel
// giữ tiêu đề cột chuẩn kế toán; chỉ chữ TRÊN MÀN đổi theo spec 05/10/2026 mục 3.
//
// 08/10/2026: bảng đổi sang lưới danh sách chung `lds-g` trong `lds-sheet` (giống các danh sách
// Kinh doanh); phần trên (chọn tháng, tổng tháng, Chép số, Xuất Excel) giữ nguyên.
//
// Hai tab phải NỐI với nhau (chủ 08/09: "bớt 1 tấm mà bảng tháng vẫn điền 26.400.000, khó hiểu"):
// tháng nào có chuyện thì cột Ghi chú tháng có chip câu ngắn máy chủ viết sẵn, và bấm vào dòng là
// mở đúng ngăn chi tiết như bên tab Tài sản.
//
// Thiết kế lại 05/10/2026 (`2026-10-05-tai-san-ui-ux-tung-man.md`, màn 10): tổng tháng — con số kế
// toán chép đi — lên ĐẦU, chữ to, có nút Chép số; mũi tên đổi tháng khỏi mở bộ chọn; tiêu đề cột
// một dòng ("Khấu hao tháng", "Còn lại" — tháng đã ghi to ở trên).
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { taiSanApi, type BangThang } from "../../api/taiSan";
import { useAuth } from "../../auth/useAuth";
import { useCan } from "../../auth/permissions";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icons";
import { MonthPicker } from "../../components/MonthPicker";
import { CuonLuoi, rongLuoi, soCotGhim, type CotLuoi } from "../../components/LuoiDs";
import { EmptyRow } from "../../components/EmptyState";
import { ChiTietDialog } from "./ChiTietDialog";
import { THANG_NAY, taiXuong, tien, tienDon } from "./chung";

interface CotThang extends CotLuoi {
  w?: number;
  n?: boolean;
  tip?: string;
}

/** Mã và Tên cố định (ghim khi cuộn ngang); Ghi chú tháng là cột cuối co giãn. */
const COT_THANG: CotThang[] = [
  { key: "ma", label: "Mã", coDinh: true, w: 90 },
  { key: "ten", label: "Tên", coDinh: true, w: 220 },
  { key: "bo_phan", label: "Bộ phận", w: 140 },
  { key: "gia", label: "Giá mua", n: true, w: 122 },
  { key: "muc", label: "Khấu hao tháng", n: true, w: 130 },
  { key: "luy_ke", label: "Đã khấu hao", n: true, w: 122 },
  { key: "con_lai", label: "Còn lại", n: true, w: 122, tip: "Giá trị còn lại" },
  { key: "ghi_chu", label: "Ghi chú tháng" },
];

export function KhauHaoThangView() {
  const { token } = useAuth();
  const can = useCan();
  const xuatDuoc = can("tai_san", "update"); // khớp `tai_san.py` `_XUAT` (ô Thao tác)

  const [thangChon, setThangChon] = useState(THANG_NAY);
  const [bang, setBang] = useState<BangThang | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [ban, setBan] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [xemId, setXemId] = useState<number | null>(null);
  const [daChep, setDaChep] = useState(false);

  const [nam, thang] = thangChon.split("-").map(Number);

  /** Đánh số từng lượt nạp, lượt cũ về sau thì VỨT.
   *
   *  Ô tháng là `input[type=month]`: gõ "03/2026" là bốn năm lần `onChange`, mỗi lần một lượt
   *  GET. Các lượt ấy về không theo thứ tự gửi — bảng tháng 09 về sau bảng tháng 03 là màn hình
   *  ghi "Tháng 3 / 2026" mà số bên dưới của tháng 9. Không lỗi, không quay vòng, kế toán chép
   *  nhầm số vào phần mềm kế toán mà không có gì gợn. */
  const lanNap = useRef(0);

  const nap = useCallback(() => {
    if (!token || !nam || !thang) return;
    const lan = ++lanNap.current;
    const conDung = () => lan === lanNap.current;
    setDangTai(true);
    setLoi(null);
    taiSanApi
      .bangThang(token, nam, thang)
      .then((kq) => { if (conDung()) setBang(kq); })
      .catch((e) => {
        if (conDung()) setLoi(e instanceof ApiError ? e.message : "Không tải được bảng tháng.");
      })
      .finally(() => { if (conDung()) setDangTai(false); });
  }, [token, nam, thang]);

  useEffect(() => { nap(); }, [nap]);

  async function xuatExcel() {
    if (!token) return;
    setBan(true);
    setLoi(null);
    try {
      const url = await taiSanApi.excelThang(token, nam, thang);
      taiXuong(url, `Bang khau hao ${String(thang).padStart(2, "0")}-${nam}.xlsx`);
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không xuất được Excel.");
    } finally {
      setBan(false);
    }
  }

  const dong = bang?.items ?? [];
  const rong = dong.length === 0;
  const nhanThang = `${String(thang).padStart(2, "0")}/${nam}`;
  const soGhiChu = dong.filter((r) => r.su_kien.length > 0).length;

  /** Lùi / tới `n` tháng. */
  function doiThang(n: number) {
    const t = nam * 12 + (thang - 1) + n;
    setThangChon(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
  }

  // Tổng tháng là con số kế toán chép sang phần mềm kế toán — chép số TRẦN (không dấu chấm, không
  // "đ") để dán vào ô số bên kia là nhận ngay.
  async function chepSo() {
    try {
      await navigator.clipboard.writeText(String(bang?.tong_muc_trich ?? 0));
      setDaChep(true);
      window.setTimeout(() => setDaChep(false), 2000);
    } catch {
      setLoi("Trình duyệt không cho chép. Bôi đen con số rồi chép tay.");
    }
  }

  const viTri = xemId === null ? -1 : dong.findIndex((r) => r.tai_san_id === xemId);

  return (
    <>
      <div className="ts-thangbar">
        <div className="ts-thang">
          <button type="button" className="ts-nut-icon" aria-label="Tháng trước" title="Tháng trước"
            disabled={ban} onClick={() => doiThang(-1)}>
            <Icon name="chevron" size={16} className="ts-xoay-trai" />
          </button>
          <MonthPicker value={thangChon} onChange={setThangChon} ariaLabel="Chọn tháng" disabled={ban}
            className="ts-thang__chon" />
          <button type="button" className="ts-nut-icon" aria-label="Tháng sau" title="Tháng sau"
            disabled={ban} onClick={() => doiThang(1)}>
            <Icon name="chevron" size={16} className="ts-xoay-phai" />
          </button>
        </div>
        {thangChon !== THANG_NAY && (
          <Button variant="ghost" type="button" onClick={() => setThangChon(THANG_NAY)}>Tháng này</Button>
        )}
        <div className="ts-loc__phai">
          {xuatDuoc && (
            <Button variant="secondary" disabled={ban || rong} onClick={xuatExcel}>
              <Icon name="fileText" size={15} /> Xuất Excel
            </Button>
          )}
        </div>
      </div>

      {loi && (
        <div className="banner banner--error" role="alert" style={{ marginBottom: "var(--sp-4)" }}>
          {loi}
        </div>
      )}

      <div className="ts-tongthang">
        <div>
          <div className="ts-tongthang__nhan">Tổng khấu hao tháng {nhanThang}</div>
          <div className="ts-tongthang__so">
            <span>{dangTai && !bang ? "…" : tienDon(bang?.tong_muc_trich)}</span>
            {!rong && (
              <Button variant="secondary" type="button" onClick={chepSo}
                title={`Chép số ${bang?.tong_muc_trich ?? 0} để dán sang phần mềm kế toán`}>
                <Icon name={daChep ? "check" : "copy"} size={14} /> {daChep ? "Đã chép" : "Chép số"}
              </Button>
            )}
          </div>
        </div>
        {!rong && (
          <div className="ts-phu">
            <span className="ts-phu-tag">{dong.length} tài sản</span>
            {soGhiChu > 0 && <span className="ts-phu-tag">{soGhiChu} có ghi chú tháng</span>}
          </div>
        )}
        <p className="ts-tongthang__chu">Phần mềm tự tính, không cần bấm gì. Bấm vào dòng để xem chi tiết.</p>
      </div>

      <div className="lds-sheet">
        <CuonLuoi ghim={soCotGhim(COT_THANG)}>
          <table className="lds-g" style={{ minWidth: rongLuoi(COT_THANG) }}>
            <colgroup>
              {COT_THANG.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
            </colgroup>
            <thead>
              <tr>
                {COT_THANG.map((c) => (
                  <th key={c.key} className={c.n ? "n" : undefined} title={c.tip}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dangTai && !bang ? (
                <EmptyRow colSpan={COT_THANG.length} trangThai="dang-tai" />
              ) : rong ? (
                <tr>
                  <td colSpan={COT_THANG.length} className="lds-trong ts-trong-td">
                    <div className="ts-trong">
                      <h3>Tháng {nhanThang} không có tài sản nào khấu hao</h3>
                      <p>Chưa tới ngày bắt đầu dùng, đã khấu hao hết, hoặc đã thôi dùng từ trước.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {dong.map((r) => {
                    // Tháng thôi dùng máy chủ trả còn lại = 0 (món đã ra khỏi xưởng) — hiện "Đã
                    // khấu hao hết" là sai nghĩa; kế toán cần số còn lại lúc thôi dùng để ghi giảm.
                    const thoi = r.su_kien.some((s) => s.loai === "thoi_dung");
                    const conLai = thoi ? Math.max(r.nguyen_gia - r.luy_ke, 0) : r.con_lai;
                    return (
                      <tr key={r.tai_san_id} tabIndex={0}
                        className={`lds-dong${xemId === r.tai_san_id ? " is-chon" : ""}`}
                        onClick={() => setXemId(r.tai_san_id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setXemId(r.tai_san_id);
                          }
                          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                            e.preventDefault();
                            const ke = (e.key === "ArrowDown" ? e.currentTarget.nextElementSibling
                              : e.currentTarget.previousElementSibling) as HTMLElement | null;
                            if (ke?.classList.contains("lds-dong")) ke.focus();
                          }
                        }}>
                        <td className="lds-mu" title={r.ma}>{r.ma}</td>
                        <td title={r.ten}>
                          {r.ten}
                          {r.so_luong > 1 && <>{" "}<span className="lds-tag">{r.so_luong} cái</span></>}
                        </td>
                        <td className={r.bo_phan_ten ? undefined : "lds-mu"} title={r.bo_phan_ten ?? undefined}>
                          {r.bo_phan_ten ?? "Chưa chọn"}
                        </td>
                        <td className="n">{tien(r.nguyen_gia)}</td>
                        <td className="n">{tien(r.muc_trich)}</td>
                        <td className="n">{tien(r.luy_ke)}</td>
                        <td className={conLai <= 0 ? "n lds-mu" : "n"} title={thoi ? "Còn lại lúc thôi dùng" : undefined}>
                          {tien(conLai)}
                        </td>
                        <td>
                          {/* Chip ngắn, câu đầy đủ ở tooltip và ngăn chi tiết — không chèn cả câu vào
                              bảng kẻo dòng cao gấp ba (chủ 08/09: "xấu"). */}
                          {r.su_kien.length > 0 && (
                            <div className="ts-chips">
                              {r.su_kien.map((s, i) => (
                                <span key={i} className={`ts-chip ts-chip--${s.loai}`} title={s.chi_tiet}>
                                  {s.nhan}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Dòng TỔNG: đây là con số kế toán chép sang phần mềm kế toán. */}
                  <tr className="lds-cong lds-nhom">
                    <td className="lead" colSpan={4}>
                      <span className="lds-dinh-trai">Tổng tháng {nhanThang} ({dong.length} tài sản)</span>
                    </td>
                    <td className="n">{tien(bang?.tong_muc_trich)}</td>
                    <td colSpan={3} />
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </CuonLuoi>
      </div>

      {token && xemId !== null && (
        <ChiTietDialog token={token} taiSanId={xemId} onClose={() => setXemId(null)} onChanged={nap}
          onTruoc={viTri > 0 ? () => setXemId(dong[viTri - 1].tai_san_id) : undefined}
          onSau={viTri >= 0 && viTri < dong.length - 1 ? () => setXemId(dong[viTri + 1].tai_san_id) : undefined} />
      )}
    </>
  );
}
