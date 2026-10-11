// Dấu hỏi giải thích một ô / một khối — nay đi chung bong bóng trắng `HoverTip` (cùng khuôn ma trận
// phân quyền): hiện ngay khi rê / chạm, vẽ qua portal nên không bị khung cuộn cắt, tự lật khi sát mép.
import { HoverTip } from "./HoverTip";

interface InfoHintProps {
  /** Chữ giải thích. Nên một câu ngắn. */
  label: string;
  /** Giữ cho nơi gọi cũ — bong bóng tự canh trong màn hình nên không cần chọn hướng nữa. */
  align?: "left" | "right";
}

export function InfoHint({ label }: InfoHintProps) {
  return <HoverTip text={label} />;
}
