# Ba loại mua, cột "Mua cho", lập một đơn từ nhiều yêu cầu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yêu cầu mua có loại (Theo yêu cầu / Cho lệnh SX / Mua tồn); mọi màn hiện món, yêu cầu, đơn mua có cột "Mua cho" nói đúng lệnh nào hay tồn kho; thu mua tick món của nhiều yêu cầu để lập một đơn.

**Architecture:** Cột `loai_mua` trên `department_purchase_requests`, máy chủ chốt loại. "Mua cho" suy từ `yeu_cau_mua_nguon_lenh` khớp dòng yêu cầu theo (hang_loai, hang_id, khổ) — một module `services/mua_cho.py` nạp theo lô (3 câu SQL cố định) rồi các hàm out đọc từ đó. Đơn mua gắn đúng các yêu cầu có món trong đơn; trạng thái yêu cầu suy lại sau khi lập (bỏ giữ chỗ cứng ở repo).

**Tech Stack:** FastAPI + SQLAlchemy 2 (Postgres/SQLite test), React + TS.

**Spec:** `docs/spec-mua-hang-ba-loai-yeu-cau.md`; mockup chốt `docs/mockups/mua-hang-ba-loai-va-lap-don-gop.html`; mockup tick chéo `docs/mockups/mua-hang-lap-don-tu-nhieu-yeu-cau.html` (phương án 1).

## Global Constraints

- Không Alembic: cột mới đi qua `backend/app/db_migrations.py` (mg **0380**), ghi `docs/DB_SCHEMA.md` cùng lúc (guard test).
- Backfill bằng SQL thô đích danh cột, không ORM full-select.
- UI tiếng Việt, không chữ đậm, không nối mẩu dữ liệu bằng `·` hay dấu phẩy, mỗi thông tin nói một lần.
- Lọc ở máy chủ. Danh sách không N+1 (`tests/test_mua_hang_khong_n_cong_1.py` phải xanh).
- Verify: pytest nhắm file + `npx tsc --noEmit` trong `frontend/`. KHÔNG chạy `./init.ps1`, không pytest cả bộ.
- Sửa route/schema backend ⇒ restart uvicorn tay trước khi bấm thử.
- Luồng có UI ⇒ bấm thử thật trên trình duyệt, báo cáo từng bước.
- Không commit trong đợt này (working tree đang có việc dở của phiên khác) — chờ user bảo.

## Hằng và hợp đồng dữ liệu (dùng xuyên suốt)

```python
# backend/app/models/purchase.py
LOAI_MUA_THEO_YEU_CAU = "theo_yeu_cau"
LOAI_MUA_CHO_LSX = "cho_lsx"
LOAI_MUA_TON = "mua_ton"
LOAI_MUA = (LOAI_MUA_THEO_YEU_CAU, LOAI_MUA_CHO_LSX, LOAI_MUA_TON)
```

Một phần tử "mua cho lệnh" (JSON): `{"loai": "lsx" | "bai", "id": int, "ma": str, "so_luong": float | null}`.

```ts
// frontend/src/api/client.ts
export type LoaiMua = "theo_yeu_cau" | "cho_lsx" | "mua_ton";
export interface MuaChoLenh { loai: "lsx" | "bai"; id: number; ma: string; so_luong: number | null }
```

Field mới trên API:

| Schema | Field |
|---|---|
| `DepartmentPurchaseRequestIn` | `loai_mua: str \| None` |
| `DepartmentPurchaseRequestOut` | `loai_mua: str`, `mua_cho: list[MuaChoLenhOut]` (gộp các món) |
| `DepartmentPurchaseRequestLineOut` | `mua_cho: list[MuaChoLenhOut]` |
| `YeuCauMonOut` | `loai_mua: str`, `mua_cho: list[MuaChoLenhOut]` |
| `PurchaseRequestSourceOut` | `loai_mua: str \| None` |
| `PurchaseRequestLineOut` | `loai_mua: str \| None`, `yeu_cau_ma: str \| None`, `mua_cho: list[MuaChoLenhOut]` |
| `PurchaseRequestOut` | `loai_mua_cac: list[str]`, `mua_cho: list[MuaChoLenhOut]` |
| `StockRequestLineOut` | `mua_cho: list[MuaChoLenhOut]`, `loai_mua_cac: list[str]` (chỉ yêu cầu nhập từ đơn mua) |
| `DuBaoVeRow` | `mua_cho: list[MuaChoLenhOut]`, `loai_mua_cac: list[str]` |

Query lọc mới: `loai_mua` (lặp khoá, nhiều giá trị) ở `GET /api/department-purchase-requests`, `/mon`, `GET /api/purchase-requests`.

---

### Task 1: Cột `loai_mua` + máy chủ chốt loại khi tạo/sửa yêu cầu

**Files:**
- Modify: `backend/app/models/purchase.py` (hằng ~dòng 97-110; cột trong `DepartmentPurchaseRequest` ~548)
- Modify: `backend/app/db_migrations.py` (cuối file, mg 0380)
- Modify: `backend/app/schemas/purchase.py:306-319` (In), `:473-504` (Out)
- Modify: `backend/app/services/purchase_service.py` `create_department_request` (1780), `update_department_request` (1913), `_to_department_request_out` (4077)
- Modify: `backend/app/repositories/purchase_repo.py` `DepartmentPurchaseRequestRepository.create` (991), `update` (1134)
- Modify: `docs/DB_SCHEMA.md` (bảng `department_purchase_requests` ~2193 và dòng "Tất cả cột" ~4021)
- Test: `backend/tests/test_loai_mua.py` (mới)

