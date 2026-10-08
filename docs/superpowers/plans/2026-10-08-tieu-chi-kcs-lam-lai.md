# Làm lại Tiêu chí KCS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Danh mục Tiêu chí KCS thành màn hai ô (một câu chữ / tiêu chí, kéo thả, chép nhiều đích) và bước KCS cuối gộp tiêu chí của cả chuỗi (kể cả lệnh phụ trong nhóm), xét theo thẻ công đoạn.

**Architecture:** Backend giữ phân tầng routers → services → repositories. Gộp tiêu chí ở lúc ĐỌC qua một module mới `services/san_xuat/kcs_checklist.py` (chuỗi theo nhóm + danh sách gộp + kiểm kết quả), mọi chỗ đọc/ghi checklist đi qua nó. Luật số đạt → yêu cầu nhập kho KHÔNG đổi. Frontend thay `KcsKhaiBaoPage` bằng trang mới trong `pages/danh-muc/kcs-tieu-chi/`, và thay khối tiêu chí + số lỗi của `KcsKiemForm` (bước cuối) bằng thẻ công đoạn; logic thuần tách ra file `.ts` có test.

**Tech Stack:** FastAPI + SQLAlchemy (Postgres dev/prod, SQLite test), pytest; React + TypeScript + Vite, vitest.

**Spec:** `docs/design-tieu-chi-kcs-lam-lai.md` (mockup: `docs/mockups/tieu-chi-kcs-chot.html`, `docs/mockups/kcs-cuoi-tieu-chi-3-phuong-an.html` cách 3, `docs/mockups/tieu-chi-kcs-chep-3-phuong-an.html` cách 2).

## Global Constraints

- KHÔNG Alembic: đổi cột qua `backend/app/db_migrations.py` (mg kế tiếp sau `0380`, kiểm lại số lớn nhất ngay trước khi ghi). Cập nhật `docs/DB_SCHEMA.md` cùng lúc (guard test).
- Migration chỉ raw SQL đích danh cột, không ORM full-select.
- Không chạy `./init.ps1`, không chạy pytest cả bộ; chạy `python -m pytest tests/<file> -q` từ `backend/`, `npx tsc --noEmit` + `npx vitest run <file>` từ `frontend/`.
- `python -c` trần trong `backend/` trỏ vào Postgres DEV — thăm dò bằng test tạm, không bằng `python -c`.
- Không commit khi chủ chưa bảo; message tiếng Việt, không Co-Authored-By.
- UI tiếng Việt; không chữ đậm (font-weight ≤ 500); màu CHỈ ở chip giai đoạn (`--tt-cyan` Trước in, `--tt-xanh` In, `--tt-tim` Gia công sau in, `--tt-cam` Khác); chữ đỏ cho mục hỏng, chữ vàng cho "câu đã có, sẽ bỏ qua"; hover `--rule-hair`; dòng chọn viền đủ bốn cạnh.
- Không nối mẩu dữ liệu bằng dấu `·` hay dấu phẩy trong UI.
- Pydantic nuốt field im lặng: field mới phải đi đủ dict → schema → type TS.
- Số lỗi ở mọi thẻ đếm theo đơn vị BƯỚC CUỐI.

---

### Task 1: Migration, model, snapshot, DB_SCHEMA

**Files:**
- Modify: `backend/app/models/san_xuat_kcs.py` (class `SanXuatKcsTieuChi`, comment `checklist_json`)
- Modify: `backend/app/db_migrations.py` (thêm mg `0381_kcs_tieu_chi_mot_cau`)
- Modify: `backend/app/repositories/san_xuat_repo.py:281` (`checklist_theo_cong_doan` bỏ lọc `active`)
- Modify: `backend/app/services/san_xuat/snapshot.py:324` (`_checklist` bỏ `huong_dan`, `bat_buoc`, `nguon`)
- Modify: `docs/DB_SCHEMA.md` (bảng `san_xuat_kcs_tieu_chi`, cột `checklist_json`, `kcs_tieu_chi_json`)
- Test: `backend/tests/test_migration_0381_kcs_tieu_chi_mot_cau.py`

