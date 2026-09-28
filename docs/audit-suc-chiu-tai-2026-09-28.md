# Rà soát sức chịu tải & độ tin cậy — trước khi đưa 200–500 người dùng thật

Ngày: 28/09/2026 · Phạm vi: toàn bộ backend, frontend, hạ tầng deploy · Cách làm: đọc code (không sửa
gì), 6 mảng rà song song, các phát hiện nặng nhất đã kiểm lại tận tay. Các con số request/query là
ƯỚC LƯỢNG từ code, CHƯA đo trên tải thật — bài đo tải ở cuối tài liệu là để chốt số.

## Kết luận

Hệ thống hiện chạy tốt với vài người thử, nhưng **chưa sẵn sàng cho 200–500 người dùng đồng thời**.
Có ba điểm yếu kiến trúc và chúng khuếch đại lẫn nhau:

1. **Máy chủ chỉ có 1 tiến trình và 15 kết nối DB**. Vài chỗ trong code còn làm việc nặng ngay trên
   luồng chính, nên cả hệ thống đứng theo.
2. **Mọi thông báo đều gửi cho tất cả mọi người, và mọi tab nhận được là tự tải lại.** Một người bấm
   một nút có thể kéo theo hàng trăm tới hàng nghìn request.
3. **Giao diện không có thời hạn chờ.** Máy chủ khựng vài giây là màn hình người dùng treo luôn,
   phải F5, và F5 lại dồn thêm tải.

Lỗi "thỉnh thoảng treo ở Đang tải…" gặp hôm nay là triệu chứng sớm của đúng ba điểm này. Khi đông
người, nó sẽ không còn "thỉnh thoảng" mà rơi đúng vào lúc tệ nhất: đầu ca chấm công, và giữa ca khi
cả xưởng thao tác trên bàn tổ.

Ngoài sức chịu tải còn một rủi ro lớn hơn cả: **prod chưa có sao lưu tự động nào**, cả cơ sở dữ liệu
lẫn kho tệp.

---

## A. Chặn go-live — phải xử lý trước khi đưa người dùng thật vào

### A1. Không có sao lưu
- Postgres không có `pg_dump` định kỳ. MinIO (CCCD, hợp đồng, chứng từ, ảnh KCS) không được sao chép
  đi đâu. Cả hai volume nằm trên cùng ổ đĩa VPS: hỏng đĩa hoặc xoá nhầm volume là mất sạch, không lấy
  lại được.
- `docs/DEPLOY.md` hướng dẫn backup tay bằng file compose không còn tồn tại.

### A2. Máy chủ đứng hình cả hệ thống
- 1 tiến trình uvicorn (`backend/Dockerfile:20`, không có `--workers`). Pool DB để mặc định 15 kết
  nối, chờ tối đa 30 giây (`backend/app/db.py:31`).
- 5 endpoint `async def` làm việc đồng bộ trên luồng chính. Trong lúc chúng chạy, **mọi người dùng
  khác đều đứng**:
  - Mở kênh thông báo (`routers/quotations.py:390-425`): truy vấn DB để xác thực, chạy mỗi lần một
    tab kết nối hoặc nối lại. Nếu pool đang hết, cả máy chủ đứng tới 30 giây.
  - Tải tài liệu Nội quy tới 20MB (`routers/noi_quy.py:96`), ảnh đại diện (`routers/profile.py:44`),
    chứng cứ đơn (`routers/orders.py:335`): ghi MinIO và DB ngay trên luồng chính.
  - Nhập Excel bảng giá nhà cung cấp (`routers/purchases.py:410`): parse xlsx trên luồng chính, không
    giới hạn cỡ tệp.
- Kho tệp MinIO dùng thời hạn mặc định 60 giây và thử lại 3 lần (`storage.py:156-162`). MinIO chậm
  thì một lượt tải tệp giữ luồng và kết nối DB 3–4 phút.
- 15 kết nối DB đặt cạnh 40 luồng xử lý: khi đông, các request giữ kết nối và chờ luồng, còn các
  luồng thì chờ kết nối. Kết quả là đứng 30 giây rồi lỗi 500 hàng loạt.

