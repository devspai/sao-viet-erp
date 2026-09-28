# Đo tải SAU (code sửa chưa commit) — 28/09/2026

**Kết luận:** hết sập. Chạy lại đúng các lệnh của lượt nền, cả buổi đo có **0 lỗi QueuePool, 0 lỗi 500,
0 lần cổng backend trả 503**. Máy chủ trả lời nhanh ở mọi mức: theo log nginx, p95 ≤ 0,8s. `/api/health`
hồi ngay sau mỗi lượt (6–8s, là mức thấp nhất bộ đếm đo được), trong khi lượt nền mất 1–5 phút.

Với máy phát tải cũ, p95 ở ≥ 100 người vẫn là hàng chục giây. Phần trễ đó nằm ở **chính máy phát tải**, không
ở máy chủ (xem mục "Máy phát tải là chỗ nghẽn"). Đo lại với mỗi người một client thì kết quả là:

- 400 người vào đầu ca: chấm công 400/400, 0 lỗi, p95 9,9s;
- 200 người giữa ca: lỗi 0,4%, p95 10,7s.

**Điểm gãy mới** là trần thông lượng **~85 req/s** của 2 worker trên máy đo này. Vượt trần thì request xếp
hàng ở cổng và chậm dần, nhưng không lỗi hàng loạt.

**Chỗ lùi:** restart backend lâu gấp ~2,5 lần, khoảng 40–50s so với ~19s trước đây. Chỗ này **đã vá**: sau
vá còn 23–26s lúc máy rảnh và 29s khi đang có tải (xem "Restart sau vá" ở cuối).

## Cấu hình đo

| | |
|---|---|
| Code đo | `8e7358ce` + working tree CHƯA commit của worktree `suc-chiu-tai`: 129 file đổi (+3619/−1145), 57 file mới. Build image lúc 17:41, đo 20:43–21:55 |
| Stack | `docker-compose.yml` mới, project `erp-svn-tai`, profiles `db,redis,minio,backend,web`. **Không dựng `backup`, `caddy`**: profile chúng không bật, và lượt nền cũng không có Caddy. DB trắng `svn_tai`, `SEED_DEMO=false`, cùng `.env.tai` với lượt nền |
| Backend | `python -m app.serve`. Log khởi động: `svn.serve may: 8 CPU, 980 MB RAM -> 2 worker, moi worker pool 20 + 10 ket noi`. Số worker bị RAM chặn: VM 1,92 GiB, cgroup không giới hạn nên lấy ½ RAM = 980 MB, chia 350 MB/worker ra 2. **Không ép `WEB_CONCURRENCY`**, không lượt nào OOM (RAM backend 470–565 MiB) |
| Cổng đồng thời | 28 request/worker (pool 30 − 2), chờ tối đa 30s rồi mới 503 |
| Postgres | tự chỉnh qua `deploy/postgres/tu-chinh.sh`: `max_connections` 200, `shared_buffers` 490MB |
| Máy, dữ liệu | như lượt nền: i5-9300H, Docker Desktop 8 CPU/1,92 GiB, 400 tài khoản `tai_*`, 4 tổ, DB rỗng nghiệp vụ |
| Máy phát tải | `do_tai.py` y hệt lượt nền (`--seed 1`, pool chung N×6, timeout 60s). **Vẫn mô phỏng chùm badge + SSE của FE CŨ**: không có timeout/retry của FE mới, không gộp nhịp, gọi `care-followups` chứ không phải `/count`. Giữ nguyên để so phía máy chủ/hạ tầng cho công bằng. Vì vậy số dưới đây là **cận xấu** so với FE mới |

Mọi lượt trong bảng đều chạy lúc host rảnh: CPU nền 5s trước khi chạy là 30–45%.

## So trước / sau — cùng lệnh, cùng máy phát tải

Cột "máy chủ p95" lấy từ `rt=` trong log nginx, tính cho request `/api/*` trừ health và SSE. Lượt nền không
còn log nginx: stack đã `down`.

