/**
 * Classify a repayment-schedule row for the "Type" column shown in loan reports:
 *  - Missed          → nothing collected and the due date is already past
 *  - Advance paid    → fully paid before the due date (paid ahead)
 *  - Current due paid→ fully paid on the due date
 *  - Arrear paid     → fully paid after the due date (a late / overdue payment)
 *  - Partly paid     → some collected but less than due
 *  - —               → not collected yet and not overdue
 */
const dayValue = (d: Date) => Math.floor(new Date(d).setHours(0, 0, 0, 0) / 86_400_000);

export function installmentType(r: {
  dueDate: string;
  collDate: string | null;
  dueAmt: string | number;
  collAmt: string | number;
}): string {
  const due = Number(r.dueAmt);
  const coll = Number(r.collAmt);
  const dueDay = dayValue(new Date(r.dueDate));
  const today = dayValue(new Date());

  if (coll <= 0) return dueDay < today ? 'Missed' : '—';
  if (coll + 0.005 < due) return 'Partly paid';
  if (!r.collDate) return 'Paid';

  const collDay = dayValue(new Date(r.collDate));
  if (collDay < dueDay) return 'Advance paid';
  if (collDay > dueDay) return 'Arrear paid';
  return 'Current due paid';
}