### A3. Bão request do thông báo
- Có 65 chỗ gọi `hub.broadcast` (khoảng 113 điểm phát nếu tính qua các hàm dùng chung) gửi tới
  **mọi** kết nối. Gần như chỗ nào cũng biết sẵn ai cần nhận: tổ, người duyệt, người tạo.
- Mọi sự kiện đều tăng một "tick" chung (`AppShell.tsx:767`), và khoảng 45 màn tải lại theo tick đó,
  không cần biết sự kiện có liên quan không. Tab đang ẩn cũng tải lại.
- Một số ví dụ:
  - Gửi hoặc duyệt một yêu cầu chỉnh công: mọi tab chạy trọn bộ tải số đếm trên menu, 5–15 request
    mỗi tab.
  - Một thao tác ở bàn tổ: mọi tab có quyền tổ tải lại danh sách tổ, tab đang mở bàn tổ tải thêm 3–5
    request.
  - Xếp lịch bắn 2–3 sự kiện cho một lần bấm.
- Access token xoay mỗi 15 phút, và mỗi lần xoay mỗi tab đóng rồi mở lại kênh thông báo, tải lại
  quyền, số đếm và dữ liệu màn đang mở. Có 68 effect phụ thuộc `token`. Với 1000 tab, lúc nào cũng có
  một "bão nhỏ" đang chạy.
- Số đếm Kế hoạch vật tư gọi `can-doi` **toàn xưởng** mỗi lần mở app và mỗi lần token xoay. Code
  ghi nhận đã đo 23,8 giây và 3,1GB RAM ở 100 nghìn lệnh. Màn Kế hoạch vật tư còn gọi lại hàm này
  theo mọi sự kiện, không chặn lượt chồng.
- Sau mỗi lần deploy, mọi tab nối lại **cùng nhịp** 3 giây, không có độ trễ ngẫu nhiên
  (`client.ts:2914`).
- Mở drawer Đơn hàng tạo thêm 2 kết nối thông báo nữa trong cùng tab (`DonHangBanPage.tsx:455`,
  `TienDoDon.tsx:44`).
- Tài liệu này ước tính: mở app tốn khoảng 10 request với công nhân, khoảng 21 với quản lý. 1000 tab
  mở đầu ca là 10–21 nghìn request.

### A4. Giao diện treo vĩnh viễn thay vì báo lỗi
- `fetch` không có thời hạn chờ (`client.ts:75`). Kết nối nửa-mở trên điện thoại (đổi Wi-Fi sang
  4G) có thể treo vài phút.
- Các màn có thể kẹt mãi:
  - Khung app lúc khởi động (`AppShell.tsx:1273`).
  - Khôi phục phiên (`AuthContext.tsx:62-91`).
  - Phòng ban.
  - **Chấm công**: lỗi mạng được gán `status=null` rồi hiện "Đang tải…" vĩnh viễn, không có nút thử
    lại (`MyCheckInTab.tsx:71-74, 193`).
  - Phiếu lương của tôi, Hồ sơ của tôi (lỗi mạng lại hiện sai là "chưa gắn hồ sơ").
  - Drawer bàn tổ: một request treo là khoá mọi nút.
- Lượt làm mới phiên bị treo sẽ giữ khoá Web Lock mãi (`client.ts:229-251`), và **mọi tab** của
  trình duyệt đó đứng theo.
- Không có ErrorBoundary gốc: một lỗi hiển thị ở bất kỳ màn nào làm trắng toàn app.

### A5. Chấm công có thể ghi sai công
- Không chống trùng: `attendance_logs` không có ràng buộc duy nhất, và chuỗi "đọc lượt cuối → quyết
  VÀO hay RA → ghi" không khoá (`attendance_service.py:1104`).
- Kịch bản xấu nhất (đã kiểm code):
  1. Lượt VÀO đã ghi xong nhưng phản hồi rớt.
  2. FE không tải lại trạng thái trong nhánh lỗi (`MyCheckInTab.tsx:159-161`), nên nút vẫn ghi
     "CHẤM VÀO".
  3. Công nhân bấm lại, máy chủ tự quyết đây là lượt **RA**.
  4. Công ngày đó ≈ 0.
