// Hộp "Gia công trọn gói" (spec 2026-09-26 §4) — thay cho phát hành: cả lệnh giao nhà gia công,
// không xuống bàn tổ, không vào Xếp lịch. Máy chủ chặn lệnh ghép cụm / đang có dòng xếp lịch.
import { useEffect, useState } from "react";
import { ApiError, api, type LsxDetail, type NhaGiaCong } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { nhanDonVi } from "../lsxBuoc";
import "./giaCong.css";

export function TronGoiDialog({
  lsx,
  open,
  onClose,
  onDone,
}: {
  lsx: LsxDetail;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const [ds, setDs] = useState<NhaGiaCong[] | null>(null);
  const [ncc, setNcc] = useState<number | "">("");
  const [sl, setSl] = useState(String(lsx.so_luong_dat ?? ""));
  const [capGiay, setCapGiay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    api.giaCongNgoai
      .nhaGiaCong(token)
      .then(setDs)
      .catch((e: unknown) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [open, token]);

  async function dat() {
    if (!token || ncc === "") return;
    setBusy(true);
    setErr(null);
    try {
      await api.giaCongNgoai.datTronGoi(token, lsx.id, {
        nha_cung_cap_id: ncc,
        sl_dat: Number(sl),
        don_gia: null,
        xuong_cap_giay: capGiay,
      });
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const dv = nhanDonVi(lsx.don_vi_tinh);
  return (
    <ConfirmDialog
      open={open}
      title={`Gia công trọn gói — ${lsx.ma}`}
      confirmLabel="Đặt gia công trọn gói"
      busy={busy}
      error={err}
      confirmDisabled={ncc === "" || !(Number(sl) > 0)}
      onConfirm={dat}
      onCancel={onClose}
    >
      <div className="gcn__form gcn__form--cot">
        <p className="gcn__note">
          Cả lệnh giao cho nhà gia công: lệnh chuyển sang Đã phát hành với MỘT việc “Gia công trọn
          gói”, không xuống bàn tổ, không vào Xếp lịch. Nhận hàng về thì chốt số ở khối Gia công
          ngoài trên lệnh.
        </p>
        <label className="gcn__o">
          <span>Nhà gia công</span>
          <select
            value={ncc}
            onChange={(e) => setNcc(e.target.value ? Number(e.target.value) : "")}
            disabled={ds == null}
          >
            <option value="">— chọn nhà gia công —</option>
            {(ds ?? []).map((n) => <option key={n.id} value={n.id}>{n.ten}</option>)}
          </select>
          {ds != null && ds.length === 0 && (
            <span className="gcn__note">
              Chưa có nhà cung cấp nào tích “Nhận gia công” — vào màn Nhà cung cấp tích ô đó.
            </span>
          )}
        </label>
        <label className="gcn__o">
          <span>Số đặt ({dv})</span>
          <input inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} />
        </label>
        <label className="gcn__chk">
          <input type="checkbox" checked={capGiay} onChange={(e) => setCapGiay(e.target.checked)} />
          Xưởng cấp giấy (kho xuất giấy cho nhà gia công)
        </label>
      </div>
    </ConfirmDialog>
  );
}
