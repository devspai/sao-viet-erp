"""Điều chỉnh phiếu xuất khi SX dùng ít hơn số đã xuất (spec-de-nghi-cap-vat-tu-cong-doan §2.3, §5.5).

Hai bảng số phải phân biệt được:
  · xin 100, xuất 100, điều chỉnh còn 70 ⇒ chốt 70, CÒN LẠI 0, Hoàn tất;
  · xin 100, kho mới xuất 70, KHÔNG điều chỉnh ⇒ chốt NULL, CÒN LẠI 30, Cấp một phần.
Trước đây `dieu_chinh_xuat` chỉ hạ `sl_da_ung` nên hai ca trên trông y hệt nhau — tổ trưởng nhìn
thấy "còn thiếu 30" ở ca đầu, đi hỏi kho một câu vô nghĩa.

Riêng ca kho đang cấp DỞ (chưa đạt mục tiêu hiệu lực) mà bị điều chỉnh: chốt KHÔNG được ghi, vì
ghi vô điều kiện sẽ đóng nhầm yêu cầu trong khi phần chưa xuất còn nguyên (Ruling 18).
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.notification import Notification
from app.models.stock_request import REQ_DONE, REQ_PARTIAL, StockRequest, StockRequestLine
from app.services.stock_request_service import StockRequestService

from tests.test_kho_de_nghi import _approved_request, _login, _mk_material, _nhap, _setup


def _so_da_tinh_ky_chua_khoa(kho_id, tu, den):
    """Dựng số đã tính giá trên kỳ CHƯA khóa — dữ liệu cũ trước 13/10/2026 (nay API bắt khóa trước
    rồi mới tính). Gọi thẳng hàm chốt snapshot, không qua `tinh-gia-ky`."""
    from datetime import date

    from app.routers.kho_baocao import _chot_ky

    with SessionLocal() as s:
        _chot_ky(s, tu=date.fromisoformat(tu), den=date.fromisoformat(den), ten=None,
                 kho_ids=[kho_id], khoa_so_id=None)
        s.commit()


def test_dieu_chinh_ghi_chot_thuc_xuat_va_dong_yeu_cau(client):
    """xin 100 · xuất 100 · điều chỉnh 100→70 ⇒ chốt 70, CÒN LẠI 0, Hoàn tất."""
    kho_id, mat_id = _setup(client)
    nhap = _nhap(client, kho_id=kho_id, mat_id=mat_id, qty=100, gia=1_000)
    lot_id = nhap["lines"][0]["lot_id"]
    req = _approved_request(client, kho_id=kho_id, loai="XUAT", mat_id=mat_id, qty=100)
    tk = _login(client, "t_thukho")
    r = client.post("/api/kho/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": req["lines"][0]["id"], "so_luong": 100, "lot_id": lot_id}],
    })
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    r = client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk)
    assert r.status_code == 200, r.text
    line_id = r.json()["lines"][0]["id"]

    r = client.post(f"/api/kho/phieu/{vid}/dieu-chinh-xuat", headers=tk, json={
        "lines": [{"line_id": line_id, "so_luong_moi": 70}],
        "ly_do": "SX dùng không hết, trả lại 30",
    })
    assert r.status_code == 200, r.text

    with SessionLocal() as s:
        ln = s.get(StockRequestLine, req["lines"][0]["id"])
        assert float(ln.sl_de_nghi) == 100
        assert float(ln.sl_duyet) == 100  # KHÔNG hạ
        assert float(ln.sl_da_ung) == 70
        assert float(ln.sl_chot_thuc_xuat) == 70
        assert StockRequestService.con_lai(ln) == 0
        rq = s.get(StockRequest, req["id"])
        assert rq.trang_thai == REQ_DONE


def test_xuat_thieu_ma_khong_dieu_chinh_thi_van_con_lai(client):
    """xin 100 · kho mới xuất 70, KHÔNG điều chỉnh ⇒ chốt vẫn NULL, CÒN LẠI 30, Cấp một phần."""
    kho_id, mat_id = _setup(client)
    nhap = _nhap(client, kho_id=kho_id, mat_id=mat_id, qty=100, gia=1_000)
    lot_id = nhap["lines"][0]["lot_id"]
    req = _approved_request(client, kho_id=kho_id, loai="XUAT", mat_id=mat_id, qty=100)
    tk = _login(client, "t_thukho")
    r = client.post("/api/kho/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": req["lines"][0]["id"], "so_luong": 70,
                   "lot_id": lot_id, "ly_do": "NCC giao thiếu"}],
    })
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    assert client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk).status_code == 200

    with SessionLocal() as s:
        ln = s.get(StockRequestLine, req["lines"][0]["id"])
        assert ln.sl_chot_thuc_xuat is None
        assert StockRequestService.con_lai(ln) == 30
        rq = s.get(StockRequest, req["id"])
        assert rq.trang_thai == REQ_PARTIAL


def test_dieu_chinh_hai_lan_thi_chot_bang_tong_thuc_xuat_hien_tai(client):
    """Chốt là TỔNG đã xuất hiện tại, không phải hiệu của lần điều chỉnh cuối: 100→80→60 ⇒ chốt 60."""
    kho_id, mat_id = _setup(client)
    nhap = _nhap(client, kho_id=kho_id, mat_id=mat_id, qty=100, gia=1_000)
    lot_id = nhap["lines"][0]["lot_id"]
    req = _approved_request(client, kho_id=kho_id, loai="XUAT", mat_id=mat_id, qty=100)
    tk = _login(client, "t_thukho")
    r = client.post("/api/kho/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": req["lines"][0]["id"], "so_luong": 100, "lot_id": lot_id}],
    })
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    r = client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk)
    assert r.status_code == 200, r.text
    line_id = r.json()["lines"][0]["id"]

    r = client.post(f"/api/kho/phieu/{vid}/dieu-chinh-xuat", headers=tk, json={
        "lines": [{"line_id": line_id, "so_luong_moi": 80}],
        "ly_do": "SX dùng không hết đợt 1, trả lại 20",
    })
    assert r.status_code == 200, r.text
    r = client.post(f"/api/kho/phieu/{vid}/dieu-chinh-xuat", headers=tk, json={
        "lines": [{"line_id": line_id, "so_luong_moi": 60}],
        "ly_do": "SX dùng không hết đợt 2, trả lại 20",
    })
    assert r.status_code == 200, r.text

    with SessionLocal() as s:
        ln = s.get(StockRequestLine, req["lines"][0]["id"])
        assert float(ln.sl_chot_thuc_xuat) == 60


def test_dieu_chinh_khi_kho_moi_cap_mot_phan_thi_khong_chot(client):
    """xin 100 · xuất 60 · điều chỉnh 60→50 ⇒ chốt vẫn NULL, CÒN LẠI 50, vẫn 'Cấp một phần'.

    Ghi chốt vô điều kiện sẽ tính còn lại = max(50-50,0) = 0 rồi đóng nhầm yêu cầu, trong khi 50
    tờ ban đầu (100-60=40 chưa xuất, cộng 10 vừa bị trả) chưa hề được xuất (Ruling 18).
    """
    kho_id, mat_id = _setup(client)
    nhap = _nhap(client, kho_id=kho_id, mat_id=mat_id, qty=100, gia=1_000)
    lot_id = nhap["lines"][0]["lot_id"]
    req = _approved_request(client, kho_id=kho_id, loai="XUAT", mat_id=mat_id, qty=100)
    tk = _login(client, "t_thukho")
    r = client.post("/api/kho/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": req["lines"][0]["id"], "so_luong": 60,
                   "lot_id": lot_id, "ly_do": "Cấp đợt 1"}],
    })
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    r = client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk)
    assert r.status_code == 200, r.text
    line_id = r.json()["lines"][0]["id"]

    r = client.post(f"/api/kho/phieu/{vid}/dieu-chinh-xuat", headers=tk, json={
        "lines": [{"line_id": line_id, "so_luong_moi": 50}],
        "ly_do": "SX dùng không hết, trả lại 10",
    })
    assert r.status_code == 200, r.text

    with SessionLocal() as s:
        ln = s.get(StockRequestLine, req["lines"][0]["id"])
        assert ln.sl_chot_thuc_xuat is None
        assert StockRequestService.con_lai(ln) == 50
        rq = s.get(StockRequest, req["id"])
        assert rq.trang_thai == REQ_PARTIAL


def test_yeu_cau_nhieu_dong_chot_roi_thi_khong_cap_them_duoc_dong_do(client):
    """Đề nghị 2 dòng: giấy 100 + mực 5. Xuất giấy 100 → điều chỉnh còn 70 (chốt 70). Yêu cầu vẫn
    'Cấp một phần' vì dòng mực chưa cấp, tức vẫn nằm trong REQUEST_FULFILLABLE — nhưng KHÔNG được
    cấp thêm dòng GIẤY nữa.

    Trước vòng sửa này, `create` đọc `sl_duyet − sl_da_ung = 30` (bỏ qua chốt) và cho xuất thêm 30
    tờ giấy mà sản xuất đã trả lại, còn `GET /api/kho/de-nghi/{id}` vẫn báo `sl_con_lai = 30` —
    mời thủ kho làm đúng thao tác sai đó (Important 1, task-5-fix-1.md).
    """
    kho_id, mat_id = _setup(client)
    mat_muc = _mk_material("MUC-KHO-1")
    nhap = _nhap(client, kho_id=kho_id, mat_id=mat_id, qty=100, gia=1_000)
    lot_id = nhap["lines"][0]["lot_id"]

    dn = _login(client, "t_denghi")
    r = client.post("/api/kho/de-nghi", headers=dn, json={
        "loai": "XUAT", "kho_id": kho_id,
        "lines": [
            {"hang_loai": mat_id[0], "hang_id": mat_id[1], "dvt": "to", "sl_de_nghi": 100},
            {"hang_loai": mat_muc[0], "hang_id": mat_muc[1], "dvt": "to", "sl_de_nghi": 5},
        ],
    })
    assert r.status_code == 201, r.text
    req = r.json()
    giay_line_id = req["lines"][0]["id"]

    tk = _login(client, "t_thukho")
    r = client.post("/api/kho/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": giay_line_id, "so_luong": 100, "lot_id": lot_id}],
    })
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    r = client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk)
    assert r.status_code == 200, r.text
    voucher_line_id = r.json()["lines"][0]["id"]

    # Dòng mực chưa cấp → yêu cầu vẫn 'Cấp một phần' (REQUEST_FULFILLABLE), không phải Hoàn tất.
    with SessionLocal() as s:
        rq = s.get(StockRequest, req["id"])
        assert rq.trang_thai == REQ_PARTIAL

    r = client.post(f"/api/kho/phieu/{vid}/dieu-chinh-xuat", headers=tk, json={
        "lines": [{"line_id": voucher_line_id, "so_luong_moi": 70}],
        "ly_do": "SX dùng không hết, trả lại 30",
    })
    assert r.status_code == 200, r.text

    with SessionLocal() as s:
        ln = s.get(StockRequestLine, giay_line_id)
        assert float(ln.sl_chot_thuc_xuat) == 70
        assert StockRequestService.con_lai(ln) == 0
        rq = s.get(StockRequest, req["id"])
        assert rq.trang_thai == REQ_PARTIAL  # vẫn 'Cấp một phần' — vì dòng mực, KHÔNG vì dòng giấy

    # Yêu cầu vẫn cấp-được (PARTIAL) nhưng dòng GIẤY đã chốt hết — cấp thêm phải bị chặn 400.
    r = client.post("/api/kho/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": giay_line_id, "so_luong": 10, "lot_id": lot_id}],
    })
    assert r.status_code == 400, r.text
    assert "vượt" in r.text

    r = client.get(f"/api/kho/de-nghi/{req['id']}", headers=tk)
    assert r.status_code == 200, r.text
    giay_out = next(l for l in r.json()["lines"] if l["id"] == giay_line_id)
    assert giay_out["sl_con_lai"] == 0


def test_dieu_chinh_lien_tiep_tren_yeu_cau_da_hoan_tat_chi_reo_chuong_mot_lan(client):
    """xin 100 · xuất 100 (Hoàn tất, reo chuông 1 lần) · điều chỉnh 100→70 rồi 70→60: cả hai lần
    vẫn 'Hoàn tất' (trạng thái KHÔNG đổi) nên KHÔNG được reo thêm chuông 'kho_hoan_tat' —
    Minor 2, task-5-fix-1.md. Toast (`_notify`) vẫn được phép hiện mỗi lượt, chỉ chuông chống lặp."""
    kho_id, mat_id = _setup(client)
    nhap = _nhap(client, kho_id=kho_id, mat_id=mat_id, qty=100, gia=1_000)
    lot_id = nhap["lines"][0]["lot_id"]
    req = _approved_request(client, kho_id=kho_id, loai="XUAT", mat_id=mat_id, qty=100)
    tk = _login(client, "t_thukho")
    r = client.post("/api/kho/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": req["lines"][0]["id"], "so_luong": 100, "lot_id": lot_id}],
    })
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    r = client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk)
    assert r.status_code == 200, r.text
    line_id = r.json()["lines"][0]["id"]

    with SessionLocal() as s:
        rq = s.get(StockRequest, req["id"])
        assert rq.trang_thai == REQ_DONE  # ghi sổ đủ 100/100 → Hoàn tất ngay, đã reo 1 lần ở đây

    for so_luong_moi, ly_do in ((70, "SX dùng không hết đợt 1, trả lại 30"),
                                 (60, "SX dùng không hết đợt 2, trả lại 10")):
        r = client.post(f"/api/kho/phieu/{vid}/dieu-chinh-xuat", headers=tk, json={
            "lines": [{"line_id": line_id, "so_luong_moi": so_luong_moi}],
            "ly_do": ly_do,
        })
        assert r.status_code == 200, r.text

    with SessionLocal() as s:
        so_chuong = s.query(Notification).filter(
            Notification.user_id == req["nguoi_tao_id"],
            Notification.loai == "kho_hoan_tat",
            Notification.link_id == req["id"],
        ).count()
        assert so_chuong == 1


def test_ky_da_tinh_gia_thi_khong_sua_so_xuat_duoc(client):
    """11/10/2026: kỳ có số đã tính giá (chưa khoá — dữ liệu cũ) cũng chặn — N-X-T kỳ sau đọc đầu kỳ từ số đã
    chốt và bỏ qua phiếu trong kỳ đó, sửa lùi là tồn đầu kỳ sau lệch ngầm."""
    from datetime import date

    kho_id, mat_id = _setup(client)
    nhap = _nhap(client, kho_id=kho_id, mat_id=mat_id, qty=100, gia=1_000)
    lot_id = nhap["lines"][0]["lot_id"]
    req = _approved_request(client, kho_id=kho_id, loai="XUAT", mat_id=mat_id, qty=100)
    tk = _login(client, "t_thukho")
    r = client.post("/api/kho/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": req["lines"][0]["id"], "so_luong": 100, "lot_id": lot_id}],
    })
    vid = r.json()["id"]
    line_id = client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk).json()["lines"][0]["id"]

    _so_da_tinh_ky_chua_khoa(kho_id, "2026-01-01", date.today().isoformat())

    r = client.post(f"/api/kho/phieu/{vid}/dieu-chinh-xuat", headers=tk, json={
        "lines": [{"line_id": line_id, "so_luong_moi": 70}], "ly_do": "xuất nhầm",
    })
    assert r.status_code == 400, r.text
    assert "kỳ đã tính giá" in r.json()["detail"]


def test_ky_da_tinh_gia_thi_khong_ghi_so_lui_ngay_vao_duoc(client):
    """11/10/2026: phiếu có ngày nằm trong kỳ đã tính giá (chưa khoá — dữ liệu cũ) ⇒ không ghi sổ được (N-X-T kỳ sau sẽ bỏ
    qua phiếu đó). Kỳ đã tính tới HÔM QUA thì phiếu hôm nay vẫn ghi sổ bình thường."""
    from datetime import date, timedelta

    kho_id, mat_id = _setup(client)
    hom_qua = (date.today() - timedelta(days=1)).isoformat()
    tk = _login(client, "t_thukho")

    def _ghi_so_nhap_hom_qua(qty):
        req = _approved_request(client, kho_id=kho_id, loai="NHAP", mat_id=mat_id, qty=qty, gia=1_000)
        r = client.post("/api/kho/phieu", headers=tk, json={
            "request_id": req["id"], "kho_id": kho_id, "ngay": hom_qua,
            "lines": [{"request_line_id": req["lines"][0]["id"], "so_luong": qty}]})
        assert r.status_code in (200, 201), r.text
        return client.post(f"/api/kho/phieu/{r.json()['id']}/ghi-so", headers=tk)

    assert _ghi_so_nhap_hom_qua(10).status_code == 200       # chưa tính giá: ghi lùi ngày được
    _so_da_tinh_ky_chua_khoa(kho_id, "2026-01-01", hom_qua)

    r = _ghi_so_nhap_hom_qua(12)
    assert r.status_code == 400, r.text
    assert "kỳ đã tính giá" in r.json()["detail"]

    # Phiếu ngày hôm nay (sau kỳ đã tính) vẫn ghi sổ được.
    assert _nhap(client, kho_id=kho_id, mat_id=mat_id, qty=14, gia=1_000)["trang_thai"] == "posted"
