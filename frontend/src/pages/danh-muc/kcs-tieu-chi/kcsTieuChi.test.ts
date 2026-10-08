import { describe, expect, it } from "vitest";

import type { KcsKhaiBaoCongDoan } from "../../../api/client";
import { chuanCau, chuoiTimCongDoan, demChep, doiCho, gomTheoGd, locDich } from "./kcsTieuChi";

function cd(id: number, ma: string, ten: string, nhom: string, cau: string[] = []): KcsKhaiBaoCongDoan {
  return {
    cong_doan_id: id, ma, ten, nhom,
    hang_muc: cau.map((t, i) => ({ id: id * 100 + i, ma: `KM${id}${i}`, cong_doan_id: id, ten: t, thu_tu: i + 1 })),
  };
}

const DS = [
  cd(1, "IN-OFS", "In offset", "print", ["Màu đúng mẫu"]),
  cd(2, "BOI-SONG", "Bồi sóng carton", "finishing"),
  cd(3, "DAN-MAY", "Dán máy", "finishing", ["Dán chắc", "Không tràn keo"]),
  cd(4, "DAN-TAY", "Dán thủ công", "finishing", ["Không tràn keo"]),
  cd(5, "CTP", "Ra bản kẽm", "prepress"),
];

describe("chuoiTimCongDoan + locDich", () => {
  it("so trên mã + tên + nhãn giai đoạn", () => {
    expect(chuoiTimCongDoan(DS[1])).toBe("BOI-SONG Bồi sóng carton Gia công sau in");
  });

  it("tìm tương đối: không dấu, đủ mọi từ, thứ tự nào cũng được", () => {
    const ten = (q: string) => locDich(DS, q, null, new Set()).khop.map((c) => c.ma);
    expect(ten("thu dan")).toEqual(["DAN-TAY"]);
    expect(ten("DAN-MAY")).toEqual(["DAN-MAY"]);
    expect(ten("sau in boi")).toEqual(["BOI-SONG"]);
    expect(ten("dan")).toEqual(["DAN-MAY", "DAN-TAY"]);
    expect(ten("")).toHaveLength(5);
  });

  it("“Chọn cả N” không đếm nguồn và công đoạn đã chọn", () => {
    const { khop, chonDuoc } = locDich(DS, "dan", 3, new Set([4]));
    expect(khop.map((c) => c.cong_doan_id)).toEqual([3, 4]);
    expect(chonDuoc).toEqual([]);
    expect(locDich(DS, "gia cong", 3, new Set()).chonDuoc.map((c) => c.cong_doan_id)).toEqual([2, 4]);
  });
});

describe("demChep", () => {
  it("đếm câu mới / câu đã có theo từng đích", () => {
    const kq = demChep([DS[1], DS[3]], ["Dán chắc", "Không tràn keo"]);
    expect(kq.moi).toBe(3);
    expect(kq.bo).toBe(1);
    expect(kq.trungTheoDich.get(4)).toBe(1);
    expect(kq.trungTheoDich.get(2)).toBe(0);
  });

  it("so sau khi cắt khoảng trắng", () => {
    expect(demChep([DS[3]], ["  Không tràn keo "]).bo).toBe(1);
  });
});

describe("chuanCau", () => {
  it("cắt, bỏ rỗng, khử trùng giữ thứ tự", () => {
    expect(chuanCau([" A ", "", "B", "A", "  "])).toEqual(["A", "B"]);
  });
});

describe("doiCho", () => {
  it("chuyển một phần tử sang vị trí mới, không đổi mảng gốc", () => {
    const goc = ["a", "b", "c", "d"];
    expect(doiCho(goc, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(doiCho(goc, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(doiCho(goc, 1, 1)).toBe(goc);
    expect(goc).toEqual(["a", "b", "c", "d"]);
  });
});

describe("gomTheoGd", () => {
  it("gom theo thứ tự giai đoạn cố định, giai đoạn rỗng không hiện", () => {
    const g = gomTheoGd([DS[2], DS[0], DS[4], cd(9, "X", "Không nhóm", "")]);
    expect(g.map((x) => [x.nhom, x.cong_doan.map((c) => c.ma)])).toEqual([
      ["prepress", ["CTP"]], ["print", ["IN-OFS"]], ["finishing", ["DAN-MAY"]], ["", ["X"]],
    ]);
  });
});
