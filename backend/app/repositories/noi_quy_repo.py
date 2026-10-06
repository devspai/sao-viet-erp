"""Truy cập dữ liệu cho danh mục tài liệu nội quy."""
from __future__ import annotations

from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.noi_quy import NoiQuyRecord
from ..models.user import User
from .loc_danh_sach import dk_khoang_ngay

# Điều kiện "Loại tệp" của thanh lọc → các MIME được nhận lúc tải lên.
LOAI_TEP = {
    "pdf": ("application/pdf",),
    "anh": ("image/png", "image/jpeg", "image/webp"),
}


class NoiQuyRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _search_stmt(self, stmt, q: str | None, *, nguoi: int | None = None,
                     loai: str | None = None, tu_ngay: date | None = None,
                     den_ngay: date | None = None):
        """Gắn OUTER JOIN users + điều kiện tìm cho `stmt`.

        Vì sao OUTER chứ không INNER: `uploaded_by` trỏ tới user có thể đã bị xoá — INNER JOIN
        là những bản ghi đó BIẾN MẤT khỏi danh sách (và khỏi `total`), người dùng tưởng tài liệu
        bị xoá theo người. Join 1-0..1 nên không nhân đôi dòng.

        Tìm cả TÊN NGƯỜI UPLOAD là cố ý: trước 09/08/2026 màn lọc ở client và có tìm theo người
        upload; đẩy `q` lên máy chủ mà bỏ cột này là người dùng thấy tính năng tự nhiên hụt đi."""
        stmt = stmt.outerjoin(User, NoiQuyRecord.uploaded_by == User.id)
        # Thanh lọc (06/10/2026): kỳ theo Ngày tải lên (mốc `tao`), Người tải lên, Loại tệp.
        for dk in dk_khoang_ngay(NoiQuyRecord.uploaded_at, tu_ngay, den_ngay):
            stmt = stmt.where(dk)
        if nguoi is not None:
            stmt = stmt.where(NoiQuyRecord.uploaded_by == nguoi)
        if loai in LOAI_TEP:
            stmt = stmt.where(NoiQuyRecord.file_type.in_(LOAI_TEP[loai]))
        key = (q or "").strip()
        if not key:
            return stmt
        like = f"%{key}%"
        return stmt.where(or_(
            NoiQuyRecord.code.ilike(like),
            NoiQuyRecord.name.ilike(like),
            NoiQuyRecord.file_name.ilike(like),
            NoiQuyRecord.note.ilike(like),
            User.name.ilike(like),
            User.username.ilike(like),
        ))

    def list_all(self, *, q: str | None = None, limit: int | None = None,
                 offset: int = 0, **loc) -> list[NoiQuyRecord]:
        """`limit=None` = trả trọn bảng (hành vi cũ, giữ cho mọi lời gọi không phân trang).
        `loc`: `nguoi`, `loai`, `tu_ngay`, `den_ngay` — xem `_search_stmt`."""
        stmt = self._search_stmt(select(NoiQuyRecord), q, **loc).order_by(
            NoiQuyRecord.uploaded_at.desc(), NoiQuyRecord.id.desc()
        )
        if limit is not None:
            stmt = stmt.limit(limit).offset(offset)
        return list(self.db.execute(stmt).scalars())

    def count(self, *, q: str | None = None, **loc) -> int:
        """Đếm ở DB (không `len(list_all())`) — nuôi số "Tổng N tài liệu" ở chân bảng."""
        stmt = self._search_stmt(
            select(func.count(NoiQuyRecord.id)).select_from(NoiQuyRecord), q, **loc
        )
        return int(self.db.execute(stmt).scalar_one())

    def dem_theo_nguoi_tai(self) -> list[tuple[int, str, int]]:
        """`[(user_id, tên, số tài liệu)]` — giá trị cho điều kiện "Người tải lên". Người đã bị
        xoá tài khoản vẫn có dòng (tên "Người dùng đã xóa") để lọc được tài liệu của họ."""
        rows = self.db.execute(
            select(NoiQuyRecord.uploaded_by, User.name, User.username, func.count(NoiQuyRecord.id))
            .outerjoin(User, NoiQuyRecord.uploaded_by == User.id)
            .group_by(NoiQuyRecord.uploaded_by, User.name, User.username)
        ).all()
        kq = [(uid, (ten or tai_khoan or "Người dùng đã xóa"), so) for uid, ten, tai_khoan, so in rows]
        return sorted(kq, key=lambda r: r[1].lower())

    def get(self, record_id: int) -> NoiQuyRecord | None:
        return self.db.get(NoiQuyRecord, record_id)

    def code_exists(self, code: str) -> bool:
        return self.db.execute(
            select(NoiQuyRecord.id).where(NoiQuyRecord.code == code)
        ).scalar_one_or_none() is not None

    def create(self, **values) -> NoiQuyRecord:
        row = NoiQuyRecord(**values)
        self.db.add(row)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise
        self.db.refresh(row)
        return row

    def delete(self, row: NoiQuyRecord) -> None:
        self.db.delete(row)
        self.db.commit()
