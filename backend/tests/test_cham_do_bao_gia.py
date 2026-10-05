"""Chấm đỏ Báo giá: trình duyệt đặc thù → người duyệt theo phòng Sale; quyết định → Sale soạn."""
from app.models.role import SCOPE_DEPARTMENT

from .test_quotation_approval import _h, _role_token, _seed_ptg, _token
from .thong_bao_helpers import dang_nhap, tao_nguoi, tom_tat


def test_cho_duyet_theo_phong_va_quyet_dinh(client):
    _token(client)
    sales = _role_token("sale_cham", "NV Sales")
    tpkd = _role_token("tpkd_cham", "Trưởng phòng KD")
    tao_nguoi("duyet_khac", {"bao_gia": dict(can_read=True, can_approve_exception=True,
                                             scope=SCOPE_DEPARTMENT)}, phong="Phòng B chấm")
    q = client.post("/api/quotations", json={"phieu_tinh_gia_id": _seed_ptg(gia_von_tp=1_000_000_000, cua=sales)},
                    headers=_h(sales)).json()
    r = client.post(f"/api/quotations/{q['id']}/transition",
                    json={"to_status": "pending_approval"}, headers=_h(sales))
    assert r.status_code == 200, r.text
    tt = tom_tat(client, _h(tpkd))
    assert tt["bao_gia"]["loai"] == "bao_gia_cho_duyet" and tt["bao_gia"]["ma"] == q["code"]
    assert "bao_gia" not in tom_tat(client, dang_nhap(client, "duyet_khac"))
    assert "bao_gia" not in tom_tat(client, _h(sales))

    d = client.post(f"/api/quotations/{q['id']}/approval", json={"decision": "approved", "note": "ok"},
                    headers=_h(tpkd))
    assert d.status_code == 200, d.text
    assert tom_tat(client, _h(sales))["bao_gia"]["loai"] == "bao_gia_quyet_dinh"
