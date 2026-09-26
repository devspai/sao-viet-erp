"""Chốt con số cuối của lần gia công + Mở lại (spec 2026-09-26 §3 bước 6, §4 bước 3–5, §6).

Chốt ghi MỘT mẻ (tốt = số chốt) lên công việc cuối của lần, đánh mọi công việc của lần là hoàn
thành, rồi rẽ theo nơi về. Từ đó bàn giao / nhập kho / giao hàng / đóng nhóm chạy NGUYÊN đường cũ.
Mở lại gỡ sạch đúng những gì lần chốt đã đẻ ra — chỉ khi chứng từ phía sau chưa chạy.
"""
from __future__ import annotations

from collections.abc import Callable

from sqlalchemy.orm import Session

from ...models.gia_cong_ngoai import KIEU_MOT_PHAN, NOI_VE_XUONG, _utcnow
from ...models.san_xuat import CV_HOAN_THANH, CV_PHAT_HANH
from ...models.san_xuat_san_luong import BG_DE_XUAT, SanXuatBatch
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.don_vi_do_repo import DonViDoRepository, nhan_don_vi
from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ...repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from ..san_xuat import ban_giao
from . import GiaCongXungDot, kiem_version
from .lan import noi_ve_hop_le

_EPS = 1e-9
NHAN_NOI_VE = {"xuong": "về xưởng", "kho": "về kho", "khach": "giao thẳng cho khách"}


# --- Nhánh GHI theo nơi về ------------------------------------------------------------------
def _ve_xuong(db: Session, *, user, gcn, cuoi, me, so: float, chang_sau: list,
              dich_cong_viec_id: int | None) -> dict:
    if len(chang_sau) == 1:
        dich = chang_sau[0]
    else:
        dich = next((c for c in chang_sau if c.id == dich_cong_viec_id), None)
        if dich is None:
            raise ValueError("Bước sau có nhiều nhánh — chọn bước nhận hàng.")
    bg = ban_giao.lap_ban_giao(db, user=user, nguon_cv=cuoi, dich_cv=dich, so_luong=so,
                               don_vi=me.don_vi, batch_ids=[me.id])
    return {"ban_giao": (bg, cuoi, dich)}


def _go_xuong(db: Session, *, user, gcn, cuoi) -> None:
    repo = GiaCongNgoaiRepository(db)
    sl_repo = SanXuatSanLuongRepository(db)
    for bg in repo.ban_giao_tu(cuoi.id):
        if bg.trang_thai != BG_DE_XUAT:
            raise ValueError("Tổ nhận đã xác nhận bàn giao số chốt — không mở lại được. Nhờ tổ "
                             "điều chỉnh bàn giao nếu số cần sửa.")
        for lk in sl_repo.lien_ket_me(bg.id):
            sl_repo.delete(lk)
        sl_repo.flush()
        sl_repo.delete(bg)


# Nơi về → hàm ghi / hàm gỡ. Task 8 thêm "kho" và "khach".
_NHANH: dict[str, Callable] = {NOI_VE_XUONG: _ve_xuong}
_GO: dict[str, Callable] = {NOI_VE_XUONG: _go_xuong}


def _lay(repo: GiaCongNgoaiRepository, gcn_id: int, expected_version: int | None):
    gcn = repo.khoa(gcn_id)
    if gcn is None:
        raise ValueError("Không tìm thấy lần gia công.")
    kiem_version(gcn, expected_version)
    if gcn.huy_luc is not None:
        raise ValueError("Lần gia công đã huỷ.")
    return gcn


