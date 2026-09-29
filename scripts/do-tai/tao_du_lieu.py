"""Tạo dữ liệu cho stack ĐO TẢI (`erp-svn-tai`) — CHẠY BÊN TRONG container backend.

    docker compose -p erp-svn-tai cp scripts/do-tai/tao_du_lieu.py backend:/tmp/tao_du_lieu.py
    docker compose -p erp-svn-tai exec backend python /tmp/tao_du_lieu.py --so-nguoi 400 --mat-khau '...'

Dựng (idempotent, chạy lại bao nhiêu lần cũng được):
  · Khối sản xuất: bật cờ `la_san_xuat` cho phòng "Sản xuất", thêm 4 tổ lá "Tổ đo tải 1..4" rồi đồng bộ
    dòng quyền theo tổ (`to_sx_<id>`) — để công nhân có Bàn tổ như ngoài xưởng.
  · Vai "Công nhân đo tải": ba ô mặc định (`quyen_mac_dinh`) + đúng bộ quyền của vai "Thợ SX" trong
    seed + Xem bàn tổ phần của mình (dòng `to_sx_<Sản xuất>` phạm vi own).
  · Vai "Quản lý đo tải" (~10% tài khoản): toàn quyền trên các màn có badge (báo giá, đơn hàng, sản
    xuất, kho, nghỉ phép, tăng ca, chấm công duyệt, lương, khách hàng, kế hoạch vật tư, xếp lịch,
    bài ghép, kỹ thuật máy, bảo trì, thu mua, kế toán, phiếu chi) + trọn các tổ — chùm badge nặng nhất.
  · Ca "Ca đo tải" phủ GIỜ HIỆN TẠI (bắt đầu 30 phút trước lúc chạy script, dài 10 tiếng) — chấm VÀO
    chỉ hợp lệ trong khung ca, nên chạy lại script nếu đo ở giờ khác.
  · Điểm chấm công "Điểm đo tải" bán kính 5000 m tại toạ độ cố định (mặc định 10.7769, 106.7009).
  · N tài khoản `tai_001..tai_N`, mật khẩu chung, mỗi người một hồ sơ nhân viên đang làm, gắn ca trên.

`--xoa-cham-cong`: xoá mọi lượt chấm công của các hồ sơ `tai_*` (để lượt đo đầu ca sau lại là lượt VÀO
chứ không bị luật "đã RA ca chính" chặn). Chỉ đụng hồ sơ của tài khoản `tai_*`.

AN TOÀN: từ chối chạy nếu `DATABASE_URL` không chứa `svn_tai` — không bao giờ ghi vào DB dev/prod.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

TEN_DB_DO_TAI = "svn_tai"


def _kiem_db() -> None:
    url = os.environ.get("DATABASE_URL", "")
    if TEN_DB_DO_TAI not in url:
        print(f"TỪ CHỐI: DATABASE_URL không chứa '{TEN_DB_DO_TAI}' — script này chỉ chạy trên stack đo tải.",
              file=sys.stderr)
        sys.exit(2)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--so-nguoi", type=int, required=True)
    ap.add_argument("--mat-khau", required=True, help="mật khẩu chung cho mọi tài khoản tai_*")
    ap.add_argument("--ti-le-quan-ly", type=float, default=0.10)
    ap.add_argument("--lat", type=float, default=10.7769)
    ap.add_argument("--lon", type=float, default=106.7009)
    ap.add_argument("--xoa-cham-cong", action="store_true")
    ap.add_argument("--chi-xoa-cham-cong", action="store_true",
                    help="chỉ xoá lượt chấm công + dời ca về giờ hiện tại, không tạo tài khoản")
    args = ap.parse_args()

    _kiem_db()
    # Container: mã nguồn ở /app (WORKDIR). Chạy từ /tmp thì sys.path không có /app.
    for p in ("/app", os.getcwd()):
        if p not in sys.path:
            sys.path.insert(0, p)

    from app.config import settings

    if TEN_DB_DO_TAI not in settings.database_url:
        print("TỪ CHỐI: settings.database_url không trỏ vào DB đo tải.", file=sys.stderr)
        sys.exit(2)

    from app.db import SessionLocal
    from app.models.attendance import AttendanceLog
    from app.models.employee import STATUS_ACTIVE, Employee
    from app.models.role import SCOPE_ALL, SCOPE_OWN
    from app.models.user import User
    from app.repositories.attendance_repo import AttendanceRepository
    from app.repositories.employee_repo import EmployeeRepository
    from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
    from app.repositories.user_repo import UserRepository
    from app.security import hash_password
    from app.seed import ROLES, _full, quyen_mac_dinh
    from app.services.quyen_to import dong_bo_dong_quyen_to, khoa_to

    db = SessionLocal()
    t0 = time.time()
    try:
        depts = DepartmentRepository(db)
        roles = RoleRepository(db)
        users = UserRepository(db)
        emps = EmployeeRepository(db)
        att = AttendanceRepository(db)

        # --- Ca phủ giờ hiện tại -------------------------------------------------------------
        vn = timezone(timedelta(hours=7))
        now_vn = datetime.now(timezone.utc).astimezone(vn)
        phut = now_vn.hour * 60 + now_vn.minute
        bat_dau = max(0, phut - 30)
        ket_thuc = bat_dau + 600
        qua_dem = ket_thuc >= 1440
        if qua_dem:
            ket_thuc -= 1440
        ca = next((s for s in att.list_shifts() if s.name == "Ca đo tải"), None)
        if ca is None:
            ca = att.create_shift(name="Ca đo tải", start_minute=bat_dau, end_minute=ket_thuc,
                                  is_overnight=qua_dem, grace_minutes=5, is_active=True,
                                  ca_san_xuat=True)
        else:
            ca.start_minute, ca.end_minute, ca.is_overnight, ca.is_active = bat_dau, ket_thuc, qua_dem, True
            db.commit()
        print(f"Ca đo tải: {bat_dau // 60:02d}:{bat_dau % 60:02d} → {ket_thuc // 60:02d}:{ket_thuc % 60:02d}"
              f"{' (qua đêm)' if qua_dem else ''}")

        # --- Xoá chấm công của tai_* ------------------------------------------------------------
        if args.xoa_cham_cong or args.chi_xoa_cham_cong:
            emp_ids = [e for (e,) in db.query(Employee.id).join(User, Employee.user_id == User.id)
                       .filter(User.username.like("tai\\_%", escape="\\")).all()]
            n = 0
            if emp_ids:
                n = (db.query(AttendanceLog).filter(AttendanceLog.employee_id.in_(emp_ids))
                     .delete(synchronize_session=False))
            db.commit()
            print(f"Đã xoá {n} lượt chấm công của {len(emp_ids)} hồ sơ tai_*.")
        if args.chi_xoa_cham_cong:
            return

        # --- Điểm chấm công ----------------------------------------------------------------------
        diem = next((l for l in att.list_locations() if l.name == "Điểm đo tải"), None)
        if diem is None:
            att.create_location(name="Điểm đo tải", latitude=args.lat, longitude=args.lon,
                                radius_m=5000, note="Stack đo tải", is_active=True)
        else:
            diem.latitude, diem.longitude, diem.radius_m, diem.is_active = args.lat, args.lon, 5000, True
            db.commit()

        # --- Khối sản xuất + 4 tổ ----------------------------------------------------------------
        sx = depts.get_by_name("Sản xuất")
        if sx is None:
            sx = depts.create(name="Sản xuất")
        if not sx.la_san_xuat:
            depts.set_la_san_xuat(sx, True)
        to_ids = []
        for i in range(1, 5):
            ten = f"Tổ đo tải {i}"
            d = depts.get_by_name(ten)
            if d is None:
                d = depts.create(name=ten, parent_id=sx.id, has_piece_work=True)
            to_ids.append(d.id)
        dong_bo_dong_quyen_to(db)
        khoa_goc = khoa_to(sx.id)

        # --- Vai -----------------------------------------------------------------------------------
        def dat_vai(ten: str, perms: dict[str, dict]):
            vai = roles.get_by_name_and_department(ten, sx.id) or roles.create(name=ten, department_id=sx.id)
            for mk, p in perms.items():
                roles.set_permission(role_id=vai.id, module_key=mk, commit=False, **p)
            db.commit()
            return vai

        tho = next(p for (dept, ten, p) in ROLES if dept == "Sản xuất" and ten == "Thợ SX")
        vai_cn = dat_vai("Công nhân đo tải", {
            **quyen_mac_dinh(), **tho,
            khoa_goc: dict(can_read=True, scope=SCOPE_OWN),
        })
        MODULE_QL = ["dashboard", "bao_gia", "don_hang_ban", "khach_hang", "san_xuat", "kho", "ton_kho",
                     "nghi_phep", "tang_ca", "cham_cong", "luong", "ke_hoach_vat_tu", "xep_lich",
                     "bai_ghep_2", "lenh_san_xuat", "theo_doi_san_xuat", "ky_thuat_may", "phieu_bao_tri",
                     "thu_mua", "ke_toan", "phieu_chi"]
        vai_ql = dat_vai("Quản lý đo tải", {
            **quyen_mac_dinh(),
            **{k: _full(SCOPE_ALL) for k in MODULE_QL},
            khoa_goc: dict(can_read=True, can_run_order=True, can_confirm_output=True,
                           can_warehouse=True, scope=SCOPE_ALL),
        })

        # --- Tài khoản + hồ sơ -----------------------------------------------------------------
        # bcrypt MỘT lần: cùng mật khẩu thì dùng chung một hash vẫn đăng nhập đúng (muối nằm trong hash).
        pw_hash = hash_password(args.mat_khau)
        so_ql = 0
        tao_moi = 0
        buoc_ql = max(1, round(1 / args.ti_le_quan_ly)) if args.ti_le_quan_ly > 0 else 0
        for i in range(1, args.so_nguoi + 1):
            uname = f"tai_{i:03d}"
            la_ql = bool(buoc_ql) and i % buoc_ql == 0
            u = users.get_by_username(uname)
            if u is None:
                u = users.create(username=uname, name=f"Người đo tải {i:03d}", password_hash=pw_hash)
                tao_moi += 1
            elif u.password_hash != pw_hash:
                u.password_hash = pw_hash
                db.commit()
            dept_id = sx.id if la_ql else to_ids[(i - 1) % len(to_ids)]
            vai = vai_ql if la_ql else vai_cn
            if u.department_id != dept_id or u.role_id != vai.id or not u.is_active:
                users.set_assignment(u, department_id=dept_id, role_id=vai.id, is_active=True)
            e = emps.get_by_user_id(u.id)
            if e is None:
                emps.create(full_name=f"Người đo tải {i:03d}", department_id=dept_id,
                            position="Quản lý" if la_ql else "Công nhân", status=STATUS_ACTIVE,
                            hire_date=date(2025, 1, 1), user_id=u.id, default_shift_id=ca.id)
            elif e.default_shift_id != ca.id or e.department_id != dept_id:
                emps.update(e, default_shift_id=ca.id, department_id=dept_id)
            so_ql += int(la_ql)
        print(f"Xong: {args.so_nguoi} tài khoản tai_* ({tao_moi} mới, {so_ql} quản lý), 4 tổ, "
              f"điểm chấm ({args.lat}, {args.lon}) r=5000m — {time.time() - t0:.1f}s")
    finally:
        db.close()


if __name__ == "__main__":
    main()
