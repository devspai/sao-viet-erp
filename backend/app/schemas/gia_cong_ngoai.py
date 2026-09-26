"""Body / response của `/api/gia-cong-ngoai` — spec 2026-09-26."""
from __future__ import annotations

from pydantic import BaseModel


class NhaGiaCongOut(BaseModel):
    id: int
    ten: str
