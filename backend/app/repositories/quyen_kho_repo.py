"""Dòng quyền THEO KHO — tầng truy vấn (05/10/2026).

Mỗi kho đã khai báo (`kho_hang`) có một dòng `modules` khoá `ton_kho_<id kho>` và các dòng
`role_permissions` cùng khoá — cùng khuôn dòng quyền theo tổ (`quyen_to_repo.py`). Luật nằm ở
`services/quyen_kho.py`; ở đây chỉ đọc/ghi.
"""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..models.kho_hang import KhoHang
from ..models.module import Module
from ..models.role import RolePermission

KHOA_TIEN_TO_KHO = "ton_kho_"
# `_` trong LIKE là ký tự đại diện — thoát để `ton_kho_%` không vơ nhầm khoá khác.
_LIKE = KHOA_TIEN_TO_KHO.replace("_", r"\_") + "%"


class QuyenKhoRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def danh_sach_kho(self) -> list[tuple[int, str, str, bool]]:
        """(id, mã, tên, đang dùng) của MỌI kho — kể cả kho ngừng dùng (xoá kho chỉ là ngừng dùng,
        giữ dòng quyền để bật lại không mất quyền đã cấp)."""
        return [
            (r.id, r.ma, r.ten, bool(r.active))
            for r in self.db.execute(
                select(KhoHang.id, KhoHang.ma, KhoHang.ten, KhoHang.active).order_by(KhoHang.ma)
            ).all()
        ]

    def module_kho(self) -> dict[str, str]:
        """`{khoá: nhãn}` của các dòng quyền theo kho đang có."""
        return {
            k: nhan
            for k, nhan in self.db.execute(
                select(Module.key, Module.label).where(Module.key.like(_LIKE, escape="\\"))
            ).all()
        }

    def tao_module(self, key: str, label: str) -> None:
        self.db.add(Module(key=key, label=label))

    def doi_nhan_module(self, key: str, label: str) -> None:
        m = self.db.execute(select(Module).where(Module.key == key)).scalar_one_or_none()
        if m is not None:
            m.label = label

    def xoa_module(self, key: str) -> None:
        """Gỡ dòng quyền cùng mọi ô đã cấp trên nó (khoá ngoại `role_permissions.module_key`)."""
        self.db.execute(delete(RolePermission).where(RolePermission.module_key == key))
        self.db.execute(delete(Module).where(Module.key == key))
