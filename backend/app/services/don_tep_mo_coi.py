"""Dọn tệp MỒ CÔI trong kho tệp (MinIO): object không còn dòng DB nào trỏ tới.

Vì sao có: xoá dòng DB (ảnh máy hỏng, đính kèm, avatar cũ…) thường chỉ xoá DÒNG — xoá object là
best-effort (`Storage.delete` nuốt lỗi), còn tải lên xong mà lưu form thất bại thì object không có
dòng nào ngay từ đầu. Kho tệp chỉ phình.

TẬP THAM CHIẾU đọc từ MỌI cột chữ/JSON đủ dài của MỌI bảng trong model, không phải danh sách cột
khai tay: cột lưu tệp mới thêm sau này tự được tính, không ai phải nhớ quay lại đây — quên một cột
trong danh sách tay là xoá mất tệp thật. Giá của cách này (quét rộng) chỉ trả một lần mỗi ngày.
Bắt cả `/api/files/<khoá>` lẫn `/static/<khoá>` (URL đời cũ), cả khi nằm trong HTML (`<img src>`
của nội quy) hay JSON (ảnh lỗi KCS, nhật ký).

CHỐT AN TOÀN — sai ở đây là mất tệp thật của người dùng:
  * object mới hơn `TUOI_TOI_THIEU` không đụng (tải lên rồi, dòng DB chưa kịp ghi);
  * đọc tham chiếu lỗi ở BẤT KỲ bảng nào ⇒ bỏ cả lượt, không xoá gì (thiếu một bảng = tưởng mồ côi);
  * số sắp xoá > `TI_LE_TOI_DA` tổng object ⇒ không xoá, ghi cảnh báo — dấu hiệu DB vừa khôi phục
    từ bản cũ hoặc trỏ nhầm DB, không phải rác thật;
  * tối đa `TRAN_MOI_LUOT` object mỗi lượt;
  * sao lưu hằng ngày giữ bản đã xoá ở `minio-cu` (`deploy/backup/khoi-phuc.md`).
Ảnh thu nhỏ `_thumb/w<W>/<khoá>.jpg` (`services/anh_nho.py`) là mồ côi khi ảnh GỐC không còn.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote

from sqlalchemy import JSON, String, Text, cast, or_, select
from sqlalchemy.orm import Session

from ..db import Base
from ..storage import Storage
from .anh_nho import TIEN_TO as TIEN_TO_THUMB

log = logging.getLogger(__name__)

TUOI_TOI_THIEU = timedelta(days=7)
TI_LE_TOI_DA = 0.2
TRAN_MOI_LUOT = 500
#: Cột chữ ngắn hơn mức này không chứa nổi một đường dẫn tệp (`/api/files/a/1/xxxxxxxx_b` ≥ 25).
_DO_DAI_TOI_THIEU = 20
_DAU = ("/api/files/", "/static/")
#: Sau dấu đường dẫn, khoá chạy tới một ký tự CHẮC CHẮN không thuộc khoá (nháy, thẻ HTML, query,
#: xuống dòng). Dấu cách, ngoặc, dấu phẩy thì KHÔNG chắc: tên tệp có dấu cách thật
#: (`san-xuat/lsx/1/…_Anh thu lai.png`), nên mọi điểm cắt ở đó đều thành một ứng viên.
_KHOA_TRONG_CHU = re.compile(r"/(?:api/files|static)/([^\"'<>?#\\\r\n\t]+)")
_CAT_MEM = re.compile(r"[ )\]},;]")


@dataclass
class KetQua:
    tong: int = 0
    mo_coi: int = 0
    da_xoa: list[str] = field(default_factory=list)
    bo_qua: str = ""


def _cot_co_the_chua_tep(bang) -> list:
    ra = []
    for cot in bang.columns:
        kieu = cot.type
        if isinstance(kieu, JSON):
            ra.append(cot)
        elif isinstance(kieu, String):  # Text là con của String
            if isinstance(kieu, Text) or kieu.length is None or kieu.length >= _DO_DAI_TOI_THIEU:
                ra.append(cot)
    return ra


def tap_tham_chieu(db: Session) -> set[str]:
    """Mọi khoá tệp đang được một dòng DB nhắc tới. Lỗi thì RAISE — người gọi phải bỏ lượt."""
    khoa: set[str] = set()
    for bang in Base.metadata.sorted_tables:
        cot = _cot_co_the_chua_tep(bang)
        if not cot:
            continue
        for c in cot:
            chu = cast(c, Text)
            cau = select(chu).where(or_(*(chu.like(f"%{d}%") for d in _DAU)))
            for (gia_tri,) in db.execute(cau):
                for k in _ung_vien(gia_tri or ""):
                    khoa.add(k)
                    khoa.add(unquote(k))
    return khoa


def _ung_vien(chu: str) -> set[str]:
    """Mọi cách đọc khoá có thể có trong `chu`. THỪA thì vô hại (chỉ giữ thêm tệp), THIẾU là xoá
    mất tệp thật — nên cắt ở MỌI dấu mềm chứ không đoán một chỗ."""
    ra: set[str] = set()
    for cum in _KHOA_TRONG_CHU.findall(chu):
        ra.add(cum)
        ra.add(cum.rstrip())
        for m in _CAT_MEM.finditer(cum):
            ra.add(cum[: m.start()])
    return ra


def _goc_cua_thumb(key: str) -> str | None:
    """`_thumb/w160/a/b.jpg.jpg` ⇒ `a/b.jpg`."""
    phan = key[len(TIEN_TO_THUMB):].split("/", 1)
    if len(phan) != 2 or not phan[1].endswith(".jpg"):
        return None
    return phan[1][: -len(".jpg")]


def don_tep_mo_coi(db: Session, store: Storage, *, bay_gio: datetime | None = None,
                   xoa_that: bool = True) -> KetQua:
    bay_gio = bay_gio or datetime.now(timezone.utc)
    kq = KetQua()
    try:
        tham_chieu = tap_tham_chieu(db)
    except Exception:  # noqa: BLE001
        log.exception("don tep mo coi: doc tham chieu loi, bo luot")
        kq.bo_qua = "đọc tham chiếu lỗi"
        return kq
    finally:
        db.rollback()  # chỉ đọc; nhả giao dịch trước khi đi liệt kê kho tệp (có thể lâu)

    tat_ca = list(store.liet_ke())
    kq.tong = len(tat_ca)
    con = {k for k, _ in tat_ca}
    han = bay_gio - TUOI_TOI_THIEU
    mo_coi = []
    for key, sua_luc in tat_ca:
        if sua_luc > han:
            continue
        if key.startswith(TIEN_TO_THUMB):
            goc = _goc_cua_thumb(key)
            if goc is not None and goc not in con:
                mo_coi.append(key)
        elif key not in tham_chieu:
            mo_coi.append(key)
    kq.mo_coi = len(mo_coi)
    if not mo_coi:
        return kq
    if len(mo_coi) > TI_LE_TOI_DA * kq.tong:
        log.warning("don tep mo coi: %d/%d object khong ai tro toi (>%d%%) — KHONG xoa. "
                    "DB vua khoi phuc tu ban cu hoac tro nham DB?",
                    len(mo_coi), kq.tong, int(TI_LE_TOI_DA * 100))
        kq.bo_qua = "quá tỉ lệ an toàn"
        return kq
    for key in mo_coi[:TRAN_MOI_LUOT]:
        if xoa_that:
            store.delete(key)
        kq.da_xoa.append(key)
    log.info("don tep mo coi: xoa %d/%d object (tong %d)", len(kq.da_xoa), len(mo_coi), kq.tong)
    return kq
