import { useEffect, useState } from 'react';

const PAGE_SIZES = [25, 50, 100, 500];

export interface PageState {
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  total: number;
  totalPages: number;
  start: number;
}

/**
 * Client-side pagination for a fetched list — caps how much of a long table is
 * rendered at once (page height / scrolling) and offers a Show-N page size.
 * (For very large datasets the endpoints can move to server-side paging later;
 * this keeps the UI responsive today.)
 */
export function usePagination<T>(rows: T[] | null, initial = 25): PageState & { pageRows: T[] | null } {
  const [pageSize, setPageSize] = useState(initial);
  const [page, setPage] = useState(1);
  const total = rows?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Snap back to page 1 whenever the data set or page size changes.
  useEffect(() => { setPage(1); }, [rows, pageSize]);

  const clamped = Math.min(page, totalPages);
  const start = (clamped - 1) * pageSize;
  const pageRows = rows ? rows.slice(start, start + pageSize) : null;
  return { page: clamped, setPage, pageSize, setPageSize, total, totalPages, start, pageRows };
}

export function Pager({ p }: { p: PageState }) {
  if (p.total === 0) return null;
  const from = p.start + 1;
  const to = Math.min(p.start + p.pageSize, p.total);
  return (
    <div className="pager no-print">
      <label className="pager-size">
        Show
        <select className="select" value={p.pageSize} onChange={(e) => p.setPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        per page
      </label>
      <div className="pager-nav">
        <span className="pager-info">{from}–{to} of {p.total}</span>
        <button className="btn btn-ghost btn-sm" disabled={p.page <= 1} onClick={() => p.setPage(p.page - 1)}>Prev</button>
        <button className="btn btn-ghost btn-sm" disabled={p.page >= p.totalPages} onClick={() => p.setPage(p.page + 1)}>Next</button>
      </div>
    </div>
  );
}