**Interfaces:** Produces `LOAI_MUA_*` hằng; `DepartmentPurchaseRequestOut.loai_mua`.

- [ ] Viết test hỏng:

```python
# backend/tests/test_loai_mua.py
from datetime import date, timedelta
from tests.test_ycmh_trang_thai_api import _headers

def _ngay():
    return (date.today() + timedelta(days=10)).isoformat()

def _body(**them):
    b = {"content": "Mua thử", "needed_date": _ngay(),
         "lines": [{"item_name": "Keo nhiệt", "unit": "kg", "quantity": 3}]}
    b.update(them)
    return b

def test_mac_dinh_theo_yeu_cau(client):
    h = _headers(client)
    r = client.post("/api/department-purchase-requests", json=_body(), headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["loai_mua"] == "theo_yeu_cau"

def test_chon_mua_ton(client):
    h = _headers(client)
    r = client.post("/api/department-purchase-requests", json=_body(loai_mua="mua_ton"), headers=h)
    assert r.json()["loai_mua"] == "mua_ton"

def test_cho_lsx_khong_nguon_lenh_bi_chan(client):
    h = _headers(client)
    r = client.post("/api/department-purchase-requests", json=_body(loai_mua="cho_lsx"), headers=h)
    assert r.status_code == 422
    assert "Kế hoạch vật tư" in r.json()["detail"]

def test_sua_doi_qua_lai_theo_yeu_cau_mua_ton(client):
    h = _headers(client)
    yc = client.post("/api/department-purchase-requests", json=_body(), headers=h).json()
    r = client.put(f"/api/department-purchase-requests/{yc['id']}", json=_body(loai_mua="mua_ton"), headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["loai_mua"] == "mua_ton"
    r = client.put(f"/api/department-purchase-requests/{yc['id']}", json=_body(loai_mua="cho_lsx"), headers=h)
    assert r.status_code == 422
```

Thêm vào `backend/tests/test_mot_o_mot_phieu.py` một test: tạo yêu cầu qua API có `nguon_lenh` (khuôn `test_luu_yeu_cau_cho_o_da_co_phieu_bi_TU_CHOI` nhưng KHÔNG gọi `_yc` trước) gửi kèm `"loai_mua": "mua_ton"` ⇒ 201 và `loai_mua == "cho_lsx"`.

- [ ] Chạy `cd backend && python -m pytest tests/test_loai_mua.py -q` ⇒ FAIL (KeyError `loai_mua`).
- [ ] Model: thêm hằng; cột
  `loai_mua: Mapped[str] = mapped_column(String(16), nullable=False, default=LOAI_MUA_THEO_YEU_CAU, server_default=LOAI_MUA_THEO_YEU_CAU, index=True)`.
- [ ] Migration 0380 (khuôn 0376):

```python
def _migrate_loai_mua(db: Session) -> None:
    """0380 — Loại mua của yêu cầu mua (08/10/2026): theo_yeu_cau | cho_lsx | mua_ton.
    Backfill: có liên kết lệnh ⇒ cho_lsx; nội dung "Bổ sung tồn…" ⇒ mua_ton. Chạy lại vô hại."""
    insp = inspect(db.get_bind())
    if "department_purchase_requests" not in insp.get_table_names():
        return
    if "loai_mua" not in _existing_columns(insp, "department_purchase_requests"):
        db.execute(text("ALTER TABLE department_purchase_requests "
                        "ADD COLUMN loai_mua VARCHAR(16) NOT NULL DEFAULT 'theo_yeu_cau'"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_department_purchase_requests_loai_mua "
                        "ON department_purchase_requests (loai_mua)"))
    if "yeu_cau_mua_nguon_lenh" in insp.get_table_names():
        db.execute(text("UPDATE department_purchase_requests SET loai_mua = 'cho_lsx' "
                        "WHERE id IN (SELECT department_request_id FROM yeu_cau_mua_nguon_lenh)"))
    db.execute(text("UPDATE department_purchase_requests SET loai_mua = 'mua_ton' "
                    "WHERE loai_mua = 'theo_yeu_cau' AND content LIKE 'Bổ sung tồn%'"))
    db.commit()

MIGRATIONS.append(("0380_loai_mua", _migrate_loai_mua))
```

- [ ] Service: hàm chốt loại, gọi trong create/update:

```python
def _chot_loai_mua(self, yeu_cau: str | None, *, co_nguon_lenh: bool, hien_tai: str | None = None) -> str:
    """Máy chủ chốt loại mua — không tin client. Có liên kết lệnh ⇒ Cho lệnh SX; Cho lệnh SX chỉ
    lập từ Kế hoạch vật tư; yêu cầu đã là Cho lệnh SX thì giữ nguyên."""
    if co_nguon_lenh or hien_tai == LOAI_MUA_CHO_LSX:
        return LOAI_MUA_CHO_LSX
    gt = (yeu_cau or "").strip() or (hien_tai or LOAI_MUA_THEO_YEU_CAU)
    if gt == LOAI_MUA_CHO_LSX:
        raise PurchaseValidationError("Mua cho lệnh sản xuất thì lập từ Kế hoạch vật tư.")
    if gt not in LOAI_MUA:
        raise PurchaseValidationError("Loại mua không hợp lệ.")
    return gt
```

  `create_department_request(..., loai_mua: str | None = None, ...)`: sau `nguon_sach` gọi `loai = self._chot_loai_mua(loai_mua, co_nguon_lenh=bool(nguon_sach))`, truyền `loai_mua=loai` vào repo `create`. `update_department_request(..., loai_mua=None, ...)`: `loai = self._chot_loai_mua(loai_mua, co_nguon_lenh=False, hien_tai=row.loai_mua)`, truyền vào repo `update`. `_to_department_request_out` thêm `"loai_mua": row.loai_mua`.
