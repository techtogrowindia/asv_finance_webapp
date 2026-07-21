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

/** Parse an uploaded .xlsx/.xls/.csv file's first sheet into row objects keyed
 *  by header text (used for bulk-import flows, e.g. field collections). */
export async function readXlsxFile(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}
