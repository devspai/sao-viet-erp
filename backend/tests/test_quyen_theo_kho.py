"""Mỗi kho một dòng quyền `ton_kho_<id>` (05/10/2026, chủ chốt: "làm kho giống tổ đi, mỗi kho một
dòng").

Kiểm bằng HTTP thật: dòng tự sinh / đổi tên theo Khai báo kho; quyền ở kho A không mở kho B; đoạn
cập nhật DB 0369 chép quyền `ton_kho` cũ sang từng kho rồi gỡ khoá cũ.
"""
from __future__ import annotations

from sqlalchemy import text

from app.db import SessionLocal
from app.db_migrations import _migrate_ton_kho_moi_kho_mot_dong, _migrate_xem_gia_kho_theo_tung_man
from app.models.module import Module
from app.models.role import SCOPE_ALL, SCOPE_OWN, RolePermission
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.user_repo import UserRepository
from app.security import hash_password

from .test_kho_de_nghi import _admin, _login, _nhap, _setup

PW = "pw123456"


def _kho(client, h, ten: str) -> int:
    r = client.post("/api/kho", json={"ten": ten}, headers=h)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _nguoi(username: str, quyen: dict[str, dict]) -> None:
    db = SessionLocal()
    try:
        dept = DepartmentRepository(db).get_by_name("Sản xuất")
        roles, users = RoleRepository(db), UserRepository(db)
        r = roles.create(name=f"Vai {username}", department_id=dept.id)
        for khoa, co in quyen.items():
            roles.set_permission(role_id=r.id, module_key=khoa, **co)
        u = users.create(username=username, name=username, password_hash=hash_password(PW))
        users.set_assignment(u, department_id=dept.id, role_id=r.id, is_active=True)
        db.commit()
    finally:
        db.close()


def _nhan_module(key: str) -> str | None:
    db = SessionLocal()
    try:
        m = db.query(Module).filter(Module.key == key).first()
        return m.label if m else None
    finally:
        db.close()


def test_khai_kho_la_co_dong_quyen_mang_ten_kho(client):
    h = _admin(client)
    kid = _kho(client, h, "Kho giấy")
    assert _nhan_module(f"ton_kho_{kid}") == "Kho giấy"

    r = client.put(f"/api/kho/{kid}", json={"ten": "Kho giấy cuộn"}, headers=h)
    assert r.status_code == 200, r.text
    assert _nhan_module(f"ton_kho_{kid}") == "Kho giấy cuộn"

    mods = {m["key"]: m for m in client.get("/api/rbac/modules", headers=h).json()}
    dong = mods[f"ton_kho_{kid}"]
    assert dong["kho_id"] == kid
    assert dong["viec_chet"] == ["create", "delete", "update"]
    assert "ton_kho" not in mods, "khoá chung cũ không được bày lại"

    # Ngừng dùng: GIỮ dòng (bật lại không mất quyền) nhưng ma trận không bày, đúng như thanh bên.
    assert client.delete(f"/api/kho/{kid}", headers=h).status_code in (200, 204)
    assert _nhan_module(f"ton_kho_{kid}") == "Kho giấy cuộn"
    mods = {m["key"] for m in client.get("/api/rbac/modules", headers=h).json()}
    assert f"ton_kho_{kid}" not in mods


def test_quyen_kho_a_khong_mo_kho_b(client):
    kho_a, mat = _setup(client)  # nhân vật đề nghị / duyệt / thủ kho để `_nhap` chạy được
    h = _admin(client)
    kho_b = _kho(client, h, "Kho B")
    _nhap(client, kho_id=kho_a, mat_id=mat, qty=5, gia=1000)
    _nhap(client, kho_id=kho_b, mat_id=mat, qty=7, gia=1000)
    _nguoi("qk_chi_a", {
        f"ton_kho_{kho_a}": dict(can_read=True, can_set_threshold=True, scope=SCOPE_ALL),
    })
    u = _login(client, "qk_chi_a")

    def lo(kho_id: int | None) -> int:
        params = {"kho_id": kho_id} if kho_id is not None else {}
        return client.get("/api/kho/phieu/lo/danh-sach", headers=u, params=params).status_code

    assert lo(kho_a) == 200
    assert lo(kho_b) == 403, "có dòng Kho A mà đọc được lô Kho B"
    assert lo(None) == 403, "không chọn kho = gộp mọi kho, mà người này không xem được Kho B"

    def nguong(kho_id: int) -> int:
        return client.put("/api/kho/nguong-ton", headers=u, json={
            "hang_loai": mat[0], "hang_id": mat[1], "kho_id": kho_id, "nguong_ton": 3,
        }).status_code

    assert nguong(kho_a) == 200
    assert nguong(kho_b) == 403
    client.put("/api/kho/nguong-ton", headers=h, json={
        "hang_loai": mat[0], "hang_id": mat[1], "kho_id": kho_b, "nguong_ton": 4})
    thay = {t["kho_id"] for t in client.get("/api/kho/nguong-ton", headers=u).json()}
    assert thay == {kho_a}, "danh sách ngưỡng lộ kho không được xem"

    # Danh sách kho (thanh bên dựng mục kho từ đây) phải mở cho người chỉ có dòng kho.
    assert client.get("/api/kho", headers=u).status_code == 200


