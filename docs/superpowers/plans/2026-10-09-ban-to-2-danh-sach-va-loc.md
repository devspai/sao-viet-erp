# Bàn tổ 2/4 — Danh sách một dòng một việc + thanh lọc 6 điều kiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** View "Bảng" của bàn tổ thành lưới phẳng một dòng một công việc (9 cột như mockup, có dải "Hàng đang tới đâu" từng dòng), thanh lọc khuôn `ThanhLoc` có 6 điều kiện: Trạng thái, Việc chờ tổ bấm, Hàng đang tới đâu, Chưa bắt đầu được vì, Trễ giờ dự kiến, Người làm. Lọc và đếm ở MÁY CHỦ.

**Architecture:** Máy chủ thêm module `services/san_xuat/loc_ban_to.py` tính thuộc tính lọc cho từng công việc của tổ (vị trí hàng trên routing, lý do chưa bắt đầu được, trễ, người được giao, loại việc chờ). `board.work_items` dùng nó dựng tập `chi_cong_viec_ids` (đúng đường mà `cho_xac_nhan` đang đi) TRƯỚC khi cắt trang, nên trang vẫn cắt theo LỆNH. Endpoint mới `GET /work-items/loc-dem` trả số đếm cho menu lọc. FE bỏ tầng nhóm lệnh ở view Bảng, vẽ một bảng phẳng (lệnh lặp ở cột Lệnh), dải tuyến nhỏ tính từ `lenh.routing` sẵn có.

**Tech Stack:** FastAPI, SQLAlchemy, React + TS, `pages/thanh-loc/ThanhLoc`, `useCauHinhLuoi`, Vitest, pytest.

**Spec:** `docs/mockups/ban-to-ngan-A-tinh-chinh.html` — phần `.lw` (danh sách: thanh lọc, chip đếm, bảng 9 cột, chân trang, chú giải dải), mảng `DK` (6 điều kiện + kiểu), hàm `hienTai`/`cau`/`track` (luật vị trí hàng và câu chữ).

## Global Constraints

- UI tiếng Việt; không chữ đậm; không "·"/dấu phẩy nối dữ liệu; chip trạng thái dùng bộ `--tt-*` (chờ làm `xanh`, đang chạy `la`, tạm dừng `vang`, hoàn thành `slate` — giữ `MAU_TT` hiện có).
- Phân trang + lọc ở MÁY CHỦ; không cắt/lọc trang trong JS. Chân bảng `PhanTrangDayDu`. Lưới dùng `useCauHinhLuoi` (ẩn/thứ tự/độ rộng/ghim, nút Cột).
- Chữ "Xoá bộ lọc" chuẩn. Chấm "chờ" không số (không badge số trên tab).
- KHÔNG chạy `./init.ps1`; pytest nhắm file, `npx tsc --noEmit -p .`, `npx vitest run <file>`.
- Cây làm việc có nhiều thay đổi chưa commit của phiên khác ở `board.py`, `routers/san_xuat.py`, `schemas/san_xuat.py`, `client.ts`: chỉ Edit chèn đúng chỗ, không stash/checkout, không commit trừ khi được bảo.
- Thấy chậm là sửa: đo thời gian `/work-items` trước/sau trên DB dev (tổ nhiều việc nhất) và ghi vào báo cáo.

---

### Task 1: Thuộc tính lọc từng công việc (backend, thuần)

**Files:**
- Create: `backend/app/services/san_xuat/loc_ban_to.py`
- Test: `backend/tests/test_loc_ban_to_thuoc_tinh.py`

