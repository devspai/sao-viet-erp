"""Truy vấn của LẦN GIA CÔNG NGOÀI — spec 2026-09-26. Mọi SELECT của module nằm ở đây."""
from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..models.accounting import PAYMENT_VOUCHER_CANCELLED, PaymentVoucher
from ..models.delivery import LG_DA_HUY, DeliveryTrip
from ..models.gia_cong_ngoai import GiaCongNgoai
from ..models.lsx import LsxCongDoan, LsxCongDoanPhuThuoc
from ..models.purchase import SUPPLIER_ACTIVE, Supplier
from ..models.role import RolePermission
from ..models.san_xuat import SanXuatCongViec
from ..models.san_xuat_san_luong import BG_DE_XUAT, SanXuatBanGiao
from ..models.stock_request import REQ_CANCELLED, REQ_NHAP, REQ_XUAT, StockRequest
from ..models.user import User


class GiaCongNgoaiRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Nhà gia công ----------------------------------------------------------------------
    def nha_gia_cong_options(self) -> list[Supplier]:
        """NCC ĐANG HOẠT ĐỘNG có tích "Nhận gia công", theo tên — nguồn DUY NHẤT của ô chọn."""
        return list(self.db.scalars(
            select(Supplier)
            .where(Supplier.nhan_gia_cong.is_(True), Supplier.status == SUPPLIER_ACTIVE)
            .order_by(Supplier.name, Supplier.id)
        ))

    def nha_gia_cong(self, supplier_id: int | None) -> Supplier | None:
        """Một NCC CÒN chọn được làm nhà gia công — None nếu không có / ngưng / chưa tích."""
        if not supplier_id:
            return None
        s = self.db.get(Supplier, int(supplier_id))
        if s is None or not s.nhan_gia_cong or s.status != SUPPLIER_ACTIVE:
            return None
        return s

    # --- Lần gia công --------------------------------------------------------------------------
    def get(self, gcn_id: int) -> GiaCongNgoai | None:
        return self.db.get(GiaCongNgoai, gcn_id)

    def khoa(self, gcn_id: int) -> GiaCongNgoai | None:
        """Lấy + KHOÁ dòng (Postgres `FOR UPDATE`; SQLite bỏ qua) — chặn bấm đúp Mang đi / Chốt."""
        return self.db.execute(
            select(GiaCongNgoai).where(GiaCongNgoai.id == gcn_id).with_for_update()
        ).scalar_one_or_none()

    def cua_lenh(self, lsx_id: int) -> list[GiaCongNgoai]:
        return list(self.db.scalars(
            select(GiaCongNgoai).where(GiaCongNgoai.lsx_id == lsx_id).order_by(GiaCongNgoai.id)
        ))

    def cong_viec_cua(self, gcn_id: int) -> list[SanXuatCongViec]:
        """Công việc của lần, theo THỨ TỰ bước (snapshot đẻ công việc theo thứ tự routing ⇒ id tăng)."""
        return list(self.db.scalars(
            select(SanXuatCongViec).where(SanXuatCongViec.gia_cong_ngoai_id == gcn_id)
            .order_by(SanXuatCongViec.id)
        ))

    def ban_giao_cho_mang_di(self, cv_id: int, *, khoa: bool = False) -> list[SanXuatBanGiao]:
        """Bàn giao bước trước đã ĐỀ XUẤT sang công việc đầu của dải, chưa ai nhận.

        `khoa=True` (Postgres `FOR UPDATE`; SQLite bỏ qua) cho `mot_phan.mang_di` — chặn hai
        request "Đã mang đi" bấm gần như đồng thời cùng nhận trùng một dòng bàn giao. Đọc để
        HIỂN THỊ (`lan_dict`) không khoá — GET không được giữ khoá dòng."""
        stmt = (
            select(SanXuatBanGiao).where(
                SanXuatBanGiao.dich_cong_viec_id == cv_id, SanXuatBanGiao.trang_thai == BG_DE_XUAT,
            ).order_by(SanXuatBanGiao.id)
        )
        if khoa:
            stmt = stmt.with_for_update()
        return list(self.db.scalars(stmt))

    def ban_giao_tu(self, cv_id: int) -> list[SanXuatBanGiao]:
        """Bàn giao ĐI từ công việc cuối của lần (chốt về xưởng đẻ đúng một cái)."""
        return list(self.db.scalars(
            select(SanXuatBanGiao).where(SanXuatBanGiao.nguon_cong_viec_id == cv_id)
            .order_by(SanXuatBanGiao.id)
        ))

    def co_buoc_truoc(self, lsx_cong_doan_id: int | None) -> bool:
        """Bước này có bước trước (cạnh đi vào, hoặc bước có `thu_tu` nhỏ hơn cùng lệnh)?"""
        if not lsx_cong_doan_id:
            return False
        cd = self.db.get(LsxCongDoan, lsx_cong_doan_id)
        if cd is None:
            return False
        co_canh = self.db.execute(select(LsxCongDoanPhuThuoc.id).where(
            LsxCongDoanPhuThuoc.buoc_sau_id == cd.id).limit(1)).first()
        if co_canh is not None:
            return True
        return self.db.execute(select(LsxCongDoan.id).where(
            LsxCongDoan.lsx_id == cd.lsx_id, LsxCongDoan.thu_tu < cd.thu_tu).limit(1)).first() is not None

    def co_lan_da_di_trong_goi(self, goi_id: int) -> bool:
        """Gói có lần gia công đã MANG ĐI hoặc đã CHỐT — hàng đã rời xưởng, không thu hồi gói được."""
        return self.db.execute(
            select(GiaCongNgoai.id)
            .join(SanXuatCongViec, SanXuatCongViec.gia_cong_ngoai_id == GiaCongNgoai.id)
            .where(SanXuatCongViec.goi_id == goi_id, GiaCongNgoai.huy_luc.is_(None),
                   or_(GiaCongNgoai.mang_di_luc.is_not(None), GiaCongNgoai.chot_luc.is_not(None)))
            .limit(1)
        ).first() is not None

    def lan_cua_goi(self, goi_id: int) -> list[GiaCongNgoai]:
        return list(self.db.scalars(
            select(GiaCongNgoai).where(GiaCongNgoai.id.in_(
                select(SanXuatCongViec.gia_cong_ngoai_id).where(SanXuatCongViec.goi_id == goi_id)
            ))
        ))

    def user_names(self, ids) -> dict[int, str]:
        ids = {int(i) for i in ids if i}
        if not ids:
            return {}
        return {uid: ten for uid, ten in self.db.execute(
            select(User.id, User.name).where(User.id.in_(ids)))}

    # --- Người nhận thông báo (spec §6) -----------------------------------------------------
    def _nguoi_co(self, module_key: str, cot) -> list[int]:
        stmt = (
            select(User.id)
            .join(RolePermission, RolePermission.role_id == User.role_id)
            .where(RolePermission.module_key == module_key, cot.is_(True),
                   User.is_active.is_(True))
        )
        return sorted({uid for (uid,) in self.db.execute(stmt)})

    def nguoi_sua_lenh(self) -> list[int]:
        """Ai mang hàng đi / chốt được: tài khoản có `san_xuat:update` (không thêm vai, không bit)."""
        return self._nguoi_co("san_xuat", RolePermission.can_update)

    def nguoi_lap_phieu_chi(self) -> list[int]:
        """Kế toán lập phiếu chi: `phieu_chi:create` — người nhận toast "chờ chi"."""
        return self._nguoi_co("phieu_chi", RolePermission.can_create)

    def phieu_chi_song(self, gcn_ids) -> dict[int, PaymentVoucher]:
        """Phiếu chi CÒN HIỆU LỰC của từng lần (tối đa một — partial unique mg 0339)."""
        ids = [int(i) for i in gcn_ids if i]
        if not ids:
            return {}
        return {v.gia_cong_ngoai_id: v for v in self.db.scalars(
            select(PaymentVoucher).where(
                PaymentVoucher.gia_cong_ngoai_id.in_(ids),
                PaymentVoucher.status != PAYMENT_VOUCHER_CANCELLED,
            ))}

    # --- Chứng từ sau chốt (Task 8: kho / giao thẳng) -----------------------------------------
    def _yeu_cau_cua(self, gcn_id: int, loai: str) -> list[StockRequest]:
        return list(self.db.scalars(select(StockRequest).where(
            StockRequest.gia_cong_ngoai_id == gcn_id, StockRequest.loai == loai,
            StockRequest.trang_thai != REQ_CANCELLED).order_by(StockRequest.id)))

    def yeu_cau_nhap_cua(self, gcn_id: int) -> list[StockRequest]:
        """Đề nghị NHẬP thành phẩm do lần chốt về kho đẻ ra (còn sống)."""
        return self._yeu_cau_cua(gcn_id, REQ_NHAP)

    def yeu_cau_xuat_cua(self, gcn_id: int) -> list[StockRequest]:
        """Đề nghị XUẤT giấy cấp cho nhà gia công trọn gói (Task 9) — còn sống. Tách loại để mở
        lại số chốt không đụng nhầm phiếu giấy đã xuất."""
        return self._yeu_cau_cua(gcn_id, REQ_XUAT)

    def chuyen_giao_thang_cua(self, gcn_id: int) -> list[DeliveryTrip]:
        return list(self.db.scalars(select(DeliveryTrip).where(
            DeliveryTrip.gia_cong_ngoai_id == gcn_id, DeliveryTrip.trang_thai != LG_DA_HUY)))
