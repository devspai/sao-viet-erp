# Sức chịu tải 200–500 người — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hệ thống chịu được 200–500 người dùng đồng thời (đầu ca chấm công, giữa ca bàn tổ, sau deploy) mà không đứng hình, không treo màn, không mất dữ liệu; tự co giãn theo CPU/RAM của VPS.

**Architecture:** Bốn lớp, sửa từ gốc ra ngọn:
1. **Hạ tầng tự co giãn.** Một script khởi động đo CPU/RAM rồi chọn số worker uvicorn, pool DB và cấu hình Postgres. Migrate/seed chạy MỘT lần trước khi bật worker. Có sao lưu tự động, xoay vòng log, healthcheck.
2. **Backend không chặn.** Không còn việc đồng bộ trên event loop. Middleware ASGI thuần có cổng giới hạn số request đồng thời (hết chỗ thì xếp hàng rồi trả 503, không kẹt pool). Thông báo gửi theo quyền/tổ thay vì broadcast. Chống ghi trùng ở chấm công, mẻ sản lượng, yêu cầu kho. Có index và sửa N+1 ở các đường nóng.
3. **Frontend bền.** `fetch` có timeout và tự thử lại GET. Token xoay không kéo theo nạp lại toàn app. Tick sự kiện theo nhóm, gộp nhịp, và hoãn khi tab ẩn. SSE nối lại có jitter. Không màn nào kẹt "Đang tải…" vĩnh viễn. Tách bundle theo màn. Nén ảnh ở mọi chỗ tải lên.
4. **Đo tải.** Có script giả lập N người chạy trên bộ Docker giống prod ở máy dev, đo trước và sau.

**Tech Stack:** FastAPI 0.115 / SQLAlchemy sync / Postgres 16 / Redis 7 / MinIO · React 18 + Vite 5 · docker compose · nginx 1.27 · Caddy 2.

**Spec:** `docs/audit-suc-chiu-tai-2026-09-28.md` (mã A1…A7, B, C trong plan trỏ về tài liệu này).

## Global Constraints

- Không Alembic: đổi cột hoặc thêm index phải viết vào `backend/app/db_migrations.py`; thêm cột thì cập nhật `docs/DB_SCHEMA.md` cùng lúc.
- Cột Boolean: `server_default` phải là `false`/`true`, không dùng `"0"`/`"1"`.
- Dev DB là Postgres thật (`svn_erp_trong`). KHÔNG chạy `python -c` trần trong `backend/`. Muốn thăm dò thì viết test tạm.
- Verify backend: `pytest` nhắm đúng file test (từ `backend/`). KHÔNG chạy `./init.ps1`. KHÔNG chạy pytest full.
- Verify frontend: `npx tsc --noEmit` và `npx vitest run <file>` (từ `frontend/`).
- Sửa luồng nghiệp vụ có UI (chấm công, bàn tổ, upload…) thì phải thao tác lại luồng đó bằng chuột/phím thật trên browser trước khi báo xong.
- UI tiếng Việt, không để lộ tiếng Anh. Tên người lấy từ tài khoản ở server.
- Tiền chỉ gửi cho người có quyền xem: payload SSE không mang số tiền tới người không có quyền.
- KHÔNG đụng các file đang có thay đổi của phiên khác: `frontend/src/constants/features.ts`, `ThsxDanhSach.tsx`, `ThsxExecPanels.tsx`, `thsxShared.tsx`, `thuc-hien-sx.css`.
- Commit message tiếng Việt, không `Co-Authored-By`. CHỈ commit khi user bảo.
- Mọi ngưỡng tự co giãn phải ghi đè được bằng biến môi trường. Mặc định tự tính theo máy.

---

## Task 1: Đo tải nền (baseline) — script giả lập + bộ Docker giống prod

**Files:**
- Create: `scripts/do-tai/do_tai.py` — asyncio + httpx: N người dùng ảo, mỗi người đăng nhập → `/api/auth/permissions` → chùm badge giống AppShell → mở SSE giữ kết nối → tuỳ kịch bản: `chamcong` (status → check → status/logs), `bando` (teams/work-items lặp mỗi 3–8s), `reconnect` (đóng/mở SSE đồng loạt). In p50/p95/p99, tỉ lệ lỗi, số 5xx, số request treo quá 10s.
- Create: `scripts/do-tai/tao_du_lieu.py` — tạo N tài khoản `tai_NNN` + hồ sơ nhân viên + 1 điểm chấm công bán kính lớn. CHỈ chạy vào DB của stack đo tải (kiểm `DATABASE_URL` chứa `svn_tai`, sai thì dừng).
- Create: `scripts/do-tai/README.md` — cách dựng stack đo tải: `.env.tai` (COMPOSE_PROJECT_NAME=erp-svn-tai, cổng lệch, SEED_DEMO=false), lệnh chạy.

