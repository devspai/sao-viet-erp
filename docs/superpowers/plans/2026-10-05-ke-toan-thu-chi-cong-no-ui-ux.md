# Kế toán thu chi + công nợ — UI/UX từng màn (bản 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng lại 5 màn Kế toán (Phiếu chi, Phiếu thu, Công nợ phải trả, Công nợ phải thu, Tài khoản ngân hàng) đúng đặc tả bản 3: chọn kỳ + so cùng kỳ, bộ lọc nâng cao, ngăn phải chia tab cùng một độ rộng kéo được, thẻ lọc, form chia nhóm, không nối thông tin bằng dấu.

**Architecture:** Backend chỉ thêm tham số ĐỌC (không đổi DB): lọc theo kỳ + bộ lọc ở `accounting_repo`/`accounting_service`, công nợ theo kỳ dùng lại `bao_cao_cong_no`. Frontend thêm bộ khung dùng chung trong `pages/ke-toan/shared/` (ngăn phải `NganPhai`, `ChonKy`, `BoLocNangCao`, `TheLoc`, `Cum/TheNho`) + CSS riêng `pages/ke-toan/ke-toan.css` tiền tố `kt-`; từng màn chuyển sang khung mới, giữ nguyên luồng ghi (API ghi không đổi).

**Tech Stack:** FastAPI + SQLAlchemy 2 (pytest, SQLite in-memory), React 18 + TS + Vite (vitest + Testing Library), icon `components/Icons.tsx` (`<Icon name=…/>`) hoặc `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-10-05-ke-toan-thu-chi-cong-no-ui-ux-tung-man.md` (bản 3) + bản xem `docs/mockups/ke-toan-ui-ux-tung-man.html` (mở `?v=N#pc1`; thanh trên cùng chuyển màn). Bản xem LÀ hợp đồng thị giác: kích thước, khoảng cách, thứ tự ô lấy từ CSS trong file đó, đổi tiền tố sang `kt-`.

## Global Constraints

- Không thêm bảng, không thêm cột DB, không migration. Chỉ API ĐỌC mới.
- CSS mới chỉ ở `frontend/src/pages/ke-toan/ke-toan.css`, tiền tố `kt-`. KHÔNG sửa các lớp `acct-*`, `pay-*`, `purchase__*`, `rc-drawer*`, `md-page*` (dùng chung >20 màn). KHÔNG khai selector `.rc-*` mới (guard `pages/cssKhongCuop.test.ts`).
- Không đụng `frontend/src/pages/tai-san/*` (phiên khác giữ). Không đụng `ToolbarChuan.tsx` (Mua hàng dùng chung).
- Trong working tree đang có sửa dở CHƯA commit của phiên khác (gắn `PhanTrangDayDu` vào bảng, `Icons.tsx`, `PhanTrangDayDu.tsx`…). Làm TRÊN nền đó, không revert, không `git stash`, không `git checkout --`.
- Token màu/chữ theo `docs/UI_DESIGN.md`: accent rust chỉ cho hành động; chọn = charcoal viền ĐỦ 4 cạnh; không hồng; không viền một cạnh; chữ ≥11px, không cỡ nửa pixel; không emoji; icon Lucide.
- KHÔNG nối mẩu thông tin bằng `·`, `•`, dấu chấm hay DẤU PHẨY. Mẩu loại/nhóm/trạng thái = thẻ nhỏ `kt-the`; mẩu khác chữ thường; cách bằng `gap` 8px. Hai mẩu cùng loại dùng chữ "và". Câu văn giải thích thì viết câu bình thường.
- MỌI ngăn mở từ bên phải (chi tiết, form lập phiếu, ngăn công nợ, ngăn tài khoản, form tài khoản, ngăn chồng) mặc định **920px**, một biến CSS chung `--kt-ngan-w` đặt trên `document.documentElement`, nhớ localStorage khoá DUY NHẤT `kt-ngan-rong`; kéo 480px → (innerWidth − 232px); bấm đúp/nút mở rộng bật tắt rộng hết; điện thoại (<640px) rộng 100%, không thanh kéo.
- Tiền mọi chỗ định dạng `vi-VN` dấu chấm nghìn + " đ". Ngày `dd/mm/yyyy`; ngày "hôm nay" theo giờ VN (`homNayVN()`), không `toISOString()`.
- UI toàn tiếng Việt. "Đóng" cho nút thoát form, "Hủy phiếu" cho huỷ chứng từ.
- Lọc + phân trang + tổng ở MÁY CHỦ, không cắt/lọc mảng trong JS.
- Real-time: ngăn và danh sách tự nạp lại theo `eventTick` (SSE qua `AppShell` `tickCua(...)`), không bắt bấm làm mới.
- Xác minh: KHÔNG chạy `./init.ps1`. Backend: `cd backend && python -m pytest tests/<file> -q`. Frontend: `cd frontend && npx tsc --noEmit` và `npx vitest run <đường dẫn test>`. Không chạy python trần trỏ DB dev.
- KHÔNG commit (chủ chưa yêu cầu). Mỗi Task kết thúc bằng `git diff --stat` để rà đúng file.
- UI phải kiểm bằng thao tác thật (chuột/bàn phím) trên trình duyệt dev ở Task 10; báo cáo liệt kê bấm gì / gõ gì / thấy gì.

## File Structure

Backend
- `backend/app/repositories/accounting_repo.py` — thêm bộ lọc kỳ + nâng cao cho `list_vouchers`/`list_receipts`, đếm thẻ lọc; thống kê theo tài khoản.
- `backend/app/services/accounting_service.py` — truyền tham số; `payables_summary`/`receivables_summary` nhận kỳ + bộ lọc, ráp số kỳ từ `bao_cao_cong_no`.
- `backend/app/routers/accounting.py` — khai tham số query.
- `backend/app/schemas/accounting.py` — thêm trường đếm/tổng và trường kỳ.
- Test mới: `backend/tests/test_ke_toan_loc_ky_phieu.py`, `backend/tests/test_ke_toan_cong_no_theo_ky.py`, `backend/tests/test_ke_toan_tk_thong_ke.py`.

Frontend (mới)
- `frontend/src/utils/ky.ts` — hàm thuần về kỳ (tách từ `pages/khachHangSo.ts`, file cũ re-export).
- `frontend/src/pages/ke-toan/ke-toan.css` — toàn bộ CSS `kt-`.
- `frontend/src/pages/ke-toan/shared/NganPhai.tsx` — khung ngăn phải: kéo rộng, đầu cố định, tab, Esc theo tầng.
- `frontend/src/pages/ke-toan/shared/doRongNgan.ts` — đọc/ghi độ rộng chung.
- `frontend/src/pages/ke-toan/shared/ChonKy.tsx` — thanh chọn kỳ + hook `useKyMan`.
- `frontend/src/pages/ke-toan/shared/BoLocNangCao.tsx` — nút Bộ lọc + bảng thả xuống + chip.
- `frontend/src/pages/ke-toan/shared/TheLoc.tsx` — hàng thẻ lọc có dòng cùng kỳ.
- `frontend/src/pages/ke-toan/shared/Cum.tsx` — `Cum` + `TheNho`.
- `frontend/src/pages/ke-toan/shared/dinhDang.ts` — `tien()`, `ngay()`, `phanTramDoi()`.
- Test: `frontend/src/utils/ky.test.ts`, `frontend/src/pages/ke-toan/shared/NganPhai.test.tsx`, `ChonKy.test.tsx`, `BoLocNangCao.test.tsx`.

Frontend (sửa) — theo từng màn, liệt kê trong Task.

---

### Task 1: API đọc — Phiếu chi / Phiếu thu lọc theo kỳ + bộ lọc nâng cao + số thẻ lọc

**Files:**
- Modify: `backend/app/repositories/accounting_repo.py:207-392` (`list_vouchers`, `_voucher_totals`, `list_receipts`)
- Modify: `backend/app/services/accounting_service.py` (`list_vouchers` ~L1015, `list_receipts` ~L1624)
- Modify: `backend/app/routers/accounting.py:787` (`list_payment_vouchers`), `:1069` (`list_payment_receipts`)
- Modify: `backend/app/schemas/accounting.py:270` (`PaymentVoucherListOut`), `:371` (`PaymentReceiptListOut`)
- Modify: `frontend/src/api/client.ts` (`api.accounting.vouchers` ~L14426, `receipts` ~L14535, types `PaymentVoucherListOut` ~L8001, `PaymentReceiptListOut` ~L8103)
- Test: `backend/tests/test_ke_toan_loc_ky_phieu.py`

**Interfaces:**
- Produces (query params, cả hai endpoint): `tu_ngay: date|None`, `den_ngay: date|None` (lọc `voucher_date` / `receipt_date`, sai thứ tự → 422 qua `_khoang_ngay`), `tien_tu: int|None`, `tien_den: int|None` (trên `amount_vnd`), `hinh_thuc: "cash"|"bank_transfer"|None` (cột `voucher_type` / `receipt_method`), `nguon: list[str]` (lặp `?nguon=a&nguon=b`, OR trên `source_type`), `tai_khoan_id: int|None` (`company_bank_account_id`), `nguoi_lap_id: int|None` (`created_by_user_id`), `chung_tu: "co"|"thieu"|None` (EXISTS trên bảng đính kèm), `dem_only: bool=False`.
- Produces (response thêm, cả hai): `the_loc: {tat_ca: int, xong: int, xong_tien: int, thieu_chung_tu: int, da_huy: int, cho: int}` — đếm trên bộ lọc KHÔNG gồm `status` và `chung_tu` (thẻ lọc không sập khi chọn một thẻ); `PaymentReceiptListOut` thêm `total_received_amount: int`.
- `dem_only=true` ⇒ `items=[]`, vẫn trả `total` (dùng cho "Khớp n phiếu").

- [ ] **Step 1: Viết test hỏng**

Tạo `backend/tests/test_ke_toan_loc_ky_phieu.py`. Dựng phiếu bằng chính helper đang có trong `backend/tests/test_accounting_api.py` (đọc file đó, tìm hàm tạo phiếu chi lập rời — endpoint `POST /api/accounting/payment-vouchers/standalone` hoặc tương đương mà `StandaloneVoucherDialog` gọi qua `api.accounting.createVoucher` — và hàm `_headers`). Ngày lấy từ `accounting_service._business_today()`; KHÔNG hard-code ngày.

