// Hộp LÊN ĐƠN GIAO HÀNG — chọn xe, tài xế, phụ xe (tách từ pages/GiaoHangPage.tsx). ⚠️ Payload `plan` / `lenLuot` là logic nghiệp vụ — giữ nguyên văn.
//
// HAI chế độ, MỘT form (chủ chốt 18/09/2026 — "gom nhiều phiếu lại chạy 1 lượt"):
//   một yêu cầu   — nút "Lên đơn giao" ở từng dòng ⇒ `plan`.
//   `theoLuot`    — tick nhiều yêu cầu rồi "Lên lượt xe" ⇒ `lenLuot`: MỖI yêu cầu một chuyến, một
//                   phiếu kho, chung MỘT lượt xe; một yêu cầu hỏng là cả lô không lưu.
// Lên đơn = gửi kho luôn (12/10/2026): máy chủ lập đề nghị xuất kho cho từng chuyến ngay lúc lưu.
// Lưu xong ngăn KHÔNG đóng mà sang bước "Đề nghị xuất kho" (BuocGuiKho) để hẹn kho — hai ô giờ lấy
// hàng / dự kiến giao đã gỡ (mg 0400): giờ kho cần là Cần lúc của đề nghị.
//
// Bố cục phương án B bản chỉnh (docs/mockups/giao-hang-len-don-phuong-an-B.html, chủ chọn
// 07/10/2026): việc chính của hộp là CHỌN XE VÀ NGƯỜI, nên bày thẳng hai danh sách kèm trạng thái
// (bấm hàng là chọn xe; mỗi người có nút Tài xế / Phụ xe), mỗi danh sách một ô tìm gần đúng vì thực
// tế sẽ dài. Hàng đã chọn đứng yên chỗ cũ, gõ tìm không lọc mất nó. Cột phải: yêu cầu, lượt, ghi chú.
// Không chữ đậm; chọn = viền đủ bốn cạnh.
import { useEffect, useState } from "react";
import type { DeliveryDriver, DeliveryRequest } from "../../../../api/client";
import { api } from "../../../../api/client";
import type { Row } from "../../../../api/rebuildCatalog";
import { Button } from "../../../../components/Button";
import { khopGanDung } from "../../../../utils/timGanDung";
import { NganPhai } from "../../../ke-toan/shared/NganPhai";
import { ChonKipXe, GiuCho } from "../components/ChonKipXe";
import { Pill } from "../components/giaoHangCells";
import { hanGiao, monGiao, ngayThuan, sdtDoc } from "../shared/helpers";
import { napNguonLenDon, nguonLenDonSan, type NguonLenDon } from "../shared/nguonLenDon";
import { BuocGuiKho } from "./BuocGuiKho";
import "../../../ke-toan/ke-toan.css";