- [ ] Step 1: viết `tao_du_lieu.py`, gọi service/repo có sẵn (UserRepository, EmployeeRepository, AttendanceRepository), không raw SQL.
- [ ] Step 2: viết `do_tai.py`. Tham số: `--base`, `--users`, `--kich-ban`, `--thoi-gian`.
- [ ] Step 3: dựng stack `erp-svn-tai` từ code HIỆN TẠI, chạy 3 kịch bản ở 100/200/400 người, lưu kết quả vào `scripts/do-tai/ket-qua/truoc.md`.

## Task 2: Backend thôi chặn event loop (A2)

**Files:** `backend/app/routers/quotations.py:390-450`, `routers/noi_quy.py:96`, `routers/profile.py:44`, `routers/orders.py:335`, `routers/purchases.py:410`. Test: `backend/tests/test_khong_chan_event_loop.py`.

- `quote_events`: `user_id = await run_in_threadpool(_authenticate_sse, token)`. Stream giữ nguyên.
- 4 route upload đổi `async def` → `def`, `await file.read()` → `file.file.read()` qua helper chung ở Task 6. Nội dung khác giữ nguyên.
- Test: bằng AST, quét mọi `async def` trong `app/routers`. Chỉ cho phép `quote_events` (và hàm `stream` con của nó). Router async mới phải được thêm có chủ đích vào danh sách cho phép, kèm lý do.

## Task 3: DB engine co giãn + middleware ASGI thuần có cổng đồng thời (A2)

**Files:** Create `backend/app/tai_nguyen.py` (đo CPU/RAM/cgroup, tính mặc định). Modify `backend/app/db.py`, `backend/app/main.py:148-163`, `backend/app/config.py`. Create `backend/app/cong_dong_thoi.py`. Test: `backend/tests/test_cong_dong_thoi.py`, `test_tai_nguyen.py`.

**Interfaces (Produces):**
- `tai_nguyen.so_cpu() -> int`: lấy từ cgroup quota nếu có, không thì `os.sched_getaffinity`/`os.cpu_count`.
- `tai_nguyen.ram_mb() -> int`: cgroup `memory.max`, không thì `/proc/meminfo`, không đọc được thì 2048.
- `tai_nguyen.cau_hinh_pool(workers:int) -> dict(pool_size, max_overflow, pool_timeout)`: tổng ≤ `PG_MAX_CONNECTIONS` (mặc định 200) trừ 20 chỗ dự phòng, chia đều cho worker, trần 30/worker.
- `config.Settings`: `db_pool_size: int = 0` (0 = tự tính), `db_max_overflow: int = -1`, `db_pool_timeout: int = 10`, `db_statement_timeout_ms: int = 120_000`, `web_concurrency: int = 0`, `max_request_dong_thoi: int = 0` (0 = pool_size + max_overflow − 2), `cho_hang_doi_giay: int = 30`.
- `db._make_engine`: Postgres dùng `pool_pre_ping=True`, `pool_recycle=1800`, pool theo `cau_hinh_pool`, `connect_args={"options": "-c statement_timeout=…"}`. SQLite giữ nguyên.
- `cong_dong_thoi.CongDongThoi(app)`: middleware ASGI thuần.
  - (1) Đặt `audit_context` IP/UA như middleware cũ.
  - (2) Request HTTP, trừ `/api/quotations/events` và `/api/health`, phải lấy một `asyncio.Semaphore(max_request_dong_thoi)` trước khi vào app. Chờ quá `cho_hang_doi_giay` thì trả `503` JSON `{"detail": "Máy chủ đang bận, vui lòng thử lại sau giây lát."}` kèm `Retry-After: 2`.
  - Lý do: số request đang chạy không bao giờ vượt số kết nối DB, nên không còn vòng chờ thread↔connection.
- Bỏ `@app.middleware("http")`, thay bằng `app.add_middleware(CongDongThoi)`.

Test:
- (a) Semaphore đầy thì request thứ N+1 chờ; hết chờ thì nhận 503 JSON tiếng Việt.
- (b) SSE không bị tính vào cổng.
- (c) `audit_context` vẫn nhận IP từ `X-Forwarded-For`, test sẵn có `test_audit_*` vẫn xanh.
- (d) `cau_hinh_pool` chia đúng ngân sách kết nối.

