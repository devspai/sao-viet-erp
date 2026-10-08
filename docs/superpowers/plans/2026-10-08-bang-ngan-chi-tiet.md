# Bảng trong ngăn / trang chi tiết theo lưới lds-g — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Mọi bảng CHỈ ĐỌC trong ngăn chi tiết (và trang chi tiết) của các module đã đổi lưới (trừ Nhân sự, Lương, Báo cáo, Nhật ký) dùng chung khuôn `lds-g` giống danh sách — user 08/10/2026: "mấy cái nhấn chi tiết vào mà có dạng bảng thì ăn theo ui/ux như hình cuối" (hình cuối = lưới danh sách Yêu cầu mua hàng).

**Architecture:** Kit đã có (controller làm, subagent KHÔNG sửa): `components/luoi-ds.css` thêm `.lds-bang` (khung thẻ bo góc, cuộn ngang khi cần, không ghim) và `:is(.lds, .lds-bang) .lds-g` cho luật đè; `components/LuoiDs.tsx` có `GoiYBang` gắn một lần ở AppShell — rê chuột lên ô bị cắt "…" hoặc có `title=` trong BẤT KỲ bảng nào hiện thẻ trắng (tên cột + đủ chữ, copy được). Mỗi task đổi bảng của một module sang `<div className="lds-bang"><table className="lds-g">`.

**Tech Stack:** React + TS + Vite, CSS thuần.

**Spec:** yêu cầu user ở trên + kiểm kê `.superpowers/sdd/2026-10-08-bang-ngan-chi-tiet/inventory.md` (53 bảng, theo mục).

## Global Constraints

- Khuôn: `<div className="lds-bang"><table className="lds-g">` + `<colgroup>` cho cột cố định; cột chữ chính để TRỐNG (co giãn). Không `minWidth` trừ khi tổng cột cố định vượt bề ngang ngăn thật.
- Lớp của kit: `.n` (số, căn phải), `.c` (giữa), `tr.lds-nhom` + `span.lds-dinh-trai` (dòng nhóm), `tr.lds-cong` (dòng Cộng), màu chữ trên ô `td.lds-do/lds-cam/lds-la/lds-vang/lds-mu/lds-mu3`, chip `ChipTT`, thẻ nhỏ `lds-tag`. Dòng bấm được: `tr.lds-dong`.
- Không đổi dữ liệu, cột, thứ tự cột, luật nghiệp vụ, API, onClick, nút trong ô, dòng gấp/mở, bảng lồng. Chỉ đổi khung + lớp CSS.
- Không chữ đậm cho mã/tên/tiêu đề; không nối mẩu dữ liệu bằng `·` hay dấu phẩy; UI tiếng Việt; không viền một cạnh; mỗi trạng thái một sắc.
- Gỡ `title=` thừa lặp đúng chữ của ô thì được (bong bóng tự hiện khi bị cắt); `title` mang thông tin KHÁC chữ ô thì giữ.
- CSS họ cũ chỉ xoá khi grep toàn `frontend/src` không còn ai dùng (form nhập liệu vẫn có thể dùng `kna-bang`, `kho-lines`, `mh-g`…). Không sửa responsive*.css.
- Không đụng form nhập liệu (ô có input/select), hộp thoại tạo/sửa, bản in.
- Không sửa `components/LuoiDs.tsx` / `luoi-ds.css`.

## Tasks

- ~~Task 1: Kinh doanh~~ — HUỶ 08/10: user "đừng làm ở kinh doanh" (kể cả ngăn Giao hàng).
- ~~Task 2: Sản xuất~~ — HUỶ 08/10: user chỉ làm Thu mua, Kế toán, Kho.
- Task 3: Kho — inventory §5 (ngăn vật tư, phiếu kho / yêu cầu kho).
- ~~Task 4: Kế hoạch vật tư~~ — HUỶ 08/10 (thuộc nhóm Sản xuất ở sidebar).
- Task 5: Kế toán — inventory §8 (gồm các bảng `kt-g` đổi sang `lds-g`).
- Task 6: Mua hàng — inventory §6 (giữ 3 điểm "Mua cho" phiên Mua hàng dặn, xem brief).

Mỗi task: vitest các file test của màn đụng tới; controller chạy tsc một lần mỗi đợt; review theo dispatch-review.md.
