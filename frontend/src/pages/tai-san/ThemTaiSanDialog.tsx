// Form THÊM TÀI SẢN — ba việc chung một form, mỗi việc mở từ một nút riêng:
//
//   • "moi"       Thêm tài sản (máy mới mua): khấu hao từ ngày bắt đầu dùng.
//   • "dang_dung" Thêm tài sản đang dùng (máy đã chạy trước khi lên phần mềm): thêm khối "Đã khấu
//                 hao tới lúc này", phần mềm tính tiếp phần còn lại.
//   • sửa         Mở từ ngăn chi tiết, theo đúng nguồn của tài sản.
//
// Làm lại 05/10/2026 cho dễ dùng (spec `2026-10-05-tai-san-lam-lai-design.md` mục 5–7): sáu ô theo
// thứ tự người ta nghĩ (Tên → Giá mua → Loại → Khấu hao trong → Bắt đầu dùng → Bộ phận/Người giữ);
// Loại TỰ CHỌN theo ngưỡng 30 triệu một cái cho tới khi người dùng bấm đổi; chi phí cấu thành, số
// hoá đơn, ghi chú gấp vào "Thêm chi tiết"; một dòng xem trước mức tháng ngay dưới form.
//
// Chỉnh UI/UX 05/10/2026 (`2026-10-05-tai-san-ui-ux-tung-man.md`, màn 3–4): một form, nhóm "Mua mới |
// Đang dùng từ trước" ở đầu; thứ tự Loại → Tên → Giá + Số lượng + Bắt đầu dùng (một hàng) →
// Khấu hao trong (kèm nút chọn nhanh số năm) → Bộ phận / Người giữ. Nút Lưu LUÔN bấm được; bấm
// khi còn thiếu thì báo lỗi ngay dưới ô và nhảy tới ô sai đầu tiên. Xem trước nằm cạnh nút Lưu.
//
// Vẫn giữ: KHÔNG có ô tài khoản / định khoản (việc của phần mềm kế toán — cần nhớ thì ghi chú).
import { ChonNgay } from "../../components/ChonNgay";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ApiError } from "../../api/client";
import type { Department } from "../../api/client";
import {
  CCDC_TOI_DA_THANG,
  NGUONG_TSCD,
  taiSanApi,
  type DongDuKien,
  type NhanVienChon,
  type TaiSanChiTiet,
} from "../../api/taiSan";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icons";
import { MonthPicker } from "../../components/MonthPicker";
import { Select } from "../../components/Select";
import {
  BangLoi,
  HOM_NAY,
  KhungNgan,
  LoiO,
  NGAY_MAX,
  NGAY_MIN,
  OTien,
  THANG_NAY,
  quyDoiNam,
  soThangGiua,
  thangNhan,
  tien,
  tienDon,
  luaChonBoPhan,
  ngay,
  uocKhauHao,
} from "./chung";

export type KieuThem = "moi" | "dang_dung";

/** Những ô "Thêm cái giống thế này" chép sẵn từ tài sản đang xem. */
export interface MauThem {
  loai: string;
  so_thang: number;
  bo_phan_id: number | null;
  nguoi_quan_ly_id: number | null;
}

interface DongChiPhi {
  dien_giai: string;
  so_tien: number;
}