def test_luu_ma_tran_ep_pham_vi_tat_ca_o_dong_kho(client):
    h = _admin(client)
    kid = _kho(client, h, "Kho ép phạm vi")
    db = SessionLocal()
    try:
        dept = DepartmentRepository(db).get_by_name("Sản xuất")
        role_id = RoleRepository(db).create(name="Vai ép phạm vi", department_id=dept.id).id
        db.commit()
    finally:
        db.close()
    r = client.put(f"/api/roles/{role_id}/permissions", headers=h, json={"permissions": [
        {"module_key": f"ton_kho_{kid}", "can_read": True, "scope": SCOPE_OWN},
    ]})
    assert r.status_code == 200, r.text
    dong = next(x for x in r.json() if x["module_key"] == f"ton_kho_{kid}")
    assert dong["scope"] == SCOPE_ALL


def test_migration_0369_chep_quyen_cu_sang_tung_kho(client):
    h = _admin(client)
    kho_a, kho_b = _kho(client, h, "Kho mg A"), _kho(client, h, "Kho mg B")
    db = SessionLocal()
    try:
        # Dựng lại trạng thái TRƯỚC mg 0369: khoá chung `ton_kho`, chưa có dòng theo kho.
        db.execute(text("DELETE FROM role_permissions WHERE module_key LIKE 'ton\\_kho\\_%' ESCAPE '\\'"))
        db.execute(text("DELETE FROM modules WHERE key LIKE 'ton\\_kho\\_%' ESCAPE '\\'"))
        db.add(Module(key="ton_kho", label="Tồn kho"))
        dept = DepartmentRepository(db).get_by_name("Sản xuất")
        roles = RoleRepository(db)
        thu_kho = roles.create(name="Vai mg thủ kho", department_id=dept.id)
        roles.set_permission(role_id=thu_kho.id, module_key="ton_kho", can_read=True,
                             can_set_threshold=True, scope=SCOPE_ALL)
        db.commit()
        thu_kho_id = thu_kho.id
    finally:
        db.close()

    db = SessionLocal()
    try:
        _migrate_ton_kho_moi_kho_mot_dong(db)
        _migrate_ton_kho_moi_kho_mot_dong(db)  # chạy lại vô hại
        assert db.query(Module).filter(Module.key == "ton_kho").first() is None
        assert db.query(RolePermission).filter(RolePermission.module_key == "ton_kho").count() == 0
        for kid, ten in ((kho_a, "Kho mg A"), (kho_b, "Kho mg B")):
            assert db.query(Module).filter(Module.key == f"ton_kho_{kid}").one().label == ten
            p = db.query(RolePermission).filter_by(role_id=thu_kho_id,
                                                    module_key=f"ton_kho_{kid}").one()
            assert (p.can_read, p.can_set_threshold, p.scope) == (True, True, SCOPE_ALL)
    finally:
        db.close()