**Interfaces:**
- Produces: model `SanXuatKcsTieuChi(id, ma, cong_doan_id, ten, thu_tu, version, created_at, updated_at)`; snapshot item `{tieu_chi_id, ma, ten, thu_tu}`.

- [ ] Step 1: test migration — dựng bảng cũ bằng raw SQL trên SQLite (cột `bat_buoc`, `active`, `huong_dan`, `thu_tu` toàn 0), chạy `_migrate_kcs_tieu_chi_mot_cau`, kiểm: dòng `active=false` mất, ba cột hết, `thu_tu` mỗi công đoạn là 1..n theo (thu_tu, id), chạy lại vô hại.
- [ ] Step 2: chạy test → FAIL (chưa có hàm).
- [ ] Step 3: viết migration:

```python
def _migrate_kcs_tieu_chi_mot_cau(db) -> None:
    """mg 0381 — Tiêu chí KCS chỉ còn MỘT câu chữ (08/10/2026, docs/design-tieu-chi-kcs-lam-lai.md):
    xoá dòng ngừng dùng TRƯỚC (không được sống lại), đánh lại `thu_tu` 1..n mỗi công đoạn (server tự
    gán từ nay; dữ liệu cũ hay để 0 nên khoá kết quả `thu_tu` từng trùng), rồi DROP `bat_buoc`,
    `active`, `huong_dan`. Chạy lại vô hại."""
    insp = inspect(db.get_bind())
    if "san_xuat_kcs_tieu_chi" not in insp.get_table_names():
        return
    cols = _existing_columns(insp, "san_xuat_kcs_tieu_chi")
    if "active" in cols:
        db.execute(text("DELETE FROM san_xuat_kcs_tieu_chi WHERE active = false"))
    rows = db.execute(text(
        "SELECT id, cong_doan_id, thu_tu FROM san_xuat_kcs_tieu_chi "
        "ORDER BY cong_doan_id, thu_tu, id")).all()
    dem: dict[int, int] = {}
    for id_, cd, tt in rows:
        dem[cd] = dem.get(cd, 0) + 1
        if tt != dem[cd]:
            db.execute(text("UPDATE san_xuat_kcs_tieu_chi SET thu_tu = :t WHERE id = :i"),
                       {"t": dem[cd], "i": id_})
    for cot in ("bat_buoc", "active", "huong_dan"):
        if cot in cols:
            db.execute(text(f"ALTER TABLE san_xuat_kcs_tieu_chi DROP COLUMN {cot}"))
    db.commit()


MIGRATIONS.append(("0381_kcs_tieu_chi_mot_cau", _migrate_kcs_tieu_chi_mot_cau))
```

- [ ] Step 4: model bỏ ba cột (giữ `thu_tu` default 0), cập nhật docstring; `checklist_theo_cong_doan` bỏ điều kiện `active`; `_checklist` trả `{"tieu_chi_id", "ma", "ten", "thu_tu"}`.
- [ ] Step 5: DB_SCHEMA: xoá ba dòng cột, ghi chú mg 0381 trong Purpose, sửa "Tất cả cột"; `checklist_json` ghi `[{cong_viec_id, thu_tu, dat, ghi_chu}]` (phần tử cũ thiếu `cong_viec_id` = của chính công việc); `kcs_tieu_chi_json` ghi khoá `{tieu_chi_id, ma, ten, thu_tu}`.
- [ ] Step 6: chạy `tests/test_migration_0381_kcs_tieu_chi_mot_cau.py tests/test_schema_documented.py tests/test_san_xuat_release.py` → PASS (sửa assert release nào còn đòi `bat_buoc`/`huong_dan`).

### Task 2: API danh mục — khai-bao gọn, thêm/sửa chỉ câu chữ, sắp xếp, chép

**Files:**
- Modify: `backend/app/schemas/san_xuat_kcs_tieu_chi.py`
- Modify: `backend/app/repositories/san_xuat_kcs_tieu_chi_repo.py`
- Modify: `backend/app/services/san_xuat_kcs_tieu_chi_service.py`
- Modify: `backend/app/routers/san_xuat_kcs_tieu_chi.py`
- Modify: `backend/tests/test_san_xuat_kcs_tieu_chi.py`

