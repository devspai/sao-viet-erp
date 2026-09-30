"""Ảnh thu nhỏ `/api/files/<khoá>?w=160|320` (30/09/2026) — xem `app/services/anh_nho.py`."""
from __future__ import annotations

import io

from PIL import Image

from app.services import anh_nho
from app.storage import get_storage

from tests.test_files_api import _LIMITED_PASSWORD, _LIMITED_USERNAME, _login, _make_limited_user


def _jpeg(rong: int, cao: int, *, xoay_exif: int | None = None) -> bytes:
    ra = io.BytesIO()
    anh = Image.new("RGB", (rong, cao), (200, 30, 30))
    if xoay_exif is None:
        anh.save(ra, "JPEG", quality=95)
    else:
        exif = Image.Exif()
        exif[0x0112] = xoay_exif
        anh.save(ra, "JPEG", quality=95, exif=exif)
    return ra.getvalue()


def _tai_len(client, headers, du_lieu: bytes, ten="me.jpg", kieu="image/jpeg") -> str:
    r = client.post("/api/users/me/avatar", files={"file": (ten, du_lieu, kieu)}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["avatar_url"]


def test_thu_nho_canh_ngan_bang_w_va_xoay_theo_exif():
    ra = Image.open(io.BytesIO(anh_nho.thu_nho(_jpeg(2000, 1200), 160)))
    assert ra.format == "JPEG" and min(ra.size) == 160 and ra.size == (267, 160)
    # EXIF 6 = chụp dọc lưu ngang ⇒ ảnh nhỏ ra DỌC.
    doc = Image.open(io.BytesIO(anh_nho.thu_nho(_jpeg(2000, 1200, xoay_exif=6), 160)))
    assert doc.size == (160, 267)
    # Ảnh đã nhỏ hơn thì không phóng to.
    assert Image.open(io.BytesIO(anh_nho.thu_nho(_jpeg(100, 80), 320))).size == (100, 80)


def test_thu_nho_png_trong_suot_ra_nen_trang():
    ra = io.BytesIO()
    Image.new("RGBA", (800, 800), (0, 0, 0, 0)).save(ra, "PNG")
    anh = Image.open(io.BytesIO(anh_nho.thu_nho(ra.getvalue(), 160)))
    assert anh.mode == "RGB" and anh.getpixel((5, 5))[0] > 240


def test_gif_dong_ra_khung_dau():
    khung = [Image.new("P", (600, 400), i) for i in (1, 2)]
    ra = io.BytesIO()
    khung[0].save(ra, "GIF", save_all=True, append_images=khung[1:])
    anh = Image.open(io.BytesIO(anh_nho.thu_nho(ra.getvalue(), 160)))
    assert anh.format == "JPEG" and anh.size == (240, 160)


def test_api_tra_anh_nho_va_cat_vao_kho(client):
    h = _login(client)
    url = _tai_len(client, h, _jpeg(1600, 1200))
    key = url.removeprefix("/api/files/")
    goc = client.get(url)
    nho = client.get(url + "?w=160")
    assert nho.status_code == 200
    assert len(nho.content) < len(goc.content)
    assert Image.open(io.BytesIO(nho.content)).size == (213, 160)
    assert nho.headers["etag"] == f'"{key}@w160"'
    assert "immutable" in nho.headers["cache-control"]
    assert get_storage().ton_tai(anh_nho.khoa_anh_nho(key, 160))
    # Lượt hai: đọc bản đã cất, không thu nhỏ lại.
    assert client.get(url + "?w=160").content == nho.content
    assert client.get(url + "?w=160", headers={"If-None-Match": f'"{key}@w160"'}).status_code == 304


def test_w_la_va_duong_thumb_truc_tiep_bi_chan(client):
    h = _login(client)
    url = _tai_len(client, h, _jpeg(600, 600))
    key = url.removeprefix("/api/files/")
    assert client.get(url + "?w=999").status_code == 400
    client.get(url + "?w=320")
    assert client.get(f"/api/files/{anh_nho.khoa_anh_nho(key, 320)}").status_code == 404


def test_anh_nho_van_kiem_quyen_anh_goc(client):
    _make_limited_user()
    _login(client, _LIMITED_USERNAME, _LIMITED_PASSWORD)
    assert client.get("/api/files/hr/1/0a1b2c3d_ho-so.jpg?w=160").status_code == 403


def test_tep_khong_phai_anh_hoac_anh_hong_tra_ban_goc(client):
    h = _login(client)
    hong = _tai_len(client, h, b"khong-phai-jpeg", ten="hong.jpg")
    r = client.get(hong + "?w=160")
    assert r.status_code == 200 and r.content == b"khong-phai-jpeg"
    # Không phải ảnh raster (theo đuôi) ⇒ bỏ qua `w`, đi đường tệp thường.
    assert not anh_nho.thu_nho_duoc("kho/1/0a1b2c3d_a.pdf")
    assert not anh_nho.thu_nho_duoc("kho/1/0a1b2c3d_ban-ve.svg")
    assert anh_nho.thu_nho_duoc("kho/1/0a1b2c3d_A.JPG")


def test_nhieu_nguoi_cung_xin_mot_anh_nho_chi_sinh_mot_lan(tmp_path, monkeypatch):
    """Đo tải 30/09/2026: cả lưới cùng xin ảnh nhỏ chưa có ⇒ mỗi luồng đọc trọn ảnh gốc vào RAM,
    worker bị OOM giết. Người đến sau phải chờ người đầu rồi dùng lại kết quả."""
    import threading
    import time

    from app.storage import LocalStorage

    kho = LocalStorage(root=tmp_path)
    kho.save("a/goc.jpg", _jpeg(1200, 900))
    doc = []
    mo_that = kho.open_stream

    def mo_cham(key):
        doc.append(key)
        time.sleep(0.2)  # đủ lâu để các luồng khác chồng lên
        return mo_that(key)

    monkeypatch.setattr(kho, "open_stream", mo_cham)
    kq: list = []
    luong = [threading.Thread(target=lambda: kq.append(anh_nho.dam_bao_anh_nho(kho, "a/goc.jpg", 160)))
             for _ in range(8)]
    for t in luong:
        t.start()
    for t in luong:
        t.join()
    assert doc == ["a/goc.jpg"]
    assert kq == [anh_nho.khoa_anh_nho("a/goc.jpg", 160)] * 8
    assert anh_nho._dang_sinh == {}