## Task 4: Khởi động nhiều worker an toàn + ticker một nơi + health thật (A6)

**Files:** Create `backend/app/serve.py`. Modify `backend/Dockerfile` CMD, `backend/app/main.py` lifespan + `/api/health`, `care_reminders.py`, `bao_tri_reminders.py`, `locks.py`, `repositories/audit_repo.py` (tiết chế `nhat_ky_moi`), `migrate.py` (lock_timeout). Test: `backend/tests/test_serve_va_ticker.py`.

**Interfaces:**
- `serve.main()` chạy lần lượt:
  - (1) `migrate.main()` (create_all + migration, có `SET lock_timeout='15s'` trên Postgres);
  - (2) `seed_all` + `dong_bo_danh_muc_he_thong` + `ensure_storage_ready` MỘT lần;
  - (3) đặt env `SVN_SCHEMA_DA_SAN=1`;
  - (4) `uvicorn.run("app.main:app", workers=W, host, port, timeout_graceful_shutdown=5, proxy_headers=True, forwarded_allow_ips="*")`. `W = WEB_CONCURRENCY` nếu > 0; không thì `max(2, min(so_cpu()*2, ram_mb()//350, 8))`. In ra cấu hình đã chọn.
- Lifespan: `SVN_SCHEMA_DA_SAN=1` thì bỏ `init_db`/`run_migrations`/`seed_all`/`ensure_storage_ready`. Dev/test chạy thẳng uvicorn thì giữ hành vi cũ.
- `locks.chay_mot_noi(ten: str, ttl_ms: int) -> bool`: dùng Redis `SET NX PX` để giành quyền dẫn cho ticker, lần sau gia hạn nếu giá trị là của mình. Không có Redis thì luôn True. Client redis có `socket_timeout=2`, `socket_connect_timeout=2`.
- Hai ticker: đầu mỗi vòng gọi `chay_mot_noi("ticker:care", ...)` / `("ticker:bao_tri", ...)`, không giành được thì bỏ lượt.
- `nhat_ky_moi`: tiết chế 3s qua Redis `SET NX PX 3000`, không có Redis thì dùng biến trong tiến trình như cũ.
- `/api/health`: `async def`. Chạy `SELECT 1` qua `run_in_threadpool` với timeout 3s, trả `{"status":"ok","db":"ok"}`; hỏng thì 503.
- Dockerfile: `CMD ["python", "-m", "app.serve"]`.

## Task 5: Hạ tầng compose/nginx/Postgres tự co giãn + log + sao lưu (A1, A6)

**Files:**
- Modify `docker-compose.yml`:
  - Neo `x-logging` (json-file, max-size 20m, max-file 5) cho mọi service.
  - Backend: healthcheck (`python -c urllib …/api/health`), `stop_grace_period: 15s`, env `WEB_CONCURRENCY`, `PG_MAX_CONNECTIONS`.
  - db: `shm_size: 256mb`, entrypoint qua `deploy/postgres/tu-chinh.sh`.
  - minio: gắn tag cố định.
  - Service `backup` (profile `backup`).
- Create `deploy/postgres/tu-chinh.sh`: đọc RAM cgroup, tính `shared_buffers`=25%, `effective_cache_size`=65%, `work_mem`, `maintenance_work_mem`, `max_connections=${PG_MAX_CONNECTIONS:-200}`, `log_min_duration_statement=${PG_LOG_CHAM_MS:-1000}`, rồi `exec docker-entrypoint.sh postgres -c …`.
- Create `deploy/backup/Dockerfile` (FROM postgres:16-alpine + rclone), `deploy/backup/sao-luu.sh`:
  - vòng lặp mỗi ngày lúc `BACKUP_GIO` (mặc định 02:00 giờ VN) chạy `pg_dump -Fc` vào `/backups/pg`, giữ `BACKUP_GIU_NGAY` (14) ngày;
  - `rclone sync` bucket MinIO sang `/backups/minio`, bản bị xoá/ghi đè chuyển vào `/backups/minio-cu/<ngày>`;
  - có `BACKUP_RCLONE_DICH` thì `rclone copy /backups` lên đích ngoài VPS;
  - ghi `/backups/lan-cuoi.txt`;
  - chạy `sao-luu.sh ngay` thì chạy một lần rồi thoát.
