/** Ô "Ảnh chứng từ gốc": chọn tệp hiện ảnh thu nhỏ, bấm để xem to, Esc đóng lớp xem, ✕ bỏ tệp. */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { OChungTu } from "./tepChungTu";

beforeAll(() => {
  URL.createObjectURL = () => "blob:tam";
  URL.revokeObjectURL = () => {};
});

function Khung() {
  const [files, setFiles] = useState<File[]>([]);
  return <OChungTu files={files} setFiles={setFiles} onLoi={() => {}} />;
}

describe("OChungTu", () => {
  it("chọn ảnh, bấm xem to, Esc đóng, ✕ bỏ", () => {
    render(<Khung />);
    const anh = new File(["x"], "hoa-don.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Ảnh chứng từ gốc/), { target: { files: [anh] } });
    fireEvent.click(screen.getByRole("button", { name: "Xem hoa-don.png" }));
    expect(screen.getByRole("dialog", { name: "Xem hoa-don.png" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ hoa-don.png" }));
    expect(screen.queryByText("hoa-don.png")).not.toBeInTheDocument();
  });
});
