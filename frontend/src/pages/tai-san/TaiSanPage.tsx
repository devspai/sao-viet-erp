// Màn TÀI SẢN & CÔNG CỤ DỤNG CỤ (kế toán).
//
// Phạm vi CỐ Ý HẸP (chủ 08/09/2026: "nó chỉ theo dõi khấu hao thôi"): thêm tài sản · khấu hao
// từng tháng · chuyển bộ phận · sửa chữa lớn · thôi dùng. Không định khoản, không sổ cái, không
// nhóm tài sản khai sẵn, không kỳ chốt, không kiểm kê. Cầu nối sang phần mềm kế toán là file Excel
// khấu hao tháng — người ta đọc rồi tự gõ; muốn nhớ định khoản thì ghi vào ô ghi chú.
//
// Làm lại 05/10/2026 cho đơn giản, dễ hiểu, dễ dùng: `docs/superpowers/specs/
// 2026-10-05-tai-san-lam-lai-design.md`. Chữ trên màn theo bảng "Cách dùng từ" của spec.
//
// MỘT màn hai tab chứ không hai mục menu: cả hai đọc cùng một sổ, và người làm việc này đi qua
// lại giữa chúng trong cùng một buổi (thêm tài sản xong là xem khấu hao tháng).
//
// Gọn theo phương án A 07/10/2026: một hàng đầu màn — tiêu đề, nhóm nút "Tài sản | Khấu hao từng
// tháng" thay hàng tab riêng, nút Thêm sát phải (tab Tài sản gài vào qua `dau`).
// 08/10/2026: khung `lds` + `lds-dau` của lưới danh sách chung (như các danh sách Kinh doanh).
import { useState, type ReactNode } from "react";
import { DanhSachView } from "./DanhSachView";
import { KhauHaoThangView } from "./KhauHaoThangView";
import "../rebuild-catalog.css";
// Lớp `kt-g__nhom` của dòng nhóm (DanhSachView) — mọi lớp của file này tiền tố `kt-`, không đụng lớp `ts-`.
import "../ke-toan/ke-toan.css";
import "./tai-san.css";

type Tab = "so" | "thang";

const TAB: [Tab, string][] = [["so", "Tài sản"], ["thang", "Khấu hao từng tháng"]];

export function TaiSanPage() {
  const [tab, setTab] = useState<Tab>("so");

  const dau = (phai?: ReactNode) => (
    <header className="lds-dau">
      <h1 className="lds-dau__ten">Tài sản và công cụ dụng cụ</h1>
      <div className="ts-seg" role="group" aria-label="Phần của màn">
        {TAB.map(([k, nhan]) => (
          <button key={k} type="button" aria-pressed={tab === k} className={tab === k ? "on" : undefined}
            onClick={() => setTab(k)}>
            {nhan}
          </button>
        ))}
      </div>
      <div className="lds-dau__nut">{phai}</div>
    </header>
  );

  return (
    <div className="rc ts lds">
      {tab === "so" && <DanhSachView dau={dau} />}
      {tab === "thang" && (
        <>
          {dau()}
          <KhauHaoThangView />
        </>
      )}
    </div>
  );
}
