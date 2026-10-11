import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SxWorkItemChiTiet } from "../api/client";
import { BatchForm, type ThsxExec } from "./ThsxExecPanels";

const cv = {
  id: 1, department_id: 7, ten_cong_doan: "Cắt thành phẩm", loai_buoc: "to",
  don_vi_ra: "tờ", don_vi_vao: "tờ",
} as SxWorkItemChiTiet["cong_viec"];

function mo(khoan: SxWorkItemChiTiet["khoan"]) {
  render(<BatchForm
    cv={cv}
    khoan={khoan ?? null}
    busy={false}
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
    // Tên công đoạn ở phụ đề hộp, tên việc khoán ở khối Khoán — trùng chữ vì cùng tên.
    expect(screen.getAllByText("Cắt thành phẩm")).toHaveLength(2);
    expect(screen.getByText("25 đ một tờ")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText("Đổi việc")).toBeNull();
    expect(screen.getByText("Thay kẽm")).toBeInTheDocument();
  });

  it("chưa cấu hình vẫn mở form ghi mẻ bình thường, không câu báo chưa cấu hình", () => {
    mo(null);
    expect(screen.queryByText(/chưa cấu hình Khoán/)).toBeNull();
    expect(screen.getByLabelText("Số lượng làm được")).toBeInTheDocument();
  });

  it("nói số còn ghi được và có nút Tối đa", () => {
    render(<BatchForm
      cv={cv}
      khoan={null}
      busy={false}
      tranGhi={{
        cung_to: true,
        nguon_ten: "In",
        da_nhan: 1300,
        da_ghi: 1200,
        toi_da: 1300,
        toi_da_nhan: 1300,
        loi_kcs: 0,
        dau_chuoi: false,
        he_so: 1,
        con_ghi_duoc: 100,
        don_vi_nhan: "to",
      }}
      onXong={vi.fn()}
      exec={{ taoBatch: vi.fn() } as unknown as ThsxExec}
    />);

    expect(screen.getByText(/^còn ghi được/)).toHaveTextContent(/^còn ghi được 100/);
    expect(screen.getByRole("button", { name: "Tối đa 100" })).toBeInTheDocument();
  });
});

