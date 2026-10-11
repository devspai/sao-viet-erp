"""Tra các đối tượng GẮN VỚI một lệnh sản xuất — nguồn cho tab Nhật ký của lệnh.

Nhật ký ghi audit theo ĐỐI TƯỢNG bị tác động (`gia_cong_ngoai:7`, `payment_voucher:3`…), không
theo lệnh. Muốn kể đủ chuyện của một lệnh thì phải biết lệnh đó đang kéo theo những đối tượng nào —
đọc từ BẢNG, không quét chữ trong `detail` của cả bảng nhật ký.
"""
from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..models.accounting import PaymentVoucher
from ..models.bai_ghep import BaiGhepThanhVien
from ..models.gia_cong_ngoai import GiaCongNgoai
from ..models.purchase import YeuCauMuaNguonLenh
from ..models.san_xuat import SanXuatCongViec, SanXuatNhomLsx
from ..models.stock_request import StockRequest, StockRequestLine
from ..models.stock_voucher import StockVoucher
from ..models.xep_lich import XepLichCongDoan


class LsxNhatKyRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _ids(self, stmt) -> list[int]:
        return sorted({i for i in self.db.execute(stmt).scalars() if i is not None})

    def cong_viec(self, lsx_id: int) -> list[SanXuatCongViec]:
        """Các công việc xưởng của lệnh, mọi gói phát hành (gói cũ đã thay vẫn là chuyện đã xảy ra)."""
        return list(self.db.execute(
            select(SanXuatCongViec).where(SanXuatCongViec.lsx_id == lsx_id).order_by(SanXuatCongViec.id)
        ).scalars())

    def gia_cong_ngoai(self, lsx_id: int, cong_viec_ids: list[int]) -> list[int]:
        """Trọn gói neo `lsx_id`; từng công đoạn neo qua `san_xuat_cong_viec.gia_cong_ngoai_id`."""
        dk = [GiaCongNgoai.lsx_id == lsx_id]
        if cong_viec_ids:
            dk.append(GiaCongNgoai.id.in_(
                select(SanXuatCongViec.gia_cong_ngoai_id).where(SanXuatCongViec.id.in_(cong_viec_ids))
            ))
        return self._ids(select(GiaCongNgoai.id).where(or_(*dk)))

    def phieu_chi(self, gcn_ids: list[int]) -> list[int]:
        if not gcn_ids:
            return []
        return self._ids(select(PaymentVoucher.id).where(PaymentVoucher.gia_cong_ngoai_id.in_(gcn_ids)))

    def nhom(self, lsx_id: int) -> list[int]:
        return self._ids(select(SanXuatNhomLsx.nhom_id).where(SanXuatNhomLsx.lsx_id == lsx_id))

    def goi(self, cong_viec_ids: list[int]) -> list[int]:
        if not cong_viec_ids:
            return []
        return self._ids(select(SanXuatCongViec.goi_id).where(SanXuatCongViec.id.in_(cong_viec_ids)))

    def bai_ghep(self, lsx_id: int) -> list[int]:
        return self._ids(select(BaiGhepThanhVien.bai_ghep_id).where(BaiGhepThanhVien.lsx_id == lsx_id))

    def xep_lich(self, lsx_id: int) -> list[int]:
        return self._ids(select(XepLichCongDoan.id).where(XepLichCongDoan.lsx_id == lsx_id))

    def yeu_cau_mua(self, lsx_id: int) -> list[int]:
        """Phiếu đề nghị mua của bộ phận có dòng "mua cho" lệnh này."""
        return self._ids(select(YeuCauMuaNguonLenh.department_request_id)
                         .where(YeuCauMuaNguonLenh.lsx_id == lsx_id))

    def yeu_cau_kho(self, lsx_id: int, cong_viec_ids: list[int], gcn_ids: list[int]) -> list[StockRequest]:
        """Đề nghị nhập/xuất kho của lệnh: qua công việc xưởng, lần gia công ngoài, hoặc dòng ghi lệnh."""
        dk = [StockRequest.id.in_(select(StockRequestLine.request_id).where(StockRequestLine.lsx_id == lsx_id))]
        if cong_viec_ids:
            dk += [StockRequest.san_xuat_cong_viec_id.in_(cong_viec_ids),
                   StockRequest.vat_tu_tra_cong_viec_id.in_(cong_viec_ids)]
        if gcn_ids:
            dk.append(StockRequest.gia_cong_ngoai_id.in_(gcn_ids))
        return list(self.db.execute(select(StockRequest).where(or_(*dk))).scalars())

    def phieu_kho(self, request_ids: list[int]) -> list[StockVoucher]:
        if not request_ids:
            return []
        return list(self.db.execute(
            select(StockVoucher).where(StockVoucher.request_id.in_(request_ids))
        ).scalars())