```python
from datetime import timedelta

from app.services import accounting_service

URL_PC = "/api/accounting/payment-vouchers"
URL_PT = "/api/accounting/payment-receipts"


def _hom_nay():
    return accounting_service._business_today()


def test_phieu_chi_loc_theo_ky_theo_ngay_chung_tu(client):
    h = _headers(client)
    hn = _hom_nay()
    cu = _lap_phieu_chi(client, h, so_tien=1_000_000, ngay=hn - timedelta(days=40))
    moi = _lap_phieu_chi(client, h, so_tien=2_000_000, ngay=hn)
    r = client.get(URL_PC, headers=h, params={"tu_ngay": (hn - timedelta(days=7)).isoformat(),
                                               "den_ngay": hn.isoformat()})
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()["items"]]
    assert moi["id"] in ids and cu["id"] not in ids
    assert r.json()["total_paid_amount"] == 2_000_000


def test_phieu_chi_tu_ngay_sau_den_ngay_bi_chan(client):
    h = _headers(client)
    hn = _hom_nay()
    r = client.get(URL_PC, headers=h, params={"tu_ngay": hn.isoformat(),
                                               "den_ngay": (hn - timedelta(days=1)).isoformat()})
    assert r.status_code == 422


def test_phieu_chi_loc_khoang_tien_hinh_thuc_nhieu_nguon(client):
    h = _headers(client)
    nho = _lap_phieu_chi(client, h, so_tien=300_000)
    lon = _lap_phieu_chi(client, h, so_tien=9_000_000)
    r = client.get(URL_PC, headers=h, params=[("tien_tu", 5_000_000), ("nguon", "internal_expense"),
                                               ("nguon", "other")])
    ids = [x["id"] for x in r.json()["items"]]
    assert lon["id"] in ids and nho["id"] not in ids


def test_the_loc_khong_sap_khi_loc_trang_thai(client):
    h = _headers(client)
    _lap_phieu_chi(client, h, so_tien=1_000_000)
    huy = _lap_phieu_chi(client, h, so_tien=500_000)
    _huy_phieu_chi(client, h, huy["id"])
    tat_ca = client.get(URL_PC, headers=h).json()["the_loc"]
    chi_huy = client.get(URL_PC, headers=h, params={"status": "cancelled"}).json()
    assert chi_huy["the_loc"] == tat_ca          # đếm thẻ bỏ qua status
    assert chi_huy["total"] == tat_ca["da_huy"]
    assert tat_ca["tat_ca"] == tat_ca["xong"] + tat_ca["da_huy"] + tat_ca["cho"]


def test_chung_tu_thieu_va_dem_only(client):
    h = _headers(client)
    p = _lap_phieu_chi(client, h, so_tien=700_000)
    r = client.get(URL_PC, headers=h, params={"chung_tu": "thieu", "dem_only": True})
    assert r.json()["items"] == []
    assert r.json()["total"] >= 1
    r2 = client.get(URL_PC, headers=h, params={"chung_tu": "thieu"})
    assert p["id"] in [x["id"] for x in r2.json()["items"]]
    assert r2.json()["the_loc"]["thieu_chung_tu"] >= 1


def test_phieu_thu_loc_ky_va_tong_da_thu(client):
    h = _headers(client)
    hn = _hom_nay()
    pt = _lap_phieu_thu_khac(client, h, so_tien=1_200_000, ngay=hn)
    r = client.get(URL_PT, headers=h, params={"tu_ngay": hn.isoformat(), "den_ngay": hn.isoformat(),
                                               "hinh_thuc": "cash"})
    assert pt["id"] in [x["id"] for x in r.json()["items"]]
    assert r.json()["total_received_amount"] >= 1_200_000
    assert "the_loc" in r.json()
```

Định nghĩa trong cùng file `_headers`, `_lap_phieu_chi(client, h, *, so_tien, ngay=None, hinh_thuc="cash")`, `_huy_phieu_chi(client, h, id)`, `_lap_phieu_thu_khac(client, h, *, so_tien, ngay=None)` bằng cách gọi đúng endpoint ghi mà `test_accounting_api.py` / `test_accounting_attachments_api.py` đã dùng (chép payload tối thiểu từ đó; `voucher_date`/`receipt_date` = `ngay.isoformat()` nếu có).

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `cd backend && python -m pytest tests/test_ke_toan_loc_ky_phieu.py -q`
Expected: FAIL (`the_loc` KeyError / phiếu cũ vẫn có trong kết quả).

- [ ] **Step 3: Repo — gom điều kiện thành hàm dùng chung**

Trong `accounting_repo.py`, thêm import `exists` từ sqlalchemy và `PaymentVoucherAttachment, PaymentReceiptAttachment` từ `app.models.accounting`. Đổi `list_vouchers`:

```python
    def _dieu_kien_phieu_chi(self, *, q=None, source_type=None, voucher_type=None, supplier_id=None,
                             purchase_request_id=None, tu_ngay=None, den_ngay=None, tien_tu=None,
                             tien_den=None, nguon=None, tai_khoan_id=None, nguoi_lap_id=None) -> list:
        """Điều kiện lọc CHUNG cho bảng, số đếm thẻ lọc và tổng tiền — một nguồn, không ba chỗ tự lọc.
        KHÔNG gồm `status` / `chung_tu`: hai cái đó là thẻ lọc, thẻ phải đếm trên nền chưa chọn thẻ."""
        c = []
        if q:
            like = f"%{q.strip().lower()}%"
            c.append(or_(  # giữ nguyên danh sách cột tìm hiện có (L224-237)
                func.lower(PaymentVoucher.code).like(like),
                func.lower(func.coalesce(PaymentVoucher.doc_no, "")).like(like),
                func.lower(PaymentVoucher.source_code_snapshot).like(like),
                func.lower(PaymentVoucher.supplier_name_snapshot).like(like),
                func.lower(func.coalesce(PaymentVoucher.cash_recipient_name, "")).like(like),
                func.lower(func.coalesce(PaymentVoucher.beneficiary_account_holder_snapshot, "")).like(like),
                func.lower(PaymentVoucher.content).like(like),
                PaymentVoucher.purchase_request.has(func.lower(PurchaseRequest.code).like(like)),
                PaymentVoucher.purchase_request.has(PurchaseRequest.sources.any(
                    func.lower(PurchaseRequestSource.source_code_snapshot).like(like))),
            ))
        if source_type:
            c.append(PaymentVoucher.source_type == source_type)
        if nguon:
            c.append(PaymentVoucher.source_type.in_(list(nguon)))
        if voucher_type:
            c.append(PaymentVoucher.voucher_type == voucher_type)
        if supplier_id is not None:
            c.append(PaymentVoucher.supplier_id == supplier_id)
        if purchase_request_id is not None:
            c.append(PaymentVoucher.purchase_request_id == purchase_request_id)
        if tu_ngay is not None:
            c.append(PaymentVoucher.voucher_date >= tu_ngay)
        if den_ngay is not None:
            c.append(PaymentVoucher.voucher_date <= den_ngay)
        if tien_tu is not None:
            c.append(PaymentVoucher.amount_vnd >= tien_tu)
        if tien_den is not None:
            c.append(PaymentVoucher.amount_vnd <= tien_den)
        if tai_khoan_id is not None:
            c.append(PaymentVoucher.company_bank_account_id == tai_khoan_id)
        if nguoi_lap_id is not None:
            c.append(PaymentVoucher.created_by_user_id == nguoi_lap_id)
        return c

    @staticmethod
    def _co_chung_tu_chi():
        return exists().where(PaymentVoucherAttachment.payment_voucher_id == PaymentVoucher.id)
```

`list_vouchers` nhận thêm `tu_ngay, den_ngay, tien_tu, tien_den, nguon, tai_khoan_id, nguoi_lap_id, chung_tu, dem_only` và `hinh_thuc` (gán vào `voucher_type` nếu có). Thân:

```python
        nen = self._dieu_kien_phieu_chi(q=q, source_type=source_type, voucher_type=hinh_thuc or voucher_type,
                                        supplier_id=supplier_id, purchase_request_id=purchase_request_id,
                                        tu_ngay=tu_ngay, den_ngay=den_ngay, tien_tu=tien_tu, tien_den=tien_den,
                                        nguon=nguon, tai_khoan_id=tai_khoan_id, nguoi_lap_id=nguoi_lap_id)
        conditions = list(nen)
        if status:
            conditions.append(PaymentVoucher.status == status)
        if chung_tu == "co":
            conditions.append(self._co_chung_tu_chi())
        elif chung_tu == "thieu":
            conditions.append(~self._co_chung_tu_chi())
```

Giữ nguyên phần `stmt`/`count_stmt`/sắp xếp. Nếu `dem_only`: trả `[], total, {}` ngay sau khi đếm. Cuối hàm: `return rows, total, {**self._voucher_totals(conditions), "the_loc": self._the_loc_chi(nen)}`.

```python
    def _the_loc_chi(self, nen: list) -> dict:
        """Số trên hàng thẻ lọc: đếm trên nền đã lọc kỳ + bộ lọc nâng cao nhưng CHƯA chọn thẻ."""
        da_chi = PaymentVoucher.status == PAYMENT_VOUCHER_PAID
        stmt = select(
            func.count(),
            func.coalesce(func.sum(case((da_chi, 1), else_=0)), 0),
            func.coalesce(func.sum(case((da_chi, PaymentVoucher.amount_vnd), else_=0)), 0),
            func.coalesce(func.sum(case((and_(da_chi, ~self._co_chung_tu_chi()), 1), else_=0)), 0),
            func.coalesce(func.sum(case((PaymentVoucher.status == PAYMENT_VOUCHER_CANCELLED, 1), else_=0)), 0),
        ).select_from(PaymentVoucher)
        for dk in nen:
            stmt = stmt.where(dk)
        tat_ca, xong, xong_tien, thieu, huy = self.db.execute(stmt).one()
        return {"tat_ca": int(tat_ca), "xong": int(xong), "xong_tien": int(xong_tien),
                "thieu_chung_tu": int(thieu), "da_huy": int(huy), "cho": int(tat_ca) - int(xong) - int(huy)}
```

(Import `and_` nếu chưa có; tên hằng trạng thái huỷ: tìm trong `app/models/accounting.py` — `PAYMENT_VOUCHER_CANCELLED` hoặc tương đương.)

Làm y hệt cho phiếu thu: `_dieu_kien_phieu_thu(...)` trên `receipt_date`, `amount_vnd`, `receipt_method`, `source_type`, `company_bank_account_id`, `created_by_user_id`, `payment_voucher_id`; `_co_chung_tu_thu()` trên `PaymentReceiptAttachment.payment_receipt_id`; `list_receipts` trả `rows, total, {"total_received_amount": …, "the_loc": self._the_loc_thu(nen)}` với `xong` = `PAYMENT_RECEIPT_RECEIVED`, `cho` = `waiting_receipt`. Thêm `"receipt_date": PaymentReceipt.receipt_date` vào `_RECEIPT_SORTABLE`.

- [ ] **Step 4: Service + router + schema**

Service `list_vouchers(**filters)` đã chuyển thẳng — chỉ cần chuyển `totals` (giờ có `the_loc`). Service `list_receipts`: nhận thêm các khoá mới, trả `rows_out, total, extra`. Router `list_payment_vouchers` thêm:

```python
    tu_ngay: date | None = None,
    den_ngay: date | None = None,
    tien_tu: int | None = Query(default=None, ge=0),
    tien_den: int | None = Query(default=None, ge=0),
    hinh_thuc: str | None = None,
    nguon: list[str] = Query(default=[]),
    tai_khoan_id: int | None = None,
    nguoi_lap_id: int | None = None,
    chung_tu: str | None = Query(default=None, pattern="^(co|thieu)$"),
    dem_only: bool = False,
```

và trước khi gọi service: `if tu_ngay and den_ngay: _khoang_ngay(tu_ngay, den_ngay)`. Router phiếu thu tương tự; response `PaymentReceiptListOut(items=…, total=…, page=…, size=…, **extra)`.

Schema:

```python
class TheLocOut(BaseModel):
    tat_ca: int = 0
    xong: int = 0
    xong_tien: int = 0
    thieu_chung_tu: int = 0
    da_huy: int = 0
    cho: int = 0
```

`PaymentVoucherListOut` thêm `the_loc: TheLocOut = TheLocOut()`; `PaymentReceiptListOut` thêm `total_received_amount: int = 0`, `the_loc: TheLocOut = TheLocOut()`.

- [ ] **Step 5: Chạy test**

Run: `cd backend && python -m pytest tests/test_ke_toan_loc_ky_phieu.py tests/test_accounting_api.py tests/test_accounting_attachments_api.py -q`
Expected: PASS hết (test cũ không vỡ).

- [ ] **Step 6: Client TS**

Trong `frontend/src/api/client.ts`: thêm type

```ts
export type TheLoc = { tat_ca: number; xong: number; xong_tien: number; thieu_chung_tu: number; da_huy: number; cho: number };
export type LocPhieu = {
  q?: string; status?: string; sort?: string; page?: number; size?: number;
  tu_ngay?: string; den_ngay?: string; tien_tu?: number; tien_den?: number;
  hinh_thuc?: "cash" | "bank_transfer"; nguon?: string[]; tai_khoan_id?: number;
  nguoi_lap_id?: number; chung_tu?: "co" | "thieu"; dem_only?: boolean;
};
```

