export const statuses = ['operational', 'degraded', 'offline', 'unknown'] as const;
export const kinds = ['maintenance', 'incident', 'backup', 'restore'] as const;
export const outcomes = ['completed', 'planned', 'failed'] as const;
// Mirror the server schemas in src/server/validation.ts, which checks the two stay equal.
export type ServerInput = {
  name: string;
  hostname: string;
  provider: string;
  region: string;
  game: string;
  status: (typeof statuses)[number];
  notes: string;
  backupIntervalHours: number;
};
export type ServerRecord = ServerInput & {
  id: string;
  version: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  lastBackupAt: string | null;
  lastRestoreAt: string | null;
};
export type EntryInput = {
  kind: (typeof kinds)[number];
  outcome: (typeof outcomes)[number];
  title: string;
  notes: string;
  occurredAt: string;
};
export type Entry = EntryInput & {
  id: string;
  serverId: string;
  serverName: string;
  createdAt: string;
};
export function backupState(
  server: Pick<ServerRecord, 'lastBackupAt' | 'backupIntervalHours'>,
  now = Date.now(),
) {
  if (!server.lastBackupAt) return 'missing';
  return now - Date.parse(server.lastBackupAt) > server.backupIntervalHours * 3_600_000
    ? 'overdue'
    : 'recorded';
}
