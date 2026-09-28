import { useEffect, useState } from "react";
import { Info, ChevronDown, AlertTriangle, CheckCircle2, PackageCheck } from "lucide-react";
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
      icon={<PackageCheck size={20} />}
      title={`Gia công trọn gói — ${lsx.ma}`}
      confirmLabel="Đặt gia công trọn gói"
      busy={busy}
      error={err}
      confirmDisabled={ncc === "" || !(Number(sl) > 0)}
      onConfirm={dat}
      onCancel={onClose}
    >
      <div className="gcn__form gcn__form--cot">
        <div className="gcn__info-card">
          <Info size={18} />
          <div>
            <b>Lưu ý luồng giao việc:</b> Cả lệnh sẽ chuyển sang trạng thái <i>Đã phát hành</i> với MỘT công việc “Gia công trọn gói”, không xuống bàn tổ và không vào Xếp lịch. Nhận hàng về thì chốt số ở khối Gia công ngoài trên lệnh.
          </div>
        </div>

        <div className="gcn__o">
          <span className="gcn__label-title">Nhà gia công</span>
          <div className="gcn__select-wrap">
            <select
              value={ncc}
              onChange={(e) => setNcc(e.target.value ? Number(e.target.value) : "")}
              disabled={ds == null}
            >
              <option value="">— chọn nhà gia công —</option>
              {(ds ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.ten}
                </option>
              ))}
            </select>
            <ChevronDown className="gcn__select-arrow" size={18} />
          </div>
          {ds != null && ds.length === 0 && (
            <div className="gcn__alert-warn">
              <AlertTriangle size={16} />
              <span>
                Chưa có nhà cung cấp nào tích “Nhận gia công” — vào màn <b>Nhà cung cấp</b> để tích chọn.
              </span>
            </div>
          )}
        </div>

        <div className="gcn__o">
          <span className="gcn__label-title">Số đặt ({dv})</span>
          <div className="gcn__input-wrap">
            <input
              inputMode="decimal"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              placeholder="Nhập số lượng đặt..."
            />
            <span className="gcn__suffix">{dv}</span>
          </div>
          {lsx.so_luong_dat != null && Number(sl) !== lsx.so_luong_dat && (
            <div className="gcn__quick-row">
              <button
                type="button"
                className="gcn__quick-btn"
                onClick={() => setSl(String(lsx.so_luong_dat))}
              >
                <CheckCircle2 size={13} />
                Bằng 100% lệnh ({lsx.so_luong_dat.toLocaleString("vi-VN")} {dv})
              </button>
            </div>
          )}
        </div>

        <label className={`gcn__toggle-card${capGiay ? " gcn__toggle-card--checked" : ""}`}>
          <input
            type="checkbox"
            checked={capGiay}
            onChange={(e) => setCapGiay(e.target.checked)}
          />
          <div className="gcn__toggle-text">
            <span className="gcn__toggle-title">Xưởng cấp giấy</span>
            <span className="gcn__toggle-desc">Kho xưởng xuất giấy cho nhà gia công sản xuất</span>
          </div>
        </label>
      </div>
    </ConfirmDialog>
  );
}
