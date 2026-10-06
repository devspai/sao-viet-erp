/** Một-trong-nhiều: nhóm nút liền, nút đang chọn nền charcoal (ngăn công nợ, form tài khoản…). */
export function NhomNut<T extends string>({
  giaTri,
  luaChon,
  onDoi,
}: {
  giaTri: T;
  luaChon: [T, string][];
  onDoi: (v: T) => void;
}) {
  return (
    <div className="kt-seg" role="group">
      {luaChon.map(([v, nhan]) => (
        <button key={v} type="button" className={v === giaTri ? "on" : undefined} aria-pressed={v === giaTri}
          onClick={() => onDoi(v)}>
          {nhan}
        </button>
      ))}
    </div>
  );
}
