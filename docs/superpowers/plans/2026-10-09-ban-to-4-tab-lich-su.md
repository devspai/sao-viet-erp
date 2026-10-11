# Bàn tổ 4/4 — Tab Lịch sử của công việc

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab "Lịch sử" trong ngăn công việc liệt kê mọi việc đã xảy ra với công việc này (chạy máy, người và khuôn, sản lượng, bàn giao, vật tư, KCS), mới nhất trên cùng, có chip lọc nhóm, mỗi dòng ghi câu dễ hiểu + người + giờ.

**Architecture:** Endpoint mới `GET /api/san-xuat/work-items/{cong_viec_id}/lich-su` gom `audit_logs` của MỌI target gắn với công việc (bản thân công việc, các mẻ, các lần bàn giao đi/đến, các đề nghị vật tư, phiếu xuất đã nhận, lần kiểm/lỗi KCS, hỗ trợ chéo) bằng `AuditLogRepository.list_by_targets`, thêm mốc "Tổ nhận lệnh" từ `created_at` của công việc; mỗi dòng dựng câu ở máy chủ từ đối tượng hiện có (không parse chuỗi detail nếu đọc được từ bảng). Nhóm lọc là thuộc tính máy chủ trả về. FE vẽ dòng thời gian theo khối `.tl/.ev` của mockup.

**Tech Stack:** FastAPI, SQLAlchemy, `audit_registry.py`, React + TS.

**Spec:** `docs/mockups/ban-to-ngan-B-day-du.html` hàm `P.ls` (chip Tất cả / Chạy máy / Người và khuôn / Sản lượng / Bàn giao / Vật tư / KCS; dòng: chấm màu, câu, dòng phụ là các thẻ nhỏ, lý do dòng riêng, giờ bên phải); `docs/mockups/ban-to-ngan-A-tinh-chinh.html` pane `ls`.

## Global Constraints

- Nhãn hành động lấy từ `audit_registry.py` (nguồn nhãn duy nhất); hành động chưa đăng ký thì đăng ký vào registry, guard `test_audit_registry.py` phải xanh.
- Quyền: đúng phạm vi ĐỌC của chi tiết công việc (`board._pham_vi_doc` như `chi_tiet_cong_viec`); không mở qua quyền Nhật ký. 403 khi ngoài phạm vi, 404 khi không có công việc.
- Tiền không hiện ở Lịch sử (đơn giá khoán, giá vật tư) — chỉ số lượng.
- Tên người lấy `actor_name_luc_do` / `actor_labels` như `/api/lsx/{id}/activity`.
- Không "·"/dấu phẩy nối mẩu dữ liệu: các mẩu phụ là danh sách `ct: string[]`, FE vẽ thành thẻ nhỏ.
- KHÔNG chạy `./init.ps1`; pytest nhắm file, `npx tsc --noEmit -p .`, `npx vitest run <file>`. Không stash/checkout; không commit trừ khi được bảo.

---

### Task 1: Dịch vụ + endpoint lịch sử (backend)

**Files:**
- Create: `backend/app/services/san_xuat/lich_su_viec.py`
- Modify: `backend/app/routers/san_xuat.py` (route `GET /work-items/{cong_viec_id}/lich-su`, đặt cạnh GET chi tiết L549)
- Modify: `backend/app/schemas/san_xuat.py` (`LichSuViecOut`)
- Modify: `backend/app/audit_registry.py` (chỉ khi có action chưa đăng ký)
- Test: `backend/tests/test_lich_su_cong_viec.py`

