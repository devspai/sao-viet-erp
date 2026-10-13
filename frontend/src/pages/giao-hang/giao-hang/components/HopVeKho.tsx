// Hộp VỀ KHO của lượt xe — cùng khuôn hộp Bắt đầu giao (phương án A, 13/10/2026): mọi điểm đã có kết
// quả ⇒ tài xế gõ số đồng hồ lúc xe về tới kho, máy trừ số ở điểm giao cuối ra km chặng về kho rồi tính
// tiền theo bậc km như các chặng khác (PRD khoán km §14). Số nhỏ hơn số ở điểm giao cuối thì máy chủ
// chặn cứng (đồng hồ không chạy lùi) ⇒ báo ngay dưới ô, khoá nút. Không còn ngưỡng 500 km.
import { useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { so } from "../shared/helpers";
import { ODongHo } from "./ODongHo";

export function HopVeKho({
  luot,
  diemCuoi,
  gui,
  onXong,
  onHuy,
}: {
  luot: { code: string; xe_bien_so: string | null; so_dong_ho_gan_nhat: number | null };
  /** Tên khách ở điểm có số đồng hồ lớn nhất — chặng về kho đi từ đó. */
  diemCuoi: string | null;
  gui: (so: number) => Promise<unknown>;
  onXong: () => void;
  onHuy: () => void;
}) {
  const [chu, setChu] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  const cuoi = luot.so_dong_ho_gan_nhat;
  const soGo = chu === "" ? null : Number(chu);
  // Gõ dở thì số nào cũng nhỏ hơn — chỉ báo khi đã đủ số chữ số của số ở điểm cuối.
  const lui = cuoi != null && soGo != null && soGo < cuoi && chu.length >= String(cuoi).length;
  const chang = cuoi != null && soGo != null && soGo >= cuoi ? soGo - cuoi : null;
  const duoc = soGo != null && !(cuoi != null && soGo < cuoi);

  const bam = () => {
    if (!duoc || soGo == null) return;
    setLoi(null);
    setDangGui(true);
    gui(soGo)
      .then(onXong)
      .catch((e: unknown) => setLoi(e instanceof Error ? e.message : "Không lưu được số về kho"))
      .finally(() => setDangGui(false));
  };

  return createPortal(
    <ConfirmDialog
      open
      title={`Về kho lượt ${luot.code}`}
      cancelLabel="Thôi"
      confirmLabel="Lưu về kho"
      busy={dangGui}
      error={loi}
      confirmDisabled={!duoc}
      onConfirm={bam}
      closeOnBackdrop={false}
      onCancel={onHuy}
    >
      <p className="rc__sub" style={{ margin: 0 }}>
        Xe {luot.xe_bien_so ?? ""} đã giao xong mọi điểm. Chặng về kho chia cho kíp của điểm giao cuối.
      </p>
      <div className="gh-dh">
        <ODongHo id="gh-dh-ve" nhan="Số trên đồng hồ xe lúc về tới kho" chu={chu} onDoi={setChu} onEnter={bam} />
        {lui ? (
          <p className="gh-dh__loi" role="alert">
            Nhỏ hơn số ở điểm giao cuối ({so(cuoi)} km), đồng hồ không chạy lùi. Kiểm lại số.
          </p>
        ) : cuoi != null ? (
          <p className="gh-dh__goi">
            {chang != null
              ? `Chặng về kho ${so(chang)} km, tính từ ${so(cuoi)} km${diemCuoi ? ` ở ${diemCuoi}` : ""}.`
              : `Điểm giao cuối${diemCuoi ? ` ${diemCuoi}` : ""} ghi ${so(cuoi)} km.`}
          </p>
        ) : null}
      </div>
    </ConfirmDialog>,
    document.body,
  );
}
