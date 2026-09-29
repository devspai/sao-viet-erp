"""Thực hiện sản xuất — BÀN GIAO công đoạn (Giai đoạn 3, §11.2 · §11.3).

Một số lượng THỐNG NHẤT mỗi lần giao — không lưu hai con số cạnh tranh. Cùng tổ + cùng LSX thì
tự `confirmed`; khác tổ/khác LSX thì `proposed` → bên NHẬN xác nhận đúng con số cuối. Điều chỉnh
KHÔNG xoá cứng: đẻ dòng lịch sử trước/sau; giảm dưới lượng công đoạn sau đã dùng ⇒ cờ không nhất quán.

Quyền (dòng quyền theo tổ, mg 0302): ĐỀ XUẤT/SỬA đòi Xác nhận sản lượng ở tổ NGUỒN; XÁC NHẬN đòi
Xác nhận sản lượng trọn tổ ĐÍCH; ĐIỀU CHỈNH chỉ bên GIAO (27/09/2026) — khác tổ thì số mới quay
về chờ bên nhận xác nhận lại. Tất cả siết ở service, router chỉ gác coarse.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.san_xuat_san_luong import (
    BG_DE_XUAT,
    BG_DIEU_CHINH,
    BG_XAC_NHAN,
    SanXuatBanGiao,
    SanXuatBanGiaoBatch,
    SanXuatBanGiaoDieuChinh,
)
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ...repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from ..quyen_to import VIEC_XAC_NHAN, nguoi_co_quyen
from .dau_vao import cung_to_cung_lsx, kiem_giam_ban_giao
from .thuc_thi import _gate, _kiem_version, _moc
from .san_luong import _EPS, _so_khong_am


def _nguoi_nhan(db: Session, user, *department_ids: int | None) -> list[int]:
    """Người giữ quyền Xác nhận sản lượng (cả tổ) ở các tổ này — trừ chính người vừa bấm."""
    uid = getattr(user, "id", None)
    ket: set[int] = set()
    for d in department_ids:
        ket.update(nguoi_co_quyen(db, d, VIEC_XAC_NHAN))
    ket.discard(uid)
    return sorted(ket)


def cho_xac_nhan_lai(bg: SanXuatBanGiao) -> bool:
    """Bên giao đã điều chỉnh, bên nhận CHƯA xác nhận lại số mới (27/09/2026). Số mới vẫn có hiệu
    lực — cờ này chỉ lái nút Xác nhận và hộp việc chờ của tổ nhận."""
    return bg.trang_thai == BG_DIEU_CHINH and bg.xac_nhan_luc is None and not bg.cung_to


# Tự xác nhận ⇔ cùng tổ VÀ cùng LSX (§11.2). Luật này nay nằm ở `dau_vao.cung_to_cung_lsx` vì
# cổng đầu vào và trần ghi mẻ cũng đọc nó — giữ hai bản là hai bản trôi khác hướng.
_la_cung_to = cung_to_cung_lsx


def _ket_qua(
    bg: SanXuatBanGiao, nguon_cv, dich_cv, *,
    notify_user_ids: list[int] | None = None, su_kien: str = "",
) -> dict:
    return {
        "ban_giao_id": bg.id,
        "trang_thai_ban_giao": bg.trang_thai,
        "so_luong": float(bg.so_luong),
        "khong_nhat_quan": bg.khong_nhat_quan,
        "version": bg.version,
        "nguon_cong_viec_id": bg.nguon_cong_viec_id,
        "dich_cong_viec_id": bg.dich_cong_viec_id,
        "nguon_department_id": nguon_cv.department_id if nguon_cv else None,
        "dich_department_id": dich_cv.department_id if dich_cv else None,
        "notify_user_ids": list(notify_user_ids or []),
        # Nhãn cho toast của người nhận (§18) — họ thường không mở đúng công đoạn này.
        "su_kien": su_kien,
        "nguon_ten": nguon_cv.ten_cong_doan if nguon_cv else "",
        "dich_ten": dich_cv.ten_cong_doan if dich_cv else "",
        "don_vi": bg.don_vi,
    }


def lap_ban_giao(
    db: Session, *, user, nguon_cv, dich_cv, so_luong: float, don_vi: str, batch_ids: list[int],
) -> SanXuatBanGiao:
    """LÕI ghi một bàn giao — KHÔNG gate, KHÔNG commit, không tự tính số.

    `de_xuat` gác quyền tổ nguồn + suy số từ mẻ rồi gọi vào đây. Chốt lần gia công ngoài
    (`services/gia_cong_ngoai/chot.py`) gác `san_xuat:update` và giao ĐÚNG con số chốt — công việc
    gia công không có tổ nào để gác theo dòng quyền tổ."""
    repo = SanXuatSanLuongRepository(db)
    cung_to = _la_cung_to(nguon_cv, dich_cv)
    now = _moc()
    uid = getattr(user, "id", None)
    bg = SanXuatBanGiao(
        nguon_cong_viec_id=nguon_cv.id, dich_cong_viec_id=dich_cv.id, cung_to=cung_to,
        so_luong=so_luong, don_vi=don_vi,
        trang_thai=BG_XAC_NHAN if cung_to else BG_DE_XUAT,
        de_xuat_by_id=uid, de_xuat_luc=now,
        xac_nhan_by_id=uid if cung_to else None, xac_nhan_luc=now if cung_to else None,
    )
    repo.add(bg)
    repo.flush()
    for batch_id in batch_ids:
        repo.add(SanXuatBanGiaoBatch(ban_giao_id=bg.id, batch_id=batch_id))
    AuditLogRepository(db).create(
        actor_user_id=uid, action="san_xuat_ban_giao_de_xuat", target=f"san_xuat_ban_giao:{bg.id}",
        detail=(f"nguon={nguon_cv.id} dich={dich_cv.id} sl={so_luong} "
                f"me={','.join(map(str, batch_ids)) or '-'} {'cung_to' if cung_to else 'de_xuat'}"),
        commit=False,
    )
    return bg


def ghi_xac_nhan(db: Session, *, bg: SanXuatBanGiao, user) -> None:
    """LÕI xác nhận — KHÔNG gate, KHÔNG commit. `xac_nhan` gác quyền tổ đích; "Đã mang đi" của
    gia công ngoài gác `san_xuat:update` (đích là công việc gia công, không tổ nào nhận)."""
    bg.trang_thai = BG_XAC_NHAN
    bg.xac_nhan_by_id = getattr(user, "id", None)
    bg.xac_nhan_luc = _moc()
    bg.version += 1
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None), action="san_xuat_ban_giao_xac_nhan",
        target=f"san_xuat_ban_giao:{bg.id}", detail=f"sl={float(bg.so_luong)}", commit=False,
    )


def ket_qua_cho_ben_nhan(db: Session, *, user, bg, nguon_cv, dich_cv) -> dict:
    """Bàn giao MỚI chờ bên nhận: báo người Xác nhận sản lượng ở tổ ĐÍCH (cùng tổ ⇒ không báo ai).
    Đích là công việc GIA CÔNG NGOÀI thì không tổ nào nhận — báo người mang hàng đi (ai sửa được
    lệnh, spec gia công §6) bằng sự kiện "chờ mang đi"."""
    if dich_cv.gia_cong_ngoai_id is not None:
        from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository

        uid = getattr(user, "id", None)
        ra = _ket_qua(bg, nguon_cv, dich_cv, su_kien="cho_mang_di", notify_user_ids=[
            u for u in GiaCongNgoaiRepository(db).nguoi_sua_lenh() if u != uid])
        from ..gia_cong_ngoai.lan import nguon_lan

        # Nhãn nguồn: mã lệnh, hoặc "BG-.. (LSX-A, LSX-B)" khi lần thuộc bài ghép (spec 2026-09-27).
        gcn = GiaCongNgoaiRepository(db).get(dich_cv.gia_cong_ngoai_id)
        ra["lsx_ma"] = nguon_lan(db, gcn)["nhan_nguon"] if gcn is not None else ""
        return ra
    notify = [] if bg.trang_thai == BG_XAC_NHAN else _nguoi_nhan(db, user, dich_cv.department_id)
    return _ket_qua(bg, nguon_cv, dich_cv, notify_user_ids=notify, su_kien="de_xuat")


def ket_qua_da_nhan(db: Session, *, user, bg, nguon_cv, dich_cv) -> dict:
    """Bên nhận vừa xác nhận: báo người Xác nhận sản lượng ở tổ NGUỒN."""
    return _ket_qua(bg, nguon_cv, dich_cv, su_kien="xac_nhan", notify_user_ids=_nguoi_nhan(
        db, user, nguon_cv.department_id if nguon_cv else None))


def _so_theo_me(
    repo: SanXuatSanLuongRepository,
    nguon_cv,
    batch_ids: list[int] | None,
    *,
    ban_giao: SanXuatBanGiao | None = None,
) -> tuple[list[int], float]:
    """Chọn mẻ ⇒ ra số lượng giao (14/09/2026). Tổ KHÔNG gõ số: số = tổng TỐT của các mẻ chọn.

    Còn mẻ chưa giao thì phải chọn ít nhất một; mẻ đã đi theo lần giao KHÁC thì không chọn lại được.
    Hết mẻ chưa giao mà vẫn còn lẻ (điều chỉnh giảm sau xác nhận) thì giao nốt phần lẻ, không mẻ.
    Số không vượt phần còn chưa giao: bàn giao tạo trước khi có giao-theo-mẻ không gắn mẻ nào, nên
    mẻ cũ vẫn hiện "chưa giao" dù số đã đi rồi.

    `ban_giao` = lần giao đang SỬA: mẻ của chính nó chọn lại được, số của nó không tính là đã giao."""
    cua_no: set[int] = set()
    con_lai = repo.tong_tot(nguon_cv.id) - repo.tong_da_giao(nguon_cv.id)
    if ban_giao is not None:
        cua_no = set(repo.me_cua_ban_giao_nhieu([ban_giao.id]).get(ban_giao.id, []))
        con_lai += float(ban_giao.so_luong)
    da_giao = repo.batch_da_giao_ids(nguon_cv.id) - cua_no
    chua_giao = {
        b.id: b for b in repo.cac_batch(nguon_cv.id)
        if b.id not in da_giao and float(b.tot) > _EPS
    }
    chon = list(dict.fromkeys(batch_ids or []))
    if chon:
        if any(i not in chua_giao for i in chon):
            raise ValueError("Có mẻ không thuộc bước này, không có sản lượng tốt hoặc đã giao rồi.")
        sl = min(sum(float(chua_giao[i].tot) for i in chon), con_lai)
    elif chua_giao:
        raise ValueError("Chọn mẻ cần giao.")
    else:
        sl = con_lai
    if sl <= _EPS:
        raise ValueError("Không còn sản lượng tốt để giao.")
    return chon, sl


def de_xuat(
    db: Session,
    *,
    user,
    nguon_cong_viec_id: int,
    dich_cong_viec_id: int | None,
    don_vi: str | None = None,
    batch_ids: list[int] | None = None,
) -> dict:
    """Bên NGUỒN đề xuất giao sản lượng tốt sang công đoạn sau (§11.2).

    Cùng tổ + cùng LSX → `confirmed` ngay. Khác → `proposed`, chờ bên đích xác nhận.

    ĐÍCH phải là chặng sau theo routing lệnh (`cong_viec_chang_sau`) — không còn chọn tự do trong
    mọi việc cùng lệnh. Bước cuối lệnh (không có chặng sau) KHÔNG bàn giao: thành phẩm rời tổ qua
    KCS kiểm rồi đề nghị nhập kho. "Giao ra kho" (`dich=None`) ĐÃ GỠ 17/09/2026 — nó đẻ một bàn giao
    không ai xác nhận được, treo mãi ở `proposed`.

    GIAO THEO MẺ: số lượng suy ra từ mẻ chọn (`_so_theo_me`), không nhận số gõ tay. Đếm thực tế lệch
    thì bên nhận xác nhận xong rồi ĐIỀU CHỈNH (§11.3)."""
    repo = SanXuatSanLuongRepository(db)
    nguon_cv = repo.cong_viec(nguon_cong_viec_id)
    if nguon_cv is None:
        raise ValueError("Không tìm thấy công việc nguồn.")
    _gate(db, user, nguon_cv, VIEC_XAC_NHAN)
    from .dong_lenh import chan_neu_da_dong

    chan_neu_da_dong(db, nguon_cv)

    chang_sau = {c.id: c for c in repo.cong_viec_chang_sau(nguon_cv)}
    if not chang_sau:
        raise ValueError(
            "Bước cuối của lệnh không bàn giao — thành phẩm vào kho qua KCS kiểm và đề nghị nhập kho."
        )
    if not dich_cong_viec_id:
        raise ValueError("Bước này còn chặng sau theo routing — phải giao cho chặng sau.")
    if dich_cong_viec_id not in chang_sau:
        raise ValueError("Đích bàn giao không phải chặng sau của bước này theo routing.")
    dich_cv = chang_sau[dich_cong_viec_id]

    chon, sl = _so_theo_me(repo, nguon_cv, batch_ids)

    don_vi_bg = (don_vi or nguon_cv.don_vi_ra or "").strip()
    if not don_vi_bg:
        raise ValueError("Bàn giao chưa có đơn vị.")

    bg = lap_ban_giao(db, user=user, nguon_cv=nguon_cv, dich_cv=dich_cv, so_luong=sl,
                      don_vi=don_vi_bg, batch_ids=chon)
    db.commit()
    return ket_qua_cho_ben_nhan(db, user=user, bg=bg, nguon_cv=nguon_cv, dich_cv=dich_cv)


def sua_de_xuat(
    db: Session,
    *,
    user,
    ban_giao_id: int,
    batch_ids: list[int] | None,
    expected_version: int | None = None,
) -> dict:
    """Bên NGUỒN sửa lại MẺ đi theo lần giao khi còn `proposed` (§11.2) — tick nhầm thì gỡ ra, sót
    thì thêm vào; số lượng tính lại theo mẻ. Đã xác nhận thì không sửa mẻ nữa, chỉ điều chỉnh số."""
    repo = SanXuatSanLuongRepository(db)
    bg = repo.ban_giao(ban_giao_id)
    if bg is None:
        raise ValueError("Không tìm thấy bàn giao.")
    if bg.trang_thai != BG_DE_XUAT:
        raise ValueError("Chỉ sửa được đề xuất chưa xác nhận.")
    nguon_cv = repo.cong_viec(bg.nguon_cong_viec_id)
    dich_cv = repo.cong_viec(bg.dich_cong_viec_id) if bg.dich_cong_viec_id else None
    _gate(db, user, nguon_cv, VIEC_XAC_NHAN)
    _kiem_version(bg, expected_version)

    chon, sl = _so_theo_me(repo, nguon_cv, batch_ids, ban_giao=bg)
    sl_truoc = float(bg.so_luong)

    # Gỡ dòng cũ TRƯỚC rồi mới thêm: `batch_id` UNIQUE, mà trong một lần flush SQLAlchemy chèn
    # trước xoá sau. Mẻ giữ nguyên thì giữ nguyên dòng.
    cu = {lk.batch_id: lk for lk in repo.lien_ket_me(bg.id)}
    for batch_id, lk in cu.items():
        if batch_id not in chon:
            repo.delete(lk)
    repo.flush()
    for batch_id in chon:
        if batch_id not in cu:
            repo.add(SanXuatBanGiaoBatch(ban_giao_id=bg.id, batch_id=batch_id))

    bg.so_luong = sl
    bg.version += 1
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None),
        action="san_xuat_ban_giao_sua",
        target=f"san_xuat_ban_giao:{bg.id}",
        detail=f"sl={sl_truoc:g}->{sl:g} me={','.join(map(str, chon)) or '-'}",
    )
    db.commit()
    return _ket_qua(bg, nguon_cv, dich_cv, su_kien="sua", notify_user_ids=_nguoi_nhan(
        db, user, dich_cv.department_id if dich_cv else None))


def xac_nhan(
    db: Session,
    *,
    user,
    ban_giao_id: int,
    expected_version: int | None = None,
) -> dict:
    """Bên ĐÍCH xác nhận đúng con số cuối (§11.2). Số này thành đầu ra được chấp nhận + đầu vào khả dụng.

    Cũng là nút XÁC NHẬN LẠI sau khi bên giao điều chỉnh (`cho_xac_nhan_lai`): trạng thái giữ
    "đã điều chỉnh" để còn lịch sử, chỉ ghi lại ai nhận, lúc nào."""
    repo = SanXuatSanLuongRepository(db)
    bg = repo.ban_giao(ban_giao_id)
    if bg is None:
        raise ValueError("Không tìm thấy bàn giao.")
    nhan_lai = cho_xac_nhan_lai(bg)
    if bg.trang_thai != BG_DE_XUAT and not nhan_lai:
        raise ValueError("Bàn giao này không ở trạng thái chờ xác nhận.")
    if bg.dich_cong_viec_id is None:
        raise ValueError("Công đoạn nhận của bàn giao này không còn — không xác nhận được.")
    nguon_cv = repo.cong_viec(bg.nguon_cong_viec_id)
    dich_cv = repo.cong_viec(bg.dich_cong_viec_id)
    if dich_cv is not None and dich_cv.gia_cong_ngoai_id is not None:
        # Hàng giao sang bước gia công ngoài: không tổ nào nhận — người kế hoạch bấm "Đã mang đi".
        raise ValueError("Bàn giao sang gia công ngoài — người kế hoạch nhận bằng nút “Đã mang đi”.")
    _gate(db, user, dich_cv, VIEC_XAC_NHAN)
    if nguon_cv is not None:
        from .dong_lenh import chan_neu_da_dong

        chan_neu_da_dong(db, nguon_cv)
    _kiem_version(bg, expected_version)

    ghi_xac_nhan(db, bg=bg, user=user)
    if nhan_lai:
        bg.trang_thai = BG_DIEU_CHINH
    db.commit()
    return ket_qua_da_nhan(db, user=user, bg=bg, nguon_cv=nguon_cv, dich_cv=dich_cv)


def dieu_chinh(
    db: Session,
    *,
    user,
    ban_giao_id: int,
    so_luong_sau,
    mo_ta: str | None = None,
    expected_version: int | None = None,
) -> dict:
    """Điều chỉnh số lượng đã xác nhận (§11.3): đẻ dòng lịch sử trước/sau, cập nhật bàn giao.

    CHỈ BÊN GIAO điều chỉnh (27/09/2026). Bên nhận chỉ có Xác nhận: đếm thiếu/thừa là chuyện hai tổ
    nói với nhau ngoài xưởng, rồi bên giao sửa số. Số mới CÓ HIỆU LỰC NGAY (tổ nhận chạy tiếp trên
    số đó); khác tổ thì bên nhận bấm xác nhận lại — xoá "ai nhận, lúc nào" để hiện chờ xác nhận lại.
    Cùng tổ + cùng lệnh không có ai khác để xác nhận ⇒ giữ nguyên.

    Giảm dưới lượng công đoạn sau ĐÃ DÙNG ⇒ đánh dấu không nhất quán (chặn chốt phân bổ/đóng nhóm).
    Giảm tới mức số nhận × hệ số không còn đủ cho số công đoạn sau ĐÃ GHI MẺ ⇒ chặn hẳn (`dau_vao`).
    Ghi chú tự do (`mo_ta`) tuỳ chọn — danh mục lý do/lỗi ĐÃ GỠ."""
    repo = SanXuatSanLuongRepository(db)
    bg = repo.ban_giao(ban_giao_id)
    if bg is None:
        raise ValueError("Không tìm thấy bàn giao.")
    if bg.trang_thai not in (BG_XAC_NHAN, BG_DIEU_CHINH):
        raise ValueError("Chỉ điều chỉnh bàn giao đã xác nhận.")
    nguon_cv = repo.cong_viec(bg.nguon_cong_viec_id)
    dich_cv = repo.cong_viec(bg.dich_cong_viec_id) if bg.dich_cong_viec_id else None
    _gate(db, user, nguon_cv, VIEC_XAC_NHAN)
    _kiem_version(bg, expected_version)

    sl_sau = _so_khong_am(so_luong_sau, "Số lượng sau điều chỉnh")
    sl_truoc = float(bg.so_luong)
    # Giảm mà kéo trần ghi mẻ của bên nhận xuống dưới số nó đã ghi ⇒ chặn (19/09/2026, `dau_vao`).
    kiem_giam_ban_giao(db, repo, bg, dich_cv, sl_sau)
    # Bên nhận phải xác nhận lại — trừ cùng tổ, và trừ bước gia công ngoài (không tổ nào nhận).
    cho_nhan_lai = (not bg.cung_to and dich_cv is not None
                    and dich_cv.gia_cong_ngoai_id is None)

    # Không nhất quán nếu giảm dưới lượng công đoạn sau đã tiêu thụ (truy vết qua lot đầu vào).
    da_dung = 0.0
    if dich_cv is not None:
        da_dung = repo.da_dung_tu_nguon(bg.nguon_cong_viec_id, bg.dich_cong_viec_id)
    khong_nhat_quan = sl_sau < da_dung - _EPS

    repo.add(
        SanXuatBanGiaoDieuChinh(
            ban_giao_id=bg.id,
            so_luong_truoc=sl_truoc,
            so_luong_sau=sl_sau,
            mo_ta=(mo_ta or "").strip() or None,
            khong_nhat_quan=khong_nhat_quan,
            created_by=getattr(user, "id", None),
        )
    )
    bg.so_luong = sl_sau
    bg.khong_nhat_quan = khong_nhat_quan
    bg.trang_thai = BG_DIEU_CHINH
    if cho_nhan_lai:
        bg.xac_nhan_by_id = None
        bg.xac_nhan_luc = None
    bg.version += 1
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None),
        action="san_xuat_ban_giao_dieu_chinh",
        target=f"san_xuat_ban_giao:{bg.id}",
        detail=(f"{sl_truoc} -> {sl_sau}{' KHONG_NHAT_QUAN' if khong_nhat_quan else ''}"
                f"{' CHO_NHAN_LAI' if cho_nhan_lai else ''}"),
    )
    db.commit()
    # Báo cả hai bên (trừ chính người vừa điều chỉnh) — bên nhận phải xác nhận lại số mới.
    notify = _nguoi_nhan(db, user, nguon_cv.department_id if nguon_cv else None,
                         dich_cv.department_id if dich_cv else None)
    return _ket_qua(bg, nguon_cv, dich_cv, notify_user_ids=notify, su_kien="dieu_chinh")
