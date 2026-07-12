import { LoanLedger } from '../api/loans';

const inr = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

/** Printable loan ledger: header + full due-vs-collected schedule. Shared by
 *  the Reports > Loan Ledger picker and the direct per-loan ledger link. */
export function LedgerView({ ledger }: { ledger: LoanLedger }) {
  return (
    <div className="panel ledger-print">
      <div className="panel-head no-print" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print</button>
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
                <th>Due No</th><th>Due Date</th><th>Coll Date</th>
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
                  <td>{inr(s.duePri)}</td>
                  <td>{inr(s.dueInt)}</td>
                  <td>{inr(s.dueAmt)}</td>
                  <td>{inr(s.collPri)}</td>
                  <td>{inr(s.collInt)}</td>
                  <td>{inr(s.collAmt)}</td>
                  <td>{inr(s.dueBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