| Kịch bản | N | Lỗi TRƯỚC | Lỗi SAU | p95 TRƯỚC | p95 SAU (client) | máy chủ p95 SAU | Chấm công TRƯỚC → SAU | SSE mở SAU | CPU nền |
|---|---:|---|---|---:|---:|---:|---|---:|---:|
| daudca | 50 | 0% | 0% | 0,47s | 0,56s | 0,39s | 50/50 → **50/50** | 50/50 | 30% |
| daudca | 100 | 6,0% (timeout 56, 500×23) | **0%** | 53s | **0,55s** | 0,39s | 65/100 → **100/100** | 100/100 | 36% |
| daudca | 200 | 63% (timeout 238, 500×9) | 1,0% (dang_cho×36) | 61s | 42,5s | 0,43s | 3/200 → **183/200** | 199/200 | 34% |
| daudca | 400 | 82% (timeout 500, 500×14) | 37% (dang_cho×1347) | 65s | 128s | 0,80s | 1/400 → 15/400 | 135/400 | 32% |
| bando | 50 | 0,1% (500×3) | **0%** | 13s | 6,0s | 0,14s | — | 50/50 | 38% |
| bando | 100 | 52% (timeout 466, treo 196) | 1,9% (dang_cho×65) | 65s | 35s | 0,19s | — | 100/100 | 43% |
| bando | 200 | 84% (timeout 296) | 22% (dang_cho×618) | 68s | 110s | 0,62s | — | 136/200 | 30% |

Lỗi của lượt SAU **toàn là `dang_cho`**, tức request còn nằm trong hàng đợi của máy phát tải lúc hết giờ đo.
Không có timeout, 500 hay 503 nào. Riêng daudca 400 và bando 200: nginx chỉ nhận được ~2300 request trong
khi client gửi 3600. Số còn lại chưa rời được máy phát tải.

### Restart backend (reconnect)

| N | Máy phát tải | SSE mở lúc restart | `/api/health` 200 lại sau | ≥95% SSE nối lại | Lỗi trong 60s sau restart |
|---:|---|---:|---:|---|---|
| 100 | TRƯỚC | 20/100 | 18,7s | 21,5s | 51% (502×185) |
| 100 | SAU, pool chung | 90/100 | 55,1s | 58,7s | 80% (**503×728**, kết nối×70) |
| 100 | SAU, mỗi người 1 client | **100/100** | 57,8s | 59,4s | 88% (**503×812**, kết nối×72) |
| 200 | TRƯỚC | 4/200 | 27,4s | chưa đạt sau 117s | 98% (502×719, 500×21) |
| 200 | SAU, pool chung | 66/200 | 87,0s | chưa đạt sau 117s (58/66) | 70% (**503×547**, kết nối×223) |
| 200 | SAU, mỗi người 1 client | **200/200** | 50,2s | **45,2s** | 65% (**503×1325**, kết nối×138) |

Mốc "`/api/health` 200 lại" của script chỉ tính sau khi lệnh `docker compose restart` trả về, nên có thể
trễ hơn thực tế vài giây. Mốc thật lấy theo log backend:

| Lượt | SIGTERM → sẵn sàng | Dừng | Tiến trình cha (`chuan_bi`) | Worker import app |
|---|---:|---:|---:|---:|
| reconnect 100 (mỗi người 1 client) | 49s | 5,3s | 21s | 23s |
| reconnect 200 (mỗi người 1 client) | 39s | 5,3s | 13s | 21s |
| restart lúc rảnh, không tải | 40s | 0,2s | 13s | 27s |

Toàn bộ 503 ở đây là của **nginx** (`@api_loi`, kèm `Retry-After`) trong lúc backend chết. Tầng này thay cho
502 HTML của lượt nền. Luồng SSE `/api/quotations/events` thì vẫn nhận **502 trần** (nginx ghi 2025 dòng 502
ở lượt 200 người). Client chờ cố định 3s rồi thử lại, nên mỗi người bắn ~10 lượt SSE hỏng trong một lần
restart.

## Số lỗi QueuePool / 500 / 503 trong log backend

| | TRƯỚC | SAU |
|---|---:|---:|
| `sqlalchemy.exc.TimeoutError: QueuePool` | ~920 (1834 dòng grep) | **0**, trên cả 15 lượt, kể cả 6 lượt bổ sung |
| HTTP 500 | có ở hầu hết lượt ≥ 100 người | **0** |
| 503 do cổng backend | (chưa có cổng) | **0**: không request nào chờ cổng quá 30s |
| 503 do nginx lúc backend chết | (khi đó là 502) | chỉ trong lượt reconnect, như bảng trên |
| Traceback | nhiều | **0** |

Lệnh đếm: `grep -v '|' log | grep -c 'sqlalchemy.exc.TimeoutError: QueuePool'` trên
`docker compose logs backend --since <mốc đầu lượt>`.

