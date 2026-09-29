"""Hub SSE gửi theo đối tượng (`EventHub.gui`) — audit sức chịu tải A3.

`broadcast` làm mọi màn đang mở của cả công ty nạp lại theo từng cú bấm. `gui` chỉ giao cho kết nối
có quyền khớp; kết nối chưa biết quyền (None) vẫn nhận hết — thà thừa còn hơn lọt tin.
"""
from __future__ import annotations

import asyncio

import pytest

from app.realtime import SU_KIEN_DONG_BO_LAI, EventHub


def _chay(kich_ban):
    async def main():
        hub = EventHub()
        hub.set_loop(asyncio.get_running_loop())
        return await kich_ban(hub)
    return asyncio.run(main())


async def _nhan(q: asyncio.Queue) -> list[dict]:
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    ra = []
    while not q.empty():
        ra.append(q.get_nowait())
    return ra


def test_gui_theo_quyen_chi_toi_nguoi_co_quyen():
    async def kb(hub):
        ke_toan = hub.subscribe(1, quyen=frozenset({"ke_toan"}))
        nhan_su = hub.subscribe(2, quyen=frozenset({"nhan_su"}))
        chua_biet = hub.subscribe(3)
        hub.gui({"type": "x"}, quyen=["ke_toan", "phieu_chi"])
        return await _nhan(ke_toan), await _nhan(nhan_su), await _nhan(chua_biet)

    a, b, c = _chay(kb)
    assert a == [{"type": "x"}]
    assert b == []
    assert c == [{"type": "x"}]


def test_gui_theo_to_va_dich_danh():
    async def kb(hub):
        to_5 = hub.subscribe(1, quyen=frozenset({"to:5"}))
        to_6 = hub.subscribe(2, quyen=frozenset({"to:6"}))
        dich_danh = hub.subscribe(3, quyen=frozenset())
        hub.gui({"type": "y"}, to=[5], nguoi=[3])
        return await _nhan(to_5), await _nhan(to_6), await _nhan(dich_danh)

    a, b, c = _chay(kb)
    assert a == [{"type": "y"}] and b == [] and c == [{"type": "y"}]


def test_khong_truyen_gi_la_broadcast_con_ve_rong_la_khong_ai():
    async def kb(hub):
        q = hub.subscribe(1, quyen=frozenset({"ke_toan"}))
        hub.gui({"type": "tat_ca"})
        hub.gui({"type": "khong_ai"}, to=[])
        return await _nhan(q)

    assert _chay(kb) == [{"type": "tat_ca"}]


def test_quyen_doi_danh_dau_nap_lai_bo_quyen():
    async def kb(hub):
        q = hub.subscribe(1, quyen=frozenset({"nhan_su"}))
        hub.publish(1, {"type": "quyen_doi"})
        await _nhan(q)
        truoc = hub.can_nap_lai_quyen(q)
        hub.cap_nhat_quyen(q, frozenset({"ke_toan"}))
        hub.gui({"type": "z"}, quyen=["ke_toan"])
        return truoc, hub.can_nap_lai_quyen(q), await _nhan(q)

    truoc, sau, tin = _chay(kb)
    assert truoc is True and sau is False and tin == [{"type": "z"}]


def test_hang_doi_day_thi_thay_bang_mot_tin_dong_bo_lai():
    async def kb(hub):
        q = hub.subscribe(1)
        for i in range(250):
            hub.publish(1, {"type": "t", "i": i})
        return await _nhan(q)

    tin = _chay(kb)
    assert {"type": SU_KIEN_DONG_BO_LAI} in tin
    assert len(tin) < 200


@pytest.fixture
def db():
    from tests.conftest import phien_da_seed

    yield from phien_da_seed()


def test_bo_quyen_nhan_cua_admin_co_module_doc_duoc(db):
    from app.doi_tuong_nhan import nap_quyen_nhan
    from app.models.user import User

    admin = db.query(User).filter(User.username == "admin").one()
    quyen = nap_quyen_nhan(admin.id)
    assert "nhan_su" in quyen or len(quyen) > 5
    assert nap_quyen_nhan(999_999) == frozenset()
