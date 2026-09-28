"""A7 (28/09/2026) — bàn Xếp lịch (`lich()`) và Gantt bàn tổ thôi kéo toàn lịch sử.

Cùng hai loại bài như `test_lenh_sx_con_song.py`: bản mới == bản cũ trên thế giới có cả việc/lệnh cũ
đã xong lẫn đang chạy, VÀ thứ cũ không còn lọt qua câu SQL. File riêng vì hai màn này dựng nền bằng
fixture `db` của `test_xep_lich_service` — trộn với `sess`/`client` là hai lượt xoá bảng đá nhau
(xem docstring `tests/lenh_sx_fixtures.py`).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from app.models.lsx import LsxCongDoan
from app.models.san_xuat import CV_HOAN_THANH, SanXuatCongViec
from app.repositories.audit_repo import AuditLogRepository
from app.repositories.san_xuat_repo import SanXuatRepository
from app.repositories.xep_lich_lenh_repo import XepLichLenhRepository
from app.services.san_xuat import board
from app.services.xep_lich import XepLichLenhService
from tests.test_san_xuat_board import _authz, _phat_hanh_vao_to, _to_moi
from tests.test_xep_lich_service import (  # noqa: F401
    _hai_lsx_san_sang,
    _khai_giay_len_buoc_in,
    admin,
    customer,
    db,
    lsx_svc,
    orders,
)

_DONG_NGAY_2_9 = datetime(2026, 9, 2, 8, 0, tzinfo=timezone.utc)


def _svc(db) -> XepLichLenhService:
    return XepLichLenhService(db, XepLichLenhRepository(db), AuditLogRepository(db))


def _lich_cu(db, monkeypatch, *, tu: date, den: date) -> dict:
    """`lich()` trước A7: repo không nhận mép trái."""
    goc = XepLichLenhRepository.truoc_moc
    with monkeypatch.context() as m:
        m.setattr(XepLichLenhRepository, "truoc_moc", lambda self, den, tu=None: goc(self, den))
        return _svc(db).lich(tu=tu, den=den)


def _hai_lenh_mot_xong(db, orders, lsx_svc, admin, customer):
    """`xong`: xếp 01/09, phát hành, MỌI công việc đóng 02/09. `dang`: xếp 22/09, chưa ai đụng."""
    xong, dang = _hai_lsx_san_sang(db, orders, lsx_svc, admin, customer)
    for l in (xong, dang):
        _khai_giay_len_buoc_in(db, l.id)
    db.commit()
    _svc(db).dat_moc(xong.id, datetime(2026, 9, 1, 8, 0))
    _svc(db).dat_moc(dang.id, datetime(2026, 9, 22, 8, 0))
    _svc(db).phat_hanh(xong.id, actor=admin)
    cvs = db.query(SanXuatCongViec).filter(SanXuatCongViec.lsx_id == xong.id).all()
    assert cvs, "tiền đề: phát hành phải đẻ công việc"
    for cv in cvs:
        cv.trang_thai = CV_HOAN_THANH
        cv.hoan_thanh_luc = _DONG_NGAY_2_9
    db.commit()
    return xong, dang


def test_lich_khong_doi_ket_qua_va_bo_lenh_xong_tron_truoc_cua_so(
    db, orders, lsx_svc, admin, customer, monkeypatch,
):
    xong, dang = _hai_lenh_mot_xong(db, orders, lsx_svc, admin, customer)
    cua_so = [
        (date(2026, 9, 1), date(2026, 9, 5)),     # lệnh xong nằm TRONG cửa sổ
        (date(2026, 9, 3), date(2026, 9, 30)),    # mép trái sát sau ngày đóng (biên 1 ngày)
        (date(2026, 9, 20), date(2026, 9, 30)),   # lệnh xong nằm TRƯỚC cửa sổ
    ]
    for tu, den in cua_so:
        assert _svc(db).lich(tu=tu, den=den) == _lich_cu(db, monkeypatch, tu=tu, den=den), (tu, den)

    trong = [d["lsx_id"] for d in _svc(db).lich(tu=date(2026, 9, 1), den=date(2026, 9, 5))["dong"]]
    assert xong.id in trong, "tiền đề: cửa sổ chứa ngày đóng phải còn thấy lệnh đã xong"

    repo = XepLichLenhRepository(db)
    tu_dt = datetime(2026, 9, 20, tzinfo=timezone.utc)
    den_dt = datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc)
    ids = {m.lsx_id for m in repo.truoc_moc(den_dt, tu=tu_dt)}
    assert xong.id not in ids, "lệnh xong trọn trước cửa sổ vẫn bị SQL trả về"
    assert dang.id in ids
    assert xong.id in {m.lsx_id for m in repo.truoc_moc(den_dt)}, "tu=None phải giữ hành vi cũ"


def test_lich_giu_lenh_con_buoc_routing_chua_co_cong_viec(
    db, orders, lsx_svc, admin, customer, monkeypatch,
):
    """Mọi công việc đã đóng nhưng routing có một bước KHÔNG khớp công việc nào (thêm sau phát
    hành) ⇒ service sẽ TRẢI TIẾP bước đó từ mốc lệnh, mép vẽ không chặn được ⇒ SQL phải giữ lại."""
    xong, _dang = _hai_lenh_mot_xong(db, orders, lsx_svc, admin, customer)
    goc = db.query(LsxCongDoan).filter(LsxCongDoan.lsx_id == xong.id).first()
    db.add(LsxCongDoan(
        step_key=str(uuid.uuid4()), lsx_id=xong.id, thu_tu=int(goc.thu_tu or 0) + 1,
        cong_doan_id=goc.cong_doan_id, ten=f"{goc.ten} (thêm sau)", nhom=goc.nhom,
        department_id=goc.department_id, may_id=goc.may_id,
    ))
    db.commit()

    tu_dt = datetime(2026, 9, 20, tzinfo=timezone.utc)
    den_dt = datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc)
    assert xong.id in {m.lsx_id for m in XepLichLenhRepository(db).truoc_moc(den_dt, tu=tu_dt)}
    for tu, den in ((date(2026, 9, 20), date(2026, 9, 30)), (date(2026, 9, 1), date(2026, 9, 5))):
        assert _svc(db).lich(tu=tu, den=den) == _lich_cu(db, monkeypatch, tu=tu, den=den)


# --- Gantt bàn tổ (`work_items(nhom="phang")`) ----------------------------------------------------
def _ban_phang_cu(db, admin, monkeypatch, **kw) -> dict:
    """Bản cũ: repo trả TOÀN BỘ việc của tổ, cửa sổ lọc bằng Python."""
    goc = SanXuatRepository.cong_viec_cua_to
    with monkeypatch.context() as m:
        m.setattr(
            SanXuatRepository, "cong_viec_cua_to",
            lambda self, dept, *, cham_tu=None, cham_den=None, **k: goc(self, dept, **k),
        )
        return board.work_items(db, admin, _authz(db), nhom="phang", **kw)


def test_gantt_ban_to_cua_so_o_sql_khong_doi_ket_qua(
    db, orders, lsx_svc, admin, customer, monkeypatch,
):
    to = _to_moi(db, "Tổ Gantt A7", "TO-GANTT-A7")
    _phat_hanh_vao_to(db, orders, lsx_svc, admin, customer, to.id)
    cvs = db.query(SanXuatCongViec).filter_by(department_id=to.id).order_by(SanXuatCongViec.id).all()
    assert len(cvs) >= 2, "tiền đề: cần ít nhất hai việc trên bàn"
    # Bốn hình dạng: việc CŨ (năm ngoái, đã xong) · việc bắt đầu 23:30 NGÀY `den` (biên phải) ·
    # việc kết thúc 00:10 NGÀY `tu` (biên trái) · việc chưa xếp giờ (luôn giữ).
    cu, bien_phai = cvs[0], cvs[1]
    cu.du_kien_bat_dau = datetime(2025, 1, 2, 8, 0)
    cu.du_kien_ket_thuc = datetime(2025, 1, 2, 12, 0)
    cu.trang_thai = CV_HOAN_THANH
    bien_phai.du_kien_bat_dau = datetime(2026, 9, 12, 23, 30)
    bien_phai.du_kien_ket_thuc = datetime(2026, 9, 13, 2, 0)
    if len(cvs) >= 3:
        cvs[2].du_kien_bat_dau = datetime(2026, 9, 8, 20, 0)
        cvs[2].du_kien_ket_thuc = datetime(2026, 9, 10, 0, 10)
    if len(cvs) >= 4:
        cvs[3].du_kien_bat_dau = None
        cvs[3].du_kien_ket_thuc = None
    db.commit()

    for cua_so in (
        {"tu_ngay": date(2026, 9, 10), "den_ngay": date(2026, 9, 12)},
        {"tu_ngay": date(2026, 9, 10)},
        {"den_ngay": date(2026, 9, 12)},
        {"tu_ngay": date(2025, 1, 1), "den_ngay": date(2025, 1, 3)},
        {},
    ):
        moi = board.work_items(db, admin, _authz(db), team_id=to.id, nhom="phang", **cua_so)
        assert moi == _ban_phang_cu(db, admin, monkeypatch, team_id=to.id, **cua_so), cua_so

    ids_moi = [w["id"] for w in board.work_items(
        db, admin, _authz(db), team_id=to.id, nhom="phang",
        tu_ngay=date(2026, 9, 10), den_ngay=date(2026, 9, 12),
    )["cong_viec"]]
    assert bien_phai.id in ids_moi, "việc bắt đầu 23:30 ngày `den` phải còn trên bàn"

    # Việc cũ không còn lọt qua câu SQL (không chỉ bị Python gạt sau khi nạp).
    rows = SanXuatRepository(db).cong_viec_cua_to(
        {to.id},
        cham_tu=datetime(2026, 9, 9, tzinfo=timezone.utc),
        cham_den=datetime(2026, 9, 14, tzinfo=timezone.utc),
    )
    assert cu.id not in {r.id for r in rows}
    assert bien_phai.id in {r.id for r in rows}
