"""Tạo tài khoản quản trị cho DB TRẮNG — chạy tay MỘT lần, TRONG container:

    docker compose run --rm backend python -m app.khoi_tao_admin

Vì sao phải có lệnh này: từ 28/09/2026 `SEED_DEMO=false` ⇒ seeder lúc khởi động KHÔNG ghi gì vào
DB (xem `seed.seed_all`), nên DB prod mới dựng không có ai đăng nhập được. Lệnh này chỉ dựng đúng
phần tối thiểu để vào hệ thống — KHÔNG phòng ban nào khác, KHÔNG danh mục nào:

  - phòng "Ban giám đốc" + vai "Giám đốc" (đủ quyền) nếu chưa có;
  - tài khoản `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` nếu chưa có (có rồi thì KHÔNG đổi mật khẩu);
  - gắn tài khoản đó vào phòng + vai trên, làm trưởng phòng, kèm hồ sơ nhân sự trống.

Idempotent: chạy lại không tạo trùng. Yêu cầu backend đã khởi động ít nhất một lần (đã có bảng).
"""
from __future__ import annotations

from .config import settings
from .db import SessionLocal
from .repositories.rbac_repo import DepartmentRepository
from .repositories.user_repo import UserRepository
from .seed import (
    ADMIN_DEPARTMENT,
    backfill_employee_profiles,
    dong_bo_danh_muc_he_thong,
    link_admin,
    seed_admin,
    seed_roles,
)


def khoi_tao_admin(db) -> None:
    dong_bo_danh_muc_he_thong(db)
    depts = DepartmentRepository(db)
    if depts.get_by_name(ADMIN_DEPARTMENT) is None:
        depts.create(name=ADMIN_DEPARTMENT)
    seed_roles(db, chi_phong=ADMIN_DEPARTMENT)
    seed_admin(db)
    link_admin(db)
    admin = UserRepository(db).get_by_username(settings.seed_admin_username)
    backfill_employee_profiles(db, chi_user_id=admin.id)
    db.commit()


def main() -> int:
    db = SessionLocal()
    try:
        khoi_tao_admin(db)
    finally:
        db.close()
    print(f"== Đã sẵn sàng tài khoản quản trị '{settings.seed_admin_username}' "
          f"({ADMIN_DEPARTMENT}) ==")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