## Máy phát tải là chỗ nghẽn

Với cùng lượt daudca 200, client đo p95 là 42,5s nhưng nginx ghi p95 0,43s, max 1,0s. Với bando 50, client
đo p95 6s còn nginx ghi 0,14s.

`py-spy` chụp tiến trình `do_tai.py` lúc chạy bando 100 cho thấy gần như toàn bộ CPU của nó nằm trong
`httpcore/_async/connection_pool.py::_assign_requests_to_connections`, rải ra `is_idle`, `is_socket_readable`,
`<listcomp>`. Pool httpx dùng chung (trần N×6 = 600–2400 kết nối) quét mọi kết nối cho mỗi request, nên độ
phức tạp tăng theo bình phương. Tiến trình ăn ~60% một lõi mà vẫn chỉ đẩy được ~20 req/s.

Lượt nền dùng đúng máy phát tải này, nên p95 hàng chục giây ở lượt nền cũng có phần do nó. Còn các lỗi
thật của lượt nền là QueuePool, 500, timeout 60s, và health treo nhiều phút. Chúng đều có trong log backend,
nên kết luận của `truoc.md` vẫn đứng.

Đã thêm cờ `--client-moi-nguoi` vào `do_tai.py`: mỗi người dùng ảo một client 6 kết nối, như một trình duyệt.
Mặc định giữ nguyên cách cũ để lệnh so sánh không đổi.

### Lượt bổ sung với `--client-moi-nguoi` (SAU)

| Kịch bản | N | Request | Lỗi | p50 | p95 client | máy chủ p50 / p95 | Chấm công | SSE | Thông lượng | CPU backend TB/max | CPU host TB |
|---|---:|---:|---|---:|---:|---|---:|---:|---:|---|---:|
| daudca | 200 | 3740 | **0%** | 0,14s | **0,54s** | 0,05 / 0,42s | **200/200** | 200/200 | 55 req/s | 110% / 396% | 48% |
| daudca | 400 | 7480 | **0%** | 3,4s | **9,9s** | 2,6 / 4,7s | **400/400** | 400/400 | 84 req/s | 244% / 567% | 66% |
| bando | 200 | 13098 | 0,4% (dang_cho×57) | 5,3s | 10,7s | 4,6 / 6,6s | — | 200/200 | 85 req/s | 304% / 531% | 83% |
| bando | 400 | 13386 | 6,1% (dang_cho×814) | 13,9s | 37,8s | 11,9 / 15,3s | — | 400/400 | 86 req/s | 376% / 816% | 85% |

Cả 4 lượt đều có 0 QueuePool, 0 lỗi 500, 0 lỗi 503. Lượt reconnect bổ sung nằm ở bảng restart phía trên.

## Điểm gãy mới

1. **Trần thông lượng ~85 req/s với 2 worker.**
   - Ba lượt nặng nhất (daudca 400, bando 200, bando 400) cùng dừng ở 84–86 req/s dù tải đưa vào tăng gấp
     đôi. Riêng bando 400 đòi ~440 req/s.
   - Phần dư xếp hàng ở cổng, nên thời gian chờ phía máy chủ tăng dần: p50 2,6s ở daudca 400, 4,6s ở
     bando 200, 11,9s ở bando 400.
   - Chưa request nào chờ tới 30s để bị 503.
   - Ở trần này host cũng đã bão hoà (CPU trung bình 83–85%, max 100%), vì máy phát tải và VM Docker dùng
     chung 8 luồng. Vì vậy ~85 req/s là trần của **máy đo này**, chưa phải trần của code.
   - Số worker ở đây bị RAM chặn còn 2 (1,92 GiB cho VM). VPS nhiều RAM hơn sẽ có thêm worker.
   - Với chùm badge của FE cũ, một người giữa ca tạo ~1,1 req/s. Trần 85 req/s vì vậy tương đương
     **~80 người đồng thời đang thao tác liên tục** mà không phải xếp hàng. Ở 200 người, p95 lên ~10s.
     FE mới gộp nhịp nên con số này sẽ khá hơn, lượt này chưa đo.
