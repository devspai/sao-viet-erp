"""Tìm kiếm TƯƠNG ĐỐI — bỏ dấu tiếng Việt ở CẢ HAI phía (ô tìm và cột trong DB).

Chủ xưởng 18/09/2026: *"phải cho tìm kiếm tương đối nữa"* — gõ `can mang` phải ra "Cán màng",
gõ `Ép Kim` phải ra "ép kim". Ô tìm của nền danh mục (`catalog_base._loc_q`) chỉ `lower().like()`
nên khớp chữ-có-dấu với chữ-có-dấu, người khai gõ không dấu là ra rỗng.

Bỏ dấu phía DB KHÔNG dùng `unaccent` của Postgres: `unaccent` là EXTENSION, phải
`CREATE EXTENSION` trên từng database (dev, CI, prod) — một câu SQL ngoài `db_migrations.py` mà
quên ở đâu là màn đó ăn 500. Thay vào đó mỗi phương ngữ một cách, cùng MỘT bảng `BANG`:

  * Postgres: `translate(lower(col), 'àả…', 'aa…')` — hàm sẵn có, một tầng.
  * SQLite (bộ test): hàm Python `bo_dau` đăng ký lúc mở kết nối (`app/db.py`).

Bản đầu (18/09/2026) lồng 68 tầng REPLACE — chạy được trên SQLite 3.50 ở máy dev nhưng SQLite
cũ hơn trên CI báo `parser stack overflow`. Đừng quay lại kiểu lồng.

Chỉ cần bảng chữ THƯỜNG: cả hai phía đã `lower()` trước khi thay.
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement
from sqlalchemy.types import String

from ..van_ban import BANG, bo_dau  # noqa: F401  (re-export: chỗ cũ vẫn import từ đây)


class _BoDau(FunctionElement):
    """`bỏ_dấu(lower(col))` — biên dịch khác nhau theo phương ngữ, xem docstring đầu file."""

    type = String()
    inherit_cache = True
    name = "bo_dau"


@compiles(_BoDau)
def _bo_dau_mac_dinh(element, compiler, **kw):
    # SQLite: hàm `bo_dau` đăng ký ở `app/db.py` (tự hạ chữ thường bên trong).
    return f"bo_dau({compiler.process(element.clauses, **kw)})"


@compiles(_BoDau, "postgresql")
def _bo_dau_pg(element, compiler, **kw):
    nguon = "".join(BANG)
    dich = "".join(BANG.values())
    return (
        f"translate(lower({compiler.process(element.clauses, **kw)}), "
        f"'{nguon}', '{dich}')"
    )


def bo_dau_sql(col):
    """Biểu thức SQL `bỏ_dấu(lower(col))` — một tầng, chạy cả SQLite lẫn Postgres."""
    return _BoDau(col)


def like_khong_dau(col, q: str | None):
    """Điều kiện `col` KHỚP TƯƠNG ĐỐI `q` (chứa, không phân biệt dấu/hoa-thường). `None` khi ô
    tìm trống — chỗ gọi tự hiểu là "không lọc gì"."""
    kim = bo_dau(q)
    if not kim:
        return None
    return bo_dau_sql(col).like(f"%{kim}%")
