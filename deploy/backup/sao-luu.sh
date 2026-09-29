#!/bin/sh
# Sao lưu Postgres + MinIO. Chạy trong service `backup` (deploy/backup/Dockerfile).
#
#   sao-luu.sh          vòng lặp: mỗi ngày chạy một lượt lúc BACKUP_GIO (giờ Việt Nam)
#   sao-luu.sh ngay     chạy MỘT lượt ngay rồi thoát (mã thoát 0 = OK, 1 = có bước lỗi)
#
# Một lượt:
#   1. pg_dump -Fc  → /backups/pg/<db>-YYYYmmdd-HHMM.dump   (ghi file tạm rồi mới đổi tên, kiểm
#      đọc lại được bằng pg_restore -l); dump OK mới xoá dump cũ hơn BACKUP_GIU_NGAY ngày.
#   2. rclone sync MinIO (mọi bucket) → /backups/minio. Tệp bị xoá/ghi đè bên MinIO KHÔNG mất ngay mà
#      chuyển vào /backups/minio-cu/<YYYYmmdd-HHMM>/, giữ BACKUP_GIU_NGAY ngày.
#   3. BACKUP_RCLONE_DICH có giá trị ⇒ rclone copy cả /backups lên đích ngoài VPS.
#   4. Ghi /backups/lan-cuoi.txt: thời điểm, kích thước, OK/LỖI từng bước.
# Một bước lỗi KHÔNG làm dừng các bước sau, cũng không giết vòng lặp — nhưng lan-cuoi.txt ghi LỖI,
# log container in rõ, và healthcheck (kiem-tra.sh) chuyển `unhealthy`.
#
# Biến môi trường (compose truyền vào):
#   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE   kết nối Postgres (biến chuẩn của libpq)
#   RCLONE_CONFIG_MINIO_*                       remote `minio:` (S3, provider Minio)
#   BACKUP_GIO          HH:MM, mặc định 02:00
#   BACKUP_GIU_NGAY     số ngày giữ bản cũ tại chỗ, mặc định 14
#   BACKUP_RCLONE_DICH  đích rclone ngoài VPS, vd `dich:svn-backup/prod`. RỖNG = chỉ lưu tại chỗ.
set -u

GOC=/backups
GIO=${BACKUP_GIO:-02:00}
GIU=${BACKUP_GIU_NGAY:-14}
DICH=${BACKUP_RCLONE_DICH:-}
DB=${PGDATABASE:-postgres}

# Nối không được (MinIO/đích ngoài đang chết, sai tên máy) thì báo LỖI sau ~2 phút thay vì để rclone thử
# lại theo mặc định — đã đo: tắt MinIO, mặc định treo quá 5 phút chưa dứt; với các cờ này 113 giây. --timeout là thời gian
# CHỜ KHÔNG CÓ DỮ LIỆU, không phải trần tổng, nên tải tệp lớn vẫn chạy bình thường.
RCLONE_THAM="--contimeout 15s --timeout 2m --retries 2 --low-level-retries 3 --log-level NOTICE"

