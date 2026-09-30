# Đo tải — giả lập N người dùng đồng thời

Bộ công cụ đo sức chịu tải của ERP trên một stack Docker giống prod (Postgres + Redis + MinIO + backend
+ nginx), chạy trên máy dev, TÁCH HẲN khỏi DB dev. Dùng để đo trước/sau mỗi đợt tối ưu
(`ket-qua/truoc.md`, `ket-qua/sau.md`) và mỗi lần thêm tính năng lớn.

| File | Việc |
|---|---|
| `do_tai.py` | Chạy trên HOST. asyncio + httpx, N người dùng ảo, 4 kịch bản, in bảng markdown + ghi file. |
| `tao_du_lieu.py` | Chạy TRONG container backend. Tạo tài khoản `tai_NNN`, hồ sơ NV, vai, tổ, ca, điểm chấm công. |
| `ket-qua/` | `truoc.md` (nền), `sau.md` (sau sửa), `lan-chay/` (bảng thô từng lượt). |

Yêu cầu host: Docker Desktop, Python ≥ 3.10 với `httpx` (bắt buộc) và `psutil` (không bắt buộc — để
ghi CPU máy phát tải).

## 1. Dựng stack đo tải từ một thư mục mã nguồn bất kỳ

Stack đo tải dựng từ `docker-compose.yml` của CHÍNH thư mục mã nguồn cần đo — lượt "trước" dựng từ
commit gốc, lượt "sau" dựng từ code đã sửa. Để không đụng code đang làm dở, tạo worktree riêng:

```bash
# commit cần đo (vd HEAD của nhánh sau khi sửa)
git worktree add --detach ../do-tai-src <commit>
cd ../do-tai-src
```

Tạo `.env.tai` ở gốc thư mục đó (đã bị `.gitignore` chặn qua mẫu `.env.*`, KHÔNG commit):

```dotenv
COMPOSE_PROJECT_NAME=erp-svn-tai
COMPOSE_PROFILES=db,redis,minio,backend,web        # KHÔNG caddy
POSTGRES_USER=tai
POSTGRES_PASSWORD=<ngẫu nhiên ≥ 32 ký tự>
POSTGRES_DB=svn_tai                                  # tao_du_lieu.py đòi tên này
POSTGRES_PORT=5460
REDIS_PORT=6460
MINIO_API_PORT=9460
MINIO_CONSOLE_PORT=9461
MINIO_ROOT_USER=<ngẫu nhiên>
MINIO_ROOT_PASSWORD=<ngẫu nhiên>
MINIO_BUCKET=svn-files
WEB_PORT=8460
WEB_BIND=127.0.0.1
JWT_SECRET=<ngẫu nhiên ≥ 32 ký tự>
ACCESS_TOKEN_EXPIRE_MINUTES=15
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=<ngẫu nhiên>
SEED_DEMO=false
CORS_ORIGINS=http://localhost:8460
VITE_API_BASE_URL=
```

Sinh chuỗi ngẫu nhiên: `python -c "import secrets; print(secrets.token_hex(32))"`.
Cổng 54xx/64xx/94xx/84xx cố ý lệch khỏi stack dev (5433/6380/9010/9002) và prod/staging.

```bash
docker compose -p erp-svn-tai --env-file .env.tai up -d --build
docker compose -p erp-svn-tai ps          # backend "Up", web "Up"
curl http://127.0.0.1:8460/api/health     # {"status":"ok"...}
```

Lần đầu backend chạy `create_all` + toàn bộ migration + seed nền (phòng ban, vai, admin) — đợi tới khi
`/api/health` trả 200. Máy dev mà Docker Desktop chỉ cấp ~2 GB RAM thì bước `npm run build` của image
`web` là bước nặng nhất; tắt bớt container khác nếu nó bị kill.

Đo lại với code MỚI trên cùng project: `down` (giữ volume) rồi `up -d --build` từ thư mục mã mới —
migration mới tự chạy trên DB cũ, dữ liệu `tai_*` còn nguyên. Muốn DB trắng thì xem mục 4.

