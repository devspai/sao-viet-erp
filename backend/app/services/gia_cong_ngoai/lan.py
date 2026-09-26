"""Gom LẦN GIA CÔNG lúc phát hành, đồng bộ lúc phát hành cập nhật, huỷ khi thu hồi gói, dựng dict
đọc cho khối trên lệnh."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ...audit_registry import tra
from ...models.gia_cong_ngoai import (
    KIEU_MOT_PHAN, NOI_VE_KHACH, NOI_VE_KHO, NOI_VE_XUONG, GiaCongNgoai, _utcnow,
)
from ...models.lsx import LB_THUE_NGOAI, LsxCongDoan, LsxCongDoanPhuThuoc
from ...models.san_xuat import SanXuatCongViec
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ...repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from ..gio_xuong import thuc_te_hien_thi
from . import trang_thai


def _f(v) -> float | None:
    return float(v) if v is not None else None


def _canh_ke_tiep(db: Session, lsx_id: int) -> set[tuple[int, int]]:
    """Cạnh (buoc_truoc_id, buoc_sau_id) của lệnh — nguồn DUY NHẤT để biết hai bước có "liền
    nhau" hay chỉ tình cờ đứng cạnh nhau trong danh sách `thu_tu` (hai nhánh song song của cùng
    một bước cha KHÔNG liền nhau, dù `thu_tu` sát nhau)."""
    return set(db.execute(
        select(LsxCongDoanPhuThuoc.buoc_truoc_id, LsxCongDoanPhuThuoc.buoc_sau_id)
        .join(LsxCongDoan, LsxCongDoan.id == LsxCongDoanPhuThuoc.buoc_sau_id)
        .where(LsxCongDoan.lsx_id == lsx_id)
    ).all())


def _quet_dai_thue_ngoai(steps, canh: set[tuple[int, int]], cv_by_step: dict) -> list[list]:
    """Cắt routing (đã sắp `thu_tu`) thành các dải bước "Thuê ngoài" LIỀN NHAU, CÙNG nhà gia
    công. "Liền nhau" đi theo CẠNH DAG (`dai[-1].id → cd.id` phải có cạnh) — routing KHÔNG khai
    cạnh nào (tuyến tính cũ) thì lùi về so `thu_tu` liền kề như trước. Bước bị bài ghép phủ ngắt
    dải (bài ghép là đợt 2 — spec §9). Ném lỗi nếu gặp bước thuê ngoài chưa chọn nhà gia công."""
    co_canh_nao = bool(canh)
    ra: list[list] = []
    dai: list = []

    def dong() -> None:
        if dai:
            ra.append(list(dai))
            dai.clear()

    for cd in steps:
        cvs = cv_by_step.get(cd.step_key) or []
        chung = any(cv.bai_ghep_id for cv in cvs)
        if cd.loai_buoc != LB_THUE_NGOAI or chung:
            dong()
            continue
        if cd.nha_cung_cap_id is None:
            raise ValueError(
                f"Bước “{cd.ten}” thuê ngoài chưa chọn nhà gia công — chọn ở Kế hoạch SX rồi "
                f"phát hành lại.")
        if dai:
            ke_tiep = (not co_canh_nao) or ((dai[-1].id, cd.id) in canh)
            if dai[-1].nha_cung_cap_id != cd.nha_cung_cap_id or not ke_tiep:
                dong()
        dai.append(cd)
    dong()
    return ra


def _tao_lan(db: Session, audit: AuditLogRepository, *, lsx_id: int, dai: list, cv_by_step: dict,
             uid: int | None) -> GiaCongNgoai:
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
    return gcn


def _huy_lan(db: Session, audit: AuditLogRepository, gcn: GiaCongNgoai, uid: int | None,
             ly_do: str) -> None:
    gcn.huy_luc, gcn.huy_boi_id, gcn.ly_do_huy = _utcnow(), uid, ly_do[:500]
    gcn.version += 1
    audit.create(actor_user_id=uid, action="gia_cong_ngoai_huy",
                 target=f"gia_cong_ngoai:{gcn.id}", detail=ly_do[:500], commit=False)


def gom_lan_khi_phat_hanh(db: Session, *, lsx_ids: set[int], cv_by_step: dict, actor) -> list:
    """Dải bước "Thuê ngoài" LIỀN NHAU, CÙNG nhà gia công ⇒ MỘT lần (spec §2). Gọi trong giao
    dịch phát hành, KHÔNG commit. Công việc của dải: gắn `gia_cong_ngoai_id`, gỡ tổ + máy (không
    vào bàn tổ nào). Bước đã bị bài ghép phủ bỏ qua — bài ghép là đợt 2 (spec §9)."""
    repo = SanXuatRepository(db)
    audit = AuditLogRepository(db)
    uid = getattr(actor, "id", None)
    tao: list[GiaCongNgoai] = []
    for lsx_id in sorted(lsx_ids):
        steps = repo.routing_steps(lsx_id)
        canh = _canh_ke_tiep(db, lsx_id)
        for dai in _quet_dai_thue_ngoai(steps, canh, cv_by_step):
            tao.append(_tao_lan(db, audit, lsx_id=lsx_id, dai=dai, cv_by_step=cv_by_step, uid=uid))
    db.flush()
    return tao


def _phuc_hoi_cv_mo_coi(db: Session, gcn_repo: GiaCongNgoaiRepository, huy_trong_luot: list,
                        cd_by_step: dict) -> None:
    """Sau khi huỷ (các) lần trong lượt đồng bộ này: công việc nào VẪN còn trỏ `gia_cong_ngoai_id`
    về đúng lần vừa huỷ (nghĩa là KHÔNG được `_tao_lan` gom sang lần mới ngay sau đó — bước đã hết
    thuê ngoài, hoặc dải co lại bỏ rơi nó) là việc MỒ CÔI: gỡ liên kết, trả lại tổ/máy theo routing
    HIỆN TẠI của đúng bước đó (cùng nguồn `lsx_cong_doan.department_id`/`may_id` mà phát hành lần
    đầu dùng — không suy đoán lại)."""
    for gcn in huy_trong_luot:
        for cv in gcn_repo.cong_viec_cua(gcn.id):
            cd = cd_by_step.get(cv.step_key)
            cv.gia_cong_ngoai_id = None
            cv.department_id = cd.department_id if cd is not None else None
            cv.may_id = cd.may_id if cd is not None else None


def dong_bo_lan_khi_cap_nhat(db: Session, *, lsx_ids: set[int], actor) -> None:
    """Sau Phát hành cập nhật (§4.3): đồng bộ lần gia công theo routing hiện tại — IDEMPOTENT,
    KHÔNG commit.

    Lần đã MANG ĐI hoặc đã CHỐT giữ NGUYÊN tuyệt đối (hàng đã ở ngoài xưởng — sửa lại là xoá vết,
    kể cả khi kế hoạch đổi nhà gia công/routing sau đó). Lần CHƯA mang đi:
      · Dải KHÔNG đổi (đúng tập công việc cũ) ⇒ chỉ đồng bộ NCC/tên/đơn giá theo routing hiện tại,
        không đẻ dòng mới, giữ nguyên lịch sử/`id`.
      · Dải ĐỔI (bước thêm/bớt, hoặc hai lần cũ giờ gộp làm một) ⇒ HUỶ (các) dòng cũ rồi gom lại
        từ đầu — cùng một hàm `_quet_dai_thue_ngoai`/`_tao_lan` mà lúc phát hành lần đầu dùng.
      · Bước MỚI vừa đổi routing thành "Thuê ngoài" (trước đó không phải) cũng được gom thành lần.
      · Bước KHÔNG còn nằm trong dải thuê ngoài nào (đổi lại thành nội bộ) ⇒ lần cũ của nó bị huỷ.

    Việc MỒ CÔI (Fix round 2): huỷ lần không tự xoá `gia_cong_ngoai_id` trên công việc — công việc
    nào bị bỏ lại (bước hết thuê ngoài, hoặc dải co lại) được trả về tổ/máy theo routing hiện tại
    ở CUỐI hàm (`_phuc_hoi_cv_mo_coi`), sau khi mọi lần mới đã gom xong (để không giành lại nhầm
    công việc vừa được gom sang lần mới)."""
    repo = SanXuatRepository(db)
    gcn_repo = GiaCongNgoaiRepository(db)
    audit = AuditLogRepository(db)
    uid = getattr(actor, "id", None)

    for lsx_id in sorted(lsx_ids):
        steps = repo.routing_steps(lsx_id)
        cd_by_step = {cd.step_key: cd for cd in steps}
        canh = _canh_ke_tiep(db, lsx_id)
        cv_by_step: dict[str, list] = {}
        for cv in db.execute(
            select(SanXuatCongViec).where(SanXuatCongViec.lsx_id == lsx_id)
        ).scalars():
            if cv.step_key:
                cv_by_step.setdefault(cv.step_key, []).append(cv)

        dai_list = _quet_dai_thue_ngoai(steps, canh, cv_by_step)

        # Lần MỞ (chưa mang đi / chưa chốt / chưa huỷ) — thứ DUY NHẤT được đụng vào ở đây.
        mo = [g for g in gcn_repo.cua_lenh(lsx_id)
              if g.kieu == KIEU_MOT_PHAN and g.huy_luc is None and g.chot_luc is None
              and g.mang_di_luc is None]
        mo_by_step: dict[str, GiaCongNgoai] = {}
        for g in mo:
            for cv in gcn_repo.cong_viec_cua(g.id):
                if cv.step_key:
                    mo_by_step[cv.step_key] = g

        da_xu_ly: set[int] = set()
        huy_trong_luot: list[GiaCongNgoai] = []
        for dai in dai_list:
            step_keys = [c.step_key for c in dai]
            lans_lien_quan = {mo_by_step[sk] for sk in step_keys if sk in mo_by_step}
            cuoi = dai[-1]
            if len(lans_lien_quan) == 1:
                (gcn,) = lans_lien_quan
                cv_hien_tai = {cv.id for c in dai for cv in cv_by_step.get(c.step_key) or []}
                cv_cua_lan = {cv.id for cv in gcn_repo.cong_viec_cua(gcn.id)}
                if cv_hien_tai == cv_cua_lan:
                    # Dải KHÔNG đổi — chỉ đồng bộ NCC/tên/đơn giá theo routing hiện tại.
                    doi = (gcn.nha_cung_cap_id != cuoi.nha_cung_cap_id
                           or _f(gcn.don_gia) != _f(cuoi.don_gia_gia_cong)
                           or gcn.don_vi != cuoi.don_vi_ra)
                    if doi:
                        gcn.nha_cung_cap_id = cuoi.nha_cung_cap_id
                        gcn.nha_cung_cap_ten = cuoi.nha_cung_cap or ""
                        gcn.ten_viec = " + ".join(c.ten for c in dai)
                        gcn.don_gia = cuoi.don_gia_gia_cong
                        gcn.don_vi = cuoi.don_vi_ra
                        gcn.version += 1
                        audit.create(
                            actor_user_id=uid, action="gia_cong_ngoai_dat",
                            target=f"gia_cong_ngoai:{gcn.id}",
                            detail=f"Cập nhật lịch: đồng bộ nhà gia công/đơn giá — "
                                   f"{gcn.nha_cung_cap_ten}",
                            commit=False,
                        )
                    da_xu_ly.add(gcn.id)
                    continue
            # Dải mới hoặc dải đã đổi bố cục — huỷ (các) lần cũ liên quan rồi gom lại từ đầu.
            for gcn in lans_lien_quan:
                if gcn.id in da_xu_ly:
                    continue
                _huy_lan(db, audit, gcn, uid, "Cập nhật lịch — routing đổi, gom lại lần gia công.")
                da_xu_ly.add(gcn.id)
                huy_trong_luot.append(gcn)
            gcn_moi = _tao_lan(db, audit, lsx_id=lsx_id, dai=dai, cv_by_step=cv_by_step, uid=uid)
            da_xu_ly.add(gcn_moi.id)

        # Lần mở còn lại không nằm trong dải thuê-ngoài nào nữa (routing đổi lại thành nội bộ).
        for g in mo:
            if g.id not in da_xu_ly:
                _huy_lan(db, audit, g, uid, "Cập nhật lịch — bước không còn thuê ngoài.")
                huy_trong_luot.append(g)

        # Trả việc MỒ CÔI về tổ/máy — làm SAU CÙNG, sau khi mọi lần mới trong lượt này đã gom
        # xong, để không cướp nhầm công việc vừa được `_tao_lan` gán sang lần mới.
        _phuc_hoi_cv_mo_coi(db, gcn_repo, huy_trong_luot, cd_by_step)
    db.flush()


def huy_lan_cua_goi(db: Session, *, goi_id: int, actor, ly_do: str) -> int:
    """Gói bị thu hồi ⇒ lần CHƯA mang đi và CHƯA chốt của gói HUỶ theo (không xoá — giữ vết). Lần
    đã mang đi / đã chốt giữ NGUYÊN — hàng đã ở ngoài xưởng hoặc đã ghi sổ, huỷ là xoá vết (bình
    thường `co_cong_viec_da_bat_dau` đã chặn từ trước khi gọi tới đây; kiểm lại ở đây cho chắc).
    KHÔNG commit."""
    repo = GiaCongNgoaiRepository(db)
    audit = AuditLogRepository(db)
    uid = getattr(actor, "id", None)
    n = 0
    for gcn in repo.lan_cua_goi(goi_id):
        if gcn.huy_luc is not None or gcn.chot_luc is not None or gcn.mang_di_luc is not None:
            continue
        _huy_lan(db, audit, gcn, uid, ly_do)
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
