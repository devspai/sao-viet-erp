"""Đo tài nguyên máy đang chạy để các ngưỡng TỰ CO GIÃN theo VPS.

Mọi ngưỡng ở đây đều là MẶC ĐỊNH: biến môi trường tương ứng (xem `config.Settings`) ghi đè được.
Đọc giới hạn của CONTAINER (cgroup) trước, không có mới rơi về con số của cả máy — chạy trong Docker
mà đọc `/proc/meminfo` là thấy RAM của cả VPS, trong khi container có thể bị giới hạn ít hơn nhiều.

Ngân sách kết nối Postgres là CHUNG cho mọi worker: `max_connections` của Postgres chia đều cho các
tiến trình, chừa lại một phần cho migrate/psql/sao lưu. Vượt ngân sách thì Postgres từ chối kết nối
mới — lỗi còn khó chịu hơn xếp hàng.
"""
from __future__ import annotations

import os

# Chừa cho migrate, psql tay, pg_dump, ticker… — những thứ không đi qua pool của worker.
KET_NOI_DU_PHONG = 20
# Trần mỗi worker: quá mức này thì thêm kết nối không làm nhanh hơn (GIL + CPU là nút thắt), chỉ
# làm Postgres tốn RAM.
TRAN_POOL_MOI_WORKER = 30
# RAM một worker uvicorn ăn khi đã nạp hết app + chạy tải bình thường (đo ~250–300 MB).
RAM_MOI_WORKER_MB = 350
TRAN_WORKER = 8


def _doc(duong_dan: str) -> str | None:
    try:
        with open(duong_dan, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return None


def so_cpu() -> int:
    """Số CPU container được dùng: quota cgroup v2 (`cpu.max`) nếu có, không thì số CPU được gán."""
    cpu_max = _doc("/sys/fs/cgroup/cpu.max")
    if cpu_max:
        phan = cpu_max.split()
        if len(phan) == 2 and phan[0] != "max":
            try:
                quota, chu_ky = int(phan[0]), int(phan[1])
                if quota > 0 and chu_ky > 0:
                    return max(1, quota // chu_ky)
            except ValueError:
                pass
    try:
        return max(1, len(os.sched_getaffinity(0)))  # type: ignore[attr-defined]
    except (AttributeError, OSError):
        return max(1, os.cpu_count() or 1)


def ram_mb() -> int:
    """RAM backend được dùng (MB): `memory.max` của cgroup v2 nếu container bị giới hạn; không thì
    MỘT NỬA MemTotal — cả VPS còn chạy chung Postgres, MinIO, Redis, nginx, nên backend không được
    tính như mình nó chiếm trọn máy. Không đọc được gì (Windows dev) thì giả định 2048."""
    gioi_han = _doc("/sys/fs/cgroup/memory.max")
    if gioi_han and gioi_han != "max":
        try:
            return max(256, int(gioi_han) // (1024 * 1024))
        except ValueError:
            pass
    meminfo = _doc("/proc/meminfo")
    if meminfo:
        for dong in meminfo.splitlines():
            if dong.startswith("MemTotal:"):
                try:
                    return max(256, int(dong.split()[1]) // 1024 // 2)
                except (IndexError, ValueError):
                    break
    return 2048


def so_worker_mac_dinh(cpu: int | None = None, ram: int | None = None) -> int:
    """2 worker mỗi CPU (app phần lớn chờ DB, không ăn trọn CPU), nhưng không vượt RAM cho phép và
    không quá `TRAN_WORKER`. Tối thiểu 2 để một worker bận việc nặng thì worker kia vẫn phục vụ."""
    cpu = so_cpu() if cpu is None else cpu
    ram = ram_mb() if ram is None else ram
    theo_ram = max(1, ram // RAM_MOI_WORKER_MB)
    return max(2, min(cpu * 2, theo_ram, TRAN_WORKER))


def cau_hinh_pool(
    workers: int,
    *,
    pg_max_connections: int = 200,
    pool_size: int = 0,
    max_overflow: int = -1,
) -> dict[str, int]:
    """Pool cho MỘT worker. `pool_size`/`max_overflow` > 0 (≥ 0 với overflow) ⇒ dùng đúng số đó."""
    workers = max(1, workers)
    ngan_sach = max(workers * 2, pg_max_connections - KET_NOI_DU_PHONG)
    moi_worker = max(2, min(TRAN_POOL_MOI_WORKER, ngan_sach // workers))
    if pool_size <= 0:
        # 2/3 thường trực, 1/3 co giãn — lúc vắng Postgres không phải giữ cả trăm kết nối rỗi.
        pool_size = max(2, (moi_worker * 2) // 3)
        tran_overflow = moi_worker - pool_size
    else:
        tran_overflow = max(0, moi_worker - pool_size)
    if max_overflow < 0:
        max_overflow = tran_overflow
    return {"pool_size": pool_size, "max_overflow": max_overflow}