- `GET /me/status` tốn khoảng 12–18 query. `/me/logs` gọi lại toàn bộ `my_status` chỉ để lấy tên. Mỗi
  lượt chấm tổng cộng khoảng 100 query, và 200 người dồn vào 7h00–7h30.

### A6. Deploy làm gián đoạn dịch vụ, không ai biết khi sập
- Mỗi lần deploy prod mất dịch vụ khoảng 15 giây tới hơn 1 phút:
  - Container cũ phải chờ 10 giây mới bị giết vì kênh thông báo không tự đóng.
  - Container mới chạy `create_all`, migration và seed rồi mới nhận request.
- Migration chạy khi app cũ còn phục vụ nhưng không có `lock_timeout`. Có 122 lệnh `CREATE INDEX` không
  `CONCURRENTLY`, và có lệnh `DROP COLUMN` (vd mg 0340) mà code cũ vẫn đọc tới. Vì vậy toàn app có
  thể treo hoặc lỗi 500 trong lúc migrate.
- Staging build (`npm ci`, `vite build`) chạy **trên chính VPS prod** mỗi lần push `dev`, tức nhiều
  lần mỗi ngày, và không container nào bị giới hạn CPU/RAM. Deploy staging và deploy prod có thể chạy
  cùng lúc (khoá concurrency tách theo nhánh).
- Không có giám sát, cảnh báo hay theo dõi lỗi. Log Docker không giới hạn dung lượng (đầy đĩa thì
  Postgres chết). `/api/health` không kiểm DB.

### A7. Màn chậm dần theo tuổi dữ liệu
- Lệnh SX, Theo dõi SX (kanban/theo máy) và `summary` nạp **mọi** lệnh đã phát hành từ trước tới nay,
  tính trạng thái từng lệnh bằng Python rồi mới cắt trang (`services/lenh_sx/danh_sach.py:467-489`,
  `bang_theo_doi.py:270-284`).
- Xếp lịch `lich()` lấy mọi lệnh từng được xếp lịch, không có mép trái
  (`xep_lich_lenh_repo.py:44-64`).
- Gantt bàn tổ lấy toàn bộ công việc lịch sử của tổ (`board.py:477-484`).
- Các màn này lại tải lại theo mọi sự kiện (A3).

---

## B. Mức cao — sửa trong đợt tối ưu, không nhất thiết chặn ngày đầu

**Tải tệp**
- Mọi endpoint đọc nguyên tệp vào RAM rồi mới kiểm cỡ. 20 người tải tệp lệnh SX 50MB cùng lúc là
  khoảng 1GB RAM, và OOM thì sập toàn app.
- Tải tài liệu Khách hàng và hồ sơ Nhân sự (`customers.py:1475`, `employees.py:902`) **không giới hạn
  cỡ, không kiểm loại tệp**.
- Chỉ 2 màn nén ảnh phía điện thoại (Kỹ thuật máy, KCS). Giao hàng, kho, mua hàng, phiếu chi/thu, đơn
  hàng, báo giá đều gửi ảnh gốc 4–8MB.
- Không có ảnh thu nhỏ: danh sách 50 ảnh là 50 request kèm xác thực, mỗi request tải ảnh gốc.
- Ảnh chỉ được cache 5 phút, không có ETag, dù key tệp không bao giờ đổi.
- **Xoá đính kèm Khách hàng/Nhân sự chỉ xoá dòng DB, tệp còn trong MinIO và vẫn tải được qua URL cũ**
  (`employee_service.py:1120`, `customer_service.py:647`). Đây là rủi ro riêng tư với CCCD và hợp
  đồng.
- Tệp mồ côi khi DB lỗi sau lúc ghi tệp, và khi xoá bản ghi cha. Không có job dọn.
- **Bảo mật:** ảnh vật tư công khai (`public_scan.py:117-121`) thiếu `nosniff`, trong khi chỗ tải lên
  nhận cả SVG (`vat_lieu_kho.py:256`). Một SVG chứa script sẽ chạy cùng origin với app.

