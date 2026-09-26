"""Nút "Đã mang đi" của lần gia công MỘT PHẦN (spec 2026-09-26 §3 bước 5).

Mang đi = NHẬN bàn giao của bước trước thay cho tổ (công việc gia công không có tổ nào xác nhận).
Số gửi = đúng số bước trước đã bàn giao — không gõ tay; lệch thì tổ nguồn điều chỉnh bàn giao như
thường. Bấm lại được trước khi chốt (bước trước giao thêm một đợt): số gửi CỘNG DỒN.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.gia_cong_ngoai import KIEU_MOT_PHAN, _utcnow
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from ..san_xuat import ban_giao
from . import kiem_version

_EPS = 1e-9


def _lay_lan_mo(repo: GiaCongNgoaiRepository, gcn_id: int, expected_version: int | None):
    gcn = repo.khoa(gcn_id)
    if gcn is None:
        raise ValueError("Không tìm thấy lần gia công.")
    kiem_version(gcn, expected_version)
    if gcn.huy_luc is not None:
        raise ValueError("Lần gia công đã huỷ.")
    if gcn.chot_luc is not None:
        raise ValueError("Lần gia công đã chốt số — mở lại trước nếu cần sửa.")
    return gcn


def mang_di(db: Session, *, user, gcn_id: int, expected_version: int | None,
            sl_gui: float | None = None) -> dict:
    repo = GiaCongNgoaiRepository(db)
    gcn = _lay_lan_mo(repo, gcn_id, expected_version)
    if gcn.kieu != KIEU_MOT_PHAN:
        raise ValueError("Gia công trọn gói không có bước mang đi — giấy đi theo phiếu xuất kho.")
    cvs = repo.cong_viec_cua(gcn.id)
    if not cvs:
        raise ValueError("Lần gia công không còn công việc nào — lệnh đã bị thu hồi?")
    dau = cvs[0]
    cho = repo.ban_giao_cho_mang_di(dau.id, khoa=True)
    if cho:
        if sl_gui is not None:
            raise ValueError("Số mang đi lấy theo bàn giao, không gõ tay.")
        so = sum(float(b.so_luong) for b in cho)
    elif repo.co_buoc_truoc(dau.lsx_cong_doan_id):
        raise ValueError("Bước trước chưa bàn giao hàng sang — chờ tổ bàn giao rồi bấm lại.")
    else:
        # Dải đứng ĐẦU lệnh (không bước trước): không có bàn giao để nhận, người mang đi gõ số.
        if sl_gui is None or float(sl_gui) <= _EPS:
            raise ValueError("Nhập số lượng mang đi (lớn hơn 0).")
        so = float(sl_gui)

    sl_repo = SanXuatSanLuongRepository(db)
    ra_bg: list[dict] = []
    for bg in cho:
        ban_giao.ghi_xac_nhan(db, bg=bg, user=user)
        nguon = sl_repo.cong_viec(bg.nguon_cong_viec_id)
        ra_bg.append((bg, nguon))

    uid = getattr(user, "id", None)
    gcn.sl_gui = float(gcn.sl_gui or 0) + so
    gcn.mang_di_boi_id, gcn.mang_di_luc = uid, _utcnow()
    gcn.version += 1
    AuditLogRepository(db).create(
        actor_user_id=uid, action="gia_cong_ngoai_mang_di", target=f"gia_cong_ngoai:{gcn.id}",
        detail=f"Mang đi {so:g} — tổng đã gửi {float(gcn.sl_gui):g}", commit=False,
    )
    db.commit()
    return {
        "gia_cong_ngoai_id": gcn.id, "lsx_id": gcn.lsx_id,
        "ban_giao": [ban_giao.ket_qua_da_nhan(db, user=user, bg=bg, nguon_cv=n, dich_cv=dau)
                     for bg, n in ra_bg],
    }
