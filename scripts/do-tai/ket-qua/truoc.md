# Đo tải NỀN (trước khi sửa) — 28/09/2026

**Kết luận:** code hiện tại gãy ở khoảng **50–100 người vào cùng lúc**. 50 người dàn trong ~70 giây
thì chạy êm (p95 0,5s, chấm công 50/50). Lên 100 người thì còn 65/100 người chấm được công. Từ 200 người
trở lên thì sập hẳn: chấm được 1–3/200, và 1/400. Máy chủ không hết CPU. Nó đứng vì **cạn 15 kết nối
DB**: request chờ 30 giây rồi trả 500, còn kênh SSE xác thực bằng DB ngay trên event loop nên khi cạn pool
thì **cả tiến trình đứng theo**. Tải dừng rồi mà backend vẫn cần 1–5 phút mới trả lời lại được.

## Cấu hình đo

| | |
|---|---|
| Commit đo | `8e7358ce` (HEAD `dev` trước mọi sửa đổi), worktree riêng `.claude/worktrees/do-tai-goc` |
| Stack | `docker-compose.yml` của commit đó, project `erp-svn-tai`, profiles `db,redis,minio,backend,web` (không Caddy), truy cập qua nginx `http://127.0.0.1:8460`. `SEED_DEMO=false`, DB trắng `svn_tai` |
| Backend | 1 tiến trình uvicorn (Dockerfile gốc), pool SQLAlchemy mặc định 5 + 10 overflow, chờ 30s |
| Máy | Windows 11, Intel i5-9300H (4 lõi/8 luồng), RAM 16 GB |
| Docker Desktop | cấp 8 CPU, **1,92 GiB RAM** cho VM. VM này còn chạy chung các stack khác (`erp-svn-local`, `qlcb_*`, `erp-svn-kiemtra`) |
| Dữ liệu | 400 tài khoản `tai_001..400`. Cứ 10 người có 1 "Quản lý đo tải" (21 màn có badge + trọn 4 tổ), còn lại là "Công nhân đo tải" (quyền vai Thợ SX + bàn tổ của mình). 4 tổ, 1 điểm chấm r=5000m, ca phủ giờ đo. Chưa có đơn/lệnh/báo giá nào, nên mọi màn đều đọc bảng rỗng |
| Máy phát tải | `do_tai.py` trên host, httpx HTTP/1.1, trần kết nối N×6, timeout 60s, `--seed 1` |

Mở app tốn **14 request** (công nhân) hoặc **21 request** (quản lý): login + quyền + chùm badge + nạp
tổ/kho/can-doi, cộng thêm 1 kết nối SSE. Kịch bản đầu ca cộng thêm 4 request chấm công.

**Máy dùng chung.** Trong lúc đo, các phiên khác vẫn chạy pytest/vitest trên cùng máy, nên CPU host lúc
nền có khi 90–100%. Mỗi lượt vì vậy có ghi CPU host 5s trước khi chạy và CPU trung bình trong lúc chạy.
Bảng chính dùng các lượt **host rảnh** (CPU nền 22–34%, trong lúc chạy trung bình 30–45%), tức máy phát
tải KHÔNG bão hoà. Các lượt lúc host bận để riêng ở bảng phụ: cùng mức tải mà host bận thì gãy sớm hơn
hẳn (50 người đã sập).

## Kết quả chính (host rảnh)

| Kịch bản | N | Request | Lỗi | p50 | p95 | > 10s | Chấm công OK | SSE mở được | CPU backend TB/max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| daudca | 20 | 374 | 0% | 0,24s | 0,85s | 0 | 20/20 | 20/20 | 10% / 114% |
| daudca | 50 | 935 | 0% | 0,17s | 0,47s | 0 | **50/50** | 50/50 | 12% / 164% |
| daudca | 100 | 1313 | 6,0% (timeout 56, 500×23) | 0,55s | **53s** | 131 | **65/100** | 68/100 | 66% / 622% |
| daudca | 200 | 407 | 63% (timeout 238, 500×9) | 60s | 61s | 319 | **3/200** | 9/200 | 26% / 322% |
| daudca | 400 | 640 | 82% (timeout 500, 500×14) | 60s | 65s | 572 | **1/400** | 10/400 | 45% / 822% |
| bando | 50 | 3435 | 0,1% (500×3) | 1,7s | **13s** (p99 39s) | 211 | — | 50/50 | 48% / 188% |
| bando | 100 | 1280 | 52% (timeout 466, treo 196) | 12s | 65s | 663 | — | 31/100 | 17% / 197% |
| bando | 200 ¹ | 421 | 84% (timeout 296) | 60s | 68s | 400 | — | 5/200 | 86% / 828% |

¹ bando 200 chạy lúc host bận vừa (nền 50%, trong lúc chạy trung bình 52%).

