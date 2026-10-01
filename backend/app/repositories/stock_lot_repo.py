"""Repository — Lô kho + ngưỡng tồn (spec-kho-de-nghi §6–§7).

Nguyên tắc: **không có bảng "tồn"**. Tồn luôn được TÍNH bằng Σ `sl_con_lai` của các lô,
nên tồn không thể lệch với lịch sử nhập/xuất. Mọi câu hỏi về tồn đều đi qua đây.

Mặt hàng được nhận diện bằng CẶP `(hang_loai, hang_id)` trỏ `giay_nguyen`/`vat_tu_in_an`
(mg 0171) — dùng nguyên cặp làm khoá dict luôn, tuple hashable nên khỏi bịa chuỗi khoá.
Mọi `sl_*` ở đây đã ở ĐƠN VỊ GỐC của mặt hàng; quy đổi xảy ra ở service trước khi ghi.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import func, select, tuple_
from sqlalchemy.orm import Session

from .document_sequence_repo import DocumentSequenceRepository

from ..models.customer import Customer
from ..models.lsx import Lsx
from ..models.order import Order
from ..models.stock_lot import LOT_AVAILABLE, LOT_EMPTY, LOT_ISSUABLE, StockLot, StockThreshold
from ..models.stock_request import StockRequest, StockRequestLine
from ..models.stock_voucher import VOUCHER_NHAP, StockVoucher, StockVoucherLine
from ..services.kho_giay import DANG_CUON, DANG_TO, chuan_kho

# (hang_loai, hang_id) — một mặt hàng gốc.
Hang = tuple[str, int]


def goc_cua(lot: StockLot) -> int:
    """Id lô GỐC: lô nhập từ yêu cầu là gốc của chính nó; lô sinh ra do điều chuyển nhớ `lo_goc_id`."""
    return int(lot.lo_goc_id or lot.id)


_NGUON_TRONG = {"lsx_id": None, "lsx_ma": None, "order_id": None, "order_ma": None,
                "customer_id": None, "khach_hang": None, "don_gia_ban": None, "tu_kcs": False}


def _chon_nguon(khoa):
    """Cột nguồn (dòng yêu cầu → lệnh → đơn → khách), đứng sau cột `khoa` của câu gọi."""
    return select(
        khoa, StockRequestLine.lsx_id, StockRequestLine.don_gia_ban,
        StockRequest.san_xuat_cong_viec_id, Lsx.ma, Order.id, Order.order_no,
        Customer.id, Customer.name,
    )


def _dong_nguon(r) -> dict:
    return {
        "lsx_id": r[1], "lsx_ma": r[4], "order_id": r[5], "order_ma": r[6],
        "customer_id": r[7], "khach_hang": r[8],
        "don_gia_ban": int(r[2]) if r[2] is not None else None,
        "tu_kcs": r[3] is not None,
    }


class StockLotRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, lot_id: int) -> StockLot | None:
        return self.db.get(StockLot, lot_id)

    def set_vi_tri(self, lot_id: int, vi_tri: str | None) -> StockLot | None:
        """Sửa vị trí cất lô. Trả None nếu không có lô."""
        lot = self.get(lot_id)
        if lot is None:
            return None
        lot.vi_tri = vi_tri
        self.db.commit()
        self.db.refresh(lot)
        return lot

    def ghi_dang_kho(self, lot: StockLot, *, dang: str, kho_rong: int, kho_dai: int,
                     sl_ban_dau, sl_con_lai) -> StockLot:
        """Ghi dạng/khổ + số lượng đã đổi cho MỘT lô; KHÔNG commit (người gọi gộp với nhật ký)."""
        lot.dang_giay = dang
        lot.kho_rong = kho_rong
        lot.kho_dai = kho_dai
        lot.sl_ban_dau = sl_ban_dau
        lot.sl_con_lai = sl_con_lai
        return lot

    def by_ids(self, ids) -> dict[int, StockLot]:
        """Nạp NHIỀU lô trong 1 query — tránh N+1 khi serialize danh sách phiếu xuất."""
        ids = [i for i in set(ids) if i is not None]
        if not ids:
            return {}
        rows = self.db.execute(select(StockLot).where(StockLot.id.in_(ids))).scalars()
        return {lot.id: lot for lot in rows}

    def next_ma_lo(self, ma_hang: str, ngay: date) -> str:
        """Mã lô LOT-<mã hàng>-<yymmdd>-<seq>. `seq` đếm trong NGÀY của mã hàng đó nên
        mã đọc được bằng mắt; `ma_lo` unique nên va chạm sẽ nổ ở DB chứ không âm thầm.

        `ma_hang` giờ là mã trong danh mục gốc (GY001 / VT004), không phải mã `materials` cũ.
        """
        ma = ma_hang.strip().upper()
        prefix = f"LOT-{ma}-{ngay:%y%m%d}-"
        # Bộ đếm theo (mã hàng, ngày): hai phiếu nhập cùng mặt hàng duyệt cùng lúc — hay hai dòng
        # cùng mặt hàng trong MỘT phiếu (session không autoflush nên lô thứ nhất chưa xuống DB) —
        # không còn cùng ra `-01` rồi vỡ UNIQUE.
        return DocumentSequenceRepository(self.db).cap_ma(
            f"lo:{ngay:%m%d}:{ma}", ngay.year, StockLot.ma_lo, prefix, rong=2,
        )

    def nguon_lo(self, lot_ids) -> dict[int, dict]:
        """`{lot_id: nguồn}` đọc ở LÔ GỐC: lô gốc → dòng phiếu nhập → dòng yêu cầu → lệnh → đơn → khách.

        Khoá: `lo_goc_id, lsx_id, lsx_ma, order_id, order_ma, customer_id, khach_hang, don_gia_ban,
        tu_kcs`. Lô không truy được dòng yêu cầu thì mọi khoá nguồn là None và `tu_kcs` False. Đơn /
        khách / giá bán KHÔNG chép qua mỗi lần điều chuyển — đọc một chỗ để không có hai số.
        Hai câu cho cả tập (lô → lô gốc, lô gốc → nguồn)."""
        ids = {int(i) for i in lot_ids if i}
        if not ids:
            return {}
        goc = {int(i): int(g or i) for i, g in self.db.execute(
            select(StockLot.id, StockLot.lo_goc_id).where(StockLot.id.in_(ids))).all()}
        rows = self.db.execute(
            _chon_nguon(StockVoucherLine.lot_id)
            .select_from(StockVoucherLine)
            .join(StockVoucher, StockVoucher.id == StockVoucherLine.voucher_id)
            .join(StockRequestLine, StockRequestLine.id == StockVoucherLine.request_line_id)
            .join(StockRequest, StockRequest.id == StockRequestLine.request_id)
            .outerjoin(Lsx, Lsx.id == StockRequestLine.lsx_id)
            .outerjoin(Order, Order.id == Lsx.order_id)
            .outerjoin(Customer, Customer.id == Order.customer_id)
            # Chỉ dòng phiếu NHẬP đẻ ra lô — dòng phiếu XUẤT cũng trỏ `lot_id` về lô này.
            .where(StockVoucherLine.lot_id.in_(set(goc.values())), StockVoucher.loai == VOUCHER_NHAP)
        ).all()
        theo_goc = {int(r[0]): _dong_nguon(r) for r in rows}
        return {i: {"lo_goc_id": g, **theo_goc.get(g, _NGUON_TRONG)} for i, g in goc.items()}

    def nguon_dong_yeu_cau(self, request_line_ids) -> dict[int, dict]:
        """`{request_line_id: nguồn}`, cùng khoá với `nguon_lo` trừ `lo_goc_id` — cho dòng phiếu NHẬP
        còn nháp: chưa có lô để truy nên đọc thẳng dòng yêu cầu nó ứng. Một câu cho cả tập."""
        ids = {int(i) for i in request_line_ids if i}
        if not ids:
            return {}
        rows = self.db.execute(
            _chon_nguon(StockRequestLine.id)
            .select_from(StockRequestLine)
            .join(StockRequest, StockRequest.id == StockRequestLine.request_id)
            .outerjoin(Lsx, Lsx.id == StockRequestLine.lsx_id)
            .outerjoin(Order, Order.id == Lsx.order_id)
            .outerjoin(Customer, Customer.id == Order.customer_id)
            .where(StockRequestLine.id.in_(ids))
        ).all()
        return {int(r[0]): _dong_nguon(r) for r in rows}

    def create(self, **data) -> StockLot:
        lot = StockLot(**data)
        self.db.add(lot)
        self.db.flush()
        return lot

    @staticmethod
    def _loc_dang_kho(stmt, dang: str | None, kho_rong: int, kho_dai: int):
        """Lọc lô giấy theo DẠNG và (lô TỜ) đúng KHỔ — so bằng nhau tuyệt đối trên hai số đã chuẩn hoá
        (spec §3.1). Cuộn gom theo mã nên khổ rộng không lọc. `dang=None` ⇒ không lọc gì."""
        if dang is None:
            return stmt
        stmt = stmt.where(StockLot.dang_giay == dang)
        kr, kd = chuan_kho(kho_rong, kho_dai)
        if dang == DANG_TO and kr and kd:
            stmt = stmt.where(StockLot.kho_rong == kr, StockLot.kho_dai == kd)
        return stmt

    def issuable_lots(self, hang: Hang, kho_id: int, *, dang: str | None = None,
                      kho_rong: int = 0, kho_dai: int = 0) -> list[StockLot]:
        """Các lô còn hàng và được phép xuất, xếp theo gợi ý **FEFO rồi FIFO**: lô có hạn
        dùng gần nhất đi trước (tránh để quá date), hết hạn dùng thì tới lô nhập trước.

        Đây chỉ là GỢI Ý — thủ kho vẫn đổi được lô, vì BRD §3.19 chốt giá xuất là đích danh.

        Giấy: `dang` (+ khổ với tờ) lọc đúng dạng/khổ dòng xin — lô khác dạng hoặc khác khổ không bao
        giờ được gợi ý.
        """
        stmt = (
            select(StockLot)
            .where(
                StockLot.hang_loai == hang[0],
                StockLot.hang_id == hang[1],
                StockLot.kho_id == kho_id,
                StockLot.sl_con_lai > 0,
                StockLot.trang_thai.in_(LOT_ISSUABLE),
            )
            # NULL hsd xuống cuối: lô không có hạn thì không việc gì phải ưu tiên xuất.
            .order_by(
                (StockLot.hsd.is_(None)).asc(),
                StockLot.hsd.asc(),
                StockLot.ngay_nhap.asc(),
                StockLot.id.asc(),
            )
        )
        return list(self.db.execute(self._loc_dang_kho(stmt, dang, kho_rong, kho_dai)).scalars())

    def consume(self, lot: StockLot, qty: float) -> None:
        """Trừ `qty` khỏi lô. Lô hết hàng thì đánh dấu `empty` để khỏi lọt vào gợi ý xuất.

        KHÔNG kiểm tra đủ/thiếu ở đây — service đã chặn trước; repo chỉ ghi.
        """
        lot.sl_con_lai = float(lot.sl_con_lai) - qty
        # Ngưỡng epsilon thay vì `<= 0`: lô + dòng phiếu cùng scale 4dp nên xuất hết ra đúng 0, nhưng
        # phép trừ float từ Decimal có thể để lại bụi ~1e-14 → snap về 0 để lô chuyển 'empty' đúng
        # (1e-6 nhỏ hơn đơn vị nhỏ nhất 0.0001 nên không nuốt tồn thật).
        if float(lot.sl_con_lai) <= 1e-6:
            lot.sl_con_lai = 0
            lot.trang_thai = LOT_EMPTY

    def restore(self, lot: StockLot, qty: float) -> None:
        """TRẢ `qty` về lô (điều chỉnh xuất — SX dùng ít hơn số đã xuất). Ngược với `consume`.

        Lô đã xuất hết (`empty`) → CỘNG lại thì bật về `available` để xuất tiếp được; lô còn
        `available` thì chỉ cộng số. KHÔNG kiểm tra gì (service đã chặn); KHÔNG commit (service gom
        1 transaction). Chỉ bật lại từ `empty`: `hold`/`qc_wait`/`defect` là trạng thái CỐ Ý của
        người dùng, không tự đạp về `available`.
        """
        lot.sl_con_lai = float(lot.sl_con_lai) + qty
        if float(lot.sl_con_lai) > 1e-6 and lot.trang_thai == LOT_EMPTY:
            lot.trang_thai = LOT_AVAILABLE

    def on_hand(self, hang: tuple, kho_id: int | None = None) -> float:
        """**Tồn khả dụng** = Σ sl_con_lai của lô ở trạng thái xuất được, theo ĐƠN VỊ GỐC.

        Cố tình KHÔNG trả tồn thực tế: hàng chờ KCS / hàng lỗi nằm trong kho nhưng không
        dùng được, cộng vào là hứa suông với người yêu cầu (BRD §1.5).

        `hang` là cặp `(loai, id)` hoặc khoá tồn 4 phần tử — cùng luật `on_hand_map`.
        """
        return self.on_hand_map([hang], kho_id).get(tuple(hang), 0.0)

    def _tong_theo_khoa(self, keys: list[tuple], kho_id: int | None,
                        theo_kho: bool) -> dict[tuple, dict]:
        """Σ tồn khả dụng của từng khoá, chia theo kho (`theo_kho`) hoặc gom một ô `None`.

        Luật khoá (spec §3.2): cặp 2 phần tử hoặc hàng khác giấy ⇒ gom mọi lô của mã; giấy có đủ khổ
        ⇒ chỉ lô TỜ đúng khổ; giấy `(…, 0, 0)` ⇒ chỉ lô CUỘN. Lô giấy chưa có dạng (dữ liệu kg cũ)
        không vào khoá 4 phần tử nào. Tối đa ba câu (theo mã / tờ / cuộn) cho cả tập."""
        theo_ma = {(k[0], int(k[1])) for k in keys if len(k) == 2 or k[0] != "giay"}
        to = {(int(k[1]), int(k[2]), int(k[3])) for k in keys
              if len(k) == 4 and k[0] == "giay" and k[2] and k[3]}
        cuon = {int(k[1]) for k in keys if len(k) == 4 and k[0] == "giay" and not (k[2] and k[3])}
        base = [StockLot.trang_thai.in_(LOT_ISSUABLE)]
        if kho_id is not None:
            base.append(StockLot.kho_id == kho_id)
        if theo_kho:
            base.append(StockLot.sl_con_lai > 0)
        sl = func.coalesce(func.sum(StockLot.sl_con_lai), 0)
        cot_kho = [StockLot.kho_id] if theo_kho else []

        def gom(cot_khoa, *loc) -> dict[tuple, dict]:
            out: dict[tuple, dict] = {}
            for r in self.db.execute(select(*cot_khoa, *cot_kho, sl).where(*loc, *base)
                                     .group_by(*cot_khoa, *cot_kho)):
                n = len(cot_khoa)
                kho = r[n] if theo_kho else None
                if theo_kho and kho is None:
                    continue
                out.setdefault(tuple(r[:n]), {})[int(kho) if kho is not None else None] = float(r[-1] or 0)
            return out

        f_ma = gom([StockLot.hang_loai, StockLot.hang_id],
                   # `tuple_(...).in_(...)` lọc đúng CẶP: lọc rời hai cột quét nhầm tổ hợp không ai hỏi.
                   tuple_(StockLot.hang_loai, StockLot.hang_id).in_(sorted(theo_ma))) if theo_ma else {}
        f_to = gom([StockLot.hang_id, StockLot.kho_rong, StockLot.kho_dai],
                   StockLot.hang_loai == "giay", StockLot.dang_giay == DANG_TO,
                   tuple_(StockLot.hang_id, StockLot.kho_rong, StockLot.kho_dai).in_(sorted(to))) if to else {}
        f_cuon = gom([StockLot.hang_id], StockLot.hang_loai == "giay", StockLot.dang_giay == DANG_CUON,
                     StockLot.hang_id.in_(sorted(cuon))) if cuon else {}
        out: dict[tuple, dict] = {}
        for k in keys:
            if len(k) == 2 or k[0] != "giay":
                out[k] = f_ma.get((k[0], int(k[1])), {})
            elif k[2] and k[3]:
                out[k] = f_to.get((int(k[1]), int(k[2]), int(k[3])), {})
            else:
                out[k] = f_cuon.get((int(k[1]),), {})
        return out

    def on_hand_map(self, hangs: list[tuple], kho_id: int | None = None) -> dict[tuple, float]:
        """Tồn khả dụng của NHIỀU mặt hàng trong ít query — dùng khi vẽ đèn tín hiệu cho cả
        danh sách đề nghị (tránh N+1). Khoá là cặp `(hang_loai, hang_id)` (gom mọi lô của mã, hành vi
        cũ) hoặc khoá tồn 4 phần tử `kho_giay.Khoa`; dict trả về khoá ĐÚNG như đầu vào."""
        if not hangs:
            return {}
        keys = [tuple(h) for h in hangs]
        return {k: v.get(None, 0.0) for k, v in self._tong_theo_khoa(keys, kho_id, False).items()}

    def on_hand_by_kho(self, hangs: list[tuple]) -> dict[tuple, dict[int, float]]:
        """Tồn khả dụng của từng khoá, TÁCH THEO KHO — để xếp hạng "kho nào có nhiều hàng
        nhất" khi gợi ý kho xuất. Khoá ngoài như `on_hand_map`, khoá trong là `kho_id`; kho không có
        lô nào của khoá thì vắng mặt (không phải 0 rải khắp)."""
        if not hangs:
            return {}
        keys = [tuple(h) for h in hangs]
        return {k: dict(v) for k, v in self._tong_theo_khoa(keys, None, True).items()}

    def list_lots(self, *, hang: Hang | None = None, kho_id: int | None = None,
                  con_hang: bool = True, dang: str | None = None,
                  kho_rong: int = 0, kho_dai: int = 0) -> list[StockLot]:
        stmt = self._loc_dang_kho(select(StockLot), dang, kho_rong, kho_dai)
        if hang is not None:
            stmt = stmt.where(StockLot.hang_loai == hang[0], StockLot.hang_id == hang[1])
        if kho_id is not None:
            stmt = stmt.where(StockLot.kho_id == kho_id)
        if con_hang:
            stmt = stmt.where(StockLot.sl_con_lai > 0)
        return list(self.db.execute(stmt.order_by(StockLot.ngay_nhap.asc(), StockLot.id.asc())).scalars())


class StockThresholdRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _khoa4(hang: tuple) -> tuple[str, int, int, int]:
        """Cặp `(loai, id)` = khoá `(loai, id, 0, 0)` — ngưỡng của mã gom (vật tư, giấy cuộn)."""
        h = tuple(hang)
        return (h[0], int(h[1]), int(h[2]), int(h[3])) if len(h) == 4 else (h[0], int(h[1]), 0, 0)

    def get_for(self, hang: tuple, kho_id: int) -> StockThreshold | None:
        loai, hid, kr, kd = self._khoa4(hang)
        return self.db.execute(
            select(StockThreshold).where(
                StockThreshold.hang_loai == loai,
                StockThreshold.hang_id == hid,
                StockThreshold.kho_rong == kr,
                StockThreshold.kho_dai == kd,
                StockThreshold.kho_id == kho_id,
            )
        ).scalars().first()

    def map_for(self, hangs: list[tuple], kho_id: int) -> dict[tuple, StockThreshold]:
        """`{khoá như đầu vào: ngưỡng}` — khoá 2 phần tử đọc ngưỡng `(…, 0, 0)`."""
        if not hangs:
            return {}
        theo4 = {self._khoa4(h): tuple(h) for h in hangs}
        rows = self.db.execute(
            select(StockThreshold).where(
                tuple_(StockThreshold.hang_loai, StockThreshold.hang_id,
                       StockThreshold.kho_rong, StockThreshold.kho_dai).in_(sorted(theo4)),
                StockThreshold.kho_id == kho_id,
            )
        ).scalars()
        out = {}
        for r in rows:
            k = theo4.get((r.hang_loai, r.hang_id, int(r.kho_rong or 0), int(r.kho_dai or 0)))
            if k is not None:
                out[k] = r
        return out

    def list_active(self) -> list[StockThreshold]:
        """Mọi ngưỡng đang bật cảnh báo — nguồn quét để đẩy nhắc realtime (spec §8)."""
        return list(self.db.execute(
            select(StockThreshold).where(StockThreshold.canh_bao.is_(True))
        ).scalars())

    def upsert(self, *, hang: tuple, kho_id: int, **data) -> StockThreshold:
        obj = self.get_for(hang, kho_id)
        if obj is None:
            loai, hid, kr, kd = self._khoa4(hang)
            obj = StockThreshold(hang_loai=loai, hang_id=hid, kho_rong=kr, kho_dai=kd,
                                 kho_id=kho_id, nguong_ton=0)
            self.db.add(obj)
        for k, v in data.items():
            setattr(obj, k, v)
        self.db.commit()
        self.db.refresh(obj)
        return obj
