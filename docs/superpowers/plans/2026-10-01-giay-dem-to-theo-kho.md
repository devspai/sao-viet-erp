# Giấy đếm theo TỜ × KHỔ, tổ Cắt chốt giấy sau phát hành — kế hoạch triển khai

> Làm tuần tự, mỗi Task một commit (message tiếng Việt, KHÔNG dòng Co-Authored-By). Verify: pytest nhắm
> file + `npx tsc` (KHÔNG chạy `./init.ps1` / pytest full — CI GitHub chạy cả bộ). Task có UI phải thao
> tác lại luồng thật trên trình duyệt, báo cáo từng bước đã bấm / gõ / thấy gì; không dùng API/curl thay
> bước nào. Không chạy `python` trần trong `backend/` (trỏ vào Postgres dev) — thăm dò bằng test tạm.
>
> Trước khi bắt đầu: `ke_hoach_vat_tu_service.py`, `giu_cho_service.py`, `test_giu_cho_vat_tu.py`,
> `GiuChoTheoLenhView.tsx` (và cả cụm kế toán / mua hàng trong `git status`) đang có thay đổi CHƯA
> COMMIT của phiên khác. Đợi phiên đó commit rồi mới tạo worktree từ `dev`; đừng stash / checkout hộ.

**Mục tiêu:** giấy đi suốt lệnh → kế hoạch vật tư → mua → kho bằng SỐ TỜ của một KHỔ; bỏ hẳn công thức
định mức giấy ra kg; phát hành xong lệnh có giấy tới tổ Cắt, tổ Cắt chèn bước cắt hoặc bấm "Không cần
cắt" thì bước mang giấy mới bắt đầu được.

**Kiến trúc:** một module nhỏ `services/kho_giay.py` giữ luật khổ/dạng/khoá; mọi tầng (kho, kế hoạch vật
tư, giữ chỗ, đề nghị cấp, mua) đổi khoá mặt hàng từ cặp `(loai, id)` sang bộ bốn `(loai, id, kho_rong,
kho_dai)` qua module đó. Tổ Cắt là một service mới `services/san_xuat/chot_giay.py` dùng lại phần thân
dựng công việc của phát hành; cổng "chờ tổ Cắt" là một nhánh trong `dau_vao.kiem_bat_dau`.

**Stack:** FastAPI · SQLAlchemy (không Alembic — migration tay trong `backend/app/db_migrations.py`) ·
React + TS · SSE in-process.

