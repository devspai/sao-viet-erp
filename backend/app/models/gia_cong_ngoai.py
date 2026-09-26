"""LẦN GIA CÔNG NGOÀI — spec `docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md`.

Một lần = một nhà gia công + một khối việc đem ra ngoài, gửi một lần, chốt MỘT con số:
  · `mot_phan` — một dải bước "Thuê ngoài" LIỀN NHAU, cùng nhà gia công, của một lệnh. Các công
    việc của dải trỏ về đây qua `san_xuat_cong_viec.gia_cong_ngoai_id`.
  · `tron_goi` — cả lệnh; lệnh được phát hành với MỘT công việc thuê ngoài không tổ nào nhận.

Vì sao một bảng mà không thêm cột vào bước: một lần phủ NHIỀU bước (dải) hoặc KHÔNG bước nào
(trọn gói) — cột trên từng bước không chở nổi.

KHÔNG lưu trạng thái (dẫn xuất từ các mốc — `services/gia_cong_ngoai.trang_thai`) và KHÔNG lưu
tiền (= `sl_cuoi × don_gia`). KHÔNG có ngày hẹn về, hao hụt cho phép, công nợ — chủ chốt 26/09/2026.

Người ghi (`created_by`, `mang_di_boi_id`, `chot_boi_id`, `huy_boi_id`) là tham chiếu MỀM tới
`users`: FK tới `users` trong dự án bắt buộc CASCADE (`test_user_fk_cascade`), mà xoá tài khoản
không được kéo mất lần gia công đã có phiếu chi.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, false as sa_false
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base

KIEU_MOT_PHAN = "mot_phan"
KIEU_TRON_GOI = "tron_goi"
KIEU_GIA_CONG = (KIEU_MOT_PHAN, KIEU_TRON_GOI)

# Một lần chỉ về MỘT nơi. Nhà gia công vừa giao khách một phần vừa chở về kho một phần ⇒ hai lần.
NOI_VE_XUONG = "xuong"   # về bước sau của lệnh (dải còn chặng sau)
NOI_VE_KHO = "kho"       # nhập kho thành phẩm (dải chứa bước cuối / trọn gói)
NOI_VE_KHACH = "khach"   # nhà gia công giao thẳng cho khách
NOI_VE = (NOI_VE_XUONG, NOI_VE_KHO, NOI_VE_KHACH)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class GiaCongNgoai(Base):
    __tablename__ = "gia_cong_ngoai"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lsx_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("lsx.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kieu: Mapped[str] = mapped_column(String(12), nullable=False)
    # Danh mục Nhà cung cấp có tích "Nhận gia công". Không có đường xoá NCC nên FK thường là đủ.
    nha_cung_cap_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("suppliers.id"), index=True, nullable=False
    )
    # ẢNH CHỤP tên lúc đặt — đổi tên NCC sau không đổi lịch sử lần đã chốt / phiếu chi đã in.
    nha_cung_cap_ten: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # "Cán màng" · "Bế + Dán" · "Gia công trọn gói" — nhãn cho khối trên lệnh và lý do chi.
    ten_viec: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # Đơn giá theo ĐƠN VỊ của con số cuối (`don_vi`). Bỏ trống được — kế toán gõ tiền tay.
    don_gia: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    don_vi: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Chỉ trọn gói: số đặt nhà gia công làm (điền sẵn SL lệnh).
    sl_dat: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    # Chỉ trọn gói: xưởng cấp giấy (đề nghị xuất kho) hay nhà gia công tự lo (nhả giữ chỗ).
    xuong_cap_giay: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=sa_false(), default=False
    )
    # --- Mang đi (chỉ một phần) ---
    mang_di_boi_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mang_di_luc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sl_gui: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    # --- Chốt ---
    chot_boi_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chot_luc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sl_cuoi: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    noi_ve: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # --- Huỷ (trọn gói huỷ trước chốt · lần một phần mất khi gói bị thu hồi) ---
    huy_boi_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    huy_luc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ly_do_huy: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
