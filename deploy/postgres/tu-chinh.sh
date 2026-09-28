#!/bin/sh
# Tự chỉnh Postgres theo RAM của CONTAINER rồi mới khởi động — thay cho cấu hình mặc định của image
# (shared_buffers 128MB, work_mem 4MB… vốn dành cho máy 1GB), để cùng một file compose chạy đúng trên
# VPS 4GB hay 32GB mà không ai phải nhớ sửa tay.
#
# Chạy làm `entrypoint` của service `db` trong docker-compose.yml (image postgres:16-alpine, POSIX sh).
# Cuối cùng `exec` sang entrypoint gốc của image nên mọi thứ khác (initdb lần đầu, POSTGRES_* …) giữ
# nguyên hành vi cũ.
#
# Biến môi trường (đặt trong `.env`, compose truyền vào):
#   PG_MAX_CONNECTIONS  max_connections, mặc định 200. PHẢI khớp biến cùng tên của backend — backend
#                       dùng nó làm ngân sách kết nối chung chia cho các worker.
#   PG_LOG_CHAM_MS      ghi log câu SQL chạy lâu hơn bấy nhiêu ms, mặc định 1000. -1 = tắt.
#
# Muốn thêm tham số tay: khai `command: ["-c", "ten=gia_tri", ...]` cho service db — tham số đó nối
# SAU các giá trị tự tính nên thắng chúng. (Compose đặt `entrypoint` thì CMD gốc `postgres` của image
# bị bỏ, nên "$@" mặc định rỗng.)
set -eu

MB=$((1024 * 1024))

# RAM container được dùng: giới hạn cgroup v2 → cgroup v1 → MemTotal của máy. Lấy số NHỎ nhất vì
# container không giới hạn thì cgroup báo "max" (v2) hoặc một số khổng lồ (v1).
ram_mb=""
if [ -r /proc/meminfo ]; then
  ram_mb=$(awk '/^MemTotal:/ { printf "%d", $2 / 1024 }' /proc/meminfo)
fi
gioi_han=""
if [ -r /sys/fs/cgroup/memory.max ]; then
  gioi_han=$(cat /sys/fs/cgroup/memory.max)
elif [ -r /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
  gioi_han=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)
fi
case "$gioi_han" in
  ""|max) ;;
  *[!0-9]*) ;;
  *)
    gh_mb=$((gioi_han / MB))
    if [ -z "$ram_mb" ] || [ "$gh_mb" -lt "$ram_mb" ]; then
      ram_mb=$gh_mb
    fi
    ;;
esac
# Không đọc được gì (hiếm) ⇒ giả định 1GB — thấp một chút còn hơn đặt quá tay rồi Postgres bị OOM.
[ -n "$ram_mb" ] && [ "$ram_mb" -gt 0 ] || ram_mb=1024

max_conn=${PG_MAX_CONNECTIONS:-200}
log_cham=${PG_LOG_CHAM_MS:-1000}

gioi_han_tren() { if [ "$1" -gt "$2" ]; then echo "$2"; else echo "$1"; fi; }
gioi_han_duoi() { if [ "$1" -lt "$2" ]; then echo "$2"; else echo "$1"; fi; }

# shared_buffers 25% RAM, trần 8GB (vượt mức đó lợi ích giảm, checkpoint nặng thêm).
shared_buffers=$(gioi_han_tren $((ram_mb / 4)) 8192)
shared_buffers=$(gioi_han_duoi "$shared_buffers" 128)
# effective_cache_size 65%: chỉ là GỢI Ý cho planner (RAM còn lại làm page cache), không cấp phát.
effective_cache=$((ram_mb * 65 / 100))
# maintenance_work_mem RAM/16, trần 1GB — VACUUM/CREATE INDEX nhanh hơn, không ăn RAM lúc thường.
maintenance=$(gioi_han_tren $((ram_mb / 16)) 1024)
maintenance=$(gioi_han_duoi "$maintenance" 64)
# work_mem: 25% RAM chia đều cho max_connections, sàn 4MB, trần 64MB. Một câu SQL có thể dùng vài
# lần work_mem (mỗi nút sort/hash một phần) nên chia theo max_connections là mức an toàn.
work_mem=$(( (ram_mb / 4) / max_conn ))
work_mem=$(gioi_han_duoi "$work_mem" 4)
work_mem=$(gioi_han_tren "$work_mem" 64)

echo "[tu-chinh] RAM container ${ram_mb}MB → max_connections=${max_conn}" \
  "shared_buffers=${shared_buffers}MB effective_cache_size=${effective_cache}MB" \
  "maintenance_work_mem=${maintenance}MB work_mem=${work_mem}MB" \
  "log_min_duration_statement=${log_cham}ms"

exec docker-entrypoint.sh postgres \
  -c "max_connections=${max_conn}" \
  -c "shared_buffers=${shared_buffers}MB" \
  -c "effective_cache_size=${effective_cache}MB" \
  -c "maintenance_work_mem=${maintenance}MB" \
  -c "work_mem=${work_mem}MB" \
  -c "log_min_duration_statement=${log_cham}" \
  -c "log_lock_waits=on" \
  -c "log_checkpoints=on" \
  "$@"
