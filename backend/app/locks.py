"""Khoá chống chạy trùng — cho vài thao tác mà bấm hai lần ra hai kết quả khác nhau.

Chỗ dùng: `Tự xếp lịch` (gán loạt) và `Phát hành lệnh`. Hai người cùng bấm, hoặc một người
double-click, thì lần sau phải bị chặn thay vì chen vào giữa lần trước.

Không có `REDIS_URL` → no-op (test + máy dev 1 worker: không có ai để mà tranh). Có Redis →
`SET NX PX`, nên khoá đúng cả khi chạy nhiều uvicorn worker.

TTL để khoá tự tan nếu tiến trình giữ khoá chết giữa chừng — không bao giờ kẹt vĩnh viễn.
"""
from __future__ import annotations

import secrets
from contextlib import contextmanager

from .config import settings

_PREFIX = "svn:lock:"
_DEFAULT_TTL_MS = 30_000

# Chỉ xoá khoá nếu giá trị đúng của mình — tránh xoá nhầm khoá người khác vừa lấy sau khi
# khoá của mình đã hết hạn.
_UNLOCK_LUA = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
"""

_client = None


class LockBusy(Exception):
    """Ai đó đang chạy đúng việc này. Router dịch thành 409."""


def _redis():
    global _client
    if not settings.redis_url:
        return None
    if _client is None:
        import redis  # import trễ: không có Redis thì khỏi cần thư viện

        # Hạn giờ socket: Redis treo KHÔNG được kéo request treo theo (mặc định chờ vô hạn).
        _client = redis.from_url(
            settings.redis_url, decode_responses=True, socket_timeout=2, socket_connect_timeout=2,
        )
    return _client


@contextmanager
def lock(name: str, *, ttl_ms: int = _DEFAULT_TTL_MS):
    """Giữ khoá `name` trong khối `with`. Không lấy được → raise `LockBusy`."""
    client = _redis()
    if client is None:
        yield
        return

    key = f"{_PREFIX}{name}"
    token = secrets.token_hex(8)
    try:
        acquired = client.set(key, token, nx=True, px=ttl_ms)
    except Exception:
        # Redis hỏng KHÔNG được chặn nghiệp vụ — chạy như lúc chưa có khoá.
        yield
        return

    if not acquired:
        raise LockBusy(name)
    try:
        yield
    finally:
        try:
            client.eval(_UNLOCK_LUA, 1, key, token)
        except Exception:
            pass  # khoá sẽ tự hết hạn theo TTL


# Mã của TIẾN TRÌNH này — worker uvicorn bật bằng spawn nên mỗi worker import lại, mỗi worker một mã.
_MA_TIEN_TRINH = secrets.token_hex(8)

# Giữ vai nếu vai đang trống HOẶC đang là của mình (gia hạn); vai của worker khác thì thôi.
_GIU_VAI_LUA = """
local cur = redis.call('get', KEYS[1])
if not cur then
  redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2])
  return 1
end
if cur == ARGV[1] then
  redis.call('pexpire', KEYS[1], ARGV[2])
  return 1
end
return 0
"""


def giu_vai_chinh(name: str, *, ttl_ms: int) -> bool:
    """Việc định kỳ chỉ MỘT worker làm: True = worker này đang giữ vai `name` (giành hoặc gia hạn).

    Ticker nhắc hẹn / nhắc bảo trì chạy ở MỌI worker (mỗi worker một lifespan). Không chặn thì N
    worker cùng quét, cùng "ting" ⇒ người nhận nghe N lần. Vai GẮN với một worker (gia hạn mỗi
    vòng) chứ không luân phiên, vì ticker giữ trạng thái trong tiến trình (mốc quét, sổ đã ting) —
    đổi người mỗi vòng là trạng thái đó lệch nhau. Worker giữ vai chết thì vai tự tan sau `ttl_ms`
    và worker khác nhận — nên `ttl_ms` phải dài hơn chu kỳ ticker vài lần.

    Không Redis (test, dev 1 worker) → luôn True. Redis hỏng → True (thà trùng còn hơn mất nhắc).
    """
    client = _redis()
    if client is None:
        return True
    try:
        return bool(client.eval(_GIU_VAI_LUA, 1, f"{_PREFIX}vai:{name}", _MA_TIEN_TRINH, max(1, ttl_ms)))
    except Exception:
        return True


def chay_mot_noi(name: str, *, ttl_ms: int) -> bool:
    """Giành lượt chạy `name` trong `ttl_ms` — True thì chạy, False thì worker khác đã giành.

    Cho việc định kỳ (ticker nhắc hẹn, nhắc bảo trì) và việc cần thưa (báo "nhật ký có dòng mới")
    khi chạy NHIỀU worker: không có nó, N worker cùng quét cùng "ting" ⇒ người nhận nghe N lần.
    KHÔNG nhả khoá khi xong — lượt tự hết theo TTL, nên TTL = chu kỳ mong muốn.

    Không Redis (test, dev 1 worker) → luôn True. Redis hỏng → True (thà trùng còn hơn mất nhắc).
    """
    client = _redis()
    if client is None:
        return True
    try:
        return bool(client.set(f"{_PREFIX}luot:{name}", "1", nx=True, px=max(1, ttl_ms)))
    except Exception:
        return True