- Create `deploy/backup/khoi-phuc.md`: các bước khôi phục đã diễn tập.
- Modify `frontend/Dockerfile` + create `frontend/nginx-main.conf`: `worker_processes auto`, `worker_connections 4096`, `worker_rlimit_nofile 8192`.
- Modify `frontend/nginx.conf`:
  - `resolver 127.0.0.11 valid=10s`, `set $be http://backend:8000;`, `proxy_pass $be;`;
  - `proxy_connect_timeout 5s`;
  - `error_page 502 503 504 = @api_loi` trả JSON `{"detail":"Máy chủ đang khởi động lại hoặc quá tải, vui lòng thử lại."}` với status 503 cho `/api/`.
- Modify `Caddyfile`: `lb_try_duration 20s` + `lb_try_interval 500ms` cho `reverse_proxy web:80`.
- Modify `.github/workflows/deploy.yml`:
  - `concurrency: deploy-vps` dùng chung cho mọi nhánh (một VPS);
  - thay `docker image prune -f` bằng prune có `--filter label=com.docker.compose.project=$COMPOSE_PROJECT_NAME`;
  - health đi qua đường thật `web` (`docker compose exec web wget -qO- http://localhost/api/health`).
- Modify `docs/DEPLOY.md`: bỏ lệnh sai; thêm phần sao lưu/khôi phục/tự co giãn.

Verify: `docker compose --env-file .env.tai config` hợp lệ; dựng stack đo tải lên; `docker compose exec backup sao-luu.sh ngay` ra file dump; khôi phục thử vào DB tạm.

## Task 6: Tải tệp an toàn (A2, B)

**Files:** Create `backend/app/tai_len.py`. Modify `storage.py`, `routers/files.py`, `routers/public_scan.py`, các router upload (danh sách ở audit mục 1: profile, orders, noi_quy, purchases×2, accounting×2, delivery, kho_voucher, ky_thuat_may, san_xuat KCS, quotations×2, vat_lieu_kho, lsx, customers, employees, import Excel customers/employees/catalog_base), `services/employee_service.py:1120`, `services/customer_service.py:647`. Test: `backend/tests/test_tai_len_an_toan.py`.

**Interfaces:**
- `tai_len.doc_gioi_han(f: UploadFile, max_bytes: int, *, ten: str = "Tệp") -> bytes`: đọc theo khối 1MB, vượt trần thì `HTTPException(413, f"{ten} vượt quá {max_mb} MB.")` ngay, không đọc tiếp. Rỗng thì 422.
- `tai_len.kiem_anh(data: bytes, content_type) -> str`: nhận jpeg/png/webp/gif/heic; chặn SVG.
- `tai_len.TRAN_EXCEL = 10MB`, `TRAN_TAI_LIEU = 20MB`.
- `storage.S3Storage._client`: `Config(connect_timeout=5, read_timeout=30, retries={"max_attempts": 2, "mode": "standard"}, max_pool_connections=64)`. `delete` nuốt mọi `Exception` (log warning). `open_stream` trả iterator có `close()`, và `files.py` bọc `StreamingResponse(..., background=BackgroundTask(stream.close))`.
- `files.py`: `Cache-Control: private, max-age=31536000, immutable`, `ETag` = key, trả 304 khi `If-None-Match` khớp, thêm `X-Content-Type-Options: nosniff`. Tệp không phải ảnh/PDF thì `Content-Disposition: attachment`.
- `public_scan.py`: thêm `nosniff`, SVG trả `attachment`.
- `vat_lieu_kho.py:256`: bỏ nhận `image/svg+xml`.
- Xoá đính kèm Khách hàng/Nhân sự thì xoá luôn object (sau commit, `get_storage().delete(key)`).
- Import Excel customers/employees: `load_workbook(..., read_only=True, data_only=True)`.

## Task 7: Thông báo gửi theo đối tượng thay vì broadcast (A3)

**Files:** Modify `backend/app/realtime.py`. Create `backend/app/doi_tuong_nhan.py`. Modify các nơi gọi `hub.broadcast` (65 chỗ + helper `_notify_accounting_changed`, `_notify_purchase_changed`, `phat_ban_giao`, `phat_dong_nhom`, `_phat_sse` san_xuat). Test: `backend/tests/test_thong_bao_theo_doi_tuong.py`.

