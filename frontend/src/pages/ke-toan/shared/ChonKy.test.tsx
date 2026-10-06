/** Thanh chọn kỳ của 5 màn kế toán — khuôn Thống kê khách hàng. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { homNayVN, kyCungKy, tinhKy } from "../../../utils/ky";
import { ChonKy, useKyMan } from "./ChonKy";
import { ngay } from "./dinhDang";

function Bao({ man }: { man: string }) {
  const k = useKyMan(man);
  return (
    <>
      <ChonKy kyMan={k} />
      <output aria-label="kỳ">{`${k.ky.tu}|${k.ky.den}`}</output>
      <output aria-label="cùng kỳ">{k.cungKy ? "co" : "khong"}</output>
    </>
  );
}

describe("ChonKy", () => {
  it("bấm Tuỳ chọn hiện hai ô ngày; bỏ tích so sánh thì cungKy = null", async () => {
    function BaoGoc() {
      const k = useKyMan("test");
      return <><ChonKy kyMan={k} /><output>{k.cungKy ? "co" : "khong"}</output></>;
    }
    render(<BaoGoc />);
    expect(screen.queryByLabelText("Từ ngày")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Tuỳ chọn" }));
    expect(screen.getByLabelText("Từ ngày")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("So với cùng kỳ năm trước"));
    expect(screen.getByText("khong")).toBeInTheDocument();
  });

  it("mặc định Tháng này, bật so sánh, nhãn ghi cả kỳ cùng kỳ", () => {
    render(<Bao man="mac-dinh" />);
    const hn = homNayVN();
    const ky = tinhKy("thang", hn);
    const ck = kyCungKy(ky);
    expect(screen.getByRole("button", { name: "Tháng này" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("So với cùng kỳ năm trước")).toBeChecked();
    expect(screen.getByLabelText("kỳ")).toHaveTextContent(`${ky.tu}|${ky.den}`);
    expect(screen.getByText(`so với ${ngay(ck.tu)} – ${ngay(ck.den)}`)).toBeInTheDocument();
  });

  it("ngày ngược thì giữ kỳ cũ và báo lỗi tại chỗ", async () => {
    render(<Bao man="nguoc" />);
    await userEvent.click(screen.getByRole("button", { name: "Tuỳ chọn" }));
    const truoc = screen.getByLabelText("kỳ").textContent;
    const tu = screen.getByLabelText("Từ ngày");
    await userEvent.clear(tu);
    await userEvent.type(tu, "2099-01-01");
    expect(screen.getByLabelText("kỳ").textContent).toBe(truoc);
    expect(screen.getByText("Ngày bắt đầu phải trước ngày kết thúc.")).toBeInTheDocument();
  });

  it("kỳ nhớ theo màn trong phiên: mở lại màn không về Tháng này", async () => {
    const { unmount } = render(<Bao man="nho" />);
    await userEvent.click(screen.getByRole("button", { name: "Năm trước" }));
    unmount();
    render(<Bao man="nho" />);
    expect(screen.getByRole("button", { name: "Năm trước" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("useKyMan và URL (đặc tả A.18)", () => {
  it("mở màn có ?man=…&ky=&tu=&den=&so= thì lấy kỳ từ URL, rồi ghi ngược lại khi đổi", async () => {
    window.history.replaceState(null, "", "/?abc=1&man=url-ky&ky=tuy&tu=2026-01-01&den=2026-03-31&so=0");
    render(<Bao man="url-ky" />);
    expect(screen.getByLabelText("kỳ")).toHaveTextContent("2026-01-01|2026-03-31");
    expect(screen.getByLabelText("cùng kỳ")).toHaveTextContent("khong");
    await userEvent.click(screen.getByRole("button", { name: "Năm nay" }));
    const p = new URLSearchParams(window.location.search);
    expect(p.get("ky")).toBe("nam");
    expect(p.has("tu")).toBe(false);
    expect(p.get("so")).toBe("0");
    expect(p.get("abc")).toBe("1");
    window.history.replaceState(null, "", "/");
  });

  it("URL rác (ky lạ, khoảng ngược) thì bỏ qua, về mặc định", () => {
    window.history.replaceState(null, "", "/?man=url-rac&ky=tuy&tu=2026-05-01&den=2026-01-01");
    render(<Bao man="url-rac" />);
    const ky = tinhKy("thang", homNayVN());
    expect(screen.getByLabelText("kỳ")).toHaveTextContent(`${ky.tu}|${ky.den}`);
    window.history.replaceState(null, "", "/");
  });

  it("chọn kỳ TẠM (đường dẫn sâu) không ghi vào bộ nhớ kỳ của màn", async () => {
    function BaoTam() {
      const k = useKyMan("tam-thoi");
      return (
        <>
          <button type="button" onClick={() => k.chon("tuy", { tu: "2017-01-01", den: "2026-10-01" }, { tam: true })}>tạm</button>
          <output aria-label="kỳ">{`${k.ky.tu}|${k.ky.den}`}</output>
        </>
      );
    }
    const { unmount } = render(<BaoTam />);
    await userEvent.click(screen.getByRole("button", { name: "tạm" }));
    expect(screen.getByLabelText("kỳ")).toHaveTextContent("2017-01-01|2026-10-01");
    unmount();
    render(<Bao man="tam-thoi" />);
    const ky = tinhKy("thang", homNayVN());
    expect(screen.getByLabelText("kỳ")).toHaveTextContent(`${ky.tu}|${ky.den}`);
  });
});
