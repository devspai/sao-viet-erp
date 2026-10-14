"""Repository — danh mục Mục thu chi. CRUD dùng chung + vài câu đọc/ghi phục vụ phiếu."""
from __future__ import annotations

from sqlalchemy import func, select

from ..models.accounting import PaymentReceipt, PaymentVoucher
from ..models.muc_thu_chi import MUC_CO_DINH, MucThuChi
from .catalog_base import CatalogRepo


class MucThuChiRepository(CatalogRepo):
    model = MucThuChi
    fields = ("ten", "loai", "ghi_chu", "active")
    ma_prefix = "MTC-"
    order_cols = ("loai", "ten")
    nhan_cot = {"loai": {"thu": "Thu", "chi": "Chi"}}
    commit_on_write = False   # `MucThuChiService` chốt sau khi ghi nhật ký — xem `catalog_base`

    def extra_conds(self, *, loai: str | None = None, **_) -> list:
        return [MucThuChi.loai == loai] if loai else []

    def dem_phieu(self, muc_id: int) -> int:
        """Số phiếu (chi + thu, mọi trạng thái) đang mang mục này."""
        chi = self.db.execute(select(func.count()).select_from(PaymentVoucher)
                              .where(PaymentVoucher.muc_thu_chi_id == muc_id)).scalar_one()
        thu = self.db.execute(select(func.count()).select_from(PaymentReceipt)
                              .where(PaymentReceipt.muc_thu_chi_id == muc_id)).scalar_one()
        return int(chi) + int(thu)

    def list_tu(self, *, bo_qua: int, lay: int, q: str | None = None, active: bool | None = None,
                **kw) -> tuple[list[MucThuChi], int]:
        """Như `list()` nhưng cắt theo SỐ DÒNG bỏ qua — danh sách mục ghép 6 mục cố định lên đầu
        nên trang của dòng thật lệch đi đúng số mục cố định đã chiếm."""
        conds = self._dieu_kien(q=q, active=active, **kw)
        base = self._base_select()
        count_stmt = select(func.count()).select_from(self.model)
        for c in conds:
            base = base.where(c)
            count_stmt = count_stmt.where(c)
        total = int(self.db.execute(count_stmt).scalar_one())
        if lay <= 0:
            return [], total
        base = base.order_by(*(getattr(self.model, c).asc() for c in self.order_cols))
        return list(self.db.execute(base.offset(max(0, bo_qua)).limit(lay)).scalars()), total

    def da_dung(self, ids: list[int]) -> dict[int, int]:
        """Số phiếu (chi + thu, mọi trạng thái) mang từng mục — cột "Đã dùng". Id âm = mục cố
        định: đếm theo nguồn phiếu thay vì theo cột trỏ mục."""
        ra: dict[int, int] = {i: 0 for i in ids}
        that = [i for i in ids if i > 0]
        if that:
            for bang in (PaymentVoucher, PaymentReceipt):
                stmt = (select(bang.muc_thu_chi_id, func.count())
                        .where(bang.muc_thu_chi_id.in_(that)).group_by(bang.muc_thu_chi_id))
                for i, n in self.db.execute(stmt):
                    ra[int(i)] += int(n)
        co_dinh = [m for m in MUC_CO_DINH if m["id"] in ra]
        if co_dinh:
            for bang, loai in ((PaymentVoucher, "chi"), (PaymentReceipt, "thu")):
                nguon = [m["nguon"] for m in co_dinh if m["loai"] == loai]
                if not nguon:
                    continue
                stmt = (select(bang.source_type, func.count())
                        .where(bang.source_type.in_(nguon)).group_by(bang.source_type))
                dem = {str(k): int(n) for k, n in self.db.execute(stmt)}
                for m in co_dinh:
                    if m["loai"] == loai:
                        ra[m["id"]] = dem.get(m["nguon"], 0)
        return ra