**Interfaces:**
- Produces (HTTP):
  - `GET /api/san-xuat-kcs-tieu-chi/khai-bao?q=` → `{giai_doan: [{nhom, cong_doan: [{cong_doan_id, ma, ten, nhom, hang_muc: [{id, ma, cong_doan_id, ten, thu_tu}]}]}]}` — gồm cả công đoạn đang dùng CHƯA có tiêu chí (`hang_muc: []`); `q` khớp mã/tên công đoạn hoặc câu chữ tiêu chí ⇒ giữ công đoạn kèm ĐỦ tiêu chí của nó.
  - `POST ""` body `{cong_doan_id, ten}` → row; server gán `thu_tu = max + 1`.
  - `PUT /{id}` body `{cong_doan_id, ten}`.
  - `DELETE /{id}` (xoá cứng).
  - `PUT /sap-xep` body `{cong_doan_id, ids}` → `{cong_doan_id, hang_muc: [row]}`; lệch tập id ⇒ 400.
  - `POST /chep` body `{den_cong_doan_ids, tieu_chi: [str]}` → `{da_chep, bo_qua, theo_dich: [{cong_doan_id, da_chep, bo_qua}]}`; một giao dịch.
- Service: `SanXuatKcsTieuChiService.sap_xep(cong_doan_id, ids, actor_id) -> list[row]`, `.chep(den_cong_doan_ids, tieu_chi, actor_id) -> dict`.

- [ ] Step 1: viết test mới (thay các test `active`/`bat_buoc` cũ):
  - thêm hai tiêu chí ⇒ `thu_tu` 1, 2 (client không gửi);
  - `sap_xep(cd, [b, a])` ⇒ `thu_tu` a=2, b=1; thiếu id / id công đoạn khác ⇒ `SanXuatKcsTieuChiValidationError`;
  - `chep([cd2, cd3], ["A", " B ", "A", ""])` ⇒ rỗng ⇒ lỗi; bỏ `""` thì: cd2 đã có "B" ⇒ `theo_dich` cd2 `da_chep=1 bo_qua=1`, cd3 `da_chep=2`; `thu_tu` nối tiếp;
  - `chep` vào công đoạn không tồn tại ⇒ lỗi và KHÔNG đích nào được ghi;
  - `khai_bao(db, None)` trả cả công đoạn chưa có tiêu chí, `q="ben"` khớp câu chữ trả đủ tiêu chí của công đoạn đó; số truy vấn cố định (giữ test N+1, ≤ 2).
