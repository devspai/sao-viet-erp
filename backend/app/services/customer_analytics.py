"""CRM-360 analytics — spec-06 (Khách hàng "hub of information").

All figures here are COMPUTED FROM REAL ROWS in the same app (``orders`` + ``order_lines``
+ ``quotations``) — never fabricated. When a customer has no orders/quotations the numbers
come back as honest zeros / empty series and the frontend renders an explicit empty state
(§PRODUCT_SENSE #4: "thà trống trung thực còn hơn số giả").

Two surfaces:
  - **List analytics** (:class:`CustomerListStats`): the KPI header strip (tổng KH · thân
    thiết · KH mới trong tháng · TB đơn) + a per-customer derived tier / LTV / order-count,
    all rolled up over the scoped set in ONE pass (no N+1).
  - **Detail analytics** (:class:`CustomerDashboard`): the Object-page Dashboard — doanh số
    12 tháng (bar), số đơn 12T, TB/đơn, công nợ (SEAM-16 read-only), cơ cấu sản phẩm (donut
    from order-line descriptions), tần suất đặt (heatmap 12T × weekday) — plus the two history
    tables (Lịch sử mua hàng from orders, Lịch sử báo giá from quotations).

Tier is a *behavioural* classification derived from real history (spend + tenure + recency),
NOT an invented master field — the domain (§DOMAIN L333) only speaks of "khách VIP" for the
volume discount, so a spend-based tier is the honest, data-grounded reading:
  - ``new``      — mới tạo trong 30 ngày HOẶC chưa có đơn nào.
  - ``loyal``    — doanh số 12T ≥ ``LOYAL_REVENUE_VND`` (khách thân thiết / VIP theo chi tiêu).
  - ``partner``  — khách từ > 365 ngày trước và có ≥1 đơn (đối tác lâu năm).
  - ``regular``  — còn lại (đang giao dịch, chưa đạt ngưỡng thân thiết).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.customer import Customer
from ..models.order import STATUS_ORDERED
from ..models.order import Order, OrderLine
from ..models.quotation import Quote, QuoteVersion

# Redesign spec-06 v2: BỎ tier (tự phân loại thân thiết/đối tác/mới) — thay bằng thẻ gán tay.
# Chỉ giữ số THẬT (doanh số / số đơn / recency) cho danh sách + dashboard.

# Doanh số / số đơn / ngày đặt gần nhất chỉ tính đơn ĐÃ CHỐT (04/10/2026). Bản cũ chỉ loại đơn huỷ
# nên đơn NHÁP — còn sửa được, chưa chắc thành — cũng cộng vào doanh số của khách. Cùng luật với
# `khach_hang_so_lieu.DON_TINH_TIEN` (hồ sơ khách theo kỳ) để cột "Mua hàng" ở danh sách khớp số
# trong hồ sơ.
_REVENUE_ORDER_STATUSES = (STATUS_ORDERED,)

# --- TỈ LỆ CHỐT: định nghĩa "thắng" và "đã chào" ở ĐÚNG MỘT CHỖ ---------------------------
#
# Sửa 16/08/2026 — bản cũ đếm sai CẢ HAI CHIỀU và cho ra con số bôi nhọ chính mình:
#   · BỎ SÓT `converted_to_order` ("Đã lên đơn — khoá 1 báo giá = 1 đơn"). Đây là thắng CHẮC
#     CHẮN, đã thành đơn hàng rồi. Khách An Phát có 11 báo giá loại này ⇒ màn hình ghi tỉ lệ
#     chốt 18% trong khi thực tế 88%.
#   · TÍNH NHẦM `approved` là thắng. Trạng thái đó nghĩa là "GĐ Kinh doanh duyệt xong, CHỜ sale
#     gửi khách" — khách còn chưa nhìn thấy báo giá.
#
# MẪU SỐ chỉ gồm báo giá khách ĐÃ THẤY. Loại `draft` / `pending_approval` / `approved` (chưa ra
# khỏi cửa) và `cancelled` (mình tự huỷ, không phải khách chê) — để trong mẫu số là tự trừ điểm
# vì những việc khách chưa hề biết. Báo giá `sent` đang chờ trả lời thì VẪN tính: đã chào mà
# chưa chốt được thì chưa phải thắng.
CHOT_THANG = ("accepted", "converted_to_order")
CHOT_DA_CHAO = ("sent", "accepted", "rejected", "expired", "converted_to_order")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value


@dataclass
class CustomerStat:
    """Per-customer derived numbers for a list row (all from real orders)."""

    customer_id: int
    revenue_12m: int = 0
    orders_12m: int = 0
    orders_total: int = 0
    last_order_at: date | None = None


@dataclass
class CustomerListStats:
    total_customers: int = 0
    new_this_month: int = 0
    avg_order_value: int = 0        # TB/đơn trên toàn tập scoped (0 nếu chưa có đơn)
    total_revenue: int = 0
    per_customer: dict[int, CustomerStat] = field(default_factory=dict)


@dataclass
class OrderLineBrief:
    """1 dòng của đơn: tên sản phẩm + TIỀN THẬT của chính dòng đó."""

    description: str
    line_total: int


@dataclass
class OrderHistoryRow:
    id: int
    order_no: str
    status: str
    order_kind: str
    summary: str        # mô tả gộp các dòng đơn (đối ngoại), "SP A, SP B"
    # Từng dòng kèm tiền. Thêm 16/08/2026 vì khối "Sản phẩm mua nhiều nhất" trước đây chỉ có
    # `summary` (chuỗi nối) nên frontend phải tách theo dấu phẩy rồi CHIA ĐỀU tổng đơn cho số
    # phần — đơn 21,5 Mđ gồm "Ruột sách 160 trang, Bìa sách, Thẻ nhân viên" bị gán mỗi thứ
    # 7,17 Mđ, dù ruột sách đắt hơn thẻ nhân viên nhiều lần. Tiền thật vốn nằm sẵn ở
    # `order_lines.line_total`, chỉ là không được trả xuống.
    lines: list[OrderLineBrief]
    total: int | None
    created_at: datetime


@dataclass
class QuoteHistoryRow:
    id: int
    code: str
    version: int
    status: str
    total: int | None
    valid_until: date | None
    created_at: datetime


class CustomerAnalyticsService:
    """Read-only analytics over the live sales tables. Framework-agnostic (takes a Session)."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # --- list roll-up -------------------------------------------------------

    def list_stats(self, customers: list[Customer]) -> CustomerListStats:
        """Roll up KPIs + per-customer tier over the given (already scoped+paged? no —
        WHOLE scoped set for the header) list of customers, in a bounded number of
        queries. `customers` should be the full scoped set so the KPI strip reflects the
        whole book, not just the current page."""
        stats = CustomerListStats(total_customers=len(customers))
        if not customers:
            return stats

        ids = [c.id for c in customers]
        # "12 tháng qua" tính theo NGÀY giờ VN, y hệt kỳ "12 tháng qua" ở hồ sơ khách
        # (khach_hang_so_lieu) — hai nơi cùng một nhãn mà lệch ngày là lệch số.
        from .khach_hang_so_lieu import hom_nay_vn, moc  # import trễ: module kia import ngược file này
        since = moc(hom_nay_vn() - timedelta(days=364))

        # Realised revenue + order count per customer over trailing 12 months (non-cancelled).
        rev_rows = self.db.execute(
            select(
                Order.customer_id,
                func.coalesce(func.sum(OrderLine.line_total), 0),
                func.count(func.distinct(Order.id)),
            )
            .join(OrderLine, OrderLine.order_id == Order.id)
            .where(
                Order.customer_id.in_(ids),
                Order.status.in_(_REVENUE_ORDER_STATUSES),
                Order.created_at >= since,
            )
            .group_by(Order.customer_id)
        ).all()
        rev_by_cust: dict[int, tuple[int, int]] = {
            cid: (int(rev or 0), int(cnt or 0)) for cid, rev, cnt in rev_rows
        }

        # Total order count + last order date per customer (all time, non-cancelled).
        tot_rows = self.db.execute(
            select(
                Order.customer_id,
                func.count(func.distinct(Order.id)),
                func.max(Order.created_at),
            )
            .where(
                Order.customer_id.in_(ids),
                Order.status.in_(_REVENUE_ORDER_STATUSES),
            )
            .group_by(Order.customer_id)
        ).all()
        tot_by_cust: dict[int, tuple[int, date | None]] = {
            cid: (int(cnt or 0), _as_date(last) if last else None)
            for cid, cnt, last in tot_rows
        }

        now = _utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        total_rev_12m = 0
        total_orders_12m = 0
        for c in customers:
            rev_12m, orders_12m = rev_by_cust.get(c.id, (0, 0))
            orders_total, last_order = tot_by_cust.get(c.id, (0, None))
            stats.per_customer[c.id] = CustomerStat(
                customer_id=c.id,
                revenue_12m=rev_12m,
                orders_12m=orders_12m,
                orders_total=orders_total,
                last_order_at=last_order,
            )
            created = c.created_at
            if created is not None and created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created is not None and created >= month_start:
                stats.new_this_month += 1
            total_rev_12m += rev_12m
            total_orders_12m += orders_12m

        stats.avg_order_value = (
            round(total_rev_12m / total_orders_12m) if total_orders_12m else 0
        )
        stats.total_revenue = total_rev_12m
        return stats

    # --- history tables -----------------------------------------------------

    def order_history(self, customer_id: int, *, limit: int = 200) -> list[OrderHistoryRow]:
        rows = self.db.execute(
            select(
                Order.id,
                Order.order_no,
                Order.status,
                Order.order_kind,
                func.sum(OrderLine.line_total),
                Order.created_at,
            )
            .join(OrderLine, OrderLine.order_id == Order.id, isouter=True)
            .where(Order.customer_id == customer_id)
            .group_by(
                Order.id, Order.order_no, Order.status, Order.order_kind, Order.created_at
            )
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(limit)
        ).all()
        # Dòng của đơn: mô tả + TIỀN THẬT của từng dòng — one query, no N+1.
        order_ids = [r[0] for r in rows]
        lines_by_order: dict[int, list[OrderLineBrief]] = {}
        if order_ids:
            for oid, desc, line_total in self.db.execute(
                select(OrderLine.order_id, OrderLine.description, OrderLine.line_total)
                .where(OrderLine.order_id.in_(order_ids))
                .order_by(OrderLine.id)
            ):
                if desc:
                    lines_by_order.setdefault(oid, []).append(
                        OrderLineBrief(description=desc.strip(), line_total=int(line_total or 0))
                    )
        return [
            OrderHistoryRow(
                id=oid,
                order_no=no,
                status=status,
                order_kind=kind,
                summary=", ".join(d.description for d in lines_by_order.get(oid, [])) or "—",
                lines=lines_by_order.get(oid, []),
                total=int(total) if total is not None else None,
                created_at=created,
            )
            for oid, no, status, kind, total, created in rows
        ]

    def quote_history(self, customer_id: int, *, limit: int = 200) -> list[QuoteHistoryRow]:
        rows = self.db.execute(
            select(Quote, QuoteVersion)
            .join(QuoteVersion, Quote.current_version_id == QuoteVersion.id, isouter=True)
            .where(Quote.customer_id == customer_id)
            .order_by(Quote.created_at.desc(), Quote.id.desc())
            .limit(limit)
        ).all()
        return [
            QuoteHistoryRow(
                id=q.id,
                code=q.quote_number,
                version=qv.version_number if qv else 1,
                status=q.status,
                total=int(qv.final_amount) if qv else 0,
                valid_until=q.valid_until,
                created_at=q.created_at,
            )
            for q, qv in rows
        ]