// =============================================================================
// Ngăn · Lên đơn giao hàng
// =============================================================================
export function DialogLenKeHoach({
  requests,
  theoLuot = false,
  token,
  onClose,
  onXong,
}: {
  requests: DeliveryRequest[];
  theoLuot?: boolean;
  token: string;
  onClose: () => void;
  /** `luotId` có khi lên theo lượt — màn ngoài làm nổi dòng lượt đó. `phieu` = mã đề nghị xuất
   *  kho máy chủ vừa gửi kèm. */
  onXong: (luotId: number | undefined, phieu: string[]) => void;
}) {
  const request = requests[0];
  const [employeeId, setEmployeeId] = useState("");
  // Phụ xe — TUỲ CHỌN, tối đa một người (mg 0231). Cùng danh sách với tài xế: vai trò do NÚT bấm
  // trên hàng quyết định, không phải thuộc tính của người. Hôm nay lái, mai đi phụ.
  const [phuXeId, setPhuXeId] = useState("");
  // XE — BẮT BUỘC (chủ chốt 12/09/2026). Đơn giá khoán km tra theo MỨC mà xe đang ăn, nên bỏ
  // trống là đẩy việc sang người đóng chuyến, lúc đó hàng đã đi rồi mới biết chuyến nào thiếu.
  const [xeId, setXeId] = useState("");
  // LƯỢT XE (PRD khoán km §14, chủ chốt 18/09/2026): người lên đơn quyết đơn nào đi chung một vòng
  // xe. Tiền km tính theo TỪNG CHẶNG giữa hai lần ghi số đồng hồ, nên gom đúng lượt là gom đúng
  // tiền. Nguồn nạp lượt mở của MỌI xe một lần: vừa nói xe nào "Đang chạy", vừa đổ ô Lượt xe.
  const [luot, setLuot] = useState<string>("moi");
  // Xe, lượt, người, trạng thái hôm nay, mức km — màn ngoài đã nạp TRƯỚC (shared/nguonLenDon) nên
  // thường có ngay lúc mở; vẫn nạp lại ngầm cho tươi. `null` = chưa có gì ⇒ hàng giữ chỗ.
  // Không có quyền xem tab Nhân viên ⇒ trạng thái rỗng, người vẫn chọn được, chỉ thiếu cột đó.
  const [nguon, setNguon] = useState<NguonLenDon | null>(() => nguonLenDonSan(token));
  const [timXe, setTimXe] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  // Lưu xong ⇒ sang bước hẹn kho. Giữ lại để báo màn ngoài lúc người dùng xong bước đó.
  const [daLuu, setDaLuu] = useState<{
    tripIds: number[]; luotId?: number; phieu: string[]; canhBao: string[]; bao: string;
  } | null>(null);

  useEffect(() => {
    let bo = false;
    napNguonLenDon(token).then((n) => { if (!bo) setNguon(n); });
    return () => { bo = true; };
  }, [token]);

  const dangNap = nguon === null;
  const xeDs = nguon?.xe ?? [];
  const luotTheoXe = nguon?.luotTheoXe ?? {};
  const taiXe = nguon?.taiXe ?? [];
  const trangThai = nguon?.trangThai ?? new Map<number, DeliveryDriver>();
  const mucDs = nguon?.muc ?? [];
  // Chưa nạp xong thì coi như CÓ xe — nút chính đứng khoá chờ, không lách được bước chọn xe.
  const canXe = theoLuot || dangNap || xeDs.length > 0;
  const thieuXe = canXe && !xeId;

  const luotDs = xeId ? luotTheoXe[xeId] ?? [] : [];
  const tenMuc = (id: unknown) => mucDs.find((m) => m.id === Number(id))?.ten ?? null;

  // ---- Danh sách xe: hàng ĐỨNG YÊN chỗ cũ khi bấm (chủ chốt 12/10/2026 — nhảy lên đầu làm mất
  // dấu chỗ vừa bấm). Xe đã chọn vẫn hiện dù ô tìm không khớp nó, ở đúng vị trí của nó.
  const xeLoc = xeDs.filter((x) => String(x.id) === xeId || khopGanDung(
    [x.ma, x.ten, x.tai_trong != null ? `${x.tai_trong} tấn` : "", tenMuc(x.muc_khoan_km_id) ?? ""]
      .map((v) => String(v ?? "")).join(" "),
    timXe,
  ));

  const xeChon = xeDs.find((x) => String(x.id) === xeId);

  const gui = () => {
    setLoi(null);
    setDangGui(true);
    if (theoLuot) {
      api.giaoHang
        .lenLuot(token, {
          request_ids: requests.map((r) => r.id),
          employee_id: Number(employeeId),
          ...(phuXeId ? { phu_xe_employee_id: Number(phuXeId) } : {}),
          vehicle_id: Number(xeId),
          luot_xe_id: luot === "moi" ? "moi" : Number(luot),
          ghi_chu_phan_cong: ghiChu || null,
        })
        .then((r) => setDaLuu({
          tripIds: r.trips.map((t) => t.id), luotId: r.luot_id, phieu: r.phieu ?? [], canhBao: r.canh_bao,
          bao: `Đã lên lượt ${r.code} cho ${r.trips.length} đơn${xeChon ? `, xe ${String(xeChon.ma ?? "")}` : ""}. `
            + `Kho thành phẩm đã nhận ${r.trips.length} đề nghị.`,
        }))
        .catch((e: unknown) => setLoi(e instanceof Error ? e.message : "Không lưu được lượt xe"))
        .finally(() => setDangGui(false));
      return;
    }
    api.giaoHang
      .plan(token, {
        request_id: request.id,
        employee_id: Number(employeeId),
        ...(phuXeId ? { phu_xe_employee_id: Number(phuXeId) } : {}),
        ...(xeId
          ? { vehicle_id: Number(xeId), luot_xe_id: luot === "moi" ? "moi" as const : Number(luot) }
          : {}),
        ghi_chu_phan_cong: ghiChu || null,
      })
      .then((r) => setDaLuu({
        tripIds: [r.trip.id], phieu: r.phieu ?? [], canhBao: r.canh_bao,
        bao: `Đã lên đơn ${request.code}${r.trip.luot ? ` vào lượt ${r.trip.luot.code}` : ""}. Kho thành phẩm đã nhận đề nghị.`,
      }))
      .catch((e: unknown) => setLoi(e instanceof Error ? e.message : "Không lưu được đơn giao hàng"))
      .finally(() => setDangGui(false));
  };

  const thieu = [thieuXe && "xe", !employeeId && "tài xế"].filter(Boolean) as string[];
  const khoa = thieu.length > 0 || dangGui;

  const hangXe = (x: Row) => {
    const id = String(x.id);
    const on = id === xeId;
    const mo = luotTheoXe[id] ?? [];
    const muc = tenMuc(x.muc_khoan_km_id);
    return (
      <button key={id} type="button" role="radio" aria-checked={on}
        className={`gh-ld__hang gh-ld__hang--xe${on ? " is-chon" : ""}`}
        onClick={() => {
          setXeId(on ? "" : id);
          setLuot("moi");
        }}>
        <span className={`gh-ld__rad${on ? " is-chon" : ""}`} aria-hidden="true" />
        <span className="gh-num">{String(x.ma ?? "")}</span>
        <span className="gh-ld__cat">{String(x.ten ?? "")}</span>
        <span className="gh-nho gh-num">
          {x.tai_trong != null ? `${Number(x.tai_trong).toLocaleString("vi-VN")} tấn` : ""}
        </span>
        <span className="gh-nho gh-ld__cat">{muc ?? ""}</span>
        <span>
          {mo.length > 0
            ? <Pill text={`Đang chạy ${mo[0].code}`} tone="cyan" />
            : <Pill text="Rảnh" tone="la" />}
        </span>
      </button>
    );
  };

  const chan = (
    <>
      <span className="gh-nho">{thieu.length > 0 ? `Còn thiếu ${thieu.join(" và ")}.` : ""}</span>
      <span className="rc__spacer" />
      <Button variant="ghost" onClick={onClose}>Huỷ</Button>
      <Button variant="accent" disabled={khoa} onClick={gui}>
        {theoLuot ? `Lên lượt xe cho ${requests.length} đơn` : "Lên đơn giao hàng"}
      </Button>
    </>
  );

  if (daLuu) {
    return (
      <BuocGuiKho tripIds={daLuu.tripIds} token={token} moi bao={daLuu.bao} canhBao={daLuu.canhBao}
        onXong={() => onXong(daLuu.luotId, daLuu.phieu)} />
    );
  }

  return (
    <NganPhai
      duongDan="Giao hàng"
      tieuDe={theoLuot ? "Lên lượt xe" : "Lên đơn giao hàng"}
      the={<span className="gh-the">{theoLuot ? `${requests.length} yêu cầu` : request.code}</span>}
      chan={chan}
      onDong={onClose}
      chanDong={() => ghiChu.trim() !== ""}
    >
      <div className="gh-ld">
        <div className="gh-ld__trai">
          <div className="gh-ld__dau">
            <h3>Xe</h3>
            {canXe && <span className="gh-nho">bắt buộc</span>}
            <span className="rc__spacer" />
            {(dangNap || xeDs.length > 0) && (
              <input className="input gh-ld__tim" type="search" value={timXe} aria-label="Tìm xe"
                disabled={dangNap} placeholder="Tìm biển số, tên xe, tải trọng"
                onChange={(e) => setTimXe(e.target.value)} />
            )}
          </div>
          {dangNap ? <GiuCho so={3} /> : xeDs.length === 0 ? (
            <p className="rc__sub gh-ld__rong">
              {theoLuot
                ? "Chưa khai chiếc xe nào — lượt là vòng chạy của một chiếc xe, khai xe ở Cấu hình danh mục → Xe giao hàng trước."
                : "Chưa khai chiếc xe nào ở Cấu hình danh mục → Xe giao hàng."}
            </p>
          ) : (
            <div className="gh-ld__ds" role="radiogroup" aria-label="Xe">
              {xeLoc.map(hangXe)}
              {xeLoc.every((x) => String(x.id) === xeId) && timXe && (
                <div className="gh-ld__khong">Không có xe nào khớp «{timXe}»</div>
              )}
            </div>
          )}

          <ChonKipXe taiXe={taiXe} trangThai={trangThai} dangNap={dangNap}
            employeeId={employeeId} phuXeId={phuXeId} onEmployee={setEmployeeId} onPhuXe={setPhuXeId} />
        </div>

        <div className="gh-ld__phai">
          {theoLuot ? (
            <section className="gh-ld__nhom">
              <h3 className="gh-ld__tieu">Các yêu cầu chung một lượt</h3>
              <ul className="gh-ld__yc">
                {requests.map((r) => {
                  const h = hanGiao(r.ngay_can_giao);
                  return (
                    <li key={r.id}>
                      <span className="gh-ld__cat">
                        {r.code}
                        <span className="gh-nho gh-ld__dong">
                          {r.customer_name}
                          {r.order_code && <span className="gh-the">{r.order_code}</span>}
                        </span>
                      </span>
                      {h.tone ? <Pill text={h.text} tone={h.tone} /> : <span className="gh-nho">{h.text}</span>}
                    </li>
                  );
                })}
              </ul>
              <p className="gh-ld__goi">Mỗi yêu cầu thành một đơn giao hàng riêng, chạy chung một lượt xe.</p>
            </section>
          ) : (
            <section className="gh-ld__nhom">
              <h3 className="gh-ld__tieu">Yêu cầu</h3>
              <dl className="gh-ld__kv">
                <div>
                  <dt>Khách</dt>
                  <dd>
                    {request.customer_name ?? "—"}
                    {request.order_code && <span className="gh-the">{request.order_code}</span>}
                  </dd>
                </div>
                <div>
                  <dt>Hàng</dt>
                  {request.lines.length === 0 ? <dd>—</dd> : monGiao(request.lines).map((x) => (
                    <dd key={x.id} className="gh-ld__mon" title={x.thanhPhan.join(" + ") || undefined}>
                      <span>{x.ten}</span>
                      <span className="gh-num">
                        {x.qty.toLocaleString("vi-VN")}
                        {x.dvt && <span className="gh-nho"> {x.dvt}</span>}
                      </span>
                    </dd>
                  ))}
                </div>
                <div>
                  <dt>Giao tới</dt>
                  <dd>{request.dia_chi || "—"}</dd>
                  {(request.nguoi_nhan || request.sdt_nguoi_nhan) && (
                    <dd className="gh-nho">
                      {request.nguoi_nhan}
                      {request.sdt_nguoi_nhan && ` ${sdtDoc(request.sdt_nguoi_nhan)}`}
                    </dd>
                  )}
                </div>
                <div>
                  <dt>Cần giao</dt>
                  <dd>
                    {(() => {
                      const h = hanGiao(request.ngay_can_giao);
                      return h.tone
                        ? <><Pill text={h.text} tone={h.tone} /> <span className="gh-nho">{ngayThuan(request.ngay_can_giao)}</span></>
                        : h.text;
                    })()}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {xeId && (
            <section className="gh-ld__nhom">
              <label className="gh-ld__tieu" htmlFor="gh-ld-luot">Lượt xe</label>
              <select id="gh-ld-luot" className="input gh-ld__nhap" value={luot} onChange={(e) => setLuot(e.target.value)}>
                <option value="moi">Lượt mới — xe xuất phát từ kho</option>
                {/* Ô chọn gốc không chứa được thẻ nhỏ ⇒ nói thành câu, không nối mẩu bằng dấu. */}
                {luotDs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {`Ghép vào ${l.code} ngày ${ngayThuan(l.ngay)} đang có ${l.so_diem} điểm`}
                    {l.tai_xe ? ` do ${l.tai_xe} chạy` : ""}
                    {l.da_xuat_phat ? " (xe đã xuất phát)" : ""}
                  </option>
                ))}
              </select>
            </section>
          )}

          <section className="gh-ld__nhom">
            <label className="gh-ld__tieu" htmlFor="gh-ld-ghi-chu">Ghi chú cho kíp xe</label>
            <textarea id="gh-ld-ghi-chu" className="input gh-ld__nhap" rows={3} value={ghiChu}
              placeholder="Ví dụ: gọi trước cho bảo vệ KCN" onChange={(e) => setGhiChu(e.target.value)} />
          </section>

          {phuXeId && (
            <p className="gh-ld__goi">Có phụ xe nên tiền chuyến chia theo tỷ lệ khai ở Phòng ban.</p>
          )}
          {loi && <div className="banner banner--error" role="alert" style={{ margin: 0 }}>{loi}</div>}
        </div>
      </div>
    </NganPhai>
  );
}
