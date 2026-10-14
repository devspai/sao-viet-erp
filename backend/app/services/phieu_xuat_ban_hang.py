"""Dữ liệu in PHIẾU XUẤT KHO BÁN HÀNG (có giá) và PHIẾU XUẤT KHO 02-VT (không giá) của MỘT yêu cầu
giao (chủ chốt 13/10/2026, bám hai mẫu MISA BH03479 / XK03479).

In ở ngăn đơn hàng, nút "In phiếu giao" của từng yêu cầu — CHỈ sau khi kho đã ghi sổ phiếu xuất của
chuyến: hai mẫu cùng mang số phiếu xuất và SỐ THỰC XUẤT, chưa xuất thì chưa có số để in.

Chỉ đọc. Giá bán, VAT, tên hàng ghép cụm — trình duyệt đã có ở chi tiết đơn, ở đây chỉ trả phần
đơn chưa có: phiếu xuất, số thực xuất theo dòng đơn, MST / địa chỉ khách, kíp xe.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.customer import Customer
from ..models.employee import Employee
from ..models.kho_hang import KhoHang
from ..models.user import User
from ..models.vat_lieu_kho import VatTuInAn
from ..models.xe import Xe
from ..repositories.delivery_repo import DeliveryRepository


class PhieuXuatChuaCo(ValueError):
    """Kho chưa ghi sổ phiếu xuất cho yêu cầu — router dịch 400."""


def _chia_thuc_xuat(dong_yc, thuc_xuat: dict[tuple[str, int], float]) -> dict[int, tuple[float, tuple[str, int]]]:
    """Số thực xuất theo mặt hàng kho → theo dòng đơn. Dòng yêu cầu mang mặt hàng (dòng đầu cụm)
    nhận lần lượt tới đủ SL của nó; hai cụm cùng một mã thì dòng cuối nhận phần dư."""
    con = dict(thuc_xuat)
    dong = [ln for ln in dong_yc if ln.hang_loai and ln.hang_id is not None]
    ra: dict[int, tuple[float, tuple[str, int]]] = {}
    for i, ln in enumerate(dong):
        khoa = (ln.hang_loai, ln.hang_id)
        cuoi = not any((d.hang_loai, d.hang_id) == khoa for d in dong[i + 1:])
        co = con.get(khoa, 0.0)
        lay = co if cuoi else min(co, float(ln.qty))
        if lay > 0:
            truoc = ra.get(int(ln.order_line_id), (0.0, khoa))[0]
            ra[int(ln.order_line_id)] = (truoc + lay, khoa)
            con[khoa] = co - lay
    return ra


def du_lieu_in_phieu_xuat(db: Session, order, yeu_cau_id: int) -> dict:
    rp = DeliveryRepository(db)
    req = rp.get_request(yeu_cau_id)
    if req is None or int(req.order_id) != int(order.id):
        raise PhieuXuatChuaCo("Không tìm thấy yêu cầu giao của đơn này.")
    trips = rp.trips_cua_nhieu_yeu_cau([req.id])[req.id]
    t = trips[-1] if trips else None
    xuat = rp.yeu_cau_kho_cua_nhieu_chuyen([t.id], "XUAT").get(t.id) if t is not None else None
    phieu = rp.phieu_da_ghi_so_cua_yeu_cau(xuat.id) if xuat is not None else []
    if not phieu:
        raise PhieuXuatChuaCo("Kho chưa xuất hàng cho yêu cầu này — kho ghi sổ phiếu xuất xong mới in được.")

    thuc: dict[tuple[str, int], float] = {}
    for v in phieu:
        for ln in v.lines:
            khoa = (ln.hang_loai, ln.hang_id)
            thuc[khoa] = thuc.get(khoa, 0.0) + float(ln.so_luong or 0)

    chia = _chia_thuc_xuat(req.lines, thuc)
    hang_ids = {k[1] for _, k in chia.values() if k[0] == "vat_tu"}
    ma_hang = dict(db.query(VatTuInAn.id, VatTuInAn.ma).filter(VatTuInAn.id.in_(hang_ids)).all()) if hang_ids else {}
    kh = db.get(Customer, order.customer_id) if order.customer_id else None
    kho = db.get(KhoHang, phieu[0].kho_id)
    lap = db.get(User, phieu[-1].nguoi_lap_id) if phieu[-1].nguoi_lap_id else None
    tx = db.get(Employee, t.employee_id) if t.employee_id else None
    phu = db.get(Employee, t.phu_xe_employee_id) if getattr(t, "phu_xe_employee_id", None) else None
    xe = db.get(Xe, t.vehicle_id) if t.vehicle_id else None
    return {
        "so_phieu": [v.ma for v in phieu],
        "ngay": phieu[-1].ngay,
        "kho_ten": getattr(kho, "ten", None),
        "nguoi_lap": getattr(lap, "name", None),
        "thuc_xuat": [{"order_line_id": k, "so_luong": sl,
                       "ma_hang": ma_hang.get(khoa[1]) if khoa[0] == "vat_tu" else None}
                      for k, (sl, khoa) in chia.items()],
        "khach_ma_so_thue": getattr(kh, "tax_code", None),
        "khach_dia_chi": getattr(kh, "address", None),
        "khach_dien_thoai": getattr(kh, "phone", None),
        "tai_xe": getattr(tx, "full_name", None),
        "phu_xe": getattr(phu, "full_name", None),
        "xe": getattr(xe, "ma", None),
    }
