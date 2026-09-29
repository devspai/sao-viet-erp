from pydantic import BaseModel


class ThongBaoMoi(BaseModel):
    id: int
    loai: str
    ma: str | None = None


class ModuleNotificationSummaryOut(BaseModel):
    kenh: dict[str, ThongBaoMoi] = {}
