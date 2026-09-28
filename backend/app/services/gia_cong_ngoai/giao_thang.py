"""Nhà gia công GIAO THẲNG cho khách (spec §4 bước 5)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.delivery import LG_DA_HUY, LG_THANH_CONG, YC_CHO_LEN_KE_HOACH, YC_DA_HUY
from ...models.gia_cong_ngoai import _utcnow
from ...repositories.delivery_repo import DeliveryRepository
from ...repositories.don_vi_do_repo import DonViDoRepository, nhan_don_vi
from ...repositories.employee_repo import EmployeeRepository
from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.order_repo import OrderRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ..delivery_service import sinh_ma_chung_tu
from ..san_xuat.kho import _he_so, loi_quy_doi
from ..san_xuat.vat_tu_de_nghi import _hang_service
from ..thanh_pham_khai_bao import cum_ban, cum_cua_dong, khai_cum
from ..vat_lieu_kho_service import VatLieuKhoError


def dong_don_dung_rieng(db: Session, lsx_id: int) -> bool:
    """Dòng đơn của lệnh đứng RIÊNG một cụm bán (cụm chỉ có đúng dòng đó). Cụm nhiều dòng (bìa +
    ruột một cuốn) thì một lệnh không giao thẳng thay cả cụm được."""
    lsx = SanXuatRepository(db).lsx(lsx_id)
    if lsx is None or not lsx.order_line_id:
        return False
    order = OrderRepository(db).get_by_id(lsx.order_id)
    if order is None:
        return False
    for cum in cum_ban(order):
        if any(ln.id == lsx.order_line_id for ln in cum.dong):
            return len(cum.dong) == 1
    return False


def _he_so_ve_dong(db: Session, tp, tu_dv: str, dv_dong: str, cv=None) -> float:
    """1 `tu_dv` = bao nhiêu đơn vị dòng đơn — cùng đường quy đổi của món như nhập kho thành phẩm."""
    if not tu_dv:
        raise ValueError("Công đoạn cuối chưa khai đơn vị ra nên chưa quy đổi được sang đơn vị giao.")
    if not dv_dong or tu_dv.lower() == dv_dong.lower():
        return 1.0
    try:
        return _he_so(_hang_service(db), tp.id, tu_dv, dv_dong)
    except VatLieuKhoError:
        if cv is not None:
            raise loi_quy_doi(db, tu_dv=tu_dv, sang_dv=dv_dong, cv=cv, tp=tp,
                              dich="dong_don") from None
        bang = DonViDoRepository(db).ten_theo_ma()
        raise ValueError(
            f"Không quy đổi được từ «{nhan_don_vi(bang, tu_dv)}» sang «{nhan_don_vi(bang, dv_dong)}» "
            f"(đơn vị dòng đơn) cho {tp.ma}."
        ) from None


def ghi_giao_thang(db: Session, *, user, gcn, cv, so: float):
    """Nhà gia công giao thẳng: MỘT yêu cầu giao + MỘT chuyến THÀNH CÔNG đứng tên người chốt ⇒ cộng
    vào "đã giao" của dòng đơn (`da_giao_theo_dong`). Không kho, không xe, không phiếu xuất, không
    km (km trống ⇒ khoán km không trả đồng nào). Đi thẳng qua repo — cửa lập yêu cầu của Giao hàng
    chặn theo trần "giao được" tính từ kho, mà hàng này không qua kho. Không commit."""
    lsx = SanXuatRepository(db).lsx(gcn.lsx_id)
    order = OrderRepository(db).get_by_id(lsx.order_id) if lsx else None
    cum = cum_cua_dong(order, lsx.order_line_id) if order is not None else None
    if cum is None or len(cum.dong) != 1:
        raise ValueError("Dòng đơn của lệnh đi chung cụm với dòng khác — không giao thẳng được, "
                         "chọn về kho.")
    emp = EmployeeRepository(db).get_by_user_id(user.id)
    if emp is None:
        raise ValueError("Tài khoản của bạn chưa gắn hồ sơ nhân viên — chuyến giao phải đứng tên "
                         "một nhân viên. Nhờ Nhân sự gắn rồi chốt lại, hoặc chọn về kho.")
    tp = khai_cum(db, order, cum)
    ln = cum.dong[0]
    # "Đã giao" / "còn phải giao" của Giao hàng đếm theo ĐƠN VỊ DÒNG ĐƠN (`ln.qty`) — quy số chốt
    # (đơn vị ra của công việc cuối) về đúng đơn vị đó rồi mới so, không so với số đã quy sang
    # đơn vị món Thành phẩm.
    qty = int(round(so * _he_so_ve_dong(db, tp, (cv.don_vi_ra or "").strip(),
                                        (ln.don_vi_tinh or "").strip(), cv)))
    if qty <= 0:
        raise ValueError("Con số cuối quy ra số lượng giao bằng 0.")
    repo = DeliveryRepository(db)
    con = int(ln.qty or 0) - int(repo.da_giao_theo_dong(order.id).get(ln.id, 0))
    if qty > con:
        raise ValueError(f"Dòng đơn chỉ còn phải giao {con} — nhập đúng số khách nhận.")

    luc = _utcnow()
    uid = getattr(user, "id", None)
    ghi = f"Nhà gia công {gcn.nha_cung_cap_ten} giao thẳng"
    req = repo.create_request(
        code=sinh_ma_chung_tu("YCGH", repo.get_request_by_code), order_id=order.id,
        customer_id=getattr(order, "customer_id", None), department_id=user.department_id,
        ngay_can_giao=luc.date(), dia_chi=ghi, ghi_chu=ghi, trang_thai=YC_CHO_LEN_KE_HOACH,
        created_by=uid,
    )
    repo.add_request_line(req.id, ln.id, qty, hang_loai="vat_tu", hang_id=tp.id, dvt=tp.don_vi_gia)
    trip = repo.create_trip(
        request_id=req.id, lan_thu=1, employee_id=emp.id, gio_lay_hang=luc, gio_du_kien_giao=luc,
        ghi_chu_phan_cong=f"{ghi} — không xe, không kho", trang_thai=LG_THANH_CONG,
        thoi_gian_ket_thuc=luc, ghi_chu_ket_qua=ghi, created_by=uid, gia_cong_ngoai_id=gcn.id,
    )
    repo.add_trip_line(trip.id, ln.id, qty)
    repo.ghi_lich_su(trip_id=trip.id, tu_trang_thai=None, den_trang_thai=LG_THANH_CONG,
                     nguoi_thao_tac_id=uid, ghi_chu="Ghi từ lần gia công ngoài đã chốt")
    return trip


def huy_giao_thang(db: Session, *, user, gcn) -> None:
    """Mở lại lần đã giao thẳng: HUỶ chuyến + yêu cầu (giữ vết, không xoá) ⇒ thôi cộng "đã giao"."""
    repo = DeliveryRepository(db)
    uid = getattr(user, "id", None)
    for trip in GiaCongNgoaiRepository(db).chuyen_giao_thang_cua(gcn.id):
        truoc = trip.trang_thai
        trip.trang_thai = LG_DA_HUY
        repo.ghi_lich_su(trip_id=trip.id, tu_trang_thai=truoc, den_trang_thai=LG_DA_HUY,
                         nguoi_thao_tac_id=uid, ly_do="Mở lại lần gia công ngoài")
        req = repo.get_request(trip.request_id)
        if req is not None:
            req.trang_thai, req.ly_do_huy = YC_DA_HUY, "Mở lại lần gia công ngoài"