- [ ] Step 2: chạy → FAIL.
- [ ] Step 3: schema: `SanXuatKcsTieuChiIn{ma?, cong_doan_id, ten}`; Row `{id, ma, cong_doan_id, ten, thu_tu, created_at?, updated_at?}`; `KcsKhaiBaoCongDoanOut` thêm `nhom`; `KcsKhaiBaoOut{giai_doan}`; thêm `KcsSapXepIn{cong_doan_id, ids: list[int]}`, `KcsChepIn{den_cong_doan_ids: list[int] (min 1), tieu_chi: list[str] (min 1)}`, `KcsChepDichOut`, `KcsChepOut`, `KcsSapXepOut{cong_doan_id, hang_muc}`.
- [ ] Step 4: repo: `fields = ("cong_doan_id", "ten", "thu_tu")`, `commit_on_write = False`; `thu_tu_tiep(cong_doan_id) -> int`; `cua_cong_doan(cong_doan_id) -> list` (theo thu_tu, id); `ten_theo_cong_doan(ids) -> dict[int, set[str]]`; `hang_muc_theo_cong_doan(db, *, q=None)` — khớp `q` thì lấy tập `cong_doan_id` khớp (mã/tên công đoạn hoặc câu chữ) rồi trả ĐỦ tiêu chí của các công đoạn đó; `cong_doan_gon` giữ.
- [ ] Step 5: service: `_chuan_hoa` cắt khoảng trắng `ten`, bỏ khoá `thu_tu` client gửi; `_mac_dinh_tao` đặt `thu_tu = repo.thu_tu_tiep(cd)`; `sap_xep` kiểm tập id khớp đúng `cua_cong_doan`, gán 1..n, `nk.ghi_sua` dòng đổi, `_chot()`; `chep` chuẩn hoá danh sách câu (cắt, bỏ rỗng, khử trùng giữ thứ tự; rỗng ⇒ lỗi), kiểm mọi đích tồn tại, với từng đích bỏ câu đã có, `repo.create` + `_ghi_tao` từng dòng (mã `next_ma`), `_chot()` một lần.
- [ ] Step 6: router: `khai_bao(db, _, q)` chỉ còn `q`; xếp công đoạn theo giai đoạn (`NHOM_CONG_DOAN`) rồi mã; gồm công đoạn `active` chưa có tiêu chí khi không tìm, và khi tìm thì chỉ công đoạn khớp; `PUT /sap-xep`, `POST /chep` gác `require_permission(MODULE, "update")`, khai TRƯỚC `make_catalog_router`; `make_catalog_router(..., co_active=False)`.
- [ ] Step 7: chạy `tests/test_san_xuat_kcs_tieu_chi.py tests/test_catalog_registry.py tests/test_danh_muc_tham_chieu.py` → PASS.

### Task 3: Gộp tiêu chí ở bước KCS cuối (BE)

**Files:**
- Create: `backend/app/services/san_xuat/kcs_checklist.py`
- Modify: `backend/app/services/san_xuat/kcs.py` (`_validate_checklist_bat_buoc` → gỡ; `kiem_cong_doan`, `dieu_chinh_ket_qua`, `_cong_doan_nguon_hop_le`, `ket_qua_kcs_cong_viec`, `chuoi_cong_doan_kcs`)
- Modify: `backend/app/repositories/san_xuat_kcs_repo.py` (`nhom_id_cua_lsx`, `batch_quy_loi_ve_nhieu`)
- Modify: `backend/app/services/san_xuat/kcs_bao_cao.py` (`_checklist_rows_cho_batch`, sheet "Chi tiết checklist")
- Modify: `backend/app/schemas/san_xuat.py` (`KcsChecklistKetQuaIn`, `KcsChiTietTieuChiOut`, `KcsCongDoanOut.nguon_loi`, `KcsNguonLoiOut`)
- Test: `backend/tests/test_kcs_checklist_gop.py`; sửa `tests/test_san_xuat_kcs.py`, `tests/test_san_xuat_kcs_bao_cao.py`

**Interfaces:**
- Produces:
  - `chuoi_gop(db, cv, lsx_id: int | None = None) -> list[SanXuatCongViec]` — chuỗi đầy đủ (lệnh phụ trước theo mã, mỗi lệnh theo `_thu_tu_cong_doan`; lệnh chính tới chính `cv`), khử trùng theo id.
  - `checklist_gop(db, chuoi, lsx_chinh: int | None) -> list[dict]` — mỗi mục `{cong_viec_id, ten_cong_doan, nhom_cong_doan, tieu_chi_id, ma, thu_tu, ten, lsx_id, lsx_ma, ten_lenh, la_lenh_phu}`; phân đoạn cùng bước chỉ góp một lần, gắn phân đoạn có `phan_doan_so` lớn nhất trong chuỗi.
  - `kiem_ket_qua(cv, gop, ket_qua, cv_co_loi: set[int]) -> list[dict] | None` — thiếu mục ⇒ `ValueError("Còn N tiêu chí chưa ghi kết quả (…)")`; mục `dat=false` mà không có dòng lỗi quy về công việc đó ⇒ `ValueError("Công đoạn {tên} có tiêu chí không đạt nhưng chưa ghi lỗi.")`; trả danh sách chuẩn `{cong_viec_id, thu_tu, dat, ghi_chu}` theo thứ tự gộp. `gop` rỗng ⇒ trả nguyên `ket_qua`.
  - `khoa_ket_qua(kq: dict, cv_mac_dinh: int) -> tuple[int, int]`.
  - Dòng `la_kcs_cuoi` của `chuoi_cong_doan_kcs`: `checklist` = gộp, `nguon_loi = [{cong_viec_id, ten, lsx_ma, to_ten, la_dang_kiem}]`. Dòng giữa: `checklist = []`, `nguon_loi = []`.

