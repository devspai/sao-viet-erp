import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPosition, kiemSaiSoDatDiem } from "./helpers";

function position(accuracy: number): GeolocationPosition {
  return {
    coords: {
      latitude: 10.7769,
      longitude: 106.7009,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

/** Giả lập trình duyệt: `watchPosition` giữ callback lại để test tự bắn từng mẫu. */
function stubGeolocation() {
  let ok: PositionCallback | null = null;
  let fail: PositionErrorCallback | null | undefined = null;
  const watchPosition = vi.fn(
    (o: PositionCallback, f?: PositionErrorCallback | null, _options?: PositionOptions) => {
      ok = o;
      fail = f;
      return 7;
    },
  );
  const clearWatch = vi.fn();
  const getCurrentPosition = vi.fn();
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: { getCurrentPosition, watchPosition, clearWatch },
  });
  return {
    watchPosition,
    clearWatch,
    getCurrentPosition,
    mau: (accuracy: number) => ok?.(position(accuracy)),
    loi: (e: GeolocationPositionError) => fail?.(e),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lấy vị trí chấm công", () => {
  it("không nhận mẫu đầu kém: dò tiếp tới khi có mẫu đủ tốt rồi dừng dò", async () => {
    const gps = stubGeolocation();
    const p = getPosition();

    gps.mau(1800); // ước lượng theo mạng / vị trí gần đúng
    gps.mau(30); // chip GPS bắt được

    await expect(p).resolves.toMatchObject({ coords: { accuracy: 30 } });
    expect(gps.clearWatch).toHaveBeenCalledWith(7);
    expect(gps.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("đòi mẫu mới, không dùng lại vị trí cũ", () => {
    const gps = stubGeolocation();
    void getPosition();

    const options = gps.watchPosition.mock.calls[0][2] as PositionOptions;
    expect(options).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
  });

  it("dò hết giờ mà chưa đủ tốt thì dùng mẫu sai số nhỏ nhất (máy bàn chỉ có Wi-Fi)", async () => {
    const gps = stubGeolocation();
    const p = getPosition();

    gps.mau(420);
    gps.mau(900);
    gps.mau(76);
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(p).resolves.toMatchObject({ coords: { accuracy: 76 } });
    expect(gps.clearWatch).toHaveBeenCalled();
  });

  it("mẫu đầu tới trễ hơn mốc dò tối đa thì dùng luôn", async () => {
    const gps = stubGeolocation();
    const p = getPosition();

    await vi.advanceTimersByTimeAsync(9_000);
    gps.mau(300);

    await expect(p).resolves.toMatchObject({ coords: { accuracy: 300 } });
  });

  it("không có mẫu nào thì báo quá lâu, không treo", async () => {
    stubGeolocation();
    const p = getPosition();
    const ket = expect(p).rejects.toMatchObject({ code: 3 });

    await vi.advanceTimersByTimeAsync(20_000);
    await ket;
  });

  it("trả nguyên lỗi của trình duyệt khi chưa có mẫu nào", async () => {
    const gps = stubGeolocation();
    const p = getPosition();
    const denied = { code: 1, message: "User denied" } as GeolocationPositionError;

    gps.loi(denied);

    await expect(p).rejects.toBe(denied);
  });

  it("báo lỗi khi trình duyệt không hỗ trợ định vị", async () => {
    vi.stubGlobal("navigator", {});

    await expect(getPosition()).rejects.toThrow("không hỗ trợ định vị");
  });
});

describe("đặt tâm điểm chấm công", () => {
  it("nhận sai số của máy bàn Wi-Fi", () => {
    expect(kiemSaiSoDatDiem(position(76), "gợi ý").coords.accuracy).toBe(76);
  });

  it("chặn vị trí gần đúng, nói sai số và gợi ý", () => {
    expect(() => kiemSaiSoDatDiem(position(1800), "Kéo ghim trên bản đồ.")).toThrow(
      /khoảng 1800 m.*Kéo ghim trên bản đồ\./,
    );
  });
});
