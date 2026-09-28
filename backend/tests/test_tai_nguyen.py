"""Ngưỡng tự co giãn theo máy (app/tai_nguyen.py) + chọn số worker (app/serve.py).

Điều phải giữ: tổng kết nối của MỌI worker không vượt ngân sách Postgres — vượt là Postgres từ chối
kết nối mới, lỗi còn tệ hơn xếp hàng.
"""
from __future__ import annotations

import pytest

from app import serve
from app.config import settings
from app.tai_nguyen import KET_NOI_DU_PHONG, TRAN_WORKER, cau_hinh_pool, so_worker_mac_dinh


@pytest.mark.parametrize(
    ("cpu", "ram", "mong"),
    [
        (1, 1024, 2),        # máy nhỏ: vẫn tối thiểu 2 worker
        (2, 4096, 4),        # 2 CPU ⇒ 4 worker
        (2, 1400, 4),        # RAM 1400 MB đủ đúng 4 × 350
        (4, 1000, 2),        # RAM ít ghìm lại dù nhiều CPU
        (16, 64000, TRAN_WORKER),
    ],
)
def test_so_worker_theo_cpu_va_ram(cpu, ram, mong):
    assert so_worker_mac_dinh(cpu=cpu, ram=ram) == mong


@pytest.mark.parametrize("workers", [1, 2, 4, 8])
@pytest.mark.parametrize("pg_max", [100, 200, 400])
def test_tong_ket_noi_khong_vuot_ngan_sach_postgres(workers, pg_max):
    p = cau_hinh_pool(workers, pg_max_connections=pg_max)
    assert p["pool_size"] >= 2
    assert workers * (p["pool_size"] + p["max_overflow"]) <= pg_max - KET_NOI_DU_PHONG


def test_pool_mac_dinh_mot_worker():
    assert cau_hinh_pool(1, pg_max_connections=200) == {"pool_size": 20, "max_overflow": 10}


def test_chot_tay_qua_bien_moi_truong_duoc_ton_trong():
    assert cau_hinh_pool(4, pool_size=5, max_overflow=0) == {"pool_size": 5, "max_overflow": 0}
    # Chỉ chốt pool_size: overflow lấp phần còn lại trong trần mỗi worker.
    p = cau_hinh_pool(1, pg_max_connections=200, pool_size=10)
    assert p == {"pool_size": 10, "max_overflow": 20}


def test_khong_redis_thi_ep_mot_worker(monkeypatch):
    """Hub SSE in-process: nhiều worker mà không Redis thì thông báo rơi mất giữa các worker."""
    monkeypatch.setattr(settings, "redis_url", "")
    monkeypatch.setattr(settings, "web_concurrency", 6)
    assert serve.so_worker() == 1


def test_co_redis_thi_nghe_web_concurrency(monkeypatch):
    monkeypatch.setattr(settings, "redis_url", "redis://khong-toi-duoc:6379/0")
    monkeypatch.setattr(settings, "web_concurrency", 3)
    assert serve.so_worker() == 3
    monkeypatch.setattr(settings, "web_concurrency", 0)
    assert serve.so_worker() >= 2
