"""Data-access cho tab SẢN LƯỢNG của Bàn tổ (spec 2026-09-14 §6, sửa 18/09/2026 §7.3b).

Đọc MẺ (`san_xuat_batch`) theo PHẠM VI TỔ của người xem. Mẻ có đúng MỘT chủ — tổ của bước
(`san_xuat_cong_viec.department_id`) — nên bảng chia hai mục:

  · **mẻ của tổ** — chủ mẻ thuộc phạm vi đang xem (số của mẻ vào dòng tổng);
  · **khách** — chủ mẻ ở tổ khác, nhưng có người của tổ mình trong mẻ (KHÔNG vào dòng tổng).

⚠️ 18/09/2026 (mg `0322`): mọi truy vấn bản chia (`san_xuat_phan_bo` / `_dong`) gỡ hẳn cùng tầng
chia sản lượng — `_dong_cua_toi`, `dong_chia`, `batch_co_ban_chia`, `tong_cua_toi` không còn nguồn.
"Ai làm lần ghi" đọc từ ảnh chụp `san_xuat_batch_nguoi` (tổ tick lúc ghi, 10/10/2026 mg 0386) — tổ
GỐC của người lúc ghi nằm ngay trên dòng, nên lọc mẻ khách chỉ còn một EXISTS.

Lọc ngày theo GIỜ BẮT ĐẦU MẺ (UTC thật, service quy khoảng ngày giờ xưởng ra hai mốc UTC). Gom theo
nguồn LỆNH/BÀI GHÉP cùng luật bàn tổ (`SanXuatRepository._khoa_lenh_cols`), cắt trang + cộng tổng ở
SQL — kéo cả tháng mẻ về rồi cộng bằng Python là mỗi lần mở tab đọc cả bảng.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, case, exists, func, literal, or_, select
from sqlalchemy.orm import Session

from ..models.bai_ghep import BaiGhep
from ..models.department import Department
from ..models.employee import Employee
from ..models.lsx import Lsx
from ..models.san_xuat import SanXuatCongViec
from ..models.san_xuat_san_luong import SanXuatBatch, SanXuatBatchNguoi, SanXuatBatchPhatSinh

@dataclass(frozen=True)
class LocMe:
    """Điều kiện của nút "Lọc" (10/10/2026). Hai tầng:

    · tầng MẺ (`cong_doan`, `nguoi`, `phat_sinh`) — lọc từng mẻ, nên vừa chọn trang lệnh vừa lọc
      dòng mẻ trong trang;
    · tầng LỆNH (`loai`, `gap`) — chỉ chọn trang lệnh; mẻ trong trang đã thuộc lệnh khớp.
    """

    cong_doan: tuple[str, ...] = ()
    nguoi: tuple[int, ...] = ()
    phat_sinh: str | None = None  # "co" | "khong"
    loai: str | None = None  # "lsx" | "bai_ghep"
    gap: str | None = None  # "gap" | "thuong"


def _khoa_nguon():
    """(loại, id) nguồn của công việc — bài ghép THẮNG lệnh, y hệt bàn tổ."""
    co_bg = SanXuatCongViec.bai_ghep_id.is_not(None)
    return (
        case((co_bg, literal("bai_ghep")), else_=literal("lsx")),
        case((co_bg, SanXuatCongViec.bai_ghep_id), else_=SanXuatCongViec.lsx_id),
    )


class SanXuatSanLuongToRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- điều kiện dùng chung ----------------------------------------------------------------
    @staticmethod
    def _co_nguoi_cua_to(to_ids: set[int], employee_id: int | None = None):
        """Lần ghi có ít nhất một người của `to_ids` — đọc ảnh chụp người làm (`nguoi_trong_me`).

        Tổ là tổ GỐC của người LÚC GHI (`san_xuat_batch_nguoi.department_id`), vì đây chính là câu
        hỏi "người của tổ tôi có đi làm ở lần này không"."""
        dk = [SanXuatBatchNguoi.batch_id == SanXuatBatch.id, SanXuatBatchNguoi.department_id.in_(to_ids)]
        if employee_id is not None:
            dk.append(SanXuatBatchNguoi.employee_id == employee_id)
        return exists(select(SanXuatBatchNguoi.id).where(*dk))

    @staticmethod
    def _co_nguoi(employee_ids: Sequence[int]):
        """Lần ghi có ít nhất một trong `employee_ids`."""
        return exists(select(SanXuatBatchNguoi.id).where(
            SanXuatBatchNguoi.batch_id == SanXuatBatch.id,
            SanXuatBatchNguoi.employee_id.in_(employee_ids),
        ))

    def _dk_me(self, loc: LocMe | None) -> list:
        """Điều kiện tầng MẺ của nút Lọc — không cần join lệnh / bài ghép."""
        if loc is None:
            return []
        dk = []
        if loc.cong_doan:
            dk.append(SanXuatCongViec.ten_cong_doan.in_(loc.cong_doan))
        if loc.nguoi:
            dk.append(self._co_nguoi(loc.nguoi))
        if loc.phat_sinh in ("co", "khong"):
            co = exists(select(SanXuatBatchPhatSinh.id)
                        .where(SanXuatBatchPhatSinh.batch_id == SanXuatBatch.id))
            dk.append(co if loc.phat_sinh == "co" else ~co)
        return dk

    def _dk_chung(self, tu: datetime, den: datetime, tim: str | None, loc: LocMe | None = None) -> list:
        dk = [SanXuatBatch.bat_dau >= tu, SanXuatBatch.bat_dau < den]
        kw = (tim or "").strip()
        if kw:
            mau = f"%{kw}%"
            dk.append(or_(
                Lsx.ma.ilike(mau), Lsx.ten.ilike(mau), BaiGhep.ma.ilike(mau), BaiGhep.ten.ilike(mau),
            ))
        dk += self._dk_me(loc)
        if loc is not None:
            co_bg = SanXuatCongViec.bai_ghep_id.is_not(None)
            if loc.loai == "lsx":
                dk.append(~co_bg)
            elif loc.loai == "bai_ghep":
                dk.append(co_bg)
            if loc.gap in ("gap", "thuong"):
                # Bài ghép thắng lệnh — cùng luật khoá nguồn.
                gap = func.coalesce(case((co_bg, BaiGhep.is_rush), else_=Lsx.is_rush), False)
                dk.append(gap.is_(True) if loc.gap == "gap" else gap.is_(False))
        return dk

    @staticmethod
    def _nen(*cot):
        return (
            select(*cot)
            .select_from(SanXuatBatch)
            .join(SanXuatCongViec, SanXuatBatch.cong_viec_id == SanXuatCongViec.id)
            .outerjoin(Lsx, SanXuatCongViec.lsx_id == Lsx.id)
            .outerjoin(BaiGhep, SanXuatCongViec.bai_ghep_id == BaiGhep.id)
        )

    def _pham_vi(self, tron: set[int], rieng: set[int], employee_id: int | None):
        """Mẻ lọt phạm vi = mẻ của tổ trong phạm vi, HOẶC mẻ tổ khác có người của mình trong đó.
        None = không thấy gì.

        Nhánh `rieng` (công nhân, quyền chỉ "Của tôi") siết thêm: phải có CHÍNH người đó trong mẻ —
        thợ không được xem mẻ của người khác cùng tổ (§12.3).
        """
        nhanh = []
        if tron:
            nhanh.append(SanXuatCongViec.department_id.in_(tron))
            nhanh.append(self._co_nguoi_cua_to(tron))
        if rieng and employee_id is not None:
            nhanh.append(and_(
                or_(SanXuatCongViec.department_id.in_(rieng),
                    self._co_nguoi_cua_to(rieng, employee_id)),
                self._co_nguoi_cua_to(rieng | tron, employee_id),
            ))
        if not nhanh:
            return None
        return nhanh[0] if len(nhanh) == 1 else or_(*nhanh)

    # --- trang lệnh ---------------------------------------------------------------------------
    def trang_nguon(
        self, *, tron: set[int], rieng: set[int], employee_id: int | None,
        tu: datetime, den: datetime, tim: str | None, trang: int, co_trang: int,
        loc: LocMe | None = None,
    ) -> tuple[list[tuple[str, int | None]], int]:
        """Một trang khoá nguồn (loại, id), mới hoạt động gần nhất lên đầu, + tổng số nguồn."""
        pv = self._pham_vi(tron, rieng, employee_id)
        if pv is None:
            return [], 0
        loai, nid = _khoa_nguon()
        moi_nhat = func.max(SanXuatBatch.bat_dau)
        nhom = (
            self._nen(loai.label("loai"), nid.label("nid"), moi_nhat.label("moi"))
            .where(pv, *self._dk_chung(tu, den, tim, loc))
            .group_by(loai, nid)
        )
        tong = self.db.scalar(select(func.count()).select_from(nhom.subquery())) or 0
        rows = self.db.execute(
            nhom.order_by(moi_nhat.desc(), nid).limit(co_trang).offset((trang - 1) * co_trang)
        ).all()
        return [(r.loai, r.nid) for r in rows], int(tong)

    def me_cua_nguon(
        self, khoa: list[tuple[str, int | None]], *, tron: set[int], rieng: set[int],
        employee_id: int | None, tu: datetime, den: datetime, loc: LocMe | None = None,
    ) -> list[tuple[SanXuatBatch, SanXuatCongViec]]:
        """Mọi mẻ (kèm công việc) của các nguồn trong trang, cùng phạm vi + khoảng ngày."""
        pv = self._pham_vi(tron, rieng, employee_id)
        if pv is None or not khoa:
            return []
        bg_ids = {i for l, i in khoa if l == "bai_ghep" and i is not None}
        lsx_ids = {i for l, i in khoa if l == "lsx" and i is not None}
        theo_nguon = []
        if bg_ids:
            theo_nguon.append(SanXuatCongViec.bai_ghep_id.in_(bg_ids))
        if lsx_ids:
            theo_nguon.append(and_(SanXuatCongViec.bai_ghep_id.is_(None),
                                   SanXuatCongViec.lsx_id.in_(lsx_ids)))
        if any(i is None for _, i in khoa):
            theo_nguon.append(and_(SanXuatCongViec.bai_ghep_id.is_(None),
                                   SanXuatCongViec.lsx_id.is_(None)))
        return [
            (b, cv) for b, cv in self.db.execute(
                select(SanXuatBatch, SanXuatCongViec)
                .join(SanXuatCongViec, SanXuatBatch.cong_viec_id == SanXuatCongViec.id)
                .where(pv, or_(*theo_nguon), *self._dk_me(loc),
                       SanXuatBatch.bat_dau >= tu, SanXuatBatch.bat_dau < den)
                .order_by(SanXuatBatch.bat_dau, SanXuatBatch.id)
            ).all()
        ]

    # --- tổng của CẢ bộ lọc (không chỉ trang) -------------------------------------------------
    def tong_cua_to(
        self, *, tron: set[int], tu: datetime, den: datetime, tim: str | None,
        loc: LocMe | None = None,
    ) -> list[tuple[str, float, float, int]]:
        """(đơn vị, tổng tốt, tổng hỏng, số mẻ) của MẺ CỦA TỔ — gộp theo ĐƠN VỊ, không cộng lẫn.

        Chỉ đếm mẻ mà tổ trong phạm vi LÀ CHỦ. Mẻ khách để riêng và không cộng, nên cộng tổng của
        cả 8 tổ ra đúng sản lượng xưởng, không mẻ nào bị tính hai lượt (§7.3b luật 1).
        """
        if not tron:
            return []
        rows = self.db.execute(
            self._nen(SanXuatBatch.don_vi, func.sum(SanXuatBatch.tot), func.sum(SanXuatBatch.hong),
                      func.count(SanXuatBatch.id))
            .where(SanXuatCongViec.department_id.in_(tron), *self._dk_chung(tu, den, tim, loc))
            .group_by(SanXuatBatch.don_vi)
            .order_by(SanXuatBatch.don_vi)
        ).all()
        return [(dv, float(t or 0), float(h or 0), int(n or 0)) for dv, t, h, n in rows]

    # --- giá trị chọn được của nút Lọc ----------------------------------------------------------
    def cong_doan_trong_khoang(
        self, *, tron: set[int], rieng: set[int], employee_id: int | None,
        tu: datetime, den: datetime,
    ) -> list[str]:
        """Tên công đoạn có mẻ trong phạm vi + khoảng ngày (trước mọi điều kiện khác của nút Lọc)."""
        pv = self._pham_vi(tron, rieng, employee_id)
        if pv is None:
            return []
        return [t for (t,) in self.db.execute(
            self._nen(SanXuatCongViec.ten_cong_doan).distinct()
            .where(pv, SanXuatBatch.bat_dau >= tu, SanXuatBatch.bat_dau < den,
                   SanXuatCongViec.ten_cong_doan.is_not(None))
            .order_by(SanXuatCongViec.ten_cong_doan)
        ).all() if t]

    def nguoi_cua_to(self, to_ids: set[int]) -> list[tuple[int, str]]:
        """(id, họ tên) người có tổ GỐC trong `to_ids` — giá trị của điều kiện "Người tham gia"."""
        if not to_ids:
            return []
        return [(i, t) for i, t in self.db.execute(
            select(Employee.id, Employee.full_name)
            .where(Employee.department_id.in_(to_ids))
            .order_by(Employee.full_name, Employee.id)
        ).all()]

    # --- nhãn ---------------------------------------------------------------------------------
    def nhan_nguon(self, khoa: list[tuple[str, int | None]]) -> dict[tuple[str, int | None], tuple[str, str]]:
        ket: dict[tuple[str, int | None], tuple[str, str]] = {}
        lsx_ids = {i for l, i in khoa if l == "lsx" and i is not None}
        bg_ids = {i for l, i in khoa if l == "bai_ghep" and i is not None}
        if lsx_ids:
            for i, ma, ten in self.db.execute(select(Lsx.id, Lsx.ma, Lsx.ten).where(Lsx.id.in_(lsx_ids))):
                ket[("lsx", i)] = (ma or "", ten or "")
        if bg_ids:
            for i, ma, ten in self.db.execute(
                select(BaiGhep.id, BaiGhep.ma, BaiGhep.ten).where(BaiGhep.id.in_(bg_ids))
            ):
                ket[("bai_ghep", i)] = (ma or "", ten or "")
        return ket

    def quy_cach_lenh(self, lsx_ids: set[int]) -> dict[int, dict]:
        """`{lsx_id: quy_cach_json}` — bù khoá cho ảnh chụp đời cũ của công việc."""
        if not lsx_ids:
            return {}
        return {i: qc or {} for i, qc in self.db.execute(
            select(Lsx.id, Lsx.quy_cach_json).where(Lsx.id.in_(lsx_ids)))}

    def ten_nhan_vien(self, ids: set[int]) -> dict[int, str]:
        if not ids:
            return {}
        return dict(self.db.execute(select(Employee.id, Employee.full_name).where(Employee.id.in_(ids))).all())

    def ten_to(self, ids: set[int]) -> dict[int, str]:
        """Tên tổ cho NHÃN "(tổ bế)" — kể cả tổ NGOÀI phạm vi người xem, vì nhãn chỉ nói người đó
        từ đâu sang, không mở thêm dữ liệu nào của tổ ấy."""
        if not ids:
            return {}
        return dict(self.db.execute(
            select(Department.id, Department.name).where(Department.id.in_(ids))
        ).all())