thêm `the_loc: TheLoc` vào `PaymentVoucherListOut`, `total_received_amount: number; the_loc: TheLoc` vào `PaymentReceiptListOut`; đổi tham số `vouchers`/`receipts` thành `LocPhieu & {…params cũ}`. Mảng `nguon` phải ra query lặp (`nguon=a&nguon=b`) — xem hàm dựng query hiện có trong client (tìm `URLSearchParams`), nếu nó không xử lý mảng thì thêm nhánh `Array.isArray(v) ? v.forEach(x => sp.append(k, String(x)))`.

Run: `cd frontend && npx tsc --noEmit` — Expected: 0 lỗi.

- [ ] **Step 7: Rà**

Run: `git diff --stat -- backend frontend/src/api` — chỉ các file trong danh sách trên.

---

### Task 2: API đọc — Công nợ phải trả / phải thu theo kỳ + bộ lọc nâng cao

**Files:**
- Modify: `backend/app/services/accounting_service.py:677-803` (`payables_summary`), `:1415-1551` (`receivables_summary`), `payables_detail`/`receivables_detail` (L817/L1555)
- Modify: `backend/app/routers/accounting.py:230-300`
- Modify: `backend/app/schemas/accounting.py:469-500, 645-680`
- Modify: `frontend/src/api/client.ts` (`payables` ~L14150, `receivables` ~L14180, `payablesDetail`, `receivablesDetail`, types `PayablesSummary` ~L7070, `ReceivablesSummary` ~L7223)
- Test: `backend/tests/test_ke_toan_cong_no_theo_ky.py`

**Interfaces:**
- Consumes: `bao_cao_cong_no.tong_hop_phai_tra(repo, purchases, *, tu_ngay, den_ngay) -> dict` và `tong_hop_phai_thu(repo, *, tu_ngay, den_ngay) -> dict` (items có `doi_tuong_id, dau_no, dau_co, ps_no, ps_co, cuoi_no, cuoi_co, aging: dict[key, {amount,count}]`).
- Produces `/payables` và `/receivables` query mới: `tu_ngay, den_ngay` (cả hai có hoặc cả hai không; không có = hành vi cũ 3 tháng, giữ cho các nơi khác đang gọi), `no_tu, no_den` (khoảng còn nợ), `han_tra: "qua_han"|"7_ngay"|"30_ngay"|None`, `han_muc: "tren_80"|"vuot"|"chua_dat"|None`, `ca_da_tra_het: bool=False`; riêng `/receivables`: `phu_trach_id: int|None` (`Customer.sale_user_id`), `nhan: str|None` (nhãn `CustomerTag.label`). Thêm `dem_only`.
- Produces item mới: phải trả `mua_trong_ky: int`, `han_gan_nhat: date|None`; phải thu `ban_trong_ky: int`, `han_gan_nhat: date|None`, `sale_user_id: int|None`. Tổng mới: `mua_trong_ky` / `ban_trong_ky`, `tu_ngay`, `den_ngay`. `paid_in_period` / `received_in_period` = TRONG kỳ khi có kỳ.
- Detail `/payables/{id}` và `/receivables/{id}` thêm `tu_ngay, den_ngay` (thay `moc_ky` khi có) cho tab Đã trả / Đã thu.

Nghĩa con số khi CÓ kỳ: `total_due` = dư cuối kỳ (`cuoi_co − cuoi_no` với 331; `cuoi_no − cuoi_co` với 131), `aging` = tuổi nợ tại `den_ngay` (lấy thẳng từ báo cáo), `overdue_amount` = tổng các rổ ≠ `chua_toi_han`, `no_han_amount` = rổ `chua_toi_han`, `paid_in_period` = `ps_no` (331) / `received_in_period` = `ps_co` (131), `mua_trong_ky` = `ps_co` (331) / `ban_trong_ky` = `ps_no` (131). Hạn mức, số ngày cho nợ, `han_gan_nhat` luôn theo hiện tại. KHÔNG viết công thức thứ hai: số kỳ lấy từ `bao_cao_cong_no`.

- [ ] **Step 1: Viết test hỏng** — `backend/tests/test_ke_toan_cong_no_theo_ky.py`. Chép helper từ `tests/test_payables_api.py` (`_headers`, `_supplier`, `_don`, `_da_mua`, `_ghi_dot`, `_phieu_chi`, `_dong_dau_tien`) và `tests/test_sales_invoices_api.py` (`_sales_order`, `_invoice_payload`). Test:

```python
def test_ky_den_hom_nay_khop_ban_chup_hien_tai(client):
    """Cùng dữ liệu: có kỳ (đến hôm nay) và không kỳ phải ra CÙNG số còn nợ / quá hạn / tuổi nợ."""
    h = _headers(client)
    ncc = _supplier(client, h, name="NCC Ky Khop")
    don = _don(client, h, ncc["id"]); _da_mua(client, h, don["id"])
    _ghi_dot(client, h, don["id"], lines=[{"purchase_request_line_id": _dong_dau_tien(don), "quantity": 400}])
    hn = accounting_service._business_today()
    cu = client.get("/api/accounting/payables", headers=h).json()
    moi = client.get("/api/accounting/payables", headers=h,
                     params={"tu_ngay": hn.replace(day=1).isoformat(), "den_ngay": hn.isoformat()}).json()
    a = next(m for m in cu["items"] if m["supplier_id"] == ncc["id"])
    b = next(m for m in moi["items"] if m["supplier_id"] == ncc["id"])
    assert b["total_due"] == a["total_due"]
    assert b["overdue_amount"] == a["overdue_amount"]
    assert b["aging"] == a["aging"]
    assert b["mua_trong_ky"] == a["total_due"]   # mua trong tháng này, chưa trả


def test_tra_trong_ky_va_ky_truoc_khong_tinh(client):
    # ghi đợt, lập phiếu chi hôm nay ⇒ paid_in_period của kỳ tháng này = số đã chi;
    # kỳ "năm trước" ⇒ NCC không có dòng (không nợ, không phát sinh) trừ khi ca_da_tra_het
    ...


def test_loc_khoang_no_va_han_muc(client):
    # 2 NCC nợ 880.000 và 8.800.000 ⇒ no_tu=1_000_000 chỉ còn NCC lớn; đặt credit_limit nhỏ ⇒ han_muc=vuot ra đúng NCC
    ...


def test_phai_thu_loc_nguoi_phu_trach(client):
    # 2 khách khác sale_user_id, mỗi khách 1 hoá đơn đã phát hành ⇒ phu_trach_id=<sale A> chỉ còn khách A
    ...


def test_tu_ngay_sau_den_ngay_422(client):
    h = _headers(client); hn = accounting_service._business_today()
    r = client.get("/api/accounting/receivables", headers=h,
                   params={"tu_ngay": hn.isoformat(), "den_ngay": (hn - timedelta(days=1)).isoformat()})
    assert r.status_code == 422
```

Viết đủ thân ba test có `...` theo đúng mô tả trong chú thích bằng helper đã chép (không để `...` trong file thật).

- [ ] **Step 2: Chạy, thấy hỏng** — `cd backend && python -m pytest tests/test_ke_toan_cong_no_theo_ky.py -q` → FAIL.

- [ ] **Step 3: Cài đặt `payables_summary`**

Chữ ký mới:

```python
    def payables_summary(self, *, q=None, filter_="all", aging_bucket=None, page=1, size=20,
                         tu_ngay: date | None = None, den_ngay: date | None = None,
                         no_tu: int | None = None, no_den: int | None = None, han_tra: str | None = None,
                         han_muc: str | None = None, ca_da_tra_het: bool = False, dem_only: bool = False) -> dict:
```

1. `moc_ky = tu_ngay if tu_ngay else hom_nay - timedelta(days=31 * PAYABLES_PERIOD_MONTHS)`; `da_tra_ky` chỉ cộng phiếu có `moc_ky <= self._ngay_chi(v) <= (den_ngay or hom_nay)`.
2. Trong vòng lặp, ghi `muc["han_gan_nhat"] = min(...)` của hạn trả các đợt còn nợ (dùng cùng hàm hạn mà `_no_theo_han` dùng — đọc `_no_theo_han` và `bao_cao_cong_no.han_tra_dot` để lấy hạn từng đợt; chọn min các đợt `con_no > 0`).
3. Sau vòng lặp, nếu có kỳ: `bc = bao_cao_cong_no.tong_hop_phai_tra(self.repo, self.purchases, tu_ngay=tu_ngay, den_ngay=den_ngay)`; với mỗi `it` trong `bc["items"]` có `doi_tuong_id`: lấy/mở `muc` (NCC chỉ có phát sinh trong kỳ cũng phải có dòng — dựng `muc` từ `self.suppliers`/repo theo id, tên lấy `it["ten"]`), rồi gán `total_due = it["cuoi_co"] - it["cuoi_no"]`, `aging = it["aging"]`, `overdue_amount = sum(a["amount"] for k, a in it["aging"].items() if k != "chua_toi_han")`, `no_han_amount = it["aging"]["chua_toi_han"]["amount"]`, `paid_in_period = it["ps_no"]`, `mua_trong_ky = it["ps_co"]`. NCC có trong `theo_ncc` mà không có trong báo cáo ⇒ `total_due = 0`, aging rỗng, `mua_trong_ky = 0`.
4. Điều kiện giữ dòng trong `tong_hop`: `total_due > 0 or paid_in_period > 0 or mua_trong_ky > 0`; `ca_da_tra_het` ⇒ giữ cả `total_due == 0` có phát sinh.
5. Lọc mới (sau `filter_`, trước `aging_bucket`):

```python
        if no_tu is not None:
            items = [m for m in items if m["total_due"] >= no_tu]
        if no_den is not None:
            items = [m for m in items if m["total_due"] <= no_den]
        moc = den_ngay or hom_nay
        if han_tra == "qua_han":
            items = [m for m in items if m["overdue_amount"] > 0]
        elif han_tra in ("7_ngay", "30_ngay"):
            n = 7 if han_tra == "7_ngay" else 30
            items = [m for m in items if m.get("han_gan_nhat") and moc <= m["han_gan_nhat"] <= moc + timedelta(days=n)]
        if han_muc == "tren_80":
            items = [m for m in items if m["credit_limit"] > 0 and m["total_due"] * 100 >= m["credit_limit"] * 80]
        elif han_muc == "vuot":
            items = [m for m in items if m["vuot_han_muc"]]
        elif han_muc == "chua_dat":
            items = [m for m in items if not m["credit_limit"]]
```

6. Trả thêm `"mua_trong_ky": sum(m.get("mua_trong_ky", 0) for m in tong_hop)`, `"tu_ngay": tu_ngay or moc_ky`, `"den_ngay": den_ngay or hom_nay`. `dem_only` ⇒ `items: []`.

Nếu test `test_ky_den_hom_nay_khop_ban_chup_hien_tai` lệch số giữa báo cáo và bản chụp: DỪNG, ghi rõ chênh ở đâu (cọc? đợt chưa hoá đơn?) vào báo cáo Task — không ép test cho qua.

- [ ] **Step 4: `receivables_summary`** — cùng khuôn, `bao_cao_cong_no.tong_hop_phai_thu(self.repo, tu_ngay=…, den_ngay=…)`; `total_due = cuoi_no − cuoi_co`, `received_in_period = ps_co`, `ban_trong_ky = ps_no`. Thêm `sale_user_id` vào mỗi `muc` (lấy từ `repo.customers_by_ids(...)` đã gọi trong `receivable_rows`). Lọc `phu_trach_id` (so `sale_user_id`) và `nhan` (đọc nhãn: `select(CustomerTag.customer_id).where(CustomerTag.label == nhan)` — thêm hàm repo `customer_ids_co_nhan(label) -> set[int]` vào `accounting_repo.py`). `han_gan_nhat` = min `due_date` của hoá đơn `remaining_amount > 0`.

