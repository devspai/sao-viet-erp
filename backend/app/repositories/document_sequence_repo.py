"""Document Sequence Repository — atomic counter generation for document codes.
"""
from __future__ import annotations

import re

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session
from ..models.document_sequence import DocumentSequence

class DocumentSequenceRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def cap_ma(self, doc_type: str, year: int, col, prefix: str, *, rong: int = 4) -> str:
        """Mã kế tiếp `prefix + số` cấp qua bộ đếm — hai người tạo cùng lúc KHÔNG nhận cùng một mã.

        Thay cho kiểu "đếm/lấy max rồi +1": hai request đọc cùng một số rồi cùng ghi ⇒ vỡ UNIQUE
        (500) hoặc — với kiểu ĐẾM — xoá một bản ghi là mã kế trùng mã đang có. Câu UPDATE giữ khoá
        dòng bộ đếm tới lúc commit nên người sau xếp hàng sau người trước.

        Bộ đếm luôn được đẩy lên ít nhất bằng số lớn nhất ĐANG CÓ trong cột `col` (dữ liệu cũ sinh
        trước khi có bộ đếm, mã nhập tay) — không bao giờ cấp một mã đã tồn tại.
        `doc_type` quá 32 ký tự bị cắt: hai loại chung một bộ đếm chỉ làm dãy số có khoảng trống,
        mã vẫn khác nhau vì tiền tố khác nhau.
        """
        san = so_lon_nhat(self.db, col, prefix)
        so = self._tang_tu_san(doc_type[:32], year, san)
        return f"{prefix}{so:0{rong}d}"

    def _tang_tu_san(self, doc_type: str, year: int, san: int) -> int:
        dat = {"doc_type": doc_type, "year": year, "san": san}
        if self.db.bind.dialect.name == "postgresql":
            self.db.execute(text(
                "INSERT INTO document_sequences (doc_type, year, current_number) "
                "VALUES (:doc_type, :year, :san) ON CONFLICT (doc_type, year) DO NOTHING"
            ), dat)
            return self.db.execute(text(
                "UPDATE document_sequences SET current_number = "
                "CASE WHEN current_number < :san THEN :san ELSE current_number END + 1 "
                "WHERE doc_type = :doc_type AND year = :year RETURNING current_number"
            ), dat).scalar_one()
        self.db.execute(text(
            "INSERT OR IGNORE INTO document_sequences (doc_type, year, current_number) "
            "VALUES (:doc_type, :year, :san)"
        ), dat)
        self.db.execute(text(
            "UPDATE document_sequences SET current_number = "
            "CASE WHEN current_number < :san THEN :san ELSE current_number END + 1 "
            "WHERE doc_type = :doc_type AND year = :year"
        ), dat)
        return self.db.execute(text(
            "SELECT current_number FROM document_sequences WHERE doc_type = :doc_type AND year = :year"
        ), dat).scalar_one()

    def increment_and_get(self, doc_type: str, year: int) -> int:
        """Atomic UPSERT and increment of the sequence for (doc_type, year).

        Returns the new incremented sequence number.

        KHÔNG commit: bộ đếm đi CHUNG giao dịch với chứng từ gọi nó. Trước 25/08/2026 hàm này
        tự `commit()`, nên khi việc lập chứng từ hỏng ở bước sau, mọi thay đổi ORM đang dở
        (đã bị cú commit đó cuốn theo) nằm lại DB — vụ lệnh sản xuất kẹt `da_phat_hanh` mà
        không có công việc nào là do đây. Nay hỏng ở đâu cũng rollback trọn vẹn, số cấp dở bị
        trả lại. Trên Postgres câu UPSERT giữ khoá dòng tới lúc commit ⇒ vẫn không cấp trùng.
        """
        dialect_name = self.db.bind.dialect.name
        
        if dialect_name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(DocumentSequence).values(doc_type=doc_type, year=year, current_number=1)
            stmt = stmt.on_conflict_do_update(
                index_elements=["doc_type", "year"],
                set_=dict(current_number=DocumentSequence.current_number + 1)
            ).returning(DocumentSequence.current_number)
            return self.db.execute(stmt).scalar_one()
        else:
            # Fallback for SQLite (tests/local development)
            # 1. Insert with 0 if not exists
            self.db.execute(
                text(
                    "INSERT OR IGNORE INTO document_sequences (doc_type, year, current_number) "
                    "VALUES (:doc_type, :year, 0)"
                ),
                {"doc_type": doc_type, "year": year}
            )
            # 2. Increment by 1
            self.db.execute(
                text(
                    "UPDATE document_sequences SET current_number = current_number + 1 "
                    "WHERE doc_type = :doc_type AND year = :year"
                ),
                {"doc_type": doc_type, "year": year}
            )
            # 3. Select current value
            val = self.db.execute(
                text(
                    "SELECT current_number FROM document_sequences "
                    "WHERE doc_type = :doc_type AND year = :year"
                ),
                {"doc_type": doc_type, "year": year}
            ).scalar_one()
            return val


def so_lon_nhat(db: Session, col, prefix: str) -> int:
    """Số lớn nhất sau `prefix` trong cột mã `col` (0 nếu chưa có).

    Hỏi DB vài dòng thay vì kéo cả cột: sắp **dài trước, lớn sau** nên vẫn đúng khi vượt số chữ số
    (`PBT-10000` dài hơn `PBT-9999`). `limit(5)` để một mã lạc kiểu `PBT-XX` không làm tắc; cả 5
    dòng đều lạc thì mới quét đủ.
    """
    rx = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    rows = db.execute(
        select(col).where(col.like(f"{prefix}%"))
        .order_by(func.length(col).desc(), col.desc()).limit(5)
    ).scalars()
    for ma in rows:
        m = rx.match((ma or "").strip().upper())
        if m:
            return int(m.group(1))
    mx = 0
    for ma in db.execute(select(col).where(col.like(f"{prefix}%"))).scalars():
        m = rx.match((ma or "").strip().upper())
        if m:
            mx = max(mx, int(m.group(1)))
    return mx
