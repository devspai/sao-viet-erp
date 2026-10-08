// XẾP LỊCH — KHAY "Chờ xếp lịch" bên phải lưới (mockup A cải tiến, khuôn khay Unscheduled của Asana).
// Lọc + cắt trang ở máy chủ như hàng chờ cũ; thẻ kéo thả vào ngày muốn bắt đầu.
import { ChevronsRight, GripVertical, Search, X } from "lucide-react";
import type { ReactNode } from "react";

import type { XlThe } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { gioChu } from "./xlShared";

export function XlKhay({
  the, tong, tim, trang, moiTrang, dangTai, keoDuoc, keoId, thanhLoc, dangLoc,
  onTim, onTrang, onChon, onKeo, onThu,
}: {
  the: XlThe[];
  tong: number;
  tim: string;
  trang: number;
  moiTrang: number;
  dangTai: boolean;
  keoDuoc: boolean;
  keoId: number | null;
  thanhLoc?: ReactNode;
  dangLoc: boolean;
  onTim(v: string): void;
  onTrang(v: number): void;
  onChon(lsxId: number): void;
  onKeo(t: XlThe | null): void;
  onThu(): void;
}) {
  const soTrang = Math.max(1, Math.ceil(tong / moiTrang));
  return (
    <aside className="xa-khay" aria-label="Lệnh chờ xếp lịch">
      <div className="xa-khay__dau">
        Chờ xếp lịch <span className="xa-dem">{tong}</span>
        <span className="xa-gian" />
        <button type="button" className="xa-btn xa-btn--tron xa-btn--o" title="Thu khay" aria-label="Thu khay" onClick={onThu}>
          <ChevronsRight size={16} />
        </button>
      </div>
      <label className="xa-khay__tim">
        <Search size={15} />
        <input value={tim} placeholder="Tìm lệnh chờ xếp" onChange={(e) => onTim(e.target.value)} />
        {tim && (
          <button type="button" className="xa-btn xa-btn--tron" style={{ height: 22, padding: 0 }} aria-label="Xoá ô tìm" onClick={() => onTim("")}>
            <X size={13} />
          </button>
        )}
      </label>
      {thanhLoc && <div className="xa-khay__loc tl-thanh">{thanhLoc}</div>}
      <div className="xa-khay__sap"><span>Gấp và hạn gần nhất lên đầu</span><span>Giờ chạy</span></div>
      <div className="xa-khay__ds">
        {dangTai && the.length === 0 && <EmptyState trangThai="dang-tai" inline nhanTai="Đang tải lệnh chờ xếp…" />}
        {!dangTai && the.length === 0 && (
          <p className="xa-khay__chan" style={{ borderTop: 0 }}>
            {tim || dangLoc ? "Không có lệnh nào khớp bộ lọc." : "Mọi lệnh sẵn sàng đều đã có lịch."}
          </p>
        )}
        {the.map((t) => (
          <article
            key={t.lsx_id}
            className={`xa-q${keoId === t.lsx_id ? " xa-q--keo" : ""}${keoDuoc ? "" : " xa-q--khoa"}`}
            draggable={keoDuoc}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", t.ma);
              onKeo(t);
            }}
            onDragEnd={() => onKeo(null)}
            onClick={() => onChon(t.lsx_id)}
          >
            <GripVertical size={14} className="xa-q__nam" />
            <div className="xa-q__1">
              <span className="xa-ma">{t.ma}</span>
              {t.is_rush && <span className="xa-gap">Gấp</span>}
            </div>
            <div className="xa-q__p">
              {t.han_hoan_thanh_sx ? `hạn ${t.han_hoan_thanh_sx.slice(8, 10)}/${t.han_hoan_thanh_sx.slice(5, 7)}` : "chưa có hạn"}
              <br />
              <span className="xa-mo">{t.chay_phut > 0 ? gioChu(t.chay_phut) : "chưa tính giờ"}</span>
            </div>
            <div className="xa-q__2 xa-q__ten">{t.ten || "Chưa đặt tên"}</div>
            <div className="xa-q__2">{t.customer_name ?? "Chưa gắn khách"}</div>
          </article>
        ))}
      </div>
      {soTrang > 1 && (
        <div className="xa-khay__trang">
          <button type="button" className="xa-btn xa-btn--o" disabled={trang <= 1} onClick={() => onTrang(trang - 1)} aria-label="Trang trước">‹</button>
          <span>Trang {trang} trên {soTrang}</span>
          <button type="button" className="xa-btn xa-btn--o" disabled={trang >= soTrang} onClick={() => onTrang(trang + 1)} aria-label="Trang sau">›</button>
        </div>
      )}
      <div className="xa-khay__chan">
        Kéo một lệnh thả vào ngày muốn bắt đầu. Thả vào ngày nghỉ hoặc ngoài ca thì lệnh tự sang ca kế tiếp.
      </div>
    </aside>
  );
}
