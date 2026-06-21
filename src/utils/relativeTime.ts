// Compact "last updated" stamp for conversation/feed rows: today → time (3:30 PM), within a week →
// weekday (Mon), this year → "Jun 17", older → "Jun 17, 2025". Accepts ms epoch (0 → '').
export function relativeTime(ms: number): string {
  if (!ms) { return ''; }
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const diffDays = Math.floor((now.getTime() - ms) / 86_400_000);
  if (diffDays < 7) { return d.toLocaleDateString(undefined, { weekday: 'short' }); }
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear()
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}
