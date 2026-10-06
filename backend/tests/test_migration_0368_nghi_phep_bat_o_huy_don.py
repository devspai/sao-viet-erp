"""mg 0368 — vai đang GỬI được đơn nghỉ thì được bật sẵn ô "Huỷ đơn nghỉ của mình"; vai khác giữ nguyên."""

from __future__ import annotations

from app.db import SessionLocal
from app.db_migrations import _migrate_nghi_phep_bat_o_huy_don
from app.models.role import RolePermission
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository


def test_bat_o_huy_don_cho_vai_gui_duoc_don(client):
    s = SessionLocal()
    try:
        dept = DepartmentRepository(s).get_by_name("Sản xuất")
        roles = RoleRepository(s)
        gui = roles.create(name="Vai gửi đơn", department_id=dept.id)
        roles.set_permission(role_id=gui.id, module_key="nghi_phep", scope="own",
                             can_read=True, can_create=True, can_update=True)
        chi_xem = roles.create(name="Vai chỉ xem", department_id=dept.id)
        roles.set_permission(role_id=chi_xem.id, module_key="nghi_phep", scope="own", can_read=True)
        s.commit()
        gui_id, xem_id = gui.id, chi_xem.id
    finally:
        s.close()

    s = SessionLocal()
    try:
        _migrate_nghi_phep_bat_o_huy_don(s)
        _migrate_nghi_phep_bat_o_huy_don(s)  # chạy lại không sao

        def huy(role_id: int) -> bool:
            return s.query(RolePermission).filter_by(role_id=role_id, module_key="nghi_phep").one().can_cancel

        assert huy(gui_id) is True
        assert huy(xem_id) is False
    finally:
        s.close()
