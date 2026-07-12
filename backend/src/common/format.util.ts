/**
 * Branch/center codes are stored zero-padded (e.g. "005", "029") so they sort
 * and display consistently as codes. The composite Client ID (branch.center.
 * group.member) instead shows each part as a plain number, e.g. "5.29.1.2".
 */
export function stripLeadingZeros(code: string): string {
  const n = parseInt(code, 10);
  return Number.isNaN(n) ? code : String(n);
}