**Interfaces:**
- `doi_tuong_nhan.nguoi_co_quyen(module_keys: Iterable[str], hanh_dong: str = "read") -> set[int]`: user active có role với `RolePermission.module_key ∈ module_keys` và cờ hành động bật. Cache trong tiến trình 30s theo khoá `(frozenset(module_keys), hanh_dong)`, xoá cache khi có `quyen_doi`. Tự mở `SessionLocal` ngắn.
- `doi_tuong_nhan.nguoi_cua_to(team_ids: Iterable[int]) -> set[int]`: user có dòng quyền tổ `to_sx_<id>` đọc được, cộng user có `san_xuat` read. Dùng lại `services/quyen_to.py`.
- `hub.gui(event: dict, *, quyen: Iterable[str] | None = None, to: Iterable[int] | None = None, nguoi: Iterable[int] | None = None)`: hợp các tập rồi `publish` cho từng user. Việc resolve chạy trong threadpool nếu đang ở loop. Không truyền gì thì broadcast (giữ cho `quyen_doi`… nhưng không nơi nào nên dùng).
- Bảng chuyển đổi (từ audit realtime mục 1):
  - `nhat_ky_moi` → quyen `nhat_ky`.
  - accounting/sales_invoice/payment_voucher → quyen `ke_toan`, `phieu_chi`, `phieu_thu`, `thu_mua` (theo đúng màn nghe).
  - purchase_* → quyen `thu_mua`, `ke_toan`, cộng `recipient_user_id`.
  - gia_cong_cho_chi* → quyen `phieu_chi`; gia_cong_ngoai_changed → quyen `san_xuat`.
  - advance_pending → quyen `luong`.
  - adjust/el pending → quyen `cham_cong`.
  - leave → `nghi_phep`; ot → `tang_ca`; quote_pending → `bao_gia`; order_pending/ordered/sx_hint → `don_hang_ban`, `san_xuat`.
  - order_deposit_needed: BỎ (không component nào mount).
  - lsx/xep_lich/bai_ghep → `san_xuat`, `xep_lich`, `bai_ghep_2`, `lenh_san_xuat`, `theo_doi_san_xuat`.
  - san_xuat_changed, san_xuat_vat_tu_nhan: BỎ (không ai nghe).
  - san_xuat_cong_viec/kcs/ban_giao/ho_tro/vat_tu_de_nghi → `to=team_ids` + quyen `san_xuat`, `kcs_theo_lenh`, `theo_doi_san_xuat`.
  - san_xuat_nhom_dong → quyen `san_xuat`, `don_hang_ban`.
  - giao_hang_changed → quyen `giao_hang`, `don_hang_ban`.
  - ke_hoach_vat_tu_thay_doi → `ke_hoach_vat_tu`.
  - lsx_dinh_kem → `san_xuat` + to.
  - Tên module chính xác lấy từ `MODULES` trong seed/rbac lúc làm (grep `module_key=`).
- Payload `order_deposit_needed` (số tiền) biến mất theo; các payload khác không mang tiền.
- Test: `hub.gui(quyen=["nghi_phep"])` chỉ tới user có quyền; user không quyền không nhận; `to=[t]` tới đúng người của tổ.

## Task 8: Chấm công không ghi sai + nhẹ (A5)

**Files:** Modify `backend/app/services/attendance_service.py` (check, my_status, _ot_window_on), `repositories/attendance_repo.py`, `routers/attendance.py:480-489`, `db_migrations.py` (index ghép), `frontend/src/pages/nhan-su-luong/cham-cong/tabs/MyCheckInTab.tsx`. Test: `backend/tests/test_cham_cong_chong_trung.py`.

**Hành vi:**
- `check()`: khoá dòng `employees` của người đó (`SELECT … FOR UPDATE`, SQLite bỏ qua) trước khi đọc lượt cuối. Lượt cuối cùng loại (VÀO/RA), trong vòng `CHONG_TRUNG_GIAY = 90` và đã trong vùng thì trả lại chính lượt đó với `message` "Đã ghi nhận chấm {VÀO/RA} lúc HH:MM", không tạo lượt mới.
- `/me/logs` thôi gọi `my_status` chỉ để lấy tên.
- `_ot_window_on`: lọc phiếu tăng ca theo `employee_id` ở SQL, thôi nạp cả công ty. Có memo theo `(emp_id, ngày)` trong một request.
- Index: `CREATE INDEX IF NOT EXISTS ix_attendance_logs_emp_checked ON attendance_logs (employee_id, checked_at DESC)`.
- FE MyCheckInTab:
  - `myStatus` lỗi thì hiện banner lỗi + nút "Thử lại", không trả `status=null` vĩnh viễn;
  - `doCheck` lỗi mạng thì `load()` lại trạng thái (biết lượt trước đã ghi chưa);
  - nút có `checking` chặn bấm đúp, request có timeout (Task 10).