- [ ] Repo `create(..., loai_mua=LOAI_MUA_THEO_YEU_CAU)` gán vào `DepartmentPurchaseRequest(...)`; `update(row, ..., loai_mua=None)` gán khi khác None.
- [ ] Schema In thêm `loai_mua: str | None = Field(default=None, max_length=16)`; Out thêm `loai_mua: str = "theo_yeu_cau"`.
- [ ] DB_SCHEMA.md: dòng cột `loai_mua` sau `source_type`, thêm vào "Tất cả cột".
- [ ] Chạy `python -m pytest tests/test_loai_mua.py tests/test_mot_o_mot_phieu.py tests/test_db_schema_doc.py -q` (tên file guard thật: grep `DB_SCHEMA.md` trong tests) ⇒ PASS.

### Task 2: Module "mua cho" + xuất ra mọi API + lọc

**Files:**
- Create: `backend/app/services/mua_cho.py`
- Modify: `backend/app/schemas/purchase.py` (MuaChoLenhOut + các Out ở bảng trên)
- Modify: `backend/app/services/purchase_service.py`: `_nap_lo_yeu_cau`, `_to_department_request_out`, `danh_sach_mon`, `_nap_lo_phieu_mua`, `_to_request_out`
- Modify: `backend/app/repositories/purchase_repo.py`: `_dieu_kien_loc` của yêu cầu (771) và của đơn (1271)
- Modify: `backend/app/routers/purchases.py`: 3 route list
- Test: `backend/tests/test_mua_cho.py` (mới); `tests/test_mua_hang_khong_n_cong_1.py` giữ xanh

**Interfaces:**
- Produces `nap_mua_cho(db, dong_yc_ids: Iterable[int]) -> dict[int, dict]` — mỗi dòng yêu cầu ⇒ `{"loai_mua": str, "yeu_cau_id": int, "yeu_cau_ma": str, "lenh": list[dict]}`.
- Produces `gop_mua_cho(muc: Iterable[dict]) -> tuple[list[str], list[dict]]` — (các loại theo thứ tự cho_lsx, mua_ton, theo_yeu_cau; lệnh gộp theo (loai, id), cộng `so_luong`, None nếu có phần None).

- [ ] Test hỏng `backend/tests/test_mua_cho.py` (dựng bằng helper của `test_mot_o_mot_phieu.py`: `_giay`, `_lenh`, `_hang`, `_dv_dong`, `KHO`, `MAI`, `customer`, `_admin_token`):

```python
def test_mon_yeu_cau_cho_hai_lenh_hien_du_hai_lenh(client, db, customer):
    g = _giay(db)
    a = _lenh(db, customer, ma="LSX-A", giay_id=g.id, so_to_nguyen=500, han=MAI)
    b = _lenh(db, customer, ma="LSX-B", giay_id=g.id, so_to_nguyen=300, han=MAI)
    h = {"Authorization": f"Bearer {_admin_token()}"}
    body = {"content": "Thiếu giấy", "needed_date": MAI.isoformat(),
            "lines": [{"item_name": g.ten, "unit": _dv_dong(_hang(g), None), "quantity": 800,
                       "hang_loai": "giay", "hang_id": g.id, "kho_rong": KHO[0], "kho_dai": KHO[1]}],
            "nguon_lenh": [
                {"hang_loai": "giay", "hang_id": g.id, "kho_rong": KHO[0], "kho_dai": KHO[1], "lsx_id": a.id, "so_luong": 500},
                {"hang_loai": "giay", "hang_id": g.id, "kho_rong": KHO[0], "kho_dai": KHO[1], "lsx_id": b.id, "so_luong": 300}]}
    yc = client.post("/api/department-purchase-requests", json=body, headers=h).json()
    assert [(m["ma"], m["so_luong"]) for m in yc["mua_cho"]] == [("LSX-A", 500), ("LSX-B", 300)]
    assert yc["lines"][0]["mua_cho"][0]["loai"] == "lsx"
    mon = client.get("/api/department-purchase-requests/mon", headers=h).json()["items"]
    m = next(x for x in mon if x["request_id"] == yc["id"])
    assert m["loai_mua"] == "cho_lsx" and len(m["mua_cho"]) == 2
    # Tìm theo mã lệnh ra đúng món
    tim = client.get("/api/department-purchase-requests/mon", params={"q": "LSX-B"}, headers=h).json()["items"]
    assert [x["line_id"] for x in tim] == [m["line_id"]]
    # Lọc loại
    loc = client.get("/api/department-purchase-requests", params=[("loai_mua", "mua_ton")], headers=h).json()
    assert all(r["id"] != yc["id"] for r in loc["items"])
```

  Thêm test đơn mua: lập đơn (batch) từ món đó ⇒ `lines[0].mua_cho` có 2 lệnh, `lines[0].yeu_cau_ma == yc["code"]`, `loai_mua_cac == ["cho_lsx"]`; `GET /api/purchase-requests?loai_mua=cho_lsx` có đơn, `?loai_mua=mua_ton` không có.