- [ ] Step 1: test `test_kcs_checklist_gop.py` (dùng `_chuoi_hai_to`, `_gop_lenh_thu_hai_vao_nhom`, `_ghi_tot`, `_anh` từ test hiện có):
  - chuỗi một lệnh: `truoc` có 2 tiêu chí, `sau` (cuối) có 1 ⇒ `checklist_gop` theo thứ tự `truoc` rồi `sau`, đúng `cong_viec_id`;
  - phân đoạn: thêm cv cùng `lsx_cong_doan_id` với `truoc`, `phan_doan_so=2` ⇒ tiêu chí góp một lần, gắn cv lần 2;
  - kiểm thiếu kết quả mục của `truoc` ⇒ ValueError "chưa ghi kết quả"; mục `truoc` `dat=false` mà không dòng lỗi về `truoc` ⇒ ValueError "chưa ghi lỗi"; đủ + có dòng lỗi về `truoc` ⇒ lưu, `checklist_json` mang `cong_viec_id`;
  - số kho: tổ ghi 1000 tốt ở `sau`; lỗi 30 về `truoc` + 20 về `sau` ⇒ `so_dat == 950`, `kho.so_con_gui_kho(...) == 950`;
  - `dieu_chinh_ket_qua` gửi checklist thiếu mục `truoc` ⇒ ValueError; đủ ⇒ lưu;
  - nhóm hai lệnh: đưa lệnh kia vào nhóm (`_gop_lenh_thu_hai_vao_nhom`), gắn `sau.nhom_id`; cv của lệnh phụ có tiêu chí ⇒ xuất hiện TRƯỚC, `la_lenh_phu=True`; quy lỗi về cv lệnh phụ ⇒ lưu được, `bao_loi_nguon` có tổ đó; `chuoi_cong_doan_kcs(lệnh phụ)` thấy `loi_buoc_sau` của cv đó; công đoạn GIỮA của lệnh chính quy lỗi về lệnh phụ ⇒ ValueError "đứng trước";
  - quy lỗi về cv của lệnh ngoài nhóm ⇒ ValueError;
  - bước cuối `nhom_id=None` + `lsx_id` gửi lên ⇒ vẫn gộp theo nhóm của lệnh đó.
- [ ] Step 2: chạy → FAIL.
- [ ] Step 3: viết `kcs_checklist.py` (code đầy đủ ở bước thực thi; `_thu_tu_cong_doan` import lười từ `.kcs` để khỏi vòng import).
- [ ] Step 4: `kcs.py`:
  - `_cong_doan_nguon_hop_le`: `cv.la_kcs_cuoi` ⇒ `{c.id: c for c in chuoi_gop(db, cv, lsx_id)}` (vẫn chặn "không thuộc lệnh này"); giữa ⇒ như cũ.
  - `kiem_cong_doan`: bước cuối ⇒ `gop = checklist_gop(db, chuoi_gop(db, cv, lsx_id), ...)`, gọi `kiem_ket_qua(cv, gop, checklist_ket_qua, {c.id for c, *_ in dong_loi})` SAU khi có `dong_loi`.
  - `dieu_chinh_ket_qua`: `checklist_ket_qua is not None` ⇒ `kiem_ket_qua(cv, gop, ..., {l.cong_doan_ref_id for l in cac_loi})`; `None` ⇒ giữ checklist cũ.
  - `ket_qua_kcs_cong_viec`: bước cuối trả checklist gộp.
  - `chuoi_cong_doan_kcs`: như Interfaces; `quy_ve` duyệt thêm `repo.batch_quy_loi_ve_nhieu(ids_chuoi)` ngoài `tat_ca_kcs`.
