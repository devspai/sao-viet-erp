"""Chuẩn bị schema + dữ liệu nền — chạy MỘT lần mỗi lần khởi động, TRƯỚC khi phục vụ request.

Tách khỏi lifespan vì nhiều worker: mỗi worker có lifespan riêng, để nguyên thì N worker cùng chạy
create_all + migration + seed song song — đua khoá DDL, đua INSERT `schema_migrations`. `serve.py`
gọi hàm này đúng một lần ở tiến trình cha, báo cho worker bỏ qua bằng biến `SVN_SCHEMA_DA_SAN=1`.
Chạy thẳng `uvicorn app.main:app` (máy dev, test) thì lifespan tự gọi như cũ.

Cha chuẩn bị SONG SONG với lúc worker import app (import mất 20–30 giây, đo tải 28/09/2026): chờ
chuẩn bị xong rồi mới bật worker là cộng dồn hai khoảng, restart chậm gấp đôi. Worker import xong thì
ĐỨNG ở lifespan (`cho_schema_san`) — chưa xong lifespan uvicorn chưa nhận request — tới khi cha đặt
tệp tín hiệu. Cha hỏng thì đặt tệp `.loi`: worker thôi chờ, tự dừng.
"""
from __future__ import annotations

import asyncio
import os

BIEN_DA_SAN = "SVN_SCHEMA_DA_SAN"
#: Đường tệp tín hiệu "schema đã sẵn" — cha tạo khi `chuan_bi` xong; `<đường>.loi` khi hỏng.
BIEN_TIN_HIEU = "SVN_SCHEMA_TIN_HIEU"


def schema_da_san() -> bool:
    return os.environ.get(BIEN_DA_SAN) == "1"


async def cho_schema_san(nhip: float = 0.2) -> None:
    """Worker chờ cha chuẩn bị xong. Không có biến tín hiệu (chạy tay) thì về ngay."""
    duong = os.environ.get(BIEN_TIN_HIEU)
    if not duong:
        return
    while not os.path.exists(duong):
        if os.path.exists(duong + ".loi"):
            raise RuntimeError("Chuẩn bị schema hỏng ở tiến trình cha — worker không khởi động.")
        await asyncio.sleep(nhip)


def chuan_bi() -> None:
    from .db import init_db
    from .db_migrations import run_migrations
    from .migrate import phien_migrate
    from .seed import seed_all
    from .storage import ensure_storage_ready

    # Tạo bucket MinIO nếu chưa có (no-op khi chạy LocalStorage — test/dev không Docker).
    ensure_storage_ready()
    # create_all + idempotent seed (RBAC catalog/roles + admin). Alembic is a later spec.
    init_db()
    # Phiên không hạn giờ câu lệnh (xem `migrate.phien_migrate`); không hạn chờ khoá vì lúc này
    # chưa worker nào phục vụ — chờ khoá chỉ có thể là tiến trình migrate khác, chờ là đúng.
    db = phien_migrate(cho_khoa_ms=None)()
    try:
        # create_all never ALTERs existing tables; run tracked additive migrations so the
        # persistent prod DB picks up new columns before seed/queries touch them.
        run_migrations(db)
        seed_all(db)
    finally:
        db.close()