- [ ] Chạy ⇒ FAIL.
- [ ] `services/mua_cho.py`:

```python
"""MUA CHO — món / dòng đơn mua này mua cho lệnh nào, hay cho tồn kho (08/10/2026).

Suy từ `yeu_cau_mua_nguon_lenh` khớp dòng yêu cầu theo (hang_loai, hang_id, khổ). Liên kết cũ
(trước mg 0378) khổ 0 · 0 thì khớp theo mặt hàng. Nạp theo LÔ: 3 câu SQL bất kể bao nhiêu dòng."""
from collections.abc import Iterable
from sqlalchemy import select
from ..models.purchase import (DepartmentPurchaseRequest, DepartmentPurchaseRequestLine,
                               YeuCauMuaNguonLenh, LOAI_MUA_CHO_LSX, LOAI_MUA_TON, LOAI_MUA_THEO_YEU_CAU)
from ..repositories.purchase_repo import DepartmentPurchaseRequestRepository

_THU_TU = (LOAI_MUA_CHO_LSX, LOAI_MUA_TON, LOAI_MUA_THEO_YEU_CAU)

def nap_mua_cho(db, dong_yc_ids: Iterable[int]) -> dict[int, dict]:
    ids = sorted({int(i) for i in dong_yc_ids if i})
    if not ids:
        return {}
    dong = db.execute(
        select(DepartmentPurchaseRequestLine.id, DepartmentPurchaseRequestLine.department_request_id,
               DepartmentPurchaseRequestLine.hang_loai, DepartmentPurchaseRequestLine.hang_id,
               DepartmentPurchaseRequestLine.kho_rong, DepartmentPurchaseRequestLine.kho_dai,
               DepartmentPurchaseRequest.code, DepartmentPurchaseRequest.loai_mua)
        .join(DepartmentPurchaseRequest, DepartmentPurchaseRequest.id == DepartmentPurchaseRequestLine.department_request_id)
        .where(DepartmentPurchaseRequestLine.id.in_(ids))
    ).all()
    yc_ids = {d.department_request_id for d in dong}
    nguon: dict[int, list] = {}
    for n in db.execute(select(YeuCauMuaNguonLenh).where(
            YeuCauMuaNguonLenh.department_request_id.in_(sorted(yc_ids)))).scalars():
        nguon.setdefault(n.department_request_id, []).append(n)
    lsx = {n.lsx_id for ns in nguon.values() for n in ns if n.lsx_id}
    bai = {n.bai_ghep_id for ns in nguon.values() for n in ns if n.bai_ghep_id}
    ten = DepartmentPurchaseRequestRepository(db).ma_chu_the(lsx, bai) if (lsx or bai) else {}
    ra: dict[int, dict] = {}
    for d in dong:
        ds = nguon.get(d.department_request_id, [])
        khop = [n for n in ds if (n.hang_loai, n.hang_id) == (d.hang_loai, d.hang_id)
                and (int(n.kho_rong or 0), int(n.kho_dai or 0)) == (int(d.kho_rong or 0), int(d.kho_dai or 0))]
        if not khop:
            khop = [n for n in ds if (n.hang_loai, n.hang_id) == (d.hang_loai, d.hang_id)
                    and not n.kho_rong and not n.kho_dai]
        lenh = []
        for n in sorted(khop, key=lambda n: n.id):
            k = ("lsx", n.lsx_id) if n.lsx_id else ("bai", n.bai_ghep_id)
            lenh.append({"loai": k[0], "id": k[1], "ma": ten.get(k, "?"),
                         "so_luong": float(n.so_luong) if n.so_luong is not None else None})
        ra[d.id] = {"loai_mua": d.loai_mua, "yeu_cau_id": d.department_request_id,
                    "yeu_cau_ma": d.code, "lenh": lenh}
    return ra

def gop_mua_cho(muc: Iterable[dict]) -> tuple[list[str], list[dict]]:
    loai: set[str] = set()
    gop: dict[tuple, dict] = {}
    for m in muc:
        if not m:
            continue
        loai.add(m["loai_mua"])
        for l in m["lenh"]:
            k = (l["loai"], l["id"])
            if k not in gop:
                gop[k] = dict(l)
            else:
                cu = gop[k]["so_luong"]
                gop[k]["so_luong"] = None if (cu is None or l["so_luong"] is None) else cu + l["so_luong"]
    return [x for x in _THU_TU if x in loai], list(gop.values())
```