- [ ] Step 5: schema: `KcsChecklistKetQuaIn` thêm `cong_viec_id: int | None = None`; `KcsChiTietTieuChiOut` bỏ `huong_dan`, `bat_buoc`, thêm `cong_viec_id, ten_cong_doan, nhom_cong_doan, lsx_id, lsx_ma, ten_lenh, la_lenh_phu`; `KcsNguonLoiOut{cong_viec_id, ten, lsx_ma, to_ten, la_dang_kiem}`; `KcsCongDoanOut.nguon_loi: list[KcsNguonLoiOut] = []`.
- [ ] Step 6: `kcs_bao_cao`: `_checklist_rows_cho_batch(kcs, cv, cv_theo_id)` tra snapshot theo `(cong_viec_id or cv.id, thu_tu)`, thêm `cong_doan`; sheet 2 đổi cột "Bắt buộc" → "Công đoạn"; nạp `cv_theo_id` một lượt cho mọi `cong_viec_id` lạ trong `checklist_json`.
- [ ] Step 7: sửa test cũ: `test_checklist_bat_buoc` → luật mới; bài `test_san_xuat_kcs_bao_cao.py` gửi đủ checklist, header sheet 2 mới.
- [ ] Step 8: chạy `tests/test_kcs_checklist_gop.py tests/test_san_xuat_kcs.py tests/test_san_xuat_kcs_bao_cao.py tests/test_san_xuat_nhap_kho_tp.py` → PASS.

### Task 4: Màn danh mục phương án A (FE)

**Files:**
- Create: `frontend/src/pages/danh-muc/kcs-tieu-chi/KcsTieuChiPage.tsx`, `HopChepTieuChi.tsx`, `NganXemKcsCuoi.tsx`, `kcsTieuChi.ts`, `kcsTieuChi.test.ts`, `kcs-tieu-chi.css`
- Modify: `frontend/src/api/client.ts` (types `KcsHangMuc`, `KcsHangMucBody`, `KcsKhaiBao*`; `kcsHangMuc.khaiBao(token, q?)`, `sapXep`, `chep`)
- Modify: `frontend/src/components/AppShell.tsx:79` (lazy import trang mới)
- Delete: `frontend/src/pages/danh-muc/KcsKhaiBaoPage.tsx`, `frontend/src/pages/danh-muc/kcs-khai-bao.css`, `frontend/src/pages/loc-san-xuat/dieu-kien-kcs-tieu-chi.ts`
- Modify: `frontend/src/pages/loc-san-xuat/dieu-kien-ban-to.test.ts` (gỡ phần thanh lọc tiêu chí)

**Interfaces:**
- `kcsTieuChi.ts`:
  - `type CongDoanTc = KcsKhaiBaoCongDoan & { nhom: string }`
  - `chuoiTimCongDoan(cd, nhanGd) -> string` = "mã tên nhãn-giai-đoạn"
  - `locDich(ds, q, nguonId, daChon) -> { khop: CongDoanTc[]; chonDuoc: CongDoanTc[] }`
  - `demChep(dich: CongDoanTc[], cau: string[]) -> { moi: number; bo: number; trungTheoDich: Map<number, number> }`
  - `chuanCau(ds: string[]) -> string[]` (cắt, bỏ rỗng, khử trùng)
  - `doiCho<T>(ds: T[], tu: number, den: number) -> T[]`

