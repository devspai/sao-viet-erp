"""Cổng giới hạn request chạy cùng lúc + vết người gọi (app/cong_dong_thoi.py), và /api/health.

Cổng là thứ chặn vòng kẹt luồng↔kết nối DB khi đông người: dư request thì XẾP HÀNG, chờ quá lâu thì
503 kèm Retry-After — không được đứng hình vô thời hạn. SSE và health đi vòng qua cổng.
"""
from __future__ import annotations

import asyncio

import httpx
import pytest

from app import audit_context
from app.cong_dong_thoi import CongDongThoi, chay_ngoai_cong


def _app_ngu(giay: float, ghi: list):
    async def app(scope, receive, send):
        ghi.append(audit_context.hien_tai())
        await asyncio.sleep(giay)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})
    return app


def _client(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")


def test_du_request_thi_xep_hang_roi_chay_tiep():
    async def chay():
        app = CongDongThoi(_app_ngu(0.05, []), gioi_han=1, cho_toi_da=5)
        async with _client(app) as c:
            ket_qua = await asyncio.gather(*(c.get("/api/x") for _ in range(4)))
        return [r.status_code for r in ket_qua]

    assert asyncio.run(chay()) == [200, 200, 200, 200]


def test_cho_qua_lau_thi_503_co_retry_after():
    async def chay():
        app = CongDongThoi(_app_ngu(0.5, []), gioi_han=1, cho_toi_da=0.05)
        async with _client(app) as c:
            return await asyncio.gather(c.get("/api/x"), c.get("/api/x"))

    a, b = asyncio.run(chay())
    ma = sorted([a.status_code, b.status_code])
    assert ma == [200, 503]
    ban = a if a.status_code == 503 else b
    assert ban.headers["retry-after"] == "2"
    assert "bận" in ban.json()["detail"]


@pytest.mark.parametrize("duong", ["/api/health", "/api/quotations/events"])
def test_health_va_sse_khong_qua_cong(duong):
    async def chay():
        app = CongDongThoi(_app_ngu(0.3, []), gioi_han=1, cho_toi_da=0.05)
        async with _client(app) as c:
            return await asyncio.gather(c.get(duong), c.get(duong), c.get(duong))

    assert [r.status_code for r in asyncio.run(chay())] == [200, 200, 200]


def test_vet_nguoi_goi_lay_ip_dau_cua_x_forwarded_for():
    ghi: list = []

    async def chay():
        app = CongDongThoi(_app_ngu(0, ghi), gioi_han=4, cho_toi_da=1)
        async with _client(app) as c:
            await c.get("/api/x", headers={
                "x-forwarded-for": "203.0.113.7, 10.0.0.2", "user-agent": "May-cham-cong",
            })

    asyncio.run(chay())
    assert ghi == [("203.0.113.7", "May-cham-cong")]
    # Ra khỏi request thì context trả lại như cũ — không rò sang việc nền.
    assert audit_context.hien_tai() != ("203.0.113.7", "May-cham-cong")


def test_chay_ngoai_cong_gioi_han_so_viec_cung_luc():
    import threading
    import time

    dang = 0
    dinh = 0
    khoa = threading.Lock()

    def viec():
        nonlocal dang, dinh
        with khoa:
            dang += 1
            dinh = max(dinh, dang)
        time.sleep(0.05)
        with khoa:
            dang -= 1
        return 1

    async def chay():
        return await asyncio.gather(*(chay_ngoai_cong(viec) for _ in range(8)))

    assert sum(asyncio.run(chay())) == 8
    assert dinh <= 2


def test_health_bao_db_song(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "db": "ok"}


def test_health_503_khi_db_chet(client, monkeypatch):
    import app.main as main

    def hong():
        raise RuntimeError("db chết")

    monkeypatch.setattr(main, "_thu_db", hong)
    r = client.get("/api/health")
    assert r.status_code == 503
    assert r.json()["status"] == "loi"
