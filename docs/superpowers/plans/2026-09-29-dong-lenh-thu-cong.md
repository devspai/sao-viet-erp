# Đóng lệnh thủ công do KCS bấm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bỏ cổng tự đóng nhóm, thay bằng nút "Đóng lệnh"/"Mở lại" cho KCS. Lệnh mang trạng thái mới `da_dong` ("Đã đóng"); đóng rồi thì xưởng ngừng ghi mới vào lệnh đó.

**Architecture:** Một module service mới `services/san_xuat/dong_lenh.py` giữ toàn bộ luật: đọc tình trạng + cảnh báo, đóng, mở lại, hàm chặn thao tác. Nó ghi CÙNG giao dịch `san_xuat_nhom.trang_thai` (`in_production` ↔ `closed`) và `lsx.trang_thai` (`da_phat_hanh` ↔ `da_dong`). Các cửa ghi của xưởng gọi `chan_neu_da_dong`; các truy vấn bàn tổ thêm một điều kiện SQL `viec_con_hien()`. Mọi màn kế hoạch và đơn hàng coi `da_dong` là một trạng thái "đã xuống xưởng", thông qua bộ `TT_DA_XUONG_XUONG`.

**Tech Stack:** FastAPI + SQLAlchemy 2 (Postgres dev/prod, SQLite trong test), React + TS + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-dong-lenh-thu-cong-design.md`

## Global Constraints

- Nút đóng KHÔNG bị chặn bởi điều kiện nào; những gì còn dở chỉ là CẢNH BÁO trong hộp xác nhận (người dùng chốt 29/09/2026).
- Đơn vị đóng = NHÓM thành phẩm: đóng/mở lại là đóng/mở lại MỌI lệnh của nhóm.
- Ai bấm: mọi thành viên phòng ban `is_kcs` (`kcs.gate_kcs`), áp cho cả đóng lẫn mở lại.
- UI chỉ tiếng Việt. Lời chặn chuẩn: `"Lệnh đã đóng — KCS mở lại nếu cần ghi thêm."`
- Không Alembic: đổi dữ liệu qua `backend/app/db_migrations.py`, dùng raw SQL đích danh cột, không ORM full-select.
- `docs/DB_SCHEMA.md` có guard test; đổi mô tả giá trị cột thì sửa cùng lúc.
- Verify: pytest nhắm file + `npx tsc --noEmit` + vitest nhắm file. KHÔNG chạy `./init.ps1` hay cả bộ pytest.
- Commit: message tiếng Việt, KHÔNG có dòng Co-Authored-By. Working tree có việc của phiên khác đang staged, nên mỗi lần commit phải liệt kê đường dẫn: `git add <paths> && git commit -m "…" -- <paths>`.
- Sửa route/schema backend thì phải restart uvicorn tay.

---

## File map

| File | Việc |
|---|---|
| `backend/app/models/lsx.py` | + `TT_DA_DONG`, `TT_DA_XUONG_XUONG` |
| `backend/app/models/san_xuat.py` | trạng thái nhóm rút còn `NHOM_DANG_SX` / `NHOM_DONG` |
| `backend/app/db_migrations.py` | mg `0346_dong_lenh_thu_cong` |
| `backend/app/services/san_xuat/dong_lenh.py` | TẠO — luật đóng/mở/chặn/lọc |
| `backend/app/services/san_xuat/dong_nhom.py` | XOÁ |
| `backend/app/repositories/san_xuat_repo.py` | + `lan_dong_cuoi`, + `viec_con_hien()`, gắn vào 4 truy vấn bàn tổ |
| `backend/app/repositories/san_xuat_kcs_repo.py:138` | lọc `NHOM_DANG_SX` |
| `backend/app/schemas/san_xuat.py` | thay 4 schema DongNhom*/DongThieuIn |
| `backend/app/routers/san_xuat.py` | 3 endpoint mới, gỡ 2 cũ + `_thu_dong_nhom` |
| `backend/app/realtime.py` | `phat_dong_nhom` → `phat_dong_lenh` |
| `backend/app/audit_registry.py` | nhãn audit mới |
| `backend/app/services/gia_cong_ngoai/chot.py`, `routers/gia_cong_ngoai.py` | thôi tự đóng; gỡ số khi đã đóng thì chặn |
| `thuc_thi.py`, `san_luong.py`, `kcs.py`, `kho.py`, `ban_giao.py`, `vat_tu_de_nghi.py` | gọi `chan_neu_da_dong` |
| `lenh_sx/pham_vi.py`, `don_hang_tien_do.py`, `lsx_service.py`, `xep_lich/service.py`, `xep_lich_van_de_service.py` | nhận `da_dong` |
| `frontend/src/api/client.ts` | type + 3 hàm API |
| `frontend/src/pages/kcs/KcsDongLenh.tsx` (+ test) | TẠO thay `KcsChotNhom.tsx` |
| `frontend/src/pages/kcs/KcsChuoiCongDoan.tsx` | mount khối mới |
| `frontend/src/components/AppShell.tsx`, `lib/suKienNhom.ts` | toast + nhóm sự kiện |
| `keHoachSxShared.tsx`, `XlGantt.tsx`, `XlChiTiet.tsx`, `xep-lich.css`, `kcsNhan.ts` | nhãn "Đã đóng" |
| `docs/spec-thuc-hien-san-xuat.md` §16, `docs/DB_SCHEMA.md` | cập nhật tài liệu |

---

### Task 1: Hằng trạng thái + migration

**Files:**
- Modify: `backend/app/models/lsx.py:39-50`
- Modify: `backend/app/models/san_xuat.py:39-44`
- Modify: `backend/app/db_migrations.py` (cuối file)
- Modify: `backend/app/repositories/san_xuat_kcs_repo.py:138`
- Modify: `docs/DB_SCHEMA.md:4109`, `:4604`
- Test: `backend/tests/test_mg_dong_lenh_thu_cong.py` (tạo)

**Interfaces:**
- Produces: `TT_DA_DONG = "da_dong"` và `TT_DA_XUONG_XUONG = (TT_DA_PHAT_HANH, TT_DA_DONG)` (ở `models/lsx.py`); `NHOM_DONG = "closed"`, `TRANG_THAI_NHOM = (NHOM_DANG_SX, NHOM_DONG)` (ở `models/san_xuat.py`). Xoá `NHOM_CHO_DIEU_KIEN`, `NHOM_DONG_DU`, `NHOM_DONG_THIEU`.

- [ ] **Step 1: Viết test migration (fail)**

```python
"""mg 0346 — gộp closed_full/closed_short → closed, waiting_conditions → in_production; lệnh của
nhóm đã đóng mà đang da_phat_hanh → da_dong."""
from sqlalchemy import text

from app.db_migrations import _migrate_dong_lenh_thu_cong


def test_mg_gop_trang_thai_nhom_va_dong_lenh(db):
    db.execute(text("INSERT INTO customers (id, name) VALUES (1, 'K')"))
    db.execute(text("INSERT INTO orders (id, code, customer_id) VALUES (1, 'DH1', 1)"))
    db.execute(text("INSERT INTO order_lines (id, order_id, qty) VALUES (1, 1, 10), (2, 1, 10), (3, 1, 10)"))
    for i, tt in ((1, "da_phat_hanh"), (2, "da_phat_hanh"), (3, "da_phat_hanh")):
        db.execute(text(
            "INSERT INTO lsx (id, ma, order_id, order_line_id, trang_thai, loai, ten, so_luong_dat, "
            "don_vi_tinh, so_to_ke_hoach, so_to_nguyen, so_con, is_rush, giu_cho_bat, created_at, updated_at) "
            f"VALUES ({i}, 'L{i}', 1, {i}, '{tt}', 'san_xuat_moi', '', 10, 'cái', 0, 0, 1, false, false, "
            "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"))
    for i, tt in ((1, "closed_full"), (2, "closed_short"), (3, "waiting_conditions")):
        db.execute(text(
            "INSERT INTO san_xuat_nhom (id, ma, order_id, khoa, ten, trang_thai, version) "
            f"VALUES ({i}, 'N{i}', 1, 'k{i}', '', '{tt}', 1)"))
        db.execute(text(
            f"INSERT INTO san_xuat_nhom_lsx (nhom_id, lsx_id, la_than_chinh) VALUES ({i}, {i}, true)"))
    db.commit()

    _migrate_dong_lenh_thu_cong(db)

    nhom = dict(db.execute(text("SELECT id, trang_thai FROM san_xuat_nhom")).all())
    assert nhom == {1: "closed", 2: "closed", 3: "in_production"}
    lenh = dict(db.execute(text("SELECT id, trang_thai FROM lsx")).all())
    assert lenh == {1: "da_dong", 2: "da_dong", 3: "da_phat_hanh"}
    _migrate_dong_lenh_thu_cong(db)      # chạy lại không đổi gì
    assert dict(db.execute(text("SELECT id, trang_thai FROM lsx")).all()) == lenh
```

Lưu ý: nếu câu INSERT hỏng vì cột NOT NULL khác trong DB test, đọc lỗi rồi bổ sung cột. Mục đích chỉ là có 3 lệnh + 3 nhóm.

- [ ] **Step 2: Chạy test, thấy fail**

Run: `cd backend && python -m pytest tests/test_mg_dong_lenh_thu_cong.py -q`
Expected: FAIL `ImportError: cannot import name '_migrate_dong_lenh_thu_cong'`

- [ ] **Step 3: Hằng ở `models/lsx.py`**

Thay khối comment + hằng ở dòng 39-50 bằng:

```python
# --- Trạng thái (bám lifecycle print MIS / Dynamics BC). `da_lap_ke_hoach` (≈ Firm Planned) set qua
# service xếp lịch + KHÓA routing. `da_phat_hanh` (≈ Released) = đã thả xuống xưởng. `da_dong`
# (≈ Finished, 29/09/2026) = KCS bấm "Đóng lệnh" (`services/san_xuat/dong_lenh.py`) — mở lại được,
# về `da_phat_hanh`. Không có mốc "đang sản xuất" riêng: tiến độ thật đọc ở lớp thực thi.
TT_NHAP = "nhap"                 # vừa tạo, dữ liệu đủ
TT_CHO_BO_SUNG = "cho_bo_sung"   # thiếu file/khuôn/quy cách/routing
TT_SAN_SANG = "san_sang"         # kế hoạch xác nhận đủ → chờ xếp lịch
TT_DA_LAP_KE_HOACH = "da_lap_ke_hoach"  # đã sinh dòng xếp lịch → routing bị khóa
TT_DA_PHAT_HANH = "da_phat_hanh"        # đã phát hành xuống xưởng (Released) — routing vẫn khóa
TT_DA_DONG = "da_dong"                  # KCS đã đóng lệnh — xưởng ngừng ghi mới
TRANG_THAI_LSX = (TT_NHAP, TT_CHO_BO_SUNG, TT_SAN_SANG, TT_DA_LAP_KE_HOACH, TT_DA_PHAT_HANH, TT_DA_DONG)
TRANG_THAI_SUA_DUOC = (TT_NHAP, TT_CHO_BO_SUNG, TT_SAN_SANG)  # chưa lập KH → sửa/xoá routing được
# Lệnh ĐÃ XUỐNG XƯỞNG (đang chạy hoặc đã đóng) — mọi màn tra cứu/tiến độ dùng bộ này, đừng so
# `== TT_DA_PHAT_HANH`, so thế thì lệnh vừa đóng biến mất khỏi màn.
TT_DA_XUONG_XUONG = (TT_DA_PHAT_HANH, TT_DA_DONG)
```

- [ ] **Step 4: Hằng ở `models/san_xuat.py:39-44`**

```python
# --- Trạng thái nhóm thành phẩm (§16, 29/09/2026) — KCS bấm tay đóng/mở lại, không còn tự đóng.
NHOM_DANG_SX = "in_production"          # đang sản xuất
NHOM_DONG = "closed"                    # KCS đã đóng (mọi lệnh của nhóm → `lsx.da_dong`)
TRANG_THAI_NHOM = (NHOM_DANG_SX, NHOM_DONG)
```

Sau đó grep toàn `backend/` tìm `NHOM_CHO_DIEU_KIEN|NHOM_DONG_DU|NHOM_DONG_THIEU`. Chỗ nào còn dùng thì sửa như sau:
- `san_xuat_kcs_repo.py:138`: `.in_((NHOM_DANG_SX, NHOM_CHO_DIEU_KIEN))` → `== NHOM_DANG_SX`, sửa cả import.
- `dong_nhom.py` và `gia_cong_ngoai/chot.py`: xử lý ở Task 3; tạm để lỗi import, Task 2 và 3 sẽ gỡ.

- [ ] **Step 5: Migration — thêm cuối `db_migrations.py`**

```python
def _migrate_dong_lenh_thu_cong(db) -> None:
    """mg 0346 — đóng lệnh THỦ CÔNG (spec 2026-09-29-dong-lenh-thu-cong-design.md).

    Nhóm thôi phân biệt đủ/thiếu: `closed_full`/`closed_short` → `closed`; `waiting_conditions` (không
    ai ghi) → `in_production`. Lệnh của nhóm đã đóng mà còn `da_phat_hanh` → `da_dong`. Raw SQL đích
    danh cột, chạy lại vô hại."""
    insp = inspect(db.get_bind())
    bang = set(insp.get_table_names())
    if not {"san_xuat_nhom", "san_xuat_nhom_lsx", "lsx"} <= bang:
        return
    db.execute(text(
        "UPDATE san_xuat_nhom SET trang_thai = 'closed' "
        "WHERE trang_thai IN ('closed_full', 'closed_short')"))
    db.execute(text(
        "UPDATE san_xuat_nhom SET trang_thai = 'in_production' "
        "WHERE trang_thai = 'waiting_conditions'"))
    db.execute(text(
        "UPDATE lsx SET trang_thai = 'da_dong' WHERE trang_thai = 'da_phat_hanh' AND id IN ("
        "SELECT tv.lsx_id FROM san_xuat_nhom_lsx tv JOIN san_xuat_nhom n ON n.id = tv.nhom_id "
        "WHERE n.trang_thai = 'closed')"))
    db.commit()