**Interfaces:**
- Consumes: `AuditLogRepository(db).list_by_targets(targets, actions=None)` (L304) — đọc chữ ký thật, nếu `actions` bắt buộc thì truyền `None`/bỏ; `audit_registry.tra(action, target)`.
- Produces:
```python
NHOM_LS = ("chay_may", "nguoi_khuon", "san_luong", "ban_giao", "vat_tu", "kcs", "khac")

class LichSuDongOut(BaseModel):
    luc: datetime            # wall-clock, cùng khuôn giờ các mốc khác của ngăn
    nhom: str                # một trong NHOM_LS
    cau: str                 # "Ghi mẻ 80 tờ in tốt"
    ct: list[str] = []       # ["Máy cắt tờ ITO 100", "Đào Văn Hoan"]
    ly_do: str | None = None # "Chuyển sang máy Kyodo cho kịp lệnh 0003"
    mau: str                 # "g" xanh lá (làm ra) | "b" xanh dương (gửi đi/đề nghị) | "r" đỏ (lỗi/sự cố) | "" xám

class LichSuViecOut(BaseModel):
    items: list[LichSuDongOut]
    dem: dict[str, int]      # số dòng theo nhóm, cho chip lọc

def lich_su(db, user, *, cong_viec_id: int) -> dict
```
Target cần gom (đọc id từ các bảng, KHÔNG quét detail toàn bảng audit):
- `san_xuat_cong_viec:{id}`
- `san_xuat_batch:{b.id}` cho mọi mẻ của công việc
- `san_xuat_ban_giao:{bg.id}` cho mọi bàn giao có `nguon_cong_viec_id == id` hoặc `dich_cong_viec_id == id`
- `san_xuat_vat_tu_de_nghi:{dn.id}` cho mọi đề nghị của công việc
- `stock_voucher:{v}` cho phiếu xuất vật tư gắn với công việc (lấy từ dữ liệu `vat_tu` của chi tiết — `vat_tu_nhan`), chỉ action `san_xuat_xac_nhan_vat_tu`
- `san_xuat_kcs_batch:{k.id}` các lần kiểm của công việc; `san_xuat_kcs_loi:{l.id}` lỗi quy về công việc (cùng luật `cong_doan_ref_id` như `board._cv_cho_xac_nhan`)
- `san_xuat_ho_tro:{h.id}` hỗ trợ chéo của công việc
Bảng câu (action → nhóm, câu, màu; số lấy từ đối tượng hoặc detail đã có khoá `key=value`):
- `san_xuat_bat_dau` → chay_may "Bắt đầu phiên N" g, ct [máy, người]; `san_xuat_tam_dung` → chay_may "Tạm dừng" "", ly_do = detail; `san_xuat_ket_thuc` → chay_may "Kết thúc việc" g; `san_xuat_doi_may` → chay_may "Đổi máy {cũ} sang {mới}" "".
- `san_xuat_phan_cong` → nguoi_khuon "Giao thợ {tên}"; `san_xuat_go_phan_cong` → "Rút thợ {tên}", ly_do nếu có; `san_xuat_nhan_khuon` → "Nhận khuôn {mã}"; `san_xuat_tra_khuon` → "Trả khuôn {mã} về kệ".
- `san_xuat_tao_batch` → san_luong "Ghi mẻ {tốt} {đơn vị} tốt" g (hỏng > 0 thì ct thêm "hỏng {n}"); `san_xuat_me_cap_nhat_danh_muc` → san_luong "Cập nhật mẻ theo danh mục".
- `san_xuat_ban_giao_de_xuat` → ban_giao "Đề xuất giao {sl} {đv} sang {bước đích}" b (trên công việc ĐÍCH đổi thành "Bước {nguồn} đề xuất giao {sl} {đv}"); `_xac_nhan` → "Xác nhận nhận {sl} {đv}" g; `_sua` → "Sửa mẻ của lần giao, {a} thành {b}"; `_dieu_chinh` → "Điều chỉnh số giao {a} thành {b}", ly_do = mô tả.
- `san_xuat_de_nghi_vat_tu` → vat_tu "Đề nghị cấp vật tư lần N" b, ct [món đầu + số, người]; `san_xuat_sua_de_nghi_vat_tu` → "Sửa đề nghị vật tư lần N"; `san_xuat_nhap_lai_vat_tu` → "Yêu cầu nhập lại vật tư thừa"; `san_xuat_xac_nhan_vat_tu` → "Xác nhận nhận vật tư {mã phiếu}"; `san_xuat_kho_yeu_cau_nhap` → "Đề nghị nhập kho thành phẩm".
- `san_xuat_kcs_kiem` → kcs "KCS kiểm {đạt} đạt {lỗi} lỗi" (lỗi > 0 ⇒ r); `san_xuat_kcs_da_xem_loi` → kcs "Tổ đã xem lỗi KCS".
- `san_xuat.ho_tro.de_xuat/.xac_nhan/.huy/.huy_phat_hanh_lai` → nguoi_khuon "Đề xuất hỗ trợ {thợ} từ {tổ}" / "Xác nhận hỗ trợ …" / "Huỷ hỗ trợ …" (ly_do).
- Action khác của các target trên → khac, câu = `audit_registry.tra(...).nhan`.
- Mốc tổng hợp không từ audit: "Tổ nhận lệnh" lúc `cv.created_at`, ct ["Gói phát hành {n}"] nếu có số gói.
Câu phải viết từ dữ liệu bảng hiện tại khi đối tượng còn (tên máy, tên bước, đơn vị); đối tượng đã xoá thì rơi về nhãn registry. Gom tra cứu theo lô (một truy vấn mỗi loại đối tượng), không N+1.

