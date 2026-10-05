"""Dọn dẹp định kỳ chạy nền: xoá refresh token quá hạn mỗi giờ; dọn tệp mồ côi mỗi ngày.

Trước đây việc quét nằm ở MỖI lượt đăng nhập — sáng thứ Hai 200 người đăng nhập là 200 lượt DELETE
trên cùng một bảng, đụng khoá lẫn nhau. Giờ một vòng nền làm, nhiều worker thì chỉ worker giữ vai
(`locks.giu_vai_chinh`) làm.
"""
from __future__ import annotations

import asyncio
import logging

from .locks import giu_vai_chinh

log = logging.getLogger(__name__)

CHU_KY_GIAY = 3600
#: Dọn tệp mồ côi: một lượt / ngày, lượt đầu sau khởi động 1 giờ (deploy xong không quét ngay).
CHU_KY_TEP_GIAY = 24 * 3600


async def run_don_dep_loop(chu_ky: int = CHU_KY_GIAY) -> None:
    from .services.refresh_service import don_refresh_token_het_han

    while True:
        await asyncio.sleep(chu_ky)
        if not await asyncio.to_thread(giu_vai_chinh, "don_dep_dinh_ky", ttl_ms=chu_ky * 3000):
            continue
        try:
            n = await asyncio.to_thread(don_refresh_token_het_han)
            if n:
                log.info("don dep: xoa %d refresh token qua han", n)
        except Exception:  # noqa: BLE001 — vòng nền phải sống sót mọi lỗi
            log.exception("don dep dinh ky that bai")


def _mot_luot_don_tep() -> None:
    from .db import SessionLocal
    from .services.don_tep_mo_coi import don_tep_mo_coi
    from .storage import MinioStorage, get_storage

    store = get_storage()
    if not isinstance(store, MinioStorage):
        return
    db = SessionLocal()
    try:
        don_tep_mo_coi(db, store)
    finally:
        db.close()


async def run_don_tep_loop(chu_ky: int = CHU_KY_TEP_GIAY, tre_dau: int = CHU_KY_GIAY) -> None:
    await asyncio.sleep(tre_dau)
    while True:
        if await asyncio.to_thread(giu_vai_chinh, "don_tep_mo_coi", ttl_ms=chu_ky * 3000):
            try:
                await asyncio.to_thread(_mot_luot_don_tep)
            except Exception:  # noqa: BLE001 — vòng nền phải sống sót mọi lỗi
                log.exception("don tep mo coi that bai")
        await asyncio.sleep(chu_ky)
