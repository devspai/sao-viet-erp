"""SEED_DEMO=false ⇒ seeder KHÔNG ghi gì vào DB (chủ chốt 28/09/2026).

Lỗi thật trên prod: `seed_departments` / `seed_roles` chạy NGOÀI cổng demo, tra theo TÊN ⇒ phòng
người dùng xoá (Hành chính nhân sự, Kinh doanh, Kho, Mua hàng) mọc lại với mã PB mới sau mỗi deploy.
"""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, func, select, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db import Base, SessionLocal
from app.khoi_tao_admin import khoi_tao_admin
from app.main import app
from app.models.department import Department
from app.models.employee import Employee
from app.models.module import Module
from app.models.role import Role, RolePermission
from app.models.user import User
from app.seed import MODULES, seed_all


def _db_trang():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    return eng, sessionmaker(bind=eng)()


def test_seed_all_tat_co_khong_ghi_bat_ky_dong_nao():
    assert settings.seed_demo is False
    eng, s = _db_trang()
    try:
        seed_all(s)
        s.commit()
        co_dong = {}
        with eng.connect() as c:
            for bang in Base.metadata.sorted_tables:
                n = c.execute(text(f'SELECT COUNT(*) FROM "{bang.name}"')).scalar_one()
                if n:
                    co_dong[bang.name] = n
        assert co_dong == {}, f"SEED_DEMO=false mà seed_all vẫn ghi: {co_dong}"
    finally:
        s.close()
        eng.dispose()


def test_phong_da_xoa_khong_moc_lai_sau_khoi_dong(client):
    db = SessionLocal()
    try:
        mua = db.execute(select(Department).where(Department.name == "Mua hàng")).scalar_one()
        vai = list(db.execute(select(Role.id).where(Role.department_id == mua.id)).scalars())
        db.execute(delete(RolePermission).where(RolePermission.role_id.in_(vai)))
        db.execute(delete(Role).where(Role.id.in_(vai)))
        db.delete(mua)
        db.commit()
        so_phong = db.execute(select(func.count(Department.id))).scalar_one()
        so_vai = db.execute(select(func.count(Role.id))).scalar_one()
    finally:
        db.close()

    # Khởi động lại app = đúng những gì một lần deploy làm (init_db + migrations + seed).
    with TestClient(app):
        pass

    db = SessionLocal()
    try:
        assert db.execute(
            select(Department).where(Department.name == "Mua hàng")
        ).scalar_one_or_none() is None
        assert db.execute(select(func.count(Department.id))).scalar_one() == so_phong
        assert db.execute(select(func.count(Role.id))).scalar_one() == so_vai
    finally:
        db.close()


def test_khoi_tao_admin_chi_dung_phan_toi_thieu_va_idempotent():
    eng, s = _db_trang()
    try:
        khoi_tao_admin(s)
        khoi_tao_admin(s)

        assert [d.name for d in s.execute(select(Department)).scalars()] == ["Ban giám đốc"]
        assert s.execute(select(func.count(Module.id))).scalar_one() == len(MODULES)
        users = list(s.execute(select(User)).scalars())
        assert [u.username for u in users] == [settings.seed_admin_username]
        admin = users[0]
        vai = s.get(Role, admin.role_id)
        assert vai is not None and vai.name == "Giám đốc"
        assert s.get(Department, admin.department_id).head_user_id == admin.id
        assert s.execute(
            select(func.count(Employee.id)).where(Employee.user_id == admin.id)
        ).scalar_one() == 1
    finally:
        s.close()
        eng.dispose()