- [ ] Schemas: `class MuaChoLenhOut(BaseModel): loai: str; id: int; ma: str; so_luong: float | None = None`; thêm các field theo bảng hợp đồng (mặc định `[]`/None).
- [ ] Service:
  - `_nap_lo_yeu_cau(rows)` thêm `nap["mua_cho"] = nap_mua_cho(db, [ln.id for r in rows for ln in r.lines])`.
  - `_to_department_request_out(row, nap)`: `mc = nap["mua_cho"] if nap else nap_mua_cho(db, [l.id for l in row.lines])`; mỗi dòng `"mua_cho": mc.get(line.id, {}).get("lenh", [])`; đầu yêu cầu `"mua_cho": gop_mua_cho(mc.get(l.id) for l in row.lines if l.cancelled_at is None)[1]`.
  - `danh_sach_mon`: trước vòng lặp `mc = nap_mua_cho(db, [ln.id for r in rows for ln in r.lines])`; mỗi món thêm `"loai_mua": r.loai_mua`, `"mua_cho": mc.get(line.id, {}).get("lenh", [])`; điều kiện tìm: món khớp nếu `tu_khoa` nằm trong mã một lệnh của món.
  - `_nap_lo_phieu_mua(rows)` thêm `"mua_cho": nap_mua_cho(db, [l.department_request_line_id for r in rows for l in r.lines])`; `_to_request_out` mỗi dòng `mc = mcs.get(line.department_request_line_id)` ⇒ `"loai_mua": mc and mc["loai_mua"]`, `"yeu_cau_ma": mc and mc["yeu_cau_ma"]`, `"mua_cho": mc["lenh"] if mc else []`; đầu đơn `loai_mua_cac, mua_cho = gop_mua_cho(...)`; mỗi nguồn `"loai_mua": source.loai_mua`. Xoá khoá `department_request_line_id` bị lặp trong dict dòng.
- [ ] Repo lọc: `_dieu_kien_loc` yêu cầu thêm `loai_mua: list[str] | None` ⇒ `DepartmentPurchaseRequest.loai_mua.in_(loai_mua)`; `q` thêm `DepartmentPurchaseRequest.nguon_lenh.any(or_(YeuCauMuaNguonLenh.lsx_id.in_(select(Lsx.id).where(Lsx.ma.ilike(like))), YeuCauMuaNguonLenh.bai_ghep_id.in_(select(BaiGhep.id).where(BaiGhep.ma.ilike(like)))))`. `_dieu_kien_loc` đơn mua thêm `loai_mua` ⇒ `PurchaseRequest.lines.any(PurchaseRequestLine.department_request_line_id.in_(select(DepartmentPurchaseRequestLine.id).join(DepartmentPurchaseRequest).where(DepartmentPurchaseRequest.loai_mua.in_(loai_mua))))`.
- [ ] Router: 3 route thêm `loai_mua: list[str] | None = Query(None)` (validate ∈ LOAI_MUA), đưa vào `loc`/kwargs.
- [ ] Chạy `python -m pytest tests/test_mua_cho.py tests/test_mua_hang_khong_n_cong_1.py tests/test_yeu_cau_mua_tung_mon.py -q` ⇒ PASS.

### Task 3: Một đơn từ nhiều yêu cầu, chặn món đã có đơn, bỏ khoá cả yêu cầu

**Files:**
- Modify: `backend/app/services/purchase_service.py`: `_resolve_source_requests` (2467), `_chot_noi_dong` (2344), `create_request` (2507), `create_requests_batch` (2554), `update_request` (2640), `danh_sach_mon` (`chon_duoc`), xoá `_ghi_lich_su_giu_cho`
- Modify: `backend/app/repositories/purchase_repo.py` `_replace_sources` (1700)
- Modify: `backend/tests/test_purchases_api.py:1690-1696` (đổi kỳ vọng)
- Test: `backend/tests/test_lap_don_nhieu_yeu_cau.py` (mới)

- [ ] Test hỏng (helper `_headers`, `_supplier` của `tests/test_ycmh_trang_thai_api.py`):
  1. Hai yêu cầu A (2 món) và B (1 món), một NCC: batch gửi món A1 + B1 ⇒ 201, một đơn, `sources` = {A, B}; A vẫn `open` (còn A2), B `pending_approval`; `/mon` món A2 `chon_duoc == True`.
  2. Lập lại đơn khác cho A1 ⇒ 422, câu có mã đơn đang giữ.
  3. Hai NCC: A1 NCC1, B1 NCC2 ⇒ hai đơn, đơn 1 nguồn chỉ A, đơn 2 nguồn chỉ B.
  4. Huỷ đơn (`/cancel`) ⇒ A1 về `chon_duoc`.
  5. Sửa đơn nháp giữ nguyên dòng A1 (PUT) ⇒ 200 (không tự chặn chính mình).
- [ ] Chạy ⇒ FAIL.
- [ ] `_resolve_source_requests(ids, *, allow_in_purchase=True, allowed_reserved_ids=None)`: bỏ chặn `len(ids) != 1`. Giữ chặn DONE/CANCELLED; giữ chặn pending/in_purchase CHỈ cho đường không nối dòng (xem dưới).
- [ ] Hàm mới:

```python
def _nguon_cua_don(self, cleaned_lines, source_requests, *, giu_ids: set[int]) -> list:
    """Yêu cầu nguồn của MỘT đơn = các yêu cầu có món nằm trong đơn. Đơn không nối dòng nào
    (đường cũ, gõ tay) thì gắn cả tập và giữ luật cũ: yêu cầu đang bị giữ thì chặn."""
    dong_cua = {ln.id: src for src in source_requests for ln in src.lines}
    co = {dong_cua[l.department_request_line_id].id for l in cleaned_lines
          if getattr(l, "department_request_line_id", None) in dong_cua}
    if co:
        return [s for s in source_requests if s.id in co]
    bi_giu = [s.code for s in source_requests
              if s.status in (DPR_PENDING_APPROVAL, DPR_IN_PURCHASE) and s.id not in giu_ids]
    if bi_giu:
        raise PurchaseValidationError("Yeu cau mua khong con o trang thai cho mua: " + ", ".join(bi_giu) + ".")
    return list(source_requests)

def _chan_mon_da_co_don(self, cleaned_lines, *, bo_qua_phieu_id: int | None = None) -> None:
    """Một món yêu cầu chỉ nằm trong MỘT đơn còn sống (khác `cancelled`). Đơn bị trả lại vẫn
    giữ món — sửa đơn đó, không lập đơn thứ hai."""
    ids = [l.department_request_line_id for l in cleaned_lines if getattr(l, "department_request_line_id", None)]
    if not ids:
        return
    for pl in self.requests.dong_tu_yeu_cau(ids):
        p = pl.request
        if p.status == PR_CANCELLED or p.id == bo_qua_phieu_id:
            continue
        raise PurchaseValidationError(f'Món "{pl.item_name}" đã nằm trong đơn {p.code}. Mở đơn đó để sửa.')
```

  Thay luồng: `create_request` / `create_requests_batch` gọi `_resolve_source_requests(ids)` (không cờ), mỗi nhóm `_chot_noi_dong` → `_chan_mon_da_co_don` → `source_requests=self._nguon_cua_don(cleaned, nguon, giu_ids=set())`. `update_request` dùng `giu_ids={link.department_request_id for link in row.sources}` và `bo_qua_phieu_id=row.id`.
- [ ] Repo `_replace_sources`: bỏ HAI chỗ gán `status` (repo không quyết nghiệp vụ); chỉ thay `request.sources`.
- [ ] Service sau khi repo commit: hàm

```python
def _suy_lai_nguon(self, nguon) -> None:
    for src in {s.id: s for s in nguon if s is not None}.values():
        self.requests.db.refresh(src)
        self._tinh_lai_trang_thai_ycmh(src)
    self.requests.db.commit()
```

  gọi ở `create_request` (nguồn của đơn), `create_requests_batch` (gộp nguồn mọi đơn), `update_request` (nguồn cũ ∪ mới — chụp nguồn cũ TRƯỚC khi repo thay). Xoá `_ghi_lich_su_giu_cho` và lời gọi (`_dat_trang_thai` đã ghi lịch sử `may`).
- [ ] `danh_sach_mon`: `"chon_duoc": tt == "cho_lap" and r.status not in (DPR_DONE, DPR_CANCELLED)`.
- [ ] `test_purchases_api.py:1690`: đơn gắn 2 yêu cầu (không nối dòng) ⇒ 201, `sources` có cả hai.
- [ ] Chạy `python -m pytest tests/test_lap_don_nhieu_yeu_cau.py tests/test_purchases_api.py tests/test_ycmh_trang_thai_api.py tests/test_yeu_cau_mua_tung_mon.py tests/test_mot_o_mot_phieu.py -q` ⇒ PASS.

### Task 4: Kế hoạch vật tư thôi gợi ý huỷ yêu cầu không gắn lệnh; Kho thấy "Mua cho"

**Files:**
- Modify: `backend/app/services/mach_mua.py:161-170` (thêm `loai_mua` vào mạch)
- Modify: `backend/app/services/luoi_vat_tu.py:320-326`
- Modify: `backend/app/routers/kho_request.py` `_serialize` (163-291), `backend/app/schemas/stock.py` (`StockRequestLineOut` 99, `DuBaoVeRow`)
- Modify: `backend/app/services/du_bao_ton_service.py:35-61`, `ke_hoach_vat_tu_service.py` `_hang_dang_ve` (506-558) nếu cần mang `department_request_line_id`
- Test: thêm vào `backend/tests/test_mot_o_mot_phieu.py`, `backend/tests/test_mua_cho.py`

- [ ] Test: yêu cầu `mua_ton` không gắn lệnh cho mặt hàng không lệnh nào thiếu ⇒ `nen_huy` của mặt hàng rỗng (đọc qua `/api/ke-hoach-vat-tu/luoi` như các test cũ trong file). Yêu cầu không gắn lệnh loại `theo_yeu_cau` cũng không vào `nen_huy`.
- [ ] `mach_mua.py`: dict mạch thêm `"loai_mua": getattr(yc, "loai_mua", None)`; `luoi_vat_tu.py` nhánh `if not cac_o:` chỉ gợi ý huỷ khi `m.get("loai_mua") == LOAI_MUA_CHO_LSX`.
- [ ] Yêu cầu nhập từ đợt giao: trong `_serialize`, với các yêu cầu có `purchase_delivery_id`, nạp một lượt các dòng đơn của những đơn đó (`PurchaseRequestLine` theo `request_id in don_ids`), `nap_mua_cho` theo `department_request_line_id`, lập map `(don_id, hang_loai, hang_id, kho_rong, kho_dai) -> gop_mua_cho(...)`; mỗi `StockRequestLineOut` của yêu cầu nhập lấy theo khoá mặt hàng của dòng (khổ giấy: khớp khổ; không khớp khổ thì khớp mặt hàng) ⇒ `mua_cho`, `loai_mua_cac`.
- [ ] Dự báo tồn: `_hang_dang_ve` đã trả `line.id` (dòng đơn) ⇒ nạp `department_request_line_id` của các dòng đó một lượt, `nap_mua_cho`, gộp theo phần tử `ve` (ngày, mã) ⇒ `mua_cho`, `loai_mua_cac`.
- [ ] Test kho: tạo đơn từ yêu cầu cho lệnh, ghi đợt giao + yêu cầu nhập (khuôn helper `_ve_hang` trong `test_ycmh_trang_thai_api.py`), `GET /api/kho/yeu-cau/{id}` ⇒ dòng có `mua_cho[0].ma == "LSX-A"`.
- [ ] Chạy `python -m pytest tests/test_mot_o_mot_phieu.py tests/test_mua_cho.py tests/test_ke_hoach_vat_tu.py -q` ⇒ PASS.

