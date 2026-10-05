# Làm gọn Hồ sơ lệnh sản xuất và Theo dõi sản xuất — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chia lại hai màn: Theo dõi sản xuất trả lời "bây giờ xưởng thế nào" (Theo máy / Theo lệnh + dải bất thường), Hồ sơ lệnh sản xuất là tra cứu (4 tab, 7 cột tĩnh), khung hồ sơ một lệnh gọn còn 5 mục. Bỏ phần thừa, sửa các lỗi số liệu đã kiểm.

**Architecture:** Máy chủ giữ tầng `routers → services → repositories`. Hồ sơ lệnh có hàm KHÂU mới (`trang_thai.khau`) thay cho trạng thái có cảnh báo, nên danh sách không còn chạy cân đối vật tư lẫn đường găng. Theo dõi có service mới `services/lenh_sx/theo_doi.py` với MỘT lượt nạp dùng chung cho `/theo-may`, `/theo-lenh` và dải bất thường; bốn đường cũ (`/meta`, `/kanban`, `/theo-ca`, `/gantt`) bị xoá. Giao diện viết lại ba trang, khung hồ sơ tách thành các tệp mục nhỏ.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Pydantic v2 (Python 3.10), pytest trên SQLite in-memory; React 18 + TypeScript + Vite, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-05-lam-gon-ho-so-lenh-theo-doi-sx-design.md` (bản bấm thử: `docs/mockups/lam-gon-ho-so-lenh-theo-doi-sx.html`). Đọc đặc tả trước mỗi task; chỗ kế hoạch lệch đặc tả đã ghi ở mục "Kế hoạch chốt thêm" dưới đây và kế hoạch thắng.

## Global Constraints

- Không bảng mới, không cột mới, không migration; `docs/DB_SCHEMA.md` không đổi.
- Không Alembic; không đụng `backend/app/db_migrations.py`.
- Phân tầng: nghiệp vụ ở `services/`, truy vấn DB ở `repositories/` hoặc service đọc sẵn có của gói `lenh_sx`, router chỉ điều phối.
- `sale_ids` luôn lấy từ token qua `pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)`; không tham số nào cho phép nới phạm vi.
- Thêm trường nào phải đi hết service → schema Pydantic → type TS (Pydantic nuốt trường lạ im lặng).
- Không một số tiền nào trong hai màn và hồ sơ.
- Giao diện: chỉ Be Vietnam Pro, token trong `frontend/src/styles/tokens.css`; hover nền `var(--rule-hair)`; mục đang chọn = viền đủ bốn cạnh (không viền một cạnh, không nền hồng); dải pill thay KPI; chip lọc đang chọn nền `var(--charcoal)` chữ `var(--on-charcoal)`, nút đổi/bật màu `var(--rust)`; tiêu đề cột 11px chữ hoa giãn `.07em`, nền `var(--paper)`, viền dưới 1.5px; số căn phải; KHÔNG nối thông tin bằng dấu "·"; KHÔNG chữ tiếng Anh trên giao diện.
- Điện thoại (≤ 640px): bảng cuộn ngang trong khung của nó, trang không cuộn ngang, ba ô tổng quan xếp dọc, phần đầu hồ sơ thôi dính.
- Mã chặng/đơn vị in ra giao diện phải qua `nhanChang` / `nhanDonVi` (`pages/lsxBuoc.ts`).
- Kiểm thử: KHÔNG chạy `./init.ps1`, KHÔNG chạy cả bộ pytest. Chạy pytest nhắm tệp từ thư mục `backend/`: `python -m pytest tests/<tệp>.py -q`. Giao diện: từ `frontend/` chạy `npx tsc --noEmit` và `npx vitest run <tệp>`.
- `python -c` hay script trần trong `backend/` đụng Postgres dev thật — thăm dò bằng test tạm, không bằng script.
- Làm và commit trên nhánh worktree `lam-gon-lenh-theo-doi` (`D:\jobs\SVN\.claude\worktrees\lam-gon-lenh-theo-doi`, tách từ `dev` 6cfedc08), mỗi task một commit; KHÔNG merge vào `dev` trong kế hoạch này (checkout chính có sửa đổi dở của phiên khác chồng đúng các tệp này). Commit: message tiếng Việt, KHÔNG dòng `Co-Authored-By`. Chỉ `git add` đúng các tệp của task — CẤM `git add -A`, `git add .`, `git stash` trần. Trước khi commit chạy `git diff --cached --stat` và kiểm chỉ có tệp của task; tệp nào có sẵn sửa đổi không phải của mình thì DỪNG và báo.
- Hook pre-commit chấm `DB_SCHEMA.md` trên working tree — không dùng `--no-verify`.
- Mỗi task kết thúc với `npx tsc --noEmit` xanh ở `frontend/` (CI build FE chạy trước test backend).

## Kế hoạch chốt thêm (chỗ đặc tả chưa nói hoặc nói lệch)

1. `GET /api/lenh-san-xuat/bo-loc` KHÔNG xoá mà đổi thành chỉ trả `khach_hang` — ô Khách mới của Hồ sơ lệnh cần nguồn gác đúng ô quyền `lenh_san_xuat` (mượn `/api/theo-doi-san-xuat/bo-loc` là đúng vết thương "mượn nhầm ô quyền" repo đã ghi).
2. `trang_thai.khau()`: lệnh đã xong mọi công việc mà chưa rơi vào ba nhánh sau sản xuất (KCS không đạt toàn bộ, hoặc không có công việc `la_kcs_cuoi`) trả `("sau_sx", "dang_kcs")`, không phải `dang_sx` — đúng định nghĩa tab "Sau sản xuất: sản xuất đã xong" ở đặc tả 4.1. Lệnh chưa có công việc nào vẫn là `dang_sx`.
3. Hồ sơ thêm bốn trường để dựng phần đầu theo 4.2: `thong_tin.da_dong`, `thong_tin.nhom_ten`, `tien_do.khau`, `tien_do.khau_chi_tiet`. "Bước i trên n" FE tự đếm từ `routing.nodes`.
4. Theo máy khi có ô tìm / khách / mục bất thường: chỉ còn dòng có công việc (đang chạy hoặc kế tiếp) thuộc lệnh khớp lọc; dòng "máy đang trống" không hiện.
5. Dòng "Chưa có máy" của Theo máy: cột Kế hoạch ghi "bắt đầu dd/mm HH:MM" lấy từ `du_kien_bat_dau` của chính việc đó (đặc tả 3.3 mục 1).
6. `bang_theo_doi._ca_cua_moc` đang được bàn tổ (`services/san_xuat/board.py:811`) gọi — chuyển hàm sang `board.py` trước khi xoá Theo ca, không được làm gãy Thực hiện SX.
7. CSS: hai tệp `lenh-san-xuat.css` (2117 dòng) và `theo-doi-san-xuat.css` (1681 dòng) chỉ được dùng bởi đúng các trang viết lại. Thêm `lenh-sx-chung.css` (tiền tố `lsc-`: pill, bảng, hàng lọc, dải bất thường dùng chung) và `lenh-sx-ho-so.css` (tiền tố `lhs-`: khung hồ sơ). `lenh-san-xuat.css` XOÁ hẳn ở Task 10 (sau khi `grep -rn "hslsx" frontend/src` không còn gì); `theo-doi-san-xuat.css` viết lại ở Task 10, khối `.tdsx-picker*` của bảng chọn lệnh chép nguyên.
8. Bỏ việc sửa `QuyTrinhKinhDoanhPage.tsx:61` của đặc tả mục 6: dòng đó hiện chỉ có trong sửa đổi CHƯA commit của phiên khác ở checkout chính, nhánh này không có — sửa ở đây là đẻ xung đột. Ghi lại để làm khi gộp.
9. Giữa Task 2/5 (máy chủ đổi) và Task 8/10 (giao diện đổi), giao diện cũ gọi đường đã xoá: build vẫn xanh nhưng màn cũ hỏng trong khoảng đó. Không deploy giữa chừng.

## Bản đồ tệp

Máy chủ:

| Tệp | Việc |
|---|---|
| `backend/app/services/lenh_sx/trang_thai.py` | Thêm `KHAU_*`, `CT_*`, `khau()` |
| `backend/app/services/lenh_sx/danh_sach.py` | Danh sách mới theo khâu; bỏ `summary`, `_dong` cũ, `bo_loc` máy; thêm `khach_trong_pham_vi`, `bo_loc` khách |
| `backend/app/schemas/lenh_san_xuat.py` | `LenhSxItem` mới, `LenhSxBoLocOut` khách; bỏ `LenhSxSummaryOut`, `LenhSxMayLocOut`; `SanLuongOut` bỏ ba tổng; `ThongTinOut`/`TienDoOut` thêm trường |
| `backend/app/routers/lenh_san_xuat.py` | Bỏ `/summary`; `/bo-loc` khách; tham số danh sách mới |
| `backend/app/services/lenh_sx/ho_so.py` | Bỏ ba tổng sản lượng; thêm 4 trường |
| `backend/app/services/lenh_sx/theo_doi.py` (mới) | `_nap`, `dem_bat_thuong`, `theo_lenh`, `theo_may` |
| `backend/app/schemas/theo_doi_san_xuat.py` | Viết lại: `BoLocOut` hai nhóm, `TheoMayOut`, `TheoLenhOut` |
| `backend/app/routers/theo_doi_san_xuat.py` | Viết lại: `/bo-loc`, `/theo-may`, `/theo-lenh` |
| `backend/app/services/lenh_sx/bang_theo_doi.py` | Rút gọn còn bộ lọc, phạm vi, luật rụng, `bo_loc` |
| `backend/app/services/san_xuat/board.py` | Nhận `_ca_cua_moc` |
| `backend/app/repositories/attendance_repo.py`, `backend/app/services/xep_lich_service.py` | Sửa chữ docstring nhắc `bang_theo_doi.theo_ca` |

Test máy chủ:

| Tệp | Việc |
|---|---|
| `backend/tests/test_lenh_sx_trang_thai.py` | Thêm bài `khau()` |
| `backend/tests/test_lenh_sx_api.py` | Bỏ bài summary/bo-loc máy/lọc cũ; sửa bài tab, sắp, bước hiện tại, chặng; thêm bài khách, sắp giảm, không cân đối |
| `backend/tests/test_lenh_sx_con_song.py` | Bỏ bài so với bản cũ; sửa bài "không nạp lệnh đã giao hết"; bỏ bài theo máy cũ |
| `backend/tests/test_lenh_sx_ho_so.py` | `san_luong` không còn ba tổng; bốn trường mới |
| `backend/tests/lenh_sx_fixtures.py` | Nhận `_dem_sql`, `_token_khong_quyen_theo_doi`, `_bat_dau_that` |
| `backend/tests/test_theo_doi_theo_lenh.py` (mới) | Theo lệnh + dải bất thường |
| `backend/tests/test_theo_doi_theo_may.py` (mới) | Theo máy |
| `backend/tests/test_theo_doi_bo_loc.py` (đổi tên từ `test_theo_doi_kanban.py`) | Giữ bài bộ lọc còn dùng + bài lọc chuyển sang `/theo-lenh` |
| `backend/tests/test_theo_doi_rung_lenh_cu.py` (đổi tên từ `test_kanban_rung_lenh_cu.py`) | Luật rụng chạy trên `theo_lenh` |
| `backend/tests/test_theo_doi_may_ca_gantt.py` | Xoá |
| `backend/tests/test_seed_quyen_theo_doi.py` (mới) | Vai có Theo dõi thì có Hồ sơ lệnh cùng phạm vi |

Giao diện:

| Tệp | Việc |
|---|---|
| `frontend/src/api/client.ts` | Type + hàm hai nhóm `lenhSanXuat`, `theoDoiSanXuat` |
| `frontend/src/pages/lsxKhau.tsx` (mới, + `lsxKhau.test.tsx`) | Nhãn + pill khâu, dải chặng, thẻ GẤP dùng chung |
| `frontend/src/pages/lenh-sx-chung.css` (mới) | Pill, bảng, hàng lọc, dải bất thường |
| `frontend/src/pages/LenhSanXuatPage.tsx` (+ test) | Viết lại danh sách |
| `frontend/src/pages/lenh-san-xuat.css` | Xoá ở Task 10 (Task 8, 9 còn nạp tạm cho khung hồ sơ cũ) |
| `frontend/src/pages/lsxHoSoChung.tsx` (mới) | Nhãn, `so`, `Pill`, `BangCuon`, `khoMm` của hồ sơ |
| `frontend/src/pages/LsxHoSoCongDoan.tsx`, `LsxHoSoQuyCach.tsx`, `LsxHoSoVatTu.tsx`, `LsxHoSoSauSx.tsx`, `LsxHoSoNhatKy.tsx` (mới) | Năm mục hồ sơ |
| `frontend/src/pages/LenhSxHoSoView.tsx` (+ test) | Khung hồ sơ mới |
| `frontend/src/pages/lenh-sx-ho-so.css` (mới) | CSS khung hồ sơ |
| `frontend/src/pages/TheoDoiSanXuatPage.tsx` (+ test mới) | Khung màn mới |
| `frontend/src/pages/TdsxTheoMay.tsx` (+ test) | Viết lại thành bảng |
| `frontend/src/pages/TdsxTheoLenh.tsx` (mới, + test) | Bảng Theo lệnh |
| `frontend/src/pages/tdsxChonLenh.tsx` | Giữ nguyên, dùng cho việc ghép |
| `frontend/src/pages/theo-doi-san-xuat.css` | Viết lại |
| `frontend/src/pages/TdsxKanban.tsx`, `TdsxTheoCa.tsx`, `TdsxGantt.tsx`, `tdsxTimeline.ts` | Xoá |

---

### Task 1: Hàm KHÂU của lệnh

**Files:**
- Modify: `backend/app/services/lenh_sx/trang_thai.py` (thêm sau hàm `trang_thai_chinh`, cuối tệp)
- Test: `backend/tests/test_lenh_sx_trang_thai.py` (thêm cuối tệp)

**Interfaces:**
- Produces: `trang_thai.KHAU_DANG_SX = "dang_sx"`, `KHAU_SAU_SX = "sau_sx"`, `KHAU_DA_GIAO = "da_giao"`, `KHAU = (KHAU_DANG_SX, KHAU_SAU_SX, KHAU_DA_GIAO)`, `CT_DANG_KCS = "dang_kcs"`, `CT_CHO_NHAP_KHO = "cho_nhap_kho"`, `CT_SAN_SANG_GIAO = "san_sang_giao"`, `khau(bc: BoiCanh, lsx_id: int) -> tuple[str, str | None]`.

- [ ] **Step 1: Viết bài kiểm thất bại**

Thêm cuối `backend/tests/test_lenh_sx_trang_thai.py`:

```python
# --- KHÂU (làm gọn Hồ sơ lệnh, 05/10/2026) --------------------------------------------------------
# Tab của Hồ sơ lệnh chia theo KHÂU, không qua cờ cảnh báo: lệnh có sự cố vẫn ở đúng khâu của nó,
# cảnh báo là việc của màn Theo dõi. Mỗi bài dưới đây đối chiếu với `trang_thai_chinh` ở những ca
# hai hàm CỐ Ý nói khác nhau.
def _khau(db, lsx_id):
    return trang_thai.khau(boi_canh.nap(db, [lsx_id]), lsx_id)


def test_khau_dang_chay_la_dang_sx(db, lenh_dang_chay):
    assert _khau(db, lenh_dang_chay) == (trang_thai.KHAU_DANG_SX, None)


def test_khau_khong_doc_co_su_co(db, lenh_dang_chay_co_su_co):
    assert _tt(db, lenh_dang_chay_co_su_co) == trang_thai.TAB_CANH_BAO
    assert _khau(db, lenh_dang_chay_co_su_co) == (trang_thai.KHAU_DANG_SX, None)


def test_khau_khong_doc_co_tam_dung(db, lenh_tam_dung):
    assert _tt(db, lenh_tam_dung) == trang_thai.TAB_CANH_BAO
    assert _khau(db, lenh_tam_dung) == (trang_thai.KHAU_DANG_SX, None)


def test_khau_dang_kcs(db, lenh_dang_kcs):
    assert _khau(db, lenh_dang_kcs) == (trang_thai.KHAU_SAU_SX, trang_thai.CT_DANG_KCS)


def test_khau_cho_nhap_kho(db, lenh_kcs_dat_chua_nhap):
    assert _khau(db, lenh_kcs_dat_chua_nhap) == (trang_thai.KHAU_SAU_SX, trang_thai.CT_CHO_NHAP_KHO)


def test_khau_san_sang_giao(db, lenh_da_nhap_kho):
    assert _khau(db, lenh_da_nhap_kho) == (trang_thai.KHAU_SAU_SX, trang_thai.CT_SAN_SANG_GIAO)


def test_khau_giao_du_an_truoc_ca_su_co(db, lenh_giao_het):
    _su_co(db, lenh_giao_het, _cong_viec(db, lenh_giao_het)[1].id, ma="YC-KHAU-HT")
    assert _khau(db, lenh_giao_het) == (trang_thai.KHAU_DA_GIAO, None)


def test_khau_xong_san_xuat_ma_kcs_truot_het_van_la_sau_sx(db, lenh_kcs_khong_dat):
    """Mọi công việc đã xong, KCS kết luận không đạt toàn bộ: `trang_thai_chinh` nói Cảnh báo, còn
    khâu là Sau sản xuất — hàng đã ra khỏi chuyền, đang chờ KCS xử lý."""
    assert _tt(db, lenh_kcs_khong_dat) == trang_thai.TAB_CANH_BAO
    assert _khau(db, lenh_kcs_khong_dat) == (trang_thai.KHAU_SAU_SX, trang_thai.CT_DANG_KCS)
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run (từ `backend/`): `python -m pytest tests/test_lenh_sx_trang_thai.py -q -k khau`
Expected: 8 FAIL với `AttributeError: module 'app.services.lenh_sx.trang_thai' has no attribute 'khau'`.

- [ ] **Step 3: Viết hàm**

Thêm cuối `backend/app/services/lenh_sx/trang_thai.py`:

```python
# --- KHÂU của lệnh — tab của màn Hồ sơ lệnh (làm gọn 05/10/2026) ---------------------------------
# Giá trị đi thẳng ra API (`?tab=`, `khau`) nên coi như hợp đồng.
KHAU_DANG_SX = "dang_sx"
KHAU_SAU_SX = "sau_sx"
KHAU_DA_GIAO = "da_giao"
KHAU = (KHAU_DANG_SX, KHAU_SAU_SX, KHAU_DA_GIAO)

# Chi tiết của khâu Sau sản xuất — FE dịch ra chữ.
CT_DANG_KCS = "dang_kcs"
CT_CHO_NHAP_KHO = "cho_nhap_kho"
CT_SAN_SANG_GIAO = "san_sang_giao"


def khau(bc: BoiCanh, lsx_id: int) -> tuple[str, str | None]:
    """`(khâu, chi tiết)` của một lệnh — tab của màn Hồ sơ lệnh, KHÔNG xét cờ cảnh báo.

    Cùng các vị ngữ và cùng thứ tự với `trang_thai_chinh`, chỉ bỏ nhánh cảnh báo: màn tra cứu chia
    lệnh theo chỗ nó đang đứng; lệnh có sự cố vẫn ở đúng khâu của nó, còn "đang có vấn đề gì" là
    việc của màn Theo dõi. Nhờ vậy danh sách không phải chạy `can_doi()` lẫn đường găng.

    Nhánh cuối "đã xong mọi công việc ⇒ Sau sản xuất / Đang KCS" bắt cả hai ca ba nhánh trên bỏ
    sót: KCS kết luận không đạt toàn bộ, và lệnh không có công việc `la_kcs_cuoi`. Hàng đã ra khỏi
    chuyền thì không còn là Đang sản xuất. Lệnh chưa có công việc nào (`all([])` là True) phải ở
    lại Đang sản xuất — đó là lý do có vế `bc.cong_viec_du(lsx_id)`.

    Không đổi `trang_thai_chinh`: đơn hàng bán vẫn đọc nó qua `danh_sach._soi`.
    """
    if _da_giao_het(bc, lsx_id):
        return KHAU_DA_GIAO, None
    if _co_ton_thanh_pham(bc, lsx_id):
        return KHAU_SAU_SX, CT_SAN_SANG_GIAO
    if _kcs_dat_cho_nhap(bc, lsx_id):
        return KHAU_SAU_SX, CT_CHO_NHAP_KHO
    if bc.cong_viec_du(lsx_id) and _sx_da_xong(bc, lsx_id):
        return KHAU_SAU_SX, CT_DANG_KCS
    return KHAU_DANG_SX, None
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `python -m pytest tests/test_lenh_sx_trang_thai.py -q`
Expected: toàn bộ PASS (bài cũ không đổi vì `trang_thai_chinh` không đổi).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/lenh_sx/trang_thai.py backend/tests/test_lenh_sx_trang_thai.py
git diff --cached --stat
git commit -m "Lệnh SX: thêm hàm khâu (đang SX / sau SX / đã giao đủ) không xét cờ cảnh báo"
```

---

### Task 2: Máy chủ danh sách Hồ sơ lệnh theo khâu

**Files:**
- Modify: `backend/app/services/lenh_sx/danh_sach.py` (docstring module, hằng tab, `_loc_sql`, `_dong`, `danh_sach`, `bo_loc`; xoá `summary`)
- Modify: `backend/app/schemas/lenh_san_xuat.py:36-127` (`LenhSxItem`, `LenhSxBoLocOut`; xoá `LenhSxMayLocOut`, `LenhSxSummaryOut`)
- Modify: `backend/app/routers/lenh_san_xuat.py` (toàn tệp)
- Test: `backend/tests/test_lenh_sx_api.py`, `backend/tests/test_lenh_sx_con_song.py`

**Interfaces:**
- Consumes: `trang_thai.khau`, `trang_thai.KHAU*`, `trang_thai.CT_*` (Task 1).
- Produces:
  - `danh_sach.TAB_TAT_CA = "tat_ca"`, `danh_sach.TAB_CHO_PHEP = ("tat_ca", "dang_sx", "sau_sx", "da_giao")`.
  - `danh_sach.danh_sach(db, *, sale_ids, tab=None, q=None, khach_hang_id=None, tu_ngay=None, den_ngay=None, page=1, page_size=50) -> {items, total, page, page_size, dem_theo_tab}`; mỗi item: `id, ma, ten, so_luong_dat, don_vi_tinh, khach_hang, order_id, order_no, han_hoan_thanh_sx, is_rush, khau, khau_chi_tiet, da_dong`.
  - `danh_sach.khach_trong_pham_vi(db, sale_ids) -> list[{"id": int, "ten": str | None}]` (Task 5 dùng lại).
  - `danh_sach.bo_loc(db, *, sale_ids) -> {"khach_hang": [...]}`.
  - Giữ nguyên chữ ký: `_soi`, `_den_vat_tu_co_cache`, `buoc_hien_tai`, `may_cua_buoc`, `chang`, `_co_buoc`, `_khoa_sap`, `_tach_da_giao_het`, `UU_TIEN_*` (Task 5 mới dọn `UU_TIEN_*`).
  - API: `GET /api/lenh-san-xuat?tab=&q=&khach_hang_id=&tu_ngay=&den_ngay=&page=&page_size=`; `GET /api/lenh-san-xuat/bo-loc` → `{"khach_hang": [{"id": int, "ten": str}]}`; `/summary` không còn (404).

- [ ] **Step 1: Sửa bài kiểm cũ và viết bài mới (đỏ)**

Trong `backend/tests/test_lenh_sx_api.py`:

(a) XOÁ hẳn các bài sau (cả thân hàm): `test_summary_du_4_kpi`, `test_summary_cung_theo_pham_vi`, `test_summary_dang_sx_va_du_kien_tre`, `test_summary_cong_doan_xong_theo_gio_xuong`, `test_summary_ty_le_kcs_hom_nay`, `test_summary_kcs_khong_kiem_gi_tra_none`, `test_kpi_cong_doan_xong_dem_ca_buoc_ghep_dung_mot_lan`, `test_kpi_kcs_khong_dem_lap_batch_cua_buoc_ghep`, `test_den_vat_tu_dung_cache_giua_danh_sach_va_summary`, `test_summary_so_cau_sql_hang_tren_truc_lenh`, `test_loc_uu_tien_gap`, `test_loc_may_id_theo_snapshot`, `test_loc_may_id_bat_ca_buoc_chi_co_o_routing`, `test_loc_nhom_cong_doan`, `test_loc_tre`, `test_loc_may_id_bat_ca_buoc_ghep`, `test_loc_nhom_cong_doan_bat_ca_buoc_ghep`, `test_dem_theo_tab_phan_anh_bo_loc_tre`, `test_canh_bao_thieu_vat_tu_ra_toi_dong`, `test_item_may_lay_ten_tu_danh_muc`, `test_may_lay_duoc_khi_chua_co_phien_nao`, và mọi bài tên bắt đầu `test_bo_loc_` cùng helper `_bo_loc` và dòng chú thích khối `# --- Ô lọc MÁY: GET /bo-loc ...` (bộ lọc máy đã bỏ; lọc máy qua cầu ghép vẫn được canh ở `test_theo_doi_bo_loc.py` của Task 5).

(b) Ba bài dùng `summary` chỉ để đo mốc `hoan_thanh_luc` — giữ phần đo cột, bỏ phần KPI. Thay nguyên thân `test_kpi_khong_bi_go_phan_cong_keo_vao_hom_nay` bằng:

```python
def test_go_phan_cong_khong_doi_moc_hoan_thanh(sess, admin, lenh_that):
    """Rút người khỏi một bước ĐÃ XONG TỪ LÂU không được dời mốc nghiệp vụ `hoan_thanh_luc`.

    `go_phan_cong` dời `updated_at` (cột bảo trì). Cột Thực tế của hồ sơ đọc `hoan_thanh_luc`, nên
    mốc đó phải đứng yên."""
    cv = _cvs(sess, lenh_that)[0]
    pc_id = _giao_nguoi(sess, admin, cv, ma="NV-DS-21", ten="Thợ ca cũ")
    xua = datetime(2020, 1, 1, 3, 0, tzinfo=timezone.utc)
    _dat_xong_luc(sess, cv, xua)

    thuc_thi.go_phan_cong(sess, user=admin, phan_cong_id=pc_id, ly_do="Nghỉ việc")
    sess.expire_all()
    cv = sess.get(SanXuatCongViec, cv.id)
    assert cv.updated_at.year >= 2026, "tiền đề: `go_phan_cong` CÓ dời `updated_at` về hiện tại"
    assert cv.hoan_thanh_luc.year == 2020, "mốc NGHIỆP VỤ phải đứng yên"
```

Thay nguyên thân `test_ket_thuc_that_dong_dau_hoan_thanh_luc` bằng:

```python
def test_ket_thuc_that_dong_dau_hoan_thanh_luc(sess, admin, lenh_that):
    """ĐƯỜNG GHI THẬT (`thuc_thi.ket_thuc`) có đóng dấu `hoan_thanh_luc` — bài duy nhất không đi qua
    fixture `_dat_xong_luc`, nên là bài duy nhất chứng minh production còn ghi cột này."""
    cv = _cvs(sess, lenh_that)[0]
    _chay_that(sess, admin, cv, ma="NV-DS-31", ten="Thợ đóng dấu")
    cv = sess.get(SanXuatCongViec, cv.id)
    assert cv.trang_thai == CV_HOAN_THANH, "tiền đề: đường ghi thật có đóng bước"
    assert cv.hoan_thanh_luc is not None, "`ket_thuc` KHÔNG đóng dấu mốc nghiệp vụ"
```

`test_ket_thuc_lan_hai_bi_chan_nen_dau_khong_bi_ghi_de` giữ nguyên.

(c) Bài bước hiện tại và dải chặng chuyển sang gọi hàm trực tiếp (hai hàm còn sống, `/theo-lenh` của Task 4 dùng lại). Thêm helper ngay dưới khối import:

```python
def _buoc_va_chang(sess, lsx_id: int) -> tuple[str | None, list[dict]]:
    """Bước hiện tại + dải chặng của MỘT lệnh, đọc thẳng `danh_sach` — cột bảng Hồ sơ lệnh đã bỏ
    (làm gọn 05/10/2026), hai hàm này nay nuôi cột "Đang ở" của Theo dõi."""
    bc = boi_canh.nap(sess, [lsx_id])
    cv = danh_sach.buoc_hien_tai(bc, lsx_id)
    return (cv.ten_cong_doan if cv is not None else None), danh_sach.chang(bc, lsx_id, cv)
```

và đổi dòng import `from app.services.lenh_sx import danh_sach, trang_thai` thành `from app.services.lenh_sx import boi_canh, danh_sach, trang_thai`.

Trong `test_buoc_hien_tai_uu_tien_buoc_dang_chay`, `test_buoc_hien_tai_uu_tien_buoc_tam_dung`, `test_buoc_hien_tai_lay_ca_buoc_ghep`, `test_chang_tra_ca_chuoi_cong_doan_theo_trang_thai`, `test_chang_gop_moi_lan_chay_cua_mot_buoc_ve_mot_dot`, `test_chang_rong_khi_lenh_khong_con_cong_viec_nao`: bỏ tham số `client, seed_credentials` khỏi chữ ký, bỏ dòng `h = _h(_tok(...))`, thay cặp dòng

```python
    d = client.get("/api/lenh-san-xuat?page_size=200", headers=h).json()
    row = next(i for i in d["items"] if i["id"] == <ID>)
```

bằng `buoc, chang = _buoc_va_chang(sess, <ID>)` (giữ đúng `<ID>` của từng bài: `lenh_that`, hoặc phần tử của `ghep_doi`), rồi đổi `row["buoc_hien_tai"]` → `buoc` và `row["chang"]` → `chang`. Bài nào đọc `row[...]` khác hai khoá này thì xoá dòng assert đó (các trường ấy không còn trên dòng).

(d) Thay nguyên `test_item_du_truong_nghiep_vu` bằng:

```python
def test_item_chi_con_cot_tinh(client, seed_credentials, sess, lenh_that):
    """Dòng bảng chỉ còn cột tĩnh — không cột nào cần đường găng hay cân đối vật tư."""
    h = _h(_tok(client, seed_credentials))
    d = client.get("/api/lenh-san-xuat?page_size=200", headers=h).json()
    row = next(i for i in d["items"] if i["id"] == lenh_that)
    assert set(row) == {
        "id", "ma", "ten", "so_luong_dat", "don_vi_tinh", "khach_hang", "order_id", "order_no",
        "han_hoan_thanh_sx", "is_rush", "khau", "khau_chi_tiet", "da_dong",
    }
    assert row["khau"] == trang_thai.KHAU_DANG_SX
    assert row["khau_chi_tiet"] is None
    assert row["da_dong"] is False
    assert row["order_no"]
```

(e) Sửa bài tab/đếm:

`test_dem_theo_tab_dem_ca_tap_khong_chi_trang`: thay hai dòng dùng `trang_thai.TAB_CHINH` bằng `trang_thai.KHAU`:

```python
    assert set(dem) == set(trang_thai.KHAU) | {"tat_ca"}
    assert dem["tat_ca"] == d["total"] >= 20
    assert sum(dem[t] for t in trang_thai.KHAU) == dem["tat_ca"]
```

Thay nguyên thân `test_loc_tab_o_may_chu` (giữ docstring cũ nhưng sửa câu "rơi vào MỘT tab (`canh_bao` …)" thành "rơi vào tab `dang_sx`"):

```python
    h = _h(_tok(client, seed_credentials))
    _giao_xong(sess, lenh_that, sess.get(Lsx, lenh_that).so_luong_dat, ma="YCGH-DS-TAB")

    het = client.get("/api/lenh-san-xuat?page_size=200", headers=h).json()
    assert len({i["khau"] for i in het["items"]}) >= 2, "tập đồng nhất — bài mất tiền đề"
    tab = trang_thai.KHAU_DA_GIAO
    assert 0 < het["dem_theo_tab"][tab] < het["total"], "tab đang xét phải là tập CON thật sự"

    d = client.get(f"/api/lenh-san-xuat?tab={tab}&page_size=200", headers=h).json()
    assert d["total"] == het["dem_theo_tab"][tab] < het["total"]
    assert {i["khau"] for i in d["items"]} == {tab}
    assert [i["id"] for i in d["items"]] == [lenh_that]
    assert d["dem_theo_tab"] == het["dem_theo_tab"]
```

Thêm vào `test_tab_la_gia_tri_khong_hop_le_bi_chan` dòng thứ hai: tab cũ giờ cũng phải ăn 422.

```python
    assert client.get("/api/lenh-san-xuat?tab=canh_bao", headers=h).status_code == 422
```

Thay nguyên thân `test_lenh_gap_dung_dau_bang`:

```python
def test_lenh_gap_dung_dau_tab_dang_sx(client, seed_credentials, sess, admin, hai_muoi_lenh):
    """Tab Đang sản xuất giữ thứ tự cũ: GẤP → hạn SX tăng → mã."""
    h = _h(_tok(client, seed_credentials))
    gap = _lenh_tho(
        sess, ma="LSX-DS-GAP2", sale_user_id=admin.id, is_rush=True, han_sx=date(2027, 1, 1)
    )
    d = client.get("/api/lenh-san-xuat?tab=dang_sx&page=1&page_size=5", headers=h).json()
    assert d["items"][0]["id"] == gap
```

(f) Thay nguyên `test_so_cau_sql_hang_tren_truc_lenh` (giữ `_nen_hinh_dang_that`, `_dem_sql`):

```python
def test_so_cau_sql_hang_tren_truc_lenh(sess, orders, lsx_svc, admin, customer):
    """Số câu SQL của danh sách KHÔNG nở theo số lệnh (một `boi_canh.nap()` cho cả tập)."""
    _dot_dong_don(sess, 8)
    _nen_hinh_dang_that(sess, orders, lsx_svc, admin, customer)
    n3 = _dem_sql(lambda: danh_sach.danh_sach(sess, sale_ids=None))
    for _ in range(2):
        _phat_hanh_that(
            sess, orders, lsx_svc, admin, customer,
            buoc=[("CTP", 15, 500), ("In", 360, 5000)],
        )
    n5 = _dem_sql(lambda: danh_sach.danh_sach(sess, sale_ids=None))
    assert len(danh_sach.danh_sach(sess, sale_ids=None)["items"]) == 5
    assert n3 == n5, f"số câu SQL nở theo số lệnh: {n3} → {n5}"
```

(g) Thêm các bài mới cuối tệp:

```python
# --- Làm gọn 05/10/2026: 4 tab theo khâu, lọc khách, sắp tra cứu, không cân đối ------------------
def test_danh_sach_khong_chay_can_doi_lan_duong_gang(
    client, seed_credentials, sess, lenh_that, monkeypatch,
):
    """Danh sách tĩnh: gọi cân đối vật tư hay dự kiến xong là đẻ lại đúng phần nặng nhất đã bỏ."""
    from app.services.lenh_sx import tien_do

    def cam(*_a, **_k):
        raise AssertionError("danh sách Hồ sơ lệnh không được gọi hàm này")

    monkeypatch.setattr(trang_thai, "den_vat_tu_theo_lo", cam)
    monkeypatch.setattr(tien_do, "du_kien_xong", cam)
    h = _h(_tok(client, seed_credentials))
    r = client.get("/api/lenh-san-xuat?page_size=200", headers=h)
    assert r.status_code == 200
    assert any(i["id"] == lenh_that for i in r.json()["items"])


def test_loc_khach_hang(client, seed_credentials, sess, admin, customer, hai_muoi_lenh):
    h = _h(_tok(client, seed_credentials))
    khac = Customer(name="Khách lọc riêng DS")
    sess.add(khac)
    sess.commit()
    rieng = _lenh_tho(sess, ma="LSX-DS-KH1", sale_user_id=admin.id, customer_id=khac.id)
    d = client.get(f"/api/lenh-san-xuat?khach_hang_id={khac.id}", headers=h).json()
    assert [i["id"] for i in d["items"]] == [rieng]
    assert d["dem_theo_tab"]["tat_ca"] == 1


def test_tab_tat_ca_sap_han_giam_dan(client, seed_credentials, sess, admin):
    """Danh sách tra cứu: lệnh mới nhất ở trên. Lệnh chưa có hạn xuống cuối."""
    h = _h(_tok(client, seed_credentials))
    cu = _lenh_tho(sess, ma="LSX-DS-SAP1", sale_user_id=admin.id, han_sx=date(2026, 1, 5))
    moi = _lenh_tho(sess, ma="LSX-DS-SAP2", sale_user_id=admin.id, han_sx=date(2026, 9, 5))
    gap_cu = _lenh_tho(
        sess, ma="LSX-DS-SAP3", sale_user_id=admin.id, han_sx=date(2025, 6, 1), is_rush=True,
    )
    d = client.get("/api/lenh-san-xuat?q=LSX-DS-SAP&page_size=50", headers=h).json()
    assert [i["id"] for i in d["items"]] == [moi, cu, gap_cu], "GẤP không được kéo lên ở tab Tất cả"


def test_bo_loc_chi_tra_khach_trong_pham_vi(
    client, sess, admin, customer, sale_own, lenh_cua_sale_own,
):
    """`/bo-loc` nay chỉ còn ô Khách, gác `lenh_san_xuat:read`, và hẹp đúng phạm vi người gọi:
    khách của lệnh NGƯỜI KHÁC bán không được lọt vào ô của người bán scope `own`."""
    khac = Customer(name="Khách của sale khác DS")
    sess.add(khac)
    sess.commit()
    _lenh_tho(sess, ma="LSX-DS-KHAC", sale_user_id=admin.id, customer_id=khac.id)

    tok = _tok(client, {"username": sale_own.username, "password": "x"})
    r = client.get("/api/lenh-san-xuat/bo-loc", headers=_h(tok))
    assert r.status_code == 200
    d = r.json()
    assert set(d) == {"khach_hang"}
    assert [k["ten"] for k in d["khach_hang"]] == [customer.name]
    assert all(set(k) == {"id", "ten"} for k in d["khach_hang"])


def test_summary_da_go(client, seed_credentials):
    h = _h(_tok(client, seed_credentials))
    assert client.get("/api/lenh-san-xuat/summary", headers=h).status_code in (404, 422)
```

(Fixture `sale_own` tạo người dùng mật khẩu `"x"` với vai seed "NV Sales" scope `own`; `lenh_cua_sale_own` gắn `customer` "Khách Danh Sách".)

Trong `backend/tests/test_lenh_sx_con_song.py`: xoá `_danh_sach_cu`, `_summary_cu`, `test_tien_de_the_gioi_co_du_hinh_dang`, `test_danh_sach_khong_doi_ket_qua_moi_tab_moi_trang`, `test_summary_khong_doi_ket_qua`, `test_summary_chi_nap_lenh_song_va_lenh_co_viec_hom_nay` (bài so với bản cũ hết nghĩa khi ngữ nghĩa tab đổi; hai bài theo máy để Task 5 xử). Thay nguyên `test_danh_sach_khong_nap_lenh_da_giao_het_ngoai_trang` bằng:

```python
def test_danh_sach_khong_nap_lenh_da_giao_het_ngoai_trang(sess, the_gioi, nap_ghi):
    """Lệnh đã giao hết chỉ được nạp khi rơi vào TRANG đang xem. Tab Tất cả sắp hạn GIẢM dần nên
    ba lệnh cũ (hạn 2025) nằm ở hai trang cuối với page_size=2 (8 lệnh: gap 20/09, ba lệnh 10/09,
    giao_thieu 03/09, cu_tho 10/01/2025, hom_nay 09/01/2025, cu_that 08/01/2025)."""
    cu = {the_gioi["cu_tho"], the_gioi["cu_that"], the_gioi["hom_nay"]}
    song = {the_gioi[k] for k in ("dang", "giao_thieu", "gap", "ghep_a", "ghep_b")}

    danh_sach.danh_sach(sess, sale_ids=None, tab=trang_thai.KHAU_DANG_SX)
    da_nap = set().union(*nap_ghi)
    assert not (cu & da_nap), "lệnh đã giao hết vẫn bị nạp ở tab không chứa nó"
    assert song <= da_nap

    nap_ghi.clear()
    kq = danh_sach.danh_sach(sess, sale_ids=None, tab=danh_sach.TAB_TAT_CA, page=1, page_size=2)
    assert not (cu & {r["id"] for r in kq["items"]})
    assert not (cu & set().union(*nap_ghi))

    nap_ghi.clear()
    kq = danh_sach.danh_sach(sess, sale_ids=None, tab=danh_sach.TAB_TAT_CA, page=4, page_size=2)
    tren_trang = {r["id"] for r in kq["items"]}
    assert tren_trang == {the_gioi["hom_nay"], the_gioi["cu_that"]}
    assert cu & set().union(*nap_ghi) == tren_trang
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `python -m pytest tests/test_lenh_sx_api.py tests/test_lenh_sx_con_song.py -q`
Expected: FAIL ở các bài mới/sửa (vd `test_item_chi_con_cot_tinh` lệch tập khoá, `test_loc_khach_hang` 200 nhưng không lọc, `test_tab_la_gia_tri_khong_hop_le_bi_chan` nhận 200 cho `canh_bao`). Các bài `test_theo_may_*` của `test_lenh_sx_con_song.py` vẫn xanh (chưa đụng).

- [ ] **Step 3: Viết service**

Trong `backend/app/services/lenh_sx/danh_sach.py`:

1. Thay docstring đầu tệp (toàn bộ khối `"""…"""` trước `from __future__`) bằng:

```python
"""Tầng DANH SÁCH của màn "Hồ sơ lệnh sản xuất" — tra cứu mọi lệnh đã phát hành (làm gọn 05/10/2026).

`danh_sach()` trả bảng + facet bốn tab theo KHÂU (`trang_thai.khau`): Tất cả · Đang sản xuất ·
Sau sản xuất · Đã giao đủ. Khâu không đọc cờ cảnh báo, nên danh sách KHÔNG chạy `can_doi()` lẫn
đường găng — cảnh báo là việc của màn Theo dõi (`theo_doi.py`).

Lọc hai tầng, như trước:
  TẦNG 1 — SQL (`_loc_sql`): phạm vi người bán + đã phát hành, `q`, khách, khoảng hạn SX.
  TẦNG 2 — Python: lệnh đã giao hết tách bằng `_tach_da_giao_het` (A7, không nạp); lệnh còn sống
           qua MỘT `boi_canh.nap()` rồi `khau()` ⇒ đếm tab ⇒ lọc tab ⇒ sắp ⇒ cắt trang.

Sắp: tab Đang sản xuất và Sau sản xuất giữ GẤP → hạn tăng → mã (`_khoa_sap`); tab Tất cả và Đã giao
đủ là tra cứu nên hạn GIẢM dần → mã (`_khoa_sap_tra_cuu`) — xếp tăng thì trang 1 toàn lệnh cũ.

`_soi`, `buoc_hien_tai`, `may_cua_buoc`, `chang` giữ nguyên chữ ký: đơn hàng bán
(`services/don_hang_tien_do.py`) và Theo dõi gọi chúng.

Không một số tiền nào: hàm dựng dòng chỉ chạm mã · tên · khách · đơn · số lượng · hạn · khâu.
"""
```

2. Sửa import: thêm `TT_DA_DONG` vào `from ...models.lsx import Lsx, LsxCongDoan` → `from ...models.lsx import TT_DA_DONG, Lsx, LsxCongDoan`. Xoá import `MayThietBi` nếu sau bước 6 không còn dùng (kiểm bằng `grep -n "MayThietBi" backend/app/services/lenh_sx/danh_sach.py`).

3. Thay khối hằng tab (`TAB_TAT_CA` … `TAB_CHO_PHEP`) bằng:

```python
# Tab "tất cả" đứng cạnh ba khâu của `trang_thai.KHAU`; giá trị đi thẳng ra `?tab=` của API.
TAB_TAT_CA = "tat_ca"
TAB_CHO_PHEP = (TAB_TAT_CA,) + trang_thai.KHAU
```

(giữ nguyên `UU_TIEN_GAP`, `UU_TIEN_THUONG`, `UU_TIEN_CHO_PHEP`, `PAGE_SIZE_*`, `CHANG_*`, `_NGAY_XA`, `_LUC_XA`, `_LUC_XUA`).

4. Thay nguyên hàm `_loc_sql` bằng:

```python
def _loc_sql(
    sale_ids: set[int] | None, *,
    q: str | None, khach_hang_id: int | None, tu_ngay: date | None, den_ngay: date | None,
):
    """`select(Lsx.id)` đã gắn hết phần lọc SQL diễn đạt được.

    Khoảng ngày soi `han_hoan_thanh_sx` (hạn SX nội bộ); lệnh chưa có hạn rơi ra ngoài mọi khoảng.
    Khách đi qua SUBQUERY trên `orders`, không `join`: phạm vi hẹp có thể đã join `orders` rồi.
    """
    stmt = pham_vi.loc_lsx_da_phat_hanh(select(Lsx.id), sale_ids)

    if q and q.strip():
        mau = f"%{q.strip()}%"
        don_khop = (
            select(Order.id)
            .outerjoin(Customer, Customer.id == Order.customer_id)
            .where(or_(Order.order_no.ilike(mau), Customer.name.ilike(mau)))
        )
        stmt = stmt.where(
            or_(Lsx.ma.ilike(mau), Lsx.ten.ilike(mau), Lsx.order_id.in_(don_khop))
        )
    if khach_hang_id is not None:
        stmt = stmt.where(
            Lsx.order_id.in_(select(Order.id).where(Order.customer_id == khach_hang_id))
        )
    if tu_ngay is not None:
        stmt = stmt.where(Lsx.han_hoan_thanh_sx >= tu_ngay)
    if den_ngay is not None:
        stmt = stmt.where(Lsx.han_hoan_thanh_sx <= den_ngay)
    return stmt
```

5. Thay nguyên hàm `_dong` bằng:

```python
def _dong(bc: BoiCanh, lsx_id: int, khau_ct: tuple[str, str | None]) -> dict:
    """MỘT dòng bảng tra cứu — chỉ cột tĩnh."""
    lsx = bc.lenh[lsx_id]
    don = bc.don.get(lsx.order_id)
    khach = bc.khach.get(don.customer_id) if don is not None and don.customer_id else None
    return {
        "id": lsx.id,
        "ma": lsx.ma,
        "ten": lsx.ten,
        "so_luong_dat": lsx.so_luong_dat,
        "don_vi_tinh": lsx.don_vi_tinh,
        "khach_hang": khach.name if khach is not None else None,
        "order_id": lsx.order_id,
        "order_no": don.order_no if don is not None else None,
        "han_hoan_thanh_sx": lsx.han_hoan_thanh_sx,
        "is_rush": bool(lsx.is_rush),
        "khau": khau_ct[0],
        "khau_chi_tiet": khau_ct[1],
        "da_dong": lsx.trang_thai == TT_DA_DONG,
    }
```

6. Thêm ngay dưới `_khoa_sap`:

```python
def _khoa_sap_tra_cuu(lsx: LenhNhe) -> tuple:
    """Tab Tất cả / Đã giao đủ: hạn SX GIẢM dần, lệnh chưa có hạn xuống cuối, mã làm nấc cuối để
    thứ tự toàn phần (trang 1 và trang 2 không chồng nhau)."""
    han = lsx.han_hoan_thanh_sx
    return (0 if han is not None else 1, -han.toordinal() if han is not None else 0, lsx.ma or "")
```

7. Thay nguyên hàm `danh_sach` bằng:

```python
def danh_sach(
    db: Session, *, sale_ids: set[int] | None,
    tab: str | None = None, q: str | None = None, khach_hang_id: int | None = None,
    tu_ngay: date | None = None, den_ngay: date | None = None,
    page: int = 1, page_size: int = PAGE_SIZE_MAC_DINH,
) -> dict:
    """`{items, total, page, page_size, dem_theo_tab}` — bảng đã lọc, đếm và CẮT TRANG ở máy chủ.

    `dem_theo_tab` là FACET: đổi ô lọc thì số đổi, bấm sang tab khác thì số đứng yên.
    """
    page = max(1, page)
    page_size = max(1, min(page_size, PAGE_SIZE_TOI_DA))

    ids = list(db.execute(_loc_sql(
        sale_ids, q=q, khach_hang_id=khach_hang_id, tu_ngay=tu_ngay, den_ngay=den_ngay,
    )).scalars())
    nhe, da_giao_het = _tach_da_giao_het(db, ids)
    song = [i for i in ids if i not in da_giao_het]
    bc = boi_canh.nap(db, song)
    kh: dict[int, tuple[str, str | None]] = {i: trang_thai.khau(bc, i) for i in song}
    for i in da_giao_het:
        kh[i] = (trang_thai.KHAU_DA_GIAO, None)

    dem = {t: 0 for t in trang_thai.KHAU}
    for i in ids:
        dem[kh[i][0]] += 1
    dem[TAB_TAT_CA] = len(ids)

    if tab and tab != TAB_TAT_CA:
        ids = [i for i in ids if kh[i][0] == tab]
    if tab in (trang_thai.KHAU_DANG_SX, trang_thai.KHAU_SAU_SX):
        ids.sort(key=lambda i: _khoa_sap(nhe[i]))
    else:
        ids.sort(key=lambda i: _khoa_sap_tra_cuu(nhe[i]))

    dau = (page - 1) * page_size
    trang = ids[dau:dau + page_size]
    tap_song = set(song)
    bc_trang = boi_canh.nap(db, [i for i in trang if i not in tap_song])
    return {
        "items": [_dong(bc if i in tap_song else bc_trang, i, kh[i]) for i in trang],
        "total": len(ids),
        "page": page,
        "page_size": page_size,
        "dem_theo_tab": dem,
    }
```

8. Thay nguyên hàm `bo_loc` bằng hai hàm:

```python
def khach_trong_pham_vi(db: Session, sale_ids: set[int] | None) -> list[dict]:
    """Khách CỦA CHÍNH các lệnh đã phát hành trong phạm vi người gọi — MỘT câu SQL.

    Nguồn chung của ô Khách ở cả Hồ sơ lệnh (`bo_loc` dưới đây) lẫn Theo dõi
    (`bang_theo_doi.bo_loc`); chọn một khách không có lệnh nào là ngõ cụt nên không bày cả sổ
    khách. Sắp theo tên rồi id để thứ tự ổn định."""
    trong = pham_vi.loc_lsx_da_phat_hanh(select(Lsx.id), sale_ids)
    rows = db.execute(
        select(Customer.id, Customer.name)
        .join(Order, Order.customer_id == Customer.id)
        .join(Lsx, Lsx.order_id == Order.id)
        .where(Lsx.id.in_(trong))
        .distinct()
    ).all()
    return sorted(
        ({"id": cid, "ten": ten} for cid, ten in rows),
        key=lambda k: (k["ten"] or "", k["id"]),
    )


def bo_loc(db: Session, *, sale_ids: set[int] | None) -> dict:
    """Nguồn ô Khách của Hồ sơ lệnh, gác `lenh_san_xuat:read` (không mượn đường của Theo dõi)."""
    return {"khach_hang": khach_trong_pham_vi(db, sale_ids)}
```

9. Xoá hẳn hàm `summary`. Sau đó chạy `grep -n "_ngay_xuong\|timedelta\|CV_DANG_CHAY\|CV_TAM_DUNG\|MayThietBi\|BaiGhepCongDoanMap" backend/app/services/lenh_sx/danh_sach.py` — tên nào chỉ còn ở dòng import/định nghĩa thì xoá (riêng `_ngay_xuong`: chạy thêm `grep -rn "_ngay_xuong" backend/app backend/tests`; chỉ xoá khi không còn ai gọi). `CV_DANG_CHAY`, `CV_TAM_DUNG`, `BaiGhepCongDoanMap` vẫn được `buoc_hien_tai`/`chang`/`_co_buoc` dùng — giữ.

- [ ] **Step 4: Viết schema**

Trong `backend/app/schemas/lenh_san_xuat.py`, thay nguyên các lớp `LenhSxItem`, `LenhSxMayLocOut`, `LenhSxBoLocOut`, `LenhSxSummaryOut` (giữ `LenhSxChang`, `LenhSxListOut`) bằng:

```python
class LenhSxItem(BaseModel):
    """MỘT dòng bảng Hồ sơ lệnh (làm gọn 05/10/2026) — chỉ cột tĩnh. `khau` ∈ `dang_sx` / `sau_sx`
    / `da_giao`; `khau_chi_tiet` ∈ `dang_kcs` / `cho_nhap_kho` / `san_sang_giao` khi `khau =
    sau_sx`, còn lại `None`. `da_dong` = KCS đã đóng lệnh (`lsx.trang_thai = da_dong`)."""

    id: int
    ma: str
    ten: str | None = None
    so_luong_dat: int
    don_vi_tinh: str | None = None
    khach_hang: str | None = None
    order_id: int | None = None
    order_no: str | None = None
    han_hoan_thanh_sx: date | None = None
    is_rush: bool = False
    khau: str
    khau_chi_tiet: str | None = None
    da_dong: bool = False


class LenhSxKhachLocOut(BaseModel):
    id: int
    ten: str | None = None


class LenhSxBoLocOut(BaseModel):
    """Nguồn ô Khách của Hồ sơ lệnh — khách của chính các lệnh trong phạm vi người gọi."""

    khach_hang: list[LenhSxKhachLocOut] = []
```

- [ ] **Step 5: Viết router**

Thay toàn bộ `backend/app/routers/lenh_san_xuat.py` bằng:

```python
"""Router màn "Hồ sơ lệnh sản xuất" — tra cứu lệnh đã phát hành (làm gọn 05/10/2026).

Prefix `/api/lenh-san-xuat`. RBAC MODULE = `lenh_san_xuat`.

PHẠM VI LẤY TỪ TOKEN: `sale_ids` luôn do `pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)`
sinh ra; không tham số nào cho người gọi tự nới phạm vi (bài canh `test_client_khong_tu_noi_pham_vi`).

Đường TĨNH (`/bo-loc`) khai TRƯỚC `/{lsx_id}`: FastAPI khớp theo thứ tự khai, khai ngược thì
`/bo-loc` bị route động nuốt và trả 422.

Router chỉ điều phối; nghiệp vụ ở `services/lenh_sx/danh_sach.py` và `ho_so.py`.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_authorization_service, require_permission
from ..models.user import User
from ..schemas.lenh_san_xuat import LenhSxBoLocOut, LenhSxHoSoOut, LenhSxListOut
from ..services.lenh_sx import danh_sach, ho_so, pham_vi, phieu_cong_nghe
from ..services.rbac_service import AuthorizationService

router = APIRouter(prefix="/api/lenh-san-xuat", tags=["lenh-san-xuat"])
MODULE = "lenh_san_xuat"
Authz = Annotated[AuthorizationService, Depends(get_authorization_service)]

# `Literal` từ chính hằng của service: giá trị lạ (kể cả tab cũ `canh_bao`) ăn 422 ở cửa thay vì
# lặng lẽ trả tập rỗng.
Tab = Literal[danh_sach.TAB_CHO_PHEP]


@router.get("/bo-loc", response_model=LenhSxBoLocOut)
def bo_loc(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
):
    """Nguồn ô Khách — khách của chính các lệnh trong phạm vi người gọi."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return danh_sach.bo_loc(db, sale_ids=sale_ids)


@router.get("", response_model=LenhSxListOut)
def danh_sach_lenh(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    tab: Tab | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    khach_hang_id: int | None = None,
    tu_ngay: date | None = None,
    den_ngay: date | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=danh_sach.PAGE_SIZE_TOI_DA)
    ] = danh_sach.PAGE_SIZE_MAC_DINH,
):
    """Bảng lệnh đã phát hành, đã lọc, đếm theo tab và CẮT TRANG ở máy chủ."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return danh_sach.danh_sach(
        db,
        sale_ids=sale_ids,
        tab=tab,
        q=q,
        khach_hang_id=khach_hang_id,
        tu_ngay=tu_ngay,
        den_ngay=den_ngay,
        page=page,
        page_size=page_size,
    )
```

rồi chép NGUYÊN hai hàm `ho_so_lenh` và `phieu_cong_nghe_pdf` của bản cũ (cùng decorator) xuống dưới, chỉ sửa trong docstring `ho_so_lenh` câu "Khai SAU `/summary`" thành "Khai SAU `/bo-loc`", và trong docstring `phieu_cong_nghe_pdf` cụm "hai đường tĩnh `/summary`/`/bo-loc`" thành "đường tĩnh `/bo-loc`".

- [ ] **Step 6: Chạy để thấy xanh**

Run: `python -m pytest tests/test_lenh_sx_api.py tests/test_lenh_sx_con_song.py tests/test_lenh_sx_trang_thai.py tests/test_lenh_sx_quyen.py tests/test_lenh_sx_pham_vi.py -q`
Expected: PASS. Nếu `test_lenh_sx_quyen.py` / `test_lenh_sx_pham_vi.py` có bài gọi `/summary` hoặc dùng tham số đã bỏ (`may_id`, `uu_tien`, `tre`, `nhom_cong_doan`) trên `/api/lenh-san-xuat`: bài quyền/phạm vi của `/summary` → chuyển sang `/bo-loc` (cùng ý canh quyền); bài dùng tham số bỏ → xoá tham số khỏi URL nếu ý canh là phạm vi, xoá bài nếu ý canh chính là bộ lọc đã bỏ. Ghi lại từng bài đã đổi trong message commit.

Run thêm: `python -m pytest tests/test_don_hang_tien_do.py -q` (nếu tệp tồn tại; `grep -rln "don_hang_tien_do" backend/tests` để tìm) — đơn hàng bán vẫn gọi `_soi`/`buoc_hien_tai`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/lenh_sx/danh_sach.py backend/app/schemas/lenh_san_xuat.py backend/app/routers/lenh_san_xuat.py backend/tests/test_lenh_sx_api.py backend/tests/test_lenh_sx_con_song.py
git diff --cached --stat
git commit -m "Hồ sơ lệnh SX (máy chủ): danh sách 4 tab theo khâu, lọc khách, sắp tra cứu; bỏ KPI và lọc máy/nhóm/ưu tiên/trễ"
```

---

### Task 3: Hồ sơ một lệnh — bỏ ba tổng sai, thêm trường cho phần đầu

**Files:**
- Modify: `backend/app/services/lenh_sx/ho_so.py` (`_thong_tin`, `_tien_do`, `_san_luong`)
- Modify: `backend/app/schemas/lenh_san_xuat.py` (`ThongTinOut`, `TienDoOut`, `SanLuongOut`)
- Test: `backend/tests/test_lenh_sx_ho_so.py`

**Interfaces:**
- Consumes: `trang_thai.khau` (Task 1).
- Produces (hồ sơ `GET /api/lenh-san-xuat/{id}`): `thong_tin.da_dong: bool`, `thong_tin.nhom_ten: str | None`, `tien_do.khau: str`, `tien_do.khau_chi_tiet: str | None`; `san_luong` chỉ còn `{batch: [...]}`.

- [ ] **Step 1: Viết bài kiểm thất bại**

Trong `backend/tests/test_lenh_sx_ho_so.py`, thay ba dòng assert tổng trong `test_san_luong_cong_don_moi_batch` và đổi tên bài:

```python
def test_san_luong_chi_con_tung_batch(client, seed_credentials, sess, admin, lenh_that):
    """Ba tổng `tong/tot/hong` đã GỠ (05/10/2026): chúng cộng mọi bước, tờ in lẫn thành phẩm. Số
    đúng nằm ở từng batch, gom theo bước ở giao diện."""
    cv = _cvs(sess, lenh_that)[0]
    _ghi_san_luong(sess, admin, cv, tong=300, tot=300)
    _ghi_san_luong(sess, admin, cv, tong=200, tot=180, hong=20)

    sl = _ho_so(client, seed_credentials, lenh_that)["san_luong"]
    assert set(sl) == {"batch"}
    assert len(sl["batch"]) == 2
    assert [b["tong"] for b in sl["batch"]] == [300.0, 200.0], "sắp theo mốc kết thúc"
    assert [b["tot"] for b in sl["batch"]] == [300.0, 180.0]
    assert sl["batch"][1]["hong"] == 20.0
    assert all(b["la_buoc_ghep"] is False for b in sl["batch"])
```

Thêm cuối tệp:

```python
def test_phan_dau_ho_so_co_khau_da_dong_va_nhom(client, seed_credentials, sess, lenh_that):
    d = _ho_so(client, seed_credentials, lenh_that)
    assert d["tien_do"]["khau"] == "dang_sx"
    assert d["tien_do"]["khau_chi_tiet"] is None
    assert d["thong_tin"]["da_dong"] is False
    assert "nhom_ten" in d["thong_tin"]

    sess.get(Lsx, lenh_that).trang_thai = "da_dong"
    sess.commit()
    assert _ho_so(client, seed_credentials, lenh_that)["thong_tin"]["da_dong"] is True
```

(Nếu tệp chưa import `Lsx`: thêm `from app.models.lsx import Lsx`.)

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `python -m pytest tests/test_lenh_sx_ho_so.py -q -k "san_luong_chi_con or phan_dau_ho_so"`
Expected: 2 FAIL (`set(sl)` còn có `tong`, `KeyError: 'khau'`).

- [ ] **Step 3: Sửa service + schema**

Trong `backend/app/services/lenh_sx/ho_so.py`:

- `_thong_tin`: thêm trước `return`:

```python
    nhom_id = next(
        (cv.nhom_id for cv in bc.cong_viec_du(lsx_id) if cv.nhom_id is not None), None
    )
    nhom = bc.nhom.get(nhom_id) if nhom_id is not None else None
```

  và thêm hai khoá vào dict trả về:

```python
        "da_dong": lsx.trang_thai == TT_DA_DONG,
        "nhom_ten": (nhom.ten or nhom.ma) if nhom is not None else None,
```

  (import `TT_DA_DONG` từ `...models.lsx` — xem dòng import `Lsx` sẵn có của tệp và thêm vào cùng dòng.)

- `_tien_do`: thêm trước `return` một dòng `khau, khau_ct = trang_thai.khau(bc, lsx_id)` và thêm hai khoá `"khau": khau, "khau_chi_tiet": khau_ct,` vào dict (tệp đã import `trang_thai`).

- `_san_luong`: bỏ biến `tong = tot = hong = 0.0` và ba dòng `+=`, đổi `return` thành `return {"batch": dong}`; sửa docstring thành: `"""Từng batch của mọi bước. Số của bước GHÉP là số của CẢ CA — nói rõ bằng `la_buoc_ghep`. KHÔNG có tổng: cộng qua các bước là cộng tờ in với thành phẩm (gỡ 05/10/2026)."""`

Trong `backend/app/schemas/lenh_san_xuat.py`:

- `ThongTinOut`: thêm `da_dong: bool = False` và `nhom_ten: str | None = None`.
- `TienDoOut`: thêm `khau: str = "dang_sx"` và `khau_chi_tiet: str | None = None`.
- `SanLuongOut`: xoá `tong`, `tot`, `hong`, chỉ còn `batch: list[SanLuongBatchOut] = []`.

- [ ] **Step 4: Chạy để thấy xanh**

Run: `python -m pytest tests/test_lenh_sx_ho_so.py tests/test_lenh_sx_pdf.py -q`
Expected: PASS (phiếu công nghệ không đọc `san_luong`). Bài nào khác trong `test_lenh_sx_ho_so.py` còn đọc `san_luong["tong"|"tot"|"hong"]` thì đổi sang tổng từ `batch` của đúng bước nó đang canh (`sum(b["tot"] for b in sl["batch"] if b["cong_viec_id"] == <id>)`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/lenh_sx/ho_so.py backend/app/schemas/lenh_san_xuat.py backend/tests/test_lenh_sx_ho_so.py
git diff --cached --stat
git commit -m "Hồ sơ lệnh SX (máy chủ): bỏ ba tổng sản lượng cộng lẫn bước; thêm khâu, đã đóng lệnh, tên nhóm"
```


---

### Task 4: Máy chủ Theo dõi — lượt nạp chung, dải bất thường, góc Theo lệnh

**Files:**
- Create: `backend/app/services/lenh_sx/theo_doi.py`
- Modify: `backend/app/schemas/theo_doi_san_xuat.py` (thêm cuối tệp)
- Modify: `backend/app/routers/theo_doi_san_xuat.py` (thêm import + route `/theo-lenh`)
- Modify: `backend/tests/lenh_sx_fixtures.py` (thêm `_dem_sql`, `_token_khong_quyen_theo_doi`, `_bat_dau_that`)
- Create: `backend/tests/test_theo_doi_theo_lenh.py`
- Create: `backend/tests/test_theo_doi_rung_lenh_cu.py` (thay `test_kanban_rung_lenh_cu.py`)
- Delete: `backend/tests/test_kanban_rung_lenh_cu.py`

**Interfaces:**
- Consumes: `trang_thai.khau`, `trang_thai.KHAU_*` (Task 1); `danh_sach.buoc_hien_tai(bc, lsx_id) -> SanXuatCongViec | None`, `danh_sach.chang(bc, lsx_id, cv) -> list[dict]` (có sẵn); `bang_theo_doi.BoLoc`, `_ids_trong_pham_vi(db, sale_ids, *, loc=None)`, `_bo_lenh_da_rung(db, ids, *, bay_gio=None)`, `_may_danh_muc(db)` (có sẵn, Task 6 giữ nguyên chữ ký).
- Produces:
  - `theo_doi.CO_LENH = ("tre_han", "su_co", "tam_dung", "kcs_khong_dat")`, `theo_doi.BT_MAY_HONG = "may_hong"`, `theo_doi.BT_CHUA_MAY = "chua_may"`, `theo_doi.BAT_THUONG = CO_LENH + ("may_hong", "chua_may")`, `theo_doi.GIOI_HAN_THEO_LENH = 200`.
  - `theo_doi._nap(db, sale_ids, bay_gio) -> _Nap` với các trường `ids, bc, xong, co, cv_song, lenh_cua_cv, may, tt_may`; `_la_gia_cong(cv)`, `_chua_may(cv)`, `_lenh_khop_loc(...)`, `_lenh_bat_thuong(n, khoa)`, `dem_bat_thuong(n) -> dict[str, int]` (Task 5 dùng lại).
  - `theo_doi.theo_lenh(db, *, sale_ids, q=None, khach_hang_id=None, may_id=None, bat_thuong=None, bay_gio=None) -> {items, total, bat_thuong}`; mỗi item: `lsx_id, ma, ten, is_rush, so_luong_dat, don_vi_tinh, khach_hang, chang, buoc_hien_tai, khau, khau_chi_tiet, han_hoan_thanh_sx, du_kien_xong, canh_bao, tre_ngay`.
  - Schema: `DemBatThuongOut`, `TheoLenhDongOut`, `TheoLenhOut`.
  - API: `GET /api/theo-doi-san-xuat/theo-lenh?q=&khach_hang_id=&may_id=&bat_thuong=` (giá trị `bat_thuong` lạ → 422).
  - Fixture chung: `_dem_sql(fn) -> int`, `_token_khong_quyen_theo_doi(sess) -> str`, `_bat_dau_that(sess, admin, cv, *, ma, ten)`.

- [ ] **Step 1: Chuyển ba helper vào fixture chung**

Trong `backend/tests/lenh_sx_fixtures.py`:

- Thêm vào khối import: `from sqlalchemy import event` (cạnh `from sqlalchemy import update` — gộp thành `from sqlalchemy import event, update`), `from app.db import engine` (cạnh `from app.db import SessionLocal` — gộp thành `from app.db import SessionLocal, engine`), `from app.security import create_access_token` (gộp với dòng `from app.security import hash_password`).
- Thêm cuối tệp:

```python
# --- Helper chung của các bài Theo dõi SX (rút từ `test_theo_doi_kanban.py`, 05/10/2026) ---------
def _dem_sql(fn) -> int:
    """Đếm câu SQL thật sự gửi xuống driver trong lúc chạy `fn`."""
    n = 0

    def _ghi(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001, ARG001
        nonlocal n
        n += 1

    event.listen(engine, "before_cursor_execute", _ghi)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", _ghi)
    return n


def _token_khong_quyen_theo_doi(sess) -> str:
    """Token của một người mà vai chỉ có `dashboard:own` — KHÔNG có `theo_doi_san_xuat`."""
    users = UserRepository(sess)
    co_san = users.get_by_username("td-khong-quyen")
    if co_san is not None:
        return create_access_token(str(co_san.id))
    kd = DepartmentRepository(sess).get_by_name("Kinh doanh")
    roles = RoleRepository(sess)
    role = roles.create(name="R-td-khong-quyen", department_id=kd.id)
    roles.set_permission(role_id=role.id, module_key="dashboard", can_read=True, scope="own")
    u = users.create(
        username="td-khong-quyen", name="U không quyền theo dõi SX",
        password_hash=hash_password("x"),
    )
    users.set_assignment(u, department_id=kd.id, role_id=role.id, is_active=True)
    sess.commit()
    return create_access_token(str(u.id))


def _bat_dau_that(sess, admin, cv, *, ma: str, ten: str) -> None:
    """Bắt đầu một bước qua ĐÚNG đường ghi production, KHÔNG kết thúc (xem `_chay_that`)."""
    to = sess.get(Department, cv.department_id)
    to.has_piece_work = True
    sess.commit()
    _giao_nguoi(sess, admin, cv, ma=ma, ten=ten)
    thuc_thi.bat_dau(sess, user=admin, cong_viec_id=cv.id)
    sess.expire_all()
```

Trong `backend/tests/test_theo_doi_kanban.py` xoá ba định nghĩa `_token_khong_quyen_theo_doi`, `_dem_sql`, `_bat_dau_that` và thêm ba tên đó vào khối `from tests.lenh_sx_fixtures import (...)` của tệp (tệp này còn sống tới Task 6).

Run: `python -m pytest tests/test_theo_doi_kanban.py -q`
Expected: PASS (chỉ chuyển chỗ).

- [ ] **Step 2: Viết bài kiểm thất bại**

Tạo `backend/tests/test_theo_doi_theo_lenh.py`:

```python
"""Góc Theo lệnh + dải bất thường của màn Theo dõi sản xuất (làm gọn 05/10/2026).

Dải bất thường đếm trên TOÀN tập lệnh còn sống trong phạm vi, trước ô tìm/khách/máy và trước chính
mục đang chọn — gõ tìm xong không được làm người ta tưởng sự cố đã hết. Màn này KHÔNG chạy cân đối
vật tư: cờ thiếu vật tư không thuộc dải (đặc tả 3.1).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from app.models.lsx import Lsx
from app.models.machine_unavailable import KIEU_CHAN, LY_DO_HONG_HOC, MachineUnavailablePeriod
from app.models.may_thiet_bi import MayThietBi
from app.models.san_xuat import CV_TAM_DUNG
from app.models.san_xuat_kcs import KCS_KHONG_DAT, SanXuatKcsBatch
from app.services.lenh_sx import theo_doi, trang_thai
from tests.lenh_sx_fixtures import (  # noqa: F401
    _cvs,
    _dem_sql,
    _dot_dong_don,
    _h,
    _lenh_tho,
    _phat_hanh_that,
    _tok,
    _token_khong_quyen_theo_doi,
    admin,
    customer,
    ghep_doi,
    lenh_cua_sale_own,
    lenh_that,
    lsx_svc,
    orders,
    sale_own,
    sess,
)
from tests.test_lenh_sx_trang_thai import _su_co

_HAN_XA = date(2099, 1, 1)


def _theo_lenh(sess, **kw) -> dict:
    return theo_doi.theo_lenh(sess, sale_ids=None, **kw)


def _ids(d: dict) -> list[int]:
    return [r["lsx_id"] for r in d["items"]]


@pytest.fixture
def xuong_co_chuyen(sess, orders, lsx_svc, admin, customer) -> dict[str, int]:
    """Bảy lệnh thật, mỗi lệnh dính ĐÚNG MỘT chuyện (cộng một lệnh sạch). Mọi bước đã xếp lên một
    máy bình thường, trừ bước đầu của lệnh `chua_may` — vì `_dung_lenh` để `may_id` rỗng cho mọi
    bước, không xếp thì lệnh nào cũng đếm vào "bước chưa có máy"."""
    _dot_dong_don(sess, 7)
    buoc = [("CTP", 15, 500), ("In", 360, 5000)]
    w = {
        k: _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=buoc)
        for k in ("sach", "tre_han", "su_co", "tam_dung", "kcs_khong_dat", "may_hong", "chua_may")
    }
    thuong = MayThietBi(ma="MAY-TL-THUONG", ten="Máy in thường (TL)", loai_may="in", active=True)
    hong = MayThietBi(ma="MAY-TL-HONG", ten="Máy in hỏng (TL)", loai_may="in", active=True)
    sess.add_all([thuong, hong])
    sess.flush()
    bay_gio = datetime.now(timezone.utc)
    sess.add(MachineUnavailablePeriod(
        may_id=hong.id, kieu=KIEU_CHAN, reason=LY_DO_HONG_HOC,
        unavailable_from=bay_gio - timedelta(days=1), unavailable_to=bay_gio + timedelta(days=1),
    ))
    for k, lsx_id in w.items():
        sess.get(Lsx, lsx_id).han_hoan_thanh_sx = _HAN_XA
        for cv in _cvs(sess, lsx_id):
            cv.may_id = thuong.id
    sess.get(Lsx, w["tre_han"]).han_hoan_thanh_sx = date(2020, 1, 1)
    _cvs(sess, w["tam_dung"])[0].trang_thai = CV_TAM_DUNG
    _cvs(sess, w["may_hong"])[1].may_id = hong.id
    _cvs(sess, w["chua_may"])[0].may_id = None
    sess.add(SanXuatKcsBatch(
        cong_viec_id=_cvs(sess, w["kcs_khong_dat"])[0].id,
        bat_dau=bay_gio - timedelta(hours=2), ket_thuc=bay_gio - timedelta(hours=1),
        so_luong_nhan=10, so_luong_dat=0, so_luong_khong_dat=10, don_vi="to",
        ket_luan=KCS_KHONG_DAT,
    ))
    sess.commit()
    _su_co(sess, w["su_co"], _cvs(sess, w["su_co"])[0].id, ma="YC-TL-SC")
    return w


def test_dai_bat_thuong_dem_dung_tung_muc(sess, xuong_co_chuyen):
    d = _theo_lenh(sess)
    assert d["bat_thuong"] == {
        "tre_han": 1, "su_co": 1, "tam_dung": 1, "kcs_khong_dat": 1, "may_hong": 1, "chua_may": 1,
    }


@pytest.mark.parametrize("khoa", theo_doi.BAT_THUONG)
def test_loc_bat_thuong_tung_muc(sess, xuong_co_chuyen, khoa):
    d = _theo_lenh(sess, bat_thuong=khoa)
    assert _ids(d) == [xuong_co_chuyen[khoa]]
    assert d["total"] == 1


def test_dai_bat_thuong_khong_doi_theo_o_tim_va_muc_dang_chon(sess, xuong_co_chuyen):
    het = _theo_lenh(sess)["bat_thuong"]
    tim = _theo_lenh(sess, q="khong-khop-lenh-nao")
    assert tim["items"] == [] and tim["total"] == 0
    assert tim["bat_thuong"] == het
    assert _theo_lenh(sess, bat_thuong="su_co")["bat_thuong"] == het


def test_canh_bao_tren_dong_va_tre_ngay(sess, xuong_co_chuyen):
    d = _theo_lenh(sess)
    dong = {r["lsx_id"]: r for r in d["items"]}
    assert dong[xuong_co_chuyen["sach"]]["canh_bao"] == []
    tre = dong[xuong_co_chuyen["tre_han"]]
    assert tre["canh_bao"] == [trang_thai.CO_TRE_HAN]
    assert tre["tre_ngay"] is not None and tre["tre_ngay"] > 0
    assert tre["du_kien_xong"] is not None
    assert dong[xuong_co_chuyen["su_co"]]["canh_bao"] == [trang_thai.CO_SU_CO]
    assert dong[xuong_co_chuyen["su_co"]]["tre_ngay"] is None


def test_dong_mang_dang_o_va_khau(sess, lenh_that):
    row = next(r for r in _theo_lenh(sess)["items"] if r["lsx_id"] == lenh_that)
    assert row["buoc_hien_tai"] == _cvs(sess, lenh_that)[0].ten_cong_doan
    assert len(row["chang"]) == 3
    assert sum(1 for c in row["chang"] if c["hien_tai"]) == 1
    assert row["khau"] == trang_thai.KHAU_DANG_SX
    assert row["khau_chi_tiet"] is None
    assert set(row) == {
        "lsx_id", "ma", "ten", "is_rush", "so_luong_dat", "don_vi_tinh", "khach_hang", "chang",
        "buoc_hien_tai", "khau", "khau_chi_tiet", "han_hoan_thanh_sx", "du_kien_xong",
        "canh_bao", "tre_ngay",
    }


def test_sap_so_co_giam_roi_gap_roi_han(sess, admin, customer, lenh_that):
    kw = dict(sale_user_id=admin.id, customer_id=customer.id)
    a = _lenh_tho(sess, ma="LSX-TL-A", han_sx=date(2099, 1, 9), **kw)
    gap = _lenh_tho(sess, ma="LSX-TL-GAP", han_sx=date(2099, 1, 20), is_rush=True, **kw)
    b = _lenh_tho(sess, ma="LSX-TL-B", han_sx=date(2099, 1, 5), **kw)
    sess.get(Lsx, lenh_that).han_hoan_thanh_sx = date(2099, 1, 30)
    sess.commit()
    _su_co(sess, lenh_that, _cvs(sess, lenh_that)[0].id, ma="YC-TL-SAP")
    assert _ids(_theo_lenh(sess)) == [lenh_that, gap, b, a]


def test_cat_o_200_dong_nhung_total_dem_du(sess, admin, customer, monkeypatch):
    monkeypatch.setattr(theo_doi, "GIOI_HAN_THEO_LENH", 3)
    for i in range(5):
        _lenh_tho(sess, ma=f"LSX-TL-CAT{i}", sale_user_id=admin.id, customer_id=customer.id)
    d = _theo_lenh(sess)
    assert len(d["items"]) == 3
    assert d["total"] == 5


def test_loc_may_bat_ca_buoc_ghep(sess, ghep_doi):
    a, b, cv_chung = ghep_doi
    may = MayThietBi(ma="MAY-TL-GHEP", ten="Máy in ca ghép (TL)", loai_may="in", active=True)
    sess.add(may)
    sess.flush()
    cv_chung.may_id = may.id
    sess.commit()
    assert sorted(_ids(_theo_lenh(sess, may_id=may.id))) == sorted([a, b])


def test_khong_chay_can_doi_vat_tu(sess, xuong_co_chuyen, monkeypatch):
    def cam(*_a, **_k):
        raise AssertionError("Theo dõi không được chạy cân đối vật tư")

    monkeypatch.setattr(trang_thai, "den_vat_tu_theo_lo", cam)
    assert _theo_lenh(sess)["total"] == len(xuong_co_chuyen)


def test_so_cau_sql_hang_tren_truc_lenh(sess, orders, lsx_svc, admin, customer):
    buoc = [("CTP", 15, 500), ("In", 360, 5000)]
    _dot_dong_don(sess, 6)
    for _ in range(3):
        _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=buoc)
    n3 = _dem_sql(lambda: _theo_lenh(sess))
    for _ in range(2):
        _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=buoc)
    n5 = _dem_sql(lambda: _theo_lenh(sess))
    assert _theo_lenh(sess)["total"] == 5
    assert n3 == n5, f"số câu SQL nở theo số lệnh: {n3} → {n5}"


# --- Cửa HTTP --------------------------------------------------------------------------------------
def test_api_theo_lenh(client, seed_credentials, sess, lenh_that):
    h = _h(_tok(client, seed_credentials))
    r = client.get("/api/theo-doi-san-xuat/theo-lenh", headers=h)
    assert r.status_code == 200
    d = r.json()
    assert set(d) == {"items", "total", "bat_thuong"}
    assert [i["lsx_id"] for i in d["items"]] == [lenh_that]


def test_api_bat_thuong_la_bi_chan(client, seed_credentials):
    h = _h(_tok(client, seed_credentials))
    r = client.get("/api/theo-doi-san-xuat/theo-lenh?bat_thuong=thieu_vat_tu", headers=h)
    assert r.status_code == 422


def test_api_theo_lenh_401_403(client, sess):
    assert client.get("/api/theo-doi-san-xuat/theo-lenh").status_code == 401
    h = _h(_token_khong_quyen_theo_doi(sess))
    assert client.get("/api/theo-doi-san-xuat/theo-lenh", headers=h).status_code == 403


def test_api_theo_lenh_hep_theo_pham_vi(client, sess, sale_own, lenh_cua_sale_own, lenh_that):
    h = _h(_tok(client, {"username": sale_own.username, "password": "x"}))
    d = client.get("/api/theo-doi-san-xuat/theo-lenh", headers=h).json()
    assert [i["lsx_id"] for i in d["items"]] == [lenh_cua_sale_own]
```

Tạo `backend/tests/test_theo_doi_rung_lenh_cu.py` bằng cách chép NGUYÊN `backend/tests/test_kanban_rung_lenh_cu.py` rồi sửa đúng bốn chỗ:

1. Docstring dòng đầu: `"""Theo dõi SX: lệnh đã GIAO HẾT rụng sau 3 ngày kể từ lần giao cuối (chốt 28/09/2026).` — câu "Trước đây mỗi lệnh từng phát hành có một card mãi mãi" đổi "card" thành "dòng".
2. Import: `from app.services.lenh_sx import bang_theo_doi, boi_canh` → `from app.services.lenh_sx import boi_canh, theo_doi`.
3. Thay hàm `_ids_card` bằng:

```python
def _ids_card(sess) -> set[int]:
    """Lệnh còn hiện ở Theo dõi — đọc góc Theo lệnh (một dòng mỗi lệnh còn sống)."""
    return {r["lsx_id"] for r in theo_doi.theo_lenh(sess, sale_ids=None)["items"]}
```

4. Trong `test_lenh_rung_khong_bi_nap_nang`: `bang_theo_doi.kanban(sess, sale_ids=None)` → `theo_doi.theo_lenh(sess, sale_ids=None)`; đổi tên bài `test_lenh_giao_het_qua_3_ngay_rung_khoi_kanban` → `test_lenh_giao_het_qua_3_ngay_rung_khoi_theo_doi`.

Rồi xoá tệp cũ: `git rm backend/tests/test_kanban_rung_lenh_cu.py`.

- [ ] **Step 3: Chạy để thấy đỏ**

Run: `python -m pytest tests/test_theo_doi_theo_lenh.py tests/test_theo_doi_rung_lenh_cu.py -q`
Expected: lỗi thu thập `ImportError: cannot import name 'theo_doi' from 'app.services.lenh_sx'`.

- [ ] **Step 4: Viết service**

Tạo `backend/app/services/lenh_sx/theo_doi.py`:

```python
"""Màn "Theo dõi sản xuất" — Theo máy, Theo lệnh và dải bất thường (làm gọn 05/10/2026).

Cả ba đọc MỘT lượt nạp (`_nap`): tập lệnh = `_ids_trong_pham_vi` (đã phát hành, đúng phạm vi token)
→ `_bo_lenh_da_rung` (luật 28/09) → MỘT `boi_canh.nap()` → `tien_do.du_kien_xong` +
`trang_thai.co_canh_bao(den_vat_tu=None)` cho từng lệnh → trạng thái máy cho máy còn dùng hoặc còn
việc. Không `can_doi()`: cờ thiếu vật tư không vào màn này. Số câu SQL hằng theo số lệnh.

Dải bất thường đếm trên TOÀN tập còn sống, TRƯỚC ô tìm/khách/máy và trước chính mục đang chọn — gõ
tìm xong không được làm người ta tưởng sự cố đã hết. Vì vậy lượt nạp KHÔNG lọc theo ô tìm; ô tìm,
khách, máy chạy thêm MỘT câu `select(Lsx.id)` (`bang_theo_doi._loc_ban`, cùng phép với Hồ sơ lệnh)
rồi giao với tập đã nạp.

Trạng thái máy: bốn trạng thái dẫn xuất của `may_trang_thai` (hỏng, bảo trì, chặn xếp lệnh, có
phiếu sửa) — BỎ nhánh `dang_chay` của `trang_thai_may` vì nhánh đó đọc KẾ HOẠCH Xếp lịch, không
phải máy có chạy thật. Máy có chạy hay không đọc từ công việc `running`/`paused` đã nạp.

Không một số tiền nào.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from ...models.may_thiet_bi import MayThietBi
from ...models.san_xuat import BUOC_MAY, BUOC_THUE_NGOAI, CV_HOAN_THANH, SanXuatCongViec
from .. import may_trang_thai
from ..gio_xuong import thuc_te_hien_thi
from . import boi_canh, danh_sach, tien_do, trang_thai
from .bang_theo_doi import BoLoc, _bo_lenh_da_rung, _ids_trong_pham_vi, _may_danh_muc
from .boi_canh import BoiCanh

# Sáu mục của dải bất thường — thứ tự = thứ tự trên màn; giá trị đi thẳng ra `?bat_thuong=`.
CO_LENH = (
    trang_thai.CO_TRE_HAN, trang_thai.CO_SU_CO, trang_thai.CO_TAM_DUNG,
    trang_thai.CO_KCS_KHONG_DAT,
)
BT_MAY_HONG = "may_hong"
BT_CHUA_MAY = "chua_may"
BAT_THUONG = CO_LENH + (BT_MAY_HONG, BT_CHUA_MAY)

# Góc Theo lệnh không phân trang (tập còn sống); quá ngưỡng thì cắt và FE nói rõ "Hiện 200 trên N".
GIOI_HAN_THEO_LENH = 200


@dataclass
class _Nap:
    """Kết quả MỘT lượt nạp — dùng chung cho Theo máy, Theo lệnh và dải bất thường."""

    ids: list[int]
    bc: BoiCanh
    xong: dict[int, datetime | None]
    co: dict[int, list[str]]
    # Công việc CHƯA xong của tập đã nạp, khử trùng theo id (một ca in ghép phục vụ nhiều lệnh).
    cv_song: dict[int, SanXuatCongViec]
    # cv.id → các lệnh nó phục vụ, sắp theo mã.
    lenh_cua_cv: dict[int, list[int]]
    may: dict[int, MayThietBi]
    # Chỉ máy CÓ chuyện: may_id → một trong may_dung / bao_tri / khoa / co_phieu_sua.
    tt_may: dict[int, str]


def _la_gia_cong(cv: SanXuatCongViec) -> bool:
    return cv.loai_buoc == BUOC_THUE_NGOAI or cv.gia_cong_ngoai_id is not None


def _chua_may(cv: SanXuatCongViec) -> bool:
    return cv.loai_buoc == BUOC_MAY and cv.may_id is None and not _la_gia_cong(cv)


def _trang_thai_may_that(db: Session, may_ids: list[int]) -> dict[int, str]:
    """Trạng thái máy KHÔNG đọc kế hoạch: bỏ nhánh `dang_chay` của `trang_thai_may`.

    `trang_thai_may` chỉ điền "có phiếu sửa" cho máy không có chuyện gì khác, nên máy nó coi là
    "đang chạy theo kế hoạch" bị bỏ qua phần phiếu sửa. Gạt nhánh đó đi thì phải điền lại phiếu sửa
    cho chính những máy ấy — thêm MỘT câu, không theo số máy."""
    tt = {
        m: v["trang_thai"]
        for m, v in may_trang_thai.trang_thai_may(db, may_ids).items()
        if v["trang_thai"] != may_trang_thai.TT_DANG_CHAY
    }
    con_lai = [m for m in may_ids if m not in tt]
    for m in may_trang_thai.phieu_sua_dang_mo(db, con_lai):
        tt[m] = may_trang_thai.TT_CO_PHIEU_SUA
    return tt


def _nap(db: Session, sale_ids: set[int] | None, bay_gio: datetime) -> _Nap:
    ids = _bo_lenh_da_rung(db, _ids_trong_pham_vi(db, sale_ids), bay_gio=bay_gio)
    bc = boi_canh.nap(db, ids)
    xong = {i: tien_do.du_kien_xong(bc, i, bay_gio) for i in ids}
    co = {i: trang_thai.co_canh_bao(bc, i, bay_gio, xong=xong[i]) for i in ids}

    cv_song: dict[int, SanXuatCongViec] = {}
    lenh_cua_cv: dict[int, list[int]] = {}
    for i in sorted(ids, key=lambda i: (bc.lenh[i].ma or "", i)):
        for cv in bc.cong_viec_du(i):
            if cv.trang_thai == CV_HOAN_THANH:
                continue
            cv_song[cv.id] = cv
            ds = lenh_cua_cv.setdefault(cv.id, [])
            if i not in ds:
                ds.append(i)

    may = _may_danh_muc(db)
    co_viec = {cv.may_id for cv in cv_song.values() if cv.may_id is not None}
    may_xet = [m for m, mm in may.items() if mm.active or m in co_viec]
    return _Nap(
        ids=ids, bc=bc, xong=xong, co=co, cv_song=cv_song, lenh_cua_cv=lenh_cua_cv,
        may=may, tt_may=_trang_thai_may_that(db, may_xet),
    )


def _lenh_khop_loc(
    db: Session, sale_ids: set[int] | None, n: _Nap, *,
    q: str | None, khach_hang_id: int | None, may_id: int | None,
) -> set[int] | None:
    """Tập lệnh khớp ô tìm/khách/máy — `None` khi không ô nào được điền (không lọc)."""
    co_q = bool(q and q.strip())
    if not co_q and khach_hang_id is None and may_id is None:
        return None
    loc = BoLoc(q=q if co_q else None, khach_hang_id=khach_hang_id, may_id=may_id)
    return set(_ids_trong_pham_vi(db, sale_ids, loc=loc)) & set(n.ids)


def _lenh_bat_thuong(n: _Nap, khoa: str) -> set[int]:
    """Lệnh dính mục bất thường `khoa`. Hai mục máy quy về lệnh có BƯỚC CHƯA XONG dính máy đó."""
    if khoa in CO_LENH:
        return {i for i in n.ids if khoa in n.co[i]}
    if khoa == BT_MAY_HONG:
        hong = {m for m, tt in n.tt_may.items() if tt == may_trang_thai.TT_MAY_DUNG}
        chon = (cv for cv in n.cv_song.values() if cv.may_id in hong)
    else:
        chon = (cv for cv in n.cv_song.values() if _chua_may(cv))
    return {i for cv in chon for i in n.lenh_cua_cv[cv.id]}


def dem_bat_thuong(n: _Nap) -> dict[str, int]:
    """Số trên dải bất thường: bốn cờ đếm LỆNH, "máy hỏng" đếm MÁY, "bước chưa có máy" đếm BƯỚC."""
    dem = {k: len(_lenh_bat_thuong(n, k)) for k in CO_LENH}
    dem[BT_MAY_HONG] = sum(1 for tt in n.tt_may.values() if tt == may_trang_thai.TT_MAY_DUNG)
    dem[BT_CHUA_MAY] = sum(1 for cv in n.cv_song.values() if _chua_may(cv))
    return dem


def _khoa_sap_theo_lenh(n: _Nap, lsx_id: int) -> tuple:
    """Số cờ giảm dần → GẤP trước → hạn SX tăng (chưa có hạn xuống cuối) → mã."""
    lsx = n.bc.lenh[lsx_id]
    han = lsx.han_hoan_thanh_sx
    return (
        -len(n.co[lsx_id]), 0 if lsx.is_rush else 1,
        0 if han is not None else 1, han or date.max, lsx.ma or "", lsx_id,
    )


def _dong_lenh(n: _Nap, lsx_id: int) -> dict:
    bc = n.bc
    lsx = bc.lenh[lsx_id]
    don = bc.don.get(lsx.order_id)
    khach = bc.khach.get(don.customer_id) if don is not None and don.customer_id else None
    cv = danh_sach.buoc_hien_tai(bc, lsx_id)
    khau, khau_ct = trang_thai.khau(bc, lsx_id)
    xong = n.xong[lsx_id]
    tre_ngay = None
    if trang_thai.CO_TRE_HAN in n.co[lsx_id] and xong is not None and lsx.han_hoan_thanh_sx:
        tre_ngay = (xong.astimezone(tien_do.BUSINESS_TZ).date() - lsx.han_hoan_thanh_sx).days
    return {
        "lsx_id": lsx.id,
        "ma": lsx.ma,
        "ten": lsx.ten,
        "is_rush": bool(lsx.is_rush),
        "so_luong_dat": lsx.so_luong_dat,
        "don_vi_tinh": lsx.don_vi_tinh,
        "khach_hang": khach.name if khach is not None else None,
        "chang": danh_sach.chang(bc, lsx_id, cv),
        "buoc_hien_tai": cv.ten_cong_doan if cv is not None else None,
        "khau": khau,
        "khau_chi_tiet": khau_ct,
        "han_hoan_thanh_sx": lsx.han_hoan_thanh_sx,
        "du_kien_xong": thuc_te_hien_thi(xong),
        "canh_bao": list(n.co[lsx_id]),
        "tre_ngay": tre_ngay,
    }


def theo_lenh(
    db: Session, *, sale_ids: set[int] | None,
    q: str | None = None, khach_hang_id: int | None = None, may_id: int | None = None,
    bat_thuong: str | None = None, bay_gio: datetime | None = None,
) -> dict:
    """`{items, total, bat_thuong}` — mỗi lệnh còn sống một dòng, cắt ở `GIOI_HAN_THEO_LENH`."""
    bay_gio = bay_gio or datetime.now(timezone.utc)
    n = _nap(db, sale_ids, bay_gio)
    ids = list(n.ids)
    khop = _lenh_khop_loc(db, sale_ids, n, q=q, khach_hang_id=khach_hang_id, may_id=may_id)
    if khop is not None:
        ids = [i for i in ids if i in khop]
    if bat_thuong:
        chon = _lenh_bat_thuong(n, bat_thuong)
        ids = [i for i in ids if i in chon]
    ids.sort(key=lambda i: _khoa_sap_theo_lenh(n, i))
    return {
        "items": [_dong_lenh(n, i) for i in ids[:GIOI_HAN_THEO_LENH]],
        "total": len(ids),
        "bat_thuong": dem_bat_thuong(n),
    }
```

- [ ] **Step 5: Viết schema + route**

Thêm cuối `backend/app/schemas/theo_doi_san_xuat.py` (thêm import `from .lenh_san_xuat import LenhSxChang` vào khối import đầu tệp):

```python
# --- Làm gọn 05/10/2026: dải bất thường + góc Theo lệnh -------------------------------------------
class DemBatThuongOut(BaseModel):
    """Số trên dải bất thường — đếm trên TOÀN tập còn sống trong phạm vi, trước ô tìm/khách/máy."""

    tre_han: int = 0
    su_co: int = 0
    tam_dung: int = 0
    kcs_khong_dat: int = 0
    may_hong: int = 0
    chua_may: int = 0


class TheoLenhDongOut(BaseModel):
    """MỘT lệnh còn sống. `canh_bao` ⊆ `tre_han` / `su_co` / `tam_dung` / `kcs_khong_dat`.
    `du_kien_xong` là giờ xưởng không nhãn múi; `tre_ngay` chỉ có khi `tre_han`."""

    lsx_id: int
    ma: str
    ten: str | None = None
    is_rush: bool = False
    so_luong_dat: int
    don_vi_tinh: str | None = None
    khach_hang: str | None = None
    chang: list[LenhSxChang] = []
    buoc_hien_tai: str | None = None
    khau: str
    khau_chi_tiet: str | None = None
    han_hoan_thanh_sx: date | None = None
    du_kien_xong: datetime | None = None
    canh_bao: list[str] = []
    tre_ngay: int | None = None


class TheoLenhOut(BaseModel):
    items: list[TheoLenhDongOut] = []
    total: int = 0
    bat_thuong: DemBatThuongOut
```

Trong `backend/app/routers/theo_doi_san_xuat.py`: thêm `TheoLenhOut` vào import schema, thêm `theo_doi` vào `from ..services.lenh_sx import ...`, thêm dưới khối `CaId = ...`:

```python
# `?bat_thuong=` — một trong sáu mục của dải bất thường; giá trị lạ (kể cả `thieu_vat_tu`) ăn 422.
BatThuong = Literal[theo_doi.BAT_THUONG]
```

và thêm route ngay sau route `/bo-loc`:

```python
@router.get("/theo-lenh", response_model=TheoLenhOut)
def theo_lenh(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    q: Annotated[str | None, Query(max_length=120)] = None,
    khach_hang_id: int | None = None,
    may_id: int | None = None,
    bat_thuong: BatThuong | None = None,
):
    """Góc Theo lệnh: mỗi lệnh còn sống một dòng + số của dải bất thường (một yêu cầu mỗi lượt)."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi.theo_lenh(
        db, sale_ids=sale_ids, q=q, khach_hang_id=khach_hang_id, may_id=may_id,
        bat_thuong=bat_thuong,
    )
```

- [ ] **Step 6: Chạy để thấy xanh**

Run: `python -m pytest tests/test_theo_doi_theo_lenh.py tests/test_theo_doi_rung_lenh_cu.py tests/test_theo_doi_kanban.py -q`
Expected: PASS. Nếu `test_dai_bat_thuong_dem_dung_tung_muc` lệch ở `tre_han` (0): `du_kien_xong` của lệnh fixture trả `None` — in `theo_doi.tien_do.du_kien_xong(...)` trong một bài tạm để xem; đừng nới bài, sửa fixture cho lệnh có đủ thời lượng (`_phat_hanh_that` đã khai phút cho từng bước).

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/lenh_sx/theo_doi.py backend/app/schemas/theo_doi_san_xuat.py backend/app/routers/theo_doi_san_xuat.py backend/tests/lenh_sx_fixtures.py backend/tests/test_theo_doi_kanban.py backend/tests/test_theo_doi_theo_lenh.py backend/tests/test_theo_doi_rung_lenh_cu.py
git diff --cached --stat
git commit -m "Theo dõi SX (máy chủ): góc Theo lệnh + dải bất thường trên một lượt nạp, không cân đối vật tư; luật rụng chạy trên Theo lệnh"
```

(`git rm` ở Step 2 đã đưa việc xoá `test_kanban_rung_lenh_cu.py` vào index — kiểm nó có trong `--stat`.)

---

### Task 5: Máy chủ Theo dõi — góc Theo máy mới

**Files:**
- Modify: `backend/app/services/lenh_sx/theo_doi.py` (thêm cuối tệp + import)
- Modify: `backend/app/schemas/theo_doi_san_xuat.py` (`LsxThamChieuOut` thêm hai trường; thay `MayLaneBlockOut`, `MayLaneOut`, `TheoMayOut` cũ bằng các lớp mới)
- Modify: `backend/app/routers/theo_doi_san_xuat.py` (thay route `/theo-may`)
- Create: `backend/tests/test_theo_doi_theo_may.py`
- Modify: `backend/tests/test_theo_doi_may_ca_gantt.py`, `backend/tests/test_lenh_sx_con_song.py`, `backend/tests/test_theo_doi_kanban.py` (xoá bài Theo máy cũ)

**Interfaces:**
- Consumes: `_nap`, `_Nap`, `_la_gia_cong`, `_chua_may`, `_lenh_khop_loc`, `_lenh_bat_thuong`, `dem_bat_thuong`, `CO_LENH`, `BT_MAY_HONG`, `BT_CHUA_MAY` (Task 4).
- Produces:
  - `theo_doi.theo_may(db, *, sale_ids, q=None, khach_hang_id=None, bat_thuong=None, bay_gio=None) -> {nhom, may_trong, bat_thuong}`.
  - Hằng: `NHOM_CHUA_MAY = "chua_may"`, `NHOM_MAY = "may"`, `NHOM_MAY_DA_XOA = "may_da_xoa"`, `NHOM_GIA_CONG = "gia_cong"`; `TT_CHO_XEP_MAY = "cho_xep_may"`, `TT_VIEC_DANG_CHAY = "dang_chay"`, `TT_VIEC_TAM_DUNG = "tam_dung"`, `TT_TRONG = "trong"`, `TT_O_NHA_GIA_CONG = "o_nha_gia_cong"`, `TT_CHO_MANG_DI = "cho_mang_di"`; `NHAN_TINH_TRANG: dict[str, str]`; `KE_TIEP_TOI_DA = 3`.
  - Mỗi nhóm: `{loai, ten, dong: [dòng]}`; mỗi dòng: `khoa, may_id, ten, ngung_dung, tinh_trang, nhan_tinh_trang, dang_chay, dang_chay_them, san_luong, ke_hoach_xong, ke_hoach_bat_dau, ke_tiep, ke_tiep_them`; việc: `cong_viec_id, ten_buoc, trang_thai, bai_ma, lsx: [{lsx_id, ma, ten, is_rush}]`; sản lượng: `tot, ke_hoach, don_vi, theo_don_vi: [{don_vi, tot}], ca_bai`.
  - Schema: `TdsxViecOut`, `TdsxSanLuongDonViOut`, `TdsxSanLuongOut`, `TdsxMayDongOut`, `TdsxNhomMayOut`, `TheoMayOut` (mới); `LsxThamChieuOut` thêm `ten: str | None`, `is_rush: bool`.
  - API: `GET /api/theo-doi-san-xuat/theo-may?q=&khach_hang_id=&bat_thuong=` (bỏ `tu`, `den`, `may_id` và các lọc cũ).

- [ ] **Step 1: Viết bài kiểm thất bại**

Tạo `backend/tests/test_theo_doi_theo_may.py`:

```python
"""Góc Theo máy của màn Theo dõi sản xuất (làm gọn 05/10/2026, đặc tả 3.3).

Thứ tự nhóm: Chưa có máy → nhóm máy theo `loai_may` (sắp tên) → Máy đã xoá → Gia công ngoài. Máy
bình thường không việc gập vào `may_trong`. Tình trạng đọc công việc THẬT, không đọc kế hoạch.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.gia_cong_ngoai import KIEU_MOT_PHAN, GiaCongNgoai
from app.models.lsx import Lsx
from app.models.machine_unavailable import KIEU_CHAN, LY_DO_HONG_HOC, MachineUnavailablePeriod
from app.models.may_thiet_bi import MayThietBi
from app.models.purchase import Supplier
from app.models.san_xuat import BUOC_THUE_NGOAI, CV_DANG_CHAY, CV_TAM_DUNG
from app.models.san_xuat_san_luong import SanXuatBatch
from app.services import may_trang_thai
from app.services.lenh_sx import theo_doi
from tests.lenh_sx_fixtures import (  # noqa: F401
    _cvs,
    _dem_sql,
    _dot_dong_don,
    _h,
    _phat_hanh_that,
    _tok,
    _token_khong_quyen_theo_doi,
    admin,
    customer,
    ghep_doi,
    lenh_that,
    lsx_svc,
    orders,
    sess,
)


def _theo_may(sess, **kw) -> dict:
    return theo_doi.theo_may(sess, sale_ids=None, **kw)


def _nhom(d: dict, loai: str) -> list[dict]:
    return [g for g in d["nhom"] if g["loai"] == loai]


def _dong_may(d: dict, may_id: int) -> dict:
    return next(r for g in d["nhom"] for r in g["dong"] if r["may_id"] == may_id)


def _may(sess, ma: str, ten: str, loai: str = "in", active: bool = True) -> MayThietBi:
    m = MayThietBi(ma=ma, ten=ten, loai_may=loai, active=active)
    sess.add(m)
    sess.commit()
    return m


def _gan_may(sess, cv, may: MayThietBi | None) -> None:
    cv.may_id = may.id if may is not None else None
    sess.commit()


def _batch(sess, cv, tot: float, don_vi: str) -> None:
    luc = datetime.now(timezone.utc)
    sess.add(SanXuatBatch(
        cong_viec_id=cv.id, bat_dau=luc - timedelta(hours=1), ket_thuc=luc,
        tong=tot, tot=tot, hong=0, don_vi=don_vi,
    ))
    sess.commit()


def test_nhom_chua_co_may_dung_dau_moi_buoc_mot_dong(sess, lenh_that):
    """`_dung_lenh` để mọi bước chưa có máy ⇒ ba dòng "Chờ xếp máy", nhóm đứng đầu."""
    in_ = _may(sess, "MAY-TM-IN", "Máy in (TM)")
    d = _theo_may(sess)
    assert d["nhom"][0]["loai"] == theo_doi.NHOM_CHUA_MAY
    dong = d["nhom"][0]["dong"]
    assert len(dong) == 3
    assert {r["tinh_trang"] for r in dong} == {theo_doi.TT_CHO_XEP_MAY}
    assert all(r["may_id"] is None and r["ten"] is None for r in dong)
    assert dong[0]["dang_chay"]["lsx"][0]["lsx_id"] == lenh_that
    assert [m["may_id"] for m in d["may_trong"]] == [in_.id]


def test_gom_theo_loai_may_nhom_sap_ten_may_sap_ten(sess, lenh_that):
    cvs = _cvs(sess, lenh_that)
    be = _may(sess, "MAY-TM-BE", "Bế B", loai="be")
    in_b = _may(sess, "MAY-TM-INB", "In B", loai="in")
    in_a = _may(sess, "MAY-TM-INA", "In A", loai="in")
    _gan_may(sess, cvs[0], in_b)
    _gan_may(sess, cvs[1], in_a)
    _gan_may(sess, cvs[2], be)
    d = _theo_may(sess)
    nhom_may = _nhom(d, theo_doi.NHOM_MAY)
    assert [g["ten"] for g in nhom_may] == ["be", "in"]
    assert [r["ten"] for r in nhom_may[1]["dong"]] == ["In A", "In B"]
    assert _nhom(d, theo_doi.NHOM_CHUA_MAY) == []


def test_tinh_trang_doc_viec_that_khong_doc_ke_hoach(sess, lenh_that, monkeypatch):
    """Bàn Xếp lịch nói máy đang chạy, nhưng không công việc nào `running` ⇒ "Đang trống" — và
    máy ấy gập vào `may_trong`."""
    may = _may(sess, "MAY-TM-KH", "Máy theo kế hoạch (TM)")
    monkeypatch.setattr(
        may_trang_thai, "lenh_dang_chay",
        lambda db, ids, bay_gio: {may.id: {"ma": "LSX-KH", "finish_at": None}},
    )
    d = _theo_may(sess)
    assert [m["may_id"] for m in d["may_trong"]] == [may.id]
    assert d["may_trong"][0]["tinh_trang"] == theo_doi.TT_TRONG


def test_viec_dang_chay_tam_dung_va_ke_tiep(sess, lenh_that):
    cvs = _cvs(sess, lenh_that)
    may = _may(sess, "MAY-TM-CHAY", "Máy chạy (TM)")
    for cv in cvs:
        cv.may_id = may.id
    cvs[0].trang_thai = CV_DANG_CHAY
    cvs[0].du_kien_ket_thuc = datetime(2026, 10, 5, 15, 30, tzinfo=timezone.utc)
    sess.commit()
    r = _dong_may(_theo_may(sess), may.id)
    assert r["tinh_trang"] == theo_doi.TT_VIEC_DANG_CHAY
    assert r["nhan_tinh_trang"] == "Đang chạy"
    assert r["dang_chay"]["cong_viec_id"] == cvs[0].id
    assert r["ke_hoach_xong"] == datetime(2026, 10, 5, 15, 30)
    assert [v["cong_viec_id"] for v in r["ke_tiep"]] == [cvs[1].id, cvs[2].id]
    assert r["ke_tiep_them"] == 0

    sess.get(type(cvs[0]), cvs[0].id).trang_thai = CV_TAM_DUNG
    sess.commit()
    r = _dong_may(_theo_may(sess), may.id)
    assert r["tinh_trang"] == theo_doi.TT_VIEC_TAM_DUNG
    assert r["nhan_tinh_trang"] == "Tạm dừng"


def test_thieu_du_kien_ket_thuc_tra_rong(sess, lenh_that):
    cv = _cvs(sess, lenh_that)[0]
    may = _may(sess, "MAY-TM-RONG", "Máy thiếu mốc (TM)")
    cv.may_id = may.id
    cv.trang_thai = CV_DANG_CHAY
    cv.du_kien_ket_thuc = None
    sess.commit()
    assert _dong_may(_theo_may(sess), may.id)["ke_hoach_xong"] is None


def test_may_hong_thang_viec_dang_chay(sess, lenh_that):
    cv = _cvs(sess, lenh_that)[0]
    may = _may(sess, "MAY-TM-HONG", "Máy hỏng (TM)")
    cv.may_id = may.id
    cv.trang_thai = CV_DANG_CHAY
    bay_gio = datetime.now(timezone.utc)
    sess.add(MachineUnavailablePeriod(
        may_id=may.id, kieu=KIEU_CHAN, reason=LY_DO_HONG_HOC,
        unavailable_from=bay_gio - timedelta(days=1), unavailable_to=bay_gio + timedelta(days=1),
    ))
    sess.commit()
    d = _theo_may(sess)
    r = _dong_may(d, may.id)
    assert r["tinh_trang"] == may_trang_thai.TT_MAY_DUNG
    assert r["nhan_tinh_trang"] == may_trang_thai.NHAN[may_trang_thai.TT_MAY_DUNG]
    assert d["bat_thuong"]["may_hong"] == 1

    chi_hong = _theo_may(sess, bat_thuong=theo_doi.BT_MAY_HONG)
    assert [r["may_id"] for g in chi_hong["nhom"] for r in g["dong"]] == [may.id]
    assert chi_hong["may_trong"] == []


def test_gia_cong_ngoai_mot_dong_moi_nha_khong_lap_o_nhom_may(sess, lenh_that):
    cvs = _cvs(sess, lenh_that)
    may = _may(sess, "MAY-TM-GC", "Máy in (GC)")
    cvs[0].may_id = may.id
    cvs[1].loai_buoc = BUOC_THUE_NGOAI
    cvs[1].nha_cung_cap = "Cán màng Minh Long"
    cvs[1].may_id = may.id
    cvs[2].loai_buoc = BUOC_THUE_NGOAI
    cvs[2].nha_cung_cap = "Cán màng Minh Long"
    sess.commit()
    d = _theo_may(sess)
    gc = _nhom(d, theo_doi.NHOM_GIA_CONG)
    assert len(gc) == 1 and d["nhom"][-1]["loai"] == theo_doi.NHOM_GIA_CONG
    assert [r["ten"] for r in gc[0]["dong"]] == ["Cán màng Minh Long"]
    r = gc[0]["dong"][0]
    assert r["tinh_trang"] == theo_doi.TT_CHO_MANG_DI
    assert r["dang_chay_them"] == 1
    assert r["san_luong"] is None
    tren_may = _dong_may(d, may.id)
    viec = [tren_may["dang_chay"]] + tren_may["ke_tiep"]
    assert [v["cong_viec_id"] for v in viec if v] == [cvs[0].id]


def test_gia_cong_da_mang_di_lay_ten_tu_lan_gia_cong(sess, lenh_that):
    cv = _cvs(sess, lenh_that)[2]
    ncc = Supplier(name="Xưởng bế Hoà Phát")
    sess.add(ncc)
    sess.flush()
    lan = GiaCongNgoai(
        lsx_id=lenh_that, kieu=KIEU_MOT_PHAN, nha_cung_cap_id=ncc.id,
        nha_cung_cap_ten="Xưởng bế Hoà Phát", mang_di_luc=datetime.now(timezone.utc),
    )
    sess.add(lan)
    sess.flush()
    cv.loai_buoc = BUOC_THUE_NGOAI
    cv.nha_cung_cap = "Tên cũ chụp trên công việc"
    cv.gia_cong_ngoai_id = lan.id
    sess.commit()
    r = _nhom(_theo_may(sess), theo_doi.NHOM_GIA_CONG)[0]["dong"][0]
    assert r["ten"] == "Xưởng bế Hoà Phát"
    assert r["tinh_trang"] == theo_doi.TT_O_NHA_GIA_CONG


def test_viec_ghep_mot_dong_mang_du_lenh(sess, ghep_doi):
    a, b, cv_chung = ghep_doi
    may = _may(sess, "MAY-TM-GHEP", "Máy in ghép (TM)")
    cv_chung.may_id = may.id
    cv_chung.trang_thai = CV_DANG_CHAY
    sess.commit()
    r = _dong_may(_theo_may(sess), may.id)
    viec = r["dang_chay"]
    assert viec["cong_viec_id"] == cv_chung.id
    assert sorted(l["lsx_id"] for l in viec["lsx"]) == sorted([a, b])
    assert viec["bai_ma"] and viec["bai_ma"].startswith("GB-API-")
    assert r["san_luong"]["ca_bai"] is True


def test_me_khac_don_vi_khong_cong(sess, lenh_that):
    cv = _cvs(sess, lenh_that)[1]
    may = _may(sess, "MAY-TM-DV", "Máy hai đơn vị (TM)")
    cv.may_id = may.id
    cv.trang_thai = CV_DANG_CHAY
    sess.commit()
    dv = cv.don_vi_ra
    _batch(sess, cv, 300, dv)
    sl = _dong_may(_theo_may(sess), may.id)["san_luong"]
    assert sl["tot"] == 300 and sl["theo_don_vi"] == []

    _batch(sess, cv, 2, "ram")
    sl = _dong_may(_theo_may(sess), may.id)["san_luong"]
    assert sl["tot"] is None
    assert {(x["don_vi"], x["tot"]) for x in sl["theo_don_vi"]} == {(dv, 300.0), ("ram", 2.0)}


def test_may_ngung_dung_het_no_khong_hien_con_no_thi_hien(sess, lenh_that):
    het_no = _may(sess, "MAY-TM-NGUNG1", "Máy thanh lý sạch nợ", active=False)
    con_no = _may(sess, "MAY-TM-NGUNG2", "Máy thanh lý còn nợ", active=False)
    _gan_may(sess, _cvs(sess, lenh_that)[0], con_no)
    d = _theo_may(sess)
    moi_dong = [r for g in d["nhom"] for r in g["dong"]] + d["may_trong"]
    assert het_no.id not in {r["may_id"] for r in moi_dong}
    assert _dong_may(d, con_no.id)["ngung_dung"] is True


def test_loc_o_tim_chi_con_may_co_viec_cua_lenh_khop(sess, lenh_that, orders, lsx_svc, admin, customer):
    _dot_dong_don(sess, 3)
    khac = _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=[("CTP", 15, 500)])
    m1 = _may(sess, "MAY-TM-Q1", "Máy lệnh một (TM)")
    m2 = _may(sess, "MAY-TM-Q2", "Máy lệnh hai (TM)")
    for cv in _cvs(sess, lenh_that):
        cv.may_id = m1.id
    for cv in _cvs(sess, khac):
        cv.may_id = m2.id
    sess.commit()
    ma = sess.get(Lsx, lenh_that).ma
    d = _theo_may(sess, q=ma)
    assert [r["may_id"] for g in d["nhom"] for r in g["dong"]] == [m1.id]
    assert d["may_trong"] == []
    assert d["bat_thuong"] == _theo_may(sess)["bat_thuong"]


def test_loc_chua_may_chi_con_nhom_chua_co_may(sess, lenh_that):
    may = _may(sess, "MAY-TM-CM", "Máy (CM)")
    _gan_may(sess, _cvs(sess, lenh_that)[0], may)
    d = _theo_may(sess, bat_thuong=theo_doi.BT_CHUA_MAY)
    assert [g["loai"] for g in d["nhom"]] == [theo_doi.NHOM_CHUA_MAY]
    assert len(d["nhom"][0]["dong"]) == 2
    assert d["may_trong"] == []


def test_so_cau_sql_hang_tren_truc_lenh(sess, orders, lsx_svc, admin, customer):
    may = _may(sess, "MAY-TM-SQL", "Máy (SQL)")
    buoc = [("CTP", 15, 500), ("In", 360, 5000)]
    _dot_dong_don(sess, 6)

    def them():
        lsx_id = _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=buoc)
        for cv in _cvs(sess, lsx_id):
            cv.may_id = may.id
        sess.commit()

    for _ in range(3):
        them()
    n3 = _dem_sql(lambda: _theo_may(sess))
    for _ in range(2):
        them()
    n5 = _dem_sql(lambda: _theo_may(sess))
    assert n3 == n5, f"số câu SQL nở theo số lệnh: {n3} → {n5}"


def test_api_theo_may(client, seed_credentials, sess, lenh_that):
    h = _h(_tok(client, seed_credentials))
    r = client.get("/api/theo-doi-san-xuat/theo-may", headers=h)
    assert r.status_code == 200
    assert set(r.json()) == {"nhom", "may_trong", "bat_thuong"}
    assert client.get(
        "/api/theo-doi-san-xuat/theo-may?bat_thuong=la", headers=h
    ).status_code == 422
    assert client.get("/api/theo-doi-san-xuat/theo-may", headers=_h(
        _token_khong_quyen_theo_doi(sess)
    )).status_code == 403
```

(`GiaCongNgoai` buộc đúng một trong `lsx_id`/`bai_ghep_id` và `nha_cung_cap_id` trỏ `suppliers.id` — bài đã tạo `Supplier` thật.)

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `python -m pytest tests/test_theo_doi_theo_may.py -q`
Expected: FAIL `AttributeError: module 'app.services.lenh_sx.theo_doi' has no attribute 'theo_may'`.

- [ ] **Step 3: Viết service**

Trong `backend/app/services/lenh_sx/theo_doi.py`:

- Thêm vào khối import: `from sqlalchemy import select`; `from ...models.bai_ghep import BaiGhep`; `from ...models.gia_cong_ngoai import GiaCongNgoai`; mở rộng dòng import `san_xuat` thành `from ...models.san_xuat import (BUOC_MAY, BUOC_THUE_NGOAI, CV_DANG_CHAY, CV_HOAN_THANH, CV_PHAT_HANH, CV_TAM_DUNG, SanXuatCongViec,)`; mở rộng `from ..gio_xuong import lich_hien_thi, thuc_te_hien_thi`.
- Thêm cuối tệp:

```python
# --- Góc Theo máy (đặc tả 3.3) --------------------------------------------------------------------
NHOM_CHUA_MAY = "chua_may"
NHOM_MAY = "may"
NHOM_MAY_DA_XOA = "may_da_xoa"
NHOM_GIA_CONG = "gia_cong"

TT_CHO_XEP_MAY = "cho_xep_may"
TT_VIEC_DANG_CHAY = "dang_chay"
TT_VIEC_TAM_DUNG = "tam_dung"
TT_TRONG = "trong"
TT_O_NHA_GIA_CONG = "o_nha_gia_cong"
TT_CHO_MANG_DI = "cho_mang_di"

# Nhãn dựng ở MÁY CHỦ, cùng lý do `may_trang_thai.NHAN`: hai màn tự đặt tên là sớm muộn cùng một máy
# hiện hai chữ. Bốn trạng thái dẫn xuất mượn nguyên chữ của `may_trang_thai`.
NHAN_TINH_TRANG = {
    **{
        k: may_trang_thai.NHAN[k]
        for k in (
            may_trang_thai.TT_MAY_DUNG, may_trang_thai.TT_BAO_TRI, may_trang_thai.TT_KHOA,
            may_trang_thai.TT_CO_PHIEU_SUA,
        )
    },
    TT_VIEC_DANG_CHAY: "Đang chạy",
    TT_VIEC_TAM_DUNG: "Tạm dừng",
    TT_TRONG: "Đang trống",
    TT_CHO_XEP_MAY: "Chờ xếp máy",
    TT_O_NHA_GIA_CONG: "Đang ở nhà gia công",
    TT_CHO_MANG_DI: "Chờ mang đi",
}
NHAN_NHOM = {
    NHOM_CHUA_MAY: "Chưa có máy",
    NHOM_MAY_DA_XOA: "Máy không còn trong danh mục",
    NHOM_GIA_CONG: "Gia công ngoài",
}
NHAN_MAY_DA_XOA = "Máy đã xoá"
NHAN_CHUA_CHON_NCC = "Chưa chọn nhà gia công"
KE_TIEP_TOI_DA = 3
_MOC_XA = datetime(9999, 12, 31)


def _khoa_lich(cv: SanXuatCongViec) -> tuple:
    """Theo giờ bắt đầu kế hoạch; việc chưa có giờ xuống cuối."""
    moc = lich_hien_thi(cv.du_kien_bat_dau)
    return (moc is None, moc or _MOC_XA, cv.id)


def _viec(n: _Nap, cv: SanXuatCongViec, bai_ma: dict[int, str]) -> dict:
    lenh = n.bc.lenh
    return {
        "cong_viec_id": cv.id,
        "ten_buoc": cv.ten_cong_doan,
        "trang_thai": cv.trang_thai,
        "bai_ma": (
            bai_ma.get(cv.bai_ghep_id)
            if cv.bai_ghep_cong_doan_id is not None and cv.bai_ghep_id is not None else None
        ),
        "lsx": [
            {"lsx_id": i, "ma": lenh[i].ma, "ten": lenh[i].ten, "is_rush": bool(lenh[i].is_rush)}
            for i in n.lenh_cua_cv.get(cv.id, [])
        ],
    }


def _san_luong(bc: BoiCanh, cv: SanXuatCongViec) -> dict:
    """Σ `tot` các mẻ của MỘT công việc. Mẻ khác đơn vị với `don_vi_ra` thì KHÔNG cộng: trả từng
    đơn vị (`theo_don_vi`), `tot = None` để giao diện không vẽ thanh."""
    dv = (cv.don_vi_ra or "").strip()
    theo: dict[str, float] = {}
    for b in bc.batch.get(cv.id, []):
        k = (b.don_vi or "").strip()
        theo[k] = theo.get(k, 0.0) + float(b.tot or 0)
    cung = all(k == dv for k in theo)
    return {
        "tot": sum(theo.values()) if cung else None,
        "ke_hoach": float(cv.so_luong_ra) if cv.so_luong_ra is not None else None,
        "don_vi": dv or None,
        "theo_don_vi": (
            [] if cung else [{"don_vi": k or None, "tot": v} for k, v in sorted(theo.items())]
        ),
        "ca_bai": cv.bai_ghep_cong_doan_id is not None,
    }


def _dong(
    *, khoa: str, tinh_trang: str, may_id: int | None = None, ten: str | None = None,
    ngung_dung: bool = False, dang_chay: dict | None = None, dang_chay_them: int = 0,
    san_luong: dict | None = None, ke_hoach_xong: datetime | None = None,
    ke_hoach_bat_dau: datetime | None = None, ke_tiep: list[dict] | None = None,
    ke_tiep_them: int = 0,
) -> dict:
    return {
        "khoa": khoa, "may_id": may_id, "ten": ten, "ngung_dung": ngung_dung,
        "tinh_trang": tinh_trang, "nhan_tinh_trang": NHAN_TINH_TRANG[tinh_trang],
        "dang_chay": dang_chay, "dang_chay_them": dang_chay_them, "san_luong": san_luong,
        "ke_hoach_xong": ke_hoach_xong, "ke_hoach_bat_dau": ke_hoach_bat_dau,
        "ke_tiep": ke_tiep or [], "ke_tiep_them": ke_tiep_them,
    }


def _dong_may(
    n: _Nap, may_id: int, ten: str, ngung_dung: bool, cvs: list[SanXuatCongViec],
    bai_ma: dict[int, str],
) -> dict:
    chay = sorted(
        (cv for cv in cvs if cv.trang_thai in (CV_DANG_CHAY, CV_TAM_DUNG)),
        key=lambda cv: (cv.trang_thai != CV_DANG_CHAY, *_khoa_lich(cv)),
    )
    cho = sorted((cv for cv in cvs if cv.trang_thai == CV_PHAT_HANH), key=_khoa_lich)
    tt = n.tt_may.get(may_id)
    if tt is None:
        if chay and chay[0].trang_thai == CV_DANG_CHAY:
            tt = TT_VIEC_DANG_CHAY
        elif chay:
            tt = TT_VIEC_TAM_DUNG
        else:
            tt = TT_TRONG
    dau = chay[0] if chay else None
    return _dong(
        khoa=f"may:{may_id}", may_id=may_id, ten=ten, ngung_dung=ngung_dung, tinh_trang=tt,
        dang_chay=_viec(n, dau, bai_ma) if dau is not None else None,
        dang_chay_them=max(len(chay) - 1, 0),
        san_luong=_san_luong(n.bc, dau) if dau is not None else None,
        ke_hoach_xong=lich_hien_thi(dau.du_kien_ket_thuc) if dau is not None else None,
        ke_tiep=[_viec(n, cv, bai_ma) for cv in cho[:KE_TIEP_TOI_DA]],
        ke_tiep_them=max(len(cho) - KE_TIEP_TOI_DA, 0),
    )


def _ten_nha_gia_cong(cv: SanXuatCongViec, gcn: dict[int, GiaCongNgoai]) -> str:
    g = gcn.get(cv.gia_cong_ngoai_id) if cv.gia_cong_ngoai_id is not None else None
    if g is not None and g.huy_luc is None and (g.nha_cung_cap_ten or "").strip():
        return g.nha_cung_cap_ten.strip()
    return (cv.nha_cung_cap or "").strip() or NHAN_CHUA_CHON_NCC


def _dong_gia_cong(
    n: _Nap, ten: str, cvs: list[SanXuatCongViec], gcn: dict[int, GiaCongNgoai],
    bai_ma: dict[int, str],
) -> dict:
    cvs = sorted(cvs, key=_khoa_lich)
    da_mang = any(
        (g := gcn.get(cv.gia_cong_ngoai_id)) is not None
        and g.huy_luc is None and g.mang_di_luc is not None
        for cv in cvs
    )
    dau = cvs[0]
    return _dong(
        khoa=f"ncc:{ten}", ten=ten,
        tinh_trang=TT_O_NHA_GIA_CONG if da_mang else TT_CHO_MANG_DI,
        dang_chay=_viec(n, dau, bai_ma), dang_chay_them=len(cvs) - 1,
        ke_hoach_xong=lich_hien_thi(dau.du_kien_ket_thuc),
    )


def theo_may(
    db: Session, *, sale_ids: set[int] | None,
    q: str | None = None, khach_hang_id: int | None = None, bat_thuong: str | None = None,
    bay_gio: datetime | None = None,
) -> dict:
    """`{nhom, may_trong, bat_thuong}` — mỗi máy một dòng, chia nhóm (đặc tả 3.3).

    Có ô tìm/khách hoặc một trong bốn cờ lệnh: chỉ còn dòng có công việc (đang chạy hoặc kế tiếp)
    thuộc lệnh khớp lọc, và không còn dòng "máy đang trống". `may_hong`: chỉ còn máy hỏng.
    `chua_may`: chỉ còn nhóm Chưa có máy."""
    bay_gio = bay_gio or datetime.now(timezone.utc)
    n = _nap(db, sale_ids, bay_gio)
    lenh_chon = _lenh_khop_loc(db, sale_ids, n, q=q, khach_hang_id=khach_hang_id, may_id=None)
    if bat_thuong in CO_LENH:
        co = _lenh_bat_thuong(n, bat_thuong)
        lenh_chon = co if lenh_chon is None else lenh_chon & co

    def khop(cvs: list[SanXuatCongViec]) -> bool:
        if lenh_chon is None:
            return True
        return any(i in lenh_chon for cv in cvs for i in n.lenh_cua_cv.get(cv.id, ()))

    # Hai câu cho CẢ lô, luôn chạy (kể cả tập rỗng) để số câu SQL không đổi theo dữ liệu.
    bai_ma = dict(db.execute(
        select(BaiGhep.id, BaiGhep.ma).where(BaiGhep.id.in_(
            {cv.bai_ghep_id for cv in n.cv_song.values() if cv.bai_ghep_id is not None}
        ))
    ).all())
    gcn = {
        g.id: g for g in db.execute(select(GiaCongNgoai).where(GiaCongNgoai.id.in_(
            {cv.gia_cong_ngoai_id for cv in n.cv_song.values() if cv.gia_cong_ngoai_id}
        ))).scalars()
    }

    chua_may: list[SanXuatCongViec] = []
    gia_cong: dict[str, list[SanXuatCongViec]] = {}
    tren_may: dict[int, list[SanXuatCongViec]] = {}
    for cv in sorted(n.cv_song.values(), key=_khoa_lich):
        if _la_gia_cong(cv):
            gia_cong.setdefault(_ten_nha_gia_cong(cv, gcn), []).append(cv)
        elif _chua_may(cv):
            chua_may.append(cv)
        elif cv.may_id is not None:
            tren_may.setdefault(cv.may_id, []).append(cv)
        # Bước tổ (`loai_buoc = to`) không gắn máy — không thuộc bảng máy.

    nhom: list[dict] = []
    may_trong: list[dict] = []

    if bat_thuong != BT_MAY_HONG:
        dong = [
            _dong(
                khoa=f"cv:{cv.id}", tinh_trang=TT_CHO_XEP_MAY,
                dang_chay=_viec(n, cv, bai_ma),
                ke_hoach_bat_dau=lich_hien_thi(cv.du_kien_bat_dau),
            )
            for cv in chua_may if khop([cv])
        ]
        if dong:
            nhom.append({"loai": NHOM_CHUA_MAY, "ten": NHAN_NHOM[NHOM_CHUA_MAY], "dong": dong})

    if bat_thuong != BT_CHUA_MAY:
        theo_loai: dict[str, list[dict]] = {}
        da_xoa: list[dict] = []
        may_xet = [m for m, mm in n.may.items() if mm.active or m in tren_may]
        may_xet += sorted(m for m in tren_may if m not in n.may)
        for may_id in may_xet:
            m = n.may.get(may_id)
            cvs = tren_may.get(may_id, [])
            dong = _dong_may(
                n, may_id, m.ten if m is not None else NHAN_MAY_DA_XOA,
                bool(m is not None and not m.active), cvs, bai_ma,
            )
            if bat_thuong == BT_MAY_HONG:
                if dong["tinh_trang"] != may_trang_thai.TT_MAY_DUNG or not khop(cvs):
                    continue
            elif lenh_chon is not None:
                if not cvs or not khop(cvs):
                    continue
            elif dong["dang_chay"] is None and not dong["ke_tiep"] and dong["tinh_trang"] == TT_TRONG:
                may_trong.append(dong)
                continue
            if m is None:
                da_xoa.append(dong)
            else:
                theo_loai.setdefault(m.loai_may or "", []).append(dong)
        for loai in sorted(theo_loai):
            nhom.append({"loai": NHOM_MAY, "ten": loai, "dong": theo_loai[loai]})
        if da_xoa:
            nhom.append({"loai": NHOM_MAY_DA_XOA, "ten": NHAN_NHOM[NHOM_MAY_DA_XOA], "dong": da_xoa})

    if bat_thuong not in (BT_MAY_HONG, BT_CHUA_MAY):
        dong = [
            _dong_gia_cong(n, ten, cvs, gcn, bai_ma)
            for ten, cvs in sorted(gia_cong.items()) if khop(cvs)
        ]
        if dong:
            nhom.append({"loai": NHOM_GIA_CONG, "ten": NHAN_NHOM[NHOM_GIA_CONG], "dong": dong})

    return {"nhom": nhom, "may_trong": may_trong, "bat_thuong": dem_bat_thuong(n)}
```

(`n.may` đã sắp tên rồi mã — `_may_danh_muc` — nên máy trong nhóm theo tên. Nhóm `NHOM_MAY` mang `ten = loai_may`, đúng giá trị danh mục Nhóm máy; không hardcode tên nhóm nào.)

- [ ] **Step 4: Viết schema + route**

Trong `backend/app/schemas/theo_doi_san_xuat.py`:

- `LsxThamChieuOut`: thêm hai trường `ten: str | None = None` và `is_rush: bool = False` dưới `ma`.
- Xoá ba lớp `MayLaneBlockOut`, `MayLaneOut`, `TheoMayOut` cũ.
- Thêm cuối tệp (sau `TheoLenhOut`):

```python
# --- Góc Theo máy (làm gọn 05/10/2026, đặc tả 3.3) ------------------------------------------------
class TdsxViecOut(BaseModel):
    """MỘT công việc trên dòng máy. `bai_ma` có khi là việc GHÉP; `lsx` là mọi lệnh nó phục vụ —
    từ hai lệnh trở lên giao diện bắt chọn, không đoán lấy cái đầu."""

    cong_viec_id: int
    ten_buoc: str | None = None
    trang_thai: str
    bai_ma: str | None = None
    lsx: list[LsxThamChieuOut] = []


class TdsxSanLuongDonViOut(BaseModel):
    don_vi: str | None = None
    tot: float


class TdsxSanLuongOut(BaseModel):
    """`tot = None` khi mẻ ghi lẫn đơn vị — khi đó chỉ có `theo_don_vi`, không vẽ thanh."""

    tot: float | None = None
    ke_hoach: float | None = None
    don_vi: str | None = None
    theo_don_vi: list[TdsxSanLuongDonViOut] = []
    ca_bai: bool = False


class TdsxMayDongOut(BaseModel):
    """MỘT dòng của bảng Theo máy: một máy, một nhà gia công, hoặc một bước chưa có máy.
    `khoa` duy nhất trong cả bảng (`may:<id>`, `ncc:<tên>`, `cv:<id>`)."""

    khoa: str
    may_id: int | None = None
    ten: str | None = None
    ngung_dung: bool = False
    tinh_trang: str
    nhan_tinh_trang: str
    dang_chay: TdsxViecOut | None = None
    dang_chay_them: int = 0
    san_luong: TdsxSanLuongOut | None = None
    ke_hoach_xong: datetime | None = None
    ke_hoach_bat_dau: datetime | None = None
    ke_tiep: list[TdsxViecOut] = []
    ke_tiep_them: int = 0


class TdsxNhomMayOut(BaseModel):
    """`loai` ∈ `chua_may` / `may` / `may_da_xoa` / `gia_cong`; nhóm `may` mang `ten = loai_may`."""

    loai: str
    ten: str
    dong: list[TdsxMayDongOut] = []


class TheoMayOut(BaseModel):
    nhom: list[TdsxNhomMayOut] = []
    may_trong: list[TdsxMayDongOut] = []
    bat_thuong: DemBatThuongOut
```

Trong `backend/app/routers/theo_doi_san_xuat.py`, thay nguyên route `/theo-may` (decorator + hàm) bằng:

```python
@router.get("/theo-may", response_model=TheoMayOut)
def theo_may(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    q: Annotated[str | None, Query(max_length=120)] = None,
    khach_hang_id: int | None = None,
    bat_thuong: BatThuong | None = None,
):
    """Góc Theo máy: mỗi máy một dòng chia nhóm + số của dải bất thường (một yêu cầu mỗi lượt)."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi.theo_may(
        db, sale_ids=sale_ids, q=q, khach_hang_id=khach_hang_id, bat_thuong=bat_thuong,
    )
```

Nếu sau bước này `HTTPException` hoặc `date` không còn được dùng trong router (route cũ dùng chúng cho `tu > den`), để nguyên — Task 6 viết lại cả tệp.

- [ ] **Step 5: Xoá bài Theo máy cũ**

- `backend/tests/test_theo_doi_may_ca_gantt.py`: chạy `grep -n "^def test_theo_may\|^def test_.*theo_may\|/theo-may\|bang_theo_doi.theo_may" backend/tests/test_theo_doi_may_ca_gantt.py`; xoá mọi bài (cả thân) mà tên hoặc thân có một trong các mẫu đó. Fixture chỉ những bài đó dùng thì xoá theo.
- `backend/tests/test_theo_doi_kanban.py`: chạy cùng lệnh grep trên tệp này, xoá các bài khớp (trong đó có `test_bo_loc_may_co_viec_khop_dung_lane_cua_theo_may`).
- `backend/tests/test_lenh_sx_con_song.py`: xoá `_theo_may_cu`, `test_theo_may_khong_doi_ket_qua`, `test_theo_may_khong_nap_lenh_da_dong_het_buoc` và dòng chú thích khối `# --- Theo dõi SX — theo máy ---`; nếu `bang_theo_doi` không còn ai dùng trong tệp thì bỏ khỏi dòng import.

- [ ] **Step 6: Chạy để thấy xanh**

Run: `python -m pytest tests/test_theo_doi_theo_may.py tests/test_theo_doi_theo_lenh.py tests/test_theo_doi_kanban.py tests/test_theo_doi_may_ca_gantt.py tests/test_lenh_sx_con_song.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/lenh_sx/theo_doi.py backend/app/schemas/theo_doi_san_xuat.py backend/app/routers/theo_doi_san_xuat.py backend/tests/test_theo_doi_theo_may.py backend/tests/test_theo_doi_may_ca_gantt.py backend/tests/test_theo_doi_kanban.py backend/tests/test_lenh_sx_con_song.py
git diff --cached --stat
git commit -m "Theo dõi SX (máy chủ): góc Theo máy mới — nhóm Chưa có máy, nhóm máy theo loại, gia công ngoài; tình trạng đọc việc thật"
```

---

### Task 6: Máy chủ Theo dõi — xoá Kanban, Theo ca, Gantt; gọn bộ lọc

**Files:**
- Modify: `backend/app/services/san_xuat/board.py:800-814` (nhận `_ca_cua_moc`)
- Modify (viết lại toàn tệp): `backend/app/services/lenh_sx/bang_theo_doi.py`, `backend/app/routers/theo_doi_san_xuat.py`, `backend/app/schemas/theo_doi_san_xuat.py`
- Modify: `backend/app/services/lenh_sx/danh_sach.py` (xoá `UU_TIEN_*` nếu không còn ai dùng)
- Modify: `backend/app/repositories/attendance_repo.py:102`, `backend/app/services/xep_lich_service.py:515` (chữ docstring)
- Delete: `backend/tests/test_theo_doi_kanban.py`, `backend/tests/test_theo_doi_may_ca_gantt.py`
- Create: `backend/tests/test_theo_doi_bo_loc.py`, `backend/tests/test_seed_quyen_theo_doi.py`

**Interfaces:**
- Consumes: `danh_sach.khach_trong_pham_vi(db, sale_ids) -> list[{"id": int, "ten": str | None}]` (Task 2).
- Produces:
  - `bang_theo_doi` còn đúng: `KANBAN_GIU_SAU_GIAO`, `BoLoc(q, khach_hang_id, may_id)`, `_may_danh_muc`, `_cv_trong_pham_vi`, `_may_con_no_viec`, `_ids_trong_pham_vi(db, sale_ids, *, loc=None)`, `_loc_ban`, `bo_loc(db, *, sale_ids) -> {"may": [{id: str, ten, ngung_dung, co_viec}], "khach_hang": [{id: str, ten}]}`, `_bo_lenh_da_rung`.
  - `board._ca_cua_moc(cas, moc_tuong)` (chuyển nguyên văn).
  - API cuối của `/api/theo-doi-san-xuat`: `/bo-loc`, `/theo-may`, `/theo-lenh`; `/meta`, `/kanban`, `/theo-ca`, `/gantt` trả 404.

- [ ] **Step 1: Chuyển `_ca_cua_moc` sang bàn tổ**

Trong `backend/app/services/san_xuat/board.py`: thêm ngay TRÊN `def _ca_cua(cas, dt)` hàm sau (chép nguyên thân từ `bang_theo_doi._ca_cua_moc`, chỉ đổi kiểu tham số sang chữ vì `board.py` không import `WorkShift`):

```python
def _ca_cua_moc(cas, moc_tuong: datetime):
    """Ca (và NGÀY của ca đó) mà `moc_tuong` (giờ TƯỜNG, NAIVE) rơi vào — `(ca, ngay)` hoặc None.

    Ca qua nửa đêm tính theo mốc BẮT ĐẦU ca (Ruling C120): việc chạy 01:00 nằm trong cửa sổ
    `[0, end_minute)` của HÔM NAY là phần ĐUÔI của ca đã bắt đầu TỐI HÔM QUA — ngày của ca lùi một
    ngày. `cas` phải đã sort theo `start_minute` (đúng thứ tự `ca_lich_xuong()` trả về).

    Chuyển từ `lenh_sx/bang_theo_doi.py` (05/10/2026) khi tab Theo ca bị xoá — bàn tổ là nơi duy
    nhất còn dùng luật này."""
    phut = moc_tuong.hour * 60 + moc_tuong.minute
    ngay = moc_tuong.date()
    for ca in cas:
        if not ca.is_overnight:
            if ca.start_minute <= phut < ca.end_minute:
                return ca, ngay
        elif phut >= ca.start_minute:
            return ca, ngay
        elif phut < ca.end_minute:
            return ca, ngay - timedelta(days=1)
    return None
```

Trong `_ca_cua`: xoá dòng `from ..lenh_sx.bang_theo_doi import _ca_cua_moc` và sửa câu docstring "Dùng lại đúng `_ca_cua_moc` của Theo dõi sản xuất thay vì viết bản so giờ thứ hai" thành "Dùng `_ca_cua_moc` ngay trên". (`datetime`, `timedelta` đã có trong import của `board.py`.)

Run: `python -m pytest tests/test_san_xuat_board.py -q`
Expected: PASS.

- [ ] **Step 2: Viết bài kiểm mới (đỏ)**

Tạo `backend/tests/test_theo_doi_bo_loc.py`:

```python
"""Nguồn ô lọc của Theo dõi sản xuất (làm gọn 05/10/2026): còn đúng hai nhóm Máy và Khách.

Gác ô quyền `theo_doi_san_xuat` riêng — không mượn `/api/lenh-san-xuat/bo-loc` (gác ô khác)."""
from __future__ import annotations

from app.models.customer import Customer
from app.models.may_thiet_bi import MayThietBi
from app.services.lenh_sx import bang_theo_doi
from tests.lenh_sx_fixtures import (  # noqa: F401
    _cvs,
    _dem_sql,
    _h,
    _lenh_tho,
    _tok,
    _token_khong_quyen_theo_doi,
    admin,
    customer,
    lenh_cua_sale_own,
    lenh_that,
    lsx_svc,
    orders,
    sale_own,
    sess,
)


def test_bo_loc_chi_con_may_va_khach(client, seed_credentials, lenh_that):
    r = client.get("/api/theo-doi-san-xuat/bo-loc", headers=_h(_tok(client, seed_credentials)))
    assert r.status_code == 200
    assert set(r.json()) == {"may", "khach_hang"}


def test_bo_loc_may_mang_co_ngung_dung_va_co_viec(sess, lenh_that):
    ban = MayThietBi(ma="MAY-BL-BAN", ten="Máy bận (BL)", loai_may="in", active=True)
    ranh = MayThietBi(ma="MAY-BL-RANH", ten="Máy rảnh (BL)", loai_may="in", active=True)
    ngung = MayThietBi(ma="MAY-BL-NGUNG", ten="Máy ngừng (BL)", loai_may="be", active=False)
    sess.add_all([ban, ranh, ngung])
    sess.flush()
    _cvs(sess, lenh_that)[0].may_id = ban.id
    sess.commit()
    may = {m["ten"]: m for m in bang_theo_doi.bo_loc(sess, sale_ids=None)["may"]}
    assert may["Máy bận (BL)"]["co_viec"] is True
    assert may["Máy rảnh (BL)"]["co_viec"] is False
    assert may["Máy ngừng (BL)"]["ngung_dung"] is True
    assert all(isinstance(m["id"], str) for m in may.values())


def test_bo_loc_khach_hep_theo_pham_vi(client, sess, admin, customer, sale_own, lenh_cua_sale_own):
    khac = Customer(name="Khách của sale khác (BL)")
    sess.add(khac)
    sess.commit()
    _lenh_tho(sess, ma="LSX-BL-KHAC", sale_user_id=admin.id, customer_id=khac.id)
    h = _h(_tok(client, {"username": sale_own.username, "password": "x"}))
    d = client.get("/api/theo-doi-san-xuat/bo-loc", headers=h).json()
    assert d["khach_hang"] == [{"id": str(customer.id), "ten": customer.name}]


def test_bo_loc_so_cau_sql_hang(sess, admin, customer):
    n0 = _dem_sql(lambda: bang_theo_doi.bo_loc(sess, sale_ids=None))
    for i in range(3):
        sess.add(MayThietBi(ma=f"MAY-BL-SQL{i}", ten=f"Máy SQL {i}", loai_may="in", active=True))
        _lenh_tho(sess, ma=f"LSX-BL-SQL{i}", sale_user_id=admin.id, customer_id=customer.id)
    sess.commit()
    assert _dem_sql(lambda: bang_theo_doi.bo_loc(sess, sale_ids=None)) == n0


def test_bo_loc_403(client, sess):
    h = _h(_token_khong_quyen_theo_doi(sess))
    assert client.get("/api/theo-doi-san-xuat/bo-loc", headers=h).status_code == 403


def test_bon_duong_cu_da_go(client, seed_credentials):
    h = _h(_tok(client, seed_credentials))
    for duong in ("meta", "kanban", "theo-ca", "gantt"):
        assert client.get(f"/api/theo-doi-san-xuat/{duong}", headers=h).status_code == 404, duong
```

Tạo `backend/tests/test_seed_quyen_theo_doi.py`:

```python
"""Hồ sơ mở từ Theo dõi gọi đường của Hồ sơ lệnh, nên vai có `theo_doi_san_xuat` phải có
`lenh_san_xuat` cùng phạm vi — không thì người ta bấm một lệnh trên Theo dõi và ăn 403."""
from app.seed import ROLES


def test_vai_co_theo_doi_thi_co_ho_so_lenh_cung_pham_vi():
    lech = []
    for phong, vai, quyen in ROLES:
        td = quyen.get("theo_doi_san_xuat")
        if not td or not td.get("can_read"):
            continue
        hs = quyen.get("lenh_san_xuat") or {}
        if not hs.get("can_read") or hs.get("scope") != td.get("scope"):
            lech.append(f"{phong} / {vai}: theo dõi {td.get('scope')}, hồ sơ {hs.get('scope')}")
    assert not lech, "\n".join(lech)
```

Run: `python -m pytest tests/test_theo_doi_bo_loc.py tests/test_seed_quyen_theo_doi.py -q`
Expected: FAIL ở `test_bo_loc_chi_con_may_va_khach` (còn 8 nhóm), `test_bon_duong_cu_da_go` (200), `test_bo_loc_khach_hep_theo_pham_vi`; bài seed nên PASS ngay (seed hiện đúng) — nếu đỏ thì DỪNG và báo, không tự sửa seed.

- [ ] **Step 3: Viết lại `bang_theo_doi.py`**

Thay toàn bộ `backend/app/services/lenh_sx/bang_theo_doi.py` bằng:

```python
"""Phần dùng chung của màn "Theo dõi sản xuất": phạm vi, bộ lọc, luật rụng, nguồn ô lọc.

Làm gọn 05/10/2026: bốn góc nhìn cũ (Kanban · Theo máy · Theo ca · Gantt) đã xoá; hai góc mới ở
`theo_doi.py`. Tệp này giữ những gì cả hai góc mới và ô lọc cùng đọc, để không có hai bản sao.

--- BỘ LỌC CHỌN LỆNH, LỌC Ở SQL (Ruling C121) ----------------------------------------------------
`BoLoc` thu hẹp TẬP LỆNH ở SQL (`_loc_ban`) — ô tìm (mã/tên lệnh, số đơn, tên khách), khách, máy.
Lọc máy đi qua `danh_sach._co_buoc` (công việc riêng · công việc ghép · routing), cùng phép với
Hồ sơ lệnh: hai màn chọn cùng một máy phải ra cùng một tập lệnh.

--- LUẬT RỤNG (chốt 28/09/2026) ---------------------------------------------------------------------
`_bo_lenh_da_rung`: giao đủ + lần giao cuối quá `KANBAN_GIU_SAU_GIAO` + không còn việc đang chạy /
tạm dừng ⇒ không hiện ở Theo dõi. Lệnh đã rụng vẫn tra được ở Hồ sơ lệnh sản xuất.

Không một số tiền nào.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...models.bai_ghep_cong_doan import BaiGhepCongDoanMap
from ...models.customer import Customer
from ...models.lsx import Lsx, LsxCongDoan
from ...models.may_thiet_bi import MayThietBi
from ...models.order import Order
from ...models.san_xuat import CV_DANG_CHAY, CV_HOAN_THANH, CV_TAM_DUNG, SanXuatCongViec
from ...repositories.lenh_sx_doc_repo import LenhSxDocRepository
from . import danh_sach, pham_vi, trang_thai

# Hai trạng thái "đang có người làm" — lệnh giao đủ mà còn việc ở đây thì CHƯA rụng.
_DANG_LAM = (CV_DANG_CHAY, CV_TAM_DUNG)

# Lệnh giao đủ còn hiện thêm bấy nhiêu sau lần giao cuối.
KANBAN_GIU_SAU_GIAO = timedelta(days=3)


def _may_danh_muc(db: Session) -> dict[int, MayThietBi]:
    """DANH MỤC máy — TOÀN BỘ, kể cả `active=False`, sắp tên rồi mã. MỘT câu SQL.

    Nguồn chung của ô Máy (`bo_loc`) và khung bảng Theo máy (`theo_doi._nap`)."""
    return {
        m.id: m
        for m in db.execute(
            select(MayThietBi).order_by(MayThietBi.ten.asc(), MayThietBi.ma.asc())
        ).scalars()
    }


def _cv_trong_pham_vi(trong_pham_vi):
    """Subquery `id` của MỌI công việc thuộc các lệnh trong `trong_pham_vi` — công việc neo thẳng
    UNION công việc chung của bài ghép (với tới lệnh qua `bai_ghep_cong_doan_map`)."""
    return (
        select(SanXuatCongViec.id.label("id"))
        .where(SanXuatCongViec.lsx_id.in_(trong_pham_vi))
        .union(
            select(SanXuatCongViec.id.label("id"))
            .join(
                BaiGhepCongDoanMap,
                BaiGhepCongDoanMap.bai_ghep_cong_doan_id
                == SanXuatCongViec.bai_ghep_cong_doan_id,
            )
            .where(BaiGhepCongDoanMap.lsx_id.in_(trong_pham_vi))
        )
        .subquery()
    )


def _may_con_no_viec(db: Session, sale_ids: set[int] | None) -> set[int]:
    """Máy có ÍT NHẤT MỘT công việc chưa hoàn thành thuộc lệnh đã phát hành trong phạm vi. MỘT câu."""
    cv = _cv_trong_pham_vi(pham_vi.loc_lsx_da_phat_hanh(select(Lsx.id), sale_ids))
    return set(
        db.execute(
            select(SanXuatCongViec.may_id)
            .where(
                SanXuatCongViec.may_id.is_not(None),
                SanXuatCongViec.trang_thai != CV_HOAN_THANH,
                SanXuatCongViec.id.in_(select(cv.c.id)),
            )
            .distinct()
        ).scalars()
    )


@dataclass(frozen=True)
class BoLoc:
    """Ô lọc của Theo dõi. Trường `None` = không lọc."""

    q: str | None = None
    khach_hang_id: int | None = None
    may_id: int | None = None


def _loc_ban(stmt, loc: BoLoc | None):
    """Gắn bộ lọc vào một `select(Lsx.id)` đã mang sẵn phạm vi + đã phát hành. Tất cả ở SQL.

    Khách và ô tìm đi qua SUBQUERY trên `orders`, không `join`: phạm vi hẹp có thể đã join
    `orders` rồi (`pham_vi.loc_lsx_da_phat_hanh`)."""
    if loc is None:
        return stmt
    if loc.q and loc.q.strip():
        mau = f"%{loc.q.strip()}%"
        don_khop = (
            select(Order.id)
            .outerjoin(Customer, Customer.id == Order.customer_id)
            .where(or_(Order.order_no.ilike(mau), Customer.name.ilike(mau)))
        )
        stmt = stmt.where(
            or_(Lsx.ma.ilike(mau), Lsx.ten.ilike(mau), Lsx.order_id.in_(don_khop))
        )
    if loc.khach_hang_id is not None:
        stmt = stmt.where(
            Lsx.order_id.in_(select(Order.id).where(Order.customer_id == loc.khach_hang_id))
        )
    if loc.may_id is not None:
        stmt = stmt.where(
            danh_sach._co_buoc(SanXuatCongViec.may_id, LsxCongDoan.may_id, loc.may_id)
        )
    return stmt


def _ids_trong_pham_vi(
    db: Session, sale_ids: set[int] | None, *, loc: BoLoc | None = None,
) -> list[int]:
    """Id lệnh đã phát hành trong phạm vi người gọi, đã áp bộ lọc — MỘT câu."""
    stmt = _loc_ban(pham_vi.loc_lsx_da_phat_hanh(select(Lsx.id), sale_ids), loc)
    return list(db.execute(stmt).scalars())


def bo_loc(db: Session, *, sale_ids: set[int] | None) -> dict:
    """Nguồn ô lọc của Theo dõi — gác `theo_doi_san_xuat:read` (không mượn đường của Hồ sơ lệnh).

    `may`: DANH MỤC máy kèm `ngung_dung` và `co_viec` (gợi ý, không phải bộ lọc).
    `khach_hang`: khách của chính các lệnh trong phạm vi (`danh_sach.khach_trong_pham_vi`).
    `id` là CHUỖI cho cả hai nhóm. Số câu SQL hằng: máy (1) + `co_viec` (1) + khách (1)."""
    may_co_viec = _may_con_no_viec(db, sale_ids)
    return {
        "may": [
            {
                "id": str(m.id),
                "ten": m.ten,
                "ngung_dung": not bool(m.active),
                "co_viec": m.id in may_co_viec,
            }
            for m in _may_danh_muc(db).values()
        ],
        "khach_hang": [
            {"id": str(k["id"]), "ten": k["ten"]}
            for k in danh_sach.khach_trong_pham_vi(db, sale_ids)
        ],
    }


def _bo_lenh_da_rung(db: Session, ids: list[int], *, bay_gio: datetime | None = None) -> list[int]:
    """Bỏ khỏi `ids` lệnh ĐÃ RỤNG: giao hết (`trang_thai.giao_du`), lần giao cuối cách đây quá
    `KANBAN_GIU_SAU_GIAO`, và KHÔNG còn công việc đang chạy / tạm dừng. Ba câu nhẹ, chạy TRƯỚC
    `boi_canh.nap()` — lệnh cũ không bị nạp nặng mỗi lần mở màn."""
    if not ids:
        return ids
    repo = LenhSxDocRepository(db)
    giao_het = [
        i for i, l in repo.lenh_nhe(ids).items() if trang_thai.giao_du(l.so_luong_dat, l.da_giao)
    ]
    if not giao_het:
        return ids
    moc = (bay_gio or datetime.now(timezone.utc)) - KANBAN_GIU_SAU_GIAO
    rung = repo.giao_cuoi_truoc(giao_het, moc) - repo.lenh_con_viec_o_trang_thai(giao_het, _DANG_LAM)
    return [i for i in ids if i not in rung]
```

Lưu ý: Task 6 đổi phần trả về của `khach_hang` — giờ khách KHÔNG có tên (`Customer.name` rỗng) vẫn ra `{"id": "…", "ten": None}`; schema `BoLocMucOut.ten` vì vậy đổi thành `str | None` ở Step 5.

- [ ] **Step 4: Viết lại router**

Thay toàn bộ `backend/app/routers/theo_doi_san_xuat.py` bằng:

```python
"""Router màn "Theo dõi sản xuất" (làm gọn 05/10/2026) — Theo máy, Theo lệnh, nguồn ô lọc.

Prefix `/api/theo-doi-san-xuat`. RBAC MODULE = `theo_doi_san_xuat`. `sale_ids` LUÔN sinh từ
`pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)` — phạm vi lấy từ token, không từ URL.

Mỗi góc nhìn trả luôn số của dải bất thường (`bat_thuong`), nên mỗi lượt tải chỉ MỘT yêu cầu.
`/meta`, `/kanban`, `/theo-ca`, `/gantt` đã xoá cùng ba tab cũ.

Router chỉ điều phối; nghiệp vụ ở `services/lenh_sx/theo_doi.py` và `bang_theo_doi.py`.
"""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_authorization_service, require_permission
from ..models.user import User
from ..schemas.theo_doi_san_xuat import BoLocOut, TheoLenhOut, TheoMayOut
from ..services.lenh_sx import bang_theo_doi, pham_vi, theo_doi
from ..services.rbac_service import AuthorizationService

router = APIRouter(prefix="/api/theo-doi-san-xuat", tags=["theo-doi-san-xuat"])
MODULE = "theo_doi_san_xuat"
Authz = Annotated[AuthorizationService, Depends(get_authorization_service)]

# Một trong sáu mục của dải bất thường; giá trị lạ (kể cả `thieu_vat_tu`) ăn 422 ở cửa thay vì
# lặng lẽ trả tập rỗng.
BatThuong = Literal[theo_doi.BAT_THUONG]
TimKiem = Annotated[str | None, Query(max_length=120)]


@router.get("/bo-loc", response_model=BoLocOut)
def bo_loc(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
):
    """Nguồn ô Máy và ô Khách — gác đúng ô quyền của màn này."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return bang_theo_doi.bo_loc(db, sale_ids=sale_ids)


@router.get("/theo-may", response_model=TheoMayOut)
def theo_may(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    q: TimKiem = None,
    khach_hang_id: int | None = None,
    bat_thuong: BatThuong | None = None,
):
    """Góc Theo máy: mỗi máy một dòng chia nhóm + số của dải bất thường."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi.theo_may(
        db, sale_ids=sale_ids, q=q, khach_hang_id=khach_hang_id, bat_thuong=bat_thuong,
    )


@router.get("/theo-lenh", response_model=TheoLenhOut)
def theo_lenh(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    q: TimKiem = None,
    khach_hang_id: int | None = None,
    may_id: int | None = None,
    bat_thuong: BatThuong | None = None,
):
    """Góc Theo lệnh: mỗi lệnh còn sống một dòng + số của dải bất thường."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi.theo_lenh(
        db, sale_ids=sale_ids, q=q, khach_hang_id=khach_hang_id, may_id=may_id,
        bat_thuong=bat_thuong,
    )
```

- [ ] **Step 5: Viết lại schema**

Thay toàn bộ `backend/app/schemas/theo_doi_san_xuat.py` bằng tệp gồm, theo thứ tự: docstring module mới, import, rồi các lớp `BoLocMucOut`, `BoLocMayMucOut`, `BoLocOut`, `LsxThamChieuOut`, `DemBatThuongOut`, `TheoLenhDongOut`, `TheoLenhOut`, `TdsxViecOut`, `TdsxSanLuongDonViOut`, `TdsxSanLuongOut`, `TdsxMayDongOut`, `TdsxNhomMayOut`, `TheoMayOut`. Phần đầu tệp và ba lớp bộ lọc:

```python
"""Schema màn "Theo dõi sản xuất" (làm gọn 05/10/2026) — ô lọc, Theo máy, Theo lệnh.

Không một số tiền nào. Mốc giờ trả ra là giờ xưởng không nhãn múi (`lich_hien_thi` /
`thuc_te_hien_thi`), FE đọc thẳng thành phần ngày giờ.
"""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from .lenh_san_xuat import LenhSxChang


class BoLocMucOut(BaseModel):
    """MỘT ô chọn. `id` là CHUỖI cho mọi nhóm (FE so khớp một kiểu); FastAPI tự ép về `int` ở
    tham số khai kiểu số."""

    id: str
    ten: str | None = None


class BoLocMayMucOut(BoLocMucOut):
    """Ô chọn MÁY: `ngung_dung` = `may_thiet_bi.active=False`; `co_viec` = còn ít nhất một công
    việc chưa xong trong phạm vi người gọi — GỢI Ý hiển thị, không phải bộ lọc."""

    ngung_dung: bool = False
    co_viec: bool = False


class BoLocOut(BaseModel):
    may: list[BoLocMayMucOut] = []
    khach_hang: list[BoLocMucOut] = []


class LsxThamChieuOut(BaseModel):
    """MỘT lệnh mà một công việc đang gánh — `ma` để đọc, `lsx_id` để mở hồ sơ."""

    lsx_id: int
    ma: str
    ten: str | None = None
    is_rush: bool = False
```

Các lớp còn lại chép NGUYÊN từ bản đã viết ở Task 4 Step 5 (`DemBatThuongOut`, `TheoLenhDongOut`, `TheoLenhOut`) và Task 5 Step 4 (`TdsxViecOut` … `TheoMayOut`).

- [ ] **Step 6: Dọn chỗ còn nhắc**

- `backend/app/repositories/attendance_repo.py:102` và `backend/app/services/xep_lich_service.py:515`: sửa câu docstring nhắc `services/lenh_sx/bang_theo_doi.theo_ca` — bỏ vế đó, giữ phần còn lại của câu đúng nghĩa (vd "… tab Theo ca của Theo dõi SX (đã xoá 05/10/2026) từng cần đúng tập ca này"). Chỉ sửa chữ, không đổi code.
- `grep -rn "UU_TIEN_" backend/app backend/tests` — nếu chỉ còn định nghĩa trong `danh_sach.py` thì xoá ba hằng `UU_TIEN_GAP`, `UU_TIEN_THUONG`, `UU_TIEN_CHO_PHEP` cùng dòng chú thích của chúng.
- `grep -rn "bang_theo_doi\.\(kanban\|meta\|theo_ca\|gantt\|theo_may\|_ca_cua_moc\|_ten_may\|_co_viec\|NHAN_\|COT_KHAC\|CA_ID\)" backend/app backend/tests` — phải rỗng sau Step 7.

- [ ] **Step 7: Xoá tệp test cũ**

```bash
git rm backend/tests/test_theo_doi_kanban.py backend/tests/test_theo_doi_may_ca_gantt.py
```

Hai tệp này chỉ còn bài của Kanban / meta / Theo ca / Gantt / bộ lọc 8 nhóm (bài Theo máy đã xoá ở Task 5); phần đáng giữ đã có chỗ mới: lọc `q`/khách/máy (kể cả máy qua cầu ghép) ở `test_theo_doi_theo_lenh.py`, máy ngừng dùng ở `test_theo_doi_theo_may.py`, ô lọc ở `test_theo_doi_bo_loc.py`. Trước khi xoá, `grep -n "^def test_" backend/tests/test_theo_doi_kanban.py backend/tests/test_theo_doi_may_ca_gantt.py` và đọc lướt tên từng bài; bài nào canh PHẠM VI hoặc KHÔNG LỘ TIỀN mà chưa có bài tương đương ở ba tệp mới thì chép sang `test_theo_doi_bo_loc.py`, đổi đường gọi sang `/theo-lenh` hoặc `/theo-may`.

- [ ] **Step 8: Chạy để thấy xanh**

Run: `python -m pytest tests/test_theo_doi_bo_loc.py tests/test_seed_quyen_theo_doi.py tests/test_theo_doi_theo_lenh.py tests/test_theo_doi_theo_may.py tests/test_theo_doi_rung_lenh_cu.py tests/test_lenh_sx_con_song.py tests/test_lenh_sx_api.py tests/test_san_xuat_board.py -q`
Expected: PASS.

Run: `python -m compileall -q app`
Expected: không lỗi.

- [ ] **Step 9: Commit**

```bash
git add backend/app/services/san_xuat/board.py backend/app/services/lenh_sx/bang_theo_doi.py backend/app/routers/theo_doi_san_xuat.py backend/app/schemas/theo_doi_san_xuat.py backend/app/services/lenh_sx/danh_sach.py backend/app/repositories/attendance_repo.py backend/app/services/xep_lich_service.py backend/tests/test_theo_doi_bo_loc.py backend/tests/test_seed_quyen_theo_doi.py
git diff --cached --stat
git commit -m "Theo dõi SX (máy chủ): xoá Kanban, Theo ca, Gantt và meta; bộ lọc còn máy và khách; luật ca chuyển về bàn tổ"
```

LƯU Ý trước `git add`: `backend/app/repositories/attendance_repo.py` và `backend/app/services/xep_lich_service.py` có thể đang mang sửa đổi chưa commit của phiên khác (`git status` đầu phiên). Chạy `git diff backend/app/repositories/attendance_repo.py backend/app/services/xep_lich_service.py` trước; nếu có dòng không phải của task này thì KHÔNG add hai tệp đó, báo lại và để phần sửa docstring chờ.

---

### Task 7: Nhãn khâu, dải chặng và CSS dùng chung của hai màn

**Files:**
- Create: `frontend/src/pages/lsxKhau.tsx`, `frontend/src/pages/lsxKhau.test.tsx`, `frontend/src/pages/lenh-sx-chung.css`
- Modify: `frontend/src/api/client.ts` (thêm hai type trước `export interface LenhSxChang`)
- Công cụ: script `patch_client.py` dưới đây, lưu ở thư mục nháp ngoài repo (KHÔNG commit); Task 8, 9, 10 chạy lại nó với đối số khác.

**Interfaces:**
- Consumes: `LenhSxChang` (client.ts, có sẵn).
- Produces: type `LenhSxKhau = "dang_sx" | "sau_sx" | "da_giao"`, `LenhSxKhauChiTiet = "dang_kcs" | "cho_nhap_kho" | "san_sang_giao"`; từ `lsxKhau.tsx`: `KHAU_NHAN`, `KHAU_CT_NHAN`, `CO_NHAN`, `nhanKhau(khau, ct)`, `PillKhau({khau, ct})`, `TheDaDong()`, `TheGap()`, `DaiChang({chang})`, `buocThu(chang): string | null`; lớp CSS `lsc-*` (`.lsc`, `.lsc-head`, `.lsc-title`, `.lsc-count`, `.lsc-spacer`, `.lsc-seg`, `.lsc-loc`, `.lsc-search`, `.lsc-kbd`, `.lsc-xoa`, `.lsc-field`, `.lsc-link`, `.lsc-tabs`, `.lsc-tab`, `.lsc-bt`, `.lsc-bt__muc`, `.lsc-khung`, `.lsc-bang`, `.lsc-bang__nhom`, `.lsc-bang__rong`, `.lsc-so`, `.lsc-ma`, `.lsc-phu`, `.lsc-do`, `.lsc-cum`, `.lsc-pill--steel|moss|amber|signal|off`, `.lsc-tag`, `.lsc-gap`, `.lsc-chang`, `.lsc-thanh`).

- [ ] **Step 1: Lưu script vá client.ts**

Lưu nguyên văn ra thư mục nháp (vd `%TEMP%\patch_client.py`). Mỗi lượt thay `assert` chuỗi cũ có đúng một lần — lệch là dừng, không vá mù.

```python
"""Vá `frontend/src/api/client.ts` theo từng task. Chạy: python patch_client.py <task> <đường dẫn client.ts>.

Mỗi lượt thay đều `assert` chuỗi cũ có mặt đúng một lần — lệch là dừng, không vá mù.
"""
import re
import sys

TASK, PATH = sys.argv[1], sys.argv[2]
s = open(PATH, encoding="utf-8", newline="").read()
CRLF = "\r\n" in s
if CRLF:
    s = s.replace("\r\n", "\n")


def rep(cu: str, moi: str) -> None:
    global s
    n = s.count(cu)
    assert n == 1, f"{n} lần: {cu[:90]!r}"
    s = s.replace(cu, moi, 1)


def cat(dau: str, cuoi: str, moi: str) -> None:
    """Thay đoạn từ `dau` (gồm) tới ngay trước `cuoi`."""
    global s
    a = s.index(dau)
    b = s.index(cuoi, a)
    assert s.count(dau) == 1, dau[:80]
    s = s[:a] + moi + s[b:]


if TASK == "7":
    rep(
        "/** MỘT đốt trên dải công đoạn của một dòng bảng lệnh",
        '''/** KHÂU của một lệnh (`trang_thai.KHAU` phía máy chủ, làm gọn 05/10/2026) — chia tab Hồ sơ lệnh
 *  và pill trạng thái. Khác `LsxTheoDoiTrangThai`: khâu KHÔNG đọc cờ cảnh báo. */
export type LenhSxKhau = "dang_sx" | "sau_sx" | "da_giao";

/** Chi tiết khi `khau = "sau_sx"`; còn lại `null`. */
export type LenhSxKhauChiTiet = "dang_kcs" | "cho_nhap_kho" | "san_sang_giao";

/** MỘT đốt trên dải công đoạn của một dòng bảng lệnh''',
    )

elif TASK == "8":
    # Bỏ tab cũ (bảy tab theo cờ) — chỉ còn `LsxTheoDoiTrangThai`/`LsxTheoDoiCanhBao` cho hồ sơ.
    rep(
        '''/** Tab thứ bảy của màn — "tất cả", KHÔNG phải một trạng thái. */
export type LsxTheoDoiTab = "tat_ca" | LsxTheoDoiTrangThai;

''',
        "",
    )
    cat(
        "export interface LenhSxItem {",
        "// --- Hồ sơ MỘT lệnh (Task 10 dựng API, Task 12 dựng màn)",
        '''/** Bốn tab của Hồ sơ lệnh: "tất cả" + ba khâu. Khoá đi thẳng ra `?tab=` — hợp đồng. */
export type LenhSxTab = "tat_ca" | LenhSxKhau;

/** MỘT dòng bảng Hồ sơ lệnh (làm gọn 05/10/2026) — chỉ cột TĨNH. Không cờ cảnh báo, không tiến độ:
 *  việc đó của màn Theo dõi sản xuất. */
export interface LenhSxItem {
  id: number;
  ma: string;
  ten: string | null;
  so_luong_dat: number;
  don_vi_tinh: string | null;
  khach_hang: string | null;
  order_id: number | null;
  order_no: string | null;
  /** `date` (không có giờ) ⇒ format bằng `ngay()`. */
  han_hoan_thanh_sx: string | null;
  is_rush: boolean;
  khau: LenhSxKhau;
  khau_chi_tiet: LenhSxKhauChiTiet | null;
  /** KCS đã đóng lệnh (`lsx.trang_thai = da_dong`). Thẻ phụ, không phải khâu. */
  da_dong: boolean;
}

export interface LenhSxListOut {
  items: LenhSxItem[];
  /** Tổng SAU cả `tab` — cho chân bảng. Con số cạnh tiêu đề là `dem_theo_tab.tat_ca`. */
  total: number;
  page: number;
  page_size: number;
  /** Đếm của tập ĐÃ LỌC, KHÔNG bị chính `tab` lọc lại. Cấm đếm lại từ `items`. */
  dem_theo_tab: Partial<Record<LenhSxTab, number>>;
}

/** MỘT ô chọn của ô Khách. `id` là SỐ (khác bộ lọc Theo dõi, nơi `id` là chuỗi). */
export interface LenhSxKhachLoc {
  id: number;
  ten: string | null;
}

/** Nguồn ô Khách — khách của chính các lệnh trong phạm vi người gọi (gác `lenh_san_xuat:read`). */
export interface LenhSxBoLocOut {
  khach_hang: LenhSxKhachLoc[];
}

export interface LenhSxDanhSachParams {
  tab?: LenhSxTab;
  q?: string;
  khach_hang_id?: number;
  /** Khoảng HẠN SX, `YYYY-MM-DD`. Lệnh chưa khai hạn không nằm trong khoảng nào. */
  tu_ngay?: string;
  den_ngay?: string;
  page?: number;
  page_size?: number;
}

''',
    )
    cat(
        "  lenhSanXuat: {\n    /** 4 thẻ KPI.",
        "    /** HỒ SƠ một lệnh — 13 khối",
        '''  lenhSanXuat: {
    /** Nguồn ô Khách — khách của chính các lệnh trong phạm vi người gọi.
     *
     *  KHÔNG mượn `/api/khach-hang` hay `/api/theo-doi-san-xuat/bo-loc`: hai đường đó gác ô quyền
     *  khác, vai QC đứng ở màn này không có ⇒ 403. */
    boLoc(token: string): Promise<LenhSxBoLocOut> {
      return authed<LenhSxBoLocOut>("/api/lenh-san-xuat/bo-loc", token);
    },
    /** MỘT trang bảng. Lọc + đếm tab + cắt trang đều Ở MÁY CHỦ — không `rows.filter`, không
     *  `rows.slice`, không đếm tab từ `items`. */
    danhSach(token: string, params: LenhSxDanhSachParams = {}): Promise<LenhSxListOut> {
      return authed<LenhSxListOut>(
        `/api/lenh-san-xuat${qs({
          tab: params.tab,
          q: params.q,
          khach_hang_id: params.khach_hang_id,
          tu_ngay: params.tu_ngay,
          den_ngay: params.den_ngay,
          page: params.page,
          page_size: params.page_size,
        })}`,
        token,
      );
    },
''',
    )

elif TASK == "9":
    rep(
        '''  ghi_chu: string | null;
  tao_luc: string | null;
}

export interface LenhSxTienDo {''',
        '''  ghi_chu: string | null;
  tao_luc: string | null;
  /** KCS đã đóng lệnh — thẻ "Đã đóng lệnh" cạnh pill khâu. */
  da_dong: boolean;
  /** Tên nhóm thành phẩm (`nhom_lenh_giao.ten`) nếu lệnh đã vào nhóm. */
  nhom_ten: string | null;
}

export interface LenhSxTienDo {''',
    )
    rep(
        '''  /** Số đã giao của RIÊNG dòng đơn lệnh này — khác `giao_hang.da_giao` (cấp NHÓM). */
  da_giao: number;
}''',
        '''  /** Số đã giao của RIÊNG dòng đơn lệnh này — khác `giao_hang.da_giao` (cấp NHÓM). */
  da_giao: number;
  /** Khâu của lệnh — cùng hàm với cột Trạng thái ở danh sách. */
  khau: LenhSxKhau;
  khau_chi_tiet: LenhSxKhauChiTiet | null;
}''',
    )
    rep(
        '''export interface LenhSxSanLuong {
  tong: number;
  tot: number;
  hong: number;
  batch: LenhSxSanLuongBatch[];
}''',
        '''/** Chỉ còn danh sách mẻ: ba tổng cũ cộng tờ in với thành phẩm nên đã gỡ ở máy chủ. Muốn tổng thì
 *  cộng mẻ của CÙNG một bước theo TỪNG đơn vị (`tongMeTheoDonVi`). */
export interface LenhSxSanLuong {
  batch: LenhSxSanLuongBatch[];
}''',
    )

elif TASK == "10":
    cat(
        "// --- Theo dõi sản xuất (module `theo_doi_san_xuat`, Task 15-17)",
        "/** 1 dòng trong picker mặt hàng (gộp Giấy + Vật tư khác). KHÔNG có giá. */",
        '''// --- Theo dõi sản xuất (module `theo_doi_san_xuat`) — làm gọn 05/10/2026 ----------------------
// Bàn CHỈ ĐỌC cho điều độ viên: HAI góc nhìn (Theo máy · Theo lệnh) + dải bất thường. Mirror ĐÚNG
// `backend/app/schemas/theo_doi_san_xuat.py` — đừng thêm trường phía này (đọc, không tính lại).
//
// KHÔNG MỘT SỐ TIỀN NÀO, cùng luật với cả gói `lenh_sx`.

/** Sáu mục của dải bất thường — hợp đồng với `theo_doi.BAT_THUONG` (giá trị lạ ăn 422). */
export type TdsxBatThuong =
  | "tre_han" | "su_co" | "tam_dung" | "kcs_khong_dat" | "may_hong" | "chua_may";

/** Số trên dải — đếm trên TOÀN tập còn sống trong phạm vi, KHÔNG theo ô tìm/khách/máy. */
export type TdsxDemBatThuong = Record<TdsxBatThuong, number>;

/** MỘT ô chọn. `id` LUÔN là chuỗi — nơi gọi tự ép `Number(...)` khi tham số đích là số. */
export interface TdsxBoLocMuc {
  id: string;
  ten: string | null;
}

/** Ô chọn MÁY: `ngung_dung` = máy đã ngừng dùng; `co_viec` = còn việc chưa xong — GỢI Ý hiển thị. */
export interface TdsxBoLocMayMuc extends TdsxBoLocMuc {
  ngung_dung: boolean;
  co_viec: boolean;
}

export interface TdsxBoLocOut {
  may: TdsxBoLocMayMuc[];
  khach_hang: TdsxBoLocMuc[];
}

/** MỘT lệnh mà một công việc đang gánh — `ma` để đọc, `lsx_id` để mở hồ sơ. */
export interface TdsxLsxThamChieu {
  lsx_id: number;
  ma: string;
  ten: string | null;
  is_rush: boolean;
}

/** Tham số chung của hai góc. `may_id` chỉ góc Theo lệnh nhận. */
export interface TdsxLocParams {
  q?: string;
  khach_hang_id?: number;
  may_id?: number;
  bat_thuong?: TdsxBatThuong;
}

// --- Góc Theo lệnh (đặc tả 3.4) --------------------------------------------------------------------
/** Bốn cờ lệnh có thể mang (`thieu_vat_tu` KHÔNG vào màn này — đòi cân đối vật tư mỗi lượt tải). */
export type TdsxCoLenh = "tre_han" | "su_co" | "tam_dung" | "kcs_khong_dat";

export interface TdsxTheoLenhDong {
  lsx_id: number;
  ma: string;
  ten: string | null;
  is_rush: boolean;
  so_luong_dat: number;
  don_vi_tinh: string | null;
  khach_hang: string | null;
  chang: LenhSxChang[];
  buoc_hien_tai: string | null;
  khau: LenhSxKhau;
  khau_chi_tiet: LenhSxKhauChiTiet | null;
  /** `date` ⇒ `ngay()`. */
  han_hoan_thanh_sx: string | null;
  /** Giờ xưởng KHÔNG nhãn múi. */
  du_kien_xong: string | null;
  canh_bao: TdsxCoLenh[];
  /** Chỉ có khi `canh_bao` chứa `tre_han`. */
  tre_ngay: number | null;
}

export interface TdsxTheoLenhOut {
  items: TdsxTheoLenhDong[];
  /** Tổng TRƯỚC khi cắt 200 dòng — lớn hơn `items.length` thì màn phải nói ra. */
  total: number;
  bat_thuong: TdsxDemBatThuong;
}

// --- Góc Theo máy (đặc tả 3.3) ---------------------------------------------------------------------
/** MỘT công việc trên dòng máy. `bai_ma` có khi là việc GHÉP; `lsx` từ hai lệnh trở lên thì giao
 *  diện bắt chọn, không đoán lấy cái đầu. */
export interface TdsxViec {
  cong_viec_id: number;
  ten_buoc: string | null;
  trang_thai: string;
  bai_ma: string | null;
  lsx: TdsxLsxThamChieu[];
}

export interface TdsxSanLuongDonVi {
  don_vi: string | null;
  tot: number;
}

/** `tot = null` khi mẻ ghi lẫn đơn vị — khi đó chỉ có `theo_don_vi`, không vẽ thanh, không cộng. */
export interface TdsxSanLuong {
  tot: number | null;
  ke_hoach: number | null;
  /** MÃ đơn vị ra của bước ⇒ hiện qua `nhanChang`. */
  don_vi: string | null;
  theo_don_vi: TdsxSanLuongDonVi[];
  /** Việc ghép: số là của cả bài in ghép. */
  ca_bai: boolean;
}

/** `tinh_trang`: bốn trạng thái máy (`may_dung`, `bao_tri`, `khoa`, `co_phieu_sua`) hoặc
 *  `dang_chay`, `tam_dung`, `trong`, `cho_xep_may`, `o_nha_gia_cong`, `cho_mang_di`. Nhãn đọc ở
 *  `nhan_tinh_trang` (dựng ở máy chủ) — FE chỉ chọn màu. */
export interface TdsxMayDong {
  /** Duy nhất trong cả bảng: `may:<id>`, `ncc:<tên>`, `cv:<id>`. */
  khoa: string;
  may_id: number | null;
  ten: string | null;
  ngung_dung: boolean;
  tinh_trang: string;
  nhan_tinh_trang: string;
  dang_chay: TdsxViec | null;
  /** Số việc chạy cùng lúc NGOÀI việc đầu (dữ liệu bất thường) ⇒ thẻ "+N". */
  dang_chay_them: number;
  san_luong: TdsxSanLuong | null;
  /** Giờ xưởng KHÔNG nhãn múi. */
  ke_hoach_xong: string | null;
  /** Chỉ dòng "Chưa có máy": giờ bắt đầu kế hoạch. */
  ke_hoach_bat_dau: string | null;
  ke_tiep: TdsxViec[];
  ke_tiep_them: number;
}

/** `loai` ∈ `chua_may` / `may` / `may_da_xoa` / `gia_cong`; nhóm `may` mang `ten = loai_may`
 *  (có thể rỗng ⇒ FE ghi "Chưa phân nhóm"). */
export interface TdsxNhomMay {
  loai: string;
  ten: string;
  dong: TdsxMayDong[];
}

export interface TdsxTheoMayOut {
  nhom: TdsxNhomMay[];
  /** Máy không việc, tình trạng bình thường — gập vào một dòng cuối bảng. */
  may_trong: TdsxMayDong[];
  bat_thuong: TdsxDemBatThuong;
}

''',
    )
    cat(
        "  theoDoiSanXuat: {",
        "  // --- Xếp lịch (module `xep_lich`)",
        '''  theoDoiSanXuat: {
    /** Nguồn ô Khách + ô Máy — endpoint RIÊNG, gác đúng `theo_doi_san_xuat:read`. */
    boLoc(token: string): Promise<TdsxBoLocOut> {
      return authed<TdsxBoLocOut>("/api/theo-doi-san-xuat/bo-loc", token);
    },
    /** Mỗi máy một dòng, chia nhóm (máy chủ sắp sẵn). Không nhận `may_id`. Dựng lại literal thay vì
     *  `qs(params)` thẳng: `params` là INTERFACE có tên, TS không tự suy chữ ký chỉ mục cho nó. */
    theoMay(token: string, params: TdsxLocParams = {}): Promise<TdsxTheoMayOut> {
      return authed<TdsxTheoMayOut>(
        `/api/theo-doi-san-xuat/theo-may${qs({
          q: params.q,
          khach_hang_id: params.khach_hang_id,
          bat_thuong: params.bat_thuong,
        })}`,
        token,
      );
    },
    /** Mỗi lệnh còn sống một dòng, tối đa 200 (máy chủ cắt, `total` là số trước khi cắt). */
    theoLenh(token: string, params: TdsxLocParams = {}): Promise<TdsxTheoLenhOut> {
      return authed<TdsxTheoLenhOut>(
        `/api/theo-doi-san-xuat/theo-lenh${qs({
          q: params.q,
          khach_hang_id: params.khach_hang_id,
          may_id: params.may_id,
          bat_thuong: params.bat_thuong,
        })}`,
        token,
      );
    },
  },

''',
    )
    # Câu dẫn khối API cũ nhắc "Bốn góc nhìn (Kanban · Theo máy · Theo ca · Gantt)".
    s = s.replace(
        "  // Bốn góc nhìn (Kanban · Theo máy · Theo ca · Gantt) trên MỘT thanh lọc chung. Phạm vi dữ liệu\n",
        "  // Hai góc nhìn (Theo máy, Theo lệnh) trên MỘT hàng lọc chung. Phạm vi dữ liệu\n",
    )
else:
    raise SystemExit(f"task lạ: {TASK}")

if CRLF:
    s = s.replace("\n", "\r\n")
open(PATH, "w", encoding="utf-8", newline="").write(s)
print("ok", TASK)
```

- [ ] **Step 2: Viết bài kiểm thất bại**

`frontend/src/pages/lsxKhau.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DaiChang, PillKhau, buocThu, nhanKhau } from "./lsxKhau";

describe("lsxKhau", () => {
  it("Sau sản xuất nói luôn chi tiết; khâu khác nói tên khâu; khoá lạ hiện nguyên chuỗi", () => {
    expect(nhanKhau("dang_sx", null)).toBe("Đang sản xuất");
    expect(nhanKhau("sau_sx", "cho_nhap_kho")).toBe("Chờ nhập kho");
    expect(nhanKhau("sau_sx", null)).toBe("Sau sản xuất");
    expect(nhanKhau("da_giao", null)).toBe("Đã giao đủ");
    expect(nhanKhau("khau_moi", null)).toBe("khau_moi");
  });

  it("pill khâu mang màu theo khâu", () => {
    const { container } = render(<PillKhau khau="sau_sx" ct="san_sang_giao" />);
    expect(screen.getByText("Sẵn sàng giao")).toBeInTheDocument();
    expect(container.querySelector(".lsc-pill--amber")).not.toBeNull();
  });

  it("dải chặng: một đốt mỗi công đoạn, đúng thứ tự, có chữ cho trình đọc màn hình", () => {
    const chang = [
      { ten: "Cắt tờ", nhom: null, trang_thai: "xong", hien_tai: false },
      { ten: "In", nhom: null, trang_thai: "chay", hien_tai: true },
      { ten: "Bế", nhom: null, trang_thai: "cho", hien_tai: false },
    ];
    const { container } = render(<DaiChang chang={chang} />);
    const dot = container.querySelectorAll(".lsc-chang__dot");
    expect(Array.from(dot).map((d) => d.getAttribute("title"))).toEqual([
      "Cắt tờ — đã xong",
      "In — đang chạy",
      "Bế — chưa tới",
    ]);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "công đoạn 2 trên 3, In đang chạy",
    );
    expect(buocThu(chang)).toBe("bước 2 trên 3");
  });

  it("dải chặng rỗng thì không vẽ gì", () => {
    const { container } = render(<DaiChang chang={[]} />);
    expect(container.firstChild).toBeNull();
    expect(buocThu([])).toBeNull();
  });
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

Run (từ `frontend/`): `npx vitest run src/pages/lsxKhau.test.tsx`
Expected: FAIL — `Failed to resolve import "./lsxKhau"`.

- [ ] **Step 4: Thêm type + viết `lsxKhau.tsx` + CSS dùng chung**

Run (từ gốc worktree): `python %TEMP%\patch_client.py 7 frontend/src/api/client.ts` → in `ok 7`.

`frontend/src/pages/lsxKhau.tsx`:

```tsx
// Nhãn và thẻ DÙNG CHUNG của hai màn Hồ sơ lệnh sản xuất + Theo dõi sản xuất + khung hồ sơ một
// lệnh (làm gọn 05/10/2026). Mọi chữ "khâu", "cờ", "chặng" nằm ĐÚNG MỘT chỗ ở đây: hai màn tự đặt
// tên là sớm muộn cùng một lệnh hiện hai chữ.
//
// Lớp CSS ở `lenh-sx-chung.css` (tiền tố `lsc-`). Tệp nào dùng thứ ở đây thì tự import tệp CSS đó.
import type { LenhSxChang, LenhSxKhau, LenhSxKhauChiTiet } from "../api/client";

/** Khâu của lệnh — tab của màn Hồ sơ lệnh, cột Đang ở của Theo lệnh, pill ở đầu hồ sơ. Khoá là hợp
 *  đồng với `trang_thai.KHAU` ở máy chủ. */
export const KHAU_NHAN: Record<LenhSxKhau, string> = {
  dang_sx: "Đang sản xuất",
  sau_sx: "Sau sản xuất",
  da_giao: "Đã giao đủ",
};

/** Chi tiết của khâu Sau sản xuất (`trang_thai.CT_*`). */
export const KHAU_CT_NHAN: Record<LenhSxKhauChiTiet, string> = {
  dang_kcs: "Đang KCS",
  cho_nhap_kho: "Chờ nhập kho",
  san_sang_giao: "Sẵn sàng giao",
};

/** Chữ của một lệnh theo khâu: Sau sản xuất thì nói luôn chi tiết, vì "Sau sản xuất" đứng một mình
 *  không trả lời được "giờ phải làm gì". Khoá lạ (máy chủ thêm sau) hiện chính chuỗi đó. */
export function nhanKhau(khau: string, ct: string | null | undefined): string {
  if (khau === "sau_sx" && ct) return KHAU_CT_NHAN[ct as LenhSxKhauChiTiet] ?? ct;
  return KHAU_NHAN[khau as LenhSxKhau] ?? khau;
}

const KHAU_MAU: Record<string, string> = {
  dang_sx: "lsc-pill--steel",
  sau_sx: "lsc-pill--amber",
  da_giao: "lsc-pill--moss",
};

/** Pill khâu: Đang sản xuất xám thép, chi tiết sau sản xuất vàng, Đã giao đủ xanh. */
export function PillKhau({ khau, ct }: { khau: string; ct?: string | null }) {
  return <span className={`lsc-pill ${KHAU_MAU[khau] ?? "lsc-pill--off"}`}>{nhanKhau(khau, ct)}</span>;
}

/** Thẻ "Đã đóng lệnh" — KCS đã đóng lệnh (`lsx.trang_thai = da_dong`). Đi KÈM pill khâu, không
 *  thay nó: lệnh đã đóng vẫn có thể còn chờ nhập kho hay chờ giao. */
export function TheDaDong() {
  return <span className="lsc-tag">Đã đóng lệnh</span>;
}

/** Thẻ GẤP của hai màn này — viền đỏ, không nền (không dùng `ChipGap` của Kế hoạch SX: nó mang nền
 *  hồng đã bị gỡ khỏi app). */
export function TheGap() {
  return <span className="lsc-gap">GẤP</span>;
}

/** Bốn cờ của lệnh mà màn Theo dõi đếm (`trang_thai.co_canh_bao` không truyền đèn vật tư) — cộng
 *  `thieu_vat_tu` cho hồ sơ một lệnh. Thứ tự = thứ tự máy chủ trả. */
export const CO_NHAN: Record<string, string> = {
  tre_han: "Trễ hạn",
  su_co: "Sự cố đang mở",
  tam_dung: "Tạm dừng",
  kcs_khong_dat: "KCS không đạt",
  thieu_vat_tu: "Thiếu vật tư",
};

/** Nhãn đọc-ra-lời của một chặng — cho `title` và trình đọc màn hình. Màu không được đứng một mình
 *  mang tin. Khoá lạ rơi về chính chuỗi đó. */
const CHANG_LB: Record<string, string> = {
  xong: "đã xong",
  chay: "đang chạy",
  dung: "tạm dừng",
  cho: "chưa tới",
};

/** Dải chặng nhỏ: mỗi công đoạn một đốt, theo đúng thứ tự máy chủ trả (`danh_sach.chang`). Rỗng
 *  thì không vẽ gì — dải trống trông y hệt "mọi công đoạn chưa tới". */
export function DaiChang({ chang }: { chang: LenhSxChang[] }) {
  if (chang.length === 0) return null;
  const i = chang.findIndex((c) => c.hien_tai);
  const hienTai = i >= 0 ? chang[i] : null;
  return (
    <span
      className="lsc-chang"
      role="img"
      aria-label={
        hienTai
          ? `công đoạn ${i + 1} trên ${chang.length}, ${hienTai.ten} ${CHANG_LB[hienTai.trang_thai] ?? hienTai.trang_thai}`
          : `${chang.length} công đoạn`
      }
    >
      {chang.map((c, k) => (
        <i
          key={k}
          className={`lsc-chang__dot lsc-chang__dot--${c.trang_thai}${c.hien_tai ? " is-now" : ""}`}
          title={`${c.ten} — ${CHANG_LB[c.trang_thai] ?? c.trang_thai}`}
        />
      ))}
    </span>
  );
}

/** "bước i trên n" từ dải chặng; không có đốt hiện tại thì trả `null`. */
export function buocThu(chang: LenhSxChang[]): string | null {
  const i = chang.findIndex((c) => c.hien_tai);
  return i >= 0 ? `bước ${i + 1} trên ${chang.length}` : null;
}
```

`frontend/src/pages/lenh-sx-chung.css`:

```css
/* Khối dùng chung của màn Hồ sơ lệnh sản xuất + Theo dõi sản xuất (làm gọn 05/10/2026).
   Tiền tố `lsc-`. Màu, phông, bán kính chỉ lấy token của `styles/tokens.css`.
   Luật: hover nền `--rule-hair`; mục đang chọn = viền đủ bốn cạnh; chip lọc đang chọn nền
   charcoal; nút đổi góc nhìn màu rust; tiêu đề cột 11px chữ hoa giãn .07em. */

.lsc {
  max-width: var(--page-max-w);
  margin: 0 auto;
  padding: var(--sp-5) var(--page-pad-x);
  color: var(--ink);
  font-family: var(--ff-sans);
  min-width: 0;
  display: grid;
  gap: var(--sp-3);
  grid-template-columns: minmax(0, 1fr);
}
.lsc > * {
  min-width: 0;
}

.lsc .sr-only,
.lsc-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.lsc :focus-visible {
  outline: 2px solid var(--rust);
  outline-offset: 2px;
}

/* ---------- đầu trang ---------- */
.lsc-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
  min-width: 0;
}
.lsc-title {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
  line-height: 1.3;
}
.lsc-count {
  color: var(--ash);
  font-size: var(--fs-sm);
}
.lsc-spacer {
  flex: 1 1 auto;
}

/* Nút đổi góc nhìn (Theo máy / Theo lệnh) — đang bật màu rust. */
.lsc-seg {
  display: inline-flex;
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  overflow: hidden;
  background: var(--canvas);
}
.lsc-seg button {
  padding: 6px 14px;
  border: 0;
  background: none;
  color: var(--ash);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  cursor: pointer;
}
.lsc-seg button + button {
  border-left: 1px solid var(--rule);
}
.lsc-seg button:hover {
  background: var(--rule-hair);
}
.lsc-seg button[aria-pressed="true"] {
  background: var(--rust);
  color: var(--canvas);
}

/* ---------- hàng lọc ---------- */
.lsc-loc {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.lsc-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 1 1 280px;
  max-width: 420px;
  min-width: 0;
  padding: 0 var(--sp-2) 0 var(--sp-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  background: var(--canvas);
  color: var(--ash-2);
}
.lsc-search input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 7px 0;
  border: 0;
  outline: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: var(--fs-sm);
}
.lsc-search:focus-within {
  border-color: var(--ash-2);
}
.lsc-kbd {
  padding: 1px 6px;
  border: 1px solid var(--rule-soft);
  border-radius: var(--r-2);
  font-family: var(--ff-sans);
  font-size: var(--fs-2xs);
  color: var(--ash-2);
  white-space: nowrap;
}
.lsc-xoa {
  display: inline-flex;
  padding: 2px;
  border: 0;
  background: none;
  color: var(--ash-2);
  cursor: pointer;
  border-radius: var(--r-2);
}
.lsc-xoa:hover {
  background: var(--rule-hair);
  color: var(--ink);
}

.lsc-field {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: 0 var(--sp-2) 0 var(--sp-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  background: var(--canvas);
  font-size: var(--fs-sm);
}
.lsc-field > span {
  color: var(--ash-2);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  white-space: nowrap;
}
.lsc-field select,
.lsc-field input {
  min-width: 0;
  max-width: 240px;
  padding: 7px 0;
  border: 0;
  outline: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: var(--fs-sm);
}
.lsc-field.is-active {
  border-color: var(--ink);
}
.lsc-field.is-sai {
  border-color: var(--signal);
}
.lsc-field__sep {
  color: var(--ash-2);
}

.lsc-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--rust);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  cursor: pointer;
  white-space: nowrap;
}
.lsc-link:hover {
  text-decoration: underline;
}

/* ---------- tab ---------- */
.lsc-tabs {
  display: flex;
  gap: var(--sp-1);
  border-bottom: 1px solid var(--rule);
  overflow-x: auto;
  min-width: 0;
}
.lsc-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: -1px;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--r-3) var(--r-3) 0 0;
  background: none;
  color: var(--ash);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  white-space: nowrap;
  cursor: pointer;
}
.lsc-tab:hover {
  background: var(--rule-hair);
}
.lsc-tab[aria-selected="true"] {
  border-color: var(--rule);
  background: var(--canvas);
  color: var(--ink);
}
.lsc-tab__n {
  color: var(--ash-2);
  font-size: var(--fs-2xs);
}

/* ---------- dải bất thường (dải pill gộp) ---------- */
.lsc-bt {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1);
  justify-self: start;
  max-width: 100%;
  padding: var(--sp-1);
  border: 1px solid var(--rule);
  border-radius: var(--r-pill);
  background: var(--canvas);
}
.lsc-bt__muc {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 12px;
  border: 1px solid transparent;
  border-radius: var(--r-pill);
  background: none;
  color: var(--signal);
  font: inherit;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  white-space: nowrap;
  cursor: pointer;
}
.lsc-bt__muc b {
  font-size: var(--fs-md);
}
.lsc-bt__muc:hover {
  background: var(--rule-hair);
}
.lsc-bt__muc:disabled {
  color: var(--ash-2);
  cursor: default;
  background: none;
}
.lsc-bt__muc[aria-pressed="true"] {
  background: var(--charcoal);
  border-color: var(--charcoal);
  color: var(--on-charcoal);
}
.lsc-bt--dang-tai .lsc-bt__muc b {
  visibility: hidden;
}

/* ---------- khung bảng + bảng ---------- */
.lsc-khung {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  border: 1px solid var(--rule);
  border-radius: var(--r-5);
  background: var(--canvas);
  min-width: 0;
}
/* Chân phân trang chuẩn đứng ngay sau khung: nối thành MỘT thẻ. */
.lsc-khung:has(+ .ptdd) {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.lsc-khung + .ptdd {
  border: 1px solid var(--rule);
  border-top: 0;
  border-radius: 0 0 var(--r-5) var(--r-5);
}

.lsc-bang {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}
.lsc-bang th {
  padding: 10px 12px;
  border-bottom: 1.5px solid var(--rule);
  background: var(--paper);
  color: var(--ash);
  font-size: var(--fs-2xs);
  font-weight: var(--fw-bold);
  letter-spacing: 0.07em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}
.lsc-bang td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--rule-hair);
  vertical-align: middle;
}
.lsc-bang tbody tr:last-child td {
  border-bottom: 0;
}
.lsc-bang .lsc-so,
.lsc-bang th.lsc-so {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.lsc-bang tbody tr:hover td {
  background: var(--rule-hair);
}
.lsc-bang tbody.is-mo {
  opacity: 0.55;
}
.lsc-bang__nhom td {
  padding-top: 7px;
  padding-bottom: 7px;
  background: var(--paper);
  color: var(--ash);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
}
.lsc-bang__nhom:hover td {
  background: var(--paper) !important;
}
.lsc-bang__rong td {
  padding: 0;
}

/* Mã lệnh bấm được (mở hồ sơ). */
.lsc-ma {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  font-weight: var(--fw-bold);
  white-space: nowrap;
  text-decoration: underline;
  text-decoration-color: var(--rule);
  text-underline-offset: 3px;
  cursor: pointer;
}
.lsc-ma:hover {
  text-decoration-color: var(--ink);
}
.lsc-phu {
  display: block;
  color: var(--ash-2);
  font-size: var(--fs-xs);
}
.lsc-do {
  color: var(--signal);
  font-weight: var(--fw-bold);
}
.lsc-cum {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

/* ---------- pill, thẻ ---------- */
.lsc-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--r-pill);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  white-space: nowrap;
}
.lsc-pill::before {
  content: "";
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.lsc-pill--steel { background: var(--steel-soft); color: var(--steel); }
.lsc-pill--moss { background: var(--moss-soft); color: var(--moss); }
.lsc-pill--amber { background: var(--amber-soft); color: var(--amber-deep); }
.lsc-pill--signal { background: var(--signal-soft); color: var(--signal); }
.lsc-pill--off { background: var(--rule-hair); color: var(--ash-2); }

.lsc-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border: 1px solid var(--rule-soft);
  border-radius: var(--r-2);
  background: var(--rule-hair);
  color: var(--ash);
  font: inherit;
  font-size: var(--fs-2xs);
  font-weight: var(--fw-bold);
  white-space: nowrap;
}
button.lsc-tag {
  cursor: pointer;
}
button.lsc-tag:hover {
  border-color: var(--ash-2);
  color: var(--ink);
}
.lsc-gap {
  padding: 0 6px;
  border: 1px solid var(--signal);
  border-radius: var(--r-2);
  color: var(--signal);
  font-size: var(--fs-2xs);
  font-weight: var(--fw-bold);
  white-space: nowrap;
}

/* ---------- dải chặng + thanh ---------- */
.lsc-chang {
  display: inline-flex;
  gap: 2px;
  vertical-align: middle;
}
.lsc-chang__dot {
  width: 12px;
  height: 6px;
  border-radius: 2px;
  background: var(--rule-soft);
}
.lsc-chang__dot--xong { background: var(--steel); }
.lsc-chang__dot--chay { background: var(--rust); }
.lsc-chang__dot--dung { background: var(--signal); }
.lsc-chang__dot.is-now {
  outline: 1px solid var(--ink);
  outline-offset: 1px;
}

.lsc-thanh {
  display: block;
  width: 100%;
  min-width: 90px;
  height: 6px;
  margin-top: 4px;
  overflow: hidden;
  border-radius: var(--r-pill);
  background: var(--rule-soft);
}
.lsc-thanh > i {
  display: block;
  height: 100%;
  background: var(--steel);
}
.lsc-thanh--do > i {
  background: var(--signal);
}

/* ---------- điện thoại ---------- */
@media (max-width: 640px) {
  .lsc {
    padding: var(--sp-3) var(--sp-4);
  }
  .lsc-search {
    flex-basis: 100%;
    max-width: none;
  }
  .lsc-kbd {
    display: none;
  }
  .lsc-field {
    flex: 1 1 100%;
  }
  .lsc-field select,
  .lsc-field input {
    flex: 1 1 auto;
    max-width: none;
  }
  .lsc-bt {
    border-radius: var(--r-5);
  }
}
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `npx vitest run src/pages/lsxKhau.test.tsx` → 4 passed. Run: `npx tsc --noEmit` → không lỗi.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/lsxKhau.tsx frontend/src/pages/lsxKhau.test.tsx frontend/src/pages/lenh-sx-chung.css
git diff --cached --stat
git commit -m "Hồ sơ lệnh + Theo dõi SX: nhãn khâu, dải chặng, thẻ GẤP và CSS dùng chung (lsc-)"
```

### Task 8: Màn Hồ sơ lệnh — danh sách tra cứu 4 tab, 7 cột

**Files:**
- Modify: `frontend/src/api/client.ts` (type + hàm danh sách), `frontend/src/pages/LenhSanXuatPage.tsx` (viết lại), `frontend/src/pages/LenhSanXuatPage.test.tsx` (viết lại phần fixture + thêm khối "danh sách tra cứu")

**Interfaces:**
- Consumes: Task 2 (`GET /api/lenh-san-xuat?tab&q&khach_hang_id&tu_ngay&den_ngay&page&page_size`, `GET /api/lenh-san-xuat/bo-loc` → `{khach_hang:[{id:int, ten}]}`); Task 7 (`PillKhau`, `TheDaDong`, `TheGap`, lớp `lsc-*`).
- Produces: type `LenhSxTab`, `LenhSxItem` (mới), `LenhSxKhachLoc`, `LenhSxBoLocOut` (khách), `LenhSxDanhSachParams` (mới); bỏ `LsxTheoDoiTab`, `LenhSxSummaryOut`, `LenhSxMayLoc`, hàm `api.lenhSanXuat.summary`. Nút mở hồ sơ là `.lsc-ma[data-lsx=<id>]`. Khung hồ sơ cũ còn bọc `<div className="hslsx">` và trang còn nạp `./lenh-san-xuat.css` — TẠM, Task 9 gỡ.

- [ ] **Step 1: Viết lại bài kiểm**

Thay toàn bộ `frontend/src/pages/LenhSanXuatPage.test.tsx` bằng (fixture `HOSO_77` còn dạng hồ sơ CŨ — Task 9 đổi):

```tsx
// Task 14 (deep link QR): `AppShell` đọc hash `#lsx=&pv=` (xem `appShellDeepLink.test.ts`) rồi bơm
// xuống đây qua hai prop `openHoSoId`/`openHoSoPv`. Bài canh này chốt khúc CUỐI của dây chuyền —
// prop tới tay component thì đúng lệnh phải tự mở, KỂ CẢ khi lệnh đó không nằm trong trang bảng
// đang tải (người quét QR ở xưởng không quan tâm trang mấy, tab nào). Khúc đầu dây chuyền (hash
// sống sót qua đăng nhập) nằm ở `LoginPage.test.tsx`; khúc phân tích hash nằm ở
// `appShellDeepLink.test.ts`; khúc băng cảnh báo phiên bản nằm ở `LenhSxHoSoView.test.tsx`.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LenhSxBoLocOut, LenhSxHoSoOut, LenhSxListOut } from "../api/client";
import { AuthContext, type AuthState } from "../auth/AuthContext";
import { PermissionsProvider, buildCapabilities } from "../auth/permissions";
import type { ModuleCapability } from "../api/client";
import { LenhSanXuatPage } from "./LenhSanXuatPage";

const AUTH: AuthState = {
  status: "authenticated", user: null, token: "t",
  login: async () => {}, logout: async () => {},
  updateUser: () => {}, notice: null, setNotice: () => {},
};

const DON_VI = [{ ma: "cai", ten: "cái" }];

const BO_LOC: LenhSxBoLocOut = { khach_hang: [{ id: 9, ten: "Công ty Sao" }] };

/** Bảng phía sau chỉ có lệnh #5 — KHÔNG có lệnh #77. Cố tình: hồ sơ mở qua deep link phải tự đứng
 *  được mà không cần bảng biết gì về nó, đúng thứ ghi chú `LenhSanXuatPage.tsx` nói ("hồ sơ vẽ ĐÈ
 *  lên bảng chứ không thay màn"). */
const LIST: LenhSxListOut = {
  items: [{
    id: 5, ma: "LSX26-0005", ten: "Lệnh khác", so_luong_dat: 10, don_vi_tinh: "cái",
    khach_hang: "Công ty Sao", order_id: 3, order_no: "DH-0003",
    han_hoan_thanh_sx: "2026-10-20", is_rush: true,
    khau: "sau_sx", khau_chi_tiet: "cho_nhap_kho", da_dong: true,
  }],
  total: 1, page: 1, page_size: 25,
  dem_theo_tab: { tat_ca: 1, dang_sx: 0, sau_sx: 1, da_giao: 0 },
};

/** Hồ sơ TỐI GIẢN — chỉ đủ mọi trường bắt buộc của `LenhSxHoSoOut`, không cần đủ 13 khối như bài
 *  canh của `LenhSxHoSoView.test.tsx` (chỗ đó soi NỘI DUNG hồ sơ; chỗ này chỉ soi ĐÚNG LỆNH nào mở
 *  ra, nên `ma` là trường duy nhất thật sự cần khác biệt). */
const HOSO_77: LenhSxHoSoOut = {
  thong_tin: {
    id: 77, ma: "LSX26-0077", ten: "Lệnh quét QR", loai: null,
    order_id: null, order_no: null, order_line_id: null,
    khach_hang: null, khach_hang_id: null, sale: null,
    so_luong_dat: 100, don_vi_tinh: "cái", is_rush: false,
    han_hoan_thanh_sx: null, han_giao_khach: null,
    ban_giao_at: null, ghi_chu: null, tao_luc: null,
  },
  tien_do: {
    phan_tram: 0, uoc_tinh: false, gio_may: 0,
    du_kien_xong: null, trang_thai: "dang_sx", canh_bao: [],
    buoc_hien_tai: null, buoc_hien_tai_cong_viec_id: null, nhom_cong_doan: null,
    may: null, nguoi: [], da_giao: 0,
  },
  thong_so: {
    giay_ten: null, dinh_luong: null,
    kho_nguyen_dai: null, kho_nguyen_rong: null, kho_in_dai: null, kho_in_rong: null,
    dai_thanh_pham: null, rong_thanh_pham: null, quy_cach_in: null,
    so_mau_a: null, so_mau_b: null, muc_a: [], muc_b: [],
    so_trang: null, trang_moi_tay: null, so_kem: null, so_manh_xa: null,
    ghi_chu_ky_thuat: null,
    so_con: 0, so_to_ke_hoach: 0, so_to_nguyen: 0, don_vi_tinh: null,
  },
  routing: { nodes: [], canh: [] },
  vat_tu: { hien_tai: { du: true, dong: [] }, canh_bao_sau: [], da_cap: [] },
  nhan_luc: { hien_tai: [], lich_su: [] },
  san_luong: { tong: 0, tot: 0, hong: 0, batch: [] },
  su_co: [],
  kcs: { tong_nhan: 0, tong_dat: 0, tong_khong_dat: 0, ty_le_dat: null, batch: [] },
  kho: { so_lenh_trong_nhom: 0, yeu_cau: [] },
  giao_hang: {
    nhom_id: null, order_id: null, order_line_ids: [], so_lenh_trong_nhom: 0,
    hang: [], da_nhap_kho: 0, da_giao: 0, co_the_giao: false, don_vi_lech: false,
  },
  timeline: [],
  phien_ban: 3,
};

/** Hồ sơ của LỆNH KHÁC (#5 — chính là dòng có sẵn trong `LIST`), dùng để (a) sửa vòng 1 P4: chứng
 *  minh stub trả ĐÚNG hồ sơ theo id được hỏi chứ không phải luôn `HOSO_77`; (b) sửa vòng 1 P5: là
 *  đích của lượt "mở tay" sau khi đã mở một hồ sơ khác qua QR — `phien_ban: 5` CỐ Ý lớn hơn mọi
 *  `pv` dùng trong file này (1/3), để nếu `moHoSoTay` có bug quên xoá `pv` cũ thì điều kiện băng
 *  cảnh báo (`pv < phien_ban`) vẫn đúng và băng LẠI HIỆN — bài test bắt được đúng ca đó. */
const HOSO_5: LenhSxHoSoOut = {
  ...HOSO_77,
  thong_tin: { ...HOSO_77.thong_tin, id: 5, ma: "LSX26-0005", ten: "Lệnh khác" },
  phien_ban: 5,
};

const HOSO_BY_ID: Record<number, LenhSxHoSoOut> = { 77: HOSO_77, 5: HOSO_5 };

/** Fetch giả PHÂN BIỆT ĐƯỜNG DẪN — hai nguồn `LenhSanXuatPage` gọi lúc mount (danh sách, bộ lọc
 *  khách) cộng nguồn `LenhSxHoSoView` gọi khi hồ sơ mở (hồ sơ một lệnh, danh mục đơn vị). Thứ tự
 *  kiểm PHẢI cụ thể trước chung: `/bo-loc` đứng trước lượt kiểm số ở cuối đường dẫn, nếu không nó
 *  rơi nhầm vào nhánh danh sách trần. Trả về mảng URL đã gọi để bài canh tham số gửi đi.
 *
 *  Sửa vòng 1 (P4): nhánh hồ sơ TRƯỚC ĐÂY trả `HOSO_77` bất kể id hỏi là gì — bài test dựa vào stub
 *  đó không canh được việc `LenhSanXuatPage` có truyền ĐÚNG id đã yêu cầu hay không (một bug hardcode
 *  fetch nhầm id vẫn nhận lại `HOSO_77` như thường, bài vẫn xanh). Nay tra theo `HOSO_BY_ID`; id lạ
 *  ⇒ trả 404 thật (không phải "trả bừa `HOSO_77`") để một bug id-sai lộ ra thành lỗi tải hồ sơ, có
 *  thể quan sát được thay vì im lặng trùng khớp. */
/** `list` đổi được để bài canh dải chặng dựng một bảng khác mà không phải chép lại cả stub. */
function stubApi(list: LenhSxListOut = LIST): string[] {
  const goi: string[] = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    goi.push(url);
    let data: unknown;
    let status = 200;
    const mHoSo = /\/api\/lenh-san-xuat\/(\d+)$/.exec(url);
    if (url.includes("/api/don-vi")) data = { items: DON_VI };
    else if (url.includes("/api/lenh-san-xuat/bo-loc")) data = BO_LOC;
    else if (mHoSo) {
      const id = Number(mHoSo[1]);
      const hs = HOSO_BY_ID[id];
      if (hs) data = hs;
      else {
        status = 404;
        data = { detail: `không có lệnh id=${id} trong stub` };
      }
    } else if (url.includes("/api/lenh-san-xuat")) data = list;
    else data = {};
    return Promise.resolve({
      ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }),
      json: async () => data, text: async () => JSON.stringify(data),
    } as Response);
  }));
  return goi;
}

const CAPS = buildCapabilities([
  {
    module_key: "giao_hang", scope: "all",
    can_read: true, can_create: true, can_update: true,
  } as ModuleCapability,
]);

/** Cây UI dùng CHUNG cho lượt `render` đầu và mọi lượt `rerender` sau (sửa vòng 2, mục A) — tách
 *  riêng để bài canh "quét lại cùng lệnh" đổi được `openHoSoSeq` mà không phải chép lại hai lớp
 *  Provider bao quanh. */
function uiLenhSanXuat(
  openHoSoId?: number | null,
  openHoSoPv?: number | null,
  openHoSoSeq?: number | null,
) {
  return (
    <AuthContext.Provider value={AUTH}>
      <PermissionsProvider caps={CAPS}>
        <LenhSanXuatPage
          openHoSoId={openHoSoId}
          openHoSoPv={openHoSoPv}
          openHoSoSeq={openHoSoSeq}
        />
      </PermissionsProvider>
    </AuthContext.Provider>
  );
}

function ve(openHoSoId?: number | null, openHoSoPv?: number | null, openHoSoSeq?: number | null) {
  return render(uiLenhSanXuat(openHoSoId, openHoSoPv, openHoSoSeq));
}

// KHÔNG `vi.unstubAllGlobals()` ở đây (khác `LenhSxHoSoView.test.tsx`): `setup.ts` stub
// `ResizeObserver` MỘT LẦN cho cả file — màn này (khác `LenhSxHoSoView`) có dùng nó để đo tràn
// ngang của bảng, unstub sạch giữa hai bài là xoá luôn cái đó và bài sau ăn `ReferenceError`. Mỗi
// bài tự gọi `stubApi()` để có `fetch` MỚI, nên không cần dọn gì thêm giữa các bài.
describe("LenhSanXuatPage · deep link QR mở đúng hồ sơ (Task 14)", () => {
  it("⭐ có openHoSoId ⇒ hồ sơ lệnh #77 tự mở, dù bảng phía sau chỉ tải lệnh #5", async () => {
    stubApi();
    ve(77, 3);

    // Bảng vẫn tải bình thường ở phía sau — hồ sơ chỉ VẼ ĐÈ lên nó (docstring `LenhSanXuatPage`).
    await screen.findByText("LSX26-0005");
    // Và đúng lệnh #77 được yêu cầu, không phải lệnh nào khác — hồ sơ tự bật không cần bấm dòng.
    await screen.findByText("LSX26-0077");
  });

  it("⭐ không truyền openHoSoId ⇒ không lệnh nào tự mở (hành vi mặc định không đổi)", async () => {
    stubApi();
    ve();

    await screen.findByText("LSX26-0005");
    expect(screen.queryByText("LSX26-0077")).not.toBeInTheDocument();
  });
});

// Sửa vòng 1, P5: chưa có bài nào canh đường `pv` BÊN TRONG `LenhSanXuatPage` (khác
// `LenhSxHoSoView.test.tsx` — chỗ đó canh NỘI DUNG băng khi `pv` đã tới tay component, còn đây
// canh việc `LenhSanXuatPage` có TỰ TRUYỀN đúng `pv` xuống hay không, và có XOÁ nó đi lúc mở tay
// hay không). Hai bài dưới đúng kịch bản điều phối viên chốt.
describe("LenhSanXuatPage · đường `pv` (Task 14, sửa vòng 1 P5)", () => {
  it("⭐ openHoSoPv nhỏ hơn phien_ban của hồ sơ #77 ⇒ băng cảnh báo hiện", async () => {
    stubApi();
    ve(77, 1); // HOSO_77.phien_ban = 3 ⇒ 1 < 3.

    await screen.findByRole("heading", { name: "LSX26-0077" });
    expect(
      screen.getByText("Phiếu giấy v1, lệnh hiện tại đã là v3"),
    ).toBeInTheDocument();
  });

  it("⭐ đóng hồ sơ QR rồi mở tay lệnh #5 ⇒ KHÔNG còn băng (mở tay không có tờ giấy nào để so)", async () => {
    stubApi();
    ve(77, 1);

    await screen.findByRole("heading", { name: "LSX26-0077" });
    expect(screen.getByText(/Phiếu giấy v1/)).toBeInTheDocument();

    // Đóng hồ sơ QR — nút DUY NHẤT rõ vai "đóng" của màn (xem LenhSxHoSoView.tsx).
    await userEvent.click(screen.getByRole("button", { name: "Quay lại danh sách" }));
    expect(screen.queryByRole("heading", { name: "LSX26-0077" })).not.toBeInTheDocument();

    // Mở tay lệnh #5 bằng cách bấm dòng trong bảng — không qua QR nên không có `pv`.
    await userEvent.click(screen.getByText("LSX26-0005"));
    await screen.findByRole("heading", { name: "LSX26-0005" });

    // `HOSO_5.phien_ban = 5` CỐ Ý > mọi `pv` dùng trong bài này — nếu còn sót `pv=1` từ lượt QR
    // trước, điều kiện băng (`pv < phien_ban`) vẫn đúng và băng lại hiện lên nhầm lệnh.
    expect(screen.queryByText(/^Phiếu giấy v/)).not.toBeInTheDocument();
  });

  // Bài trên đi qua NÚT ĐÓNG trước khi mở tay — đúng đường một người dùng chuột đi thật. Nhưng
  // `dongHoSo` (nút đóng) VÀ `moHoSoTay` (mở tay) MỖI HÀM đều tự xoá `pv` của mình (xem
  // LenhSanXuatPage.tsx dòng ~176-193): đục MỘT TRONG HAI dòng đó thôi thì bài trên vẫn xanh vì
  // hàm còn lại đỡ thay — không chứng minh riêng lẻ được dòng nào. `LenhSxHoSoView.tsx:352-356` tự
  // ghi nhận một đường tắt CÓ THẬT không qua nút đóng: `lsxId` đổi trong lúc lớp phủ vẫn mounted
  // (Shift+Tab lọt xuống dòng bị che rồi bấm Enter). Bài dưới đi đúng đường đó — mở tay lệnh #5
  // trong khi hồ sơ #77 (mang `pv=1`) CHƯA đóng — để cô lập ĐÚNG MỘT dòng: `setHoSoPv(null)` bên
  // trong `moHoSoTay`.
  // Sửa vòng 2 (mục D): bài trước dùng `userEvent.click(screen.getByText("LSX26-0005"))` — bấm
  // vào CHỮ hiển thị trong dòng. Đường thật của kịch bản này (mở tay lệnh khác trong khi hồ sơ
  // #77 còn che màn) KHÔNG PHẢI chuột: lớp phủ hồ sơ vẽ ĐÈ, chặn hit-test chuột lên dòng bảng phía
  // sau trong một trình duyệt thật — jsdom không hit-test nên chuột "click qua" được, còn đời thật
  // thì không. Đường thật là BÀN PHÍM (Shift+Tab từ "Quay lại danh sách" lọt xuống nút mở của dòng
  // bị che — chính `dongHoSo` cũng dựa vào nút đó để trả tiêu điểm, xem `.lsc-ma[data-lsx]`
  // — rồi Enter). Bấm theo `aria-label` của nút đó (khớp `LenhSanXuatPage.tsx:944-949`) để mô
  // phỏng đúng đường bàn phím thay vì click xuyên lớp phủ mà chuột thật không làm được.
  //
  // Đường này sống được là NHỜ lớp phủ hồ sơ chưa trap tiêu điểm / chưa `inert` nền phía sau (soi
  // ở rà lại vòng 1, N29 — điều phối viên đã park, KHÔNG sửa trong Task 14 vì nó đụng mọi ngăn kéo
  // trong hệ chứ không riêng gì deep link). Nếu sau này khiếm khuyết a11y đó được vá (ngăn kéo trap
  // tiêu điểm / nền `inert`), đường bàn phím này không còn bấm tới nút của dòng bị che được nữa —
  // `setHoSoPv(null)` trong `moHoSoTay` khi đó thành thuần phòng thủ (không còn đường thật nào gọi
  // tới nó qua ngả này) và BÀI NÀY HẾT Ý NGHĨA. Lúc đó XOÁ bài, đừng vá lại cho nó xanh.
  it("⭐ mở tay lệnh #5 trong khi hồ sơ QR khác CHƯA đóng ⇒ `moHoSoTay` tự xoá pv cũ, không băng", async () => {
    stubApi();
    ve(77, 1);

    await screen.findByRole("heading", { name: "LSX26-0077" });
    expect(screen.getByText(/Phiếu giấy v1/)).toBeInTheDocument();

    // KHÔNG bấm nút đóng — mở thẳng lệnh #5 trong khi hồ sơ #77 còn đang mở, như đường
    // Shift+Tab/Enter mà `LenhSxHoSoView.tsx` đã tự ghi nhận là có thật.
    await userEvent.click(screen.getByRole("button", { name: "Mở hồ sơ lệnh LSX26-0005 — Lệnh khác" }));
    await screen.findByRole("heading", { name: "LSX26-0005" });

    expect(screen.queryByText(/^Phiếu giấy v/)).not.toBeInTheDocument();
  });
});

// Sửa vòng 2 (mục A, lỗi MỚI mức Quan trọng ở lượt rà lại): quét LẠI ĐÚNG lệnh vừa đóng ngăn kéo
// thì trước vòng sửa này KHÔNG mở lại gì. `openHoSoId`/`openHoSoPv` ra CÙNG cặp giá trị như lần
// trước ⇒ hai giá trị nguyên thuỷ đó "không đổi" dưới mắt effect khai deps `[openHoSoId,
// openHoSoPv]` — dù `AppShell` có tạo object `navParams` MỚI mỗi lượt `navigate`, hiệu đó vô nghĩa
// vì `LenhSanXuatPage` chỉ đọc giá trị nguyên thuỷ bóc ra, không đọc chính object. Gốc rễ và cách
// sửa: xem chú thích `navigate` + `navSeq` trong `AppShell.tsx`, và effect deep link trong
// `LenhSanXuatPage.tsx` (nay có thêm `openHoSoSeq` trong deps).
describe("LenhSanXuatPage · quét LẠI đúng lệnh vừa đóng vẫn phải mở lại (Task 14, sửa vòng 2 mục A)", () => {
  it("⭐ quét lại #lsx=77&pv=1 (cùng id/pv, chỉ openHoSoSeq tăng) sau khi đã đóng ⇒ hồ sơ 77 mở lại", async () => {
    stubApi();
    const { rerender } = ve(77, 1, 1);

    await screen.findByRole("heading", { name: "LSX26-0077" });

    // Lỡ tay đóng ngăn kéo — như tổ trưởng thật sự làm giữa hai lượt quét.
    await userEvent.click(screen.getByRole("button", { name: "Quay lại danh sách" }));
    expect(screen.queryByRole("heading", { name: "LSX26-0077" })).not.toBeInTheDocument();

    // Quét LẠI CHÍNH mã đó: `openHoSoId`/`openHoSoPv` giống hệt lượt trước (`77`, `1`) — đúng cặp
    // giá trị nguyên thuỷ `AppShell` thật sự truyền khi tổ trưởng quét lại cùng một tờ giấy. Chỉ
    // `openHoSoSeq` tăng (2), đúng như `navigate()` thật của `AppShell` tự làm ở MỌI lượt gọi.
    rerender(uiLenhSanXuat(77, 1, 2));

    // Trước vòng sửa 2: effect không chạy lại (deps không đổi) ⇒ dòng dưới đây timeout, bài đỏ.
    await screen.findByRole("heading", { name: "LSX26-0077" });
  });
});

// Làm gọn 05/10/2026: 4 tab theo khâu, 7 cột tĩnh, lọc khách + một ô khoảng Hạn SX.
describe("LenhSanXuatPage · danh sách tra cứu", () => {
  it("⭐ bốn tab lấy số nguyên từ `dem_theo_tab`; dòng có pill khâu, thẻ Đã đóng lệnh, GẤP", async () => {
    stubApi();
    ve();

    await screen.findByText("LSX26-0005");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Tất cả1", "Đang sản xuất0", "Sau sản xuất1", "Đã giao đủ0",
    ]);
    expect(screen.getByText("Chờ nhập kho")).toBeInTheDocument();
    expect(screen.getByText("Đã đóng lệnh")).toBeInTheDocument();
    expect(screen.getByText("GẤP")).toBeInTheDocument();
    expect(screen.getByText("DH-0003")).toBeInTheDocument();
    // Bảy cột tĩnh, không còn cột tiến độ hay cảnh báo.
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Lệnh", "Sản phẩm", "Số lượng", "Khách", "Đơn", "Hạn SX", "Trạng thái",
    ]);
  });

  it("⭐ đổi tab gửi `tab=`; chọn khách gửi `khach_hang_id=`; ngày hợp lệ gửi `tu_ngay=`", async () => {
    const goi = stubApi();
    ve();
    await screen.findByText("LSX26-0005");

    await userEvent.click(screen.getByRole("tab", { name: /Sau sản xuất/ }));
    await waitFor(() => expect(goi.some((u) => u.includes("tab=sau_sx"))).toBe(true));

    const khach = await screen.findByRole("combobox", { name: /Khách/ });
    await userEvent.selectOptions(khach, "9");
    await waitFor(() => expect(goi.some((u) => u.includes("khach_hang_id=9"))).toBe(true));

    fireEvent.change(screen.getByLabelText("Hạn SX từ ngày"), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(goi.some((u) => u.includes("tu_ngay=2026-10-01"))).toBe(true));

    // Không còn gọi hai đường đã bỏ.
    expect(goi.some((u) => u.includes("/summary"))).toBe(false);
  });

  it("⭐ tab rỗng mà bộ lọc vẫn có lệnh ⇒ mời về tab Tất cả", async () => {
    stubApi({ ...LIST, items: [], total: 0 });
    ve();
    await screen.findAllByRole("tab");
    await userEvent.click(screen.getByRole("tab", { name: /Đã giao đủ/ }));
    const panel = screen.getByRole("tabpanel");
    expect(await within(panel).findByText("Tab «Đã giao đủ» hiện không có lệnh nào.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npx vitest run src/pages/LenhSanXuatPage.test.tsx`
Expected: FAIL ở khối "danh sách tra cứu" (tab cũ bảy mục, không có ô Khách).

- [ ] **Step 3: Vá client + viết lại trang**

Run: `python %TEMP%\patch_client.py 8 frontend/src/api/client.ts` → `ok 8`. Rồi thay toàn bộ trang:

`frontend/src/pages/LenhSanXuatPage.tsx`:

```tsx
// Màn "Hồ sơ lệnh sản xuất" — TRA CỨU lệnh đã phát hành (làm gọn 05/10/2026).
// Trả lời "lệnh này là gì, đã đi qua những gì". Theo dõi trực tiếp, cảnh báo, máy nào đứng là việc
// của màn Theo dõi sản xuất — màn này không đếm cảnh báo, không chạy cân đối vật tư.
// Đặc tả: `docs/superpowers/specs/2026-10-05-lam-gon-ho-so-lenh-theo-doi-sx-design.md` mục 4.1.
//
// ⚠️ MÀN NÀY KHÔNG GHI GÌ CẢ, KHÔNG MỘT SỐ TIỀN NÀO. Lọc, đếm tab, cắt trang đều ở MÁY CHỦ — không
// `rows.filter`, không `rows.slice`, không đếm số trên tab từ `items`.
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "../api/client";
import type { LenhSxItem, LenhSxKhachLoc, LenhSxTab } from "../api/client";
import { useAuth } from "../auth/useAuth";
import type { NavigateFn } from "../components/AppShell";
import { Button } from "../components/Button";
import { Icon } from "../components/Icons";
import { trangHopLe } from "../components/Pager";
import { PhanTrangDayDu } from "../components/PhanTrangDayDu";
import { useTre } from "../lib/useTre";
import { LenhSxHoSoView } from "./LenhSxHoSoView";
import { BangLoi, EmptyState, Skeleton, ngay, num } from "./keHoachSxShared";
import { PillKhau, TheDaDong, TheGap } from "./lsxKhau";
// `ke-hoach-sx.css` cho `EmptyState`/`Skeleton` (lớp `.khsx-*`), rồi CSS chung của hai màn.
import "./ke-hoach-sx.css";
import "./lenh-sx-chung.css";
// TẠM tới Task 9: khung hồ sơ cũ còn dựa vào lớp `.hslsx*` của tệp này và tổ tiên `.hslsx`.
import "./lenh-san-xuat.css";

/** Gộp sự kiện SSE rồi mới tải lại — chuyền chạy thì sự kiện tới liên tục. */
const SSE_GOP_MS = 2000;

/** Bốn tab theo KHÂU (`trang_thai.KHAU` + "tất cả"). Khoá đi thẳng ra `?tab=` — hợp đồng. */
const TABS: { key: LenhSxTab; label: string }[] = [
  { key: "tat_ca", label: "Tất cả" },
  { key: "dang_sx", label: "Đang sản xuất" },
  { key: "sau_sx", label: "Sau sản xuất" },
  { key: "da_giao", label: "Đã giao đủ" },
];

/** `<input type="date">` cho gõ năm 6 chữ số ⇒ máy chủ 422 câm. Trống = không gửi; sai = không gửi
 *  + viền đỏ; hợp lệ = gửi. */
function ngayHopLe(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const nam = Number(v.slice(0, 4));
  if (nam < 2000 || nam > 2999) return false;
  return !Number.isNaN(new Date(v).getTime());
}

export function LenhSanXuatPage({
  eventTick,
  navigate,
  openHoSoId,
  openHoSoPv,
  openHoSoSeq,
}: {
  /** Nhích theo MỌI sự kiện SSE của AppShell; màn gộp lại rồi mới tải (xem `SSE_GOP_MS`). */
  eventTick?: number;
  /** Chỉ để hồ sơ có đường sang màn Đơn hàng bán. */
  navigate?: NavigateFn;
  /** Deep link QR phiếu công nghệ (`#lsx=&pv=`): có giá trị ⇒ mở NGAY hồ sơ đó, đè lên bảng. */
  openHoSoId?: number | null;
  /** Phiên bản in trên tờ giấy đã quét — chuyển tiếp cho băng cảnh báo của hồ sơ. */
  openHoSoPv?: number | null;
  /** `navSeq` của AppShell — tăng mỗi lượt điều hướng, để quét LẠI đúng tờ vừa đóng vẫn mở lại. */
  openHoSoSeq?: number | null;
}) {
  const { token } = useAuth();

  // --- bộ lọc (chạy ở máy chủ) ------------------------------------------------
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");
  const qTre = useTre(q);
  const [khachId, setKhachId] = useState("");
  const [tuNgay, setTuNgay] = useState("");
  const [denNgay, setDenNgay] = useState("");
  const [tab, setTab] = useState<LenhSxTab>("tat_ca");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    function phim(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", phim);
    return () => window.removeEventListener("keydown", phim);
  }, []);

  const tuGui = ngayHopLe(tuNgay) ? tuNgay : undefined;
  const denGui = ngayHopLe(denNgay) ? denNgay : undefined;
  const ngaySai = (tuNgay !== "" && !tuGui) || (denNgay !== "" && !denGui);

  // --- hồ sơ một lệnh: vẽ ĐÈ lên bảng để quay lại thấy y nguyên tab/lọc/trang ------------------
  const [hoSoId, setHoSoId] = useState<number | null>(null);
  const [hoSoPv, setHoSoPv] = useState<number | null>(null);
  useEffect(() => {
    if (openHoSoId == null) return;
    setHoSoId(openHoSoId);
    setHoSoPv(openHoSoPv ?? null);
  }, [openHoSoId, openHoSoPv, openHoSoSeq]);

  // Mở tay không có tờ giấy nào để so ⇒ xoá `pv` của lượt QR trước.
  const moHoSoTay = useCallback((id: number) => {
    setHoSoId(id);
    setHoSoPv(null);
  }, []);

  const khungRef = useRef<HTMLDivElement | null>(null);
  const dongHoSo = useCallback(() => {
    const id = hoSoId;
    setHoSoId(null);
    setHoSoPv(null);
    // Trả tiêu điểm về đúng nút vừa bấm; dòng có thể đã biến mất (SSE) thì về khung bảng.
    requestAnimationFrame(() => {
      const nut = document.querySelector<HTMLButtonElement>(`.lsc-ma[data-lsx="${id}"]`);
      if (nut) nut.focus();
      else khungRef.current?.focus();
    });
  }, [hoSoId]);

  // --- dữ liệu -------------------------------------------------------------------
  const [rows, setRows] = useState<LenhSxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [dem, setDem] = useState<Partial<Record<LenhSxTab, number>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [daTai, setDaTai] = useState(false);
  const [loi, setLoi] = useState<{ text: string; cam: boolean } | null>(null);
  const [dsKhach, setDsKhach] = useState<LenhSxKhachLoc[] | null>(null);

  // Đổi bộ lọc hay tab ⇒ về trang 1.
  useEffect(() => {
    setPage(1);
  }, [qTre, khachId, tuGui, denGui, tab]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api.lenhSanXuat
      .danhSach(token, {
        tab,
        q: qTre.trim() || undefined,
        khach_hang_id: khachId ? Number(khachId) : undefined,
        tu_ngay: tuGui,
        den_ngay: denGui,
        page,
        page_size: pageSize,
      })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
        setDem(r.dem_theo_tab);
        setLoi(null);
        setDaTai(true);
        const ve = trangHopLe(page, r.total, pageSize);
        if (ve !== null) setPage(ve);
      })
      .catch((e) => {
        const cam = e instanceof ApiError && e.isForbidden;
        setLoi({
          text: cam
            ? "Bạn không có quyền xem hồ sơ lệnh sản xuất."
            : e instanceof ApiError
              ? e.message
              : "Máy chủ không phản hồi.",
          cam,
        });
      })
      .finally(() => setLoading(false));
  }, [token, tab, qTre, khachId, tuGui, denGui, page, pageSize]);
  useEffect(() => {
    load();
  }, [load]);

  // Nguồn ô Khách — khách của chính các lệnh trong phạm vi (gác `lenh_san_xuat:read`). Hỏng ⇒ ô
  // Khách ẩn, các ô khác vẫn chạy.
  useEffect(() => {
    if (!token) return;
    let song = true;
    api.lenhSanXuat
      .boLoc(token)
      .then((r) => {
        if (song) setDsKhach(r.khach_hang);
      })
      .catch(() => {
        if (song) setDsKhach(null);
      });
    return () => {
      song = false;
    };
  }, [token]);

  // Realtime: gộp 2 giây rồi tải lại ĐÚNG một yêu cầu danh sách; giữ trang/tab/lọc. Hồ sơ đang mở
  // nhận CÙNG nhịp đã gộp (không nhận `eventTick` thô — mỗi sự kiện là một lượt hồ sơ nặng).
  const tickTre = useTre(eventTick ?? 0, SSE_GOP_MS);
  const tickDau = useRef(tickTre);
  useEffect(() => {
    if (tickTre === tickDau.current) return;
    tickDau.current = tickTre;
    load();
  }, [tickTre, load]);

  const dangLoc = qTre.trim() !== "" || khachId !== "" || tuNgay !== "" || denNgay !== "";
  const xoaLoc = useCallback(() => {
    setQ("");
    setKhachId("");
    setTuNgay("");
    setDenNgay("");
    setTab("tat_ca");
  }, []);

  // --- tab: roving tabindex, kích hoạt THỦ CÔNG (mỗi lần đổi tab là một yêu cầu) ---------------
  const tabIdx = Math.max(0, TABS.findIndex((t) => t.key === tab));
  const [tabFocus, setTabFocus] = useState(tabIdx);
  useEffect(() => {
    setTabFocus(tabIdx);
  }, [tabIdx]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function phimTab(e: React.KeyboardEvent, i: number) {
    let toi = i;
    if (e.key === "ArrowRight") toi = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") toi = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") toi = 0;
    else if (e.key === "End") toi = TABS.length - 1;
    else return;
    e.preventDefault();
    setTabFocus(toi);
    tabRefs.current[toi]?.focus();
  }

  const tongTheoLoc = dem?.tat_ca ?? null;
  const nhanTab = TABS[tabIdx]?.label ?? "Tất cả";

  return (
    <main className="lsc">
      <header className="lsc-head">
        <h1 className="lsc-title">Hồ sơ lệnh sản xuất</h1>
        {tongTheoLoc !== null && <span className="lsc-count">{num(tongTheoLoc)} lệnh</span>}
      </header>

      <section className="lsc-loc" aria-label="Lọc lệnh">
        <div className="lsc-search">
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={200}
            placeholder="Tìm mã lệnh, sản phẩm, số đơn, khách"
            aria-label="Tìm mã lệnh, sản phẩm, số đơn, khách"
          />
          {q === "" ? (
            <kbd className="lsc-kbd">Ctrl K</kbd>
          ) : (
            <button type="button" className="lsc-xoa" onClick={() => setQ("")} aria-label="Xoá ô tìm">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>

        {dsKhach && dsKhach.length > 0 && (
          <label className={`lsc-field${khachId !== "" ? " is-active" : ""}`}>
            <span>Khách</span>
            <select value={khachId} onChange={(e) => setKhachId(e.target.value)}>
              <option value="">Tất cả</option>
              {dsKhach.map((k) => (
                <option key={k.id} value={String(k.id)}>
                  {k.ten ?? `Khách #${k.id}`}
                </option>
              ))}
            </select>
          </label>
        )}

        <div
          className={`lsc-field${ngaySai ? " is-sai" : tuGui || denGui ? " is-active" : ""}`}
          role="group"
          aria-labelledby="lsc-hansx"
          title="Lệnh chưa khai hạn SX không nằm trong khoảng nào."
        >
          <span id="lsc-hansx">Hạn SX</span>
          <input
            type="date"
            value={tuNgay}
            min="2000-01-01"
            max="2999-12-31"
            onChange={(e) => setTuNgay(e.target.value)}
            aria-label="Hạn SX từ ngày"
            aria-invalid={(tuNgay !== "" && !tuGui) || undefined}
          />
          <span className="lsc-field__sep" aria-hidden="true">
            →
          </span>
          <input
            type="date"
            value={denNgay}
            min="2000-01-01"
            max="2999-12-31"
            onChange={(e) => setDenNgay(e.target.value)}
            aria-label="Hạn SX đến ngày"
            aria-invalid={(denNgay !== "" && !denGui) || undefined}
          />
        </div>

        {(dangLoc || tab !== "tat_ca") && (
          <button type="button" className="lsc-link" onClick={xoaLoc}>
            Bỏ lọc
          </button>
        )}
      </section>

      <div className="lsc-tabs" role="tablist" aria-label="Lọc lệnh theo khâu">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`lsc-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="lsc-panel"
            tabIndex={i === tabFocus ? 0 : -1}
            className="lsc-tab"
            onKeyDown={(e) => phimTab(e, i)}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {/* Đang tải ⇒ để trống chỗ số, không hiện 0. */}
            {dem ? <span className="lsc-tab__n">{num(dem[t.key] ?? 0)}</span> : null}
          </button>
        ))}
      </div>

      <div id="lsc-panel" role="tabpanel" aria-labelledby={`lsc-tab-${tab}`}>
        {loi && rows.length > 0 && <BangLoi text="Không làm mới được danh sách." onRetry={load} />}

        <div
          className="lsc-khung"
          ref={khungRef}
          tabIndex={0}
          role="group"
          aria-label="Bảng lệnh sản xuất, cuộn ngang được bằng phím mũi tên"
        >
          <table className="lsc-bang">
            <caption className="sr-only">Danh sách lệnh sản xuất đã phát hành</caption>
            <thead>
              <tr>
                <th scope="col">Lệnh</th>
                <th scope="col">Sản phẩm</th>
                <th scope="col" className="lsc-so">
                  Số lượng
                </th>
                <th scope="col">Khách</th>
                <th scope="col">Đơn</th>
                <th scope="col">Hạn SX</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            {loading && rows.length === 0 && !loi ? (
              <Skeleton rows={8} cols={7} />
            ) : (
              <tbody className={loading ? "is-mo" : undefined}>
                {rows.length === 0 ? (
                  <tr className="lsc-bang__rong">
                    <td colSpan={7}>
                      {loi ? (
                        <EmptyState
                          icon="alert"
                          title={loi.cam ? loi.text : "Không tải được danh sách lệnh."}
                          sub={loi.cam ? undefined : loi.text}
                          action={
                            loi.cam ? undefined : (
                              <Button variant="ghost" onClick={load}>
                                Thử lại
                              </Button>
                            )
                          }
                        />
                      ) : daTai && tab !== "tat_ca" && (dem?.tat_ca ?? 0) > 0 ? (
                        <EmptyState
                          icon="clipboard"
                          title={`Tab «${nhanTab}» hiện không có lệnh nào.`}
                          action={
                            <Button variant="ghost" onClick={() => setTab("tat_ca")}>
                              Về tab Tất cả
                            </Button>
                          }
                        />
                      ) : daTai && dangLoc ? (
                        <EmptyState
                          icon="search"
                          title="Không có lệnh nào khớp bộ lọc."
                          action={
                            <Button variant="ghost" onClick={xoaLoc}>
                              Bỏ lọc
                            </Button>
                          }
                        />
                      ) : (
                        <EmptyState
                          icon="clipboard"
                          title="Chưa có lệnh sản xuất nào đã phát hành trong phạm vi của bạn."
                          sub="Lệnh còn đang lập nằm ở màn Kế hoạch sản xuất."
                        />
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => <Dong key={r.id} r={r} onMo={moHoSoTay} />)
                )}
              </tbody>
            )}
          </table>
        </div>

        {total > 0 && (
          <PhanTrangDayDu
            trang={page}
            size={pageSize}
            tong={total}
            soDong={rows.length}
            onTrang={setPage}
            onSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            loading={loading}
            donVi="lệnh"
            ariaLabel="Phân trang lệnh sản xuất"
          />
        )}
      </div>

      {/* TẠM tới Task 9: bọc `.hslsx` cho khung hồ sơ cũ. */}
      {hoSoId !== null && (
        <div className="hslsx">
          <LenhSxHoSoView
            lsxId={hoSoId}
            pv={hoSoPv}
            onClose={dongHoSo}
            eventTick={tickTre}
            onMoDon={navigate ? (orderId) => navigate("don-hang-ban", { openOrderId: orderId }) : undefined}
          />
        </div>
      )}
    </main>
  );
}

/** MỘT dòng bảng — bảy cột tĩnh. Bấm mã lệnh để mở hồ sơ. */
function Dong({ r, onMo }: { r: LenhSxItem; onMo: (id: number) => void }) {
  return (
    <tr>
      <td>
        <span className="lsc-cum">
          <button
            type="button"
            className="lsc-ma"
            data-lsx={r.id}
            onClick={() => onMo(r.id)}
            aria-label={`Mở hồ sơ lệnh ${r.ma}${r.ten ? ` — ${r.ten}` : ""}`}
          >
            {r.ma}
          </button>
          {r.is_rush && <TheGap />}
        </span>
      </td>
      <td>{r.ten ?? "Chưa đặt tên"}</td>
      <td className="lsc-so">
        {num(r.so_luong_dat)}
        {r.don_vi_tinh && <span className="lsc-phu">{r.don_vi_tinh}</span>}
      </td>
      <td>{r.khach_hang ?? "—"}</td>
      <td>{r.order_no ?? "—"}</td>
      <td>{ngay(r.han_hoan_thanh_sx)}</td>
      <td>
        <span className="lsc-cum">
          <PillKhau khau={r.khau} ct={r.khau_chi_tiet} />
          {r.da_dong && <TheDaDong />}
        </span>
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `npx vitest run src/pages/LenhSanXuatPage.test.tsx` → PASS. Run: `npx tsc --noEmit` → không lỗi (khung hồ sơ cũ chỉ dùng `LsxTheoDoiTrangThai`/`LsxTheoDoiCanhBao`, vẫn còn).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/LenhSanXuatPage.tsx frontend/src/pages/LenhSanXuatPage.test.tsx
git diff --cached --stat
git commit -m "Hồ sơ lệnh SX: danh sách tra cứu 4 tab theo khâu, 7 cột tĩnh, lọc khách + hạn SX; bỏ KPI và lọc thừa"
```

### Task 9: Khung hồ sơ một lệnh — phần đầu gọn + 5 mục

**Files:**
- Create: `frontend/src/pages/lsxHoSoChung.tsx`, `LsxHoSoCongDoan.tsx`, `LsxHoSoQuyCach.tsx`, `LsxHoSoVatTu.tsx`, `LsxHoSoSauSx.tsx`, `LsxHoSoNhatKy.tsx`, `lenh-sx-ho-so.css` (đều trong `frontend/src/pages/`)
- Modify: `frontend/src/api/client.ts`, `frontend/src/pages/LenhSxHoSoView.tsx` (viết lại), `frontend/src/pages/LenhSxHoSoView.test.tsx`, `frontend/src/pages/LenhSanXuatPage.tsx` (gỡ hai chỗ TẠM), `frontend/src/pages/LenhSanXuatPage.test.tsx` (fixture `HOSO_77`)

**Interfaces:**
- Consumes: Task 3 (`thong_tin.da_dong`, `thong_tin.nhom_ten`, `tien_do.khau`, `tien_do.khau_chi_tiet`, `san_luong = {batch}`); Task 7 (`PillKhau`, `TheDaDong`, `TheGap`, `CO_NHAN`, `lsc-*`).
- Produces: `LenhSxHoSoView({lsxId, pv?, onClose, onMoDon?, eventTick?})` chữ ký KHÔNG đổi; khung `.lhs > section.lhs__panel[role=dialog]`; neo mục `#lhs-muc-cong-doan|quy-cach|vat-tu|sau-sx|nhat-ky`; từ `lsxHoSoChung.tsx`: `so`, `soHoac`, `ngayNgan`, `soNgayTre`, `Pill`, `pillMeta`, `Kv`, `Trong`, `BangCuon`, `khoMm`, `tongMeTheoDonVi`, `soDv`, `NHIEU_DON_VI` (Task 10 dùng `so`, `ngayNgan`).

- [ ] **Step 1: Viết lại bài kiểm hồ sơ**

Thay toàn bộ `frontend/src/pages/LenhSxHoSoView.test.tsx` bằng:

```tsx
// Hai LỜI HỨA in đậm ở đầu `LenhSxHoSoView.tsx` — "KHÔNG MỘT NÚT GHI NÀO" và "KHÔNG MỘT SỐ TIỀN
// NÀO" — nay có lưới.
//
// Luật "không tiền" đã có gác cổng ở máy chủ (`backend/tests/test_lenh_sx_ho_so.py`
// `test_khong_lo_tien` quét cả body text), nên bài dưới đây là lớp thứ hai: nó bắt được ca FE tự
// bịa ra tiền từ dữ liệu không phải tiền. Luật "không nút ghi" thì trước đó KHÔNG có gì canh —
// 1.400 dòng màn mới, ai thêm một nút «Bắt đầu» vào đây cũng không ai kêu.
//
// Dựng DTO ĐẦY ĐỦ 13 khối rồi MỞ HẾT các dòng công đoạn và "Xem đủ thông số" trước khi soi.
// Làm gọn 05/10/2026: khung còn 5 mục (Công đoạn · Quy cách · Vật tư · Sau sản xuất · Nhật ký).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LenhSxHoSoView } from "./LenhSxHoSoView";
import { AuthContext, type AuthState } from "../auth/AuthContext";
import { PermissionsProvider, buildCapabilities } from "../auth/permissions";
import type { LenhSxHoSoOut, ModuleCapability } from "../api/client";

const AUTH: AuthState = {
  status: "authenticated", user: null, token: "t",
  login: async () => {}, logout: async () => {},
  updateUser: () => {}, notice: null, setNotice: () => {},
};

/** Hồ sơ ĐẦY ĐỦ: mọi khối có ít nhất một dòng, để không khối nào trốn vào nhánh rỗng. */
const HOSO: LenhSxHoSoOut = {
  thong_tin: {
    id: 31, ma: "LSX26-0031", ten: "Hộp thuốc 10 vỉ", loai: "san_xuat_moi",
    order_id: 7, order_no: "DH26-0007", order_line_id: 11,
    khach_hang: "Công ty Dược Tân Bình", khach_hang_id: 4, sale: "Chị Hạnh",
    so_luong_dat: 12000, don_vi_tinh: "cái", is_rush: true,
    han_hoan_thanh_sx: "2026-09-10", han_giao_khach: "2026-09-15",
    ban_giao_at: "2026-09-01T02:00:00Z", ghi_chu: "Cán bóng một mặt",
    tao_luc: "2026-08-28T01:00:00Z",
    da_dong: false, nhom_ten: "Nhóm hộp thuốc",
  },
  tien_do: {
    phan_tram: 62.5, uoc_tinh: false, gio_may: 7.25,
    du_kien_xong: "2026-09-08T09:00:00Z", trang_thai: "dang_sx", canh_bao: ["su_co"],
    buoc_hien_tai: "In", buoc_hien_tai_cong_viec_id: 501, nhom_cong_doan: "in",
    may: "Máy in A", nguoi: ["Thợ Nam", "Thợ Bình"], da_giao: 200,
    khau: "dang_sx", khau_chi_tiet: null,
  },
  thong_so: {
    giay_ten: "Couche 250", dinh_luong: 250,
    kho_nguyen_dai: 860, kho_nguyen_rong: 650, kho_in_dai: 780, kho_in_rong: 540,
    dai_thanh_pham: 120, rong_thanh_pham: 80, quy_cach_in: "hai_mat",
    so_mau_a: 4, so_mau_b: 1, muc_a: ["C", "M", "Y", "K"], muc_b: ["K"],
    so_trang: null, trang_moi_tay: null, so_kem: 5, so_manh_xa: 0,
    ghi_chu_ky_thuat: "Bế theo khuôn cũ",
    so_con: 8, so_to_ke_hoach: 1580, so_to_nguyen: 1600, don_vi_tinh: "cái",
  },
  routing: {
    nodes: [
      {
        id: 901, thu_tu: 1, lop: 0, phu_thuoc: [], ten: "CTP", nhom: "che_ban",
        loai_buoc: "may", bat_buoc: true, nha_cung_cap: null, cong_viec_id: 500,
        la_buoc_ghep: false, la_buoc_hien_tai: false, trang_thai: "completed",
        may: "Máy ghi kẽm", to: "Tổ chế bản", nguoi: ["Thợ chế bản"],
        du_kien_bat_dau: "2026-09-01T01:00:00Z", du_kien_ket_thuc: "2026-09-01T03:00:00Z",
        hoan_thanh_luc: "2026-09-01T03:10:00Z",
        so_luong_vao: 5, so_luong_ra: 5, don_vi_vao: "kem", don_vi_ra: "kem",
        can_khuon: false, khuon_da_nhan: false, khuon_be_ma: null, khuon_be_ten: null,
        khuon_be_so_ke: null, khuon_be_tinh_trang: null,
      },
      {
        id: 902, thu_tu: 2, lop: 1, phu_thuoc: [901], ten: "In", nhom: "in",
        loai_buoc: "may", bat_buoc: true, nha_cung_cap: null, cong_viec_id: 501,
        la_buoc_ghep: true, la_buoc_hien_tai: true, trang_thai: "running",
        may: "Máy in A", to: "Tổ in", nguoi: ["Thợ Nam", "Thợ Bình"],
        du_kien_bat_dau: "2026-09-02T01:00:00Z", du_kien_ket_thuc: "2026-09-02T09:00:00Z",
        hoan_thanh_luc: null,
        so_luong_vao: 1600, so_luong_ra: 1580, don_vi_vao: "to", don_vi_ra: "to",
        can_khuon: false, khuon_da_nhan: false, khuon_be_ma: null, khuon_be_ten: null,
        khuon_be_so_ke: null, khuon_be_tinh_trang: null,
      },
      {
        id: 903, thu_tu: 3, lop: 2, phu_thuoc: [902], ten: "Đóng gói", nhom: "thanh_pham",
        loai_buoc: "to", bat_buoc: true, nha_cung_cap: null, cong_viec_id: null,
        la_buoc_ghep: false, la_buoc_hien_tai: false, trang_thai: null,
        may: null, to: "Tổ đóng gói", nguoi: [],
        du_kien_bat_dau: null, du_kien_ket_thuc: null, hoan_thanh_luc: null,
        so_luong_vao: 0, so_luong_ra: 0, don_vi_vao: "cai", don_vi_ra: "cai",
        can_khuon: true, khuon_da_nhan: false, khuon_be_ma: "KB-0007", khuon_be_ten: "Khuôn bế hộp",
        khuon_be_so_ke: "K-A3", khuon_be_tinh_trang: "san_sang",
      },
    ],
    canh: [[901, 902], [902, 903]],
  },
  vat_tu: {
    hien_tai: {
      du: false,
      dong: [{
        pham_vi: "lsx", ma: "LSX26-0031", ten_viec: "In", buoc_id: 902,
        hang_loai: "giay", hang_id: 3, hang_ma: "GIAY-C250", hang_ten: "Couche 250",
        don_vi_goc: "kg", ton: 40, nhu_cau: 120, nhu_cau_hien_thi: "120 kg (1.600 tờ)",
        da_cap: 0, dang_linh: 0, con_phai_co: 80, thieu: 80, trang_thai: "do",
        ngay_can: "2026-09-02",
      }],
    },
    canh_bao_sau: [{
      pham_vi: "lsx", ma: "LSX26-0031", ten_viec: "Đóng gói", buoc_id: 903,
      hang_loai: "vat_tu", hang_id: 9, hang_ma: "VT-KEO", hang_ten: "Keo dán hộp",
      don_vi_goc: "kg", ton: 0, nhu_cau: 50, nhu_cau_hien_thi: null,
      da_cap: 0, dang_linh: 0, con_phai_co: 50, thieu: 50, trang_thai: "do",
      ngay_can: "2026-09-05",
    }],
    da_cap: [{
      pham_vi: "bai_ghep", ma: "GB26-0004", ten_viec: "In", buoc_id: 902,
      hang_loai: "vat_tu", hang_id: 12, hang_ma: "VT-MUC-K", hang_ten: "Mực đen",
      don_vi_goc: "kg", ton: 18, nhu_cau: 6, nhu_cau_hien_thi: null,
      da_cap: 6, dang_linh: 2, con_phai_co: 0, thieu: 0, trang_thai: "xam",
      ngay_can: "2026-09-02",
    }],
  },
  nhan_luc: {
    hien_tai: [{
      cong_viec_id: 501, buoc_id: 902, ten_viec: "In",
      to: "Tổ in", may: "Máy in A", nguoi: ["Thợ Nam", "Thợ Bình"],
    }],
    lich_su: [
      {
        loai: "giao_nguoi", luc: "2026-09-02T01:05:00Z", cong_viec_id: 501, ten_viec: "In",
        nguoi: "Thợ Nam", may_cu: null, may_moi: null, ly_do: null,
      },
      {
        loai: "doi_may", luc: "2026-09-02T04:00:00Z", cong_viec_id: 501, ten_viec: "In",
        nguoi: null, may_cu: "Máy in B", may_moi: "Máy in A", ly_do: "Máy cũ kẹt giấy",
      },
    ],
  },
  san_luong: {
    batch: [{
      id: 71, cong_viec_id: 501, ten_viec: "In", la_buoc_ghep: true,
      bat_dau: "2026-09-02T01:00:00Z", ket_thuc: "2026-09-02T05:00:00Z",
      tong: 500, tot: 480, hong: 20, don_vi: "to", mo_ta_loi: "Nhăn giấy",
    }],
  },
  su_co: [{
    id: 44, ma: "YC26-0044", cong_viec_id: 501, ten_viec: "In", may: "Máy in A",
    bo_phan_hong: "Cụm cấp giấy", mo_ta: "Kẹt giấy liên tục", muc_do: "trung_binh",
    may_dung: true, nguoi_bao: "Thợ Nam", thoi_diem: "2026-09-02T03:30:00Z",
    trang_thai: "da_tao_phieu", ly_do_tu_choi: null,
    phieu: {
      id: 8, ma: "SC26-0008", trang_thai: "dang_sua",
      nguyen_nhan_phuong_an: "Thay bánh cao su", hoan_thanh_at: null,
    },
  }],
  kcs: {
    tong_nhan: 1100, tong_dat: 1000, tong_khong_dat: 100, ty_le_dat: 90.90909,
    batch: [{
      id: 61, cong_viec_id: 501, ten_viec: "In", la_buoc_ghep: true, la_kcs_cuoi: false,
      ket_thuc: "2026-09-02T06:00:00Z", so_luong_nhan: 1100, so_luong_dat: 1000,
      so_luong_khong_dat: 100, don_vi: "to", ket_luan: "dat_mot_phan", ghi_chu: "Lệch màu nhẹ",
    }],
  },
  kho: {
    so_lenh_trong_nhom: 2,
    yeu_cau: [{
      id: 21, request_id: 9, ma: "DNN0009", hang_id: 55, so_luong_yeu_cau: 500, so_luong_xac_nhan: 500,
      con_lai: 0, don_vi: "cai", trang_thai: "done",
      tao_luc: "2026-09-02T07:00:00Z", xac_nhan_luc: "2026-09-02T08:00:00Z",
    }],
  },
  giao_hang: {
    nhom_id: 5, order_id: 7, order_line_ids: [11], so_lenh_trong_nhom: 2,
    hang: [
      {
        hang_id: 55, ma: "TP-HOP-THUOC", ten: "Hộp thuốc 10 vỉ", quy_cach: "Thùng 100",
        don_vi: "cai", kho_id: 1, kho_ten: "Kho thành phẩm A",
        so_luong: 300, so_toi_da: 0, khong_tinh_duoc: false,
      },
      {
        hang_id: 55, ma: "TP-HOP-THUOC", ten: "Hộp thuốc 10 vỉ", quy_cach: "Thùng 100",
        don_vi: "cai", kho_id: 2, kho_ten: "Kho thành phẩm B",
        so_luong: 400, so_toi_da: 200, khong_tinh_duoc: false,
      },
    ],
    da_nhap_kho: 700, da_giao: 500, co_the_giao: true, don_vi_lech: false,
  },
  timeline: [
    {
      loai: "phat_hanh", luc: "2026-09-01T00:30:00Z", nguoi: "Điều độ Lan",
      noi_dung: "Phát hành phiên bản 1", cong_viec_id: null, ten_viec: null,
    },
    {
      loai: "kcs", luc: "2026-09-02T06:00:00Z", nguoi: null,
      noi_dung: "KCS In: 1000 đạt · 100 không đạt (Đạt một phần)",
      cong_viec_id: 501, ten_viec: "In",
    },
  ],
  phien_ban: 1,
};

/** Danh mục Đơn vị mà màn nạp một lần cho cả phiên (`useNapTenDonVi`). Mọi cột `don_vi` của tầng
 *  sản xuất là MÃ (`to`, `kem`) — tên hiển thị chỉ có ở đây. */
const DON_VI = [
  { ma: "to", ten: "tờ" },
  { ma: "kem", ten: "bản kẽm" },
  { ma: "cai", ten: "cái" },
  { ma: "kg", ten: "kilôgam" },
];

/** Fetch giả PHÂN BIỆT ĐƯỜNG DẪN. Trước đây stub trả hồ sơ cho MỌI đường, kể cả `/api/don-vi` —
 *  bảng tên nhận một body không có `items` nên rỗng, và cả bộ lưới chạy trên nhánh "mã lạ ⇒ hiện
 *  mã trần". Nhánh đổi mã → tên khi đó không có bài nào chạm tới. */
function stubApi(body: LenhSxHoSoOut = HOSO) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const data: unknown = url.includes("/api/don-vi") ? { items: DON_VI } : body;
    return Promise.resolve({
      ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }),
      json: async () => data, text: async () => JSON.stringify(data),
    } as Response);
  }));
}

/** Dựng màn với quyền ĐẦY ĐỦ bên giao hàng — ca rộng nhất, tức ca bày ra nhiều nút nhất.
 *  `pv`: phiên bản in trên tờ giấy đã quét (Task 14, deep link QR) — không truyền = mở tay,
 *  giống hệt trước đây, không phá bài canh cũ nào ở trên. */
function ve(pv?: number | null, onMoDon: (id: number) => void = () => {}) {
  const caps = buildCapabilities([
    {
      module_key: "giao_hang", scope: "all",
      can_read: true, can_create: true, can_update: true,
    } as ModuleCapability,
  ]);
  return render(
    <AuthContext.Provider value={AUTH}>
      <PermissionsProvider caps={caps}>
        <LenhSxHoSoView lsxId={31} pv={pv} onClose={() => {}} onMoDon={onMoDon} />
      </PermissionsProvider>
    </AuthContext.Provider>,
  );
}

/** Mở HẾT dòng công đoạn có chi tiết và ô "Xem đủ thông số" (mọi nút `aria-expanded=false`). */
async function moHetKhoi() {
  for (const nut of screen.queryAllByRole("button", { expanded: false })) {
    await userEvent.click(nut);
  }
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("Hồ sơ lệnh sản xuất · hai bất biến của màn", () => {
  it("⭐ KHÔNG một nút GHI nào", async () => {
    // Nhãn của những nút GHI mà màn thực thi tại tổ (`ThucHienSanXuat`) có và màn này TUYỆT ĐỐI
    // không được có. "Giao"/"Rút" viết kèm chữ "ng(ười)": giao/rút NGƯỜI mới là thao tác ghi, còn
    // liên kết «Tạo yêu cầu giao hàng» là điều hướng và đầu file cho phép đích danh.
    //
    // Nút gập khối (`aria-expanded`) không phải nút thao tác — nó chỉ mở/đóng, và tiêu đề khối
    // «Giao hàng» sẽ dính oan nếu so nguyên văn.
    const NHAN_GHI =
      /bắt đầu|tạm dừng|kết thúc|\blưu\b|xo[áa]|giao ng|rút ng|đổi máy|ghi sản lượng|lập phiếu/i;

    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    await moHetKhoi();

    const thaoTac = screen
      .getAllByRole("button")
      .filter((b) => !b.hasAttribute("aria-expanded"))
      .map((b) => b.textContent ?? "");
    expect(thaoTac.length).toBeGreaterThan(0);   // không có nút nào ⇒ bài này vô nghĩa
    for (const nhan of thaoTac) {
      expect(nhan, `nút ghi lọt vào màn chỉ đọc: ${nhan}`).not.toMatch(NHAN_GHI);
    }
  });

  it("⭐ KHÔNG một số TIỀN nào", async () => {
    // Hai đường rò: (1) một khoá tiền của máy chủ lọt ra `title`/thuộc tính; (2) FE tự dựng một
    // chuỗi tiền. Cả hai đều soi trên `innerHTML`, KHÔNG trên `textContent`: `textContent` dán
    // liền hai text node cạnh nhau, nên "…250.000 đ" + "Công đoạn…" thành "đC" và mệnh đề
    // "`đ` không được đứng trước chữ cái" (thứ phân biệt "12.000 đ" với "500 đã ghi") hụt mất.
    const KHOA_TIEN = [
      "don_gia", "gia_von", "thanh_tien", "luong_khoan", "chi_phi", "la_luong_khoan",
    ];
    const DINH_DANG_TIEN = /₫|VND|đồng|\d[\d.,]*\s*đ(?![\p{L}\p{N}])/iu;

    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    await moHetKhoi();

    const html = document.body.innerHTML;
    for (const cam of KHOA_TIEN) {
      expect(html, `màn lộ khoá tiền \`${cam}\``).not.toContain(cam);
    }
    expect(html).not.toMatch(DINH_DANG_TIEN);
  });
});

// Ba tổng `san_luong.tong/tot/hong` đã gỡ ở máy chủ (cộng tờ in với thành phẩm). Màn chỉ cộng mẻ của
// CÙNG một bước theo TỪNG đơn vị; KCS chỉ bày lô KCS cuối, không tỉ lệ gộp.
describe("Hồ sơ lệnh sản xuất · không còn tổng cộng lẫn bước", () => {
  it("⭐ hai bước ghi hai thang ⇒ mỗi bước một số, không có tổng cộng bừa", async () => {
    const b = HOSO.san_luong.batch[0];
    stubApi({
      ...HOSO,
      san_luong: {
        batch: [
          { ...b, tong: 500, tot: 480, hong: 20, don_vi: "to" },
          { ...b, id: 72, cong_viec_id: 500, ten_viec: "CTP", la_buoc_ghep: false, tong: 8, tot: 8, hong: 0, don_vi: "kem" },
        ],
      },
    });
    ve();
    await screen.findByText("LSX26-0031");

    const cd = within(document.getElementById("lhs-muc-cong-doan")!);
    expect(cd.getByText("480 tờ")).toBeInTheDocument();
    expect(cd.getByText("8 bản kẽm")).toBeInTheDocument();
    expect(document.body.textContent, "có tổng cộng qua hai thang").not.toContain("488");
  });

  it("⭐ KCS: chỉ lô KCS cuối ở Sau sản xuất, không tổng, không tỉ lệ gộp", async () => {
    const k = HOSO.kcs.batch[0];
    stubApi({
      ...HOSO,
      kcs: {
        tong_nhan: 1500, tong_dat: 1400, tong_khong_dat: 100, ty_le_dat: 93.33333,
        batch: [
          { ...k, so_luong_nhan: 1000, so_luong_dat: 1000, so_luong_khong_dat: 0, don_vi: "to", ket_luan: "dat" },
          {
            ...k, id: 62, cong_viec_id: 503, ten_viec: "Đóng gói", la_kcs_cuoi: true,
            so_luong_nhan: 500, so_luong_dat: 400, so_luong_khong_dat: 100, don_vi: "cai",
            ket_luan: "dat_mot_phan",
          },
        ],
      },
    });
    ve();
    await screen.findByText("LSX26-0031");

    const sau = within(document.getElementById("lhs-muc-sau-sx")!);
    expect(sau.getByText(/Nhận 500 cái, đạt 400, không đạt 100/)).toBeInTheDocument();
    expect(sau.queryByText(/Nhận 1\.000/)).toBeNull();
    expect(document.body.textContent).not.toContain("93,3");
    expect(document.body.textContent).not.toContain("1.400");
  });
});

// Cột `don_vi` khắp tầng sản xuất giữ MÃ danh mục (`don_vi_do.ma`: `to`, `kem`, `cai`), không giữ
// tên. Bày thẳng cột đó ra màn là bắt người ở xưởng tra mã — và tra bằng cái gì thì không ai nói.
// Tên nằm ở `don_vi_do.ten`, nạp qua `useNapTenDonVi` rồi tra bằng `nhanDonVi`.
describe("Hồ sơ lệnh sản xuất · chip khuôn đi theo bước", () => {
  it("⭐ bước cần dụng cụ bày mã dao + số kệ ngay trên bảng routing", async () => {
    // Trước 04/09/2026 máy chủ đã trả `khuon_be_*` nhưng `RoutingNodeOut` không khai, Pydantic nuốt
    // im lặng nên hồ sơ câm — "bế chưa có dao" chỉ lộ khi mở bàn tổ. Bài này giữ cho đường dữ liệu
    // dict → schema → type TS → chip không đứt lại.
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    await moHetKhoi();

    expect(screen.getByText("KB-0007 · K-A3")).toBeInTheDocument();
    // Bước không cần dụng cụ thì KHÔNG được mọc chip rỗng: chỉ một bước trong ba có dao.
    expect(document.querySelectorAll(".chip-khuon")).toHaveLength(1);
  });
});

// E2E 27/09/2026: bước bị bài ghép phủ in theo cấu hình của LỆNH (Máy, "Tổ cán phủ") trong khi
// lượt chung là Thuê ngoài — máy chủ nay trả cấu hình bước chung + mã bài, màn phải nói ra mã bài.
describe("Hồ sơ lệnh sản xuất · bước bị bài ghép phủ", () => {
  it("bày loại Thuê ngoài, nhà gia công và chip đi chung bài ghép", async () => {
    const [n1, n2, n3] = HOSO.routing!.nodes;
    stubApi({
      ...HOSO,
      routing: {
        ...HOSO.routing!,
        nodes: [n1, {
          ...n2, loai_buoc: "thue_ngoai", nha_cung_cap: "Tân Phát", may: null, to: null,
          bai_ghep_ma: "GB26-0002",
        }, n3],
      },
    });
    ve();
    await screen.findByText("LSX26-0031");
    await moHetKhoi();

    expect(screen.getByText("Bài ghép GB26-0002")).toBeInTheDocument();
    expect(screen.getByText("Tân Phát")).toBeInTheDocument();
  });
});

describe("Hồ sơ lệnh sản xuất · bày TÊN đơn vị chứ không bày mã", () => {
  it("⭐ mọi chỗ có đơn vị đều đọc ra tên trong danh mục", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    await moHetKhoi();

    // Routing bước CTP ghi `kem` cả vào lẫn ra ⇒ phải đọc được thành chữ.
    await screen.findByText(/5 bản kẽm → 5 bản kẽm/);
    // Cột Tốt, hỏng của bước In: `to` ⇒ "tờ".
    expect(within(document.getElementById("lhs-muc-cong-doan")!).getByText("480 tờ")).toBeInTheDocument();

    // Và không còn mã trần nào lọt tới mắt người đọc. `\bkem\b` không đụng "kẽm" (chữ có dấu), nên
    // nó bắt đúng cái mã; `\d\s+to\b` bắt ca "500 to" mà không bắt "500 tờ".
    const chu = document.body.textContent ?? "";
    expect(chu, "mã `kem` vẫn hiện thay cho tên đơn vị").not.toMatch(/\bkem\b/);
    expect(chu, "mã `to` vẫn hiện thay cho tên đơn vị").not.toMatch(/\d\s+to\b/);
    expect(chu, "mã `cai` vẫn hiện thay cho tên đơn vị").not.toMatch(/\bcai\b/);
  });
});

// Task 14 — deep link QR: ba tình huống Bước 4 của brief mà ruling C106 giao lại cho bài canh tự
// động thay vì dev-browser (điều phối viên tự đi lại luồng bằng chuột sau khi nhận báo cáo). Hai
// bài dưới đây là phần "băng cảnh báo phiên bản cũ"; phần "hash sống sót qua đăng nhập" nằm ở
// `LoginPage.test.tsx`, phần "mở đúng lệnh" nằm ở `LenhSanXuatPage.test.tsx`.
describe("Hồ sơ lệnh sản xuất · băng cảnh báo phiếu giấy cũ (Task 14)", () => {
  it("⭐ pv nhỏ hơn phien_ban hiện tại ⇒ băng cảnh báo hiện, ĐÚNG chữ brief", async () => {
    stubApi({ ...HOSO, phien_ban: 2 });
    ve(1);
    await screen.findByText("LSX26-0031");

    // Chữ NGUYÊN VĂN brief đòi — không diễn giải, không rút gọn. Tìm theo CHỮ, không theo
    // `getByRole("status")` (sửa vòng 1, P8): màn hôm nay chỉ có một `role="status"` nên bài xanh,
    // nhưng thêm một live region khác sau này (banner thành công, toast…) là bài vỡ vì "multiple
    // elements" — vỡ vì lý do KHÁC hẳn điều bài này canh.
    expect(screen.getByText("Phiếu giấy v1, lệnh hiện tại đã là v2")).toBeInTheDocument();
  });

  it("⭐ pv bằng phien_ban hiện tại ⇒ KHÔNG băng nào", async () => {
    // HOSO gốc đã có phien_ban: 1 — quét đúng tờ giấy mới nhất.
    stubApi();
    ve(1);
    await screen.findByText("LSX26-0031");

    expect(screen.queryByText(/Phiếu giấy v/)).not.toBeInTheDocument();
  });

  it("⭐ mở tay từ bảng (không có pv) ⇒ KHÔNG băng nào, kể cả lệnh đã qua nhiều phiên bản", async () => {
    stubApi({ ...HOSO, phien_ban: 5 });
    ve(); // không truyền pv — đúng thứ `LenhSanXuatPage.moHoSoTay` làm khi bấm dòng trong bảng.
    await screen.findByText("LSX26-0031");

    expect(screen.queryByText(/Phiếu giấy v/)).not.toBeInTheDocument();
  });
});

describe("Hồ sơ lệnh sản xuất · phần đầu gọn (05/10/2026)", () => {
  it("⭐ pill khâu, thẻ Nhóm có số lệnh, Đơn bấm sang đơn hàng", async () => {
    const moDon = vi.fn();
    stubApi();
    ve(undefined, moDon);
    await screen.findByText("LSX26-0031");

    expect(screen.getByText("Đang sản xuất")).toBeInTheDocument();
    expect(screen.queryByText("Đã đóng lệnh")).toBeNull();
    expect(screen.getByText("Nhóm hộp thuốc")).toBeInTheDocument();
    expect(screen.getByText("2 lệnh")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "DH26-0007" }));
    expect(moDon).toHaveBeenCalledWith(7);
  });

  it("⭐ sự cố đã có phiếu đang sửa ⇒ dòng VÀNG 'Đang sửa, phiếu …', không dòng đỏ", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    const dong = screen.getByText("Đang sửa, phiếu SC26-0008").closest("li");
    expect(dong?.className).toContain("lhs-canhbao__vang");
    expect(document.querySelector(".lhs-canhbao__do")).toBeNull();
  });

  it("⭐ sự cố chờ tiếp nhận ⇒ dòng ĐỎ có mã, máy, bộ phận hỏng, thẻ Máy dừng", async () => {
    stubApi({ ...HOSO, su_co: [{ ...HOSO.su_co[0], trang_thai: "cho_tiep_nhan", phieu: null }] });
    ve();
    await screen.findByText("LSX26-0031");
    const dong = screen.getByText("Sự cố YC26-0044").closest("li");
    expect(dong?.className).toContain("lhs-canhbao__do");
    expect(dong?.textContent).toContain("Máy in A, Cụm cấp giấy");
    expect(dong?.textContent).toContain("Máy dừng");
  });

  it("⭐ ba ô tổng quan: bước i trên n, dự kiến kịp, đã giao trên đặt", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    expect(screen.getByText("bước 2 trên 3")).toBeInTheDocument();
    expect(screen.getByText("Dự kiến xong 08/09, kịp")).toBeInTheDocument();
    expect(screen.getByText("200 trên 12.000 cái")).toBeInTheDocument();
  });

  it("⭐ dự kiến vượt hạn ⇒ 'trễ N ngày'", async () => {
    stubApi({ ...HOSO, tien_do: { ...HOSO.tien_do, du_kien_xong: "2026-09-12T09:00:00Z" } });
    ve();
    await screen.findByText("LSX26-0031");
    expect(screen.getByText("Dự kiến xong 12/09, trễ 2 ngày")).toBeInTheDocument();
  });
});

describe("Hồ sơ lệnh sản xuất · năm mục", () => {
  it("⭐ mở dòng bước In ⇒ các mẻ, đổi máy và câu ca ghép", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    await userEvent.click(screen.getByRole("button", { name: "2. In" }));
    expect(screen.getByText("Số trên dòng này là của cả ca in ghép, không riêng lệnh này.")).toBeInTheDocument();
    expect(screen.getByText("Đổi máy Máy in B → Máy in A, lý do: Máy cũ kẹt giấy")).toBeInTheDocument();
    expect(screen.getByText("Ghi 480 tờ tốt, 20 hỏng, lỗi: Nhăn giấy")).toBeInTheDocument();
  });

  it("⭐ vật tư: một bảng, ba nút lọc, mặc định nút đầu có dòng", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    const vt = within(document.getElementById("lhs-muc-vat-tu")!);
    expect(vt.getByRole("button", { name: "Bước đang làm 1" })).toHaveAttribute("aria-pressed", "true");
    expect(vt.getByText("Couche 250")).toBeInTheDocument();
    await userEvent.click(vt.getByRole("button", { name: "Kho đã cấp 1" }));
    expect(vt.getByText("Mực đen")).toBeInTheDocument();
    expect(vt.queryByText("Couche 250")).toBeNull();
  });

  it("⭐ nhật ký: mới nhất trên, 'Sản lượng, KCS' mặc định tắt", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    const nk = within(document.getElementById("lhs-muc-nhat-ky")!);
    expect(nk.getByText("Phát hành phiên bản 1")).toBeInTheDocument();
    expect(nk.queryByText(/^KCS In/)).toBeNull();
    await userEvent.click(nk.getByRole("button", { name: "Sản lượng, KCS" }));
    const dong = nk.getAllByRole("listitem");
    expect(dong[0].textContent).toContain("KCS In");
    expect(dong[1].textContent).toContain("Phát hành phiên bản 1");
  });
});
```

Trong `frontend/src/pages/LenhSanXuatPage.test.tsx`, sửa fixture `HOSO_77` theo dạng hồ sơ mới: trong `thong_tin` thêm `da_dong: false, nhom_ten: null,`; trong `tien_do` thêm `khau: "dang_sx", khau_chi_tiet: null,`; thay dòng `san_luong: { tong: 0, tot: 0, hong: 0, batch: [] },` bằng `san_luong: { batch: [] },`.

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npx vitest run src/pages/LenhSxHoSoView.test.tsx` → FAIL (khung cũ không có `#lhs-muc-*`, không có pill khâu).

- [ ] **Step 3: Vá client + viết các tệp hồ sơ**

Run: `python %TEMP%\patch_client.py 9 frontend/src/api/client.ts` → `ok 9`. Rồi tạo/thay:

`frontend/src/pages/lsxHoSoChung.tsx`:

```tsx
// Mảnh dùng chung của khung hồ sơ MỘT lệnh (`LenhSxHoSoView` + năm tệp mục `LsxHoSo*`).
// Lớp CSS: `lenh-sx-ho-so.css` (tiền tố `lhs-`) và pill của `lenh-sx-chung.css` (`lsc-pill--*`).
//
// ⚠️ ĐỌC, KHÔNG TÍNH LẠI qua nhiều bước: mọi con số lấy từ `LenhSxHoSoOut`. Chỗ duy nhất cộng ở đây
// là cộng các mẻ của CÙNG MỘT công việc theo TỪNG đơn vị (`tongMeTheoDonVi`) — không bao giờ cộng
// qua hai thang đo.
import type { ReactNode } from "react";

import type { LenhSxSanLuongBatch } from "../api/client";
import { nhanDonVi } from "./lsxBuoc";

/** Số thập phân của xưởng: bỏ đuôi `,0`, giữ tối đa 2 chữ số lẻ. */
export function so(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

/** `so()` nhưng 0 cũng ra "—" — cho ô máy chủ ép `None → 0`. */
export function soHoac(v: number | null | undefined): string {
  return v ? so(v) : "—";
}

/** "dd/mm" theo giờ máy người xem (giờ xưởng). Chuỗi rỗng/hỏng ⇒ "—". */
export function ngayNgan(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Số ngày `moc` (giờ thật) vượt `han` (ngày `YYYY-MM-DD`), theo ngày lịch của người xem. Âm hoặc 0
 *  = kịp. `null` khi thiếu một trong hai. */
export function soNgayTre(moc: string | null | undefined, han: string | null | undefined): number | null {
  if (!moc || !han) return null;
  const d = new Date(moc);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(han);
  if (Number.isNaN(d.getTime()) || !m) return null;
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((a - b) / 86_400_000);
}

export type PillMeta = { label: string; cls: string };

/** Nhãn an toàn cho chuỗi enum: giá trị lạ hiện chính chuỗi đó, không hiện ô trống. */
export function pillMeta(map: Record<string, PillMeta>, k: string | null | undefined): PillMeta | null {
  if (!k) return null;
  return map[k] ?? { label: k, cls: "lsc-pill--off" };
}

export function Pill({ meta }: { meta: PillMeta | null }) {
  if (!meta) return null;
  return <span className={`lsc-pill ${meta.cls}`}>{meta.label}</span>;
}

/** Trạng thái CÔNG VIỆC của một bước. `null` = bước chưa có công việc (chưa phát hành tới đó). */
export const TT_BUOC: Record<string, PillMeta> = {
  released: { label: "Chờ làm", cls: "lsc-pill--off" },
  running: { label: "Đang chạy", cls: "lsc-pill--steel" },
  paused: { label: "Tạm dừng", cls: "lsc-pill--signal" },
  completed: { label: "Hoàn thành", cls: "lsc-pill--moss" },
};

/** Màu cân đối vật tư — cùng chữ với màn Kế hoạch vật tư. */
export const VT_MAU: Record<string, PillMeta> = {
  xam: { label: "Đã cấp đủ", cls: "lsc-pill--off" },
  xanh: { label: "Đủ trong kho", cls: "lsc-pill--moss" },
  vang: { label: "Đủ nhờ hàng về", cls: "lsc-pill--amber" },
  do: { label: "Thiếu", cls: "lsc-pill--signal" },
  khong_ro: { label: "Chưa đánh giá được", cls: "lsc-pill--off" },
};

export const KCS_KET_LUAN: Record<string, PillMeta> = {
  dat: { label: "Đạt", cls: "lsc-pill--moss" },
  dat_mot_phan: { label: "Đạt một phần", cls: "lsc-pill--amber" },
  khong_dat: { label: "Không đạt", cls: "lsc-pill--signal" },
};

/** Yêu cầu nhập kho thành phẩm (trạng thái `StockRequest`). */
export const KHO_YC_TT: Record<string, PillMeta> = {
  draft: { label: "Nháp", cls: "lsc-pill--off" },
  pending: { label: "Chờ duyệt", cls: "lsc-pill--amber" },
  approved: { label: "Chờ kho nhận", cls: "lsc-pill--amber" },
  received: { label: "Kho đã tiếp nhận", cls: "lsc-pill--steel" },
  preparing: { label: "Kho đang lập phiếu", cls: "lsc-pill--steel" },
  partial: { label: "Nhận một phần", cls: "lsc-pill--steel" },
  done: { label: "Đã nhận đủ", cls: "lsc-pill--moss" },
  rejected: { label: "Kho từ chối", cls: "lsc-pill--signal" },
  cancelled: { label: "Đã huỷ", cls: "lsc-pill--off" },
};

/** Loại lệnh (`models/lsx.LOAI_LSX`). */
export const LOAI_LENH: Record<string, string> = {
  san_xuat_moi: "Sản xuất mới",
  bo_sung: "Bổ sung",
  bu: "Bù",
  lam_lai: "Làm lại",
  mau: "Mẫu",
  noi_bo: "Nội bộ",
};

export const MUC_DO: Record<string, string> = {
  nhe: "Nhẹ",
  trung_binh: "Trung bình",
  nghiem_trong: "Nghiêm trọng",
};

/** Câu khi tổng trộn nhiều thang đo — cùng chữ ở mọi chỗ. */
export const NHIEU_DON_VI = "Nhiều đơn vị, không cộng được";

/** Ô "nhãn — giá trị". */
export function Kv({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="lhs-kv">
      <span className="lhs-kv__k">{k}</span>
      <span className="lhs-kv__v">{v === null || v === undefined || v === "" ? "—" : v}</span>
    </div>
  );
}

/** Mục RỖNG phải nói vì sao rỗng. */
export function Trong({ children }: { children: ReactNode }) {
  return <p className="lhs-trong">{children}</p>;
}

/** Khung cuộn ngang riêng cho từng bảng (bảng khai `min-width`). */
export function BangCuon({ children }: { children: ReactNode }) {
  return <div className="lhs-bangwrap">{children}</div>;
}

/** "860 × 650 mm" — thiếu một chiều thì cả cặp vô nghĩa ⇒ `null`. */
export function khoMm(dai: number | null, rong: number | null): string | null {
  if (dai == null || rong == null) return null;
  return `${so(dai)} × ${so(rong)} mm`;
}

export type TongDonVi = { don_vi: string | null; tot: number; hong: number };

/** Cộng các mẻ của MỘT công việc, tách theo đơn vị (mã). Mỗi đơn vị một dòng — không cộng hai thang. */
export function tongMeTheoDonVi(batch: LenhSxSanLuongBatch[]): TongDonVi[] {
  const theo = new Map<string, TongDonVi>();
  for (const b of batch) {
    const k = b.don_vi ?? "";
    const t = theo.get(k) ?? { don_vi: b.don_vi, tot: 0, hong: 0 };
    t.tot += b.tot;
    t.hong += b.hong;
    theo.set(k, t);
  }
  return [...theo.values()];
}

/** "480 tờ" — số kèm TÊN đơn vị (không bày mã). */
export function soDv(v: number, dv: string | null): string {
  return dv ? `${so(v)} ${nhanDonVi(dv)}` : so(v);
}
```

`frontend/src/pages/LsxHoSoCongDoan.tsx`:

```tsx
// Mục "Công đoạn" của hồ sơ một lệnh (đặc tả 4.2): MỘT bảng từ `routing.nodes` thay cho ba khối cũ
// (Công đoạn & routing, Tổ máy người, Sản lượng theo lượt ghi). Bấm một dòng có dữ liệu để mở dòng
// chi tiết: các mẻ, giao/rút người, đổi máy, sự cố của bước.
import { Fragment, useMemo, useState } from "react";

import type { LenhSxHoSoOut, LenhSxRoutingNode } from "../api/client";
import { ChipKhuon } from "../components/ChipBuoc";
import { Icon } from "../components/Icons";
import { ngayGio } from "./keHoachSxShared";
import {
  BangCuon,
  MUC_DO,
  Pill,
  TT_BUOC,
  Trong,
  pillMeta,
  so,
  soDv,
  soHoac,
  tongMeTheoDonVi,
} from "./lsxHoSoChung";
import { nhanChang } from "./lsxBuoc";

export function LsxHoSoCongDoan({ d }: { d: LenhSxHoSoOut }) {
  const nodes = d.routing.nodes;
  const [mo, setMo] = useState<Set<number>>(() => new Set());

  // Bước cùng `lop` chạy song song được — máy chủ đã sắp theo (lop, thu_tu).
  const demLop = useMemo(() => {
    const m = new Map<number, number>();
    for (const n of nodes) m.set(n.lop, (m.get(n.lop) ?? 0) + 1);
    return m;
  }, [nodes]);

  if (nodes.length === 0) {
    return <Trong>Lệnh chưa có bước công đoạn nào. Chuỗi công đoạn lập ở màn Kế hoạch sản xuất.</Trong>;
  }

  function bat(id: number) {
    setMo((cu) => {
      const moi = new Set(cu);
      if (moi.has(id)) moi.delete(id);
      else moi.add(id);
      return moi;
    });
  }

  return (
    <BangCuon>
      <table className="lsc-bang lhs-cd">
        <caption className="lsc-sr">Các bước công đoạn của lệnh</caption>
        <thead>
          <tr>
            <th scope="col">Bước</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Máy, người</th>
            <th scope="col">Kế hoạch</th>
            <th scope="col">Thực tế</th>
            <th scope="col" className="lsc-so">
              Tốt, hỏng
            </th>
            <th scope="col" className="lsc-so">
              Vào → ra
            </th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n, i) => {
            const cvId = n.cong_viec_id;
            const me = cvId == null ? [] : d.san_luong.batch.filter((b) => b.cong_viec_id === cvId);
            const suKien = cvId == null ? [] : d.nhan_luc.lich_su.filter((e) => e.cong_viec_id === cvId);
            const suCo = cvId == null ? [] : d.su_co.filter((s) => s.cong_viec_id === cvId);
            const coChiTiet = me.length > 0 || suKien.length > 0 || suCo.length > 0;
            const dangMo = coChiTiet && mo.has(n.id);
            return (
              <Fragment key={n.id}>
                <tr className={n.la_buoc_hien_tai ? "is-now" : undefined}>
                  <td>
                    <span className="lhs-cd__buoc">
                      {coChiTiet ? (
                        <button
                          type="button"
                          className="lhs-cd__mo"
                          aria-expanded={dangMo}
                          aria-controls={`lhs-cd-${n.id}`}
                          onClick={() => bat(n.id)}
                        >
                          <Icon name="chevron" size={13} className={dangMo ? "is-mo" : undefined} />
                          <span>
                            {i + 1}. {n.ten ?? "—"}
                          </span>
                        </button>
                      ) : (
                        <span className="lhs-cd__ten">
                          {i + 1}. {n.ten ?? "—"}
                        </span>
                      )}
                    </span>
                    <span className="lsc-cum lhs-cd__the">
                      {n.la_buoc_ghep && (
                        <span className="lsc-tag">
                          {n.bai_ghep_ma ? `Bài ghép ${n.bai_ghep_ma}` : "Bài ghép"}
                        </span>
                      )}
                      {(demLop.get(n.lop) ?? 0) > 1 && <span className="lsc-tag">Song song</span>}
                      <ChipKhuon
                        can_khuon={n.can_khuon}
                        khuon={{
                          ma: n.khuon_be_ma,
                          so_ke: n.khuon_be_so_ke,
                          tinh_trang: n.khuon_be_tinh_trang,
                          da_nhan: n.khuon_da_nhan,
                        }}
                      />
                    </span>
                  </td>
                  <td>
                    {n.trang_thai ? (
                      <Pill meta={pillMeta(TT_BUOC, n.trang_thai)} />
                    ) : (
                      <span className="lsc-phu">Chưa phát hành</span>
                    )}
                  </td>
                  <td>
                    <MayNguoi n={n} />
                  </td>
                  <td className="lhs-cd__gio">
                    {n.du_kien_bat_dau || n.du_kien_ket_thuc ? (
                      <>
                        {n.du_kien_bat_dau ? ngayGio(n.du_kien_bat_dau) : "—"}
                        <span className="lsc-phu">→ {n.du_kien_ket_thuc ? ngayGio(n.du_kien_ket_thuc) : "—"}</span>
                      </>
                    ) : (
                      <span className="lsc-phu">Chưa xếp lịch</span>
                    )}
                  </td>
                  <td className="lhs-cd__gio">
                    <ThucTe n={n} me={me} />
                  </td>
                  <td className="lsc-so">
                    {me.length === 0
                      ? "—"
                      : tongMeTheoDonVi(me).map((t) => (
                          <span key={t.don_vi ?? ""} className="lhs-cd__sl">
                            {soDv(t.tot, t.don_vi)}
                            {t.hong > 0 && <span className="lsc-phu">{so(t.hong)} hỏng</span>}
                          </span>
                        ))}
                  </td>
                  <td className="lsc-so">
                    {soHoac(n.so_luong_vao)} {nhanChang(n.don_vi_vao)} → {soHoac(n.so_luong_ra)}{" "}
                    {nhanChang(n.don_vi_ra)}
                  </td>
                </tr>
                {dangMo && (
                  <tr className="lhs-cd__ct" id={`lhs-cd-${n.id}`}>
                    <td colSpan={7}>
                      {n.la_buoc_ghep && (
                        <p className="lhs-ghichu">
                          Số trên dòng này là của cả ca in ghép, không riêng lệnh này.
                        </p>
                      )}
                      {me.length > 0 && (
                        <ul className="lhs-ds">
                          {me.map((b) => (
                            <li key={b.id}>
                              <span className="lhs-ds__luc">{b.ket_thuc ? ngayGio(b.ket_thuc) : "—"}</span>
                              <span>
                                Ghi {soDv(b.tot, b.don_vi)} tốt
                                {b.hong > 0 ? `, ${so(b.hong)} hỏng` : ""}
                                {b.mo_ta_loi ? `, lỗi: ${b.mo_ta_loi}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {suKien.length > 0 && (
                        <ul className="lhs-ds">
                          {suKien.map((e, k) => (
                            <li key={k}>
                              <span className="lhs-ds__luc">{ngayGio(e.luc)}</span>
                              <span>
                                {e.loai === "giao_nguoi"
                                  ? `Giao ${e.nguoi ?? "người"} vào bước`
                                  : e.loai === "rut_nguoi"
                                    ? `Rút ${e.nguoi ?? "người"} khỏi bước${e.ly_do ? `, lý do: ${e.ly_do}` : ""}`
                                    : `Đổi máy ${e.may_cu ?? "—"} → ${e.may_moi ?? "—"}${e.ly_do ? `, lý do: ${e.ly_do}` : ""}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {suCo.length > 0 && (
                        <ul className="lhs-ds">
                          {suCo.map((s) => (
                            <li key={s.id}>
                              <span className="lhs-ds__luc">{s.thoi_diem ? ngayGio(s.thoi_diem) : "—"}</span>
                              <span>
                                Sự cố {s.ma}
                                {s.bo_phan_hong ? `, ${s.bo_phan_hong}` : ""}
                                {s.muc_do ? `, mức ${MUC_DO[s.muc_do] ?? s.muc_do}` : ""}
                                {s.mo_ta ? `: ${s.mo_ta}` : ""}
                                {s.phieu ? `. Phiếu sửa ${s.phieu.ma}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </BangCuon>
  );
}

/** Máy hoặc tổ, hoặc thẻ Gia công ngoài + nhà gia công; kèm người. Bước máy chưa có máy ghi đỏ. */
function MayNguoi({ n }: { n: LenhSxRoutingNode }) {
  const ngoai = n.loai_buoc === "thue_ngoai";
  const thieuMay = n.loai_buoc === "may" && !n.may && n.trang_thai !== "completed";
  return (
    <span className="lhs-cd__may">
      {ngoai ? (
        <span className="lsc-cum">
          <span className="lsc-tag">Gia công ngoài</span>
          {n.nha_cung_cap ?? "Chưa chọn nhà gia công"}
        </span>
      ) : thieuMay ? (
        <span className="lsc-do">Chưa có máy</span>
      ) : (
        <span>{n.may ?? n.to ?? "—"}</span>
      )}
      {n.nguoi.length > 0 && <span className="lsc-phu">{n.nguoi.join(", ")}</span>}
    </span>
  );
}

/** Thực tế: mẻ đầu → hoàn thành (hoặc "đến nay"); chưa có mẻ nào thì "chưa bắt đầu". */
function ThucTe({ n, me }: { n: LenhSxRoutingNode; me: LenhSxHoSoOut["san_luong"]["batch"] }) {
  const dau = me
    .map((b) => b.bat_dau)
    .filter((v): v is string => !!v)
    .sort()[0];
  if (!dau) return <span className="lsc-phu">Chưa bắt đầu</span>;
  return (
    <>
      {ngayGio(dau)}
      <span className="lsc-phu">→ {n.hoan_thanh_luc ? ngayGio(n.hoan_thanh_luc) : "đến nay"}</span>
    </>
  );
}
```

`frontend/src/pages/LsxHoSoQuyCach.tsx`:

```tsx
// Mục "Quy cách" của hồ sơ một lệnh (đặc tả 4.2): 8 ô hiện sẵn, "Xem đủ thông số" mở 9 ô còn lại.
// Ô trống (`null`, chuỗi rỗng, số 0 máy chủ ép từ `None`) KHÔNG hiện — lưới chỉ bày cái đã khai.
import { useState } from "react";
import type { ReactNode } from "react";

import type { LenhSxThongSo, LenhSxThongTin } from "../api/client";
import { nhanCachIn, num } from "./keHoachSxShared";
import { Kv, LOAI_LENH, khoMm, so } from "./lsxHoSoChung";

type O = { k: string; v: ReactNode };

function coGiaTri(v: ReactNode): boolean {
  return v !== null && v !== undefined && v !== "" && v !== 0;
}

function soMau(a: number | null, b: number | null): string | null {
  if (!a && !b) return null;
  return b ? `${a ?? 0} + ${b}` : `${a}`;
}

function muc(a: string[], b: string[]): string | null {
  if (a.length === 0 && b.length === 0) return null;
  return b.length > 0 ? `Mặt trước ${a.join(", ") || "—"}; mặt sau ${b.join(", ")}` : a.join(", ");
}

export function LsxHoSoQuyCach({ ts, tt }: { ts: LenhSxThongSo; tt: LenhSxThongTin }) {
  const [du, setDu] = useState(false);

  const coBan: O[] = [
    { k: "Giấy", v: ts.giay_ten },
    { k: "Định lượng", v: ts.dinh_luong ? `${so(ts.dinh_luong)} g/m²` : null },
    { k: "Khổ tờ in", v: khoMm(ts.kho_in_dai, ts.kho_in_rong) },
    { k: "Cách in", v: nhanCachIn(ts.quy_cach_in) },
    { k: "Số màu", v: soMau(ts.so_mau_a, ts.so_mau_b) },
    { k: "Con trên tờ", v: ts.so_con || null },
    { k: "Số tờ in", v: ts.so_to_ke_hoach ? num(ts.so_to_ke_hoach) : null },
    { k: "Số kẽm", v: ts.so_kem },
  ];
  const them: O[] = [
    { k: "Khổ nguyên", v: khoMm(ts.kho_nguyen_dai, ts.kho_nguyen_rong) },
    { k: "Khổ thành phẩm", v: khoMm(ts.dai_thanh_pham, ts.rong_thanh_pham) },
    { k: "Mực", v: muc(ts.muc_a, ts.muc_b) },
    { k: "Số trang", v: ts.so_trang },
    { k: "Trang mỗi tay", v: ts.trang_moi_tay },
    { k: "Số mảnh xả", v: ts.so_manh_xa },
    { k: "Số tờ nguyên", v: ts.so_to_nguyen ? num(ts.so_to_nguyen) : null },
    { k: "Loại lệnh", v: tt.loai ? (LOAI_LENH[tt.loai] ?? tt.loai) : null },
    { k: "Người bán", v: tt.sale },
  ];
  const hien = (du ? [...coBan, ...them] : coBan).filter((o) => coGiaTri(o.v));
  const conAn = them.filter((o) => coGiaTri(o.v)).length;

  return (
    <>
      {hien.length === 0 ? (
        <p className="lhs-trong">Phiếu tính giá chưa khai thông số nào cho lệnh này.</p>
      ) : (
        <div className="lhs-kvs">
          {hien.map((o) => (
            <Kv key={o.k} k={o.k} v={o.v} />
          ))}
        </div>
      )}
      {conAn > 0 && (
        <button type="button" className="lsc-link lhs-xemdu" aria-expanded={du} onClick={() => setDu((v) => !v)}>
          {du ? "Thu gọn thông số" : `Xem đủ thông số (thêm ${conAn} ô)`}
        </button>
      )}
      {ts.ghi_chu_ky_thuat && (
        <p className="lhs-ghichu">
          <b>Ghi chú kỹ thuật:</b> {ts.ghi_chu_ky_thuat}
        </p>
      )}
      {tt.ghi_chu && (
        <p className="lhs-ghichu">
          <b>Ghi chú lệnh:</b> {tt.ghi_chu}
        </p>
      )}
    </>
  );
}
```

`frontend/src/pages/LsxHoSoVatTu.tsx`:

```tsx
// Mục "Vật tư" của hồ sơ một lệnh (đặc tả 4.2): MỘT bảng, ba nút lọc thay ba bảng. Giữ nguyên ba câu
// hỏi máy chủ đang trả lời, chỉ không bày một dòng ở hai bảng cùng lúc.
import { useState } from "react";

import type { LenhSxVatTu, LenhSxVatTuDong } from "../api/client";
import { BangCuon, Pill, VT_MAU, Trong, pillMeta, so, soHoac } from "./lsxHoSoChung";
import { nhanDonVi } from "./lsxBuoc";

type Loc = "hien_tai" | "sap_toi" | "da_cap";

const LOC: { key: Loc; label: string; rong: string }[] = [
  { key: "hien_tai", label: "Bước đang làm", rong: "Bước đang làm không cần vật tư nào theo bảng cân đối." },
  { key: "sap_toi", label: "Bước sắp tới đang thiếu", rong: "Không bước nào phía sau đang thiếu vật tư." },
  { key: "da_cap", label: "Kho đã cấp", rong: "Kho chưa xuất món nào cho lệnh này." },
];

function dongCua(vt: LenhSxVatTu, k: Loc): LenhSxVatTuDong[] {
  if (k === "hien_tai") return vt.hien_tai.dong;
  if (k === "sap_toi") return vt.canh_bao_sau;
  return vt.da_cap;
}

export function LsxHoSoVatTu({ vt }: { vt: LenhSxVatTu }) {
  // Mặc định chọn nút ĐẦU TIÊN có dòng.
  const [loc, setLoc] = useState<Loc>(() => LOC.find((l) => dongCua(vt, l.key).length > 0)?.key ?? "hien_tai");
  const dong = dongCua(vt, loc);
  const meta = LOC.find((l) => l.key === loc) ?? LOC[0];

  return (
    <>
      <div className="lhs-loc" role="group" aria-label="Lọc bảng vật tư">
        {LOC.map((l) => (
          <button
            key={l.key}
            type="button"
            className="lhs-chip"
            aria-pressed={loc === l.key}
            onClick={() => setLoc(l.key)}
          >
            {l.label} <span className="lhs-chip__n">{dongCua(vt, l.key).length}</span>
          </button>
        ))}
      </div>
      {dong.length === 0 ? (
        <Trong>{meta.rong}</Trong>
      ) : (
        <BangCuon>
          <table className="lsc-bang lhs-vt">
            <thead>
              <tr>
                <th scope="col">Mặt hàng</th>
                <th scope="col">Bước</th>
                <th scope="col" className="lsc-so">
                  Cần
                </th>
                <th scope="col" className="lsc-so">
                  Đã cấp
                </th>
                <th scope="col" className="lsc-so">
                  Thiếu
                </th>
                <th scope="col">Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {dong.map((v, i) => (
                <tr key={`${v.hang_loai}-${v.hang_id}-${v.buoc_id ?? "x"}-${i}`}>
                  <td>
                    {v.hang_ten ?? v.hang_ma ?? "—"}
                    {v.pham_vi === "bai_ghep" && (
                      <span className="lsc-phu">Của bài ghép {v.ma ?? ""}</span>
                    )}
                  </td>
                  <td>{v.ten_viec ?? "—"}</td>
                  <td className="lsc-so">
                    {v.nhu_cau_hien_thi ?? `${so(v.nhu_cau)} ${nhanDonVi(v.don_vi_goc)}`.trim()}
                  </td>
                  <td className="lsc-so">{soHoac(v.da_cap)}</td>
                  <td className="lsc-so">
                    {v.thieu != null && v.thieu > 0 ? <span className="lsc-do">{so(v.thieu)}</span> : "—"}
                  </td>
                  <td>
                    <Pill meta={pillMeta(VT_MAU, v.trang_thai)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </BangCuon>
      )}
    </>
  );
}
```

`frontend/src/pages/LsxHoSoSauSx.tsx`:

```tsx
// Mục "Sau sản xuất" của hồ sơ một lệnh (đặc tả 4.2): ba khung KCS lần cuối · Nhập kho · Giao hàng.
// Lô KCS giữa chuyền không hiện ở đây (đã có ở dòng mở ra của bước).
//
// Nút "Tạo yêu cầu giao hàng" là ĐIỀU HƯỚNG sang drawer đơn hàng (form đã có ở đó), không phải ghi.
import type { LenhSxHoSoOut } from "../api/client";
import { Button } from "../components/Button";
import { Icon } from "../components/Icons";
import { ngayGio } from "./keHoachSxShared";
import { KCS_KET_LUAN, KHO_YC_TT, NHIEU_DON_VI, Pill, Trong, pillMeta, so, soDv } from "./lsxHoSoChung";

export function LsxHoSoSauSx({
  d,
  choPhepLap,
  onMoDon,
}: {
  d: LenhSxHoSoOut;
  /** Người xem ghi được bên giao hàng (`giao_hang:create`). */
  choPhepLap: boolean;
  onMoDon?: (orderId: number) => void;
}) {
  const nhom = d.giao_hang.so_lenh_trong_nhom;
  const kcsCuoi = d.kcs.batch.filter((b) => b.la_kcs_cuoi);
  const gh = d.giao_hang;
  const chuaTinh = gh.hang.filter((h) => h.khong_tinh_duoc || h.so_toi_da == null);

  return (
    <div className="lhs-ba">
      <section className="lhs-o" aria-labelledby="lhs-kcs-h">
        <h4 className="lhs-o__h" id="lhs-kcs-h">
          KCS lần cuối
          {nhom > 1 && <span className="lsc-tag">Riêng lệnh này</span>}
        </h4>
        {kcsCuoi.length === 0 ? (
          <Trong>Chưa kiểm lần cuối.</Trong>
        ) : (
          <ul className="lhs-ds">
            {kcsCuoi.map((b) => (
              <li key={b.id}>
                <span className="lhs-ds__luc">{b.ket_thuc ? ngayGio(b.ket_thuc) : "—"}</span>
                <span className="lhs-ds__noi">
                  <span className="lsc-cum">
                    <Pill meta={pillMeta(KCS_KET_LUAN, b.ket_luan)} />
                    <span>
                      Nhận {soDv(b.so_luong_nhan, b.don_vi)}, đạt {so(b.so_luong_dat)}, không đạt{" "}
                      {so(b.so_luong_khong_dat)}
                    </span>
                  </span>
                  {b.ghi_chu && <span className="lsc-phu">{b.ghi_chu}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lhs-o" aria-labelledby="lhs-kho-h">
        <h4 className="lhs-o__h" id="lhs-kho-h">
          Nhập kho
          {d.kho.so_lenh_trong_nhom > 1 && (
            <span className="lsc-tag">Cả nhóm, {d.kho.so_lenh_trong_nhom} lệnh</span>
          )}
        </h4>
        {d.kho.yeu_cau.length === 0 ? (
          <Trong>Chưa đề nghị nhập kho.</Trong>
        ) : (
          <ul className="lhs-ds">
            {d.kho.yeu_cau.map((y) => (
              <li key={y.id}>
                <span className="lhs-ds__luc">{y.tao_luc ? ngayGio(y.tao_luc) : "—"}</span>
                <span className="lhs-ds__noi">
                  <span className="lsc-cum">
                    <b>{y.ma ?? "—"}</b>
                    <Pill meta={pillMeta(KHO_YC_TT, y.trang_thai)} />
                  </span>
                  <span className="lsc-phu">
                    Đề nghị {soDv(y.so_luong_yeu_cau, y.don_vi)}, kho đã nhận {so(y.so_luong_xac_nhan)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lhs-o" aria-labelledby="lhs-gh-h">
        <h4 className="lhs-o__h" id="lhs-gh-h">
          Giao hàng
          {nhom > 1 && <span className="lsc-tag">Cả nhóm, {nhom} lệnh</span>}
        </h4>
        <div className="lhs-o__b">
          <p className="lhs-o__so">
            {gh.don_vi_lech ? (
              NHIEU_DON_VI
            ) : (
              <>
                Đã nhập kho <b>{so(gh.da_nhap_kho)}</b>, đã giao <b>{so(gh.da_giao)}</b>
              </>
            )}
          </p>
          {gh.hang.length === 0 ? (
            <Trong>
              {gh.nhom_id == null
                ? "Lệnh chưa vào nhóm thành phẩm nào nên chưa có gì trong kho để giao."
                : "Kho chưa nhận lô thành phẩm nào của nhóm này."}
            </Trong>
          ) : (
            <ul className="lhs-ds">
              {gh.hang.map((h) => (
                <li key={`${h.hang_id}-${h.kho_id ?? "x"}`}>
                  <span className="lhs-ds__luc">{h.kho_ten ?? "—"}</span>
                  <span className="lhs-ds__noi">
                    <span>
                      Tồn {soDv(h.so_luong, h.don_vi)}, còn giao được{" "}
                      {h.khong_tinh_duoc || h.so_toi_da == null ? "chưa tính được" : so(h.so_toi_da)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {chuaTinh.length > 0 && (
            <p className="lhs-canh" role="note">
              <Icon name="alert" size={13} /> Có dòng chưa tính được số còn giao: tự đối chiếu kho trước khi
              lập phiếu.
            </p>
          )}
          {gh.co_the_giao && choPhepLap && gh.order_id != null && onMoDon && (
            <Button variant="secondary" onClick={() => onMoDon(gh.order_id as number)}>
              <Icon name="truck" size={14} /> Tạo yêu cầu giao hàng
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
```

`frontend/src/pages/LsxHoSoNhatKy.tsx`:

```tsx
// Mục "Nhật ký" của hồ sơ một lệnh (đặc tả 4.2): `timeline` của máy chủ, MỚI NHẤT ở trên, có nút lọc.
// "Sản lượng, KCS" mặc định TẮT — hai loại này đã có bảng ở Công đoạn và Sau sản xuất.
import { useMemo, useState } from "react";

import type { LenhSxHoSoOut } from "../api/client";
import { ngayGio } from "./keHoachSxShared";
import { Kv, Trong } from "./lsxHoSoChung";

type Loc = "tat_ca" | "phat_hanh" | "chay" | "nguoi_may" | "su_co" | "kho";

/** Loại sự kiện của mỗi nút. Loại lạ (máy chủ thêm sau) chỉ hiện ở "Tất cả". */
const LOC: { key: Loc; label: string; loai: string[] }[] = [
  { key: "tat_ca", label: "Tất cả", loai: [] },
  { key: "phat_hanh", label: "Phát hành, đóng lệnh", loai: ["phat_hanh"] },
  { key: "chay", label: "Chạy máy", loai: ["bat_dau", "tam_dung", "ket_thuc", "dung"] },
  { key: "nguoi_may", label: "Người, máy", loai: ["giao_nguoi", "rut_nguoi", "doi_may"] },
  { key: "su_co", label: "Sự cố", loai: ["su_co"] },
  { key: "kho", label: "Kho", loai: ["de_nghi_nhap_kho", "kho_nhan"] },
];
const SL_KCS = ["san_luong", "kcs"];

export function LsxHoSoNhatKy({ d }: { d: LenhSxHoSoOut }) {
  const [loc, setLoc] = useState<Loc>("tat_ca");
  const [slKcs, setSlKcs] = useState(false);

  // Máy chủ trả cũ nhất trước; đảo một lần.
  const moiTruoc = useMemo(() => [...d.timeline].reverse(), [d.timeline]);
  const loai = LOC.find((l) => l.key === loc)?.loai ?? [];
  const hien = moiTruoc.filter((e) => {
    // Nút bật thêm hai loại này vào BẤT KỲ nút lọc nào đang chọn.
    if (SL_KCS.includes(e.loai)) return slKcs;
    return loc === "tat_ca" || loai.includes(e.loai);
  });

  return (
    <>
      <div className="lhs-kvs lhs-kvs--hai">
        <Kv k="Tạo lệnh lúc" v={d.thong_tin.tao_luc ? ngayGio(d.thong_tin.tao_luc) : null} />
        <Kv k="Bàn giao lúc" v={d.thong_tin.ban_giao_at ? ngayGio(d.thong_tin.ban_giao_at) : null} />
      </div>
      <div className="lhs-loc" role="group" aria-label="Lọc nhật ký">
        {LOC.map((l) => (
          <button
            key={l.key}
            type="button"
            className="lhs-chip"
            aria-pressed={loc === l.key}
            onClick={() => setLoc(l.key)}
          >
            {l.label}
          </button>
        ))}
        <button
          type="button"
          className="lhs-bat"
          aria-pressed={slKcs}
          onClick={() => setSlKcs((v) => !v)}
          title="Sản lượng và KCS đã có bảng riêng ở mục Công đoạn và Sau sản xuất"
        >
          Sản lượng, KCS
        </button>
      </div>
      {d.timeline.length === 0 ? (
        <Trong>Chưa có sự kiện nào, lệnh chưa được phát hành xuống xưởng.</Trong>
      ) : hien.length === 0 ? (
        <Trong>Không có sự kiện nào thuộc loại đang lọc.</Trong>
      ) : (
        <ol className="lhs-nk">
          {hien.map((e, i) => (
            <li key={i}>
              <span className="lhs-ds__luc">{ngayGio(e.luc)}</span>
              <span className="lhs-nk__nguoi">{e.nguoi ?? "—"}</span>
              <span>{e.noi_dung}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
```

`frontend/src/pages/LenhSxHoSoView.tsx`:

```tsx
// Hồ sơ MỘT lệnh sản xuất — lớp phủ CHỈ ĐỌC, mở từ Hồ sơ lệnh lẫn Theo dõi sản xuất (làm gọn
// 05/10/2026, đặc tả mục 4.2). Phần đầu: định danh, thẻ nhỏ, dòng cảnh báo có việc cụ thể, ba ô
// tổng quan, hàng neo năm mục. Thân: Công đoạn · Quy cách · Vật tư · Sau sản xuất · Nhật ký.
//
// ⚠️ KHÔNG MỘT NÚT GHI NÀO; KHÔNG MỘT SỐ TIỀN NÀO. Thứ đi RA khỏi màn chỉ có: liên kết sang đơn
// hàng bán, nút In phiếu công nghệ (đọc ra một tờ giấy, không tăng phiên bản).
//
// Khung trả về của máy chủ vẫn 13 khối (phiếu công nghệ dùng chung); gọn là việc của màn này.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, api } from "../api/client";
import type { LenhSxHoSoOut } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { useCan } from "../auth/permissions";
import { Button } from "../components/Button";
import { EmptyState as EmptyStateChung } from "../components/EmptyState";
import { Icon } from "../components/Icons";
import { BangLoi, EmptyState, ngay, ngayGio, num } from "./keHoachSxShared";
import { LsxHoSoCongDoan } from "./LsxHoSoCongDoan";
import { LsxHoSoNhatKy } from "./LsxHoSoNhatKy";
import { LsxHoSoQuyCach } from "./LsxHoSoQuyCach";
import { LsxHoSoSauSx } from "./LsxHoSoSauSx";
import { LsxHoSoVatTu } from "./LsxHoSoVatTu";
import { ngayNgan, soNgayTre } from "./lsxHoSoChung";
import { PillKhau, TheDaDong, TheGap, nhanKhau } from "./lsxKhau";
import { useNapTenDonVi } from "./tenDonVi";
import "./ke-hoach-sx.css";
import "./lenh-sx-chung.css";
import "./lenh-sx-ho-so.css";

const MUC: { id: string; ten: string }[] = [
  { id: "cong-doan", ten: "Công đoạn" },
  { id: "quy-cach", ten: "Quy cách" },
  { id: "vat-tu", ten: "Vật tư" },
  { id: "sau-sx", ten: "Sau sản xuất" },
  { id: "nhat-ky", ten: "Nhật ký" },
];

export function LenhSxHoSoView({
  lsxId,
  pv,
  onClose,
  onMoDon,
  eventTick,
}: {
  lsxId: number;
  /** Phiên bản in trên tờ giấy đã quét (deep link `#lsx=&pv=`). Nhỏ hơn phiên bản hiện tại ⇒ băng
   *  cảnh báo; nội dung màn KHÔNG đổi theo `pv`. Mở tay từ bảng thì `null`. */
  pv?: number | null;
  onClose: () => void;
  /** Sang màn Đơn hàng bán, mở drawer của đơn (form tạo yêu cầu giao hàng nằm ở đó). */
  onMoDon?: (orderId: number) => void;
  /** Nhịp SSE ĐÃ GỘP của màn mẹ — hồ sơ tươi cùng nhịp với bảng phía sau. */
  eventTick?: number;
}) {
  const { token } = useAuth();
  const can = useCan();
  useNapTenDonVi();
  const [d, setD] = useState<LenhSxHoSoOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<{ text: string; thuLaiDuoc: boolean } | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api.lenhSanXuat
      .hoSo(token, lsxId)
      .then((r) => {
        setD(r);
        setLoi(null);
      })
      .catch((e) => {
        const st = e instanceof ApiError ? e.status : 0;
        setLoi({
          text:
            st === 403
              ? "Lệnh này nằm ngoài phạm vi của bạn."
              : st === 404
                ? "Không tìm thấy lệnh này trong danh sách lệnh đã phát hành."
                : e instanceof ApiError
                  ? e.message
                  : "Máy chủ không phản hồi.",
          thuLaiDuoc: st !== 403 && st !== 404,
        });
      })
      .finally(() => setLoading(false));
  }, [token, lsxId]);

  // `lsxId` đổi khi lớp phủ vẫn mở ⇒ xoá hồ sơ cũ TRƯỚC, để không bày mã lệnh cũ trong lúc chờ.
  useEffect(() => {
    setD(null);
    setLoi(null);
  }, [lsxId]);
  useEffect(() => {
    load();
  }, [load]);

  // Tươi theo nhịp đã gộp; giữ nội dung cũ tới khi lượt mới về (không chớp khung xám).
  const tickDau = useRef(eventTick ?? 0);
  useEffect(() => {
    const t = eventTick ?? 0;
    if (t === tickDau.current) return;
    tickDau.current = t;
    load();
  }, [eventTick, load]);

  const dongRef = useRef(onClose);
  dongRef.current = onClose;
  // Esc đóng + khoá cuộn nền trong lúc lớp phủ mở.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") dongRef.current();
    };
    document.addEventListener("keydown", f);
    const cuonCu = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", f);
      document.body.style.overflow = cuonCu;
    };
  }, []);

  const quayLaiRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    quayLaiRef.current?.focus();
  }, [lsxId]);

  // --- in phiếu công nghệ ----------------------------------------------------------------------
  const [dangIn, setDangIn] = useState(false);
  const [inLoi, setInLoi] = useState<string | null>(null);
  async function inPhieu() {
    if (!token || dangIn) return;
    setDangIn(true);
    setInLoi(null);
    try {
      // Endpoint đòi Bearer ⇒ kéo blob rồi mới mở.
      const url = await api.lenhSanXuat.phieuCongNghePdf(token, lsxId);
      const w = window.open(url, "_blank");
      if (!w) {
        URL.revokeObjectURL(url);
        setInLoi("Trình duyệt đã chặn cửa sổ mới. Cho phép mở cửa sổ cho trang này rồi bấm lại.");
        return;
      }
      try {
        w.opener = null;
      } catch {
        /* cùng gốc thì không rơi vào đây */
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      const st = e instanceof ApiError ? e.status : 0;
      setInLoi(
        st === 403
          ? "Bạn không có quyền in phiếu của lệnh này."
          : st === 404
            ? "Không tìm thấy lệnh sản xuất này, có thể lệnh không còn ở trạng thái đã phát hành."
            : "Không in được phiếu công nghệ. Thử lại sau.",
      );
    } finally {
      setDangIn(false);
    }
  }

  // --- neo năm mục: cuộn trong thân lớp phủ ----------------------------------------------------
  const thanRef = useRef<HTMLDivElement | null>(null);
  function toiMuc(id: string) {
    thanRef.current?.querySelector<HTMLElement>(`#lhs-muc-${id}`)?.scrollIntoView({ block: "start" });
  }

  const tt = d?.thong_tin;
  const td = d?.tien_do;

  // "bước i trên n" đếm từ routing (máy chủ đã sắp).
  const buoc = useMemo(() => {
    const nodes = d?.routing.nodes ?? [];
    const i = nodes.findIndex((n) => n.la_buoc_hien_tai);
    return i >= 0 ? `bước ${i + 1} trên ${nodes.length}` : null;
  }, [d]);

  // Dòng cảnh báo — mỗi cờ đang bật một dòng có việc cụ thể (thứ tự `CO_CANH_BAO`).
  const suCoMo = d?.su_co.filter((s) => s.trang_thai === "cho_tiep_nhan") ?? [];
  const suCoDangSua =
    d?.su_co.filter(
      (s) => s.trang_thai === "da_tao_phieu" && s.phieu && s.phieu.trang_thai !== "da_sua_xong",
    ) ?? [];
  const kcsHong = td?.canh_bao.includes("kcs_khong_dat")
    ? (d?.kcs.batch.filter((b) => b.ket_luan === "khong_dat") ?? [])
    : [];
  const soThieu = useMemo(() => {
    if (!d || !d.tien_do.canh_bao.includes("thieu_vat_tu")) return 0;
    const k = new Set<string>();
    for (const v of [...d.vat_tu.hien_tai.dong, ...d.vat_tu.canh_bao_sau]) {
      if ((v.thieu ?? 0) > 0) k.add(`${v.hang_loai}-${v.hang_id}`);
    }
    return Math.max(k.size, 1);
  }, [d]);

  const nhanTrenNen = useRef(false);
  const xongSx = td ? td.khau !== "dang_sx" : false;
  const pct = td ? Math.max(0, Math.min(100, Math.round(td.phan_tram))) : 0;
  const tamDung = !!td?.canh_bao.includes("tam_dung");
  const tre = td && tt && !xongSx ? soNgayTre(td.du_kien_xong, tt.han_hoan_thanh_sx) : null;

  return (
    <div
      className="lhs"
      onMouseDown={(e) => {
        nhanTrenNen.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || !nhanTrenNen.current) return;
        onClose();
      }}
    >
      <section className="lhs__panel" role="dialog" aria-modal="true" aria-labelledby="lhs-title">
        <div className="lhs__cuon" ref={thanRef}>
          <header className="lhs__dau">
            <div className="lhs__hang">
              <button type="button" ref={quayLaiRef} className="lhs__lui" onClick={onClose}>
                <Icon name="chevron" size={15} />
                Quay lại danh sách
              </button>
              <h2 className="lhs__ma" id="lhs-title">
                {tt?.ma ?? `Lệnh #${lsxId}`}
              </h2>
              {td && <PillKhau khau={td.khau} ct={td.khau_chi_tiet} />}
              {tt?.da_dong && <TheDaDong />}
              {tt?.is_rush && <TheGap />}
              {tt && <span className="lhs__ten">{tt.ten ?? "Chưa đặt tên"}</span>}
              <span className="lsc-spacer" />
              <Button variant="secondary" onClick={inPhieu} disabled={dangIn || !token}>
                <Icon name="printer" size={14} /> {dangIn ? "Đang dựng phiếu…" : "In phiếu công nghệ"}
              </Button>
            </div>
            {inLoi && (
              <p className="lhs__inloi" role="alert">
                <Icon name="alert" size={14} /> {inLoi}
              </p>
            )}

            {d && tt && (
              <div className="lhs__the">
                <span className="lhs-the">
                  <span className="lhs-the__k">Khách</span>
                  {tt.khach_hang ?? "—"}
                </span>
                <span className="lhs-the">
                  <span className="lhs-the__k">Đơn</span>
                  {tt.order_no && tt.order_id != null && onMoDon ? (
                    <button type="button" className="lsc-link" onClick={() => onMoDon(tt.order_id as number)}>
                      {tt.order_no}
                    </button>
                  ) : (
                    (tt.order_no ?? "—")
                  )}
                </span>
                <span className="lhs-the">
                  <span className="lhs-the__k">Phiên bản</span>
                  {d.phien_ban == null ? "Chưa phát hành" : d.phien_ban}
                </span>
                {tt.nhom_ten && (
                  <span className="lhs-the">
                    <span className="lhs-the__k">Nhóm</span>
                    {tt.nhom_ten}
                    {d.giao_hang.so_lenh_trong_nhom > 1 && (
                      <span className="lsc-phu lhs-the__phu">{d.giao_hang.so_lenh_trong_nhom} lệnh</span>
                    )}
                  </span>
                )}
              </div>
            )}

            {d && pv != null && d.phien_ban != null && pv < d.phien_ban && (
              <div className="banner banner--warn lhs__pv" role="status">
                Phiếu giấy v{pv}, lệnh hiện tại đã là v{d.phien_ban}
              </div>
            )}

            {d && (suCoMo.length > 0 || suCoDangSua.length > 0 || kcsHong.length > 0 || soThieu > 0) && (
              <ul className="lhs-canhbao" aria-label="Cảnh báo của lệnh">
                {suCoMo.map((s) => (
                  <li key={s.id} className="lhs-canhbao__do">
                    <b>Sự cố {s.ma}</b>
                    <span>
                      {[s.may, s.bo_phan_hong].filter(Boolean).join(", ") || "—"}
                      {s.mo_ta ? `: ${s.mo_ta}` : ""}
                    </span>
                    <span className="lsc-phu">từ {s.thoi_diem ? ngayGio(s.thoi_diem) : "—"}</span>
                    {s.may_dung && <span className="lsc-tag">Máy dừng</span>}
                  </li>
                ))}
                {suCoDangSua.map((s) => (
                  <li key={s.id} className="lhs-canhbao__vang">
                    <b>Sự cố {s.ma}</b>
                    <span>Đang sửa, phiếu {s.phieu?.ma}</span>
                    {s.may && <span className="lsc-phu">{s.may}</span>}
                  </li>
                ))}
                {kcsHong.map((b) => (
                  <li key={b.id} className="lhs-canhbao__do">
                    <b>KCS không đạt</b>
                    <span>Lô của bước {b.ten_viec ?? "—"}</span>
                    <span className="lsc-phu">{b.ket_thuc ? ngayGio(b.ket_thuc) : "—"}</span>
                  </li>
                ))}
                {soThieu > 0 && (
                  <li className="lhs-canhbao__do">
                    <b>Thiếu vật tư</b>
                    <span>{soThieu} mặt hàng đang thiếu</span>
                    <button type="button" className="lsc-link" onClick={() => toiMuc("vat-tu")}>
                      Xem mục Vật tư
                    </button>
                  </li>
                )}
              </ul>
            )}

            {d && tt && td && (
              <div className="lhs-tong" aria-label="Tổng quan lệnh">
                <div className="lhs-tong__o">
                  <span className="lhs-tong__k">Tiến độ</span>
                  {xongSx ? (
                    <>
                      <span className="lhs-tong__v">{nhanKhau(td.khau, td.khau_chi_tiet)}</span>
                      <span className="lsc-phu">Đã xong sản xuất</span>
                    </>
                  ) : (
                    <>
                      <span className="lhs-tong__v">
                        {td.buoc_hien_tai ?? "Chưa bắt đầu"}
                        {buoc && <span className="lsc-phu lhs-tong__phu">{buoc}</span>}
                      </span>
                      <span
                        className={`lsc-thanh${tamDung ? " lsc-thanh--do" : ""}`}
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuetext={`${pct} phần trăm${td.uoc_tinh ? ", ước tính" : ""}`}
                      >
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      <span className="lsc-phu">
                        {pct}%{" "}
                        {td.uoc_tinh
                          ? "ước theo thời lượng kế hoạch vì chưa ghi sản lượng"
                          : "đo theo sản lượng đã ghi"}
                      </span>
                    </>
                  )}
                </div>
                <div className="lhs-tong__o">
                  <span className="lhs-tong__k">Hạn xong sản xuất</span>
                  <span className="lhs-tong__v">{ngay(tt.han_hoan_thanh_sx)}</span>
                  {xongSx ? (
                    <span className="lsc-phu">Đã xong sản xuất</span>
                  ) : !td.du_kien_xong ? (
                    <span className="lsc-phu">Chưa đủ dữ liệu để dự kiến</span>
                  ) : tre !== null && tre > 0 ? (
                    <span className="lsc-do">
                      Dự kiến xong {ngayNgan(td.du_kien_xong)}, trễ {tre} ngày
                    </span>
                  ) : (
                    <span className="lsc-phu">Dự kiến xong {ngayNgan(td.du_kien_xong)}, kịp</span>
                  )}
                </div>
                <div className="lhs-tong__o">
                  <span className="lhs-tong__k">Đã giao khách</span>
                  <span className="lhs-tong__v">
                    {num(td.da_giao)} trên {num(tt.so_luong_dat)} {tt.don_vi_tinh ?? ""}
                  </span>
                  <span className="lsc-phu">Hạn giao khách {ngay(tt.han_giao_khach)}</span>
                </div>
              </div>
            )}

            {d && (
              <nav className="lhs-neo" aria-label="Các mục của hồ sơ">
                {MUC.map((m) => (
                  <button key={m.id} type="button" className="lhs-chip" onClick={() => toiMuc(m.id)}>
                    {m.ten}
                  </button>
                ))}
              </nav>
            )}
          </header>

          <div className="lhs__than">
            {loading && !d ? (
              <EmptyStateChung trangThai="dang-tai" inline nhanTai="Đang tải hồ sơ lệnh…" />
            ) : loi && !d ? (
              <EmptyState
                icon="alert"
                title={loi.text}
                sub={loi.thuLaiDuoc ? undefined : "Danh sách phía sau vẫn còn nguyên, quay lại và chọn lệnh khác."}
                action={
                  loi.thuLaiDuoc ? (
                    <Button variant="ghost" onClick={load}>
                      Thử lại
                    </Button>
                  ) : undefined
                }
              />
            ) : d && tt ? (
              <>
                {loi && <BangLoi text="Không làm mới được hồ sơ." onRetry={load} />}
                <section className="lhs-muc" id="lhs-muc-cong-doan" aria-labelledby="lhs-h-cong-doan">
                  <h3 id="lhs-h-cong-doan">Công đoạn</h3>
                  <LsxHoSoCongDoan d={d} />
                </section>
                <section className="lhs-muc" id="lhs-muc-quy-cach" aria-labelledby="lhs-h-quy-cach">
                  <h3 id="lhs-h-quy-cach">Quy cách</h3>
                  <LsxHoSoQuyCach ts={d.thong_so} tt={tt} />
                </section>
                <section className="lhs-muc" id="lhs-muc-vat-tu" aria-labelledby="lhs-h-vat-tu">
                  <h3 id="lhs-h-vat-tu">Vật tư</h3>
                  <LsxHoSoVatTu vt={d.vat_tu} />
                </section>
                <section className="lhs-muc" id="lhs-muc-sau-sx" aria-labelledby="lhs-h-sau-sx">
                  <h3 id="lhs-h-sau-sx">Sau sản xuất</h3>
                  <LsxHoSoSauSx d={d} choPhepLap={can("giao_hang", "create")} onMoDon={onMoDon} />
                </section>
                <section className="lhs-muc" id="lhs-muc-nhat-ky" aria-labelledby="lhs-h-nhat-ky">
                  <h3 id="lhs-h-nhat-ky">Nhật ký</h3>
                  <LsxHoSoNhatKy d={d} />
                </section>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
```

`frontend/src/pages/lenh-sx-ho-so.css`:

```css
/* Khung hồ sơ MỘT lệnh (làm gọn 05/10/2026). Tiền tố `lhs-`. Pill, thẻ, bảng mượn
   `lenh-sx-chung.css` (`lsc-*`). Chỉ token của `styles/tokens.css`. */

.lhs {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
  /* Tấm che: độ mờ của lớp phủ, không phải màu của bảng màu. */
  background: rgba(13, 12, 10, 0.48);
  font-family: var(--ff-sans);
  color: var(--ink);
}

.lhs__panel {
  width: min(1180px, 100%);
  height: 100%;
  min-width: 0;
  background: var(--paper);
  border-left: 1px solid var(--rule);
  box-shadow: var(--shadow-lg);
  animation: lhs-vao var(--duration-enter) var(--easing-standard);
}
@keyframes lhs-vao {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: none; opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .lhs__panel { animation: none; }
}

.lhs :focus-visible {
  outline: 2px solid var(--rust);
  outline-offset: 2px;
}

/* Cả panel cuộn một khối; phần đầu dính trên cùng ở màn rộng. */
.lhs__cuon {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.lhs__dau {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5) var(--sp-3);
  background: var(--paper);
  border-bottom: 1px solid var(--rule);
  min-width: 0;
}

.lhs__hang {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
  min-width: 0;
}

.lhs__lui {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-2);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  background: var(--canvas);
  color: var(--ink);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  cursor: pointer;
}
.lhs__lui:hover {
  background: var(--rule-hair);
}
.lhs__lui svg {
  transform: rotate(90deg);
}

.lhs__ma {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
  white-space: nowrap;
}
.lhs__ten {
  min-width: 0;
  color: var(--ash);
  font-size: var(--fs-md);
  overflow-wrap: anywhere;
}

.lhs__inloi {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  margin: 0;
  color: var(--signal);
  font-size: var(--fs-xs);
}

/* Thẻ nhỏ: nhãn + giá trị, cách nhau bằng khoảng trống — không nối bằng dấu chấm giữa. */
.lhs__the {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.lhs-the {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 10px;
  border: 1px solid var(--rule-soft);
  border-radius: var(--r-3);
  background: var(--canvas);
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
}
.lhs-the__k {
  color: var(--ash-2);
  font-size: var(--fs-2xs);
  font-weight: var(--fw-bold);
}
.lhs-the__phu {
  display: inline;
  font-weight: var(--fw-regular);
}

.lhs__pv {
  margin: 0;
}

/* Dòng cảnh báo: mỗi cờ một dòng có việc cụ thể. Đỏ = cần xử; vàng = đang có người xử. */
.lhs-canhbao {
  display: grid;
  gap: var(--sp-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.lhs-canhbao li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1) var(--sp-2);
  padding: 7px var(--sp-3);
  border: 1px solid var(--signal);
  border-radius: var(--r-5);
  background: var(--canvas);
  font-size: var(--fs-sm);
}
.lhs-canhbao li b {
  color: var(--signal);
}
.lhs-canhbao .lhs-canhbao__vang {
  border-color: var(--amber);
}
.lhs-canhbao .lhs-canhbao__vang b {
  color: var(--amber-deep);
}

/* Ba ô tổng quan. */
.lhs-tong {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--rule);
  border-radius: var(--r-5);
  background: var(--canvas);
}
.lhs-tong__o {
  display: grid;
  align-content: start;
  gap: 4px;
  min-width: 0;
  padding: var(--sp-3) var(--sp-4);
}
.lhs-tong__o + .lhs-tong__o {
  border-left: 1px solid var(--rule-hair);
}
.lhs-tong__k {
  color: var(--ash-2);
  font-size: var(--fs-2xs);
  font-weight: var(--fw-bold);
}
.lhs-tong__v {
  font-size: var(--fs-lg);
  font-weight: var(--fw-bold);
  overflow-wrap: anywhere;
}
.lhs-tong__phu {
  display: inline;
  margin-left: var(--sp-2);
  font-weight: var(--fw-regular);
}

/* Hàng neo + nút lọc dạng chip (dùng chung trong thân). */
.lhs-neo,
.lhs-loc {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.lhs-chip,
.lhs-bat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--rule);
  border-radius: var(--r-pill);
  background: var(--canvas);
  color: var(--ink);
  font: inherit;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  white-space: nowrap;
  cursor: pointer;
}
.lhs-chip:hover,
.lhs-bat:hover {
  background: var(--rule-hair);
  border-color: var(--ash-2);
}
.lhs-chip[aria-pressed="true"] {
  background: var(--charcoal);
  border-color: var(--charcoal);
  color: var(--on-charcoal);
}
.lhs-chip__n {
  font-size: var(--fs-2xs);
}
.lhs-bat {
  margin-left: auto;
}
.lhs-bat[aria-pressed="true"] {
  background: var(--rust);
  border-color: var(--rust);
  color: var(--canvas);
}

/* ---------- thân ---------- */
.lhs__than {
  display: grid;
  gap: var(--sp-5);
  padding: var(--sp-4) var(--sp-5) var(--sp-8);
  min-width: 0;
}
.lhs-muc {
  display: grid;
  gap: var(--sp-3);
  min-width: 0;
  scroll-margin-top: var(--sp-3);
}
.lhs-muc > h3 {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: var(--fw-bold);
}

.lhs-bangwrap {
  overflow-x: auto;
  border: 1px solid var(--rule);
  border-radius: var(--r-5);
  background: var(--canvas);
}
.lhs-bangwrap .lsc-bang {
  min-width: 860px;
}

.lhs-trong {
  margin: 0;
  padding: var(--sp-3) var(--sp-4);
  border: 1px dashed var(--rule);
  border-radius: var(--r-5);
  color: var(--ash);
  font-size: var(--fs-sm);
}
.lhs-ghichu {
  margin: 0;
  color: var(--ash);
  font-size: var(--fs-sm);
}

/* Lưới nhãn — giá trị (Quy cách, Nhật ký). */
.lhs-kvs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--rule);
  border-radius: var(--r-5);
  background: var(--canvas);
}
.lhs-kvs--hai {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.lhs-kv {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 10px 14px;
  border-bottom: 1px solid var(--rule-hair);
}
.lhs-kv__k {
  color: var(--ash-2);
  font-size: var(--fs-2xs);
  font-weight: var(--fw-bold);
}
.lhs-kv__v {
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  overflow-wrap: anywhere;
}
.lhs-xemdu {
  justify-self: start;
}

/* Bảng công đoạn. */
.lhs-cd tr.is-now td {
  background: var(--rule-hair);
}
.lhs-cd__buoc {
  display: block;
}
.lhs-cd__mo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  font-weight: var(--fw-bold);
  text-align: left;
  cursor: pointer;
}
.lhs-cd__mo svg {
  flex: none;
  transform: rotate(-90deg);
  transition: transform var(--duration-fast) var(--easing-standard);
}
.lhs-cd__mo svg.is-mo {
  transform: none;
}
.lhs-cd__ten {
  font-weight: var(--fw-bold);
}
.lhs-cd__the {
  margin-top: 4px;
}
.lhs-cd__may {
  display: grid;
  gap: 2px;
}
.lhs-cd__gio {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.lhs-cd__sl {
  display: block;
}
.lhs-cd__ct td {
  background: var(--paper);
}
.lhs-cd__ct:hover td {
  background: var(--paper) !important;
}

/* Danh sách hai cột "lúc — nội dung" (dòng mở ra, Sau sản xuất). */
.lhs-ds {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--fs-sm);
}
.lhs-ds + .lhs-ds {
  margin-top: var(--sp-2);
}
.lhs-ds li {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: var(--sp-3);
}
.lhs-ds__luc {
  color: var(--ash-2);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.lhs-ds__noi {
  display: grid;
  gap: 2px;
  min-width: 0;
}

/* Ba khung Sau sản xuất. */
.lhs-ba {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-3);
}
.lhs-o {
  display: grid;
  align-content: start;
  min-width: 0;
  border: 1px solid var(--rule);
  border-radius: var(--r-5);
  background: var(--canvas);
}
.lhs-o__h {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  margin: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--rule-hair);
  font-size: var(--fs-sm);
}
.lhs-o > .lhs-ds,
.lhs-o > .lhs-trong,
.lhs-o__b {
  margin: var(--sp-3);
}
.lhs-o > .lhs-trong {
  border: 0;
  padding: 0;
}
.lhs-o__b {
  display: grid;
  gap: var(--sp-2);
  justify-items: start;
}
.lhs-o__b .lhs-trong {
  border: 0;
  padding: 0;
}
.lhs-o__so {
  margin: 0;
  font-size: var(--fs-sm);
}
.lhs-canh {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  color: var(--amber-deep);
  font-size: var(--fs-xs);
}

/* Nhật ký. */
.lhs-nk {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-5);
  background: var(--canvas);
}
.lhs-nk li {
  display: grid;
  grid-template-columns: 128px 140px minmax(0, 1fr);
  gap: var(--sp-3);
  padding: 9px 12px;
  border-bottom: 1px solid var(--rule-hair);
  font-size: var(--fs-sm);
}
.lhs-nk li:last-child {
  border-bottom: 0;
}
.lhs-nk__nguoi {
  color: var(--ash);
  overflow-wrap: anywhere;
}

/* ---------- màn hẹp ---------- */
@media (max-width: 860px) {
  .lhs-tong,
  .lhs-ba {
    grid-template-columns: minmax(0, 1fr);
  }
  .lhs-tong__o + .lhs-tong__o {
    border-left: 0;
    border-top: 1px solid var(--rule-hair);
  }
  .lhs-kvs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .lhs__dau {
    position: static;
    padding: var(--sp-3) var(--sp-4);
  }
  .lhs__than {
    padding: var(--sp-3) var(--sp-4) var(--sp-6);
  }
  .lhs-ds li,
  .lhs-nk li {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
  .lhs-bat {
    margin-left: 0;
  }
}
```

Trong `frontend/src/pages/LenhSanXuatPage.tsx` gỡ hai chỗ TẠM của Task 8: xoá hai dòng
`// TẠM tới Task 9: khung hồ sơ cũ còn dựa vào lớp ...` + `import "./lenh-san-xuat.css";`; và thay khối
`{/* TẠM tới Task 9: bọc ... */}` + `<div className="hslsx"> ... </div>` bằng `LenhSxHoSoView` đứng trần (cùng props).

- [ ] **Step 4: Chạy để thấy xanh**

Run: `npx vitest run src/pages/LenhSxHoSoView.test.tsx src/pages/LenhSanXuatPage.test.tsx` → PASS. Run: `npx tsc --noEmit` → không lỗi. Run: `grep -rn "hslsx" frontend/src --include=*.tsx` → chỉ còn `TheoDoiSanXuatPage.tsx` (Task 10 viết lại).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/lsxHoSoChung.tsx frontend/src/pages/LsxHoSoCongDoan.tsx frontend/src/pages/LsxHoSoQuyCach.tsx frontend/src/pages/LsxHoSoVatTu.tsx frontend/src/pages/LsxHoSoSauSx.tsx frontend/src/pages/LsxHoSoNhatKy.tsx frontend/src/pages/LenhSxHoSoView.tsx frontend/src/pages/LenhSxHoSoView.test.tsx frontend/src/pages/lenh-sx-ho-so.css frontend/src/pages/LenhSanXuatPage.tsx frontend/src/pages/LenhSanXuatPage.test.tsx
git diff --cached --stat
git commit -m "Hồ sơ một lệnh: phần đầu gọn (pill khâu, cảnh báo một dòng, 3 ô tổng quan) + 5 mục Công đoạn, Quy cách, Vật tư, Sau sản xuất, Nhật ký"
```

### Task 10: Màn Theo dõi sản xuất — Theo máy / Theo lệnh + dải bất thường

**Files:**
- Modify: `frontend/src/api/client.ts`, `frontend/src/pages/TheoDoiSanXuatPage.tsx` (viết lại), `frontend/src/pages/TdsxTheoMay.tsx` (viết lại), `frontend/src/pages/TdsxTheoMay.test.tsx` (viết lại), `frontend/src/pages/theo-doi-san-xuat.css` (viết lại)
- Create: `frontend/src/pages/TdsxTheoLenh.tsx`, `TdsxTheoLenh.test.tsx`, `TheoDoiSanXuatPage.test.tsx`
- Delete: `frontend/src/pages/TdsxKanban.tsx`, `TdsxTheoCa.tsx`, `TdsxGantt.tsx`, `tdsxTimeline.ts`, `lenh-san-xuat.css`
- Giữ: `frontend/src/pages/tdsxChonLenh.tsx`

**Interfaces:**
- Consumes: Task 4–6 (`GET /api/theo-doi-san-xuat/bo-loc` → `{may:[{id:str, ten, ngung_dung, co_viec}], khach_hang:[{id:str, ten}]}`; `/theo-may?q&khach_hang_id&bat_thuong` → `{nhom, may_trong, bat_thuong}`; `/theo-lenh?q&khach_hang_id&may_id&bat_thuong` → `{items, total, bat_thuong}`); Task 7 (`lsxKhau`, `lsc-*`); Task 9 (`LenhSxHoSoView`, `so`, `ngayNgan`); `tdsxChonLenh.tsx` (`useChonLenh`, `ChonLenhPopover`).
- Produces: type `TdsxBatThuong`, `TdsxDemBatThuong`, `TdsxBoLocMuc`, `TdsxBoLocMayMuc`, `TdsxBoLocOut`, `TdsxLsxThamChieu`, `TdsxLocParams`, `TdsxCoLenh`, `TdsxTheoLenhDong`, `TdsxTheoLenhOut`, `TdsxViec`, `TdsxSanLuongDonVi`, `TdsxSanLuong`, `TdsxMayDong`, `TdsxNhomMay`, `TdsxTheoMayOut`; `api.theoDoiSanXuat.{boLoc, theoMay, theoLenh}`; `gioXuong(v, bayGio?)` export từ `TdsxTheoMay.tsx`; khoá localStorage `tdsx.goc`.

- [ ] **Step 1: Viết bài kiểm**

`frontend/src/pages/TdsxTheoMay.test.tsx`:

```tsx
// Góc Theo máy (làm gọn 05/10/2026, đặc tả 3.3): bảng mỗi máy một dòng, nhóm theo thứ máy chủ trả,
// máy rảnh gập ở cuối, việc ghép bắt chọn lệnh, sản lượng không cộng lẫn đơn vị.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TdsxMayDong, TdsxTheoMayOut, TdsxViec } from "../api/client";
import { TdsxTheoMay, gioXuong } from "./TdsxTheoMay";

const DEM = { tre_han: 0, su_co: 0, tam_dung: 0, kcs_khong_dat: 0, may_hong: 0, chua_may: 1 };

/** Giờ xưởng KHÔNG nhãn múi, đúng dạng máy chủ gửi — dựng theo NGÀY HÔM NAY của máy chạy test. */
function homNay(gio: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${gio}:00`;
}

function viec(id: number, ma: string, extra: Partial<TdsxViec> = {}): TdsxViec {
  return {
    cong_viec_id: id, ten_buoc: "In", trang_thai: "running", bai_ma: null,
    lsx: [{ lsx_id: id, ma, ten: `Hộp ${id}`, is_rush: false }],
    ...extra,
  };
}

function dong(khoa: string, extra: Partial<TdsxMayDong> = {}): TdsxMayDong {
  return {
    khoa, may_id: null, ten: null, ngung_dung: false, tinh_trang: "trong", nhan_tinh_trang: "Đang trống",
    dang_chay: null, dang_chay_them: 0, san_luong: null, ke_hoach_xong: null, ke_hoach_bat_dau: null,
    ke_tiep: [], ke_tiep_them: 0,
    ...extra,
  };
}

const DATA: TdsxTheoMayOut = {
  nhom: [
    {
      loai: "chua_may", ten: "Chưa có máy",
      dong: [dong("cv:90", {
        tinh_trang: "cho_xep_may", nhan_tinh_trang: "Chờ xếp máy",
        dang_chay: viec(90, "LSX26-0090", { trang_thai: "released", ten_buoc: "Bế" }),
        ke_hoach_bat_dau: homNay("14:30"),
      })],
    },
    {
      loai: "may", ten: "Máy in",
      dong: [
        dong("may:1", {
          may_id: 1, ten: "Máy in A", tinh_trang: "dang_chay", nhan_tinh_trang: "Đang chạy",
          dang_chay: viec(31, "LSX26-0031", { lsx: [{ lsx_id: 31, ma: "LSX26-0031", ten: "Hộp thuốc", is_rush: true }] }),
          san_luong: { tot: 480, ke_hoach: 1000, don_vi: "to", theo_don_vi: [], ca_bai: false },
          ke_hoach_xong: homNay("16:05"),
          ke_tiep: [viec(12, "LSX26-0012", { trang_thai: "released" }), viec(13, "LSX26-0013", { trang_thai: "released" })],
          ke_tiep_them: 2,
        }),
        dong("may:2", {
          may_id: 2, ten: "Máy in B", ngung_dung: true, tinh_trang: "may_dung", nhan_tinh_trang: "Hỏng — chờ sửa",
          dang_chay: viec(0, "", {
            trang_thai: "paused", bai_ma: "GB26-0002",
            lsx: [
              { lsx_id: 41, ma: "LSX26-0041", ten: "Tem A", is_rush: false },
              { lsx_id: 42, ma: "LSX26-0042", ten: "Tem B", is_rush: false },
              { lsx_id: 43, ma: "LSX26-0043", ten: "Tem C", is_rush: false },
            ],
          }),
          san_luong: {
            tot: null, ke_hoach: 500, don_vi: "to",
            theo_don_vi: [{ don_vi: "to", tot: 200 }, { don_vi: "kem", tot: 4 }], ca_bai: true,
          },
        }),
      ],
    },
    { loai: "may", ten: "", dong: [dong("may:5", { may_id: 5, ten: "Máy lẻ", tinh_trang: "bao_tri", nhan_tinh_trang: "Đang bảo trì" })] },
  ],
  may_trong: [dong("may:7", { may_id: 7, ten: "Máy cắt 1" }), dong("may:8", { may_id: 8, ten: "Máy cắt 2" })],
  bat_thuong: DEM,
};

function ve(data: TdsxTheoMayOut | null = DATA, onMo = vi.fn()) {
  render(<TdsxTheoMay data={data} dangTai={false} rong={<p>RỖNG</p>} onMo={onMo} />);
  return onMo;
}

describe("TdsxTheoMay · bảng theo máy", () => {
  it("⭐ nhóm theo đúng thứ máy chủ trả, nhóm tên rỗng ghi 'Chưa phân nhóm', có số đếm", () => {
    ve();
    const nhom = [...document.querySelectorAll(".lsc-bang__nhom td")].map((t) => t.textContent);
    expect(nhom).toEqual(["Chưa có máy1 bước", "Máy in2 máy", "Chưa phân nhóm1 máy"]);
  });

  it("⭐ dòng Chưa có máy: cột Máy '–', Chờ xếp máy, giờ bắt đầu kế hoạch", () => {
    ve();
    const tr = screen.getByText("Chờ xếp máy").closest("tr")!;
    expect(tr.querySelector("td")!.textContent).toBe("–");
    expect(within(tr).getByText("bắt đầu 14:30 hôm nay")).toBeInTheDocument();
    expect(within(tr).getByText("Bế")).toBeInTheDocument();
  });

  it("⭐ việc thường: mã lệnh + GẤP + bước + sản phẩm; sản lượng 'x trên y' có thanh; giờ hôm nay", async () => {
    const onMo = ve();
    const tr = screen.getByText("Máy in A").closest("tr")!;
    expect(within(tr).getByText("GẤP")).toBeInTheDocument();
    expect(within(tr).getByText("Hộp thuốc")).toBeInTheDocument();
    expect(within(tr).getByText(/^480 trên 1\.000/)).toBeInTheDocument();
    expect(within(tr).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "48");
    expect(within(tr).getByText("16:05 hôm nay")).toBeInTheDocument();
    await userEvent.click(within(tr).getByRole("button", { name: /Mở hồ sơ lệnh LSX26-0031/ }));
    expect(onMo).toHaveBeenCalledWith(31);
  });

  it("⭐ kế tiếp: thẻ 4 số cuối, '+N', bấm mở đúng lệnh", async () => {
    const onMo = ve();
    const tr = screen.getByText("Máy in A").closest("tr")!;
    expect(within(tr).getByText("+2")).toBeInTheDocument();
    await userEvent.click(within(tr).getByRole("button", { name: /LSX26-0013/ }));
    expect(onMo).toHaveBeenCalledWith(13);
    expect(within(tr).getByText("0012")).toHaveAttribute("title", "In, Hộp 12");
  });

  it("⭐ việc ghép: 'Bài <mã>' + 'N lệnh', bấm thì bắt CHỌN lệnh, không đoán", async () => {
    const onMo = ve();
    const tr = screen.getByText("Máy in B").closest("tr")!;
    expect(within(tr).getByText("Ngừng dùng")).toBeInTheDocument();
    expect(within(tr).getByText("3 lệnh")).toBeInTheDocument();
    await userEvent.click(within(tr).getByRole("button", { name: /Bài ghép GB26-0002/ }));
    expect(onMo).not.toHaveBeenCalled();
    const hop = screen.getByRole("dialog", { name: "Chọn lệnh để mở hồ sơ" });
    expect(hop.textContent).toContain("Bài ghép này phục vụ 3 lệnh");
    await userEvent.click(within(hop).getByText("LSX26-0042"));
    expect(onMo).toHaveBeenCalledWith(42);
  });

  it("⭐ mẻ lẫn đơn vị: mỗi đơn vị một dòng, KHÔNG thanh, KHÔNG cộng; ghép ghi '(cả bài)'", () => {
    ve();
    const tr = screen.getByText("Máy in B").closest("tr")!;
    expect(within(tr).getByText(/^200 /)).toBeInTheDocument();
    expect(within(tr).getByText(/^4 /)).toBeInTheDocument();
    expect(within(tr).queryByRole("progressbar")).toBeNull();
    expect(tr.textContent).not.toContain("204");
    expect(within(tr).getByText("(cả bài)")).toBeInTheDocument();
    expect(within(tr).getByText("Hỏng — chờ sửa").className).toContain("lsc-pill--signal");
  });

  it("⭐ máy rảnh gập ở cuối: '2 máy đang trống', bấm mới hiện", async () => {
    ve();
    const nut = screen.getByRole("button", { name: "2 máy đang trống" });
    expect(nut).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Máy cắt 1")).toBeNull();
    await userEvent.click(nut);
    expect(nut).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Máy cắt 1")).toBeInTheDocument();
  });

  it("chưa có lượt nào ⇒ khung xám; rỗng ⇒ ô báo của trang", () => {
    const { unmount } = render(<TdsxTheoMay data={null} dangTai rong={<p>RỖNG</p>} onMo={() => {}} />);
    expect(document.querySelector(".khsx-skel")).not.toBeNull();
    unmount();
    ve({ nhom: [], may_trong: [], bat_thuong: DEM });
    expect(screen.getByText("RỖNG")).toBeInTheDocument();
  });

  it("gioXuong: trong ngày 'HH:MM hôm nay', khác ngày kèm dd/mm, rỗng '–'", () => {
    const bayGio = new Date(2026, 9, 5, 9, 0);
    expect(gioXuong("2026-10-05T14:30:00", bayGio)).toBe("14:30 hôm nay");
    expect(gioXuong("2026-10-06T07:05:00", bayGio)).toBe("07:05 06/10");
    expect(gioXuong(null, bayGio)).toBe("–");
  });
});
```

`frontend/src/pages/TdsxTheoLenh.test.tsx`:

```tsx
// Góc Theo lệnh (làm gọn 05/10/2026, đặc tả 3.4): mỗi lệnh còn sống một dòng, vấn đề là pill đỏ,
// quá 200 dòng thì NÓI RA chứ không phân trang giả.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TdsxTheoLenhDong, TdsxTheoLenhOut } from "../api/client";
import { TdsxTheoLenh } from "./TdsxTheoLenh";

const DEM = { tre_han: 1, su_co: 1, tam_dung: 0, kcs_khong_dat: 0, may_hong: 0, chua_may: 0 };

function lenh(id: number, extra: Partial<TdsxTheoLenhDong> = {}): TdsxTheoLenhDong {
  return {
    lsx_id: id, ma: `LSX26-00${id}`, ten: `Hộp ${id}`, is_rush: false, so_luong_dat: 12000,
    don_vi_tinh: "cái", khach_hang: "Công ty Sao",
    chang: [
      { ten: "In", nhom: null, trang_thai: "xong", hien_tai: false },
      { ten: "Cán màng", nhom: null, trang_thai: "chay", hien_tai: true },
      { ten: "Bế", nhom: null, trang_thai: "cho", hien_tai: false },
    ],
    buoc_hien_tai: "Cán màng", khau: "dang_sx", khau_chi_tiet: null,
    han_hoan_thanh_sx: "2026-10-10", du_kien_xong: null, canh_bao: [], tre_ngay: null,
    ...extra,
  };
}

const DATA: TdsxTheoLenhOut = {
  items: [
    lenh(31, {
      is_rush: true, canh_bao: ["tre_han", "su_co"], tre_ngay: 2, du_kien_xong: "2026-10-12T15:00:00",
    }),
    lenh(32, { khau: "sau_sx", khau_chi_tiet: "cho_nhap_kho", buoc_hien_tai: null }),
  ],
  total: 2,
  bat_thuong: DEM,
};

function ve(data: TdsxTheoLenhOut | null = DATA, onMo = vi.fn()) {
  render(<TdsxTheoLenh data={data} dangTai={false} rong={<p>RỖNG</p>} onMo={onMo} />);
  return onMo;
}

describe("TdsxTheoLenh · bảng theo lệnh", () => {
  it("⭐ sáu cột đúng thứ tự", () => {
    ve();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Lệnh", "Sản phẩm", "Khách", "Đang ở", "Hạn SX", "Vấn đề",
    ]);
  });

  it("⭐ lệnh trễ: pill 'Trễ 2 ngày' + 'Sự cố đang mở', hạn kèm 'dự kiến 12/10' đỏ, GẤP", () => {
    ve();
    const tr = screen.getByRole("button", { name: /LSX26-0031/ }).closest("tr")!;
    expect(within(tr).getByText("GẤP")).toBeInTheDocument();
    expect(within(tr).getByText("Trễ 2 ngày").className).toContain("lsc-pill--signal");
    expect(within(tr).getByText("Sự cố đang mở")).toBeInTheDocument();
    expect(within(tr).getByText("dự kiến 12/10").className).toContain("lsc-do");
  });

  it("⭐ Đang ở: đang SX = dải chặng + bước + 'bước i trên n'; xong SX = chữ khâu", () => {
    ve();
    const tr31 = screen.getByRole("button", { name: /LSX26-0031/ }).closest("tr")!;
    expect(within(tr31).getByRole("img", { name: /công đoạn 2 trên 3, Cán màng đang chạy/ })).toBeInTheDocument();
    expect(within(tr31).getByText("bước 2 trên 3")).toBeInTheDocument();
    const tr32 = screen.getByRole("button", { name: /LSX26-0032/ }).closest("tr")!;
    expect(within(tr32).getByText("Chờ nhập kho")).toBeInTheDocument();
    expect(within(tr32).queryByRole("img")).toBeNull();
  });

  it("⭐ bấm mã lệnh mở hồ sơ đúng lệnh", async () => {
    const onMo = ve();
    await userEvent.click(screen.getByRole("button", { name: /LSX26-0032/ }));
    expect(onMo).toHaveBeenCalledWith(32);
  });

  it("⭐ máy chủ cắt 200 dòng ⇒ nói 'Hiện 2 trên 350 lệnh, thu hẹp bằng ô tìm.'", () => {
    ve({ ...DATA, total: 350 });
    expect(screen.getByRole("note").textContent).toBe("Hiện 2 trên 350 lệnh, thu hẹp bằng ô tìm.");
  });

  it("không cắt ⇒ không có dòng nhắc; rỗng ⇒ ô báo của trang", () => {
    ve({ items: [], total: 0, bat_thuong: DEM });
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText("RỖNG")).toBeInTheDocument();
  });
});
```

`frontend/src/pages/TheoDoiSanXuatPage.test.tsx`:

```tsx
// Khung màn Theo dõi sản xuất (làm gọn 05/10/2026, đặc tả 3): đổi góc nhớ trong localStorage, mỗi
// lượt chỉ gọi ĐÚNG góc đang xem, dải bất thường lọc bảng (một mục một lúc, 0 thì không bấm được),
// 403 nói đúng tên màn, lọc rỗng có nút Bỏ lọc.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ModuleCapability, TdsxBoLocOut, TdsxTheoLenhOut, TdsxTheoMayOut } from "../api/client";
import { AuthContext, type AuthState } from "../auth/AuthContext";
import { PermissionsProvider, buildCapabilities } from "../auth/permissions";
import { TheoDoiSanXuatPage } from "./TheoDoiSanXuatPage";

const AUTH: AuthState = {
  status: "authenticated", user: null, token: "t",
  login: async () => {}, logout: async () => {},
  updateUser: () => {}, notice: null, setNotice: () => {},
};

const DEM = { tre_han: 2, su_co: 0, tam_dung: 0, kcs_khong_dat: 0, may_hong: 1, chua_may: 0 };

const BO_LOC: TdsxBoLocOut = {
  may: [{ id: "3", ten: "Máy in A", ngung_dung: false, co_viec: true }],
  khach_hang: [{ id: "9", ten: "Công ty Sao" }],
};

const THEO_MAY: TdsxTheoMayOut = {
  nhom: [{
    loai: "may", ten: "Máy in",
    dong: [{
      khoa: "may:3", may_id: 3, ten: "Máy in A", ngung_dung: false,
      tinh_trang: "dang_chay", nhan_tinh_trang: "Đang chạy",
      dang_chay: {
        cong_viec_id: 500, ten_buoc: "In", trang_thai: "running", bai_ma: null,
        lsx: [{ lsx_id: 31, ma: "LSX26-0031", ten: "Hộp thuốc", is_rush: false }],
      },
      dang_chay_them: 0, san_luong: null, ke_hoach_xong: null, ke_hoach_bat_dau: null,
      ke_tiep: [], ke_tiep_them: 0,
    }],
  }],
  may_trong: [],
  bat_thuong: DEM,
};

const THEO_LENH: TdsxTheoLenhOut = {
  items: [{
    lsx_id: 31, ma: "LSX26-0031", ten: "Hộp thuốc", is_rush: false, so_luong_dat: 100,
    don_vi_tinh: "cái", khach_hang: "Công ty Sao", chang: [], buoc_hien_tai: "In",
    khau: "dang_sx", khau_chi_tiet: null, han_hoan_thanh_sx: null, du_kien_xong: null,
    canh_bao: [], tre_ngay: null,
  }],
  total: 1,
  bat_thuong: DEM,
};

type Tuy = { theoMay?: TdsxTheoMayOut; theoLenh?: TdsxTheoLenhOut; status?: number };

/** Fetch giả phân biệt đường; trả mảng URL đã gọi để soi tham số. */
function stubApi(t: Tuy = {}): string[] {
  const goi: string[] = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    goi.push(url);
    let data: unknown = {};
    let status = 200;
    if (url.includes("/api/don-vi")) data = { items: [] };
    else if (url.includes("/api/theo-doi-san-xuat/bo-loc")) data = BO_LOC;
    else if (url.includes("/api/theo-doi-san-xuat/theo-may")) {
      status = t.status ?? 200;
      data = status === 200 ? (t.theoMay ?? THEO_MAY) : { detail: "Không có quyền" };
    } else if (url.includes("/api/theo-doi-san-xuat/theo-lenh")) {
      status = t.status ?? 200;
      data = status === 200 ? (t.theoLenh ?? THEO_LENH) : { detail: "Không có quyền" };
    } else if (url.includes("/api/lenh-san-xuat/")) {
      status = 404;
      data = { detail: "không có trong stub" };
    }
    return Promise.resolve({
      ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }),
      json: async () => data, text: async () => JSON.stringify(data),
    } as Response);
  }));
  return goi;
}

const CAPS = buildCapabilities([
  { module_key: "theo_doi_san_xuat", scope: "all", can_read: true } as ModuleCapability,
  { module_key: "lenh_san_xuat", scope: "all", can_read: true } as ModuleCapability,
]);

function ve() {
  return render(
    <AuthContext.Provider value={AUTH}>
      <PermissionsProvider caps={CAPS}>
        <TheoDoiSanXuatPage />
      </PermissionsProvider>
    </AuthContext.Provider>,
  );
}

const goiToi = (goi: string[], duong: string) => goi.filter((u) => u.includes(duong));

describe("TheoDoiSanXuatPage · khung màn", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("⭐ mặc định Theo máy: chỉ gọi /theo-may, không gọi /theo-lenh", async () => {
    const goi = stubApi();
    ve();
    await screen.findByText("Máy in A");
    expect(screen.getByRole("button", { name: "Theo máy" })).toHaveAttribute("aria-pressed", "true");
    expect(goiToi(goi, "/theo-may")).toHaveLength(1);
    expect(goiToi(goi, "/theo-lenh")).toHaveLength(0);
    // Ô Máy chỉ có ở góc Theo lệnh.
    expect(screen.queryByRole("combobox", { name: /Máy/ })).toBeNull();
  });

  it("⭐ dải bất thường: số + chữ, mục 0 không bấm được, bấm lọc rồi bấm lại để bỏ", async () => {
    const goi = stubApi();
    ve();
    const tre = await screen.findByRole("button", { name: "2 lệnh trễ hạn" });
    await waitFor(() => expect(tre).toBeEnabled());
    expect(screen.getByRole("button", { name: "0 sự cố đang mở" })).toBeDisabled();

    await userEvent.click(tre);
    expect(tre).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(goiToi(goi, "bat_thuong=tre_han")).toHaveLength(1));

    // Một mục một lúc: chọn "máy hỏng" thì "trễ hạn" nhả.
    await userEvent.click(screen.getByRole("button", { name: "1 máy hỏng" }));
    expect(tre).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(goiToi(goi, "bat_thuong=may_hong")).toHaveLength(1));

    await userEvent.click(screen.getByRole("button", { name: "1 máy hỏng" }));
    expect(screen.getByRole("button", { name: "1 máy hỏng" })).toHaveAttribute("aria-pressed", "false");
  });

  it("⭐ đổi sang Theo lệnh: gọi /theo-lenh, nhớ vào localStorage, có ô Máy gửi may_id", async () => {
    const goi = stubApi();
    ve();
    await screen.findByText("Máy in A");
    await userEvent.click(screen.getByRole("button", { name: "Theo lệnh" }));
    await screen.findByText("Hộp thuốc");
    expect(localStorage.getItem("tdsx.goc")).toBe("theo_lenh");
    expect(goiToi(goi, "/theo-lenh")).toHaveLength(1);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Máy/ }), "3");
    await waitFor(() => expect(goiToi(goi, "may_id=3")).toHaveLength(1));
  });

  it("⭐ đã chọn Theo lệnh lần trước ⇒ mở màn là Theo lệnh, không gọi /theo-may", async () => {
    localStorage.setItem("tdsx.goc", "theo_lenh");
    const goi = stubApi();
    ve();
    await screen.findByText("Hộp thuốc");
    expect(goiToi(goi, "/theo-may")).toHaveLength(0);
  });

  it("⭐ ô Khách gửi khach_hang_id; lọc rỗng ⇒ 'Bộ lọc không ra kết quả nào.' + Bỏ lọc", async () => {
    const goi = stubApi({ theoMay: { nhom: [], may_trong: [], bat_thuong: DEM } });
    ve();
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: /Khách/ }), "9");
    await waitFor(() => expect(goiToi(goi, "khach_hang_id=9")).toHaveLength(1));
    expect(await screen.findByText("Bộ lọc không ra kết quả nào.")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Bỏ lọc" })[0]);
    expect(screen.getByRole("combobox", { name: /Khách/ })).toHaveValue("");
  });

  it("⭐ 403 ⇒ nói đúng thiếu quyền Theo dõi sản xuất, không nút Thử lại", async () => {
    stubApi({ status: 403 });
    ve();
    expect(await screen.findByText("Bạn không có quyền xem Theo dõi sản xuất.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
  });

  it("⭐ bấm mã lệnh ⇒ mở hồ sơ đúng lệnh (gọi /api/lenh-san-xuat/31)", async () => {
    const goi = stubApi();
    ve();
    await userEvent.click(await screen.findByRole("button", { name: /Mở hồ sơ lệnh LSX26-0031/ }));
    await waitFor(() => expect(goiToi(goi, "/api/lenh-san-xuat/31")).toHaveLength(1));
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npx vitest run src/pages/TdsxTheoMay.test.tsx src/pages/TdsxTheoLenh.test.tsx src/pages/TheoDoiSanXuatPage.test.tsx` → FAIL (thiếu `TdsxTheoLenh`, `gioXuong`, type mới).

- [ ] **Step 3: Vá client + viết ba tệp + CSS, xoá tệp cũ**

Run: `python %TEMP%\patch_client.py 10 frontend/src/api/client.ts` → `ok 10`.

`frontend/src/pages/TdsxTheoMay.tsx`:

```tsx
// Góc "Theo máy" của màn Theo dõi sản xuất (làm gọn 05/10/2026, đặc tả 3.3): MỘT bảng, mỗi máy một
// dòng, chia nhóm đúng như máy chủ trả (Chưa có máy → từng nhóm máy theo danh mục → máy không còn
// trong danh mục → Gia công ngoài). Máy rảnh gập vào một dòng cuối bảng.
//
// ĐỌC, KHÔNG TÍNH LẠI: tình trạng, nhãn, nhóm, thứ tự đều do máy chủ dựng. Chỗ duy nhất FE quyết là
// màu pill và cách viết giờ ("14:30 hôm nay").
import { useState, type MouseEvent, type ReactNode } from "react";

import type { TdsxLsxThamChieu, TdsxMayDong, TdsxSanLuong, TdsxTheoMayOut, TdsxViec } from "../api/client";
import { Icon } from "../components/Icons";
import { Skeleton } from "./keHoachSxShared";
import { nhanChang } from "./lsxBuoc";
import { so } from "./lsxHoSoChung";
import { TheGap } from "./lsxKhau";
import { ChonLenhPopover, useChonLenh } from "./tdsxChonLenh";

const SO_COT = 6;

/** Màu theo `tinh_trang`. Đỏ: máy hỏng, việc tạm dừng. Vàng: máy cần điều độ để ý hoặc việc chờ
 *  xếp. Xám thép: đang chạy, đang ở nhà gia công. Khoá lạ ⇒ xám nhạt. */
const MAU_TINH_TRANG: Record<string, string> = {
  may_dung: "lsc-pill--signal",
  tam_dung: "lsc-pill--signal",
  bao_tri: "lsc-pill--amber",
  khoa: "lsc-pill--amber",
  co_phieu_sua: "lsc-pill--amber",
  cho_xep_may: "lsc-pill--amber",
  dang_chay: "lsc-pill--steel",
  o_nha_gia_cong: "lsc-pill--steel",
  trong: "lsc-pill--off",
  cho_mang_di: "lsc-pill--off",
};

/** Đếm dòng của một nhóm theo đúng thứ nhóm chứa. */
function demNhom(loai: string, n: number): string {
  if (loai === "chua_may") return `${n} bước`;
  if (loai === "gia_cong") return `${n} nhà gia công`;
  return `${n} máy`;
}

/** Giờ xưởng (máy chủ gửi không nhãn múi ⇒ trình duyệt đọc theo giờ máy, cũng là giờ xưởng).
 *  Trong ngày: "14:30 hôm nay"; khác ngày: "14:30 06/10". Hỏng/rỗng ⇒ "–". */
export function gioXuong(v: string | null | undefined, bayGio: Date = new Date()): string {
  if (!v) return "–";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "–";
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const cungNgay =
    d.getFullYear() === bayGio.getFullYear() &&
    d.getMonth() === bayGio.getMonth() &&
    d.getDate() === bayGio.getDate();
  if (cungNgay) return `${hm} hôm nay`;
  return `${hm} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function TdsxTheoMay({
  data,
  dangTai,
  rong,
  onMo,
}: {
  /** `null` = chưa có lượt nào về ⇒ khung xám. */
  data: TdsxTheoMayOut | null;
  /** Đang tải lại (realtime/đổi lọc) ⇒ giữ nội dung cũ, làm mờ. */
  dangTai: boolean;
  /** Ô báo khi bảng không có dòng nào — trang quyết câu chữ (lỗi, lọc rỗng, chưa có gì). */
  rong: ReactNode;
  onMo: (lsxId: number) => void;
}) {
  const [moTrong, setMoTrong] = useState(false);
  const [chon, moChon, dongChon] = useChonLenh();

  /** Một việc phục vụ một lệnh ⇒ mở thẳng; từ hai lệnh ⇒ bật bảng chọn, không đoán. */
  function bam(ds: TdsxLsxThamChieu[], e: MouseEvent<HTMLButtonElement>) {
    if (ds.length === 1) {
      onMo(ds[0].lsx_id);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    moChon(ds, r.left, r.bottom + 4);
  }

  const coDong = !!data && (data.nhom.length > 0 || data.may_trong.length > 0);

  return (
    <>
      <div className="lsc-khung" tabIndex={0} role="group" aria-label="Bảng theo máy, cuộn ngang được bằng phím mũi tên">
        <table className="lsc-bang tdsx-may">
          <caption className="sr-only">Máy, việc đang chạy và việc kế tiếp</caption>
          <thead>
            <tr>
              <th scope="col">Máy</th>
              <th scope="col">Tình trạng</th>
              <th scope="col">Đang chạy</th>
              <th scope="col">Sản lượng tốt</th>
              <th scope="col">Kế hoạch xong</th>
              <th scope="col">Kế tiếp</th>
            </tr>
          </thead>
          {data === null ? (
            <Skeleton rows={8} cols={SO_COT} />
          ) : !coDong ? (
            <tbody>
              <tr className="lsc-bang__rong">
                <td colSpan={SO_COT}>{rong}</td>
              </tr>
            </tbody>
          ) : (
            <>
              {data.nhom.map((g) => (
                <tbody key={`${g.loai}:${g.ten}`} className={dangTai ? "is-mo" : undefined}>
                  <tr className="lsc-bang__nhom">
                    <td colSpan={SO_COT}>
                      {g.ten || "Chưa phân nhóm"}
                      <span className="tdsx-nhom__dem">{demNhom(g.loai, g.dong.length)}</span>
                    </td>
                  </tr>
                  {g.dong.map((d) => (
                    <DongMay key={d.khoa} d={d} chuaMay={g.loai === "chua_may"} onBam={bam} />
                  ))}
                </tbody>
              ))}
              {data.nhom.length === 0 && (
                <tbody>
                  <tr className="lsc-bang__rong">
                    <td colSpan={SO_COT}>{rong}</td>
                  </tr>
                </tbody>
              )}
              {data.may_trong.length > 0 && (
                <tbody className={dangTai ? "is-mo" : undefined}>
                  <tr className="tdsx-trong">
                    <td colSpan={SO_COT}>
                      <button
                        type="button"
                        className="tdsx-trong__nut"
                        aria-expanded={moTrong}
                        onClick={() => setMoTrong((v) => !v)}
                      >
                        <Icon name="chevron" size={14} className={moTrong ? undefined : "tdsx-trong__gap"} />
                        {data.may_trong.length} máy đang trống
                      </button>
                    </td>
                  </tr>
                  {moTrong && data.may_trong.map((d) => <DongMay key={d.khoa} d={d} chuaMay={false} onBam={bam} />)}
                </tbody>
              )}
            </>
          )}
        </table>
      </div>
      {chon && <ChonLenhPopover state={chon} onDong={dongChon} onChon={onMo} nhan="Bài ghép" />}
    </>
  );
}

type Bam = (ds: TdsxLsxThamChieu[], e: MouseEvent<HTMLButtonElement>) => void;

function DongMay({ d, chuaMay, onBam }: { d: TdsxMayDong; chuaMay: boolean; onBam: Bam }) {
  const tamDung = d.dang_chay?.trang_thai === "paused";
  return (
    <tr>
      <td>
        {chuaMay ? (
          "–"
        ) : (
          <span className="lsc-cum">
            <b>{d.ten ?? "–"}</b>
            {d.ngung_dung && <span className="lsc-tag">Ngừng dùng</span>}
          </span>
        )}
      </td>
      <td>
        <span className={`lsc-pill ${MAU_TINH_TRANG[d.tinh_trang] ?? "lsc-pill--off"}`}>{d.nhan_tinh_trang}</span>
      </td>
      <td>
        {d.dang_chay ? <Viec v={d.dang_chay} them={d.dang_chay_them} onBam={onBam} /> : "–"}
      </td>
      <td>
        <SanLuong s={d.san_luong} tamDung={tamDung} />
      </td>
      <td className="tdsx-gio">
        {chuaMay
          ? d.ke_hoach_bat_dau
            ? `bắt đầu ${gioXuong(d.ke_hoach_bat_dau)}`
            : "–"
          : gioXuong(d.ke_hoach_xong)}
      </td>
      <td>
        {d.ke_tiep.length === 0 ? (
          "–"
        ) : (
          <span className="lsc-cum">
            {d.ke_tiep.map((v) => (
              <TheKeTiep key={v.cong_viec_id} v={v} onBam={onBam} />
            ))}
            {d.ke_tiep_them > 0 && <span className="lsc-phu">+{d.ke_tiep_them}</span>}
          </span>
        )}
      </td>
    </tr>
  );
}

/** Ô "Đang chạy": việc thường = mã lệnh + GẤP + tên bước + sản phẩm; việc ghép = "Bài <mã>" + số lệnh. */
function Viec({ v, them, onBam }: { v: TdsxViec; them: number; onBam: Bam }) {
  const mot = v.lsx.length === 1 ? v.lsx[0] : null;
  const rush = v.lsx.some((l) => l.is_rush);
  return (
    <>
      <span className="lsc-cum">
        {v.bai_ma && v.lsx.length > 1 ? (
          <>
            <button
              type="button"
              className="lsc-ma"
              onClick={(e) => onBam(v.lsx, e)}
              aria-label={`Bài ghép ${v.bai_ma}, ${v.lsx.length} lệnh, chọn lệnh để mở hồ sơ`}
            >
              Bài {v.bai_ma}
            </button>
            <span className="lsc-tag">{v.lsx.length} lệnh</span>
          </>
        ) : mot ? (
          <button
            type="button"
            className="lsc-ma"
            data-lsx={mot.lsx_id}
            onClick={(e) => onBam(v.lsx, e)}
            aria-label={`Mở hồ sơ lệnh ${mot.ma}${mot.ten ? ` — ${mot.ten}` : ""}`}
          >
            {mot.ma}
          </button>
        ) : v.lsx.length > 1 ? (
          <button type="button" className="lsc-ma" onClick={(e) => onBam(v.lsx, e)}>
            {v.lsx.length} lệnh
          </button>
        ) : null}
        {rush && <TheGap />}
        {them > 0 && (
          <span className="lsc-tag" title="Máy đang ghi nhận nhiều việc chạy cùng lúc">
            +{them}
          </span>
        )}
      </span>
      {v.ten_buoc && <span className="tdsx-buoc">{v.ten_buoc}</span>}
      {mot?.ten && <span className="lsc-phu">{mot.ten}</span>}
    </>
  );
}

/** "x trên y <đơn vị>" + thanh mảnh. Mẻ lẫn đơn vị ⇒ từng dòng theo đơn vị, không thanh, không cộng. */
function SanLuong({ s, tamDung }: { s: TdsxSanLuong | null; tamDung: boolean }) {
  if (!s) return <>–</>;
  const caBai = s.ca_bai ? <span className="lsc-phu">(cả bài)</span> : null;
  if (s.tot == null) {
    return (
      <>
        {s.theo_don_vi.map((x) => (
          <span key={x.don_vi ?? ""} className="tdsx-sl__dv">
            {so(x.tot)} {nhanChang(x.don_vi)}
          </span>
        ))}
        {caBai}
      </>
    );
  }
  const dv = nhanChang(s.don_vi);
  const pct = s.ke_hoach && s.ke_hoach > 0 ? Math.min(100, Math.round((s.tot / s.ke_hoach) * 100)) : null;
  return (
    <>
      <span className={tamDung ? "lsc-do" : undefined}>
        {s.ke_hoach != null ? `${so(s.tot)} trên ${so(s.ke_hoach)}` : so(s.tot)}
        {dv && ` ${dv}`}
      </span>
      {pct != null && (
        <span
          className={`lsc-thanh${tamDung ? " lsc-thanh--do" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`Đạt ${pct}% sản lượng kế hoạch`}
        >
          <i style={{ width: `${pct}%` }} />
        </span>
      )}
      {caBai}
    </>
  );
}

/** Thẻ việc kế tiếp: 4 số cuối mã lệnh (việc ghép nhiều lệnh: 4 số cuối mã bài). Rê chuột ra tên
 *  bước + sản phẩm. */
function TheKeTiep({ v, onBam }: { v: TdsxViec; onBam: Bam }) {
  const mot = v.lsx.length === 1 ? v.lsx[0] : null;
  if (!mot && v.lsx.length === 0) return null;
  const nhan = mot ? mot.ma.slice(-4) : `Bài ${(v.bai_ma ?? "").slice(-4)}`;
  const tieuDe = [v.ten_buoc, mot?.ten].filter(Boolean).join(", ");
  return (
    <button
      type="button"
      className={`tdsx-ke${v.lsx.some((l) => l.is_rush) ? " tdsx-ke--gap" : ""}`}
      data-lsx={mot?.lsx_id}
      title={tieuDe || undefined}
      aria-label={
        mot
          ? `Mở hồ sơ lệnh ${mot.ma}${tieuDe ? `, ${tieuDe}` : ""}`
          : `Bài ghép ${v.bai_ma ?? ""}, ${v.lsx.length} lệnh, chọn lệnh để mở hồ sơ`
      }
      onClick={(e) => onBam(v.lsx, e)}
    >
      {nhan}
    </button>
  );
}
```

`frontend/src/pages/TdsxTheoLenh.tsx`:

```tsx
// Góc "Theo lệnh" của màn Theo dõi sản xuất (làm gọn 05/10/2026, đặc tả 3.4): mỗi lệnh còn sống
// một dòng, máy chủ đã sắp (số cờ giảm dần → GẤP → hạn SX → mã) và cắt ở 200 dòng.
//
// KHÔNG phân trang giả ở trình duyệt: quá 200 thì nói ra và mời thu hẹp bằng ô tìm.
import type { ReactNode } from "react";

import type { TdsxTheoLenhDong, TdsxTheoLenhOut } from "../api/client";
import { Skeleton, ngay, num } from "./keHoachSxShared";
import { ngayNgan } from "./lsxHoSoChung";
import { CO_NHAN, DaiChang, TheGap, buocThu, nhanKhau } from "./lsxKhau";

const SO_COT = 6;

export function TdsxTheoLenh({
  data,
  dangTai,
  rong,
  onMo,
}: {
  /** `null` = chưa có lượt nào về ⇒ khung xám. */
  data: TdsxTheoLenhOut | null;
  dangTai: boolean;
  rong: ReactNode;
  onMo: (lsxId: number) => void;
}) {
  return (
    <>
      <div className="lsc-khung" tabIndex={0} role="group" aria-label="Bảng theo lệnh, cuộn ngang được bằng phím mũi tên">
        <table className="lsc-bang tdsx-lenh">
          <caption className="sr-only">Lệnh đang sản xuất và vấn đề của từng lệnh</caption>
          <thead>
            <tr>
              <th scope="col">Lệnh</th>
              <th scope="col">Sản phẩm</th>
              <th scope="col">Khách</th>
              <th scope="col">Đang ở</th>
              <th scope="col">Hạn SX</th>
              <th scope="col">Vấn đề</th>
            </tr>
          </thead>
          {data === null ? (
            <Skeleton rows={8} cols={SO_COT} />
          ) : (
            <tbody className={dangTai ? "is-mo" : undefined}>
              {data.items.length === 0 ? (
                <tr className="lsc-bang__rong">
                  <td colSpan={SO_COT}>{rong}</td>
                </tr>
              ) : (
                data.items.map((r) => <Dong key={r.lsx_id} r={r} onMo={onMo} />)
              )}
            </tbody>
          )}
        </table>
      </div>
      {data && data.total > data.items.length && (
        <p className="tdsx-cat" role="note">
          Hiện {num(data.items.length)} trên {num(data.total)} lệnh, thu hẹp bằng ô tìm.
        </p>
      )}
    </>
  );
}

function Dong({ r, onMo }: { r: TdsxTheoLenhDong; onMo: (id: number) => void }) {
  const tre = r.canh_bao.includes("tre_han");
  const thu = buocThu(r.chang);
  return (
    <tr>
      <td>
        <span className="lsc-cum">
          <button
            type="button"
            className="lsc-ma"
            data-lsx={r.lsx_id}
            onClick={() => onMo(r.lsx_id)}
            aria-label={`Mở hồ sơ lệnh ${r.ma}${r.ten ? ` — ${r.ten}` : ""}`}
          >
            {r.ma}
          </button>
          {r.is_rush && <TheGap />}
        </span>
      </td>
      <td>
        {r.ten ?? "Chưa đặt tên"}
        <span className="lsc-phu">
          {num(r.so_luong_dat)}
          {r.don_vi_tinh ? ` ${r.don_vi_tinh}` : ""}
        </span>
      </td>
      <td>{r.khach_hang ?? "–"}</td>
      <td>
        {r.khau === "dang_sx" ? (
          <>
            <span className="lsc-cum">
              <DaiChang chang={r.chang} />
              <span>{r.buoc_hien_tai ?? "Chưa vào bước nào"}</span>
            </span>
            {thu && <span className="lsc-phu">{thu}</span>}
          </>
        ) : (
          <span>{nhanKhau(r.khau, r.khau_chi_tiet)}</span>
        )}
      </td>
      <td>
        {ngay(r.han_hoan_thanh_sx)}
        {tre && r.du_kien_xong && <span className="lsc-phu lsc-do">dự kiến {ngayNgan(r.du_kien_xong)}</span>}
      </td>
      <td>
        {r.canh_bao.length === 0 ? (
          <span className="lsc-phu">–</span>
        ) : (
          <span className="lsc-cum">
            {r.canh_bao.map((c) => (
              <span key={c} className="lsc-pill lsc-pill--signal">
                {c === "tre_han" && r.tre_ngay != null ? `Trễ ${r.tre_ngay} ngày` : (CO_NHAN[c] ?? c)}
              </span>
            ))}
          </span>
        )}
      </td>
    </tr>
  );
}
```

`frontend/src/pages/TheoDoiSanXuatPage.tsx`:

```tsx
// Màn "Theo dõi sản xuất" — bàn quét TOÀN XƯỞNG cho điều độ, QC, trưởng phòng (làm gọn 05/10/2026).
// Trả lời "bây giờ xưởng thế nào, máy nào đứng, lệnh nào có vấn đề". Tra lệnh cũ là việc của màn Hồ
// sơ lệnh sản xuất. Đặc tả: `docs/superpowers/specs/2026-10-05-lam-gon-ho-so-lenh-theo-doi-sx-design.md`
// mục 3.
//
// Từ trên xuống: tiêu đề + nút đổi góc Theo máy / Theo lệnh (nhớ trong `localStorage`), dải bất
// thường, hàng lọc, bảng. MỖI lượt tải chỉ gọi ĐÚNG góc đang xem.
//
// ⚠️ MÀN NÀY KHÔNG GHI GÌ CẢ, KHÔNG MỘT SỐ TIỀN NÀO. Lọc ở MÁY CHỦ — không `rows.filter` ở đây.
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "../api/client";
import type {
  TdsxBatThuong,
  TdsxBoLocOut,
  TdsxDemBatThuong,
  TdsxLocParams,
  TdsxTheoLenhOut,
  TdsxTheoMayOut,
} from "../api/client";
import { useAuth } from "../auth/useAuth";
import type { NavigateFn } from "../components/AppShell";
import { Button } from "../components/Button";
import { Icon } from "../components/Icons";
import { useTre } from "../lib/useTre";
import { LenhSxHoSoView } from "./LenhSxHoSoView";
import { TdsxTheoLenh } from "./TdsxTheoLenh";
import { TdsxTheoMay } from "./TdsxTheoMay";
import { BangLoi, EmptyState } from "./keHoachSxShared";
import { useNapTenDonVi } from "./tenDonVi";
// `ke-hoach-sx.css` cho `EmptyState`/`Skeleton` (lớp `.khsx-*`), rồi CSS chung của hai màn, rồi CSS
// riêng màn này (nạp CUỐI để `.tdsx-*` thắng khi trùng độ ưu tiên).
import "./ke-hoach-sx.css";
import "./lenh-sx-chung.css";
import "./theo-doi-san-xuat.css";

/** Gộp sự kiện SSE sát nhau rồi mới tải lại — `useTre` là debounce, không nhân số lần gọi. */
const SSE_GOP_MS = 400;

type Goc = "theo_may" | "theo_lenh";
const KHOA_GOC = "tdsx.goc";

function docGoc(): Goc {
  try {
    if (typeof localStorage === "undefined") return "theo_may";
    return localStorage.getItem(KHOA_GOC) === "theo_lenh" ? "theo_lenh" : "theo_may";
  } catch {
    return "theo_may";
  }
}

/** Sáu mục của dải bất thường, thứ tự CỐ ĐỊNH (đặc tả 3.1). Khoá là hợp đồng với `?bat_thuong=`. */
const BAT_THUONG: { key: TdsxBatThuong; nhan: string }[] = [
  { key: "tre_han", nhan: "lệnh trễ hạn" },
  { key: "su_co", nhan: "sự cố đang mở" },
  { key: "tam_dung", nhan: "việc tạm dừng" },
  { key: "kcs_khong_dat", nhan: "KCS không đạt" },
  { key: "may_hong", nhan: "máy hỏng" },
  { key: "chua_may", nhan: "bước chưa có máy" },
];

export function TheoDoiSanXuatPage({
  eventTick,
  navigate,
}: {
  /** Nhích theo MỌI sự kiện SSE của AppShell; màn gộp lại rồi mới tải (xem `SSE_GOP_MS`). */
  eventTick?: number;
  navigate?: NavigateFn;
}) {
  const { token } = useAuth();
  // Nhãn đơn vị của cột Sản lượng tốt ("tờ in", "thành phẩm") — không nạp thì hiện mã trần.
  useNapTenDonVi();

  // --- góc nhìn -------------------------------------------------------------------------------
  const [goc, setGoc] = useState<Goc>(docGoc);
  useEffect(() => {
    try {
      localStorage.setItem(KHOA_GOC, goc);
    } catch {
      /* chế độ riêng tư chặn lưu ⇒ lần sau về mặc định, không sao */
    }
  }, [goc]);

  // --- bộ lọc (chạy ở máy chủ) ------------------------------------------------------------------
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");
  const qTre = useTre(q);
  const [khachId, setKhachId] = useState("");
  const [mayId, setMayId] = useState("");
  const [batThuong, setBatThuong] = useState<TdsxBatThuong | null>(null);

  useEffect(() => {
    function phim(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", phim);
    return () => window.removeEventListener("keydown", phim);
  }, []);

  const [boLoc, setBoLoc] = useState<TdsxBoLocOut | null>(null);
  useEffect(() => {
    if (!token) return;
    let song = true;
    api.theoDoiSanXuat
      .boLoc(token)
      .then((r) => {
        if (song) setBoLoc(r);
      })
      .catch(() => {
        // Hỏng ⇒ ô Khách/Máy ẩn, ô tìm và dải bất thường vẫn chạy.
        if (song) setBoLoc(null);
      });
    return () => {
      song = false;
    };
  }, [token]);

  // --- dữ liệu: MỘT yêu cầu cho góc đang xem ------------------------------------------------------
  const [mayData, setMayData] = useState<TdsxTheoMayOut | null>(null);
  const [lenhData, setLenhData] = useState<TdsxTheoLenhOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<{ text: string; cam: boolean } | null>(null);
  // Lượt về muộn của bộ lọc cũ không được đè lượt mới.
  const luot = useRef(0);

  const load = useCallback(() => {
    if (!token) return;
    const so = ++luot.current;
    const params: TdsxLocParams = {
      q: qTre.trim() || undefined,
      khach_hang_id: khachId ? Number(khachId) : undefined,
      bat_thuong: batThuong ?? undefined,
    };
    setLoading(true);
    const p: Promise<unknown> =
      goc === "theo_may"
        ? api.theoDoiSanXuat.theoMay(token, params).then((r) => {
            if (so === luot.current) setMayData(r);
          })
        : api.theoDoiSanXuat
            .theoLenh(token, { ...params, may_id: mayId ? Number(mayId) : undefined })
            .then((r) => {
              if (so === luot.current) setLenhData(r);
            });
    p.then(() => {
      if (so === luot.current) setLoi(null);
    })
      .catch((e) => {
        if (so !== luot.current) return;
        const cam = e instanceof ApiError && e.isForbidden;
        setLoi({
          text: cam
            ? "Bạn không có quyền xem Theo dõi sản xuất."
            : e instanceof ApiError
              ? e.message
              : "Máy chủ không phản hồi.",
          cam,
        });
      })
      .finally(() => {
        if (so === luot.current) setLoading(false);
      });
  }, [token, goc, qTre, khachId, mayId, batThuong]);
  useEffect(() => {
    load();
  }, [load]);

  // Realtime: gộp rồi tải lại ĐÚNG góc đang xem; hồ sơ đang mở nhận CÙNG nhịp đã gộp.
  const tickTre = useTre(eventTick ?? 0, SSE_GOP_MS);
  const tickDau = useRef(tickTre);
  useEffect(() => {
    if (tickTre === tickDau.current) return;
    tickDau.current = tickTre;
    load();
  }, [tickTre, load]);

  // --- hồ sơ một lệnh: vẽ ĐÈ lên bảng ----------------------------------------------------------
  const [hoSoId, setHoSoId] = useState<number | null>(null);
  const khungRef = useRef<HTMLElement | null>(null);
  const dongHoSo = useCallback(() => {
    const id = hoSoId;
    setHoSoId(null);
    requestAnimationFrame(() => {
      const nut = khungRef.current?.querySelector<HTMLButtonElement>(`[data-lsx="${id}"]`);
      if (nut) nut.focus();
      else khungRef.current?.querySelector<HTMLElement>(".lsc-khung")?.focus();
    });
  }, [hoSoId]);

  const dangLoc = qTre.trim() !== "" || khachId !== "" || (goc === "theo_lenh" && mayId !== "") || batThuong !== null;
  const xoaLoc = useCallback(() => {
    setQ("");
    setKhachId("");
    setMayId("");
    setBatThuong(null);
  }, []);

  const data = goc === "theo_may" ? mayData : lenhData;
  const dem: TdsxDemBatThuong | null = data?.bat_thuong ?? null;

  // Ô báo khi bảng rỗng — gom MỘT chỗ cho cả hai góc.
  const rong = loi ? (
    <EmptyState
      icon="alert"
      title={loi.cam ? loi.text : "Không tải được bảng theo dõi."}
      sub={loi.cam ? undefined : loi.text}
      action={
        loi.cam ? undefined : (
          <Button variant="ghost" onClick={load}>
            Thử lại
          </Button>
        )
      }
    />
  ) : dangLoc ? (
    <EmptyState
      icon="search"
      title="Bộ lọc không ra kết quả nào."
      action={
        <Button variant="ghost" onClick={xoaLoc}>
          Bỏ lọc
        </Button>
      }
    />
  ) : goc === "theo_may" ? (
    <EmptyState icon="clipboard" title="Chưa có việc nào trên máy." sub="Lệnh phát hành xuống xưởng sẽ hiện ở đây." />
  ) : (
    <EmptyState icon="clipboard" title="Chưa có lệnh nào đang sản xuất trong phạm vi của bạn." />
  );

  // Lỗi lúc CHƯA có dữ liệu ⇒ thay khung xám bằng ô báo lỗi (không để xám mãi).
  const dataHien = data ?? (loi ? (goc === "theo_may" ? MAY_RONG : LENH_RONG) : null);

  return (
    <main className="lsc tdsx" ref={khungRef}>
      <header className="lsc-head">
        <h1 className="lsc-title">Theo dõi sản xuất</h1>
        <span className="lsc-spacer" />
        <div className="lsc-seg" role="group" aria-label="Góc nhìn">
          <button type="button" aria-pressed={goc === "theo_may"} onClick={() => setGoc("theo_may")}>
            Theo máy
          </button>
          <button type="button" aria-pressed={goc === "theo_lenh"} onClick={() => setGoc("theo_lenh")}>
            Theo lệnh
          </button>
        </div>
      </header>

      <div
        className={`lsc-bt${dem ? "" : " lsc-bt--dang-tai"}`}
        role="group"
        aria-label="Bất thường, bấm để lọc bảng"
        aria-busy={dem ? undefined : true}
      >
        {BAT_THUONG.map((b) => {
          const n = dem?.[b.key] ?? 0;
          const dangChon = batThuong === b.key;
          return (
            <button
              key={b.key}
              type="button"
              className="lsc-bt__muc"
              aria-pressed={dangChon}
              // Đang chọn thì vẫn bấm được để BỎ, kể cả khi số đã về 0.
              disabled={!dem || (n === 0 && !dangChon)}
              onClick={() => setBatThuong(dangChon ? null : b.key)}
            >
              <b>{dem ? n : "0"}</b> {b.nhan}
            </button>
          );
        })}
      </div>

      <section className="lsc-loc" aria-label="Lọc bảng theo dõi">
        <div className="lsc-search">
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={120}
            placeholder="Tìm mã lệnh, sản phẩm, số đơn, khách"
            aria-label="Tìm mã lệnh, sản phẩm, số đơn, khách"
          />
          {q === "" ? (
            <kbd className="lsc-kbd">Ctrl K</kbd>
          ) : (
            <button type="button" className="lsc-xoa" onClick={() => setQ("")} aria-label="Xoá ô tìm">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>

        {boLoc && boLoc.khach_hang.length > 0 && (
          <label className={`lsc-field${khachId !== "" ? " is-active" : ""}`}>
            <span>Khách</span>
            <select value={khachId} onChange={(e) => setKhachId(e.target.value)}>
              <option value="">Tất cả</option>
              {boLoc.khach_hang.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten ?? `Khách #${k.id}`}
                </option>
              ))}
            </select>
          </label>
        )}

        {goc === "theo_lenh" && boLoc && boLoc.may.length > 0 && (
          <label className={`lsc-field${mayId !== "" ? " is-active" : ""}`}>
            <span>Máy</span>
            <select value={mayId} onChange={(e) => setMayId(e.target.value)}>
              <option value="">Tất cả</option>
              {boLoc.may.map((m) => (
                <option key={m.id} value={m.id}>
                  {(m.ten ?? `Máy #${m.id}`) + (m.ngung_dung ? " (ngừng dùng)" : "")}
                </option>
              ))}
            </select>
          </label>
        )}

        {dangLoc && (
          <button type="button" className="lsc-link" onClick={xoaLoc}>
            Bỏ lọc
          </button>
        )}
      </section>

      {/* Lỗi khi ĐÃ có bảng: giữ bảng cũ, báo một dòng phía trên. */}
      {loi && data && <BangLoi text="Không làm mới được bảng theo dõi." onRetry={load} />}

      {goc === "theo_may" ? (
        <TdsxTheoMay
          data={dataHien as TdsxTheoMayOut | null}
          dangTai={loading}
          rong={rong}
          onMo={setHoSoId}
        />
      ) : (
        <TdsxTheoLenh
          data={dataHien as TdsxTheoLenhOut | null}
          dangTai={loading}
          rong={rong}
          onMo={setHoSoId}
        />
      )}

      {hoSoId !== null && (
        <LenhSxHoSoView
          lsxId={hoSoId}
          onClose={dongHoSo}
          eventTick={tickTre}
          onMoDon={navigate ? (orderId) => navigate("don-hang-ban", { openOrderId: orderId }) : undefined}
        />
      )}
    </main>
  );
}

const DEM_RONG: TdsxDemBatThuong = {
  tre_han: 0, su_co: 0, tam_dung: 0, kcs_khong_dat: 0, may_hong: 0, chua_may: 0,
};
const MAY_RONG: TdsxTheoMayOut = { nhom: [], may_trong: [], bat_thuong: DEM_RONG };
const LENH_RONG: TdsxTheoLenhOut = { items: [], total: 0, bat_thuong: DEM_RONG };
```

`frontend/src/pages/theo-doi-san-xuat.css`:

```css
/* Màn Theo dõi sản xuất (làm gọn 05/10/2026). Khung, hàng lọc, dải bất thường, bảng, pill dùng
   chung ở `lenh-sx-chung.css` (`lsc-`); tệp này chỉ giữ phần RIÊNG của hai góc Theo máy / Theo lệnh
   và bảng chọn lệnh của việc ghép (`tdsxChonLenh.tsx`). Token lấy từ `styles/tokens.css`. */

/* ---------- góc Theo máy ---------- */
.tdsx-may td:first-child {
  white-space: nowrap;
}
.tdsx-nhom__dem {
  margin-left: var(--sp-2);
  color: var(--ash-2);
  font-weight: var(--fw-regular);
}
.tdsx-buoc {
  display: block;
  margin-top: 2px;
}
.tdsx-sl__dv {
  display: block;
  white-space: nowrap;
}
.tdsx-gio {
  white-space: nowrap;
}

/* Thẻ việc kế tiếp: 4 số cuối mã lệnh. Viền đủ bốn cạnh, hover `--rule-hair`. */
.tdsx-ke {
  padding: 2px 8px;
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  background: var(--canvas);
  color: var(--ink);
  font: inherit;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: pointer;
}
.tdsx-ke:hover {
  background: var(--rule-hair);
}
.tdsx-ke--gap {
  border-color: var(--signal);
  color: var(--signal);
}

/* Dòng gập "N máy đang trống". */
.tdsx-trong td {
  padding-top: 6px;
  padding-bottom: 6px;
  background: var(--paper);
}
.tdsx-trong:hover td {
  background: var(--paper) !important;
}
.tdsx-trong__nut {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border: 0;
  border-radius: var(--r-2);
  background: none;
  color: var(--ash);
  font: inherit;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  cursor: pointer;
}
.tdsx-trong__nut:hover {
  background: var(--rule-hair);
}
/* `chevron` mặc định chỉ xuống (mở); gập thì quay sang phải. */
.tdsx-trong__gap {
  transform: rotate(-90deg);
}

/* ---------- góc Theo lệnh ---------- */
.tdsx-lenh td:first-child {
  white-space: nowrap;
}
.tdsx-cat {
  margin: 0;
  color: var(--ash);
  font-size: var(--fs-xs);
}

/* --- popover chọn lệnh khi một việc phục vụ ≥2 lệnh (C123) — `position: fixed`, toạ độ JS truyền
 * qua `style.left/top`, giữ dưới lớp phủ hồ sơ (`z-index: 60`). Chép NGUYÊN từ bản trước. */
.tdsx-picker {
  position: fixed;
  z-index: 35;
  min-width: 240px;
  max-width: 320px;
  max-height: 280px;
  overflow-y: auto;
  background: var(--canvas);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  box-shadow: var(--shadow-lg);
}

.tdsx-picker__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--rule-soft);
  font-size: var(--fs-2xs);
  color: var(--ash);
}

.tdsx-picker__head button {
  margin-left: auto;
  appearance: none;
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--ash);
}

.tdsx-picker__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  border: 0;
  border-bottom: 1px solid var(--rule-hair);
  background: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--ink);
}

.tdsx-picker__row:last-child {
  border-bottom: 0;
}

.tdsx-picker__row:hover {
  background: var(--rule-hair);
}

.tdsx-picker__ma {
  font-weight: var(--fw-bold);
}
```

Xoá (git giữ lịch sử, khôi phục được bằng `git checkout <commit trước> -- <tệp>`):

```bash
git rm frontend/src/pages/TdsxKanban.tsx frontend/src/pages/TdsxTheoCa.tsx frontend/src/pages/TdsxGantt.tsx frontend/src/pages/tdsxTimeline.ts
grep -rn "hslsx\|lenh-san-xuat.css" frontend/src
```

Lệnh grep phải RỖNG rồi mới `git rm frontend/src/pages/lenh-san-xuat.css`. Còn dòng nào thì sửa chỗ đó trước (bẫy "CSS nhân đôi": đếm định nghĩa selector, đừng xoá mù).

- [ ] **Step 4: Chạy để thấy xanh**

Run: `npx vitest run src/pages/TdsxTheoMay.test.tsx src/pages/TdsxTheoLenh.test.tsx src/pages/TheoDoiSanXuatPage.test.tsx src/pages/LenhSanXuatPage.test.tsx src/pages/LenhSxHoSoView.test.tsx src/pages/lsxKhau.test.tsx` → PASS. Run: `npx tsc --noEmit` → không lỗi.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/TheoDoiSanXuatPage.tsx frontend/src/pages/TheoDoiSanXuatPage.test.tsx frontend/src/pages/TdsxTheoMay.tsx frontend/src/pages/TdsxTheoMay.test.tsx frontend/src/pages/TdsxTheoLenh.tsx frontend/src/pages/TdsxTheoLenh.test.tsx frontend/src/pages/theo-doi-san-xuat.css
git diff --cached --stat
git commit -m "Theo dõi SX: hai góc Theo máy (bảng theo nhóm máy) và Theo lệnh, dải bất thường lọc bảng; xoá Kanban, Theo ca, Gantt và lenh-san-xuat.css"
```

### Task 11: Bấm thử thật trên trình duyệt

**Files:** không đổi mã (lỗi tìm ra thì sửa ở tệp của task gốc, commit riêng "Sửa sau bấm thử: …").

- [ ] **Step 1: Dựng môi trường thử**

Máy chủ cổng 8010, giao diện cổng 5174, biến môi trường đặt INLINE trong lệnh chạy, DB là bản sao / DB trắng có `SEED_DEMO=true` (KHÔNG bật trên DB dev đang có dữ liệu). `npm install` trong `frontend/` của worktree nếu chưa có `node_modules`.

- [ ] **Step 2: Hồ sơ lệnh — bấm đúng luồng**

Đăng nhập; vào "Hồ sơ lệnh sản xuất". Ghi lại từng bước đã bấm/gõ/thấy:
1. Đầu màn chỉ có tiêu đề + số lệnh; KHÔNG còn 4 thẻ KPI. Bốn tab Tất cả / Đang sản xuất / Sau sản xuất / Đã giao đủ có số.
2. Gõ một mã lệnh vào ô tìm → bảng thu lại; bấm "Bỏ lọc" → về đủ.
3. Chọn một khách ở ô Khách; đặt "Hạn SX" từ–đến → số trên tab đổi theo.
4. Bấm tab "Sau sản xuất" → dòng có pill vàng (Đang KCS / Chờ nhập kho / Sẵn sàng giao).
5. Bấm mã một lệnh → hồ sơ mở: pill khâu, Khách, Đơn, Nhóm; ba ô Tiến độ / Hạn / Đã giao; năm nút neo; bấm từng nút neo cuộn đúng mục.
6. Mục Công đoạn: bấm một bước có chi tiết → dòng mở ra các mẻ; mục Vật tư: bấm ba nút lọc; mục Nhật ký: bật "Sản lượng, KCS".
7. "Quay lại danh sách" → tiêu điểm về đúng mã lệnh vừa bấm, tab/lọc giữ nguyên.

- [ ] **Step 3: Theo dõi sản xuất — bấm đúng luồng**

1. Mở màn → góc Theo máy: nhóm "Chưa có máy" (nếu có) đứng đầu, các nhóm máy, "Gia công ngoài"; dòng "N máy đang trống" cuối bảng, bấm mở/gập.
2. Dải bất thường: mục bằng 0 xám không bấm được; bấm một mục có số → bảng lọc, mục nền charcoal; bấm lại → bỏ.
3. Bấm "Theo lệnh" → bảng lệnh; chọn ô Máy; tải lại trang → vẫn ở Theo lệnh (localStorage).
4. Bấm mã lệnh trong bảng → hồ sơ mở đè; đóng → tiêu điểm về đúng nút.
5. Trên bàn tổ (màn Thực hiện sản xuất, tài khoản tổ trưởng ở cửa sổ khác) bấm Bắt đầu / Tạm dừng một việc → bảng Theo máy đổi tình trạng trong vòng ~1 giây, không phải tải lại.

- [ ] **Step 4: Điện thoại 375px**

Thu khung về 375px: trang không cuộn ngang, bảng cuộn ngang trong khung, ba ô tổng quan hồ sơ xếp dọc, phần đầu hồ sơ không dính. App chưa có chế độ tối — không có gì để thử ở mục đó.

- [ ] **Step 5: Báo cáo**

Liệt kê từng bước đã bấm, đã gõ, đã thấy; chỗ nào phải dựng dữ liệu bằng đường khác phải nói ngay trong báo cáo.

