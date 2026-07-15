import { SavingsLedgerReport } from '../components/reports/SavingsLedgerReport';

/** Savings module — browse a center's members and open any member's savings
 *  passbook (deposits, refunds, running balance). */
export function SavingsPage() {
  return (
    <>
      <h1 className="page-title">Savings</h1>
      <p className="page-sub">Pick a center, then a member, to view their savings passbook.</p>
      <SavingsLedgerReport />
    </>
  );
}