**Interfaces:**
- Consumes: `routing_dai.dung_routing(db, repo, khoa=, cv_cua_toi=)` → `{(loai,id): [ô]}` (ô có `thu_tu`, `trang_thai`, `cong_viec_id` ở bước của tổ); `dau_vao.thieu_dau_vao`, `chot_giay.ly_do_cho_chot`, `khuon_nhan_luc` trên cv, `SanXuatPhanCong` trạng thái hoạt động (`PC_HOAT_DONG`); `gio_xuong.gio_xuong()`; `board._cv_cho_xac_nhan` tách ba nguồn.
- Produces:
```python
TOI = ("toi", "con_1", "con_2_3", "con_4", "qua")          # Hàng đang tới đâu
VUONG = ("chua_giao_tho", "chua_nhan_khuon", "cho_chot_giay", "chua_nhan_buoc_truoc")
TRE = ("bat_dau", "xong")                                   # quá giờ bắt đầu mà chưa chạy / quá giờ xong mà chưa xong
CHO = ("ban_giao", "ho_tro", "kcs")

def vi_tri_hang(dai: list[dict], cong_viec_id: int) -> str | None:
    """Bước hàng đang ở = bước XA NHẤT đang chạy/tạm dừng; không có thì bước đầu chưa xong; tất cả
    xong thì bước cuối. So với bước của `cong_viec_id` (m): c>m 'qua', c==m 'toi', m-c==1 'con_1',
    2..3 'con_2_3', >=4 'con_4'. Dải rỗng/không thấy bước ⇒ None (bài ghép chưa có dải)."""

def thuoc_tinh(db, repo, rows: list, khoa: list[tuple[str, int | None]], *, can: set[str]) -> dict[int, dict]:
    """{cv_id: {"toi": str|None, "vuong": set[str], "tre": set[str], "nguoi": set[int], "cho": set[str]}}.
    `can` = những khoá thật sự cần tính ({"toi","vuong","tre","nguoi","cho"}) — khoá đắt (toi: dựng
    routing; vuong: chạy cổng từng việc) chỉ tính khi có trong `can`. `vuong` chỉ tính cho việc
    released/paused (việc đang chạy/hoàn thành không 'chưa bắt đầu được')."""
```
Luật `vuong` phải trùng đúng cổng nút Bắt đầu ở `thuc_thi.bat_dau` / ngăn (`canBatDau` trong `ThsxDrawer.tsx` L155-186): không phân công hoạt động ⇒ `chua_giao_tho`; `cv.khuon` có mà `khuon_da_nhan` false ⇒ `chua_nhan_khuon`; `ly_do_cho_chot` khác None ⇒ `cho_chot_giay`; `thieu_dau_vao` không rỗng và không chờ chốt ⇒ `chua_nhan_buoc_truoc`. Đọc `thuc_thi.bat_dau` để lấy đúng hàm, không tự viết lại luật.
Luật `tre`: `now = gio_xuong()`; `bat_dau` ⇔ `trang_thai == "released"` và chưa phiên chạy nào và `du_kien_bat_dau < now`; `xong` ⇔ `trang_thai != "completed"` và `du_kien_ket_thuc < now`. So sánh theo cùng khuôn giờ mà `board` dùng cho `du_kien_*` (đọc `lich_hien_thi`).

- [ ] **Step 1: Test `vi_tri_hang` (thuần, không DB)**
```python
from app.services.san_xuat.loc_ban_to import vi_tri_hang

def _dai(*tt, toi_o=1):
    return [{"thu_tu": i + 1, "trang_thai": t, "cong_viec_id": (99 if i + 1 == toi_o else None)}
            for i, t in enumerate(tt)]

def test_toi_khi_buoc_cua_to_dang_chay():
    assert vi_tri_hang(_dai("running", "released", "released", toi_o=1), 99) == "toi"

def test_con_2_3_buoc():
    assert vi_tri_hang(_dai("completed", "running", "released", "released", "released", toi_o=4), 99) == "con_2_3"

def test_con_1_buoc():
    assert vi_tri_hang(_dai("running", "released", toi_o=2), 99) == "con_1"

def test_con_4_buoc():
    assert vi_tri_hang(_dai("running", "released", "released", "released", "released", toi_o=5), 99) == "con_4"

def test_qua_khi_hang_da_o_buoc_sau():
    assert vi_tri_hang(_dai("completed", "running", "released", toi_o=1), 99) == "qua"

def test_chua_ai_chay_thi_lay_buoc_dau_chua_xong():
    assert vi_tri_hang(_dai("completed", "released", "released", toi_o=3), 99) == "con_1"

def test_xong_het_la_buoc_cuoi():
    assert vi_tri_hang(_dai("completed", "completed", toi_o=1), 99) == "qua"

def test_khong_co_dai():
    assert vi_tri_hang([], 99) is None
```
- [ ] **Step 2:** `python -m pytest tests/test_loc_ban_to_thuoc_tinh.py -q` → FAIL (module chưa có).
- [ ] **Step 3: Cài `vi_tri_hang`** (trạng thái `paused` tính như đang làm — hàng đang nằm ở bước đó).
- [ ] **Step 4: Test `thuoc_tinh` có DB** — dùng fixture `to_co_3_lenh_9_buoc`, `tho_chi_lam_lenh_thu_3`, `cap_quyen_to` từ `backend/tests/test_san_xuat_lenh_phan_trang.py` (import hoặc chép fixture vào conftest cục bộ của file test mới); kiểm: việc chưa phân công có `"chua_giao_tho"` trong `vuong`; giao 1 thợ thì hết; việc có `du_kien_ket_thuc` đặt lùi 1 giờ, chưa xong ⇒ `"xong"` trong `tre`; `nguoi` chứa `employee_id` đã giao; `can={"nguoi"}` thì `toi` là None (không dựng routing — đếm số lần gọi bằng monkeypatch `routing_dai.dung_routing`).
- [ ] **Step 5:** cài `thuoc_tinh`; PASS.