- [ ] **Step 5: Detail theo kỳ** — `payables_detail(supplier_id, all_history=False, tu_ngay=None, den_ngay=None)`: khi có kỳ, `moc_ky = tu_ngay` và lọc phiếu `<= den_ngay` trong phần lịch sử đã trả; giống cho `receivables_detail`. Router hai endpoint detail nhận `tu_ngay`, `den_ngay`.

- [ ] **Step 6: Router + schema** — router `/payables`, `/receivables` khai các query trên (`_khoang_ngay` khi có cả hai; chỉ có một trong hai ⇒ 422 "Chọn đủ từ ngày và đến ngày."). Schema: `PayableSupplierOut` thêm `mua_trong_ky: int = 0`, `han_gan_nhat: date | None = None`; `PayablesSummaryOut` thêm `mua_trong_ky: int = 0`, `tu_ngay: date | None = None`, `den_ngay: date | None = None`; `ReceivableCustomerOut` thêm `ban_trong_ky: int = 0`, `han_gan_nhat: date | None = None`, `sale_user_id: int | None = None`; `ReceivablesSummaryOut` thêm `ban_trong_ky`, `tu_ngay`, `den_ngay`. (Nhớ: Pydantic nuốt trường im lặng — đủ dict → schema → type TS.)

- [ ] **Step 7: Chạy test** — `cd backend && python -m pytest tests/test_ke_toan_cong_no_theo_ky.py tests/test_payables_api.py tests/test_sales_invoices_api.py tests/test_bao_cao_cong_no.py tests/test_phan_tuoi_cong_no.py -q` → PASS.

- [ ] **Step 8: Client TS** — thêm vào `client.ts`:

```ts
export type LocCongNo = {
  q?: string; filter?: string; aging?: string | null; page?: number; size?: number;
  tu_ngay?: string; den_ngay?: string; no_tu?: number; no_den?: number;
  han_tra?: "qua_han" | "7_ngay" | "30_ngay"; han_muc?: "tren_80" | "vuot" | "chua_dat";
  ca_da_tra_het?: boolean; dem_only?: boolean; phu_trach_id?: number; nhan?: string;
};
```

`payables(token, p: LocCongNo)`, `receivables(token, p: LocCongNo)`; `payablesDetail(token, id, allHistory, ky?: {tu_ngay: string; den_ngay: string})`, tương tự `receivablesDetail`. Thêm trường mới vào type item/summary. `npx tsc --noEmit` → 0 lỗi.

---

### Task 3: API đọc — Thu/chi theo tài khoản trong kỳ

**Files:**
- Modify: `backend/app/repositories/accounting_repo.py` (hàm mới), `backend/app/services/accounting_service.py`, `backend/app/routers/accounting.py` (cạnh `list_company_bank_accounts` L670), `backend/app/schemas/accounting.py`, `frontend/src/api/client.ts`
- Test: `backend/tests/test_ke_toan_tk_thong_ke.py`

**Interfaces:**
- Produces: `GET /api/accounting/company-bank-accounts/thong-ke?tu_ngay&den_ngay` (bắt buộc cả hai; quyền `require_permission(MODULE_TKNH, "read")`) → `list[TaiKhoanThongKeOut]` với `TaiKhoanThongKeOut {tai_khoan_id: int, thu: int, chi: int, so_phieu: int}` — chỉ phiếu `paid` / `received`, theo `voucher_date` / `receipt_date`.
- Client: `api.accounting.thongKeTaiKhoan(token, {tu_ngay, den_ngay}): Promise<TaiKhoanThongKe[]>`.
- Danh sách phiếu qua một tài khoản trong ngăn TK dùng lại `vouchers`/`receipts` với `tai_khoan_id` + kỳ (Task 1).

- [ ] **Step 1: Test hỏng**

```python
def test_thong_ke_tai_khoan_cong_dung_ky(client):
    h = _headers(client)
    tk = _tai_khoan(client, h)                       # POST /api/accounting/company-bank-accounts (payload như test_accounting_api)
    hn = accounting_service._business_today()
    _lap_phieu_chi(client, h, so_tien=2_000_000, hinh_thuc="bank_transfer", tai_khoan_id=tk["id"], ngay=hn)
    _lap_phieu_chi(client, h, so_tien=9_000_000, hinh_thuc="bank_transfer", tai_khoan_id=tk["id"],
                   ngay=hn - timedelta(days=400))
    r = client.get("/api/accounting/company-bank-accounts/thong-ke", headers=h,
                   params={"tu_ngay": hn.replace(day=1).isoformat(), "den_ngay": hn.isoformat()})
    dong = next(x for x in r.json() if x["tai_khoan_id"] == tk["id"])
    assert dong == {"tai_khoan_id": tk["id"], "thu": 0, "chi": 2_000_000, "so_phieu": 1}


def test_thong_ke_thu_quy_chi_co_quyen_xem_tai_khoan(client):
    # vai chỉ có tk_ngan_hang:read (helper _token_vai trong test_payables_api.py) ⇒ 200, không 403
    ...
```

(Viết đủ test thứ hai bằng `_token_vai`.)

- [ ] **Step 2: FAIL** — `python -m pytest tests/test_ke_toan_tk_thong_ke.py -q`.
- [ ] **Step 3: Repo**

```python
    def thong_ke_tai_khoan(self, *, tu_ngay: date, den_ngay: date) -> list[dict]:
        chi = dict(self.db.execute(
            select(PaymentVoucher.company_bank_account_id, func.sum(PaymentVoucher.amount_vnd))
            .where(PaymentVoucher.status == PAYMENT_VOUCHER_PAID,
                   PaymentVoucher.company_bank_account_id.is_not(None),
                   PaymentVoucher.voucher_date.between(tu_ngay, den_ngay))
            .group_by(PaymentVoucher.company_bank_account_id)).all())
        dem_chi = dict(self.db.execute(
            select(PaymentVoucher.company_bank_account_id, func.count())
            .where(PaymentVoucher.status == PAYMENT_VOUCHER_PAID,
                   PaymentVoucher.company_bank_account_id.is_not(None),
                   PaymentVoucher.voucher_date.between(tu_ngay, den_ngay))
            .group_by(PaymentVoucher.company_bank_account_id)).all())
        thu = dict(self.db.execute(
            select(PaymentReceipt.company_bank_account_id, func.sum(PaymentReceipt.amount_vnd))
            .where(PaymentReceipt.status == PAYMENT_RECEIPT_RECEIVED,
                   PaymentReceipt.company_bank_account_id.is_not(None),
                   PaymentReceipt.receipt_date.between(tu_ngay, den_ngay))
            .group_by(PaymentReceipt.company_bank_account_id)).all())
        dem_thu = dict(self.db.execute(
            select(PaymentReceipt.company_bank_account_id, func.count())
            .where(PaymentReceipt.status == PAYMENT_RECEIPT_RECEIVED,
                   PaymentReceipt.company_bank_account_id.is_not(None),
                   PaymentReceipt.receipt_date.between(tu_ngay, den_ngay))
            .group_by(PaymentReceipt.company_bank_account_id)).all())
        ids = set(chi) | set(thu)
        return [{"tai_khoan_id": i, "thu": int(thu.get(i, 0)), "chi": int(chi.get(i, 0)),
                 "so_phieu": int(dem_chi.get(i, 0)) + int(dem_thu.get(i, 0))} for i in sorted(ids)]
```

- [ ] **Step 4: Service mỏng, router (`_khoang_ngay`), schema `TaiKhoanThongKeOut`, client TS.** Route `/company-bank-accounts/thong-ke` phải khai TRƯỚC mọi route `/company-bank-accounts/{account_id}` để không bị nuốt.
- [ ] **Step 5: PASS** — `python -m pytest tests/test_ke_toan_tk_thong_ke.py tests/test_phan_quyen_ke_toan_api.py -q`; `npx tsc --noEmit`.

---

### Task 4: Khung frontend dùng chung (kỳ, ngăn phải, bộ lọc, thẻ lọc, CSS)

**Files:**
- Create: `frontend/src/utils/ky.ts`, `frontend/src/utils/ky.test.ts`
- Modify: `frontend/src/pages/khachHangSo.ts` (chuyển hàm kỳ sang `utils/ky.ts`, giữ `export { … } from "../utils/ky"` để mọi import cũ sống)
- Create: `frontend/src/pages/ke-toan/ke-toan.css`
- Create: `frontend/src/pages/ke-toan/shared/{doRongNgan.ts,NganPhai.tsx,ChonKy.tsx,BoLocNangCao.tsx,TheLoc.tsx,Cum.tsx,dinhDang.ts}`
- Test: `frontend/src/pages/ke-toan/shared/{NganPhai.test.tsx,ChonKy.test.tsx,BoLocNangCao.test.tsx}`

**Interfaces (Produces — mọi Task màn dùng đúng tên này):**

```ts
// utils/ky.ts
export type LoaiKy = "thang" | "quy" | "nam" | "12t" | "namtruoc" | "tuy";
export type KyXem = { tu: string; den: string };            // re-export từ api/client nếu đã có ở đó
export const LOAI_KY: [LoaiKy, string][];
export const TRAN_KHOANG_NGAY: number;
export function homNayVN(now?: number): string;
export function congNgay(s: string, n: number): string;
export function soNgay(tu: string, den: string): number;
export function luiNam(s: string, n?: number): string;
export function tinhKy(loai: LoaiKy, homNay: string, tuy?: KyXem | null): KyXem;
export function loiKhoang(tu: string, den: string): string | null;
export function kyCungKy(ky: KyXem): KyXem;                 // { tu: luiNam(ky.tu), den: luiNam(ky.den) }

// shared/dinhDang.ts
export function tien(n: number | null | undefined): string;  // "1.204.000 đ"; null → "—"
export function ngay(iso: string | null | undefined): string; // "05/10/2026"
export function doiSo(nay: number, truoc: number): { huong: "len" | "xuong" | "bang"; phanTram: number | null };

// shared/ChonKy.tsx
export type TrangThaiKy = { loai: LoaiKy; tuy: KyXem | null; soSanh: boolean };
export function useKyMan(manId: string): {
  tt: TrangThaiKy; ky: KyXem; cungKy: KyXem | null;          // cungKy = null khi soSanh tắt
  chon: (loai: LoaiKy, tuy?: KyXem) => void; datSoSanh: (b: boolean) => void;
};  // nhớ theo manId trong Map cấp module (sống hết phiên trang)
export function ChonKy(props: { kyMan: ReturnType<typeof useKyMan> }): JSX.Element;

// shared/doRongNgan.ts
export const DO_RONG_MAC_DINH = 920; export const DO_RONG_MIN = 480; export const KHOA_LUU = "kt-ngan-rong";
export function docDoRong(): number; export function ghiDoRong(px: number): void; // set --kt-ngan-w + localStorage (try/catch)
export function doRongToiDa(): number;                                            // Math.max(480, innerWidth - 232)

// shared/NganPhai.tsx
export type TabNgan = { id: string; nhan: string; dem?: number };
export function NganPhai(props: {
  duongDan?: React.ReactNode;          // breadcrumb "Phiếu chi > UNC-…"
  tieuDe: React.ReactNode; the?: React.ReactNode; hanhDong?: React.ReactNode;
  soLon?: React.ReactNode; tomTat?: { nhan: string; giaTri: React.ReactNode }[];   // dải 4 ô
  tabs?: TabNgan[]; tab?: string; onTab?: (id: string) => void;
  chan?: React.ReactNode; chanToi?: boolean;                  // thanh tối chọn nhiều
  len?: () => void; xuong?: () => void;                       // ↑ ↓ đổi bản ghi
  onDong: () => void; chanDong?: () => boolean;               // trả true = đang có nội dung dở, không đóng
  tang?: number;                                              // 0 = ngăn thường, 1 = ngăn chồng
  children: React.ReactNode;
}): JSX.Element;

// shared/BoLocNangCao.tsx
export type ChipLoc = { khoa: string; nhan: string; giaTri: React.ReactNode };
export function BoLocNangCao(props: {
  soDieuKien: number; mo: boolean; onMo: (b: boolean) => void;
  khop: number | null; donVi: string;                          // "Khớp 6 phiếu trong kỳ" / nút "Xem 6 phiếu"
  onXoaHet: () => void; onAp: () => void; children: React.ReactNode;
}): JSX.Element;
export function ChipDaAp(props: { chips: ChipLoc[]; onBo: (khoa: string) => void; onSua: (khoa: string) => void; onXoaHet: () => void }): JSX.Element;
export function O(props: { nhan: string; rong?: boolean; children: React.ReactNode }): JSX.Element;
export function KhoangTien(props: { tu?: number; den?: number; onDoi: (tu?: number, den?: number) => void }): JSX.Element;
export function NhomNut<T extends string>(props: { giaTri: T; luaChon: [T, string][]; onDoi: (v: T) => void }): JSX.Element;
export function ChonNhieu(props: { giaTri: string[]; luaChon: [string, string][]; onDoi: (v: string[]) => void }): JSX.Element;

// shared/TheLoc.tsx
export type TheLocMuc = { id: string; nhan: string; cham?: "xanh" | "amber" | "xam" | "do"; icon?: IconName;
  so: React.ReactNode; phu?: React.ReactNode; cungKy?: { huong: "len" | "xuong" | "bang"; chu: string; xau?: boolean } | null };
export function TheLoc(props: { muc: TheLocMuc[]; dangChon: string; onChon: (id: string) => void }): JSX.Element;

// shared/Cum.tsx
export function Cum(props: { children: React.ReactNode; className?: string }): JSX.Element;   // flex wrap gap 4px 8px
export function TheNho(props: { children: React.ReactNode }): JSX.Element;                   // .kt-the
```

