"""Chốt con số cuối của lần gia công + Mở lại (spec 2026-09-26 §3 bước 6, §4 bước 3–5, §6).

Chốt ghi MỘT mẻ (tốt = số chốt) lên công việc cuối của lần, đánh mọi công việc của lần là hoàn
thành, rồi rẽ theo nơi về. Từ đó bàn giao / nhập kho / giao hàng / đóng nhóm chạy NGUYÊN đường cũ.
Mở lại gỡ sạch đúng những gì lần chốt đã đẻ ra — chỉ khi chứng từ phía sau chưa chạy.
"""
from __future__ import annotations

from collections.abc import Callable

from sqlalchemy.orm import Session

from ...models.gia_cong_ngoai import KIEU_MOT_PHAN, NOI_VE_KHACH, NOI_VE_KHO, NOI_VE_XUONG, _utcnow
from ...models.san_xuat import CV_HOAN_THANH, CV_PHAT_HANH, NHOM_DANG_SX, NHOM_DONG_DU, NHOM_DONG_THIEU
from ...models.san_xuat_san_luong import BG_DE_XUAT, SanXuatBatch
from ...models.stock_request import REQ_CANCELLED
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.don_vi_do_repo import DonViDoRepository, nhan_don_vi
from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.san_xuat_kcs_repo import SanXuatKcsRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ...repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from ...repositories.stock_request_repo import StockRequestRepository
from ..san_xuat import ban_giao
from ..san_xuat import kho as sx_kho
from ..san_xuat.dong_nhom import tu_dong_dong_neu_du
from ..san_xuat.kcs import ghi_kcs_ngoai_phan_mem
from ..san_xuat.san_luong import _toa_san_luong
from . import GiaCongXungDot, kiem_version
from .giao_thang import ghi_giao_thang, huy_giao_thang
from .lan import NHANH_KHO, NHANH_TOA, nguon_lan, nhanh_bai_ghep, noi_ve_hop_le

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


_GHI_KCS = "KCS làm ngoài phần mềm — số chốt gia công ngoài"


def _ve_kho(db: Session, *, user, gcn, cuoi, me, so: float, chang_sau: list,
            dich_cong_viec_id: int | None) -> dict:
    ghi_kcs_ngoai_phan_mem(db, cv=cuoi, so_dat=so, uid=getattr(user, "id", None), ghi_chu=_GHI_KCS)
    req, _ra = sx_kho.lap_yeu_cau_nhap_tp(
        db, user=user, cv=cuoi, so_kcs=so,
        nguon_ghi=f"gia công ngoài ({gcn.nha_cung_cap_ten})", gia_cong_ngoai_id=gcn.id)
    return {"yeu_cau_kho": req, "_dong_nhom": cuoi.nhom_id}


def _ve_khach(db: Session, *, user, gcn, cuoi, me, so: float, chang_sau: list,
              dich_cong_viec_id: int | None) -> dict:
    ghi_kcs_ngoai_phan_mem(db, cv=cuoi, so_dat=so, uid=getattr(user, "id", None), ghi_chu=_GHI_KCS)
    ghi_giao_thang(db, user=user, gcn=gcn, cv=cuoi, so=so)
    return {"_dong_nhom": cuoi.nhom_id}


def _nhom_ids(db: Session, gcn, cuoi) -> list[int]:
    """Nhóm thành phẩm mà số chốt về kho đã ghi vào: nhóm của công việc cuối, hoặc — lần của bài
    ghép — nhóm của từng lệnh thành viên."""
    if gcn.bai_ghep_id is None:
        return [cuoi.nhom_id] if cuoi.nhom_id else []
    sx = SanXuatRepository(db)
    ra = []
    for lsx_id in sorted(sx.thanh_vien_so_con({gcn.bai_ghep_id})):
        tv = sx.member_of_lsx(lsx_id)
        if tv is not None and tv.nhom_id and tv.nhom_id not in ra:
            ra.append(tv.nhom_id)
    return ra


def _go_kcs_va_nhom(db: Session, *, user, gcn, cuoi) -> None:
    sx = SanXuatRepository(db)
    nhoms = [n for n in (sx.nhom(i) for i in _nhom_ids(db, gcn, cuoi)) if n is not None]
    if any(n.trang_thai == NHOM_DONG_THIEU for n in nhoms):
        raise ValueError("Trưởng KCS đã đóng thiếu nhóm thành phẩm này — không mở lại được.")
    kcs_repo = SanXuatKcsRepository(db)
    for k in kcs_repo.cac_kcs_batch(cuoi.id):
        db.delete(k)
    for nhom in nhoms:
        if nhom.trang_thai == NHOM_DONG_DU:
            # Chính số chốt đã làm nhóm đủ ⇒ gỡ số thì nhóm mở lại.
            nhom.trang_thai = NHOM_DANG_SX
            nhom.version += 1


