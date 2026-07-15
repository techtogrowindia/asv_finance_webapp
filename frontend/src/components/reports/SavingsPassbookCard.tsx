import { useState } from 'react';
import { SavingsPassbook } from '../../api/members';

const inr = (v: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

/** The printable savings passbook card (header + deposit/refund table with a
 *  running balance + Download PDF). Shared by the Savings Ledger report, the
 *  standalone passbook page and the member view. */
export function SavingsPassbookCard({ passbook }: { passbook: SavingsPassbook }) {
  const [pdfBusy, setPdfBusy] = useState(false);

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const m = await import('../../lib/pdf/reportPdf');
      await m.downloadSavingsPassbookPdf(passbook);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="panel ledger-print">
      <div className="panel-head no-print" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-sm" disabled={pdfBusy} onClick={downloadPdf}>
          {pdfBusy ? <span className="spinner" /> : 'Download PDF'}
        </button>
      </div>
      <div className="panel-body">
        <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>ASV FINANCE</h2>
        <p style={{ textAlign: 'center', margin: '0 0 18px', color: 'var(--ink-500)' }}>Savings Passbook</p>
        <div className="detail-grid" style={{ marginBottom: 18 }}>
          <div className="detail-item"><div className="k">Client ID</div><div className="v">{passbook.displayId}</div></div>
          <div className="detail-item"><div className="k">Client Name</div><div className="v">{passbook.clientName}</div></div>
          <div className="detail-item"><div className="k">Savings A/c</div><div className="v">{passbook.savingsAccount ?? '—'}</div></div>
          <div className="detail-item"><div className="k">Balance</div><div className="v" style={{ fontWeight: 700 }}>{inr(passbook.savingsBalance)}</div></div>
        </div>
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead><tr><th>Date</th><th>Loan A/c</th><th>Type</th><th>Deposit</th><th>Refund</th><th>Balance</th></tr></thead>
            <tbody>
              {passbook.rows.map((r, i) => (
                <tr key={i}>
                  <td>{date(r.date)}</td>
                  <td className="mono">{r.loanAccount ?? '—'}</td>
                  <td><span className={`badge ${r.kind === 'DEPOSIT' ? 'active' : 'pending'}`}>{r.kind}</span></td>
                  <td>{r.deposit ? inr(r.deposit) : '—'}</td>
                  <td>{r.refund ? inr(r.refund) : '—'}</td>
                  <td>{inr(r.balance)}</td>
                </tr>
              ))}
              {passbook.rows.length === 0 && <tr><td colSpan={6} className="empty">No savings activity for this member.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
