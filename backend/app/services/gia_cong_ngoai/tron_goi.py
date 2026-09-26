"""Gia công TRỌN GÓI (spec 2026-09-26 §4).

Đặt = phát hành lệnh thành một gói có ĐÚNG MỘT công việc thuê ngoài, không tổ, là công đoạn cuối
của nhóm thành phẩm. Không bước nào xuống bàn tổ; lệnh vẫn "Đã phát hành" để mọi màn đọc đúng.
Số cuối chốt bằng `chot.py` (nhánh kho / khách) như dải cuối của gia công một phần.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.gia_cong_ngoai import KIEU_TRON_GOI, GiaCongNgoai, _utcnow
from ...models.lsx import TT_CHO_BO_SUNG, TT_DA_LAP_KE_HOACH, TT_NHAP, TT_SAN_SANG
from ...models.lsx import TT_DA_PHAT_HANH as LSX_DA_PHAT_HANH
from ...models.san_xuat import (
    BUOC_THUE_NGOAI, CV_PHAT_HANH, PB_PHAT_HANH, SanXuatCongViec, SanXuatGoiPhatHanh,
    SanXuatPhienBan,
)
from ...models.stock_request import REQ_CANCELLED, REQ_XUAT
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.document_sequence_repo import DocumentSequenceRepository
from ...repositories.don_vi_do_repo import DonViDoRepository, nhan_don_vi
from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.order_repo import OrderRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ...repositories.stock_request_repo import StockRequestRepository
from ...repositories.xep_lich_lenh_repo import XepLichLenhRepository
from ...repositories.xep_lich_repo import XepLichRepository
from ..san_xuat.component import thanh_phan_lien_thong
from ..san_xuat.nhom import dam_bao_nhom
from ..san_xuat.release_update import thu_hoi_goi
from ..san_xuat.vat_tu_de_nghi import _don_vi_gui_kho, _hang_service, _req_service
from ..sequence_service import SequenceService
from ..stock_request_service import StockRequestError
from ..thanh_pham_khai_bao import cum_cua_dong, khai_cum
from . import GiaCongXungDot, kiem_version

_DAT_DUOC = (TT_NHAP, TT_CHO_BO_SUNG, TT_SAN_SANG, TT_DA_LAP_KE_HOACH)


def _don_vi_thanh_pham(db: Session, lsx) -> str:
    """Đơn vị của con số cuối = đơn vị món Thành phẩm của cụm (cùng thứ kho sẽ nhập)."""
    order = OrderRepository(db).get_by_id(lsx.order_id)
    cum = cum_cua_dong(order, lsx.order_line_id) if order is not None else None
    tp = khai_cum(db, order, cum) if cum is not None else None
    return ((tp.don_vi_gia if tp is not None else None) or lsx.don_vi_tinh or "").strip()


def _giu_cho(db: Session):
    from ..xep_lich.release import _giu_cho_service

    return _giu_cho_service(db)


def dat_tron_goi(db: Session, *, user, lsx_id: int, nha_cung_cap_id: int, sl_dat: float,
                 don_gia: float | None, xuong_cap_giay: bool) -> dict:
    repo = SanXuatRepository(db)
    gc_repo = GiaCongNgoaiRepository(db)
    # Khoá dòng lệnh TRƯỚC mọi kiểm tra — hai lượt đặt trọn gói bấm gần như đồng thời phải xếp
    # hàng, không cùng đọc trạng thái cũ rồi cùng ghi đè nhau.
    lsx = repo.khoa_lsx(lsx_id)
    if lsx is None:
        raise ValueError("Không tìm thấy lệnh sản xuất.")
    if lsx.trang_thai == LSX_DA_PHAT_HANH:
        raise ValueError("Lệnh đã phát hành xuống xưởng — thu hồi phát hành trước rồi mới đặt "
                         "gia công trọn gói.")
    if lsx.trang_thai not in _DAT_DUOC:
        raise ValueError("Trạng thái lệnh không cho đặt gia công trọn gói.")
    nha = gc_repo.nha_gia_cong(nha_cung_cap_id)
    if nha is None:
        raise ValueError("Nhà cung cấp này chưa bật “Nhận gia công” hoặc đã ngừng giao dịch.")
    if float(sl_dat or 0) <= 0:
        raise ValueError("Số lượng đặt gia công phải lớn hơn 0.")
    tp = thanh_phan_lien_thong(repo, {lsx_id})
    if len(tp.lsx_ids) > 1 or tp.bai_ghep_ids:
        raise ValueError("Lệnh đi chung nhóm thành phẩm hoặc bài ghép với lệnh khác — gia công "
                         "trọn gói chỉ áp cho lệnh đứng riêng.")
    # Lệnh đã xếp lịch theo công đoạn (spec §4 bước 1): xếp lịch không còn nghĩa với trọn gói —
    # tự gỡ nháp xếp lịch của lệnh thay vì bắt người dùng vòng sang màn Xếp lịch xoá tay.
    xl_repo = XepLichRepository(db)
    if xl_repo.exists_lsx(lsx_id):
        xl_repo.delete_rows(xl_repo.by_lsx(lsx_id))
    if repo.goi_hien_tai_cua({lsx_id}, set()) is not None:
        raise ValueError("Lệnh đang có gói phát hành — thu hồi trước.")

    # Mốc giờ của bàn Xếp lịch không còn nghĩa: lệnh không chạy trong xưởng.
    moc = XepLichLenhRepository(db).theo_lsx(lsx_id)
    if moc is not None:
        XepLichLenhRepository(db).xoa(moc)

    uid = getattr(user, "id", None)
    dv = _don_vi_thanh_pham(db, lsx)
    gcn = GiaCongNgoai(
        lsx_id=lsx_id, kieu=KIEU_TRON_GOI, nha_cung_cap_id=nha.id, nha_cung_cap_ten=nha.name,
        ten_viec="Trọn gói cả lệnh", don_gia=don_gia, don_vi=dv, sl_dat=float(sl_dat),
        xuong_cap_giay=bool(xuong_cap_giay), created_by=uid,
    )
    db.add(gcn)
    db.flush()

    goi = SanXuatGoiPhatHanh(
        ma=SequenceService(DocumentSequenceRepository(db)).generate_code("san_xuat_goi"),
        version_hien_tai=1)
    repo.add(goi)
    repo.flush()
    repo.add(SanXuatPhienBan(goi_id=goi.id, so=1, loai=PB_PHAT_HANH, phat_hanh_by_id=uid))
    nhom = dam_bao_nhom(repo, {lsx_id}).get(lsx_id)
    repo.add(SanXuatCongViec(
        goi_id=goi.id, phien_ban_so=1, nhom_id=nhom.id if nhom is not None else None,
        lsx_id=lsx_id, ten_cong_doan=f"Gia công trọn gói — {nha.name}"[:255],
        loai_buoc=BUOC_THUE_NGOAI, department_id=None, la_kcs_cuoi=True,
        so_luong_vao=float(sl_dat), so_luong_ra=float(sl_dat), don_vi_vao=dv, don_vi_ra=dv,
        nha_cung_cap=nha.name, trang_thai=CV_PHAT_HANH, gia_cong_ngoai_id=gcn.id,
    ))
    if nhom is not None:
        nhom.than_chinh_lsx_id = lsx_id
    member = repo.member_of_lsx(lsx_id)
    if member is not None:
        member.la_than_chinh = True
    lsx.trang_thai = LSX_DA_PHAT_HANH

    dv_ten = nhan_don_vi(DonViDoRepository(db).ten_theo_ma(), dv)
    AuditLogRepository(db).create(
        actor_user_id=uid, action="gia_cong_ngoai_dat", target=f"gia_cong_ngoai:{gcn.id}",
        detail=(f"Trọn gói lệnh {lsx.ma}: {nha.name} — {float(sl_dat):g} {dv_ten}; "
                f"{'xưởng cấp giấy' if xuong_cap_giay else 'nhà gia công lo giấy'}"),
        commit=False,
    )
    db.commit()

    # Giữ chỗ vật tư đi theo NHU CẦU mới (KHVT bỏ nhu cầu lệnh trọn gói): nhả hết rồi giữ lại
    # đúng phần còn cần — giấy khi xưởng cấp, không gì khi nhà gia công lo. `tat`/`bat` tự commit.
    if lsx.giu_cho_bat:
        giu = _giu_cho(db)
        giu.tat(lsx_id=lsx_id)
        if xuong_cap_giay:
            giu.bat(lsx_id=lsx_id)
    return {"gia_cong_ngoai_id": gcn.id, "lsx_id": lsx_id}


def _lay_tron_goi(gc_repo: GiaCongNgoaiRepository, gcn_id: int, expected_version):
    gcn = gc_repo.khoa(gcn_id)
    if gcn is None or gcn.kieu != KIEU_TRON_GOI:
        raise ValueError("Không tìm thấy lần gia công trọn gói.")
    kiem_version(gcn, expected_version)
    if gcn.huy_luc is not None:
        raise ValueError("Lần gia công đã huỷ.")
    if gcn.chot_luc is not None:
        raise GiaCongXungDot("Lần gia công đã chốt số — mở lại trước.")
    return gcn


def huy_tron_goi(db: Session, *, user, gcn_id: int, expected_version: int | None,
                 ly_do: str) -> dict:
    ly_do = (ly_do or "").strip()
    if len(ly_do) < 3:
        raise ValueError("Ghi lý do huỷ (ít nhất 3 ký tự).")
    gc_repo = GiaCongNgoaiRepository(db)
    gcn = _lay_tron_goi(gc_repo, gcn_id, expected_version)
    req_repo = StockRequestRepository(db)
    for req in gc_repo.yeu_cau_xuat_cua(gcn.id):
        req_repo.lock_for_update(req.id)
        if req_repo.co_voucher(req.id):
            raise ValueError(f"Kho đã lập phiếu xuất giấy {req.ma} cho nhà gia công — không huỷ "
                             "được. Nhập trả giấy về kho trước.")
        req.trang_thai, req.ly_do_huy = REQ_CANCELLED, "Huỷ gia công trọn gói"

    uid = getattr(user, "id", None)
    # Đánh huỷ TRƯỚC khi thu hồi gói: `thu_hoi_goi` → `huy_lan_cua_goi` bỏ qua lần đã huỷ, nên
    # lý do người dùng gõ không bị câu "Thu hồi gói…" đè.
    gcn.huy_luc, gcn.huy_boi_id, gcn.ly_do_huy = _utcnow(), uid, ly_do[:500]
    gcn.version += 1
    thu_hoi_goi(db, nguon="lsx", id=gcn.lsx_id, actor=user)
    lsx = SanXuatRepository(db).lsx(gcn.lsx_id)
    lsx.trang_thai = TT_NHAP
    AuditLogRepository(db).create(
        actor_user_id=uid, action="gia_cong_ngoai_huy", target=f"gia_cong_ngoai:{gcn.id}",
        detail=f"Huỷ trọn gói — lệnh {lsx.ma} về Nháp. Lý do: {ly_do}"[:500], commit=False,
    )
    db.commit()

    # Đặt trọn gói đã TẮT giữ chỗ (hoặc tắt rồi chỉ giữ giấy) — huỷ thì bật lại đúng như lúc chưa
    # đặt, cho lệnh về Nháp cân đối vật tư bình thường như mọi lệnh khác. `bat` tự commit.
    if lsx.giu_cho_bat:
        _giu_cho(db).bat(lsx_id=gcn.lsx_id)
    return {"gia_cong_ngoai_id": gcn.id, "lsx_id": gcn.lsx_id}


def de_nghi_xuat_giay(db: Session, *, user, gcn_id: int, expected_version: int | None):
    """Xưởng cấp giấy cho nhà gia công: MỘT đề nghị XUẤT (kho soạn + lập phiếu xuất như mọi đề
    nghị khác). Dòng lấy từ giấy khai ở các bước của lệnh; mang `lsx_id` nên KHVT tự trừ "đã cấp"."""
    gc_repo = GiaCongNgoaiRepository(db)
    gcn = _lay_tron_goi(gc_repo, gcn_id, expected_version)
    if not gcn.xuong_cap_giay:
        raise ValueError("Lần này nhà gia công tự lo giấy — không có giấy để xuất.")
    if gc_repo.yeu_cau_xuat_cua(gcn.id):
        raise ValueError("Lần này đã có đề nghị xuất giấy — xem ở Yêu cầu nhập xuất.")
    dong = gc_repo.giay_cua_lenh(gcn.lsx_id)
    if not dong:
        raise ValueError("Lệnh chưa khai giấy ở bước nào — khai ở Kế hoạch SX rồi đề nghị lại.")

    hang = _hang_service(db)
    goc: dict[int, float] = {}
    for vt in dong:
        q = hang.quy_ve_goc("giay", int(vt.vat_tu_id), vt.don_vi_snapshot, float(vt.so_luong))
        goc[int(vt.vat_tu_id)] = goc.get(int(vt.vat_tu_id), 0.0) + float(q["sl_goc"])
    lines = []
    for hang_id, sl_goc in goc.items():
        dvt, sl = _don_vi_gui_kho(hang, "giay", hang_id, sl_goc)
        if round(sl, 2) <= 0:
            raise ValueError("Lượng giấy quá nhỏ để kho ghi được — kiểm lại số khai ở bước.")
        lines.append({"hang_loai": "giay", "hang_id": hang_id, "dvt": dvt,
                      "sl_de_nghi": round(sl, 2), "lsx_id": gcn.lsx_id})

    lsx = SanXuatRepository(db).lsx(gcn.lsx_id)
    req_svc = _req_service(db, hang)
    try:
        req = req_svc.create(
            user=user, loai=REQ_XUAT, lines=lines, commit=False,
            bo_phan_id=user.department_id, gia_cong_ngoai_id=gcn.id,
            ghi_chu=f"Cấp giấy gia công trọn gói — {gcn.nha_cung_cap_ten} — lệnh {lsx.ma}"[:1000],
        )
    except StockRequestError as e:
        db.rollback()
        raise ValueError(str(e)) from None
    gcn.version += 1
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None), action="gia_cong_ngoai_xuat_giay",
        target=f"gia_cong_ngoai:{gcn.id}", detail=f"Đề nghị xuất giấy {req.ma}", commit=False,
    )
    db.commit()
    req_svc.thong_bao_yeu_cau_moi(req)
    return req