MIGRATIONS.append(("0346_dong_lenh_thu_cong", _migrate_dong_lenh_thu_cong))
```

Trước khi đặt số, grep `MIGRATIONS.append(("034` để lấy số kế tiếp thật (phiên song song có thể đã chiếm 0346).

- [ ] **Step 6: DB_SCHEMA.md**

- Dòng 4109 (bảng `lsx`), cột mô tả: `` `nhap` → `cho_bo_sung` → `san_sang` → `da_lap_ke_hoach` (routing khóa) → `da_phat_hanh` (thả xuống xưởng) ⇄ `da_dong` (KCS đóng/mở lại). ``
- Dòng 4604 (bảng `san_xuat_nhom`): `` `in_production`/`closed` — KCS bấm đóng/mở lại (§16). ``

- [ ] **Step 7: Chạy test**

Run: `cd backend && python -m pytest tests/test_mg_dong_lenh_thu_cong.py tests/test_db_schema_doc.py -q`
Expected: PASS. Import lỗi ở `dong_nhom.py` chưa ảnh hưởng file test này; nếu `conftest` import cả app mà vỡ thì làm Task 2 trước rồi chạy lại.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/lsx.py backend/app/models/san_xuat.py backend/app/db_migrations.py backend/app/repositories/san_xuat_kcs_repo.py docs/DB_SCHEMA.md backend/tests/test_mg_dong_lenh_thu_cong.py
git commit -m "đóng lệnh thủ công: trạng thái da_dong + nhóm closed, mg 0346 gộp đủ/thiếu" -- backend/app/models/lsx.py backend/app/models/san_xuat.py backend/app/db_migrations.py backend/app/repositories/san_xuat_kcs_repo.py docs/DB_SCHEMA.md backend/tests/test_mg_dong_lenh_thu_cong.py
```

---

### Task 2: Service `dong_lenh.py` (tình trạng · đóng · mở lại · chặn)

**Files:**
- Create: `backend/app/services/san_xuat/dong_lenh.py`
- Modify: `backend/app/repositories/san_xuat_repo.py` (+ `lan_dong_cuoi`)
- Delete: `backend/app/services/san_xuat/dong_nhom.py`
- Delete + thay: `backend/tests/test_san_xuat_dong_nhom.py` → `backend/tests/test_san_xuat_dong_lenh.py`

**Interfaces:**
- Consumes: `TT_DA_DONG`, `TT_DA_PHAT_HANH`, `NHOM_DANG_SX`, `NHOM_DONG` (Task 1).
- Produces:
  - `CHAN_DA_DONG: str`
  - `tinh_trang_dong(db, nhom_id: int) -> dict`: keys `nhom_id, order_id, trang_thai, version, lenh: list[{id, ma}], muc_tieu: float|None, da_dat: float, don_vi: str, canh_bao: list[{ma, cau}], dong_boi: str|None, dong_luc: datetime|None`
  - `dong(db, *, user, nhom_id: int, expected_version: int|None) -> dict`
  - `mo_lai(db, *, user, nhom_id: int, expected_version: int|None) -> dict`. Cả `dong` và `mo_lai` trả keys `nhom_id, order_id, trang_thai, kieu ("dong"|"mo_lai"), version, lenh_ma: list[str], da_dat, muc_tieu, don_vi`.
  - `nhom_da_dong(db, cv) -> bool`
  - `chan_neu_da_dong(db, cv, *, cho_viec_dang_chay: bool = False) -> None`, raise `ValueError(CHAN_DA_DONG)`
  - `SanXuatRepository.lan_dong_cuoi(nhom_id) -> tuple[str, datetime] | None`

- [ ] **Step 1: Viết test (fail)** — `backend/tests/test_san_xuat_dong_lenh.py`

```python
"""Đóng lệnh THỦ CÔNG (spec 2026-09-29) — tầng service `services/san_xuat/dong_lenh.py`.

Không cổng: còn dở chỉ ra CẢNH BÁO. Đóng/mở lại theo NHÓM, ghi cả nhóm lẫn mọi lệnh. Mọi người KCS
bấm được; người ngoài KCS bị chặn."""
from __future__ import annotations

import pytest

from app.models.lsx import TT_DA_DONG, TT_DA_PHAT_HANH, Lsx
from app.models.san_xuat import CV_DANG_CHAY, CV_HOAN_THANH, NHOM_DANG_SX, NHOM_DONG
from app.repositories.san_xuat_repo import SanXuatRepository
from app.schemas.san_xuat import DongLenhKetQuaOut, DongLenhTinhTrangOut
from app.services.san_xuat import dong_lenh

from tests.test_san_xuat_kcs import (  # noqa: F401
    _batch, _ghi_tot, _to_kiem, admin, customer, db, lsx_svc, orders,
)


def _cvs(db, nhom_id):
    return SanXuatRepository(db).cong_viec_hien_tai_cua_nhom(nhom_id)


def _muc_tieu(db, nhom_id, so):
    for cv in _cvs(db, nhom_id):
        if cv.la_kcs_cuoi:
            cv.so_luong_ra = so
    db.commit()


def _hoan_thanh_het(db, nhom_id):
    for cv in _cvs(db, nhom_id):
        cv.trang_thai = CV_HOAN_THANH
    db.commit()


def _ma_canh_bao(tt):
    return {c["ma"] for c in tt["canh_bao"]}


def test_tinh_trang_du_het_thi_chi_con_canh_bao_chua_gui_kho(db, orders, lsx_svc, admin, customer):
    _to, cv, _res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)   # tốt 100 · đạt 90 · lỗi 10
    _muc_tieu(db, cv.nhom_id, 90)
    _hoan_thanh_het(db, cv.nhom_id)
    tt = dong_lenh.tinh_trang_dong(db, cv.nhom_id)
    assert DongLenhTinhTrangOut.model_validate(tt).trang_thai == NHOM_DANG_SX
    assert tt["da_dat"] == 90 and tt["muc_tieu"] == 90
    assert _ma_canh_bao(tt) == {"chua_gui_kho"}          # đạt 90 chưa gửi yêu cầu nhập kho
    assert [l["id"] for l in tt["lenh"]] == [cv.lsx_id]


def test_tinh_trang_du_bon_canh_bao(db, orders, lsx_svc, admin, customer):
    _to, cv, _res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    _ghi_tot(db, cv, 50)                                  # tốt thêm 50 chưa kiểm
    _muc_tieu(db, cv.nhom_id, 10_000)
    tt = dong_lenh.tinh_trang_dong(db, cv.nhom_id)
    assert _ma_canh_bao(tt) == {"chua_kiem", "chua_gui_kho", "thieu_muc_tieu", "viec_do"}
    cau = {c["ma"]: c["cau"] for c in tt["canh_bao"]}
    assert "50" in cau["chua_kiem"] and "chưa kiểm" in cau["chua_kiem"]
    assert "90 / 10.000" in cau["thieu_muc_tieu"] and "9.910" in cau["thieu_muc_tieu"]
    assert "rút khỏi bàn tổ" in cau["viec_do"]


def test_dong_khi_con_do_van_dong_duoc_va_dong_moi_lenh(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    _muc_tieu(db, cv.nhom_id, 10_000)
    nhom = SanXuatRepository(db).nhom(cv.nhom_id)
    kq = dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=nhom.version)
    assert DongLenhKetQuaOut.model_validate(kq).kieu == "dong"
    assert SanXuatRepository(db).nhom(cv.nhom_id).trang_thai == NHOM_DONG
    assert db.get(Lsx, cv.lsx_id).trang_thai == TT_DA_DONG
    tt = dong_lenh.tinh_trang_dong(db, cv.nhom_id)
    assert tt["dong_boi"] and tt["dong_luc"] is not None


def test_mo_lai_tra_ve_nhu_truoc(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    k = res["nguoi_kcs"]
    kq = dong_lenh.dong(db, user=k, nhom_id=cv.nhom_id, expected_version=None)
    kq2 = dong_lenh.mo_lai(db, user=k, nhom_id=cv.nhom_id, expected_version=kq["version"])
    assert kq2["kieu"] == "mo_lai"
    assert SanXuatRepository(db).nhom(cv.nhom_id).trang_thai == NHOM_DANG_SX
    assert db.get(Lsx, cv.lsx_id).trang_thai == TT_DA_PHAT_HANH


def test_dong_hai_lan_va_mo_lai_nhom_dang_mo_bi_chan(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    k = res["nguoi_kcs"]
    with pytest.raises(ValueError, match="chưa đóng"):
        dong_lenh.mo_lai(db, user=k, nhom_id=cv.nhom_id, expected_version=None)
    dong_lenh.dong(db, user=k, nhom_id=cv.nhom_id, expected_version=None)
    with pytest.raises(ValueError, match="đã đóng"):
        dong_lenh.dong(db, user=k, nhom_id=cv.nhom_id, expected_version=None)


def test_version_lech_bi_chan(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    with pytest.raises(ValueError, match="tải lại"):
        dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=999)


def test_nguoi_ngoai_kcs_bi_chan(db, orders, lsx_svc, admin, customer):
    _to, cv, _res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    with pytest.raises(PermissionError):
        dong_lenh.dong(db, user=admin, nhom_id=cv.nhom_id, expected_version=None)


def test_thanh_vien_kcs_thuong_dong_duoc(db, orders, lsx_svc, admin, customer):
    _to, cv, _res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    _d, thuong = _to_kiem(db, ten="Tổ KCS 2", ma="KCS-2", truong=False)
    dong_lenh.dong(db, user=thuong, nhom_id=cv.nhom_id, expected_version=None)
    assert SanXuatRepository(db).nhom(cv.nhom_id).trang_thai == NHOM_DONG


def test_audit_chup_so_luc_dong(db, orders, lsx_svc, admin, customer):
    from app.models.audit import AuditLog

    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    _muc_tieu(db, cv.nhom_id, 10_000)
    dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=None)
    a = db.query(AuditLog).filter_by(action="san_xuat_dong_lenh").one()
    assert a.target == f"san_xuat_nhom:{cv.nhom_id}"
    assert "dat=90" in a.detail and "muc_tieu=10000" in a.detail and "chua_gui_kho=90" in a.detail


def test_chan_neu_da_dong(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    dong_lenh.chan_neu_da_dong(db, cv)                 # nhóm mở ⇒ không ném
    dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=None)
    with pytest.raises(ValueError, match="Lệnh đã đóng"):
        dong_lenh.chan_neu_da_dong(db, cv)
    cv.trang_thai = CV_DANG_CHAY
    db.commit()
    dong_lenh.chan_neu_da_dong(db, cv, cho_viec_dang_chay=True)   # việc đang chạy được ghi tiếp
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `cd backend && python -m pytest tests/test_san_xuat_dong_lenh.py -q`
Expected: FAIL ở import (`dong_lenh` / `DongLenhTinhTrangOut` chưa có).

- [ ] **Step 3: Thêm vào `SanXuatRepository` (đặt ngay sau `lenh_cua_nhom`, ~dòng 310)**

```python
    def lan_dong_cuoi(self, nhom_id: int) -> tuple[str, datetime] | None:
        """(tên người, lúc) của lần "Đóng lệnh" GẦN NHẤT của nhóm — đọc từ audit, không đẻ cột."""
        from ..models.audit import AuditLog

        a = self.db.execute(
            select(AuditLog)
            .where(AuditLog.action == "san_xuat_dong_lenh",
                   AuditLog.target == f"san_xuat_nhom:{nhom_id}")
            .order_by(AuditLog.id.desc()).limit(1)
        ).scalars().first()
        return (a.actor_name_luc_do or "", a.created_at) if a else None
```

Kiểm `datetime` đã import ở đầu file repo; chưa có thì thêm `from datetime import datetime`.

- [ ] **Step 4: Schema ở `schemas/san_xuat.py`**

Xoá `DongNhomDieuKienItemOut`, `DongNhomDieuKienOut`, `DongThieuIn`, `DongNhomKetQuaOut` (dòng 1385-1420), thay bằng:

```python
class DongLenhCanhBaoOut(BaseModel):
    ma: str          # chua_kiem | chua_gui_kho | thieu_muc_tieu | viec_do
    cau: str


class DongLenhLenhOut(BaseModel):
    id: int
    ma: str


class DongLenhTinhTrangOut(BaseModel):
    """Khối "Đóng lệnh" ở màn KCS — số tóm tắt + cảnh báo cho hộp xác nhận. KHÔNG có cổng."""
    nhom_id: int
    order_id: int | None = None
    trang_thai: str                      # in_production | closed
    version: int
    lenh: list[DongLenhLenhOut]
    muc_tieu: float | None = None
    da_dat: float = 0.0
    don_vi: str = ""
    canh_bao: list[DongLenhCanhBaoOut] = []
    dong_boi: str | None = None
    dong_luc: datetime | None = None


class DongLenhIn(BaseModel):
    expected_version: int | None = None


class DongLenhKetQuaOut(BaseModel):
    nhom_id: int
    order_id: int | None = None
    trang_thai: str
    kieu: str                            # dong | mo_lai
    version: int
    lenh_ma: list[str] = []
    da_dat: float = 0.0
    muc_tieu: float | None = None
    don_vi: str = ""
```

- [ ] **Step 5: Viết `services/san_xuat/dong_lenh.py`**

```python
"""Đóng lệnh THỦ CÔNG do KCS bấm (spec `docs/superpowers/specs/2026-09-29-dong-lenh-thu-cong-design.md`).

Thay cổng tự đóng 4 điều kiện (`dong_nhom.py`, gỡ 29/09/2026). Đơn vị đóng là NHÓM thành phẩm; một
giao dịch ghi cả `san_xuat_nhom.trang_thai` (in_production ⇄ closed) lẫn `lsx.trang_thai` của mọi
lệnh trong nhóm (da_phat_hanh ⇄ da_dong). KHÔNG có điều kiện chặn: phần còn dở chỉ là CẢNH BÁO để
hộp xác nhận bày ra — người KCS quyết. Số lúc đóng chụp vào audit để tra "đóng thiếu" về sau.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.department import Department
from ...models.lsx import TT_DA_DONG, TT_DA_PHAT_HANH
from ...models.san_xuat import CV_DANG_CHAY, CV_HOAN_THANH, NHOM_DANG_SX, NHOM_DONG, SanXuatNhom
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.san_xuat_kcs_repo import SanXuatKcsRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ...repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from .kcs import _EPS, gate_kcs

CHAN_DA_DONG = "Lệnh đã đóng — KCS mở lại nếu cần ghi thêm."


def _so(v: float) -> str:
    """Số kiểu Việt: 10000 → "10.000", 12.5 → "12,5"."""
    t = f"{v:,.3f}".rstrip("0").rstrip(".")
    return t.translate(str.maketrans(",.", ".,"))


def _nhom(repo: SanXuatRepository, nhom_id: int) -> SanXuatNhom:
    nhom = repo.nhom(nhom_id)
    if nhom is None:
        raise ValueError("Không tìm thấy nhóm thành phẩm.")
    return nhom


def _so_lieu(db: Session, nhom_id: int) -> dict:
    """Số của nhóm lúc đọc: mục tiêu/đạt/chưa kiểm/chưa gửi kho ở công đoạn cuối + việc còn dở."""
    from .kho import dong_nhap_kho_cua_cong_viec, so_con_gui_kho

    repo = SanXuatRepository(db)
    cvs = repo.cong_viec_hien_tai_cua_nhom(nhom_id)
    cuoi = [cv for cv in cvs if cv.la_kcs_cuoi]
    ids = [cv.id for cv in cuoi]
    tot_map = SanXuatSanLuongRepository(db).tong_tot_nhieu(ids)
    kiem_map = SanXuatKcsRepository(db).tong_kiem_nhieu(ids)
    tot = sum(tot_map.get(i, 0.0) for i in ids)
    dat = sum(kiem_map.get(i, (0, 0.0, 0.0))[1] for i in ids)
    loi = sum(kiem_map.get(i, (0, 0.0, 0.0))[2] for i in ids)
    co_muc_tieu = [cv for cv in cuoi if cv.so_luong_ra is not None]
    muc_tieu = sum(float(cv.so_luong_ra) for cv in co_muc_tieu) if co_muc_tieu else None
    dong_kho = dong_nhap_kho_cua_cong_viec(db, ids) if ids else {}
    chua_gui = sum(so_con_gui_kho(db, cv, dong_kho.get(cv.id, [])) for cv in cuoi)
    return {
        "muc_tieu": muc_tieu,
        "da_dat": dat,
        "chua_kiem": max(tot - dat - loi, 0.0),
        "chua_gui_kho": chua_gui,
        "viec_do": [cv for cv in cvs if cv.trang_thai != CV_HOAN_THANH],
        "don_vi": next((cv.don_vi_ra for cv in cuoi if cv.don_vi_ra), "") or "",
    }


def _canh_bao(db: Session, s: dict) -> list[dict]:
    dv = f" {s['don_vi']}" if s["don_vi"] else ""
    out: list[dict] = []
    if s["chua_kiem"] > _EPS:
        out.append({"ma": "chua_kiem",
                    "cau": f"Còn {_so(s['chua_kiem'])}{dv} tổ đã ghi tốt mà KCS chưa kiểm."})
    if s["chua_gui_kho"] > _EPS:
        out.append({"ma": "chua_gui_kho",
                    "cau": f"Còn {_so(s['chua_gui_kho'])}{dv} đạt chưa gửi yêu cầu nhập kho."})
    if s["muc_tieu"] is not None and s["da_dat"] + _EPS < s["muc_tieu"]:
        out.append({"ma": "thieu_muc_tieu",
                    "cau": f"Đạt {_so(s['da_dat'])} / {_so(s['muc_tieu'])}{dv} — thiếu "
                           f"{_so(s['muc_tieu'] - s['da_dat'])}."})
    if s["viec_do"]:
        to = sorted({d.name for cv in s["viec_do"]
                     if cv.department_id and (d := db.get(Department, cv.department_id))})
        ten_to = f" ({', '.join(to)})" if to else ""
        out.append({"ma": "viec_do",
                    "cau": f"Còn {len(s['viec_do'])} việc chưa xong{ten_to} — sẽ rút khỏi bàn tổ."})
    return out


def tinh_trang_dong(db: Session, nhom_id: int) -> dict:
    repo = SanXuatRepository(db)
    nhom = _nhom(repo, nhom_id)
    s = _so_lieu(db, nhom_id)
    lan = repo.lan_dong_cuoi(nhom_id) if nhom.trang_thai == NHOM_DONG else None
    return {
        "nhom_id": nhom.id,
        "order_id": nhom.order_id,
        "trang_thai": nhom.trang_thai,
        "version": nhom.version,
        "lenh": [{"id": l.id, "ma": l.ma} for l, _tv in repo.lenh_cua_nhom(nhom_id)],
        "muc_tieu": s["muc_tieu"],
        "da_dat": s["da_dat"],
        "don_vi": s["don_vi"],
        "canh_bao": _canh_bao(db, s) if nhom.trang_thai != NHOM_DONG else [],
        "dong_boi": lan[0] if lan else None,
        "dong_luc": lan[1] if lan else None,
    }


def _chuyen(db: Session, *, user, nhom_id: int, expected_version: int | None, dong: bool) -> dict:
    gate_kcs(db, user)
    repo = SanXuatRepository(db)
    nhom = _nhom(repo, nhom_id)
    if dong and nhom.trang_thai == NHOM_DONG:
        raise ValueError("Lệnh đã đóng rồi.")
    if not dong and nhom.trang_thai != NHOM_DONG:
        raise ValueError("Lệnh chưa đóng nên không có gì để mở lại.")
    if expected_version is not None and expected_version != nhom.version:
        raise ValueError("Vừa có người cập nhật lệnh này, hãy tải lại rồi thao tác.")

    s = _so_lieu(db, nhom_id)
    tu, den = (TT_DA_PHAT_HANH, TT_DA_DONG) if dong else (TT_DA_DONG, TT_DA_PHAT_HANH)
    lenh = [l for l, _tv in repo.lenh_cua_nhom(nhom_id)]
    for l in lenh:
        if l.trang_thai == tu:
            l.trang_thai = den
    nhom.trang_thai = NHOM_DONG if dong else NHOM_DANG_SX
    nhom.version += 1
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None),
        action="san_xuat_dong_lenh" if dong else "san_xuat_mo_lai_lenh",
        target=f"san_xuat_nhom:{nhom.id}",
        detail=(f"lenh={','.join(l.ma for l in lenh)} dat={s['da_dat']:g} "
                f"muc_tieu={'' if s['muc_tieu'] is None else format(s['muc_tieu'], 'g')} "
                f"chua_kiem={s['chua_kiem']:g} chua_gui_kho={s['chua_gui_kho']:g} "
                f"viec_do={len(s['viec_do'])}"),
    )
    db.commit()
    return {
        "nhom_id": nhom.id, "order_id": nhom.order_id, "trang_thai": nhom.trang_thai,
        "kieu": "dong" if dong else "mo_lai", "version": nhom.version,
        "lenh_ma": [l.ma for l in lenh], "da_dat": s["da_dat"], "muc_tieu": s["muc_tieu"],
        "don_vi": s["don_vi"],
    }


def dong(db: Session, *, user, nhom_id: int, expected_version: int | None = None) -> dict:
    return _chuyen(db, user=user, nhom_id=nhom_id, expected_version=expected_version, dong=True)


def mo_lai(db: Session, *, user, nhom_id: int, expected_version: int | None = None) -> dict:
    return _chuyen(db, user=user, nhom_id=nhom_id, expected_version=expected_version, dong=False)


def nhom_da_dong(db: Session, cv) -> bool:
    """Công việc thuộc nhóm đã đóng? Việc chung bài ghép (`nhom_id` NULL) chỉ tính là đóng khi MỌI
    nhóm của các lệnh thành viên đã đóng — cùng luật với `SanXuatRepository.viec_con_hien`."""
    repo = SanXuatRepository(db)
    if cv.nhom_id is not None:
        n = repo.nhom(cv.nhom_id)
        return n is not None and n.trang_thai == NHOM_DONG
    if cv.bai_ghep_id is None:
        return False
    tt = repo.trang_thai_nhom_cua_bai_ghep(cv.bai_ghep_id)
    return bool(tt) and all(t == NHOM_DONG for t in tt)


def chan_neu_da_dong(db: Session, cv, *, cho_viec_dang_chay: bool = False) -> None:
    """Cửa ghi của xưởng gọi hàm này. `cho_viec_dang_chay` = thao tác được phép tiếp trên việc ĐANG
    CHẠY dù lệnh đã đóng (ghi mẻ của chính việc đó) — để tổ khép đồng hồ, không bỏ treo giờ công."""
    if cho_viec_dang_chay and cv.trang_thai == CV_DANG_CHAY:
        return
    if nhom_da_dong(db, cv):
        raise ValueError(CHAN_DA_DONG)
```

`trang_thai_nhom_cua_bai_ghep` sẽ viết ở Task 4. Để test Task 2 chạy được ngay, thêm luôn hàm này vào `SanXuatRepository`, đặt cạnh `lan_dong_cuoi`:

```python
    def trang_thai_nhom_cua_bai_ghep(self, bai_ghep_id: int) -> list[str]:
        """Trạng thái nhóm của mọi lệnh thành viên một bài ghép (lặp theo lệnh)."""
        from ..models.bai_ghep import BaiGhepThanhVien

        return list(self.db.execute(
            select(SanXuatNhom.trang_thai)
            .join(SanXuatNhomLsx, SanXuatNhomLsx.nhom_id == SanXuatNhom.id)
            .join(BaiGhepThanhVien, BaiGhepThanhVien.lsx_id == SanXuatNhomLsx.lsx_id)
            .where(BaiGhepThanhVien.bai_ghep_id == bai_ghep_id)
        ).scalars())
```

Kiểm tên module chứa `Department` (`models/department.py` hay `models/org.py`) bằng grep `class Department`; kiểm `BaiGhepThanhVien` đã import ở đầu `san_xuat_repo.py` chưa (dòng 640 đã dùng, nên nhiều khả năng có sẵn).

- [ ] **Step 6: Xoá file cũ**

```bash
git rm backend/app/services/san_xuat/dong_nhom.py backend/tests/test_san_xuat_dong_nhom.py
```

- [ ] **Step 7: Chạy test**

Run: `cd backend && python -m pytest tests/test_san_xuat_dong_lenh.py -q`
Expected: PASS. Nếu `test_tinh_trang_du_het…` báo thêm `viec_do`, kiểm lại xem `_hoan_thanh_het` có chạy trước `tinh_trang_dong` không.

- [ ] **Step 8: Commit** (router còn import `dong_nhom` nên app chưa khởi động được; Task 3 nối lại. Có thể gộp commit với Task 3.)

```bash
git add backend/app/services/san_xuat/dong_lenh.py backend/app/repositories/san_xuat_repo.py backend/app/schemas/san_xuat.py backend/tests/test_san_xuat_dong_lenh.py
git commit -m "dong_lenh: đóng/mở lại lệnh theo nhóm, cảnh báo không chặn; gỡ cổng tự đóng dong_nhom" -- backend/app/services/san_xuat/dong_lenh.py backend/app/services/san_xuat/dong_nhom.py backend/app/repositories/san_xuat_repo.py backend/app/schemas/san_xuat.py backend/tests/test_san_xuat_dong_lenh.py backend/tests/test_san_xuat_dong_nhom.py
```

---

### Task 3: Router, SSE, audit label, gỡ tự đóng ở gia công ngoài

**Files:**
- Modify: `backend/app/routers/san_xuat.py` (`_thu_dong_nhom` :233-252 + 5 lời gọi :683 :787 :805 :1004 :1026; endpoint :1136-1162; import)
- Modify: `backend/app/realtime.py:272-287`
- Modify: `backend/app/audit_registry.py:176-177`
- Modify: `backend/app/services/gia_cong_ngoai/chot.py` (:14, :26, :97-110, :280-285, :338-343), `backend/app/routers/gia_cong_ngoai.py:203-204`
- Delete + thay: `backend/tests/test_san_xuat_dong_nhom_api.py` → `backend/tests/test_san_xuat_dong_lenh_api.py`
- Sửa test: `test_san_xuat_g5_tich_hop.py`, `test_gia_cong_chot_cuoi.py`, `test_san_xuat_con_thieu.py`

**Interfaces:**
- Consumes: `dong_lenh.tinh_trang_dong/dong/mo_lai`, `DongLenh*` schemas (Task 2).
- Produces:
  - `GET /api/san-xuat/kcs/nhom/{nhom_id}/dong` → `DongLenhTinhTrangOut`
  - `POST /api/san-xuat/kcs/nhom/{nhom_id}/dong` (body `DongLenhIn`) → `DongLenhKetQuaOut`
  - `POST /api/san-xuat/kcs/nhom/{nhom_id}/mo-lai` → `DongLenhKetQuaOut`
  - SSE `{"type":"san_xuat_lenh_dong", nhom_id, order_id, kieu, lenh_ma, da_dat, muc_tieu, don_vi}`

- [ ] **Step 1: Test API (fail)** — mở `backend/tests/test_san_xuat_dong_nhom_api.py` cũ, lấy lại cách nó dựng `client` + token, rồi viết `test_san_xuat_dong_lenh_api.py` theo đúng khuôn đó với 4 ca:
  1. `GET /api/san-xuat/kcs/nhom/{id}/dong` khi chưa đăng nhập → 401.
  2. Người ngoài KCS (admin) `POST …/dong` → 403.
  3. Người KCS `POST …/dong` với `{"expected_version": v}` → 200, `kieu == "dong"`; rồi `GET …/dong` thấy `trang_thai == "closed"`.
  4. `POST …/mo-lai` → 200, `kieu == "mo_lai"`; gọi `POST …/mo-lai` lần nữa → 400.

  Viết code test đầy đủ theo khuôn file cũ (fixture và tên helper lấy nguyên từ đó), sau đó `git rm backend/tests/test_san_xuat_dong_nhom_api.py`.

- [ ] **Step 2: Chạy, thấy fail**

Run: `cd backend && python -m pytest tests/test_san_xuat_dong_lenh_api.py -q` → FAIL (404 route).

- [ ] **Step 3: Router `san_xuat.py`**

Xoá hàm `_thu_dong_nhom` và cả 5 dòng `_thu_dong_nhom(db, res, …)`. Thay khối endpoint :1136-1162 bằng:

```python
# --- ĐÓNG LỆNH (KCS bấm tay — spec 2026-09-29-dong-lenh-thu-cong-design.md) ------------------
@router.get("/kcs/nhom/{nhom_id}/dong", response_model=DongLenhTinhTrangOut)
def tinh_trang_dong_lenh(
    nhom_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_quyen_to("read", (KHO_MODULE, "read"), cho_kcs=True))],
) -> dict:
    """Số tóm tắt + cảnh báo cho hộp xác nhận "Đóng lệnh". Không có cổng điều kiện."""
    return _chay(lambda: dong_lenh.tinh_trang_dong(db, nhom_id))


@router.post("/kcs/nhom/{nhom_id}/dong", response_model=DongLenhKetQuaOut)
def dong_lenh_nhom(
    nhom_id: int,
    body: DongLenhIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Người KCS đóng mọi lệnh của nhóm. Ranh giới thật là `gate_kcs` ở service (403)."""
    res = _chay(lambda: dong_lenh.dong(
        db, user=user, nhom_id=nhom_id, expected_version=body.expected_version))
    phat_dong_lenh(res)
    return res


@router.post("/kcs/nhom/{nhom_id}/mo-lai", response_model=DongLenhKetQuaOut)
def mo_lai_lenh_nhom(
    nhom_id: int,
    body: DongLenhIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    res = _chay(lambda: dong_lenh.mo_lai(
        db, user=user, nhom_id=nhom_id, expected_version=body.expected_version))
    phat_dong_lenh(res)
    return res
```

Sửa import: `dong_nhom` → `dong_lenh`; `phat_dong_nhom` → `phat_dong_lenh`; `DongNhomDieuKienOut, DongNhomKetQuaOut, DongThieuIn` → `DongLenhIn, DongLenhKetQuaOut, DongLenhTinhTrangOut`. Kiểm `_chay` có map `PermissionError → 403` và `ValueError → 400` không (endpoint cũ dựa vào nó). Nếu không map thì bọc try/except giống `tao_yeu_cau_nhap_kho_cong_doan` ở :1120-1127.

- [ ] **Step 4: `realtime.py` — thay `phat_dong_nhom`**

```python
def phat_dong_lenh(ket: dict) -> None:
    """KCS vừa đóng / mở lại lệnh (cả nhóm thành phẩm) → mọi màn bày lệnh refresh + báo Sale/Kế
    hoạch NGAY (§17). Gửi theo QUYỀN: người xem sản xuất (gồm bàn tổ, KCS, xếp lịch, kế hoạch SX) /
    bán hàng / giao hàng."""
    from .doi_tuong_nhan import MAN_BAN_HANG, MAN_GIAO_HANG, MAN_THEO_LENH, hop

    hub.gui({
        "type": "san_xuat_lenh_dong",
        "nhom_id": ket.get("nhom_id"),
        "order_id": ket.get("order_id"),
        "kieu": ket.get("kieu"),
        "lenh_ma": ket.get("lenh_ma") or [],
        "da_dat": ket.get("da_dat"),
        "muc_tieu": ket.get("muc_tieu"),
        "don_vi": ket.get("don_vi") or "",
    }, quyen=hop(MAN_THEO_LENH, MAN_BAN_HANG, MAN_GIAO_HANG))
```

Mở `doi_tuong_nhan.py:35-54` kiểm `MAN_THEO_LENH` có module của màn Kế hoạch SX (`lsx` hoặc tên module thật của màn đó, xem `routers/lsx.py` dùng `require_permission("…")`) và `xep_lich`. Thiếu thì thêm vào `MAN_THEO_LENH`.

- [ ] **Step 5: `audit_registry.py:176-177`**

```python
    "san_xuat_dong_lenh": "Đóng lệnh sản xuất",
    "san_xuat_mo_lai_lenh": "Mở lại lệnh sản xuất",
```

Giữ hai khoá cũ `san_xuat_dong_nhom_du`/`_thieu` để dòng nhật ký cũ còn nhãn.

- [ ] **Step 6: Gia công ngoài — `chot.py`**

- Import dòng 14: bỏ `NHOM_DANG_SX, NHOM_DONG_DU, NHOM_DONG_THIEU`, thêm `NHOM_DONG`. Bỏ import `tu_dong_dong_neu_du` (dòng 26).
- `_go_kcs_va_nhom` (:97-110):

```python
def _go_kcs_va_nhom(db: Session, *, user, gcn, cuoi) -> None:
    sx = SanXuatRepository(db)
    nhoms = [n for n in (sx.nhom(i) for i in _nhom_ids(db, gcn, cuoi)) if n is not None]
    if any(n.trang_thai == NHOM_DONG for n in nhoms):
        raise ValueError("Lệnh đã đóng — KCS mở lại trước rồi mới gỡ số chốt.")
    kcs_repo = SanXuatKcsRepository(db)
    for k in kcs_repo.cac_kcs_batch(cuoi.id):
        db.delete(k)
```

- :280-285: xoá vòng `tu_dong_dong_neu_du` và key `nhoms_dong` trong kết quả (cũng như `_dong_nhom`/`_dong_nhoms` ở :73, :80, :137 nếu chúng chỉ phục vụ việc tự đóng; grep `nhom_dong` trong file và trong `routers/gia_cong_ngoai.py`).
- :338-343 `ly_do_khong_mo_lai`: `NHOM_DONG_THIEU` → `NHOM_DONG`, câu → `"Lệnh đã đóng — KCS mở lại trước rồi mới gỡ số chốt."`
- `routers/gia_cong_ngoai.py:203-204`: xoá đoạn phát `phat_dong_nhom` cho `nhoms_dong`.

- [ ] **Step 7: Sửa test đang ghim hành vi cũ**

- `test_san_xuat_g5_tich_hop.py`: xoá 3 test tự-đóng (:40-80) và import từ `test_san_xuat_dong_nhom`. Thay bằng 1 test: KCS kiểm hết công đoạn cuối qua router thì nhóm VẪN `in_production` (không còn tự đóng).
- `test_gia_cong_chot_cuoi.py`:
  - :47-58 đổi thành: chốt về kho xong nhóm vẫn `NHOM_DANG_SX` và không có key `nhom_dong`.
  - :70-79: bỏ phần "mở lại khi đóng đủ".
  - :96-108: dựng nhóm đã đóng bằng `dong_lenh.dong(...)` với một user KCS, rồi assert `mo_lai` ném `"Lệnh đã đóng"`.
- `test_san_xuat_con_thieu.py:76-98`: đang đọc `dieu_kien_dong_nhom(...)["con_thieu"/"du_dong_thieu"]`. Đổi sang `dong_lenh.tinh_trang_dong(...)` và assert trên `muc_tieu`/`da_dat` cùng cảnh báo `thieu_muc_tieu`.

- [ ] **Step 8: Chạy**

Run: `cd backend && python -m pytest tests/test_san_xuat_dong_lenh.py tests/test_san_xuat_dong_lenh_api.py tests/test_san_xuat_g5_tich_hop.py tests/test_gia_cong_chot_cuoi.py tests/test_san_xuat_con_thieu.py tests/test_gia_cong_chot_xuong.py -q`
Expected: PASS. Sau đó `grep -rn "dong_nhom\|NHOM_DONG_DU\|NHOM_DONG_THIEU\|NHOM_CHO_DIEU_KIEN\|phat_dong_nhom" backend/` phải rỗng, trừ docstring lịch sử.

- [ ] **Step 9: Commit**

```bash
git add backend/app/routers/san_xuat.py backend/app/realtime.py backend/app/audit_registry.py backend/app/services/gia_cong_ngoai/chot.py backend/app/routers/gia_cong_ngoai.py backend/app/doi_tuong_nhan.py backend/tests/test_san_xuat_dong_lenh_api.py backend/tests/test_san_xuat_g5_tich_hop.py backend/tests/test_gia_cong_chot_cuoi.py backend/tests/test_san_xuat_con_thieu.py
git commit -m "đóng lệnh: endpoint KCS đóng/mở lại + SSE san_xuat_lenh_dong; gỡ tự đóng ở bàn tổ, KCS và gia công ngoài" -- backend/app/routers/san_xuat.py backend/app/realtime.py backend/app/audit_registry.py backend/app/services/gia_cong_ngoai/chot.py backend/app/routers/gia_cong_ngoai.py backend/app/doi_tuong_nhan.py backend/tests/test_san_xuat_dong_lenh_api.py backend/tests/test_san_xuat_dong_nhom_api.py backend/tests/test_san_xuat_g5_tich_hop.py backend/tests/test_gia_cong_chot_cuoi.py backend/tests/test_san_xuat_con_thieu.py
```

(Đường dẫn `doi_tuong_nhan.py` có thể là `backend/app/services/doi_tuong_nhan.py`, grep `def hop(` để biết đúng chỗ. Không sửa file này thì bỏ khỏi lệnh.)

---

### Task 4: Chặn thao tác xưởng + lọc bàn tổ

**Files:**
- Modify: `backend/app/repositories/san_xuat_repo.py` (+ `viec_con_hien`; gắn vào `cong_viec_cua_to` :518, `lenh_cua_to_phan_trang` :613, `cong_viec_cua_lenh` :717, `dem_cho_lam_theo_to` :792)
- Modify: `services/san_xuat/thuc_thi.py` (`bat_dau` :215, `phan_cong` :120, `doi_may` :452, `nhan_khuon` :533)
- Modify: `services/san_xuat/san_luong.py:205-209`, `services/san_xuat/kcs.py:270-273` và `:484-487`, `services/san_xuat/kho.py:367` (`tao_yeu_cau_nhap_kho_cong_doan`), `services/san_xuat/ban_giao.py:186` (`de_xuat`) và `:283` (`xac_nhan`), service `vat_tu_de_nghi.tao`
- Test: `backend/tests/test_san_xuat_dong_lenh_chan.py` (tạo)

**Interfaces:**
- Consumes: `dong_lenh.chan_neu_da_dong`, `CHAN_DA_DONG`, `NHOM_DONG`.
- Produces: `SanXuatRepository.viec_con_hien()` — biểu thức SQL `ColumnElement[bool]`.

- [ ] **Step 1: Test (fail)**

```python
"""Lệnh đã đóng: cửa ghi xưởng từ chối; việc đang chạy vẫn khép được; bàn tổ ẩn việc chưa làm."""
from __future__ import annotations

import pytest

from app.models.san_xuat import CV_DANG_CHAY, CV_PHAT_HANH, CV_TAM_DUNG
from app.repositories.san_xuat_repo import SanXuatRepository
from app.services.san_xuat import dong_lenh, kcs, san_luong

from tests.test_san_xuat_kcs import (  # noqa: F401
    _batch, admin, customer, db, lsx_svc, orders,
)


def _dong(db, cv, res):
    dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=None)


def test_kcs_kiem_bi_chan_khi_da_dong(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    _dong(db, cv, res)
    with pytest.raises(ValueError, match="Lệnh đã đóng"):
        kcs.kiem_cong_doan(db, user=res["nguoi_kcs"], cong_viec_id=cv.id, so_dat=1, so_loi=0)


def test_nhap_kho_bi_chan_khi_da_dong(db, orders, lsx_svc, admin, customer):
    from app.services.san_xuat import kho

    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    _dong(db, cv, res)
    with pytest.raises(ValueError, match="Lệnh đã đóng"):
        kho.tao_yeu_cau_nhap_kho_cong_doan(db, user=res["nguoi_kcs"], cong_viec_id=cv.id)


def test_ban_to_an_viec_chua_lam_giu_viec_dang_chay(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    repo = SanXuatRepository(db)
    cvs = repo.cong_viec_hien_tai_cua_nhom(cv.nhom_id)
    dang_chay = cvs[0]
    dang_chay.trang_thai = CV_DANG_CHAY
    cho = [c for c in cvs[1:]]
    for c in cho:
        c.trang_thai = CV_PHAT_HANH
    db.commit()
    depts = {c.department_id for c in cvs if c.department_id}
    truoc = {c.id for c in repo.cong_viec_cua_to(depts)}
    _dong(db, cv, res)
    sau = {c.id for c in repo.cong_viec_cua_to(depts)}
    assert dang_chay.id in sau
    assert not ({c.id for c in cho} & sau)
    assert truoc >= sau
    dem = repo.dem_cho_lam_theo_to(depts)
    assert sum(dem.values()) == 1                   # chỉ còn việc đang chạy


def test_mo_lai_thi_viec_hien_lai(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    repo = SanXuatRepository(db)
    cvs = repo.cong_viec_hien_tai_cua_nhom(cv.nhom_id)
    for c in cvs:
        c.trang_thai = CV_TAM_DUNG
    db.commit()
    depts = {c.department_id for c in cvs if c.department_id}
    kq = dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=None)
    assert repo.cong_viec_cua_to(depts) == []
    dong_lenh.mo_lai(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=kq["version"])
    assert {c.id for c in repo.cong_viec_cua_to(depts)} == {c.id for c in cvs}
```

Thêm 1 test ghi mẻ, dựa trên chữ ký thật của `san_luong.tao_batch` (đọc ở `san_luong.py:180`):
- việc `CV_DANG_CHAY` của nhóm đã đóng → ghi mẻ ĐƯỢC;
- chuyển sang `CV_TAM_DUNG` → `pytest.raises(ValueError, match="Lệnh đã đóng")`.

Người ghi dùng `_nguoi_o_to(db, dept, "tho1", viec=("record_output",))`, kiểm tên việc quyền đúng trong `test_san_xuat_san_luong.py`.

- [ ] **Step 2: Chạy, thấy fail**

Run: `cd backend && python -m pytest tests/test_san_xuat_dong_lenh_chan.py -q` → FAIL.

- [ ] **Step 3: `viec_con_hien` ở `SanXuatRepository`**

```python
    @staticmethod
    def viec_con_hien():
        """Điều kiện SQL: bỏ khỏi bàn tổ việc CHƯA LÀM / TẠM DỪNG của lệnh đã đóng (spec
        2026-09-29). Việc đang chạy vẫn hiện tới khi tổ bấm Kết thúc; việc đã xong vẫn là lịch sử.
        Việc chung bài ghép (`nhom_id` NULL) chỉ ẩn khi có nhóm đã đóng và KHÔNG còn nhóm nào mở."""
        from sqlalchemy import and_, exists, not_

        from ..models.bai_ghep import BaiGhepThanhVien

        nhom_dong = exists().where(
            SanXuatNhom.id == SanXuatCongViec.nhom_id, SanXuatNhom.trang_thai == NHOM_DONG)

        def _tv(dk):
            return (exists()
                    .where(BaiGhepThanhVien.bai_ghep_id == SanXuatCongViec.bai_ghep_id,
                           SanXuatNhomLsx.lsx_id == BaiGhepThanhVien.lsx_id,
                           SanXuatNhom.id == SanXuatNhomLsx.nhom_id, dk))

        bg_dong = and_(
            SanXuatCongViec.nhom_id.is_(None),
            SanXuatCongViec.bai_ghep_id.is_not(None),
            _tv(SanXuatNhom.trang_thai == NHOM_DONG),
            not_(_tv(SanXuatNhom.trang_thai != NHOM_DONG)),
        )
        an = and_(SanXuatCongViec.trang_thai.in_((CV_PHAT_HANH, CV_TAM_DUNG)),
                  or_(nhom_dong, bg_dong))
        return not_(an)
```

Thêm import `NHOM_DONG, CV_PHAT_HANH, CV_TAM_DUNG` vào khối import model ở đầu file (cạnh `GOI_DANG_PHAT_HANH`); kiểm `or_` đã import ở mức module chưa. Sau đó ở mỗi truy vấn trong 4 hàm, thêm `self.viec_con_hien(),` ngay sau dòng `SanXuatGoiPhatHanh.trang_thai == GOI_DANG_PHAT_HANH,`:
- `cong_viec_cua_to` :520
- `lenh_cua_to_phan_trang` :615
- `cong_viec_cua_lenh` :719
- `dem_cho_lam_theo_to` :795

KHÔNG gắn vào `cong_viec_hien_tai_cua_nhom`, vì dong_lenh cần thấy trọn nhóm.

- [ ] **Step 4: Gắn chặn ở cửa ghi**

Mỗi cửa thêm hai dòng ngay sau khi đã có `cv` và qua kiểm `CHAN_XUONG` (nếu có):

```python
    from .dong_lenh import chan_neu_da_dong
    chan_neu_da_dong(db, cv)
```

| Hàm | Tham số |
|---|---|
| `thuc_thi.bat_dau`, `phan_cong`, `doi_may`, `nhan_khuon` (sau `_lay_cong_viec`) | mặc định |
| `san_luong.tao_batch` (sau khối :205-208) | `cho_viec_dang_chay=True` |
| `kcs.kiem_cong_doan` (sau :273) | mặc định |
| `kcs.dieu_chinh_ket_qua` (sau :487) | mặc định |
| `kho.tao_yeu_cau_nhap_kho_cong_doan` (sau khi nạp cv) | mặc định |
| `ban_giao.de_xuat`, `ban_giao.xac_nhan` (công việc nguồn) | mặc định |
| `vat_tu_de_nghi.tao` (công việc) | mặc định |

KHÔNG chặn `tam_dung`, `ket_thuc`, `tra_khuon`, báo sự cố. Trong `thuc_thi.py` dùng `db` là session mà hàm đang có. Nếu hàm chỉ có `repo`, lấy `repo.db`.

Router `san_xuat.py` các cửa này đã map `ValueError → 400`. Kiểm bằng test API ngẫu nhiên một cửa, hoặc đọc `_chay`.

- [ ] **Step 5: Chạy**

Run: `cd backend && python -m pytest tests/test_san_xuat_dong_lenh_chan.py tests/test_san_xuat_board.py tests/test_san_xuat_board_api.py tests/test_san_xuat_lenh_phan_trang.py tests/test_san_xuat_kcs.py tests/test_san_xuat_san_luong.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/repositories/san_xuat_repo.py backend/app/services/san_xuat/thuc_thi.py backend/app/services/san_xuat/san_luong.py backend/app/services/san_xuat/kcs.py backend/app/services/san_xuat/kho.py backend/app/services/san_xuat/ban_giao.py backend/tests/test_san_xuat_dong_lenh_chan.py
git commit -m "lệnh đã đóng: chặn ghi mới ở xưởng (trừ khép việc đang chạy), bàn tổ ẩn việc chưa làm" -- backend/app/repositories/san_xuat_repo.py backend/app/services/san_xuat/thuc_thi.py backend/app/services/san_xuat/san_luong.py backend/app/services/san_xuat/kcs.py backend/app/services/san_xuat/kho.py backend/app/services/san_xuat/ban_giao.py backend/tests/test_san_xuat_dong_lenh_chan.py
```

(Thêm đường dẫn file service `vat_tu_de_nghi` thật vào cả hai danh sách.)

---

### Task 5: `da_dong` ở các màn kế hoạch / tra cứu / xếp lịch (backend)

**Files:**
- Modify: `backend/app/services/lenh_sx/pham_vi.py:46`, `:58`
- Modify: `backend/app/services/don_hang_tien_do.py:43`
- Modify: `backend/app/services/lsx_service.py:3159-3196`
- Modify: `backend/app/services/xep_lich/service.py:727`, `thu_hoi` :758
- Modify: `backend/app/services/xep_lich_van_de_service.py:764-775` (`phat_hanh_lsx`), `:842-860` (`go_phat_hanh_lsx`)
- Test: `backend/tests/test_lsx_da_dong.py` (tạo)

**Interfaces:**
- Consumes: `TT_DA_DONG`, `TT_DA_XUONG_XUONG`, `dong_lenh.dong`.

- [ ] **Step 1: Test (fail)**

```python
"""Lệnh `da_dong`: vẫn thấy ở màn tra cứu/tiến độ; không phát hành lại, không thu hồi, không đổi tay, không xoá."""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.lsx import TT_DA_DONG, Lsx
from app.services.lenh_sx.pham_vi import chan_ngoai_pham_vi, loc_lsx_da_phat_hanh
from app.services.san_xuat import dong_lenh

from tests.test_san_xuat_kcs import (  # noqa: F401
    _batch, admin, customer, db, lsx_svc, orders,
)


def _lenh_da_dong(db, orders, lsx_svc, admin, customer) -> Lsx:
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=None)
    l = db.get(Lsx, cv.lsx_id)
    assert l.trang_thai == TT_DA_DONG
    return l


def test_man_tra_cuu_van_thay(db, orders, lsx_svc, admin, customer):
    l = _lenh_da_dong(db, orders, lsx_svc, admin, customer)
    ids = db.execute(loc_lsx_da_phat_hanh(select(Lsx.id), None)).scalars().all()
    assert l.id in ids
    chan_ngoai_pham_vi(db, l, None)          # không ném 404


def test_doi_tay_va_xoa_bi_chan(db, orders, lsx_svc, admin, customer):
    l = _lenh_da_dong(db, orders, lsx_svc, admin, customer)
    with pytest.raises(Exception, match="đóng"):
        lsx_svc.set_trang_thai(lsx_id=l.id, trang_thai="nhap", actor=admin)
    with pytest.raises(Exception, match="đóng"):
        lsx_svc.set_trang_thai(lsx_id=l.id, trang_thai=TT_DA_DONG, actor=admin)
    with pytest.raises(Exception, match="đóng"):
        lsx_svc.xoa(lsx_id=l.id, actor=admin)
```

Thêm 2 test nữa theo khuôn của test thu hồi/phát hành màn 3 có sẵn (grep `def test_.*thu_hoi` trong `backend/tests/test_xep_lich_*.py` để lấy fixture dựng `XepLichLenhService`):
- `phat_hanh(l.id)` trên lệnh đã đóng ném `XepLichLenhConflict` với `"đã đóng"`;
- `thu_hoi(l.id, ly_do="thử lại")` ném lỗi `"đã đóng"`.

- [ ] **Step 2: Chạy, thấy fail.** Run: `cd backend && python -m pytest tests/test_lsx_da_dong.py -q`

- [ ] **Step 3: Sửa**

`pham_vi.py`: import `TT_DA_XUONG_XUONG`.
- :46 → `stmt = stmt.where(Lsx.trang_thai.in_(TT_DA_XUONG_XUONG))`
- :58 → `if lsx is None or lsx.trang_thai not in TT_DA_XUONG_XUONG:`
- Docstring hai hàm: "đã phát hành" → "đã xuống xưởng (đang chạy hoặc đã đóng)".

`don_hang_tien_do.py:43` → `chay = [i for i in lsx_ids if lenh[i].trang_thai in TT_DA_XUONG_XUONG]`, sửa import. Mở `tien_do.phan_tram` / `mot_lenh` xem có chỗ nào suy "xong" không: lệnh `da_dong` phải có `xong: True`. Thêm ngay sau `pct, uoc = …`:

```python
        if l.trang_thai == TT_DA_DONG:
            pct = 100.0
```

và ở dict trả về đặt `"xong": … or l.trang_thai == TT_DA_DONG`. Đọc hàm trước rồi đặt đúng chỗ.

`lsx_service.set_trang_thai`, chèn trước kiểm `TT_DA_PHAT_HANH`:

```python
        if trang_thai == TT_DA_DONG or lsx.trang_thai == TT_DA_DONG:
            raise LsxConflict("Lệnh đã đóng — KCS đóng/mở lại ở màn KCS, không đổi trực tiếp ở đây")
```

`lsx_service.xoa`, sau kiểm `TT_DA_PHAT_HANH`:

```python
        if lsx.trang_thai == TT_DA_DONG:
            raise LsxConflict("Lệnh đã đóng — không xoá được")
```

`xep_lich/service.py:727`, trước kiểm `== TT_DA_PHAT_HANH`:

```python
        if l.trang_thai == TT_DA_DONG:
            raise XepLichLenhConflict(f"Lệnh {l.ma} đã đóng — KCS mở lại trước nếu muốn làm tiếp.")
```

Và trong `thu_hoi`, ngay sau `if l is None`:

```python
        if l.trang_thai == TT_DA_DONG:
            raise XepLichLenhConflict(f"Lệnh {l.ma} đã đóng — không thu hồi được.")
```

(import `TT_DA_DONG` cục bộ như các import khác trong hàm). Vòng cụm :735-737 đang đè `trang_thai` mọi lệnh cụm thành `da_phat_hanh`, nên sửa thành `if x.trang_thai not in (TT_DA_PHAT_HANH, TT_DA_DONG):`, để phát hành một lệnh không kéo lệnh đã đóng cùng cụm sống lại.

`xep_lich_van_de_service.py`: trong `phat_hanh_lsx` và `go_phat_hanh_lsx`, thêm cùng câu chặn `da_dong` ngay sau khi nạp lệnh, dùng loại lỗi `XepLichConflict` mà file đó đang dùng.

- [ ] **Step 4: Chạy**

Run: `cd backend && python -m pytest tests/test_lsx_da_dong.py tests/test_lenh_sx_trang_thai.py tests/test_don_hang_tien_do.py -q` (file nào không tồn tại thì bỏ; grep `don_hang_tien_do` trong `tests/` để tìm test đúng). Rồi chạy thêm các file test xếp lịch màn 3 đã dùng ở Step 1.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/lenh_sx/pham_vi.py backend/app/services/don_hang_tien_do.py backend/app/services/lsx_service.py backend/app/services/xep_lich/service.py backend/app/services/xep_lich_van_de_service.py backend/tests/test_lsx_da_dong.py
git commit -m "lệnh da_dong: vẫn hiện ở tra cứu/tiến độ đơn; chặn phát hành lại, thu hồi, đổi tay, xoá" -- backend/app/services/lenh_sx/pham_vi.py backend/app/services/don_hang_tien_do.py backend/app/services/lsx_service.py backend/app/services/xep_lich/service.py backend/app/services/xep_lich_van_de_service.py backend/tests/test_lsx_da_dong.py
```

---

### Task 6: Frontend — khối "Đóng lệnh" + nhãn "Đã đóng" + toast

**Files:**
- Modify: `frontend/src/api/client.ts` (:660-709 type SSE, :740-745 `LsxTrangThai`, :2561-2595 types, :13124-13132 API)
- Create: `frontend/src/pages/kcs/KcsDongLenh.tsx`, `frontend/src/pages/kcs/KcsDongLenh.test.tsx`
- Delete: `frontend/src/pages/kcs/KcsChotNhom.tsx`, `KcsChotNhom.test.tsx`
- Modify: `frontend/src/pages/kcs/KcsChuoiCongDoan.tsx:340-344`, `frontend/src/pages/kcs/kcsNhan.ts:50-51`
- Modify: `frontend/src/components/AppShell.tsx:1058-1070`, `frontend/src/lib/suKienNhom.ts:96`
- Modify: `frontend/src/pages/keHoachSxShared.tsx:116`, `XlGantt.tsx:47`, `XlChiTiet.tsx:27`, `xep-lich.css:2041`, CSS pill `khsx-pill--*`

**Interfaces:**
- Consumes: 3 endpoint + SSE `san_xuat_lenh_dong` (Task 3).
- Produces: `api.sanXuat.tinhTrangDongLenh(token, nhomId)`, `api.sanXuat.dongLenh(token, nhomId, body)`, `api.sanXuat.moLaiLenh(token, nhomId, body)`; component `KcsDongLenh`.

- [ ] **Step 1: Types + API trong `client.ts`**

Thay `SxDongNhomDieuKienItem`, `SxDongNhomDieuKien`, `SxDongNhomKetQua`, `SxDongThieuIn` bằng:

```ts
export interface SxDongLenhCanhBao {
  ma: "chua_kiem" | "chua_gui_kho" | "thieu_muc_tieu" | "viec_do";
  cau: string;
}
export interface SxDongLenhTinhTrang {
  nhom_id: number;
  order_id?: number | null;
  trang_thai: "in_production" | "closed";
  version: number;
  lenh: { id: number; ma: string }[];
  muc_tieu: number | null;
  da_dat: number;
  don_vi: string;
  canh_bao: SxDongLenhCanhBao[];
  dong_boi: string | null;
  dong_luc: string | null;
}
export interface SxDongLenhKetQua {
  nhom_id: number;
  order_id?: number | null;
  trang_thai: string;
  kieu: "dong" | "mo_lai";
  version: number;
  lenh_ma: string[];
  da_dat: number;
  muc_tieu: number | null;
  don_vi: string;
}
```

API (thay 2 hàm cũ):

```ts
    /** Số tóm tắt + cảnh báo cho hộp "Đóng lệnh" (không có cổng). */
    tinhTrangDongLenh(token: string, nhomId: number): Promise<SxDongLenhTinhTrang> {
      return authed<SxDongLenhTinhTrang>(`/api/san-xuat/kcs/nhom/${nhomId}/dong`, token);
    },
    dongLenh(token: string, nhomId: number, body: { expected_version: number }): Promise<SxDongLenhKetQua> {
      return authed<SxDongLenhKetQua>(`/api/san-xuat/kcs/nhom/${nhomId}/dong`, token, {
        method: "POST", body: JSON.stringify(body),
      });
    },
    moLaiLenh(token: string, nhomId: number, body: { expected_version: number }): Promise<SxDongLenhKetQua> {
      return authed<SxDongLenhKetQua>(`/api/san-xuat/kcs/nhom/${nhomId}/mo-lai`, token, {
        method: "POST", body: JSON.stringify(body),
      });
    },
```

SSE union (:703-709): thay khối `san_xuat_nhom_dong` bằng

```ts
  | {
      type: "san_xuat_lenh_dong";
      nhom_id?: number | null;
      order_id?: number | null;
      kieu?: "dong" | "mo_lai" | null;
      lenh_ma?: string[];
      da_dat?: number | null;
      muc_tieu?: number | null;
      don_vi?: string;
    }
```

Sửa luôn comment :660-662. `LsxTrangThai`: thêm `| "da_dong";     // KCS đã đóng lệnh — mở lại về da_phat_hanh`.

- [ ] **Step 2: Test component (fail)** — `KcsDongLenh.test.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SxDongLenhTinhTrang } from "../../api/client";
import { KcsDongLenh } from "./KcsDongLenh";

vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
const tinhTrang = vi.fn();
const dong = vi.fn();
const moLai = vi.fn();
vi.mock("../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../api/client")>()),
  api: {
    sanXuat: {
      tinhTrangDongLenh: (...a: unknown[]) => tinhTrang(...a),
      dongLenh: (...a: unknown[]) => dong(...a),
      moLaiLenh: (...a: unknown[]) => moLai(...a),
    },
  },
}));

function tt(over: Partial<SxDongLenhTinhTrang> = {}): SxDongLenhTinhTrang {
  return {
    nhom_id: 4, trang_thai: "in_production", version: 1,
    lenh: [{ id: 1, ma: "LSX26-0004" }], muc_tieu: 10000, da_dat: 9690, don_vi: "hộp",
    canh_bao: [
      { ma: "chua_gui_kho", cau: "Còn 300 hộp đạt chưa gửi yêu cầu nhập kho." },
      { ma: "thieu_muc_tieu", cau: "Đạt 9.690 / 10.000 hộp — thiếu 310." },
    ],
    dong_boi: null, dong_luc: null, ...over,
  };
}

describe("KcsDongLenh", () => {
  beforeEach(() => { tinhTrang.mockReset(); dong.mockReset(); moLai.mockReset(); });

  it("bấm Đóng lệnh → hộp xác nhận bày cảnh báo, không chặn nút", async () => {
    tinhTrang.mockResolvedValueOnce(tt())
      .mockResolvedValueOnce(tt({ trang_thai: "closed", version: 2, canh_bao: [],
        dong_boi: "KCS A", dong_luc: "2026-09-29T07:20:00Z" }));
    dong.mockResolvedValue({});
    const onDone = vi.fn();
    render(<KcsDongLenh nhomId={4} canDong onDone={onDone} />);

    fireEvent.click(await screen.findByRole("button", { name: "Đóng lệnh" }));
    expect(screen.getByText("Đóng lệnh LSX26-0004?")).toBeTruthy();
    expect(screen.getByText("Còn 300 hộp đạt chưa gửi yêu cầu nhập kho.")).toBeTruthy();
    expect(screen.getByText("Đạt 9.690 / 10.000 hộp — thiếu 310.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận đóng" }));
    await waitFor(() => expect(dong).toHaveBeenCalledWith("token-test", 4, { expected_version: 1 }));
    expect(await screen.findByText(/Đã đóng bởi KCS A/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mở lại" })).toBeTruthy();
    expect(onDone).toHaveBeenCalled();
  });

  it("nhóm nhiều lệnh thì tiêu đề liệt kê đủ", async () => {
    tinhTrang.mockResolvedValueOnce(tt({ lenh: [{ id: 1, ma: "LSX26-0004" }, { id: 2, ma: "LSX26-0005" }] }));
    render(<KcsDongLenh nhomId={4} canDong onDone={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Đóng lệnh" }));
    expect(screen.getByText("Đóng 2 lệnh: LSX26-0004, LSX26-0005?")).toBeTruthy();
  });

  it("mở lại gọi API với version", async () => {
    tinhTrang.mockResolvedValue(tt({ trang_thai: "closed", version: 3, canh_bao: [], dong_boi: "KCS A",
      dong_luc: "2026-09-29T07:20:00Z" }));
    moLai.mockResolvedValue({});
    render(<KcsDongLenh nhomId={4} canDong onDone={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Mở lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận mở lại" }));
    await waitFor(() => expect(moLai).toHaveBeenCalledWith("token-test", 4, { expected_version: 3 }));
  });

  it("không phải người KCS thì không có nút", async () => {
    tinhTrang.mockResolvedValueOnce(tt());
    render(<KcsDongLenh nhomId={4} canDong={false} onDone={() => {}} />);
    expect(await screen.findByText(/9.690/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Đóng lệnh" })).toBeNull();
  });
});
```

- [ ] **Step 3: Chạy, thấy fail.** Run: `cd frontend && npx vitest run src/pages/kcs/KcsDongLenh.test.tsx`

- [ ] **Step 4: `KcsDongLenh.tsx`**

```tsx
// ĐÓNG LỆNH ở màn KCS (spec 2026-09-29-dong-lenh-thu-cong-design.md). KCS kiểm xong, gửi nhập kho,
// rồi tự bấm đóng — KHÔNG có cổng điều kiện; phần còn dở chỉ hiện thành cảnh báo trong hộp xác nhận.
// Đóng theo NHÓM: mọi lệnh của nhóm đóng cùng lúc. Mở lại được. Thay `KcsChotNhom` (tự đóng đủ /
// trưởng KCS đóng thiếu — gỡ 29/09/2026).
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type SxDongLenhTinhTrang } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { Icon } from "../../components/Icons";
import { num } from "../keHoachSxShared";

function gioVN(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
  });
}

export function tieuDeDong(tt: SxDongLenhTinhTrang): string {
  const ma = tt.lenh.map((l) => l.ma);
  return ma.length > 1 ? `Đóng ${ma.length} lệnh: ${ma.join(", ")}?` : `Đóng lệnh ${ma[0] ?? ""}?`;
}

export function KcsDongLenh({
  nhomId, canDong, eventTick, onDone,
}: {
  nhomId: number;
  /** Người thuộc phòng ban KCS — máy chủ gác `gate_kcs`. */
  canDong: boolean;
  eventTick?: number;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const [tt, setTt] = useState<SxDongLenhTinhTrang | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hop, setHop] = useState(false);

  const tai = useCallback(() => {
    if (!token) return;
    api.sanXuat.tinhTrangDongLenh(token, nhomId)
      .then((r) => { setTt(r); setLoi(null); })
      .catch((e) => setLoi(e instanceof ApiError ? e.message : "Không đọc được tình trạng lệnh."));
  }, [token, nhomId]);

  useEffect(() => { tai(); }, [tai, eventTick]);

  const daDong = tt?.trang_thai === "closed";

  async function xacNhan() {
    if (!token || !tt || busy) return;
    setBusy(true);
    setLoi(null);
    try {
      const body = { expected_version: tt.version };
      if (daDong) await api.sanXuat.moLaiLenh(token, tt.nhom_id, body);
      else await api.sanXuat.dongLenh(token, tt.nhom_id, body);
      setHop(false);
      tai();
      onDone();
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : daDong ? "Không mở lại được." : "Không đóng được.");
    } finally {
      setBusy(false);
    }
  }

  const dv = tt?.don_vi ? ` ${tt.don_vi}` : "";

  return (
    <section className="kcs-section">
      <h2>Đóng lệnh</h2>
      <div className="kcs-chot">
        {loi && <div className="banner banner--error" role="alert"><span>{loi}</span></div>}
        {tt == null ? (
          !loi && <p className="kcs-chot__phu">Đang tải…</p>
        ) : (
          <>
            <div className="kcs-chot__so">
              <span>KCS đạt <b>{num(tt.da_dat)}</b>{tt.muc_tieu != null && <> / {num(tt.muc_tieu)}</>}{dv}</span>
            </div>
            {daDong && (
              <p className="kcs-chot__cau kcs-chot__cau--dong">
                <Icon name="packageCheck" size={14} />
                <span>
                  Đã đóng{tt.dong_boi ? ` bởi ${tt.dong_boi}` : ""}{tt.dong_luc ? ` lúc ${gioVN(tt.dong_luc)}` : ""}.
                </span>
              </p>
            )}

            {canDong && !hop && (
              <div className="kcs-chot__nut">
                <button type="button" className={`btn btn--sm ${daDong ? "btn--ghost" : "btn--accent"}`}
                  onClick={() => setHop(true)} disabled={busy}>
                  <Icon name={daDong ? "undo" : "packageCheck"} size={13} /> {daDong ? "Mở lại" : "Đóng lệnh"}
                </button>
              </div>
            )}

            {canDong && hop && (
              <div className="kcs-chot__xn" role="dialog" aria-label={daDong ? "Mở lại lệnh" : "Đóng lệnh"}>
                <p><b>{daDong ? "Mở lại lệnh? Việc chưa làm sẽ hiện lại ở bàn tổ." : tieuDeDong(tt)}</b></p>
                {!daDong && tt.canh_bao.length > 0 && (
                  <ul className="kcs-chot__chan">
                    {tt.canh_bao.map((c) => <li key={c.ma}>{c.cau}</li>)}
                  </ul>
                )}
                <div className="kcs-chot__nut">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHop(false)} disabled={busy}>
                    Để sau
                  </button>
                  <button type="button" className="btn btn--accent btn--sm" onClick={xacNhan} disabled={busy}>
                    <Icon name="check" size={13} />{" "}
                    {busy ? "Đang lưu…" : daDong ? "Xác nhận mở lại" : "Xác nhận đóng"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
```

Kiểm tên icon `undo` có trong `components/Icons` không. Không có thì dùng một icon sẵn có (grep `name:` hoặc map icon), đừng thêm icon mới.

- [ ] **Step 5: Mount + dọn**

- `KcsChuoiCongDoan.tsx:340-344`: thay `<KcsChotNhom nhomId={lsx.nhom_id} canDong={truongKcs} …/>` bằng `<KcsDongLenh nhomId={lsx.nhom_id} canDong={laKcs} eventTick={…} onDone={…} />`. Giữ nguyên `eventTick`/`onDone` đang truyền; bỏ prop `nhan`. Biến `laKcs` là cờ "người thuộc KCS" (từ `useKcs()` trong `auth/permissions.tsx:160`); đọc hook để lấy đúng field (`kcs` chứ không phải `truong_kcs`). Nếu `truongKcs` hết chỗ dùng thì xoá.
- `git rm frontend/src/pages/kcs/KcsChotNhom.tsx frontend/src/pages/kcs/KcsChotNhom.test.tsx`. CSS `.kcs-chot*` giữ nguyên vì khối mới tái dùng.
- `kcsNhan.ts:50-51` → `closed: { nhan: "Đã đóng", cls: "badge-sem--moss" },`, bỏ hai dòng cũ. Grep `waiting_conditions` trong `kcsNhan.ts`, có thì xoá.
- `KcsTheoLenhPage.tsx:148-150`: công tắc `daDong` giữ nguyên, nhãn đổi thành "Đã đóng" nếu đang ghi khác.

- [ ] **Step 6: Toast + nhóm sự kiện**

`suKienNhom.ts:96` → `san_xuat_lenh_dong: ["san_xuat", "ban_hang", "giao_hang"],`. Nếu màn Kế hoạch SX và Xếp lịch refresh theo nhóm tick khác (grep `tickCua(` ở chỗ mount `KeHoachSXPage` / `XepLichPage` trong `AppShell.tsx`), thêm các nhóm đó vào mảng.

`AppShell.tsx:1058-1070`: thay khối `san_xuat_nhom_dong` bằng:

```tsx
      e.type === "san_xuat_lenh_dong"
    ) {
      // KCS vừa đóng / mở lại lệnh (cả nhóm) → báo Sale + Kế hoạch SX NGAY.
      const ma = (e.lenh_ma ?? []).join(", ") || "Lệnh";
      const so = e.da_dat != null
        ? ` — đạt ${num(e.da_dat)}${e.muc_tieu != null ? `/${num(e.muc_tieu)}` : ""}${e.don_vi ? ` ${e.don_vi}` : ""}`
        : "";
      pushToast(
        e.kieu === "mo_lai" ? `↩️ ${ma} đã được mở lại` : `✅ ${ma} đã đóng${so}`,
        e.kieu === "mo_lai" ? "warn" : "ok",
      );
```

Giữ đúng điều kiện gác vai (đọc `san_xuat` hoặc `don_hang_ban`) và chữ ký `pushToast` đang có. `num` import từ `../pages/keHoachSxShared` nếu AppShell chưa có hàm định dạng số.

- [ ] **Step 7: Nhãn "Đã đóng" ở Kế hoạch SX + Xếp lịch**

- `keHoachSxShared.tsx:116`: thêm `da_dong: { label: "Đã đóng", cls: "khsx-pill--dadong" },`. Thêm CSS cạnh `.khsx-pill--phathanh` (grep để tìm file CSS): `.khsx-pill--dadong { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }`, khớp cú pháp các pill xung quanh.
- `XlGantt.tsx:47` và `XlChiTiet.tsx:27`: thêm `da_dong: "Đã đóng",`.
- `xep-lich.css:2041`: thêm `.xl-tt--da_dong { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }` và `.xl-thanh--dong { filter: grayscale(1); opacity: .6; }`.
- `XlGantt.tsx:411`: thêm `${d.trang_thai === "da_dong" ? " xl-thanh--dong" : ""}` vào className thanh.
- `XlChiTiet.tsx:205`, `XepLichPage.tsx:331`: đọc ngữ cảnh. Chỗ nào nghĩa là "đã xuống xưởng" (khoá sửa, đếm KPI "Đã phát hành") thì đổi điều kiện thành `=== "da_phat_hanh" || === "da_dong"`. Ẩn nút "Thu hồi" cho `da_dong`.
- `LsxDetailView.tsx:466` (`daQuaKeHoach`) và `BaiGhep2Page.tsx:598`: cùng cách, coi `da_dong` như `da_phat_hanh`.

- [ ] **Step 8: Chạy**

Run: `cd frontend && npx vitest run src/pages/kcs/KcsDongLenh.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc 0 lỗi. Nếu tsc báo `Record<LsxTrangThai, …>` thiếu key `da_dong` ở file khác thì thêm nhãn "Đã đóng" vào đó.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/kcs/KcsDongLenh.tsx frontend/src/pages/kcs/KcsDongLenh.test.tsx frontend/src/pages/kcs/KcsChuoiCongDoan.tsx frontend/src/pages/kcs/kcsNhan.ts frontend/src/components/AppShell.tsx frontend/src/lib/suKienNhom.ts frontend/src/pages/keHoachSxShared.tsx frontend/src/pages/XlGantt.tsx frontend/src/pages/XlChiTiet.tsx frontend/src/pages/xep-lich.css frontend/src/pages/XepLichPage.tsx
git commit -m "FE đóng lệnh: khối Đóng lệnh/Mở lại ở màn KCS với cảnh báo, nhãn Đã đóng ở Kế hoạch SX + Xếp lịch, toast" -- <cùng danh sách + KcsChotNhom.tsx KcsChotNhom.test.tsx + file CSS pill + LsxDetailView.tsx/BaiGhep2Page.tsx nếu có sửa>
```

Lưu ý `AppShell.tsx` có thể đang bị phiên khác sửa. Chạy `git diff --cached -- frontend/src/components/AppShell.tsx` trước; nếu có phần staged không phải của mình thì dừng lại hỏi.

---

### Task 7: Tài liệu §16 + xác minh UI trọn luồng

**Files:**
- Modify: `docs/spec-thuc-hien-san-xuat.md` §16 (dòng 814-841), dòng 17 (nếu nhắc tự đóng), §18 bảng trạng thái nhóm

- [ ] **Step 1: Viết lại §16**

```markdown
## 16. Đóng lệnh (KCS bấm tay)

Đổi 29/09/2026 (spec `docs/superpowers/specs/2026-09-29-dong-lenh-thu-cong-design.md`): bỏ cổng tự
đóng ĐỦ và đóng THIẾU. KCS kiểm xong, gửi yêu cầu nhập kho, rồi bấm **Đóng lệnh** ở màn KCS theo
lệnh. Mọi thành viên phòng ban KCS bấm được.

- Đơn vị đóng = nhóm thành phẩm: mọi lệnh của nhóm `da_phat_hanh` → `da_dong`, nhóm → `closed`.
- Không điều kiện chặn. Hộp xác nhận chỉ CẢNH BÁO: còn số tốt chưa kiểm · còn số đạt chưa gửi nhập
  kho · đạt thiếu so với mục tiêu (Σ `so_luong_ra` công đoạn cuối) · còn việc chưa xong.
- Đóng rồi: bàn tổ ẩn việc chưa làm/tạm dừng (việc đang chạy còn tới khi kết thúc); chặn bắt đầu,
  phân công, ghi mẻ mới, KCS kiểm/điều chỉnh, nhập kho, bàn giao, đề nghị vật tư; không phát hành
  lại / thu hồi; MRP bỏ lệnh.
- **Mở lại** trả mọi thứ về như trước.
- Audit `san_xuat_dong_lenh` / `san_xuat_mo_lai_lenh` chụp: danh sách lệnh, đạt, mục tiêu, chưa kiểm,
  chưa gửi kho, số việc dở.

Trạng thái nhập kho thành phẩm tách biệt với trạng thái đóng.
```

Ở §18 và mọi chỗ trong file nhắc `closed_full` / `closed_short` / `waiting_conditions` / "tự động đóng", sửa theo (grep trong file).

- [ ] **Step 2: Restart backend** theo cách trong memory "Bật dev server qua WMI" (uvicorn `--host localhost`, FE `localhost:5173`). DB dev đang có dữ liệu nên mg 0346 tự chạy lúc khởi động; kiểm log thấy `0346_dong_lenh_thu_cong`.

- [ ] **Step 3: Xác minh UI bằng chuột/bàn phím thật**, KHÔNG dùng API để dựng dữ liệu. Đăng nhập tài khoản thuộc phòng KCS; nếu admin không thuộc KCS thì dùng user KCS demo. Luồng:
  1. KCS theo lệnh → chọn một lệnh đang chạy có công đoạn cuối đã ghi tốt → kiểm một lượt → bấm "Tạo yêu cầu nhập kho".
  2. Khối "Đóng lệnh" → bấm **Đóng lệnh** → chụp hộp xác nhận, đọc các cảnh báo → **Xác nhận đóng** → thấy "Đã đóng bởi … lúc …".
  3. Kế hoạch SX → bảng lệnh → cột Trạng thái của lệnh đó hiện "Đã đóng".
  4. Xếp lịch → hàng lệnh đó hiện badge "Đã đóng", thanh xám.
  5. Bàn tổ của một tổ có việc chưa làm của lệnh → việc đã rút; badge navbar giảm.
  6. Quay lại KCS → **Mở lại** → xác nhận → Kế hoạch SX về "Đã phát hành", bàn tổ hiện lại việc.
  7. Từ đầu tới cuối, toast "✅ LSX… đã đóng — đạt …" phải tới tab khác (Sale/Kế hoạch) mà không cần refresh.

  Báo cáo liệt kê cụ thể đã bấm gì, thấy gì ở từng bước, kèm ảnh chụp bước 2, 3, 4.

- [ ] **Step 4: Commit docs**

```bash
git add docs/spec-thuc-hien-san-xuat.md
git commit -m "spec §16: đóng lệnh thủ công do KCS bấm, bỏ tự đóng đủ/thiếu" -- docs/spec-thuc-hien-san-xuat.md docs/superpowers/specs/2026-09-29-dong-lenh-thu-cong-design.md docs/superpowers/plans/2026-09-29-dong-lenh-thu-cong.md
```

---

## Self-review (đã chạy)

- Độ phủ spec:
  - §2 mô hình → Task 1 + 2.
  - §3.1/3.2 → Task 2 (service), Task 3 (API/SSE), Task 6 (UI).
  - §3.3 ai bấm → `gate_kcs` ở Task 2.
  - §4 bảng hiệu lực → Kế hoạch SX / Xếp lịch (Task 6); Lệnh SX / Theo dõi, tiến độ, phát hành/thu hồi, sửa/xoá (Task 5); bàn tổ + chặn thao tác (Task 4); KCS list (Task 1); gia công ngoài (Task 3). MRP: `TRANG_THAI_TINH` vốn chỉ gồm `san_sang/da_lap/da_phat_hanh`, nên `da_dong` tự rơi ra, không phải sửa.
  - §5 gỡ bỏ → Task 2 + 3 + 6.
  - §6 dữ liệu → Task 1.
  - §7 kiểm thử → mỗi task + Task 7.
- Tên thống nhất:
  - `tinh_trang_dong` / `dong` / `mo_lai` / `chan_neu_da_dong` / `nhom_da_dong` / `viec_con_hien` / `trang_thai_nhom_cua_bai_ghep` / `lan_dong_cuoi`
  - `DongLenhTinhTrangOut` / `DongLenhIn` / `DongLenhKetQuaOut`
  - SSE `san_xuat_lenh_dong`
  - FE `tinhTrangDongLenh` / `dongLenh` / `moLaiLenh`
