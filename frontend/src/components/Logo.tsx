export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="logo">
      <span className="logo-mark">AS</span>
      <span className="logo-text" style={light ? { color: '#fff' } : undefined}>
        ASV Finance
        <small>MICROFINANCE</small>
      </span>
    </span>
  );
}