- Test:
  - (a) hai lượt check liền nhau cùng vị trí → 1 log;
  - (b) lượt VÀO rồi lượt thứ hai trong 90s → vẫn 1 log VÀO, không đổi thành RA;
  - (c) sau 90s → lượt RA bình thường.

## Task 9: Chống ghi trùng mẻ sản lượng / yêu cầu kho / lỗi KCS + mã chứng từ (B)

**Files:** `services/san_xuat/san_luong.py:178-285`, `schemas` SxBatchIn, `services/stock_request_service.py` (tạo), KCS ghi lỗi (`services/san_xuat/kcs.py`), `routers/phieu_tinh_gia.py:89-96`, `repositories/stock_lot_repo.py:80-90`, `repositories/ky_thuat_may_repo.py:600-626`, `db_migrations.py`, `docs/DB_SCHEMA.md`, FE các nơi gọi `taoBatch`, tạo yêu cầu kho, ghi lỗi KCS. Test: `backend/tests/test_chong_ghi_trung.py`.

- Thêm cột `client_ref VARCHAR(40) NULL` + unique index partial `WHERE client_ref IS NOT NULL` cho: `san_xuat_me` (bảng mẻ; tên thật tra model), `stock_requests`, bảng lỗi KCS. Server gặp `client_ref` đã tồn tại cho cùng người tạo thì trả bản ghi cũ (200), không tạo mới.
- FE sinh `crypto.randomUUID()` MỘT lần mỗi lần mở form/bấm (giữ qua các lần thử lại của cùng thao tác).
- Mã PTG, mã lô, mã YC báo hỏng: chuyển sang `document_sequences` (`repositories/document_sequence_repo.py`), khởi tạo từ `max` hiện có.

## Task 10: Frontend — tầng request bền (A4)

**Files:** `frontend/src/api/client.ts:75-264`, `frontend/src/auth/AuthContext.tsx`, `frontend/src/main.tsx`, create `frontend/src/components/BienLoiGoc.tsx`. Test: `frontend/src/api/client.test.ts`.

**Interfaces:**
- `request()`:
  - `AbortController` với timeout: GET 20s, ghi 60s, FormData 180s. Ghi đè được bằng `init.timeoutMs`.
  - Hết giờ thì `ApiError("Máy chủ phản hồi quá lâu, vui lòng thử lại.", 0)`.
  - GET gặp lỗi mạng/502/503/504 thì thử lại tối đa 2 lần, chờ 500ms·2^n + jitter 0–300ms (tôn trọng `Retry-After`).
  - Phản hồi 2xx không phải JSON thì `ApiError("Máy chủ trả dữ liệu không hợp lệ (có thể mạng Wi-Fi đang chặn).", 0)`.
  - Thông điệp lỗi mặc định tiếng Việt: 0 → "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."; 5xx → "Máy chủ đang bận hoặc khởi động lại, vui lòng thử lại."; 413 → "Tệp quá lớn.".
- Token không làm nạp lại toàn app:
  - biến module `tokenMoiNhat: string | null`, đặt khi login/refresh/khôi phục phiên;
  - `authed(path, token)` dùng `tokenMoiNhat ?? token`;
  - `registerAuthCallbacks.onAccessToken` vẫn được gọi, nhưng AuthContext KHÔNG `setToken` khi refresh ngầm (token React giữ nguyên danh tính, 68 effect `[token]` thôi chạy lại);
  - logout/hết phiên thì xoá `tokenMoiNhat`;
  - export `layTokenMoiNhat()` cho SSE.
- `refreshSession`: `api.refresh()` có timeout 15s (Web Lock không bị giữ mãi).
- `onSessionEnded`: đặt `notice` "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.".
- `BienLoiGoc`: ErrorBoundary bọc `<App/>` ở `main.tsx`. Hiện "Có lỗi hiển thị" + nút "Tải lại trang". Lỗi nạp chunk (`Failed to fetch dynamically imported module`) thì tự `location.reload()` một lần (cờ trong sessionStorage).

## Task 11: Frontend — sự kiện theo nhóm, gộp nhịp, tab ẩn, SSE jitter (A3)

