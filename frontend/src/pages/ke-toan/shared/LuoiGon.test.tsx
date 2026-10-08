import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RayThuocTinh, soPhieu } from "./LuoiGon";
import { NganPhai } from "./NganPhai";

describe("RayThuocTinh", () => {
  it("nhãn trên giá trị, bỏ ô trống", () => {
    render(<RayThuocTinh o={[
      { nhan: "Hình thức", giaTri: "Chuyển khoản" },
      { nhan: "Mã giao dịch", giaTri: null },
    ]} />);
    expect(screen.getByText("Hình thức").tagName).toBe("DT");
    expect(screen.getByText("Chuyển khoản").tagName).toBe("DD");
    expect(screen.queryByText("Mã giao dịch")).toBeNull();
  });
});

describe("soPhieu", () => {
  it("lấy số chứng từ, thiếu thì lấy mã", () => {
    expect(soPhieu({ doc_no: "PC00018", code: "UNC-261007-MD21" })).toBe("PC00018");
    expect(soPhieu({ doc_no: null, code: "UNC-261007-MD21" })).toBe("UNC-261007-MD21");
  });
});

describe("NganPhai có cột thuộc tính", () => {
  it("chia thân ngăn hai cột", () => {
    render(<NganPhai tieuDe="31.817.000 đ" onDong={() => undefined} cot={<p>cột phải</p>}><p>nội dung</p></NganPhai>);
    expect(screen.getByRole("complementary", { name: "Thuộc tính" })).toHaveTextContent("cột phải");
    expect(screen.getByText("nội dung").closest(".kt-ngan__chinh")).not.toBeNull();
  });
});
