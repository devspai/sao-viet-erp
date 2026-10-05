"""Số liệu hồ sơ khách hàng THEO KỲ (04/10/2026) — Tổng quan, Lịch sử mua hàng, Lịch sử báo giá.

Thay bộ "Dashboard 12 tháng cứng" cũ (biểu đồ cố định 12 tháng lùi, heatmap thứ×tháng, donut sản
phẩm): người bán hàng nghĩ theo KỲ ("tháng này được bao nhiêu, năm nay so năm ngoái thế nào"), nên
mọi con số ở đây nhận một khoảng ngày [tu, den] và trả kèm số của CÙNG KỲ NĂM TRƯỚC.

Luật tiền chốt ở đúng một chỗ (`DON_TINH_TIEN`): doanh số chỉ cộng đơn ĐÃ CHỐT. Bản cũ chỉ loại
đơn huỷ nên đơn NHÁP (chưa chốt, còn sửa được) cũng thành doanh số.

Ngày tính theo giờ Việt Nam: một đơn tạo 23:30 ngày 31/03 giờ VN (16:30 UTC) là đơn tháng 3.

Hiệu năng: mỗi API là vài câu truy vấn CÓ GIỚI HẠN theo khoảng ngày của chính một khách, gom tiền
bằng SUM/GROUP BY ở DB; dòng hàng của trang đơn nạp một lần bằng IN (không N+1).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.orm import Session, aliased

from ..models.order import STATUS_CANCELLED, STATUS_DRAFT, STATUS_ORDERED, Order, OrderLine
from ..models.quotation import Quote, QuoteVersion
from .customer_analytics import CHOT_DA_CHAO, CHOT_THANG

VN_TZ = timezone(timedelta(hours=7))

# Chỉ đơn đã chốt mới là doanh số. Nháp còn sửa được, huỷ thì chưa từng thành.
DON_TINH_TIEN = (STATUS_ORDERED,)

# Nhóm trạng thái đơn cho nút lọc. on_hold/change_order là trạng thái DORMANT (đơn cũ) — xếp vào
# nhóm "nháp" vì chúng cũng chưa phải tiền chốt.
NHOM_DON = {
    "chot": (STATUS_ORDERED,),
    "nhap": (STATUS_DRAFT, "on_hold", "change_order"),
    "huy": (STATUS_CANCELLED,),
}

BUOC = ("tuan", "thang", "quy")
TRAN_COT = 60          # biểu đồ quá 60 cột thì tự lên bước thô hơn
SAP_HET_HAN_NGAY = 7   # báo giá đang chờ còn ≤ 7 ngày hiệu lực ⇒ "sắp hết hạn"
TRAN_KHOANG_NGAY = 3700  # ~10 năm — chặn khoảng ngày vô lý làm quét cả bảng


# --- ngày giờ ----------------------------------------------------------------------------------


def hom_nay_vn() -> date:
    return datetime.now(timezone.utc).astimezone(VN_TZ).date()


def moc(d: date) -> datetime:
    """00:00 giờ VN của ngày `d` — mốc so sánh với cột created_at (lưu UTC)."""
    return datetime(d.year, d.month, d.day, tzinfo=VN_TZ)


def ngay_vn(dt: datetime) -> date:
    if dt.tzinfo is None:  # SQLite (bộ test) trả naive — coi là UTC như lúc ghi
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(VN_TZ).date()


def lui_nam(d: date, n: int = 1) -> date:
    try:
        return d.replace(year=d.year - n)
    except ValueError:  # 29/02 → 28/02
        return d.replace(year=d.year - n, day=28)


def _dau_buoc(d: date, buoc: str) -> date:
    if buoc == "tuan":
        return d - timedelta(days=d.weekday())
    if buoc == "thang":
        return d.replace(day=1)
    return date(d.year, (d.month - 1) // 3 * 3 + 1, 1)


def _buoc_ke(d: date, buoc: str) -> date:
    if buoc == "tuan":
        return d + timedelta(days=7)
    thang = d.month + (1 if buoc == "thang" else 3)
    return date(d.year + (thang - 1) // 12, (thang - 1) % 12 + 1, 1)


def chia_cot(tu: date, den: date, buoc: str) -> tuple[str, list[tuple[date, date]]]:
    """Chia [tu, den] thành các cột tuần/tháng/quý. Cột đầu/cuối CẮT theo kỳ (kỳ bắt đầu giữa
    tuần thì cột đầu chỉ tính từ ngày đầu kỳ) để tổng các cột luôn khớp số tổng của kỳ."""
    thu_tu = list(BUOC)
    i = thu_tu.index(buoc)
    while True:
        b = thu_tu[i]
        out: list[tuple[date, date]] = []
        a = _dau_buoc(tu, b)
        while a <= den:
            ke = _buoc_ke(a, b)
            out.append((max(a, tu), min(ke - timedelta(days=1), den)))
            a = ke
        if len(out) <= TRAN_COT or i == len(thu_tu) - 1:
            return b, out
        i += 1


# --- kết quả ----------------------------------------------------------------------------------


@dataclass
class TongDon:
    doanh_so: int = 0
    so_don: int = 0
    tb_don: int | None = None
    so_huy: int = 0
    tien_huy: int = 0


@dataclass
class TongBaoGia:
    so_bg: int = 0
    tong_gia_tri: int = 0
    thang: int = 0
    da_chao: int = 0
    ti_le: int | None = None
    tb_ngay_chot: int | None = None


@dataclass
class Cot:
    tu: date
    den: date
    doanh_so: int = 0
    so_don: int = 0
    doanh_so_cu: int = 0
    so_don_cu: int = 0


@dataclass
class SanPhamKy:
    ten: str
    doanh_so: int = 0
    so_lan: int = 0
    lan_cuoi: date | None = None
    doanh_so_cu: int = 0


@dataclass
class DiemDon:
    ngay: date
    tong: int
    huy: bool


@dataclass
class Nhip:
    tb_ngay: int
    lan_cuoi: date
    so_ngay_tu_lan_cuoi: int
    nhanh_nhat: int
    lau_nhat: int
    so_don: int
    du_kien: date


@dataclass
class DangCho:
    so: int = 0
    tong: int = 0
    sap_het_han: int = 0


@dataclass
class ThongKeKhach:
    tu: date
    den: date
    tu_cu: date
    den_cu: date
    buoc: str
    don: TongDon
    don_cu: TongDon
    bao_gia: TongBaoGia
    bao_gia_cu: TongBaoGia
    cot: list[Cot]
    san_pham: list[SanPhamKy]
    nhip: Nhip | None
    diem_don: list[DiemDon]
    dang_cho: DangCho


@dataclass
class DongDon:
    id: int
    order_no: str
    status: str
    order_kind: str
    tong: int | None
    created_at: datetime
    bao_gia_id: int | None
    bao_gia_ma: str | None
    san_pham: list[str] = field(default_factory=list)


@dataclass
class TrangDon:
    items: list[DongDon]
    tong_so: int
    dem: dict[str, int]          # nhóm → số đơn (theo kỳ + ô tìm, KHÔNG theo nút nhóm đang chọn)
    tien_chot: int               # tổng tiền đơn đã chốt khớp kỳ + ô tìm
    tien_huy: int = 0            # tổng tiền đơn đã huỷ khớp kỳ + ô tìm


@dataclass
class DongBaoGia:
    id: int
    code: str
    version: int
    status: str
    nhom: str
    total: int | None
    valid_until: date | None
    created_at: datetime
    don_id: int | None
    don_ma: str | None
    don_ngay: datetime | None


@dataclass
class TrangBaoGia:
    items: list[DongBaoGia]
    tong_so: int
    dem: dict[str, int]


# --- dịch vụ -----------------------------------------------------------------------------------


def _nhom_bao_gia_sql(hom_nay: date):
    """Nhóm trạng thái báo giá như người bán hiểu. Báo giá "đã gửi" mà quá hạn hiệu lực thì
    coi là HẾT HẠN (khách không trả lời), dù trạng thái gốc chưa ai chuyển."""
    return case(
        (Quote.status.in_(CHOT_THANG), "thanh_don"),
        (Quote.status == "rejected", "tu_choi"),
        (Quote.status == "expired", "het_han"),
        (and_(Quote.status == "sent", Quote.valid_until.is_not(None), Quote.valid_until < hom_nay),
         "het_han"),
        (Quote.status == "sent", "cho"),
        (Quote.status == "cancelled", "huy"),
        else_="chua_gui",  # draft / pending_approval / approved — khách chưa thấy
    )


class SoLieuKhachService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def dem_tab(self, customer_id: int) -> tuple[int, int]:
        """(số đơn, số báo giá) mọi trạng thái — con số trên nhãn hai tab lịch sử."""
        so_don = self.db.execute(
            select(func.count(Order.id)).where(Order.customer_id == customer_id)).scalar_one()
        so_bg = self.db.execute(
            select(func.count(Quote.id)).where(Quote.customer_id == customer_id)).scalar_one()
        return int(so_don), int(so_bg)

    # --- Tổng quan ------------------------------------------------------------------------------

    def thong_ke(self, customer_id: int, tu: date, den: date, buoc: str,
                 hom_nay: date | None = None) -> ThongKeKhach:
        hom_nay = hom_nay or hom_nay_vn()
        tu_cu, den_cu = lui_nam(tu), lui_nam(den)
        quet_tu, quet_den = tu_cu, den

        # 1 câu: mọi đơn (kèm dòng) của khách trong kỳ và cùng kỳ năm trước.
        don: dict[int, dict] = {}
        for oid, st, created, mo_ta, tien in self.db.execute(
            select(Order.id, Order.status, Order.created_at, OrderLine.description,
                   OrderLine.line_total)
            .join(OrderLine, OrderLine.order_id == Order.id, isouter=True)
            .where(Order.customer_id == customer_id,
                   Order.created_at >= moc(quet_tu),
                   Order.created_at < moc(quet_den + timedelta(days=1)))
        ):
            o = don.setdefault(oid, {"st": st, "ngay": ngay_vn(created), "tong": 0, "dong": []})
            if tien is not None:
                o["tong"] += int(tien)
            if mo_ta and mo_ta.strip():
                o["dong"].append((mo_ta.strip(), int(tien or 0)))

        def trong(o, a: date, b: date) -> bool:
            return a <= o["ngay"] <= b

        def tong_don(a: date, b: date) -> TongDon:
            t = TongDon()
            for o in don.values():
                if not trong(o, a, b):
                    continue
                if o["st"] in DON_TINH_TIEN:
                    t.doanh_so += o["tong"]
                    t.so_don += 1
                elif o["st"] == STATUS_CANCELLED:
                    t.so_huy += 1
                    t.tien_huy += o["tong"]
            t.tb_don = round(t.doanh_so / t.so_don) if t.so_don else None
            return t

        buoc_thuc, khoang = chia_cot(tu, den, buoc)
        cot = []
        for a, b in khoang:
            c = Cot(tu=a, den=b)
            a_cu, b_cu = lui_nam(a), lui_nam(b)
            for o in don.values():
                if o["st"] not in DON_TINH_TIEN:
                    continue
                if trong(o, a, b):
                    c.doanh_so += o["tong"]
                    c.so_don += 1
                elif trong(o, a_cu, b_cu):
                    c.doanh_so_cu += o["tong"]
                    c.so_don_cu += 1
            cot.append(c)

        sp: dict[str, SanPhamKy] = {}
        for o in don.values():
            if o["st"] not in DON_TINH_TIEN:
                continue
            if trong(o, tu, den):
                da_dem: set[str] = set()
                for ten, tien in o["dong"]:
                    s = sp.setdefault(ten, SanPhamKy(ten=ten))
                    s.doanh_so += tien
                    if ten not in da_dem:
                        s.so_lan += 1
                        da_dem.add(ten)
                    if s.lan_cuoi is None or o["ngay"] > s.lan_cuoi:
                        s.lan_cuoi = o["ngay"]
        for o in don.values():
            if o["st"] in DON_TINH_TIEN and trong(o, tu_cu, den_cu):
                for ten, tien in o["dong"]:
                    if ten in sp:
                        sp[ten].doanh_so_cu += tien
        san_pham = sorted(sp.values(), key=lambda s: -s.doanh_so)[:20]

        # Nhịp + lịch tần suất THEO KỲ như biểu đồ (04/10/2026 user yêu cầu). Khoảng cách tính trên
        # đơn đã chốt trong kỳ; "bao lâu chưa đặt" / "dự kiến" vẫn đo tới HÔM NAY — giao diện chỉ
        # nói chuyện "nên gọi" khi kỳ kết thúc ở hôm nay.
        trong_ky = sorted((o for o in don.values() if trong(o, tu, den)), key=lambda o: o["ngay"])
        diem_don = [DiemDon(ngay=o["ngay"], tong=o["tong"], huy=o["st"] == STATUS_CANCELLED)
                    for o in trong_ky if o["st"] in DON_TINH_TIEN or o["st"] == STATUS_CANCELLED]
        chot = [o["ngay"] for o in trong_ky if o["st"] in DON_TINH_TIEN]
        nhip = None
        if len(chot) >= 2:
            kc = [(b - a).days for a, b in zip(chot, chot[1:])]
            tb = max(1, round(sum(kc) / len(kc)))
            nhip = Nhip(tb_ngay=tb, lan_cuoi=chot[-1], so_ngay_tu_lan_cuoi=(hom_nay - chot[-1]).days,
                        nhanh_nhat=min(kc), lau_nhat=max(kc), so_don=len(chot),
                        du_kien=chot[-1] + timedelta(days=tb))

        bg, bg_cu, dang_cho = self._bao_gia_tong(customer_id, tu, den, tu_cu, den_cu, hom_nay)
        return ThongKeKhach(
            tu=tu, den=den, tu_cu=tu_cu, den_cu=den_cu, buoc=buoc_thuc,
            don=tong_don(tu, den), don_cu=tong_don(tu_cu, den_cu),
            bao_gia=bg, bao_gia_cu=bg_cu, cot=cot, san_pham=san_pham,
            nhip=nhip, diem_don=diem_don, dang_cho=dang_cho,
        )

    def _bao_gia_tong(self, customer_id: int, tu: date, den: date, tu_cu: date, den_cu: date,
                      hom_nay: date) -> tuple[TongBaoGia, TongBaoGia, DangCho]:
        # Đơn đầu tiên (không huỷ) sinh từ báo giá — để đo "từ báo đến chốt".
        don_dau = (
            select(Order.quotation_id.label("qid"), func.min(Order.created_at).label("ngay"))
            .where(Order.quotation_id.is_not(None), Order.status != STATUS_CANCELLED)
            .group_by(Order.quotation_id)
            .subquery()
        )
        rows = self.db.execute(
            select(Quote.status, Quote.created_at, Quote.valid_until,
                   QuoteVersion.final_amount, don_dau.c.ngay)
            .join(QuoteVersion, QuoteVersion.id == Quote.current_version_id, isouter=True)
            .join(don_dau, don_dau.c.qid == Quote.id, isouter=True)
            .where(
                Quote.customer_id == customer_id,
                or_(
                    and_(Quote.created_at >= moc(min(tu, tu_cu)),
                         Quote.created_at < moc(max(den, den_cu) + timedelta(days=1))),
                    Quote.status == "sent",  # đang chờ khách: tình trạng HIỆN TẠI, không theo kỳ
                ),
            )
        ).all()

        def tong(a: date, b: date) -> TongBaoGia:
            t = TongBaoGia()
            ngay_chot: list[int] = []
            for st, created, _han, tien, ngay_don in rows:
                d = ngay_vn(created)
                if not (a <= d <= b) or st == "cancelled":
                    continue
                t.so_bg += 1
                t.tong_gia_tri += int(tien or 0)
                if st in CHOT_THANG:
                    t.thang += 1
                if st in CHOT_DA_CHAO:
                    t.da_chao += 1
                if ngay_don is not None:
                    ngay_chot.append(max(0, (ngay_vn(ngay_don) - d).days))
            t.ti_le = round(t.thang / t.da_chao * 100) if t.da_chao else None
            t.tb_ngay_chot = round(sum(ngay_chot) / len(ngay_chot)) if ngay_chot else None
            return t

        cho = DangCho()
        for st, _created, han, tien, _nd in rows:
            if st != "sent" or (han is not None and han < hom_nay):
                continue
            cho.so += 1
            cho.tong += int(tien or 0)
            if han is not None and (han - hom_nay).days <= SAP_HET_HAN_NGAY:
                cho.sap_het_han += 1
        return tong(tu, den), tong(tu_cu, den_cu), cho

    # --- Lịch sử mua hàng ------------------------------------------------------------------------

    def _loc_don(self, customer_id: int, tu: date, den: date, q: str | None):
        dk = [Order.customer_id == customer_id,
              Order.created_at >= moc(tu), Order.created_at < moc(den + timedelta(days=1))]
        tim = (q or "").strip()
        if tim:
            mau = f"%{tim}%"
            # Bí danh riêng: câu trang đơn đã JOIN Quote + OrderLine, dùng chung bảng thì `exists` tự tương quan
            # hết FROM và SQLAlchemy từ chối.
            bg, dh = aliased(Quote), aliased(OrderLine)
            dk.append(or_(
                Order.order_no.ilike(mau),
                exists().where(dh.order_id == Order.id, dh.description.ilike(mau)),
                exists().where(bg.id == Order.quotation_id, bg.quote_number.ilike(mau)),
            ))
        return dk

    def lich_su_don(self, customer_id: int, *, tu: date, den: date, q: str | None = None,
                    nhom: str | None = None, sap_xep: str = "-ngay", trang: int = 1,
                    co: int = 50) -> TrangDon:
        dk = self._loc_don(customer_id, tu, den, q)

        # Số đếm cho các nút nhóm + tiền chốt: 1 câu GROUP BY (tổng đơn tính trong subquery để
        # COUNT không bị nhân theo số dòng hàng).
        tong_tung_don = (
            select(Order.id.label("id"), Order.status.label("st"),
                   func.coalesce(func.sum(OrderLine.line_total), 0).label("tong"))
            .join(OrderLine, OrderLine.order_id == Order.id, isouter=True)
            .where(*dk)
            .group_by(Order.id, Order.status)
            .subquery()
        )
        dem: dict[str, int] = {k: 0 for k in NHOM_DON}
        tien_chot = tien_huy = 0
        for st, so, tien in self.db.execute(
            select(tong_tung_don.c.st, func.count(), func.sum(tong_tung_don.c.tong))
            .group_by(tong_tung_don.c.st)
        ):
            for k, sts in NHOM_DON.items():
                if st in sts:
                    dem[k] += int(so)
            if st in DON_TINH_TIEN:
                tien_chot += int(tien or 0)
            elif st == STATUS_CANCELLED:
                tien_huy += int(tien or 0)
        tong_so_tat_ca = sum(dem.values())

        loc = list(dk)
        if nhom in NHOM_DON:
            loc.append(Order.status.in_(NHOM_DON[nhom]))
        tong_so = dem[nhom] if nhom in NHOM_DON else tong_so_tat_ca

        tien = func.coalesce(func.sum(OrderLine.line_total), 0)
        thu_tu = {
            "-ngay": (Order.created_at.desc(), Order.id.desc()),
            "ngay": (Order.created_at.asc(), Order.id.asc()),
            "-tien": (tien.desc(), Order.id.desc()),
            "tien": (tien.asc(), Order.id.asc()),
        }.get(sap_xep, (Order.created_at.desc(), Order.id.desc()))
        rows = self.db.execute(
            select(Order.id, Order.order_no, Order.status, Order.order_kind, Order.created_at,
                   Order.quotation_id, Quote.quote_number, func.sum(OrderLine.line_total))
            .join(OrderLine, OrderLine.order_id == Order.id, isouter=True)
            .join(Quote, Quote.id == Order.quotation_id, isouter=True)
            .where(*loc)
            .group_by(Order.id, Order.order_no, Order.status, Order.order_kind, Order.created_at,
                      Order.quotation_id, Quote.quote_number)
            .order_by(*thu_tu)
            .offset((trang - 1) * co)
            .limit(co)
        ).all()

        ids = [r[0] for r in rows]
        sp: dict[int, list[str]] = {}
        if ids:
            for oid, mo_ta in self.db.execute(
                select(OrderLine.order_id, OrderLine.description)
                .where(OrderLine.order_id.in_(ids)).order_by(OrderLine.id)
            ):
                if mo_ta and mo_ta.strip():
                    sp.setdefault(oid, []).append(mo_ta.strip())
        return TrangDon(
            items=[
                DongDon(id=oid, order_no=no, status=st, order_kind=kind,
                        tong=int(t) if t is not None else None, created_at=created,
                        bao_gia_id=qid, bao_gia_ma=qma, san_pham=sp.get(oid, []))
                for oid, no, st, kind, created, qid, qma, t in rows
            ],
            tong_so=tong_so, dem=dem, tien_chot=tien_chot, tien_huy=tien_huy,
        )

    # --- Lịch sử báo giá ---------------------------------------------------------------------------

    def lich_su_bao_gia(self, customer_id: int, *, tu: date, den: date, q: str | None = None,
                        nhom: str | None = None, trang: int = 1, co: int = 50,
                        hom_nay: date | None = None) -> TrangBaoGia:
        hom_nay = hom_nay or hom_nay_vn()
        nhom_sql = _nhom_bao_gia_sql(hom_nay)
        dk = [Quote.customer_id == customer_id,
              Quote.created_at >= moc(tu), Quote.created_at < moc(den + timedelta(days=1))]
        tim = (q or "").strip()
        if tim:
            mau = f"%{tim}%"
            dk.append(or_(
                Quote.quote_number.ilike(mau),
                exists().where(Order.quotation_id == Quote.id, Order.order_no.ilike(mau)),
            ))

        dem: dict[str, int] = {k: 0 for k in
                               ("cho", "thanh_don", "tu_choi", "het_han", "chua_gui", "huy")}
        for n, so in self.db.execute(select(nhom_sql, func.count()).where(*dk).group_by(nhom_sql)):
            dem[n] = int(so)

        loc = list(dk)
        if nhom in dem:
            loc.append(nhom_sql == nhom)
        tong_so = dem[nhom] if nhom in dem else sum(dem.values())

        rows = self.db.execute(
            select(Quote.id, Quote.quote_number, Quote.status, nhom_sql, Quote.valid_until,
                   Quote.created_at, QuoteVersion.version_number, QuoteVersion.final_amount)
            .join(QuoteVersion, QuoteVersion.id == Quote.current_version_id, isouter=True)
            .where(*loc)
            .order_by(Quote.created_at.desc(), Quote.id.desc())
            .offset((trang - 1) * co)
            .limit(co)
        ).all()

        # Đơn sinh từ báo giá: 1 câu IN cho cả trang. Lấy đơn KHÔNG huỷ sớm nhất.
        ids = [r[0] for r in rows]
        don: dict[int, tuple[int, str, datetime]] = {}
        if ids:
            for qid, oid, no, created in self.db.execute(
                select(Order.quotation_id, Order.id, Order.order_no, Order.created_at)
                .where(Order.quotation_id.in_(ids), Order.status != STATUS_CANCELLED)
                .order_by(Order.created_at.asc(), Order.id.asc())
            ):
                don.setdefault(qid, (oid, no, created))
        return TrangBaoGia(
            items=[
                DongBaoGia(
                    id=qid, code=ma, version=ver or 1, status=st, nhom=n,
                    total=int(tien) if tien is not None else None, valid_until=han,
                    created_at=created,
                    don_id=don.get(qid, (None,))[0],
                    don_ma=don[qid][1] if qid in don else None,
                    don_ngay=don[qid][2] if qid in don else None,
                )
                for qid, ma, st, n, han, created, ver, tien in rows
            ],
            tong_so=tong_so, dem=dem,
        )