export function ThemTaiSanDialog({
  token,
  kieu,
  taiSan,
  mau,
  boPhan,
  tren,
  onClose,
  onSaved,
  onNhapExcel,
}: {
  token: string;
  /** Bỏ qua khi sửa — lấy theo nguồn của tài sản. */
  kieu: KieuThem;
  /** Có = sửa tài sản này. */
  taiSan?: TaiSanChiTiet | null;
  mau?: MauThem | null;
  boPhan: Department[];
  tren?: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Có = hiện lối "Nhập từ file Excel" ở form tài sản đang dùng. */
  onNhapExcel?: () => void;
}) {
  const sua = !!taiSan;
  // Mở từ menu nào thì chọn sẵn cách đó; người dùng đổi được ngay trong form (một form, hai cách).
  const [kieuChon, setKieuChon] = useState<KieuThem>(kieu);
  const dangDung = sua ? taiSan.nguon_vao === "dau_ky" : kieuChon === "dang_dung";
  // Đã chuyển bộ phận / sửa chữa lớn / thôi dùng thì máy chủ khoá ô tiền và số tháng — khoá luôn
  // trên form để người dùng không gõ xong mới ăn 409.
  const khoaSo = sua && taiSan.bien_dong.length > 0;

  const [ten, setTen] = useState("");
  const [gia, setGia] = useState(0);
  const [soLuong, setSoLuong] = useState(1);
  const [chiPhi, setChiPhi] = useState<DongChiPhi[]>([]);
  const [loai, setLoai] = useState("tscd");
  const [loaiTuChon, setLoaiTuChon] = useState(false);
  const [soThang, setSoThang] = useState(0);
  const [ngaySuDung, setNgaySuDung] = useState(HOM_NAY);
  const [boPhanId, setBoPhanId] = useState("");
  const [nguoiGiuId, setNguoiGiuId] = useState("");
  const [soHoaDon, setSoHoaDon] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [moChiTiet, setMoChiTiet] = useState(false);
  // Khối "Đã khấu hao tới lúc này" — tự điền cho tới khi người dùng gõ vào ô đó.
  const [tinhTu, setTinhTu] = useState(THANG_NAY);
  const [thangDa, setThangDa] = useState(0);
  const [thangDaTuGo, setThangDaTuGo] = useState(false);
  const [daKhauHao, setDaKhauHao] = useState(0);
  const [daKhauHaoTuGo, setDaKhauHaoTuGo] = useState(false);
  /** Khi SỬA: chỉ gửi ô tiền / số tháng nếu người dùng thật sự đụng vào — gửi thừa là máy chủ
   *  dựng lại mốc khấu hao, và với tài sản đã có lịch sử thì ăn 409 vì một lần sửa tên. */
  const [daDoiSo, setDaDoiSo] = useState(false);

  const [luu, setLuu] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [daLuu, setDaLuu] = useState<{ ten: string; lich: DongDuKien[] } | null>(null);

  useEffect(() => {
    if (taiSan) {
      setTen(taiSan.ten);
      setLoai(taiSan.loai);
      setLoaiTuChon(true);
      setSoLuong(taiSan.so_luong || 1);
      // Một dòng chi phí = một con số giá mua; nhiều dòng = mở sẵn bảng chi tiết.
      if (taiSan.chi_phi.length > 1) {
        setChiPhi(taiSan.chi_phi.map((c) => ({ dien_giai: c.dien_giai, so_tien: c.so_tien })));
        setMoChiTiet(true);
        setGia(0);
      } else {
        setChiPhi([]);
        setGia(taiSan.loai === "ccdc"
          ? (taiSan.don_gia ?? Math.floor(taiSan.nguyen_gia / (taiSan.so_luong || 1)))
          : (taiSan.chi_phi[0]?.so_tien ?? taiSan.don_gia ?? taiSan.nguyen_gia));
      }
      setSoThang(taiSan.so_thang);
      setNgaySuDung(taiSan.ngay_su_dung.slice(0, 10));
      setBoPhanId(taiSan.bo_phan_id ? String(taiSan.bo_phan_id) : "");
      setNguoiGiuId(taiSan.nguoi_quan_ly_id ? String(taiSan.nguoi_quan_ly_id) : "");
      setSoHoaDon(taiSan.so_hoa_don ?? "");
      setGhiChu(taiSan.ghi_chu ?? "");
      if (taiSan.so_hoa_don || taiSan.ghi_chu) setMoChiTiet(true);
      setTinhTu(taiSan.moc_tu_ngay.slice(0, 7));
      setThangDa(taiSan.thang_da_trich_dau_ky);
      setThangDaTuGo(true);
      setDaKhauHao(taiSan.hao_mon_dau_ky);
      setDaKhauHaoTuGo(true);
    } else if (mau) {
      setLoai(mau.loai);
      setLoaiTuChon(true);
      setSoThang(mau.so_thang);
      setBoPhanId(mau.bo_phan_id ? String(mau.bo_phan_id) : "");
      setNguoiGiuId(mau.nguoi_quan_ly_id ? String(mau.nguoi_quan_ly_id) : "");
    }
  }, [taiSan, mau]);

  // Người giữ = NHÂN VIÊN của bộ phận đã chọn (chủ chốt 08/09/2026: không gõ tay).
  const [nhanVien, setNhanVien] = useState<NhanVienChon[]>([]);
  useEffect(() => {
    if (!boPhanId) {
      setNhanVien([]);
      return;
    }
    let conDung = true;
    taiSanApi
      .nhanVienBoPhan(token, Number(boPhanId))
      .then((ds) => { if (conDung) setNhanVien(ds); })
      .catch(() => { if (conDung) setNhanVien([]); });
    return () => { conDung = false; };
  }, [token, boPhanId]);
  // Người đang gán mà không còn trong danh sách (đã nghỉ, đã chuyển) vẫn phải có trong ô chọn —
  // không thì ô tự về trống và bấm Lưu là đè thành "chưa gán" mà không ai bấm gì.
  const nhanVienChon = useMemo(() => {
    const id = taiSan?.nguoi_quan_ly_id;
    if (!id || nguoiGiuId !== String(id) || nhanVien.some((n) => n.id === id)) return nhanVien;
    return [...nhanVien, { id, code: "", full_name: taiSan?.nguoi_quan_ly ?? `#${id}` }];
  }, [nhanVien, taiSan, nguoiGiuId]);

  const laCcdc = loai === "ccdc";
  const coChiTietGia = !laCcdc && chiPhi.length > 0;
  const tongGia = coChiTietGia
    ? chiPhi.reduce((s, d) => s + (d.so_tien || 0), 0)
    : laCcdc ? gia * Math.max(1, soLuong) : gia;
  const giaMotCai = coChiTietGia ? tongGia : gia;

  /** Gõ giá ⇒ loại tự theo ngưỡng 30 triệu một cái, chừng nào người dùng chưa tự bấm chọn loại. */
  function doiGia(v: number) {
    setGia(v);
    setDaDoiSo(true);
    if (!loaiTuChon && v > 0) setLoai(v >= NGUONG_TSCD ? "tscd" : "ccdc");
  }
  function chonLoai(l: string) {
    setLoaiTuChon(true);
    setDaDoiSo(true);
    if (l === "ccdc" && chiPhi.length > 0) {
      // Công cụ dụng cụ không có bảng chi phí cấu thành — gộp về một con số.
      setGia(chiPhi.reduce((s, d) => s + (d.so_tien || 0), 0));
      setChiPhi([]);
    }
    if (l === "tscd") setSoLuong(1);
    setLoai(l);
  }

  const lechLuat = giaMotCai > 0 && (laCcdc
    ? (giaMotCai >= NGUONG_TSCD ? "Từ 30 triệu trở lên, luật tính là tài sản cố định." : null)
    : (giaMotCai < NGUONG_TSCD ? "Dưới 30 triệu, luật tính là công cụ dụng cụ." : null));
  const quaTran = laCcdc && soThang > CCDC_TOI_DA_THANG;

  // Khối "Đã khấu hao tới lúc này": tự điền theo ngày bắt đầu dùng và tháng tính tiếp.
  const thangDaGoiY = Math.min(Math.max(soThangGiua(ngaySuDung, tinhTu), 0), soThang || 0);
  const thangDaHieuLuc = thangDaTuGo ? thangDa : thangDaGoiY;
  const daKhauHaoGoiY = soThang > 0
    ? (thangDaHieuLuc >= soThang ? tongGia : Math.floor((tongGia * thangDaHieuLuc) / soThang))
    : 0;
  const daKhauHaoHieuLuc = daKhauHaoTuGo ? daKhauHao : daKhauHaoGoiY;
  const batDauSauThangTinh = dangDung && soThangGiua(ngaySuDung, tinhTu) < 0;

  const uoc = dangDung
    ? uocKhauHao({
      gia: tongGia, soThang, tuNgay: `${tinhTu}-01`,
      daKhauHao: daKhauHaoHieuLuc, daKhauHaoThang: thangDaHieuLuc,
    })
    : uocKhauHao({ gia: tongGia, soThang, tuNgay: ngaySuDung });

  const [loiO, setLoiO] = useState<Record<string, string>>({});
  const xoaLoi = (k: string) => setLoiO((l) => (l[k] ? { ...l, [k]: "" } : l));

  /** Kiểm khi bấm Lưu — nút luôn bấm được; thiếu ô nào báo ngay dưới ô đó (NN/g). */
  function kiem(): Record<string, string> {
    const l: Record<string, string> = {};
    if (!ten.trim()) l["ts-them-ten"] = "Nhập tên tài sản";
    if (!(tongGia > 0)) l["ts-them-gia"] = coChiTietGia ? "Nhập số tiền các khoản" : "Nhập giá mua";
    if (!ngaySuDung) l["ts-them-ngay"] = "Chọn ngày bắt đầu dùng";
    if (!(soThang > 0)) l["ts-them-thang"] = "Nhập số tháng khấu hao";
    else if (quaTran) l["ts-them-thang"] = `Công cụ dụng cụ khấu hao tối đa ${CCDC_TOI_DA_THANG} tháng`;
    if (dangDung) {
      if (!/^\d{4}-\d{2}$/.test(tinhTu)) l["ts-them-tinhtu"] = "Chọn tháng tính tiếp";
      else if (batDauSauThangTinh) {
        l["ts-them-tinhtu"] = "Ngày bắt đầu dùng sau tháng này. Máy mới mua thì chọn Mua mới.";
      }
      if (soThang > 0 && thangDaHieuLuc > soThang) {
        l["ts-them-thangda"] = `Không quá ${soThang} tháng khấu hao`;
      }
      if (daKhauHaoHieuLuc > tongGia) l["ts-them-da"] = "Không quá giá mua";
    }
    return l;
  }

  function than(): Record<string, unknown> {
    const day: Record<string, unknown> = {
      ten: ten.trim(),
      bo_phan_id: boPhanId ? Number(boPhanId) : null,
      nguoi_quan_ly_id: nguoiGiuId ? Number(nguoiGiuId) : null,
      so_hoa_don: soHoaDon.trim() || null,
      ghi_chu: ghiChu.trim() || null,
    };
    const so: Record<string, unknown> = {
      loai,
      so_luong: laCcdc ? Math.max(1, soLuong) : 1,
      don_gia: coChiTietGia ? null : gia,
      chi_phi: coChiTietGia
        ? chiPhi.filter((d) => d.so_tien > 0).map((d) => ({
          dien_giai: d.dien_giai.trim() || "Giá mua", so_tien: d.so_tien,
        }))
        : [],
      so_thang: soThang,
      ngay_su_dung: ngaySuDung,
    };
    if (dangDung) {
      so.moc_tu_ngay = `${tinhTu}-01`;
      so.thang_da_trich_dau_ky = thangDaHieuLuc;
      so.hao_mon_dau_ky = daKhauHaoHieuLuc;
    }
    if (!taiSan) return { ...day, ...so, nguon_vao: dangDung ? "dau_ky" : "ghi_tang" };

    const cu: Record<string, unknown> = {
      ten: taiSan.ten,
      bo_phan_id: taiSan.bo_phan_id,
      nguoi_quan_ly_id: taiSan.nguoi_quan_ly_id,
      so_hoa_don: taiSan.so_hoa_don,
      ghi_chu: taiSan.ghi_chu,
    };
    const doi: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(day)) {
      if (JSON.stringify(v ?? null) !== JSON.stringify(cu[k] ?? null)) doi[k] = v;
    }
    return daDoiSo && !khoaSo ? { ...doi, ...so } : doi;
  }

  async function guiDi() {
    const l = kiem();
    setLoiO(l);
    const dau = ["ts-them-ten", "ts-them-gia", "ts-them-ngay", "ts-them-thang", "ts-them-tinhtu",
      "ts-them-thangda", "ts-them-da"].find((k) => l[k]);
    if (dau) {
      window.setTimeout(() => document.getElementById(dau)?.focus(), 0);
      return;
    }
    setLuu(true);
    setLoi(null);
    try {
      const t = taiSan
        ? await taiSanApi.sua(token, taiSan.id, than())
        : await taiSanApi.them(token, than());
      setDaLuu({ ten: t.ten, lich: await taiSanApi.duKien(token, t.id) });
      onSaved();
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không lưu được. Thử lại.");
    } finally {
      setLuu(false);
    }
  }

  const tieuDe = daLuu ? daLuu.ten : sua ? `Sửa ${taiSan.ma}` : "Thêm tài sản";
  const chonNhanh = laCcdc
    ? [12, 24, 36].map((t) => ({ nhan: `${t} tháng`, thang: t }))
    : [5, 7, 10, 15].map((n) => ({ nhan: `${n} năm`, thang: n * 12 }));
  const luaChonBp = [{ value: "", label: "Chưa chọn" }, ...luaChonBoPhan(boPhan)];

  // Xem trước: thẻ dính bên phải ở ngăn rộng (Stripe "summary"); màn hẹp một cột thì thẻ đó chạy
  // xuống cuối form nên câu tóm tắt ở chân ngăn (sát nút Lưu) mới là chỗ người dùng nhìn thấy.
  // Số tháng vượt trần thì không ước: "hết vào tháng X" cho một số sẽ bị chặn chỉ gây hiểu nhầm.
  const xemTruoc = uoc && !quaTran ? (
    uoc.het ? "Đã khấu hao hết — phần mềm không khấu hao thêm tháng nào." : (
      <>
        Mỗi tháng khoảng <strong>{tienDon(uoc.mucThang)}</strong>, hết vào <strong>{uoc.thangCuoi}</strong>
        {uoc.ngayDau ? `. Tháng đầu tính từ ngày ${uoc.ngayDau}` : ""}
      </>
    )
  ) : <span className="ts-mo">Nhập giá mua và số tháng để xem mỗi tháng khấu hao bao nhiêu.</span>;
  const conLaiDau = Math.max(0, tongGia - daKhauHaoHieuLuc);

  return (
    <KhungNgan
      rong
      tren={tren}
      nhanTren={daLuu ? "Đã lưu" : undefined}
      tieuDe={tieuDe}
      onClose={onClose}
      chan={daLuu ? (
        <Button variant="accent" type="button" onClick={onClose}>Xong</Button>
      ) : (
        <>
          <span className="ts-ngan__xemtruoc ts-tg__chan" aria-hidden="true">{xemTruoc}</span>
          <Button variant="ghost" type="button" onClick={onClose}>Hủy</Button>
          <Button variant="accent" type="button" loading={luu} onClick={guiDi}>
            {sua ? "Lưu thay đổi" : "Lưu tài sản"}
          </Button>
        </>
      )}
    >
      <BangLoi loi={loi} />

      {daLuu ? (
        <div className="ts-daluu"><LichKhauHao lich={daLuu.lich} /></div>
      ) : (
        <div className="ts-tg">
          <div className="ts-form ts-tg__form">
            {!sua && (
              <div className="ts-cach-khung">
                <div className="ts-cach" role="radiogroup" aria-label="Cách thêm">
                  {(["moi", "dang_dung"] as const).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={kieuChon === k}
                      className={`ts-cach__nut${kieuChon === k ? " is-active" : ""}`}
                      onClick={() => setKieuChon(k)}>
                      <span className="ts-cach__cham" aria-hidden="true" />
                      <span className="ts-cach__chu">
                        <strong>{k === "moi" ? "Mua mới" : "Đang dùng từ trước"}</strong>
                        <span>
                          {k === "moi"
                            ? "Vừa mua về, khấu hao từ ngày bắt đầu dùng."
                            : "Đã chạy trước khi dùng phần mềm, tính tiếp phần còn lại."}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                {dangDung && onNhapExcel && (
                  <span className="rc-field__hint">
                    Nhiều tài sản?{" "}
                    <button type="button" className="ts-lienket" onClick={onNhapExcel}>
                      Nhập từ Excel
                    </button>
                  </span>
                )}
              </div>
            )}
            {khoaSo && (
              <p className="ts-gioithieu">
                Tài sản đã có lịch sử nên chỉ sửa được tên, bộ phận, người giữ, số hoá đơn và ghi chú.
              </p>
            )}

            <section className="ts-phan">
              <h3 className="ts-muc__ten">Tài sản</h3>
              <div className="ts-luoi">
                <label className="rc-field ts-o--ca">
                  <span className="rc-field__label">Tên <em>*</em></span>
                  <input id="ts-them-ten" className="rc-input" value={ten} maxLength={255} autoFocus
                    aria-invalid={!!loiO["ts-them-ten"] || undefined}
                    placeholder="Máy in Komori 4 màu"
                    onChange={(e) => { setTen(e.target.value); xoaLoi("ts-them-ten"); }} />
                  <LoiO loi={loiO["ts-them-ten"]} />
                </label>
                <div className="rc-field ts-o--ca">
                  <span className="rc-field__label">Loại</span>
                  <div className="ts-chon ts-chon--deu" role="radiogroup" aria-label="Loại">
                    {(["tscd", "ccdc"] as const).map((l) => (
                      <button key={l} type="button" role="radio" aria-checked={loai === l}
                        disabled={khoaSo}
                        className={`ts-chon__nut${loai === l ? " is-active" : ""}`}
                        onClick={() => chonLoai(l)}>
                        {l === "tscd" ? "Tài sản cố định" : "Công cụ dụng cụ"}
                      </button>
                    ))}
                  </div>
                  {lechLuat ? (
                    <span className="ts-nhac"><Icon name="alert" size={14} /> {lechLuat}</span>
                  ) : !loaiTuChon && !sua && (
                    <span className="rc-field__hint">Tự chọn theo giá: từ 30 triệu một cái là tài sản cố định.</span>
                  )}
                </div>
              </div>
            </section>

            <section className="ts-phan">
              <h3 className="ts-muc__ten">Giá và thời gian khấu hao</h3>
              <div className="ts-luoi">
                <label className="rc-field">
                  <span className="rc-field__label">
                    {laCcdc ? "Giá một cái" : "Giá mua"} <em>*</em>
                  </span>
                  {coChiTietGia ? (
                    <div id="ts-them-gia" tabIndex={-1} className="rc-input ts-num ts-o-khoa">{tien(tongGia)}</div>
                  ) : (
                    <OTien id="ts-them-gia" value={gia} disabled={khoaSo} invalid={!!loiO["ts-them-gia"]}
                      ariaLabel={laCcdc ? "Giá một cái" : "Giá mua"}
                      onChange={(v) => { doiGia(v); xoaLoi("ts-them-gia"); }} />
                  )}
                  {loiO["ts-them-gia"] ? <LoiO loi={loiO["ts-them-gia"]} /> : (
                    <span className="rc-field__hint">
                      {coChiTietGia ? "Tổng các khoản ở mục Thêm chi tiết." : "Cộng cả vận chuyển, lắp đặt, chạy thử."}
                    </span>
                  )}
                </label>
                {laCcdc && (
                  <label className="rc-field">
                    <span className="rc-field__label">Số lượng</span>
                    <input className="rc-input ts-num" type="number" min={1} step={1}
                      value={soLuong} disabled={khoaSo}
                      onChange={(e) => {
                        setSoLuong(Math.max(1, Number(e.target.value) || 1));
                        setDaDoiSo(true);
                      }} />
                    {soLuong > 1 && <span className="rc-field__hint">Tổng {tienDon(tongGia)}</span>}
                  </label>
                )}
                <label className="rc-field">
                  <span className="rc-field__label">Bắt đầu dùng từ ngày <em>*</em></span>
                  <ChonNgay id="ts-them-ngay" aria-label="Bắt đầu dùng từ ngày" className={`rc-input${loiO["ts-them-ngay"] ? " is-loi" : ""}`}
                    min={NGAY_MIN} max={NGAY_MAX} value={ngaySuDung} disabled={khoaSo}
                    onChange={(v) => { setNgaySuDung(v); setDaDoiSo(true); xoaLoi("ts-them-ngay"); }} />
                  <LoiO loi={loiO["ts-them-ngay"]} />
                </label>

                <div className="rc-field ts-o--ca">
                  <span className="rc-field__label">Khấu hao trong <em>*</em></span>
                  <div className="ts-thoigian">
                    <span className="ts-o--thang">
                      <input id="ts-them-thang" className="rc-input ts-num" type="number" min={1} max={600} step={1}
                        value={soThang || ""} disabled={khoaSo} aria-label="Khấu hao trong (tháng)"
                        aria-invalid={!!loiO["ts-them-thang"] || undefined}
                        onChange={(e) => {
                          setSoThang(Math.max(0, Number(e.target.value) || 0));
                          setDaDoiSo(true);
                          xoaLoi("ts-them-thang");
                        }} />
                      tháng
                      {soThang >= 12 && <span className="ts-mo">= {quyDoiNam(soThang)}</span>}
                    </span>
                    <div className="ts-nhanh" aria-label="Chọn nhanh số tháng">
                      {chonNhanh.map((c) => (
                        <button key={c.thang} type="button" disabled={khoaSo}
                          className={`ts-nhanh__nut${soThang === c.thang ? " is-active" : ""}`}
                          onClick={() => { setSoThang(c.thang); setDaDoiSo(true); xoaLoi("ts-them-thang"); }}>
                          {c.nhan}
                        </button>
                      ))}
                    </div>
                  </div>
                  {loiO["ts-them-thang"] ? <LoiO loi={loiO["ts-them-thang"]} /> : (
                    <span className="rc-field__hint">
                      {laCcdc ? `Tối đa ${CCDC_TOI_DA_THANG} tháng.` : "Máy ngành in thường 7–15 năm."}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {dangDung && (
              <section className="ts-phan">
                <h3 className="ts-muc__ten">Đã khấu hao tới lúc này</h3>
                <p className="ts-phan__ghi">Trước tháng tính tiếp là sổ cũ. Phần mềm tự đếm theo ngày bắt đầu dùng, có sổ thì sửa cho đúng sổ.</p>
                <div className="ts-luoi">
                  <div className="rc-field">
                    <span className="rc-field__label">Tính tiếp từ tháng <em>*</em></span>
                    <div id="ts-them-tinhtu" tabIndex={-1} className="ts-o--thangchon">
                      <MonthPicker value={tinhTu} disabled={khoaSo} ariaLabel="Tính tiếp từ tháng"
                        onChange={(v) => { setTinhTu(v); setDaDoiSo(true); xoaLoi("ts-them-tinhtu"); }} />
                    </div>
                    {loiO["ts-them-tinhtu"] ? <LoiO loi={loiO["ts-them-tinhtu"]} /> : (
                      <span className="rc-field__hint">Tháng đầu phần mềm tự tính.</span>
                    )}
                  </div>
                  <label className="rc-field">
                    <span className="rc-field__label">Đã khấu hao mấy tháng</span>
                    <span className="ts-o--thang">
                      <input id="ts-them-thangda" className="rc-input ts-num" type="number" min={0} step={1}
                        disabled={khoaSo} value={thangDaHieuLuc}
                        aria-invalid={!!loiO["ts-them-thangda"] || undefined}
                        onChange={(e) => {
                          setThangDa(Math.max(0, Number(e.target.value) || 0));
                          setThangDaTuGo(true);
                          setDaDoiSo(true);
                          xoaLoi("ts-them-thangda");
                        }} />
                      tháng
                    </span>
                    {loiO["ts-them-thangda"] ? <LoiO loi={loiO["ts-them-thangda"]} /> : (
                      <span className="rc-field__hint">
                        {thangDaTuGo ? `Trên tổng ${soThang || 0} tháng.` : "Tự đếm từ ngày bắt đầu dùng."}
                      </span>
                    )}
                  </label>
                  <label className="rc-field">
                    <span className="rc-field__label">Đã khấu hao trước đó</span>
                    <OTien id="ts-them-da" value={daKhauHaoHieuLuc} disabled={khoaSo}
                      invalid={!!loiO["ts-them-da"]} ariaLabel="Đã khấu hao trước đó"
                      onChange={(v) => {
                        setDaKhauHao(v);
                        setDaKhauHaoTuGo(true);
                        setDaDoiSo(true);
                        xoaLoi("ts-them-da");
                      }} />
                    {loiO["ts-them-da"] ? <LoiO loi={loiO["ts-them-da"]} /> : (
                      <span className="rc-field__hint">{daKhauHaoTuGo ? "Theo số đã gõ." : "Tự tính theo số tháng."}</span>
                    )}
                  </label>
                </div>
              </section>
            )}

            <section className="ts-phan">
              <h3 className="ts-muc__ten">Ai dùng</h3>
              <div className="ts-luoi ts-luoi--2">
                <div className="rc-field">
                  <span className="rc-field__label">Bộ phận dùng</span>
                  <Select<string> options={luaChonBp} value={boPhanId} portal searchable className="ts-sel"
                    searchPlaceholder="Gõ để tìm bộ phận" placeholder="Chưa chọn" ariaLabel="Bộ phận dùng"
                    onChange={(v) => { setBoPhanId(v); setNguoiGiuId(""); }} />
                </div>
                <label className="rc-field">
                  <span className="rc-field__label">Người giữ</span>
                  <select className="rc-input" value={nguoiGiuId} disabled={!boPhanId}
                    onChange={(e) => setNguoiGiuId(e.target.value)}>
                    <option value="">{boPhanId ? "Chưa chọn" : "Chọn bộ phận trước"}</option>
                    {nhanVienChon.map((nv) => (
                      <option key={nv.id} value={nv.id}>{nv.full_name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="ts-phan">
              <button type="button" className="ts-gap" aria-expanded={moChiTiet}
                onClick={() => setMoChiTiet((v) => !v)}>
                <Icon name="chevron" size={15} className={moChiTiet ? undefined : "ts-gap__dong"} />
                Thêm chi tiết
                <span className="ts-gap__phu">
                  {laCcdc ? "số hoá đơn, ghi chú" : "chi phí cấu thành giá mua, số hoá đơn, ghi chú"}
                </span>
              </button>
              {moChiTiet && (
                <div className="ts-luoi">
                  {!laCcdc && (
                    <div className="rc-field ts-o--ca">
                      <span className="rc-field__label">Giá mua gồm những khoản</span>
                      {chiPhi.length > 0 && (
                        <div className="lds-bang lds-bang--nhap ts-chiphi">
                          <table className="lds-g">
                            <colgroup>
                              <col />
                              <col className="ts-chiphi__tien" />
                              <col className="ts-chiphi__x-cot" />
                            </colgroup>
                            <thead>
                              <tr>
                                <th>Khoản</th>
                                <th className="n">Số tiền</th>
                                <th className="lds-tick"><span className="ts-an-chu">Bỏ khoản</span></th>
                              </tr>
                            </thead>
                            <tbody>
                              {chiPhi.map((d, i) => (
                                <tr key={i}>
                                  <td>
                                    <input className="rc-input" value={d.dien_giai} maxLength={255}
                                      disabled={khoaSo} placeholder="Vận chuyển, lắp đặt…"
                                      aria-label={`Khoản ${i + 1}`}
                                      onChange={(e) => {
                                        setChiPhi((ds) => ds.map((x, j) => (j === i ? { ...x, dien_giai: e.target.value } : x)));
                                        setDaDoiSo(true);
                                      }} />
                                  </td>
                                  <td className="n">
                                    <OTien value={d.so_tien} disabled={khoaSo} placeholder="Số tiền"
                                      ariaLabel={`Số tiền khoản ${i + 1}`}
                                      onChange={(v) => {
                                        setChiPhi((ds) => ds.map((x, j) => (j === i ? { ...x, so_tien: v } : x)));
                                        setDaDoiSo(true);
                                        xoaLoi("ts-them-gia");
                                      }} />
                                  </td>
                                  <td className="lds-tick">
                                    <button type="button" className="ts-chiphi__x" disabled={khoaSo}
                                      aria-label={`Bỏ khoản ${i + 1}`}
                                      onClick={() => {
                                        setChiPhi((ds) => {
                                          const con = ds.filter((_, j) => j !== i);
                                          // Còn một khoản thì gộp về ô Giá mua cho gọn.
                                          if (con.length <= 1) {
                                            setGia(con[0]?.so_tien ?? 0);
                                            return [];
                                          }
                                          return con;
                                        });
                                        setDaDoiSo(true);
                                      }}>
                                      <Icon name="trash" size={15} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <button type="button" className="btn btn--ghost ts-them-khoan" disabled={khoaSo}
                        onClick={() => {
                          setChiPhi((ds) => (ds.length
                            ? [...ds, { dien_giai: "", so_tien: 0 }]
                            : [{ dien_giai: "Giá mua", so_tien: gia }, { dien_giai: "", so_tien: 0 }]));
                          setDaDoiSo(true);
                        }}>
                        <Icon name="plus" size={14} /> Thêm khoản
                      </button>
                    </div>
                  )}
                  <label className="rc-field">
                    <span className="rc-field__label">Số hoá đơn mua</span>
                    <input className="rc-input" value={soHoaDon} maxLength={64}
                      onChange={(e) => setSoHoaDon(e.target.value)} />
                  </label>
                  <label className="rc-field ts-o--hai">
                    <span className="rc-field__label">Ghi chú</span>
                    <textarea className="rc-input" rows={2} maxLength={1000} value={ghiChu}
                      onChange={(e) => setGhiChu(e.target.value)} />
                  </label>
                </div>
              )}
            </section>
          </div>

          <aside className="ts-tg__xem" aria-label="Xem trước" aria-live="polite">
            <div className="ts-xem">
              <span className="ts-xem__nhan">Mỗi tháng khấu hao</span>
              {quaTran ? (
                <p className="ts-xem__trong">Công cụ dụng cụ khấu hao tối đa {CCDC_TOI_DA_THANG} tháng.</p>
              ) : !uoc ? (
                <p className="ts-xem__trong">Nhập giá mua và số tháng để xem.</p>
              ) : uoc.het ? (
                <p className="ts-xem__trong">Đã khấu hao hết, phần mềm không tính thêm tháng nào.</p>
              ) : (
                <>
                  <strong className="ts-xem__so">{tienDon(uoc.mucThang)}</strong>
                  <span className="ts-xem__phu">Hết vào tháng <strong>{uoc.thangCuoi}</strong></span>
                  {uoc.ngayDau && (
                    <span className="ts-xem__phu">Tháng đầu tính từ ngày {uoc.ngayDau} nên ít hơn.</span>
                  )}
                </>
              )}
              <dl className="ts-xem__ds">
                <div><dt>{laCcdc && soLuong > 1 ? `Giá ${soLuong} cái` : "Giá mua"}</dt><dd>{tongGia > 0 ? tienDon(tongGia) : "—"}</dd></div>
                <div><dt>Loại</dt><dd>{laCcdc ? "Công cụ dụng cụ" : "Tài sản cố định"}</dd></div>
                <div>
                  <dt>Khấu hao trong</dt>
                  <dd>{soThang > 0 ? (soThang >= 12 ? `${soThang} tháng (${quyDoiNam(soThang)})` : `${soThang} tháng`) : "—"}</dd>
                </div>
                <div>
                  <dt>{dangDung ? "Phần mềm tính từ" : "Bắt đầu tính"}</dt>
                  <dd>{dangDung ? (/^\d{4}-\d{2}$/.test(tinhTu) ? `tháng ${thangNhan(tinhTu)}` : "—") : ngay(ngaySuDung)}</dd>
                </div>
                {dangDung && (
                  <>
                    <div><dt>Đã khấu hao ở sổ cũ</dt><dd>{tienDon(daKhauHaoHieuLuc)}</dd></div>
                    <div className="ts-xem__con"><dt>Còn lại để tính tiếp</dt><dd>{tienDon(conLaiDau)}</dd></div>
                  </>
                )}
              </dl>
            </div>
            <p className="ts-xem__chu">Lưu xong sẽ thấy lịch khấu hao từng tháng.</p>
          </aside>
        </div>
      )}
    </KhungNgan>
  );
}

/** Lịch khấu hao — sau khi lưu và trong ngăn chi tiết.
 *
 *  GỘP THEO NĂM (thiết kế 05/10/2026, màn 2): máy 10 năm là 120 dòng — bảng cuộn lồng trong ngăn
 *  đang cuộn thì không ai đọc hết. Mỗi năm một dòng (tổng khấu hao năm, đã khấu hao và còn lại
 *  cuối năm), bấm mở 12 tháng. Năm của tháng hiện tại mở sẵn, tháng hiện tại có vạch nhấn.
 *  `denThang` ("YYYY-MM") = tháng cuối đã tính vào "Đã khấu hao"; các tháng tới đó chữ đậm. */
export function LichKhauHao({ lich, denThang }: { lich: DongDuKien[]; denThang?: string }) {
  const namNay = Number(THANG_NAY.slice(0, 4));
  const cacNam = useMemo(() => {
    const m = new Map<number, DongDuKien[]>();
    for (const d of lich) m.set(d.nam, [...(m.get(d.nam) ?? []), d]);
    return [...m.entries()];
  }, [lich]);
  const [mo, setMo] = useState<Set<number>>(() => {
    const coNamNay = cacNam.some(([n]) => n === namNay);
    return new Set([coNamNay ? namNay : (cacNam[0]?.[0] ?? namNay)]);
  });

  if (lich.length === 0) {
    return <p className="rc-field__hint">Không có tháng nào khấu hao: chưa tới ngày bắt đầu, hoặc đã khấu hao hết.</p>;
  }
  const doi = (n: number) => setMo((s) => {
    const t = new Set(s);
    if (t.has(n)) t.delete(n);
    else t.add(n);
    return t;
  });

  return (
    <div className="lds-bang ts-dukien">
      <table className="lds-g" style={{ minWidth: 560 }}>
        <colgroup>
          <col style={{ width: 120 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 130 }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>Tháng</th>
            <th className="n">Khấu hao</th>
            <th className="n">Đã khấu hao</th>
            <th className="n">Còn lại</th>
            <th>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {cacNam.map(([nam, ds]) => {
            const cuoi = ds[ds.length - 1];
            const dangMo = mo.has(nam);
            return (
              <Fragment key={nam}>
                <tr className="ts-dukien__nam">
                  <td>
                    <button type="button" className="ts-dukien__mo" aria-expanded={dangMo}
                      onClick={() => doi(nam)}>
                      <Icon name="chevron" size={14} className={dangMo ? undefined : "ts-gap__dong"} />
                      {nam}
                    </button>
                  </td>
                  <td className="n">{tien(ds.reduce((t, d) => t + d.muc_trich, 0))}</td>
                  <td className="n">{tien(cuoi.luy_ke)}</td>
                  <td className="n">{tien(cuoi.con_lai)}</td>
                  <td className="ts-mo">{ds.length} tháng</td>
                </tr>
                {dangMo && ds.map((d) => {
                  const khoa = `${d.nam}-${String(d.thang).padStart(2, "0")}`;
                  const lop = [
                    denThang && khoa <= denThang ? "ts-dukien__da" : "",
                    khoa === THANG_NAY ? "ts-dukien__nay" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <tr key={khoa} className={lop || undefined}>
                      <td className="ts-dukien__thang">{thangNhan(khoa)}</td>
                      <td className="n">{tien(d.muc_trich)}</td>
                      <td className="n">{tien(d.luy_ke)}</td>
                      <td className="n">{tien(d.con_lai)}</td>
                      <td>
                        <div className="ts-chips">
                          {d.su_kien.map((s, i) => (
                            <span key={i} className={`ts-chip ts-chip--${s.loai}`} title={s.chi_tiet}>{s.nhan}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