- [ ] Step 1: test vitest cho bốn hàm (lọc tương đối "thu dan", "DAN-MAY", "sau in boi"; "Chọn cả N" không đếm nguồn và đã chọn; đếm câu trùng theo từng đích; đổi chỗ).
- [ ] Step 2: chạy → FAIL; viết `kcsTieuChi.ts` → PASS.
- [ ] Step 3: client.ts đổi types + API.
- [ ] Step 4: `KcsTieuChiPage` theo spec mục 6 + mockup `tieu-chi-kcs-chot.html` (bản 1): đầu màn, ô trái (tìm có debounce gọi máy chủ, ô tick ẩn công đoạn trống, gom giai đoạn với chip màu, `?cd=` trên URL), ô phải (sửa tại chỗ Enter/blur lưu, Esc huỷ; ô gõ mới giữ focus; kéo thả HTML5 bằng tay nắm ⇒ `sapXep`; thùng rác `ConfirmDialog`), nút chép, chân màn; quyền `update`/`delete`.
- [ ] Step 5: `HopChepTieuChi` theo spec mục 6 "Hộp soạn trước khi chép" (hai chế độ: có nguồn / chọn nguồn trước).
- [ ] Step 6: `NganXemKcsCuoi` (vỏ ngăn `NganPhai` chung nếu có, không thì `Drawer`): gọi `khaiBao` không `q` một lần, thẻ bật/tắt.
- [ ] Step 7: xoá ba file cũ, sửa AppShell + test bàn tổ; `npx tsc --noEmit` + `npx vitest run src/pages/danh-muc/kcs-tieu-chi src/pages/loc-san-xuat` → PASS.

### Task 5: Form KCS cuối theo thẻ công đoạn (FE)

**Files:**
- Create: `frontend/src/pages/kcs/kcsTheCongDoan.ts`, `kcsTheCongDoan.test.ts`, `KcsTheCongDoan.tsx`
- Modify: `frontend/src/pages/kcs/KcsKiemForm.tsx`, `kcs-kiem-form.css`, `KcsKiemForm.test.tsx`
- Modify: `frontend/src/pages/kcs/KcsLanKiemList.tsx`, `KcsLanKiemList.test.tsx`
- Modify: `frontend/src/api/client.ts` (`SxKcsChiTietTieuChi`, `SxKcsChecklistKetQuaIn`, `SxKcsCongDoan.nguon_loi`)

**Interfaces:**
- `kcsTheCongDoan.ts`:
  - `interface TheCd { cvId: number; ten: string; phu: string | null; tieuChi: SxKcsChiTietTieuChi[] }`
  - `type TrangThaiThe = { loai: "chua" } | { loai: "dat" } | { loai: "loi"; hong: Set<number>; so: string; moTa: string; suaTay: boolean; anh: AnhCho[] }`
  - `gomThe(checklist) -> TheCd[]`
  - `moTaTuDien(the, hong) -> string`
  - `lyDoKhoa(the, tt, { chuaKiem, tongLoi, soAnh }) -> string | null` (thứ tự spec 3a)
  - `ketQuaChecklist(the, tt) -> SxKcsChecklistKetQuaIn[]`
- [ ] Step 1: test thuần cho bốn hàm ("Đạt hết còn lại" không đè thẻ có lỗi; mô tả tự điền thôi khi `suaTay`; thứ tự lý do; payload `dat` từng mục mang `cong_viec_id`).
- [ ] Step 2: chạy → FAIL; viết → PASS.
- [ ] Step 3: `KcsTheCongDoan.tsx` (thẻ theo mockup cách 3) + tích hợp `KcsKiemForm` cho `cuoi && the.length > 0`: bỏ ô tick + ghi chú từng tiêu chí; dòng lỗi thủ công "+ Lỗi ở công đoạn khác" dùng `cd.nguon_loi`; thanh đáy (đạt, lỗi, trên N chưa kiểm, lý do khoá, Lưu); payload `cac_loi` = thẻ có lỗi + dòng thủ công.
- [ ] Step 4: `KcsLanKiemList` gom theo công đoạn (khoá `(cong_viec_id ?? lk.cong_viec_id, thu_tu)`), công đoạn có lỗi lên đầu kèm mục hỏng, công đoạn đạt một dòng "Đạt".
- [ ] Step 5: sửa `KcsKiemForm.test.tsx`, `KcsLanKiemList.test.tsx`; `npx tsc --noEmit` + `npx vitest run src/pages/kcs` → PASS.

### Task 6: Xác minh trên trình duyệt thật

- [ ] Restart uvicorn (đổi route/schema), FE dev server; migration chạy lúc khởi động.
- [ ] Thao tác luồng spec mục 7 bằng chuột/bàn phím trên dev-browser; ghi lại từng bước đã bấm/gõ/thấy.
