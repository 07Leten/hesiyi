/** 朱文方印式标识，三字竖排 */
export function Seal({ size = 44 }: { size?: number }) {
  return (
    <span className="seal" style={{ width: size, height: size }} aria-hidden="true">
      <span className="seal-col">
        <span>合</span>
      </span>
      <span className="seal-col">
        <span>四</span>
        <span>一</span>
      </span>
    </span>
  );
}