2. **Restart chậm gấp ~2,5 lần: 40–50s, trước đây ~19s.**
   - Tiến trình cha import app để chạy `chuan_bi` (13–21s), sau đó **mỗi worker import app lại từ đầu**
     (21–27s).
   - Riêng `python -c "import app.main"` trong container mất 27s. `python -X importtime` cho thấy
     `app.main` tự tốn 5,9s, `app.repositories.purchase_repo` tự tốn 1,2s, `app.routers.accounting` 0,6s.
   - Trong cửa sổ đó API trả 503 kèm Retry-After, tức FE mới tự thử lại được, nhưng người dùng vẫn chờ
     lâu hơn.
   - SSE nhận 502 trần và bị thử lại mỗi 3s.
   - Tỉ lệ lỗi trong 60s sau restart vì vậy cao hơn lượt nền: 65–88% so với 51%.
3. **Chưa thấy gãy ở pool DB hay event loop**: 0 QueuePool, health luôn < 2s ngay sau tải. CPU db tối đa
   81%, nên db chưa phải cổ chai.

## Ghi chú

- Lượt daudca 400 đầu tiên (20:54) bị bỏ. Lúc dừng, `do_tai.py` treo 10 phút vì 10 task SSE nuốt lệnh huỷ,
  nên không ghi được kết quả. Đã sửa: huỷ có hạn 3×5s, đếm task sót, và không dùng `asyncio.run`. Lượt thay
  thế chạy lúc 21:10.
- Cả 15 lượt SAU và lượt restart lúc rảnh đều chạy trên cùng một DB, không dựng lại giữa chừng. Chấm công
  được xoá trước mỗi lượt daudca.
- Chưa đo lại: bando 50/100 và daudca 50/100 với `--client-moi-nguoi` (lượt pool chung đã 0 lỗi); FE mới
  (gộp nhịp, `/count`); dữ liệu thật; đường Caddy HTTP/2.
- Muốn so trước/sau **cùng máy phát tải đã sửa** thì phải dựng lại stack `8e7358ce` rồi chạy các lệnh
  `--client-moi-nguoi`. Lượt này không làm.

## Tệp thô

Trong `lan-chay/`:

- Cùng lệnh với lượt nền: `20260928-204357-daudca-50`, `204731-daudca-100`, `205107-daudca-200`,
  `211023-daudca-400`, `211650-bando-50`, `211958-bando-100`, `212312-bando-200`, `212640-reconnect-100`,
  `212915-reconnect-200`.
- Mỗi người một client (`-cm`): `213612-daudca-200-cm`, `214005-daudca-400-cm`, `214331-bando-200-cm`,
  `214641-bando-400-cm`, `214956-reconnect-100-cm`, `215203-reconnect-200-cm`.

Lệnh đã chạy:

```
python scripts/do-tai/do_tai.py --users N --kich-ban daudca --thoi-gian 170 --seed 1 --cho-may-ranh 45 [--client-moi-nguoi]
python scripts/do-tai/do_tai.py --users N --kich-ban bando --thoi-gian 150 --seed 1 --cho-may-ranh 45 [--client-moi-nguoi]
python scripts/do-tai/do_tai.py --users N --kich-ban reconnect --thoi-gian 180 --seed 1 --cho-may-ranh 45 [--client-moi-nguoi]
```

## Restart sau vá

**Kết luận:** vá xong, restart nhanh hơn lượt SAU ~15–20s. Từ SIGTERM tới lúc worker sẵn sàng còn **23–26s**
lúc máy rảnh và **29s** khi 100 người đang giữ SSE. Trước vá là 39–49s; lượt nền ~19s. Chuẩn bị schema
chạy song song với import nên đã ra khỏi đường găng; bây giờ việc worker import app (~20s) quyết định thời
gian. SSE lúc backend chết nhận 503 JSON, không còn 502 trần. Không có traceback, và không worker nào phục
vụ request trước dòng `schema da san`.

**Cách dựng.** Stack dựng lại từ working tree lúc 22:03 (129 file đổi +3623/−1145, 30 file mới), gồm vá
`serve.py`/`khoi_dong.py` và nginx `location /api/quotations/events` thêm `error_page … = @api_loi`. Build lại
backend + web, DB trắng. Lần khởi động đầu trên DB trắng: `schema da san` sau 2 phút, worker đứng chờ ở
lifespan rồi `startup complete` ngay sau đó 0,1s. Dữ liệu tạo bằng `tao_du_lieu.py --so-nguoi 400`, như các
lượt trước. Vẫn 2 worker, pool 20+10, không ép gì.

### Restart không tải, máy rảnh (3 lần)

