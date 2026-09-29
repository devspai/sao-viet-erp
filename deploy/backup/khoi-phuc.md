# Sao lưu & khôi phục (Postgres + MinIO)

Service `backup` trong `docker-compose.yml` (profile `backup`) mỗi ngày lúc `BACKUP_GIO` (mặc định
02:00 giờ Việt Nam) chạy [`sao-luu.sh`](sao-luu.sh) một lượt:

| Thứ được sao lưu | Nằm ở (trong volume `backups`, mount `/backups`) | Giữ bao lâu |
| --- | --- | --- |
| Postgres — `pg_dump -Fc` | `/backups/pg/<db>-YYYYmmdd-HHMM.dump` | `BACKUP_GIU_NGAY` ngày (14) |
| MinIO — bản sao y hệt mọi bucket | `/backups/minio/<bucket>/…` | luôn là bản mới nhất |
| MinIO — tệp đã bị xoá/ghi đè kể từ lượt trước | `/backups/minio-cu/YYYYmmdd-HHMM/<bucket>/…` | `BACKUP_GIU_NGAY` ngày |
| Kết quả lượt gần nhất | `/backups/lan-cuoi.txt` | — |

Mọi lệnh dưới đây chạy ở thư mục app trên VPS (nơi có `docker-compose.yml` + `.env`), vd
`/var/www/erp-svn`. Các biến `$POSTGRES_USER`, `$POSTGRES_DB` lấy từ `.env`: nạp trước bằng
`set -a; . ./.env; set +a`.

> **Bản sao tại chỗ KHÔNG chống được hỏng ổ đĩa hay mất VPS** — volume `backups` nằm cùng ổ với dữ
> liệu gốc. Phải cấu hình đích ngoài VPS (mục 4).

## 1. Bật và kiểm tra

```bash
# .env: thêm `backup` vào COMPOSE_PROFILES, vd  COMPOSE_PROFILES=db,redis,minio,backend,web,caddy,backup
docker compose up -d --build backup

docker compose exec backup sao-luu.sh ngay          # chạy thử một lượt ngay, in kết quả
docker compose exec backup cat /backups/lan-cuoi.txt
docker compose exec backup ls -lh /backups/pg
docker compose ps backup                              # "unhealthy" = lượt cuối LỖI hoặc >26 giờ chưa chạy
docker compose logs --tail 100 backup
```

## 2. Khôi phục Postgres

Các bước dưới đây đã diễn tập thật trên stack thử (28/09/2026).

**a) Luôn thử vào database TẠM trước** — xem dump có đọc được, dữ liệu có đúng không, mà không đụng DB
đang chạy:

```bash
DUMP=/backups/pg/<tên-tệp>.dump                      # chọn trong: docker compose exec backup ls -lh /backups/pg

docker compose exec backup createdb khoi_phuc_thu
docker compose exec backup pg_restore --no-owner --exit-on-error -d khoi_phuc_thu "$DUMP"
docker compose exec backup psql -d khoi_phuc_thu -c "select count(*) from users"
docker compose exec backup dropdb khoi_phuc_thu        # xong thì xoá
```

(Container `backup` có sẵn `PGHOST/PGUSER/PGPASSWORD` trỏ vào service `db`, nên các lệnh client
Postgres chạy thẳng, không cần gõ mật khẩu.)

**b) Khôi phục đè vào DB thật** — mất mọi thay đổi SAU thời điểm dump:

```bash
# 1. Dừng backend để không ai ghi thêm trong lúc khôi phục (người dùng tạm thấy báo lỗi máy chủ).
docker compose stop backend

# 2. (Nên) dump nhanh trạng thái hiện tại phòng khi cần lấy lại gì đó:
docker compose exec backup sh -c 'pg_dump -Fc -f /backups/pg/truoc-khoi-phuc-$(date +%Y%m%d-%H%M).dump'

# 3. Khôi phục: --clean --if-exists xoá rồi tạo lại từng đối tượng có trong dump.
docker compose exec backup pg_restore --clean --if-exists --no-owner -d "$POSTGRES_DB" "$DUMP"

# 4. Bật lại
docker compose start backend
docker compose ps
```

`--clean` chỉ xoá những bảng/đối tượng CÓ trong dump. Bảng tạo ra sau thời điểm dump (migration mới)
vẫn nằm lại — backend khởi động sẽ chạy migration như bình thường. Muốn sạch tuyệt đối thì thay bước 3
bằng: `dropdb "$POSTGRES_DB" && createdb "$POSTGRES_DB" && pg_restore --no-owner -d "$POSTGRES_DB" "$DUMP"`.

Khôi phục trên VPS MỚI: dựng `db` + `minio` + `backup` trước (`COMPOSE_PROFILES=db,minio,backup`), kéo
bản sao từ đích ngoài về volume `backups` (mục 4c), khôi phục như bước b, rồi mới bật đủ profile.