---

### Task 2: `/work-items` nhận 5 tham số lọc mới + `/work-items/loc-dem` (backend)

**Files:**
- Modify: `backend/app/services/san_xuat/board.py` (`work_items` L451-570, `_cv_cho_xac_nhan` L633 → trả thêm loại)
- Modify: `backend/app/routers/san_xuat.py` (GET `/work-items` L346-390; thêm GET `/work-items/loc-dem` NGAY TRƯỚC route `/work-items/{cong_viec_id}` để không bị nuốt path)
- Modify: `backend/app/schemas/san_xuat.py` (thêm `WorkItemsLocDemOut`)
- Test: `backend/tests/test_loc_danh_sach_ban_to_kcs.py` (helper `_ban(db, admin, to_id, **kw)` có sẵn) hoặc file mới `backend/tests/test_loc_ban_to_api.py`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `board.work_items(..., cho_loai: set[str] | None = None, toi: str | None = None, vuong: set[str] | None = None, tre: str | None = None, nguoi: set[int] | None = None)`.
  - Query: `cho_loai` (lặp, `ban_giao|ho_tro|kcs`), `toi` (`toi|con_1|con_2_3|con_4|qua`), `vuong` (lặp), `tre` (`bat_dau|xong`), `nguoi` (lặp, int ≥1).
  - `board.loc_dem(db, user, authz, *, team_id, tim, tu_ngay, den_ngay, moc) -> dict` và
```python
class WorkItemsLocDemOut(BaseModel):
    trang_thai: dict[str, int]
    cho: dict[str, int]
    toi: dict[str, int]
    vuong: dict[str, int]
    tre: dict[str, int]
    nguoi: list[dict]   # [{"id": employee_id, "ten": ho_ten, "so": n}] — người của tổ + người đang được giao
```
  Đếm theo CÔNG VIỆC (không theo lệnh), trên tập việc của bàn sau khi áp `tim` + kỳ, trước các điều kiện khác.

Cách lọc trong `work_items` (nhánh `nhom="lenh"`): khi có bất kỳ tham số mới nào, lấy MỌI công việc của bàn trong phạm vi (`repo.cong_viec_cua_to(tron, employee_id=emp_id, rieng_ids=rieng)`), tính `thuoc_tinh(..., can=<đúng các khoá đang lọc>)`, giữ id khớp TẤT CẢ điều kiện (trong một điều kiện nhiều giá trị là HOẶC), giao với `chi_ids` hiện có, rồi truyền vào `lenh_cua_to_phan_trang(chi_cong_viec_ids=...)` như `cho_xac_nhan`. Đồng thời lọc `rows` của trang về đúng các id đó (giống nhánh `trang_thai`) để trong lệnh chỉ bày việc khớp. `cho_xac_nhan=True` cũ giữ nguyên nghĩa "có bất kỳ loại nào" (view Lịch còn dùng).

- [ ] **Step 1: Test API** (đỏ trước):
```python
def test_loc_chua_giao_tho_chi_con_viec_chua_phan_cong(...):
    r = client.get("/api/san-xuat/work-items", params={"team_id": to.id, "vuong": ["chua_giao_tho"]}, headers=h)
    ids = {cv["id"] for l in r.json()["lenh"] for cv in l["cong_viec"]}
    assert ids == {<id việc chưa giao>}

def test_loc_nguoi_lam(...): params {"nguoi": [tho.id]} → chỉ việc có phân công của thợ đó; trang.tong đếm theo lệnh
def test_loc_tre_xong(...): đặt du_kien_ket_thuc lùi 2 giờ cho một việc released → params {"tre": "xong"} ra đúng việc đó
def test_hai_dieu_kien_la_va(...): nguoi + vuong cùng lúc ⇒ giao hai tập
def test_loc_dem_tra_so_theo_cong_viec(...):
    d = client.get("/api/san-xuat/work-items/loc-dem", params={"team_id": to.id}, headers=h).json()
    assert d["trang_thai"]["released"] == <số việc chờ làm>
    assert d["vuong"]["chua_giao_tho"] == <n>
    assert any(p["id"] == tho.id for p in d["nguoi"])
def test_loc_dem_ngoai_pham_vi_403(...)
```
- [ ] **Step 2:** FAIL. **Step 3:** cài service + router + schema. `loc_dem` tính `can` = cả năm khoá. **Step 4:** `python -m pytest tests/test_loc_ban_to_api.py tests/test_loc_danh_sach_ban_to_kcs.py tests/test_san_xuat_lenh_phan_trang.py tests/test_san_xuat_board_api.py -q` PASS.
- [ ] **Step 5: Đo** trên DB dev (uvicorn đã restart): thời gian `/work-items` không lọc, có `vuong`, có `toi`, và `/loc-dem` của tổ nhiều việc nhất (DevTools Network). Nếu `/loc-dem` > 800 ms thì gom truy vấn (một lượt `dung_routing` cho mọi khoá, một lượt `thieu_dau_vao` nhiều việc nếu có bản nhiều) trước khi sang task sau.

