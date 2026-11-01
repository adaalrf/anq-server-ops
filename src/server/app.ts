import { demoDateShiftDays, projectDemoDates, shiftDemoDate } from './demo-dates.js';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type pg from 'pg';
import { z } from 'zod';
import type { Config } from './config.js';
import { newToken, tokenHash, verifyPassword } from './auth.js';
import { entryInput, serverInput, serverUpdate } from '../shared/model.js';
import { searchJournal } from './journal.js';

const serverSelect = `SELECT s.id, s.name, s.hostname, s.provider, s.region, s.game, s.status,
 s.notes, s.backup_interval_hours AS "backupIntervalHours", s.archived, s.version,
 s.created_at AS "createdAt", s.updated_at AS "updatedAt",
 (SELECT max(occurred_at) FROM entries WHERE server_id=s.id AND kind='backup' AND outcome='completed' AND occurred_at <= now()) AS "lastBackupAt",
 (SELECT max(occurred_at) FROM entries WHERE server_id=s.id AND kind='restore' AND outcome='completed' AND occurred_at <= now()) AS "lastRestoreAt"
 FROM servers s`;
const entrySelect = `SELECT e.id, e.server_id AS "serverId", s.name AS "serverName", e.kind, e.outcome,
 e.title, e.notes, e.occurred_at AS "occurredAt", e.created_at AS "createdAt"
 FROM entries e JOIN servers s ON s.id=e.server_id`;
const idSchema = z.object({ id: z.uuid() });
function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}

