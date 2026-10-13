// Hộp BẮT ĐẦU GIAO của lượt xe — phương án A bản 2 (docs/mockups/so-dong-ho-xuat-phat-3-phuong-an.html,
// 13/10/2026). Xe vừa về kho ở lượt trước thì đồng hồ lúc rời kho lần này chính là số cuối đó ⇒ từ
// lượt thứ hai số đứng SẴN, tài xế thấy khớp thì bấm một cái là xong. Đồng hồ chỉ số khác (xe chạy
// việc riêng giữa hai lượt) mới mở ô gõ. Lượt đầu tiên của xe (sổ chưa có số) thì phải gõ.
//
// Số đứng sẵn là CHỮ, không phải ô điền sẵn: điền sẵn vào ô thì tài xế gõ NỐI vào số cũ ra số tỉ km
// (lỗi E2E 27/09/2026). Muốn sửa thì mở ô TRỐNG, gõ lại cả số. Không còn ngưỡng 500 km (gỡ
// 13/10/2026); chỉ số LÙI so với số cuối mới phải tích xác nhận.
import { useState } from "react";
import { createPortal } from "react-dom";
import type { GoiYXuatPhatNguon } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { gioNgay, ngay, so } from "../shared/helpers";
import { ODongHo } from "./ODongHo";

function nhanNguon(n: GoiYXuatPhatNguon): string {
  if (n.loai === "ve_kho") return `Số về kho của lượt ${n.luot_code} lúc ${gioNgay(n.luc)}`;
  if (n.loai === "toi_khach")
    return `Số lúc tới khách cuối của lượt ${n.luot_code} ngày ${ngay(n.ngay)}. Lượt đó chưa ghi số về kho.`;
  return `Số rời kho của lượt ${n.luot_code} ngày ${ngay(n.ngay)}`;
}

export function HopBatDauGiao({
  luot,
  gui,
  onXong,
  onHuy,
}: {
  luot: {
    code: string;
    xe_bien_so: string | null;
    so_cho_bat_dau: number;
    goi_y_xuat_phat: number | null;
    goi_y_nguon?: GoiYXuatPhatNguon | null;
  };
  gui: (so: number, xacNhanSoLui: boolean) => Promise<unknown>;
  onXong: () => void;
  onHuy: () => void;
}) {
  const goiY = luot.goi_y_xuat_phat;
  const [goTay, setGoTay] = useState(goiY == null);
  const [chu, setChu] = useState("");
  const [xacNhan, setXacNhan] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  const soGo = chu === "" ? null : Number(chu);
  const soGui = goTay ? soGo : goiY;
  // Chỉ báo "lùi" khi đã gõ đủ số chữ số của số cuối — đang gõ dở thì số nào cũng nhỏ hơn.
  const lui = goTay && goiY != null && soGo != null && soGo < goiY && chu.length >= String(goiY).length;

  const bam = () => {
    if (soGui == null) return;
    setLoi(null);
    setDangGui(true);
    gui(soGui, lui && xacNhan)
      .then(onXong)
      .catch((e: unknown) => setLoi(e instanceof Error ? e.message : "Không bắt đầu giao được"))
      .finally(() => setDangGui(false));
  };

  return createPortal(
    <ConfirmDialog
      open
      title={`Bắt đầu giao lượt ${luot.code}`}
      cancelLabel="Thôi"
      confirmLabel="Bắt đầu giao"
      busy={dangGui}
      error={loi}
      confirmDisabled={soGui == null || (lui && !xacNhan)}
      onConfirm={bam}
      closeOnBackdrop={false}
      onCancel={onHuy}
    >
      <p className="rc__sub" style={{ margin: 0 }}>
        Xe {luot.xe_bien_so ?? ""} rời kho với {luot.so_cho_bat_dau} điểm đã lấy hàng
      </p>
      {!goTay && goiY != null ? (
        <div className="gh-dh">
          <span className="gh-dh__nhan">Số đồng hồ lúc rời kho</span>
          <div className="gh-dh__so">{so(goiY)} <span>km</span></div>
          {luot.goi_y_nguon && <p className="gh-dh__goi">{nhanNguon(luot.goi_y_nguon)}</p>}
          <Button variant="ghost" onClick={() => { setChu(""); setXacNhan(false); setGoTay(true); }}>
            Đồng hồ chỉ số khác
          </Button>
        </div>
      ) : (
        <div className="gh-dh">
          <ODongHo id="gh-dh-o" nhan="Số trên đồng hồ xe lúc rời kho" chu={chu}
            onDoi={(c) => { setChu(c); setXacNhan(false); }} onEnter={bam} />
          {goiY == null ? (
            <p className="gh-dh__goi">Lượt đầu tiên của xe này có ghi số. Từ lượt sau máy lấy sẵn số cuối.</p>
          ) : lui ? (
            <div className="banner banner--warn" role="status">
              Nhỏ hơn số cuối trong sổ ({so(goiY)} km), đồng hồ không chạy lùi. Kiểm lại số.
              <label className="gh-dh__xn">
                <input type="checkbox" checked={xacNhan} onChange={(e) => setXacNhan(e.target.checked)} />
                Tôi đã xem lại đồng hồ, số {so(soGo)} là đúng
              </label>
            </div>
          ) : (
            <>
              <p className="gh-dh__goi">
                {soGo != null && soGo > goiY
                  ? `Sổ ghi ${so(goiY)} km. Xe đã chạy thêm ${so(soGo - goiY)} km giữa hai lượt, máy ghi lại để quản lý xem.`
                  : `Sổ ghi ${so(goiY)} km.`}
              </p>
              <Button variant="ghost" onClick={() => { setChu(""); setXacNhan(false); setGoTay(false); }}>
                Dùng số cuối {so(goiY)}
              </Button>
            </>
          )}
        </div>
      )}
    </ConfirmDialog>,
    document.body,
  );
}