---

### Task 3: Điều kiện lọc phía FE (6 điều kiện + URL + số đếm)

**Files:**
- Modify: `frontend/src/pages/loc-san-xuat/dieu-kien-ban-to.ts`
- Modify: `frontend/src/api/client.ts` (`api.sanXuat.workItems` thêm tham số; thêm `api.sanXuat.workItemsLocDem` + type `SxWorkItemsLocDem`)
- Modify: `frontend/src/pages/ThucHienSxPage.tsx` (`loadItems`, `khoaLoc`, chỗ dựng `ThanhLoc`)
- Test: `frontend/src/pages/loc-san-xuat/dieu-kien-ban-to.test.ts` (mới hoặc bổ sung)

**Interfaces:**
- Consumes: Task 2.
- Produces:
```ts
export type LocBanTo = {
  trangThai: ThsxTrangThaiLoc[];
  cho: ("ban_giao" | "ho_tro" | "kcs")[];
  toi?: "toi" | "con_1" | "con_2_3" | "con_4" | "qua";
  vuong: ("chua_giao_tho" | "chua_nhan_khuon" | "cho_chot_giay" | "chua_nhan_buoc_truoc")[];
  tre?: "bat_dau" | "xong";
  nguoi: number[];
};
export function thamSoLocBanTo(loc: LocBanTo): ThamSoLoc;      // trang_thai, cho_loai, toi, vuong, tre, nguoi
export function dieuKienBanTo(dem: SxWorkItemsLocDem | null): DieuKien<LocBanTo>[];
```
Nhãn đúng mockup: "Trạng thái" (Chờ làm, Đang chạy, Tạm dừng, Hoàn thành) — điều kiện này đã có ở hàng chip đếm nên KHÔNG vẽ khối cạnh nút Lọc (dùng cờ `anKhoi` của `DieuKien`); "Việc chờ tổ bấm" (Bàn giao đến chờ nhận, Hỗ trợ chéo chờ xác nhận, Lỗi KCS chưa xem; `nhieu`); "Hàng đang tới đâu" (Đã tới tổ mình, Còn 1 bước, Còn 2 đến 3 bước, Còn từ 4 bước, Đã qua tổ mình; `mot`); "Chưa bắt đầu được vì" (Chưa giao thợ, Chưa nhận khuôn, Chờ chốt giấy, Chưa nhận hàng bước trước; `nhieu`); "Trễ giờ dự kiến" (Quá giờ bắt đầu mà chưa chạy, Quá giờ xong mà chưa xong; `mot`); "Người làm" (`nhieu`, `tim: true`, giá trị từ `dem.nguoi`). Icon Lucide: CircleDot, BellRing, Route, CircleAlert, Clock, Users. Số đếm `so` từ `dem`. URL: `tt`, `cho` (nối `.`), `toi`, `vg`, `tre`, `ng` (id nối `.`); URL cũ `cho=1` đọc thành cả ba loại.
Số đếm: `ThucHienSxPage` gọi `workItemsLocDem` khi đổi tổ / kỳ / ô tìm (cùng `khoaLoc` trừ phần điều kiện) và khi nhận sự kiện SSE làm mới bàn — không gọi mỗi lần đổi trang.

- [ ] **Step 1: Test** `thamSoLocBanTo`, `locBanToTuUrl`/`locBanToLenUrl` khứ hồi đủ 6 điều kiện, `cho=1` cũ ⇒ 3 loại, `dieuKienBanTo(dem)` gắn đúng `so`.
- [ ] **Step 2:** FAIL. **Step 3:** cài. **Step 4:** vitest PASS + `tsc` sạch.

---

### Task 4: Lưới phẳng một dòng một việc + dải tuyến nhỏ (frontend)

