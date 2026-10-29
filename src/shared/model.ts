import { z } from 'zod';

export const statuses = ['operational', 'degraded', 'offline', 'unknown'] as const;
export const kinds = ['maintenance', 'incident', 'backup', 'restore'] as const;
export const outcomes = ['completed', 'planned', 'failed'] as const;
const text = (max: number) => z.string().trim().max(max);
export const serverInput = z
  .object({
    name: text(80).min(1),
    hostname: text(253),
    provider: text(80),
    region: text(80),
    game: text(80),
    status: z.enum(statuses),
    notes: text(4000),
    backupIntervalHours: z.number().int().min(1).max(8760),
  })
  .strict();
export const serverUpdate = serverInput.extend({
  version: z.number().int().min(1),
  archived: z.boolean(),
});
export const entryInput = z
  .object({
    kind: z.enum(kinds),
    outcome: z.enum(outcomes),
    title: text(160).min(1),
    notes: text(8000),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type ServerInput = z.infer<typeof serverInput>;
export type ServerRecord = ServerInput & {
  id: string;
  version: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  lastBackupAt: string | null;
  lastRestoreAt: string | null;
};
export type EntryInput = z.infer<typeof entryInput>;
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
