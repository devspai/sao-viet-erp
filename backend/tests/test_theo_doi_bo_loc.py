"""Nguồn ô lọc của Theo dõi sản xuất (làm gọn 05/10/2026): còn đúng hai nhóm Máy và Khách.

Gác ô quyền `theo_doi_san_xuat` riêng — không mượn `/api/lenh-san-xuat/bo-loc` (gác ô khác)."""
from __future__ import annotations

from app.models.customer import Customer
from app.models.may_thiet_bi import MayThietBi
from app.services.lenh_sx import bang_theo_doi, theo_doi
from tests.lenh_sx_fixtures import (  # noqa: F401
    _cvs,
    _dem_sql,
    _h,
    _lenh_tho,
    _tok,
    _token_khong_quyen_theo_doi,
    admin,
    customer,
    lenh_cua_sale_own,
    lenh_that,
    lsx_svc,
    orders,
    sale_own,
    sess,
)


def test_bo_loc_chi_con_may_va_khach(client, seed_credentials, lenh_that):
    r = client.get("/api/theo-doi-san-xuat/bo-loc", headers=_h(_tok(client, seed_credentials)))
    assert r.status_code == 200
    assert set(r.json()) == {"may", "khach_hang"}


def test_bo_loc_may_mang_co_ngung_dung_va_co_viec(sess, lenh_that):
    ban = MayThietBi(ma="MAY-BL-BAN", ten="Máy bận (BL)", loai_may="in", active=True)
    ranh = MayThietBi(ma="MAY-BL-RANH", ten="Máy rảnh (BL)", loai_may="in", active=True)
    ngung = MayThietBi(ma="MAY-BL-NGUNG", ten="Máy ngừng (BL)", loai_may="be", active=False)
    sess.add_all([ban, ranh, ngung])
    sess.flush()
    _cvs(sess, lenh_that)[0].may_id = ban.id
    sess.commit()
    may = {m["ten"]: m for m in bang_theo_doi.bo_loc(sess, sale_ids=None)["may"]}
    assert may["Máy bận (BL)"]["co_viec"] is True
    assert may["Máy rảnh (BL)"]["co_viec"] is False
    assert may["Máy ngừng (BL)"]["ngung_dung"] is True
    assert all(isinstance(m["id"], str) for m in may.values())


def test_bo_loc_khach_hep_theo_pham_vi(client, sess, admin, customer, sale_own, lenh_cua_sale_own):
    khac = Customer(code="KH-BL-KHAC", name="Khách của sale khác (BL)")
    sess.add(khac)
    sess.commit()
    _lenh_tho(sess, ma="LSX-BL-KHAC", sale_user_id=admin.id, customer_id=khac.id)
    h = _h(_tok(client, {"username": sale_own.username, "password": "x"}))
    d = client.get("/api/theo-doi-san-xuat/bo-loc", headers=h).json()
    assert d["khach_hang"] == [{"id": str(customer.id), "ten": customer.name}]


def test_bo_loc_so_cau_sql_hang(sess, admin, customer):
    n0 = _dem_sql(lambda: bang_theo_doi.bo_loc(sess, sale_ids=None))
    for i in range(3):
        sess.add(MayThietBi(ma=f"MAY-BL-SQL{i}", ten=f"Máy SQL {i}", loai_may="in", active=True))
        _lenh_tho(sess, ma=f"LSX-BL-SQL{i}", sale_user_id=admin.id, customer_id=customer.id)
    sess.commit()
    assert _dem_sql(lambda: bang_theo_doi.bo_loc(sess, sale_ids=None)) == n0


def test_bo_loc_403(client, sess):
    h = _h(_token_khong_quyen_theo_doi(sess))
    assert client.get("/api/theo-doi-san-xuat/bo-loc", headers=h).status_code == 403


def test_bon_duong_cu_da_go(client, seed_credentials):
    h = _h(_tok(client, seed_credentials))
    for duong in ("meta", "kanban", "theo-ca", "gantt"):
        assert client.get(f"/api/theo-doi-san-xuat/{duong}", headers=h).status_code == 404, duong


# --- Phạm vi: chép từ hai tệp cũ đã xoá (Kanban / Theo ca–Gantt), đổi đường gọi -------------------
def test_bo_loc_co_viec_bam_pham_vi_nguoi_goi(sess, lenh_that, sale_own):
    """Cờ `co_viec` chỉ đếm việc thuộc lệnh TRONG PHẠM VI người gọi; danh mục máy thì không đổi.
    `sale_own` không sở hữu `lenh_that` ⇒ máy đang bận vì lệnh đó phải báo `co_viec=False` với họ."""
    ban = MayThietBi(ma="MAY-BL-PV", ten="Máy bận (BL phạm vi)", loai_may="in", active=True)
    sess.add(ban)
    sess.flush()
    _cvs(sess, lenh_that)[0].may_id = ban.id
    sess.commit()
    het = {m["id"]: m for m in bang_theo_doi.bo_loc(sess, sale_ids=None)["may"]}
    hep = {m["id"]: m for m in bang_theo_doi.bo_loc(sess, sale_ids={sale_own.id})["may"]}
    assert het[str(ban.id)]["co_viec"] is True
    assert hep[str(ban.id)]["co_viec"] is False
    assert set(het) == set(hep)


def test_theo_may_hep_theo_pham_vi(client, sess, lenh_that, sale_own):
    """`/theo-may` dưới token Sale scope `own` không bày việc của lệnh người khác."""
    ban = MayThietBi(ma="MAY-BL-TM", ten="Máy bận (BL Theo máy)", loai_may="in", active=True)
    sess.add(ban)
    sess.flush()
    _cvs(sess, lenh_that)[0].may_id = ban.id
    sess.commit()
    het = theo_doi.theo_may(sess, sale_ids=None)
    assert any(r["may_id"] == ban.id for g in het["nhom"] for r in g["dong"])
    h = _h(_tok(client, {"username": sale_own.username, "password": "x"}))
    d = client.get("/api/theo-doi-san-xuat/theo-may", headers=h).json()
    assert [r for g in d["nhom"] for r in g["dong"]] == []
    assert ban.id in {r["may_id"] for r in d["may_trong"]}
    assert d["bat_thuong"]["chua_may"] == 0
