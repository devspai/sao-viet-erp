import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SxWorkItemChiTiet } from "../api/client";
import { BatchForm, DieuChinhForm, type ThsxExec } from "./ThsxExecPanels";

const cv = {
  id: 1, department_id: 7, ten_cong_doan: "Cắt thành phẩm", loai_buoc: "to",
  don_vi_ra: "tờ", don_vi_vao: "tờ",
} as SxWorkItemChiTiet["cong_viec"];

function mo(khoan: SxWorkItemChiTiet["khoan"]) {
  render(<BatchForm
    cv={cv}
    khoan={khoan ?? null}
    busy={false}
    batDauMacDinh="2026-09-20T08:00"
    tranGhi={null}
    onXong={vi.fn()}
    exec={{ taoBatch: vi.fn() } as unknown as ThsxExec}
  />);
}

describe("Ghi mẻ lấy Khoán cố định từ Công đoạn", () => {
  it("không còn radio/tìm/đổi Công việc khoán", () => {
    mo({
      id: 9, ten: "Cắt thành phẩm", don_gia: 25, don_vi: "to", don_vi_ten: "tờ",
      phat_sinh: [{ id: 3, ten: "Thay kẽm", don_gia: 100000, don_vi: "kem", don_vi_ten: "bản kẽm" }],
    });
    expect(screen.getByText("Cắt thành phẩm")).toBeInTheDocument();
    expect(screen.getByText("25 đ / tờ")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText("Đổi việc")).toBeNull();
    expect(screen.getByText("Thay kẽm")).toBeInTheDocument();
  });

  it("chưa cấu hình vẫn mở form ghi mẻ bình thường", () => {
    mo(null);
    expect(screen.getByText("Công đoạn chưa cấu hình Khoán — vẫn có thể ghi mẻ sản lượng.")).toBeInTheDocument();
    expect(screen.getByLabelText("Số lượng làm được")).toBeInTheDocument();
  });

  it("hiển thị card sản lượng khả dụng và hỗ trợ điền nhanh Tối đa", () => {
    render(<BatchForm
      cv={cv}
      khoan={null}
      busy={false}
      batDauMacDinh="2026-09-20T08:00"
      tranGhi={{
        cung_to: true,
        nguon_ten: "In",
        da_nhan: 1300,
        da_ghi: 1200,
        toi_da: 1300,
        he_so: 1,
        con_ghi_duoc: 100,
        don_vi_nhan: "to",
      }}
      onXong={vi.fn()}
      exec={{ taoBatch: vi.fn() } as unknown as ThsxExec}
    />);

    expect(screen.getByText("Sản lượng khả dụng")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tối đa \(100\)/i })).toBeInTheDocument();
  });
});

describe("DieuChinhForm UI/UX (Điều chỉnh số giao)", () => {
  const gSample = {
    id: 10, so_luong: 1200, don_vi: "to", version: 1, doi_tac_ten: "Bế", cung_to: false,
  } as any;

  it("hiển thị thông tin đối tác, số lượng gốc và các quick chips đúng spec", () => {
    render(<DieuChinhForm
      g={gSample}
      busy={false}
      onHuy={vi.fn()}
      onXong={vi.fn()}
      exec={{ dieuChinhBanGiao: vi.fn() } as unknown as ThsxExec}
    />);

    expect(screen.getAllByText("Bế").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1\.200/).length).toBeGreaterThan(0);

    // Check quick reason chips exist (không có Bù hao bế, Hỏng mảng)
    expect(screen.getByText("Đếm lại")).toBeInTheDocument();
    expect(screen.getByText("Gõ nhầm")).toBeInTheDocument();
    expect(screen.getByText("Giao thiếu")).toBeInTheDocument();
    expect(screen.getByText("Bổ sung")).toBeInTheDocument();
    expect(screen.queryByText("Bù hao bế")).toBeNull();
    expect(screen.queryByText("Hỏng mảng")).toBeNull();

    // Stepper buttons exist
    expect(screen.getByRole("button", { name: "-100" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+100" })).toBeInTheDocument();
  });
});