**Files:** `frontend/src/components/AppShell.tsx:176-1260, 1370-1630`, create `frontend/src/lib/suKienNhom.ts`, `frontend/src/api/client.ts:2856-2920`, `frontend/src/pages/DonHangBanPage.tsx:455`, `frontend/src/pages/giao-hang/tien-do-don/TienDoDon.tsx:44`. Test: `frontend/src/lib/suKienNhom.test.ts`.

**Interfaces:**
- `suKienNhom.ts`:
  - `type NhomSuKien = "ban_hang" | "mua_ke_toan" | "nhan_su" | "san_xuat" | "kho" | "giao_hang" | "ky_thuat" | "khvt"`;
  - `nhomCua(type: string): NhomSuKien[]`: loại lạ trả mọi nhóm.
- AppShell:
  - `tick: Record<NhomSuKien, number>` thay `quoteTick`;
  - mỗi màn nhận `eventTick={tickCua(["san_xuat"])}` (tổng các nhóm màn quan tâm);
  - gộp nhịp: sự kiện đánh dấu nhóm "bẩn", 400ms sau mới bump một lần;
  - tab ẩn (`document.hidden`) thì chỉ đánh dấu, `visibilitychange` → hiện thì bump các nhóm bẩn + `reloadBadges()` một lần;
  - toast vẫn hiện ngay.
- Các lượt nạp badge theo sự kiện dùng `hoanNap(key, fn, 800ms)`: gộp nhiều sự kiện cùng loại trong 800ms thành một lượt gọi.
- `connectQuoteEvents(token, onEvent, opts?: { onMo?: () => void })`:
  - chờ nối lại `min(30s, 1s·2^n) + random(0..1s)`, reset khi nối được;
  - nhánh 401 cũng chờ;
  - dùng `layTokenMoiNhat()`;
  - `onMo` gọi mỗi lần nối lại thành công (không gọi lần đầu), AppShell dùng để `reloadBadges()` + bump mọi nhóm (bù sự kiện rơi lúc đứt).
- DonHangBanPage/TienDoDon: bỏ `connectQuoteEvents` riêng, nhận `eventTick` từ AppShell (prop đã có đường truyền `DonHangBanPage`).

## Task 12: Frontend — không màn nào kẹt "Đang tải…" (A4)

**Files:** `AppShell.tsx:1273` (lỗi quyền lần đầu → màn lỗi + Thử lại), `pages/nhan-su-luong/luong/tabs/PhieuLuongTab.tsx:53-65`, `pages/nhan-su-luong/ho-so-cua-toi/HoSoCuaToiPage.tsx:121,250,289`, `pages/nhan-su-luong/luong/tabs/TamUngCuaToiTab.tsx:30-70`, `pages/nhan-su-luong/phong-ban/DepartmentsPage.tsx:631-661`, `pages/ThucHienSxPage.tsx:432-467` (mutate nhả busy khi `run()` xong, không chờ `loadChiTiet`; loadItems/loadChiTiet có số thứ tự lượt), `pages/nhan-su-luong/nghi-phep/tabs/ApproveTab.tsx:88` (busy + try/catch).

Quy tắc chung:
- phân biệt 3 trạng thái `dang_tai | loi | co_du_lieu`;
- lỗi thì dùng `EmptyState` sẵn có với `onRetry`;
- KHÔNG biến lỗi mạng thành "chưa có hồ sơ".

## Task 13: Frontend — tách bundle + nén ảnh mọi nơi (B)

**Files:** `AppShell.tsx` (46 import trang → `React.lazy` + `Suspense` với fallback "Đang tải màn…"), `frontend/vite.config.ts` (`build.chunkSizeWarningLimit`, không manualChunks thủ công), `frontend/src/lib/anhNen.ts` (thêm `nenNeuLaAnh(file, {canhDai=2048, chatLuong=0.82, nguongBytes=1.5MB})`), `frontend/src/api/client.ts` (mọi body FormData: nén ảnh trước khi gửi, trừ khi gọi với `giuNguyenAnh: true`).
- Ảnh HEIC nén hỏng thì gửi nguyên bản như cũ.
- Đo: kích thước chunk đầu (main) trước/sau.

## Task 14: Truy vấn nóng — N+1, index, cache phân quyền, can-doi (B, A7)

