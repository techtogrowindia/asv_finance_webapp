/**
 * Client-side .xlsx export for report tables — no backend round-trip needed.
 * SheetJS is heavy (~300 kB), so it's loaded on demand only when the user
 * actually exports, keeping it out of the main bundle.
 */
export async function downloadXlsx(filename: string, rows: Record<string, unknown>[], sheetName = 'Report') {
  if (rows.length === 0) return;
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
