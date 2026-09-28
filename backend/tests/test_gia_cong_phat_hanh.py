"""Phát hành gom dải thuê ngoài thành LẦN GIA CÔNG (spec 2026-09-26 §2, §10)."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import GiaCongNgoai, KIEU_MOT_PHAN
from app.models.san_xuat import SanXuatCongViec
from app.services.gia_cong_ngoai import TT_CHO_MANG_DI
from app.services.gia_cong_ngoai.lan import lan_cua_lenh
from app.services.san_xuat import release_update, thuc_thi
from tests.gia_cong_fixtures import dung_lenh_gia_cong, ncc
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


def _lan(sess, lsx_id):
    return sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).order_by(GiaCongNgoai.id).all()


def _cv(sess, lsx_id, ten):
    return sess.query(SanXuatCongViec).filter_by(lsx_id=lsx_id, ten_cong_doan=ten).one()


def test_hai_buoc_lien_nhau_cung_nha_gia_cong_la_mot_lan(sess, orders, lsx_svc, admin, customer):
    a = ncc(sess)
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"),
        ("Cán màng", "thue_ngoai", a, 1660, "to"),
        ("Bế", "thue_ngoai", a, 1650, "cai"),
        ("Đóng gói", "to", None, 1650, "cai"),
    ])
    (lan,) = _lan(sess, lsx_id)
    assert lan.kieu == KIEU_MOT_PHAN and lan.nha_cung_cap_id == a.id
    assert lan.ten_viec == "Cán màng + Bế" and lan.don_vi == "cai"
    assert float(lan.don_gia) == 500
    for ten in ("Cán màng", "Bế"):
        cv = _cv(sess, lsx_id, ten)
        assert cv.gia_cong_ngoai_id == lan.id and cv.department_id is None
    assert _cv(sess, lsx_id, "In").gia_cong_ngoai_id is None


def test_khac_nha_hoac_chen_buoc_noi_bo_la_hai_lan(sess, orders, lsx_svc, admin, customer):
    a, b = ncc(sess), ncc(sess, "Bế Tân Tiến")
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", a, 1000, "to"),
        ("Bế", "thue_ngoai", b, 1000, "cai"),
        ("Dán", "to", None, 1000, "cai"),
        ("Ép kim", "thue_ngoai", b, 1000, "cai"),
    ])
    assert [l.ten_viec for l in _lan(sess, lsx_id)] == ["Cán màng", "Bế", "Ép kim"]


def test_doc_khoi_lan_hien_tien(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    (co,) = lan_cua_lenh(sess, lsx_id)
    assert co["trang_thai"] == TT_CHO_MANG_DI and co["don_gia"] == 500
    assert co["co_buoc_truoc"] is True and co["chang_sau"] == []


def test_xuong_khong_bat_dau_duoc_viec_gia_cong(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    cv = _cv(sess, lsx_id, "Cán màng")
    with pytest.raises(ValueError, match="Gia công ngoài"):
        thuc_thi.bat_dau(sess, user=admin, cong_viec_id=cv.id)


def test_thu_hoi_goi_huy_lan_chua_mang_di(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    release_update.thu_hoi_goi(sess, nguon="lsx", id=lsx_id, actor=admin)
    sess.commit()
    (lan,) = _lan(sess, lsx_id)
    assert lan.huy_luc is not None and lan.ly_do_huy


def test_da_mang_di_thi_coi_nhu_da_bat_dau(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    (lan,) = _lan(sess, lsx_id)
    from datetime import datetime, timezone
    lan.mang_di_luc = datetime.now(timezone.utc)
    sess.commit()
    assert release_update.co_cong_viec_da_bat_dau(sess, nguon="lsx", id=lsx_id) is True


# --- Fix round 1 (reviewer): DAG thay vì thu_tu, đồng bộ lúc cập nhật, huỷ không đụng lần đã đi ---
def test_thieu_ncc_thi_chan_va_rollback(sess, orders, lsx_svc, admin, customer):
    """Bước thuê ngoài chưa chọn NCC ⇒ `phat_hanh` ném lỗi TRƯỚC khi caller commit — rollback thì
    không còn dấu vết nào (gói / lần gia công) của lần phát hành hỏng đó."""
    from app.models.lsx import LB_THUE_NGOAI, LsxCongDoan, LsxCongDoanPhuThuoc
    from app.models.san_xuat import SanXuatGoiPhatHanh
    from app.services.san_xuat import release
    from tests.gia_cong_fixtures import lenh_chua_phat
    from tests.test_san_xuat_board import _to_moi

    to = _to_moi(sess, "Tổ GC R1 thiếu NCC", "TO-GC-R1A")
    lsx = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    for cd in list(lsx.cong_doans):
        sess.delete(cd)
    sess.flush()
    a = LsxCongDoan(
        lsx_id=lsx.id, thu_tu=0, ten="In", nhom="print", loai_buoc="may", department_id=to.id,
        so_luong_vao=1000, so_luong_ra=1000, don_vi_vao="to", don_vi_ra="to",
    )
    b = LsxCongDoan(
        lsx_id=lsx.id, thu_tu=1, ten="Cán màng", nhom="finishing", loai_buoc=LB_THUE_NGOAI,
        department_id=None, nha_cung_cap_id=None,
        so_luong_vao=1000, so_luong_ra=1000, don_vi_vao="to", don_vi_ra="to",
    )
    sess.add_all([a, b])
    sess.flush()
    sess.add(LsxCongDoanPhuThuoc(buoc_truoc_id=a.id, buoc_sau_id=b.id))
    sess.commit()

    with pytest.raises(ValueError, match="chưa chọn nhà gia công"):
        release.phat_hanh(sess, lsx_ids={lsx.id}, actor=admin)
    sess.rollback()

    assert sess.query(SanXuatGoiPhatHanh).count() == 0
    assert _lan(sess, lsx.id) == []


def test_hai_nhanh_song_song_cung_ncc_khong_gop(sess, orders, lsx_svc, admin, customer):
    """Hai bước cùng nhà gia công nhưng đều xuất phát TRỰC TIẾP từ một bước cha (không có cạnh nối
    nhau) là hai nhánh song song — KHÔNG được gộp làm một lần dù đứng sát nhau theo `thu_tu`."""
    from app.models.lsx import LB_THUE_NGOAI, TT_DA_PHAT_HANH, LsxCongDoan, LsxCongDoanPhuThuoc
    from app.services.san_xuat import release
    from tests.gia_cong_fixtures import lenh_chua_phat
    from tests.test_san_xuat_board import _to_moi

    a_ncc = ncc(sess)
    to = _to_moi(sess, "Tổ GC R1 song song", "TO-GC-R1B")
    lsx = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    for cd in list(lsx.cong_doans):
        sess.delete(cd)
    sess.flush()
    goc = LsxCongDoan(
        lsx_id=lsx.id, thu_tu=0, ten="In", nhom="print", loai_buoc="may", department_id=to.id,
        so_luong_vao=1000, so_luong_ra=1000, don_vi_vao="to", don_vi_ra="to",
    )
    sess.add(goc)
    sess.flush()
    nhanh1 = LsxCongDoan(
        lsx_id=lsx.id, thu_tu=1, ten="Cán màng", nhom="finishing", loai_buoc=LB_THUE_NGOAI,
        department_id=None, nha_cung_cap_id=a_ncc.id, nha_cung_cap=a_ncc.name,
        don_gia_gia_cong=500, so_luong_vao=1000, so_luong_ra=1000, don_vi_vao="to", don_vi_ra="to",
    )
    nhanh2 = LsxCongDoan(
        lsx_id=lsx.id, thu_tu=2, ten="Bế", nhom="finishing", loai_buoc=LB_THUE_NGOAI,
        department_id=None, nha_cung_cap_id=a_ncc.id, nha_cung_cap=a_ncc.name,
        don_gia_gia_cong=500, so_luong_vao=1000, so_luong_ra=1000, don_vi_vao="to", don_vi_ra="cai",
    )
    sess.add_all([nhanh1, nhanh2])
    sess.flush()
    sess.add_all([
        LsxCongDoanPhuThuoc(buoc_truoc_id=goc.id, buoc_sau_id=nhanh1.id),
        LsxCongDoanPhuThuoc(buoc_truoc_id=goc.id, buoc_sau_id=nhanh2.id),
    ])
    sess.commit()

    release.phat_hanh(sess, lsx_ids={lsx.id}, actor=admin)
    lsx.trang_thai = TT_DA_PHAT_HANH
    sess.commit()

    assert [l.ten_viec for l in _lan(sess, lsx.id)] == ["Cán màng", "Bế"]


def test_cap_nhat_doi_ncc_thi_lan_chua_mang_di_theo_ncc_moi(sess, orders, lsx_svc, admin, customer):
    """Kế hoạch đổi nhà gia công của bước SAU khi đã phát hành — hàm đồng bộ (được
    `phat_hanh_cap_nhat` gọi ở cuối) sửa lại lần CHƯA mang đi theo NCC/đơn giá mới, KHÔNG đẻ lần
    mới (dải không đổi, chỉ đổi NCC)."""
    from app.models.lsx import LsxCongDoan
    from app.services.gia_cong_ngoai.lan import dong_bo_lan_khi_cap_nhat

    b_ncc = ncc(sess, "Cán màng Tân Phát")
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    (lan_cu,) = _lan(sess, lsx_id)
    lan_cu_id = lan_cu.id

    cd = sess.query(LsxCongDoan).filter_by(lsx_id=lsx_id, ten="Cán màng").one()
    cd.nha_cung_cap_id = b_ncc.id
    cd.nha_cung_cap = b_ncc.name
    cd.don_gia_gia_cong = 700
    sess.commit()

    dong_bo_lan_khi_cap_nhat(sess, lsx_ids={lsx_id}, actor=admin)
    sess.commit()

    (lan_moi,) = _lan(sess, lsx_id)
    assert lan_moi.id == lan_cu_id            # dải không đổi ⇒ đồng bộ tại chỗ, không đẻ dòng mới
    assert lan_moi.nha_cung_cap_id == b_ncc.id
    assert float(lan_moi.don_gia) == 700
    assert lan_moi.huy_luc is None


# --- Fix round 2 (reviewer): việc mồ côi sau khi huỷ lần — phải trả về tổ/máy theo routing --------
def test_buoc_het_thue_ngoai_thi_lan_huy_va_cv_ve_to(sess, orders, lsx_svc, admin, customer):
    """Kế hoạch đổi bước "Cán màng" từ thuê ngoài về làm NỘI BỘ (tổ mới) rồi đồng bộ — lần cũ bị
    huỷ, và công việc KHÔNG được mồ côi: `gia_cong_ngoai_id` về None, `department_id` về đúng tổ
    routing hiện tại (không còn trỏ lần đã huỷ, không còn kẹt "không tổ nào" — mg Fix round 2)."""
    from app.models.lsx import LsxCongDoan
    from app.services.gia_cong_ngoai.lan import dong_bo_lan_khi_cap_nhat
    from tests.test_san_xuat_board import _to_moi

    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    (lan_cu,) = _lan(sess, lsx_id)
    to_moi = _to_moi(sess, "Tổ Cán màng nội bộ", "TO-CAN-MANG-R2")

    cd = sess.query(LsxCongDoan).filter_by(lsx_id=lsx_id, ten="Cán màng").one()
    cd.loai_buoc = "to"
    cd.department_id = to_moi.id
    cd.nha_cung_cap_id = None
    cd.nha_cung_cap = None
    sess.commit()

    dong_bo_lan_khi_cap_nhat(sess, lsx_ids={lsx_id}, actor=admin)
    sess.commit()

    sess.refresh(lan_cu)
    assert lan_cu.huy_luc is not None
    cv = _cv(sess, lsx_id, "Cán màng")
    assert cv.gia_cong_ngoai_id is None
    assert cv.department_id == to_moi.id


def test_dai_bot_mot_buoc_giua_thi_cv_deu_tro_lan_moi(sess, orders, lsx_svc, admin, customer):
    """Dải 3 bước "Cán màng + Bế + Ép kim" (một lần) — kế hoạch đổi bước GIỮA ("Bế") về nội bộ,
    cắt dải làm đôi. Đồng bộ: lần cũ (3 bước) bị huỷ; hai bước thuê ngoài còn lại đều được gom
    sang lần MỚI (không lần nào trùng `id` lần cũ, không cv nào còn dính lần cũ); bước bị bớt
    ("Bế") không mồ côi — về đúng tổ mới, `gia_cong_ngoai_id` None."""
    from app.models.lsx import LsxCongDoan
    from app.services.gia_cong_ngoai.lan import dong_bo_lan_khi_cap_nhat
    from tests.test_san_xuat_board import _to_moi

    a = ncc(sess)
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", a, 1000, "to"),
        ("Bế", "thue_ngoai", a, 1000, "to"),
        ("Ép kim", "thue_ngoai", a, 1000, "cai"),
    ])
    (lan_cu,) = _lan(sess, lsx_id)
    lan_cu_id = lan_cu.id
    to_moi = _to_moi(sess, "Tổ Bế nội bộ", "TO-BE-R2")

    be = sess.query(LsxCongDoan).filter_by(lsx_id=lsx_id, ten="Bế").one()
    be.loai_buoc = "to"
    be.department_id = to_moi.id
    be.nha_cung_cap_id = None
    be.nha_cung_cap = None
    sess.commit()

    dong_bo_lan_khi_cap_nhat(sess, lsx_ids={lsx_id}, actor=admin)
    sess.commit()

    sess.refresh(lan_cu)
    assert lan_cu.huy_luc is not None                 # lần cũ (3 bước) bị huỷ nguyên khối

    lan_song = [l for l in _lan(sess, lsx_id) if l.huy_luc is None]
    assert len(lan_song) == 2                         # dải tách đôi ⇒ hai lần mới, không lần nào cũ
    assert lan_cu_id not in {l.id for l in lan_song}

    cv_cm = _cv(sess, lsx_id, "Cán màng")
    cv_ek = _cv(sess, lsx_id, "Ép kim")
    assert cv_cm.gia_cong_ngoai_id in {l.id for l in lan_song}
    assert cv_ek.gia_cong_ngoai_id in {l.id for l in lan_song}
    assert cv_cm.gia_cong_ngoai_id != cv_ek.gia_cong_ngoai_id   # hai lần riêng, không gộp lại

    cv_be = _cv(sess, lsx_id, "Bế")
    assert cv_be.gia_cong_ngoai_id is None
    assert cv_be.department_id == to_moi.id


def test_thu_hoi_khong_huy_lan_da_chot_hoac_da_mang_di(sess, orders, lsx_svc, admin, customer):
    """`huy_lan_cua_goi` (thu hồi gói) chỉ đụng lần CHƯA mang đi + CHƯA chốt — lần đã đi/đã chốt
    giữ nguyên dù bị gọi trực tiếp (phòng khi cửa gọi phía trên có sơ hở)."""
    from datetime import datetime, timezone

    from app.services.gia_cong_ngoai.lan import huy_lan_cua_goi

    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
        ("Bế", "thue_ngoai", ncc(sess, "Bế Tân Tiến"), 1000, "cai"),
    ])
    da_di, chua_di = _lan(sess, lsx_id)
    da_di.mang_di_luc = datetime.now(timezone.utc)
    sess.commit()

    cv = _cv(sess, lsx_id, "Cán màng")
    goi_id = cv.goi_id
    n = huy_lan_cua_goi(sess, goi_id=goi_id, actor=admin, ly_do="Thu hồi thử")
    sess.commit()

    assert n == 1
    da_di_lai, chua_di_lai = _lan(sess, lsx_id)
    assert da_di_lai.huy_luc is None                 # đã mang đi — không đụng
    assert chua_di_lai.huy_luc is not None            # chưa mang đi — huỷ theo


def test_tao_batch_bi_chan_tren_cv_gia_cong(sess, orders, lsx_svc, admin, customer):
    from datetime import datetime, timezone

    from app.services.san_xuat import san_luong

    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    cv = _cv(sess, lsx_id, "Cán màng")
    with pytest.raises(ValueError, match="Gia công ngoài"):
        san_luong.tao_batch(
            sess, user=admin, cong_viec_id=cv.id,
            bat_dau=datetime.now(timezone.utc), ket_thuc=datetime.now(timezone.utc),
            tong=10, tot=10,
        )


def test_kiem_cong_doan_bi_chan_tren_cv_gia_cong(sess, orders, lsx_svc, admin, customer):
    from app.models.department import Department
    from app.models.user import User
    from app.services.san_xuat import kcs

    d = Department(name="Tổ KCS GC R1", code="TO-KCS-GC-R1", is_kcs=True)
    sess.add(d)
    sess.flush()
    kcs_user = User(username="kcs_gc_r1", name="KCS GC R1", password_hash="x", department_id=d.id)
    sess.add(kcs_user)
    sess.commit()

    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    cv = _cv(sess, lsx_id, "Cán màng")
    with pytest.raises(ValueError, match="Gia công ngoài"):
        kcs.kiem_cong_doan(sess, user=kcs_user, cong_viec_id=cv.id, so_dat=10)


def test_khong_xoa_duoc_lenh_da_phat_hanh(sess, orders, lsx_svc, admin, customer):
    """E2E 27/09: nút "Xoá lệnh" còn hiện trên lệnh đã phát hành, máy chủ cho xoá ⇒ FK CASCADE
    cuốn mất lần gia công (và mọi vết của nó). Lệnh đã phát hành phải thu hồi / huỷ trọn gói trước."""
    from app.services.lsx_service import LsxConflict

    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    with pytest.raises(LsxConflict, match="phát hành"):
        lsx_svc.xoa(lsx_id=lsx_id, actor=admin)
    sess.rollback()
    assert len(_lan(sess, lsx_id)) == 1
