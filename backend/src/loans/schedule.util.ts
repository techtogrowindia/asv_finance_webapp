export interface ScheduleRow {
  dueNo: number;
  dueDate: Date;
  duePri: number;
  dueInt: number;
  dueAmt: number;
  dueBalance: number;
}

/**
 * Flat-interest schedule, even split (confirmed with the client): every
 * installment carries the same principal share (loanAmount/totalDues) and the
 * same interest share (interestAmount/totalDues). The last installment absorbs
 * any rounding remainder so the schedule sums exactly to the total.
 */
export function generateSchedule(params: {
  loanAmount: number;
  interestAmount: number;
  totalDues: number;
  daysBetween: number;
  dueStartDate: Date;
}): ScheduleRow[] {
  const { loanAmount, interestAmount, totalDues, daysBetween, dueStartDate } = params;
  const pri = round2(loanAmount / totalDues);
  const int = round2(interestAmount / totalDues);

  const rows: ScheduleRow[] = [];
  let balance = round2(loanAmount + interestAmount);

  for (let dueNo = 1; dueNo <= totalDues; dueNo++) {
    const isLast = dueNo === totalDues;
    const duePri = isLast ? round2(loanAmount - pri * (totalDues - 1)) : pri;
    const dueInt = isLast ? round2(interestAmount - int * (totalDues - 1)) : int;
    const dueAmt = round2(duePri + dueInt);
    balance = round2(balance - dueAmt);

    const dueDate = new Date(dueStartDate);
    dueDate.setDate(dueDate.getDate() + daysBetween * (dueNo - 1));

    rows.push({ dueNo, dueDate, duePri, dueInt, dueAmt, dueBalance: Math.max(0, balance) });
  }
  return rows;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
