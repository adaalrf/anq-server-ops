import { z } from 'zod';
import { kinds, outcomes, statuses, type EntryInput, type ServerInput } from '../shared/model.js';

// Request schemas stay on the server; the client only shares the plain types they produce.
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

// Fails to compile if a schema and its shared type drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const serverMatches: Same<z.infer<typeof serverInput>, ServerInput> = true;
const entryMatches: Same<z.infer<typeof entryInput>, EntryInput> = true;
void serverMatches;
void entryMatches;