### Task 5: FE nền — kiểu dữ liệu, ô "Mua cho", mở lệnh

**Files:**
- Modify: `frontend/src/api/client.ts` (kiểu ở bảng hợp đồng; tham số `loai_mua?: LoaiMua[]` cho `departmentPurchaseRequests.list/.mon`, `purchaseRequests.list` — gửi khoá lặp)
- Create: `frontend/src/pages/mua-hang/mua-cho/OMuaCho.tsx`, `frontend/src/pages/mua-hang/mua-cho/mua-cho.css`
- Modify: `frontend/src/pages/mua-hang/yeu-cau-mua-hang/shared/constants.ts` (`LOAI_MUA_NHAN`)

**Interfaces:**
```tsx
export function OMuaCho(props: {
  loai: LoaiMua[];            // các loại có mặt (đơn có thể trộn)
  lenh: MuaChoLenh[];
  donVi?: string;              // để popover ghi "8.000 m²"
  onMoLenh?: (l: MuaChoLenh) => void;
}): JSX.Element
export function useMoLenh(navigate?: (page: string, params?: object) => void): ((l: MuaChoLenh) => void) | undefined
```
Hiển thị: có lệnh ⇒ chip tím mã lệnh đầu (nút, `stopPropagation`, gọi `onMoLenh`) + "+N" (hover mở thẻ nổi portal kiểu `ChipMatHang` ở `nha-cung-cap/components/SuppliersTable.tsx:43-117`: tiêu đề "Mua cho N lệnh", mỗi dòng mã lệnh bấm được + số + đơn vị); `mua_ton` ⇒ chip xanh ngọc "Tồn kho"; `theo_yeu_cau` ⇒ chip xám "Theo yêu cầu". `useMoLenh`: lsx ⇒ `navigate("ke-hoach-sx", { openLsxId })`; bài ⇒ `navigate("bai-ghep", { openBaiGhepId })` (kiểm tên trang/param ở `BaiGhep2Page.tsx` trước khi dùng; không có thì chip bài không bấm).
- [ ] Viết, chạy `cd frontend && npx tsc --noEmit` ⇒ sạch.

### Task 6: FE Yêu cầu mua hàng — loại, cột, lọc, ngăn chi tiết, lối seed

**Files:**
- Modify: `yeu-cau-mua-hang/shared/helpers.ts` (`emptyRequest` thêm `loai_mua`, `cleanRequest` gửi `loai_mua`)
- Modify: `yeu-cau-mua-hang/components/RequestFormDrawer.tsx` (ô "Loại mua" trong `.ycf3-dau`: seg Theo yêu cầu | Mua tồn + câu nhắc; khi `nguon_lenh` có hoặc `loai_mua === "cho_lsx"` hiện `OMuaCho` chỉ đọc + "Cho lệnh SX, không đổi được")
- Modify: `yeu-cau-mua-hang/DepartmentPurchaseRequestsPage.tsx` (seed: `loai_mua` từ `seedHeader`; `openEdit` giữ `loai_mua`)
- Modify: `components/AppShell.tsx:176-184` (`purchaseSeedHeader.loai_mua?`), `pages/KhoTonKhoPage.tsx:562` (`loai_mua: "mua_ton"`), `pages/KeHoachVatTuPage.tsx:60-66` (`loai_mua: "cho_lsx"`)
- Modify: `yeu-cau-chung/BangYeuCau.tsx` (cột "Mua cho" sau Nội dung, bỏ tag `related_document_code`), `yeu-cau-chung/BangMonYeuCau.tsx` (cột "Mua cho" sau Số lượng)
- Modify: `yeu-cau-mua-hang/components/RequestDetailDrawer.tsx` (tóm tắt thêm "Mua cho"; bảng món thêm cột)
- Modify: `loc-mua-hang/dieu-kien-yeu-cau.ts` (nhóm `kieu: "nhieu"` khoá `mc`, nhãn "Mua cho", giá trị Cho lệnh SX / Tồn kho / Theo yêu cầu; URL `yc_mc`; `thamSoLocYeuCau` ⇒ `loai_mua`)
- [ ] Code, `npx tsc --noEmit` sạch.

### Task 7: FE Mua hàng — tick chéo, thanh nổi, form lập đơn nhiều yêu cầu, cột ở đơn

