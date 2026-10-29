export const labels: Record<string, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  offline: 'Offline',
  unknown: 'Unknown',
  recorded: 'Recorded',
  overdue: 'Overdue',
  missing: 'No record',
  completed: 'Completed',
  failed: 'Failed',
  planned: 'Planned',
  maintenance: 'Maintenance',
  incident: 'Incident',
  backup: 'Backup',
  restore: 'Restore drill',
};
export function date(value: string | null, short = false) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat(
    undefined,
    short ? { month: 'short', day: 'numeric' } : { dateStyle: 'medium', timeStyle: 'short' },
  ).format(new Date(value));
}
export function relative(value: string | null) {
  if (!value) return 'Not recorded';
  const hours = (Date.now() - Date.parse(value)) / 3_600_000;
  if (hours < 0) return date(value, true);
  if (hours < 1) return 'Within the last hour';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