Cột "Lỗi" gồm cả `dang_cho`: request vẫn treo khi hết giờ đo, tức người dùng đang nhìn màn "Đang tải…".
Trong mọi lượt, CPU của db chỉ 1–19% trung bình.

**Giữa ca (bando)**: pha mở app của 100 người vẫn ổn (p95 2,6s, 0 lỗi). Sau đó mỗi người gọi ~6 request
mỗi 3–8 giây, tức ~110 req/s, và hệ sụp. 91% request pha này lỗi hoặc treo, mà backend chỉ dùng trung bình
17% một lõi. Thông lượng thật cao nhất đo được là ~23 req/s (bando 50), và ngay mức đó đã có những cú
đứng ~30s (p99 39s).

### Sau deploy (restart backend)

| N | SSE đang mở lúc restart | Lệnh `restart` | `/api/health` 200 lại sau | ≥95% SSE nối lại | Lỗi 60s sau restart |
|---:|---:|---:|---:|---|---|
| 100 | 20/100 | 5,9s | 18,7s | **21,5s** | 51% (502×185) |
| 200 | 4/200 | 5,0s | 27,4s | **chưa đạt sau 117s** (3/4) | 98% (502×719, 500×21) |
| 20 ² | 4/20 | 12,8s | 59,1s | 60,1s | 96% (502×108) |

² Lượt đầu, host bận 78%, trần kết nối client khi đó là N×3 (file trong `lan-chay/thu-nghiem/`).

- Chưa đo được phép thử "N người đang giữ SSE rồi deploy" ở 100–200 người. Lý do: chính pha mở app đã
  sập, nên lúc restart chỉ còn 4–20 người đang giữ SSE.
- Riêng số người đã có SSE thì nối lại trong ~20s khi host rảnh, tức backend khởi động ~13–19s cộng
  nhịp chờ cố định 3s.
- Ở 200 người, sau restart mọi người F5 lại (kịch bản cho người dùng thử mở app lại sau 3–8s), và backend
  mới lại sập đúng như lúc đầu ca. Trong 117s đo, SSE không hồi phục.
- Log backend không có dòng "Shutting down" nào. Tức tiến trình cũ không tự dừng, phải chờ Docker giết
  sau 10s, khớp A6.
- Lúc host bận, riêng việc import app (từ lúc container start tới `Started server process`) đã mất
  55–77s.

### Bảng phụ: cùng kịch bản lúc host bận (CPU nền 70–92%)

| Kịch bản | N | Lỗi | p95 | Chấm công OK | CPU host TB |
|---|---:|---:|---:|---:|---:|
| daudca | 50 | 42% | 65s | 9/50 | 94% |
| daudca | 100 | 47% | 65s | 10/100 | 79% |
| daudca | 200 | 61% | 66s | 1/200 | 88% |
| bando | 50 | 44% | 72s | — | 96% |
| bando | 100 | 67% | 63s | — | 74% |

Khi CPU chậm đi, mỗi request giữ kết nối DB lâu hơn, nên chạm trần 15 kết nối sớm hơn. VPS nhỏ hoặc bận
(build staging chạy chung máy, A6) sẽ rơi vào đúng tình trạng này.

## Điểm gãy quan sát được

1. **Cạn pool DB là nguyên nhân chính, không phải CPU.** Log backend của cả buổi đo có ~920 lỗi
   `QueuePool limit of size 5 overflow 10 reached, connection timed out, timeout 30.00`. Mỗi traceback in
   2 lần (thường + ExceptionGroup), nên grep ra 1834 dòng. Phân theo nơi phát sinh:
   - ~880 ở `deps.get_current_user` → `user_repo.get_by_id`, tức ngay bước xác thực của mọi request;
   - ~740 ở `auth.login` → `get_by_username`;
   - ~100 ở `refresh_service.issue`;
   - **~100 ở `quotations._authenticate_sse`**, tức mở SSE, chạy trên event loop.

   Trong lúc sập, CPU backend trung bình chỉ 9–26% và db 1–4%. Hệ đang chờ, không phải đang tính.
2. **Event loop đứng 30s mỗi lần mở SSE lúc pool cạn** (A2). `quote_events` là `async def` và gọi
   `SessionLocal()` đồng bộ. Khi pool hết, nó chặn cả event loop tới 30s. Trong 30s đó, các luồng đã xong
   việc có lẽ cũng không trả được kết nối, vì phần dọn dependency `get_db` phải được event loop lên lịch
   (suy luận từ cách FastAPI chạy dependency có `yield`, chưa soi trực tiếp). Vòng này tự nuôi nhau: chờ 30s,
   500, tới lượt SSE kế tiếp lại chờ 30s. Đó là lý do độ trễ chụm quanh 30s và 60s (hết timeout client),
   và p99 của bando 50 là 39s dù chỉ có 3 lỗi.
