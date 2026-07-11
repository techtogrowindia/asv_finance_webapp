export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">This screen is part of the Employee portal build.</p>
      <div className="panel">
        <div className="panel-body">
          <div className="empty">🚧 Coming soon — being built in the current phase.</div>
        </div>
      </div>
    </>
  );
}
