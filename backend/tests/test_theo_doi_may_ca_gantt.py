"""Ba tab còn lại của màn "Theo dõi sản xuất" (Task 16) — Theo máy · Theo ca · Gantt.

  · Theo máy: mỗi máy MỘT lane, việc CHƯA gán máy vào lane riêng "Chưa xếp máy" — bỏ chúng đi là
    giấu mất đúng thứ điều độ phải xử lý.
  · Theo ca: ca lấy từ DANH MỤC `work_shifts` đang hiệu lực, không hard-code ba ca. Ca qua nửa
    đêm tính theo mốc BẮT ĐẦU ca.
  · Gantt: MỘT dòng = MỘT LỆNH (không phải một công việc), có phân trang Ở SQL, không trả toàn
    bộ lịch sử một lần.

--- BẢN CHỐT CỦA ĐIỀU PHỐI (task-16-brief.md, Ruling C115-C120) --------------------------------
Bốn bài của plan gốc đã SỬA theo bản chốt, KHÔNG chép nguyên si:

  C115 — đường dẫn: `/theo-may`, `/theo-ca` (tiếng Việt kebab, khớp router hiện có), giữ `/gantt`.
  C116 — bài ca qua nửa đêm KHÔNG được dò theo TÊN ca (`"ca 3"`) — chọn bằng CỜ `qua_nua_dem`, và
         fixture `viec_ca_dem_qua_ngay` TỰ TẠO ca qua đêm của nó, không dựa vào "Ca 3" của seed
         (seed CÓ sẵn Ca 3 qua đêm — dò theo tên vẫn "tình cờ" xanh nếu không tách bạch).
  C117 — tập ca của `/theo-ca` PHẢI TRÙNG tập ca mà Xếp lịch dùng (`XepLichService._ca_lich_may`),
         qua MỘT hàm dùng chung ở tầng repository (`AttendanceRepository.ca_lich_xuong`). Bài
         `test_tap_ca_trung_voi_xep_lich` canh đúng bất biến này.
  C118 — dòng Gantt là MỘT LỆNH. Fixture `hai_muoi_lenh` dựng 20 lệnh KHÔNG công việc/routing nào
         — hiểu "dòng = công việc" thì `total` luôn 0 và bài phân trang đỏ vĩnh viễn.
  C119 — phân trang Ở SQL (LIMIT/OFFSET ngay trên `select(Lsx.id)`), và phải canh được TRẬT TỰ:
         trang 1 và trang 2 phải RỜI NHAU, gộp lại đủ 10 mã khác nhau — đếm số dòng thôi thì một
         bản trả cùng 5 dòng cho mọi trang vẫn xanh.
  C120 — giờ chuẩn hoá qua `services/gio_xuong.py` (`lich_hien_thi`), `?ngay=` là NGÀY XƯỞNG (+7).

Cộng các bài brief bắt thêm: 401/403 cho cả BA route mới, chống N+1 cho `/theo-may` và `/gantt`
(và thêm cho `/theo-ca` dù brief không nêu tên — cùng khuôn "nạp theo LÔ" áp cho cả ba endpoint).
"""
from __future__ import annotations

import inspect
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import event

from app.db import engine
from app.models.attendance import WorkShift
from app.models.lsx import Lsx
from app.models.order import Order
from app.models.san_xuat import CV_DANG_CHAY, CV_HOAN_THANH, CV_TAM_DUNG, SanXuatCongViec
from app.models.san_xuat_thuc_thi import SanXuatPhienChay
from app.repositories.attendance_repo import AttendanceRepository
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.user_repo import UserRepository
from app.repositories.xep_lich_repo import XepLichRepository
from app.repositories.audit_repo import AuditLogRepository
from app.security import hash_password
from app.services.gio_xuong import lich_hien_thi, ve_utc_that
from app.services.lenh_sx import bang_theo_doi
from app.services.xep_lich_service import XepLichService

from tests.lenh_sx_fixtures import (  # noqa: F401
    _cvs, _dot_dong_don, _giao_nguoi, _lenh_tho, _phat_hanh_that,
    admin, customer, ghep_doi, hai_muoi_lenh, lsx_svc, orders, sale_own, sess,
)
# Task 18a — TÁI DÙNG đúng fixture "hai lệnh đối nhau trên tám trục" + "bốn trục qua cầu bài ghép"
# mà Task 17a đã dựng cho `/kanban` (cùng `_loc_ban`, cùng tám trục lọc — dựng một bộ fixture đối
# nhau THỨ HAI ở đây là hai bản trôi lệch nhau, đúng nguy cơ mà docstring `tests/lenh_sx_fixtures.py`
# đã cảnh báo cho `_loc_ban`/`_co_buoc`).
from tests.test_theo_doi_kanban import ghep_bon_truc, hai_lenh_doi_nhau  # noqa: F401


def _tok(client, cred):
    return client.post("/api/auth/login", json=cred).json()["access_token"]


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token_khong_quyen_theo_doi(sess) -> str:
    """Mint một user mà vai chỉ có `dashboard:own` — KHÔNG có `theo_doi_san_xuat` — dùng cho bài
    403. Khuôn lấy từ `test_theo_doi_kanban.py::_token_khong_quyen_theo_doi` (Task 15); bản sao
    riêng ở đây vì hai file test độc lập nhau, mỗi file tự dựng nền trên DB SQLite riêng của nó."""
    from app.security import create_access_token

    users = UserRepository(sess)
    existing = users.get_by_username("td-khong-quyen-16")
    if existing is not None:
        return create_access_token(str(existing.id))
    kd = DepartmentRepository(sess).get_by_name("Kinh doanh")
    roles = RoleRepository(sess)
    role = roles.create(name="R-td-khong-quyen-16", department_id=kd.id)
    roles.set_permission(role_id=role.id, module_key="dashboard", can_read=True, scope="own")
    u = users.create(
        username="td-khong-quyen-16", name="U không quyền theo dõi SX (16)",
        password_hash=hash_password("x"),
    )
    users.set_assignment(u, department_id=kd.id, role_id=role.id, is_active=True)
    sess.commit()
    return create_access_token(str(u.id))


