"""Nhiều worker: ticker chỉ worker GIỮ VAI quét, và lifespan bỏ qua migrate khi serve.py đã làm.

Không chặn thì N worker cùng quét ⇒ mỗi hẹn / phiếu bảo trì "ting" N lần cho cùng một người.
"""
from __future__ import annotations

import asyncio

import pytest

from app import bao_tri_reminders, care_reminders, khoi_dong, locks


class _DungVong(Exception):
    pass


def _ngu_toi_da(lan: int):
    dem = {"n": 0}

    async def ngu(_giay):
        dem["n"] += 1
        if dem["n"] > lan:
            raise _DungVong
    return ngu


@pytest.mark.parametrize("giu_vai", [True, False])
def test_nhac_hen_chi_quet_khi_giu_vai(monkeypatch, giu_vai):
    quet: list = []
    monkeypatch.setattr(care_reminders, "giu_vai_chinh", lambda name, ttl_ms: giu_vai)
    monkeypatch.setattr(care_reminders, "_scan_once", lambda a, b: quet.append((a, b)) or 0)
    monkeypatch.setattr(care_reminders.asyncio, "sleep", _ngu_toi_da(3))
    with pytest.raises(_DungVong):
        asyncio.run(care_reminders.run_care_reminder_loop(60))
    assert len(quet) == (3 if giu_vai else 0)


def test_nhac_hen_khong_giu_vai_van_doi_moc(monkeypatch):
    """Worker không giữ vai vẫn dời mốc: lỡ phải nhận vai thì chỉ quét quãng MỚI, không ting lại
    mọi hẹn từ lúc nó khởi động."""
    vai = iter([False, False, True])
    quet: list = []
    monkeypatch.setattr(care_reminders, "giu_vai_chinh", lambda name, ttl_ms: next(vai))
    monkeypatch.setattr(care_reminders, "_scan_once", lambda a, b: quet.append((a, b)) or 0)
    monkeypatch.setattr(care_reminders.asyncio, "sleep", _ngu_toi_da(3))
    with pytest.raises(_DungVong):
        asyncio.run(care_reminders.run_care_reminder_loop(60))
    assert len(quet) == 1
    tu, den = quet[0]
    assert (den - tu).total_seconds() < 5


@pytest.mark.parametrize("giu_vai", [True, False])
def test_nhac_bao_tri_chi_quet_khi_giu_vai(monkeypatch, giu_vai):
    quet: list = []
    monkeypatch.setattr(bao_tri_reminders, "giu_vai_chinh", lambda name, ttl_ms: giu_vai)
    monkeypatch.setattr(bao_tri_reminders, "_scan_once", lambda d: quet.append(d) or 0)
    monkeypatch.setattr(bao_tri_reminders.asyncio, "sleep", _ngu_toi_da(2))
    with pytest.raises(_DungVong):
        asyncio.run(bao_tri_reminders.run_bao_tri_reminder_loop(600))
    assert len(quet) == (3 if giu_vai else 0)


def test_khong_redis_thi_luon_giu_vai_va_luon_duoc_luot():
    assert locks.giu_vai_chinh("thu", ttl_ms=1000) is True
    assert locks.chay_mot_noi("thu", ttl_ms=1000) is True
    assert locks.chay_mot_noi("thu", ttl_ms=1000) is True


def test_redis_hong_thi_van_chay(monkeypatch):
    """Thà nhắc trùng còn hơn mất nhắc."""
    class _Hong:
        def eval(self, *a, **k):
            raise ConnectionError

        def set(self, *a, **k):
            raise ConnectionError

    monkeypatch.setattr(locks, "_redis", lambda: _Hong())
    assert locks.giu_vai_chinh("thu", ttl_ms=1000) is True
    assert locks.chay_mot_noi("thu", ttl_ms=1000) is True


def test_lifespan_bo_qua_chuan_bi_khi_serve_da_lam(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    goi: list = []
    monkeypatch.setattr(khoi_dong, "chuan_bi", lambda: goi.append(1))
    monkeypatch.setenv(khoi_dong.BIEN_DA_SAN, "1")
    with TestClient(app):
        pass
    assert goi == []
    monkeypatch.delenv(khoi_dong.BIEN_DA_SAN)
    with TestClient(app):
        pass
    assert goi == [1]


@pytest.mark.parametrize("giu_vai", [True, False])
def test_don_refresh_token_moi_gio_chi_worker_giu_vai(monkeypatch, giu_vai):
    from app import don_dinh_ky
    from app.services import refresh_service

    goi: list = []
    monkeypatch.setattr(don_dinh_ky, "giu_vai_chinh", lambda name, ttl_ms: giu_vai)
    monkeypatch.setattr(refresh_service, "don_refresh_token_het_han", lambda: goi.append(1) or 0)
    monkeypatch.setattr(don_dinh_ky.asyncio, "sleep", _ngu_toi_da(2))
    with pytest.raises(_DungVong):
        asyncio.run(don_dinh_ky.run_don_dep_loop(3600))
    assert len(goi) == (2 if giu_vai else 0)



def test_worker_cho_tin_hieu_schema_roi_moi_phuc_vu(monkeypatch, tmp_path):
    """Cha chuẩn bị song song lúc worker import app — worker đứng ở lifespan tới khi có tệp tín hiệu."""
    duong = tmp_path / "schema"
    monkeypatch.setenv(khoi_dong.BIEN_TIN_HIEU, str(duong))

    async def chay():
        cho = asyncio.create_task(khoi_dong.cho_schema_san(nhip=0.01))
        await asyncio.sleep(0.05)
        assert not cho.done()
        duong.touch()
        await asyncio.wait_for(cho, 1)
    asyncio.run(chay())


def test_worker_thoi_cho_khi_cha_chuan_bi_hong(monkeypatch, tmp_path):
    duong = tmp_path / "schema"
    monkeypatch.setenv(khoi_dong.BIEN_TIN_HIEU, str(duong))
    (tmp_path / "schema.loi").touch()
    with pytest.raises(RuntimeError, match="hỏng"):
        asyncio.run(khoi_dong.cho_schema_san(nhip=0.01))


def test_khong_bien_tin_hieu_thi_khong_cho(monkeypatch):
    monkeypatch.delenv(khoi_dong.BIEN_TIN_HIEU, raising=False)
    asyncio.run(asyncio.wait_for(khoi_dong.cho_schema_san(), 1))


def test_cha_chuan_bi_hong_thi_dat_tep_loi_va_tu_dung(monkeypatch, tmp_path):
    import threading

    from app import serve

    def hong():
        raise RuntimeError("mat DB")

    giet: list = []
    monkeypatch.setattr(khoi_dong, "chuan_bi", hong)
    monkeypatch.setattr(serve.os, "kill", lambda pid, sig: giet.append(sig))
    su_co = threading.Event()
    duong = str(tmp_path / "schema")
    serve._chuan_bi_nen(duong, su_co)
    assert su_co.is_set() and giet and (tmp_path / "schema.loi").exists()
    assert not (tmp_path / "schema").exists()

