"""CRM-360 analytics API (spec-06) — KPIs, tier, dashboard, history, Excel.

Every figure MUST be computed from real orders/quotations; a customer with no history
returns honest zeros / has_data=False (never fabricated numbers).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.db import SessionLocal
from app.models.order import Order, OrderLine
from app.models.quotation import Quote, QuoteVersion
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.user_repo import UserRepository
from app.security import create_access_token, hash_password
from app.seed import seed_customers, seed_kd_staff

ADMIN = {"username": "admin", "password": "admin123"}


def _admin_token(client) -> str:
    return client.post("/api/auth/login", json=ADMIN).json()["access_token"]


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_staff_customers() -> None:
    db = SessionLocal()
    try:
        seed_kd_staff(db)
        seed_customers(db)
    finally:
        db.close()


def _customer_id_by_name(fragment: str) -> int:
    from app.repositories.customer_repo import CustomerRepository

    db = SessionLocal()
    try:
        from app.seed import _SeedActor

        for c in CustomerRepository(db).list_scoped_all(scope="all", actor=_SeedActor()):
            if fragment in c.name:
                return c.id
    finally:
        db.close()
    raise AssertionError(f"no customer matching {fragment!r}")


def _add_orders(customer_id: int, sale_username: str) -> None:
    """Add two priced orders (one this month, one ~2 months ago) + a sent quotation."""
    db = SessionLocal()
    try:
        sale = UserRepository(db).get_by_username(sale_username)
        now = datetime.now(timezone.utc)
        for months_ago, desc, qty, unit in [
            (0, "Catalogue A4", 2, 12_000_000),
            (2, "Name card", 5000, 900),
        ]:
            o = Order(
                order_no=f"DHX{months_ago}",
                customer_id=customer_id,
                order_kind="moi",
                sale_user_id=sale.id if sale else None,
                status="ordered",
                created_at=now - timedelta(days=months_ago * 30 + 2),
            )
            o.lines.append(
                OrderLine(description=desc, qty=qty, unit_price_snapshot=unit, line_total=qty * unit)
            )
            db.add(o)
        q = Quote(
            quote_number="BGX1",
            customer_id=customer_id,
            salesperson_id=sale.id if sale else None,
            status="sent",
            created_at=now - timedelta(days=20),
        )
        db.add(q)
        db.flush()
        qv = QuoteVersion(
            quote_id=q.id, version_number=1, status="sent",
            total_cost_snapshot=20_000_000, subtotal_amount=25_000_000, discount_amount=0,
            vat_percent=0, vat_amount=0, final_amount=25_000_000,
            sent_at=now - timedelta(days=20), created_at=now - timedelta(days=20),
        )
        db.add(qv)
        db.flush()
        q.current_version_id = qv.id
        db.commit()
    finally:
        db.close()


# --- KPI strip + tier from real orders --------------------------------------


def test_list_returns_kpis_and_derived_tier(client):
    _seed_staff_customers()
    token = _admin_token(client)
    cid = _customer_id_by_name("An Phát")
    _add_orders(cid, "sale1")

    body = client.get("/api/customers?size=200", headers=_h(token)).json()
    assert "kpis" in body
    kpis = body["kpis"]
    assert kpis["total_customers"] >= 1
    # An Phát got 2×12tr + 5000×900 = 28.5tr < 50tr in 12m → not "loyal", but has orders.
    row = next(c for c in body["items"] if c["id"] == cid)
    assert row["orders_total"] == 2
    assert row["revenue_12m"] == 2 * 12_000_000 + 5000 * 900
    # avg order value is computed from real orders, non-negative
    assert kpis["avg_order_value"] >= 0


def test_list_dem_mua_va_tong_mua_tren_ca_tap_loc(client):
    """Hàng lọc nhanh đếm theo trạng thái mua trên tập lọc (bỏ qua chính ô mua); dòng Cộng cộng
    mua 12 tháng của CẢ tập lọc chứ không riêng trang đang xem."""
    _seed_staff_customers()
    token = _admin_token(client)
    cid = _customer_id_by_name("An Phát")
    _add_orders(cid, "sale1")

    tat_ca = client.get("/api/customers?size=1", headers=_h(token)).json()
    dem = tat_ca["dem_mua"]
    assert dem["dang_mua"] == 1
    assert sum(dem.values()) == tat_ca["total"]
    assert tat_ca["tong_mua_12m"] == 2 * 12_000_000 + 5000 * 900

    # Chọn một trạng thái: số đếm các mục khác vẫn giữ, tổng chỉ còn tập đã lọc.
    chua = client.get("/api/customers?mua=chua_don&size=200", headers=_h(token)).json()
    assert chua["dem_mua"] == dem
    assert chua["total"] == dem["chua_don"]
    assert chua["tong_mua_12m"] == 0


# Redesign spec-06 v2: tier (loyal/partner) đã BỎ → test phân hạng gỡ; giữ test sort doanh số thật.


def test_revenue_sort(client):
    _seed_staff_customers()
    token = _admin_token(client)
    cid = _customer_id_by_name("An Phát")
    _add_orders(cid, "sale1")
    # Sort by revenue desc → the customer with orders is at/near the top.
    body = client.get("/api/customers?sort=-revenue&size=200", headers=_h(token)).json()
    assert body["items"][0]["revenue_12m"] >= body["items"][-1]["revenue_12m"]


# --- History tables wired from real orders/quotations -----------------------


def test_order_and_quote_history_are_real(client):
    _seed_staff_customers()
    token = _admin_token(client)
    cid = _customer_id_by_name("An Phát")
    _add_orders(cid, "sale1")

    # Kỳ đủ rộng để chứa cả hai đơn (một đơn ~62 ngày trước).
    tu = (datetime.now(timezone.utc) - timedelta(days=120)).date().isoformat()
    orders = client.get(f"/api/customers/{cid}/orders?tu={tu}", headers=_h(token)).json()
    assert len(orders["items"]) == 2
    assert orders["tong_so"] == 2
    assert all(o["tong"] is not None for o in orders["items"])

    quotes = client.get(f"/api/customers/{cid}/quotations?tu={tu}", headers=_h(token)).json()
    assert len(quotes["items"]) == 1
    assert quotes["items"][0]["code"] == "BGX1"


def test_san_pham_cong_TIEN_TUNG_DONG(client):
    """Khối sản phẩm cộng theo tiền THẬT của từng dòng đơn, không chia đều tổng đơn.

    Trước 16/08/2026 frontend tách `summary` theo dấu phẩy rồi CHIA ĐỀU — đơn gồm ruột sách +
    thẻ nhân viên bị gán hai thứ bằng tiền nhau. Từ 04/10/2026 việc cộng nằm ở máy chủ."""
    _seed_staff_customers()
    token = _admin_token(client)
    cid = _customer_id_by_name("An Phát")

    db = SessionLocal()
    try:
        o = Order(order_no="DH-2DONG", customer_id=cid, order_kind="moi", status="ordered",
                  created_at=datetime.now(timezone.utc) - timedelta(hours=1))
        # Hai dòng LỆCH HẲN nhau về tiền — chia đều sẽ ra 15tr/15tr, số thật là 28tr/2tr.
        o.lines.append(OrderLine(description="Ruột sách 160 trang", qty=1,
                                 unit_price_snapshot=28_000_000, line_total=28_000_000))
        o.lines.append(OrderLine(description="Thẻ nhân viên", qty=1,
                                 unit_price_snapshot=2_000_000, line_total=2_000_000))
        db.add(o)
        db.commit()
    finally:
        db.close()

    tk = client.get(f"/api/customers/{cid}/thong-ke", headers=_h(token)).json()
    sp = {x["ten"]: x["doanh_so"] for x in tk["san_pham"]}
    assert sp["Ruột sách 160 trang"] == 28_000_000
    assert sp["Thẻ nhân viên"] == 2_000_000

    dong = next(
        r for r in client.get(f"/api/customers/{cid}/orders", headers=_h(token)).json()["items"]
        if r["order_no"] == "DH-2DONG"
    )
    assert dong["tong"] == 30_000_000
    assert dong["san_pham"] == ["Ruột sách 160 trang", "Thẻ nhân viên"]


def test_ti_le_chot_dem_bao_gia_DA_LEN_DON_la_thang(client):
    """`converted_to_order` = "Đã lên đơn" ⇒ THẮNG CHẮC CHẮN, không được bỏ sót.

    Bản cũ chỉ đếm `approved`+`accepted` nên khách có 11 báo giá đã lên đơn vẫn bị ghi tỉ lệ
    chốt 18%. Và `approved` ("GĐ duyệt xong, CHỜ sale gửi khách") thì KHÔNG phải thắng — khách
    còn chưa nhìn thấy báo giá."""
    _seed_staff_customers()
    token = _admin_token(client)
    cid = _customer_id_by_name("An Phát")

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        for i, st in enumerate(
            ["converted_to_order", "converted_to_order", "accepted", "rejected",
             "draft", "approved"]
        ):
            db.add(Quote(quote_number=f"BGTL{i}", customer_id=cid, status=st, created_at=now))
        db.commit()
    finally:
        db.close()

    d = client.get(f"/api/customers/{cid}/thong-ke", headers=_h(token)).json()
    # Thắng = 2 converted + 1 accepted = 3. Đã chào = 3 + 1 rejected = 4 (loại draft + approved
    # vì khách chưa thấy). 3/4 = 75%.
    assert d["bao_gia"]["ti_le"] == 75


def test_order_history_csv_export(client):
    _seed_staff_customers()
    token = _admin_token(client)
    cid = _customer_id_by_name("An Phát")
    _add_orders(cid, "sale1")
    resp = client.get(f"/api/customers/{cid}/orders.csv", headers=_h(token))
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers["content-disposition"]
    text = resp.content.decode("utf-8")
    assert "Mã đơn" in text and "Catalogue A4" in text


# --- Nhật ký (unified activity timeline) ------------------------------------


def test_customer_audit_merges_profile_and_documents(client):
    """Nhật ký = profile edits (audit log) + REAL order/quote events, newest first,
    with drill refs on document rows."""
    _seed_staff_customers()
    token = _admin_token(client)
    cid = _customer_id_by_name("An Phát")
    _add_orders(cid, "sale1")
    # A profile edit → an audit-log row targeting this customer.
    client.put(
        f"/api/customers/{cid}",
        json={"name": "An Phát", "credit_limit": 99_000_000, "status": "active"},
        headers=_h(token),
    )

    body = client.get(f"/api/customers/{cid}/audit", headers=_h(token)).json()
    items = body["items"]
    kinds = {r["kind"] for r in items}
    assert "order" in kinds and "quote" in kinds and "profile" in kinds
    # Document rows drill through; profile rows do not.
    order_rows = [r for r in items if r["kind"] == "order"]
    assert order_rows and all(r["ref_type"] == "order" and r["ref_id"] for r in order_rows)
    quote_rows = [r for r in items if r["kind"] == "quote"]
    assert quote_rows and all(r["ref_type"] == "quotation" for r in quote_rows)
    assert all(r["ref_type"] is None for r in items if r["kind"] == "profile")
    # Newest-first ordering.
    times = [r["at"] for r in items]
    assert times == sorted(times, reverse=True)


def test_customer_audit_out_of_scope_404(client):
    _seed_staff_customers()

    def _role_token(username: str, role_name: str) -> str:
        db = SessionLocal()
        try:
            users = UserRepository(db)
            dept = DepartmentRepository(db).get_by_name("Kinh doanh")
            role = RoleRepository(db).get_by_name_and_department(role_name, dept.id)
            u = users.create(username=username, name=username, password_hash=hash_password("x"))
            users.set_assignment(u, department_id=dept.id, role_id=role.id, is_active=True)
            return create_access_token(str(u.id))
        finally:
            db.close()

    sale2 = _role_token("sale2audit", "NV Sales")
    cid = _customer_id_by_name("An Phát")  # owned by sale1
    resp = client.get(f"/api/customers/{cid}/audit", headers=_h(sale2))
    assert resp.status_code == 404


# --- Scope guard on analytics -----------------------------------------------


def test_so_lieu_ho_so_out_of_scope_404(client):
    _seed_staff_customers()

    def _role_token(username: str, role_name: str) -> str:
        db = SessionLocal()
        try:
            users = UserRepository(db)
            dept = DepartmentRepository(db).get_by_name("Kinh doanh")
            role = RoleRepository(db).get_by_name_and_department(role_name, dept.id)
            u = users.create(username=username, name=username, password_hash=hash_password("x"))
            users.set_assignment(u, department_id=dept.id, role_id=role.id, is_active=True)
            return create_access_token(str(u.id))
        finally:
            db.close()

    # sale1's customer, opened by sale2 → 404 (scope guard, not leaked).
    admin = _admin_token(client)
    sale2 = _role_token("sale2b", "NV Sales")
    cid = _customer_id_by_name("An Phát")  # owned by sale1
    for duong in ("thong-ke", "orders", "quotations"):
        resp = client.get(f"/api/customers/{cid}/{duong}", headers=_h(sale2))
        assert resp.status_code == 404, duong
