import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, authed, layTokenMoiNhat, refreshSession } from "./client";

// Tầng request bền (sức chịu tải A4): có hạn chờ, GET tự thử lại khi máy chủ khởi động lại / quá tải,
// lượt GHI không bao giờ tự gửi lại, và mọi request mang token MỚI NHẤT mà không cần React đổi state.

function traVe(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** fetch giả treo mãi tới khi bị huỷ — như kết nối nửa-mở trên điện thoại. */
function fetchTreo() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_ok, loi) => {
        init?.signal?.addEventListener("abort", () => loi(new DOMException("Aborted", "AbortError")));
      }),
  );
}

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Dọn token mới nhất giữa các ca (logout xoá nó trước khi gọi mạng).
  vi.stubGlobal("fetch", vi.fn(async () => traVe(204, undefined)));
  await api.logout().catch(() => {});
  vi.unstubAllGlobals();
});

describe("hạn chờ", () => {
  it("GET treo quá 20 s ⇒ lỗi tiếng Việt status 0, không treo mãi", async () => {
    vi.useFakeTimers();
    const f = fetchTreo();
    vi.stubGlobal("fetch", f);
    const p = authed("/api/cham", "tok").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    const e = (await p) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(0);
    expect(e.message).toBe("Máy chủ phản hồi quá lâu, vui lòng thử lại.");
    // Hết giờ KHÔNG tự thử lại — thử tiếp là bắt người dùng chờ thêm 40 s nữa.
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("ghi đè được hạn chờ bằng timeoutMs", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchTreo());
    const p = authed("/api/cham", "tok", { method: "POST", timeoutMs: 1_000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(((await p) as ApiError).status).toBe(0);
  });

  it("nơi gọi tự huỷ bằng signal ⇒ trả nguyên AbortError, không thử lại", async () => {
    const f = fetchTreo();
    vi.stubGlobal("fetch", f);
    const ctl = new AbortController();
    const p = authed("/api/x", "tok", { signal: ctl.signal }).catch((e: unknown) => e);
    ctl.abort();
    const e = (await p) as Error;
    expect(e.name).toBe("AbortError");
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("tự thử lại", () => {
  it("GET gặp 503 (có Retry-After) rồi thành công ⇒ trả kết quả, gọi 2 lượt", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let lan = 0;
    const f = vi.fn(async () => {
      lan += 1;
      return lan === 1
        ? traVe(503, { detail: "Máy chủ đang bận, vui lòng thử lại sau giây lát." }, { "Retry-After": "0" })
        : traVe(200, { ok: 1 });
    });
    vi.stubGlobal("fetch", f);
    await expect(authed<{ ok: number }>("/api/x", "tok")).resolves.toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("GET mất mạng ⇒ thử thêm 2 lần (chờ 500 ms, 1 s) rồi báo lỗi tiếng Việt", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const f = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", f);
    const p = authed("/api/x", "tok").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(499);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    const e = (await p) as ApiError;
    expect(f).toHaveBeenCalledTimes(3);
    expect(e.status).toBe(0);
    expect(e.message).toBe("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  });

  it("POST gặp 503 ⇒ KHÔNG gửi lại (có thể máy chủ đã ghi rồi)", async () => {
    const f = vi.fn(async () => traVe(503, { detail: "Máy chủ đang bận, vui lòng thử lại sau giây lát." }));
    vi.stubGlobal("fetch", f);
    const e = (await authed("/api/attendance/check", "tok", { method: "POST", body: "{}" }).catch(
      (x: unknown) => x,
    )) as ApiError;
    expect(f).toHaveBeenCalledTimes(1);
    expect(e.status).toBe(503);
    expect(e.message).toBe("Máy chủ đang bận, vui lòng thử lại sau giây lát.");
  });

  it("POST mất mạng ⇒ không gửi lại", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", f);
    await expect(authed("/api/x", "tok", { method: "POST" })).rejects.toMatchObject({ status: 0 });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("thông điệp lỗi", () => {
  it("2xx mà thân không phải JSON (Wi-Fi chặn) ⇒ lỗi tiếng Việt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Đăng nhập Wi-Fi</html>", { status: 200 })),
    );
    await expect(authed("/api/x", "tok")).rejects.toMatchObject({
      status: 0,
      message: "Máy chủ trả dữ liệu không hợp lệ (có thể mạng Wi-Fi đang chặn).",
    });
  });

  it("mã lỗi không kèm detail ⇒ câu tiếng Việt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 413 })));
    await expect(authed("/api/x", "tok", { method: "POST" })).rejects.toMatchObject({ message: "Tệp quá lớn." });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 418 })));
    await expect(authed("/api/x", "tok", { method: "POST" })).rejects.toMatchObject({
      message: "Yêu cầu thất bại (mã 418).",
    });
  });
});

describe("token mới nhất", () => {
  it("sau đăng nhập / làm mới, request mang token MỚI dù nơi gọi còn giữ token cũ", async () => {
    const dau: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/auth/login")) {
          return traVe(200, { access_token: "tok-dang-nhap", token_type: "bearer", user: { id: 1, username: "a", name: "A" } });
        }
        if (url.endsWith("/api/auth/refresh")) {
          return traVe(200, { access_token: "tok-xoay", token_type: "bearer", user: { id: 1, username: "a", name: "A" } });
        }
        if (url.endsWith("/api/auth/logout")) return traVe(204, undefined);
        dau.push(String((init?.headers as Record<string, string>)?.Authorization));
        return traVe(200, {});
      }),
    );
    await api.login("a", "b");
    expect(layTokenMoiNhat()).toBe("tok-dang-nhap");
    await refreshSession();
    expect(layTokenMoiNhat()).toBe("tok-xoay");
    await authed("/api/x", "tok-cu-trong-react");
    expect(dau.at(-1)).toBe("Bearer tok-xoay");
    await api.logout();
    expect(layTokenMoiNhat()).toBeNull();
    await authed("/api/x", "tok-cu-trong-react");
    expect(dau.at(-1)).toBe("Bearer tok-cu-trong-react");
  });
});
