"""Khuôn dựng dữ liệu cho các bài Gia công ngoài (spec 2026-09-26).

Dùng CHUNG các fixture `sess` / `admin` / `customer` / `orders` / `lsx_svc` của
`tests/lenh_sx_fixtures.py` — file test nào dùng thì import cả hai.
"""
from __future__ import annotations

from itertools import count

from app.models.lsx import LB_THUE_NGOAI, TT_DA_PHAT_HANH, Lsx, LsxCongDoan, LsxCongDoanPhuThuoc
from app.models.purchase import Supplier
from app.services.san_xuat import release
from tests.test_san_xuat_board import _to_moi
from tests.test_xep_lich_service import _don_da_chuyen_sx, _ptg_2_in

_dem = count(1)


def ncc(sess, ten: str = "Cán màng Minh Long", *, nhan: bool = True) -> Supplier:
    """Một nhà cung cấp; `nhan=True` = có tích "Nhận gia công"."""
    s = Supplier(name=ten, nhan_gia_cong=nhan)
    sess.add(s)
    sess.flush()
    return s


def lenh_chua_phat(sess, orders, lsx_svc, admin, customer) -> Lsx:
    """MỘT lệnh vừa tạo từ đơn (nháp, CHƯA giữ chỗ vật tư) — sửa routing / đặt trọn gói được.

    Không dùng `_hai_lsx_san_sang`: hàm đó bật giữ chỗ, mà lệnh đang giữ chỗ thì `replace_routing`
    chặn (`_chan_dang_giu_cho`)."""
    ptg = _ptg_2_in(sess)
    d = _don_da_chuyen_sx(sess, orders, admin, customer, ptg)
    ids = [l["order_line_id"] for l in lsx_svc.preview(d.id)["lines"]]
    return lsx_svc.tao(order_id=d.id, order_line_ids=ids[:1], actor=admin)[0]


def dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, *, buoc) -> int:
    """Lệnh ĐÃ PHÁT HÀNH, routing tuyến tính do bài test mô tả. Trả `lsx_id`.

    `buoc` = list `(ten, loai_buoc, nha_cung_cap | None, so_luong_ra, don_vi_ra)`. Bước máy/tổ về
    MỘT tổ mới (admin có đủ quyền trên tổ); bước thuê ngoài không tổ, đơn giá 500đ."""
    i = next(_dem)
    to = _to_moi(sess, f"Tổ GC {i}", f"TO-GC-{i}")
    lsx = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    for cd in list(lsx.cong_doans):
        sess.delete(cd)
    sess.flush()
    buocs: list[LsxCongDoan] = []
    dv_truoc = "to"
    for k, (ten, loai, s, sl_ra, dv_ra) in enumerate(buoc):
        cd = LsxCongDoan(
            lsx_id=lsx.id, thu_tu=k, ten=ten, nhom="print" if k == 0 else "finishing",
            loai_buoc=loai, department_id=None if loai == LB_THUE_NGOAI else to.id,
            nha_cung_cap_id=s.id if s else None, nha_cung_cap=s.name if s else None,
            don_gia_gia_cong=500 if loai == LB_THUE_NGOAI else None,
            so_luong_vao=sl_ra, so_luong_ra=sl_ra, don_vi_vao=dv_truoc, don_vi_ra=dv_ra,
        )
        sess.add(cd)
        buocs.append(cd)
        dv_truoc = dv_ra
    sess.flush()
    for a, b in zip(buocs, buocs[1:]):
        sess.add(LsxCongDoanPhuThuoc(buoc_truoc_id=a.id, buoc_sau_id=b.id))
    sess.commit()
    release.phat_hanh(sess, lsx_ids={lsx.id}, actor=admin)
    lsx.trang_thai = TT_DA_PHAT_HANH
    sess.commit()
    return lsx.id


from datetime import datetime, timedelta, timezone

from app.models.role import Role
from app.models.san_xuat import SanXuatCongViec
from app.models.san_xuat_san_luong import SanXuatBatch
from app.models.user import User
from app.services.san_xuat import ban_giao


def cv_ten(sess, lsx_id: int, ten: str) -> SanXuatCongViec:
    return sess.query(SanXuatCongViec).filter_by(lsx_id=lsx_id, ten_cong_doan=ten).one()


def ghi_me(sess, cv, sl: float) -> SanXuatBatch:
    """Mẻ TỐT `sl` cho một công việc NỘI BỘ — chèn thẳng, bỏ qua bàn tổ (bài test không soi ghi mẻ)."""
    luc = datetime.now(timezone.utc)
    b = SanXuatBatch(cong_viec_id=cv.id, bat_dau=luc - timedelta(hours=1), ket_thuc=luc,
                     tong=sl, tot=sl, hong=0, don_vi=cv.don_vi_ra or "to")
    sess.add(b)
    sess.flush()
    return b


def giao_sang(sess, admin, nguon, dich, sl: float) -> dict:
    """Tổ nguồn ghi mẻ `sl` rồi ĐỀ XUẤT bàn giao sang `dich` — đúng cửa thật `ban_giao.de_xuat`."""
    b = ghi_me(sess, nguon, sl)
    sess.commit()
    return ban_giao.de_xuat(sess, user=admin, nguon_cong_viec_id=nguon.id,
                            dich_cong_viec_id=dich.id, batch_ids=[b.id])


def nguoi_ke_hoach(sess, username: str = "kehoach_gc") -> User:
    """Một tài khoản vai "Kế hoạch SX" (seed) — người nhận toast "chờ mang đi"."""
    role = sess.query(Role).filter(Role.name == "Kế hoạch SX").one()
    u = User(username=username, name="Kế hoạch A", password_hash="x", role_id=role.id,
             is_active=True)
    sess.add(u)
    sess.commit()
    return u
