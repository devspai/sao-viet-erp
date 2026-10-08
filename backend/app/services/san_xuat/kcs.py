"""Thực hiện sản xuất — KCS theo LỆNH (`docs/design-kcs-theo-lenh.md`, mg `0306`).

KCS mở một lệnh → bấm một công đoạn → ghi Số lỗi (18/09/2026: form chỉ còn ô này — số đạt do máy
chủ suy từ phần tổ đã làm mà chưa kiểm, xem `_phan_chua_kiem`). MỘT hành động duy nhất
(`kiem_cong_doan`), làm được trên công đoạn đang chạy / tạm dừng / đã xong, lặp bao nhiêu lần cũng
được. Tuân §18: kiểm quyền tại service → transaction → audit → (SSE do router phát sau commit).

Luật cứng:
  · Người kiểm = thành viên một phòng ban `is_kcs` — kiểm được MỌI tổ, không có quyền KCS theo tổ.
    Đóng nhóm khi còn việc chưa xong / mở lại cần thêm ô "Đóng lệnh thiếu" (`dong_lenh`, 08/10/2026).
  · Lần kiểm đã ghi KHÔNG sửa được (điều chỉnh đã gỡ 08/10/2026) — ghi sai thì ghi lần kiểm mới.
  · Kiểm KHÔNG trừ số, KHÔNG đẻ `san_xuat_batch`, KHÔNG đổi trạng thái công việc — bản ghi chất
    lượng thuần.
  · Lỗi > 0 ⇒ mô tả + ≥1 ảnh. Tổ chịu = tổ của công đoạn chịu lỗi — mặc định chính công đoạn đang
    kiểm, KCS chọn được công đoạn đứng trước trong cùng lệnh (19/09/2026); tổ đó nhận thông báo
    tức thì và "Đã xem" (`phan_hoi_luc`).
  · Công đoạn cuối của nhóm (`la_kcs_cuoi`) ⇒ Σ đạt ≤ Σ tốt tổ đã ghi; phần đạt đó là số đề xuất
    nhập kho (`kho.tao_yeu_cau_nhap_kho_cong_doan`).
  · Công đoạn GIỮA (19/09/2026) ⇒ KCS chỉ GHI LỖI khi thấy, không bắt buộc: không có số đạt (luôn
    0), không tiêu chí, không "phần chưa kiểm"; trần Σ lỗi ≤ Σ tốt tổ đã ghi (`_chi_ghi_loi`).
  · Bước cuối xét tiêu chí GỘP của cả chuỗi, kể cả lệnh phụ cùng nhóm, và quy lỗi được về mọi
    công việc của chuỗi đó (`kcs_checklist`, 08/10/2026).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ...models.san_xuat import CV_DANG_CHAY, CV_HOAN_THANH, CV_TAM_DUNG
from ...models.san_xuat_kcs import (
    KCS_DAT,
    KCS_DAT_MOT_PHAN,
    KCS_KHONG_DAT,
    SanXuatKcsBatch,
    SanXuatKcsLoi,
    SanXuatKcsLoiAnh,
)
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.san_xuat_kcs_repo import SanXuatKcsRepository
from ...repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from ..gio_xuong import thuc_te_hien_thi
from ..lenh_sx import boi_canh
from ..quyen_to import MUC_CUA_TOI, VIEC_XAC_NHAN, gate_to_tron, nguoi_co_quyen
from .kcs_checklist import checklist_gop, chuoi_gop, kiem_ket_qua
from .nguoi_trong_me import nguoi_theo_me
from .thuc_thi import _moc

# Dung sai làm tròn (cột Numeric(18,3)) — như san_luong.
_EPS = 0.0005
# Lần kiểm Y HỆT của cùng người trong khoảng này = một lần bấm "Lưu" bị gửi lại.
_CHONG_GHI_LAI = timedelta(seconds=30)
# Kiểm được công đoạn ĐÃ khởi động (đang chạy / tạm dừng / đã xong).
_TRANG_THAI_KIEM_DUOC = (CV_DANG_CHAY, CV_TAM_DUNG, CV_HOAN_THANH)
_CO_TRANG = 30


def _so_khong_am(x, ten: str) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        raise ValueError(f"{ten} không hợp lệ.")
    if v != v or v in (float("inf"), float("-inf")):
        raise ValueError(f"{ten} không hợp lệ.")
    if v < 0:
        raise ValueError(f"{ten} không được âm.")
    return v


# --- Ai là KCS ------------------------------------------------------------------------------
def la_nguoi_kcs(db: Session, user) -> bool:
    return SanXuatKcsRepository(db).la_thanh_vien_to_kcs(getattr(user, "id", None))


def gate_kcs(db: Session, user) -> None:
    if not la_nguoi_kcs(db, user):
        raise PermissionError("Chỉ người thuộc tổ KCS mới kiểm được công đoạn.")


# --- Luật dùng chung ------------------------------------------------------------------------
def _ket_luan(dat: float, loi: float) -> str:
    if loi <= _EPS:
        return KCS_DAT
    if dat <= _EPS:
        return KCS_KHONG_DAT
    return KCS_DAT_MOT_PHAN


def _chuan_hoa_anh(raw: dict, uploaded_by: int | None) -> SanXuatKcsLoiAnh:
    file_url = (raw.get("file_url") or "").strip()
    file_name = (raw.get("file_name") or "").strip()
    if not file_url or not file_name:
        raise ValueError("Ảnh bằng chứng thiếu tên file hoặc đường dẫn.")
    return SanXuatKcsLoiAnh(
        file_name=file_name[:255],
        file_url=file_url[:500],
        file_type=(raw.get("file_type") or None),
        uploaded_by=uploaded_by,
    )


def _chan_vuot_tot(db: Session, repo: SanXuatKcsRepository, cv, dat_moi: float) -> None:
    """Công đoạn cuối nhóm: Σ đạt không vượt Σ tốt tổ đã ghi — phần đạt là số đưa vào kho."""
    if not cv.la_kcs_cuoi:
        return
    tot = SanXuatSanLuongRepository(db).tong_tot(cv.id)
    da_dat = repo.tong_dat(cv.id)
    if da_dat + dat_moi > tot + _EPS:
        raise ValueError(
            f"Công đoạn cuối: tổng đạt ({da_dat + dat_moi:g}) vượt số tốt tổ đã ghi ({tot:g})."
        )


def _phan_chua_kiem(db: Session, repo: SanXuatKcsRepository, cv) -> float:
    """Phần tổ đã làm mà KCS chưa kiểm = Σ số lượng các mẻ − Σ (đạt + lỗi) các lần kiểm trước."""
    tot = SanXuatSanLuongRepository(db).tong_tot(cv.id)
    da_kiem = sum(
        float(k.so_luong_dat or 0) + float(k.so_luong_khong_dat or 0) for k in repo.cac_kcs_batch(cv.id)
    )
    return max(0.0, tot - da_kiem)


def _chi_ghi_loi(db: Session, repo: SanXuatKcsRepository, cv, loi_sl: float) -> float:
    """Công đoạn GIỮA: KCS chỉ ghi lỗi khi thấy, không bắt buộc và không có "đạt" (19/09/2026 — chỉ
    KCS cuối mới kiểm đạt để nhập kho). Trả số đạt = 0. Trần: Σ lỗi ghi ở công đoạn này không vượt
    số tốt tổ đã ghi — lỗi là hàng tổ đã làm ra."""
    if loi_sl <= _EPS:
        raise ValueError("Nhập ít nhất một dòng lỗi.")
    tot = SanXuatSanLuongRepository(db).tong_tot(cv.id)
    if tot <= _EPS:
        raise ValueError("Tổ chưa ghi sản lượng nào — chưa có hàng để ghi lỗi.")
    da_loi = sum(float(k.so_luong_khong_dat or 0) for k in repo.cac_kcs_batch(cv.id))
    if da_loi + loi_sl > tot + _EPS:
        raise ValueError(
            f"Tổng lỗi ({da_loi + loi_sl:g}) vượt số tốt tổ đã ghi ({tot:g})."
        )
    return 0.0


def _dat_cong_doan_cuoi(db: Session, repo: SanXuatKcsRepository, cv, so_dat, loi_sl: float) -> float:
    """Công đoạn CUỐI: kiểm đạt để nhập kho. `so_dat` bỏ trống ⇒ lần kiểm bao TRỌN phần tổ đã làm mà
    chưa kiểm, đạt = phần đó − số lỗi; gửi tường minh = kiểm một phần, đạt + lỗi không vượt phần đó."""
    chua_kiem = _phan_chua_kiem(db, repo, cv)
    if chua_kiem <= _EPS:
        raise ValueError("Tổ chưa ghi thêm sản lượng nào từ lần kiểm trước — chưa có gì để kiểm.")
    if so_dat in (None, ""):
        if loi_sl > chua_kiem + _EPS:
            raise ValueError(
                f"Số lỗi ({loi_sl:g}) vượt phần tổ đã làm mà chưa kiểm ({chua_kiem:g})."
            )
        dat = max(0.0, chua_kiem - loi_sl)
    else:
        dat = _so_khong_am(so_dat, "Số đạt")
        if dat + loi_sl > chua_kiem + _EPS:
            raise ValueError(
                f"Đạt + lỗi ({dat + loi_sl:g}) vượt phần tổ đã làm mà chưa kiểm ({chua_kiem:g})."
            )
    if dat + loi_sl <= _EPS:
        raise ValueError("Nhập số đạt hoặc số lỗi.")
    return dat


def _cong_doan_nguon_hop_le(db: Session, repo: SanXuatKcsRepository, cv,
                            lsx_id: int | None) -> dict[int, object]:
    """{cong_viec_id: công việc} KCS được quy lỗi về khi đang kiểm `cv`: các công đoạn của CÙNG lệnh
    đứng từ đầu chuỗi tới chính `cv` (thứ tự routing, như màn chuỗi công đoạn). Lỗi bắt ở bước sau
    mà gốc ở bước trước (lem mực thấy lúc đóng gói) thì trách nhiệm là của tổ bước trước.

    Bước CUỐI nhóm còn quy được về công việc của các lệnh PHỤ cùng nhóm (`kcs_checklist.chuoi_gop`).

    `lsx_id` = lệnh KCS đang mở — việc GHÉP phủ nhiều lệnh nên không tự suy được lệnh nào."""
    if cv.la_kcs_cuoi:
        return {c.id: c for c in chuoi_gop(db, cv, lsx_id)}
    lid = lsx_id or cv.lsx_id
    if not lid:
        return {cv.id: cv}
    bc = boi_canh.nap(db, [lid])
    cvs = bc.cong_viec_du(lid)
    if all(c.id != cv.id for c in cvs):
        raise ValueError("Công đoạn đang kiểm không thuộc lệnh này.")
    khoa = _thu_tu_cong_doan(bc, lid, repo.thu_tu_buoc([lid]))
    moc = khoa(cv)
    return {c.id: c for c in cvs if khoa(c) <= moc}


def _chuan_hoa_cac_loi(db: Session, repo: SanXuatKcsRepository, cv, cac_loi: list[dict],
                       lsx_id: int | None, uid: int | None,
                       nguon: dict[int, object] | None = None) -> list[tuple[object, float, str, list]]:
    """Kiểm từng dòng lỗi → [(công việc chịu lỗi, số lượng, mô tả, ảnh)]. Mỗi dòng: số > 0, mô tả,
    ≥1 ảnh; công đoạn chịu bỏ trống = chính công đoạn đang kiểm. `nguon` = tập quy lỗi được đã
    tính sẵn (bước cuối dùng chung chuỗi gộp với phần tiêu chí, khỏi nạp hai lần)."""
    out = []
    for i, r in enumerate(cac_loi, start=1):
        sl = _so_khong_am(r.get("so_luong"), f"Số lỗi dòng {i}")
        if sl <= _EPS:
            raise ValueError(f"Dòng lỗi {i}: số lượng phải lớn hơn 0.")
        mo_ta = (r.get("mo_ta") or "").strip()
        if not mo_ta:
            raise ValueError(f"Dòng lỗi {i}: phải mô tả lỗi.")
        if not r.get("anh"):
            raise ValueError(f"Dòng lỗi {i}: phải kèm ít nhất một ảnh.")
        cid = r.get("cong_viec_id") or cv.id
        if cid == cv.id:
            chiu = cv
        else:
            if nguon is None:
                nguon = _cong_doan_nguon_hop_le(db, repo, cv, lsx_id)
            chiu = nguon.get(cid)
            if chiu is None:
                raise ValueError(
                    f"Dòng lỗi {i}: chỉ quy lỗi được về công đoạn đứng trước trong cùng lệnh"
                    + (" hoặc lệnh cùng nhóm." if cv.la_kcs_cuoi else ".")
                )
        out.append((chiu, sl, mo_ta, [_chuan_hoa_anh(a, uid) for a in r["anh"]]))
    return out


# --- Ghi ------------------------------------------------------------------------------------
def kiem_cong_doan(
    db: Session,
    *,
    user,
    cong_viec_id: int,
    so_dat=None,
    so_loi=0,
    checklist_ket_qua: list[dict] | None = None,
    ghi_chu: str | None = None,
    loi_mo_ta: str | None = None,
    anh: list[dict] | None = None,
    cac_loi: list[dict] | None = None,
    lsx_id: int | None = None,
) -> dict:
    """Ghi MỘT lần kiểm công đoạn. Người kiểm do server chốt từ tài khoản.

    Lỗi đi theo DÒNG (`cac_loi`, 19/09/2026): mỗi dòng số lượng + mô tả + ảnh + công đoạn CHỊU lỗi —
    mặc định chính công đoạn đang kiểm, KCS chọn được công đoạn đứng trước trong cùng lệnh. Số lỗi
    của lần kiểm = Σ các dòng, vẫn đếm bằng đơn vị công đoạn đang kiểm (hàng hỏng ở đây); còn trách
    nhiệm + thông báo đi về tổ của công đoạn chịu. Không có `cac_loi` = lối cũ một lỗi
    (`so_loi` + `loi_mo_ta` + `anh`) quy về chính công đoạn.

    Trả `notify_user_ids` = người Xác nhận sản lượng trọn tổ bị kiểm, và `bao_loi_nguon` = mỗi
    công đoạn trước bị quy lỗi một mục kèm người cần báo (router đẩy SSE).

    Công đoạn giữa chỉ ghi lỗi (`_chi_ghi_loi`, bỏ qua `so_dat` + tiêu chí). Công đoạn cuối:
    `so_dat` bỏ trống (form KCS chỉ gõ số lỗi): lần kiểm bao TRỌN phần tổ đã làm mà chưa kiểm, đạt =
    phần đó − số lỗi. Gửi `so_dat` tường minh = kiểm MỘT PHẦN, đạt + lỗi vẫn không được vượt phần
    đó. Hai nhánh chung một trần: lỗi/đạt là hàng tổ đã ghi, tổ chưa ghi mẻ thì chưa có gì để kiểm —
    trước 19/09/2026 nhánh tường minh không chặn nên đã có lần kiểm 1 lỗi trên công đoạn kiểm hết."""
    gate_kcs(db, user)
    repo = SanXuatKcsRepository(db)
    cv = repo.cong_viec(cong_viec_id)
    if cv is None:
        raise ValueError("Không tìm thấy công đoạn.")
    if cv.gia_cong_ngoai_id is not None:
        from ..gia_cong_ngoai import CHAN_XUONG

        raise ValueError(CHAN_XUONG)
    from .dong_lenh import chan_neu_da_dong

    chan_neu_da_dong(db, cv)
    if cv.trang_thai not in _TRANG_THAI_KIEM_DUOC:
        raise ValueError("Công đoạn chưa bắt đầu nên chưa kiểm được.")

    uid = getattr(user, "id", None)
    # Bước cuối: chuỗi gộp (cả lệnh phụ cùng nhóm) — vừa là tập quy lỗi được, vừa là nguồn tiêu chí.
    chuoi = chuoi_gop(db, cv, lsx_id) if cv.la_kcs_cuoi else None
    if cac_loi is not None:
        dong_loi = _chuan_hoa_cac_loi(
            db, repo, cv, cac_loi, lsx_id, uid,
            nguon={c.id: c for c in chuoi} if chuoi is not None else None,
        )
        loi_sl = sum(sl for _c, sl, _m, _a in dong_loi)
        if so_loi not in (None, "", 0) and abs(_so_khong_am(so_loi, "Số lỗi") - loi_sl) > _EPS:
            raise ValueError("Tổng các dòng lỗi phải bằng số lỗi.")
    else:
        loi_sl = _so_khong_am(so_loi if so_loi not in (None, "") else 0, "Số lỗi")
        dong_loi = None

    # Chống ghi lặp: máy chủ chậm, KCS bấm "Lưu" lần nữa ⇒ trước đây ra hai lần kiểm, lỗi nhân đôi
    # (và lượt sau thường bị trần "vượt phần đã làm" chặn với câu khó hiểu). Khoá công đoạn để hai
    # lượt đồng thời xếp hàng; lần kiểm y hệt trong `_CHONG_GHI_LAI` ⇒ trả lại lần đó, KHÔNG báo
    # lại tổ. Đứng TRƯỚC các trần vì lượt gửi lại sẽ bị trần chặn oan.
    SanXuatSanLuongRepository(db).khoa_cong_viec(cv.id)
    ghi_chu_sach = (ghi_chu or "").strip() or None
    so_dat_ro = (None if so_dat in (None, "") else _so_khong_am(so_dat, "Số đạt"))
    da_co = repo.lan_kiem_vua_ghi(
        cong_viec_id=cv.id, created_by=uid, so_loi=loi_sl, so_dat=so_dat_ro, ghi_chu=ghi_chu_sach,
        tu_luc=datetime.now(timezone.utc) - _CHONG_GHI_LAI,
    )
    if da_co is not None:
        return _ket_qua_lan_kiem_cu(db, repo, cv, da_co, user, lsx_id)

    if not cv.la_kcs_cuoi:
        dat = _chi_ghi_loi(db, repo, cv, loi_sl)
        checklist_ket_qua = None
    else:
        dat = _dat_cong_doan_cuoi(db, repo, cv, so_dat, loi_sl)

    if dong_loi is None:
        dong_loi = []
        if loi_sl > _EPS:
            mo_ta = (loi_mo_ta or "").strip()
            if not mo_ta:
                raise ValueError("Có lỗi thì phải mô tả lỗi.")
            if not anh:
                raise ValueError("Có lỗi thì phải kèm ít nhất một ảnh.")
            dong_loi = [(cv, loi_sl, mo_ta, [_chuan_hoa_anh(r, uid) for r in anh])]
    if chuoi is not None:
        checklist_ket_qua = kiem_ket_qua(
            cv, checklist_gop(db, chuoi, lsx_id or cv.lsx_id), checklist_ket_qua,
            {chiu.id for chiu, *_ in dong_loi},
        )
    _chan_vuot_tot(db, repo, cv, dat)

    luc = _moc()
    don_vi = (cv.don_vi_ra or "").strip()
    kcs = SanXuatKcsBatch(
        cong_viec_id=cv.id,
        nhom_id=cv.nhom_id,
        bat_dau=luc,
        ket_thuc=luc,
        so_luong_nhan=dat + loi_sl,
        so_luong_dat=dat,
        so_luong_khong_dat=loi_sl,
        don_vi=don_vi,
        ket_luan=_ket_luan(dat, loi_sl),
        ghi_chu=(ghi_chu or "").strip() or None,
        checklist_json=checklist_ket_qua,
        created_by=uid,
    )
    repo.add(kcs)
    repo.flush()

    loi_id = None
    # Công đoạn TRƯỚC bị quy lỗi — gom theo công việc chịu để mỗi tổ nhận một thông báo.
    nguon: dict[int, dict] = {}
    for chiu, sl, mo_ta, cac_anh in dong_loi:
        loi = SanXuatKcsLoi(
            kcs_batch_id=kcs.id,
            mo_ta=mo_ta,
            to_chiu_id=chiu.department_id,
            cong_doan_ref_id=chiu.id,
            so_luong=sl,
            don_vi=don_vi or None,
            created_by=uid,
        )
        repo.add(loi)
        repo.flush()
        for a in cac_anh:
            a.loi_id = loi.id
            repo.add(a)
        loi_id = loi_id or loi.id
        if chiu.id != cv.id:
            m = nguon.setdefault(chiu.id, {
                "cong_viec_id": chiu.id, "department_id": chiu.department_id,
                "ten_cong_doan": chiu.ten_cong_doan, "so_loi": 0.0, "loi_id": loi.id,
            })
            m["so_loi"] += sl
    so_loi_cua_to = sum(sl for chiu, sl, _m, _a in dong_loi if chiu.id == cv.id)

    AuditLogRepository(db).create(
        actor_user_id=uid,
        action="san_xuat_kcs_kiem",
        target=f"san_xuat_kcs_batch:{kcs.id}",
        detail=f"cong_viec={cv.id} dat={dat:g} loi={loi_sl:g}" + "".join(
            f" quy_loi(cong_viec={m['cong_viec_id']}, sl={m['so_loi']:g})" for m in nguon.values()
        ),
    )
    db.commit()
    for m in nguon.values():
        m["notify_user_ids"] = nguoi_co_quyen(db, m["department_id"], VIEC_XAC_NHAN)
    lsx = repo.lsx(cv.lsx_id or lsx_id)
    return {
        "kcs_batch_id": kcs.id,
        "loi_id": loi_id,
        "cong_viec_id": cv.id,
        "department_id": cv.department_id,
        "lsx_id": cv.lsx_id,
        "lsx_ma": lsx.ma if lsx else None,
        "nhom_id": cv.nhom_id,
        "ten_cong_doan": cv.ten_cong_doan,
        "so_dat": dat,
        "so_loi": loi_sl,
        "ket_luan": kcs.ket_luan,
        "version": kcs.version,
        "nguoi_kiem": getattr(user, "name", None),
        "notify_user_ids": nguoi_co_quyen(db, cv.department_id, VIEC_XAC_NHAN),
        # Thông báo tới tổ bị kiểm chỉ nói phần lỗi CỦA tổ đó — phần quy về bước trước đi riêng.
        "don_vi": don_vi or None,
        "so_loi_cua_to": so_loi_cua_to,
        "bao_loi_nguon": list(nguon.values()),
    }


def _ket_qua_lan_kiem_cu(db: Session, repo: SanXuatKcsRepository, cv, kcs, user,
                         lsx_id: int | None) -> dict:
    """Kết quả của một lần kiểm ĐÃ ghi, cùng khuôn với `kiem_cong_doan` — cho lượt gửi lại. Danh sách
    người cần báo để TRỐNG: tổ đã được báo ở lượt đầu, báo lại là "ting" hai lần cho một lần kiểm."""
    lsx = repo.lsx(cv.lsx_id or lsx_id)
    so_loi = float(kcs.so_luong_khong_dat or 0)
    return {
        "kcs_batch_id": kcs.id,
        "loi_id": repo.loi_dau_id(kcs.id),
        "cong_viec_id": cv.id,
        "department_id": cv.department_id,
        "lsx_id": cv.lsx_id,
        "lsx_ma": lsx.ma if lsx else None,
        "nhom_id": cv.nhom_id,
        "ten_cong_doan": cv.ten_cong_doan,
        "so_dat": float(kcs.so_luong_dat or 0),
        "so_loi": so_loi,
        "ket_luan": kcs.ket_luan,
        "version": kcs.version,
        "nguoi_kiem": getattr(user, "name", None),
        "notify_user_ids": [],
        "don_vi": kcs.don_vi or None,
        "so_loi_cua_to": 0.0,
        "bao_loi_nguon": [],
        # Router dọn ảnh vừa tải lên của lượt gửi lại — lần kiểm cũ đã giữ ảnh của nó.
        "la_gui_lai": True,
    }


def ghi_kcs_ngoai_phan_mem(db: Session, *, cv, so_dat: float, uid: int | None,
                           ghi_chu: str, theo_lenh: tuple[int | None, str] | None = None,
                           ) -> SanXuatKcsBatch:
    """Bản ghi KCS ĐẠT tổng hợp cho công việc GIA CÔNG NGOÀI cuối nhóm (spec gia công §10).

    KCS làm ngoài phần mềm; con số chốt đứng thay. Không gate, không commit — `gia_cong_ngoai.chot`
    gác `san_xuat:update`. Nhờ bản ghi này "còn gửi kho" / đóng nhóm / trạng thái lệnh chạy nguyên
    đường cũ. Báo cáo KCS loại nó (`kcs_bao_cao`).

    `theo_lenh=(nhom_id, don_vi)`: công việc CHUNG của bài ghép ghi phần của TỪNG lệnh vào nhóm
    của lệnh đó (spec gia công bài ghép 2026-09-27 §3)."""
    luc = _moc()
    nhom_id, don_vi = theo_lenh if theo_lenh is not None else (cv.nhom_id, cv.don_vi_ra)
    kcs = SanXuatKcsBatch(
        cong_viec_id=cv.id, nhom_id=nhom_id, bat_dau=luc, ket_thuc=luc,
        so_luong_nhan=so_dat, so_luong_dat=so_dat, so_luong_khong_dat=0,
        don_vi=(don_vi or "").strip(), ket_luan=_ket_luan(so_dat, 0),
        ghi_chu=ghi_chu[:500], created_by=uid,
    )
    db.add(kcs)
    db.flush()
    return kcs


def _so_da_gui_kho(db: Session, cv) -> float:
    """Σ đã đề nghị nhập kho còn hiệu lực của công đoạn (đơn vị KCS) — đọc yêu cầu kho thật."""
    from .kho import dong_nhap_kho_cua_cong_viec, so_da_de_nghi_kcs

    if not cv.la_kcs_cuoi:
        return 0.0
    return so_da_de_nghi_kcs(dong_nhap_kho_cua_cong_viec(db, [cv.id]).get(cv.id, []))


def da_xem_loi(db: Session, *, user, loi_id: int) -> dict:
    """Tổ bị báo lỗi bấm "Đã xem" — người Xác nhận sản lượng TRỌN tổ chịu. Bấm lại không đổi gì."""
    repo = SanXuatKcsRepository(db)
    loi = repo.loi(loi_id)
    if loi is None:
        raise ValueError("Không tìm thấy lỗi.")
    gate_to_tron(db, getattr(user, "id", None), loi.to_chiu_id, VIEC_XAC_NHAN)
    kcs = repo.kcs_batch(loi.kcs_batch_id)
    if loi.phan_hoi_luc is None:
        loi.phan_hoi_by_id = getattr(user, "id", None)
        loi.phan_hoi_luc = _moc()
        loi.version += 1
        AuditLogRepository(db).create(
            actor_user_id=getattr(user, "id", None),
            action="san_xuat_kcs_da_xem_loi",
            target=f"san_xuat_kcs_loi:{loi.id}",
            detail=f"to={loi.to_chiu_id}",
        )
        db.commit()
    return {
        "loi_id": loi.id,
        "kcs_batch_id": loi.kcs_batch_id,
        "cong_viec_id": kcs.cong_viec_id if kcs else None,
        "department_id": loi.to_chiu_id,
        "da_xem_luc": thuc_te_hien_thi(loi.phan_hoi_luc),
        "nguoi_xem": repo.ten_nguoi([loi.phan_hoi_by_id]).get(loi.phan_hoi_by_id),
        "nguoi_kiem_id": kcs.created_by if kcs else None,
        "version": loi.version,
    }


# --- Đọc ------------------------------------------------------------------------------------
def _lan_kiem_ra(db: Session, repo: SanXuatKcsRepository,
                 batches: list[SanXuatKcsBatch]) -> dict[int, dict]:
    """{kcs_batch_id: lần kiểm bày ra} — lỗi/ảnh/tên người nạp GỘP một lượt."""
    ids = [b.id for b in batches]
    loi_map = repo.cac_loi_nhieu(ids)
    tat_ca_loi = [l for ds in loi_map.values() for l in ds]
    anh_map = repo.anh_cua_loi_nhieu([l.id for l in tat_ca_loi])
    ten = repo.ten_nguoi(
        {b.created_by for b in batches} | {l.phan_hoi_by_id for l in tat_ca_loi}
    )
    # Tên công đoạn của lần kiểm + công đoạn/tổ CHỊU từng lỗi — lỗi quy về bước trước phải nói rõ.
    cvs = repo.cong_viec_nhieu(
        {b.cong_viec_id for b in batches} | {l.cong_doan_ref_id for l in tat_ca_loi if l.cong_doan_ref_id}
    )
    ten_to = repo.ten_to({l.to_chiu_id for l in tat_ca_loi if l.to_chiu_id})

    def _ten_cd(cid) -> str | None:
        c = cvs.get(cid) if cid else None
        return c.ten_cong_doan if c else None

    out: dict[int, dict] = {}
    for b in batches:
        out[b.id] = {
            "id": b.id,
            "cong_viec_id": b.cong_viec_id,
            "cong_doan_ten": _ten_cd(b.cong_viec_id),
            "nguoi_kiem": ten.get(b.created_by),
            "luc": thuc_te_hien_thi(b.ket_thuc or b.created_at),
            "so_dat": float(b.so_luong_dat or 0),
            "so_loi": float(b.so_luong_khong_dat or 0),
            "don_vi": b.don_vi,
            "ket_luan": b.ket_luan,
            "checklist": b.checklist_json or [],
            "ghi_chu": b.ghi_chu,
            "version": b.version,
            "loi": [
                {
                    "id": l.id,
                    "mo_ta": l.mo_ta,
                    "so_luong": float(l.so_luong or 0),
                    "don_vi": l.don_vi,
                    "to_chiu_id": l.to_chiu_id,
                    "to_chiu_ten": ten_to.get(l.to_chiu_id) if l.to_chiu_id else None,
                    "cong_doan_id": l.cong_doan_ref_id,
                    "cong_doan_ten": _ten_cd(l.cong_doan_ref_id),
                    "da_xem_luc": thuc_te_hien_thi(l.phan_hoi_luc),
                    "nguoi_xem": ten.get(l.phan_hoi_by_id),
                    "anh": [
                        {"id": a.id, "file_name": a.file_name, "file_url": a.file_url,
                         "file_type": a.file_type}
                        for a in anh_map.get(l.id, [])
                    ],
                }
                for l in loi_map.get(b.id, [])
            ],
        }
    return out


def ket_qua_kcs_cong_viec(db: Session, user, cong_viec_id: int) -> dict:
    """Mục "Kết quả KCS" của một công đoạn. Người KCS xem mọi công đoạn; người khác theo phạm vi
    XEM của dòng quyền theo tổ (cùng phạm vi với chi tiết công việc)."""
    repo = SanXuatKcsRepository(db)
    cv = repo.cong_viec(cong_viec_id)
    if cv is None:
        raise ValueError("Không tìm thấy công đoạn.")
    if not la_nguoi_kcs(db, user):
        from .board import _loc_viec_cua_tho, _pham_vi_doc

        _q, muc = _pham_vi_doc(db, user, cv.department_id)
        if muc == MUC_CUA_TOI and not _loc_viec_cua_tho(db, user, [cv]):
            raise PermissionError("Chỉ xem được việc đã giao cho mình.")
    batches = repo.cac_kcs_batch(cong_viec_id)
    sau = repo.batch_quy_loi_ve(cong_viec_id)
    ra = _lan_kiem_ra(db, repo, batches + sau)
    # Công đoạn cuối: tổ thấy KCS đạt bao nhiêu trên số tốt mình ghi và đã đề nghị kho bao nhiêu —
    # công đoạn giữa không có "đạt" nên không có dòng này.
    cuoi = None
    if cv.la_kcs_cuoi:
        cuoi = {
            "tot": SanXuatSanLuongRepository(db).tong_tot(cv.id),
            "dat": repo.tong_dat(cv.id),
            "da_de_nghi_kho": _so_da_gui_kho(db, cv),
            "don_vi": (cv.don_vi_ra or "").strip() or None,
        }
    return {
        "cong_viec_id": cv.id,
        "la_kcs_cuoi": bool(cv.la_kcs_cuoi),
        "cuoi": cuoi,
        "checklist": _checklist_doc(db, cv, None),
        "lan_kiem": [ra[b.id] for b in reversed(batches)],
        "lan_kiem_buoc_sau": _chi_loi_quy_ve(ra, sau, cv.id),
    }


def _chuoi_doc(db: Session, cv, lsx_id: int | None) -> list:
    """`chuoi_gop` cho đường ĐỌC: dữ liệu lệch (công việc không còn trong lệnh) thì rơi về chính nó
    thay vì làm màn trắng."""
    try:
        return chuoi_gop(db, cv, lsx_id)
    except ValueError:
        return [cv]


def _checklist_doc(db: Session, cv, lsx_id: int | None, chuoi: list | None = None) -> list[dict]:
    """Tiêu chí bước cuối xét (gộp cả chuỗi); bước giữa không xét tiêu chí nào."""
    if not cv.la_kcs_cuoi:
        return []
    return checklist_gop(db, chuoi if chuoi is not None else _chuoi_doc(db, cv, lsx_id),
                         lsx_id or cv.lsx_id)


def _chi_loi_quy_ve(ra: dict[int, dict], batches, cong_viec_id: int) -> list[dict]:
    """Lần kiểm ở bước sau, mỗi lần chỉ giữ các lỗi quy về `cong_viec_id` — mới nhất trước. Tổ chỉ
    cần thấy lỗi của mình; số đạt/lỗi toàn lần kiểm là của bước kia nên để nguyên cho biết bối cảnh."""
    out = []
    for b in reversed(batches):
        lk = ra[b.id]
        loi = [l for l in lk["loi"] if l["cong_doan_id"] == cong_viec_id]
        if loi:
            out.append({**lk, "loi": loi})
    return out


def _thu_tu_cong_doan(bc, lsx_id: int, thu_tu: dict[int, tuple[int, int]]):
    """Khoá xếp chuỗi công đoạn theo thứ tự routing của lệnh: việc riêng theo bước của nó, việc
    ghép theo bước sớm nhất của lệnh mà nó phủ."""
    def khoa(cv):
        if cv.lsx_id == lsx_id:
            buoc = [cv.lsx_cong_doan_id]
        else:
            buoc = bc.buoc_phu.get(cv.id, [])
        tt = [thu_tu[b][1] for b in buoc if b in thu_tu and thu_tu[b][0] == lsx_id]
        return (min(tt) if tt else 10**9, cv.phan_doan_so or 1, cv.id)
    return khoa


def _dong_kho_cua(bc, cv) -> list:
    """Dòng yêu cầu nhập kho của MỘT công đoạn cuối. `bc.nhap_kho_tp` phát dòng của công đoạn cuối
    cho mọi lệnh cùng nhóm — lọc lại đúng `cong_viec_id` và khử trùng."""
    if not cv.la_kcs_cuoi:
        return []
    thay: dict[int, object] = {}
    for ds in bc.nhap_kho_tp.values():
        for d in ds:
            if d.cong_viec_id == cv.id:
                thay.setdefault(d.line_id, d)
    return sorted(thay.values(), key=lambda d: d.line_id)


def _da_gui_kho(bc, cv) -> float:
    """Σ đã đề nghị kho còn hiệu lực của MỘT công đoạn cuối (đơn vị KCS)."""
    return sum(d.sl_da_de_nghi_kcs for d in _dong_kho_cua(bc, cv))


def _tom_cuoi(bc, cvs) -> dict | None:
    cvs = [c for c in cvs if c.gia_cong_ngoai_id is None]
    cuoi = [cv for cv in cvs if cv.la_kcs_cuoi]
    if not cuoi:
        return None
    tot = sum(float(b.tot or 0) for cv in cuoi for b in bc.batch[cv.id])
    dat = sum(float(k.so_luong_dat or 0) for cv in cuoi for k in bc.kcs[cv.id])
    da_yc = sum(_da_gui_kho(bc, cv) for cv in cuoi)
    return {
        "tot": tot, "dat": dat, "da_yeu_cau": da_yc,
        "con_gui_kho": max(0.0, min(dat, tot) - da_yc),
    }


def danh_sach_lenh_kcs(
    db: Session, user, *, tim: str | None = None, trang: int = 1, gom_da_dong: bool = False,
    co_trang: int = _CO_TRANG, **loc,
) -> dict:
    """Danh sách lệnh cho màn KCS — phân trang + tìm ở máy chủ. `co_trang` do ô Dòng/trang ở chân
    bảng gửi lên; router đã chặn 1..100, ở đây chỉ chặn dưới cho lời gọi nội bộ."""
    gate_kcs(db, user)
    repo = SanXuatKcsRepository(db)
    trang = max(1, int(trang or 1))
    co_trang = max(1, int(co_trang or _CO_TRANG))
    # `loc` = thanh lọc (06/10/2026): `chi_da_dong`, `khach_id`, `tu_ngay`/`den_ngay`/`moc`.
    ids, tong = repo.trang_lenh(
        tim=tim, gom_da_dong=gom_da_dong, offset=(trang - 1) * co_trang, limit=co_trang, **loc
    )
    bc = boi_canh.nap(db, ids)
    items = []
    for lid in ids:
        lenh = bc.lenh.get(lid)
        if lenh is None:
            continue
        cvs = bc.cong_viec_du(lid)
        don = bc.don.get(lenh.order_id)
        khach = bc.khach.get(don.customer_id) if don and don.customer_id else None
        nhom = next((bc.nhom[cv.nhom_id] for cv in cvs if cv.nhom_id in bc.nhom), None)
        items.append({
            "lsx_id": lid,
            "ma": lenh.ma,
            "ten": lenh.ten,
            "khach": khach.name if khach else None,
            "nhom_ma": nhom.ma if nhom else None,
            "nhom_trang_thai": nhom.trang_thai if nhom else None,
            "so_cong_doan": len(cvs),
            "so_da_kiem": sum(1 for cv in cvs if bc.kcs[cv.id]),
            "so_loi": sum(float(k.so_luong_khong_dat or 0) for cv in cvs for k in bc.kcs[cv.id]),
            "cuoi": _tom_cuoi(bc, cvs),
            "created_at": lenh.created_at,
            # Lần KCS gần nhất — cùng tập công việc với mốc kỳ `kcs` ở repo (`kcs_gan_nhat_cua_lenh`).
            "kcs_gan_nhat": max(
                (k.ket_thuc for cv in cvs for k in bc.kcs[cv.id] if k.ket_thuc is not None),
                default=None,
            ),
        })
    return {"items": items, "tong": tong, "trang": trang, "co_trang": co_trang}


def khach_loc_kcs(db: Session, user) -> list[dict]:
    """Ô "Khách hàng" của thanh lọc màn KCS: khách có lệnh đã vào nhóm thành phẩm, kèm số lệnh."""
    gate_kcs(db, user)
    return [{"id": i, "ten": t, "so": n} for i, t, n in SanXuatKcsRepository(db).khach_loc()]


def chuoi_cong_doan_kcs(db: Session, user, lsx_id: int) -> dict:
    """Chuỗi công đoạn của MỘT lệnh theo thứ tự routing, kèm tổng tốt/hỏng tổ đã ghi và các lần
    kiểm — màn KCS bấm vào một công đoạn để kiểm."""
    gate_kcs(db, user)
    repo = SanXuatKcsRepository(db)
    bc = boi_canh.nap(db, [lsx_id])
    lenh = bc.lenh.get(lsx_id)
    if lenh is None:
        raise ValueError("Không tìm thấy lệnh sản xuất.")
    cvs = bc.cong_viec_du(lsx_id)
    cvs.sort(key=_thu_tu_cong_doan(bc, lsx_id, repo.thu_tu_buoc([lsx_id])))
    tat_ca_kcs = [k for cv in cvs for k in bc.kcs[cv.id]]
    # Lần kiểm ở chỗ KHÁC quy lỗi về công đoạn của lệnh này — gồm KCS cuối của thân chính quy về
    # bước của lệnh PHỤ cùng nhóm (lần kiểm đó không nằm trong `bc.kcs` của lệnh phụ).
    co = {k.id for k in tat_ca_kcs}
    quy_tu_ngoai = [k for k in repo.batch_quy_loi_ve_nhieu([cv.id for cv in cvs]) if k.id not in co]
    ra = _lan_kiem_ra(db, repo, tat_ca_kcs + quy_tu_ngoai)
    # Bước cuối: chuỗi gộp — nguồn tiêu chí + ô "công đoạn chịu lỗi" của form kiểm.
    gop = {cv.id: _chuoi_doc(db, cv, lsx_id) for cv in cvs if cv.la_kcs_cuoi}
    ten_to = repo.ten_to({cv.department_id for cv in cvs}
                         | {c.department_id for ch in gop.values() for c in ch})
    ma_lenh = repo.ma_lsx_nhieu({c.lsx_id for ch in gop.values() for c in ch})
    don = bc.don.get(lenh.order_id)
    khach = bc.khach.get(don.customer_id) if don and don.customer_id else None
    nhom = next((bc.nhom[cv.nhom_id] for cv in cvs if cv.nhom_id in bc.nhom), None)
    # Mẻ tổ đã ghi (19/09/2026): form kiểm bày kèm để KCS biết đang kiểm chồng hàng nào — người trong
    # mẻ và người ghi nạp GỘP một lượt cho cả chuỗi, mẻ thì `bc.batch` đã có sẵn.
    tat_ca_me = [b for cv in cvs for b in bc.batch[cv.id]]
    nguoi_me = nguoi_theo_me(db, {b.id for b in tat_ca_me})
    nguoi_ghi = repo.ten_nguoi({b.created_by for b in tat_ca_me if b.created_by})
    # Lỗi KCS bắt ở bước SAU mà quy về bước này — {cong_viec_id: {(bước bắt, đơn vị): số}}. Đơn vị
    # là của bước bắt (hàng hỏng ở đó), không quy đổi về đơn vị bước này.
    quy_ve: dict[int, dict[tuple[str, str], float]] = {}
    for k in tat_ca_kcs + quy_tu_ngoai:
        for l in ra[k.id]["loi"]:
            if l["cong_doan_id"] and l["cong_doan_id"] != k.cong_viec_id:
                khoa = (ra[k.id]["cong_doan_ten"] or "", l["don_vi"] or "")
                acc = quy_ve.setdefault(l["cong_doan_id"], {})
                acc[khoa] = acc.get(khoa, 0.0) + l["so_luong"]

    cong_doan = []
    for cv in cvs:
        ds = bc.kcs[cv.id]
        tot = sum(float(b.tot or 0) for b in bc.batch[cv.id])
        dat = sum(float(k.so_luong_dat or 0) for k in ds)
        da_yc = _da_gui_kho(bc, cv)
        may = bc.may.get(cv.may_id) if cv.may_id else None
        cong_doan.append({
            "cong_viec_id": cv.id,
            "ten": cv.ten_cong_doan,
            "phan_doan_so": cv.phan_doan_so,
            "phan_doan_tong": cv.phan_doan_tong,
            "to_id": cv.department_id,
            "to_ten": ten_to.get(cv.department_id or 0, ""),
            "trang_thai": cv.trang_thai,
            "tot": tot,
            "hong": sum(float(b.hong or 0) for b in bc.batch[cv.id]),
            "don_vi": cv.don_vi_ra,
            "la_kcs_cuoi": bool(cv.la_kcs_cuoi),
            "checklist": _checklist_doc(db, cv, lsx_id, gop.get(cv.id)),
            # Công việc bước cuối quy lỗi về được (chuỗi gộp, kể cả lệnh phụ) — bước giữa rỗng: form
            # tự lấy các công đoạn đứng trước trong cùng lệnh như cũ.
            "nguon_loi": [
                {"cong_viec_id": c.id, "ten": c.ten_cong_doan, "lsx_ma": ma_lenh.get(c.lsx_id),
                 "to_ten": ten_to.get(c.department_id or 0, ""), "la_dang_kiem": c.id == cv.id}
                for c in gop.get(cv.id, [])
            ],
            "so_lan_kiem": len(ds),
            "tong_dat": dat,
            "tong_loi": sum(float(k.so_luong_khong_dat or 0) for k in ds),
            # Lỗi bắt ở đây VÀ do chính công đoạn này (08/10/2026) — cùng `loi_buoc_sau` là lỗi tính
            # cho công đoạn; tình trạng KCS của nó theo hai số này, không theo `tong_loi` nơi bắt.
            "loi_tai_cho": sum(
                l["so_luong"] for k in ds for l in ra[k.id]["loi"]
                if l["cong_doan_id"] in (None, cv.id)
            ),
            "da_yeu_cau_kho": da_yc,
            "con_gui_kho": (
                max(0.0, min(dat, tot) - da_yc)
                if cv.la_kcs_cuoi and cv.gia_cong_ngoai_id is None else 0.0
            ),
            "gia_cong_ngoai": cv.gia_cong_ngoai_id is not None,
            "yeu_cau_kho": [
                {"request_id": d.request_id, "ma": d.request_ma, "trang_thai": d.trang_thai,
                 "sl_de_nghi": round(d.sl_hieu_luc, 3), "sl_da_nhan": round(d.sl_da_nhan, 3),
                 "don_vi": d.dvt, "tao_luc": thuc_te_hien_thi(d.created_at)}
                for d in _dong_kho_cua(bc, cv)
            ],
            "lan_kiem": [ra[k.id] for k in reversed(ds)],
            "loi_buoc_sau": [
                {"phat_hien_o": ten, "don_vi": dv or None, "so_luong": sl}
                for (ten, dv), sl in quy_ve.get(cv.id, {}).items()
            ],
            # Bối cảnh cho form kiểm: kế hoạch, máy, dặn dò + thẻ quy cách chụp lúc phát hành (cùng
            # nguồn với ngăn chi tiết của bàn tổ) — KCS đối chiếu hàng với quy cách ngay trong form.
            "so_luong_ra": float(cv.so_luong_ra) if cv.so_luong_ra is not None else None,
            "may": may.ten if may else None,
            "ghi_chu_ky_thuat": cv.ghi_chu,
            "quy_cach": cv.quy_cach_json or None,
            "me": [
                {"id": b.id, "bat_dau": thuc_te_hien_thi(b.bat_dau),
                 "ket_thuc": thuc_te_hien_thi(b.ket_thuc), "so_luong": float(b.tot or 0),
                 "don_vi": b.don_vi, "viec": b.ten_khoan_snapshot,
                 "nguoi_ghi": nguoi_ghi.get(b.created_by) if b.created_by else None,
                 "nguoi": [n["ho_ten"] for n in nguoi_me.get(b.id, [])]}
                for b in sorted(bc.batch[cv.id], key=lambda b: (b.ket_thuc, b.id), reverse=True)
            ],
        })
    return {
        "lsx": {
            "id": lenh.id, "ma": lenh.ma, "ten": lenh.ten,
            "khach": khach.name if khach else None,
            "nhom_id": nhom.id if nhom else None,
            "nhom_ma": nhom.ma if nhom else None,
            "nhom_trang_thai": nhom.trang_thai if nhom else None,
        },
        "cong_doan": cong_doan,
    }


def loi_cho_xem(db: Session, to_ids) -> list[dict]:
    """Lỗi KCS gửi tới các tổ này mà tổ chưa bấm "Đã xem" — dòng "KCS báo lỗi" ở bàn tổ."""
    repo = SanXuatKcsRepository(db)
    rows = repo.loi_chua_xem_nhieu_to(set(to_ids))
    if not rows:
        return []
    batches = repo.kcs_batch_nhieu({l.kcs_batch_id for l in rows})
    cvs = repo.cong_viec_nhieu(
        {b.cong_viec_id for b in batches.values()} | {l.cong_doan_ref_id for l in rows}
    )
    ten = repo.ten_nguoi({b.created_by for b in batches.values()})
    anh_map = repo.anh_cua_loi_nhieu([l.id for l in rows])
    lsx_ma = repo.ma_lsx_nhieu({cv.lsx_id for cv in cvs.values()})
    out = []
    for l in rows:
        b = batches.get(l.kcs_batch_id)
        bat = cvs.get(b.cong_viec_id) if b else None
        # Dòng lỗi gắn vào công đoạn CHỊU lỗi (chấm đỏ + tab KCS của công đoạn đó); bắt ở bước sau
        # thì nói thêm bước bắt.
        cv = cvs.get(l.cong_doan_ref_id) or bat
        out.append({
            "loi_id": l.id,
            "kcs_batch_id": l.kcs_batch_id,
            "cong_viec_id": cv.id if cv else None,
            "to_id": l.to_chiu_id,
            "ten_cong_doan": cv.ten_cong_doan if cv else "",
            "phat_hien_o": bat.ten_cong_doan if bat is not None and bat is not cv else None,
            "lsx_ma": lsx_ma.get(cv.lsx_id) if cv else None,
            "mo_ta": l.mo_ta,
            "so_luong": float(l.so_luong or 0),
            "don_vi": l.don_vi,
            "nguoi_kiem": ten.get(b.created_by) if b else None,
            "luc": thuc_te_hien_thi(l.created_at),
            "so_anh": len(anh_map.get(l.id, [])),
            "version": l.version,
        })
    return out