**Files:**
- Modify: `frontend/src/pages/ThsxDanhSach.tsx` (`COT_THSX` L21, `DsBang`, bỏ bọc `ThsxLenhGroups` ở view Bảng)
- Create: `frontend/src/pages/thsxTuyen.ts` (luật thuần, dùng chung với ngăn ở kế hoạch 3/4)
- Create: `frontend/src/pages/ThsxTuyenNho.tsx`
- Modify: `frontend/src/pages/thuc-hien-sx.css` (khối `.thsx-tk` dải nhỏ; chú giải dưới bảng)
- Test: `frontend/src/pages/thsxTuyen.test.ts`, cập nhật test hiện có của danh sách (`grep -l "ThsxDanhSach\|COT_THSX" frontend/src -r --include=*.test.tsx`)

**Interfaces:**
- Consumes: `SxLenhNhom.routing: SxRoutingBuoc[]` (đã có), `SxWorkItem`.
- Produces:
```ts
export type ViTriHang = { k: "toi" | "sap" | "qua"; c: number; m: number; tong: number };
export function viTriHang(dai: SxRoutingBuoc[], congViecId: number): ViTriHang | null;   // cùng luật vi_tri_hang Python
export function cauViTri(v: ViTriHang, dai: SxRoutingBuoc[], ngan: boolean): string;
//  ngan: "Hàng ở tổ mình" | "Còn 2 bước tới mình" | "Đã qua, đang ở Cán màng"
//  dài:  "Hàng đã tới tổ mình" | "Còn 2 bước nữa mới tới tổ mình" | "Đã qua tổ mình, hàng đang ở Cán màng"
export function ThsxTuyenNho(p: { dai: SxRoutingBuoc[]; congViecId: number }): JSX.Element | null;
```
Cột (`COT_THSX` mới, key giữ tên cũ khi trùng nghĩa để cấu hình lưới đã lưu không vỡ): Lệnh (mã + dòng phụ "Tạo 6/10" "Nhận 9/10 09:57", ghim trái) | Sản phẩm (tên + khách, ghim trái) | Công đoạn (tên + chấm chờ + thẻ nhỏ Máy/Tổ, KCS cuối) | Trạng thái (chip + dòng phụ: "từ 11:41 Đào Văn Hoan" / "chưa giao thợ" / "xong 5/10 16:20") | Tốt / cần (số + "/ 350 tờ in" + thanh) | Hàng đang tới đâu (`ThsxTuyenNho` + câu ngắn có màu theo `k`) | Máy và thời gian (máy + "dự kiến 2 phút") | Quy cách (thẻ nhỏ) | Định mức vật tư (món đầu + "+1 khác"). Dải nhỏ: chấm xám đã xong, xanh lá đang làm, trắng chưa tới, viền cam thuê ngoài, viền cyan KCS cuối, chấm to viền đậm = việc của dòng, vòng đôi = bước khác cũng của tổ mình, `title` từng chấm "3. Cán màng, Tổ Cán màng, chưa tới". Chú giải dưới bảng như `.lw-f`. Bài ghép không có dải ⇒ ô hiện "—". Chân `PhanTrangDayDu` ghi "N dòng" và "M lệnh". Hàng chip đếm trạng thái giữ nguyên.

- [ ] **Step 1: Test `viTriHang`/`cauViTri`** với các ca giống Task 1 Python (chép đúng số liệu) + câu ngắn/dài.
- [ ] **Step 2:** FAIL. **Step 3:** cài; bảng phẳng: lặp `lenh.flatMap(l => l.cong_viec.map(cv => ({ l, cv })))`. Chọn dòng vẫn gọi `onPick(cv.id)`; dòng đang chọn viền đủ cạnh, không tô hồng. **Step 4:** vitest + `tsc` PASS.

---

### Task 5: Bấm thử thật

- [ ] Thực hiện SX → chọn tổ có nhiều việc. Thấy bảng phẳng 9 cột, dải tuyến từng dòng, rê chuột lên chấm thấy tên bước.
- [ ] Bấm Lọc → "Chưa bắt đầu được vì" → "Chưa giao thợ": thấy số đếm cạnh giá trị, bảng còn đúng việc chưa giao, khối "Chưa bắt đầu được vì là Chưa giao thợ ×" cạnh nút Lọc; URL có `vg=`; F5 vẫn giữ lọc.
- [ ] Thêm "Người làm" → gõ tìm tên → chọn: bảng giao hai điều kiện. Bấm × trên khối, bấm "Xoá bộ lọc".
- [ ] "Hàng đang tới đâu" → "Đã qua tổ mình"; "Trễ giờ dự kiến" → "Quá giờ xong mà chưa xong".
- [ ] Ghi thời gian đo trước/sau vào báo cáo; liệt kê từng bước đã bấm/thấy.
