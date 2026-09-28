"""Tải tệp an toàn (Task 6 — audit sức chịu tải A2 + B "Tải tệp").

Bốn điều phải đúng:
  1. Đọc tệp có TRẦN: vượt trần là 413 câu tiếng Việt và dừng đọc ngay; rỗng giữ mã/câu cũ.
  2. Ảnh vật tư (được phục vụ CÔNG KHAI ở trang quét QR) không nhận SVG.
  3. `/api/files` cache vĩnh viễn theo khoá (ETag + 304 không mở luồng), luôn `nosniff`, tệp không
     phải ảnh/PDF thì ép tải về. Kiểm quyền vẫn chạy trước 304.
  4. Xoá đính kèm Khách hàng / Nhân sự là xoá luôn object trong kho tệp (CCCD, hợp đồng).
Và một chốt kiến trúc: không route nào trong `app/routers` là `async def` (trừ kênh SSE).
"""
from __future__ import annotations

import ast
import io
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile

from app.db import SessionLocal
from app.models.role import SCOPE_ALL
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.user_repo import UserRepository
from app.security import hash_password
from app.storage import LOCAL_ROOT, LocalStorage, get_storage, key_from_url, url_from_key
from app.tai_len import MIB, doc_gioi_han, kiem_anh

ADMIN = {"username": "admin", "password": "admin123"}


