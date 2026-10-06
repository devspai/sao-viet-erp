// Tab KHẤU HAO TỪNG THÁNG — chọn tháng, nhìn bảng, xuất Excel. Hết.
//
// Từ 08/09/2026 KHÔNG còn kỳ (chủ: "nó chỉ theo dõi khấu hao thôi"): không nút Tính, không Chốt,
// không Mở lại. Máy chủ dựng bảng tại chỗ từ lịch của từng tài sản, hỏi lại tháng nào cũng ra
// đúng một số; "Đã khấu hao" ở tab Tài sản là cộng dồn chính lịch ấy tới hết tháng trước.
// Cầu nối sang phần mềm kế toán vẫn là file Excel — kế toán đọc rồi tự gõ định khoản. File Excel
// giữ tiêu đề cột chuẩn kế toán; chỉ chữ TRÊN MÀN đổi theo spec 05/10/2026 mục 3.
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
import { ChiTietDialog } from "./ChiTietDialog";
import { THANG_NAY, taiXuong, tien, tienDon } from "./chung";

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

      <div className="ts-bang">
        <table>
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên</th>
              <th>Bộ phận</th>
              <th className="ts-num">Giá mua</th>
              <th className="ts-num">Khấu hao tháng</th>
              <th className="ts-num">Đã khấu hao</th>
              <th className="ts-num" title="Giá trị còn lại">Còn lại</th>
              <th>Ghi chú tháng</th>
            </tr>
          </thead>
          <tbody>
            {dangTai && !bang ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} className="rc-skel__row">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j}><span className="rc-skel" style={{ width: "70%" }} /></td>
                  ))}
                </tr>
              ))
            ) : rong ? (
              <tr>
                <td colSpan={8} className="ts-trong-td">
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
                      className={`ts-dong${xemId === r.tai_san_id ? " is-chon" : ""}`}
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
                          if (ke?.classList.contains("ts-dong")) ke.focus();
                        }
                      }}>
                      <td className="ts-ma">{r.ma}</td>
                      <td>
                        <div className="ts-ten">{r.ten}</div>
                        {r.so_luong > 1 && (
                          <div className="ts-phu"><span className="ts-phu-tag">{r.so_luong} cái</span></div>
                        )}
                      </td>
                      <td className={r.bo_phan_ten ? "ts-bp" : "ts-bp ts-mo"}>{r.bo_phan_ten ?? "Chưa chọn"}</td>
                      <td className="ts-num">{tien(r.nguyen_gia)}</td>
                      <td className="ts-num ts-num--manh">{tien(r.muc_trich)}</td>
                      <td className="ts-num">{tien(r.luy_ke)}</td>
                      <td className="ts-num" title={thoi ? "Còn lại lúc thôi dùng" : undefined}>
                        <span className={conLai <= 0 ? "ts-mo" : undefined}>{tien(conLai)}</span>
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
                <tr className="ts-bang__tong">
                  <td colSpan={4}>Tổng tháng {nhanThang} ({dong.length} tài sản)</td>
                  <td className="ts-num">{tien(bang?.tong_muc_trich)}</td>
                  <td colSpan={3} />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {token && xemId !== null && (
        <ChiTietDialog token={token} taiSanId={xemId} onClose={() => setXemId(null)} onChanged={nap}
          onTruoc={viTri > 0 ? () => setXemId(dong[viTri - 1].tai_san_id) : undefined}
          onSau={viTri >= 0 && viTri < dong.length - 1 ? () => setXemId(dong[viTri + 1].tai_san_id) : undefined} />
      )}
    </>
  );
}
