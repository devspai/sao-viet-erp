// Tab "Vị trí kho" của drawer Khai báo kho (qua `config.renderExtra`).
//
// Khai danh sách kệ/ô của MỘT kho để khi lập lô/phiếu chọn từ dropdown thay vì gõ tay. Danh sách
// KHÔNG ràng buộc cứng lô cũ (`stock_lots.vi_tri` vẫn là chuỗi tự do) — chỉ là gợi ý/chọn.
//
// Bố cục kiểu danh sách gọn (khuôn Polaris/Odoo): hàng nhập ở đầu, dưới là lưới hai cột Vị trí |
// Ghi chú. Tên tab đã nói "Vị trí kho" nên không lặp tiêu đề, không đếm số, không thẻ lồng thẻ.
import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { Trash2 } from "lucide-react";

import { ApiError, api } from "../api/client";
import type { KhoViTriRow } from "../api/client";
import type { Row } from "../api/rebuildCatalog";
import { useAuth } from "../auth/useAuth";
import { useCan } from "../auth/permissions";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function KhoViTriPanel({ kho }: { kho: Row | null }) {
  const { token } = useAuth();
  const can = useCan();
  const coThem = can("dm_kho_hang", "create");
  const coXoa = can("dm_kho_hang", "delete");

  const [items, setItems] = useState<KhoViTriRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ban, setBan] = useState(false);
  const [ma, setMa] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [xoaTarget, setXoaTarget] = useState<KhoViTriRow | null>(null);

  const khoId = kho ? Number(kho.id) : null;

  const nap = useCallback(() => {
    if (!token || khoId == null) return;
    api.kho.viTri.list(token, khoId)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [token, khoId]);

  useEffect(() => { nap(); }, [nap]);

  if (khoId == null) {
    return (
      <section className="kvt">
        <p className="kvt__ghi">Lưu kho (bấm “Tạo mới”) rồi mới khai được vị trí.</p>
      </section>
    );
  }

  async function themViTri() {
    const t = ma.trim();
    if (!token || khoId == null || !t) return;
    setBan(true); setErr(null);
    try {
      await api.kho.viTri.create(token, khoId, { ma: t, ghi_chu: ghiChu.trim() || null });
      setMa("");
      setGhiChu("");
      nap();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không thêm được vị trí.");
    } finally {
      setBan(false);
    }
  }

  async function xoaViTri(vt: KhoViTriRow) {
    if (!token) return;
    setBan(true); setErr(null);
    try {
      await api.kho.viTri.remove(token, vt.id);
      setXoaTarget(null);
      nap();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không xóa được vị trí.");
    } finally {
      setBan(false);
    }
  }

  const enterThem = (e: KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); themViTri(); }
  };

  return (
    <section className="kvt">
      <p className="kvt__ghi">Kệ, ô cất hàng trong kho này. Lập lô hoặc phiếu nhập xuất sẽ chọn vị trí từ danh sách này.</p>
      {err && <div className="banner banner--error">{err}</div>}

      {coThem && (
        <div className="kvt__them">
          <input
            className="rc-input kvt__o-ma"
            aria-label="Tên vị trí mới"
            value={ma}
            disabled={ban}
            maxLength={60}
            placeholder="Tên vị trí, vd Kệ A1"
            onChange={(e) => setMa(e.target.value)}
            onKeyDown={enterThem}
          />
          <input
            className="rc-input kvt__o-gc"
            aria-label="Ghi chú vị trí mới"
            value={ghiChu}
            disabled={ban}
            maxLength={255}
            placeholder="Ghi chú (không bắt buộc)"
            onChange={(e) => setGhiChu(e.target.value)}
            onKeyDown={enterThem}
          />
          <Button type="button" variant="secondary" disabled={ban || !ma.trim()} onClick={themViTri}>
            Thêm
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="kvt__trong">Chưa có vị trí nào.</p>
      ) : (
        <ul className="kvt__ds" aria-label="Danh sách vị trí">
          {items.map((vt) => (
            <li key={vt.id} className="kvt__dong">
              <span className="kvt__ma">{vt.ma}</span>
              <span className="kvt__gc">{vt.ghi_chu}</span>
              {coXoa && (
                <button
                  type="button"
                  className="kvt__xoa"
                  aria-label={`Xóa vị trí ${vt.ma}`}
                  title="Xóa vị trí"
                  disabled={ban}
                  onClick={() => setXoaTarget(vt)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={xoaTarget !== null}
        title="Xóa vị trí?"
        message={xoaTarget ? `Bỏ vị trí “${xoaTarget.ma}” khỏi danh sách của kho. Lô đã ghi vị trí này (dạng chữ) không đổi.` : ""}
        confirmLabel="Xóa"
        cancelLabel="Giữ lại"
        danger
        busy={ban}
        onConfirm={() => xoaTarget && xoaViTri(xoaTarget)}
        onCancel={() => setXoaTarget(null)}
      />
    </section>
  );
}