def _ve_kho_tung_lenh(db: Session, *, user, gcn, cuoi, me, so: float, chang_sau: list,
                      dich_cong_viec_id: int | None) -> dict:
    """Bước chung CUỐI của bài ghép thuê ngoài về kho: số chốt là tờ ghép ⇒ mỗi lệnh nhập
    `số × số con/tờ` của mình, theo đơn vị ra của bước riêng lệnh đó (spec 2026-09-27 §3). Mỗi lệnh
    một bản KCS tổng hợp + một đề nghị nhập — nhóm/đơn thuộc về lệnh, không thuộc công việc chung."""
    repo, sx = GiaCongNgoaiRepository(db), SanXuatRepository(db)
    uid = getattr(user, "id", None)
    don_vi = repo.don_vi_ra_buoc_bi_phu(cuoi.bai_ghep_cong_doan_id)
    reqs, nhoms = [], []
    for lsx_id, con in sorted(sx.thanh_vien_so_con({gcn.bai_ghep_id}).items()):
        phan = round(so * float(con or 0), 3)
        if phan <= _EPS:
            continue
        tv = sx.member_of_lsx(lsx_id)
        nhom_id = tv.nhom_id if tv is not None else None
        dv = don_vi.get(lsx_id) or cuoi.don_vi_ra
        ghi_kcs_ngoai_phan_mem(db, cv=cuoi, so_dat=phan, uid=uid, ghi_chu=_GHI_KCS,
                               theo_lenh=(nhom_id, dv))
        req, _ra = sx_kho.lap_yeu_cau_nhap_tp(
            db, user=user, cv=cuoi, so_kcs=phan,
            nguon_ghi=f"gia công ngoài ({gcn.nha_cung_cap_ten})", gia_cong_ngoai_id=gcn.id,
            theo_lenh=(nhom_id, lsx_id, dv))
        reqs.append(req)
        if nhom_id and nhom_id not in nhoms:
            nhoms.append(nhom_id)
    return {"yeu_cau_khos": reqs, "_dong_nhoms": nhoms}


def _ve_toa(db: Session, *, user, gcn, cuoi, me, so: float, chang_sau: list,
            dich_cong_viec_id: int | None) -> dict:
    """Bước chung thuê ngoài đứng ở ĐIỂM TOẢ: số chốt (tờ ghép) toả sang bước riêng từng lệnh qua
    đúng đường của mẻ tự ghi (`_toa_san_luong` — nhân số con/tờ, bàn giao đã xác nhận)."""
    return {"toa": _toa_san_luong(db, SanXuatSanLuongRepository(db), cv=cuoi, batch=me, tot=so,
                                  actor=user)}


def _ly_do_chan_go_toa(db: Session, cuoi) -> str | None:
    """Lệnh nào đã ghi mẻ ở bước riêng nhận số toả ⇒ gỡ số toả là rút hàng tổ đã làm — chặn."""
    sl_repo = SanXuatSanLuongRepository(db)
    da_lam = []
    for bg in GiaCongNgoaiRepository(db).ban_giao_tu(cuoi.id):
        dich = sl_repo.cong_viec(bg.dich_cong_viec_id)
        if dich is not None and sl_repo.cac_batch(dich.id):
            da_lam.append(dich)
    if not da_lam:
        return None
    ma = GiaCongNgoaiRepository(db).ma_cua_lenh({d.lsx_id for d in da_lam if d.lsx_id})
    ten = ", ".join(f"{ma.get(d.lsx_id, '')} (bước “{d.ten_cong_doan}”)" for d in da_lam)
    return (f"Lệnh {ten} đã ghi mẻ trên số đã chia — không mở lại được. Nhờ tổ xoá mẻ đó trước "
            "nếu số chốt cần sửa.")


def _go_toa(db: Session, *, user, gcn, cuoi) -> None:
    ly_do = _ly_do_chan_go_toa(db, cuoi)
    if ly_do:
        raise ValueError(ly_do)
    sl_repo = SanXuatSanLuongRepository(db)
    for b in sl_repo.cac_batch(cuoi.id):
        for kq in sl_repo.ket_qua_nhanh_cua_batch(b.id):
            sl_repo.delete(kq)
    sl_repo.flush()
    for bg in GiaCongNgoaiRepository(db).ban_giao_tu(cuoi.id):
        for lk in sl_repo.lien_ket_me(bg.id):
            sl_repo.delete(lk)
        sl_repo.flush()
        sl_repo.delete(bg)


