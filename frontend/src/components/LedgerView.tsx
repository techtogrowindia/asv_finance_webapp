import { useState } from 'react';
import { LoanLedger } from '../api/loans';
import { installmentType } from '../lib/installmentType';

const inr = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

/** Loan ledger: header + due-vs-collected schedule. Downloaded as a real
 *  paginated PDF (react-pdf) — no cropping. Savings has its own ledger. */
export function LedgerView({ ledger }: { ledger: LoanLedger }) {
  const [busy, setBusy] = useState(false);

  async function downloadPdf() {
    setBusy(true);
    try {
      const m = await import('../lib/pdf/reportPdf');
      await m.downloadLoanLedgerPdf(ledger);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel ledger-print">
      <div className="panel-head no-print" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={downloadPdf}>
          {busy ? <span className="spinner" /> : 'Download PDF'}
        </button>
      </div>
      <div className="panel-body">
        <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>ASV FINANCE</h2>
        <p style={{ textAlign: 'center', margin: '0 0 20px', color: 'var(--ink-500)' }}>Loan Ledger</p>
        <div className="detail-grid" style={{ marginBottom: 20 }}>
          <Item k="Client ID" v={ledger.clientDisplayId} />
          <Item k="Client Name" v={ledger.clientName} />
          <Item k="Loan Account" v={ledger.loanAccount} />
          <Item k="Disbursal Date" v={date(ledger.disbursalDate)} />
          <Item k="Loan Amount" v={inr(ledger.loanAmount)} />
          <Item k="Interest Amount" v={inr(ledger.interestAmount)} />
          <Item k="Total Amount" v={inr(ledger.totalAmount)} />
          <Item k="Total Dues" v={String(ledger.totalDues)} />
          <Item k="Status" v={`${ledger.loanType}${ledger.closedDate ? ` (${date(ledger.closedDate)})` : ''}`} />
        </div>

        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Due No</th><th>Due Date</th><th>Coll Date</th><th>Status</th>
                <th>Due Pri</th><th>Due Int</th><th>Due Amt</th>
                <th>Coll Pri</th><th>Coll Int</th><th>Coll Amt</th><th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.schedule.map((s) => (
                <tr key={s.dueNo}>
                  <td>{s.dueNo}</td>
                  <td>{date(s.dueDate)}</td>
                  <td>{date(s.collDate)}</td>
                  <td>{installmentType(s)}</td>
                  <td>{inr(s.duePri)}</td>
                  <td>{inr(s.dueInt)}</td>
                  <td>{inr(s.dueAmt)}</td>
                  <td>{inr(s.collPri)}</td>
                  <td>{inr(s.collInt)}</td>
                  <td>{inr(s.collAmt)}</td>
                  <td>{inr(s.dueBalance)}</td>
                </tr>
              ))}
              {ledger.foreclosureSettlement && (
                <tr style={{ fontWeight: 700, background: 'var(--surface-100, #f4f6f5)' }}>
                  <td colSpan={2}>Foreclosure Settlement</td>
                  <td>{date(ledger.foreclosureSettlement.date)}</td>
                  <td>Foreclosed</td>
                  <td>{inr(ledger.foreclosureSettlement.principal)}</td>
                  <td>{inr(ledger.foreclosureSettlement.interest)}</td>
                  <td>{inr(ledger.foreclosureSettlement.principal + ledger.foreclosureSettlement.interest)}</td>
                  <td>{inr(ledger.foreclosureSettlement.principal)}</td>
                  <td>{inr(ledger.foreclosureSettlement.interest)}</td>
                  <td>{inr(ledger.foreclosureSettlement.total)}</td>
                  <td>{inr(0)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {ledger.foreclosureSettlement && (
          <p className="hint" style={{ marginTop: 8 }}>
            {ledger.foreclosureSettlement.installmentsSettled} remaining installment(s) were closed in one payment on{' '}
            {date(ledger.foreclosureSettlement.date)}
            {ledger.foreclosureSettlement.interestWaived > 0 ? ` (${inr(ledger.foreclosureSettlement.interestWaived)} interest waived)` : ''}
            {ledger.foreclosureSettlement.charge > 0 ? ` + ${inr(ledger.foreclosureSettlement.charge)} foreclosure charge` : ''} — not listed individually above.
          </p>
        )}
      </div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="detail-item">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
