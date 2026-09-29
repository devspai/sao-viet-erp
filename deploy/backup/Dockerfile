# Sao lưu Postgres + MinIO hằng ngày (service `backup` trong docker-compose.yml, profile `backup`).
# Dựa trên postgres:16-alpine để có `pg_dump`/`pg_restore` ĐÚNG phiên bản server (dump bằng client cũ
# hơn server là lỗi). rclone lo phần MinIO và đẩy bản sao ra ngoài VPS.
FROM postgres:16-alpine

RUN apk add --no-cache rclone tzdata \
 && mkdir -p /config/rclone && touch /config/rclone/rclone.conf

# Remote rclone khai bằng biến môi trường RCLONE_CONFIG_<TÊN>_* (compose + .env.backup). Tệp cấu hình
# rỗng chỉ để rclone thôi in "Config file not found" mỗi lượt.
ENV TZ=Asia/Ho_Chi_Minh \
    RCLONE_CONFIG=/config/rclone/rclone.conf

COPY sao-luu.sh kiem-tra.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/sao-luu.sh /usr/local/bin/kiem-tra.sh

# Bỏ entrypoint của image postgres (nó khởi động một server Postgres) — container này chỉ chạy vòng
# lặp sao lưu.
ENTRYPOINT []
CMD ["sao-luu.sh"]