- [ ] **Step 1: Test hỏng cho `utils/ky.ts`** — chép `pages/khachHangSo.test.ts` phần `tinhKy`/`luiNam` sang `utils/ky.test.ts` đổi import, thêm:

```ts
it("kyCungKy lùi đúng một năm, 29/02 thành 28/02", () => {
  expect(kyCungKy({ tu: "2028-02-01", den: "2028-02-29" })).toEqual({ tu: "2027-02-01", den: "2027-02-28" });
});
```

Run: `cd frontend && npx vitest run src/utils/ky.test.ts` → FAIL (module chưa có).

- [ ] **Step 2: Tạo `utils/ky.ts`** — CHUYỂN (cắt, không chép đôi) thân `LoaiKy, LOAI_KY, TRAN_KHOANG_NGAY, homNayVN, congNgay, soNgay, luiNam, tinhKy, loiKhoang` từ `pages/khachHangSo.ts` sang; thêm `kyCungKy`. Trong `khachHangSo.ts` thay bằng `export { LOAI_KY, TRAN_KHOANG_NGAY, homNayVN, congNgay, soNgay, luiNam, tinhKy, loiKhoang } from "../utils/ky"; export type { LoaiKy } from "../utils/ky";` và import lại những hàm file đó còn dùng nội bộ. Run: `npx vitest run src/utils/ky.test.ts src/pages/khachHangSo.test.ts` → PASS.

- [ ] **Step 3: Test hỏng `NganPhai`**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { NganPhai } from "./NganPhai";
import { KHOA_LUU } from "./doRongNgan";

it("mặc định 920px, kéo mép trái đổi độ rộng chung và nhớ", () => {
  localStorage.removeItem(KHOA_LUU);
  Object.defineProperty(window, "innerWidth", { value: 1600, configurable: true });
  render(<NganPhai tieuDe="Phiếu" onDong={() => {}}>x</NganPhai>);
  expect(document.documentElement.style.getPropertyValue("--kt-ngan-w")).toBe("920px");
  const keo = screen.getByRole("separator", { name: "Kéo để đổi độ rộng" });
  fireEvent.pointerDown(keo, { clientX: 680, pointerId: 1 });
  fireEvent.pointerMove(keo, { clientX: 500, pointerId: 1 });
  fireEvent.pointerUp(keo, { pointerId: 1 });
  expect(document.documentElement.style.getPropertyValue("--kt-ngan-w")).toBe("1100px");
  expect(localStorage.getItem(KHOA_LUU)).toBe("1100");
});

it("bấm đúp thanh kéo bật rộng hết rồi trả về", () => {
  localStorage.setItem(KHOA_LUU, "920");
  render(<NganPhai tieuDe="P" onDong={() => {}}>x</NganPhai>);
  const keo = screen.getByRole("separator", { name: "Kéo để đổi độ rộng" });
  fireEvent.doubleClick(keo);
  expect(document.documentElement.style.getPropertyValue("--kt-ngan-w")).toBe(`${window.innerWidth - 232}px`);
  fireEvent.doubleClick(keo);
  expect(document.documentElement.style.getPropertyValue("--kt-ngan-w")).toBe("920px");
});

it("Esc đóng ngăn trên cùng, chanDong chặn khi đang gõ dở", () => {
  const dong = vi.fn();
  render(<NganPhai tieuDe="P" onDong={dong} chanDong={() => true}>x</NganPhai>);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(dong).not.toHaveBeenCalled();
});

it("tab charcoal: bấm tab gọi onTab", () => {
  const onTab = vi.fn();
  render(<NganPhai tieuDe="P" onDong={() => {}} tabs={[{ id: "tt", nhan: "Chi tiết" }, { id: "ls", nhan: "Lịch sử", dem: 3 }]} tab="tt" onTab={onTab}>x</NganPhai>);
  fireEvent.click(screen.getByRole("tab", { name: /Lịch sử/ }));
  expect(onTab).toHaveBeenCalledWith("ls");
});
```

- [ ] **Step 4: Cài `doRongNgan.ts` + `NganPhai.tsx`**

```ts
// doRongNgan.ts
export const DO_RONG_MAC_DINH = 920;
export const DO_RONG_MIN = 480;
export const KHOA_LUU = "kt-ngan-rong";
export function doRongToiDa(): number { return Math.max(DO_RONG_MIN, window.innerWidth - 232); }
export function docDoRong(): number {
  try { const n = Number(localStorage.getItem(KHOA_LUU)); if (n >= DO_RONG_MIN) return Math.min(n, doRongToiDa()); } catch { /* bỏ qua */ }
  return DO_RONG_MAC_DINH;
}
export function ghiDoRong(px: number): void {
  const w = Math.round(Math.min(doRongToiDa(), Math.max(DO_RONG_MIN, px)));
  document.documentElement.style.setProperty("--kt-ngan-w", `${w}px`);
  try { localStorage.setItem(KHOA_LUU, String(w)); } catch { /* bỏ qua */ }
}
```

`NganPhai.tsx`: `useLayoutEffect` lần đầu `document.documentElement.style.setProperty("--kt-ngan-w", docDoRong()+"px")`. Cấu trúc DOM (lớp lấy từ bản xem, đổi `nk` → `kt-ngan`):

```tsx
<div className="kt-man" style={{ zIndex: 60 + tang * 20 }} onClick={dongNeuDuoc} role="presentation">
  <aside className={`kt-ngan${keo ? " kt-ngan--keo" : ""}`} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
    <div className="kt-ngan__keo" role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng"
         onPointerDown={batDauKeo} onDoubleClick={batTatRongHet} />
    <header className="kt-ngan__dau">
      <div className="kt-ngan__dong1">{duongDan}<span className="kt-ngan__nut">{len && <button aria-label="Bản ghi trước" …><Icon name="chevron" …/></button>}{xuong && …}<button aria-label="Mở rộng" onClick={batTatRongHet}><Icon name="maximize" size={16}/></button><button aria-label="Đóng" onClick={onDong}><Icon name="x" size={16}/></button></span></div>
      <div className="kt-ngan__tieu"><h2>{tieuDe}</h2>{the}<span className="kt-ngan__hd">{hanhDong}</span></div>
      {soLon && <div className="kt-ngan__so">{soLon}</div>}
      {tomTat && <div className="kt-ngan__su">{tomTat.map(o => <div key={o.nhan}><span>{o.nhan}</span><b>{o.giaTri}</b></div>)}</div>}
      {tabs && <div className="kt-ngan__tab" role="tablist">{tabs.map(t => <button key={t.id} role="tab" aria-selected={t.id === tab} className={t.id === tab ? "on" : ""} onClick={() => onTab?.(t.id)}>{t.nhan}{t.dem != null && <span className="kt-dem">{t.dem}</span>}</button>)}</div>}
    </header>
    <div className="kt-ngan__than">{children}</div>
    {chan && <footer className={`kt-ngan__chan${chanToi ? " kt-ngan__chan--toi" : ""}`}>{chan}</footer>}
  </aside>
