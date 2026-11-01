// A dated, read-only sample can stay useful without rewriting its database.
// The anchor is the UTC day on which the fictional scenario was prepared.
export function demoDateShiftDays(anchor: string, now = new Date()) {
  return anchor
    ? Math.round((Date.parse(now.toISOString().slice(0, 10)) - Date.parse(anchor)) / 86_400_000)
    : 0;
}
export function shiftDemoDate(value: string | Date, days: number) {
  const date = value instanceof Date ? value.toISOString() : value;
  const shifted = new Date(Date.parse(date) + days * 86_400_000).toISOString();
  return date.length === 10 ? shifted.slice(0, 10) : shifted;
}
const dateFields = new Set([
  'createdAt',
  'updatedAt',
  'appliedOn',
  'followUpOn',
  'occurredAt',
  'lastBackupAt',
  'lastRestoreAt',
]);
export function projectDemoDates(payload: unknown, days: number): unknown {
  if (!days || !payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map((value) => projectDemoDates(value, days));
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      dateFields.has(key) && (typeof value === 'string' || value instanceof Date)
        ? shiftDemoDate(value, days)
        : projectDemoDates(value, days),
    ]),
  );
}
