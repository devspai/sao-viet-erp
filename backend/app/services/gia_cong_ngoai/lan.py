"""Gom LẦN GIA CÔNG lúc phát hành, huỷ khi thu hồi gói, dựng dict đọc cho khối trên lệnh."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...audit_registry import tra
from ...models.gia_cong_ngoai import (
    KIEU_MOT_PHAN, NOI_VE_KHACH, NOI_VE_KHO, NOI_VE_XUONG, GiaCongNgoai,
)
from ...models.lsx import LB_THUE_NGOAI
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ...repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from ..gio_xuong import thuc_te_hien_thi
from . import trang_thai


def _f(v) -> float | None:
    return float(v) if v is not None else None


def gom_lan_khi_phat_hanh(db: Session, *, lsx_ids: set[int], cv_by_step: dict, actor) -> list:
    """Dải bước "Thuê ngoài" LIỀN NHAU, CÙNG nhà gia công ⇒ MỘT lần (spec §2). Gọi trong giao
    dịch phát hành, KHÔNG commit. Công việc của dải: gắn `gia_cong_ngoai_id`, gỡ tổ + máy (không
    vào bàn tổ nào). Bước đã bị bài ghép phủ bỏ qua — bài ghép là đợt 2 (spec §9)."""
    repo = SanXuatRepository(db)
    audit = AuditLogRepository(db)
    uid = getattr(actor, "id", None)
    tao: list[GiaCongNgoai] = []
    for lsx_id in sorted(lsx_ids):
        dai: list = []

        def dong_dai() -> None:
            if not dai:
                return
            cuoi = dai[-1]
            gcn = GiaCongNgoai(
                lsx_id=lsx_id, kieu=KIEU_MOT_PHAN,
                nha_cung_cap_id=cuoi.nha_cung_cap_id, nha_cung_cap_ten=cuoi.nha_cung_cap or "",
                ten_viec=" + ".join(c.ten for c in dai),
                # Đơn giá CẢ LẦN khai ở bước CUỐI dải, theo đơn vị ra của bước đó (spec §7).
                don_gia=cuoi.don_gia_gia_cong, don_vi=cuoi.don_vi_ra, created_by=uid,
            )
            db.add(gcn)
            db.flush()
            for c in dai:
                for cv in cv_by_step.get(c.step_key) or []:
                    cv.gia_cong_ngoai_id = gcn.id
                    cv.department_id = None
                    cv.may_id = None
            audit.create(
                actor_user_id=uid, action="gia_cong_ngoai_dat", target=f"gia_cong_ngoai:{gcn.id}",
                detail=f"Phát hành: {gcn.ten_viec} — {gcn.nha_cung_cap_ten}", commit=False,
            )
            tao.append(gcn)
            dai.clear()

        for cd in repo.routing_steps(lsx_id):
            cvs = cv_by_step.get(cd.step_key) or []
            chung = any(cv.bai_ghep_id for cv in cvs)
            if cd.loai_buoc != LB_THUE_NGOAI or chung:
                dong_dai()
                continue
            if cd.nha_cung_cap_id is None:
                raise ValueError(
                    f"Bước “{cd.ten}” thuê ngoài chưa chọn nhà gia công — chọn ở Kế hoạch SX rồi "
                    f"phát hành lại.")
            if dai and dai[-1].nha_cung_cap_id != cd.nha_cung_cap_id:
                dong_dai()
            dai.append(cd)
        dong_dai()
    db.flush()
    return tao


def huy_lan_cua_goi(db: Session, *, goi_id: int, actor, ly_do: str) -> int:
    """Gói bị thu hồi ⇒ lần chưa chốt của gói HUỶ theo (không xoá — giữ vết). KHÔNG commit."""
    from ...models.gia_cong_ngoai import _utcnow

    repo = GiaCongNgoaiRepository(db)
    audit = AuditLogRepository(db)
    uid = getattr(actor, "id", None)
    n = 0
    for gcn in repo.lan_cua_goi(goi_id):
        if gcn.huy_luc is not None or gcn.chot_luc is not None:
            continue
        gcn.huy_luc, gcn.huy_boi_id, gcn.ly_do_huy = _utcnow(), uid, ly_do[:500]
        gcn.version += 1
        audit.create(actor_user_id=uid, action="gia_cong_ngoai_huy",
                     target=f"gia_cong_ngoai:{gcn.id}", detail=ly_do[:500], commit=False)
        n += 1
    db.flush()
    return n


def noi_ve_hop_le(db: Session, gcn, chang_sau: list) -> list[str]:
    """Dải còn chặng sau ⇒ chỉ về xưởng. Dải chứa bước cuối / trọn gói ⇒ kho, hoặc khách khi dòng
    đơn của lệnh đứng riêng một cụm bán (§4 bước 5)."""
    if chang_sau:
        return [NOI_VE_XUONG]
    from .giao_thang import dong_don_dung_rieng

    return [NOI_VE_KHO, NOI_VE_KHACH] if dong_don_dung_rieng(db, gcn.lsx_id) else [NOI_VE_KHO]


def lan_dict(db: Session, gcn, *, xem_tien: bool, _cache: dict | None = None) -> dict:
    repo = GiaCongNgoaiRepository(db)
    sl_repo = SanXuatSanLuongRepository(db)
    cvs = repo.cong_viec_cua(gcn.id)
    dau = cvs[0] if cvs else None
    cuoi = cvs[-1] if cvs else None
    chang_sau = sl_repo.cong_viec_chang_sau(cuoi) if cuoi is not None else []
    cho = repo.ban_giao_cho_mang_di(dau.id) if dau is not None and gcn.kieu == KIEU_MOT_PHAN else []
    ten = repo.user_names({gcn.mang_di_boi_id, gcn.chot_boi_id, gcn.huy_boi_id})
    pc = repo.phieu_chi_song([gcn.id]).get(gcn.id)
    lsx = SanXuatRepository(db).lsx(gcn.lsx_id)
    tien = (round(float(gcn.sl_cuoi) * float(gcn.don_gia), 0)
            if xem_tien and gcn.sl_cuoi is not None and gcn.don_gia is not None else None)
    return {
        "id": gcn.id, "lsx_id": gcn.lsx_id, "lsx_ma": lsx.ma if lsx else "",
        "kieu": gcn.kieu, "trang_thai": trang_thai(gcn),
        "nha_cung_cap_id": gcn.nha_cung_cap_id, "nha_cung_cap_ten": gcn.nha_cung_cap_ten,
        "ten_viec": gcn.ten_viec, "don_vi": gcn.don_vi,
        "don_gia": _f(gcn.don_gia) if xem_tien else None,
        "thanh_tien": tien,
        "sl_dat": _f(gcn.sl_dat), "xuong_cap_giay": bool(gcn.xuong_cap_giay),
        "don_vi_gui": dau.don_vi_vao if dau is not None else None,
        "sl_cho_mang_di": round(sum(float(b.so_luong) for b in cho), 3),
        "co_buoc_truoc": repo.co_buoc_truoc(dau.lsx_cong_doan_id) if dau is not None else False,
        "mang_di_boi_ten": ten.get(gcn.mang_di_boi_id), "mang_di_luc": thuc_te_hien_thi(gcn.mang_di_luc),
        "sl_gui": _f(gcn.sl_gui),
        "chot_boi_ten": ten.get(gcn.chot_boi_id), "chot_luc": thuc_te_hien_thi(gcn.chot_luc),
        "sl_cuoi": _f(gcn.sl_cuoi), "noi_ve": gcn.noi_ve,
        "noi_ve_hop_le": noi_ve_hop_le(db, gcn, chang_sau if gcn.kieu == KIEU_MOT_PHAN else []),
        "chang_sau": [{"id": c.id, "ten": c.ten_cong_doan} for c in chang_sau],
        "huy_boi_ten": ten.get(gcn.huy_boi_id), "huy_luc": thuc_te_hien_thi(gcn.huy_luc),
        "ly_do_huy": gcn.ly_do_huy,
        "phieu_chi": {"id": pc.id, "code": pc.code} if pc is not None else None,
        # Nhật ký hiện NGAY trên lần (spec §6) — đọc thẳng audit theo target, nhãn từ registry.
        # Chi tiết audit của lần gia công viết sẵn bằng lời (không mã nội bộ, không tiền).
        "lich_su": [
            {"luc": thuc_te_hien_thi(a.created_at), "ai": a.actor_name_luc_do or "",
             "viec": tra(a.action).nhan, "chi_tiet": a.detail or ""}
            for a in AuditLogRepository(db).list_by_target(f"gia_cong_ngoai:{gcn.id}", limit=50)
        ],
        "version": gcn.version,
    }


def lan_cua_lenh(db: Session, lsx_id: int, *, xem_tien: bool) -> list[dict]:
    return [lan_dict(db, g, xem_tien=xem_tien) for g in GiaCongNgoaiRepository(db).cua_lenh(lsx_id)]
