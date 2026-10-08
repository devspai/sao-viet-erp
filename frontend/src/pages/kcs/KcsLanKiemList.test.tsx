import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SxKcsLanKiem } from "../../api/client";
import { KcsLanKiemList, KcsLoiCuaTo, loiCuaTo } from "./KcsLanKiemList";

const lanKiem = [{
  id: 5, nguoi_kiem: "Bùi Tổ Trưởng", luc: "2026-09-16T15:12:00", so_dat: 100, so_loi: 5, don_vi: "to",
  ket_luan: "dat_mot_phan", checklist: [], ghi_chu: null, version: 1,
  loi: [{
    id: 9, mo_ta: "Chồng màu lệch góc phải", so_luong: 5, don_vi: "to", to_chiu_id: 3,
    da_xem_luc: null, nguoi_xem: null,
    anh: [{ id: 21, file_name: "loi-chong-mau.png", file_url: "/api/files/san-xuat/kcs-loi/1/a.png", file_type: "image/png" }],
  }],
}] as unknown as SxKcsLanKiem[];

describe("KcsLanKiemList · tiêu chí gom theo công đoạn", () => {
  it("công đoạn có lỗi lên đầu kèm từng mục hỏng; công đoạn đạt một dòng; kết quả cũ thiếu cong_viec_id là của lần kiểm", () => {
    const lk = [{
      ...lanKiem[0], loi: [], cong_viec_id: 11, cong_doan_ten: "Bế",
      checklist: [
        { cong_viec_id: 9, thu_tu: 1, dat: true, ghi_chu: null },
        { thu_tu: 1, dat: true, ghi_chu: null },
        { thu_tu: 2, dat: false, ghi_chu: "Xước 3 tờ góc trái" },
      ],
    }] as unknown as SxKcsLanKiem[];
    render(<KcsLanKiemList lanKiem={lk} checklist={[
      { cong_viec_id: 9, ten_cong_doan: "In offset", thu_tu: 1, ten: "Đúng màu", la_lenh_phu: true, ten_lenh: "Bìa", lsx_ma: "LSX26-0004" },
      { cong_viec_id: 11, ten_cong_doan: "Bế", thu_tu: 1, ten: "Đúng kích thước" },
      { cong_viec_id: 11, ten_cong_doan: "Bế", thu_tu: 2, ten: "Không lem mực, không xước bề mặt" },
    ]} />);

    expect(screen.getByText("Công đoạn: 1/2 đạt")).toBeTruthy();
    const dong = Array.from(document.querySelectorAll(".kcs-lk__tc-it")).map((d) => d.textContent);
    expect(dong).toEqual([
      "Bế1 mục hỏngKhông lem mực, không xước bề mặt (Xước 3 tờ góc trái)",
      "In offsetLệnh phụ Bìa LSX26-0004Đạt",
    ]);
  });
});

describe("KcsLanKiemList · ảnh lỗi", () => {
  it("mỗi ảnh một dòng có tên + giờ và người kiểm, bấm là mở hộp xem trước ngay trên trang", () => {
    render(<KcsLanKiemList lanKiem={lanKiem} />);

    expect(screen.getByText("loi-chong-mau.png")).toBeTruthy();
    expect(screen.getByText(/Bùi Tổ Trưởng$/, { selector: ".thsx-tep__meta" })).toBeTruthy();
    // Ảnh không còn là link mở tab mới — tab mới làm mất ngăn đang xem.
    expect(document.querySelector('a[target="_blank"] img')).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByTitle("Xem trước loi-chong-mau.png"));
    const hop = screen.getByRole("dialog", { name: "loi-chong-mau.png" });
    expect(hop.querySelector("img")?.getAttribute("src")).toContain("/api/files/san-xuat/kcs-loi/1/a.png");
    expect(within(hop).getByRole("link", { name: /Tải về/ })).toBeTruthy();

    // Trang bàn tổ nghe Esc ở `document` (đăng ký trước) để đóng ngăn, chỉ nhường phím đã `defaultPrevented`.
    let trangDongNgan = 0;
    const trang = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) trangDongNgan++; };
    document.addEventListener("keydown", trang);
    try {
      fireEvent.keyDown(document.body, { key: "Escape" });
    } finally {
      document.removeEventListener("keydown", trang);
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trangDongNgan).toBe(0);
  });
});

describe("KcsLoiCuaTo · tab KCS bàn tổ chỉ bày lỗi tổ chịu", () => {
  const loi = (id: number, mo_ta: string, cong_doan_id: number | null) => ({
    id, mo_ta, so_luong: 2, don_vi: "to", cong_doan_id, da_xem_luc: null, nguoi_xem: null, anh: [],
  });
  const tai = [
    { ...lanKiem[0], id: 1, cong_viec_id: 7, luc: "2026-09-16T08:00:00", so_loi: 0, loi: [] },
    { ...lanKiem[0], id: 2, cong_viec_id: 7, luc: "2026-09-17T08:00:00",
      loi: [loi(11, "Lem mực", null), loi(12, "Quy về bước trước", 6)] },
  ] as unknown as SxKcsLanKiem[];
  const sau = [{ ...lanKiem[0], id: 3, cong_viec_id: 8, cong_doan_ten: "Dán", luc: "2026-09-19T08:00:00",
    loi: [loi(13, "Bong keo do in", 7)] }] as unknown as SxKcsLanKiem[];

  it("bỏ lần kiểm đạt và lỗi đã quy sang công đoạn khác, gộp lỗi bước sau — mới nhất trước", () => {
    const dong = loiCuaTo(7, tai, sau);
    expect(dong.map((d) => d.l.id)).toEqual([13, 11]);
    render(<KcsLoiCuaTo congViecId={7} dong={dong} />);
    const it = Array.from(document.querySelectorAll(".kcs-bs__it"));
    expect(it).toHaveLength(2);
    expect(it[0].textContent).toContain("Bắt ở Dán");
    expect(it[1].textContent).not.toContain("Bắt ở");
    expect(document.body.textContent).not.toMatch(/đạt/i);
  });
});
