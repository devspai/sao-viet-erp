import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SxWorkItem } from "../api/client";
import { ThsxDanhSach } from "./ThsxDanhSach";

function mockViec(p: Partial<SxWorkItem>): SxWorkItem {
  return {
    id: 1,
    nguon_loai: "lsx",
    nguon_ma: "LSX26-0003",
    nguon_ten: "Hộp bánh mang đi 4 ngăn",
    ten_cong_doan: "Ghi kẽm CTP",
    loai_buoc: "may",
    may: "CTP Screen 8600",
    trang_thai: "released",
    so_luong_vao: 4,
    so_luong_ra: 4,
    don_vi_vao: "kem",
    don_vi_ra: "kem",
    ngoai_dong: true,
    chay_phut: 13,
    dinh_muc_vat_tu: [{ vat_tu_id: 1, ma: "KM01", ten: "Bản kẽm CTP 1030x790", don_vi: "cai", so_luong: 4 }],
    kcs_so_lan: 0,
    kcs_dat: 0,
    kcs_loi: 0,
    quy_cach: { giay: "Couche", dinh_luong: 300, kho_in: "640 x 450", so_mau: 4, so_kem: 4 },
    ...p,
  } as SxWorkItem;
}

/** Bọc MỘT bước vào một lệnh — bàn tổ từ 11/09/2026 nhận `lenh`, thẻ/bảng việc nằm bên trong. */
function mockLenh(items: SxWorkItem[]) {
  return [{
    nguon_loai: "lsx", nguon_ma: items[0]?.nguon_ma ?? "LSX26-0003",
    nguon_ten: items[0]?.nguon_ten ?? "", lsx_id: 3, bai_ghep_id: null,
    som_nhat: null, muon_nhat: null, so_viec: items.length,
    digest: { released: items.length, running: 0, paused: 0, completed: 0 },
    cong_viec: items,
  }];
}

describe("ThsxDanhSach — Workstation Studio Modern Table View", () => {
  it("hiển thị đúng thông tin mã nguồn, công đoạn, máy, quy cách và vật tư", () => {
    const item = mockViec({ id: 201, ten_cong_doan: "Ghi kẽm CTP" });
    const onPick = vi.fn();

    render(
      <ThsxDanhSach
        lenh={mockLenh([item])}
        selectedId={null}
        onPick={onPick}
      />
    );

    expect(screen.getByText("0003")).toBeInTheDocument();
    expect(screen.getByText("Ghi kẽm CTP")).toBeInTheDocument();
    expect(screen.getByText("CTP Screen 8600")).toBeInTheDocument();
    expect(screen.getByText("Bản kẽm CTP 1030x790")).toBeInTheDocument();
    expect(screen.getByText(/Couche 300gsm/i)).toBeInTheDocument();
  });

  // 28/09/2026: cột cuối CHỈ còn nhãn trạng thái — nút chạy nhanh đứng cạnh nhãn đọc ra thành nhiều
  // trạng thái. Kể cả người giữ quyền Thực hiện lệnh cũng không thấy nút ở dòng; thao tác ở drawer.
  it("cột trạng thái chỉ có nhãn, không còn nút Bắt đầu / Tạm dừng / Kết thúc", () => {
    const onPick = vi.fn();
    const item = mockViec({ id: 204, trang_thai: "running", chay_duoc: true });
    render(
      <ThsxDanhSach
        lenh={mockLenh([mockViec({ id: 203, trang_thai: "released", chay_duoc: true }), item])}
        selectedId={null}
        onPick={onPick}
      />
    );

    expect(screen.getByText("Trạng thái")).toBeInTheDocument();
    expect(screen.getByText("Đang chạy")).toBeInTheDocument();
    expect(screen.getByText("Chờ làm")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bắt đầu|Tạm dừng|Kết thúc/ })).toBeNull();

    // Bấm dòng vẫn mở drawer — đường duy nhất tới các thao tác.
    fireEvent.click(screen.getByText("Đang chạy"));
    expect(onPick).toHaveBeenCalledWith(item);
  });
});
