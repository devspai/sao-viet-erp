"""Chấm đỏ Kho: yêu cầu mới → người xử lý kho; kho hủy/hoàn tất → người tạo."""
from .test_kho_de_nghi import _login, _setup
from .thong_bao_helpers import tom_tat


def test_yeu_cau_moi_va_phan_hoi_kho(client):
    kho_id, mat_id = _setup(client)
    dn = _login(client, "t_denghi")
    r = client.post("/api/kho/de-nghi", headers=dn, json={
        "loai": "XUAT", "kho_id": kho_id,
        "lines": [{"hang_loai": mat_id[0], "hang_id": mat_id[1], "dvt": "to", "sl_de_nghi": 5}],
    })
    assert r.status_code == 201, r.text
    req = r.json()
    tk = _login(client, "t_thukho")
    tt = tom_tat(client, tk)
    assert tt["kho"]["loai"] == "kho_yeu_cau_moi" and tt["kho"]["ma"] == req["ma"]
    assert "kho" not in tom_tat(client, dn)

    h = client.post(f"/api/kho/de-nghi/{req['id']}/huy-kho", headers=tk, json={"ly_do": "Hết hàng"})
    assert h.status_code == 200, h.text
    assert tom_tat(client, dn)["kho"]["loai"] == "kho_phan_hoi"