def chot(db: Session, *, user, gcn_id: int, expected_version: int | None, sl_cuoi: float,
         noi_ve: str, dich_cong_viec_id: int | None = None) -> dict:
    repo = GiaCongNgoaiRepository(db)
    gcn = _lay(repo, gcn_id, expected_version)
    if gcn.chot_luc is not None:
        raise GiaCongXungDot("Lần gia công vừa được chốt — tải lại.")
    if gcn.kieu == KIEU_MOT_PHAN and gcn.mang_di_luc is None:
        raise ValueError("Chưa ghi “Đã mang đi” — bấm Mang đi trước khi nhận về.")
    so = float(sl_cuoi or 0)
    if so <= _EPS:
        raise ValueError("Con số cuối phải lớn hơn 0.")
    cvs = repo.cong_viec_cua(gcn.id)
    if not cvs:
        raise ValueError("Lần gia công không còn công việc nào — lệnh đã bị thu hồi?")
    cuoi = cvs[-1]
    chang_sau = SanXuatSanLuongRepository(db).cong_viec_chang_sau(cuoi)
    if noi_ve not in noi_ve_hop_le(db, gcn, chang_sau):
        raise ValueError(
            "Dải này còn bước sau trong xưởng — chỉ chốt về xưởng." if chang_sau else
            "Nơi về không hợp lệ — dải chứa bước cuối của lệnh chỉ về kho, hoặc giao thẳng khi "
            "dòng đơn đứng riêng một cụm.")
    nhanh = _NHANH.get(noi_ve)
    if nhanh is None:
        raise ValueError("Chưa ghi được nơi về này.")

    uid = getattr(user, "id", None)
    luc = _utcnow()
    don_vi = (cuoi.don_vi_ra or gcn.don_vi or "").strip()
    me = SanXuatBatch(
        cong_viec_id=cuoi.id, bat_dau=luc, ket_thuc=luc, tong=so, tot=so, hong=0, don_vi=don_vi,
        ghi_chu=f"Số chốt gia công ngoài — {gcn.nha_cung_cap_ten}"[:500], created_by=uid,
    )
    db.add(me)
    db.flush()
    for cv in cvs:
        cv.trang_thai = CV_HOAN_THANH
        cv.hoan_thanh_luc = luc
        cv.version += 1
    kq = nhanh(db, user=user, gcn=gcn, cuoi=cuoi, me=me, so=so, chang_sau=chang_sau,
               dich_cong_viec_id=dich_cong_viec_id)

    gcn.sl_cuoi, gcn.noi_ve, gcn.chot_boi_id, gcn.chot_luc = so, noi_ve, uid, luc
    gcn.version += 1
    dv_ten = nhan_don_vi(DonViDoRepository(db).ten_theo_ma(), don_vi)
    AuditLogRepository(db).create(
        actor_user_id=uid, action="gia_cong_ngoai_chot", target=f"gia_cong_ngoai:{gcn.id}",
        detail=f"Chốt {so:g} {dv_ten} — {NHAN_NOI_VE[noi_ve]}", commit=False,
    )
    db.commit()

    lsx = SanXuatRepository(db).lsx(gcn.lsx_id)
    ra = {
        "gia_cong_ngoai_id": gcn.id, "lsx_id": gcn.lsx_id, "lsx_ma": lsx.ma if lsx else "",
        "nha_cung_cap_ten": gcn.nha_cung_cap_ten, "ten_viec": gcn.ten_viec,
        "ban_giao": None, "yeu_cau_kho": None, "nhom_dong": None,
    }
    if "ban_giao" in kq:
        bg, nguon, dich = kq["ban_giao"]
        ra["ban_giao"] = ban_giao.ket_qua_cho_ben_nhan(db, user=user, bg=bg, nguon_cv=nguon,
                                                       dich_cv=dich)
    for k in ("yeu_cau_kho", "nhom_dong"):
        if k in kq:
            ra[k] = kq[k]
    return ra


def mo_lai(db: Session, *, user, gcn_id: int, expected_version: int | None) -> dict:
    repo = GiaCongNgoaiRepository(db)
    gcn = _lay(repo, gcn_id, expected_version)
    if gcn.chot_luc is None:
        raise ValueError("Lần gia công chưa chốt.")
    pc = repo.phieu_chi_song([gcn.id]).get(gcn.id)
    if pc is not None:
        raise ValueError(f"Kế toán đã lập phiếu chi {pc.code} — huỷ phiếu chi trước rồi mới mở lại.")
    cvs = repo.cong_viec_cua(gcn.id)
    cuoi = cvs[-1]
    _GO[gcn.noi_ve](db, user=user, gcn=gcn, cuoi=cuoi)

    sl_repo = SanXuatSanLuongRepository(db)
    for b in sl_repo.cac_batch(cuoi.id):
        sl_repo.delete(b)
    for cv in cvs:
        cv.trang_thai = CV_PHAT_HANH
        cv.hoan_thanh_luc = None
        cv.version += 1
    so_cu, noi_cu = float(gcn.sl_cuoi), gcn.noi_ve
    gcn.sl_cuoi = gcn.noi_ve = gcn.chot_boi_id = gcn.chot_luc = None
    gcn.version += 1
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None), action="gia_cong_ngoai_mo_lai",
        target=f"gia_cong_ngoai:{gcn.id}",
        detail=f"Mở lại số chốt {so_cu:g} ({NHAN_NOI_VE[noi_cu]})", commit=False,
    )
    db.commit()
    return {"gia_cong_ngoai_id": gcn.id, "lsx_id": gcn.lsx_id}
