"""Repository — Danh mục HẠNG MỤC KIỂM KCS (một hạng mục thuộc ĐÚNG MỘT công đoạn, mg `0285`).

Từ mg `0381` (08/10/2026) một tiêu chí chỉ là MỘT câu chữ; `thu_tu` do service gán (nối đuôi, kéo
thả đánh lại 1..n). Repo KHÔNG tự commit (`commit_on_write = False`) — `chep` ghi nhiều công đoạn
trong MỘT giao dịch, nổ giữa chừng thì không đích nào nhận nửa vời."""
from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..models.cong_doan import CongDoan
from ..models.san_xuat_kcs import SanXuatKcsTieuChi
from .catalog_base import CatalogRepo
from .tim_khong_dau import like_khong_dau


class SanXuatKcsTieuChiRepository(CatalogRepo):
    model = SanXuatKcsTieuChi
    fields = ("cong_doan_id", "ten", "thu_tu")
    ma_case = "upper"
    ma_prefix = "KM"        # mã sinh ngầm: người khai chỉ gõ câu chữ hạng mục
    commit_on_write = False

    def cong_doan_ids_ton_tai(self, ids: set[int]) -> set[int]:
        """Tập id công đoạn CÓ THẬT trong `ids` — service dùng để chặn khai vào id ma."""
        if not ids:
            return set()
        return {i for (i,) in self.db.execute(
            select(CongDoan.id).where(CongDoan.id.in_(ids))
        ).all()}

    def trung_ten(self, cong_doan_id: int, ten: str, tru_id: int | None = None) -> bool:
        """Công đoạn này đã có hạng mục cùng câu chữ chưa (khớp `uq_kcs_hang_muc_cong_doan_ten`).

        Kiểm ở service để trả 400 có chữ, thay vì để UniqueConstraint bắn 500."""
        q = select(SanXuatKcsTieuChi.id).where(
            SanXuatKcsTieuChi.cong_doan_id == cong_doan_id,
            SanXuatKcsTieuChi.ten == ten,
        )
        if tru_id is not None:
            q = q.where(SanXuatKcsTieuChi.id != tru_id)
        return self.db.execute(q.limit(1)).first() is not None

    def thu_tu_tiep(self, cong_doan_id: int) -> int:
        """`thu_tu` cho tiêu chí thêm mới = lớn nhất hiện có của công đoạn + 1."""
        mx = self.db.execute(
            select(func.max(SanXuatKcsTieuChi.thu_tu))
            .where(SanXuatKcsTieuChi.cong_doan_id == cong_doan_id)
        ).scalar()
        return int(mx or 0) + 1

    def cua_cong_doan(self, cong_doan_id: int) -> list[SanXuatKcsTieuChi]:
        """Tiêu chí của MỘT công đoạn theo thứ tự hiển thị."""
        return list(self.db.execute(
            select(SanXuatKcsTieuChi)
            .where(SanXuatKcsTieuChi.cong_doan_id == cong_doan_id)
            .order_by(SanXuatKcsTieuChi.thu_tu, SanXuatKcsTieuChi.id)
        ).scalars())

    def ten_theo_cong_doan(self, ids: set[int]) -> dict[int, set[str]]:
        """{cong_doan_id: tập câu chữ đã có} — `chep` dùng để bỏ câu đích đã có, một truy vấn."""
        out: dict[int, set[str]] = {i: set() for i in ids}
        if not ids:
            return out
        for cd, ten in self.db.execute(
            select(SanXuatKcsTieuChi.cong_doan_id, SanXuatKcsTieuChi.ten)
            .where(SanXuatKcsTieuChi.cong_doan_id.in_(ids))
        ):
            out.setdefault(cd, set()).add(ten)
        return out


def cong_doan_gon(db: Session):
    """(id, ma, ten, nhom, active) của TOÀN danh mục Công đoạn trong MỘT truy vấn, đúng 5 cột.

    Đừng đổi sang `select(CongDoan)` hay mượn `/api/cong-doan`: dòng đầy đủ kéo cả công thức · đầu
    việc · vật tư · máy (~1,8 KB mỗi công đoạn, đo 17/09/2026) chỉ để đổ ngăn trái, và cửa đó đòi
    quyền Công đoạn/Tính giá chứ không phải KCS.
    """
    return db.execute(
        select(CongDoan.id, CongDoan.ma, CongDoan.ten, CongDoan.nhom, CongDoan.active)
    ).all()


def cong_doan_khop(db: Session, q: str | None) -> set[int] | None:
    """Tập id công đoạn KHỚP ô tìm (tìm tương đối, bỏ dấu): mã/tên công đoạn HOẶC câu chữ một
    tiêu chí của nó. `None` = ô tìm trống (không lọc)."""
    khop = [c for c in (
        like_khong_dau(CongDoan.ma, q), like_khong_dau(CongDoan.ten, q),
        like_khong_dau(SanXuatKcsTieuChi.ten, q),
    ) if c is not None]
    if not khop:
        return None
    return {i for (i,) in db.execute(
        select(CongDoan.id).distinct()
        .outerjoin(SanXuatKcsTieuChi, SanXuatKcsTieuChi.cong_doan_id == CongDoan.id)
        .where(or_(*khop))
    ).all()}


def hang_muc_theo_cong_doan(db: Session) -> dict[int, list[SanXuatKcsTieuChi]]:
    """{cong_doan_id: [tiêu chí]} cho TOÀN danh mục, một truy vấn — đừng gọi mỗi công đoạn một
    lần. Tìm kiếm lọc ở tầng CÔNG ĐOẠN (`cong_doan_khop`): khớp một câu thì vẫn trả ĐỦ tiêu chí
    của công đoạn đó, để người khai thấy câu nằm ở đâu giữa các câu khác."""
    out: dict[int, list[SanXuatKcsTieuChi]] = {}
    for r in db.execute(
        select(SanXuatKcsTieuChi).order_by(
            SanXuatKcsTieuChi.cong_doan_id, SanXuatKcsTieuChi.thu_tu, SanXuatKcsTieuChi.id
        )
    ).scalars():
        out.setdefault(r.cong_doan_id, []).append(r)
    return out
