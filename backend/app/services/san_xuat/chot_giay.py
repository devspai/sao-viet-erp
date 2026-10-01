"""Tổ Cắt CHỐT GIẤY sau phát hành (spec `2026-10-01-dong-giay-theo-dau-vao-buoc-design.md` §2–3).

Lệnh / bài ghép có giấy, sau khi phát hành, tới bàn của tổ mang cờ `departments.la_to_cat`, khối
"Chờ chốt giấy". Tổ Cắt CHỈ thấy và chỉ sửa các bước trong PHẠM VI (§2): công đoạn Giai đoạn
"Trước In" (`cong_doan.nhom == "prepress"`) mà tổ phụ trách mang cờ Tổ Cắt — xét từ danh mục, không
theo tên. Cắt thành phẩm (tổ Cắt, giai đoạn sau in) chạy như mọi bước thường, không hiện ở đây.

  · THÊM công đoạn: chèn NGAY TRƯỚC bước "In" (bước mang giấy đầu tiên ngoài phạm vi), nối
    Cắt₁ → … → Cắtₙ → In SONG SONG với chặng trước cũ của In (Ghi kẽm vẫn vào In, Cắt₁ không chờ
    ai); In đã có bước cắt thì nối SAU bước cắt cuối (Cắt cũ → Mới → In). Bước mới mang dòng giấy
    cùng mã với In,
    số/khổ do chuỗi ngược dẫn xuất (`LsxService._ap_chuoi_nguoc`). Công việc dựng bằng đúng hàm dựng
    một bước của phát hành (`snapshot.cong_viec_buoc_*`), cùng gói đang chạy.
  · XOÁ công đoạn: MỌI bước trong phạm vi (kể cả người lập lệnh đặt sẵn) khi bước đó và In chưa bắt
    đầu; nối lại cạnh trước ↔ sau. Xoá hết ⇒ chốt "không cắt".
  · KHÔNG CẮT: chỉ khi chưa có bước nào trong phạm vi; In mở ngay.

Lệnh cấu hình sẵn bước cắt trước In: không khoá gì (bước cắt đã là bước lấy giấy), vẫn hiện ở khối
dạng đã xác nhận (`cau_hinh_san`). Bài ghép theo cùng luật trên bước CHUNG: mỗi lệnh thành viên nhận
bước riêng, một bước chung phủ chúng ⇒ một công việc cho cả bài.

Cổng "chờ tổ Cắt" đọc `ly_do_cho_chot`. Không tổ nào bật cờ ⇒ không có cổng, mọi thứ chạy như
trước. Không trả tiền ở đây (nguyên tắc tiền chỉ người có quyền xem).
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
from ...models.lsx import (
    DV_TO,
    DV_TO_NGUYEN,
    LB_MAY,
    LB_TO,
    Lsx,
    LsxCongDoan,
    LsxCongDoanPhuThuoc,
    LsxCongDoanVatTu,
)
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
from ...models.xep_lich import XepLichCongDoan
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
NHAN_CHOT = {CHOT_CAT: "thêm công đoạn cắt", CHOT_KHONG_CAT: "không cắt"}


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


NHOM_TRUOC_IN = "prepress"
NHOM_IN = "print"


def la_buoc_truoc_in_to_cat(db: Session, buoc) -> bool:
    """Spec §2 — bước (`LsxCongDoan` / `BaiGhepCongDoan`) trong phạm vi chốt giấy: Giai đoạn
    "Trước In" theo DANH MỤC công đoạn VÀ tổ của bước mang cờ Tổ Cắt. Bước chưa gán tổ thì hỏi danh
    sách tổ phụ trách của công đoạn."""
    if buoc is None:
        return False
    cd = db.get(CongDoan, buoc.cong_doan_id) if getattr(buoc, "cong_doan_id", None) else None

    def _to_cat(dept_id) -> bool:
        d = db.get(Department, dept_id)
        return bool(d is not None and d.la_to_cat)

    def _cd_co_to_cat(cd_id) -> bool:
        return db.execute(
            select(CongDoanTo.department_id)
            .join(Department, Department.id == CongDoanTo.department_id)
            .where(CongDoanTo.cong_doan_id == cd_id, Department.la_to_cat.is_(True))
            .limit(1)
        ).first() is not None

    return _trong_pham_vi(buoc, cd, _to_cat, _cd_co_to_cat)


def _trong_pham_vi(buoc, cd, to_cat, cd_co_to_cat) -> bool:
    """Luật §2 tách khỏi chỗ đọc DB: `to_cat(dept_id)` / `cd_co_to_cat(cd_id)` do người gọi cấp —
    hỏi từng câu (`la_buoc_truoc_in_to_cat`) hoặc tra tập đã nạp lô (`buoc_lay_giay_bai_lo`)."""
    if (cd.nhom if cd is not None else getattr(buoc, "nhom", None)) != NHOM_TRUOC_IN:
        return False
    if getattr(buoc, "department_id", None):
        return to_cat(buoc.department_id)
    return cd is not None and cd_co_to_cat(cd.id)


def _cac_buoc(db: Session, chu_the: tuple[str, int]) -> list:
    """Mọi bước của lệnh (`LsxCongDoan`) / bước chung của bài (`BaiGhepCongDoan`) theo `thu_tu`."""
    loai, id_ = chu_the
    if loai == "lsx":
        return list(db.scalars(select(LsxCongDoan).where(LsxCongDoan.lsx_id == id_)
                               .order_by(LsxCongDoan.thu_tu, LsxCongDoan.id)))
    return list(db.scalars(select(BaiGhepCongDoan).where(BaiGhepCongDoan.bai_ghep_id == id_)
                           .order_by(BaiGhepCongDoan.thu_tu, BaiGhepCongDoan.id)))


def _buoc_co_giay(db: Session, chu_the: tuple[str, int]) -> list:
    """Bước mang giấy theo `thu_tu` — bước THẬT SỰ nhận giấy.

    Lệnh: bước có dòng `hang_loai='giay'`. Bài (có `giay_id`): bước chung mà bước thành viên nó phủ
    (`bai_ghep_cong_doan_map`) mang dòng giấy; bài chưa có dòng giấy nào ở thành viên thì xét chính
    bước chung — đơn vị vào là chặng tờ (tờ nguyên / tờ in), công đoạn Giai đoạn In, hoặc bước trong
    phạm vi tổ Cắt (§2, kể cả nhận cuộn). Nhờ vậy bước
    chung đứng trước In mà không nhận giấy (vd Ghi kẽm) không bị coi là bước lấy giấy."""
    loai, id_ = chu_the
    if loai == "lsx":
        return list(db.scalars(
            select(LsxCongDoan).where(LsxCongDoan.lsx_id == id_, LsxCongDoan.id.in_(_co_dong_giay()))
            .order_by(LsxCongDoan.thu_tu, LsxCongDoan.id)))
    bg = db.get(BaiGhep, id_)
    if bg is None or not bg.giay_id:
        return []
    buoc = _cac_buoc(db, chu_the)
    co_giay = _buoc_chung_co_giay(db, buoc)
    if co_giay:
        return [b for b in buoc if b.id in co_giay]
    tram = ban_do_tram(db)
    return [b for b in buoc if _nhan_giay_theo_buoc(db, b, tram)]


def _co_dong_giay():
    return select(LsxCongDoanVatTu.lsx_cong_doan_id).where(LsxCongDoanVatTu.hang_loai == "giay")


def _buoc_chung_co_giay(db: Session, buoc: list) -> set[int]:
    """Id các bước chung (của một hay nhiều bài) mà bước thành viên nó phủ mang dòng giấy."""
    if not buoc:
        return set()
    return set(db.scalars(
        select(BaiGhepCongDoanMap.bai_ghep_cong_doan_id)
        .join(LsxCongDoan, LsxCongDoan.step_key == BaiGhepCongDoanMap.lsx_step_key)
        .where(BaiGhepCongDoanMap.bai_ghep_cong_doan_id.in_([b.id for b in buoc]),
               LsxCongDoan.id.in_(_co_dong_giay()))))


def _nhan_giay_theo_buoc(db: Session, buoc, tram: dict) -> bool:
    cd = db.get(CongDoan, buoc.cong_doan_id) if buoc.cong_doan_id else None
    return _nhan_giay(buoc, cd, tram, lambda b: la_buoc_truoc_in_to_cat(db, b))


def _nhan_giay(buoc, cd, tram: dict, trong_pham_vi) -> bool:
    from ...models.don_vi_do import TRAM_TO, TRAM_TO_NGUYEN
    from ..dong_giay import tram_cua

    if buoc.don_vi_vao and tram_cua(buoc.don_vi_vao, tram) in (TRAM_TO, TRAM_TO_NGUYEN):
        return True
    if (cd.nhom if cd is not None else buoc.nhom) == NHOM_IN:
        return True
    # Bước cắt của tổ Cắt (Trước In) nhận giấy dù đầu vào là cuộn (đơn vị không phải chặng tờ).
    return trong_pham_vi(buoc)


def buoc_lay_giay(db: Session, chu_the: tuple[str, int]):
    """Bước LẤY giấy từ kho = bước mang giấy đầu tiên theo `thu_tu` (spec §5)."""
    ds = _buoc_co_giay(db, chu_the)
    return ds[0] if ds else None


def buoc_lay_giay_bai_lo(db: Session, buoc_theo_bai: dict[int, list]) -> dict[int, object]:
    """`buoc_lay_giay` cho NHIỀU bài (đã có giấy) một lượt — CÙNG luật, nạp lô nên số câu truy vấn
    không chạy theo số bài (bảng cân đối Kế hoạch vật tư). `buoc_theo_bai`: bài → bước chung đã nạp."""
    tat_ca = [b for ds in buoc_theo_bai.values() for b in ds]
    co_giay = _buoc_chung_co_giay(db, tat_ca)
    can_xet = [b for ds in buoc_theo_bai.values() if not any(x.id in co_giay for x in ds)
               for b in ds]
    tram: dict = {}
    cd_map: dict = {}
    dept_cat: set = set()
    cd_cat: set = set()
    if can_xet:
        tram = ban_do_tram(db)
        cd_ids = {b.cong_doan_id for b in can_xet if b.cong_doan_id}
        if cd_ids:
            cd_map = {c.id: c for c in db.scalars(select(CongDoan).where(CongDoan.id.in_(cd_ids)))}
        dept_cat = set(db.scalars(select(Department.id).where(Department.la_to_cat.is_(True))))
        if cd_ids and dept_cat:
            cd_cat = set(db.scalars(select(CongDoanTo.cong_doan_id).where(
                CongDoanTo.cong_doan_id.in_(cd_ids), CongDoanTo.department_id.in_(dept_cat))))

    def _pham_vi(b) -> bool:
        return _trong_pham_vi(b, cd_map.get(b.cong_doan_id), lambda d: d in dept_cat,
                              lambda c: c in cd_cat)

    kq: dict[int, object] = {}
    for bai_id, ds in buoc_theo_bai.items():
        ds = sorted(ds, key=lambda b: (b.thu_tu or 0, b.id))
        mang = [b for b in ds if b.id in co_giay] or [
            b for b in ds if _nhan_giay(b, cd_map.get(b.cong_doan_id), tram, _pham_vi)]
        kq[bai_id] = mang[0] if mang else None
    return kq


def _buoc_in(db: Session, chu_the: tuple[str, int]):
    """Bước "In" (§2) = bước mang giấy đầu tiên KHÔNG thuộc phạm vi — mốc chèn và mốc cổng chờ."""
    return next((b for b in _buoc_co_giay(db, chu_the) if not la_buoc_truoc_in_to_cat(db, b)), None)


def buoc_truoc_in(db: Session, chu_the: tuple[str, int]) -> list:
    """Các bước trong phạm vi (§2) của lệnh / bài, theo `thu_tu`."""
    return [b for b in _cac_buoc(db, chu_the) if la_buoc_truoc_in_to_cat(db, b)]


def _id_buoc_cv(cv) -> int | None:
    return cv.bai_ghep_cong_doan_id if getattr(cv, "bai_ghep_cong_doan_id", None) \
        else getattr(cv, "lsx_cong_doan_id", None)


def la_buoc_mang_giay(db: Session, cv) -> bool:
    """Lệnh: bước có dòng `hang_loai='giay'`; bài: bước "In" của bài (bước chung mang giấy đầu tiên
    ngoài phạm vi), bài có giấy."""
    if getattr(cv, "bai_ghep_cong_doan_id", None):
        if not cv.bai_ghep_id:
            return False
        in_ = _buoc_in(db, ("bai", int(cv.bai_ghep_id)))
        return in_ is not None and in_.id == cv.bai_ghep_cong_doan_id
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


def _co_cat_truoc_in(db: Session, chu_the: tuple[str, int]) -> bool:
    """Tuyến đã có bước trong phạm vi (§2) đứng trước bước In (theo `thu_tu`) — lệnh cấu hình sẵn
    bước cắt (§3.2). Dù bước cắt ấy chưa mang dòng giấy (dữ liệu trước khi `LsxService` chép mã giấy
    sang bước cắt), cổng chờ cũng không khoá: tổ Cắt không có cách xác nhận nào khác ngoài xoá bước."""
    in_ = _buoc_in(db, chu_the)
    if in_ is None:
        return False
    moc = (in_.thu_tu or 0, in_.id)
    return any((b.thu_tu or 0, b.id) < moc for b in buoc_truoc_in(db, chu_the))


def can_chot(db: Session, chu_the: tuple[str, int]) -> bool:
    """Còn chờ tổ Cắt xác nhận: chưa chốt VÀ bước lấy giấy không thuộc phạm vi (§3.1) VÀ chưa có
    bước cắt đặt sẵn trước In. Lệnh cấu hình sẵn bước cắt trước In (§3.2) ⇒ không chờ gì."""
    obj = _doi_tuong(db, chu_the)
    if obj is None or obj.giay_chot_cach:
        return False
    lay = buoc_lay_giay(db, chu_the)
    return (lay is not None and not la_buoc_truoc_in_to_cat(db, lay)
            and not _co_cat_truoc_in(db, chu_the))


def ly_do_cho_chot(db: Session, cv) -> str | None:
    """Spec §3.1. None = cổng này không chặn công việc. Chỉ khoá ĐÚNG bước lấy giấy (In) khi chủ thể
    còn chờ tổ Cắt xác nhận."""
    # Bàn tổ gọi hàm này cho MỌI công việc ⇒ loại rẻ trước: không tổ Cắt / không phải bước lấy giấy.
    if not co_to_cat(db):
        return None
    ct = chu_the_cua(cv)
    buoc_id = _id_buoc_cv(cv)
    if ct is None or buoc_id is None:
        return None
    lay = buoc_lay_giay(db, ct)
    if lay is None or buoc_id != lay.id:
        return None
    obj = _doi_tuong(db, ct)
    if obj is None or obj.giay_chot_cach or la_buoc_truoc_in_to_cat(db, lay):
        return None
    if _co_cat_truoc_in(db, ct):
        return None
    return (f"Chờ tổ Cắt chốt giấy cho {ma_chu_the(db, ct)} — tổ Cắt thêm công đoạn cắt hoặc bấm "
            "\"Không cần cắt\" rồi mới bắt đầu được.")


# --- Danh sách cho bàn tổ Cắt ---------------------------------------------------------------
def _la_to_cat(db: Session, team_id: int) -> bool:
    d = db.get(Department, team_id)
    return bool(d is not None and d.la_to_cat)


def _cong_doan_cua_to(db: Session, team_id: int) -> list[CongDoan]:
    """Công đoạn tổ Cắt THÊM được (§2): đang dùng, Giai đoạn "Trước In", có `team_id` trong danh
    sách tổ phụ trách (luật mg 0312, không tên cứng)."""
    return list(db.scalars(
        select(CongDoan)
        .join(CongDoanTo, CongDoanTo.cong_doan_id == CongDoan.id)
        .where(CongDoanTo.department_id == team_id, CongDoan.active.is_(True),
               CongDoan.nhom == NHOM_TRUOC_IN)
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


def _cv_cua_buoc(cvs: list[SanXuatCongViec], buoc_id: int | None) -> list[SanXuatCongViec]:
    return [cv for cv in cvs if buoc_id is not None and _id_buoc_cv(cv) == buoc_id]


def _da_bat_dau(db: Session, cvs: list[SanXuatCongViec]) -> set[int]:
    ids = {cv.id for cv in cvs}
    da = SanXuatThucThiRepository(db).cong_viec_co_phien(ids)
    return da | {cv.id for cv in cvs if cv.trang_thai != CV_PHAT_HANH}


def _co_phat_sinh(db: Session, cv_ids: set[int]) -> bool:
    """Bước đã có sổ sách (mẻ, bàn giao, KCS, đề nghị vật tư) ⇒ không xoá được."""
    if not cv_ids:
        return False
    for cot in (SanXuatBatch.cong_viec_id, SanXuatBanGiao.nguon_cong_viec_id,
                SanXuatBanGiao.dich_cong_viec_id, SanXuatKcsBatch.cong_viec_id,
                SanXuatVatTuDeNghi.cong_viec_id):
        if db.execute(select(cot).where(cot.in_(cv_ids)).limit(1)).first() is not None:
            return True
    return False


def _in_da_bat_dau(db: Session, chu_the: tuple[str, int], cvs: list[SanXuatCongViec]) -> bool:
    in_ = _buoc_in(db, chu_the)
    return in_ is not None and bool(_da_bat_dau(db, _cv_cua_buoc(cvs, in_.id)))


def _ly_do_khong_xoa(db: Session, cvs_buoc: list[SanXuatCongViec], in_da: bool) -> str | None:
    """None = xoá được (§3.3 — bước đó và In chưa bắt đầu, bước chưa có sổ sách)."""
    if _co_phat_sinh(db, {c.id for c in cvs_buoc}):
        return "Bước cắt đã ghi sản lượng — không xoá được."
    if _da_bat_dau(db, cvs_buoc):
        return "Bước cắt đã bắt đầu — không xoá được."
    if in_da:
        return "Bước In đã bắt đầu — không xoá được."
    return None


def _giay_lenh(db: Session, lsx_id: int) -> list[dict]:
    """Dòng giấy của BƯỚC LẤY GIẤY (§5) — có bước cắt thì là tờ nguyên của nó, không lặp dòng tờ in
    của In đứng sau."""
    lay = buoc_lay_giay(db, ("lsx", lsx_id))
    if lay is None:
        return []
    rows = db.execute(
        select(LsxCongDoanVatTu)
        .where(LsxCongDoanVatTu.lsx_cong_doan_id == lay.id, LsxCongDoanVatTu.hang_loai == "giay")
        .order_by(LsxCongDoanVatTu.thu_tu, LsxCongDoanVatTu.id)
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
    cvs = _cv_cua_chu_the(db, chu_the)
    in_da = _in_da_bat_dau(db, chu_the, cvs)
    pham_vi = buoc_truoc_in(db, chu_the)
    buoc_ra = []
    for b in pham_vi:
        cd = db.get(CongDoan, b.cong_doan_id) if b.cong_doan_id else None
        buoc_ra.append({
            "buoc_id": b.id, "cong_doan_id": b.cong_doan_id, "ma": getattr(cd, "ma", "") or "",
            "ten": b.ten or getattr(cd, "ten", "") or "",
            "xoa_duoc": _ly_do_khong_xoa(db, _cv_cua_buoc(cvs, b.id), in_da) is None,
        })
    chot = None
    if obj.giay_chot_cach:
        u = db.get(User, obj.giay_chot_boi_id) if obj.giay_chot_boi_id else None
        chot = {
            "cach": obj.giay_chot_cach,
            "luc": obj.giay_chot_luc,
            "boi_ten": getattr(u, "name", None) or getattr(u, "username", None),
            "cong_doan": [b["ten"] for b in buoc_ra],
        }
    return {
        "chu_the": chu_the[0], "id": obj.id, "ma": obj.ma, "ten": obj.ten or "",
        "han": _han_cua(obj), "giay": giay, "cuon_cung_ma": cuon, "chot": chot,
        # Gỡ chốt "không cắt" / thêm công đoạn được khi In chưa bắt đầu.
        "sua_duoc": not in_da,
        "buoc_truoc_in": buoc_ra,
        # §3.2 — người lập lệnh đặt sẵn bước cắt trước In: coi là ĐÃ xác nhận, không khoá gì.
        # Chỉ báo "đã xác nhận" khi cổng chờ thật sự mở — không thì In bị khoá mà khối lại ẩn
        # nút "Không cần cắt" và không đếm vào badge.
        "cau_hinh_san": obj.giay_chot_cach is None and bool(pham_vi) and not can_chot(db, chu_the),
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
    """Khối "Chờ chốt giấy" trên bàn tổ Cắt: còn chờ xác nhận nằm trên (đã chốt hoặc cấu hình sẵn
    bước cắt nằm dưới), rồi theo hạn."""
    if not _la_to_cat(db, team_id):
        return []
    cong_doan = _cong_doan_cua_to(db, team_id)
    ds = [d for ct in chu_the_cho_to_cat(db) if (d := _dong(db, ct, cong_doan)) is not None]
    ds.sort(key=lambda d: (d["chot"] is not None or d["cau_hinh_san"], d["han"] or "9999",
                           d["ma"]))
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


def _mo(db: Session, user, team_id: int, lsx_id: int | None, bai_ghep_id: int | None):
    _kiem_to(db, user, team_id)
    ct = _chu_the_tu(lsx_id, bai_ghep_id)
    obj = _doi_tuong(db, ct)
    if obj is None:
        raise ChotGiayLoi("Không tìm thấy lệnh / bài ghép.")
    return ct, obj


def _goi_va_cv(db: Session, chu_the: tuple[str, int]):
    cvs = _cv_cua_chu_the(db, chu_the)
    if not cvs:
        raise ChotGiayLoi("Lệnh chưa phát hành xuống xưởng.")
    goi = db.get(SanXuatGoiPhatHanh, cvs[0].goi_id)
    return goi, cvs


def _to_mang_giay(db: Session, cvs: list[SanXuatCongViec]) -> list[int]:
    return sorted({cv.department_id for cv in cvs
                   if cv.department_id and la_buoc_mang_giay(db, cv)})


def _ghi_chot(obj, cach: str | None, user) -> None:
    obj.giay_chot_cach = cach
    obj.giay_chot_luc = datetime.now(timezone.utc) if cach else None
    obj.giay_chot_boi_id = getattr(user, "id", None) if cach else None


def _audit(db: Session, user, ct, obj, action: str, chi_tiet: str) -> None:
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None), action=action,
        target=f"{'lsx' if ct[0] == 'lsx' else 'bai_ghep'}:{obj.id}", detail=chi_tiet,
        commit=False)


def _don_vi_chuoi(cds: list[CongDoan], dv_dich: str | None) -> list[tuple[str, str]]:
    """(vào, ra) cho từng bước cắt thêm. Công đoạn không khai đơn vị trong danh mục thì bước đầu nhận
    tờ nguyên, bước sau nhận đúng cái bước trước ra, và ra theo đơn vị bước In nhận — thiếu
    đơn vị thì tổ Cắt không ghi được mẻ, không bàn giao được."""
    out, truoc = [], DV_TO_NGUYEN
    for cd in cds:
        vao = cd.don_vi_vao or truoc
        ra = cd.don_vi_ra or dv_dich or DV_TO
        out.append((vao, ra))
        truoc = ra
    return out


def _buoc_lenh_moi(lsx_id: int, cd: CongDoan, team_id: int, thu_tu: int,
                   dv: tuple[str, str]) -> LsxCongDoan:
    return LsxCongDoan(
        lsx_id=lsx_id, thu_tu=thu_tu, cong_doan_id=cd.id, ten=cd.ten_hien_thi or cd.ten,
        nhom=cd.nhom, department_id=team_id,
        loai_buoc=LB_MAY if cd.may_lam_duoc else LB_TO,
        don_vi_vao=dv[0], don_vi_ra=dv[1],
        so_luong_vao=0, so_luong_ra=0, chen_boi_to_cat=True,
    )


def _chen_truoc_lenh(db: Session, lsx_id: int, cds: list[CongDoan], team_id: int,
                     dich: LsxCongDoan) -> list[LsxCongDoan]:
    """Chèn n bước NGAY TRƯỚC `dich` (bước In) của lệnh.

    In CHƯA có bước cắt nào đứng liền trước (chặng trước trong phạm vi §2): chuỗi mới chạy SONG SONG
    với chặng trước sẵn có của In (vd Ghi kẽm) — nối Cắt₁→…→Cắtₙ→`dich`, GIỮ mọi chặng trước cũ của
    In, Cắt₁ không có chặng trước. In ĐÃ có bước cắt (đặt sẵn / tổ vừa thêm): chuỗi mới NỐI SAU bước
    cắt cuối cùng — Cắt cũ→Mới₁→…→Mớiₙ→`dich`, gỡ cạnh Cắt cũ→In — đúng thứ tự `thu_tu` mà nhãn
    "Nhận từ" và chuỗi ngược đọc (giấy đi qua lần lượt từng bước cắt).
    Chặng trước NGẦM theo `thu_tu` (bước liền trước In không khai cạnh ra) được ghi thành cạnh
    tường minh trước khi chèn — không thì Cắt₁ đứng liền sau nó sẽ thành bước phải chờ nó, còn In mất
    chặng trước ấy. Bước mới mang dòng giấy cùng MÃ với `dich` (số 0 — chuỗi ngược dẫn xuất ngay sau)."""
    n, moc = len(cds), dich.thu_tu or 0
    tuyen = list(db.scalars(select(LsxCongDoan).where(LsxCongDoan.lsx_id == lsx_id)
                            .order_by(LsxCongDoan.thu_tu, LsxCongDoan.id)))
    i_dich = next((i for i, b in enumerate(tuyen) if b.id == dich.id), 0)
    truoc_dich = set(db.scalars(select(LsxCongDoanPhuThuoc.buoc_truoc_id).where(
        LsxCongDoanPhuThuoc.buoc_sau_id == dich.id)))
    if i_dich > 0:
        lien_truoc = tuyen[i_dich - 1]
        co_canh_ra = db.execute(select(LsxCongDoanPhuThuoc.id).where(
            LsxCongDoanPhuThuoc.buoc_truoc_id == lien_truoc.id).limit(1)).first() is not None
        if not co_canh_ra:
            db.add(LsxCongDoanPhuThuoc(buoc_truoc_id=lien_truoc.id, buoc_sau_id=dich.id))
            truoc_dich.add(lien_truoc.id)
    cat_cu = [b for b in tuyen if b.id in truoc_dich and la_buoc_truoc_in_to_cat(db, b)]
    noi_sau = cat_cu[-1] if cat_cu else None
    for b in tuyen:
        if (b.thu_tu or 0) >= moc:
            b.thu_tu = (b.thu_tu or 0) + n
    dvs = _don_vi_chuoi(cds, dich.don_vi_vao)
    moi = [_buoc_lenh_moi(lsx_id, cd, team_id, moc + i, dv)
           for i, (cd, dv) in enumerate(zip(cds, dvs))]
    db.add_all(moi)
    db.flush()
    for a, b in zip(moi, moi[1:] + [dich]):
        db.add(LsxCongDoanPhuThuoc(buoc_truoc_id=a.id, buoc_sau_id=b.id))
    if noi_sau is not None:
        db.flush()
        for c in db.scalars(select(LsxCongDoanPhuThuoc).where(
                LsxCongDoanPhuThuoc.buoc_truoc_id == noi_sau.id,
                LsxCongDoanPhuThuoc.buoc_sau_id == dich.id)):
            db.delete(c)
        db.add(LsxCongDoanPhuThuoc(buoc_truoc_id=noi_sau.id, buoc_sau_id=moi[0].id))
    giay = {v.vat_tu_id: v for v in db.scalars(select(LsxCongDoanVatTu).where(
        LsxCongDoanVatTu.lsx_cong_doan_id == dich.id, LsxCongDoanVatTu.hang_loai == "giay"))}
    for b in moi:
        for i, v in enumerate(giay.values()):
            b.vat_tus.append(LsxCongDoanVatTu(
                hang_loai="giay", vat_tu_id=v.vat_tu_id, vat_tu_ma_snapshot=v.vat_tu_ma_snapshot,
                vat_tu_ten_snapshot=v.vat_tu_ten_snapshot, don_vi_snapshot=v.don_vi_snapshot,
                so_luong=0, thu_tu=i))
    db.flush()
    return moi


def _chuyen_giay_sang_buoc_nhan(db: Session, buoc: LsxCongDoan, sau: list[int]) -> None:
    """Bước sắp xoá mang dòng giấy mà bước NHẬN đầu ra của nó chưa có mã ấy ⇒ chép MÃ giấy sang
    (số/khổ/dạng do chuỗi ngược dẫn xuất theo đầu vào bước nhận). Không thì xoá bước cắt duy nhất
    mang giấy là lệnh mất giấy — trái §3.2/§5 "xoá bước cắt ⇒ In lại là bước lấy giấy"."""
    giay = list(db.scalars(select(LsxCongDoanVatTu).where(
        LsxCongDoanVatTu.lsx_cong_doan_id == buoc.id, LsxCongDoanVatTu.hang_loai == "giay")
        .order_by(LsxCongDoanVatTu.thu_tu, LsxCongDoanVatTu.id)))
    if not giay:
        return
    nhan_ids = list(sau)
    if not nhan_ids:     # chặng sau NGẦM theo `thu_tu`
        ke = db.scalars(select(LsxCongDoan).where(
            LsxCongDoan.lsx_id == buoc.lsx_id, LsxCongDoan.id != buoc.id,
            LsxCongDoan.thu_tu > (buoc.thu_tu or 0))
            .order_by(LsxCongDoan.thu_tu, LsxCongDoan.id)).first()
        nhan_ids = [ke.id] if ke is not None else []
    for bid in nhan_ids:
        nhan = db.get(LsxCongDoan, bid)
        if nhan is None:
            continue
        co = {int(v.vat_tu_id) for v in nhan.vat_tus if v.hang_loai == "giay"}
        n0 = len(nhan.vat_tus)
        for i, v in enumerate(x for x in giay if int(x.vat_tu_id) not in co):
            nhan.vat_tus.append(LsxCongDoanVatTu(
                hang_loai="giay", vat_tu_id=v.vat_tu_id, vat_tu_ma_snapshot=v.vat_tu_ma_snapshot,
                vat_tu_ten_snapshot=v.vat_tu_ten_snapshot, don_vi_snapshot=v.don_vi_snapshot,
                so_luong=0, thu_tu=n0 + i))


def _go_buoc_lenh(db: Session, buoc: LsxCongDoan) -> None:
    """Xoá một bước của lệnh: nối mọi bước trước ↔ mọi bước sau của nó, trả `thu_tu` liền mạch.
    Mã giấy của bước bị xoá chuyển sang bước nhận đầu ra của nó nếu bước ấy chưa có."""
    truoc = list(db.scalars(select(LsxCongDoanPhuThuoc.buoc_truoc_id).where(
        LsxCongDoanPhuThuoc.buoc_sau_id == buoc.id)))
    sau = list(db.scalars(select(LsxCongDoanPhuThuoc.buoc_sau_id).where(
        LsxCongDoanPhuThuoc.buoc_truoc_id == buoc.id)))
    _chuyen_giay_sang_buoc_nhan(db, buoc, sau)
    db.execute(delete(LsxCongDoanPhuThuoc).where(or_(
        LsxCongDoanPhuThuoc.buoc_truoc_id == buoc.id, LsxCongDoanPhuThuoc.buoc_sau_id == buoc.id)))
    co = {(a, b) for a, b in db.execute(select(
        LsxCongDoanPhuThuoc.buoc_truoc_id, LsxCongDoanPhuThuoc.buoc_sau_id).where(
        LsxCongDoanPhuThuoc.buoc_truoc_id.in_(truoc)))} if truoc else set()
    for a in truoc:
        for b in sau:
            if (a, b) not in co:
                db.add(LsxCongDoanPhuThuoc(buoc_truoc_id=a, buoc_sau_id=b))
    db.execute(delete(XepLichCongDoan).where(XepLichCongDoan.lsx_cong_doan_id == buoc.id))
    lsx_id, moc = buoc.lsx_id, buoc.thu_tu or 0
    db.delete(buoc)
    db.flush()
    for b in db.scalars(select(LsxCongDoan).where(LsxCongDoan.lsx_id == lsx_id)):
        if (b.thu_tu or 0) > moc:
            b.thu_tu = (b.thu_tu or 0) - 1


def _tinh_lai_lenh(db: Session, lsx_id: int,
                   giu_don_vi: dict[int, tuple[str, str]] | None = None) -> None:
    """Chạy lại chuỗi ngược của lệnh ⇒ số lượng mọi bước + dòng giấy dẫn xuất. Bước vừa thêm mà
    danh mục chưa khai đơn vị thì chuỗi ngược để trống đơn vị — giữ lại đơn vị suy ở
    `_don_vi_chuoi` để tổ Cắt vẫn ghi mẻ / bàn giao được."""
    from ...repositories.lsx_repo import LsxRepository
    from ..lsx_service import LsxService

    db.flush()
    lsx = db.get(Lsx, lsx_id)
    db.expire(lsx, ["cong_doans"])
    LsxService(db, LsxRepository(db), None, None)._ap_chuoi_nguoc(lsx)
    for bid, (vao, ra) in (giu_don_vi or {}).items():
        b = db.get(LsxCongDoan, bid)
        if b is not None and not (b.don_vi_vao and b.don_vi_ra):
            b.don_vi_vao, b.don_vi_ra = vao, ra
    db.flush()


def _xoa_cong_viec(db: Session, cv_ids: set[int]) -> None:
    if not cv_ids:
        return
    for cot in (SanXuatPhanCong.cong_viec_id, SanXuatHoTro.cong_viec_id,
                SanXuatCongViecLichSu.cong_viec_id):
        db.execute(delete(cot.class_).where(cot.in_(cv_ids)))
    db.execute(delete(SanXuatPhuThuoc).where(or_(
        SanXuatPhuThuoc.nguon_cong_viec_id.in_(cv_ids),
        SanXuatPhuThuoc.dich_cong_viec_id.in_(cv_ids))))
    db.execute(delete(SanXuatCongViec).where(SanXuatCongViec.id.in_(cv_ids)))


def _nhom_cua(cvs: list[SanXuatCongViec], lsx_id: int | None = None) -> int | None:
    ids = {cv.nhom_id for cv in cvs if (lsx_id is None or cv.lsx_id == lsx_id)}
    return next(iter(ids)) if len(ids) == 1 else None


def _cong_doan_chon(db: Session, team_id: int, cong_doan_ids: list[int]) -> list[CongDoan]:
    ids = list(dict.fromkeys(int(i) for i in cong_doan_ids))
    if not ids:
        raise ChotGiayLoi("Chọn ít nhất một công đoạn cắt.")
    cd_map = {c.id: c for c in _cong_doan_cua_to(db, team_id)}
    for i in ids:
        if i not in cd_map:
            c = db.get(CongDoan, i)
            raise ChotGiayLoi(f"Công đoạn {getattr(c, 'ten', i)} không thuộc tổ này hoặc không ở "
                              "Giai đoạn Trước In.")
    return [cd_map[i] for i in ids]


def them(db: Session, *, user, team_id: int, lsx_id: int | None, bai_ghep_id: int | None,
         cong_doan_ids: list[int]) -> dict:
    """Tổ Cắt THÊM công đoạn Trước In vào ngay trước bước In (§3.3). KHÔNG commit — router chủ giao
    dịch. Đặt chốt "cắt" (lệnh cấu hình sẵn cũng chuyển sang "cắt" từ lúc này)."""
    ct, obj = _mo(db, user, team_id, lsx_id, bai_ghep_id)
    if obj.giay_chot_cach == CHOT_KHONG_CAT:
        raise ChotGiayLoi("Đã chốt không cắt — gỡ chốt trước khi thêm công đoạn.")
    goi, cvs = _goi_va_cv(db, ct)
    in_ = _buoc_in(db, ct)
    if in_ is None:
        raise ChotGiayLoi(f"{obj.ma} không có bước In nhận giấy.")
    if _da_bat_dau(db, _cv_cua_buoc(cvs, in_.id)):
        raise ChotGiayLoi("Bước In đã bắt đầu — không thêm được công đoạn trước In.")
    cds = _cong_doan_chon(db, team_id, cong_doan_ids)
    ten_chen = [c.ten_hien_thi or c.ten for c in cds]
    repo = SanXuatRepository(db)
    so, tram = _SoPhatHanh(db), ban_do_tram(db)
    tieu_chi = repo.checklist_theo_cong_doan({c.id for c in cds})
    pb = goi.version_hien_tai
    cv_moi: list[SanXuatCongViec] = []
    if ct[0] == "lsx":
        moi = _chen_truoc_lenh(db, obj.id, cds, team_id, in_)
        _tinh_lai_lenh(db, obj.id, {b.id: (b.don_vi_vao, b.don_vi_ra) for b in moi})
        for b in moi:
            cv_moi += cong_viec_buoc_lsx(
                repo, so=so, tram=tram, goi_id=goi.id, phien_ban_so=pb, lsx_id=obj.id,
                cd=b, nhom_id=_nhom_cua(cvs, obj.id), tieu_chi_theo_cd=tieu_chi)
    else:
        phu = {m.lsx_id: m.lsx_step_key for m in db.scalars(
            select(BaiGhepCongDoanMap).where(BaiGhepCongDoanMap.bai_ghep_cong_doan_id == in_.id))}
        n, moc = len(cds), in_.thu_tu or 0
        for b in db.scalars(select(BaiGhepCongDoan).where(BaiGhepCongDoan.bai_ghep_id == obj.id)):
            if (b.thu_tu or 0) >= moc:
                b.thu_tu = (b.thu_tu or 0) + n
        chung = [BaiGhepCongDoan(
            bai_ghep_id=obj.id, thu_tu=moc + i, cong_doan_id=cd.id, ten=cd.ten_hien_thi or cd.ten,
            nhom=cd.nhom, loai_buoc=LB_MAY if cd.may_lam_duoc else LB_TO,
            department_id=team_id, don_vi_vao=vao, don_vi_ra=ra,
            so_luong_vao=0, so_luong_ra=0, chen_boi_to_cat=True,
        ) for i, (cd, (vao, ra)) in enumerate(zip(cds, _don_vi_chuoi(cds, in_.don_vi_vao)))]
        db.add_all(chung)
        db.flush()
        for tv in db.scalars(select(BaiGhepThanhVien).where(
                BaiGhepThanhVien.bai_ghep_id == obj.id)):
            key = phu.get(tv.lsx_id)
            dich = db.scalars(select(LsxCongDoan).where(LsxCongDoan.step_key == key)).first() \
                if key else None
            if dich is None:
                continue
            moi = _chen_truoc_lenh(db, tv.lsx_id, cds, team_id, dich)
            for bc, b in zip(chung, moi):
                db.add(BaiGhepCongDoanMap(bai_ghep_cong_doan_id=bc.id, lsx_id=tv.lsx_id,
                                          lsx_step_key=b.step_key))
            _tinh_lai_lenh(db, tv.lsx_id, {b.id: (b.don_vi_vao, b.don_vi_ra) for b in moi})
        db.flush()
        for bc in chung:
            cv_moi += cong_viec_buoc_bai(
                repo, so=so, tram=tram, goi_id=goi.id, phien_ban_so=pb, bg_id=obj.id,
                cd=bc, nhom_id=_nhom_cua(cvs), tieu_chi_theo_cd=tieu_chi)

    _ghi_chot(obj, CHOT_CAT, user)
    db.flush()
    _audit(db, user, ct, obj, "san_xuat.chot_giay",
           f"{obj.ma}: thêm công đoạn trước In — " + ", ".join(ten_chen))
    return {
        "chu_the": ct[0], "id": obj.id, "ma": obj.ma, "cach": CHOT_CAT,
        "to_mang_giay": _to_mang_giay(db, cvs),
        "cong_viec_moi": [cv.id for cv in cv_moi],
    }


def xoa(db: Session, *, user, team_id: int, lsx_id: int | None, bai_ghep_id: int | None,
        buoc_id: int) -> dict:
    """Tổ Cắt XOÁ một bước trong phạm vi (§3.3) — kể cả bước người lập lệnh đặt sẵn. KHÔNG commit.
    Xoá hết bước trong phạm vi ⇒ chốt "không cắt"."""
    ct, obj = _mo(db, user, team_id, lsx_id, bai_ghep_id)
    _goi, cvs = _goi_va_cv(db, ct)
    buoc = db.get(LsxCongDoan if ct[0] == "lsx" else BaiGhepCongDoan, buoc_id)
    chu = getattr(buoc, "lsx_id" if ct[0] == "lsx" else "bai_ghep_id", None)
    if buoc is None or chu != obj.id or not la_buoc_truoc_in_to_cat(db, buoc):
        raise ChotGiayLoi("Bước này không phải công đoạn cắt trước In của lệnh.")
    to_mang_giay = _to_mang_giay(db, cvs)
    cvs_buoc = _cv_cua_buoc(cvs, buoc.id)
    ly_do = _ly_do_khong_xoa(db, cvs_buoc, _in_da_bat_dau(db, ct, cvs))
    if ly_do:
        raise ChotGiayLoi(ly_do)
    ten = buoc.ten or ""
    _xoa_cong_viec(db, {c.id for c in cvs_buoc})
    if ct[0] == "lsx":
        _go_buoc_lenh(db, buoc)
        _tinh_lai_lenh(db, obj.id)
    else:
        keys = list(db.scalars(select(BaiGhepCongDoanMap.lsx_step_key).where(
            BaiGhepCongDoanMap.bai_ghep_cong_doan_id == buoc.id)))
        db.execute(delete(BaiGhepCongDoanMap).where(
            BaiGhepCongDoanMap.bai_ghep_cong_doan_id == buoc.id))
        thanh_vien = list(db.scalars(select(LsxCongDoan).where(
            LsxCongDoan.step_key.in_(keys)))) if keys else []
        for b in thanh_vien:
            lid = b.lsx_id
            _go_buoc_lenh(db, b)
            _tinh_lai_lenh(db, lid)
        db.execute(delete(XepLichCongDoan).where(
            XepLichCongDoan.bai_ghep_cong_doan_id == buoc.id))
        moc = buoc.thu_tu or 0
        db.delete(buoc)
        db.flush()
        for b in db.scalars(select(BaiGhepCongDoan).where(BaiGhepCongDoan.bai_ghep_id == obj.id)):
            if (b.thu_tu or 0) > moc:
                b.thu_tu = (b.thu_tu or 0) - 1
    db.flush()
    if not buoc_truoc_in(db, ct):
        _ghi_chot(obj, CHOT_KHONG_CAT, user)
        db.flush()
    _audit(db, user, ct, obj, "san_xuat.chot_giay", f"{obj.ma}: xoá công đoạn trước In — {ten}")
    return {"chu_the": ct[0], "id": obj.id, "ma": obj.ma, "cach": obj.giay_chot_cach,
            "to_mang_giay": to_mang_giay}


def chot(db: Session, *, user, team_id: int, lsx_id: int | None, bai_ghep_id: int | None,
         cach: str, cong_doan_ids: list[int] | None = None) -> dict:
    """Chốt "Không cần cắt" (KHÔNG commit — router chủ giao dịch). Thêm bước cắt đi qua `them`."""
    if cach == CHOT_CAT:
        raise ChotGiayLoi("Dùng \"Thêm công đoạn\" để thêm bước cắt.")
    if cach != CHOT_KHONG_CAT:
        raise ChotGiayLoi("Cách chốt không hợp lệ.")
    ct, obj = _mo(db, user, team_id, lsx_id, bai_ghep_id)
    if obj.giay_chot_cach:
        raise ChotGiayLoi("Đã chốt — gỡ chốt trước khi chốt lại.")
    _goi, cvs = _goi_va_cv(db, ct)
    if buoc_lay_giay(db, ct) is None:
        raise ChotGiayLoi(f"{obj.ma} không có bước mang giấy.")
    if _co_cat_truoc_in(db, ct):
        raise ChotGiayLoi("Lệnh đã có công đoạn cắt trước In — Xoá công đoạn cắt nếu không cần cắt.")
    _ghi_chot(obj, CHOT_KHONG_CAT, user)
    db.flush()
    _audit(db, user, ct, obj, "san_xuat.chot_giay", f"{obj.ma}: {NHAN_CHOT[CHOT_KHONG_CAT]}")
    return {"chu_the": ct[0], "id": obj.id, "ma": obj.ma, "cach": CHOT_KHONG_CAT,
            "to_mang_giay": _to_mang_giay(db, cvs), "cong_viec_moi": []}


def go_chot(db: Session, *, user, team_id: int, lsx_id: int | None,
            bai_ghep_id: int | None) -> dict:
    """Gỡ chốt "không cắt" (KHÔNG commit) khi In chưa bắt đầu. Bước cắt thì xoá từng công đoạn."""
    ct, obj = _mo(db, user, team_id, lsx_id, bai_ghep_id)
    if not obj.giay_chot_cach:
        raise ChotGiayLoi("Chưa chốt.")
    if obj.giay_chot_cach != CHOT_KHONG_CAT:
        raise ChotGiayLoi("Chỉ gỡ được chốt \"không cắt\" — bước cắt thì xoá từng công đoạn.")
    cvs = _cv_cua_chu_the(db, ct)
    if _in_da_bat_dau(db, ct, cvs):
        raise ChotGiayLoi("Bước mang giấy đã bắt đầu — không gỡ được.")
    _ghi_chot(obj, None, user)
    db.flush()
    _audit(db, user, ct, obj, "san_xuat.go_chot_giay",
           f"{obj.ma}: gỡ chốt ({NHAN_CHOT[CHOT_KHONG_CAT]})")
    return {"chu_the": ct[0], "id": obj.id, "ma": obj.ma, "to_mang_giay": _to_mang_giay(db, cvs)}


def to_cat_can_bao(db: Session, lsx_id: int) -> list[int]:
    """Tổ Cắt cần chấm đỏ sau khi phát hành lệnh `lsx_id`: lệnh (hoặc bài chứa nó) còn chờ tổ Cắt
    xác nhận (§3.1). Không tổ Cắt nào ⇒ rỗng."""
    to_cat = sorted(DepartmentRepository(db).dept_ids_to_cat())
    if not to_cat:
        return []
    bai = SanXuatRepository(db).bai_ghep_ids_cua_lsx({lsx_id})
    for ct in chu_the_cho_to_cat(db, lsx_ids=[lsx_id], bai_ids=list(bai) or None):
        if can_chot(db, ct):
            return to_cat
    return []


__all__ = [
    "CHOT_CAT", "CHOT_KHONG_CAT", "ChotGiayLoi", "buoc_lay_giay", "buoc_truoc_in", "can_chot",
    "chot", "chu_the_cua", "co_to_cat", "da_chot", "danh_sach", "go_chot",
    "la_buoc_mang_giay", "la_buoc_truoc_in_to_cat", "ly_do_cho_chot", "ma_chu_the", "them",
    "to_cat_can_bao", "xoa",
]