def test_xem_gia_theo_tung_man_kho(client):
    """Mỗi màn kho một ô "Xem giá thành" (05/10/2026, chủ chốt: *"kho giấy tôi bật giá thành thì xem
    được giá thành trong kho giấy, mấy kho kia không bật thì không; yêu cầu nhập xuất không bật là
    không xem được"*). Đo trên chính các cửa ba màn gọi, qua HTTP thật."""
    kho_a, mat = _setup(client)
    h = _admin(client)
    kho_b = _kho(client, h, "Kho B giá")
    _nhap(client, kho_id=kho_a, mat_id=mat, qty=5, gia=1000)
    _nhap(client, kho_id=kho_b, mat_id=mat, qty=7, gia=2000)
    xem = dict(can_read=True, scope=SCOPE_ALL)
    _nguoi("qg_gia_a", {
        "kho": dict(can_read=True, can_create=True, scope=SCOPE_ALL),
        f"ton_kho_{kho_a}": {**xem, "can_view_cost": True},
        f"ton_kho_{kho_b}": dict(xem),
        "bao_cao_kho": dict(xem),
    })
    _nguoi("qg_gia_yc", {
        "kho": dict(can_read=True, can_create=True, can_view_cost=True, scope=SCOPE_ALL),
        f"ton_kho_{kho_a}": dict(xem),
        "bao_cao_kho": {**xem, "can_view_cost": True},
    })

    def gia_lo(u, kho_id: int, man: str | None = None):
        params = {"kho_id": kho_id, **({"man": man} if man else {})}
        r = client.get("/api/kho/phieu/lo/danh-sach", headers=u, params=params)
        assert r.status_code == 200, r.text
        return {x["don_gia_nhap"] for x in r.json()}

    def gia_lich_su(u, kho_id: int, man: str):
        r = client.get(f"/api/kho/phieu/mat-hang/{mat[0]}/{mat[1]}/lich-su", headers=u,
                       params={"kho_id": kho_id, "man": man})
        assert r.status_code == 200, r.text
        return {x["don_gia_nhap"] for x in r.json()["nhap"]}

    def gia_bao_cao(u):
        r = client.get("/api/kho/bao-cao/dong", headers=u)
        assert r.status_code == 200, r.text
        return {x["don_gia"] for x in r.json()["items"]}

    a = _login(client, "qg_gia_a")
    assert gia_lo(a, kho_a) == {1000}, "bật giá ở Kho A mà màn Kho A không thấy giá"
    assert gia_lich_su(a, kho_a, "ton") == {1000}
    assert gia_lo(a, kho_b) == {None}, "giá Kho A mở luôn giá Kho B"
    assert gia_lo(a, kho_a, "yeu_cau") == {None}, "giá Kho A mở luôn giá ở Yêu cầu nhập xuất"
    assert gia_bao_cao(a) == {None}, "giá Kho A mở luôn giá ở Báo cáo kho"

    yc = _login(client, "qg_gia_yc")
    assert gia_lo(yc, kho_a, "yeu_cau") == {1000}
    assert gia_lo(yc, kho_a) == {None}, "giá Yêu cầu nhập xuất mở luôn giá ở màn Kho A"
    assert gia_lich_su(yc, kho_a, "bao_cao") == {1000}
    assert gia_bao_cao(yc) >= {1000, 2000}
    assert client.get("/api/kho/phieu/lo/danh-sach", headers=yc,
                      params={"kho_id": kho_a, "man": "khac"}).status_code == 422


def test_migration_0370_chep_gia_chung_sang_tung_man(client):
    h = _admin(client)
    kid = _kho(client, h, "Kho mg giá")
    db = SessionLocal()
    try:
        dept = DepartmentRepository(db).get_by_name("Sản xuất")
        roles = RoleRepository(db)
        ke_toan = roles.create(name="Vai mg kế toán", department_id=dept.id)
        roles.set_permission(role_id=ke_toan.id, module_key="kho", can_read=True,
                             can_view_cost=True, scope=SCOPE_ALL)
        roles.set_permission(role_id=ke_toan.id, module_key=f"ton_kho_{kid}", can_read=True,
                             scope=SCOPE_ALL)
        roles.set_permission(role_id=ke_toan.id, module_key="bao_cao_kho", can_read=True,
                             scope=SCOPE_ALL)
        thu_kho = roles.create(name="Vai mg thủ kho giá", department_id=dept.id)
        roles.set_permission(role_id=thu_kho.id, module_key="kho", can_read=True, scope=SCOPE_ALL)
        roles.set_permission(role_id=thu_kho.id, module_key=f"ton_kho_{kid}", can_read=True,
                             scope=SCOPE_ALL)
        db.commit()
        kt_id, tk_id = ke_toan.id, thu_kho.id
    finally:
        db.close()

    db = SessionLocal()
    try:
        _migrate_xem_gia_kho_theo_tung_man(db)
        _migrate_xem_gia_kho_theo_tung_man(db)  # chạy lại vô hại

        def gia(role_id: int, khoa: str) -> bool:
            return db.query(RolePermission).filter_by(role_id=role_id, module_key=khoa).one().can_view_cost

        assert gia(kt_id, f"ton_kho_{kid}") and gia(kt_id, "bao_cao_kho")
        assert not gia(tk_id, f"ton_kho_{kid}"), "vai không có giá chung lại được bật giá"
    finally:
        db.close()
