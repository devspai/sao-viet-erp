"""Soi vật tư lúc phát hành — để NÓI, không để chặn (spec giấy đếm tờ × khổ §4.3, chốt 01/10/2026).

Trước 01/10/2026 đây là cửa CHẶN: chưa giữ đủ vật tư thì không phát hành. Người dùng bỏ: lệnh cần
cắt (kho không có đúng khổ ⇒ giữ chỗ không đủ) sẽ không bao giờ phát hành được, nên không bao giờ
tới tổ Cắt. Giờ mọi vấn đề vật tư ra mức `canh_bao` — vẫn nói thiếu gì, rổ `chan` luôn rỗng.

Dịch vụ giữ chỗ dựng TRỄ và bọc `try`: bảng cân đối hỏng thì vẫn NÓI ra (cảnh báo
`vat_tu_chua_xac_dinh`), chỉ không chặn.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from .constraint import MUC_CANH_BAO, issue


def _giu_cho_service(db: Session):
    """Dựng GiuChoService kèm KeHoachVatTuService."""
    from ...repositories.bai_ghep_repo import BaiGhepRepository
    from ...repositories.don_vi_do_repo import DonViDoRepository
    from ...repositories.lsx_repo import LsxRepository
    from ...repositories.purchase_repo import (
        PurchaseRequestRepository, SupplierRepository,
    )
    from ...repositories.stock_lot_repo import StockLotRepository
    from ...repositories.stock_request_repo import StockRequestRepository
    from ...repositories.vat_lieu_kho_repo import VatLieuKhoRepository
    from ..giu_cho_service import GiuChoService
    from ..ke_hoach_vat_tu_service import KeHoachVatTuService
    from ..vat_lieu_kho_service import VatLieuKhoService

    kh = KeHoachVatTuService(
        db, lsx_repo=LsxRepository(db),
        bai_ghep_repo=BaiGhepRepository(db),
        hang=VatLieuKhoService(VatLieuKhoRepository(db), DonViDoRepository(db)),
        lots=StockLotRepository(db), requests=StockRequestRepository(db),
        purchases=PurchaseRequestRepository(db),
        suppliers=SupplierRepository(db), don_vi=DonViDoRepository(db),
    )
    return GiuChoService(db, kh)


class PhienVatTu:
    """MỘT lượt cân đối vật tư, trả lời được NHIỀU câu hỏi trong cùng một request.

    Panel một lệnh hỏi đúng hai câu trên đúng một chủ thể: thẻ tóm tắt (`trang_thai_giu_cho`) và
    cửa phát hành (`soat_vat_tu`). Cả hai đều bắt đầu bằng `GiuChoService.trang_thai` — dựng cả dây
    kho/mua/quy-đổi rồi cân đối lại từ đầu, khoảng 24 câu SQL mỗi lượt, tức phần đắt nhất của panel.
    Hỏi qua một phiên thì cân đối chạy một lần, hai câu trả lời vẫn y nguyên.

    Không truyền phiên vào thì mọi hàm dưới đây tự dựng phiên riêng — hành vi cũ, đúng cho các cửa
    chỉ hỏi một câu (`van_de_vat_tu` của màn cũ, đường phát hành).
    """

    def __init__(self, db: Session) -> None:
        self.db = db
        self._giu = None
        self._tt: dict[tuple, dict] = {}

    @property
    def giu(self):
        if self._giu is None:
            self._giu = _giu_cho_service(self.db)
        return self._giu

    def trang_thai(self, *, lsx_id: int | None = None, bai_ghep_id: int | None = None) -> dict:
        khoa = (lsx_id, bai_ghep_id)
        if khoa not in self._tt:
            self._tt[khoa] = self.giu.trang_thai(lsx_id=lsx_id, bai_ghep_id=bai_ghep_id)
        return self._tt[khoa]


def trang_thai_giu_cho(db: Session, *, lsx_id: int | None = None,
                       bai_ghep_id: int | None = None,
                       phien: PhienVatTu | None = None) -> dict:
    return (phien or PhienVatTu(db)).trang_thai(lsx_id=lsx_id, bai_ghep_id=bai_ghep_id)


def soat_vat_tu(db: Session, *, lsx_id: int | None = None,
                bai_ghep_id: int | None = None,
                phien: PhienVatTu | None = None) -> dict:
    """Soi vật tư của MỘT chủ thể, MỘT lần cân đối. Trả `{"chan": [], "canh_bao": [...]}`.

    `chan` LUÔN rỗng từ 01/10/2026 (giữ khoá cho nơi gọi cũ). `canh_bao`: chưa quy đổi được đơn vị
    (`vat_tu_chua_xac_dinh`) · thiếu hàng CHƯA có phiếu mua (`vat_tu_chua_du`) · thiếu hàng ĐÃ đặt
    mua nhưng NCC chưa hẹn ngày (`vat_tu_chua_co_ngay`). Cảnh báo "dựa vào lô đang về, hứa ngày …"
    (`vat_tu_dang_ve`) ĐÃ BỎ 07/10/2026 cùng logic "chạy được từ" (spec một ô một phiếu §6).

    Vì sao tách "chưa có ngày" khỏi "chưa mua": việc người dùng phải làm KHÁC nhau — một bên đi mua,
    một bên giục NCC chốt ngày.
    """
    ph = phien or PhienVatTu(db)
    try:
        tt = ph.trang_thai(lsx_id=lsx_id, bai_ghep_id=bai_ghep_id)
        giu = ph.giu
    except Exception as exc:                                    # noqa: BLE001
        return {"chan": [], "canh_bao": [issue(
            "vat_tu_chua_xac_dinh", MUC_CANH_BAO,
            f"Chưa kiểm được vật tư ({type(exc).__name__}) — mở màn Kế hoạch vật tư xem lỗi thật.",
            goi_y="Mở màn Kế hoạch vật tư kiểm lại.",
        )]}

    canh_bao: list[dict] = []
    if not tt["du"]:
        if tt["khong_ro"]:
            canh_bao.append(issue(
                "vat_tu_chua_xac_dinh", MUC_CANH_BAO,
                "Có vật tư chưa quy đổi được về đơn vị kho nên chưa biết cần bao nhiêu.",
                goi_y="Kiểm lại đơn vị của mặt hàng ở màn Kế hoạch vật tư.",
            ))
        elif tt["thieu"]:
            # Giữ chỗ và đơn mua cùng khoá tồn (mã, khổ).
            short = set(tt["thieu"].keys())
            no_eta = set(giu.kh.hang_dang_mua_khong_ngay())
            if short & no_eta:
                canh_bao.append(issue(
                    "vat_tu_chua_co_ngay", MUC_CANH_BAO,
                    "Vật tư đã đặt mua nhưng NCC chưa hẹn ngày về — chưa cam kết được lịch.",
                    goi_y="Vào màn Kế hoạch vật tư giục NCC chốt ngày, hoặc mua nguồn khác.",
                ))
            if short - no_eta:
                canh_bao.append(issue(
                    "vat_tu_chua_du", MUC_CANH_BAO,
                    "Vật tư chưa giữ đủ.",
                    goi_y="Vào màn Kế hoạch vật tư bấm Giữ chỗ (hàng về hệ tự giữ nốt).",
                ))
        else:
            # Không đủ mà cũng không nêu được thiếu món nào (chưa khai vật tư nào ở bước).
            canh_bao.append(issue(
                "vat_tu_chua_du", MUC_CANH_BAO,
                "Vật tư chưa giữ đủ.",
                goi_y="Vào màn Kế hoạch vật tư bấm Giữ chỗ (hàng về hệ tự giữ nốt).",
            ))
    return {"chan": [], "canh_bao": canh_bao}


def van_de_vat_tu(db: Session, *, lsx_id: int | None = None,
                  bai_ghep_id: int | None = None) -> list[dict]:
    """Vấn đề vật tư ở MỨC chặn-phát-hành — LUÔN rỗng từ 01/10/2026 (vật tư chỉ còn cảnh báo, xem
    `soat_vat_tu`). Giữ hàm cho cửa phát hành cũ (`XepLichVanDeService._chan_thieu_vat_tu`).
    """
    return soat_vat_tu(db, lsx_id=lsx_id, bai_ghep_id=bai_ghep_id)["chan"]
