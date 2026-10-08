// Nghỉ phép (module `nhan_su`). 3 tab:
//   • Đơn của tôi — NV tạo đơn xin nghỉ + xem/hủy đơn của mình (self-service).
//   • Duyệt đơn (HR) — chờ duyệt → duyệt / từ chối; xem toàn bộ.
//   • Loại nghỉ (HR) — khai loại nghỉ (có lương / hạn mức).
// (tách từ pages/NghiPhepPage.tsx).
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../../../auth/useAuth";
import { useCan, useSelfService } from "../../../auth/permissions";
import { ApproveTab } from "./tabs/ApproveTab";
import { CalendarTab } from "./tabs/CalendarTab";
import { LeaveTypesTab } from "./tabs/LeaveTypesTab";
import { MyLeaveTab } from "./tabs/MyLeaveTab";
import type { Tab } from "./shared/types";
import "../../nhan-su.css";
import "../../cham-cong.css";
import "../../nghi-phep.css";

export function NghiPhepPage({ onChanged, focusEmployeeId, eventTick }: {
  onChanged?: () => void; focusEmployeeId?: number;
  /** Nhích theo MỌI sự kiện SSE ⇒ tab đang mở tự tải lại khi bên kia gửi / duyệt / xin hủy đơn. */
  eventTick?: number;
}) {
  const { token } = useAuth();
  const can = useCan();
  // Quyền DUYỆT đơn — HCNS/Admin, VÀ tổ trưởng (chủ chốt 29/07/2026: tổ trưởng duyệt đơn trong
  // tổ mình). Dùng cho tab "Duyệt đơn" + "Lịch nghỉ".
  const canManage = can("nghi_phep", "approve");
  // Ô TỰ PHỤC VỤ (đợt 3) — quản trị TẮT ĐƯỢC. Không hỏi thì tắt xong nút vẫn bày ra, bấm
  // mới ăn 403: trông như hệ thống hỏng chứ không như "anh không có quyền".
  const tuPhucVu = useSelfService();
  // Ô THAO TÁC của Tự phục vụ — TÁCH khỏi ô Xem ngày 11/08/2026. Tab/danh sách đi theo ô
  // Xem; còn nút GỬI · SỬA · HUỶ thì đi theo ô này.
  // GHI LÀ GHI — gửi / sửa / huỷ đơn của CHÍNH MÌNH vẫn đòi ô Thao tác của màn Nghỉ phép
  // (chủ chốt 15/08/2026: *"tôi chưa bật thao tác vẫn bấm gửi đơn được nè"*). Chỉ phần ĐỌC dữ
  // liệu của mình mới là quyền đương nhiên.
  const tuPhucVuGhi = can("nghi_phep", "create");
  // HUỶ / XIN HUỶ / RÚT LẠI đơn của mình: máy chủ đòi ô `cancel` (hoặc ô Duyệt — người duyệt huỷ
  // hộ) — `routers/leaves.py` `SelfOrApprover`. Trước 05/10/2026 nút "Hủy đơn" hiện vô điều kiện
  // còn ma trận không có ô `cancel` ⇒ nhân viên thường bấm là ăn 403.
  const coQuyenHuy = can("nghi_phep", "cancel") || canManage;
  // Danh mục LOẠI NGHỈ là chính sách TOÀN CÔNG TY, chỉ HCNS/Admin. Phải gác bằng `update` cho
  // KHỚP backend (`routers/leaves.py` gác 3 endpoint /types bằng `update`) — gác bằng `approve`
  // là tổ trưởng (approve=true, update=false) nhìn thấy tab, mở ra, bấm lưu rồi ăn 403: màn
  // mời-rồi-đuổi, người dùng tưởng mình có quyền.
  // Danh mục LOẠI NGHỈ có ô riêng từ 15/08/2026 (mg 0197) — trước đó nó dùng chung cột với nút
  // "Thao tác", nên bật Thao tác (để thợ gửi/huỷ đơn của mình) là mở luôn quyền sửa chính sách
  // nghỉ của cả nhà máy.
  const canTypes = can("nghi_phep", "manage_leave_types");
  // Ai bị gỡ ô Tự phục vụ thì mở thẳng tab Duyệt — không thì vào màn là thấy tab trống.
  const [tab, setTab] = useState<Tab>("me");

  // Liên thông từ Hồ sơ NV → mở "Duyệt đơn" lọc đúng NV đó.
  useEffect(() => {
    if (focusEmployeeId && canManage) setTab("approve");
  }, [focusEmployeeId, canManage]);

  // Loại nghỉ theo quyền riêng (khác 3 phần trên dùng APPROVE) — giữ đúng phân quyền, đừng gộp về canManage.
  const phan: [Tab, string][] = ([
    ["me", "Đơn của tôi", tuPhucVu],
    ["approve", "Duyệt đơn", canManage],
    ["calendar", "Lịch nghỉ", canManage],
    ["types", "Loại nghỉ", canTypes],
  ] as [Tab, string, boolean][]).filter(([, , co]) => co).map(([k, nhan]) => [k, nhan]);
  // Bị gỡ ô Tự phục vụ thì "Đơn của tôi" không có ⇒ mở phần đầu tiên còn quyền, không để màn trống.
  const dang: Tab | undefined = phan.some(([k]) => k === tab) ? tab : phan[0]?.[0];

  // Đầu trang khuôn lưới chung (08/10/2026, như Tăng ca / Tài sản): tên màn + nút chuyển phần dạng
  // viên thay hàng tab gạch dưới + nút chính dạt phải. Mỗi phần tự gài nút chính của mình qua `dau`.
  const dau = (phai?: ReactNode) => (
    <header className="lds-dau">
      <h1 className="lds-dau__ten">Nghỉ phép</h1>
      {phan.length > 1 && (
        <div className="lds-xem" role="group" aria-label="Phần của màn Nghỉ phép">
          {phan.map(([k, nhan]) => (
            <button key={k} type="button" className={`lds-xem__nut${dang === k ? " is-active" : ""}`}
              aria-pressed={dang === k} onClick={() => setTab(k)}>
              {nhan}
            </button>
          ))}
        </div>
      )}
      <div className="lds-dau__nut">{phai}</div>
    </header>
  );

  return (
    <main className="ns lds np-a">
      {dang === "me" && (
        <MyLeaveTab token={token!} dau={dau} onChanged={onChanged} coQuyenGhi={tuPhucVuGhi} coQuyenHuy={coQuyenHuy} eventTick={eventTick} />
      )}
      {dang === "approve" && <ApproveTab token={token!} dau={dau} onChanged={onChanged} focusEmployeeId={focusEmployeeId} eventTick={eventTick} />}
      {dang === "calendar" && <CalendarTab token={token!} dau={dau} />}
      {dang === "types" && <LeaveTypesTab token={token!} dau={dau} />}
      {!dang && dau()}
    </main>
  );
}
