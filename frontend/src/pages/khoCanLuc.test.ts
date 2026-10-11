import { describe, it, expect } from "vitest";
import { ghepCanLuc } from "./KhoDeNghiPage";

describe("ghepCanLuc", () => {
  it("đủ ngày và giờ thì ghép ISO wall-clock", () => expect(ghepCanLuc("2026-10-09", "17:30")).toBe("2026-10-09T17:30:00"));
  it("thiếu giờ thì null", () => expect(ghepCanLuc("2026-10-09", "")).toBeNull());
  it("thiếu ngày thì null", () => expect(ghepCanLuc("", "17:30")).toBeNull());
});
