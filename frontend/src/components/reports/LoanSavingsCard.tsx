import { useState } from 'react';
import { LoanSavingsLedger } from '../../api/loans';

const inr = (v: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

/** Per-loan savings ledger card (one savings account per loan) + Download PDF. */
export function LoanSavingsCard({ ledger }: { ledger: LoanSavingsLedger }) {
  const [pdfBusy, setPdfBusy] = useState(false);

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const m = await import('../../lib/pdf/reportPdf');
      await m.downloadLoanSavingsPdf(ledger);
    } finally {
      setPdfBusy(false);
    }
  }

  const collected = ledger.rows.reduce((a, r) => a + r.deposit, 0);
  const returned = ledger.rows.reduce((a, r) => a + r.refund, 0);

  return (
    <div className="panel ledger-print">
      <div className="panel-head no-print" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-sm" disabled={pdfBusy} onClick={downloadPdf}>
          {pdfBusy ? <span className="spinner" /> : 'Download PDF'}
        </button>
      </div>
      <div className="panel-body">
        <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>ASV FINANCE</h2>
        <p style={{ textAlign: 'center', margin: '0 0 18px', color: 'var(--ink-500)' }}>Savings Ledger</p>
        <div className="detail-grid" style={{ marginBottom: 18 }}>
          <div className="detail-item"><div className="k">Client ID</div><div className="v">{ledger.displayId}</div></div>
          <div className="detail-item"><div className="k">Client Name</div><div className="v">{ledger.clientName}</div></div>
          <div className="detail-item"><div className="k">Savings A/c</div><div className="v mono">{ledger.savingsAccount}</div></div>
          <div className="detail-item"><div className="k">Total Collected</div><div className="v">{inr(collected)}</div></div>
          <div className="detail-item"><div className="k">Total Returned</div><div className="v">{inr(returned)}</div></div>
          <div className="detail-item"><div className="k">Balance</div><div className="v" style={{ fontWeight: 700 }}>{inr(ledger.balance)}</div></div>
        </div>
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead><tr><th>Date</th><th>Type</th><th>Deposit</th><th>Refund</th><th>Balance</th></tr></thead>
            <tbody>
              {ledger.rows.map((r, i) => (
                <tr key={i}>
                  <td>{date(r.date)}</td>
                  <td><span className={`badge ${r.kind === 'DEPOSIT' ? 'active' : 'pending'}`}>{r.kind}</span></td>
                  <td>{r.deposit ? inr(r.deposit) : '—'}</td>
                  <td>{r.refund ? inr(r.refund) : '—'}</td>
                  <td>{inr(r.balance)}</td>
                </tr>
              ))}
              {ledger.rows.length === 0 ? (
                <tr><td colSpan={5} className="empty">No savings activity for this loan yet.</td></tr>
              ) : (
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={2}>Total</td>
                  <td>{inr(collected)}</td>
                  <td>{inr(returned)}</td>
                  <td>{inr(ledger.balance)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
