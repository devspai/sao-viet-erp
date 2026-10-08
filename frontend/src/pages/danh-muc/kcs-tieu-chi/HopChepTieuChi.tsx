// Hộp soạn trước khi chép tiêu chí (`docs/design-tieu-chi-kcs-lam-lai.md` §6, cách 2): sửa / bỏ /
// thêm câu ngay trong hộp rồi chép vào MỘT HAY NHIỀU công đoạn một lần. Sửa ở đây KHÔNG đổi công
// đoạn nguồn. Ô chọn công đoạn đích tìm tương đối ở trình duyệt (vài chục dòng, đã đủ trong một lần
// tải `khai-bao`); công đoạn đã chọn nằm ở hàng "Đã chọn" nên lọc khuất vẫn không mất.
import { Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ApiError, api, type KcsChepKetQua } from "../../../api/client";
import { type CongDoanTc, chuanCau, demChep, gomTheoGd, locDich } from "./kcsTieuChi";
import { ChipGd } from "./ChipGd";

interface Cau { key: number; ten: string; chon: boolean }

let soKhoa = 0;
const thanhCau = (ten: string): Cau => ({ key: ++soKhoa, ten, chon: true });

export function HopChepTieuChi({
  token, nguon: nguonSan, dichSan, onDong, onXong,
}: {
  token: string;
  /** Công đoạn đang chọn khi bấm "Chép sang…"; null = "Chép từ công đoạn khác" (chọn nguồn trước). */
  nguon: CongDoanTc | null;
  /** Công đoạn tick sẵn làm đích ("Chép từ công đoạn khác"). */
  dichSan: number | null;
  onDong: () => void;
  onXong: (kq: KcsChepKetQua, soDich: number) => void;
}) {
  const [ds, setDs] = useState<CongDoanTc[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [nguonId, setNguonId] = useState<number | null>(nguonSan?.cong_doan_id ?? null);
  const [ban, setBan] = useState<Cau[]>(() => (nguonSan?.hang_muc ?? []).map((h) => thanhCau(h.ten)));
  const [them, setThem] = useState("");
  const [tim, setTim] = useState("");
  const [timNguon, setTimNguon] = useState("");
  const [daChon, setDaChon] = useState<Set<number>>(() => new Set(dichSan != null ? [dichSan] : []));
  const [dangChep, setDangChep] = useState(false);
  const oThem = useRef<HTMLInputElement>(null);

  // Nạp đủ danh sách một lần, không kèm ô tìm của ô trái (ô trái có thể đang lọc).
  useEffect(() => {
    let huy = false;
    api.kcsHangMuc.khaiBao(token)
      .then((kb) => { if (!huy) setDs(kb.giai_doan.flatMap((g) => g.cong_doan)); })
      .catch((e) => { if (!huy) { setDs([]); setLoi(e instanceof ApiError ? e.message : "Không tải được danh sách công đoạn."); } });
    return () => { huy = true; };
  }, [token]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !dangChep) onDong(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [dangChep, onDong]);

  const nguon = nguonId != null ? ds?.find((c) => c.cong_doan_id === nguonId) ?? nguonSan : null;
  const theoId = useMemo(() => new Map((ds ?? []).map((c) => [c.cong_doan_id, c])), [ds]);

  function chonNguon(c: CongDoanTc) {
    setNguonId(c.cong_doan_id);
    setBan(c.hang_muc.map((h) => thanhCau(h.ten)));
    setDaChon((cu) => { const m = new Set(cu); m.delete(c.cong_doan_id); return m; });
  }

  const cauChep = chuanCau(ban.filter((c) => c.chon).map((c) => c.ten));
  const dichChon = [...daChon].map((id) => theoId.get(id)).filter((c): c is CongDoanTc => !!c);
  const dem = demChep(dichChon, cauChep);
  const { khop, chonDuoc } = locDich(ds ?? [], tim.trim(), nguonId, daChon);
  const khoa = !nguon || dangChep || dichChon.length === 0 || cauChep.length === 0;

  const doiChon = (id: number) => setDaChon((cu) => {
    const m = new Set(cu);
    if (m.has(id)) m.delete(id); else m.add(id);
    return m;
  });

  function themCau() {
    const t = them.trim();
    if (!t) return;
    setBan((b) => [...b, thanhCau(t)]);
    setThem("");
    oThem.current?.focus();
  }

  async function chep() {
    if (khoa) return;
    setDangChep(true);
    setLoi(null);
    try {
      const kq = await api.kcsHangMuc.chep(token, dichChon.map((c) => c.cong_doan_id), cauChep);
      onXong(kq, dichChon.length);
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không chép được tiêu chí.");
      setDangChep(false);
    }
  }

  return (
    <div className="cdlg-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !dangChep) onDong(); }}>
      <div className="ktc-hop" role="dialog" aria-modal="true" aria-label="Chép tiêu chí">
        <div className="ktc-hop__dau">
          <h2>{nguon ? <>Chép tiêu chí của {nguon.ten}</> : "Chép tiêu chí từ công đoạn khác"}</h2>
          {nguon && <ChipGd nhom={nguon.nhom} />}
          <button type="button" className="ktc-hop__dong" onClick={onDong} disabled={dangChep} aria-label="Đóng">
            <X size={18} aria-hidden />
          </button>
        </div>

        {loi && <div className="banner banner--error" role="alert"><span>{loi}</span></div>}

        <div className="ktc-hop__than">
          {/* Cột trái: bộ sẽ chép */}
          <div className="ktc-hop__cot">
            {!nguon ? (
              <ChonNguon ds={ds} tim={timNguon} setTim={setTimNguon} onChon={chonNguon} loai={dichSan} />
            ) : (
              <>
                <div className="ktc-hop__nhan">
                  Bộ sẽ chép
                  {!nguonSan && (
                    <button type="button" className="ktc-lien" onClick={() => { setNguonId(null); setBan([]); }}>
                      Đổi công đoạn nguồn
                    </button>
                  )}
                </div>
                <ul className="ktc-ban">
                  {ban.map((c) => (
                    <li key={c.key} className={`ktc-ban__dong${c.chon ? "" : " ktc-ban__dong--bo"}`}>
                      <input type="checkbox" checked={c.chon} aria-label={`Chép “${c.ten}”`}
                        onChange={(e) => setBan((b) => b.map((x) => (x.key === c.key ? { ...x, chon: e.target.checked } : x)))} />
                      <input className="ktc-ban__o" value={c.ten} maxLength={200} aria-label="Câu chữ tiêu chí"
                        onChange={(e) => setBan((b) => b.map((x) => (x.key === c.key ? { ...x, ten: e.target.value } : x)))} />
                      <button type="button" className="ktc-tc__xoa" aria-label={`Bỏ “${c.ten}” khỏi bản chép`}
                        title="Bỏ khỏi bản chép" onClick={() => setBan((b) => b.filter((x) => x.key !== c.key))}>
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </li>
                  ))}
                  <li className="ktc-ban__dong">
                    <span className="ktc-moi__cong" aria-hidden>+</span>
                    <input ref={oThem} className="ktc-ban__o" value={them} maxLength={200}
                      placeholder="Thêm tiêu chí chỉ cho bản chép rồi bấm Enter" aria-label="Thêm tiêu chí cho bản chép"
                      onChange={(e) => setThem(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); themCau(); } }} />
                    <span />
                  </li>
                </ul>
                <p className="ktc-nhac">Sửa ở đây không đổi tiêu chí của {nguon.ten}.</p>
              </>
            )}
          </div>

          {/* Cột phải: chọn công đoạn đích */}
          <div className="ktc-hop__cot">
            <div className="ktc-hop__nhan">Chép vào (chọn được nhiều)</div>
            <label className="ktc-tim">
              <Search size={16} aria-hidden />
              <input value={tim} onChange={(e) => setTim(e.target.value)}
                placeholder="Tìm công đoạn, ví dụ “dan” hay “sau in boi”" aria-label="Tìm công đoạn đích" />
              {tim && (
                <button type="button" className="ktc-tim__xoa" onClick={() => setTim("")} aria-label="Xoá chữ tìm">
                  <X size={14} aria-hidden />
                </button>
              )}
            </label>

            {dichChon.length > 0 && (
              <div className="ktc-da-chon" aria-label="Đã chọn">
                <span className="ktc-da-chon__nhan">Đã chọn</span>
                {dichChon.map((c) => (
                  <span key={c.cong_doan_id} className="ktc-the">
                    {c.ten}
                    <button type="button" onClick={() => doiChon(c.cong_doan_id)} aria-label={`Bỏ chọn ${c.ten}`}>
                      <X size={12} aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {tim.trim() && khop.length > 0 && (
              <div className="ktc-khop">
                <span>{khop.length} công đoạn khớp</span>
                {chonDuoc.length > 0 && (
                  <button type="button" className="ktc-lien"
                    onClick={() => setDaChon((cu) => new Set([...cu, ...chonDuoc.map((c) => c.cong_doan_id)]))}>
                    Chọn cả {chonDuoc.length}
                  </button>
                )}
              </div>
            )}

            <div className="ktc-hop__ds">
              {ds == null ? <div className="ktc-trong">Đang tải…</div>
                : khop.length === 0 ? <div className="ktc-trong">Không có công đoạn nào khớp “{tim.trim()}”.</div>
                  : gomTheoGd(khop).map((g) => (
                    <div key={g.nhom || "khac"} className="ktc-nhom">
                      <div className="ktc-nhom__nhan"><ChipGd nhom={g.nhom} /></div>
                      {g.cong_doan.map((c) => {
                        const laNguon = c.cong_doan_id === nguonId;
                        const da = daChon.has(c.cong_doan_id);
                        const trung = da ? dem.trungTheoDich.get(c.cong_doan_id) ?? 0 : 0;
                        return (
                          <label key={c.cong_doan_id}
                            className={`ktc-dich${laNguon ? " ktc-dich--nguon" : ""}${da ? " ktc-dich--chon" : ""}`}>
                            <input type="checkbox" checked={da} disabled={laNguon}
                              onChange={() => doiChon(c.cong_doan_id)} />
                            <span className="ktc-dich__ten">
                              {c.ten}
                              {trung > 0 && <span className="ktc-trung">{trung} câu đã có, sẽ bỏ qua</span>}
                            </span>
                            {laNguon
                              ? <span className="ktc-dich__phu">đang chép từ đây</span>
                              : c.hang_muc.length
                                ? <span className="ktc-dem">{c.hang_muc.length}</span>
                                : <span className="ktc-dem ktc-dem--rong">chưa có</span>}
                          </label>
                        );
                      })}
                    </div>
                  ))}
            </div>
          </div>
        </div>

        <div className="ktc-hop__chan">
          <span className="ktc-hop__tong">
            {cauChep.length} tiêu chí, {dichChon.length} công đoạn đích. Thêm mới {dem.moi} dòng.
          </span>
          <button type="button" className="ktc-nut" onClick={onDong} disabled={dangChep}>Huỷ</button>
          <button type="button" className="ktc-nut ktc-nut--chinh" onClick={() => void chep()} disabled={khoa}>
            {dangChep ? "Đang chép…" : `Chép vào ${dichChon.length} công đoạn`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Chép từ công đoạn khác": chọn nguồn trước — chỉ công đoạn đang có tiêu chí, tìm tương đối. */
function ChonNguon({
  ds, tim, setTim, onChon, loai,
}: {
  ds: CongDoanTc[] | null;
  tim: string;
  setTim: (s: string) => void;
  onChon: (c: CongDoanTc) => void;
  loai: number | null;
}) {
  const coTc = (ds ?? []).filter((c) => c.hang_muc.length > 0 && c.cong_doan_id !== loai);
  const { khop } = locDich(coTc, tim.trim(), null, new Set());
  return (
    <>
      <div className="ktc-hop__nhan">Chọn công đoạn nguồn</div>
      <label className="ktc-tim">
        <Search size={16} aria-hidden />
        <input autoFocus value={tim} onChange={(e) => setTim(e.target.value)}
          placeholder="Tìm công đoạn có tiêu chí" aria-label="Tìm công đoạn nguồn" />
        {tim && (
          <button type="button" className="ktc-tim__xoa" onClick={() => setTim("")} aria-label="Xoá chữ tìm">
            <X size={14} aria-hidden />
          </button>
        )}
      </label>
      <div className="ktc-hop__ds">
        {ds == null ? <div className="ktc-trong">Đang tải…</div>
          : khop.length === 0
            ? <div className="ktc-trong">{tim.trim() ? `Không có công đoạn nào khớp “${tim.trim()}”.` : "Chưa công đoạn nào có tiêu chí."}</div>
            : gomTheoGd(khop).map((g) => (
              <div key={g.nhom || "khac"} className="ktc-nhom">
                <div className="ktc-nhom__nhan"><ChipGd nhom={g.nhom} /></div>
                {g.cong_doan.map((c) => (
                  <button key={c.cong_doan_id} type="button" className="ktc-cd" onClick={() => onChon(c)}>
                    <span className="ktc-cd__ten">{c.ten}</span>
                    <span className="ktc-dem">{c.hang_muc.length}</span>
                  </button>
                ))}
              </div>
            ))}
      </div>
    </>
  );
}