**Ghi trùng / sai dữ liệu**
- Ghi mẻ sản lượng không chống trùng: phản hồi rớt, bấm lại là mẻ bị ghi 2 lần, lương khoán gấp đôi
  (tới trần) (`san_luong.py:178-285`).
- Tạo yêu cầu kho và ghi lỗi KCS công đoạn giữa cũng tương tự. Cả hệ thống không có khoá chống lặp
  (idempotency key).
- Mã phiếu tính giá = đếm + 1 (`routers/phieu_tinh_gia.py:89-96`, đã kiểm). Xoá một phiếu giữa chừng
  thì mã mới trùng mã cũ, và **mọi lần tạo phiếu lỗi cho tới hết năm**.
- Mã lô kho và mã yêu cầu báo hỏng cũng dùng đếm/max + 1 không khoá, nên tạo đồng thời có thể lỗi 500.

**Khoá & truy vấn nặng**
- Ghi sổ kho chạy `can_doi` toàn xưởng **bên trong** transaction đang giữ `FOR UPDATE`
  (`giu_cho_service.py:650-657, 811-829`).
- N+1:
  - Danh sách yêu cầu kho: khoảng 300+ query mỗi trang (`kho_request.py:179`), dù hàm gom lô
    `don_vi_nhieu_mat_hang` đã có sẵn.
  - `work-items` bàn tổ: 100–300 query mỗi trang (`board.py:241-256`).
  - `orders/notify-summary`: 4 query cho mỗi đơn nháp (`order_service.py:599-619`).
- Thiếu index trạng thái ở các bảng bàn tổ (`san_xuat_cong_viec`, `goi_phat_hanh`, `nhom`,
  `ban_giao`, `ho_tro`, `kcs_loi`), và thiếu index ghép `attendance_logs(employee_id, checked_at)`.
- Vài cột model khai `index=True` nhưng migration chưa từng tạo index (vd `stock_requests.kho_id`).
  Cần đối chiếu `pg_indexes` trên prod.
- Mỗi request tốn 2–6 query chỉ cho phân quyền (bàn tổ 5–7), không có cache.

**Khác**
- Frontend là **một tệp JS 4,66MB** (1,24MB gzip), không tách theo màn. Công nhân phải tải cả thư
  viện bản đồ và biểu đồ dù không dùng. Trên 4G yếu, lần mở đầu mất 10–15 giây.
- Đăng nhập không giới hạn tần suất, trong khi bcrypt tốn 0,3–0,4 giây CPU mỗi lượt. Đây vừa là đường
  dò mật khẩu vừa là đường làm nghẽn CPU. 200 người đăng nhập đầu ca tốn 60–80 giây CPU.
- nginx cố định IP backend lúc khởi động (`nginx.conf`, không có `resolver`). Deploy chỉ backend thì
  request có thể treo tới 60 giây.
- Thông báo broadcast làm lộ mã chứng từ và số tiền cọc cho mọi tài khoản (`orders.py:290`).

## C. Trung bình / thấp — gom làm dần

- Middleware `@app.middleware("http")` tốn thêm chi phí mỗi request. Có thể còn làm kết nối thông báo
  không được dọn khi đóng tab; cần một test để kiểm.
- Hàng đợi thông báo mỗi kết nối giới hạn 200 sự kiện, đầy thì bỏ im lặng. Nối lại cũng không đồng
  bộ lại số đếm.
- Xuất Excel dựng nguyên workbook trong RAM. Nhập Excel Khách hàng/Nhân sự không dùng `read_only`.
- Trang Nhật ký xuất CSV giữ một phiên DB suốt thời gian tải.
- `purge_expired` refresh token chạy DELETE quét toàn bảng mỗi lượt đăng nhập, và cột `expires_at`
  không có index.
- Khoảng 114 khoá ngoại trỏ về `users` đặt `ON DELETE CASCADE`, phần lớn không có index. Xoá cứng một
  user sẽ xoá luôn nhật ký và sản lượng của người đó.
- Thông báo lỗi tiếng Anh ("Request failed (502)", "Cannot reach the server").
- Không có service worker/PWA. Không phát hiện mất mạng.
- MinIO dùng image không gắn tag. Không container nào có healthcheck backend.

