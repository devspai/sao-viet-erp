"""Kho thành phẩm là NƠI DUY NHẤT thành phẩm vào / ra (12/10/2026).

Kho cố định `KHO-TP` (mg 0398) gánh trọn vòng của thành phẩm:
  · Nhập: đề nghị nhập từ KCS cuối / gia công ngoài về kho gắn sẵn kho này; phiếu nhập thành phẩm vào
    kho khác bị chặn (`StockVoucherService.create`), kể cả vế nhập đích của điều chuyển.
  · Giao hàng: đề nghị xuất của lượt giao, phiếu nhập trả hàng đều ở kho này.
  · Đơn hàng bán: mọi con số tồn thành phẩm (giao được, tồn sẵn khi lập lệnh, tiến độ đơn…) chỉ đếm
    kho này.
Báo cáo kho KHÔNG theo luật này — vẫn đọc mọi kho.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.kho_hang import MA_KHO_THANH_PHAM
from ..repositories.kho_hang_repo import KhoHangRepository
from ..repositories.stock_lot_repo import StockLotRepository
from ..repositories.vat_lieu_kho_repo import VatLieuKhoRepository

LOI_NHAP_KHO_KHAC = "Thành phẩm chỉ nhập vào Kho thành phẩm."


def id_kho_thanh_pham(db: Session) -> int | None:
    """Id kho `KHO-TP`. Migration 0398 bảo đảm DB nào cũng có — `None` chỉ khi DB chưa migrate."""
    return KhoHangRepository(db).id_theo_ma(MA_KHO_THANH_PHAM)


def hang_thanh_pham(db: Session, keys) -> set[tuple[str, int]]:
    """Trong các khoá `(hang_loai, hang_id)`, những khoá nào là thành phẩm."""
    ids = {int(i) for loai, i in keys if loai == "vat_tu" and i is not None}
    return {("vat_tu", i) for i in VatLieuKhoRepository(db).la_thanh_pham_ids(ids)}


def ton_o_kho_thanh_pham(db: Session, keys) -> dict[tuple, dict[int, float]]:
    """Cùng dạng `StockLotRepository.on_hand_by_kho` (`{khoá: {kho_id: tồn}}`) nhưng chỉ còn Kho
    thành phẩm — chỗ nào đang chia tồn theo kho đổi sang hàm này là xong, khỏi đổi dạng dữ liệu."""
    tp = id_kho_thanh_pham(db)
    ton = StockLotRepository(db).on_hand_by_kho(list(keys))
    return {k: {kho: sl for kho, sl in v.items() if kho == tp} for k, v in ton.items()}