def _h(client) -> dict[str, str]:
    r = client.post("/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# --- 1. doc_gioi_han -----------------------------------------------------------------------------


class _DemByte(io.BytesIO):
    """BytesIO đếm số byte đã bị đọc — để chứng minh vượt trần là DỪNG, không đọc hết tệp."""

    def __init__(self, data: bytes) -> None:
        super().__init__(data)
        self.da_doc = 0

    def read(self, n: int = -1) -> bytes:
        chunk = super().read(n)
        self.da_doc += len(chunk)
        return chunk


def test_doc_gioi_han_vuot_tran_dung_ngay_khong_doc_het():
    nguon = _DemByte(b"x" * (5 * MIB))
    # size=None: giả lập trường hợp Starlette không báo cỡ ⇒ phải dựa vào đọc theo khối.
    f = UploadFile(file=nguon, filename="to.bin", size=None)
    with pytest.raises(HTTPException) as e:
        doc_gioi_han(f, 1 * MIB, ten="Tệp")
    assert e.value.status_code == 413
    assert e.value.detail == "Tệp vượt quá 1 MB."
    assert nguon.da_doc <= 1 * MIB + 1, "vượt trần mà vẫn đọc tiếp cả tệp vào RAM"


def test_doc_gioi_han_vua_khit_tran_thi_nhan():
    f = UploadFile(file=io.BytesIO(b"y" * MIB), filename="vua.bin", size=None)
    assert len(doc_gioi_han(f, MIB)) == MIB


def test_doc_gioi_han_rong():
    with pytest.raises(HTTPException) as e:
        doc_gioi_han(UploadFile(file=io.BytesIO(b""), filename="r.bin"), MIB, ten="Ảnh")
    assert (e.value.status_code, e.value.detail) == (422, "Ảnh rỗng.")
    # Chỗ gọi tự kiểm rỗng ở service ⇒ trả b"" cho service quyết.
    assert doc_gioi_han(UploadFile(file=io.BytesIO(b""), filename="r.bin"), MIB, cho_rong=True) == b""


def test_kiem_anh_chan_svg_ca_theo_kieu_lan_theo_duoi():
    kiem_anh("image/png", "anh.png")
    kiem_anh("image/heic", "IMG_0001.HEIC")
    for kieu, ten in [("image/svg+xml", "logo.svg"), ("image/png", "logo.svg"),
                      ("application/pdf", "a.pdf"), (None, "a.jpg")]:
        with pytest.raises(HTTPException) as e:
            kiem_anh(kieu, ten)
        assert e.value.status_code == 415, (kieu, ten)


def test_upload_anh_dai_dien_vuot_tran_413_tieng_viet(client):
    h = _h(client)
    big = b"\x89PNG" + b"0" * (2 * MIB)
    r = client.post("/api/users/me/avatar", files={"file": ("to.png", big, "image/png")}, headers=h)
    assert r.status_code == 413, r.text
    assert r.json()["detail"] == "Ảnh vượt quá 2 MB."


def test_upload_anh_dai_dien_rong_giu_ma_va_cau_cu(client):
    h = _h(client)
    r = client.post("/api/users/me/avatar", files={"file": ("r.png", b"", "image/png")}, headers=h)
    assert r.status_code == 400 and r.json()["detail"] == "Tệp ảnh rỗng"


def test_anh_vat_tu_chan_svg(client):
    h = _h(client)
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    # Kiểm loại chạy TRƯỚC khi tra mặt hàng ⇒ không cần dựng vật tư thật.
    r = client.post("/api/vat-lieu-kho/vat_tu/1/anh",
                    files={"file": ("logo.svg", svg, "image/svg+xml")}, headers=h)
    assert r.status_code == 415, r.text
    assert "JPG" in r.json()["detail"]


def test_kcs_qua_10_anh_mot_luot_bi_chan_truoc_khi_doc():
    from app.routers.san_xuat import _luu_anh_kcs

    nguon = [_DemByte(b"\xff\xd8\xff" + b"0" * 10) for _ in range(11)]
    files = [UploadFile(file=n, filename=f"{i}.jpg") for i, n in enumerate(nguon)]
    with pytest.raises(HTTPException) as e:
        _luu_anh_kcs(1, files)
    assert e.value.status_code == 400 and "10 ảnh" in e.value.detail
    assert all(n.da_doc == 0 for n in nguon)


# --- 2. /api/files -------------------------------------------------------------------------------


def _dat_tep(key: str, data: bytes) -> str:
    get_storage().save(key, data)
    return url_from_key(key)


def test_tep_co_etag_cache_vinh_vien_va_nosniff(client):
    _h(client)
    url = _dat_tep("avatars/tl/0a1b2c3d_anh.png", b"png")
    r = client.get(url)
    assert r.status_code == 200
    assert r.headers["cache-control"] == "private, max-age=31536000, immutable"
    assert r.headers["etag"] == '"avatars/tl/0a1b2c3d_anh.png"'
    assert r.headers["x-content-type-options"] == "nosniff"


def test_if_none_match_khop_thi_304_khong_mo_luong(client, monkeypatch):
    _h(client)
    url = _dat_tep("avatars/tl/0a1b2c3d_anh2.png", b"png")
    etag = client.get(url).headers["etag"]

    def _cam_mo(*_a, **_k):
        raise AssertionError("304 không được mở luồng kho tệp")

    monkeypatch.setattr(LocalStorage, "open_stream", _cam_mo)
    r = client.get(url, headers={"If-None-Match": etag})
    assert r.status_code == 304
    assert r.content == b""
    assert r.headers["etag"] == etag
    assert r.headers["x-content-type-options"] == "nosniff"
    # Dạng yếu + danh sách cũng khớp.
    assert client.get(url, headers={"If-None-Match": f'"khac", W/{etag}'}).status_code == 304


def test_etag_ten_co_dau_van_la_header_hop_le(client):
    _h(client)
    url = _dat_tep("avatars/tl/0a1b2c3d_Ảnh hộp.png", b"png")
    r = client.get(url)
    assert r.status_code == 200
    etag = r.headers["etag"]
    assert etag.isascii()
    assert client.get(url, headers={"If-None-Match": etag}).status_code == 304


def test_tep_docx_bi_ep_tai_ve(client):
    _h(client)
    r = client.get(_dat_tep("avatars/tl/0a1b2c3d_hop-dong.docx", b"PK"))
    assert r.status_code == 200
    assert r.headers["content-disposition"].startswith("attachment")
    assert "filename*=UTF-8''hop-dong.docx" in r.headers["content-disposition"]


def test_304_van_kiem_quyen_truoc(client):
    """Mất quyền thì nhận 403, KHÔNG được 304 xác nhận "bản bạn đang giữ vẫn đúng"."""
    db = SessionLocal()
    try:
        dept = DepartmentRepository(db).get_by_name("Kế toán")
        roles = RoleRepository(db)
        role = roles.create(name="Chỉ kế toán TL", department_id=dept.id)
        roles.set_permission(role_id=role.id, module_key="ke_toan", can_read=True, scope=SCOPE_ALL)
        users = UserRepository(db)
        u = users.create(username="tl-ke-toan", name="TL", password_hash=hash_password("matkhau123"))
        users.set_assignment(u, department_id=dept.id, role_id=role.id, is_active=True)
    finally:
        db.close()
    url = _dat_tep("hr/77/0a1b2c3d_cccd.jpg", b"jpg")
    r = client.post("/api/auth/login", json={"username": "tl-ke-toan", "password": "matkhau123"})
    assert r.status_code == 200
    got = client.get(url, headers={"If-None-Match": '"hr/77/0a1b2c3d_cccd.jpg"'})
    assert got.status_code == 403


def test_luong_tep_dong_duoc():
    store = get_storage()
    store.save("avatars/tl/0a1b2c3d_dong.bin", b"a" * 10)
    stream, _size, _ct = store.open_stream("avatars/tl/0a1b2c3d_dong.bin")
    stream.close()
    stream.close()  # gọi hai lần vô hại
    assert list(stream) == []


def test_anh_vat_tu_cong_khai_co_nosniff(client, monkeypatch):
    from app.routers import public_scan

    # Khoá dưới `avatars/` (đã gitignore) để test không để rác trong cây mã nguồn.
    class _Hang:
        anh_url = url_from_key("avatars/tl/0a1b2c3d_logo.svg")

    get_storage().save("avatars/tl/0a1b2c3d_logo.svg", b"<svg/>")
    monkeypatch.setattr(public_scan, "verify_scan", lambda t: (1, "vat_tu", 1))
    monkeypatch.setattr(public_scan.VatLieuKhoService, "map_theo_cap",
                        lambda self, cap: {("vat_tu", 1): _Hang()})
    r = client.get("/api/public/vat-lieu-anh", params={"t": "x"})
    assert r.status_code == 200
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["content-disposition"].startswith("attachment")


# --- 3. Xoá đính kèm là xoá luôn object ----------------------------------------------------------


def _tren_dia(file_url: str) -> Path:
    return LOCAL_ROOT / key_from_url(file_url)


def test_xoa_dinh_kem_nhan_su_xoa_luon_tep(client):
    h = _h(client)
    with SessionLocal() as db:
        dept_id = DepartmentRepository(db).get_by_name("Hành chính nhân sự").id
    emp = client.post("/api/employees", json={
        "full_name": "Nguyễn Thị Tệp", "department_id": dept_id, "hire_date": "2024-01-15",
        "probation_end_date": "2025-12-31",
    }, headers=h)
    assert emp.status_code in (200, 201), emp.text
    eid = emp.json()["employee"]["id"]

    up = client.post(f"/api/employees/{eid}/attachments",
                     files={"file": ("cccd.pdf", b"%PDF-1.4 cccd", "application/pdf")},
                     data={"doc_kind": "cccd"}, headers=h)
    assert up.status_code == 201, up.text
    att = up.json()
    assert _tren_dia(att["file_url"]).is_file()

    d = client.delete(f"/api/employees/{eid}/attachments/{att['id']}", headers=h)
    assert d.status_code == 204
    assert not _tren_dia(att["file_url"]).exists(), "xoá dòng mà tệp CCCD vẫn nằm trong kho"
    assert client.get(att["file_url"]).status_code == 404


def test_xoa_dinh_kem_khach_hang_xoa_luon_tep(client):
    h = _h(client)
    c = client.post("/api/customers", json={"name": "Cty Xoá Tệp"}, headers=h)
    assert c.status_code == 201, c.text
    cid = c.json()["customer"]["id"]

    up = client.post(f"/api/customers/{cid}/attachments",
                     files={"file": ("hop-dong.pdf", b"%PDF-hd", "application/pdf")},
                     data={"doc_kind": "hop_dong"}, headers=h)
    assert up.status_code == 201, up.text
    att = up.json()
    assert _tren_dia(att["file_url"]).is_file()

    d = client.delete(f"/api/customers/{cid}/attachments/{att['id']}", headers=h)
    assert d.status_code == 204
    assert not _tren_dia(att["file_url"]).exists(), "xoá dòng mà hợp đồng vẫn nằm trong kho"


def test_dinh_kem_khach_hang_rong_va_qua_tran(client):
    h = _h(client)
    cid = client.post("/api/customers", json={"name": "Cty Trần Tệp"}, headers=h).json()["customer"]["id"]
    rong = client.post(f"/api/customers/{cid}/attachments",
                       files={"file": ("r.pdf", b"", "application/pdf")}, headers=h)
    assert rong.status_code == 422 and rong.json()["detail"] == "Tệp rỗng."
    to = client.post(f"/api/customers/{cid}/attachments",
                     files={"file": ("to.pdf", b"x" * (20 * MIB + 1), "application/pdf")}, headers=h)
    assert to.status_code == 413 and to.json()["detail"] == "Tệp vượt quá 20 MB."


# --- 4. Chốt kiến trúc: không route async làm việc đồng bộ ---------------------------------------

# Route `async def` chạy THẲNG trên event loop: đọc tệp / truy vấn DB đồng bộ bên trong là cả máy
# chủ đứng theo. Muốn thêm route async mới thì thêm có chủ đích vào đây, kèm lý do.
_CHO_PHEP_ASYNC = {
    # Kênh SSE: giữ kết nối dài, phải async; phần xác thực DB chạy qua threadpool.
    ("quotations.py", "quote_events"),
    ("quotations.py", "stream"),  # generator con của quote_events
}


def test_khong_con_async_def_trong_routers():
    goc = Path(__file__).resolve().parents[1] / "app" / "routers"
    vi_pham = []
    for tep in sorted(goc.rglob("*.py")):
        cay = ast.parse(tep.read_text(encoding="utf-8"))
        for nut in ast.walk(cay):
            if isinstance(nut, ast.AsyncFunctionDef) and (tep.name, nut.name) not in _CHO_PHEP_ASYNC:
                vi_pham.append(f"{tep.relative_to(goc)}:{nut.lineno} {nut.name}")
    assert not vi_pham, "Route async làm việc đồng bộ chặn event loop: " + ", ".join(vi_pham)
