/** Quick date-range presets shared by every admin report. */
export type Preset = 'today' | 'yesterday' | 'month' | 'year' | 'prevYear' | 'custom';

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
  { id: 'prevYear', label: 'Previous Year' },
  { id: 'custom', label: 'Custom' },
];

/** Local (not UTC) yyyy-mm-dd, so presets line up with the user's calendar. */
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Resolve a preset to a concrete [from, to] range (inclusive). */
export function presetRange(preset: Preset, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'yesterday': {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return { from: iso(d), to: iso(d) };
    }
    case 'month':
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case 'year':
      return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
    case 'prevYear':
      return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) };
    case 'today':
    case 'custom':
    default:
      return { from: iso(now), to: iso(now) };
  }
}