## Đã kiểm và BÁC (để khỏi lo nhầm)

- "Mỗi lần deploy ghi đè ma trận quyền": sai với prod. `seed_all` return ngay khi
  `SEED_DEMO=false`, và `.env.prod` đang để `false`.
- Giới hạn 6 kết nối/trình duyệt: prod chạy HTTP/2 nên không dính.
- Cấu hình proxy cho kênh thông báo (buffering, timeout, ping) đã đúng.
- Chi phí kiểm "migration đã chạy chưa" lúc khởi động không đáng kể (1 SELECT).
- Không có polling định kỳ gọi API. Các `setInterval` hiện có chỉ là đồng hồ trên giao diện.

---

## Lộ trình đề xuất

Thứ tự đi từ rẻ và cứu được nhiều nhất trước. Mỗi đợt nghiệm thu bằng **bài đo tải**, không bằng cảm
giác.

| Đợt | Nội dung | Vì sao làm trước |
|---|---|---|
| 0 | Sao lưu tự động Postgres + MinIO ra ngoài VPS, diễn tập khôi phục · theo dõi uptime có cảnh báo · giới hạn log Docker | Rủi ro mất dữ liệu không sửa lại được; làm được ngay, không đụng nghiệp vụ |
| 1 | 5 endpoint async → không chặn luồng chính · pool DB rõ ràng + thời hạn MinIO · FE có thời hạn chờ + tự thử lại GET + ErrorBoundary gốc · màn Chấm công không treo, chống chấm trùng, tải lại trạng thái khi lỗi | Chặn đứng kiểu "cả hệ thống đứng" và bảo vệ việc chấm công |
| 2 | Thông báo gửi đích danh thay vì broadcast · tick theo loại sự kiện + gộp nhịp · 1 kết nối thông báo/trình duyệt · nối lại có độ trễ ngẫu nhiên + đồng bộ số đếm · bỏ `token` khỏi các effect tải dữ liệu · số đếm `can-doi` thôi chạy toàn xưởng mỗi lần mở app | Cắt hệ số nhân tải lớn nhất |
| 3 | Chạy nhiều tiến trình (Redis đã sẵn) · migrate/seed ra bước riêng + khoá ticker · deploy ít gián đoạn (nginx resolver, Caddy giữ request, migration chỉ "mở rộng", có `lock_timeout`) · tách build staging khỏi VPS prod | Tăng sức chứa thật, deploy không làm gián đoạn giờ làm |
| 4 | Lệnh SX / Theo dõi SX / Xếp lịch / Gantt: lọc + phân trang ở máy chủ · index trạng thái bàn tổ + chấm công · sửa N+1 kho / bàn tổ / đơn nháp · mã PTG bằng `document_sequences` | Không chậm dần theo năm |
| 5 | Nén ảnh dùng chung mọi màn chụp · ảnh thu nhỏ + cache dài · giới hạn cỡ trước khi đọc · dọn tệp khi xoá · vá SVG/nosniff · chống ghi trùng mẻ/kho/KCS | Tải tệp an toàn và nhẹ trên điện thoại |

**Bài đo tải (làm song song từ Đợt 1, giữ lại để chạy mỗi lần thêm tính năng lớn):**
- Đầu ca: N người mở app và chấm công trong 5 phút.
- Giữa ca: X thợ mở bàn tổ, mỗi thợ thao tác vài giây một lần.
- Sau deploy: toàn bộ tab nối lại cùng lúc.

Đo tỉ lệ thành công, thời gian phản hồi p95 và số lần đứng. Ngưỡng đạt do chủ sản phẩm chốt.

## Cần chủ sản phẩm chốt

- Mục tiêu con số: bao nhiêu người đồng thời lúc cao điểm? Mỗi người mấy tab/thiết bị?
- VPS prod có bao nhiêu CPU/RAM? Có chấp nhận tách staging sang máy khác không?
- Khung giờ được phép deploy prod (ví dụ chỉ ngoài giờ ca)?
- Sao lưu đẩy đi đâu (dịch vụ lưu trữ nào) và giữ bao lâu?