## 2. Tạo dữ liệu

Chạy từ thư mục chứa `scripts/do-tai/` (worktree có script), stack đang chạy:

```bash
docker compose -p erp-svn-tai cp scripts/do-tai/tao_du_lieu.py backend:/tmp/tao_du_lieu.py
docker compose -p erp-svn-tai exec backend python /tmp/tao_du_lieu.py --so-nguoi 400 --mat-khau "$TAI_PASSWORD"
```

(`docker compose -p <project> cp/exec` không cần đứng trong thư mục compose.)

Script từ chối chạy nếu `DATABASE_URL` không chứa `svn_tai`. Nó tạo (idempotent):

- 4 tổ lá "Tổ đo tải 1..4" dưới phòng "Sản xuất" (bật cờ khối sản xuất) + dòng quyền theo tổ.
- Vai "Công nhân đo tải" = quyền vai "Thợ SX" của seed + 3 ô mặc định + Xem bàn tổ phần của mình.
- Vai "Quản lý đo tải" (mỗi tài khoản thứ 10: `tai_010`, `tai_020`…) = toàn quyền 21 màn có badge
  (báo giá, đơn hàng, sản xuất, kho, nghỉ phép, tăng ca, chấm công, lương, kế hoạch vật tư…) + trọn
  các tổ ⇒ chùm badge nặng nhất khi mở app.
- Ca "Ca đo tải" bắt đầu 30 phút TRƯỚC lúc chạy script, dài 10 tiếng. **Chấm VÀO chỉ hợp lệ trong
  khung ca** ⇒ đo ở buổi khác thì chạy lại script (nó dời ca về giờ hiện tại).
- Điểm chấm công "Điểm đo tải" (10.7769, 106.7009) bán kính 5000 m.
- `tai_001..tai_N`, mật khẩu chung, hồ sơ NV đang làm, gắn ca trên.

Trước MỖI lượt `daudca` phải xoá chấm công cũ, không thì lượt 2 là RA, lượt 3 bị chặn "đã RA ca chính":

```bash
docker compose -p erp-svn-tai exec backend python /tmp/tao_du_lieu.py --so-nguoi 1 --mat-khau x --chi-xoa-cham-cong
```

(`--chi-xoa-cham-cong` chỉ xoá lượt chấm của hồ sơ `tai_*` và dời ca về giờ hiện tại, không đụng tài
khoản; hai tham số kia vẫn phải có cho đúng cú pháp.)

## 3. Chạy kịch bản

```bash
export TAI_PASSWORD=...            # PowerShell: $env:TAI_PASSWORD="..."
python scripts/do-tai/do_tai.py --users 200 --kich-ban daudca    --thoi-gian 150
python scripts/do-tai/do_tai.py --users 200 --kich-ban bando     --thoi-gian 150
python scripts/do-tai/do_tai.py --users 200 --kich-ban reconnect --thoi-gian 120
python scripts/do-tai/do_tai.py --users 200 --kich-ban anh       --may-id <id in ra bởi tao_du_lieu.py> --client-moi-nguoi --seed 1
```

| Kịch bản | Mô phỏng |
|---|---|
| `daudca` | N người vào dàn đều trong 60–120s (ngẫu nhiên). Mỗi người mở app (login → quyền → chùm badge + SSE) rồi: status chấm công → `POST /api/attendance/check` → status + logs. Giữ SSE tới hết giờ. |
| `bando` | N người mở app (dàn 30s), rồi mỗi 3–8s: status chấm công, quyền, 2 badge ngẫu nhiên trong chùm của họ, `/api/san-xuat/teams` + `work-items` của tổ mình (nếu có bàn tổ). |
| `reconnect` | N người mở app + giữ SSE; khi ≥95% đã nối, script chạy `docker compose -p erp-svn-tai restart backend`. Đo thời gian tới khi ≥95% SSE nối lại (client chờ CỐ ĐỊNH 3s như FE hiện tại) và lỗi request trong 60s sau restart. |
| `anh` | N người mở app, mỗi lần mở màn kéo `--anh-moi-man` ảnh qua `/api/files` (cookie `file_access`, có ETag ⇒ lượt sau 304), gửi ảnh đại diện đã nén (`--anh-nho-kb`, xoá ảnh cũ bị thay), và cứ 10 người có 1 quản lý tạo phiếu sửa chữa trên máy `MAY-DO-TAI` rồi gửi `--so-anh-lon` ảnh GỐC (`--anh-lon-mb`) cùng lúc. Tối đa `--luot-gui` lượt gửi/người. Báo cáo thêm MB lên/xuống và RAM đỉnh backend/minio. |