## 3. Khôi phục MinIO (tệp đính kèm, ảnh, chứng từ)

**Lấy lại tệp bị mất/xoá nhầm** — chép ngược, KHÔNG xoá gì bên MinIO:

```bash
docker compose exec backup rclone copy /backups/minio minio: --log-level NOTICE
# Chỉ một bucket / một thư mục:
docker compose exec backup rclone copy /backups/minio/svn-files/kcs minio:svn-files/kcs
# Tệp đã bị xoá/ghi đè TRƯỚC lượt sao lưu gần nhất thì nằm ở minio-cu:
docker compose exec backup ls /backups/minio-cu
docker compose exec backup rclone copy /backups/minio-cu/<YYYYmmdd-HHMM>/svn-files minio:svn-files
```

**Đưa MinIO về ĐÚNG trạng thái lúc sao lưu** (xoá cả tệp tạo sau đó — thường đi cùng khôi phục
Postgres về cùng thời điểm):

```bash
docker compose exec backup rclone sync /backups/minio minio: --log-level NOTICE
```

Bucket chưa tồn tại (VPS mới) thì `rclone copy/sync` tự tạo.

## 4. Đích ngoài VPS (bắt buộc cho prod)

`sao-luu.sh` đẩy cả `/backups` lên `BACKUP_RCLONE_DICH` bằng `rclone copy` (không bao giờ xoá gì ở
đích) sau mỗi lượt. Khai hai chỗ:

**a) `.env`** (cùng các biến khác): `BACKUP_RCLONE_DICH=dich:<bucket-hoặc-thư-mục>/<môi-trường>`

**b) `.env.backup`** (tệp mới, cạnh `.env`, KHÔNG commit — `.gitignore` đã chặn `.env.*`): định nghĩa
remote tên `dich` bằng biến `RCLONE_CONFIG_DICH_*` (mỗi khoá cấu hình rclone viết HOA). Ví dụ:

```bash
# Backblaze B2 (rẻ; tạo "Application Key" giới hạn đúng một bucket)
RCLONE_CONFIG_DICH_TYPE=b2
RCLONE_CONFIG_DICH_ACCOUNT=<keyID>
RCLONE_CONFIG_DICH_KEY=<applicationKey>
# .env:  BACKUP_RCLONE_DICH=dich:svn-backup/prod

# S3 bất kỳ (AWS, Cloudflare R2, Wasabi, MinIO khác…)
RCLONE_CONFIG_DICH_TYPE=s3
RCLONE_CONFIG_DICH_PROVIDER=AWS                 # hoặc Cloudflare / Wasabi / Minio / Other
RCLONE_CONFIG_DICH_ACCESS_KEY_ID=<...>
RCLONE_CONFIG_DICH_SECRET_ACCESS_KEY=<...>
RCLONE_CONFIG_DICH_REGION=ap-southeast-1
RCLONE_CONFIG_DICH_ENDPOINT=                    # R2/Wasabi: URL endpoint của nhà cung cấp
# .env:  BACKUP_RCLONE_DICH=dich:svn-backup/prod

# Google Drive: lấy token trên máy CÓ trình duyệt bằng `rclone authorize "drive"`, dán JSON nhận được
RCLONE_CONFIG_DICH_TYPE=drive
RCLONE_CONFIG_DICH_SCOPE=drive.file
RCLONE_CONFIG_DICH_TOKEN='{"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}'
# .env:  BACKUP_RCLONE_DICH=dich:svn-backup/prod
```

Rồi: `docker compose up -d backup` (nạp lại biến) → `docker compose exec backup sao-luu.sh ngay` →
dòng "Đích ngoài: OK" trong kết quả. Kiểm tay: `docker compose exec backup rclone lsd dich:`.

**c) Kéo bản sao từ đích ngoài về** (VPS mới, hoặc đĩa cũ đã hỏng):

```bash
docker compose exec backup rclone copy "$BACKUP_RCLONE_DICH" /backups --log-level NOTICE
```

Lưu ý:
- Prod và staging chung VPS thì mỗi môi trường một đường dẫn đích riêng (`…/prod`, `…/stg`).
- `rclone copy` không xoá ở đích nên đích lớn dần: đặt quy tắc vòng đời (lifecycle) của bucket xoá
  tệp cũ hơn N ngày, hoặc dọn định kỳ `rclone delete --min-age 60d dich:svn-backup/prod/pg`.
- Tài khoản đích nên chỉ có quyền ghi vào đúng bucket đó — VPS bị chiếm thì kẻ tấn công cũng không
  xoá được các bản sao cũ (với B2/S3 bật thêm object lock/versioning).
