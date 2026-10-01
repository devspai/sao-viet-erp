"""`POST /api/lsx/{id}/trang-thai` sang "sẵn sàng": chấm đỏ Xếp lịch (`bao`) commit phiên ⇒ đối
tượng lệnh hết hạn. Kết quả phải dựng TRƯỚC khi báo — trước đây `lsx.__dict__` rỗng ⇒ 500, nút
"Sẵn sàng lập kế hoạch" trên màn Kế hoạch SX chết hẳn."""
from app.models.lsx import TT_NHAP, TT_SAN_SANG
from app.services.lsx_service import LsxService

from tests.lenh_sx_fixtures import _lenh_tho, admin, sess  # noqa: F401

from .thong_bao_helpers import admin as h_admin


def test_danh_dau_san_sang_tra_ve_lenh(client, sess, admin, monkeypatch):  # noqa: F811
    lid = _lenh_tho(sess, ma="LSX-TT-01", sale_user_id=admin.id, trang_thai_lsx=TT_NHAP)
    # Bài canh đường trả kết quả của router, không canh danh sách thiếu dữ liệu.
    monkeypatch.setattr(LsxService, "thieu_cua", lambda self, lsx: [])
    r = client.post(f"/api/lsx/{lid}/trang-thai", json={"trang_thai": TT_SAN_SANG},
                    headers=h_admin(client))
    assert r.status_code == 200, r.text
    assert r.json()["ma"] == "LSX-TT-01" and r.json()["trang_thai"] == TT_SAN_SANG