- [ ] **Step 1: Test** (dùng fixture công việc có phân công + mẻ + bàn giao trong `test_san_xuat_thuc_thi.py` / `test_san_xuat_board.py` — import hoặc dựng lại tối thiểu bằng service thật: `thuc_thi.phan_cong`, `thuc_thi.bat_dau`, `san_luong.tao_batch`, `ban_giao.de_xuat`):
```python
def test_lich_su_gom_du_cac_nguon_moi_nhat_tren(db, ...):
    # phân công → bắt đầu → ghi mẻ 80 → đề xuất giao 80
    ra = lich_su_viec.lich_su(db, tt, cong_viec_id=cv.id)
    caus = [d["cau"] for d in ra["items"]]
    assert caus[0].startswith("Đề xuất giao 80")
    assert any(c.startswith("Ghi mẻ 80") for c in caus)
    assert any(c.startswith("Bắt đầu phiên 1") for c in caus)
    assert caus[-1] == "Tổ nhận lệnh"
    assert ra["dem"]["san_luong"] == 1 and ra["dem"]["ban_giao"] == 1

def test_lich_su_cong_viec_dich_thay_cau_phia_nhan(db, ...): ...
def test_tam_dung_co_ly_do(db, ...): ...  # ly_do == lý do đã gõ
def test_ngoai_pham_vi_thi_permission_error(db, ...): ...
def test_api_404_khi_khong_co_cong_viec(client, ...): ...
def test_khong_hien_tien(db, ...):        # không dòng nào chứa "đ" đơn giá khoán
```
- [ ] **Step 2:** `python -m pytest tests/test_lich_su_cong_viec.py -q` → FAIL.
- [ ] **Step 3:** cài service + schema + router (`PermissionError`→403, không thấy→404).
- [ ] **Step 4:** PASS; `python -m pytest tests/test_audit_registry.py -q` xanh.

---

### Task 2: Tab Lịch sử (frontend)

**Files:**
- Modify: `frontend/src/api/client.ts` (type `SxLichSuViec`, `api.sanXuat.lichSuViec(token, congViecId)`)
- Create: `frontend/src/pages/thsx/ThsxTabLichSu.tsx`
- Modify: `frontend/src/pages/ThsxDrawer.tsx` (tab `ls` — kế hoạch 3/4 Task 3 đã có tab; nếu chưa thì gắn vào tab cuối hiện có)
- Modify: `frontend/src/pages/thuc-hien-sx.css` (khối `.thsx-ls`)
- Test: `frontend/src/pages/thsx/ThsxTabLichSu.test.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces: `ThsxTabLichSu({ congViecId, tick }: { congViecId: number; tick?: number })` — nạp khi mở tab và khi `tick` đổi (cùng `eventTick` SSE mà ngăn đang nhận, để lịch sử tự cập nhật không cần F5).

Đầu khối: "Lịch sử" + "N việc" + hàng chip Tất cả / Chạy máy / Người và khuôn / Sản lượng / Bàn giao / Vật tư / KCS (chip nhóm có 0 dòng vẫn hiện nhưng mờ; chọn là lọc tại chỗ — đây là lọc hiển thị trên đúng một công việc, không phải danh sách bản ghi có phân trang). Dòng: chấm màu theo `mau`, câu, các thẻ nhỏ `ct`, `ly_do` dòng riêng chữ mờ, giờ `dd/MM HH:mm` bên phải. Rỗng ⇒ "Chưa có việc gì được ghi lại." Lỗi nạp ⇒ câu lỗi + "Thử lại". Điện thoại: giờ xuống dưới câu, hàng chip cuộn ngang.

- [ ] Step 1: test — mock `api.sanXuat.lichSuViec` trả 3 dòng 2 nhóm: hiện "3 việc"; bấm chip "Sản lượng" chỉ còn dòng nhóm đó; `ly_do` hiện; rỗng ra câu rỗng. Step 2: FAIL. Step 3: cài. Step 4: PASS + `tsc`.

---

### Task 3: Bấm thử thật

- [ ] Restart uvicorn. Mở một việc vừa chạy ở Task 9 kế hoạch 3/4 → tab Lịch sử: thấy đủ Tổ nhận lệnh, Giao thợ, Bắt đầu phiên, Ghi mẻ, Đề xuất giao, Tạm dừng có lý do… mới nhất trên cùng.
- [ ] Bấm chip "Bàn giao" chỉ còn dòng bàn giao; "Tất cả" lại đủ.
- [ ] Để ngăn mở ở tab Lịch sử, từ tài khoản khác xác nhận lần giao ⇒ dòng "Xác nhận nhận …" hiện không cần F5.
- [ ] Báo cáo từng bước đã bấm/thấy.