export async function createApp(
  pool: pg.Pool,
  config: Config,
  options: { logger?: boolean; staticRoot?: string } = {},
) {
  const app = Fastify({
    trustProxy: config.trustProxy,
    logger: options.logger ?? false,
    bodyLimit: 32_768,
    requestTimeout: 15_000,
    loggerInstance: undefined,
  });
  // Only the explicitly configured read-only demo projects dates. Owner data is unchanged.
  app.addHook('preSerialization', async (request, _reply, payload) =>
    config.demo && request.url.startsWith('/api/')
      ? projectDemoDates(payload, demoDateShiftDays(config.demoDateAnchor))
      : payload,
  );
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        message: error.issues.map((i) => `${i.path.join('.') || 'Input'}: ${i.message}`).join('; '),
      });
    const err = error as Error & { statusCode?: number };
    const status =
      err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) request.log.error(error);
    return reply.code(status).send({
      message:
        status === 500 ? 'The request could not be completed. Please try again.' : err.message,
    });
  });
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });
  async function authenticated(request: { cookies: Record<string, string | undefined> }) {
    const token = request.cookies['ops_session'];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
    const result = await pool.query(
      'SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at > now()',
      [tokenHash(token)],
    );
    return result.rowCount === 1;
  }
  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/api/')) return;
    const path = request.url.split('?')[0];
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (mutation) {
      if (config.demo)
        fail(403, 'The public demo is read-only. Run your own instance to make changes.');
      if (request.headers.origin !== config.origin) fail(403, 'Request origin is not allowed.');
    }
    if (['/api/login', '/api/session'].includes(path)) return;
    if (!config.demo && !(await authenticated(request))) fail(401, 'Sign in to continue.');
  });
  app.get('/healthz', async (_, reply) => {
    try {
      await pool.query('SELECT id FROM servers LIMIT 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/api/session', async (request) => ({
    demo: config.demo,
    relativeDates: Boolean(config.demoDateAnchor),
    authenticated: !config.demo && (await authenticated(request)),
    username: config.username,
  }));
  app.post(
    '/api/login',
    { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = z
        .object({ username: z.string().max(80), password: z.string().max(256) })
        .strict()
        .parse(request.body);
      const valid = await verifyPassword(input.password, config.passwordHash);
      if (input.username !== config.username || !valid)
        fail(401, 'Incorrect username or password.');
      const token = newToken();
      await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
      await pool.query(
        "INSERT INTO sessions(token_hash,expires_at) VALUES ($1, now() + interval '12 hours')",
        [tokenHash(token)],
      );
      reply.setCookie('ops_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.secureCookie,
        path: '/',
        maxAge: 43_200,
      });
      return { authenticated: true };
    },
  );
  app.post('/api/logout', async (request, reply) => {
    if (request.cookies.ops_session)
      await pool.query('DELETE FROM sessions WHERE token_hash=$1', [
        tokenHash(request.cookies.ops_session),
      ]);
    reply.clearCookie('ops_session', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: config.secureCookie,
    });
    return { authenticated: false };
  });
  app.get(
    '/api/servers',
    async () => (await pool.query(`${serverSelect} ORDER BY s.archived, lower(s.name), s.id`)).rows,
  );
  app.post('/api/servers', async (request, reply) => {
    const input = serverInput.parse(request.body);
    const id = randomUUID();
    await pool.query(
      `INSERT INTO servers(id,name,hostname,provider,region,game,status,notes,backup_interval_hours)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        input.name,
        input.hostname,
        input.provider,
        input.region,
        input.game,
        input.status,
        input.notes,
        input.backupIntervalHours,
      ],
    );
    return reply.code(201).send((await pool.query(`${serverSelect} WHERE s.id=$1`, [id])).rows[0]);
  });
  app.put('/api/servers/:id', async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = serverUpdate.parse(request.body);
    const result = await pool.query(
      `UPDATE servers SET name=$2,hostname=$3,provider=$4,region=$5,game=$6,status=$7,notes=$8,
      backup_interval_hours=$9,archived=$10,version=version+1,updated_at=now() WHERE id=$1 AND version=$11 RETURNING id`,
      [
        id,
        input.name,
        input.hostname,
        input.provider,
        input.region,
        input.game,
        input.status,
        input.notes,
        input.backupIntervalHours,
        input.archived,
        input.version,
      ],
    );
    if (!result.rowCount) {
      if (!(await pool.query('SELECT id FROM servers WHERE id=$1', [id])).rowCount)
        fail(404, 'Server not found.');
      fail(409, 'This server changed in another session. Reload before saving.');
    }
    return (await pool.query(`${serverSelect} WHERE s.id=$1`, [id])).rows[0];
  });
  app.get('/api/entries', async (request) => {
    const query = z
      .object({
        serverId: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .strict()
      .parse(request.query);
    return (
      await pool.query(
        `${entrySelect} ${query.serverId ? 'WHERE e.server_id=$1' : ''} ORDER BY e.occurred_at DESC,e.created_at DESC LIMIT $${query.serverId ? 2 : 1}`,
        query.serverId ? [query.serverId, query.limit] : [query.limit],
      )
    ).rows;
  });
  app.get('/api/entries/page', async (request) => {
    const query = { ...(request.query as Record<string, unknown>) };
    const days = config.demo ? demoDateShiftDays(config.demoDateAnchor) : 0;
    // Search bounds are displayed dates; cursors deliberately remain database keys.
    if (days)
      for (const key of ['from', 'to']) {
        if (
          typeof query[key] === 'string' &&
          z.iso.datetime({ offset: true }).safeParse(query[key]).success
        )
          query[key] = shiftDemoDate(query[key], -days);
      }
    return searchJournal(pool, query);
  });
  app.post('/api/servers/:id/entries', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const input = entryInput.parse(request.body);
    if (input.outcome !== 'planned' && Date.parse(input.occurredAt) > Date.now() + 60_000)
      fail(400, 'Completed or failed work cannot be dated in the future.');
    const entryId = randomUUID();
    // Row lock keeps archive changes and journal writes in a consistent order.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const server = (
        await client.query('SELECT archived FROM servers WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!server) fail(404, 'Server not found.');
      if (server.archived) fail(409, 'Restore this server before adding journal entries.');
      await client.query(
        `INSERT INTO entries(id,server_id,kind,outcome,title,notes,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [entryId, id, input.kind, input.outcome, input.title, input.notes, input.occurredAt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return reply
      .code(201)
      .send((await pool.query(`${entrySelect} WHERE e.id=$1`, [entryId])).rows[0]);
  });
  app.get('/api/export', async (_, reply) => {
    // A repeatable-read snapshot makes inventory and journal export consistent.
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const servers = (await client.query(`${serverSelect} ORDER BY s.id`)).rows;
      const entries = (await client.query(`${entrySelect} ORDER BY e.occurred_at DESC,e.id`)).rows;
      await client.query('COMMIT');
      reply.header('Content-Disposition', 'attachment; filename="server-ops-export.json"');
      return { schemaVersion: 1, exportedAt: new Date().toISOString(), servers, entries };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
  const root = options.staticRoot ?? resolve('dist/client');
  if (existsSync(root)) await app.register(staticFiles, { root, index: ['index.html'] });
  return app;
}
