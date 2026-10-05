"""User data access. All SQL goes through SQLAlchemy bound parameters (no string
formatting of input — docs/SECURITY.md)."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.user import User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, user_id: int) -> User | None:
        return self.db.get(User, user_id)

    def get_by_username(self, username: str) -> User | None:
        """Resolve the login identifier (spec-0001). A blank value never matches."""
        if not username:
            return None
        stmt = select(User).where(User.username == username)
        return self.db.execute(stmt).scalar_one_or_none()

    def username_da_dung(self, username: str) -> bool:
        """Tên đăng nhập đã có người dùng chưa — so KHÔNG phân biệt hoa/thường (23/09/2026).

        Ràng buộc UNIQUE của cột chỉ chặn trùng y hệt, nên "Admin" với "admin" từng tạo được hai
        tài khoản mà người đọc thì thấy là một tên. Đăng nhập vẫn so khớp chính xác như cũ."""
        ten = (username or "").strip()
        if not ten:
            return False
        stmt = select(User.id).where(func.lower(User.username) == ten.lower()).limit(1)
        return self.db.execute(stmt).first() is not None

    def next_code(self) -> str:
        """Next sequential ACCOUNT code: 'TK' + zero-padded number. Tiền tố 'TK' tách khỏi
        employees.code ('NV###') để không nhầm tài khoản với hồ sơ (Đ1). Dựa max số TK hiện
        có nên mã không tái dùng dù có xoá."""
        max_n = 0
        for code in self.db.execute(select(User.code)).scalars():
            if code and code.startswith("TK"):
                try:
                    max_n = max(max_n, int(code[2:]))
                except ValueError:
                    continue
        return f"TK{max_n + 1:03d}"

    def create(self, *, username: str, name: str, password_hash: str,
               commit: bool = True) -> User:
        """`commit=False`: chỉ flush (có id ngay), người gọi chốt cả thao tác một lần."""
        user = User(
            username=username,
            name=name,
            password_hash=password_hash,
            code=self.next_code(),
        )
        self.db.add(user)
        if commit:
            self.db.commit()
            self.db.refresh(user)
        else:
            self.db.flush()
        return user

    def set_assignment(
        self,
        user: User,
        *,
        department_id: int | None,
        role_id: int | None,
        is_active: bool = True,
        commit: bool = True,
    ) -> User:
        """Set a user's department + role (RBAC assignment)."""
        user.department_id = department_id
        user.role_id = role_id
        user.is_active = is_active
        if commit:
            self.db.commit()
            self.db.refresh(user)
        return user

    def set_name(self, user: User, name: str) -> User:
        """Update the user's display name (self-service profile edit, spec-04)."""
        user.name = name
        self.db.commit()
        self.db.refresh(user)
        return user

    def set_avatar(self, user: User, avatar_url: str | None) -> User:
        """Set or clear the user's avatar path (spec-04)."""
        user.avatar_url = avatar_url
        self.db.commit()
        self.db.refresh(user)
        return user

    def sync_from_employee(self, user: User, *, name: str, department_id: int | None,
                           avatar_url: str | None = None, commit: bool = True) -> User:
        """Đồng bộ 1 chiều HỒ SƠ→TÀI KHOẢN (Đ1: hồ sơ là nguồn) — tên hiển thị + phòng
        (data-scope RBAC). Ảnh CHỈ ghi khi hồ sơ CÓ ảnh (tránh xoá avatar tài khoản khi hồ sơ
        chưa có ảnh). KHÔNG đụng role."""
        user.name = name
        user.department_id = department_id
        if avatar_url:
            user.avatar_url = avatar_url
        if commit:
            self.db.commit()
            self.db.refresh(user)
        return user

    def set_password(self, user: User, password_hash: str) -> User:
        """Replace the user's bcrypt password hash (self-service change, spec-04)."""
        user.password_hash = password_hash
        self.db.commit()
        self.db.refresh(user)
        return user

    def set_role(self, user: User, role_id: int | None) -> User:
        user.role_id = role_id
        self.db.commit()
        self.db.refresh(user)
        return user

    def set_role_many(self, users: list[User], role_id: int | None) -> None:
        """Gán vai cho cả lô rồi chốt MỘT lần — kèm luôn mọi thứ người gọi đã thêm vào phiên
        (vd dòng nhật ký `audit.create_many`), nên lô sống hoặc chết cùng nhau."""
        for user in users:
            user.role_id = role_id
        self.db.commit()

    def set_active(self, user: User, is_active: bool, *, commit: bool = True) -> User:
        user.is_active = is_active
        if commit:
            self.db.commit()
            self.db.refresh(user)
        return user

    def bump_token_version(self, user: User, *, commit: bool = True) -> User:
        """Invalidate every outstanding access token for the user (logout-all / lock)."""
        user.token_version = (user.token_version or 0) + 1
        if commit:
            self.db.commit()
            self.db.refresh(user)
        return user

    def list_all(self) -> list[User]:
        return list(self.db.execute(select(User).order_by(User.id)).scalars())

    def map_by_ids(self, user_ids) -> dict[int, User]:
        """`{id: User}` trong MỘT truy vấn — cho các danh sách tra tên người (tài khoản của hồ sơ,
        người thao tác trên nhật ký) thay vì `get_by_id` từng dòng. Đừng tưởng identity map của
        Session gánh hộ: nó chỉ giữ tham chiếu YẾU, object của vòng trước bị dọn là vòng sau lại
        SELECT (đo được 39 câu SELECT users cho trang 20 nhân viên)."""
        ids = sorted({int(i) for i in (user_ids or []) if i is not None})
        if not ids:
            return {}
        return {u.id: u for u in self.db.execute(select(User).where(User.id.in_(ids))).scalars()}

    def count(self) -> int:
        from sqlalchemy import func

        return self.db.execute(select(func.count()).select_from(User)).scalar_one()

    def count_by_role(self, role_id: int) -> int:
        from sqlalchemy import func

        return self.db.execute(
            select(func.count()).select_from(User).where(User.role_id == role_id)
        ).scalar_one()

    def list_ids_by_role(self, role_id: int) -> list[int]:
        return list(self.db.execute(select(User.id).where(User.role_id == role_id)).scalars())

    def count_by_department(self, department_id: int) -> int:
        from sqlalchemy import func

        return self.db.execute(
            select(func.count()).select_from(User).where(User.department_id == department_id)
        ).scalar_one()

    def counts_by_department(self) -> dict[int, int]:
        """`{department_id: số tài khoản}` của MỌI phòng trong MỘT truy vấn."""
        return dict(self.db.execute(
            select(User.department_id, func.count())
            .where(User.department_id.is_not(None))
            .group_by(User.department_id)
        ).all())

    def list_by_department(self, department_id: int) -> list[User]:
        stmt = select(User).where(User.department_id == department_id).order_by(User.id)
        return list(self.db.execute(stmt).scalars())

    def list_by_departments(self, department_ids) -> list[User]:
        """Tài khoản của NHIỀU phòng trong MỘT truy vấn, sắp theo id."""
        ids = sorted({int(i) for i in (department_ids or [])})
        if not ids:
            return []
        stmt = select(User).where(User.department_id.in_(ids)).order_by(User.id)
        return list(self.db.execute(stmt).scalars())

    def get_many(self, user_ids) -> dict[int, User]:
        """`{id: User}` của nhiều tài khoản trong MỘT truy vấn; id không có thì vắng mặt."""
        ids = sorted({int(i) for i in (user_ids or []) if i is not None})
        if not ids:
            return {}
        return {u.id: u for u in self.db.execute(select(User).where(User.id.in_(ids))).scalars()}
