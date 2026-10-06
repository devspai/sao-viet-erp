"""Hồ sơ mở từ Theo dõi gọi đường của Hồ sơ lệnh, nên vai có `theo_doi_san_xuat` phải có
`lenh_san_xuat` cùng phạm vi — không thì người ta bấm một lệnh trên Theo dõi và ăn 403."""
from app.seed import ROLES


def test_vai_co_theo_doi_thi_co_ho_so_lenh_cung_pham_vi():
    lech = []
    for phong, vai, quyen in ROLES:
        td = quyen.get("theo_doi_san_xuat")
        if not td or not td.get("can_read"):
            continue
        hs = quyen.get("lenh_san_xuat") or {}
        if not hs.get("can_read") or hs.get("scope") != td.get("scope"):
            lech.append(f"{phong} / {vai}: theo dõi {td.get('scope')}, hồ sơ {hs.get('scope')}")
    assert not lech, "\n".join(lech)
