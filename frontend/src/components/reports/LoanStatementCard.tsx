import { useState } from 'react';
import { LoanStatement } from '../../api/loans';
import { shareFileToWhatsApp } from '../../lib/shareFile';

const inr = (v: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

/** Combined per-loan ledger: repayment schedule (with a savings column) + the
 *  loan's savings passbook, downloadable/printable/WhatsApp-shareable as one
 *  PDF. Shared by the Loan+Savings report, the member view, and the
 *  "just closed" flow (Field/Demand Collection, Loan Advance, Foreclosure). */
export function LoanStatementCard({ st }: { st: LoanStatement }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const m = await import('../../lib/pdf/reportPdf');
      await m.downloadLoanStatementPdf(st);
    } finally {
      setPdfBusy(false);
    }
  }

  async function sharePdf() {
    setShareBusy(true);
    try {
      const m = await import('../../lib/pdf/reportPdf');
      const blob = await m.loanStatementPdfBlob(st);
      await shareFileToWhatsApp(blob, `loan-savings-statement-${st.loanAccount.replace(/\//g, '-')}.pdf`, {
        title: 'Loan + Savings Statement',
        text: `${st.clientName} — loan ${st.loanAccount} statement from ASV Finance.`,
        phone: st.clientMobile,
      });
    } finally {
      setShareBusy(false);
    }
  }

  const actions = (
    <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print</button>
      <button className="btn btn-ghost btn-sm" disabled={shareBusy} onClick={sharePdf}>
        {shareBusy ? <span className="spinner" /> : 'Share to WhatsApp'}
      </button>
      <button className="btn btn-primary btn-sm" disabled={pdfBusy} onClick={downloadPdf}>
        {pdfBusy ? <span className="spinner" /> : 'Download PDF'}
      </button>
    </div>
  );

  return (
    <div className="panel ledger-print">
      <div className="panel-head">{actions}</div>
      <div className="panel-body">
        <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>ASV FINANCE</h2>
        <p style={{ textAlign: 'center', margin: '0 0 18px', color: 'var(--ink-500)' }}>Loan + Savings Statement</p>
        <div className="detail-grid" style={{ marginBottom: 18 }}>
          <div className="detail-item"><div className="k">Client ID</div><div className="v">{st.clientDisplayId}</div></div>
          <div className="detail-item"><div className="k">Client Name</div><div className="v">{st.clientName}</div></div>
          <div className="detail-item"><div className="k">Loan Account</div><div className="v mono">{st.loanAccount}</div></div>
          <div className="detail-item"><div className="k">Savings A/c</div><div className="v mono">{st.savingsAccount}</div></div>
          <div className="detail-item"><div className="k">Loan Amount</div><div className="v">{inr(st.loanAmount)}</div></div>
          <div className="detail-item"><div className="k">Disbursal Date</div><div className="v">{date(st.disbursalDate)}</div></div>
          <div className="detail-item"><div className="k">Status</div><div className="v"><span className={`badge ${st.loanType === 'OPEN' ? 'active' : 'closed'}`}>{st.loanType}{st.closedDate ? ` (${date(st.closedDate)})` : ''}</span></div></div>
        </div>

        <div className="panel-head" style={{ padding: '0 0 8px', borderBottom: 'none' }}>Repayment Schedule</div>
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead><tr>
              <th>Due No</th><th>Due Date</th><th>Coll Date</th><th>Due Pri</th><th>Due Int</th>
              <th>Due Amt</th><th>Coll Pri</th><th>Coll Int</th><th>Coll Amt</th><th>Savings</th><th>Balance</th>
            </tr></thead>
            <tbody>
              {st.schedule.map((r) => (
                <tr key={r.dueNo}>
                  <td>{r.dueNo}</td><td>{date(r.dueDate)}</td><td>{date(r.collDate)}</td>
                  <td>{inr(r.duePri)}</td><td>{inr(r.dueInt)}</td><td>{inr(r.dueAmt)}</td>
                  <td>{inr(r.collPri)}</td><td>{inr(r.collInt)}</td><td>{inr(r.collAmt)}</td>
                  <td>{inr(r.savings)}</td><td>{inr(r.dueBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel-head" style={{ padding: '16px 0 8px', borderBottom: 'none' }}>Savings Passbook</div>
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead><tr><th>Date</th><th>Type</th><th>Deposit</th><th>Refund</th><th>Balance</th></tr></thead>
            <tbody>
              {st.savings.map((r, i) => (
                <tr key={i}>
                  <td>{date(r.date)}</td>
                  <td><span className={`badge ${r.kind === 'DEPOSIT' ? 'active' : 'pending'}`}>{r.kind}</span></td>
                  <td>{r.deposit ? inr(r.deposit) : '—'}</td><td>{r.refund ? inr(r.refund) : '—'}</td><td>{inr(r.balance)}</td>
                </tr>
              ))}
              {st.savings.length === 0 ? (
                <tr><td colSpan={5} className="empty">No savings activity.</td></tr>
              ) : (
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={2}>Total</td>
                  <td>{inr(st.savings.reduce((a, r) => a + r.deposit, 0))}</td>
                  <td>{inr(st.savings.reduce((a, r) => a + r.refund, 0))}</td>
                  <td>{inr(st.savings.length ? st.savings[st.savings.length - 1].balance : 0)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 18 }}>{actions}</div>
      </div>
    </div>
  );
}