def _dem_sql(fn):
    """Đếm câu SQL thật sự gửi xuống driver trong lúc chạy `fn` — khuôn
    `test_theo_doi_kanban.py::_dem_sql` / `test_lenh_sx_api.py::_dem_sql`."""
    n = 0

    def _ghi(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001, ARG001
        nonlocal n
        n += 1

    event.listen(engine, "before_cursor_execute", _ghi)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", _ghi)
    return n


def _bat_sql(fn) -> list[tuple[str, tuple]]:
    """Như `_dem_sql` nhưng GIỮ LẠI văn bản + tham số của từng câu — Vòng sửa 2 mục 4 cần soi
    CÂU LỆNH THẬT SỰ CHẠY (không phải chuỗi trong mã nguồn Python)."""
    cau: list[tuple[str, tuple]] = []

    def _ghi(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001, ARG001
        cau.append((statement, parameters))

    event.listen(engine, "before_cursor_execute", _ghi)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", _ghi)
    return cau


# --- Fixture MỚI của task này --------------------------------------------------------------------
@pytest.fixture
def viec_chua_xep_may(sess, orders, lsx_svc, admin, customer) -> int:
    """Lệnh THẬT với MỘT bước, chưa ai xếp máy (`may_id` mặc định NULL — không đường ghi nào của
    `_phat_hanh_that` chạm cột này). Trả `cong_viec_id` để canh lane "Chưa xếp máy" của
    `/theo-may`."""
    _dot_dong_don(sess, 31)
    lsx_id = _phat_hanh_that(
        sess, orders, lsx_svc, admin, customer, buoc=[("CTP", 15, 500)],
    )
    return _cvs(sess, lsx_id)[0].id


@pytest.fixture
def ca_thu_tu(sess) -> int:
    """MỘT ca MỚI trong danh mục `work_shifts`, không đụng LSX nào — canh `/theo-ca` đọc ĐỘNG từ
    danh mục (không hard-code ba ca "Ca 1/2/3" của seed, Ruling C116's chị em)."""
    ca = WorkShift(
        name="Ca thử nghiệm C115", start_minute=9 * 60, end_minute=17 * 60,
        is_overnight=False, is_active=True, ca_san_xuat=True,
    )
    sess.add(ca)
    sess.commit()
    return ca.id


@pytest.fixture
def viec_ca_dem_qua_ngay(sess, orders, lsx_svc, admin, customer) -> tuple[int, int]:
    """Ca qua nửa đêm TỰ TẠO (Ruling C116 — KHÔNG dựa vào "Ca 3" có sẵn trong seed, dù seed cũng
    có một ca qua đêm cùng hình dạng) + một công việc đặt giờ RẠNG SÁNG NGÀY SAU (01:00, sau 0h).

    Đặt việc SAU nửa đêm (Ruling C120) mới phân biệt được "tính theo mốc BẮT ĐẦU ca" (phải thuộc
    ngày HÔM TRƯỚC, 31/08) với "tính theo ngày lịch của mốc chạy" (sẽ rơi nhầm sang 01/09 nếu cài
    đặt tính sai) — đặt việc TRƯỚC nửa đêm thì hai cách tính trùng nhau, bài không canh được gì.

    Trả `(ca_id, cong_viec_id)` — test tra ĐÚNG ca này bằng `id`, không suy đoán qua tên/vị trí.
    """
    ca = WorkShift(
        name="Ca đêm test C116", start_minute=23 * 60, end_minute=7 * 60,
        is_overnight=True, is_active=True, ca_san_xuat=True,
    )
    sess.add(ca)
    sess.commit()

    _dot_dong_don(sess, 33)
    lsx_id = _phat_hanh_that(
        sess, orders, lsx_svc, admin, customer, buoc=[("CTP", 15, 500)],
    )
    cv = _cvs(sess, lsx_id)[0]
    # Giờ TƯỜNG dán nhãn UTC (đúng quy ước `gio_xuong.py`) — 01:00 rạng sáng 01/09/2026.
    cv.du_kien_bat_dau = datetime(2026, 9, 1, 1, 0, tzinfo=timezone.utc)
    # Vòng sửa 1 mục D "kèm" — set luôn mốc kết thúc (15' khớp CTP) để fixture này không vô tình
    # là ca duy nhất thiếu `du_kien_ket_thuc`, gây nhiễu bài đo dải Gantt.
    cv.du_kien_ket_thuc = datetime(2026, 9, 1, 1, 15, tzinfo=timezone.utc)
    sess.commit()
    return ca.id, cv.id


# --- Fixture của Vòng sửa 1 (task-16-fix1-brief.md) ------------------------------------------------
def _khai_ca_bo_ba(sess) -> dict[str, int]:
    """Bộ BỐN ca tối thiểu để bài canh C117 CÓ RĂNG (Vòng sửa 1 mục B) — MỘT ca sản xuất
    (`ca_san_xuat=True`), MỘT ca văn phòng (`ca_san_xuat=False`), MỘT ca ĐÃ TẮT (`is_active=False`),
    cộng MỘT ca ĐÊM (Vòng sửa 2 mục 3 / NS-2). `ca_thu_tu` cũ (một phần tử duy nhất, qua được MỌI
    cách viết lọc/không lọc) không phân biệt nổi "có lọc `ca_san_xuat`" với "không lọc", cũng không
    phân biệt "có đường lùi `or cas`" với "không có". Bản BA-ca gốc lại mù trước kiểu trôi "hậu
    lọc": một `_ca_lich_may()` vẫn gọi đúng `ca_lich_xuong()` rồi LỌC BỎ ca đêm SAU khi gọi — không
    ca đêm nào trong bộ ba thì phép lọc đó không đổi tập, cả bài hành vi lẫn bài `inspect.getsource`
    (không có `select(` mới, vẫn gọi đúng nguồn) đều mù. Ca đêm thứ tư khiến hậu lọc kiểu đó hiện
    thành hiệu tập ngay ở Pha 1. Bản sao ĐỘC LẬP của `_khai_ca_xuong` (`test_xep_lich_service.py:
    1048-1066`) — không import chéo giữa hai file test, mỗi file đứng trên DB SQLite riêng theo
    hàm."""
    sx = WorkShift(
        name="Ca SX (mục B)", start_minute=6 * 60, end_minute=14 * 60,
        is_active=True, ca_san_xuat=True,
    )
    vp = WorkShift(
        name="Ca văn phòng (mục B)", start_minute=8 * 60, end_minute=17 * 60,
        is_active=True, ca_san_xuat=False,
    )
    tat = WorkShift(
        name="Ca đã tắt (mục B)", start_minute=14 * 60, end_minute=22 * 60,
        is_active=False, ca_san_xuat=True,
    )
    dem = WorkShift(
        name="Ca đêm (Vòng sửa 2 mục 3)", start_minute=22 * 60, end_minute=6 * 60,
        is_overnight=True, is_active=True, ca_san_xuat=True,
    )
    sess.add_all([sx, vp, tat, dem])
    sess.commit()
    return {"sx": sx.id, "vp": vp.id, "tat": tat.id, "dem": dem.id}


@pytest.fixture
def viec_23h_khong_ca_nao_phu(sess, orders, lsx_svc, admin, customer) -> tuple[int, int]:
    """Xưởng khai ĐỦ Ca 1 (06–14) + Ca 2 (14–22), KHÔNG có ca đêm — hợp lệ, xưởng chỉ chạy hai ca
    ngày là chuyện bình thường. Một việc xếp 23:00 TRÊN MÁY — Xếp lịch không hề bị ràng buộc bởi
    tập ca khi bước chạy trên máy (`xep_lich_service.py:470-487` dựng `LichXuong(..., lien_tuc=True)`
    = khung phẳng [00:00,24:00)) — canh CHẶN-1 kịch bản A / Ruling C117 (Vòng sửa 1 mục A): việc
    này KHÔNG được biến mất khỏi `/theo-ca` dù không ca nào trong danh mục phủ 23:00."""
    ca1 = WorkShift(
        name="Ca 1 (mục A)", start_minute=6 * 60, end_minute=14 * 60,
        is_active=True, ca_san_xuat=True,
    )
    ca2 = WorkShift(
        name="Ca 2 (mục A)", start_minute=14 * 60, end_minute=22 * 60,
        is_active=True, ca_san_xuat=True,
    )
    sess.add_all([ca1, ca2])
    sess.commit()

    _dot_dong_don(sess, 51)
    lsx_id = _phat_hanh_that(
        sess, orders, lsx_svc, admin, customer, buoc=[("CTP", 15, 500)],
    )
    cv = _cvs(sess, lsx_id)[0]
    cv.du_kien_bat_dau = datetime(2026, 8, 31, 23, 0, tzinfo=timezone.utc)
    cv.du_kien_ket_thuc = datetime(2026, 8, 31, 23, 15, tzinfo=timezone.utc)
    sess.commit()
    return ca1.id, cv.id


@pytest.fixture
def lenh_gantt_thu_tu_xao_tron(sess, admin, customer) -> None:
    """6 lệnh — hạn rải xa nhau, mã KHÔNG cùng thứ tự bảng chữ cái với hạn, CHÈN vào DB theo thứ tự
    XÁO TRỘN (không theo hạn, không theo mã) + một lệnh KHÔNG hạn chen giữa. Canh Ruling C119
    (Vòng sửa 1 mục C.1): `hai_muoi_lenh` cũ chèn ĐÚNG theo thứ tự hạn tăng dần nên rowid/thứ tự
    chèn vô tình trùng thứ tự đúng — bỏ `order_by` hay đảo chiều đều không đỏ được trên fixture đó.
    Xáo trộn thứ tự chèn mới phân biệt được "có ORDER BY đúng" với "trùng hợp rowid"."""
    _dot_dong_don(sess, 53)
    thu_tu_chen = [
        ("LSX-XT-D", date(2026, 9, 5)),
        ("LSX-XT-KHONG-HAN", None),
        ("LSX-XT-B", date(2026, 9, 2)),
        ("LSX-XT-E", date(2026, 9, 6)),
        ("LSX-XT-A", date(2026, 9, 1)),
        ("LSX-XT-C", date(2026, 9, 3)),
    ]
    for ma, han in thu_tu_chen:
        _lenh_tho(sess, ma=ma, sale_user_id=admin.id, customer_id=customer.id, han_sx=han)


@pytest.fixture
def lenh_buoc_cuoi_thieu_moc_ket_thuc(sess, orders, lsx_svc, admin, customer) -> tuple[int, str]:
    """Lệnh 2 bước — bước 2 (In) CHỈ có `du_kien_bat_dau`, THIẾU `du_kien_ket_thuc` (hình dạng THẬT:
    bước 1 đã xếp xong lịch, bước 2 mới xếp được mốc bắt đầu — `tien_do.py:99` và
    `danh_sach.py:246-250` đều rẽ nhánh cho ca này). `lech_buoc={1: 6h}` đẩy mốc bắt đầu bước 2 ra
    XA HẲN mốc kết thúc bước 1 (không chỉ liền kề) — thiếu khoảng CÁCH THẬT thì bug cũ (`max()` trên
    tập mốc kết thúc, bỏ sót bước chưa có kết thúc) TÌNH CỜ ra đúng giá trị đúng (mốc bắt đầu bước 2
    == mốc kết thúc bước 1 khi không lệch), bài sẽ không đỏ được (Vòng sửa 1 mục D / NS-1)."""
    _dot_dong_don(sess, 59)
    lsx_id = _phat_hanh_that(
        sess, orders, lsx_svc, admin, customer,
        buoc=[("CTP", 15, 500), ("In", 360, 5000)],
        lech_buoc={1: timedelta(hours=6)},
    )
    cv_cuoi = _cvs(sess, lsx_id)[1]
    moc_bat_dau_buoc_cuoi = lich_hien_thi(cv_cuoi.du_kien_bat_dau).isoformat()
    cv_cuoi.du_kien_ket_thuc = None
    sess.commit()
    return lsx_id, moc_bat_dau_buoc_cuoi


# --- Bốn bài của plan, viết theo bản chốt ---------------------------------------------------------
def test_theo_ca_mang_nhan_buoc(client, seed_credentials, sess, viec_23h_khong_ca_nao_phu):
    """Bàn Theo ca dựng dòng việc bằng hàm riêng (`_viec_theo_ca_dict`) nên phải canh riêng — đây
    đúng là kiểu "một chỗ quên field" mà helper `_nhan` sinh ra để chặn.

    Dùng việc CÓ GIỜ (rổ "Ngoài ca") chứ không dùng việc chưa xếp máy: bàn này bày theo mốc bắt
    đầu, việc chưa có giờ không thuộc ngày nào cả.
    """
    _ca1_id, cv_id = viec_23h_khong_ca_nao_phu
    cv = sess.get(SanXuatCongViec, cv_id)
    cv.loai_buoc = "thue_ngoai"
    cv.nha_cung_cap = "Cơ sở Minh Phát"
    sess.commit()

    h = _h(_tok(client, seed_credentials))
    d = client.get("/api/theo-doi-san-xuat/theo-ca?ngay=2026-08-31", headers=h).json()
    viec = next(v for c in d["ca"] for v in c["viec"] if v["cong_viec_id"] == cv_id)
    assert viec["nhan"]["loai_buoc"] == "thue_ngoai"
    assert viec["nhan"]["nha_cung_cap"] == "Cơ sở Minh Phát"


def test_ca_lay_tu_danh_muc(client, seed_credentials, ca_thu_tu):
    h = _h(_tok(client, seed_credentials))
    cas = client.get("/api/theo-doi-san-xuat/theo-ca", headers=h).json()["ca"]
    assert ca_thu_tu in {c["id"] for c in cas}


def test_ca_qua_nua_dem_tinh_theo_moc_bat_dau(client, seed_credentials, viec_ca_dem_qua_ngay):
    ca_id, cv_id = viec_ca_dem_qua_ngay
    h = _h(_tok(client, seed_credentials))
    cas = client.get(
        "/api/theo-doi-san-xuat/theo-ca?ngay=2026-08-31", headers=h
    ).json()["ca"]
    dem = next(c for c in cas if c["id"] == ca_id)
    assert dem["qua_nua_dem"] is True, "tiền đề: ca dựng trong fixture phải mang cờ qua_nua_dem"
    assert cv_id in {v["cong_viec_id"] for v in dem["viec"]}, (
        "việc chạy 01:00 (01/09) phải thuộc ca BẮT ĐẦU tối 31/08, không phải rơi ra ngoài / "
        "nhảy sang ca của ngày 01/09"
    )


def test_theo_ca_work_shifts_rong_van_co_rong_ngoai_ca(client, seed_credentials, viec_chua_xep_may):
    """CHẶN-1 kịch bản B (Vòng sửa 1 mục A) — danh mục `work_shifts` RỖNG hoàn toàn (tiền đề mặc
    định của test env, `SEED_DEMO=false`). Xếp lịch vẫn dựng lịch được nhờ fallback "8h phẳng
    [08:00,16:00)" (`xep_lich_service.py:153`); `/theo-ca` (trước vá) trả `ca=[]` tuyệt đối vì
    không có ca nào để dò `_ca_cua_moc` — bản vá phải còn rổ "Ngoài ca"."""
    h = _h(_tok(client, seed_credentials))
    d = client.get("/api/theo-doi-san-xuat/theo-ca?ngay=2026-08-31", headers=h).json()
    assert d["ca"] != [], "work_shifts rỗng không được làm /theo-ca trả về rỗng tuyệt đối"
    ngoai = next(c for c in d["ca"] if c["id"] is None)
    assert viec_chua_xep_may in {v["cong_viec_id"] for v in ngoai["viec"]}


def test_theo_ca_thay_viec_ghep_qua_cau_bai_ghep(client, seed_credentials, sess, ghep_doi):
    """Vòng sửa 2 mục 1 (CHẶN) — nhánh UNION `qua_ghep` của mục I (`bang_theo_doi.py:607-620`,
    docstring "VÒNG SỬA 1 MỤC I") trước vòng này KHÔNG có bài canh riêng. Người rà soát đo được nó
    LOAD-BEARING: bỏ nhánh đó thì một lệnh mà việc DUY NHẤT trong cửa sổ ngày là việc GHÉP
    (`SanXuatCongViec.lsx_id IS NULL`, phủ lệnh qua `BaiGhepCongDoanMap`) rớt khỏi `ids` và biến
    mất khỏi `/theo-ca` — mà 25/25 bài cũ vẫn xanh, vì không bài nào trước đây dựng đúng hình dạng
    "lệnh không còn việc RIÊNG nào trong ngày, chỉ còn việc ghép".

    Xoá mốc của MỌI công việc RIÊNG (CTP/Đóng gói, `lsx_id` là chính lệnh) của CẢ HAI lệnh trong
    `ghep_doi` — chỉ còn `cv_chung` (bước In ghép, `lsx_id IS NULL`) mang mốc trong cửa sổ ngày."""
    a_id, b_id, cv_chung = ghep_doi
    for lsx_id in (a_id, b_id):
        for cv in _cvs(sess, lsx_id):
            cv.du_kien_bat_dau = None
            cv.du_kien_ket_thuc = None
    cv_chung.du_kien_bat_dau = datetime(2026, 8, 31, 10, 0, tzinfo=timezone.utc)
    cv_chung.du_kien_ket_thuc = datetime(2026, 8, 31, 11, 0, tzinfo=timezone.utc)
    sess.commit()

    h = _h(_tok(client, seed_credentials))
    d = client.get("/api/theo-doi-san-xuat/theo-ca?ngay=2026-08-31", headers=h).json()
    thay = {v["cong_viec_id"] for c in d["ca"] for v in c["viec"]}
    assert cv_chung.id in thay, (
        "việc ghép (lsx_id IS NULL, phủ qua BaiGhepCongDoanMap) biến mất khỏi /theo-ca — "
        "nhánh UNION qua_ghep mất tác dụng"
    )


def test_gantt_ket_thuc_khong_som_hon_buoc_cuoi_moi_bat_dau(
    client, seed_credentials, lenh_buoc_cuoi_thieu_moc_ket_thuc,
):
    """Vòng sửa 1 mục D / NS-1 — bước CUỐI của routing có `du_kien_bat_dau` nhưng THIẾU
    `du_kien_ket_thuc` (đã xếp giờ bắt đầu, chưa xếp xong khoảng chạy). Dải Gantt của lệnh không
    được kết thúc SỚM HƠN mốc bắt đầu của chính bước cuối đó — nếu không, thanh Gantt giấu mất phần
    việc đã biết chắc chắn còn đang chạy."""
    lsx_id, moc_bat_dau_buoc_cuoi = lenh_buoc_cuoi_thieu_moc_ket_thuc
    h = _h(_tok(client, seed_credentials))
    d = client.get("/api/theo-doi-san-xuat/gantt?page=1&page_size=50", headers=h).json()
    dong = next(r for r in d["rows"] if r["lsx_id"] == lsx_id)
    assert dong["du_kien_ket_thuc"] is not None, (
        "bước cuối thiếu mốc kết thúc không được làm cả dòng mất luôn dải thời gian"
    )
    assert dong["du_kien_ket_thuc"] >= moc_bat_dau_buoc_cuoi, (
        f"Gantt kết thúc {dong['du_kien_ket_thuc']} trong khi bước cuối mới bắt đầu "
        f"{moc_bat_dau_buoc_cuoi} — giấu mất phần việc đã xếp"
    )


def test_gantt_thu_tu_dung_han_khong_phai_thu_tu_chen(
    client, seed_credentials, lenh_gantt_thu_tu_xao_tron,
):
    """Ruling C119 / Vòng sửa 1 mục C.1 — sắp theo HẠN thật (lệnh không hạn xếp CUỐI), không phải
    trùng hợp theo thứ tự chèn DB. Fixture chèn xáo trộn (D, không-hạn, B, E, A, C) nên chỉ có
    ORDER BY đúng mới ra được thứ tự trang dưới đây."""
    h = _h(_tok(client, seed_credentials))
    trang1 = client.get(
        "/api/theo-doi-san-xuat/gantt?page=1&page_size=3", headers=h
    ).json()
    trang2 = client.get(
        "/api/theo-doi-san-xuat/gantt?page=2&page_size=3", headers=h
    ).json()
    assert [r["ma"] for r in trang1["rows"]] == ["LSX-XT-A", "LSX-XT-B", "LSX-XT-C"]
    assert [r["ma"] for r in trang2["rows"]] == ["LSX-XT-D", "LSX-XT-E", "LSX-XT-KHONG-HAN"]


def test_gantt_cat_trang_o_sql_khong_phai_python():
    """Canh HÌNH DẠNG MÃ NGUỒN — CHỈ chặn đúng hình dạng `ids[a:b]` (Vòng sửa 1 mục C.2, siết chú
    thích ở Vòng sửa 2 mục 4). Người rà soát vòng 2 đo được bài này qua mặt được bằng hai mẹo tầm
    thường ngay trong SOURCE: giữ một `.offset(0).limit(10_000)` TRANG TRÍ (không thật sự gắn vào
    câu cắt trang) để qua vế `.limit(`/`.offset(`, và đổi tên biến `ids` thành thứ khác (vd `tat_ca`)
    để qua vế `"ids["` — bản SAI (kéo cả phạm vi về Python rồi cắt lát) vẫn xanh. Bài này KHÔNG
    chặn được kiểu né đó — khoá THẬT nằm ở `test_gantt_cat_trang_bang_sql_that_su_chay` bên dưới
    (soi SQL thật sự chạy, không soi chuỗi mã nguồn). Giữ bài này lại vì nó vẫn rẻ và vẫn chặn được
    hình dạng ngây thơ nhất; đừng đọc tên bài mà tưởng nó chặn được mọi cách cắt ở Python."""
    src = inspect.getsource(bang_theo_doi.gantt)
    assert ".limit(" in src and ".offset(" in src, "phải cắt trang bằng LIMIT/OFFSET của SQL"
    assert "ids[" not in src, "không được cắt trang bằng slice Python trên danh sách id"


def test_gantt_cat_trang_bang_sql_that_su_chay(client, seed_credentials, hai_muoi_lenh):
    """Vòng sửa 2 mục 4 — khoá C119 bằng SQL THẬT SỰ GỬI XUỐNG DRIVER, không quét chuỗi mã nguồn.
    `page=3&page_size=2` ⇒ `limit=2`, `offset=(3-1)*2=4` — cố ý chọn hai giá trị KHÁC NHAU để không
    thể lẫn lộn thứ tự bind. Tìm ĐÚNG câu SELECT chỉ chọn cột `lsx.id` (phân biệt với câu tải đủ cột
    `lsx` bên trong `boi_canh.nap()`, câu đó lọc bằng `WHERE lsx.id IN (...)`, không có LIMIT/OFFSET)
    — đây là câu QUYẾT ĐỊNH trang nào được trả, khẳng định nó mang `LIMIT`/`OFFSET` và tham số bind
    ĐÚNG BẰNG `page_size`/`offset`, không chỉ đếm số câu hay quét xem chữ "LIMIT" có xuất hiện đâu đó
    trong câu (một `.limit(10_000)` trang trí gắn lên đúng câu này vẫn chứa chữ "LIMIT" — chỉ giá
    trị bind mới vạch trần nó không phải `page_size` thật)."""
    h = _h(_tok(client, seed_credentials))
    cau = _bat_sql(
        lambda: client.get("/api/theo-doi-san-xuat/gantt?page=3&page_size=2", headers=h)
    )
    cau_id = [
        (s, p) for s, p in cau
        if s.split("FROM", 1)[0].strip() == "SELECT lsx.id"
    ]
    assert cau_id, "không thấy câu SELECT lsx.id nào — không xác định được câu quyết định trang"
    s, p = cau_id[0]
    assert "LIMIT" in s and "OFFSET" in s, f"câu chọn lsx.id thiếu LIMIT/OFFSET thật sự: {s!r}"
    assert p[-2:] == (2, 4), (
        f"LIMIT/OFFSET bind sai giá trị (phải là page_size=2, offset=4) — bind thật: {p[-2:]!r}. "
        "Một bản kéo cả phạm vi rồi cắt ở Python, hoặc giữ .limit(10_000) trang trí, sẽ lộ ở đây."
    )


def test_gantt_co_phan_trang(client, seed_credentials, hai_muoi_lenh):
    h = _h(_tok(client, seed_credentials))
    d = client.get("/api/theo-doi-san-xuat/gantt?page=1&page_size=5", headers=h).json()
    assert len(d["rows"]) == 5
    assert d["total"] >= 20

    # Ruling C119 — không chỉ đếm số dòng: trang 1/2 phải RỜI NHAU và gộp đủ 10 mã khác nhau.
    # Một bản cài đặt trả cùng 5 dòng cho mọi trang vẫn qua được hai khẳng định phía trên.
    ma_trang_1 = {r["ma"] for r in d["rows"]}
    d2 = client.get("/api/theo-doi-san-xuat/gantt?page=2&page_size=5", headers=h).json()
    ma_trang_2 = {r["ma"] for r in d2["rows"]}
    assert ma_trang_1.isdisjoint(ma_trang_2), "trang 1 và trang 2 trùng dòng — phân trang sai"
    assert len(ma_trang_1 | ma_trang_2) == 10

    # Vòng sửa 2 mục 6 (GN-1) — `hai_muoi_lenh` dựng 20 lệnh KHÔNG công việc/routing nào (Ruling
    # C118). Tập mốc rỗng ⇒ dải thời gian phải để None ("chưa đủ dữ liệu thì nói chưa đủ dữ liệu"),
    # KHÔNG được bịa mốc — hành vi này đã ĐÚNG từ trước, chỉ chưa ai canh.
    for r in d["rows"]:
        assert r["du_kien_bat_dau"] is None, f"lệnh {r['ma']} không có việc nào nhưng lại có mốc bắt đầu"
        assert r["du_kien_ket_thuc"] is None, f"lệnh {r['ma']} không có việc nào nhưng lại có mốc kết thúc"


# --- C117 — tập ca của /theo-ca PHẢI TRÙNG tập ca mà Xếp lịch dùng --------------------------------
def test_tap_ca_trung_voi_xep_lich(sess):
    """`AttendanceRepository.ca_lich_xuong()` phải là NGUỒN DUY NHẤT cho cả hai bàn (Ruling C117).

    Vòng sửa 1 mục B — `ca_thu_tu` cũ (MỘT ca duy nhất, qua được MỌI cách viết lọc/không lọc) không
    phân biệt được ba cách viết khác nhau đều "trông đúng". Bộ BỐN ca (`_khai_ca_bo_ba`) có răng cho
    CẢ hai đột biến brief nêu tên, chạy qua HAI PHA trên cùng một bộ ca:

      · Pha 1 — HAI ca tick `ca_san_xuat=True` (`sx` + `dem`): phải lấy ĐÚNG hai ca đó, không lẫn
        ca văn phòng `vp` (bắt được đột biến "bỏ lọc `ca_san_xuat`" — thiếu lọc sẽ trả cả ba ca
        đang dùng). Ca `dem` (Vòng sửa 2 mục 3 / NS-2) là ca ĐÊM DUY NHẤT trong bộ — thiếu nó thì
        một `_ca_lich_may()` gọi đúng `ca_lich_xuong()` nhưng LỌC BỎ ca đêm SAU khi gọi vẫn qua được
        pha này (không có ca đêm nào để lọc mất), đúng kiểu trôi "hậu lọc" mà mục 3 sinh ra để chặn.
      · Pha 2 — tắt nốt `ca_san_xuat` của CẢ `sx` LẪN `dem`: KHÔNG còn ca nào tick ⇒ đường lùi
        `or cas` phải trả HẾT ca ĐANG DÙNG (`sx` + `vp` + `dem`, không có `tat` vì đã
        `is_active=False`), không phải rỗng (bắt được đột biến "bỏ đường lùi `or cas`" — thiếu
        đường lùi sẽ trả tập rỗng).
    """
    bo_ba = _khai_ca_bo_ba(sess)
    xl = XepLichService(sess, XepLichRepository(sess), AuditLogRepository(sess))

    tu_repo = {s.id for s in AttendanceRepository(sess).ca_lich_xuong()}
    tu_xep_lich = {s.id for s in xl._ca_lich_may()}
    assert tu_repo, "tiền đề: bộ ca phải tạo được ít nhất một ca ca_san_xuat=True + active"
    assert tu_repo == {bo_ba["sx"], bo_ba["dem"]}, f"lọc ca_san_xuat sai (pha 1) — repo trả {tu_repo}"
    assert tu_repo == tu_xep_lich, f"tập ca lệch nhau (pha 1) — repo={tu_repo}, xep_lich={tu_xep_lich}"

    sx_obj = sess.get(WorkShift, bo_ba["sx"])
    sx_obj.ca_san_xuat = False
    dem_obj = sess.get(WorkShift, bo_ba["dem"])
    dem_obj.ca_san_xuat = False
    sess.commit()

    tu_repo2 = {s.id for s in AttendanceRepository(sess).ca_lich_xuong()}
    tu_xep_lich2 = {s.id for s in xl._ca_lich_may()}
    assert tu_repo2 == {bo_ba["sx"], bo_ba["vp"], bo_ba["dem"]}, (
        f"đường lùi 'or cas' sai (pha 2) — repo trả {tu_repo2}"
    )
    assert tu_repo2 == tu_xep_lich2, (
        f"tập ca lệch nhau (pha 2) — repo={tu_repo2}, xep_lich={tu_xep_lich2}"
    )


def test_ca_lich_may_mot_nguon_duy_nhat():
    """Khoá bất biến "MỘT nguồn" bằng MÃ NGUỒN (Vòng sửa 1 mục B.2) — bài hành vi ở trên không canh
    nổi việc mai sau ai đó chép một bản TƯƠNG ĐƯƠNG hành vi vào `_ca_lich_may()` thay vì gọi lại
    `ca_lich_xuong()`: lúc đó mọi bài hành vi đều xanh, nhưng hai nơi bắt đầu trôi ra hai hướng độc
    lập — đúng kịch bản C117 sinh ra để chặn. Khuôn đã dùng trong repo:
    `test_xep_lich_service.py:1036-1043`."""
    src = inspect.getsource(XepLichService._ca_lich_may)
    # Chỉ soi THÂN hàm thật thi hành — chữ ký (`-> list[WorkShift]`) và docstring (kể chuyện "trước
    # đây tự `select(WorkShift)...`") đều nhắc hai chữ này TRONG VĂN XUÔI, soi cả `src` sẽ bắt oan.
    than_ham = src.split('"""', 2)[-1]
    assert "ca_lich_xuong" in than_ham, "_ca_lich_may() phải GỌI LẠI AttendanceRepository.ca_lich_xuong()"
    assert "select(" not in than_ham, "_ca_lich_may() không được tự SELECT — phải đi qua ca_lich_xuong()"


# --- 401/403 cho CẢ BA route mới -------------------------------------------------------------------
def test_theo_ca_khong_dang_nhap_401(client):
    assert client.get("/api/theo-doi-san-xuat/theo-ca").status_code == 401


def test_gantt_khong_dang_nhap_401(client):
    assert client.get("/api/theo-doi-san-xuat/gantt").status_code == 401


def test_theo_ca_thieu_quyen_403(client, sess):
    h = _h(_token_khong_quyen_theo_doi(sess))
    assert client.get("/api/theo-doi-san-xuat/theo-ca", headers=h).status_code == 403


def test_gantt_thieu_quyen_403(client, sess):
    h = _h(_token_khong_quyen_theo_doi(sess))
    assert client.get("/api/theo-doi-san-xuat/gantt", headers=h).status_code == 403


# --- Chống N+1: nạp theo LÔ, không lặp theo lệnh ----------------------------------------------------
def test_theo_ca_khong_n_plus_1(client, seed_credentials, sess, orders, lsx_svc, admin, customer):
    _dot_dong_don(sess, 37)
    h = _h(_tok(client, seed_credentials))
    for _ in range(3):
        _phat_hanh_that(
            sess, orders, lsx_svc, admin, customer,
            buoc=[("CTP", 15, 500), ("In", 360, 5000)],
        )
    n3 = _dem_sql(lambda: client.get("/api/theo-doi-san-xuat/theo-ca?ngay=2026-08-31", headers=h))
    for _ in range(3):
        _phat_hanh_that(
            sess, orders, lsx_svc, admin, customer,
            buoc=[("CTP", 15, 500), ("In", 360, 5000)],
        )
    n6 = _dem_sql(lambda: client.get("/api/theo-doi-san-xuat/theo-ca?ngay=2026-08-31", headers=h))
    assert n6 == n3, f"số câu SQL của /theo-ca nở theo số lệnh: {n3} → {n6}"


def test_gantt_khong_n_plus_1_truc_tong(client, seed_credentials, sess, orders, lsx_svc, admin, customer):
    """Trục TỔNG (Vòng sửa 1 mục C.3) — TĂNG số LỆNH ngoài trang, `page_size` CỐ ĐỊNH và LUÔN nhỏ
    hơn tổng số lệnh ở cả hai pha (số DÒNG trả về không đổi, luôn 5) — cô lập đúng MỘT trục: có
    vòng lặp nào chạy trên TOÀN TẬP thay vì trên đúng trang không. Bài `test_gantt_khong_n_plus_1`
    cũ (3→8 lệnh, cùng lúc page_size=5 vượt tổng ở pha 1 rồi không vượt ở pha 2) lẫn cả trục TRANG
    vào phép đo — số DÒNG trả về đổi 3→5 mới là thứ thật sự phơi ra đột biến, không phải tổng lệnh
    tăng. Tách riêng để mỗi bài canh ĐÚNG MỘT bất biến."""
    _dot_dong_don(sess, 55)
    h = _h(_tok(client, seed_credentials))
    for _ in range(6):
        _phat_hanh_that(
            sess, orders, lsx_svc, admin, customer,
            buoc=[("CTP", 15, 500), ("In", 360, 5000)],
        )
    n6 = _dem_sql(
        lambda: client.get("/api/theo-doi-san-xuat/gantt?page=1&page_size=5", headers=h)
    )
    for _ in range(4):
        _phat_hanh_that(
            sess, orders, lsx_svc, admin, customer,
            buoc=[("CTP", 15, 500), ("In", 360, 5000)],
        )
    n10 = _dem_sql(
        lambda: client.get("/api/theo-doi-san-xuat/gantt?page=1&page_size=5", headers=h)
    )
    assert n10 == n6, f"số câu SQL của /gantt nở theo TỔNG số lệnh dù cùng page_size: {n6} → {n10}"


def test_gantt_khong_n_plus_1_truc_trang(client, seed_credentials, sess, orders, lsx_svc, admin, customer):
    """Trục TRANG (Vòng sửa 1 mục C.3) — CÙNG một tập lệnh (dựng đủ MỘT lần), TĂNG `page_size` (số
    DÒNG trả về, 3 → 8): đây mới là N+1 THẬT của một endpoint đã phân trang — một câu SQL nhét
    trong vòng lặp dựng `rows` nở đúng theo số DÒNG trả về, không theo tổng số lệnh (trục TỔNG ở
    trên không bắt được ca này khi số dòng trên trang không đổi giữa hai lần đo)."""
    _dot_dong_don(sess, 57)
    h = _h(_tok(client, seed_credentials))
    for _ in range(8):
        _phat_hanh_that(
            sess, orders, lsx_svc, admin, customer,
            buoc=[("CTP", 15, 500), ("In", 360, 5000)],
        )
    n_it = _dem_sql(
        lambda: client.get("/api/theo-doi-san-xuat/gantt?page=1&page_size=3", headers=h)
    )
    n_nhieu = _dem_sql(
        lambda: client.get("/api/theo-doi-san-xuat/gantt?page=1&page_size=8", headers=h)
    )
    assert n_nhieu == n_it, f"số câu SQL của /gantt nở theo số DÒNG trả về: {n_it} → {n_nhieu}"


# --- Vòng sửa 1 mục J — page/page_size vô lý phải 422, không được âm thầm kẹp về biên -------------
def test_gantt_page_0_422(client, seed_credentials):
    h = _h(_tok(client, seed_credentials))
    assert client.get("/api/theo-doi-san-xuat/gantt?page=0", headers=h).status_code == 422


def test_gantt_page_size_qua_han_422(client, seed_credentials):
    h = _h(_tok(client, seed_credentials))
    assert client.get("/api/theo-doi-san-xuat/gantt?page_size=999", headers=h).status_code == 422


# ==================================================================================================
# TASK 18a — W1 (tám tham số lọc CHUNG cho `/theo-ca` và `/gantt`, Ruling C121, nối tiếp V2 của
# Task 17a) + W2 (`ca_id` cho `/theo-ca`, Ruling C134 đã chốt từ Task 17).
#
# Luật C127 áp cho MỌI bài dưới đây: docstring nói rõ PHÁ CÁI GÌ thì bài đỏ, fixture LUÔN có phần
# tử KHÔNG thoả. TÁI DÙNG `hai_lenh_doi_nhau`/`ghep_bon_truc` từ `test_theo_doi_kanban.py` (import
# ở đầu file) — tám trục lọc đi qua ĐÚNG MỘT hàm `_loc_ban` với `/kanban`/`/theo-may`, dựng một bộ
# fixture đối nhau THỨ HAI ở đây là hai bản chắc chắn trôi lệch nhau, đúng nguy cơ mà docstring
# `tests/lenh_sx_fixtures.py` đã cảnh báo.
#
# `/theo-ca` không trả `lsx_id` trên từng việc (khác `/kanban`/`/gantt`) nên các bài dưới đây nhận
# diện lệnh qua ID CÔNG VIỆC đại diện (`cv_ctp_a`/`cv_ctp_b` của fixture), không so trực tiếp lsx_id.
# ==================================================================================================
def _ids_gantt(client, h, truy_van: str = "") -> set[int]:
    d = client.get(f"/api/theo-doi-san-xuat/gantt{truy_van}", headers=h).json()
    return {r["lsx_id"] for r in d["rows"]}


def _viec_ids_theo_ca(client, h, truy_van: str = "?ngay=2026-08-31") -> set[int]:
    d = client.get(f"/api/theo-doi-san-xuat/theo-ca{truy_van}", headers=h).json()
    return {v["cong_viec_id"] for c in d["ca"] for v in c["viec"]}


# --- W1: tám tham số lọc của /gantt -----------------------------------------------------------------
def test_gantt_loc_thu_hep_ids_truoc_khi_nap(sess, hai_lenh_doi_nhau, monkeypatch):
    """Ruling C121, khuôn `test_kanban_loc_thu_hep_ids_truoc_khi_nap`. Đỏ nếu bộ lọc của `/gantt`
    chạy SAU `boi_canh.nap()` (hoặc bị bỏ hẳn): `nap()` khi đó vẫn nhận cả hai lệnh dù `loc` chỉ
    khớp một."""
    ghi: dict = {}
    nap_that = bang_theo_doi.boi_canh.nap

    def rinh(db, lsx_ids):
        ghi["ids"] = list(lsx_ids)
        return nap_that(db, lsx_ids)

    monkeypatch.setattr(bang_theo_doi.boi_canh, "nap", rinh)
    bang_theo_doi.gantt(sess, sale_ids=None, loc=bang_theo_doi.BoLoc(uu_tien="gap"))
    assert hai_lenh_doi_nhau["lsx_a"] in ghi["ids"], "lệnh Gấp phải lọt vào nap()"
    assert hai_lenh_doi_nhau["lsx_b"] not in ghi["ids"], (
        "lệnh KHÔNG gấp vẫn được nạp — bộ lọc chạy SAU nap(), trái C121"
    )


def test_gantt_loc_q(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `q` của `_loc_ban` không được gắn vào `/gantt` (trả cả hai lệnh)."""
    h = _h(_tok(client, seed_credentials))
    ids = _ids_gantt(client, h, "?q=ALPHA")
    assert hai_lenh_doi_nhau["lsx_a"] in ids
    assert hai_lenh_doi_nhau["lsx_b"] not in ids


def test_gantt_loc_khach_hang(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `khach_hang_id` không được gắn vào `/gantt`."""
    h = _h(_tok(client, seed_credentials))
    ids = _ids_gantt(client, h, "?khach_hang_id=%d" % hai_lenh_doi_nhau["kh_b"])
    assert hai_lenh_doi_nhau["lsx_b"] in ids
    assert hai_lenh_doi_nhau["lsx_a"] not in ids


def test_gantt_loc_may(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `may_id` không được gắn vào `/gantt`, hoặc gắn bằng một vị ngữ khác
    `danh_sach._co_buoc` mà bỏ sót vế công việc (lệnh A gắn máy trên CÔNG VIỆC, không trên routing)."""
    h = _h(_tok(client, seed_credentials))
    ids = _ids_gantt(client, h, "?may_id=%d" % hai_lenh_doi_nhau["may_a"])
    assert hai_lenh_doi_nhau["lsx_a"] in ids
    assert hai_lenh_doi_nhau["lsx_b"] not in ids


def test_gantt_loc_cong_doan(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `cong_doan_id` không được gắn vào `/gantt`."""
    h = _h(_tok(client, seed_credentials))
    ids = _ids_gantt(client, h, "?cong_doan_id=%d" % hai_lenh_doi_nhau["cd_b"])
    assert hai_lenh_doi_nhau["lsx_b"] in ids
    assert hai_lenh_doi_nhau["lsx_a"] not in ids


def test_gantt_loc_nhom_cong_doan(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `nhom_cong_doan` không được gắn vào `/gantt`. Lọc `finishing` (nhóm của lệnh B)
    chứ không `print`: mọi lệnh khác trong DB cũng `print` nên lọc chiều đó "tình cờ" xanh."""
    h = _h(_tok(client, seed_credentials))
    ids = _ids_gantt(client, h, "?nhom_cong_doan=finishing")
    assert hai_lenh_doi_nhau["lsx_b"] in ids
    assert hai_lenh_doi_nhau["lsx_a"] not in ids


def test_gantt_loc_cong_nhan(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `cong_nhan_id` không được gắn vào `/gantt`."""
    h = _h(_tok(client, seed_credentials))
    ids = _ids_gantt(client, h, "?cong_nhan_id=%d" % hai_lenh_doi_nhau["tho_a"])
    assert hai_lenh_doi_nhau["lsx_a"] in ids
    assert hai_lenh_doi_nhau["lsx_b"] not in ids


def test_gantt_loc_trang_thai_viec(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `trang_thai_viec` không được gắn vào `/gantt`. Chỉ lệnh A có bước `completed`."""
    h = _h(_tok(client, seed_credentials))
    ids = _ids_gantt(client, h, "?trang_thai_viec=completed")
    assert hai_lenh_doi_nhau["lsx_a"] in ids
    assert hai_lenh_doi_nhau["lsx_b"] not in ids


def test_gantt_loc_uu_tien(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `uu_tien` không được gắn vào `/gantt`, hoặc hai nhánh gap/binh_thuong bị đảo."""
    h = _h(_tok(client, seed_credentials))
    gap = _ids_gantt(client, h, "?uu_tien=gap")
    thuong = _ids_gantt(client, h, "?uu_tien=binh_thuong")
    assert hai_lenh_doi_nhau["lsx_a"] in gap and hai_lenh_doi_nhau["lsx_b"] not in gap
    assert hai_lenh_doi_nhau["lsx_b"] in thuong and hai_lenh_doi_nhau["lsx_a"] not in thuong


def test_gantt_khong_loc_thi_thay_ca_hai(client, seed_credentials, hai_lenh_doi_nhau):
    """TIỀN ĐỀ của tám bài trên — không tham số nào ⇒ KHÔNG lọc gì. Đỏ nếu ai đó gán mặc định cho
    một ô lọc (vd `_thanh_loc` fabricat một `uu_tien` mặc định) — khi đó tám bài kia vẫn có thể
    xanh mà Gantt mặc định đã giấu mất một nửa số lệnh."""
    h = _h(_tok(client, seed_credentials))
    ids = _ids_gantt(client, h)
    assert {hai_lenh_doi_nhau["lsx_a"], hai_lenh_doi_nhau["lsx_b"]} <= ids


def test_gantt_gia_tri_la_bi_chan_422(client, seed_credentials):
    """Đỏ nếu `/gantt` không thật sự nhận `loc: ThanhLoc` (route quên khai tham số này): giá trị sai
    chính tả sẽ bị bỏ qua thay vì chặn — endpoint trả 200 với bảng đầy đủ."""
    h = _h(_tok(client, seed_credentials))
    for tv in ("?uu_tien=khan_cap", "?trang_thai_viec=xong", "?nhom_cong_doan=in"):
        r = client.get("/api/theo-doi-san-xuat/gantt" + tv, headers=h)
        assert r.status_code == 422, f"{tv} phải bị chặn ở cửa, nhận {r.status_code}"


# --- W1: tám tham số lọc của /theo-ca ----------------------------------------------------------------
def test_theo_ca_loc_thu_hep_ids_truoc_khi_nap(sess, hai_lenh_doi_nhau, monkeypatch):
    """Ruling C121 — đỏ nếu bộ lọc của `/theo-ca` chạy SAU `boi_canh.nap()`. `/theo-ca` nạp trên tập
    `ids` đã đi qua UNION (`truc_tiep`/`qua_ghep` của cửa sổ ngày) RỒI mới `_loc_ban`; bài này rình
    thẳng đối số cuối cùng của `nap()`, không đo gián tiếp qua số câu SQL."""
    ghi: dict = {}
    nap_that = bang_theo_doi.boi_canh.nap

    def rinh(db, lsx_ids):
        ghi["ids"] = list(lsx_ids)
        return nap_that(db, lsx_ids)

    monkeypatch.setattr(bang_theo_doi.boi_canh, "nap", rinh)
    bang_theo_doi.theo_ca(
        sess, sale_ids=None, ngay=date(2026, 8, 31), loc=bang_theo_doi.BoLoc(uu_tien="gap"),
    )
    assert hai_lenh_doi_nhau["lsx_a"] in ghi["ids"], "lệnh Gấp phải lọt vào nap()"
    assert hai_lenh_doi_nhau["lsx_b"] not in ghi["ids"], (
        "lệnh KHÔNG gấp vẫn được nạp — bộ lọc chạy SAU nap(), trái C121"
    )


def test_theo_ca_loc_q(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `q` không được gắn vào `/theo-ca`."""
    h = _h(_tok(client, seed_credentials))
    ids = _viec_ids_theo_ca(client, h, "?ngay=2026-08-31&q=ALPHA")
    assert hai_lenh_doi_nhau["cv_ctp_a"] in ids
    assert hai_lenh_doi_nhau["cv_ctp_b"] not in ids


def test_theo_ca_loc_khach_hang(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `khach_hang_id` không được gắn vào `/theo-ca`."""
    h = _h(_tok(client, seed_credentials))
    ids = _viec_ids_theo_ca(
        client, h, "?ngay=2026-08-31&khach_hang_id=%d" % hai_lenh_doi_nhau["kh_b"]
    )
    assert hai_lenh_doi_nhau["cv_ctp_b"] in ids
    assert hai_lenh_doi_nhau["cv_ctp_a"] not in ids


def test_theo_ca_loc_may(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `may_id` không được gắn vào `/theo-ca`."""
    h = _h(_tok(client, seed_credentials))
    ids = _viec_ids_theo_ca(client, h, "?ngay=2026-08-31&may_id=%d" % hai_lenh_doi_nhau["may_a"])
    assert hai_lenh_doi_nhau["cv_ctp_a"] in ids
    assert hai_lenh_doi_nhau["cv_ctp_b"] not in ids


def test_theo_ca_loc_cong_doan(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `cong_doan_id` không được gắn vào `/theo-ca`."""
    h = _h(_tok(client, seed_credentials))
    ids = _viec_ids_theo_ca(
        client, h, "?ngay=2026-08-31&cong_doan_id=%d" % hai_lenh_doi_nhau["cd_b"]
    )
    assert hai_lenh_doi_nhau["cv_ctp_b"] in ids
    assert hai_lenh_doi_nhau["cv_ctp_a"] not in ids


def test_theo_ca_loc_nhom_cong_doan(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `nhom_cong_doan` không được gắn vào `/theo-ca`. Lọc `finishing` (nhóm của lệnh
    B), không phải `print` — cùng lý do bài `/gantt` tương ứng."""
    h = _h(_tok(client, seed_credentials))
    ids = _viec_ids_theo_ca(client, h, "?ngay=2026-08-31&nhom_cong_doan=finishing")
    assert hai_lenh_doi_nhau["cv_ctp_b"] in ids
    assert hai_lenh_doi_nhau["cv_ctp_a"] not in ids


def test_theo_ca_loc_cong_nhan(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `cong_nhan_id` không được gắn vào `/theo-ca`."""
    h = _h(_tok(client, seed_credentials))
    ids = _viec_ids_theo_ca(
        client, h, "?ngay=2026-08-31&cong_nhan_id=%d" % hai_lenh_doi_nhau["tho_a"]
    )
    assert hai_lenh_doi_nhau["cv_ctp_a"] in ids
    assert hai_lenh_doi_nhau["cv_ctp_b"] not in ids


def test_theo_ca_loc_trang_thai_viec(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `trang_thai_viec` không được gắn vào `/theo-ca`. Chỉ lệnh A có bước `completed`
    (bước In, 19:15 — vẫn trong cửa sổ ngày `?ngay=2026-08-31`)."""
    h = _h(_tok(client, seed_credentials))
    ids = _viec_ids_theo_ca(client, h, "?ngay=2026-08-31&trang_thai_viec=completed")
    assert hai_lenh_doi_nhau["cv_ctp_a"] in ids
    assert hai_lenh_doi_nhau["cv_ctp_b"] not in ids


def test_theo_ca_loc_uu_tien(client, seed_credentials, hai_lenh_doi_nhau):
    """Đỏ nếu nhánh `uu_tien` không được gắn vào `/theo-ca`, hoặc hai nhánh bị đảo."""
    h = _h(_tok(client, seed_credentials))
    gap = _viec_ids_theo_ca(client, h, "?ngay=2026-08-31&uu_tien=gap")
    thuong = _viec_ids_theo_ca(client, h, "?ngay=2026-08-31&uu_tien=binh_thuong")
    assert hai_lenh_doi_nhau["cv_ctp_a"] in gap and hai_lenh_doi_nhau["cv_ctp_b"] not in gap
    assert hai_lenh_doi_nhau["cv_ctp_b"] in thuong and hai_lenh_doi_nhau["cv_ctp_a"] not in thuong


def test_theo_ca_khong_loc_thi_thay_ca_hai(client, seed_credentials, hai_lenh_doi_nhau):
    """TIỀN ĐỀ — không tham số lọc nào ⇒ KHÔNG lọc gì. Đỏ nếu ai đó fabricat một mặc định cho một ô
    lọc CHUNG (`_thanh_loc`) — mặc định đó rò từ `/kanban` sang cả `/theo-ca` vì cùng một khai báo."""
    h = _h(_tok(client, seed_credentials))
    ids = _viec_ids_theo_ca(client, h, "?ngay=2026-08-31")
    assert {hai_lenh_doi_nhau["cv_ctp_a"], hai_lenh_doi_nhau["cv_ctp_b"]} <= ids


def test_theo_ca_gia_tri_la_bi_chan_422(client, seed_credentials):
    """Đỏ nếu `/theo-ca` không thật sự nhận `loc: ThanhLoc` (route quên khai tham số này)."""
    h = _h(_tok(client, seed_credentials))
    for tv in ("?uu_tien=khan_cap", "?trang_thai_viec=xong", "?nhom_cong_doan=in"):
        r = client.get("/api/theo-doi-san-xuat/theo-ca" + tv, headers=h)
        assert r.status_code == 422, f"{tv} phải bị chặn ở cửa, nhận {r.status_code}"


# --- W1, brief mục cảnh báo riêng: /gantt phải lọc TRƯỚC cắt trang, total phải là số SAU khi lọc ----
@pytest.fixture
def bay_lenh_loc_qua_mot_trang(sess, admin, customer) -> dict:
    """5 lệnh GẤP (`M1..M5`, hạn tăng dần) XEN KẼ 2 lệnh KHÔNG gấp (`X1`/`X2`, hạn đứng GIỮA dãy hạn
    của các lệnh Gấp) — đúng hình dạng brief cảnh báo: nếu bộ lọc chạy SAU khi cắt trang (thay vì
    TRƯỚC), trang 1 (`page_size=3`, không lọc trước) sẽ là [M1, X1, M2] chứ không phải [M1, M2, M3],
    và `total` sẽ đếm nhầm 7 thay vì 5.

    `X1`/`X2` là phần tử "không thoả" BẮT BUỘC (C127): thiếu chúng, 5 lệnh Gấp nằm liền mạch theo
    hạn, "lọc trước cắt trang" và "cắt trang rồi lọc" trả về CÙNG một kết quả — không phân biệt được."""
    thu_tu = [
        ("LSX-PG-M1", date(2026, 10, 1), True),
        ("LSX-PG-X1", date(2026, 10, 2), False),
        ("LSX-PG-M2", date(2026, 10, 3), True),
        ("LSX-PG-X2", date(2026, 10, 4), False),
        ("LSX-PG-M3", date(2026, 10, 5), True),
        ("LSX-PG-M4", date(2026, 10, 7), True),
        ("LSX-PG-M5", date(2026, 10, 9), True),
    ]
    ket: dict[str, int] = {}
    for ma, han, rush in thu_tu:
        ket[ma] = _lenh_tho(
            sess, ma=ma, sale_user_id=admin.id, customer_id=customer.id,
            han_sx=han, is_rush=rush,
        )
    return ket


def test_gantt_loc_ap_truoc_khi_cat_trang_total_va_trang_2_dung(
    client, seed_credentials, bay_lenh_loc_qua_mot_trang,
):
    """BẪY CHÍNH của brief mục W1 — đỏ nếu lọc chạy SAU cắt trang, hoặc `total` đếm trên tập CHƯA
    lọc: cả hai đột biến đều làm trang 1 lẫn `LSX-PG-X1` và/hoặc báo `total=7` thay vì 5. Khẳng định
    CẢ `total` LẪN nội dung ĐÚNG của trang 2 (Ruling C119: so dòng, không chỉ đếm)."""
    h = _h(_tok(client, seed_credentials))
    trang1 = client.get(
        "/api/theo-doi-san-xuat/gantt?uu_tien=gap&page=1&page_size=3", headers=h
    ).json()
    trang2 = client.get(
        "/api/theo-doi-san-xuat/gantt?uu_tien=gap&page=2&page_size=3", headers=h
    ).json()

    assert trang1["total"] == 5, f"total phải đếm ĐÚNG 5 lệnh Gấp (SAU lọc), nhận {trang1['total']}"
    assert trang2["total"] == 5
    assert [r["ma"] for r in trang1["rows"]] == ["LSX-PG-M1", "LSX-PG-M2", "LSX-PG-M3"], (
        f"trang 1 lẫn lệnh KHÔNG gấp — lọc chạy SAU cắt trang, nhận {[r['ma'] for r in trang1['rows']]}"
    )
    assert [r["ma"] for r in trang2["rows"]] == ["LSX-PG-M4", "LSX-PG-M5"], (
        f"trang 2 sai nội dung, nhận {[r['ma'] for r in trang2['rows']]}"
    )


# --- C127 mục 4: quên cầu bài ghép ------------------------------------------------------------------
def test_gantt_loc_may_qua_cau_bai_ghep(client, seed_credentials, ghep_bon_truc):
    """Đỏ nếu vế 2 (`bai_ghep_cong_doan_map`) của `danh_sach._co_buoc` không tới được `/gantt`: máy
    THẬT của ca in ghép chỉ nằm trên công việc CHUNG, không chỗ nào ghi ngược về
    `lsx_cong_doan.may_id`. Lệnh thường (`c`) là phần tử KHÔNG thoả."""
    g = ghep_bon_truc
    h = _h(_tok(client, seed_credentials))
    assert _ids_gantt(client, h, "?may_id=%d" % g["may"]) == {g["a"], g["b"]}


def test_theo_ca_loc_trang_thai_viec_qua_cau_bai_ghep(client, seed_credentials, sess, ghep_bon_truc):
    """Đỏ nếu vế 2 của `_co_viec` không tới được `/theo-ca`: `completed` chỉ nằm trên công việc
    CHUNG của ca in ghép. `ghep_doi` không tự đặt mốc kế hoạch cho `cv_chung` — gán tay vào cửa sổ
    ngày đang hỏi, đúng khuôn `test_theo_ca_thay_viec_ghep_qua_cau_bai_ghep`. Lệnh thường (`c`, vẫn
    `released`, vẫn CÓ việc trong CÙNG cửa sổ ngày) là phần tử KHÔNG thoả.

    Từ 16/09/2026 việc ĐÃ chạy xếp theo PHIÊN THẬT chứ không theo kế hoạch — `_dat_xong_luc` đặt
    phiên ở 18:00–19:00 UTC thật (rạng sáng 01/09 giờ xưởng), nên phiên cũng phải dời vào đúng
    khung giờ kế hoạch của ngày đang hỏi, không thì việc hiện ở 01/09 và bài đỏ vì luật xếp chứ
    không vì cầu lọc."""
    g = ghep_bon_truc
    cv_chung = sess.get(SanXuatCongViec, g["cv_chung"])
    cv_chung.du_kien_bat_dau = datetime(2026, 8, 31, 10, 0, tzinfo=timezone.utc)
    cv_chung.du_kien_ket_thuc = datetime(2026, 8, 31, 11, 0, tzinfo=timezone.utc)
    for p in sess.query(SanXuatPhienChay).filter_by(cong_viec_id=cv_chung.id).all():
        p.bat_dau = ve_utc_that(cv_chung.du_kien_bat_dau)
        p.ket_thuc = ve_utc_that(cv_chung.du_kien_ket_thuc)
    sess.commit()

    h = _h(_tok(client, seed_credentials))
    thay = _viec_ids_theo_ca(client, h, "?ngay=2026-08-31&trang_thai_viec=completed")
    c_cvs = {cv.id for cv in _cvs(sess, g["c"])}
    assert g["cv_chung"] in thay, "việc ghép completed không lọt qua trang_thai_viec — mất cầu"
    assert not (c_cvs & thay), "lệnh KHÔNG ghép cũng lọt vào ?trang_thai_viec=completed"


# --- C127 mục 3: mù trước phạm vi quyền -------------------------------------------------------------
def test_gantt_loc_bam_pham_vi_nguoi_goi(sess, sale_own, admin, customer):
    """Đỏ nếu `loc` được gắn vào một `select(Lsx.id)` TÁCH KHỎI `pham_vi.loc_lsx_da_phat_hanh(...,
    sale_ids)` (lọc đúng dưới token ADMIN scope `all` — không phân biệt được — nhưng vượt luôn ranh
    giới `sale_ids` hẹp của một Sale). Gọi thẳng service vì phạm vi đến từ TOKEN.

    `lenh_khac` (Gấp, KHÔNG thuộc `sale_own`) là phần tử KHÔNG thoả PHẠM VI; `lenh_own_thuong`
    (thuộc `sale_own`, KHÔNG gấp) là phần tử KHÔNG thoả LỌC — thiếu một trong hai thì bài không tách
    được "chỉ scope đúng" khỏi "chỉ lọc đúng"."""
    lenh_own = _lenh_tho(
        sess, ma="LSX-GT-OWN-GAP", sale_user_id=sale_own.id, customer_id=customer.id, is_rush=True,
    )
    lenh_khac = _lenh_tho(
        sess, ma="LSX-GT-KHAC-GAP", sale_user_id=admin.id, customer_id=customer.id, is_rush=True,
    )
    lenh_own_thuong = _lenh_tho(
        sess, ma="LSX-GT-OWN-THUONG", sale_user_id=sale_own.id, customer_id=customer.id,
        is_rush=False,
    )
    loc = bang_theo_doi.BoLoc(uu_tien="gap")
    ids_het = {
        r["lsx_id"]
        for r in bang_theo_doi.gantt(sess, sale_ids=None, loc=loc, page=1, page_size=50)["rows"]
    }
    ids_hep = {
        r["lsx_id"]
        for r in bang_theo_doi.gantt(sess, sale_ids={sale_own.id}, loc=loc, page=1, page_size=50)[
            "rows"
        ]
    }
    assert {lenh_own, lenh_khac} <= ids_het, "tiền đề: scope `all` phải thấy cả hai lệnh Gấp"
    assert ids_hep == {lenh_own}, f"lọc dưới sale_ids hẹp phải CHỈ còn lệnh của Sale đó, nhận {ids_hep}"
    assert lenh_own_thuong not in ids_hep, "phạm vi hẹp đúng nhưng lọc uu_tien bị bỏ qua"


def test_theo_ca_loc_bam_pham_vi_nguoi_goi(sess, orders, lsx_svc, admin, customer, sale_own):
    """Như bài `/gantt` ở trên nhưng cho `theo_ca()` — nơi `loc` gắn vào một câu ĐÃ `union()`
    (`truc_tiep`/`qua_ghep`), một nguy cơ khác gantt: phạm vi có thể bị hoà tan tuỳ cách viết bên
    trong. Bài khoá KẾT QUẢ CUỐI CÙNG bất kể cách viết.

    BA lệnh, không phải hai: `lenh_khac` (Gấp, KHÔNG thuộc `sale_own`) là phần tử KHÔNG thoả PHẠM
    VI; `lenh_own_thuong` (thuộc `sale_own`, KHÔNG gấp) là phần tử KHÔNG thoả LỌC — thiếu nó thì bài
    không phân biệt được "chỉ scope đúng" khỏi "chỉ lọc đúng" (đúng khoảng trống mà bản trước của bài
    này bỏ sót: xoá hẳn `loc` khỏi `theo_ca()` vẫn xanh, vì trong phạm vi hẹp CHỈ có một lệnh Gấp)."""
    _dot_dong_don(sess, 91)
    lenh_own = _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=[("CTP", 15, 500)])
    lenh_khac = _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=[("CTP", 15, 500)])
    lenh_own_thuong = _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=[("CTP", 15, 500)])
    sess.get(Lsx, lenh_own).is_rush = True
    sess.get(Lsx, lenh_khac).is_rush = True
    sess.get(Order, sess.get(Lsx, lenh_own).order_id).sale_user_id = sale_own.id
    sess.get(Order, sess.get(Lsx, lenh_own_thuong).order_id).sale_user_id = sale_own.id
    sess.commit()

    cv_own = _cvs(sess, lenh_own)[0].id
    cv_khac = _cvs(sess, lenh_khac)[0].id
    cv_own_thuong = _cvs(sess, lenh_own_thuong)[0].id
    loc = bang_theo_doi.BoLoc(uu_tien="gap")
    ngay = date(2026, 8, 31)

    het = {
        v["cong_viec_id"]
        for c in bang_theo_doi.theo_ca(sess, sale_ids=None, ngay=ngay, loc=loc)["ca"]
        for v in c["viec"]
    }
    hep = {
        v["cong_viec_id"]
        for c in bang_theo_doi.theo_ca(sess, sale_ids={sale_own.id}, ngay=ngay, loc=loc)["ca"]
        for v in c["viec"]
    }
    assert {cv_own, cv_khac} <= het, "tiền đề: scope `all` phải thấy việc của cả hai lệnh Gấp"
    assert hep == {cv_own}, f"lọc dưới sale_ids hẹp phải CHỈ còn việc của Sale đó, nhận {hep}"
    assert cv_own_thuong not in hep, "phạm vi hẹp đúng nhưng lọc uu_tien=gap bị bỏ qua"


# ==================================================================================================
# TASK 18a — W2: `?ca_id=` của `/theo-ca` (Ruling C134, đã chốt từ Task 17 — KHÔNG thiết kế lại).
# Lọc CỘT CA trả về, thuần Python SAU cửa sổ ngày, không thêm câu SQL, không N+1.
# ==================================================================================================
@pytest.fixture
def hai_ca_va_ngoai_ca(sess, orders, lsx_svc, admin, customer) -> dict:
    """Hai ca THẬT liền kề (06-14, 14-22), MỖI ca một việc RIÊNG, cộng MỘT việc 23:00 không ca nào
    phủ (rơi vào "Ngoài ca") — canh W2: việc của ca X là phần tử KHÔNG thoả khi hỏi `?ca_id=<ca Y>`
    (và ngược lại); việc "Ngoài ca" KHÔNG thoả khi hỏi đích danh một ca thật, và là phần tử DUY NHẤT
    thoả khi hỏi `?ca_id=ngoai_ca`."""
    ca_x = WorkShift(
        name="Ca X (W2)", start_minute=6 * 60, end_minute=14 * 60,
        is_active=True, ca_san_xuat=True,
    )
    ca_y = WorkShift(
        name="Ca Y (W2)", start_minute=14 * 60, end_minute=22 * 60,
        is_active=True, ca_san_xuat=True,
    )
    sess.add_all([ca_x, ca_y])
    sess.commit()

    _dot_dong_don(sess, 93)
    lsx_x = _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=[("CTP", 15, 500)])
    lsx_y = _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=[("CTP", 15, 500)])
    lsx_ngoai = _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=[("CTP", 15, 500)])
    cv_x = _cvs(sess, lsx_x)[0]
    cv_y = _cvs(sess, lsx_y)[0]
    cv_ngoai = _cvs(sess, lsx_ngoai)[0]
    cv_x.du_kien_bat_dau = datetime(2026, 8, 31, 8, 0, tzinfo=timezone.utc)
    cv_y.du_kien_bat_dau = datetime(2026, 8, 31, 16, 0, tzinfo=timezone.utc)
    cv_ngoai.du_kien_bat_dau = datetime(2026, 8, 31, 23, 0, tzinfo=timezone.utc)
    sess.commit()
    return {
        "ca_x": ca_x.id, "ca_y": ca_y.id,
        "cv_x": cv_x.id, "cv_y": cv_y.id, "cv_ngoai": cv_ngoai.id,
    }


def test_theo_ca_ca_id_chon_dung_mot_ca(client, seed_credentials, hai_ca_va_ngoai_ca):
    """Đỏ nếu `?ca_id=<id>` không lọc CỘT CA trả về (hoặc lọc sai chiều): phải trả DUY NHẤT ca đó —
    việc của ca KIA và rổ Ngoài ca đều biến mất khỏi PAYLOAD (lọc hiển thị, không phải mất dữ liệu
    ở tầng cửa sổ ngày — cửa sổ đã nạp đủ cả ba việc trước khi lọc này chạy)."""
    g = hai_ca_va_ngoai_ca
    h = _h(_tok(client, seed_credentials))
    d = client.get(
        f"/api/theo-doi-san-xuat/theo-ca?ngay=2026-08-31&ca_id={g['ca_x']}", headers=h
    ).json()
    assert [c["id"] for c in d["ca"]] == [g["ca_x"]], f"phải CHỈ còn ca_x, nhận {d['ca']}"
    assert g["cv_x"] in {v["cong_viec_id"] for v in d["ca"][0]["viec"]}


def test_theo_ca_ca_id_chon_ngoai_ca(client, seed_credentials, hai_ca_va_ngoai_ca):
    """Sentinel `CA_ID_NGOAI_CA` ("ngoai_ca") phải chọn ĐÚNG rổ `id=None`, loại cả hai ca thật. Đây
    là bài đóng đúng lỗ brief nhấn: "Im lặng là lỗi" — thiếu case này thì rổ Ngoài ca không có giá
    trị nào để FE gõ vào URL mà chọn riêng nó."""
    g = hai_ca_va_ngoai_ca
    h = _h(_tok(client, seed_credentials))
    d = client.get(
        "/api/theo-doi-san-xuat/theo-ca?ngay=2026-08-31&ca_id=ngoai_ca", headers=h
    ).json()
    assert [c["id"] for c in d["ca"]] == [None]
    assert g["cv_ngoai"] in {v["cong_viec_id"] for v in d["ca"][0]["viec"]}
    assert g["cv_x"] not in {v["cong_viec_id"] for v in d["ca"][0]["viec"]}


def test_theo_ca_khong_ca_id_thi_van_ca_hai_loai(client, seed_credentials, hai_ca_va_ngoai_ca):
    """TIỀN ĐỀ W2 — vắng `?ca_id=` phải KHÔNG đổi hành vi cũ: cả hai ca thật LẪN rổ Ngoài ca đều có
    mặt. Đỏ nếu ai đó lỡ áp một `ca_id` mặc định (vd luôn lọc theo ca đầu tiên)."""
    g = hai_ca_va_ngoai_ca
    h = _h(_tok(client, seed_credentials))
    d = client.get("/api/theo-doi-san-xuat/theo-ca?ngay=2026-08-31", headers=h).json()
    ids = {c["id"] for c in d["ca"]}
    assert {g["ca_x"], g["ca_y"], None} <= ids


def test_theo_ca_ca_id_khong_them_cau_sql(client, seed_credentials, hai_ca_va_ngoai_ca):
    """W2 khẳng định "không N+1" — lọc `ca_id` là thuần Python SAU khi đã nạp xong. Đỏ nếu ai đó lỡ
    tay thêm một câu tra cứu riêng cho `ca_id` (vd SELECT WorkShift để validate nó "có tồn tại
    không" trước khi lọc)."""
    g = hai_ca_va_ngoai_ca
    h = _h(_tok(client, seed_credentials))
    khong = _dem_sql(
        lambda: client.get("/api/theo-doi-san-xuat/theo-ca?ngay=2026-08-31", headers=h)
    )
    co = _dem_sql(
        lambda: client.get(
            f"/api/theo-doi-san-xuat/theo-ca?ngay=2026-08-31&ca_id={g['ca_x']}", headers=h
        )
    )
    assert co == khong, f"?ca_id= kéo thêm câu SQL: {khong} → {co}"


def test_theo_ca_ca_id_gia_tri_sai_kieu_422(client, seed_credentials):
    """Đỏ nếu `ca_id` khai kiểu lỏng lẻo (`str`/không ràng buộc `Literal`): giá trị vừa không phải
    số vừa không phải sentinel `"ngoai_ca"` phải bị chặn Ở CỬA bằng 422."""
    h = _h(_tok(client, seed_credentials))
    r = client.get("/api/theo-doi-san-xuat/theo-ca?ca_id=abc", headers=h)
    assert r.status_code == 422, f"ca_id=abc phải bị chặn ở cửa, nhận {r.status_code}"


def test_theo_ca_ca_id_ngoai_ca_rong_van_tra_ve_mot_phan_tu(
    client, seed_credentials, hai_ca_va_ngoai_ca,
):
    """Ca biên tự nghĩ thêm (không có trong brief): hỏi `?ca_id=ngoai_ca` cho một NGÀY KHÔNG có việc
    nào rơi ngoài ca (`?ngay=2026-09-01` — `hai_ca_va_ngoai_ca` chỉ đặt việc ở 2026-08-31) phải vẫn
    trả về DUY NHẤT một phần tử `{"id": None, "viec": []}`, KHÔNG phải `[]` rỗng toàn bộ. Đỏ nếu mã
    lẫn lộn "rổ Ngoài ca không có việc nào" với "không khớp `ca_id`" (nhánh `id lạ` ở bài trên) — hai
    tình huống này PHẢI trả hai hình dạng khác nhau: rổ Ngoài ca luôn phải HIỆN DIỆN (dù trống), còn
    `ca_id` lạ mới là hình dạng trả `[]`."""
    h = _h(_tok(client, seed_credentials))
    d = client.get(
        "/api/theo-doi-san-xuat/theo-ca?ngay=2026-09-01&ca_id=ngoai_ca", headers=h
    ).json()
    assert d["ca"] == [
        {"id": None, "ten": bang_theo_doi.NHAN_NGOAI_CA, "bat_dau_phut": None,
         "ket_thuc_phut": None, "qua_nua_dem": False, "viec": []}
    ], f"rổ Ngoài ca rỗng phải vẫn HIỆN DIỆN một phần tử, nhận {d['ca']}"


# ==================================================================================================
# TASK 17a — V3 (cửa sổ thời gian + lane cho máy rảnh, C126) và V4 (block mang cặp `(lsx_id, ma)`,
# C123) của `/theo-may`.
#
# Luật C127: mỗi bài nói rõ PHÁ CÁI GÌ thì nó đỏ, và fixture LUÔN có phần tử KHÔNG thoả điều kiện
# đang canh. Riêng cửa sổ thời gian còn thêm một ràng buộc của brief: "cửa sổ SQL chỉ được NỚI,
# KHÔNG được THU HẸP" — nên `viec_quanh_cua_so` đặt việc ĐÚNG BIÊN (23:00 của ngày `den`), đúng chỗ
# Task 16 từng cắt mất ở `/theo-ca`.
# ==================================================================================================
NGAY_CUA_SO = date(2026, 9, 10)


@pytest.fixture
def viec_quanh_cua_so(sess, orders, lsx_svc, admin, customer) -> dict:
    """MỘT lệnh với SÁU công việc rải quanh cửa sổ một ngày (10/09/2026), cộng MỘT lệnh nằm TRỌN
    ngoài cửa sổ.

        khoá           mốc kế hoạch                      trong cửa sổ 10/09?
        bien_dau       10/09 00:00 → 00:30               CÓ (biên trái)
        bien_cuoi      10/09 23:00 → 23:30               CÓ (biên phải — chỗ Task 16 cắt mất)
        vat_qua        05/09 08:00 → 15/09 17:00         CÓ (chồng lấn, không "bắt đầu trong")
        chua_xep       NULL → NULL                       CÓ (chưa xếp giờ thì luôn phải hiện)
        hom_truoc      09/09 08:00 → 09:00               KHÔNG
        hom_sau        11/09 00:30 → 01:00               KHÔNG

    Bốn phần tử "có" và hai phần tử "không" nằm trong CÙNG một lệnh là cố ý: câu SQL chọn LỆNH
    (lệnh này thoả nên lọt qua), còn phép chọn BLOCK mới phân biệt sáu việc — bài test vì thế đo
    được đúng tầng Python mà không bị tầng SQL che. Lệnh thứ hai (`lsx_ngoai`, mọi việc 20/09) là
    phần tử "không thoả" ở tầng SQL.
    """
    _dot_dong_don(sess, 73)
    lsx_id = _phat_hanh_that(
        sess, orders, lsx_svc, admin, customer,
        buoc=[(ten, 30, 500) for ten in
              ("Biên đầu", "Biên cuối", "Vắt qua", "Chưa xếp", "Hôm trước", "Hôm sau")],
    )
    cvs = {cv.ten_cong_doan: cv for cv in _cvs(sess, lsx_id)}
    moc = {
        "Biên đầu": (datetime(2026, 9, 10, 0, 0), datetime(2026, 9, 10, 0, 30)),
        "Biên cuối": (datetime(2026, 9, 10, 23, 0), datetime(2026, 9, 10, 23, 30)),
        "Vắt qua": (datetime(2026, 9, 5, 8, 0), datetime(2026, 9, 15, 17, 0)),
        "Chưa xếp": (None, None),
        "Hôm trước": (datetime(2026, 9, 9, 8, 0), datetime(2026, 9, 9, 9, 0)),
        "Hôm sau": (datetime(2026, 9, 11, 0, 30), datetime(2026, 9, 11, 1, 0)),
    }
    for ten, (bd, kt) in moc.items():
        cvs[ten].du_kien_bat_dau = bd.replace(tzinfo=timezone.utc) if bd else None
        cvs[ten].du_kien_ket_thuc = kt.replace(tzinfo=timezone.utc) if kt else None
    sess.commit()

    lsx_ngoai = _phat_hanh_that(
        sess, orders, lsx_svc, admin, customer, buoc=[("Ngoài cửa sổ", 60, 500)],
    )
    cv_ngoai = _cvs(sess, lsx_ngoai)[0]
    cv_ngoai.du_kien_bat_dau = datetime(2026, 9, 20, 8, 0, tzinfo=timezone.utc)
    cv_ngoai.du_kien_ket_thuc = datetime(2026, 9, 20, 9, 0, tzinfo=timezone.utc)
    sess.commit()

    ket = {ten: cvs[ten].id for ten in moc}
    ket["lsx"] = lsx_id
    ket["lsx_ngoai"] = lsx_ngoai
    ket["cv_ngoai"] = cv_ngoai.id
    return ket


# --- V3: cửa sổ thời gian -------------------------------------------------------------------------
# --- V3: lane cho máy KHÔNG có việc ---------------------------------------------------------------
# --- V4: block mang cặp `(lsx_id, ma)` (Ruling C123) ----------------------------------------------
# ==================================================================================================
# VÒNG SỬA 1 — MỤC 1 (Ruling C135): `du_kien_ket_thuc IS NULL` nghĩa là MỞ ĐẦU KIA (+∞), KHÔNG
# phải "kết thúc ngay lúc bắt đầu".
#
# Bug thật đang chạy trước vòng này: cả hai tầng đều `COALESCE(ket_thuc, bat_dau)` / `... or bd`,
# nên một ca đang chạy từ tuần trước mà chưa ai đóng giờ dự kiến kết thúc bị suy thành khoảng
# `[bat_dau, bat_dau]` — nằm trọn TRƯỚC `tu` ⇒ rớt khỏi bàn điều độ ĐÚNG LÚC NÓ ĐANG CHẠY. Vi phạm
# thẳng luật "cửa sổ chỉ NỚI, không THU HẸP" của C126.
#
# Chỉ đầu `tu` mở. Vế `den` vẫn chặn: việc xếp bắt đầu SAU `den` thì không thuộc cửa sổ dù chưa
# biết giờ xong — nếu không, mọi việc chưa khai giờ kết thúc sẽ tràn vào mọi cửa sổ.
# ==================================================================================================
# ==================================================================================================
# VÒNG SỬA 1 — MỤC 2: HÀNG RÀO RIÊNG cho TẦNG SQL của cửa sổ.
#
# Lỗ hổng người rà soát tìm ra: `viec_quanh_cua_so` dồn mọi ca biên vào MỘT lệnh, nên câu SQL
# ("lệnh có ít nhất một việc chạm cửa sổ") LUÔN cho lệnh đó qua và chỉ tầng Python quyết định.
# Đột biến `_cham_cua_so_sql` từ CHỒNG LẤN sang "bắt đầu trong khoảng" ⇒ 71/71 bài vẫn XANH.
#
# Hình dạng vá lỗ: một lệnh CÔ LẬP (việc của nó không lệnh nào khác dùng chung) mà việc DUY NHẤT
# của nó KHÔNG "bắt đầu trong khoảng" nhưng CÓ chồng lấn — SQL sai là lệnh biến mất, không còn tầng
# nào cứu.
# ==================================================================================================
# ==================================================================================================
# VÒNG SỬA 1 — MỤC 4 (Ruling C132): máy NGỪNG DÙNG mà KHÔNG có block thì THÔI đẻ lane.
#
# C126 viết "ĐỪNG ẩn lane" là để chặn việc BIẾN MẤT, không phải để giữ lane rỗng cho máy đã thanh
# lý — xưởng chạy lâu năm sẽ có hàng chục lane chết. Máy ngừng dùng mà CÒN ôm việc thì lane vẫn
# phải hiện (kèm cờ `ngung_dung`): đó đúng là thứ điều độ phải xử lý.
# ==================================================================================================
# ==================================================================================================
# VÒNG SỬA 2 — MỤC 1 (Ruling C136) và MỤC 2 (Ruling C137).
#
# Gốc chung: `theo_may()` từng quyết định "máy này có lane không" bằng cách nhìn `cvs` — tập công
# việc ĐÃ LỌC THEO CỬA SỔ. Nhưng "máy này còn nợ việc không" là câu hỏi ĐỘC LẬP với cửa sổ đang
# xem. Trộn hai câu vào một phép thử đẻ ra hai lỗi dưới đây.
#
# C136 — "còn nợ việc" là MỘT vị ngữ duy nhất (`_may_con_no_viec`), độc lập cửa sổ, dùng chung cho
#        cờ `co_viec` của `/bo-loc` lẫn quyết định có-lane của `/theo-may`.
# C137 — C132 chỉ chi phối bộ lane MẶC ĐỊNH. `?may_id=` tường minh luôn trả ĐÚNG MỘT lane.
# ==================================================================================================
# ==================================================================================================
# 16/09/2026 — VIỆC ĐÃ CHẠY XẾP VÀO CA THEO PHIÊN CHẠY THẬT (chủ dự án duyệt, chọn "gán nhãn").
# Chưa chạy → giữ ô kế hoạch; đã chạy → theo khoảng chạy thật; `lech_lich` "som"/"tre".
# ==================================================================================================
NGAY_XEM = date(2026, 9, 10)


def _gio(ngay: date, gio: int, phut: int = 0, giay: int = 0) -> datetime:
    """Giờ TƯỜNG dán nhãn UTC — đúng thang `du_kien_*` (xem `gio_xuong.py`)."""
    return datetime(ngay.year, ngay.month, ngay.day, gio, phut, giay, tzinfo=timezone.utc)


def _phien_that(sess, cv, khoang, trang_thai: str) -> None:
    """Ghi phiên ĐÚNG hình dạng `thuc_thi` để lại (mốc UTC THẬT) ở những giờ bài test chọn —
    khuôn `_dat_xong_luc`. `khoang` là giờ TƯỜNG; `None` ở vế sau = phiên đang mở."""
    for i, (bd, kt) in enumerate(khoang, start=1):
        sess.add(SanXuatPhienChay(
            cong_viec_id=cv.id, so_thu_tu=i, bat_dau=ve_utc_that(bd),
            ket_thuc=ve_utc_that(kt) if kt is not None else None,
            loai_dong=None if kt is None else "tam_dung",
        ))
    cv.trang_thai = trang_thai
    sess.commit()


@pytest.fixture
def lich_va_chay_that(sess, orders, lsx_svc, admin, customer, monkeypatch) -> dict:
    """Ca 1 (06–14) + Ca 2 (14–22), không ca đêm. "Bây giờ" GHIM ở 10/09 16:00 giờ xưởng.

        bước          kế hoạch            phiên chạy thật (giờ xưởng)   trạng thái  kỳ vọng ngày 10/09
        Chạy sớm      11/09 08:00–10:00   10/09 08:00–09:30             paused      Ca 1 · sớm lịch
        Vắt hai ca    10/09 12:00–15:00   10/09 12:30–14:30             completed   Ca 1 + Ca 2
        Chờ trễ       10/09 07:00–08:00   —                             released    Ca 1 · trễ lịch
        Chờ đúng hạn  10/09 17:00–18:00   —                             released    Ca 2
        Đang chạy     09/09 09:00–10:00   10/09 15:00 → (mở)            running     Ca 2 · trễ lịch
        Trước ca      10/09 06:00–07:00   10/09 05:00–06:30             completed   Ngoài ca + Ca 1
        Giao ca       10/09 13:00–14:00   10/09 13:00:00–14:00:40       completed   CHỈ Ca 1

    Mỗi dòng chặn một bản cài sai: "Chạy sớm"/"Đang chạy" chặn bản vẫn xếp theo kế hoạch; "Vắt hai
    ca" chặn bản chỉ lấy mốc bắt đầu; "Chờ đúng hạn" là phần tử KHÔNG thoả của nhãn trễ; "Trước ca"
    chặn bản bỏ quên đoạn ngoài ca; "Giao ca" chặn bản so tới giây (40 giây lấn giờ lúc giao ca
    không được kéo việc sang ca sau)."""
    ca1 = WorkShift(name="Ca 1 (chạy thật)", start_minute=6 * 60, end_minute=14 * 60,
                    is_active=True, ca_san_xuat=True)
    ca2 = WorkShift(name="Ca 2 (chạy thật)", start_minute=14 * 60, end_minute=22 * 60,
                    is_active=True, ca_san_xuat=True)
    sess.add_all([ca1, ca2])
    sess.commit()

    d, truoc, sau = NGAY_XEM, NGAY_XEM - timedelta(days=1), NGAY_XEM + timedelta(days=1)
    bang = {
        "Chạy sớm": ((_gio(sau, 8), _gio(sau, 10)), [(_gio(d, 8), _gio(d, 9, 30))], CV_TAM_DUNG),
        "Vắt hai ca": ((_gio(d, 12), _gio(d, 15)), [(_gio(d, 12, 30), _gio(d, 14, 30))], CV_HOAN_THANH),
        "Chờ trễ": ((_gio(d, 7), _gio(d, 8)), [], None),
        "Chờ đúng hạn": ((_gio(d, 17), _gio(d, 18)), [], None),
        "Đang chạy": ((_gio(truoc, 9), _gio(truoc, 10)), [(_gio(d, 15), None)], CV_DANG_CHAY),
        "Trước ca": ((_gio(d, 6), _gio(d, 7)), [(_gio(d, 5), _gio(d, 6, 30))], CV_HOAN_THANH),
        "Giao ca": ((_gio(d, 13), _gio(d, 14)), [(_gio(d, 13), _gio(d, 14, 0, 40))], CV_HOAN_THANH),
    }
    _dot_dong_don(sess, 97)
    lsx_id = _phat_hanh_that(
        sess, orders, lsx_svc, admin, customer, buoc=[(ten, 60, 500) for ten in bang],
    )
    cvs = {cv.ten_cong_doan: cv for cv in _cvs(sess, lsx_id)}
    for ten, ((bd, kt), khoang, trang_thai) in bang.items():
        cvs[ten].du_kien_bat_dau, cvs[ten].du_kien_ket_thuc = bd, kt
        sess.commit()
        if khoang:
            _phien_that(sess, cvs[ten], khoang, trang_thai)
    ket = {ten: cvs[ten].id for ten in bang}
    ket.update(ca1=ca1.id, ca2=ca2.id)
    sess.expire_all()

    monkeypatch.setattr(bang_theo_doi, "gio_xuong", lambda: _gio(d, 16))
    return ket


def _viec_theo_o(client, h, ngay: date) -> dict:
    d = client.get(f"/api/theo-doi-san-xuat/theo-ca?ngay={ngay.isoformat()}", headers=h).json()
    return {c["id"]: {v["cong_viec_id"]: v for v in c["viec"]} for c in d["ca"]}


def test_theo_ca_viec_da_chay_xep_theo_phien_that(client, seed_credentials, lich_va_chay_that):
    g = lich_va_chay_that
    h = _h(_tok(client, seed_credentials))
    o = _viec_theo_o(client, h, NGAY_XEM)
    ca1, ca2, ngoai = set(o[g["ca1"]]), set(o[g["ca2"]]), set(o[None])

    assert g["Chạy sớm"] in ca1 and g["Chạy sớm"] not in ca2, "việc chạy sớm phải hiện ở ca nó chạy"
    assert g["Vắt hai ca"] in ca1 and g["Vắt hai ca"] in ca2, "việc vắt hai ca phải hiện ở CẢ HAI ca"
    assert g["Vắt hai ca"] not in ngoai
    assert g["Đang chạy"] in ca2 and g["Đang chạy"] not in ca1, "phiên mở tính tới bây giờ, không hơn"
    assert g["Trước ca"] in ngoai and g["Trước ca"] in ca1, "đoạn chạy trước giờ ca phải vào Ngoài ca"
    assert g["Giao ca"] in ca1 and g["Giao ca"] not in ca2, "40 giây lấn giờ giao ca kéo việc sang ca sau"
    assert g["Chờ trễ"] in ca1 and g["Chờ đúng hạn"] in ca2, "việc chưa chạy phải giữ ô kế hoạch"


def test_theo_ca_viec_da_chay_khong_hien_lai_o_ngay_ke_hoach(
    client, seed_credentials, lich_va_chay_that,
):
    """Đỏ nếu việc đã chạy vẫn còn bày ở ô kế hoạch cũ — đúng triệu chứng chủ dự án báo: ca hôm nay
    trống trơn trong khi máy đang chạy việc của ngày khác."""
    g = lich_va_chay_that
    h = _h(_tok(client, seed_credentials))
    hom_sau = _viec_theo_o(client, h, NGAY_XEM + timedelta(days=1))
    hom_truoc = _viec_theo_o(client, h, NGAY_XEM - timedelta(days=1))
    assert all(g["Chạy sớm"] not in viec for viec in hom_sau.values())
    assert all(g["Đang chạy"] not in viec for viec in hom_truoc.values())


def test_theo_ca_nhan_lech_lich(client, seed_credentials, lich_va_chay_that):
    g = lich_va_chay_that
    h = _h(_tok(client, seed_credentials))
    o = _viec_theo_o(client, h, NGAY_XEM)
    ca1, ca2 = o[g["ca1"]], o[g["ca2"]]

    assert ca1[g["Chạy sớm"]]["lech_lich"] == "som"
    assert ca2[g["Đang chạy"]]["lech_lich"] == "tre"
    assert ca1[g["Chờ trễ"]]["lech_lich"] == "tre", "quá giờ bắt đầu mà chưa chạy phải gắn trễ lịch"
    assert ca2[g["Chờ đúng hạn"]]["lech_lich"] is None
    assert ca1[g["Vắt hai ca"]]["lech_lich"] is None

    assert ca1[g["Chạy sớm"]]["bat_dau_thuc_te"] == "2026-09-10T08:00:00"
    assert ca1[g["Chờ trễ"]]["bat_dau_thuc_te"] is None


def test_theo_ca_viec_ghep_chay_ngoai_ngay_ke_hoach(client, seed_credentials, sess, ghep_doi):
    """Vế "có phiên chạm cửa sổ" phải có ở CẢ nhánh cầu bài ghép: việc ghép kế hoạch 20/09 nhưng
    chạy thật 10/09 — thiếu vế này thì hai lệnh ghép không lọt vào `ids` và việc biến mất."""
    a_id, b_id, cv_chung = ghep_doi
    ca1 = WorkShift(name="Ca 1 (ghép chạy thật)", start_minute=6 * 60, end_minute=14 * 60,
                    is_active=True, ca_san_xuat=True)
    sess.add(ca1)
    cv = sess.get(SanXuatCongViec, cv_chung.id)
    cv.du_kien_bat_dau = _gio(date(2026, 9, 20), 8)
    cv.du_kien_ket_thuc = _gio(date(2026, 9, 20), 9)
    sess.commit()
    _phien_that(sess, cv, [(_gio(NGAY_XEM, 9), _gio(NGAY_XEM, 10))], CV_HOAN_THANH)
    ca1_id, cv_id = ca1.id, cv.id

    h = _h(_tok(client, seed_credentials))
    o = _viec_theo_o(client, h, NGAY_XEM)
    viec = o[ca1_id].get(cv_id)
    assert viec is not None, "việc ghép chạy ngoài ngày kế hoạch rớt khỏi bàn Theo ca"
    assert {x["lsx_id"] for x in viec["lsx"]} == {a_id, b_id}
    assert viec["lech_lich"] == "som"