**Files:**
- `routers/kho_request.py:179`: dùng `don_vi_nhieu_mat_hang` gom lô.
- `services/order_service.py:599-619`: truyền agg gom lô vào `_money`.
- `routers/customers.py:574`, `customer_repo.py:563`: thêm `/api/customers/care-followups/count` trả số, FE AppShell dùng số.
- `lsx_service.py:1177`: `hang-cho?chi_dem=1` trả `total` không nạp trang.
- `services/rbac_service.py`: memo `can()` trong đời một service instance.
- `services/quyen_to.py`: `quyen_to_cua` memo theo request.
- `routers/module_notifications.py`: kiểm quyền TRƯỚC khi đếm.
- `ke_hoach_vat_tu_service.can_doi`: cache kết quả toàn xưởng 45s (Redis nếu có, không thì trong tiến trình), khoá theo tham số; xoá khi có `ke_hoach_vat_tu_thay_doi`/`lsx_changed` (gọi ở đúng chỗ phát). FE `VatTuKeHoachView.tsx:127-136` chặn lượt chồng + gộp 1s.
- `services/refresh_service.py:60-66`: `purge_expired` thôi chạy mỗi lượt login; chuyển vào ticker (một nơi) mỗi giờ.
- Rate limit đăng nhập (Redis đếm theo username và theo IP): 10 lần sai / 15 phút thì 429 "Đăng nhập sai quá nhiều lần, thử lại sau N phút." Không có Redis thì bỏ qua.
- `db_migrations.py`: một migration index (CREATE INDEX IF NOT EXISTS; Postgres dùng CONCURRENTLY ngoài transaction nếu cơ chế migration cho phép, không thì thường):
  - partial `(department_id) WHERE trang_thai <> 'completed'` trên `san_xuat_cong_viec`;
  - index trạng thái cho `san_xuat_goi_phat_hanh`, `san_xuat_nhom`, `san_xuat_ban_giao`, `san_xuat_ho_tro`;
  - `san_xuat_kcs_loi(phan_hoi_luc)`;
  - `refresh_tokens(expires_at)`;
  - `module_notifications(channel, id)`;
  - `customer_care_tasks(due_date)`;
  - các index model khai mà DB thiếu: `stock_requests.kho_id`, `purchase_delivery_id`, `kho_nguon_id`, `xuat_voucher_id`, `lsx_cong_doan.khuon_be_id`, `stock_vouchers.nguoi_ghi_so_id`.
  - Tên bảng/cột thật tra model trước khi viết.

## Task 15: Màn nạp toàn lịch sử (A7)

**Files:** `services/lenh_sx/danh_sach.py:467-629`, `services/lenh_sx/bang_theo_doi.py:270-284, 791-807`, `repositories/xep_lich_lenh_repo.py:44-64`, `services/san_xuat/board.py:477-484`.
- Nguyên tắc: lọc "còn sống" ở SQL trước khi nạp ngữ cảnh, tức lệnh chưa xong HOẶC xong trong cửa sổ đang xem.
- Phải đọc định nghĩa "xong" hiện có (`pham_vi.py:40-49`) trước. Không đổi kết quả hiển thị với dữ liệu hiện tại: test so khớp danh sách trước/sau trên fixture có cả lệnh cũ đã xong.

## Task 16: Đo tải sau khi sửa + báo cáo

- Dựng lại stack `erp-svn-tai` với code mới, chạy 3 kịch bản như Task 1. Ghi `scripts/do-tai/ket-qua/sau.md` và bảng so sánh.
- Kiểm tay trên browser: chấm công (vào/ra, rớt mạng giả bằng offline DevTools), bàn tổ, upload ảnh, tải ảnh, deploy giả (restart backend) trong lúc đang mở app.
- Cập nhật `docs/audit-suc-chiu-tai-2026-09-28.md`: mục nào đã xử lý, mục nào còn.

---

## Self-review

- Spec coverage:
  - A1 → T5; A2 → T2, T3, T4, T6; A3 → T7, T11, T14; A4 → T10, T12; A5 → T8; A6 → T4, T5; A7 → T15.
  - B: upload → T6, T13; ghi trùng/mã → T9; N+1/index/can_doi/login → T14; bundle → T13; nginx IP → T5.
  - C: middleware → T3; queue drop/resync → T11; Excel read_only → T6; purge_expired → T14.
  - Chưa làm (cần quyết định ngoài code): tách staging sang máy khác, dịch vụ theo dõi uptime bên ngoài, đích sao lưu ngoài VPS. Code đã sẵn biến môi trường cho sao lưu ngoài VPS.
- Thứ tự phụ thuộc: T1 trước (baseline). T3 → T4 (serve dùng tai_nguyen). T10 → T11/T12/T13 (client.ts). T7 độc lập với FE nhưng T11 nên chạy sau T7 để kiểm cùng lúc.
