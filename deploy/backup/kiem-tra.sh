#!/bin/sh
# Healthcheck của service `backup`: `docker compose ps` hiện `unhealthy` khi
#   - lượt sao lưu gần nhất có bước LỖI, hoặc
#   - lượt gần nhất đã quá 26 giờ (vòng lặp chết/kẹt, lỡ lịch).
# Chưa có lượt nào (container mới dựng, chưa tới BACKUP_GIO) thì coi là khoẻ.
F=/backups/lan-cuoi.txt
[ -f "$F" ] || exit 0
head -n1 "$F" | grep -q '^Kết quả: OK' || { head -n1 "$F"; exit 1; }
[ -n "$(find "$F" -mmin -1560)" ] || { echo "Lượt sao lưu cuối đã quá 26 giờ"; exit 1; }
exit 0
