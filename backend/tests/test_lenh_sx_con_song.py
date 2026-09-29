"""A7 (28/09/2026) — màn Lệnh SX / KPI / Theo dõi SX theo máy KHÔNG còn nạp toàn lịch sử.

Hai loại bài cho MỖI màn, và cả hai đều bắt buộc:
  · KẾT QUẢ KHÔNG ĐỔI — chạy bản CŨ (dựng lại nguyên văn trong file này: nạp mọi lệnh rồi mới
    tính) và bản MỚI trên cùng một thế giới có đủ lệnh CŨ đã xong, lệnh đang chạy, lệnh xong trong
    cửa sổ/hôm nay, rồi so từng byte đầu ra. Tầng lọc còn sống chỉ được là TỐI ƯU — lệch một dòng là
    một lệnh biến khỏi tab của nó mà không ai biết.
  · KHÔNG CÒN NẠP — soi thẳng tập id đưa vào `boi_canh.nap()`: lệnh cũ đã xong phải vắng mặt. Chỉ
    so kết quả thì một bản "tối ưu" không cắt gì cũng xanh.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from app.models.lsx import Lsx
from app.services.lenh_sx import bang_theo_doi, boi_canh, danh_sach, trang_thai
from tests.lenh_sx_fixtures import (  # noqa: F401
    BAY_GIO,
    _cvs,
    _dat_xong_luc,
    _dot_dong_don,
    _lenh_ghep_doi,
    _lenh_tho,
    _phat_hanh_that,
    admin,
    customer,
    lsx_svc,
    orders,
    sess,
)
from tests.test_lenh_sx_trang_thai import _giao_xong

_NGAY_XA = date(9999, 12, 31)
_XONG_NAM_NGOAI = datetime(2025, 1, 5, 3, 0, tzinfo=timezone.utc)


def _giao_du(sess, lsx_id: int, *, ma: str) -> None:
    """Khách THỰC NHẬN đủ `so_luong_dat` qua một chuyến có hàng đến tay — đường production."""
    _giao_xong(sess, lsx_id, sess.get(Lsx, lsx_id).so_luong_dat, ma=ma)


@pytest.fixture
def the_gioi(sess, orders, lsx_svc, admin, customer):
    """Đủ các hình dạng mà tầng lọc còn sống phải phân biệt:

      cu_tho      — giao đủ từ năm ngoái, không công việc nào (lệnh trần);
      cu_that     — mọi bước đóng năm ngoái + giao đủ  ⇒ phải KHÔNG bị nạp;
      hom_nay     — giao đủ nhưng một bước đóng HÔM NAY (giờ xưởng) ⇒ KPI "xong hôm nay" vẫn đếm;
      dang        — lệnh thật chưa ai đụng;
      giao_thieu  — giao 40/100 ⇒ còn sống dù đã có chuyến;
      gap         — lệnh gấp, còn sống (khoá sắp);
      ghep_a/b    — hai lệnh trên MỘT ca in ghép; bước RIÊNG của `a` đã đóng hết nhưng ca ghép chưa
                    ⇒ `a` vẫn còn nợ việc trên máy (canh vế cầu ghép của bộ lọc `theo_may`).
    """
    _dot_dong_don(sess, 6)
    buoc = [("CTP", 15, 500), ("In", 360, 5000)]
    w = {}
    w["cu_tho"] = _lenh_tho(
        sess, ma="LSX-CS-CU-THO", sale_user_id=admin.id, customer_id=customer.id,
        han_sx=date(2025, 1, 10), so_luong=100,
    )
    _giao_du(sess, w["cu_tho"], ma="YCGH-CS-1")

    w["cu_that"] = _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=buoc)
    for cv in _cvs(sess, w["cu_that"]):
        _dat_xong_luc(sess, cv, _XONG_NAM_NGOAI)
    _giao_du(sess, w["cu_that"], ma="YCGH-CS-2")

    w["hom_nay"] = _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=buoc)
    cvs = _cvs(sess, w["hom_nay"])
    _dat_xong_luc(sess, cvs[0], _XONG_NAM_NGOAI)
    _dat_xong_luc(sess, cvs[-1], BAY_GIO - timedelta(hours=1))   # 01:00 giờ VN — "hôm nay"
    _giao_du(sess, w["hom_nay"], ma="YCGH-CS-3")

    w["dang"] = _phat_hanh_that(sess, orders, lsx_svc, admin, customer, buoc=buoc)

    w["giao_thieu"] = _lenh_tho(
        sess, ma="LSX-CS-THIEU", sale_user_id=admin.id, customer_id=customer.id,
        han_sx=date(2026, 9, 3), so_luong=100,
    )
    _giao_xong(sess, w["giao_thieu"], 40, ma="YCGH-CS-4")

    w["gap"] = _lenh_tho(
        sess, ma="LSX-CS-GAP", sale_user_id=admin.id, customer_id=customer.id,
        han_sx=date(2026, 9, 20), is_rush=True,
    )

    a, b, _chung = _lenh_ghep_doi(
        sess, orders, lsx_svc, admin, customer,
        buoc=[("CTP", 500), ("In", 5000), ("Đóng gói", 5000)], ghep_idx=1,
    )
    for cv in _cvs(sess, a):
        _dat_xong_luc(sess, cv, _XONG_NAM_NGOAI)
    w["ghep_a"], w["ghep_b"] = a, b

    # Hạn SX đặt tay để THỨ TỰ bảng biết trước: gấp → ba lệnh hạn 2025 (đã giao hết) → lệnh sống.
    # Bài phân trang dựa vào đúng thứ tự này để có trang CHỨA và trang KHÔNG chứa lệnh cũ.
    for k, han in (("cu_that", date(2025, 1, 8)), ("hom_nay", date(2025, 1, 9))):
        sess.get(Lsx, w[k]).han_hoan_thanh_sx = han
    for k in ("dang", "ghep_a", "ghep_b"):
        sess.get(Lsx, w[k]).han_hoan_thanh_sx = date(2026, 9, 10)
    sess.commit()
    return w


@pytest.fixture
def nap_ghi(monkeypatch):
    """Ghi lại MỌI tập id đưa vào `boi_canh.nap()` — cửa nạp nặng duy nhất của ba màn."""
    ghi: list[set[int]] = []
    goc = boi_canh.nap

    def _nap(db, lsx_ids):
        ghi.append(set(lsx_ids))
        return goc(db, lsx_ids)

    monkeypatch.setattr(boi_canh, "nap", _nap)
    return ghi


# --- Bản CŨ, dựng lại nguyên văn (trước A7) -------------------------------------------------------
def _danh_sach_cu(db, *, tab=None, tre=None, page=1, page_size=50) -> dict:
    ids = list(db.execute(danh_sach._loc_sql(
        None, q=None, tu_ngay=None, den_ngay=None, may_id=None, nhom_cong_doan=None, uu_tien=None,
    )).scalars())
    bc, tinh = danh_sach._soi(db, ids, BAY_GIO)
    if tre is not None:
        ids = [i for i in ids if tinh[i]["tre"] is tre]
    dem = {t: 0 for t in trang_thai.TAB_CHINH}
    for i in ids:
        dem[tinh[i]["trang_thai"]] += 1
    dem[danh_sach.TAB_TAT_CA] = len(ids)
    if tab and tab != danh_sach.TAB_TAT_CA:
        ids = [i for i in ids if tinh[i]["trang_thai"] == tab]
    ids.sort(key=lambda i: (
        0 if bc.lenh[i].is_rush else 1, bc.lenh[i].han_hoan_thanh_sx or _NGAY_XA, bc.lenh[i].ma or "",
    ))
    trang = ids[(page - 1) * page_size:page * page_size]
    return {
        "items": [danh_sach._dong(bc, i, tinh[i], BAY_GIO) for i in trang],
        "total": len(ids), "page": page, "page_size": page_size, "dem_theo_tab": dem,
    }


def _summary_cu(db) -> dict:
    """`summary()` trước A7 — nạp mọi lệnh rồi đếm. Chép nguyên vòng đếm."""
    dau, cuoi = danh_sach._ngay_xuong(BAY_GIO)
    ids = list(db.execute(
        danh_sach.pham_vi.loc_lsx_da_phat_hanh(danh_sach.select(Lsx.id), None)
    ).scalars())
    bc, tinh = danh_sach._soi(db, ids, BAY_GIO)
    dang_sx = du_kien_tre = 0
    cv_xong: set[int] = set()
    kcs_da_dem: set[int] = set()
    kcs_nhan = kcs_dat = 0.0
    for i in ids:
        if tinh[i]["trang_thai"] != trang_thai.TAB_HOAN_THANH:
            dang_sx += 1
            if tinh[i]["tre"]:
                du_kien_tre += 1
        for cv in bc.cong_viec_du(i):
            if (cv.trang_thai == "completed" and cv.hoan_thanh_luc is not None
                    and dau <= danh_sach._aware(cv.hoan_thanh_luc) < cuoi):
                cv_xong.add(cv.id)
            for k in bc.kcs[cv.id]:
                if k.id in kcs_da_dem or not (dau <= danh_sach._aware(k.ket_thuc) < cuoi):
                    continue
                kcs_da_dem.add(k.id)
                kcs_nhan += float(k.so_luong_nhan or 0)
                kcs_dat += float(k.so_luong_dat or 0)
    return {
        "dang_sx": dang_sx, "cong_doan_xong_hom_nay": len(cv_xong), "du_kien_tre": du_kien_tre,
        "ty_le_kcs_dat_hom_nay": (100.0 * kcs_dat / kcs_nhan) if kcs_nhan > 0 else None,
    }


# --- Danh sách ------------------------------------------------------------------------------------
def test_tien_de_the_gioi_co_du_hinh_dang(sess, the_gioi):
    """Chốt TIỀN ĐỀ: thế giới thật sự có lệnh đã giao hết lẫn lệnh còn sống. Không có bài này thì
    fixture trôi (vd `_giao_xong` thôi đẻ chuyến) và mọi bài so dưới đây xanh trên một tập rỗng."""
    cu = _danh_sach_cu(sess)
    tt = {r["id"]: r["trang_thai"] for r in cu["items"]}
    for k in ("cu_tho", "cu_that", "hom_nay"):
        assert tt[the_gioi[k]] == trang_thai.TAB_HOAN_THANH, k
    for k in ("dang", "giao_thieu", "gap", "ghep_a", "ghep_b"):
        assert tt[the_gioi[k]] != trang_thai.TAB_HOAN_THANH, k


def test_danh_sach_khong_doi_ket_qua_moi_tab_moi_trang(sess, the_gioi):
    """Mọi tab × cả hai nhánh `tre` × phân trang: bản mới == bản cũ, từng dòng, từng facet."""
    tabs = [None, *danh_sach.TAB_CHO_PHEP]
    for tab in tabs:
        for tre in (None, True, False):
            moi = danh_sach.danh_sach(sess, sale_ids=None, tab=tab, tre=tre, bay_gio=BAY_GIO)
            assert moi == _danh_sach_cu(sess, tab=tab, tre=tre), (tab, tre)
    # Cắt trang NHỎ để lệnh đã giao hết (hạn 2025 ⇒ đứng đầu) và lệnh sống rơi ra các trang khác nhau.
    for tab in (None, danh_sach.TAB_TAT_CA, trang_thai.TAB_HOAN_THANH):
        for page in (1, 2, 3, 4, 5):
            moi = danh_sach.danh_sach(
                sess, sale_ids=None, tab=tab, page=page, page_size=2, bay_gio=BAY_GIO,
            )
            assert moi == _danh_sach_cu(sess, tab=tab, page=page, page_size=2), (tab, page)


def test_danh_sach_khong_nap_lenh_da_giao_het_ngoai_trang(sess, the_gioi, nap_ghi):
    cu = {the_gioi["cu_tho"], the_gioi["cu_that"], the_gioi["hom_nay"]}
    song = {the_gioi[k] for k in ("dang", "giao_thieu", "gap", "ghep_a", "ghep_b")}

    danh_sach.danh_sach(sess, sale_ids=None, tab=trang_thai.TAB_DANG_SX, bay_gio=BAY_GIO)
    da_nap = set().union(*nap_ghi)
    assert not (cu & da_nap), "lệnh đã giao hết vẫn bị nạp ở tab không chứa nó"
    assert song <= da_nap

    # Tab Tất cả, trang CUỐI (lệnh 2025 đứng đầu ⇒ không nằm ở trang này): vẫn không nạp.
    nap_ghi.clear()
    kq = danh_sach.danh_sach(
        sess, sale_ids=None, tab=danh_sach.TAB_TAT_CA, page=4, page_size=2, bay_gio=BAY_GIO,
    )
    tren_trang = {r["id"] for r in kq["items"]}
    assert not (cu & tren_trang)
    assert not (cu & set().union(*nap_ghi))

    # Trang ĐẦU chứa đúng lệnh cũ ⇒ chỉ nạp thêm đúng những lệnh cũ CỦA TRANG, không hơn.
    nap_ghi.clear()
    kq = danh_sach.danh_sach(
        sess, sale_ids=None, tab=danh_sach.TAB_TAT_CA, page=1, page_size=2, bay_gio=BAY_GIO,
    )
    tren_trang = {r["id"] for r in kq["items"]}
    assert cu & tren_trang, "tiền đề: trang 1 phải có lệnh đã giao hết (hạn 2025 đứng đầu)"
    assert cu & set().union(*nap_ghi) == cu & tren_trang


# --- KPI ------------------------------------------------------------------------------------------
def test_summary_khong_doi_ket_qua(sess, the_gioi):
    moi = danh_sach.summary(sess, sale_ids=None, bay_gio=BAY_GIO)
    assert moi == _summary_cu(sess)
    # Tiền đề: bước đóng hôm nay của một lệnh ĐÃ GIAO HẾT vẫn được đếm — đúng ca mà câu SQL
    # `lenh_co_viec_tu` phải giữ lại.
    assert moi["cong_doan_xong_hom_nay"] >= 1


def test_summary_chi_nap_lenh_song_va_lenh_co_viec_hom_nay(sess, the_gioi, nap_ghi):
    danh_sach.summary(sess, sale_ids=None, bay_gio=BAY_GIO)
    da_nap = set().union(*nap_ghi)
    assert the_gioi["cu_tho"] not in da_nap
    assert the_gioi["cu_that"] not in da_nap
    assert the_gioi["hom_nay"] in da_nap, "lệnh giao hết nhưng có bước đóng hôm nay phải được nạp"
    assert {the_gioi[k] for k in ("dang", "giao_thieu", "gap", "ghep_a", "ghep_b")} <= da_nap


# --- Theo dõi SX — theo máy -----------------------------------------------------------------------
def _theo_may_cu(sess, monkeypatch, **kw) -> dict:
    """Bản cũ: tập lệnh = MỌI lệnh trong phạm vi (không vế "còn việc dở" nào). Rộng hơn cả câu cũ
    (câu cũ có cửa sổ) — vẫn là tham chiếu đúng vì vòng Python bên dưới tự lọc block theo cửa sổ."""
    goc = bang_theo_doi._ids_trong_pham_vi
    with monkeypatch.context() as m:
        m.setattr(
            bang_theo_doi, "_ids_trong_pham_vi",
            lambda db, sale_ids, *, loc=None, them=None: goc(db, sale_ids, loc=loc),
        )
        return bang_theo_doi.theo_may(sess, sale_ids=None, **kw)


@pytest.mark.parametrize("cua_so", [
    {},
    {"tu": date(2026, 9, 1), "den": date(2026, 9, 30)},
    {"tu": date(2024, 12, 1), "den": date(2025, 2, 1)},
])
def test_theo_may_khong_doi_ket_qua(sess, the_gioi, monkeypatch, cua_so):
    assert bang_theo_doi.theo_may(sess, sale_ids=None, **cua_so) == _theo_may_cu(
        sess, monkeypatch, **cua_so,
    )


def test_theo_may_khong_nap_lenh_da_dong_het_buoc(sess, the_gioi, nap_ghi):
    kq = bang_theo_doi.theo_may(sess, sale_ids=None)
    da_nap = set().union(*nap_ghi)
    assert the_gioi["cu_that"] not in da_nap, "lệnh đóng hết bước từ năm ngoái vẫn bị nạp"
    assert the_gioi["cu_tho"] not in da_nap
    # Bước riêng của `ghep_a` đã đóng hết, nhưng ca in GHÉP còn dở ⇒ vẫn nạp, và block của ca ghép
    # vẫn kể tên cả hai lệnh.
    assert {the_gioi["ghep_a"], the_gioi["ghep_b"], the_gioi["dang"]} <= da_nap
    lenh_tren_block = {
        l["lsx_id"] for lane in kq["lanes"] for bl in lane["blocks"] for l in bl["lsx"]
    }
    assert {the_gioi["ghep_a"], the_gioi["ghep_b"]} <= lenh_tren_block
