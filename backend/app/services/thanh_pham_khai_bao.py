"""Khai THÀNH PHẨM của một khách vào danh mục — MỘT hàm, hai nơi gọi.

⭐ LUẬT HIỆN HÀNH (11/10/2026, mg 0394 — plan 2026-10-11-thanh-pham-theo-khach-tai-ban): thành phẩm
THUỘC VỀ KHÁCH (`vat_tu_in_an.customer_id`), và danh tính do người lập phiếu CHỌN chứ không đoán
bằng tên. Ô "Sản phẩm tái bản" ở phiếu tính giá chỉ hiện mã của khách đầu phiếu; chọn ⇒ thẻ mang
`tai_ban_thanh_pham_id`; chốt đơn gắn cụm vào đúng mã đó và đóng dấu `order_lines.thanh_pham_id`.
Cụm từ phiếu tính giá mà KHÔNG gắn ⇒ sản phẩm mới, đẻ mã mới (không so tên). Dòng nhập tay (không
qua phiếu tính giá, không có ô để chọn) ⇒ tìm-hoặc-khai theo (khách, tên). Chỗ ĐỌC dùng
`thanh_pham_cua_cum`: dấu trên dòng trước, không có (đơn chốt trước 11/10) mới tìm theo (khách, tên).
Tồn của mã là hàng của khách ⇒ đơn sau dùng được hàng làm dư của đơn trước (giao hàng đọc tồn theo
mã, không theo "đơn nguồn" của lô nữa).

Phần dưới là lịch sử các lần đổi khoá, giữ để hiểu vì sao.

Vì sao có file này (docs/prd-thanh-pham.md):

Sản phẩm in là hàng ĐẶT RIÊNG. "Hộp thuốc 10 vỉ — in 2 màu, cán bóng" của khách A không có sẵn ở
danh mục nào và sẽ không bao giờ có. Nhưng kho chỉ xuất được thứ CÓ trong danh mục (luật siết
08/08/2026 bỏ ô tên tự do `stock_request_lines.ten_tu_do`). Hai câu đó đá nhau, và bản đầu giải
sai bằng cách bắt người lập yêu cầu giao "chọn mặt hàng kho" — tức bắt chọn một thứ chưa tồn tại.

⚠️ PHẠM VI ĐỊNH DANH là `(khách hàng, tên đã chuẩn hoá)`, **KHÔNG** phải dòng đơn.

Bản đầu lấy khoá `TP-<số đơn>-<id dòng>` và chủ dự án bắt đúng lỗi (19/08/2026):

    Th08  Khách A · đơn 041 · dòng #11  "Hộp thuốc 10 vỉ"  → TP-...-041-11
    Th09  Khách A · đơn 052 · dòng #77  "Hộp thuốc 10 vỉ"  → TP-...-052-77   ⚠️ dòng THỨ HAI

Nặng nhất không phải danh mục phình, mà là **TỒN KHO BỊ XÉ ĐÔI**: hàng dư tháng 8 nằm ở dòng một,
hàng in tháng 9 nằm ở dòng hai, và kho không trả lời được "còn bao nhiêu Hộp thuốc 10 vỉ" — đúng
câu duy nhất họ cần.

Có KHÁCH trong khoá là bắt buộc: hai khách khác nhau đều có thể đặt "Tờ hướng dẫn sử dụng — gấp 3"
nhưng là hai file in khác hẳn. Gộp lại là giao tờ của khách A cho khách B.

Hai nơi gọi:

  1. `OrderService.confirm()` — ĐƯỜNG CHÍNH. Chốt đơn là khai, để kho nhập kho thành phẩm được
     ngay khi sản xuất xong, không phải chờ ai đó nghĩ tới việc lập yêu cầu giao.
  2. `DeliveryService._mat_hang_cua_dong_don` — LƯỚI AN TOÀN cho đơn đã chốt TRƯỚC mg 0203.
     Cùng hàm này nên khoá sinh ra giống hệt, không lệch.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from ..models.vat_lieu_kho import VatTuInAn
from ..repositories.don_vi_do_repo import DonViDoRepository

#: Tiền tố mã thành phẩm. `ma` chỉ 30 ký tự nên `TP-` + mã khách (`KH001`) + `-001` là vừa.
TIEN_TO = "TP"

#: Mọi biến thể gạch ngang về một mối trước khi so tên. "10 vỉ — in" và "10 vỉ - in" là MỘT
#: sản phẩm; giữ nguyên hai kiểu gạch là đẻ hai dòng danh mục cho cùng một món.
_GACH = dict.fromkeys(map(ord, "‐‑‒–—―−"), "-")


def chuan_ten(ten: str | None) -> str:
    """Khoá so sánh tên. Lệch hoa/thường · khoảng trắng · kiểu gạch ⇒ vẫn là MỘT sản phẩm.

    Chuẩn hoá chứ không so nguyên văn (chủ chốt 19/08/2026): người lập đơn tháng sau gõ lại mô tả
    bằng tay, lệch một dấu phẩy là bản so-nguyên-văn đẻ thêm dòng — đúng cái lỗi đang sửa.

    KHÔNG bỏ dấu tiếng Việt: "Bìa" và "Bia" là hai thứ khác nhau.
    """
    s = unicodedata.normalize("NFC", (ten or "")).translate(_GACH).casefold()
    s = re.sub(r"\s+", " ", s).strip()
    # Chỉ gọt dấu câu ở HAI ĐẦU — gọt cả chuỗi thì "7×5cm" và "75cm" hoá một.
    return s.strip(" -–—.,;:·|/\\")


def ma_don_vi(db, gia_tri: str | None) -> str | None:
    """ĐVT của dòng đơn (một cái TÊN) → MÃ danh mục cho `vat_tu_in_an.don_vi_gia`.

    ⚠️ Hai cột này KHÔNG cùng một thứ tiếng, và đó là chủ ý ở cả hai đầu:

    * `order_lines.don_vi_tinh` giữ **TÊN** ("cái", "hộp"). Chuỗi đó chảy từ phiếu tính giá qua
      báo giá rồi IN LÊN GIẤY GỬI KHÁCH — `PhieuTinhGiaDetailView.useDanhMucDonVi` ghi rõ lý do
      không đổi sang mã: mọi báo giá cũ sẽ in ra chữ khác.
    * `vat_tu_in_an.don_vi_gia` giữ **MÃ** ("cai", "hop") — cùng lối `giay_nguyen.don_vi_gia`,
      vì kho và mọi quy đổi tra đơn vị bằng mã (`DonViDoRepository.ten_theo_ma`).

    Chép thẳng tên sang mã là màn Thành phẩm mở dòng nào cũng báo đỏ *"cái · không có trong danh
    mục"* trong khi không ai gõ sai gì — đơn vị đó CÓ trong danh mục, chỉ là dưới mã `cai`.

    Không tra được (đơn vị gõ tay kiểu "chiếc") ⇒ **None**, không ghi chuỗi lạ vào cột mã. Màn hiện
    "Chưa chọn đơn vị" — trạng thái THẬT và nhìn ra ngay, đúng lối mg `0170` đã chọn cho bảng này
    (`don_vi_gia = NULL` cho mọi giá trị không khớp mã nào).
    """
    v = (gia_tri or "").strip()
    if not v:
        return None
    repo = DonViDoRepository(db)
    # Đã là mã thì trả về MÃ CHUẨN của danh mục, không trả nguyên văn: dòng cũ có thể ghi "Cai".
    for d in repo.all_rows():
        if (d.ma or "").strip().lower() == v.lower():
            return (d.ma or "").strip()
    return repo.ma_theo_ten().get(v.lower())


def _ma_ke_tiep(db) -> str:
    """`TP-00001`, một dãy số dùng chung.

    Trước 21/08/2026 mã kèm mã khách (`TP-KH001-001`) vì thành phẩm thuộc về một khách. Chủ bỏ
    khách khỏi thành phẩm ⇒ không còn gì để nhét vào giữa. Mã CŨ giữ nguyên, không đổi: nó đang
    nằm trong lô tồn và phiếu đã ghi sổ.

    Đếm theo TIỀN TỐ chứ không theo `count(*)`: dòng đã xoá không được làm tái dụng số cũ.
    """
    goc = f"{TIEN_TO}-"
    dung = {
        r[0] for r in db.query(VatTuInAn.ma).filter(VatTuInAn.ma.like(f"{goc}%")).all()
    }
    n = 1
    while f"{goc}{n:05d}" in dung:
        n += 1
    return f"{goc}{n:05d}"


class ThanhPhamKhacKhach(ValueError):
    """Thẻ phiếu tính giá gắn tái bản vào mã KHÔNG thuộc khách của đơn (đổi khách sau khi gắn, hoặc
    mã đã mất). Chốt đơn phải dừng — gắn sang mã khách khác là giao hàng của khách này cho khách kia."""


def tim_theo_khach_ten(db, customer_id: int | None, ten: str | None) -> VatTuInAn | None:
    """Thành phẩm CỦA KHÁCH có tên chuẩn hoá trùng `ten` — KHÔNG đẻ dòng mới.

    Chỉ dùng cho hai việc: dòng đơn nhập tay (không có ô tái bản để chọn) và đơn chốt trước
    11/10/2026 (dòng chưa có dấu `thanh_pham_id`). Đơn từ phiếu tính giá thì danh tính là thứ người
    lập phiếu CHỌN, không đi qua đây."""
    khoa = chuan_ten(ten)
    if not khoa or not customer_id:
        return None
    # Nạp rổ thành phẩm của khách rồi so trong Python: `chuan_ten` gộp gạch ngang và khoảng trắng,
    # SQL `lower()` không làm được. Lọc `la_thanh_pham` để không đụng vào mực/kẽm/hoá chất.
    for h in (db.query(VatTuInAn)
              .filter(VatTuInAn.la_thanh_pham.is_(True), VatTuInAn.customer_id == customer_id)
              .order_by(VatTuInAn.id).all()):
        if chuan_ten(h.ten) == khoa:
            return h
    return None


def _khai_moi(db, *, customer_id: int | None, ten: str, dvt: str | None,
              order_id: int | None = None, order_line_id: int | None = None) -> VatTuInAn:
    """Đẻ một mã thành phẩm MỚI thuộc `customer_id`. `flush()` chứ không `commit()`: nơi gọi làm chủ
    giao dịch — `confirm()` chốt đơn và khai thành phẩm phải đi CHUNG một giao dịch."""
    obj = VatTuInAn(
        ma=_ma_ke_tiep(db),
        la_thanh_pham=True,
        # NGUYÊN VĂN mô tả dòng đơn (PRD L3) — kho tìm bằng đúng cái tên khách đặt. Cắt 150 theo
        # `vat_tu_in_an.ten`.
        ten=(ten or "").strip()[:150] or "(chưa có tên)",
        don_vi_gia=ma_don_vi(db, dvt),
        don_gia=0,
        customer_id=customer_id,
        # `order_id` / `order_line_id` = đơn ĐẦU TIÊN đặt món này, giữ để tra nguồn gốc. KHÔNG
        # dùng làm khoá định danh và KHÔNG cập nhật ở lần đặt sau (xem đầu file).
        order_id=order_id,
        order_line_id=order_line_id,
        ghi_chu=None,
    )
    db.add(obj)
    db.flush()
    return obj


def tim_hoac_khai(db, *, customer_id: int | None = None, ten: str, dvt: str | None = None,
                  order_id: int | None = None, order_line_id: int | None = None) -> VatTuInAn:
    """Get-or-create theo (KHÁCH, TÊN ĐÃ CHUẨN HOÁ) — cho dòng nhập tay và đơn cũ (xem đầu file)."""
    co_san = tim_theo_khach_ten(db, customer_id, ten)
    if co_san is not None:
        return co_san
    return _khai_moi(db, customer_id=customer_id, ten=ten, dvt=dvt,
                     order_id=order_id, order_line_id=order_line_id)


# --- CỤM BÁN (docs/design-nhap-kho-thanh-pham-qua-yeu-cau-nhap-xuat.md §3) --------------------
# Kho giữ ĐÚNG THỨ KHÁCH MUA. Phiếu tính giá tách một quyển sách thành Ruột + Bìa (mỗi dòng một tờ
# giấy chạy máy), nhưng khách mua MỘT quyển, và bản in báo giá / xác nhận đơn đã gộp hai dòng đó
# thành một bằng nhãn `nhom`. Kho theo đúng luật gộp đó: một CỤM = một mã thành phẩm.
#
# Luật khoá là bản Python của `frontend/src/utils/gop-nhom.ts::khoaGop` (chốt 26/08/2026): cùng
# nhãn (bỏ khoảng trắng hai đầu, không phân biệt hoa thường) VÀ cùng số lượng. Sửa một bên thì
# sửa cả bên kia, không thì kho và tờ xác nhận đơn gọi cùng một món bằng hai cái tên.


@dataclass
class CumBan:
    """Một cụm bán của đơn. `dong` giữ thứ tự dòng đơn; dòng ĐẦU là dòng mang mã kho."""

    khoa: str
    ten: str
    #: TÊN đơn vị như dòng đơn ("cuốn") — `ma_don_vi` đổi sang mã lúc khai danh mục.
    dvt: str | None
    so_luong: float
    dong: list = field(default_factory=list)
    thanh_tien: int = 0

    @property
    def dong_dau(self):
        return self.dong[0]


def _khoa_nhan(nhom: str | None) -> str | None:
    s = (nhom or "").strip()
    return s.lower() if s else None


def cum_ban(order) -> list[CumBan]:
    """Gom dòng đơn thành cụm bán, giữ thứ tự theo dòng ĐẦU của mỗi cụm.

    SL cụm = SL dòng đầu, KHÔNG cộng dồn (khách mua 500 cuốn chứ không phải 1.000 = ruột + bìa).
    Đơn vị = `dvt_nhom` của dòng đầu; bỏ trống thì lấy ĐVT dòng đầu. Tên = nhãn nhóm.
    """
    ra: list[CumBan] = []
    theo_khoa: dict[str, CumBan] = {}
    for ln in sorted(order.lines or [], key=lambda x: x.id or 0):
        nhan = _khoa_nhan(getattr(ln, "nhom", None))
        sl = float(ln.qty or 0)
        khoa = f"{nhan}|{sl:g}" if nhan is not None else f"line:{ln.id}"
        cum = theo_khoa.get(khoa)
        if cum is None:
            if nhan is not None:
                ten = (ln.nhom or "").strip()
                dvt = (getattr(ln, "dvt_nhom", None) or "").strip() or ln.don_vi_tinh
            else:
                ten = ln.description or ""
                dvt = ln.don_vi_tinh
            cum = theo_khoa[khoa] = CumBan(khoa=khoa, ten=ten, dvt=dvt, so_luong=sl)
            ra.append(cum)
        cum.dong.append(ln)
        cum.thanh_tien += int(ln.line_total or 0)
    return ra


def cum_cua_dong(order, order_line_id: int) -> CumBan | None:
    for cum in cum_ban(order):
        if any(ln.id == order_line_id for ln in cum.dong):
            return cum
    return None


def gia_ban_cum(cum: CumBan) -> int | None:
    """Giá bán một đơn vị cụm = Σ thành tiền chưa VAT ÷ SL cụm, tròn tới đồng.

    None khi chưa có thành tiền hoặc SL không dương — để trống thật chứ không ghi 0 đ: "giá bán
    0 đ" đọc như hàng tặng.
    """
    if cum.so_luong <= 0 or cum.thanh_tien <= 0:
        return None
    return int(round(cum.thanh_tien / cum.so_luong))


def thanh_pham_cua_cum(db, order, cum: CumBan) -> VatTuInAn | None:
    """Mã thành phẩm của cụm — CHỈ ĐỌC. Dấu `order_lines.thanh_pham_id` trước (đóng lúc chốt đơn);
    dòng chưa có dấu (đơn chốt trước 11/10/2026) thì tìm theo (khách của đơn, tên cụm)."""
    for ln in cum.dong:
        tp_id = getattr(ln, "thanh_pham_id", None)
        if tp_id:
            tp = db.get(VatTuInAn, tp_id)
            if tp is not None:
                return tp
    return tim_theo_khach_ten(db, getattr(order, "customer_id", None), cum.ten)


def _dong_dau(cum: CumBan, tp: VatTuInAn) -> VatTuInAn:
    for ln in cum.dong:
        if getattr(ln, "thanh_pham_id", None) != tp.id:
            ln.thanh_pham_id = tp.id
    return tp


def khai_cum(db, order, cum: CumBan) -> VatTuInAn:
    """Thành phẩm của MỘT cụm bán: có rồi thì dùng (`thanh_pham_cua_cum`), chưa có thì đẻ mã mới
    thuộc khách của đơn. Luôn đóng dấu mã lên mọi dòng của cụm để lần đọc sau khỏi tra tên."""
    tp = thanh_pham_cua_cum(db, order, cum)
    if tp is None:
        tp = _khai_moi(db, customer_id=order.customer_id, ten=cum.ten, dvt=cum.dvt,
                       order_id=order.id, order_line_id=cum.dong_dau.id)
    return _dong_dau(cum, tp)


def khai_mot_dong(db, order, order_line) -> VatTuInAn:
    """Thành phẩm của CỤM chứa dòng đơn này (Ruột và Bìa cùng cụm trả về cùng một mã)."""
    cum = cum_cua_dong(order, order_line.id)
    if cum is None:
        return tim_hoac_khai(
            db, customer_id=order.customer_id, ten=order_line.description or "",
            dvt=order_line.don_vi_tinh, order_id=order.id, order_line_id=order_line.id,
        )
    return khai_cum(db, order, cum)


def _thanh_phan_cua_cum(db, cum: CumBan) -> list:
    """`PhieuThanhPhan` nguồn của các dòng cụm, theo thứ tự dòng (dòng nhập tay bỏ qua)."""
    from ..models.phieu_tinh_gia import PhieuThanhPhan

    ra = []
    for ln in cum.dong:
        if getattr(ln, "phieu_thanh_phan_id", None):
            ptp = db.get(PhieuThanhPhan, ln.phieu_thanh_phan_id)
            if ptp is not None:
                ra.append(ptp)
    return ra


def khai_cho_don(db, order) -> list[VatTuInAn]:
    """Gắn mã thành phẩm cho mọi CỤM bán của đơn lúc CHỐT. Gọi từ `OrderService.confirm()`.

    Mỗi cụm:
      1. thẻ phiếu tính giá gắn tái bản (`tai_ban_thanh_pham_id`) ⇒ đúng mã đó — mã phải là thành
         phẩm của CHÍNH khách đơn, không thì `ThanhPhamKhacKhach`;
      2. cụm từ phiếu tính giá mà không gắn ⇒ sản phẩm mới, đẻ mã mới (không so tên);
      3. cụm nhập tay ⇒ `khai_cum` (tìm theo khách + tên, không có thì đẻ).
    Rồi đóng dấu mã lên dòng, và cụm có phiếu tính giá thì chụp cấu hình kỹ thuật từng thành phần vào
    mã (`cau_hinh_tai_ban`) — nguồn của ô tái bản lần sau.

    KHÔNG commit — `confirm()` commit chung một lượt.
    """
    from datetime import datetime, timezone

    from .san_pham_tai_ban_service import cau_hinh_tu_thanh_phan

    if order is None or not order.customer_id:
        return []
    ra: list[VatTuInAn] = []
    for cum in cum_ban(order):
        nguon = _thanh_phan_cua_cum(db, cum)
        gan = next((p.tai_ban_thanh_pham_id for p in nguon if p.tai_ban_thanh_pham_id), None)
        if gan:
            tp = db.get(VatTuInAn, gan)
            if tp is None or not tp.la_thanh_pham or tp.customer_id != order.customer_id:
                ma = f" {tp.ma}" if tp is not None else ""
                raise ThanhPhamKhacKhach(
                    f"«{cum.ten}» đang gắn tái bản mã{ma} không thuộc khách của đơn — mở phiếu tính "
                    "giá, bấm Tách thành sản phẩm mới hoặc chọn lại sản phẩm tái bản")
        elif nguon:
            tp = _khai_moi(db, customer_id=order.customer_id, ten=cum.ten, dvt=cum.dvt,
                           order_id=order.id, order_line_id=cum.dong_dau.id)
        else:
            tp = khai_cum(db, order, cum)
        _dong_dau(cum, tp)
        if nguon:
            tp.cau_hinh_tai_ban = [cau_hinh_tu_thanh_phan(p) for p in nguon]
            tp.tai_ban_luc = datetime.now(timezone.utc)
        ra.append(tp)
    return ra