</div>
```

Kéo: `batDauKeo` → `setPointerCapture`, `pointermove` gọi `ghiDoRong(window.innerWidth - e.clientX)`, `pointerup` gỡ. `batTatRongHet`: đang `>= doRongToiDa() - 4` thì `ghiDoRong(DO_RONG_MAC_DINH)` ngược lại `ghiDoRong(doRongToiDa())`. Esc: một ngăn xếp tầng cấp module (`const chong: symbol[] = []`); mỗi ngăn push khi mount, `keydown` chỉ xử lý nếu là phần tử cuối; gọi `onDong()` trừ khi `chanDong?.()` trả true (khi đó hỏi `window.confirm("Bỏ nội dung đang nhập?")` — đúng hành vi ngăn Tài sản). ↑/↓ trên `document` khi tiêu điểm không ở ô nhập ⇒ `len?.()` / `xuong?.()`.

- [ ] **Step 5: `ChonKy`, `BoLocNangCao`, `TheLoc`, `Cum`, `dinhDang` + test**

`ChonKy.test.tsx`:

```tsx
it("bấm Tuỳ chọn hiện hai ô ngày; bỏ tích so sánh thì cungKy = null", async () => {
  function Bao() { const k = useKyMan("test"); return <><ChonKy kyMan={k} /><output>{k.cungKy ? "co" : "khong"}</output></>; }
  render(<Bao />);
  expect(screen.queryByLabelText("Từ ngày")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Tuỳ chọn" }));
  expect(screen.getByLabelText("Từ ngày")).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText("So với cùng kỳ năm trước"));
  expect(screen.getByText("khong")).toBeInTheDocument();
});
```

`ChonKy` = nhóm nút `kt-ky__nut` (lặp `LOAI_KY`, `aria-pressed`), khi `tuy`: hai `<input type="date" aria-label="Từ ngày"|"Đến ngày" min="2000-01-01" max={homNayVN()}>` — chỉ gọi `chon("tuy", {tu, den})` khi `loiKhoang(tu, den) == null` (lỗi thì hiện `span.kt-ky__loi`), `label.kt-ky__so` (checkbox), `div.kt-ky__nhan` = `ngay(ky.tu) – ngay(ky.den)` + `<span>so với {ngay(cungKy.tu)} – {ngay(cungKy.den)}</span>` khi bật. Mặc định `{loai: "thang", tuy: null, soSanh: true}`.

`BoLocNangCao.test.tsx`: mở bảng bằng nút "Bộ lọc", thấy viên số khi `soDieuKien=3`, nút chân "Xem 6 phiếu" gọi `onAp` và `onMo(false)`; Esc đóng KHÔNG gọi `onAp`; `ChipDaAp` bấm × gọi `onBo(khoa)`.

`BoLocNangCao`: wrapper `div.kt-loc-wrap` (position relative) gồm nút `button.kt-btn.kt-btn--nho` (`<Icon name="settings"…/>` hoặc lucide `SlidersHorizontal`) "Bộ lọc" + `span.kt-dem` khi `soDieuKien>0`; bảng `div.kt-boloc` (đầu "Bộ lọc nâng cao" + "Xoá hết"; thân lưới 2 cột; chân `"Khớp {khop} {donVi} trong kỳ"` + "Đóng" + nút chính `"Xem {khop} {donVi}"`). Bấm ngoài / Esc = đóng.

`TheLoc`: `div.kt-the-loc` lưới `repeat(auto-fit, minmax(170px,1fr))`, mỗi thẻ `button.kt-the-loc__o` (`on` = viền charcoal đủ 4 cạnh), dòng cùng kỳ `span.kt-cung-ky` (mũi tên `arrowUp/arrowDown` từ lucide-react, `kt-cung-ky--do` khi `xau`).

`Cum` / `TheNho`: như interface.

- [ ] **Step 6: `ke-toan.css`** — chuyển CSS từ `docs/mockups/ke-toan-ui-ux-tung-man.html` (khối `<style>`) cho: ngăn (`.nk*` → `.kt-ngan*`, `width: var(--kt-ngan-w, 920px)`), thẻ lọc (`.loc*` → `.kt-the-loc*`), chip (`.chip*` → `.kt-chip*`), kỳ (`.ky*` → `.kt-ky*`), cùng kỳ (`.cung-ky` → `.kt-cung-ky`), bộ lọc (`.boloc*` → `.kt-boloc*`, `.khoang` → `.kt-khoang`, `.chon-nhieu` → `.kt-chon-nhieu`), cụm (`.cum`/`.cum__the` → `.kt-cum`/`.kt-the`), form (`.f__muc/.f__tieu/.o/.o-tien/.cach/.dots/.gap` → `.kt-f__muc/.kt-f__tieu/.kt-o/.kt-o-tien/.kt-cach/.kt-dots/.kt-them`), tổng quan công nợ (`.tq*` → `.kt-tq*`), thẻ tài khoản (`.tk*` → `.kt-tk*`), dòng thời gian (`.ls*` → `.kt-ls*`), bảng (`.trang` → `.kt-bang`), điện thoại (`.dt …` → `@media (max-width: 639px) …`). Chỉ dùng token (`var(--…)`) đã có trong `src/styles` — grep tên token trước khi dùng; token chỉ có trong bản xem thì quy về token thật gần nhất. Không selector `.rc-*`.

Import `ke-toan.css` một lần trong từng trang màn (Task 5-9).

- [ ] **Step 7: PASS** — `cd frontend && npx vitest run src/utils src/pages/ke-toan/shared src/pages/khachHangSo.test.ts src/pages/cssKhongCuop.test.ts && npx tsc --noEmit`.

---

### Task 5: Màn Phiếu chi (PC-1 … PC-6)

**Files:**
- Modify: `frontend/src/pages/ke-toan/phieu-chi/PaymentVouchersPage.tsx`, `components/VouchersTable.tsx`, `components/VouchersDrawer.tsx`, `modals/StandaloneVoucherDialog.tsx`, `modals/LapPhieuChiGiaCongModal.tsx`, `PaymentVoucherDialog.tsx` (vỏ ngoài + nhóm form), `components/VoucherSegments.tsx`, `VoucherAmountFields.tsx`, `VoucherRecipientSection.tsx`, `shared/helpers.ts`, `shared/constants.ts` (lỗi `HOM_NAY` UTC)
- Create: `frontend/src/pages/ke-toan/phieu-chi/components/BoLocPhieuChi.tsx`, `components/HangChoGiaCong.tsx`
- Delete-from-render: `VouchersToolbar.tsx` không còn dùng ở trang (giữ file nếu nơi khác import — grep trước; không ai import thì xoá và nói rõ trong báo cáo)

**Interfaces:**
- Consumes: Task 1 (`LocPhieu`, `the_loc`), Task 4 (toàn bộ shared).
- Đặc tả: mục PC-1 … PC-6 + A.5, A.16, A.17, A.18; bản xem màn `pc1, pc1gc, pc1tuy, pc1loc, pc2, pc2ct, pc2ls, pc3, pc4, pc5, pc6`.

- [ ] **Step 1: Trang danh sách** — `PaymentVouchersPage`:
  - Đầu trang: `h1` "Phiếu chi" + câu "Sổ tiền ra: mọi phiếu chi tiền mặt và chuyển khoản." + nút rust "Lập phiếu chi" (mở `StandaloneVoucherDialog`).
  - `const kyMan = useKyMan("ke-toan-phieu-chi")` → `<ChonKy kyMan={kyMan}/>`.
  - State lọc nâng cao `loc: {tien_tu?, tien_den?, hinh_thuc?, nguon: string[], tai_khoan_id?, nguoi_lap_id?, ten_nhan?, chung_tu?}` (ten_nhan đi vào `q` của máy chủ — ghép với ô tìm), `the: "tat_ca"|"xong"|"thieu"|"gc"|"da_huy"`.
  - `load()` gọi `api.accounting.vouchers(token, {q, status: the==="xong"?"paid":the==="da_huy"?"cancelled":undefined, chung_tu: the==="thieu"?"thieu":loc.chung_tu, tu_ngay: kyMan.ky.tu, den_ngay: kyMan.ky.den, ...loc, page, size, sort: "-voucher_date"})`; nếu `kyMan.cungKy` có thì gọi thêm `vouchers(token, {...cùng bộ lọc, tu_ngay: cungKy.tu, den_ngay: cungKy.den, size: 1})` lấy `the_loc` cùng kỳ. Hai lời gọi `Promise.all`; đổi kỳ / lọc / tìm ⇒ về trang 1; tìm chờ 350ms (sửa lỗi 10 của đặc tả).
  - `<TheLoc>` 5 thẻ: Tất cả (`the_loc.tat_ca`, phụ "phiếu trong kỳ", cùng kỳ "Cùng kỳ N phiếu"), Đã chi (`tien(xong_tien)`, phụ `${xong} phiếu`, cùng kỳ `doiSo` "12% so với 114.600.000"), Thiếu chứng từ (amber kẹp giấy, phụ "chưa có hoá đơn hoặc biên nhận"), Gia công chờ chi (từ `api.giaCongNgoai.choChi`, tổng tiền + "N việc đã chốt"), Đã hủy.
  - Thanh lọc: ô tìm "Tìm mã phiếu, người nhận, nội dung, mã đơn mua" + `BoLocPhieuChi` + `ChipDaAp` + `span` "N phiếu" bên phải.
  - Thẻ "gc" ⇒ thay bảng bằng `HangChoGiaCong` (cột Nhà gia công + lệnh | Việc (thẻ nhỏ từng công đoạn) | Số chốt | Chốt bởi + ngày | Thành tiền | nút phụ "Lập phiếu chi" mở `LapPhieuChiGiaCongModal`), có câu dẫn. Bỏ `GiaCongChoChiStrip` (băng vàng).
- [ ] **Step 2: `BoLocPhieuChi`** — trong `BoLocNangCao`: `O "Số tiền (đ)"`→`KhoangTien`; `O "Hình thức"`→`NhomNut [["", "Tất cả"],["cash","Tiền mặt"],["bank_transfer","Chuyển khoản"]]`; `O rong "Nguồn chi"`→`ChonNhieu` từ `SOURCE_LABELS` (`purchase_request` Đơn mua, `gia_cong_ngoai` Gia công, `salary_advance` Tạm ứng lương, `internal_expense`/`other` Khác — "Khác" gửi cả hai); `O "Trả từ tài khoản"`→`select` từ `api.accounting.companyAccounts(token, false, "pay")`; `O "Người nhận"`→ input; `O "Người lập"`→ select người dùng (dùng API danh sách người dùng đang có — grep `api.users` / `api.rbac`; nếu chỉ có endpoint cần quyền quản trị thì BỎ ô này và ghi vào báo cáo); `O "Chứng từ"`→`NhomNut`. Bảng giữ bản nháp riêng; "Xem n phiếu" mới chép vào `loc`. `khop` = `vouchers(..., dem_only: true)` chờ 350ms sau lần đổi cuối. Chip: mỗi điều kiện một chip, nguồn nhiều giá trị ghép bằng chữ "và".
- [ ] **Step 3: Bảng** — `VouchersTable` cột: Chi cho (tên đậm + nội dung cắt "…") | Số tiền (phải; dưới: hình thức; ngoại tệ thì `<Cum><TheNho>USD 1.200</TheNho><span>tỷ giá 25.400</span></Cum>`) | Trạng thái (pill + dòng "Thiếu chứng từ" amber) | Nguồn (`<Cum>` loại + `TheNho` phụ như "Đặt cọc"; dưới mã) | Ngày chi (`voucher_date`) | Mã phiếu (xám) | `›`. Dòng `tabIndex=0`, ↑↓ chuyển, Enter mở. Rỗng 3 câu (chưa có / lọc không ra + "Bỏ lọc" / tải lỗi). Chân `PhanTrangDayDu` giữ nguyên (phiên khác vừa gắn). Dưới 640px: thẻ hai hàng (`<Cum><span>05/10</span><TheNho>Đơn mua</TheNho></Cum>`).
- [ ] **Step 4: Ngăn chi tiết** — `VouchersDrawer` dựng lại bằng `NganPhai`: `duongDan` "Phiếu chi > {code}" + nút chép mã; tiêu đề người nhận + pill; hành động "In phiếu" + menu "⋯" (Hủy phiếu — mờ + lý do khi không huỷ được); `soLon` số tiền; `tomTat` Ngày chi | Hình thức | Nguồn (link) | Người lập; tabs `tt` Chi tiết, `ct` Chứng từ (dem), `ls` Lịch sử (dem). Tab Chi tiết: lưới `kt-luoi2` (container query 680px ⇒ 1 cột): "Thông tin phiếu" (danh sách `dl` nhãn 168px, gồm số hoá đơn + `TheNho` ngày hoá đơn, số hợp đồng, ghi chú, CCCD, chi nhánh — mọi trường đã nhập lúc lập) + "Dòng tiền" (tài khoản đi → số tiền → tài khoản đến, tên chủ + `TheNho` chi nhánh) + khối "Trả cho đợt giao" (Giá trị — Trừ cọc — Phiếu này — Còn nợ, thẻ "Đợt đã trả đủ"). Tab Chứng từ: ô kéo-thả một hàng + lưới ảnh 132px + `Cum` loại/dung lượng + Xem/Xoá; xoá xong hiện thông báo "Đã xoá … Hoàn tác" TRONG ngăn (5 giây; Hoàn tác = tải lại tệp đã giữ trong bộ nhớ, nếu API không cho thì chỉ hiện "Đã xoá" và ghi báo cáo). Tab Lịch sử: `kt-ls` từ nhật ký (grep endpoint nhật ký theo đối tượng — `api.activity`/audit; dùng `cancelled_by/at`, `created_by`, đính kèm `uploaded_by/at` nếu không có endpoint). Hủy phiếu (PC-6): khung viền đỏ nhạt ở đầu tab Chi tiết, lý do bắt buộc, lỗi ngay dưới ô (không banner sau lớp phủ).
- [ ] **Step 5: Form lập phiếu** — `StandaloneVoucherDialog`, `PaymentVoucherDialog`, `LapPhieuChiGiaCongModal` đổi vỏ sang `NganPhai` (cùng 920px, `chanDong` = form bẩn); thân chia nhóm `kt-f__muc` + `kt-f__tieu` "CHI CHO AI VÀ BAO NHIÊU" / "TRẢ BẰNG" / "KHI NÀO"; ô tiền `kt-o-tien` (cao 52px, 20px đậm, hậu tố "đ", gõ ra dấu chấm); "Trả bằng" hai thẻ chọn `kt-cach` (Tiền mặt "Thủ quỹ chi và người nhận ký phiếu" / Chuyển khoản "Ủy nhiệm chi qua ngân hàng"); "Thêm chi tiết" nút `kt-them` liệt kê trường ẩn bằng `TheNho`; lỗi tại ô; chân "Đóng" + nút rust. PC-4 (theo đơn mua): dải số đơn + danh sách đợt `kt-dots` có `<Cum><span>Giao 28/09</span><TheNho>Hoá đơn 0004571</TheNho></Cum>` và "còn nợ"; đợt trả đủ mờ. PC-5: dải chỉ đọc số chốt × đơn giá. `LapPhieuChiGiaCongModal` bỏ import `nhan-su.css`/`luong.css` nếu không còn dùng lớp `ns-*`/`lg-*`.
- [ ] **Step 6: Lỗi ngày UTC** — `shared/constants.ts` `HOM_NAY` và `helpers.ts:1-3`: thay bằng `homNayVN()` gọi lúc dùng (không hằng tính một lần).
- [ ] **Step 7: Kiểm** — `npx tsc --noEmit`; `npx vitest run src/pages/ke-toan`; `git diff --stat`.

---

### Task 6: Màn Phiếu thu (PT-1 … PT-4)

**Files:**
- Modify: `frontend/src/pages/ke-toan/phieu-thu/PaymentReceiptsPage.tsx`, `components/ReceiptsTable.tsx`, `components/ReceiptsDrawer.tsx`, `modals/OtherReceiptDialog.tsx`, `PaymentReceiptDialog.tsx`, `modals/ReceiptConfirmModals.tsx`
- Create: `frontend/src/pages/ke-toan/phieu-thu/components/BoLocPhieuThu.tsx`

**Interfaces:** Consumes Task 1, Task 4. Đặc tả PT-1 … PT-4; bản xem `pt1, pt1loc, pt2, pt3`.

- [ ] **Step 1: Trang** — y khuôn Task 5 Step 1 với `useKyMan("ke-toan-phieu-thu")`, `api.accounting.receipts(..., sort: "-receipt_date")`, câu đầu trang "Sổ tiền vào. Thu cọc lập ở Đơn hàng bán, thu hoá đơn lập ở Công nợ phải thu.", nút "Lập phiếu thu" (mở `OtherReceiptDialog`). Thẻ lọc: Tất cả / Đã thu (`total` tiền `the_loc.xong_tien` + số phiếu + cùng kỳ) / Thiếu chứng từ ("chưa có báo có hoặc biên nhận") / Đã hủy; thẻ "Chờ thu" CHỈ hiện khi `the_loc.cho > 0`.
- [ ] **Step 2: `BoLocPhieuThu`** — Số tiền, Hình thức, Nguồn thu (`order_deposit` Cọc đơn bán, `sales_invoice` Thu hoá đơn, `other` Thu khác, `purchase_refund` Thu lại tiền đã chi), Vào tài khoản (`companyAccounts(..., "receive")`), Người nộp, Người lập, Chứng từ.
- [ ] **Step 3: Bảng** — Thu của | Số tiền (+ hình thức) | Trạng thái | Nguồn (loại + mã, link) | Ngày thu | Mã phiếu | ›. Link "Thu hoá đơn" mở `navigate("ke-toan-cong-no-phai-thu", …)` ngăn khách đó (sửa lỗi 11). Rỗng: "Chưa có phiếu thu nào. Thu cọc lập ở Đơn hàng bán, thu hoá đơn lập ở Công nợ phải thu; khoản thu khác lập ở đây." + nút.
- [ ] **Step 4: Ngăn** — `NganPhai` y Task 5 Step 4: tóm tắt Ngày thu | Hình thức | Nguồn | Người lập; Chi tiết = Thông tin phiếu (Nội dung, Người nộp + địa chỉ, Đơn bán link, Mã giao dịch, Ghi chú) + Dòng tiền + "Áp vào hoá đơn"; menu "⋯" Hủy phiếu có dòng hệ quả "Hoá đơn 0001234 sẽ quay lại còn nợ 76.000.000 đ"; phiếu cọc đã thu ⇒ mục mờ + "Phiếu cọc đã thu — hủy từ đơn bán" (sửa lỗi 3). Phiếu cũ chờ thu: nút chính "Xác nhận đã thu" mở khung tại chỗ. Lịch sử có `cancelled_by/at`.
- [ ] **Step 5: Form** — `OtherReceiptDialog`, `PaymentReceiptDialog` vỏ `NganPhai`, nhóm "THU CỦA AI VÀ BAO NHIÊU" / "NHẬN BẰNG" / "KHI NÀO", ô tiền to, thẻ chọn "Tiền mặt — Thủ quỹ nhận rồi in phiếu thu" / "Chuyển khoản". Sửa phiếu chuyển khoản điền sẵn Mã giao dịch (lỗi 4); ô tiền ngoại tệ nhận số lẻ (lỗi 5).
- [ ] **Step 6: Kiểm** — `npx tsc --noEmit`; `npx vitest run src/pages/ke-toan`.

---

### Task 7: Màn Công nợ phải trả (NPT-1 … NPT-3)

**Files:**
- Modify: `frontend/src/pages/ke-toan/cong-no-phai-tra/AccountingPayablesPage.tsx`, `components/PayablesDrawer.tsx`, `components/DotConNoBlock.tsx`, `components/DaTraBlock.tsx`, `components/BatchPaymentDialog.tsx`, `components/HangCuaDotModal.tsx` (thành khối gấp dưới dòng), `components/payablesCells.tsx`
- Create: `frontend/src/pages/ke-toan/cong-no-phai-tra/components/TongQuanCongNo.tsx` (dùng chung với Task 8 — đặt ở `pages/ke-toan/shared/TongQuanCongNo.tsx`), `components/BoLocCongNoTra.tsx`
- `pages/ke-toan/components/AgingStrip.tsx`: KHÔNG sửa (Báo cáo công nợ có thể dùng) — `TongQuanCongNo` tự vẽ thanh theo bản xem.

**Interfaces:**
- Consumes Task 2 (`LocCongNo`, `mua_trong_ky`, `han_gan_nhat`, detail theo kỳ), Task 4.
- Produces `TongQuanCongNo(props: { con: {nhan: string; so: number; cungKy?: number | null; xau?: boolean}[]; aging: AgingBucket[]; dangChon: string | null; onChon: (k: string | null) => void; denNgay: string })` — dùng lại ở Task 8.

- [ ] **Step 1: Trang** — `useKyMan("ke-toan-cong-no")`; `load()` gọi `payables(token, {tu_ngay, den_ngay, q, filter, aging: roTuoi, ...loc, page, size})` và (khi so sánh) gọi lần hai với kỳ cùng kỳ, `size: 1`. `TongQuanCongNo`: "Còn nợ tới {ngay(den)}" `total_due` (26px) — "Trong đó quá hạn" (đỏ; cùng kỳ tăng ⇒ `xau`) — "Mua thêm trong kỳ" — "Đã trả trong kỳ"; thanh 12px chia 6 mốc khe 3px, chú thích 6 ô; bấm = lọc + chip "Tuổi nợ: … ×". Bỏ `pay-kpibar` và `AgingStrip` khỏi trang này.
- [ ] **Step 2: Thanh lọc + bảng** — nhóm nút "Tất cả n | Quá hạn n | Vượt hạn mức n", ô tìm "Tìm nhà cung cấp, kể cả người đã trả hết" (350ms), `BoLocCongNoTra` (Còn nợ khoảng; Hạn trả `NhomNut`; Hạn mức `NhomNut`; Khác: checkbox "Hiện cả nhà cung cấp đã trả hết" ⇒ `ca_da_tra_het`), chip, "n nhà cung cấp". Bảng: Nhà cung cấp (tên + dòng phụ "5 khoản" + thẻ "Đã trả hết") | Còn nợ | Quá hạn (đỏ >0) | Hạn trả gần nhất (`ngay(han_gan_nhat)` + "còn 3 ngày"/"trễ 12 ngày" so với `den_ngay`) | Đã trả trong kỳ | Hạn mức (thanh mảnh + "Vượt 20.000.000 đ" đỏ). Giữ cơ chế bấm số Quá hạn → ngăn lọc sẵn quá hạn.
- [ ] **Step 3: Ngăn NPT-2** — `PayablesDrawer` → `NganPhai`: đường dẫn "Công nợ phải trả > Nhà cung cấp"; tiêu đề tên + pill đỏ "Vượt hạn mức"; nút phụ "Hồ sơ nhà cung cấp" (`navigate` tới màn NCC); tóm tắt Còn nợ | Quá hạn | Hạn mức (số + vạch, hoặc "Chưa đặt hạn mức") | Cho nợ "30 ngày sau mỗi đợt giao"; dải amber vượt hạn mức. Tabs `no` "Còn nợ (n)" (n = số đợt CÒN nợ — lỗi 7) / `tra` "Đã trả (n)". Tab Còn nợ: "Tất cả | Quá hạn" + câu dẫn "Tích các đợt muốn trả rồi bấm Trả ở thanh dưới."; nhóm theo đơn: đầu nhóm `<Cum>` link mã đơn + `TheNho` "Cọc 10.000.000" + "Đã trừ 6.000.000" + "Còn 4.000.000" + "còn nợ X" phải; bảng ☐ | Đợt | Ngày giao | Hoá đơn | Hạn trả (thẻ "Trễ 12 ngày") | Giá trị | Đã trả | Trừ cọc | Còn nợ; đợt "Cả đơn" ☐ mờ + title giải thích; bấm dòng mở khối "Hàng của đợt" GẤP ngay dưới (thay `HangCuaDotModal`). Bỏ nút "Lập phiếu chi" từng đơn. Có đợt được tích ⇒ `chan` tối `chanToi`: "Đã chọn 3 đợt **94.900.000 đ**" — "Bỏ chọn" — nút "Trả 3 đợt". Tab Đã trả: `NhomNut` "Trong kỳ | Tất cả" (Trong kỳ = kỳ của trang, truyền `ky` vào `payablesDetail`) + `<Cum><TheNho>12 lần trả</TheNho><span>Tổng 420.000.000 đ</span></Cum>`; bảng Ngày trả | Mã phiếu (link sang Phiếu chi `focusVoucherQuery`) | Đơn mua và đợt | Hoá đơn | Người lập | Số tiền; "Xem thêm" gọi máy chủ.
- [ ] **Step 4: NPT-3** — `BatchPaymentDialog` → `NganPhai tang={1}` (cùng 920px), đường dẫn "{NCC} > Trả 3 đợt", tiêu đề "Trả 3 đợt cùng lúc"; bảng nhỏ chỉ đọc; câu "Mỗi đợt ra một phiếu chi riêng, số tiền đúng bằng còn nợ của đợt."; nhóm "Trả bằng" như PC-3; chứng từ "Gắn vào cả 3 phiếu"; chân "Lập **3 phiếu chi** tổng **94.900.000 đ**" + "Lập 3 phiếu chi". Esc chỉ đóng lớp này (lỗi 6). Lập xong: thông báo "Đã lập 3 phiếu chi" + link, ngăn dưới nạp lại.
- [ ] **Step 5: Real-time** — truyền `eventTick` vào `PayablesDrawer`, `useEffect([eventTick])` gọi `reload()` (lỗi 8).
- [ ] **Step 6: Kiểm** — `npx tsc --noEmit`; `npx vitest run src/pages/ke-toan`.

---

### Task 8: Màn Công nợ phải thu (NPTh-1 … NPTh-3)

**Files:**
- Modify: `frontend/src/pages/ke-toan/cong-no-phai-thu/AccountingReceivablesPage.tsx`, `components/ReceivablesDrawer.tsx`, `components/InvoiceReceiptForm.tsx`, `cong-no-phai-thu-chuan.css` (chỉ xoá lớp không còn dùng)
- Create: `frontend/src/pages/ke-toan/cong-no-phai-thu/components/BoLocCongNoThu.tsx`

**Interfaces:** Consumes Task 2, Task 4, `TongQuanCongNo` (Task 7).

- [ ] **Step 1: Trang** — đối xứng Task 7 Step 1-2: `useKyMan("ke-toan-cong-no-phai-thu")`; số: "Còn nợ tới …" / "Trong đó quá hạn" / "Bán thêm trong kỳ" / "Đã thu trong kỳ"; bảng Khách hàng (dòng phụ "4 hoá đơn"; thẻ "Đã thu hết") | Còn nợ | Quá hạn | Hạn thu gần nhất | Đã thu trong kỳ | Hạn mức. Tải lỗi ⇒ dòng lỗi riêng, không "Chưa có khách hàng…".
- [ ] **Step 2: `BoLocCongNoThu`** — Còn nợ; Người phụ trách (danh sách sale: dùng API người dùng/nhân viên đang có mà màn Khách hàng dùng cho "lọc người phụ trách" — grep `phu_trach`/`sale_user_id` trong `pages/KhachHangPage.tsx` và `api/client.ts`; tái dùng đúng hàm đó); Hạn thu; Hạn mức; Nhãn khách hàng (danh mục nhãn — tái dùng API catalog nhãn mà màn Khách hàng dùng; đặc tả ghi "Nhóm khách hàng" nhưng DB không có cột nhóm, chỉ có nhãn `customer_tags` ⇒ ô tên "Nhãn khách hàng"); "Hiện cả khách đã thu hết".
- [ ] **Step 3: Ngăn NPTh-2** — `NganPhai`: tên khách + nút phụ "Hồ sơ khách hàng"; tóm tắt Còn nợ | Quá hạn | Hạn mức ("250.000.000 đ" + dòng "Còn được nợ 64.000.000" + vạch) | Cho nợ "30 ngày sau hoá đơn"; tabs "Hoá đơn còn nợ (n)" / "Đã thu (n)". Hoá đơn còn nợ: Hoá đơn (ký hiệu + số; dòng phụ `<Cum><span>21/07</span><TheNho>DH-0398</TheNho></Cum>` link đơn bán) | Hạn thu (thẻ "Trễ N ngày") | Giá trị | Trừ cọc | Đã thu | Còn nợ | nút phụ "Thu tiền". Mở từ danh sách đang lọc mốc tuổi ⇒ lọc sẵn theo `aging_bucket` từng hoá đơn. Đã thu: "Trong kỳ | Tất cả" + `<Cum><TheNho>9 lần thu</TheNho><span>Tổng …</span></Cum>`; Ngày thu | Mã phiếu | Áp vào (thẻ) | Hoá đơn và đơn | Hình thức | Số tiền.
- [ ] **Step 4: NPTh-3** — `InvoiceReceiptForm` bỏ `acct-modal`, thành khung NGAY DƯỚI dòng hoá đơn: tiêu đề "Thu hoá đơn 0001234" + `TheNho` "Còn phải thu 32.000.000 đ"; Số tiền (ô to, điền sẵn còn nợ, nút "Thu đủ"); Nhận bằng hai thẻ chọn (chuyển khoản: Vào tài khoản *, Mã giao dịch ngân hàng * — lỗi ghi đúng "Mã giao dịch"); Ngày thu * (min ngày hoá đơn, max hôm nay VN); "Thêm chi tiết" (Người nộp điền sẵn tên khách, Nội dung thu, Ghi chú — máy chủ đã nhận `note`); không có tài khoản VND ⇒ câu giải thích + link "Thêm tài khoản". Lập xong: dòng hoá đơn cập nhật ngay, thông báo đáy "Đã lập PT-… Xem phiếu".
- [ ] **Step 5: Kiểm** — `npx tsc --noEmit`; `npx vitest run src/pages/ke-toan`.

---

### Task 9: Màn Tài khoản ngân hàng (TK-1 … TK-4)

**Files:**
- Modify: `frontend/src/pages/ke-toan/tk-ngan-hang/AccountingBankAccountsPage.tsx`, `modals/BankAccountModal.tsx`
- Create: `frontend/src/pages/ke-toan/tk-ngan-hang/components/TheTaiKhoan.tsx`, `components/NganTaiKhoan.tsx`
- Delete-from-render: `components/BankAccountTable.tsx` (grep import; không ai dùng ⇒ xoá, nói trong báo cáo); code chết tab tài khoản NCC trong trang (lỗi 14)

**Interfaces:** Consumes Task 1 (`vouchers`/`receipts` với `tai_khoan_id` + kỳ), Task 3 (`thongKeTaiKhoan`), Task 4.

- [ ] **Step 1: Bỏ gọi thừa** — `load()` chỉ gọi `companyAccounts(token, false)` + `thongKeTaiKhoan(token, kyMan.ky)`; bỏ `supplierAccounts` và `api.suppliers.list` (lỗi 1: thủ quỹ 403).
- [ ] **Step 2: Trang** — đầu trang như bốn màn (bỏ eyebrow "KẾ TOÁN"); `ChonKy` (`useKyMan("ke-toan-tai-khoan-ngan-hang")`, KHÔNG có bộ lọc nâng cao); lưới thẻ `TheTaiKhoan` (vòng 40px chữ viết tắt ngân hàng, tên + chi nhánh, pill "Đang dùng", số tài khoản 20px cách nhóm 4 số + nút "Chép", chủ tài khoản, hai ô "Thu trong kỳ +…" xanh / "Chi trong kỳ −…", thẻ nhỏ "Nhận tiền", "Trả tiền", "VND"); thẻ cuối viền đứt "Thêm tài khoản" ("Nhập ngân hàng và số tài khoản"); tài khoản ngừng dùng gom cuối, nền `--paper`, pill xám. Trang nhận `eventTick` (sửa `AppShell.tsx` case `ke-toan-tai-khoan-ngan-hang` truyền `eventTick={tickCua("mua_ke_toan","ban_hang")}`).
- [ ] **Step 3: Ngăn TK-2** — `NganTaiKhoan` = `NganPhai`: tiêu đề số tài khoản + pill; "Sửa" + "⋯" (Ngừng dùng / Dùng lại); tóm tắt Thu trong kỳ | Chi trong kỳ | Số phiếu trong kỳ | Loại tiền; tabs Thông tin | Phiếu qua tài khoản (n) | Lịch sử (n). Phiếu qua tài khoản = gộp `vouchers({tai_khoan_id, tu_ngay, den_ngay, status:"paid", size: 20})` và `receipts({…, status:"received"})` sắp ngày giảm, "Xem thêm" tăng `page` từng nguồn. Lịch sử từ nhật ký (thêm/sửa/ngừng/dùng lại).
- [ ] **Step 4: TK-3, TK-4** — `BankAccountModal` vỏ `NganPhai` (920px), cột ô tối đa 560px: Ngân hàng *, Số tài khoản *, Chủ tài khoản *, Chi nhánh *, "DÙNG THẾ NÀO": Loại tiền `NhomNut` "VND | USD | Khác" (Khác ⇒ ô 3 chữ in hoa), Dùng để hai ô tích có dòng giải thích (bắt buộc ≥1), Ghi chú; bỏ ô "Đang hoạt động"; trùng số ⇒ lỗi dưới ô "Tài khoản này đã có trong danh sách."; Esc đóng. TK-4: hộp xác nhận một lần gọi `toggleCompanyAccount` (đã có trong client).
- [ ] **Step 5: Kiểm** — `npx tsc --noEmit`; `npx vitest run src/pages/ke-toan`.

---

### Task 10: Xác minh bằng luồng thật + dọn

**Files:** không sửa code trừ khi phát hiện lỗi (sửa ở đúng Task tương ứng rồi quay lại đây).

- [ ] **Step 1: Restart backend** (sửa route/schema): dừng uvicorn đang chạy, bật lại theo cách trong memory "Bật dev server qua WMI" (FE `localhost:5173`, BE `--host localhost`). `SEED_DEMO` giữ `false`.
- [ ] **Step 2: Chạy test đích** — `cd backend && python -m pytest tests/test_ke_toan_loc_ky_phieu.py tests/test_ke_toan_cong_no_theo_ky.py tests/test_ke_toan_tk_thong_ke.py tests/test_accounting_api.py tests/test_payables_api.py tests/test_sales_invoices_api.py tests/test_bao_cao_cong_no.py tests/test_phan_quyen_ke_toan_api.py -q`; `cd frontend && npx tsc --noEmit && npx vitest run src/pages/ke-toan src/utils src/pages/khachHangSo.test.ts src/pages/cssKhongCuop.test.ts`.
- [ ] **Step 3: Luồng thật trên trình duyệt dev** (đăng nhập admin/admin123), BẰNG CHUỘT/BÀN PHÍM, không curl dựng dữ liệu:
  1. Tài khoản ngân hàng: Thêm tài khoản (form 920px, kéo mép trái rộng ra, bấm đúp trả về) → thấy thẻ mới, "Chép" số.
  2. Phiếu chi: Lập phiếu chi (chuyển khoản, chọn tài khoản vừa tạo, số tiền 2.000.000) → ngăn chi tiết mở, cùng độ rộng đã kéo ở bước 1; tab Chứng từ tải 1 ảnh, xoá, Hoàn tác; tab Lịch sử thấy các việc. Đổi kỳ "Năm trước" → bảng rỗng câu "không khớp"; "Tháng này" → thấy phiếu; bỏ tích so sánh → dòng cùng kỳ biến mất. Bộ lọc: số tiền từ 5.000.000 → chân bảng "Khớp 0 phiếu", Xem → chip hiện, × bỏ chip.
  3. Phiếu thu: Lập phiếu thu khác tiền mặt → thẻ "Đã thu" tăng; Bộ lọc Hình thức Tiền mặt.
  4. Công nợ phải trả: tạo NCC + đơn mua + ghi đợt bằng màn Mua hàng (luồng UI thật), về Công nợ phải trả → thấy "Mua thêm trong kỳ"; mở ngăn, tích đợt → thanh tối, "Trả 1 đợt" → ngăn chồng cùng độ rộng, Esc chỉ đóng lớp trên; lập phiếu → ngăn dưới tự nạp.
  5. Công nợ phải thu: tạo đơn bán + hoá đơn qua màn Đơn hàng bán, về Công nợ phải thu → "Thu tiền" dưới dòng, "Thu đủ", lập → dòng cập nhật.
  6. Tài khoản ngân hàng: thẻ hiện "Chi trong kỳ −2.000.000"; ngăn → tab Phiếu qua tài khoản thấy phiếu bước 2.
  7. Điện thoại: thu khung 375px, mỗi màn bảng thành thẻ, bảng lọc một cột, không cuộn ngang trang.
  8. Soát chữ: không còn `·`, không mẩu dữ liệu nối bằng phẩy trên 5 màn.
  Ghi lại từng bước: bấm gì, gõ gì, thấy gì. Có chỗ buộc phải tắt qua API thì nói rõ ngay trong báo cáo.
- [ ] **Step 4: Rà diff** — `git diff --stat`; xác nhận không đụng `pages/tai-san/*`, `ToolbarChuan.tsx`, các lớp CSS dùng chung; không file hạ tầng (docker-compose, .env) lọt vào.
- [ ] **Step 5: Cập nhật tài liệu** — đặc tả: đánh dấu đã làm; `docs/UI_DESIGN.md` KHÔNG sửa §4 (Để ngỏ 7 chờ chủ). Không commit — báo chủ danh sách file để chủ quyết commit.
