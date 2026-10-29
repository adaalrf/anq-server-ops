import type pg from 'pg';
import { z } from 'zod';
import { kinds, outcomes } from '../shared/model.js';

const cursorSchema = z
  .object({
    occurredAt: z.iso.datetime({ offset: true }),
    createdAt: z.iso.datetime({ offset: true }),
    id: z.uuid(),
  })
  .strict();
const querySchema = z
  .object({
    serverId: z.uuid().optional(),
    kind: z.enum(kinds).optional(),
    outcome: z.enum(outcomes).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    q: z.string().trim().max(200).optional(),
    scope: z.enum(['all', 'backups']).default('all'),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().max(1500).optional(),
  })
  .strict();
export async function searchJournal(pool: pg.Pool, raw: unknown) {
  const query = querySchema.parse(raw);
  const invalid = (message: string): never => {
    throw Object.assign(new Error(message), { statusCode: 400 });
  };
  if (query.from && query.to && Date.parse(query.from) >= Date.parse(query.to))
    invalid('The end date must be after the start date.');
  if (query.scope === 'backups' && query.kind && !['backup', 'restore'].includes(query.kind))
    invalid('Backup records contain only backups and restore drills.');
  const values: unknown[] = [];
  const conditions: string[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (query.serverId) conditions.push(`e.server_id=${bind(query.serverId)}`);
  if (query.kind) conditions.push(`e.kind=${bind(query.kind)}`);
  if (query.outcome) conditions.push(`e.outcome=${bind(query.outcome)}`);
  if (query.scope === 'backups') conditions.push("e.kind IN ('backup','restore')");
  if (query.from) conditions.push(`e.occurred_at>=${bind(query.from)}::timestamptz`);
  if (query.to) conditions.push(`e.occurred_at<${bind(query.to)}::timestamptz`);
  if (query.q)
    conditions.push(
      `strpos(lower(concat_ws(' ',e.title,e.notes,s.name)),lower(${bind(query.q)}))>0`,
    );
  const join = 'FROM entries e JOIN servers s ON s.id=e.server_id';
  const where = () => (conditions.length ? `WHERE ${conditions.join(' AND ')}` : '');
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const total = Number(
      (await client.query(`SELECT count(*) ${join} ${where()}`, values)).rows[0].count,
    );
    if (query.cursor) {
      let cursor: z.infer<typeof cursorSchema>;
      try {
        cursor = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString()));
      } catch {
        return invalid('Invalid journal cursor. Return to the first page.');
      }
      conditions.push(
        `(e.occurred_at,e.created_at,e.id)<(${bind(cursor.occurredAt)}::timestamptz,${bind(cursor.createdAt)}::timestamptz,${bind(cursor.id)}::uuid)`,
      );
    }
    const rows = (
      await client.query(
        `SELECT e.id,e.server_id AS "serverId",s.name AS "serverName",e.kind,e.outcome,e.title,e.notes,
      e.occurred_at AS "occurredAt",e.created_at AS "createdAt",
      json_build_object('occurredAt',e.occurred_at,'createdAt',e.created_at,'id',e.id) AS "pageKey"
      ${join} ${where()} ORDER BY e.occurred_at DESC,e.created_at DESC,e.id DESC LIMIT ${bind(query.limit + 1)}`,
        values,
      )
    ).rows;
    await client.query('COMMIT');
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify(page.at(-1)!.pageKey)).toString('base64url')
      : null;
    return { items: page.map(({ pageKey: _, ...entry }) => entry), total, nextCursor };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