def _go_kho(db: Session, *, user, gcn, cuoi) -> list:
    """Huỷ đề nghị nhập của lần chốt — trả các yêu cầu vừa huỷ để báo kho SAU commit."""
    req_repo = StockRequestRepository(db)
    huy = []
    for req in GiaCongNgoaiRepository(db).yeu_cau_nhap_cua(gcn.id):
        req_repo.lock_for_update(req.id)
        if req_repo.co_voucher(req.id):
            raise ValueError(f"Kho đã lập phiếu cho đề nghị nhập {req.ma} — không mở lại được.")
        if req.trang_thai != REQ_CANCELLED:
            req.trang_thai, req.ly_do_huy = REQ_CANCELLED, "Mở lại lần gia công ngoài"
            huy.append(req)
    _go_kcs_va_nhom(db, user=user, gcn=gcn, cuoi=cuoi)
    return huy


def _go_khach(db: Session, *, user, gcn, cuoi) -> None:
    huy_giao_thang(db, user=user, gcn=gcn)
    _go_kcs_va_nhom(db, user=user, gcn=gcn, cuoi=cuoi)


# Nơi về → hàm ghi / hàm gỡ. Task 8 thêm "kho" và "khach".
_NHANH: dict[str, Callable] = {NOI_VE_XUONG: _ve_xuong}
_GO: dict[str, Callable] = {NOI_VE_XUONG: _go_xuong}
_NHANH.update({NOI_VE_KHO: _ve_kho, NOI_VE_KHACH: _ve_khach})
_GO.update({NOI_VE_KHO: _go_kho, NOI_VE_KHACH: _go_khach})


def _cap_ham(db: Session, gcn, cuoi, chang_sau: list, noi_ve: str) -> tuple[Callable, Callable]:
    """(hàm ghi, hàm gỡ) cho nơi về. Lần của bài ghép rẽ theo cái đứng sau bước chung: toả sang
    bước riêng từng lệnh / nhập kho từng lệnh; về bước chung kế đi đường bàn giao thường."""
    if gcn.bai_ghep_id is not None:
        nhanh = nhanh_bai_ghep(db, cuoi, chang_sau)
        if nhanh == NHANH_TOA and noi_ve == NOI_VE_XUONG:
            return _ve_toa, _go_toa
        if nhanh == NHANH_KHO and noi_ve == NOI_VE_KHO:
            return _ve_kho_tung_lenh, _go_kho
    ghi = _NHANH.get(noi_ve)
    if ghi is None:
        raise ValueError("Chưa ghi được nơi về này.")
    return ghi, _GO[noi_ve]


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
    nhanh, _go = _cap_ham(db, gcn, cuoi, chang_sau, noi_ve)

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

    nhoms_dong = []
    for nhom_id in ([kq["_dong_nhom"]] if kq.get("_dong_nhom") else []) + kq.get("_dong_nhoms", []):
        # Đóng nhóm tự commit riêng — đặt SAU giao dịch chính như mọi cửa gọi khác (§16).
        d = tu_dong_dong_neu_du(db, nhom_id=nhom_id, actor=user, su_kien="gia_cong_ngoai_chot")
        if d is not None:
            nhoms_dong.append(d)
    yeu_cau_khos = kq.get("yeu_cau_khos") or (
        [kq["yeu_cau_kho"]] if kq.get("yeu_cau_kho") is not None else [])
    for req in yeu_cau_khos:
        sx_kho.bao_yeu_cau_nhap_moi(db, req)

    nguon = nguon_lan(db, gcn)
    ra = {
        "gia_cong_ngoai_id": gcn.id, "lsx_id": gcn.lsx_id, "lsx_ma": nguon["lsx_ma"],
        "bai_ghep_id": gcn.bai_ghep_id, "nhan_nguon": nguon["nhan_nguon"],
        "lsx_ids": _lsx_ids(gcn, nguon),
        "nha_cung_cap_ten": gcn.nha_cung_cap_ten, "ten_viec": gcn.ten_viec,
        "ban_giao": None, "yeu_cau_kho": None, "yeu_cau_khos": yeu_cau_khos, "nhom_dong": None,
        "nhoms_dong": nhoms_dong, "toa": kq.get("toa") or [],
    }
    if "ban_giao" in kq:
        bg, nguon, dich = kq["ban_giao"]
        ra["ban_giao"] = ban_giao.ket_qua_cho_ben_nhan(db, user=user, bg=bg, nguon_cv=nguon,
                                                       dich_cv=dich)
    ra["yeu_cau_kho"] = yeu_cau_khos[0] if yeu_cau_khos else None
    ra["nhom_dong"] = nhoms_dong[0] if nhoms_dong else None
    return ra


