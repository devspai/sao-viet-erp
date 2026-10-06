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
import { useState } from "react";
import { DanhSachView } from "./DanhSachView";
import { KhauHaoThangView } from "./KhauHaoThangView";
import "../rebuild-catalog.css";
import "./tai-san.css";

type Tab = "so" | "thang";

export function TaiSanPage() {
  const [tab, setTab] = useState<Tab>("so");

  return (
    <div className="rc ts">
      <div className="rc__head">
        <div className="rc__headrow">
          <h1 className="rc__title">Tài sản & Công cụ dụng cụ</h1>
        </div>
        <p className="rc__sub">
          Máy móc và dụng cụ xưởng mua về dùng nhiều năm. Nhập một lần, phần mềm tự chia giá mua
          ra từng tháng.
        </p>
      </div>

      <div className="rc__tabs">
        <button className={`rc__tab${tab === "so" ? " is-active" : ""}`}
          onClick={() => setTab("so")}>
          Tài sản
        </button>
        <button className={`rc__tab${tab === "thang" ? " is-active" : ""}`}
          onClick={() => setTab("thang")}>
          Khấu hao từng tháng
        </button>
      </div>

      {tab === "so" && <DanhSachView onXemThang={() => setTab("thang")} />}
      {tab === "thang" && <KhauHaoThangView />}
    </div>
  );
}