**Files:**
- Modify: `phieu-mua-hang/tabs/YeuCauInboxTab.tsx`: lựa chọn chung `Map<number, YeuCauMonRow | {line_id, request_id, request_code}>` sống ở đây (qua đổi chế độ xem, sang trang, lọc); nút "Chỉ xem món đã chọn" (bảng Từng món hiện đúng các món trong Map, không phân trang); thanh nổi "Đã chọn N món" + tag "từ M yêu cầu" + Chỉ xem món đã chọn + Bỏ chọn + Lập đơn mua.
- Modify: `yeu-cau-chung/BangMonYeuCau.tsx`: bỏ state chọn và khoá chéo; nhận `chon: Set<number>`, `onDoi(r)`, `onChonTrang(rows, bat)`; ô đầu cột chọn cả trang. Bỏ thanh nổi cục bộ.
- Modify: `yeu-cau-chung/BangYeuCau.tsx`: prop `chonMon?: { trangThai(row): "het" | "mot_phan" | "khong" | null; doi(row): void }` ⇒ cột ô tick (ba trạng thái; `null` = yêu cầu không còn món chờ lập đơn ⇒ không có ô). Món chờ lập đơn của yêu cầu = dòng chưa huỷ và `!coDonSong(line)` (`yeu-cau-mua-hang/shared/helpers.ts:53`).
- Modify: `phieu-mua-hang/PurchaseRequestsPage.tsx`: `lapDonTuMon(theoYeuCau: Map<number, number[]>)` nạp song song các yêu cầu rồi `openCreatePurchaseRequest(sources[], chiDong)`; `openCreatePurchaseRequest` nhận mảng (bấm dòng ở bảng Yêu cầu vẫn truyền một): `nguonLapDon` = mọi nguồn; dòng form mang `yeu_cau_ma`, `loai_mua`, `mua_cho` (từ `line.mua_cho` của yêu cầu); chỉ đưa dòng chưa huỷ và chưa có đơn sống; `content` = một nguồn ⇒ nội dung yêu cầu, nhiều ⇒ "Mua cho N yêu cầu: " + đuôi mã; `needed_date` = sớm nhất. `save`: bỏ chặn `length !== 1`; `source_request_ids` = yêu cầu của các dòng đã chọn (dòng không nối giữ tập ban đầu).
- Modify: `phieu-mua-hang/shared/types.ts` (`FormLine` thêm `yeu_cau_ma?`, `loai_mua?`, `mua_cho?`)
- Modify: `phieu-mua-hang/components/PurchaseFormDrawer.tsx`: cột "Mua cho" (OMuaCho) và mã yêu cầu ngắn dưới tên vật tư khi có >1 nguồn.
- Modify: `don-mua-chung/BangDonMua.tsx`: cột "Mua cho" sau Nhà cung cấp (`row.loai_mua_cac`, `row.mua_cho`).
- Modify: `don-mua-chung/NganDonMua.tsx` `TabMatHang`: cột "Mua cho" từng dòng; đầu ngăn thêm mục "Mua cho".
- Modify: `loc-mua-hang/dieu-kien-don-mua.ts`: nhóm "Mua cho" như Task 6, gửi `loai_mua`.
- [ ] Code, `npx tsc --noEmit` sạch.

### Task 8: FE Kế toán, Nhà cung cấp, Kho

**Files:**
- Kế toán › Đơn mua hàng: dùng chung `BangDonMua`/`NganDonMua` (Task 7) — chỉ kiểm `ke-toan/don-mua-hang/AccountingPurchaseInboxPage.tsx:347` truyền `onMoLenh` (navigate) nếu có.
- Modify: `mua-hang/nha-cung-cap/tabs/SupplierHistoryTab.tsx` (cột "Mua cho")
- Modify: `pages/KhoYeuCauPage.tsx:1168-1169, 1261-1294` (yêu cầu nhập từ đơn mua: cột "Cho lệnh" thành "Mua cho" dùng `OMuaCho` từ `l.mua_cho`/`l.loai_mua_cac`)
- Modify: `pages/ton-kho/TongQuanTon.tsx:420-434` (dòng "Sắp về" thêm `OMuaCho`)
- [ ] Code, `npx tsc --noEmit` sạch.

### Task 9: Bấm thử trọn luồng trên trình duyệt

Restart uvicorn (mg 0380 chạy khi khởi động) và mở FE. Đăng nhập admin.
- [ ] Yêu cầu mua hàng › Tạo: chọn Mua tồn, lưu ⇒ bảng hiện "Tồn kho" ở cột Mua cho.
- [ ] Kế hoạch vật tư › tick dòng Cần mua › Đề nghị mua ⇒ form hiện mã lệnh chỉ đọc ⇒ lưu ⇒ bảng hiện mã lệnh; trỏ "+N" thấy từng lệnh.
- [ ] Kho giấy › Tạo yêu cầu mua ⇒ form đứng ở Mua tồn.
- [ ] Mua hàng › Từng món: tick món của 3 yêu cầu khác loại, sang trang, đổi sang xem theo Yêu cầu (ô ba trạng thái), quay lại ⇒ lựa chọn còn; Chỉ xem món đã chọn; Lập đơn mua ⇒ form có cột Mua cho, chia theo NCC ⇒ lưu ⇒ danh sách Đơn mua có cột Mua cho; mở ngăn đơn tab Mặt hàng thấy cột.
- [ ] Món còn lại của yêu cầu lập một phần vẫn tick được.
- [ ] Lọc "Mua cho: Tồn kho" ở cả hai bảng.
- [ ] Kế toán › Đơn mua hàng thấy cột. Nhà cung cấp › tab Đơn mua thấy cột.
- [ ] Kho › Yêu cầu nhập xuất: yêu cầu nhập từ đơn đó thấy Mua cho theo dòng. Kho giấy › ngăn mặt hàng › Sắp về thấy Mua cho.
- [ ] Ghi báo cáo từng bước đã bấm, gõ, thấy gì.