def _lsx_ids(gcn, nguon: dict) -> list[int]:
    """Lệnh chịu ảnh hưởng — để router bắn SSE cho từng màn lệnh."""
    if gcn.bai_ghep_id is None:
        return [gcn.lsx_id] if gcn.lsx_id else []
    return [l["id"] for l in nguon["lenh"]]


def ly_do_khong_mo_lai(db: Session, gcn, *, pc=None, cuoi=None) -> str | None:
    """Lý do máy chủ SẼ từ chối "Mở lại" — CHỈ ĐỌC, cùng các cửa của `mo_lai`/`_GO`. `None` = mở
    lại được (hoặc lần chưa chốt). FE dùng để khoá nút kèm lý do thay vì để người bấm rồi mới lỗi."""
    if gcn.chot_luc is None or gcn.huy_luc is not None:
        return None
    repo = GiaCongNgoaiRepository(db)
    if pc is None:
        pc = repo.phieu_chi_song([gcn.id]).get(gcn.id)
    if pc is not None:
        return f"Kế toán đã lập phiếu chi {pc.code} — huỷ phiếu chi trước rồi mới mở lại."
    if cuoi is None:
        cvs = repo.cong_viec_cua(gcn.id)
        cuoi = cvs[-1] if cvs else None
    if cuoi is None:
        return "Lần gia công không còn công việc nào — lệnh đã bị thu hồi?"
    if gcn.noi_ve == NOI_VE_XUONG:
        if gcn.bai_ghep_id is not None and nhanh_bai_ghep(
                db, cuoi, SanXuatSanLuongRepository(db).cong_viec_chang_sau(cuoi)) == NHANH_TOA:
            # Bàn giao toả tạo sẵn ở trạng thái đã xác nhận — chặn khi tổ đã ghi mẻ trên số đó.
            return _ly_do_chan_go_toa(db, cuoi)
        if any(bg.trang_thai != BG_DE_XUAT for bg in repo.ban_giao_tu(cuoi.id)):
            return "Tổ nhận đã xác nhận bàn giao số chốt — không mở lại được."
        return None
    sx = SanXuatRepository(db)
    for nhom_id in _nhom_ids(db, gcn, cuoi):
        nhom = sx.nhom(nhom_id)
        if nhom is not None and nhom.trang_thai == NHOM_DONG_THIEU:
            return "Trưởng KCS đã đóng thiếu nhóm thành phẩm này — không mở lại được."
    if gcn.noi_ve == NOI_VE_KHO:
        req_repo = StockRequestRepository(db)
        for req in repo.yeu_cau_nhap_cua(gcn.id):
            if req_repo.co_voucher(req.id):
                return f"Kho đã lập phiếu cho đề nghị nhập {req.ma} — không mở lại được."
    return None


def mo_lai(db: Session, *, user, gcn_id: int, expected_version: int | None) -> dict:
    repo = GiaCongNgoaiRepository(db)
    gcn = _lay(repo, gcn_id, expected_version)
    if gcn.chot_luc is None:
        raise ValueError("Lần gia công chưa chốt.")
    pc = repo.phieu_chi_song([gcn.id]).get(gcn.id)
    if pc is not None:
        raise ValueError(f"Kế toán đã lập phiếu chi {pc.code} — huỷ phiếu chi trước rồi mới mở lại.")
    cvs = repo.cong_viec_cua(gcn.id)
    if not cvs:
        raise ValueError("Lần gia công không còn công việc nào — lệnh đã bị thu hồi?")
    cuoi = cvs[-1]
    _ghi, go = _cap_ham(db, gcn, cuoi, SanXuatSanLuongRepository(db).cong_viec_chang_sau(cuoi),
                        gcn.noi_ve)
    yc_huy = go(db, user=user, gcn=gcn, cuoi=cuoi) or []

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
    for req in yc_huy:
        sx_kho.bao_yeu_cau_da_huy(db, req)
    nguon = nguon_lan(db, gcn)
    return {"gia_cong_ngoai_id": gcn.id, "lsx_id": gcn.lsx_id, "bai_ghep_id": gcn.bai_ghep_id,
            "lsx_ids": _lsx_ids(gcn, nguon)}