Tham số khác:
- `--base` (mặc định `http://127.0.0.1:8460`), `--project` (mặc định `erp-svn-tai`).
- `--seed <n>`: lặp lại được phân bố thời gian. Lượt nền dùng `--seed 1`, lượt "sau" phải dùng đúng số này.
- `--dan <giây>`: ghi đè thời gian dàn người vào.
- `--ket-noi-moi-nguoi` (mặc định 6): trần kết nối httpx = N × số này (pool chung), hoặc trần của mỗi
  client khi dùng `--client-moi-nguoi`.
- `--client-moi-nguoi`: mỗi người dùng ảo một client riêng (6 kết nối, như một trình duyệt). **Nên dùng
  từ ~50 người trở lên.** Mặc định (một pool chung, giữ nguyên để so với lượt nền) thì chính máy phát tải
  nghẽn: pool httpcore quét mọi kết nối cho mỗi request, pool vài trăm–vài nghìn kết nối ăn hết một lõi,
  request xếp hàng ở client hàng chục giây trong khi nginx ghi `rt` < 1s. Đối chiếu bằng `rt=` trong log
  nginx (`docker compose -p erp-svn-tai logs web`). File kết quả có hậu tố `-cm`.
- `--cho-may-ranh <%>` (mặc định 40): chờ CPU host xuống dưới ngưỡng, tối đa 5 phút. Đặt `101` thì không
  chờ nhưng vẫn ghi CPU nền.
- `--ra <file.md>`, `--khong-docker-stats`, `--verbose`.

Kịch bản `reconnect`: người mở app hỏng sẽ thử lại sau 3–8s, như người dùng F5. Hai kịch bản kia thì người
mở app hỏng bỏ cuộc luôn, để đo đúng lần mở app đầu tiên.

Giữa hai lượt, đợi `/api/health` trả < 2s vài lần liền. Sau một lượt quá tải, backend có thể còn xử lý
dồn hàng thêm vài phút, và lượt kế tiếp chạy vào lúc đó thì số đo sai.

Đọc kết quả: request "thường" tách khỏi lượt mở SSE (kết nối dài). Mã lỗi `timeout` = quá 60s không
có phản hồi; `ket_noi` = lỗi mạng/đóng kết nối. CPU container backend đo bằng `docker stats` mỗi ~5s,
100% = một lõi — backend 1 tiến trình mà đứng ở ~100% là nghẽn CPU của chính nó. CPU host là CPU
toàn máy Windows (gồm cả máy phát tải + Docker VM); host ≥ 90% thì số đo bị máy phát tải làm méo.

Bằng chứng log sau mỗi lượt:

```bash
docker compose -p erp-svn-tai logs backend --tail 200 | grep -i -E "error|timeout|QueuePool"
```

## 4. Dọn

```bash
docker compose -p erp-svn-tai stop                 # tạm dừng, giữ dữ liệu
docker compose -p erp-svn-tai down                 # xoá container, GIỮ volume (DB svn_tai còn)
docker compose -p erp-svn-tai down -v              # xoá luôn volume đo tải (pgdata/miniodata) — không khôi phục được
git worktree remove ../do-tai-src                  # bỏ worktree mã nguồn đo
```

Mọi lệnh đều có `-p erp-svn-tai` — không bao giờ chạm container/volume của stack dev (`erp-svn-local`)
hay prod/staging.
