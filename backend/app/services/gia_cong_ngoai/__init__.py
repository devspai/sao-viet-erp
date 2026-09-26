"""Gia công ngoài — service (spec docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md)."""
from __future__ import annotations


class GiaCongXungDot(ValueError):
    """Lần gia công vừa bị người khác đổi (lệch `version`) — router dịch 409."""
