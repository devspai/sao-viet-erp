"""Tổ Cắt CHỐT GIẤY sau phát hành (spec `2026-10-01-giay-dem-to-theo-kho-design.md` §4.6–4.7).

Lệnh / bài ghép có giấy, sau khi phát hành, tới bàn của tổ mang cờ `departments.la_to_cat`. Tổ Cắt
nhìn dòng giấy cần (mã · khổ · số tờ), tồn tờ đúng khổ và các lô cuộn cùng mã — máy KHÔNG kết luận
— rồi chốt một trong hai:

  · CHÈN BƯỚC CẮT: các công đoạn tổ chọn (công đoạn có tổ này trong danh sách tổ phụ trách) vào ĐẦU
    tuyến lệnh, nối bằng cạnh tường minh Cắt₁ → … → Cắtₙ → bước mang giấy. Cạnh tường minh làm
    `thu_tu` thôi quyết chặng trước, nên CTP không phải chờ Cắt còn In chờ cả CTP lẫn Cắt. Công việc
    dựng bằng đúng hàm dựng một bước của phát hành (`snapshot.cong_viec_buoc_*`), cùng gói đang chạy.
  · KHÔNG CẮT: ghi chốt, bước mang giấy mở ngay.

Bài ghép chốt theo BÀI: mỗi lệnh thành viên nhận bước cắt riêng, một bước chung của bài phủ chúng
⇒ một công việc cắt cho cả bài. Bước mang giấy của bài = bước chung đầu tiên theo `thu_tu`.

Cổng "chờ tổ Cắt" (§4.7) đọc `ly_do_cho_chot`. Không tổ nào bật cờ ⇒ không có cổng, mọi thứ chạy
như trước. Không trả tiền ở đây (nguyên tắc tiền chỉ người có quyền xem).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from ...models.bai_ghep import BaiGhep, BaiGhepThanhVien
from ...models.bai_ghep_cong_doan import BaiGhepCongDoan, BaiGhepCongDoanMap
from ...models.cong_doan import CongDoan, CongDoanTo
from ...models.department import Department
from ...models.kho_hang import KhoHang
from ...models.lsx import LB_MAY, LB_TO, Lsx, LsxCongDoan, LsxCongDoanPhuThuoc, LsxCongDoanVatTu
from ...models.san_xuat import (
    CV_HOAN_THANH,
    CV_PHAT_HANH,
    GOI_DANG_PHAT_HANH,
    SanXuatCongViec,
    SanXuatCongViecLichSu,
    SanXuatGoiPhatHanh,
    SanXuatPhuThuoc,
)
from ...models.san_xuat_kcs import SanXuatKcsBatch
from ...models.san_xuat_phan_bo import SanXuatHoTro
from ...models.san_xuat_san_luong import SanXuatBanGiao, SanXuatBatch
from ...models.san_xuat_thuc_thi import SanXuatPhanCong
from ...models.san_xuat_vat_tu import SanXuatVatTuDeNghi
from ...models.user import User
from ...models.vat_lieu_kho import GiayNguyen
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.rbac_repo import DepartmentRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ...repositories.san_xuat_thuc_thi_repo import SanXuatThucThiRepository
from ...repositories.stock_lot_repo import StockLotRepository
from ..dong_giay import ban_do_tram
from ..kho_giay import DANG_CUON, DANG_TO, khoa_ton, nhan_kho
from ..quyen_to import VIEC_THUC_HIEN, gate_to
from .snapshot import _SoPhatHanh, cong_viec_buoc_bai, cong_viec_buoc_lsx

CHOT_CAT = "cat"
CHOT_KHONG_CAT = "khong_cat"
NHAN_CHOT = {CHOT_CAT: "chèn bước cắt", CHOT_KHONG_CAT: "không cắt"}


class ChotGiayLoi(ValueError):
    """Lỗi nghiệp vụ của chốt giấy — câu tiếng Việt đọc thẳng ra màn."""


# --- Đọc luật -----------------------------------------------------------------------------
def co_to_cat(db: Session) -> bool:
    """Có ít nhất một phòng ban bật cờ Tổ Cắt? Không ⇒ không có cổng chờ chốt."""
    return db.execute(
        select(Department.id).where(Department.la_to_cat.is_(True)).limit(1)
    ).first() is not None


def chu_the_cua(cv) -> tuple[str, int] | None:
    """`("bai", id)` cho công việc của bài ghép, `("lsx", id)` cho công việc riêng của lệnh."""
    if getattr(cv, "bai_ghep_id", None):
        return ("bai", int(cv.bai_ghep_id))
    if getattr(cv, "lsx_id", None):
        return ("lsx", int(cv.lsx_id))
    return None


def _buoc_chung_dau(db: Session, bg_id: int) -> BaiGhepCongDoan | None:
    """Bước chung đầu tiên của bài (bỏ bước cắt tổ Cắt chèn) — mốc neo giấy của bài."""
    return db.scalars(
        select(BaiGhepCongDoan)
        .where(BaiGhepCongDoan.bai_ghep_id == bg_id, BaiGhepCongDoan.chen_boi_to_cat.is_(False))
        .order_by(BaiGhepCongDoan.thu_tu, BaiGhepCongDoan.id)
        .limit(1)
    ).first()


def _buoc_giay_lenh(db: Session, lsx_id: int) -> LsxCongDoan | None:
    """Bước đầu tiên (theo `thu_tu`) của lệnh có dòng giấy."""
    return db.scalars(
        select(LsxCongDoan)
        .join(LsxCongDoanVatTu, LsxCongDoanVatTu.lsx_cong_doan_id == LsxCongDoan.id)
        .where(LsxCongDoan.lsx_id == lsx_id, LsxCongDoanVatTu.hang_loai == "giay")
        .order_by(LsxCongDoan.thu_tu, LsxCongDoan.id)
        .limit(1)
    ).first()


def la_buoc_mang_giay(db: Session, cv) -> bool:
    """Spec §4.7 — lệnh: bước có dòng `hang_loai='giay'`; bài: bước chung đầu tiên, bài có giấy."""
    if getattr(cv, "bai_ghep_cong_doan_id", None):
        bg = db.get(BaiGhep, cv.bai_ghep_id) if cv.bai_ghep_id else None
        if bg is None or not bg.giay_id:
            return False
        dau = _buoc_chung_dau(db, bg.id)
        return dau is not None and dau.id == cv.bai_ghep_cong_doan_id
    if getattr(cv, "lsx_cong_doan_id", None):
        return db.execute(
            select(LsxCongDoanVatTu.id).where(
                LsxCongDoanVatTu.lsx_cong_doan_id == cv.lsx_cong_doan_id,
                LsxCongDoanVatTu.hang_loai == "giay",
            ).limit(1)
        ).first() is not None
    return False


def _doi_tuong(db: Session, chu_the: tuple[str, int]):
    loai, id_ = chu_the
    return db.get(BaiGhep if loai == "bai" else Lsx, id_)


def da_chot(db: Session, chu_the: tuple[str, int]) -> bool:
    obj = _doi_tuong(db, chu_the)
    return obj is not None and bool(obj.giay_chot_cach)


def ma_chu_the(db: Session, chu_the: tuple[str, int]) -> str:
    obj = _doi_tuong(db, chu_the)
    return getattr(obj, "ma", "") or ""


def ly_do_cho_chot(db: Session, cv) -> str | None:
    """Spec §4.7. None = cổng này không chặn công việc."""
    if not co_to_cat(db) or not la_buoc_mang_giay(db, cv):
        return None
    ct = chu_the_cua(cv)
    if ct is None or da_chot(db, ct):
        return None
    return (f"Chờ tổ Cắt chốt giấy cho {ma_chu_the(db, ct)} — tổ Cắt chèn bước cắt hoặc bấm "
            "\"Không cần cắt\" rồi mới bắt đầu được.")


# --- Danh sách cho bàn tổ Cắt ---------------------------------------------------------------
def _la_to_cat(db: Session, team_id: int) -> bool:
    d = db.get(Department, team_id)
    return bool(d is not None and d.la_to_cat)


def _cong_doan_cua_to(db: Session, team_id: int) -> list[CongDoan]:
    """Công đoạn đang dùng có `team_id` trong danh sách tổ phụ trách (luật mg 0312, không tên cứng)."""
    return list(db.scalars(
        select(CongDoan)
        .join(CongDoanTo, CongDoanTo.cong_doan_id == CongDoan.id)
        .where(CongDoanTo.department_id == team_id, CongDoan.active.is_(True))
        .order_by(CongDoan.ma)
    ))


def _cv_goi_song(db: Session, *, lsx_ids=None, bai_ids=None) -> list[SanXuatCongViec]:
    """Công việc thuộc gói ĐANG phát hành của các lệnh / bài cho trước."""
    dk = []
    if lsx_ids:
        dk.append(SanXuatCongViec.lsx_id.in_(lsx_ids))
    if bai_ids:
        dk.append(SanXuatCongViec.bai_ghep_id.in_(bai_ids))
    if not dk:
        return []
    return list(db.scalars(
        select(SanXuatCongViec)
        .join(SanXuatGoiPhatHanh, SanXuatGoiPhatHanh.id == SanXuatCongViec.goi_id)
        .where(SanXuatGoiPhatHanh.trang_thai == GOI_DANG_PHAT_HANH, or_(*dk))
    ))


def _cv_cua_chu_the(db: Session, chu_the: tuple[str, int]) -> list[SanXuatCongViec]:
    loai, id_ = chu_the
    return _cv_goi_song(db, lsx_ids=[id_] if loai == "lsx" else None,
                        bai_ids=[id_] if loai == "bai" else None)


def _cv_mang_giay(db: Session, chu_the: tuple[str, int]) -> list[SanXuatCongViec]:
    return [cv for cv in _cv_cua_chu_the(db, chu_the) if la_buoc_mang_giay(db, cv)]


def _cv_chen(db: Session, chu_the: tuple[str, int]) -> list[SanXuatCongViec]:
    """Công việc của các bước tổ Cắt đã chèn cho lệnh / bài này."""
    loai, id_ = chu_the
    if loai == "lsx":
        ids = set(db.scalars(select(LsxCongDoan.id).where(
            LsxCongDoan.lsx_id == id_, LsxCongDoan.chen_boi_to_cat.is_(True))))
        return [cv for cv in _cv_cua_chu_the(db, chu_the) if cv.lsx_cong_doan_id in ids]
    ids = set(db.scalars(select(BaiGhepCongDoan.id).where(
        BaiGhepCongDoan.bai_ghep_id == id_, BaiGhepCongDoan.chen_boi_to_cat.is_(True))))
    return [cv for cv in _cv_cua_chu_the(db, chu_the) if cv.bai_ghep_cong_doan_id in ids]


def _da_bat_dau(db: Session, cvs: list[SanXuatCongViec]) -> set[int]:
    ids = {cv.id for cv in cvs}
    da = SanXuatThucThiRepository(db).cong_viec_co_phien(ids)
    return da | {cv.id for cv in cvs if cv.trang_thai != CV_PHAT_HANH}


def _co_phat_sinh(db: Session, cv_ids: set[int]) -> bool:
    """Bước chèn đã có sổ sách (mẻ, bàn giao, KCS, đề nghị vật tư) ⇒ không xoá được."""
    if not cv_ids:
        return False
    for cot in (SanXuatBatch.cong_viec_id, SanXuatBanGiao.nguon_cong_viec_id,
                SanXuatBanGiao.dich_cong_viec_id, SanXuatKcsBatch.cong_viec_id,
                SanXuatVatTuDeNghi.cong_viec_id):
        if db.execute(select(cot).where(cot.in_(cv_ids)).limit(1)).first() is not None:
            return True
    return False


def _sua_duoc(db: Session, chu_the: tuple[str, int]) -> bool:
    """Gỡ chốt được khi bước mang giấy CHƯA bắt đầu và không bước chèn nào đã bắt đầu / có mẻ."""
    if _da_bat_dau(db, _cv_mang_giay(db, chu_the)):
        return False
    chen = _cv_chen(db, chu_the)
    return not _da_bat_dau(db, chen) and not _co_phat_sinh(db, {c.id for c in chen})


def _giay_lenh(db: Session, lsx_id: int) -> list[dict]:
    rows = db.execute(
        select(LsxCongDoanVatTu)
        .join(LsxCongDoan, LsxCongDoan.id == LsxCongDoanVatTu.lsx_cong_doan_id)
        .where(LsxCongDoan.lsx_id == lsx_id, LsxCongDoanVatTu.hang_loai == "giay")
        .order_by(LsxCongDoan.thu_tu, LsxCongDoanVatTu.thu_tu)
    ).scalars().all()
    return [{
        "giay_id": int(v.vat_tu_id), "ma": v.vat_tu_ma_snapshot, "ten": v.vat_tu_ten_snapshot,
        "kho_rong": int(v.kho_rong or 0), "kho_dai": int(v.kho_dai or 0),
        "so_to": float(v.so_luong or 0), "don_vi": v.don_vi_snapshot,
    } for v in rows]


def _giay_bai(db: Session, bg: BaiGhep) -> list[dict]:
    """Giấy của bài — DẪN XUẤT (spec §4.2) bằng đúng engine Kế hoạch vật tư dùng."""
    if not bg.giay_id:
        return []
    from ...repositories.bai_ghep_repo import BaiGhepRepository
    from ..bai_ghep_service import BaiGhepService
    from ..bien_cong_thuc import quy_cach_bien_bai
    from ..kho_giay import don_vi_goc_to, goi_y_dong_giay

    lsx_map = {tv.lsx_id: db.get(Lsx, tv.lsx_id) for tv in bg.thanh_viens}
    lsx_map = {k: v for k, v in lsx_map.items() if v is not None}
    svc = BaiGhepService(db, BaiGhepRepository(db), AuditLogRepository(db), None)
    so_to = svc.tinh_so_to(bg, lsx_map)
    gy = goi_y_dong_giay(quy_cach_bien_bai(bg, thanh_vien=lsx_map.values(), so_to=so_to))
    g = db.get(GiayNguyen, bg.giay_id)
    return [{
        "giay_id": int(bg.giay_id), "ma": getattr(g, "ma", ""), "ten": getattr(g, "ten", ""),
        "kho_rong": int(gy.get("kho_rong") or 0), "kho_dai": int(gy.get("kho_dai") or 0),
        "so_to": float(gy.get("so_luong") or so_to.get("to_nguyen_can") or 0),
        "don_vi": don_vi_goc_to(),
    }]


def _them_ton(db: Session, giay: list[dict]) -> tuple[list[dict], list[dict]]:
    """Gắn tồn tờ ĐÚNG khổ cho từng dòng + liệt kê lô cuộn cùng mã (khổ rộng, số còn, kho)."""
    lots = StockLotRepository(db)
    khoa = [khoa_ton("giay", d["giay_id"], dang=DANG_TO, kho_rong=d["kho_rong"],
                     kho_dai=d["kho_dai"]) for d in giay]
    ton = lots.on_hand_map([k for k in khoa if k[2] and k[3]])
    for d, k in zip(giay, khoa):
        d["nhan_kho"] = nhan_kho(d["kho_rong"], d["kho_dai"])
        d["ton_to_dung_kho"] = float(ton.get(k, 0.0)) if k[2] and k[3] else None
    cuon: list[dict] = []
    kho_ten: dict[int, str] = {}
    for gid in dict.fromkeys(d["giay_id"] for d in giay):
        g = db.get(GiayNguyen, gid)
        for lo in lots.list_lots(hang=("giay", gid), dang=DANG_CUON):
            if lo.kho_id not in kho_ten:
                k = db.get(KhoHang, lo.kho_id)
                kho_ten[lo.kho_id] = getattr(k, "ten", "") or ""
            cuon.append({
                "ma_lo": lo.ma_lo, "giay_ma": getattr(g, "ma", ""),
                "kho_rong": int(lo.kho_rong or 0), "sl_con_lai": float(lo.sl_con_lai or 0),
                "don_vi": getattr(g, "don_vi_gia", None), "kho_ten": kho_ten[lo.kho_id],
            })
    return giay, cuon


def _han_cua(obj) -> str | None:
    h = getattr(obj, "han_hoan_thanh_sx", None)
    return h.isoformat() if h else None


def _dong(db: Session, chu_the: tuple[str, int], cong_doan: list[CongDoan]) -> dict | None:
    obj = _doi_tuong(db, chu_the)
    if obj is None:
        return None
    giay = _giay_lenh(db, obj.id) if chu_the[0] == "lsx" else _giay_bai(db, obj)
    giay, cuon = _them_ton(db, giay)
    chot = None
    if obj.giay_chot_cach:
        u = db.get(User, obj.giay_chot_boi_id) if obj.giay_chot_boi_id else None
        chot = {
            "cach": obj.giay_chot_cach,
            "luc": obj.giay_chot_luc,
            "boi_ten": getattr(u, "name", None) or getattr(u, "username", None),
            "cong_doan": [c.ten_cong_doan for c in _cv_chen(db, chu_the)],
        }
    return {
        "chu_the": chu_the[0], "id": obj.id, "ma": obj.ma, "ten": obj.ten or "",
        "han": _han_cua(obj), "giay": giay, "cuon_cung_ma": cuon, "chot": chot,
        "sua_duoc": _sua_duoc(db, chu_the),
        "cong_doan_chen_duoc": [{"id": c.id, "ma": c.ma, "ten": c.ten_hien_thi or c.ten}
                                for c in cong_doan],
    }


def chu_the_cho_to_cat(db: Session, *, lsx_ids=None, bai_ids=None) -> list[tuple[str, int]]:
    """Lệnh / bài thuộc gói đang phát hành có bước mang giấy — kể cả đã chốt (bàn hiện nhãn chốt)
    cho tới khi bước mang giấy hoàn thành. Không lọc thì quét mọi gói đang chạy."""
    if lsx_ids is None and bai_ids is None:
        q = (select(SanXuatCongViec)
             .join(SanXuatGoiPhatHanh, SanXuatGoiPhatHanh.id == SanXuatCongViec.goi_id)
             .where(SanXuatGoiPhatHanh.trang_thai == GOI_DANG_PHAT_HANH,
                    SanXuatCongViec.trang_thai != CV_HOAN_THANH))
        q_lenh = q.join(LsxCongDoanVatTu,
                        LsxCongDoanVatTu.lsx_cong_doan_id == SanXuatCongViec.lsx_cong_doan_id
                        ).where(LsxCongDoanVatTu.hang_loai == "giay")
        q_bai = q.join(BaiGhep, BaiGhep.id == SanXuatCongViec.bai_ghep_id).where(
            BaiGhep.giay_id.is_not(None), SanXuatCongViec.bai_ghep_cong_doan_id.is_not(None))
        cvs = list(db.scalars(q_lenh)) + list(db.scalars(q_bai))
    else:
        cvs = [cv for cv in _cv_goi_song(db, lsx_ids=lsx_ids, bai_ids=bai_ids)
               if cv.trang_thai != CV_HOAN_THANH]
    ra: dict[tuple[str, int], None] = {}
    for cv in cvs:
        if la_buoc_mang_giay(db, cv):
            ct = chu_the_cua(cv)
            if ct is not None:
                ra[ct] = None
    return list(ra)


def danh_sach(db: Session, *, team_id: int) -> list[dict]:
    """Khối "Chờ chốt giấy" trên bàn tổ Cắt: chưa chốt nằm trên, rồi theo hạn."""
    if not _la_to_cat(db, team_id):
        return []
    cong_doan = _cong_doan_cua_to(db, team_id)
    ds = [d for ct in chu_the_cho_to_cat(db) if (d := _dong(db, ct, cong_doan)) is not None]
    ds.sort(key=lambda d: (d["chot"] is not None, d["han"] or "9999", d["ma"]))
    return ds


# --- Ghi ---------------------------------------------------------------------------------
def _kiem_to(db: Session, user, team_id: int) -> None:
    if not _la_to_cat(db, team_id):
        raise ChotGiayLoi("Tổ này không phải tổ Cắt.")
    gate_to(db, getattr(user, "id", None), team_id, VIEC_THUC_HIEN)


def _chu_the_tu(lsx_id: int | None, bai_ghep_id: int | None) -> tuple[str, int]:
    if bool(lsx_id) == bool(bai_ghep_id):
        raise ChotGiayLoi("Chọn đúng một lệnh hoặc một bài ghép.")
    return ("lsx", int(lsx_id)) if lsx_id else ("bai", int(bai_ghep_id))


def _goi_va_cv(db: Session, chu_the: tuple[str, int]):
    cvs = _cv_cua_chu_the(db, chu_the)
    if not cvs:
        raise ChotGiayLoi("Lệnh chưa phát hành xuống xưởng.")
    goi = db.get(SanXuatGoiPhatHanh, cvs[0].goi_id)
    return goi, cvs


def _buoc_lenh_moi(lsx_id: int, cd: CongDoan, team_id: int, thu_tu: int) -> LsxCongDoan:
    return LsxCongDoan(
        lsx_id=lsx_id, thu_tu=thu_tu, cong_doan_id=cd.id, ten=cd.ten_hien_thi or cd.ten,
        nhom=cd.nhom, department_id=team_id,
        loai_buoc=LB_MAY if cd.may_lam_duoc else LB_TO,
        don_vi_vao=cd.don_vi_vao, don_vi_ra=cd.don_vi_ra,
        so_luong_vao=0, so_luong_ra=0, chen_boi_to_cat=True,
    )


def _chen_vao_lenh(db: Session, lsx_id: int, cds: list[CongDoan], team_id: int,
                   dich: LsxCongDoan) -> list[LsxCongDoan]:
    """Dời mọi bước của lệnh `+n`, thêm n bước cắt ở đầu, nối Cắt₁→…→Cắtₙ→`dich`."""
    n = len(cds)
    for b in db.scalars(select(LsxCongDoan).where(LsxCongDoan.lsx_id == lsx_id)):
        b.thu_tu = (b.thu_tu or 0) + n
    moi = [_buoc_lenh_moi(lsx_id, cd, team_id, i) for i, cd in enumerate(cds)]
    db.add_all(moi)
    db.flush()
    for a, b in zip(moi, moi[1:] + [dich]):
        db.add(LsxCongDoanPhuThuoc(buoc_truoc_id=a.id, buoc_sau_id=b.id))
    db.flush()
    return moi


def _nhom_cua(cvs: list[SanXuatCongViec], lsx_id: int | None = None) -> int | None:
    ids = {cv.nhom_id for cv in cvs if (lsx_id is None or cv.lsx_id == lsx_id)}
    return next(iter(ids)) if len(ids) == 1 else None


def chot(db: Session, *, user, team_id: int, lsx_id: int | None, bai_ghep_id: int | None,
         cach: str, cong_doan_ids: list[int]) -> dict:
    """Ghi chốt giấy (KHÔNG commit — router chủ giao dịch)."""
    _kiem_to(db, user, team_id)
    ct = _chu_the_tu(lsx_id, bai_ghep_id)
    obj = _doi_tuong(db, ct)
    if obj is None:
        raise ChotGiayLoi("Không tìm thấy lệnh / bài ghép.")
    if obj.giay_chot_cach:
        raise ChotGiayLoi("Đã chốt — gỡ chốt trước khi chốt lại.")
    if cach not in NHAN_CHOT:
        raise ChotGiayLoi("Cách chốt không hợp lệ.")
    goi, cvs = _goi_va_cv(db, ct)
    if not any(la_buoc_mang_giay(db, cv) for cv in cvs):
        raise ChotGiayLoi(f"{obj.ma} không có bước mang giấy.")

    ten_chen: list[str] = []
    cv_moi: list[SanXuatCongViec] = []
    if cach == CHOT_CAT:
        ids = list(dict.fromkeys(int(i) for i in cong_doan_ids))
        if not ids:
            raise ChotGiayLoi("Chọn ít nhất một công đoạn cắt.")
        cd_map = {c.id: c for c in _cong_doan_cua_to(db, team_id)}
        for i in ids:
            if i not in cd_map:
                c = db.get(CongDoan, i)
                raise ChotGiayLoi(f"Công đoạn {getattr(c, 'ten', i)} không thuộc tổ này.")
        cds = [cd_map[i] for i in ids]
        ten_chen = [c.ten_hien_thi or c.ten for c in cds]
        repo = SanXuatRepository(db)
        so, tram = _SoPhatHanh(db), ban_do_tram(db)
        tieu_chi = repo.checklist_theo_cong_doan(set(ids))
        pb = goi.version_hien_tai
        if ct[0] == "lsx":
            dich = _buoc_giay_lenh(db, obj.id)
            moi = _chen_vao_lenh(db, obj.id, cds, team_id, dich)
            for b in moi:
                cv_moi += cong_viec_buoc_lsx(
                    repo, so=so, tram=tram, goi_id=goi.id, phien_ban_so=pb, lsx_id=obj.id,
                    cd=b, nhom_id=_nhom_cua(cvs, obj.id), tieu_chi_theo_cd=tieu_chi)
        else:
            dau = _buoc_chung_dau(db, obj.id)
            phu = {m.lsx_id: m.lsx_step_key for m in db.scalars(
                select(BaiGhepCongDoanMap).where(
                    BaiGhepCongDoanMap.bai_ghep_cong_doan_id == dau.id))}
            n = len(cds)
            for b in db.scalars(select(BaiGhepCongDoan).where(BaiGhepCongDoan.bai_ghep_id == obj.id)):
                b.thu_tu = (b.thu_tu or 0) + n
            chung = [BaiGhepCongDoan(
                bai_ghep_id=obj.id, thu_tu=i, cong_doan_id=cd.id, ten=cd.ten_hien_thi or cd.ten,
                nhom=cd.nhom, loai_buoc=LB_MAY if cd.may_lam_duoc else LB_TO,
                department_id=team_id, don_vi_vao=cd.don_vi_vao, don_vi_ra=cd.don_vi_ra,
                so_luong_vao=0, so_luong_ra=0, chen_boi_to_cat=True,
            ) for i, cd in enumerate(cds)]
            db.add_all(chung)
            db.flush()
            for tv in db.scalars(select(BaiGhepThanhVien).where(
                    BaiGhepThanhVien.bai_ghep_id == obj.id)):
                key = phu.get(tv.lsx_id)
                dich = db.scalars(select(LsxCongDoan).where(LsxCongDoan.step_key == key)).first() \
                    if key else None
                if dich is None:
                    continue
                moi = _chen_vao_lenh(db, tv.lsx_id, cds, team_id, dich)
                for bc, b in zip(chung, moi):
                    db.add(BaiGhepCongDoanMap(bai_ghep_cong_doan_id=bc.id, lsx_id=tv.lsx_id,
                                              lsx_step_key=b.step_key))
            db.flush()
            for bc in chung:
                cv_moi += cong_viec_buoc_bai(
                    repo, so=so, tram=tram, goi_id=goi.id, phien_ban_so=pb, bg_id=obj.id,
                    cd=bc, nhom_id=_nhom_cua(cvs), tieu_chi_theo_cd=tieu_chi)

    obj.giay_chot_cach = cach
    obj.giay_chot_luc = datetime.now(timezone.utc)
    obj.giay_chot_boi_id = getattr(user, "id", None)
    db.flush()
    chi_tiet = f"{obj.ma}: {NHAN_CHOT[cach]}"
    if ten_chen:
        chi_tiet += " — " + ", ".join(ten_chen)
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None), action="san_xuat.chot_giay",
        target=f"{'lsx' if ct[0] == 'lsx' else 'bai_ghep'}:{obj.id}", detail=chi_tiet,
        commit=False)
    return {
        "chu_the": ct[0], "id": obj.id, "ma": obj.ma, "cach": cach,
        "to_mang_giay": sorted({cv.department_id for cv in cvs
                                if cv.department_id and la_buoc_mang_giay(db, cv)}),
        "cong_viec_moi": [cv.id for cv in cv_moi],
    }


def go_chot(db: Session, *, user, team_id: int, lsx_id: int | None,
            bai_ghep_id: int | None) -> dict:
    """Gỡ chốt (KHÔNG commit): xoá bước chèn + công việc của chúng, trả `thu_tu` liền mạch."""
    _kiem_to(db, user, team_id)
    ct = _chu_the_tu(lsx_id, bai_ghep_id)
    obj = _doi_tuong(db, ct)
    if obj is None:
        raise ChotGiayLoi("Không tìm thấy lệnh / bài ghép.")
    if not obj.giay_chot_cach:
        raise ChotGiayLoi("Chưa chốt.")
    chen = _cv_chen(db, ct)
    chen_ids = {c.id for c in chen}
    if _co_phat_sinh(db, chen_ids):
        raise ChotGiayLoi("Bước cắt đã ghi sản lượng — không gỡ được.")
    if _da_bat_dau(db, chen):
        raise ChotGiayLoi("Bước cắt đã bắt đầu — không gỡ được.")
    if _da_bat_dau(db, _cv_mang_giay(db, ct)):
        raise ChotGiayLoi("Bước mang giấy đã bắt đầu — không gỡ được.")
    cvs = _cv_cua_chu_the(db, ct)
    to_mang_giay = sorted({cv.department_id for cv in cvs
                           if cv.department_id and la_buoc_mang_giay(db, cv)})
    cach_cu = obj.giay_chot_cach

    if chen_ids:
        for cot in (SanXuatPhanCong.cong_viec_id, SanXuatHoTro.cong_viec_id,
                    SanXuatCongViecLichSu.cong_viec_id):
            db.execute(delete(cot.class_).where(cot.in_(chen_ids)))
        db.execute(delete(SanXuatPhuThuoc).where(or_(
            SanXuatPhuThuoc.nguon_cong_viec_id.in_(chen_ids),
            SanXuatPhuThuoc.dich_cong_viec_id.in_(chen_ids))))
        db.execute(delete(SanXuatCongViec).where(SanXuatCongViec.id.in_(chen_ids)))

    lsx_ids = [obj.id] if ct[0] == "lsx" else [tv.lsx_id for tv in obj.thanh_viens]
    if ct[0] == "bai":
        bc_ids = list(db.scalars(select(BaiGhepCongDoan.id).where(
            BaiGhepCongDoan.bai_ghep_id == obj.id, BaiGhepCongDoan.chen_boi_to_cat.is_(True))))
        if bc_ids:
            db.execute(delete(BaiGhepCongDoanMap).where(
                BaiGhepCongDoanMap.bai_ghep_cong_doan_id.in_(bc_ids)))
            db.execute(delete(BaiGhepCongDoan).where(BaiGhepCongDoan.id.in_(bc_ids)))
            _lui_thu_tu(db.scalars(select(BaiGhepCongDoan).where(
                BaiGhepCongDoan.bai_ghep_id == obj.id)), len(bc_ids))
    buoc_chen = list(db.execute(select(LsxCongDoan.id, LsxCongDoan.lsx_id).where(
        LsxCongDoan.lsx_id.in_(lsx_ids), LsxCongDoan.chen_boi_to_cat.is_(True))))
    if buoc_chen:
        ids = [bid for bid, _ in buoc_chen]
        db.execute(delete(LsxCongDoanPhuThuoc).where(or_(
            LsxCongDoanPhuThuoc.buoc_truoc_id.in_(ids),
            LsxCongDoanPhuThuoc.buoc_sau_id.in_(ids))))
        db.execute(delete(LsxCongDoan).where(LsxCongDoan.id.in_(ids)))
        for lid in lsx_ids:
            n = sum(1 for _, cua in buoc_chen if cua == lid)
            if n:
                _lui_thu_tu(db.scalars(select(LsxCongDoan).where(LsxCongDoan.lsx_id == lid)), n)
    db.flush()
    db.expire_all()
    obj = _doi_tuong(db, ct)
    obj.giay_chot_cach = None
    obj.giay_chot_luc = None
    obj.giay_chot_boi_id = None
    db.flush()
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None), action="san_xuat.go_chot_giay",
        target=f"{'lsx' if ct[0] == 'lsx' else 'bai_ghep'}:{obj.id}",
        detail=f"{obj.ma}: gỡ chốt ({NHAN_CHOT.get(cach_cu, cach_cu)})", commit=False)
    return {"chu_the": ct[0], "id": obj.id, "ma": obj.ma, "to_mang_giay": to_mang_giay}


def _lui_thu_tu(buocs, n: int) -> None:
    """Trả `thu_tu` về đúng số cũ: lúc chèn mọi bước đã bị dời `+n`."""
    for b in list(buocs):
        b.thu_tu = max(0, (b.thu_tu or 0) - n)


def to_cat_can_bao(db: Session, lsx_id: int) -> list[int]:
    """Tổ Cắt cần chấm đỏ sau khi phát hành lệnh `lsx_id`: lệnh (hoặc bài chứa nó) có bước mang
    giấy chưa chốt. Không tổ Cắt nào ⇒ rỗng."""
    to_cat = sorted(DepartmentRepository(db).dept_ids_to_cat())
    if not to_cat:
        return []
    bai = SanXuatRepository(db).bai_ghep_ids_cua_lsx({lsx_id})
    for ct in chu_the_cho_to_cat(db, lsx_ids=[lsx_id], bai_ids=list(bai) or None):
        if not da_chot(db, ct):
            return to_cat
    return []


__all__ = [
    "CHOT_CAT", "CHOT_KHONG_CAT", "ChotGiayLoi", "chot", "chu_the_cua", "co_to_cat", "da_chot",
    "danh_sach", "go_chot", "la_buoc_mang_giay", "ly_do_cho_chot", "ma_chu_the", "to_cat_can_bao",
]
