"""Chạy schema (create_all + migration) RỜI KHỎI app — để deploy migrate TRƯỚC khi thay container.

Vì sao tồn tại (chốt 2026-08-09): migration vẫn chạy trong lifespan của app (`main.py`), nhưng nếu
CHỈ có đường đó thì migration lỗi ⇒ container MỚI chết ⇒ mà container cũ thì `docker compose up -d`
đã thay rồi ⇒ mất dịch vụ. Staging chết 21 giờ đúng theo đường này: migration 0171 raise, app không
khởi động nổi, `docker compose ps` vẫn đẹp nên Actions xanh.

Deploy nay gọi file này bằng **container tạm** (`docker compose run --rm backend python -m
app.migrate`) trước bước `up -d`. Migration lỗi thì script deploy dừng tại đó và **app cũ vẫn đang
phục vụ** — không ai mất gì ngoài một lần deploy đỏ.

Chạy hai lần vô hại: mỗi bước đã ghi id vào `schema_migrations` nên lượt sau là no-op. Nhờ vậy
lifespan của app vẫn gọi `run_migrations` như cũ, không phải sửa gì ở đó.

CỐ Ý KHÔNG làm ở đây: `ensure_storage_ready` (MinIO chết không được phép chặn migration), seed dữ
liệu, ticker SSE. File này chỉ lo SCHEMA.
"""
from __future__ import annotations

import time

from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from .config import settings
from .db import SessionLocal, init_db
from .db_migrations import run_migrations

# Deploy migrate trong lúc app CŨ vẫn đang phục vụ. `ALTER TABLE` cần khoá độc quyền; nếu phải xếp
# hàng sau một truy vấn dài thì MỌI truy vấn tới bảng đó sau nó cũng xếp hàng theo ⇒ cả hệ thống
# đứng hình chừng nào ALTER còn chờ. Hạn chờ khoá ngắn: không lấy được thì BỎ, đợi chút rồi thử lại,
# để người đang dùng chỉ khựng tối đa vài giây mỗi lần.
_CHO_KHOA_MS = 5_000
_SO_LAN_THU = 12
_NGHI_GIUA_LAN = 5.0


def phien_migrate(*, cho_khoa_ms: int | None = _CHO_KHOA_MS):
    """Phiên RIÊNG cho migration: KHÔNG mang `statement_timeout` của app (một câu backfill trên bảng
    lớn chạy quá 2 phút là chuyện thường, cắt ngang giữa chừng là migration đỏ) và — khi
    `cho_khoa_ms` có giá trị — mang hạn chờ khoá ngắn (xem trên)."""
    url = settings.database_url
    if not url.startswith("postgresql"):
        return SessionLocal
    tuy_chon = "-c statement_timeout=0"
    if cho_khoa_ms:
        tuy_chon += f" -c lock_timeout={cho_khoa_ms}"
    eng = create_engine(url, connect_args={"options": tuy_chon}, poolclass=NullPool)
    return sessionmaker(bind=eng, autocommit=False, autoflush=False)


def _la_loi_cho_khoa(exc: OperationalError) -> bool:
    return getattr(getattr(exc, "orig", None), "pgcode", None) == "55P03"  # lock_not_available


def main() -> int:
    init_db()
    tao_phien = phien_migrate()
    for lan in range(1, _SO_LAN_THU + 1):
        db = tao_phien()
        try:
            # Mỗi migration đã ghi id vào `schema_migrations` khi xong ⇒ thử lại chỉ chạy phần còn thiếu.
            run_migrations(db)
            break
        except OperationalError as exc:
            db.rollback()
            if not _la_loi_cho_khoa(exc) or lan == _SO_LAN_THU:
                raise
            print(f"migration: bảng đang bận, thử lại lần {lan + 1}/{_SO_LAN_THU}…")
            time.sleep(_NGHI_GIUA_LAN)
        finally:
            db.close()
    print("migration OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
