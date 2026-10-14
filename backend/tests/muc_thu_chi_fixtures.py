"""Dựng mục thu chi cho test — phiếu thu/chi lập tay từ 11/10/2026 BẮT BUỘC chọn mục."""
from __future__ import annotations


def muc_id(client, h, loai: str = "chi", *, ten: str | None = None, **them) -> int:
    """id một mục đang dùng của `loai`. Không truyền `ten`/`them` thì dùng lại mục chung đã tạo
    trong cùng `client` (mỗi test một client mới)."""
    khoa = f"_muc_test_{loai}"
    if ten is None and not them and getattr(client, khoa, None):
        return getattr(client, khoa)
    r = client.post(
        "/api/muc-thu-chi",
        json={"ten": ten or ("Chi phí chung" if loai == "chi" else "Thu chung"), "loai": loai, **them},
        headers=h,
    )
    assert r.status_code == 201, r.text
    if ten is None and not them:
        setattr(client, khoa, r.json()["id"])
    return r.json()["id"]
