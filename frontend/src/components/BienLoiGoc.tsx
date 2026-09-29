// Biên lỗi GỐC bọc cả app. Không có nó, một lỗi hiển thị ở BẤT KỲ màn nào (một ô null không ngờ, một
// thư viện ném lỗi) làm React gỡ cả cây ⇒ màn trắng tinh, người dùng không biết bấm gì ngoài F5.
//
// Riêng lỗi NẠP CHUNK (màn tách bundle bằng `React.lazy`): sau một lần deploy, tab đang mở vẫn giữ
// `index.html` cũ trỏ tới tên chunk cũ — chunk đó đã bị xoá khỏi máy chủ nên lần đầu mở một màn chưa
// nạp là hỏng. Tải lại trang là lấy được bản mới, nên tự tải lại MỘT lần (cờ trong sessionStorage
// để không lặp vô hạn nếu lỗi là thật).
import { Component, type ErrorInfo, type ReactNode } from "react";

const CO_DA_TAI_LAI = "svn-tai-lai-vi-chunk";

/** Lỗi do không nạp được một module động (chunk JS) — thường vì vừa deploy bản mới. */
export function laLoiNapChunk(err: unknown): boolean {
  const e = err as { name?: unknown; message?: unknown } | null;
  const ten = typeof e?.name === "string" ? e.name : "";
  const cau = typeof e?.message === "string" ? e.message : String(err ?? "");
  return (
    ten === "ChunkLoadError" ||
    /Failed to fetch dynamically imported module/i.test(cau) ||
    /Importing a module script failed/i.test(cau) ||
    /error loading dynamically imported module/i.test(cau) ||
    /Loading chunk [\w-]+ failed/i.test(cau)
  );
}

function docCo(): boolean {
  try {
    return sessionStorage.getItem(CO_DA_TAI_LAI) === "1";
  } catch {
    return false;
  }
}

function datCo(): boolean {
  try {
    sessionStorage.setItem(CO_DA_TAI_LAI, "1");
    return true;
  } catch {
    // Không ghi được cờ (chế độ riêng tư chặn storage) ⇒ KHÔNG tự tải lại: không có cờ thì không
    // chặn được vòng tải lại vô hạn. Để người dùng tự bấm nút.
    return false;
  }
}

function xoaCo(): void {
  try {
    sessionStorage.removeItem(CO_DA_TAI_LAI);
  } catch {
    /* bỏ qua */
  }
}

interface Props {
  children: ReactNode;
}

interface State {
  loi: unknown;
  dangTaiLai: boolean;
}

export class BienLoiGoc extends Component<Props, State> {
  state: State = { loi: null, dangTaiLai: false };

  static getDerivedStateFromError(loi: unknown): Partial<State> {
    return { loi };
  }

  componentDidMount(): void {
    // App dựng lên được ⇒ lần tải lại vì chunk (nếu có) đã cứu được; xoá cờ để lần deploy sau
    // vẫn được tự tải lại một lần.
    if (!this.state.loi) setTimeout(xoaCo, 10_000);
  }

  componentDidCatch(loi: unknown, info: ErrorInfo): void {
    // Giữ vết trong console cho người sửa — màn lỗi chỉ nói câu tiếng Việt ngắn.
    console.error("Lỗi hiển thị:", loi, info.componentStack);
    if (laLoiNapChunk(loi) && !docCo() && datCo()) {
      this.setState({ dangTaiLai: true });
      window.location.reload();
    }
  }

  private taiLai = () => {
    xoaCo();
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.loi) return this.props.children;
    const chunk = laLoiNapChunk(this.state.loi);
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 12, padding: 16, textAlign: "center",
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          {this.state.dangTaiLai ? "Đang tải lại bản mới…" : "Có lỗi hiển thị"}
        </p>
        {!this.state.dangTaiLai && (
          <>
            <p style={{ margin: 0, maxWidth: 420 }}>
              {chunk
                ? "Hệ thống vừa được cập nhật bản mới. Tải lại trang để tiếp tục."
                : "Màn hình gặp lỗi không mong đợi. Tải lại trang để tiếp tục; dữ liệu đã lưu không bị mất."}
            </p>
            <button type="button" className="btn btn--primary" onClick={this.taiLai}>
              Tải lại trang
            </button>
          </>
        )}
      </div>
    );
  }
}