log() { echo "[sao-luu $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

kich_thuoc() { du -sh "$1" 2>/dev/null | cut -f1; }

mot_luot() {
  bat_dau=$(date '+%Y-%m-%d %H:%M:%S')
  nhan=$(date '+%Y%m%d-%H%M')
  loi=""
  mkdir -p "$GOC/pg" "$GOC/minio" "$GOC/minio-cu"
  # File tạm của lượt trước bị cắt ngang (container bị dừng giữa chừng).
  find "$GOC/pg" -maxdepth 1 -name '.*.tam' -type f -delete 2>/dev/null

  # --- 1. Postgres ---------------------------------------------------------------------------
  ten="$DB-$nhan.dump"
  tam="$GOC/pg/.$ten.tam"
  log "Postgres: pg_dump $DB → pg/$ten"
  if pg_dump -Fc -f "$tam" && pg_restore -l "$tam" >/dev/null && mv "$tam" "$GOC/pg/$ten"; then
    kq_pg="OK — pg/$ten ($(kich_thuoc "$GOC/pg/$ten"))"
    # Chỉ dọn bản cũ khi bản mới đã chắc chắn tốt: dump hỏng liên tục thì bản cũ là thứ duy nhất
    # còn lại, không được để vòng dọn xoá nốt.
    find "$GOC/pg" -maxdepth 1 -name '*.dump' -type f -mtime +"$GIU" -print -delete
  else
    rm -f "$tam"
    loi="$loi postgres"
    kq_pg="LỖI — pg_dump thất bại, xem log container"
    log "LỖI: pg_dump thất bại"
  fi

  # --- 2. MinIO ------------------------------------------------------------------------------
  log "MinIO: rclone sync minio: → minio/ (bản bị xoá/ghi đè → minio-cu/$nhan)"
  if rclone sync minio: "$GOC/minio" --backup-dir "$GOC/minio-cu/$nhan" \
       $RCLONE_THAM; then
    kq_minio="OK — minio/ ($(kich_thuoc "$GOC/minio"))"
  else
    loi="$loi minio"
    kq_minio="LỖI — rclone sync thất bại, xem log container"
    log "LỖI: rclone sync MinIO thất bại"
  fi
  # Dọn minio-cu theo TÊN thư mục (YYYYmmdd-HHMM), không theo mtime.
  moc=$(date -d "@$(( $(date +%s) - GIU * 86400 ))" '+%Y%m%d')
  for d in "$GOC"/minio-cu/*/; do
    [ -d "$d" ] || continue
    ngay=$(basename "$d"); ngay=${ngay%%-*}
    case "$ngay" in *[!0-9]*|"") continue ;; esac
    if [ "$ngay" -lt "$moc" ]; then
      log "Dọn minio-cu/$(basename "$d") (cũ hơn $GIU ngày)"
      rm -rf "$d"
    fi
  done

  # --- 3. Đích ngoài VPS ---------------------------------------------------------------------
  if [ -n "$DICH" ]; then
    log "Đẩy /backups → $DICH"
    if rclone copy "$GOC" "$DICH" --exclude '.*' $RCLONE_THAM; then
      kq_dich="OK — $DICH"
    else
      loi="$loi dich_ngoai"
      kq_dich="LỖI — rclone copy lên $DICH thất bại, xem log container"
      log "LỖI: đẩy lên $DICH thất bại"
    fi
  else
    kq_dich="CHƯA CẤU HÌNH — chỉ lưu tại chỗ, KHÔNG chống được hỏng ổ đĩa/mất VPS (đặt BACKUP_RCLONE_DICH)"
  fi

  # --- 4. Báo cáo ----------------------------------------------------------------------------
  if [ -z "$loi" ]; then ket_qua="OK"; else ket_qua="LỖI (${loi# })"; fi
  {
    echo "Kết quả: $ket_qua"
    echo "Bắt đầu: $bat_dau  Xong: $(date '+%Y-%m-%d %H:%M:%S') (${TZ:-UTC})"
    echo "Postgres: $kq_pg"
    echo "MinIO: $kq_minio"
    echo "Đích ngoài: $kq_dich"
    echo "Tổng /backups: $(kich_thuoc "$GOC")"
  } > "$GOC/.lan-cuoi.tam" && mv "$GOC/.lan-cuoi.tam" "$GOC/lan-cuoi.txt"
  sed 's/^/[sao-luu] /' "$GOC/lan-cuoi.txt"
  # Bước 3 đã chép lan-cuoi.txt của lượt TRƯỚC; đẩy lại bản của lượt này để đích ngoài cũng biết.
  if [ -n "$DICH" ]; then
    rclone copyto "$GOC/lan-cuoi.txt" "$DICH/lan-cuoi.txt" $RCLONE_THAM || true
  fi
  [ -z "$loi" ]
}

case "${1:-}" in
  ngay)
    mot_luot
    exit $?
    ;;
  "")
    ;;
  *)
    echo "Cách dùng: sao-luu.sh [ngay]" >&2
    exit 2
    ;;
esac

case "$GIO" in
  [0-2][0-9]:[0-5][0-9]) ;;
  *) echo "BACKUP_GIO phải dạng HH:MM (vd 02:00), đang là '$GIO'" >&2; exit 2 ;;
esac

# `sleep & wait` để lệnh dừng container (SIGTERM) có hiệu lực ngay, không phải chờ hết giấc ngủ.
trap 'log "Nhận tín hiệu dừng"; exit 0' TERM INT

DANH_DAU="$GOC/.lich-da-chay"
mkdir -p "$GOC"
if [ -z "$DICH" ]; then
  log "CẢNH BÁO: BACKUP_RCLONE_DICH rỗng — bản sao chỉ nằm trên ổ đĩa VPS, hỏng đĩa là mất cả gốc lẫn bản sao."
fi
log "Chạy hằng ngày lúc $GIO (${TZ:-UTC}), giữ $GIU ngày. Chạy tay: docker compose exec backup sao-luu.sh ngay"
while :; do
  hom_nay=$(date '+%Y-%m-%d')
  if [ "$(date '+%H:%M')" = "$GIO" ] && [ "$(cat "$DANH_DAU" 2>/dev/null)" != "$hom_nay" ]; then
    # Đánh dấu TRƯỚC khi chạy: container khởi động lại trong cùng phút không chạy lượt thứ hai.
    echo "$hom_nay" > "$DANH_DAU"
    mot_luot || log "Lượt sao lưu có bước LỖI — xem /backups/lan-cuoi.txt"
  fi
  sleep 20 &
  wait $!
done