3. **Tải dừng mà hệ chưa hồi.** Sau mỗi lượt quá tải, `/api/health` còn treo từ 76s tới 236s. Sau daudca
   400, backend tới 17:38 mới trả lời lại, tức ~5 phút sau khi tải dừng. Sau bando 100 thì treo **hơn 5
   phút**: nginx ghi toàn 499 từ 10:14 tới 10:19 UTC, và lượt reconnect-200 đầu tiên
   bị bỏ vì chạy vào backend còn đứng. Nguyên nhân: uvicorn vẫn xử lý hết đống request mà client đã bỏ, và
   `/api/health` phải xếp hàng sau chúng. Người dùng F5 lúc này chỉ đổ thêm vào hàng.
4. **Đăng nhập là cửa hẹp đầu tiên.** Ở 200 người, 178/200 lượt login hết 60s. bcrypt tự nó không đắt
   (p50 0,4–1,1s khi hệ êm), nhưng login giữ kết nối DB cả lúc chờ bcrypt rồi còn ghi refresh token và
   audit.
5. **Chấm công gãy theo.** Ở 100 người (host rảnh), 35 người không chấm được: 3 người gửi lệnh chấm mà không
   nhận phản hồi, số còn lại chưa mở được app. Lệnh chấm công tự nó nhanh (p50 0,04s khi hệ êm), nên
   chấm hỏng là do bị kéo theo, không phải do chấm chậm.

Bằng chứng log (lệnh
`docker compose -p erp-svn-tai logs backend --tail 200 | grep -i -E "error|timeout|QueuePool"`, sau lượt
daudca 400, gộp dòng trùng):

```
sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 10 reached, connection timed out, timeout 30.00
  | sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 10 reached, connection timed out, timeout 30.00
  File "/usr/local/lib/python3.11/site-packages/starlette/middleware/errors.py", line 187, in __call__
    raise exc.TimeoutError(
```

Khung traceback đặc trưng của SSE:

```
File "/app/app/routers/quotations.py", line 425, in quote_events
File "/app/app/routers/quotations.py", line 402, in _authenticate_sse
sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 10 reached, connection timed out, timeout 30.00
```

## Chưa đo được / giới hạn

- **DB trắng**: chưa có lệnh SX, đơn, báo giá, lô kho. Vì vậy các hàm nặng theo dữ liệu (`can-doi`,
  `bai-ghep-2/hang-cho`, `work-items`, A7) ở đây rẻ hơn thật. Trên dữ liệu thật hệ còn gãy sớm hơn. Muốn
  đo phần này thì phải nạp bản sao DB prod (đã ẩn danh) vào `svn_tai`.
- **Không có Caddy/HTTP/2.** Prod đi qua Caddy HTTP/2. Ở đây client nói HTTP/1.1 thẳng vào nginx, trần
  N×6 kết nối.
- **Không có sự kiện SSE** trong lúc đo (không ai thao tác ghi), nên chưa đo "bão request do broadcast"
  (A3). Kịch bản bando chỉ có đọc.
- **reconnect với nhiều SSE đang mở**: như đã nói ở trên, pha mở app sập trước nên chưa đo được.
- **Máy phát tải chung máy với hệ bị đo và với các phiên khác.** Bảng chính chỉ lấy lượt host rảnh (CPU
  máy phát tải trung bình 33–45%, không bão hoà). Số tuyệt đối vẫn lệch so với VPS thật, nên so trước/sau
  phải chạy cùng máy, cùng `--seed`, và ghi CPU host như ở đây.
- Lượt dùng thử công cụ (trần kết nối N×3, cửa sổ reconnect cũ) và lượt reconnect-200 chạy vào backend còn
  đứng nằm ở `lan-chay/thu-nghiem/`, không dùng để kết luận.

## Tệp thô

Bảng đầy đủ từng lượt, theo từng nhóm endpoint, nằm trong `lan-chay/`:

- daudca: `20260928-161510-daudca-20`, `170146-daudca-50`, `165826-daudca-100`, `170502-daudca-200`,
  `173054-daudca-400`. Host bận: `162348-daudca-50`, `162921-daudca-100`, `163251-daudca-200`.
- bando: `170827-bando-50`, `171133-bando-100`, `164955-bando-200`. Host bận: `163830-bando-50`,
  `164436-bando-100`.
- reconnect: `165550-reconnect-100`, `172330-reconnect-200`.

Lượt đo "sau" chạy lại đúng các lệnh này, cùng `--seed 1`:

```
python scripts/do-tai/do_tai.py --users N --kich-ban daudca --thoi-gian 170 --seed 1
python scripts/do-tai/do_tai.py --users N --kich-ban bando --thoi-gian 150 --seed 1
python scripts/do-tai/do_tai.py --users N --kich-ban reconnect --thoi-gian 180 --seed 1
```

Trước mỗi lượt `daudca` phải chạy `tao_du_lieu.py ... --chi-xoa-cham-cong`, và đợi `/api/health` < 2s.
