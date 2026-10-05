"""Nhân bản phiếu tính giá (04/10/2026).

Một phiếu chỉ MỘT báo giá (mg 0365) — muốn báo giá khác (khách khác, số lượng khác, phương án
khác) thì nhân bản phiếu rồi sửa bản sao. Bản sao chép NGUYÊN cấu hình: đầu phiếu, khách hàng +
điểm giao + người nhận + ghi chú, từng sản phẩm kèm bước gia công, vật tư của bước và chi phí khác.
KHÔNG chép: mã (cấp mã mới), người lập (là người bấm), báo giá / đơn / lệnh đã gắn với phiếu gốc.
Giá vốn TÍNH LẠI theo danh mục hôm nay (`compute_phieu_snapshot`) — bản sao là phiếu mới.
"""
from __future__ import annotations

from ..models.phieu_tinh_gia import (
    PhieuBuocVatTu, PhieuChiPhiKhac, PhieuThanhPham, PhieuThanhPhan, PhieuTinhGia,
)

# Ô đầu phiếu được chép. Ảnh chụp kết quả (`tong_gia_von`, `result_json`…) không chép — tính lại.
O_DAU_PHIEU = (
    "ten_san_pham", "kho_thanh_pham", "so_luong", "ghi_chu",
    "customer_id", "delivery_address", "contact_name_snapshot", "contact_phone_snapshot",
    "contact_title_snapshot", "contact_email_snapshot",
)
_BO_QUA = {"id", "created_at", "updated_at"}


def _chep(lop, nguon, *, bo_them: set[str]):
    """Dựng hàng MỚI cùng lớp với mọi cột dữ liệu của `nguon` (trừ khoá, khoá cha, dấu thời gian)."""
    bo = _BO_QUA | bo_them
    return lop(**{c.key: getattr(nguon, c.key) for c in lop.__table__.columns if c.key not in bo})


def nhan_ban(nguon: PhieuTinhGia, *, ma: str, actor) -> PhieuTinhGia:
    """Bản sao CHƯA add vào session — caller add, flush, tính giá, ghi nhật ký."""
    p = PhieuTinhGia(
        ma=ma,
        ktv=(actor.name or actor.username),
        created_by=actor.id,
        **{k: getattr(nguon, k) for k in O_DAU_PHIEU},
    )
    for tp in nguon.thanh_phans:
        tp_moi = _chep(PhieuThanhPhan, tp, bo_them={"phieu_id"})
        for buoc in tp.thanh_phams:
            buoc_moi = _chep(PhieuThanhPham, buoc, bo_them={"thanh_phan_id"})
            for vt in buoc.vat_tus:
                buoc_moi.vat_tus.append(_chep(PhieuBuocVatTu, vt, bo_them={"thanh_pham_id"}))
            tp_moi.thanh_phams.append(buoc_moi)
        for cp in tp.chi_phi_khacs:
            tp_moi.chi_phi_khacs.append(_chep(PhieuChiPhiKhac, cp, bo_them={"thanh_phan_id"}))
        p.thanh_phans.append(tp_moi)
    return p