Mốc tính bằng giây kể từ dòng `Received SIGTERM` trong log backend (`docker compose logs --timestamps`).

| Lần | CPU nền | Cha cũ dừng | Cha mới log `may:` | `schema da san` | Worker `Started server process` (import xong) | Worker `Application startup complete` | Request đầu tiên tiến trình mới |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 33% | 0,25s | 4,0s | **8,7s** | 25,8s | **26,0s** | 30,2s (health) |
| 2 | 35% | 0,21s | 3,5s | **8,4s** | 26,3s | **26,4s** | 30,2s (health) |
| 3 | 35% | 0,21s | 3,2s | **7,7s** | 23,1s | **23,1–23,2s** | 23,8s (health) |

Trước vá, lúc rảnh cũng đo được 40s. Chuẩn bị schema bây giờ xong ở giây thứ 8–9, sớm hơn lúc worker import
xong khoảng 15s, nên worker không phải chờ nữa. Muốn nhanh hơn thì phải cắt thời gian import app: riêng
`import app.main` đã mất ~27s (xem mục điểm gãy số 2).

Lệnh `docker compose restart` trả về sau 28–34s, trễ vài giây so với mốc sẵn sàng trong log. Health qua
nginx trả 200 ngay khi lệnh đó trả về.

### reconnect 100, `--client-moi-nguoi` (22:15, CPU nền 28%)

| | Trước vá (21:49) | Sau vá |
|---|---:|---:|
| SSE mở lúc restart | 100/100 | 100/100 |
| SIGTERM → worker `startup complete` (log) | 49s | **29,3s** (dừng 5,3s vì còn SSE, `schema da san` 14,0s, import xong 29,2s) |
| `/api/health` 200 lại (script) ¹ | 57,8s | 40,4s |
| ≥95% SSE nối lại (tính từ lúc gọi restart) | 59,4s | **32,4s** |
| Lỗi trong 60s sau restart | 88% (503×812, kết nối×72) | **53%** (503×472, kết nối×62) |
| Lượt mở SSE hỏng trong lúc chết | 1353 | 700 |
| Mã nginx cho `/api/quotations/events` | 502×1288 | **503×700**, 200×200, không còn 502 |
| QueuePool / 500 / traceback trong log backend | 0 / 0 / 0 | 0 / 0 / 0 |

¹ Script chỉ bắt đầu dò health sau khi lệnh `docker compose restart` trả về, nên con số này trễ hơn thực tế.
Hàng "SIGTERM → startup complete" là mốc thật.

Toàn bộ 503 ở đây do nginx trả (`@api_loi`); log backend có 0 dòng 503. Lỗi "kết nối" (62) là các request
đang chạy dở thì bị cắt lúc backend dừng: nginx ghi 88 `Connection reset by peer` và 100 `upstream
prematurely closed` (100 luồng SSE đang mở).

**Kiểm trực tiếp 503 JSON trên luồng SSE:** `docker compose stop backend` rồi
`curl -i -H "Accept: text/event-stream" http://127.0.0.1:8460/api/quotations/events` trả về
`HTTP/1.1 503`, `Content-Type: application/json; charset=utf-8`, `Retry-After: 3`, `Cache-Control: no-store`,
thân `{"detail":"Máy chủ đang khởi động lại hoặc quá tải, vui lòng thử lại."}`.

### Kiểm lỗi

- **Traceback:** 0 trong log backend của cả 3 lần restart rảnh, lượt reconnect và lần stop/start để kiểm
  curl. Chỉ có 2 dòng `ERROR: Cancel 74/26 running task(s), timeout graceful shutdown exceeded`: uvicorn cắt
  luồng SSE sau 5s như thiết kế.
- **Không phục vụ trước `schema da san`:** xét cả 5 lần khởi động lại (3 lần rảnh, reconnect, stop/start),
  số dòng access log của tiến trình mới có mốc trước `schema da san` là **0**. Lần stop/start có 15s dừng
  xen giữa để chạy curl, nên không dùng để tính thời gian. Request đầu tiên luôn tới sau `Application startup complete`, và
  `startup complete` luôn sau `schema da san`.
- Chưa thử nhánh hỏng (`.loi`: chuẩn bị schema lỗi thì worker tự dừng). Lượt này không gây lỗi migration.

Tệp: `lan-chay/20260928-221505-reconnect-100-cm.md`. Log thô nằm trong scratch của phiên, không commit.
