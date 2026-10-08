"""Chuỗi tiếng Việt không phụ thuộc DB: bỏ dấu + hạ chữ thường phía Python.

Tách khỏi `repositories/tim_khong_dau.py` (08/10/2026) để service dùng được mà không phải import
ngược từ tầng repository. `tim_khong_dau` vẫn re-export `bo_dau` và `BANG` cho chỗ cũ.
"""
from __future__ import annotations

import unicodedata

#: `{chữ có dấu: chữ trần}` — đủ 67 nguyên âm tiếng Việt + `đ`. Dựng bằng NFD cho khỏi gõ tay sai.
_NGUON = (
    "àảãáạăằẳẵắặâầẩẫấậ"
    "èẻẽéẹêềểễếệ"
    "ìỉĩíị"
    "òỏõóọôồổỗốộơờởỡớợ"
    "ùủũúụưừửữứự"
    "ỳỷỹýỵ"
)


def _tran(ch: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", ch) if unicodedata.category(c) != "Mn")


#: Xếp theo chữ ĐÍCH để REPLACE lồng gom được: mọi `a` có dấu thay về `a` trong cùng một mạch.
BANG: dict[str, str] = {ch: _tran(ch) for ch in _NGUON}
BANG["đ"] = "d"


def bo_dau(s: str | None) -> str:
    """Bỏ dấu + hạ chữ THƯỜNG phía Python — dùng cho ô tìm, và cho những danh sách nhỏ lọc ngay
    trong bộ nhớ (danh sách việc khoán của một tổ ở bàn tổ) thay vì đi thêm một vòng SQL."""
    return "".join(BANG.get(c, c) for c in (s or "").strip().lower())
