/** Tài khoản công ty NHẬN tiền cho các form thu: chỉ tài khoản đang dùng, chiều nhận, đúng loại tiền;
 *  tải hỏng thì báo lỗi riêng (KHÔNG giả làm "chưa có tài khoản"). */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const companyAccounts = vi.fn();

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (g) => ({
  ...(await g<typeof import("../../../../api/client")>()),
  api: { accounting: { companyAccounts: (...a: unknown[]) => companyAccounts(...a) } },
}));

import { useTaiKhoanNhan } from "./taiKhoanNhan";

beforeEach(() => {
  companyAccounts.mockReset().mockResolvedValue([
    { id: 4, bank_name: "MB", account_number: "1", currency: "VND", is_active: true },
    { id: 5, bank_name: "VCB", account_number: "2", currency: "USD", is_active: true },
  ]);
});

describe("useTaiKhoanNhan", () => {
  it("lọc đúng loại tiền, gọi chiều nhận", async () => {
    const { result } = renderHook(() => useTaiKhoanNhan("USD"));
    expect(result.current.dangTai).toBe(true);
    await waitFor(() => expect(result.current.dangTai).toBe(false));
    expect(companyAccounts).toHaveBeenCalledWith("token-test", true, "receive");
    expect(result.current.taiKhoan.map((t) => t.id)).toEqual([5]);
    expect(result.current.loiTai).toBeNull();
  });

  it("tải hỏng: có câu lỗi, danh sách rỗng", async () => {
    companyAccounts.mockRejectedValue(new Error("mạng"));
    const { result } = renderHook(() => useTaiKhoanNhan("VND"));
    await waitFor(() => expect(result.current.dangTai).toBe(false));
    expect(result.current.loiTai).toBe("Không tải được danh sách tài khoản ngân hàng.");
    expect(result.current.taiKhoan).toEqual([]);
  });
});