**Spec:** `docs/superpowers/specs/2026-10-01-giay-dem-to-theo-kho-design.md` (đọc cả §8 "Sửa lúc lập
plan").

## Ràng buộc chung (mọi Task)

- Khổ = hai số nguyên mm `kho_rong` (cạnh ngắn) · `kho_dai` (cạnh dài), NOT NULL default 0; 0 = không có
  cạnh đó. Chỉ chuẩn hoá qua `kho_giay.chuan_kho` — không nơi nào tự `min/max`.
- Dạng `dang_giay`: `"to"` | `"cuon"` | NULL (vật tư khác). Hằng `DANG_TO`, `DANG_CUON` ở `kho_giay`.
- So khổ = BẰNG NHAU tuyệt đối. Không so lớn/bé.
- Lô tờ đếm bằng mã đơn vị `ma_cua_tram(TRAM_TO_NGUYEN, ban_do_tram(db))`; lô cuộn đếm bằng
  `giay_nguyen.don_vi_gia`, phải thuộc họ Khối lượng. Không có phép đổi tờ ↔ kg ở đâu cả.
- Cột Boolean: `server_default=sa_false()` (Python bool), không `"0"`.
- Mỗi migration: hàm `_migrate_…` + `MIGRATIONS.append(("03xx_…", fn))` cuối `db_migrations.py`; lấy SỐ KẾ
  TIẾP của danh sách lúc làm (hiện cuối là `0347`; số trong plan chỉ để tham chiếu). Đọc siêu dữ liệu
  bằng `_existing_columns(insp, bảng)` TRƯỚC mọi ALTER. Đổi unique: chỉ nhánh Postgres (khuôn mg 0280,
  `db_migrations.py:12549-12558`) — SQLite test dựng bằng `create_all`.
- Thêm/bỏ cột ⇒ sửa `docs/DB_SCHEMA.md` cùng commit; mỗi Task có migration chạy kèm
  `tests/test_schema_documented.py`.
- Mọi `audit.create(...)` mới phải có nhãn trong `backend/app/audit_registry.py` (guard
  `tests/test_audit_registry.py`).
- Tiền chỉ trả khi có `kho:view_cost` ở MÁY CHỦ.
- Mã chặng / mã đơn vị không in thẳng ra UI — dịch qua tên đơn vị (`nhan_don_vi`) như chỗ khác.
- UI tiếng Việt, không chữ Anh.

## Đã cân nhắc và KHÔNG làm

- **Danh mục khổ giấy.** Khổ gõ số trên từng dòng; dư thì tề. Người dùng chốt 30/09.
- **So khổ lớn hơn / gợi ý lô to hơn để tề.** Người dùng chốt 01/10: chỉ đúng mã + đúng khổ.
- **Nới unique `lsx_cong_doan_vat_tu` thêm khổ.** Một bước một mã một khổ. Carton mặt/sóng/đáy là ba mã
  giấy khác nhau nên đủ dùng; nới ra là 4 đường ghi dòng vật tư phải đổi khoá.
- **Ô khổ riêng cho dòng giấy bài ghép.** Dẫn xuất từ quy cách bài (spec §4.2).
- **Tự quy cuộn ra tờ / tự gợi ý cắt.** Máy chỉ ghi nhận; người quyết.
- **Đổi ĐVT trên đơn mua.** Người dùng chỉ đòi sửa số lượng và khổ.
- **Cột Khoán ở bảng lương = 0.** Ngoài phạm vi (chờ màn Khoán theo kỳ).
- **Tạo `san_xuat_phu_thuoc` cho bước cắt chèn.** Công đoạn trước trong cùng lệnh tính lúc chạy từ tuyến
  lệnh (`cong_viec_chang_truoc`), bảng đó chỉ chứa cạnh chéo giữa các lệnh.

---

### Task 1: Gỡ "Công thức tính định mức" của Giấy và cụm lịch sử công thức

Giấy là danh mục DUY NHẤT còn truyền `cong_thuc_truong=` (`routers/vat_lieu_kho.py:122-124`), nên gỡ ô
là cả cụm lịch sử công thức thành code chết. Gỡ hết; nhật ký thao tác cũ (`audit_logs`) giữ nguyên.

**Files (backend, `backend/app/`):**
- Model: `models/vat_lieu_kho.py:67-77` bỏ `cong_thuc_luong` của `GiayNguyen`. Xoá
  `models/cong_thuc_lich_su.py`, gỡ import ở `models/__init__.py:133,313`.
- Schema: `schemas/vat_lieu_kho.py:60` (GiayIn), `:83-86` (GiayRow: `cong_thuc_luong`, `_truoc`,
  `_sua_luc`). Xoá `schemas/cong_thuc_lich_su.py`, `repositories/cong_thuc_lich_su_repo.py`.
- `routers/vat_lieu_kho.py:122-124`: bỏ `cong_thuc_truong=`.
- `services/catalog_base.py:33-34, 155, 187-190, 225-231, 402-416`: bỏ nhánh lịch sử công thức.
- `services/nhat_ky_danh_muc.py`: bỏ `:12-15`, `:29`, `:38-40` (`CONG_THUC_TRUONG`), `:654-669`
  (`_ghi_lich_su_cong_thuc`), `:680`. GIỮ `NHAN["cong_thuc_luong"]` `:170` (dùng ở `:536` cho
  `cong_doan_vat_tu`).
- `services/vat_lieu_kho_service.py:41`, `repositories/vat_lieu_kho_repo.py:23,29`,
  `services/catalog_excel_specs.py:321`, `seed_rebuild.py:71-76, 271-283`,
  `import_danh_muc_prod.py:16-21, 39, 100, 105`.
- Người ĐỌC công thức (đổi hành vi — chỉ gỡ nhánh giấy ở đây, nhánh mới làm ở Task 4/5):
  `services/lsx_service.py:716-721, 763-774` (nhánh `hang_loai == HANG_GIAY` của `_luong_vat_tu`: trả
  `so_luong=None`, `ly_do="Giấy lấy số tờ theo khổ — xem Task 4"` tạm thời, Task 4 thay);
  `services/ke_hoach_vat_tu_service.py:303-318` (nhánh công thức giấy của `_ve_goc`) và `ct_mat_hang`
  `:983, 1139, 1160, 1175-1182` — gỡ ở Task 5, Task này chỉ thay đọc cột bằng chuỗi rỗng để không vỡ.
- Chú thích: `services/bien_cong_thuc.py:103-105, 128-130, 160`, `models/don_vi_do.py:216`,
  `services/quy_doi_service.py:12` — sửa câu "tờ→kg là thứ DUY NHẤT…" cho đúng (giữ `LOAI_GIAY`,
  `LOAI_QUY_DOI`).
- Migration `0348_bo_cong_thuc_luong_giay`: Postgres + SQLite đều `ALTER TABLE giay_nguyen DROP COLUMN
  cong_thuc_luong` nếu cột còn (không index/FK; khuôn mg 0342 `:16158-16204`), rồi `DROP TABLE IF EXISTS
  cong_thuc_lich_su`. Phải là mg MỚI: mg 0195 thêm lại cột trên DB trắng.
- `docs/DB_SCHEMA.md`: bỏ cột ở `:3315, 3319, 3353, 3598, 3643`; bỏ khối `cong_thuc_lich_su`
  `:6337-6363`.

**Files (frontend, `frontend/src/`):**
- `pages/rebuildCatalogConfigs.tsx:474-481, 511-522`: bỏ ô định mức của Giấy (GIỮ `giayTheoCan` cho
  `congThucGiaGiay` `:470`).
- UI lịch sử công thức: `CatalogDrawer.tsx:412, 434-436`; `fields/FormulaField.tsx:6, 229-236, 901-906,
  1161-1168`; `api/rebuildCatalog.ts:122-124, 165-166`; `fields/KhoanCongDoan.tsx:59-61`.

**Tests:**
- Xoá `tests/test_cong_thuc_lich_su.py`.
- Sửa: `test_kiem_cong_thuc.py::test_api_giay_khong_nhan_cau_hong_o_ca_tao_lan_sua` (bỏ phần ô định
  mức); `test_import_excel.py` (`_dung_nen` `:200`, `test_xuat_du_moi_o_cong_thuc_dang_chay`
  `:319-322`); `test_import_danh_muc_prod.py:50`.
- Fixture đang truyền `cong_thuc_luong=` vào `GiayNguyen` — bỏ tham số:
  `test_don_vi_ncc_luu_ma.py::_giay_theo_to`, `test_giu_cho_vat_tu.py::_giay`,
  `test_mua_hang_khong_n_cong_1.py::_giay`,
  `test_purchases_api.py::test_sua_pmh_khong_duoc_xoa_lien_ket_mat_hang_goc`,
  `test_xep_lich_service.py::_ptg_2_in`, `test_ke_hoach_vat_tu.py::_giay` `:88-96`.
- Test công thức giấy hết nghĩa — XOÁ (Task 4/5 viết test thay):
  `test_ke_hoach_vat_tu.py::test_giay_khong_co_kho_o_danh_muc_van_quy_ra_kg_bang_kho_CUA_BAI`,
  `::test_dong_giay_cua_BUOC_KHONG_bi_chay_lai_cong_thuc_luong_cua_mat_hang`,
  `::test_dong_giay_cua_BAI_GHEP_VAN_chay_cong_thuc_luong_vi_no_mang_so_TO`;
  `test_lsx_service.py::test_goi_y_luong_co_ca_GIAY_va_ra_kg_bang_cong_thuc_cua_chinh_loai_giay` và test
  ở `:3440`.
- FE: `rebuildCatalogConfigs.test.tsx:123-135, 283-292, 294-301`; `FormulaField.test.tsx:221-261`.

- [ ] Viết test mới `tests/test_bo_cong_thuc_giay.py`:
  `test_api_giay_khong_con_o_cong_thuc_luong` (`GiayIn` không `extra="forbid"` ⇒ POST có
  `cong_thuc_luong` vẫn 200, trường bị bỏ qua; GET dòng Giấy không còn khoá `cong_thuc_luong`, `_truoc`,
  `_sua_luc`);
  `test_migration_0348_xoa_cot_va_bang` (SQLite: tạo bảng `giay_nguyen` có cột + bảng
  `cong_thuc_lich_su`, chạy hàm migration, kiểm `inspect` không còn cột/bảng; chạy lần hai không lỗi).
- [ ] Chạy, thấy FAIL.
- [ ] Gỡ code theo danh sách trên; thêm migration; sửa DB_SCHEMA.
- [ ] `pytest tests/test_bo_cong_thuc_giay.py tests/test_kiem_cong_thuc.py tests/test_import_excel.py
  tests/test_import_danh_muc_prod.py tests/test_schema_documented.py -q` + `cd frontend && npx tsc --noEmit` + `npx vitest run
  src/pages/rebuildCatalogConfigs.test.tsx src/fields/FormulaField.test.tsx`.
- [ ] Trình duyệt: Cấu hình danh mục → Giấy → mở một mã: không còn ô "Công thức tính định mức"; ô công
  thức GIÁ vẫn còn; lưu được.
- [ ] Commit `Giấy: gỡ công thức tính định mức (ra kg) và cụm lịch sử công thức`.

---

### Task 2: Kho — lô, phiếu, yêu cầu mang dạng + khổ

**Interfaces — Produces (mọi Task sau dùng):** `backend/app/services/kho_giay.py`:

```python
"""Khổ + dạng của giấy (spec 2026-10-01-giay-dem-to-theo-kho). MỘT nơi chuẩn hoá — đừng tự min/max."""
from __future__ import annotations

DANG_TO = "to"
DANG_CUON = "cuon"
DANG_GIAY = (DANG_TO, DANG_CUON)

#: Khoá so tồn / giữ chỗ / nhu cầu: (hang_loai, hang_id, kho_rong, kho_dai).
Khoa = tuple[str, int, int, int]


def _mm(x) -> int:
    try:
        v = int(round(float(x)))
    except (TypeError, ValueError):
        return 0
    return v if v > 0 else 0


def chuan_kho(a, b) -> tuple[int, int]:
    """Hai cạnh mm, thứ tự tuỳ ý → (cạnh ngắn, cạnh dài). Thiếu cạnh = 0; một cạnh ⇒ (cạnh, 0)."""
    x, y = _mm(a), _mm(b)
    if x and y:
        return (min(x, y), max(x, y))
    return (x or y, 0)


def dang_tu_kho(kho_rong: int, kho_dai: int) -> str:
    """Đủ hai cạnh ⇒ tờ, còn lại ⇒ cuộn. Chỉ dùng để ĐIỀN SẴN (chép từ dòng mua sang yêu cầu nhập)."""
    return DANG_TO if kho_rong and kho_dai else DANG_CUON


def khoa_ton(hang_loai: str, hang_id: int, *, dang: str | None = None,
             kho_rong=0, kho_dai=0) -> Khoa:
    """Vật tư: (loai, id, 0, 0). Giấy tờ: (giay, id, rộng, dài). Giấy cuộn: (giay, id, 0, 0) — cuộn
    gom theo mã, khổ rộng chỉ để xem. Giấy tờ thiếu khổ cũng ra (giay, id, 0, 0): nơi cần TỜ phải hỏi
    `la_khoa_to` trước khi tra tồn."""
    if hang_loai != "giay":
        return (hang_loai, int(hang_id), 0, 0)
    kr, kd = chuan_kho(kho_rong, kho_dai)
    if (dang or dang_tu_kho(kr, kd)) == DANG_CUON:
        return ("giay", int(hang_id), 0, 0)
    return ("giay", int(hang_id), kr, kd)


def la_khoa_to(k) -> bool:
    return len(k) == 4 and k[0] == "giay" and k[2] > 0 and k[3] > 0


def khoa_dong(hang_loai: str, hang_id: int, dang: str | None, kho_rong=0, kho_dai=0) -> tuple:
    """Khoá CHỐNG TRÙNG dòng trên một chứng từ (yêu cầu kho, phiếu, đề nghị cấp): cùng mã khác dạng/khổ
    là hai dòng hợp lệ."""
    if hang_loai != "giay":
        return (hang_loai, int(hang_id), None, 0, 0)
    kr, kd = chuan_kho(kho_rong, kho_dai)
    return ("giay", int(hang_id), dang or dang_tu_kho(kr, kd), kr, kd)


def nhan_kho(kho_rong: int, kho_dai: int) -> str:
    """"780 × 905 mm" · cuộn "khổ 1000 mm" · không có ⇒ "chưa có khổ"."""
    if kho_rong and kho_dai:
        return f"{kho_rong} × {kho_dai} mm"
    if kho_rong:
        return f"khổ {kho_rong} mm"
    return "chưa có khổ"
```

Cũng Produces: `VatLieuKhoService.don_vi_cua_mat_hang(hang_loai, hang_id, *, dang=None)` và
`quy_ve_goc(hang_loai, hang_id, dvt, so_luong, *, dang=None)`: giấy + `dang="to"` ⇒ đơn vị gốc = mã
chặng tờ nguyên, `ds` = các đơn vị đổi được về nó theo cặp ở module Đơn vị; giấy + `dang="cuon"` ⇒ gốc =
`don_vi_gia`, phải thuộc họ Khối lượng (không thì `VatLieuKhoValidationError("“C-300” đơn vị gốc không
phải khối lượng nên không nhập cuộn được — sửa đơn vị gốc ở danh mục Giấy.")`); giấy + `dang=None` ⇒ như
cũ (chỉ còn dùng cho đường không phải kho). `StockLotRepository.issuable_lots(hang, kho_id, *, dang=None,
kho_rong=0, kho_dai=0)`; `StockVoucherService.suggest_allocation(..., dang=None, kho_rong=0, kho_dai=0)`.

**Files:**
- Tạo `backend/app/services/kho_giay.py` (code trên).
- Model: `models/stock_lot.py` (`StockLot`), model dòng phiếu kho (`stock_voucher_lines`), model dòng
  yêu cầu kho (`stock_request_lines`) — mỗi bảng thêm `dang_giay String(8) nullable`, `kho_rong`,
  `kho_dai` `Integer NOT NULL server_default="0" default=0`.
- Migration `0349_kho_giay_dang_kho`: khuôn `_migrate_nhap_kho_thanh_pham_cot` `:14136-14175` (danh sách
  tuple, `_existing_columns`, ALTER ADD). Thêm chỉ mục `ix_stock_lots_giay_kho ON stock_lots (hang_loai,
  hang_id, dang_giay, kho_rong, kho_dai)`.
- Schema `schemas/stock.py`: `StockRequestLineIn` `:17`, `StockVoucherLineIn` `:442`, `StockLotOut`
  `:656`, Allocation `:703/:718` thêm 3 trường; validator: `hang_loai=="giay"` ⇒ `dang_giay` bắt buộc,
  `dang_giay=="to"` ⇒ đủ hai cạnh > 0; chuẩn hoá qua `chuan_kho`; hàng khác ⇒ ép `dang_giay=None, 0, 0`.
- `services/vat_lieu_kho_service.py:381-430, 443-484`: tham số `dang` như Interfaces.
- `services/stock_voucher_service.py`: `_quy_doi` `:99/:161` truyền `dang`; `create` `:136-192` chép 3
  trường; `_apply_post` `:271` — lô tạo ở `:340-361` mang `dang_giay/kho_rong/kho_dai` của dòng;
  `don_gia_nhap` = thành tiền dòng ÷ `sl_goc` (kiểm `gia_goc` `:346` đang ra đúng như thế; nếu đang là đơn
  giá theo ĐVT dòng thì sửa); `_validate_lines` `:282` khoá chống trùng thêm khổ qua `khoa_dong`;
  `_require_lot` `:255`: dòng giấy chọn lô khác dạng hoặc (tờ) khác khổ ⇒ lỗi "Lô … là khổ X, dòng xin khổ
  Y"; `suggest_allocation` `:881` chuyển bộ lọc xuống `issuable_lots`.
- `repositories/stock_voucher_repo.py:228-247`, `repositories/stock_lot_repo.py:141` (`create`), `:147`
  (`issuable_lots` lọc `dang_giay` + (tờ) đúng khổ), `:256` (`list_lots` nhận cùng bộ lọc).
- `services/stock_request_service.py`: `create` `:127`, `_validate_lines` `:261` (khoá `khoa_dong`);
  `repositories/stock_request_repo.py:42-59` (`_build_line`).
- Router `routers/kho_voucher.py`: `GET /lo/goi-y` `:556`, `GET /lo/danh-sach` `:816` nhận query
  `dang_giay`, `kho_rong`, `kho_dai`.
- FE `api/client.ts`: type dòng yêu cầu / phiếu / lô (`:8467, 9732, 9791, 9832, 9899`), `goiYLo` /
  `danhSachLo` `:14625/:14640` thêm tham số.
- FE `pages/KhoDeNghiPage.tsx`: `SeedLine` `:684`, `KhoNhapSeed` `:709`, `newLine` `:742`,
  `RequestDrawer` `:789`, `payloadLines` `:944`, `save` `:963`. Hàng Giấy: hiện ô "Dạng" (Tờ / Cuộn) và
  "Khổ (mm)" hai ô rộng × dài (cuộn: một ô khổ rộng, tuỳ chọn); ĐVT nạp lại theo dạng
  (`don_vi_cua_mat_hang(..., dang)` — thêm `dang` vào endpoint đang cấp dropdown ĐVT).
- FE `pages/KhoYeuCauPage.tsx`: `VoucherCreateDrawer` `:1695` (dòng nhập: cùng ô như trên), gọi
  `goiYLo/danhSachLo` `:1800-1829` kèm dạng + khổ của dòng, `toLotPick` `:1677` / `AllocRow` `:2338` hiện
  khổ lô, `VoucherDrawer` `:2776` hiện khổ dòng.
- `docs/DB_SCHEMA.md`: `stock_lots` `:5924` + hai bảng dòng.

**Tests** — tạo `tests/test_kho_giay.py`:

```python
from app.services.kho_giay import chuan_kho, khoa_dong, khoa_ton, la_khoa_to, nhan_kho


def test_chuan_kho_canh_ngan_truoc_va_lam_tron_mm():
    assert chuan_kho(905, 780) == (780, 905)
    assert chuan_kho("780", 905.4) == (780, 905)
    assert chuan_kho(1000, None) == (1000, 0)
    assert chuan_kho(None, 0) == (0, 0)


def test_khoa_ton_vat_tu_bo_kho_giay_to_giu_kho_cuon_gom_theo_ma():
    assert khoa_ton("vat_tu", 7, kho_rong=780, kho_dai=905) == ("vat_tu", 7, 0, 0)
    assert khoa_ton("giay", 3, dang="to", kho_rong=905, kho_dai=780) == ("giay", 3, 780, 905)
    assert khoa_ton("giay", 3, dang="cuon", kho_rong=1000) == ("giay", 3, 0, 0)
    assert khoa_ton("giay", 3, kho_rong=780, kho_dai=905) == ("giay", 3, 780, 905)
    assert la_khoa_to(("giay", 3, 780, 905)) and not la_khoa_to(("giay", 3, 0, 0))


def test_khoa_dong_cung_ma_khac_kho_la_hai_dong():
    assert khoa_dong("giay", 3, "to", 780, 905) != khoa_dong("giay", 3, "to", 800, 1090)
    assert khoa_dong("giay", 3, "to", 905, 780) == khoa_dong("giay", 3, "to", 780, 905)


def test_nhan_kho():
    assert nhan_kho(780, 905) == "780 × 905 mm"
    assert nhan_kho(1000, 0) == "khổ 1000 mm"
    assert nhan_kho(0, 0) == "chưa có khổ"
```

Thêm `tests/test_kho_lo_giay.py` (dựng nền bằng helper của `test_kho_de_nghi.py` — `_setup` `:100`,
`_mk_material` `:69`, `_nhap` `:142` — và `GiayNguyen` không có `cong_thuc_luong`; khai đơn vị
`to_nguyen`, `ram` + cặp `ram → to_nguyen` 500 bằng repo Đơn vị như fixture sẵn có làm với `ram → to`):
- `test_nhap_giay_to_sinh_lo_dung_kho_dem_to_nguyen`: phiếu nhập 2 ram C-300 dạng tờ khổ 905×780, thành
  tiền 2.000.000 ⇒ một lô `dang_giay="to"`, `kho_rong=780`, `kho_dai=905`, `sl_ban_dau=1000`, đơn vị gốc
  tờ nguyên, `don_gia_nhap=2000`.
- `test_nhap_giay_cuon_dem_kg`: nhập cuộn 500 kg khổ 1000 ⇒ lô `dang_giay="cuon"`, `kho_rong=1000`,
  `kho_dai=0`, `sl_ban_dau=500`.
- `test_nhap_cuon_cho_ma_don_vi_goc_khong_phai_khoi_luong_bao_loi`.
- `test_giay_thieu_dang_hoac_thieu_kho_to_bi_tu_choi` (422 / lỗi nghiệp vụ, câu tiếng Việt).
- `test_cung_ma_hai_kho_tren_mot_phieu_hop_le` và `test_cung_ma_cung_kho_hai_dong_bi_chan`.
- `test_goi_y_lo_chi_lay_dung_dang_va_kho`: có lô tờ 780×905, tờ 800×1090, cuộn ⇒ gợi ý cho dòng tờ
  780×905 chỉ ra lô đầu; cho dòng cuộn chỉ ra lô cuộn.
- `test_xuat_chon_lo_sai_kho_bi_chan`.
- `test_vat_tu_khac_khong_doi_hanh_vi` (dòng vật tư gửi dạng/khổ ⇒ bị ép NULL/0).

- [ ] Viết hai file test, chạy, FAIL.
- [ ] Tạo `kho_giay.py`, model + migration + schema + service + repo + router như Files.
- [ ] `pytest tests/test_kho_giay.py tests/test_kho_lo_giay.py tests/test_kho_de_nghi.py
  tests/test_kho_lo_goc.py -q`; FE `npx tsc --noEmit`.
- [ ] DB_SCHEMA + guard.
- [ ] Trình duyệt: Kho → Đề nghị nhập: chọn một mã Giấy ⇒ thấy ô Dạng + Khổ; chọn Tờ, gõ khổ 905 × 780,
  ĐVT chọn ram, số 2 ⇒ lưu; duyệt; lập phiếu nhập, ghi sổ ⇒ màn lô thấy "780 × 905 mm · 1.000 tờ
  nguyên". Đề nghị xuất 300 tờ khổ 780×905 ⇒ phiếu xuất, danh sách lô chỉ có lô đó.
- [ ] Commit `Kho: lô/phiếu/yêu cầu giấy mang dạng tờ-cuộn và khổ; lô tờ đếm tờ nguyên, cuộn đếm kg`.

---

### Task 3: Tồn và ngưỡng tồn theo khoá (mã, khổ)

**Interfaces — Consumes:** `kho_giay.khoa_ton`, `la_khoa_to`, `nhan_kho`. **Produces:**
`StockLotRepository.on_hand_map(hangs, kho_id=None)` nhận khoá 2 phần tử (hành vi cũ: gom mọi lô của mã)
HOẶC 4 phần tử (`Khoa`), trả dict khoá ĐÚNG như đầu vào. Luật khoá 4 phần tử: hàng khác giấy ⇒ gom theo mã;
giấy có đủ khổ ⇒ chỉ lô `dang_giay="to"` đúng khổ; giấy `(…, 0, 0)` ⇒ chỉ lô `dang_giay="cuon"`. Lô giấy
`dang_giay` NULL (dữ liệu cũ kg) không vào khoá 4 phần tử nào. `on_hand` và `on_hand_by_kho` cùng luật.

```python
def on_hand_map(self, hangs: list[tuple], kho_id: int | None = None) -> dict[tuple, float]:
    if not hangs:
        return {}
    keys = [tuple(h) for h in hangs]
    theo_ma = {(k[0], int(k[1])) for k in keys if len(k) == 2 or k[0] != "giay"}
    to = {(int(k[1]), int(k[2]), int(k[3])) for k in keys
          if len(k) == 4 and k[0] == "giay" and k[2] and k[3]}
    cuon = {int(k[1]) for k in keys if len(k) == 4 and k[0] == "giay" and not (k[2] and k[3])}
    base = [StockLot.trang_thai.in_(LOT_ISSUABLE)]
    if kho_id is not None:
        base.append(StockLot.kho_id == kho_id)
    sl = func.coalesce(func.sum(StockLot.sl_con_lai), 0)
    f_ma, f_to, f_cuon = {}, {}, {}
    if theo_ma:
        f_ma = {(l, h): float(t or 0) for l, h, t in self.db.execute(
            select(StockLot.hang_loai, StockLot.hang_id, sl)
            .where(tuple_(StockLot.hang_loai, StockLot.hang_id).in_(sorted(theo_ma)), *base)
            .group_by(StockLot.hang_loai, StockLot.hang_id))}
    if to:
        f_to = {(h, r, d): float(t or 0) for h, r, d, t in self.db.execute(
            select(StockLot.hang_id, StockLot.kho_rong, StockLot.kho_dai, sl)
            .where(StockLot.hang_loai == "giay", StockLot.dang_giay == "to",
                   tuple_(StockLot.hang_id, StockLot.kho_rong, StockLot.kho_dai).in_(sorted(to)),
                   *base)
            .group_by(StockLot.hang_id, StockLot.kho_rong, StockLot.kho_dai))}
    if cuon:
        f_cuon = {h: float(t or 0) for h, t in self.db.execute(
            select(StockLot.hang_id, sl)
            .where(StockLot.hang_loai == "giay", StockLot.dang_giay == "cuon",
                   StockLot.hang_id.in_(sorted(cuon)), *base)
            .group_by(StockLot.hang_id))}
    out: dict[tuple, float] = {}
    for k in keys:
        if len(k) == 2 or k[0] != "giay":
            out[k] = f_ma.get((k[0], int(k[1])), 0.0)
        elif k[2] and k[3]:
            out[k] = f_to.get((int(k[1]), int(k[2]), int(k[3])), 0.0)
        else:
            out[k] = f_cuon.get(int(k[1]), 0.0)
    return out
```

**Files:**
- `repositories/stock_lot_repo.py:197` (`on_hand`), `:212` (`on_hand_map` — code trên), `:233`
  (`on_hand_by_kho`).
- Người gọi phải chuyển sang khoá 4 phần tử khi có thể là giấy: `stock_request_service.py:532-548`
  (`levels_for`, `levels_and_on_hand`, `goi_y_kho_xuat` — khoá từ `khoa_ton` của dòng yêu cầu),
  `routers/kho_request.py:271` (`_levels`), `services/san_xuat/kho.py:447`. `public_scan.py:78`,
  `kho_voucher.py:931`, `delivery_service.py:271, 1428`: đọc từng chỗ — nếu mặt hàng có thể là giấy thì
  truyền khoá của LÔ / dòng; thành phẩm giữ cặp.
- Ngưỡng tồn: `models/stock_lot.py:132-174` thêm `kho_rong`, `kho_dai` (NOT NULL default 0), unique
  `uq_stock_thresholds_hang_kho` → `(hang_loai, hang_id, kho_id, kho_rong, kho_dai)` (GIỮ tên). Migration
  `0350_nguong_ton_theo_kho`: ADD hai cột; nhánh Postgres DROP + ADD CONSTRAINT như mg 0280.
- `repositories/...StockThresholdRepository` `stock_lot_repo.py:268` (`get_for`, `map_for`,
  `list_active`, `upsert`) khoá 4 phần tử. `schemas/stock.py:796` `StockThresholdIn` thêm `kho_rong`,
  `kho_dai` (giấy tờ: đủ hai cạnh; giấy cuộn: 0/0; hàng khác: ép 0/0). Router `kho_voucher.py:1002, 1012`.
  `stock_request_service.py:54` (`stock_level`), `:74` (`needs_alert`), `:677` (`notify_low_stock`) dùng
  khoá của lô vừa đổi.
- Báo cáo `routers/kho_baocao.py`: `_report_rows` `:123`, `/bao-cao/dong` `:204`, `_nxt_compute` `:346`,
  `/nxt` `:477`, xuất Excel `:949, :1118` — dòng giấy tách theo (mã, dạng, khổ) cho tờ; cuộn gom theo mã;
  cột "Khổ" mới; ĐVT dòng tờ là tờ nguyên, dòng cuộn là đơn vị gốc của mã. Tiền vẫn gate `kho:view_cost`.
- FE `pages/KhoTonKhoPage.tsx`: khoá nhóm `:318` `${hang_loai}:${hang_id}` → thêm `:${kho_rong}:${kho_dai}`
  cho giấy (cuộn `:0:0`); `MaterialGroup` `:77` / `MaterialRow` `:1196` hiện "C-300 · 780 × 905 mm" hoặc
  "C-300 · cuộn"; `levelOf` `:111`, `SetThresholdDialog` `:2647` gửi khổ. `KhoBaoCaoPage.tsx:187` cột Khổ.
- `docs/DB_SCHEMA.md` khối ngưỡng `:5967` (sửa luôn dòng `material_id` cũ `:5955-5963` nếu guard cho
  phép — không thì để nguyên).

**Tests** — `tests/test_kho_ton_theo_kho.py`:
- `test_on_hand_map_giay_to_dung_kho_cuon_theo_ma`: lô tờ 780×905 1000, tờ 800×1090 500, cuộn 300 kg ⇒
  `("giay",g,780,905)`→1000, `("giay",g,800,1090)`→500, `("giay",g,0,0)`→300, `("giay",g,650,860)`→0.
- `test_on_hand_map_cap_hai_phan_tu_giu_hanh_vi_cu` (vật tư).
- `test_lo_giay_cu_khong_dang_khong_vao_khoa_nao`.
- `test_nguong_ton_to_theo_kho_cuon_theo_ma` (hai ngưỡng cùng mã khác khổ cùng kho lưu được; cùng khổ ⇒
  upsert đè).
- `test_bao_cao_nxt_tach_dong_giay_theo_kho` + không có quyền giá vốn thì không có cột tiền.
- Sửa test cũ gọi `on_hand_map` với giấy (grep `on_hand_map` trong `tests/`).

- [ ] Test FAIL → làm → `pytest tests/test_kho_ton_theo_kho.py tests/test_kho_de_nghi.py
  tests/test_kho_baocao*.py -q` → `npx tsc --noEmit`.
- [ ] Trình duyệt: Kho → Tồn kho: C-300 hiện hai dòng theo hai khổ (đơn vị tờ nguyên) + một dòng cuộn
  (kg); đặt ngưỡng cho dòng 780×905 ⇒ dòng khổ kia không đổi. Báo cáo NXT có cột Khổ.
- [ ] Commit `Kho: tồn và ngưỡng tồn giấy theo (mã, khổ) đếm tờ; cuộn gom theo mã đếm kg`.

---

### Task 4: Dòng giấy của lệnh — khổ + số tờ, mặc định từ quy cách

**Interfaces — Consumes:** `chuan_kho`, mã đơn vị tờ nguyên (`ma_cua_tram(TRAM_TO_NGUYEN, ban_do_tram(db))`
— `services/dong_giay.py`). **Produces:** `lsx_cong_doan_vat_tu.kho_rong/kho_dai`; `vat_tu_goi_y` của
giấy trả `{hang_loai:"giay", vat_tu_id, so_luong, kho_rong, kho_dai, don_vi, dien_giai, ly_do}`.

**Luật mặc định** (spec §4.2), đọc quy cách lệnh (`quy_cach` truyền vào `_goi_y_luong_vat_tu`, cột
`lsx.so_to_nguyen`, `lsx.so_to_ke_hoach`):
- `kho = chuan_kho(qc["kho_nguyen_dai"], qc["kho_nguyen_rong"])`; nếu thiếu cạnh ⇒
  `chuan_kho(qc["kho_in_dai"], qc["kho_in_rong"])`.
- `so_luong = so_to_nguyen` nếu khổ lấy từ khổ nguyên, ngược lại `so_to_ke_hoach` (tờ vào máy). Số ≤ 0 ⇒
  `so_luong=None`, `ly_do="Lệnh chưa có số tờ — gõ tay."`. Không khổ nào ⇒ `ly_do="Lệnh chưa có khổ giấy
  — gõ tay."`.
- `don_vi` = mã tờ nguyên. KHÔNG còn công thức nào cho giấy.

**Files:**
- `models/lsx.py:355` `LsxCongDoanVatTu` thêm `kho_rong`, `kho_dai` (unique giữ nguyên). Migration
  `0351_kho_dong_giay_buoc` (ADD hai cột).
- `schemas/lsx.py`: `LsxBuocVatTuIn` `:110` thêm `kho_rong: int = 0`, `kho_dai: int = 0` (validator
  `chuan_kho`; `hang_loai=="giay"` mà thiếu cạnh ⇒ lỗi "Dòng giấy phải có khổ (rộng × dài, mm)."; hàng
  khác ép 0); `LsxBuocVatTuOut` `:122` thêm hai trường.
- `services/lsx_service.py`:
  - `_goi_y_luong_vat_tu` `:675`: giấy rẽ nhánh riêng theo luật trên (không gọi `_luong_vat_tu`);
    `_luong_vat_tu` `:737` bỏ hẳn nhánh giấy `:763-774` và tham số `hang_loai` nếu không còn ai cần.
  - `replace_routing` `:3007-3054`: ghi `kho_rong/kho_dai` (đã chuẩn hoá) vào `LsxCongDoanVatTu`; với giấy
    `don_vi_snapshot` = mã tờ nguyên (KHÔNG lấy `mon.don_vi_gia`).
  - `_cong_doan_dict` `:2348-2354` trả hai trường.
  - `_soi_danh_muc` `:2716` / `dong_bo_danh_muc` `:2793-2820`: dòng giấy KHÔNG so `don_vi_snapshot` với
    `don_vi_gia` của danh mục (đơn vị dòng giấy là tờ nguyên theo luật, so là báo "danh mục đã đổi" mãi).
- `bai_ghep_service.py:981, :1645` gọi `_goi_y_luong_vat_tu`: lọc giấy như cũ (bước chung bài không có
  dòng giấy) — chỉ kiểm không vỡ.
- `seed_kh_vat_tu.py:196`: dòng giấy seed ghi khổ + số tờ + đơn vị tờ nguyên.
- FE `pages/lsxBuoc.ts`: `EditRow.vat_tus` `:101` thêm `kho_rong`, `kho_dai`; `toEdit` `:180`, `toBody`
  `:372`. `pages/LsxBuocDrawer.tsx:874-1100`: chọn mã giấy (`capMon`) ⇒ điền `so_luong`, `kho_rong`,
  `kho_dai` từ `vat_tu_goi_y`; dòng giấy hiện hai ô "Khổ (mm)" sửa được + ĐVT "tờ nguyên" (tên đơn vị);
  `pages/LsxVatTuPanel.tsx` + `pages/lsxVatTu.ts` hiện "C-300 · 780 × 905 mm · 5.000 tờ nguyên".
  `api/client.ts` `LsxCongDoan.vat_tus` `:2731`, `vat_tu_goi_y` `:2739`, `LsxCongDoanBody.vat_tus` `:2767`.
- `docs/DB_SCHEMA.md` khối `lsx_cong_doan_vat_tu`.

**Tests** — trong `tests/test_lsx_service.py` (fixture `lenh_giay` `:3384`):
- `test_goi_y_giay_lay_kho_nguyen_va_so_to_nguyen`: quy cách `kho_nguyen_dai=905, kho_nguyen_rong=780`,
  `so_to_nguyen=5000` ⇒ gợi ý giấy `kho_rong=780, kho_dai=905, so_luong=5000`, `don_vi` = mã tờ nguyên.
- `test_goi_y_giay_thieu_kho_nguyen_lay_kho_in_va_so_to_in`.
- `test_goi_y_giay_khong_kho_khong_so_tra_ly_do`.
- `test_luu_dong_giay_chuan_hoa_kho_va_don_vi_to_nguyen` (gửi 905×780 ⇒ lưu 780×905; `don_vi_snapshot`
  là tờ nguyên dù `don_vi_gia` của mã là kg).
- `test_dong_giay_thieu_kho_bi_tu_choi`.
- `test_bang_danh_muc_doi_khong_bao_dong_giay_vi_don_vi`.
- Sửa `test_goi_y_luong_cho_MOI_vat_tu_de_drawer_dien_san` `:1401`,
  `test_replace_routing_upsert_giu_id_va_luu_vat_tu_phu_thuoc` `:2448`,
  `test_dong_vat_tu_cua_buoc_mang_hang_loai_va_cho_trung_id_khac_loai` `:3372`; `test_lsx_buoc_khai_tay.py`;
  FE `pages/lsxBuoc.test.ts`, `pages/lsxVatTu.test.ts`.

- [ ] Test FAIL → làm → `pytest tests/test_lsx_service.py tests/test_lsx_buoc_khai_tay.py -q`;
  `npx tsc --noEmit`; `npx vitest run src/pages/lsxBuoc.test.ts src/pages/lsxVatTu.test.ts`.
- [ ] Trình duyệt: Kế hoạch sản xuất → mở lệnh nháp có quy cách khổ nguyên → bước In → tab Vật tư → chọn
  C-300 ⇒ ô khổ tự điền 780 × 905, số tờ = số tờ nguyên; sửa khổ thành 800 × 1090 ⇒ lưu ⇒ mở lại thấy giữ
  số đã sửa.
- [ ] Commit `Lệnh SX: dòng giấy của bước ghi mã + khổ + số tờ nguyên, mặc định từ quy cách`.

---

### Task 5: Kế hoạch vật tư — giấy so tờ với tồn đúng mã + đúng khổ

**Interfaces — Consumes:** `on_hand_map` khoá 4 phần tử (Task 3), cột khổ dòng giấy (Task 4).
**Produces:** mọi dòng/nhóm của `can_doi` mang khoá `hang = Khoa` (4 phần tử) + trường `kho_rong`,
`kho_dai`; `nhu_cau_cua_cong_viec(cv)` trả thêm `kho_rong`, `kho_dai`, `dang_giay` (giấy: `"to"`);
`ve_don_vi_goc(hang_loai, hang_id, dvt, sl, *, dang=None)`; `hang_dang_mua_khong_ngay() -> set[Khoa]`;
`gom_de_nghi(chon)` gom theo `Khoa`, mỗi dòng ra có `kho_rong`, `kho_dai`.

**Files (`services/ke_hoach_vat_tu_service.py`, ~20 chỗ dùng khoá `hang`):**
- Dựng dòng: `_dong_lenh` `:1102` nhận `hang` 4 phần tử — gọi từ `:995-1007` với
  `khoa_ton(vt.hang_loai, vt.vat_tu_id, dang=DANG_TO if giấy else None, kho_rong=vt.kho_rong,
  kho_dai=vt.kho_dai)`. Vật tư bước chung bài `:1029` → `("vat_tu", id, 0, 0)`.
- Giấy BÀI `:974-984`: khổ theo spec §4.2 (`quy_cach_bien_bai` của bài qua
  `BaiGhepService.quy_cach_bien_cua_bai` `:1718`, thiếu thì `bg.kho_in_dai/kho_in_rong`), số tờ
  `so_to_dict["to_nguyen_can"]` hoặc `["tong_to"]`, `dvt` = mã tờ nguyên; bỏ `ct_mat_hang=True`.
- Gỡ công thức giấy: `_quy_cach_cua` `:226-260`, nhánh giấy `_ve_goc` `:262-331`, `_dv_giay` `:391-408`,
  `ct_mat_hang` ở `_dong_bai` `:1139`, `:1160`, `_quy_doi_dong` `:1175-1182`. `_ve_goc` cho giấy: `dvt` là
  mã tờ nguyên và `la_khoa_to(hang)` ⇒ `(sl, dvt)` nguyên vẹn; thiếu khổ ⇒ cờ cảnh báo mới
  `CB_GIAY_CHUA_KHO` "Dòng giấy chưa có khổ — sửa ở bước của lệnh."; đơn vị khác tờ nguyên (dòng cũ kg)
  ⇒ cờ `CB_KHONG_DOI_CHIEU` sẵn có. Không tra tồn cho dòng giấy không phải `la_khoa_to`.
- Đổi khoá 2 → 4 phần tử ở: `_ngay_can_cua` `:418`, `_da_cap_dang_linh` `:480/490` (khoá
  `(hang, lsx_id, bg_id)` với `hang` 4 phần tử; dòng yêu cầu kho đã có khổ từ Task 2), `nap_nen_quy_doi`
  `:506`, `_hang_dang_ve` `:549` (dòng đơn mua: `khoa_ton(loai, id, kho_rong=…, kho_dai=…)` — cột có từ
  Task 8; trước Task 8 đọc `getattr(..., 0)`), `hang_dang_mua_khong_ngay` `:600`, `_vet_mua_theo_hang`
  `:670/694`, `can_doi` `:772`, `_bo_buoc_da_xong` `:1068`, `_nap_mat_hang` `:1173` (`_objs` vẫn theo cặp
  mã), `_chay_con_tro` `:1199-1225`, `nhu_cau_cua_cong_viec` `:886-900`, `ve_don_vi_goc` `:912`, nhóm ra
  `:1264-1301`, `vat_tu_hieu_luc` `:778/813`, `_khoa_dong` `:149` (khoá 5 phần → thêm khổ, PHẢI khớp FE
  `VatTuKeHoachView.tsx:76`), `gom_de_nghi` `:1336-1401` (gom `:1378`, `nguon` `:1383`, dòng ra
  `:1392-1401` thêm `kho_rong/kho_dai`, `unit` = mã tờ nguyên cho giấy).
- `xep_lich/release.py:117`: `for (loai, hid) in tt["thieu"].keys()` → unpack 4 phần tử; giao với
  `hang_dang_mua_khong_ngay()` 4 phần tử. (Task 6 hạ cổng; ở đây chỉ để không vỡ.)
- Schema `schemas/ke_hoach_vat_tu.py`: `CanDoiNhom` `:90`, `DeNghiMuaDong` `:123`, `TheoLenhHang` `:140`,
  `DeNghiMuaDongOut` `:253` thêm `kho_rong`, `kho_dai`.
- Router `routers/ke_hoach_vat_tu.py:247-271` (đề nghị mua) chuyển khổ sang dòng YCMH (cột có ở Task 8 —
  Task này chỉ trả trong bản xem trước; Task 8 nối vào lúc tạo).
- FE `api/client.ts` `CanDoiDong` `:8733`, `CanDoiNhom` `:8796`, `CanDoiKhoaDong` `:8828`,
  `DeNghiMuaXemTruoc` `:8840`, `TheoLenhHang` `:8858`; `pages/VatTuKeHoachView.tsx` `khoa()` `:76` thêm
  khổ, tiêu đề nhóm giấy "C-300 · 780 × 905 mm", đơn vị tờ nguyên; `pages/GiuChoTheoLenhView.tsx` hiện khổ.

**Tests** — `tests/test_ke_hoach_vat_tu.py` (helper `_giay` `:88` bỏ công thức; `_lenh` `:126` thêm tham
số `kho=(780, 905)` gắn khổ lên dòng giấy; `_ton` `:177` thêm `dang`, `kho`):
- `test_giay_so_to_voi_lo_dung_kho`: lệnh cần 5.000 tờ 780×905; tồn lô tờ 780×905 3.000 + lô 800×1090
  9.000 + cuộn 2.000 kg ⇒ nhóm (C-300, 780×905) `ton=3000`, `tong_can=5000`, thiếu 2.000; không có nhóm
  nào cộng lô 800×1090 hay cuộn vào.
- `test_hai_lenh_khac_kho_cung_ma_la_hai_nhom`.
- `test_dong_giay_chua_kho_canh_bao_khong_tra_ton`.
- `test_dong_giay_cu_don_vi_kg_khong_doi_chieu` (dòng `don_vi_snapshot="kg"`).
- `test_giay_bai_ghep_lay_kho_nguyen_cua_bai_va_to_nguyen_can`, `test_giay_bai_ghep_thieu_kho_nguyen_lay_kho_in_va_tong_to`.
- `test_hang_dang_ve_chi_tinh_dong_mua_dung_kho` (đơn mua 79×109 không bù cho nhu cầu 80×109) — dựng dòng
  đơn mua có khổ bằng gán thẳng thuộc tính sau Task 8; trước đó đánh `xfail(strict=True)` kèm lý do, Task 8
  gỡ xfail.
- `test_de_nghi_mua_mang_kho_can`.
- Sửa test cũ khoá cặp: grep `("giay",` / `("vat_tu",` trong `test_ke_hoach_vat_tu.py`,
  `test_ke_hoach_vat_tu_so_truy_van.py` (giữ trần số câu SQL; nếu tăng vì truy vấn tờ/cuộn tách thì ghi
  lý do và số mới).

- [ ] Test FAIL → làm → `pytest tests/test_ke_hoach_vat_tu.py tests/test_ke_hoach_vat_tu_so_truy_van.py
  tests/test_xep_lich_van_de.py -q`; `npx tsc --noEmit`.
- [ ] Trình duyệt: Kế hoạch vật tư → thấy "C-300 · 780 × 905 mm" với tồn chỉ của đúng khổ; chọn dòng →
  Đề nghị mua → bản xem trước có khổ.
- [ ] Commit `Kế hoạch vật tư: giấy so số tờ với lô đúng mã + đúng khổ; gỡ quy đổi tờ→kg`.

---

### Task 6: Giữ chỗ theo (mã, khổ); bỏ cổng vật tư ở Xếp lịch, hạ cổng phát hành xuống cảnh báo

**Interfaces — Consumes:** `Khoa` (Task 2), `can_doi` khoá 4 phần tử (Task 5). **Produces:**
`giu_cho_service.Hang = Khoa`; `kiem_xuat(*, hang: Khoa, …)`, `tieu_thu(*, hang: Khoa, …)`,
`chuyen_dang_ve_sang_kho(hang: Khoa, …)`.

**Files:**
- `models/vat_tu_giu_cho.py:59` thêm `kho_rong`, `kho_dai`; chỉ mục `ix_giu_cho_hang` `:73` thêm hai cột
  (migration `0352_giu_cho_theo_kho`: ADD cột; DROP INDEX IF EXISTS + CREATE INDEX).
- `repositories/giu_cho_repo.py:16` `da_giu_map` gom theo 4 cột.
- `services/giu_cho_service.py` (đọc lại toàn file — có thay đổi chưa commit của phiên khác): alias
  `:53`, `ton_tu_do` `:123`, `_nhu_cau_theo_chu_the` `:135/:157`, `trang_thai` `:169/:223`,
  `_chu_the_dang_thieu` `:382`, `_them_mo_coi` `:401/416/420`, `_gom_theo_chu_the` `:452/463/503`,
  `doi_soat_dang_ve` `:591/617`, `nhat_them` `:673`, `chuyen_dang_ve_sang_kho` `:746/768`, `kiem_xuat`
  `:803/822`, `tieu_thu` `:833/846`, `_khoa_nguon` `:863/879`, `_lo_dang_ve` `:883`,
  `giu_theo_chu_the_hang` `:943`, `gan_giu_cho_vao_bang` `:1027/1047`, `_dong` `:1061`. Ghi `VatTuGiuCho`
  mang khổ.
- `services/stock_voucher_service.py:334, 387, 394`: gom `(hang, chu)` bằng `khoa_ton` của dòng phiếu.
- Bỏ cổng xếp lịch: xoá `xep_lich_service._chan_chua_giu_du` `:1210` và hai lời gọi `dua_vao_lsx`
  `:1290`, `dua_vao_bai_ghep` `:1308`; sửa tham chiếu chú thích ở `lsx_tong_quan.py:88`,
  `ke_hoach_vat_tu_service.py` (khối chú thích "Cửa chặn thật vẫn nguyên ở xếp lịch" ~`:1012-1019`).
- Hạ cổng phát hành: `services/xep_lich/release.py::van_de_vat_tu` `:150` (+ thân `:95-140`): mọi
  `issue("vat_tu_…", MUC_CHAN_PHAT_HANH, …)` → `MUC_CANH_BAO`, trả trong `canh_bao`, `chan` luôn rỗng.
  Câu giữ nguyên nội dung, bỏ vế "đã xếp lịch nghĩa là vật tư phải có chủ". Docstring module `:1-10` viết
  lại: soi để NÓI, không chặn (spec §4.3). `xep_lich_van_de_service.py:689` không đổi.
- FE: màn Xếp lịch đang bày vấn đề vật tư ở nhóm "chặn phát hành" — kiểm hiển thị đi theo `muc` (không
  hardcode mã `vat_tu_chua_du`); grep `vat_tu_chua_du` trong `frontend/src`.

**Tests:**
- `tests/test_giu_cho_vat_tu.py` (helper `_giay` `:88`, `_lenh` `:108` hết "0,08385 kg/tờ" — đổi sang
  số tờ + khổ; `_ton` `:147`, `_giay_hang` `:186`): `test_giu_cho_giay_theo_kho` (lô 780×905 không giữ
  cho nhu cầu 800×1090), `test_kiem_xuat_so_dung_kho`, `test_hang_ve_dung_kho_tu_giu`.
- `tests/test_xep_lich_service.py:543` `test_lenh_chua_khai_vat_tu_nao_bi_chan…` → viết lại thành
  `test_xep_lich_khong_chan_vi_vat_tu` (lệnh thiếu giấy vẫn đặt lịch được). Helper `_giu_cho_du` `:175`
  giữ nguyên (khoảng 20 file import, vô hại).
- `tests/test_xep_lich_van_de.py`, `test_san_xuat_release.py`, `test_san_xuat_release_update.py`,
  `test_san_xuat_buoc_ngoai_dong.py`, `test_san_xuat_lenh_phan_trang.py`, `test_lsx_tong_quan.py:38`: chỗ
  nào kỳ vọng `vat_tu_chua_du` ở `chan` → chuyển sang `canh_bao`; thêm `test_phat_hanh_duoc_khi_thieu_giay_va_co_canh_bao`.

- [ ] Test FAIL → làm → `pytest tests/test_giu_cho_vat_tu.py tests/test_xep_lich_service.py
  tests/test_xep_lich_van_de.py tests/test_san_xuat_release.py tests/test_san_xuat_release_update.py
  tests/test_lsx_tong_quan.py -q`; `npx tsc --noEmit`.
- [ ] Trình duyệt: Xếp lịch → đặt giờ cho một lệnh thiếu giấy ⇒ đặt được; bấm Phát hành ⇒ thấy cảnh báo
  vật tư (màu cảnh báo), vẫn phát hành được.
- [ ] Commit `Giữ chỗ giấy theo (mã, khổ); Xếp lịch và phát hành thôi chặn vì vật tư (chỉ cảnh báo)`.

---

### Task 7: Đề nghị cấp vật tư của tổ mang dạng + khổ

**Interfaces — Consumes:** `khoa_dong`, `khoa_ton`, `quy_ve_goc(..., dang=)`, `nhu_cau_cua_cong_viec`
(Task 5). **Produces:** `VatTuDeNghiDongIn{hang_loai, hang_id, dang_giay: Literal["to","cuon"]|None=None,
kho_rong: int=0, kho_dai: int=0, dvt, sl_yeu_cau=0.0, ly_do_chenh_lech=None}`.

**Files:**
- `models/san_xuat_vat_tu.py:78` `SanXuatVatTuDeNghiDong` thêm `dang_giay`, `kho_rong`, `kho_dai`;
  migration `0353_de_nghi_cap_kho_giay`.
- `schemas/san_xuat.py:1385` (`VatTuDeNghiDongIn`), `:1393`; schema ra của đề nghị (grep
  `SanXuatVatTuDeNghiDong` trong `schemas/`).
- `services/san_xuat/vat_tu_de_nghi.py`:
  - `_chuan_hoa` `:118`: `kh` và `khai` khoá bằng `khoa_dong(...)` (giấy dòng kế hoạch là `"to"` + khổ của
    nó); câu trùng "Một mặt hàng chỉ được khai một dòng" → "Một mặt hàng cùng dạng, cùng khổ chỉ được khai
    một dòng — gộp số lượng lại."; output `:207` thêm 3 trường.
  - `_ve_goc_dong` `:89`: bỏ nhánh (1) nội suy tỉ lệ cho GIẤY; giấy gọi
    `kh_svc.ve_don_vi_goc(loai, id, dvt, sl, dang=dang)` (tờ ⇒ về tờ nguyên, cuộn ⇒ về đơn vị gốc mã). Vật
    tư khác giữ nguyên ba nhánh.
  - `_don_vi_gui_kho` `:247`, `_lines_kho` `:286/:313`: dòng gửi kho mang dạng + khổ.
  - `tao` `:387`, `sua` `:504` lưu 3 trường.
- `services/san_xuat/board.py:866`: hiển thị khổ từ `nhu_cau_cua_cong_viec`.
- FE `pages/ThsxExecPanels.tsx`: `VatTuSection` `:1400` hiện "C-300 · 780 × 905 mm"; `vtPayloadLines`
  `:1843` gửi 3 trường; `VatTuDeNghiForm` `:1947`: thêm dòng ngoài kế hoạch là Giấy ⇒ chọn Dạng (Tờ /
  Cuộn) + Khổ (tờ: bắt buộc hai cạnh; cuộn: khổ rộng tuỳ chọn), ĐVT nạp theo dạng. `api/client.ts`
  `SxVatTuCapKeHoach` ~`:2028`, `SxVatTuCapDong` ~`:2039`, `SxVatTuCapDoiChieu` ~`:2068`,
  `SxVatTuDeNghiDongIn` `:2094`.

**Tests:**
- `tests/test_sx_vat_tu_de_nghi.py` (import `_giay`/`_lenh` từ `test_ke_hoach_vat_tu` `:225` — đã đổi ở
  Task 5): `test_xin_giay_ke_hoach_giu_dung_so_to_khong_quy_kg` (kế hoạch 5.000 tờ 780×905, xin 5.000 ⇒
  `sl_yeu_cau_goc=5000` tờ nguyên, không lý do), `test_xin_giay_khac_kho_la_dong_ngoai_ke_hoach_can_ly_do`,
  `test_to_cat_xin_cuon_khong_kho_rong` (công việc không có kế hoạch giấy, xin cuộn 300 kg + lý do ⇒ yêu
  cầu kho có dòng cuộn), `test_hai_kho_cung_ma_hai_dong`.
- `tests/test_sx_vat_tu_de_nghi_api.py`, `test_kho_de_nghi*.py` sửa theo.
- FE `pages/thsxVtPayload.test.ts`, `pages/thsxVtDonVi.test.ts`.

- [ ] Test FAIL → làm → `pytest tests/test_sx_vat_tu_de_nghi.py tests/test_sx_vat_tu_de_nghi_api.py
  tests/test_kho_de_nghi.py -q`; `npx tsc --noEmit`; `npx vitest run src/pages/thsxVtPayload.test.ts
  src/pages/thsxVtDonVi.test.ts`.
- [ ] Trình duyệt: Thực hiện SX → tổ In → mở việc In → Đề nghị cấp vật tư: dòng kế hoạch "C-300 · 780 ×
  905 mm · 5.000 tờ nguyên" → gửi ⇒ Kho → Đề nghị xuất thấy dòng đúng khổ, lập phiếu xuất chỉ chọn được lô
  đúng khổ.
- [ ] Commit `Đề nghị cấp vật tư: dòng giấy mang dạng + khổ, đếm tờ không quy kg`.

---

### Task 8: Mua hàng — khổ cần / khổ mua; đơn mua chọn dòng, sửa số lượng; nhập kho chép khổ

**Interfaces — Consumes:** `chuan_kho`, `dang_tu_kho`; `gom_de_nghi` trả khổ (Task 5). **Produces:**
`department_purchase_request_lines.kho_rong/kho_dai` (khổ cần), `purchase_request_lines.kho_rong/kho_dai`
(khổ mua); `_to_request_out` dòng có `kho_rong`, `kho_dai`.

**Files (backend):**
- Model `models/purchase.py` hai bảng dòng + migration `0354_mua_hang_kho_giay`.
- `schemas/purchase.py`: `PurchaseRequestLineIn` `:196`, `DepartmentPurchaseRequestLineIn` `:213`
  (`extra="forbid"` ⇒ phải khai trường), `PurchaseRequestBatchLineIn` `:268`, `PurchaseRequestLineOut`
  `:325`, `DepartmentPurchaseRequestLineOut` `:368`. Validator `chuan_kho`; hàng khác ép 0.
- `repositories/purchase_repo.py`: `PurchaseRequestLineInput` `:574`, `DepartmentPurchaseRequestLineInput`
  `:602`; ORM YCMH create `:869` / update `:982`; PMH create `:1294` / update `:1373`.
- `services/purchase_service.py`: `_clean_department_lines` `:1356` (build `:1391-1400`),
  `create_department_request` `:1414`, `update_department_request` `:1500`; `_chot_noi_dong` `:1880` —
  dòng đơn mua nối dòng yêu cầu mà KHÔNG gửi khổ ⇒ chép khổ cần làm mặc định (cạnh chỗ điền `hang_*`
  `:1910-1912`); gửi khổ ⇒ giữ khổ mua; `_clean_lines` `:1914` (build `:1958-1970`); `create_request`
  `:2026`, `create_requests_batch` `:2073`, `update_request` `:2159`; out `_to_request_out` `:3252` (dòng
  `:3275-3297`), `_to_department_request_out` `:3556` (`:3576`).
- `routers/ke_hoach_vat_tu.py:247-271`: tạo YCMH từ đề nghị mua truyền khổ của `gom_de_nghi`.
- `ke_hoach_vat_tu_service._hang_dang_ve` (Task 5) đọc khổ mua thật; gỡ `xfail` của
  `test_hang_dang_ve_chi_tinh_dong_mua_dung_kho`.

**Files (frontend):**
- YCMH: `pages/.../DepartmentPurchaseRequestsPage.tsx` (seed `:196`, openEdit `:220`, save `:265`),
  `RequestFormDrawer.tsx:26` (dòng `:145-205`): hàng Giấy hiện hai ô "Khổ cần (mm)"; `shared/helpers.ts`
  `cleanRequest` `:58`, `emptyLine` `:10`. Seed từ KHVT `KeHoachVatTuPage.tsx:87`, `KhoTonKhoPage.tsx:514`,
  `AppShell.tsx:146` mang khổ.
- Đơn mua `pages/mua-hang/phieu-mua-hang/PurchaseRequestsPage.tsx`:
  - `openCreatePurchaseRequest` `:430`: mỗi dòng thêm `chon: true`, `kho_rong/kho_dai` chép từ khổ cần.
  - `FormLine` (`shared/types.ts:29`) thêm `chon: boolean`, `kho_rong: number`, `kho_dai: number`.
  - `PurchaseFormDrawer.tsx:264-338`: cột tick đầu dòng (bỏ tick ⇒ dòng mờ, không gửi); số lượng thành ô
    nhập (> 0); hàng Giấy thêm hai ô "Khổ mua (mm)"; tên + ĐVT vẫn chỉ đọc. Dòng bỏ tick hiện ghi chú "Dòng
    yêu cầu vẫn mở — huỷ dòng ở phiếu yêu cầu nếu không mua nữa." (nút huỷ dòng sẵn có, mg 0233).
  - `cleanRequest` `:484`, body `createBatch` `:599-616`: chỉ gửi dòng `chon`, gửi `quantity`, `kho_rong`,
    `kho_dai`. Không đủ dòng nào được tick ⇒ chặn lưu "Chọn ít nhất một dòng.".
  - `fromRequest` `shared/helpers.ts:52` nạp khổ khi sửa.
- Nhập kho từ đợt giao `PurchaseRequestsPage.tsx:90-118` (`nhapKhoTuDot`): dòng giấy gửi
  `dang_giay: kho_dai > 0 && kho_rong > 0 ? "to" : "cuon"`, `kho_rong`, `kho_dai` của dòng đơn mua sang
  `POST /api/kho-request` (Task 2 đã nhận). Nút ở `DeliveriesBlock.tsx:296` / `PurchaseDetailDrawer.tsx:509`
  không đổi.
- `api/client.ts` `:6736, 7189, 7205, 7401`.

**Tests:**
- `tests/test_purchases_api.py` (helper `_department_request_payload` `:478`, `_batch_body` `:858`,
  `_giay_co_ncc` `:2428`): `test_ycmh_luu_kho_can_chuan_hoa`, `test_pmh_mac_dinh_chep_kho_can`,
  `test_pmh_sua_kho_mua_va_so_luong`, `test_pmh_chi_lay_dong_duoc_chon_dong_con_lai_van_mo` (YCMH 2 dòng,
  batch chỉ gửi 1 ⇒ dòng kia không có PMH, trạng thái dòng vẫn mở), `test_vat_tu_khac_ep_kho_0`.
- `tests/test_ycmh_trang_thai_api.py` không đổi kỳ vọng (chạy lại).
- `tests/test_kho_de_nghi.py`: `test_nhap_kho_tu_dot_giao_chep_kho_va_dang` — yêu cầu nhập có
  `purchase_delivery_id` + dòng giấy khổ ⇒ lưu đúng (chưa có test nào cho `purchase_delivery_id` — viết mới).
- `tests/test_ke_hoach_vat_tu.py::test_de_nghi_mua_tao_ycmh_co_kho` (qua router `/de-nghi-mua` `:982`).

- [ ] Test FAIL → làm → `pytest tests/test_purchases_api.py tests/test_ycmh_trang_thai_api.py
  tests/test_kho_de_nghi.py tests/test_ke_hoach_vat_tu.py -q`; `npx tsc --noEmit`.
- [ ] Trình duyệt: KHVT chọn hai dòng giấy (79×109 và 80×109) → Đề nghị mua ⇒ YCMH hai dòng có khổ cần.
  Mua hàng → lập đơn mua từ YCMH: bỏ tick dòng 79×109, sửa số lượng dòng 80×109 từ 10.000 thành 12.000,
  sửa khổ mua 80×109 → 79×109 rồi trả lại 80×109 ⇒ lưu ⇒ chi tiết đơn có đúng một dòng 12.000, khổ 800 ×
  1090 mm; YCMH dòng 79×109 vẫn mở. Kế toán duyệt → đợt giao → Nhập kho ⇒ form yêu cầu nhập điền sẵn Dạng
  Tờ, khổ 800 × 1090.
- [ ] Commit `Mua hàng: khổ cần/khổ mua; đơn mua chọn dòng và sửa số lượng; nhập kho từ đợt giao chép khổ`.

---

### Task 9: Cờ tổ Cắt `la_to_cat`

Nhân bản đúng đường của `la_to_in` (đích danh, KHÔNG kế thừa cây con).

**Produces:** `Department.la_to_cat: bool`; `RbacRepository.dept_ids_to_cat() -> set[int]`; `board.teams`
trả `la_to_cat`.

**Files:**
- `models/department.py:92` (cạnh `la_to_in`): `la_to_cat: Mapped[bool] = mapped_column(Boolean,
  nullable=False, server_default=sa_false(), default=False)`. Migration `0355_department_la_to_cat` (khuôn
  `_migrate_department_la_to_in` `:14458`).
- `schemas/rbac.py`: `DepartmentSummaryOut` `:60-64`, `DepartmentCreate` `:116-120`, `DepartmentUpdate`
  `:145-149`.
- `routers/rbac.py`: `create_department` `:279-281`; `update_department` `:327-341, 359-360` (luật "không
  gửi thì giữ nguyên" qua `model_fields_set`).
- `services/department_service.py`: `list_summaries` `:229`, `summary_of` `:266`, `create` `:338-379`,
  `update` `:405-483`.
- `repositories/rbac_repo.py`: `set_la_to_cat` (cạnh `:236`), `dept_ids_to_cat` (cạnh `:244`).
- `services/san_xuat/board.py:82` `teams()` trả `la_to_cat`.
- FE `api/client.ts` `interface Department` `:3177-3185`, `createDepartment` `:10267`, `updateDepartment`
  `:10320-10323`; `pages/nhan-su-luong/phong-ban/DepartmentsPage.tsx`: state `:320-322`, nạp `:698-699,
  769-770`, lưu `:935-936`, Switch Card mới "Tổ Cắt" cạnh "Tổ in" `:2832` (mô tả: "Lệnh có giấy sau phát
  hành tới tổ này để chốt cắt hay không cắt."), pill `:1839`.
- `docs/DB_SCHEMA.md:99-101`.

**Tests:** `tests/test_rbac_departments_api.py` (khuôn `:108-117`): tạo / sửa / không gửi thì giữ /
summary trả cờ; cờ không lan xuống tổ con.

- [ ] Test FAIL → làm → `pytest tests/test_rbac_departments_api.py -q`; `npx tsc --noEmit`.
- [ ] Trình duyệt: Nhân sự → Phòng ban → mở tổ Cắt → bật "Tổ Cắt" → lưu → mở lại thấy bật, pill hiện.
- [ ] Commit `Phòng ban: cờ Tổ Cắt (đích danh, không kế thừa)`.

---

### Task 10: Tổ Cắt chốt giấy sau phát hành

**Interfaces — Consumes:** `Department.la_to_cat`, `dept_ids_to_cat` (Task 9); `on_hand_map` (Task 3);
`gate_to` / `VIEC_THUC_HIEN` (`services/quyen_to.py:321, :33`). **Produces** (Task 11 dùng):

```python
# backend/app/services/san_xuat/chot_giay.py
CHOT_CAT = "cat"
CHOT_KHONG_CAT = "khong_cat"

def co_to_cat(db) -> bool: ...                       # có ít nhất một phòng ban la_to_cat
def chu_the_cua(cv) -> tuple[str, int] | None: ...    # ("lsx", id) | ("bai", id) của công việc
def la_buoc_mang_giay(db, cv) -> bool: ...            # spec §4.7
def da_chot(db, chu_the: tuple[str, int]) -> bool: ...
def ma_chu_the(db, chu_the: tuple[str, int]) -> str: ...   # "LSX-…" / mã bài
def danh_sach(db, *, team_id: int) -> list[dict]: ...
# (`ly_do_cho_chot` do Task 11 thêm vào cùng file.)
def chot(db, *, user, team_id: int, lsx_id: int | None, bai_ghep_id: int | None,
         cach: str, cong_doan_ids: list[int]) -> dict: ...
def go_chot(db, *, user, team_id: int, lsx_id: int | None, bai_ghep_id: int | None) -> dict: ...
```

```python
# backend/app/services/san_xuat/snapshot.py — tách thân vòng lặp của dung_cong_viec (hành vi KHÔNG đổi)
def cong_viec_buoc_bai(repo, *, so, tram, goi_id: int, phien_ban_so: int, bg_id: int, cd,
                       nhom_id: int | None, tieu_chi_theo_cd: dict) -> list[SanXuatCongViec]: ...
def cong_viec_buoc_lsx(repo, *, so, tram, goi_id: int, phien_ban_so: int, lsx_id: int, cd,
                       nhom_id: int | None, tieu_chi_theo_cd: dict) -> list[SanXuatCongViec]: ...
```

**Dữ liệu** (migration `0356_chot_giay_to_cat`):
- `lsx`, `bai_ghep`: `giay_chot_cach String(12) NULL`, `giay_chot_luc DateTime(tz) NULL`,
  `giay_chot_boi_id Integer NULL` (→ users.id, không FK như các cột `*_by` khác của bảng).
- `lsx_cong_doan`, `bai_ghep_cong_doan`: `chen_boi_to_cat Boolean NOT NULL server_default=sa_false()`.

**Luật (spec §4.6–4.7):**
- `la_buoc_mang_giay(cv)`: lệnh — `cv.lsx_cong_doan_id` có dòng `LsxCongDoanVatTu.hang_loai=="giay"`
  (truy vấn mẫu `gia_cong_ngoai_repo.py:281`); bài — `cv.bai_ghep_cong_doan_id` là bước chung có `thu_tu`
  nhỏ nhất của bài và `bai_ghep.giay_id` khác NULL.
- `danh_sach(team_id)`: team phải `la_to_cat`. Lấy lệnh/bài thuộc gói `GOI_DANG_PHAT_HANH` có bước mang
  giấy; mỗi dòng: `{chu_the: "lsx"|"bai", id, ma, ten, han, giay: [{ma, ten, kho_rong, kho_dai, so_to,
  don_vi_ten, ton_to_dung_kho}], cuon_cung_ma: [{ma_lo, kho_rong, sl_con_lai, don_vi_ten, kho_ten}],
  chot: {cach, luc, boi_ten} | None, sua_duoc: bool, cong_doan_chen_duoc: [{id, ma, ten}]}`. `sua_duoc` =
  chưa có công việc mang giấy nào bắt đầu và không bước chèn nào có mẻ. `cong_doan_chen_duoc` = công đoạn
  đang dùng có `team_id` trong `department_ids` (bảng `cong_doan_to`, `models/cong_doan.py:174-198`). Không
  trả tiền. Số tồn tờ dùng `on_hand_map` khoá 4 phần tử; lô cuộn đọc `list_lots` lọc `dang_giay="cuon"`.
- `chot(..., cach="khong_cat")`: ghi ba cột chốt. `cach="cat"`: `cong_doan_ids` khác rỗng, mỗi công đoạn
  có `team_id` trong `department_ids` (không thì lỗi "Công đoạn … không thuộc tổ này."). Rồi:
  - Lệnh: dời `thu_tu` mọi bước của lệnh `+= n`; tạo `LsxCongDoan` cho từng công đoạn (`thu_tu` 0..n-1,
    `cong_doan_id`, `ten`, `nhom`, `loai_buoc`, `don_vi_vao/ra` lấy từ công đoạn, `department_id=team_id`,
    `so_luong_vao/ra=0`, `chen_boi_to_cat=True`); cạnh `LsxCongDoanPhuThuoc` Cắtᵢ → Cắtᵢ₊₁ và Cắtₙ → bước
    mang giấy (bước có dòng giấy, `thu_tu` nhỏ nhất). Dựng công việc bằng `cong_viec_buoc_lsx` với gói
    hiện tại (`repo.goi_hien_tai_cua`, `san_xuat_repo.py:367`), `phien_ban_so=goi.version_hien_tai`,
    `nhom_id` của công việc cùng lệnh trong gói, `tieu_chi_theo_cd=repo.checklist_theo_cong_doan({…})`.
  - Bài: với MỖI lệnh thành viên làm như trên nhưng cạnh Cắtₙ → bước của lệnh đó bị bước chung đầu tiên
    của bài phủ (`BaiGhepCongDoanMap.lsx_step_key`); thêm MỘT `BaiGhepCongDoan` cho mỗi công đoạn cắt
    (`chen_boi_to_cat=True`, `thu_tu` trước mọi bước chung — dời các bước chung `+= n`) + `BaiGhepCongDoanMap`
    trỏ các bước cắt của thành viên; dựng công việc bằng `cong_viec_buoc_bai`.
  - Đã chốt rồi mà gọi `chot` ⇒ lỗi "Đã chốt — gỡ chốt trước khi chốt lại.".
- `go_chot`: chỉ khi `sua_duoc`; xoá công việc của bước chèn (kèm phân công nếu có), cạnh, `BaiGhepCongDoanMap`,
  `BaiGhepCongDoan`, `LsxCongDoan` có `chen_boi_to_cat=True`; trả `thu_tu` về liền mạch; xoá ba cột chốt.
  Bước chèn đã có mẻ ⇒ lỗi "Bước cắt đã ghi sản lượng — không gỡ được.".
- Quyền: `chot` / `go_chot` gọi `gate_to(db, user.id, team_id, VIEC_THUC_HIEN)`; team không `la_to_cat` ⇒
  lỗi. `danh_sach` dùng cùng kiểm quyền với `GET /work-items` của team đó.
- Audit: `audit.create(...)` hành động `san_xuat.chot_giay` ("Tổ Cắt chốt giấy") và `san_xuat.go_chot_giay`
  ("Tổ Cắt gỡ chốt giấy") — thêm vào khối `_HD += _dong("san_xuat", None, {...})` `audit_registry.py:~160-195`.
  Nội dung: mã lệnh/bài, cách chốt, tên các công đoạn chèn.
- SSE / chấm đỏ: lúc phát hành (`routers/xep_lich.py::_phat_goi_xuong_xuong` `:90`, cạnh `_cham_viec_moi`
  `:195`) — gói có lệnh/bài mang giấy và `co_to_cat` ⇒ với mỗi tổ `dept_ids_to_cat()`: `bao(db,
  kenh=kenh_to(to_id), loai="cho_chot_giay", actor_id=…)` + `hub.gui({"type": "san_xuat_cong_viec_changed"},
  **kem_ban_to(MAN_THEO_LENH, [to_id]))` (mẫu `routers/san_xuat.py:128-137`). Sau `chot` / `go_chot`: cùng
  sự kiện cho tổ Cắt + tổ của bước mang giấy (`bao(..., loai="viec_mo")` cho tổ đó khi chốt).
- `release_update.phat_hanh_cap_nhat` không đổi (không xoá/tạo lại công việc; bước chèn không lịch nhận
  `(None, None, None)` `:112-114`).
- Xếp lịch đặt lại giờ lệnh đã chốt cắt: bước chèn `so_gio/chay_phut = 0` nên `trai_lich` cho độ dài 0 —
  kiểm bằng test, không thêm nhánh.

**Router** `routers/san_xuat.py` (cạnh `GET /work-items` `:337`): `GET /chot-giay?team_id=`,
`POST /chot-giay` body `ChotGiayIn{team_id: int, lsx_id: int|None, bai_ghep_id: int|None,
cach: Literal["cat","khong_cat"], cong_doan_ids: list[int] = []}` (đúng một trong `lsx_id` / `bai_ghep_id`),
`POST /chot-giay/go` body `GoChotGiayIn{team_id, lsx_id|None, bai_ghep_id|None}`. Schema ở
`schemas/san_xuat.py`. Lỗi nghiệp vụ ⇒ 409/422 câu tiếng Việt như các endpoint cạnh đó.

**FE:**
- `api/client.ts`: type `ChotGiayDong`, `api.sanXuat.chotGiay.list/chot/go`.
- Tạo `frontend/src/pages/ThsxChotGiay.tsx`: khối "Chờ chốt giấy" trong `ThucHienSxPage.tsx` khi team đang
  chọn có `la_to_cat` (đặt trên danh sách việc, view `"danh_sach"` `:86`). Mỗi dòng: mã lệnh/bài + hạn;
  từng dòng giấy "C-300 · 780 × 905 mm · cần 5.000 tờ nguyên · tồn đúng khổ 3.000"; lô cuộn cùng mã (khổ
  rộng, kg, kho). Nút "Chèn bước cắt" mở hộp chọn công đoạn (tick nhiều, nút lên/xuống sắp thứ tự) →
  "Chèn"; nút "Không cần cắt — đủ giấy". Dòng đã chốt: nhãn "Đã chốt: chèn Cắt tờ · Nguyễn A · 08:12" /
  "Đã chốt: không cắt"; `sua_duoc` thì có "Gỡ chốt". Nút to, chữ to (màn xưởng). Nghe `san_xuat_cong_viec_changed`
  qua cơ chế sẵn có (`components/AppShell.tsx:654-680`, `lib/suKienNhom.ts:80-95`) để tự nạp lại — không
  bắt bấm tải lại.
- Chuỗi loại chấm đỏ mới `cho_chot_giay` — thêm nhãn ở nơi `viec_moi` đang được dịch (grep `viec_moi` trong
  `frontend/src` và `services/thong_bao_man.py`).

**Tests** — tạo `tests/test_san_xuat_chot_giay.py`. Nền: fixture `lenh_that` (`tests/lenh_sx_fixtures.py:282`,
CTP → In → Đóng gói, đã phát hành) + gắn dòng giấy lên bước In (`LsxCongDoanVatTu(hang_loai="giay", …,
kho_rong=780, kho_dai=905, so_luong=5000)`) + một phòng ban `la_to_cat=True` + công đoạn "Cắt tờ" có tổ đó
trong `department_ids` + người có `run_order` ở tổ Cắt (khuôn `_to_khoan` `test_san_xuat_thuc_thi.py:62`).
- `test_danh_sach_co_lenh_mang_giay_va_ton_dung_kho`.
- `test_khong_cat_ghi_chot`.
- `test_chen_cat_tao_buoc_dau_tuyen_canh_toi_buoc_in_va_cong_viec_cung_goi`: sau chốt, tuyến lệnh =
  Cắt tờ (thu_tu 0, `chen_boi_to_cat`) · CTP · In · Đóng gói; cạnh Cắt tờ → In; công việc Cắt tờ cùng
  `goi_id`, `department_id` = tổ Cắt; `cong_viec_chang_truoc(In)` = {CTP, Cắt tờ};
  `cong_viec_chang_truoc(CTP)` rỗng; `cong_viec_chang_truoc(Cắt tờ)` rỗng.
- `test_chen_hai_cong_doan_noi_chuoi`.
- `test_cong_doan_khong_thuoc_to_bi_tu_choi`, `test_to_khong_co_co_bi_tu_choi`, `test_khong_quyen_run_order_bi_tu_choi`.
- `test_go_chot_xoa_dung_buoc_chen_va_tra_thu_tu`; `test_go_chot_khi_buoc_cat_co_me_bi_chan`;
  `test_go_chot_khi_in_da_bat_dau_bi_chan`.
- `test_bai_ghep_chen_mot_cong_viec_cat_cho_ca_bai` (fixture bài: khuôn `test_gia_cong_phat_hanh.py` /
  `tests/gia_cong_fixtures.py`).
- `test_phat_hanh_cap_nhat_giu_buoc_chen` (khuôn `test_san_xuat_release_update.py:50` `_lsx_da_phat_hanh`).
- `test_audit_chot_va_go_chot` + `tests/test_audit_registry.py` xanh.
- `test_phat_hanh_bao_to_cat` (đếm `bao` / sự kiện hub — khuôn test SSE sẵn có của `_cham_viec_moi`, grep
  `viec_moi` trong `tests/`).
- `tests/test_san_xuat_release.py` chạy lại không đổi (tách hàm snapshot không đổi hành vi).

- [ ] Viết test, FAIL.
- [ ] Tách `cong_viec_buoc_bai` / `cong_viec_buoc_lsx` khỏi `dung_cong_viec` (`snapshot.py:428-500`);
  chạy `pytest tests/test_san_xuat_release.py tests/test_san_xuat_release_phan_doan.py -q` ⇒ xanh trước
  khi làm tiếp.
- [ ] Model + migration + DB_SCHEMA; service `chot_giay.py`; router + schema; audit; SSE ở phát hành.
- [ ] `pytest tests/test_san_xuat_chot_giay.py tests/test_san_xuat_release.py
  tests/test_san_xuat_release_update.py tests/test_audit_registry.py tests/test_san_xuat_board.py -q`.
- [ ] FE `ThsxChotGiay.tsx` + client; `npx tsc --noEmit`.
- [ ] Trình duyệt (hai tab: tab 1 tổ Cắt mở sẵn Thực hiện SX, tab 2 người xếp lịch): tab 2 phát hành lệnh
  có giấy ⇒ tab 1, KHÔNG tải lại, thấy chấm đỏ + toast + lệnh xuất hiện ở "Chờ chốt giấy" với dòng giấy và
  tồn đúng khổ. Bấm "Chèn bước cắt" → tick "Cắt tờ" → Chèn ⇒ danh sách việc của tổ Cắt có việc Cắt tờ của
  lệnh đó. Bấm "Gỡ chốt" ⇒ việc Cắt tờ biến mất, lệnh về "chờ chốt". Bấm "Không cần cắt — đủ giấy" ⇒ dòng
  ghi "Đã chốt: không cắt".
- [ ] Commit `Tổ Cắt: chốt giấy sau phát hành — chèn bước cắt đầu tuyến hoặc không cắt; báo tức thời`.

---

### Task 11: Cổng "chờ tổ Cắt" ở bước mang giấy

**Interfaces — Consumes:** `co_to_cat`, `la_buoc_mang_giay`, `chu_the_cua`, `da_chot`, `ma_chu_the`
(Task 10). **Produces:** `chot_giay.ly_do_cho_chot(db, cv) -> str | None`.

```python
# services/san_xuat/chot_giay.py
def ly_do_cho_chot(db, cv) -> str | None:
    """Spec §4.7. None = cổng này không chặn công việc."""
    if not co_to_cat(db) or not la_buoc_mang_giay(db, cv):
        return None
    ct = chu_the_cua(cv)
    if ct is None or da_chot(db, ct):
        return None
    return (f"Chờ tổ Cắt chốt giấy cho {ma_chu_the(db, ct)} — tổ Cắt chèn bước cắt hoặc bấm "
            f"\"Không cần cắt\" rồi mới bắt đầu được.")
```

```python
# services/san_xuat/dau_vao.py:208
def kiem_bat_dau(repo: SanXuatSanLuongRepository, cv) -> None:
    from .chot_giay import ly_do_cho_chot

    ly_do = ly_do_cho_chot(repo.db, cv)
    if ly_do:
        raise ValueError(ly_do)
    thieu = thieu_dau_vao(repo, cv)
    ...  # giữ nguyên phần còn lại
```

**Files:** `services/san_xuat/dau_vao.py:208`; `services/san_xuat/board.py:1275` (nơi đang gọi
`thieu_dau_vao` để HIỂN THỊ lý do chưa bắt đầu được) — hiện thêm lý do chờ tổ Cắt, ưu tiên trước lý do
thiếu đầu vào; FE thẻ việc / drawer (`ThsxLenhGroups.tsx`, `ThsxDrawer.tsx`) đang bày lý do đó — kiểm hiện
câu mới, nút Bắt đầu mờ. Nơi gọi `kiem_bat_dau` duy nhất là `thuc_thi.bat_dau` `:280` (không đổi).

**Tests** — thêm vào `tests/test_san_xuat_chot_giay.py` (cùng nền Task 10):
- `test_in_bi_chan_khi_chua_chot` (gọi `thuc_thi.bat_dau` cho công việc In ⇒ `ValueError` có "Chờ tổ Cắt").
- `test_ctp_khong_bi_cong_nay_chan` (công việc CTP bắt đầu được).
- `test_khong_cat_mo_in_ngay`.
- `test_chen_cat_in_van_cho_ban_giao_cua_cat` (sau chèn, In bị chặn bởi câu "Chưa nhận hàng từ công đoạn
  trước (Cắt tờ …)"; tổ Cắt ghi mẻ + bàn giao, tổ In xác nhận ⇒ In bắt đầu được — dùng helper
  `test_san_xuat_ban_giao.py` `_hai_cv` `:55`/`_to_dich` `:75` làm khuôn gọi service bàn giao).
- `test_buoc_cat_khong_bi_cong_cho_chot` (Cắt tờ bắt đầu được ngay).
- `test_khong_co_to_cat_thi_khong_chan`.
- `test_bai_ghep_buoc_chung_dau_bi_chan_khi_chua_chot`.
- `tests/test_san_xuat_dau_vao.py`, `test_san_xuat_thuc_thi.py`, `test_san_xuat_ban_giao.py` chạy lại: các
  fixture KHÔNG có phòng ban `la_to_cat` ⇒ hành vi cũ giữ nguyên.

- [ ] Test FAIL → làm → `pytest tests/test_san_xuat_chot_giay.py tests/test_san_xuat_dau_vao.py
  tests/test_san_xuat_thuc_thi.py tests/test_san_xuat_ban_giao.py tests/test_san_xuat_board.py -q`;
  `npx tsc --noEmit`.
- [ ] Trình duyệt: tổ In mở việc In của lệnh chưa chốt ⇒ thấy câu "Chờ tổ Cắt chốt giấy cho LSX…", bấm Bắt
  đầu bị từ chối với đúng câu đó. Tổ Cắt bấm "Không cần cắt" ⇒ tab tổ In tự cập nhật (không tải lại), Bắt
  đầu được.
- [ ] Commit `Thực hiện SX: cổng "chờ tổ Cắt" ở bước mang giấy`.

---

### Task 12: Xác minh trọn luồng trên trình duyệt + dọn tài liệu

Không code mới (lỗi tìm ra thì sửa trong Task tương ứng và commit riêng). DB dev đang có dữ liệu ⇒ KHÔNG
bật `SEED_DEMO`; dựng dữ liệu bằng tay qua UI.

- [ ] Migration trên Postgres TRẮNG: tạo tạm một database rỗng trên Postgres dev (cổng xem `docker ps`),
  khởi động uvicorn của worktree trỏ vào đó với `SEED_DEMO=false` ⇒ log không lỗi migration, `python -m
  app.khoi_tao_admin` chạy được; xong DROP database tạm. (Bắt lỗi `create_all` + mg 0195→0348 trên DB
  trắng mà SQLite không thấy.)
- [ ] Khai trước bằng UI: phòng ban tổ Cắt bật cờ; công đoạn "Cắt tờ", "Cắt xả cuộn" có tổ Cắt phụ trách;
  module Đơn vị có cặp ram → tờ nguyên 500; mã giấy C-300 đơn vị gốc kg.
- [ ] Luồng 1 (cắt): lập lệnh có bước In mang C-300 780 × 905, 5.000 tờ → KHVT thấy thiếu đúng khổ → Đề nghị
  mua → thu mua lập đơn mua bỏ tick một dòng, sửa số → kế toán duyệt → đợt giao → nhập kho lô 800 × 1090 →
  xếp lịch + phát hành (thấy cảnh báo vật tư, vẫn phát hành) → tab tổ Cắt thấy lệnh ngay → chèn Cắt tờ →
  tổ In bấm Bắt đầu bị chặn → tổ Cắt đề nghị cấp lô 800 × 1090 (kho xuất), ghi mẻ, bàn giao → tổ In xác
  nhận, Bắt đầu được → tổ Cắt tạo yêu cầu nhập kho tờ 780 × 905 đã cắt → tổ In đề nghị cấp chọn đúng lô
  780 × 905.
- [ ] Luồng 2: lệnh khác → phát hành → tổ Cắt "Không cần cắt" → In bắt đầu ngay.
- [ ] Báo cáo: liệt kê từng bước đã bấm / gõ / thấy gì; bước nào phải dựng bằng API thì nói thẳng lúc báo.
- [ ] Cập nhật memory: `cong-thuc-luong-khai-o-dau.md` (phần giấy lỗi thời), `giay-theo-to-kho-dang-ban.md`
  → đã làm; `docs/DOMAIN_NHA_MAY_IN.md` nếu có đoạn "giấy tính kg theo công thức".
- [ ] Commit tài liệu `Giấy theo tờ × khổ: cập nhật tài liệu sau xác minh trọn luồng`.
