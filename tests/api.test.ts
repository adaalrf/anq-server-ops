import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { hashPassword, tokenHash } from '../src/server/auth.js';
import { migrate } from '../src/server/migrate.js';

if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    'Set TEST_DATABASE_URL to a disposable PostgreSQL database; tests create and remove an isolated schema.',
  );
const schema = `test_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
let app: Awaited<ReturnType<typeof createApp>>;
let cookie = '';
const origin = 'http://localhost:5173';
const input = {
  name: 'Test world',
  hostname: 'game.example.invalid',
  game: 'Minecraft',
  provider: 'Local',
  region: 'Oslo',
  status: 'unknown',
  notes: '',
  backupIntervalHours: 24,
};
let serverId: string;
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await migrate(pool); // Repeatability is part of the contract.
  const hash = await hashPassword('correct-test-password');
  app = await createApp(
    pool,
    loadConfig({
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      APP_ORIGIN: origin,
      OWNER_PASSWORD_HASH: hash,
    }),
  );
});
after(async () => {
  if (app) await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});
const headers = () => ({ cookie, origin });
test('private inventory requires authentication; health still checks the schema', async () => {
  assert.equal((await app.inject('/api/servers')).statusCode, 401);
  assert.equal((await app.inject('/api/entries/page')).statusCode, 401);
  assert.equal((await app.inject('/healthz')).statusCode, 200);
  assert.equal((await app.inject('/api/session')).json().authenticated, false);
});
test('mutations reject a missing or foreign Origin, including login', async () => {
  for (const value of [undefined, 'https://attacker.invalid']) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/login',
      headers: value ? { origin: value } : {},
      payload: { username: 'owner', password: 'correct-test-password' },
    });
    assert.equal(response.statusCode, 403);
  }
});
test('login rejects incorrect credentials and stores only a hash of the session', async () => {
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/login',
        headers: { origin },
        payload: { username: 'owner', password: 'incorrect-password' },
      })
    ).statusCode,
    401,
  );
  const response = await app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { origin },
    payload: { username: 'owner', password: 'correct-test-password' },
  });
  assert.equal(response.statusCode, 200);
  const setCookie = String(response.headers['set-cookie']);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  cookie = setCookie.split(';')[0];
  const token = cookie.split('=')[1];
  const stored = (await pool.query('SELECT token_hash FROM sessions')).rows[0].token_hash;
  assert.equal(stored, tokenHash(token));
  assert.notEqual(stored, token);
});
test('input validation rejects blank names, unknown fields and invalid UUIDs', async () => {
  for (const payload of [
    { ...input, name: '   ' },
    { ...input, backupIntervalHours: 0 },
    { ...input, status: 'healthy' },
    { ...input, command: 'id' },
  ]) {
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/servers', headers: headers(), payload }))
        .statusCode,
      400,
    );
  }
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: '/api/servers/not-an-id',
        headers: headers(),
        payload: { ...input, version: 1, archived: false },
      })
    ).statusCode,
    400,
  );
});
test('creates and persists inventory with inert text and a version counter', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/servers',
    headers: headers(),
    payload: { ...input, notes: "<script>alert(1)</script>'; DROP TABLE servers; --" },
  });
  assert.equal(response.statusCode, 201);
  const server = response.json();
  serverId = server.id;
  assert.equal(server.version, 1);
  assert.equal(server.lastBackupAt, null);
  assert.equal(
    (await app.inject({ url: '/api/servers', headers: headers() })).json()[0].notes,
    "<script>alert(1)</script>'; DROP TABLE servers; --",
  );
});
test('optimistic updates reject an old version rather than overwrite newer work', async () => {
  const payload = { ...input, version: 1, archived: false, status: 'operational' };
  const first = await app.inject({
    method: 'PUT',
    url: `/api/servers/${serverId}`,
    headers: headers(),
    payload,
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().version, 2);
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: `/api/servers/${serverId}`,
        headers: headers(),
        payload,
      })
    ).statusCode,
    409,
  );
});
test('backup freshness uses completed events only; restore drills remain separate', async () => {
  const post = (kind: string, outcome: string, occurredAt: string) =>
    app.inject({
      method: 'POST',
      url: `/api/servers/${serverId}/entries`,
      headers: headers(),
      payload: {
        kind,
        outcome,
        occurredAt,
        title: `${kind} ${outcome}`,
        notes: 'Recovery evidence',
      },
    });
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal((await post('backup', 'completed', yesterday)).statusCode, 201);
  assert.equal((await post('backup', 'failed', new Date().toISOString())).statusCode, 201);
  assert.equal(
    (await post('backup', 'planned', new Date(Date.now() + 86_400_000).toISOString())).statusCode,
    201,
  );
  let server = (await app.inject({ url: '/api/servers', headers: headers() })).json()[0];
  assert.equal(server.lastBackupAt, yesterday);
  assert.equal(server.lastRestoreAt, null);
  assert.equal((await post('restore', 'completed', new Date().toISOString())).statusCode, 201);
  server = (await app.inject({ url: '/api/servers', headers: headers() })).json()[0];
  assert.ok(server.lastRestoreAt);
  assert.equal(
    (await post('backup', 'completed', new Date(Date.now() + 86_400_000).toISOString())).statusCode,
    400,
  );
});
test('archive preserves history and prevents new journal writes until restored', async () => {
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: `/api/servers/${serverId}`,
        headers: headers(),
        payload: { ...input, version: 2, archived: true },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: `/api/servers/${serverId}/entries`,
        headers: headers(),
        payload: {
          kind: 'maintenance',
          outcome: 'completed',
          title: 'Should fail',
          notes: '',
          occurredAt: new Date().toISOString(),
        },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await app.inject({ url: `/api/entries?serverId=${serverId}`, headers: headers() })).json()
      .length,
    4,
  );
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: `/api/servers/${serverId}`,
        headers: headers(),
        payload: { ...input, version: 3, archived: false },
      })
    ).statusCode,
    200,
  );
});
test('export contains inventory and complete journal, but no authentication data', async () => {
  const response = await app.inject({ url: '/api/export', headers: headers() });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers['content-disposition']), /attachment/);
  const data = response.json();
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.servers.length, 1);
  assert.equal(data.entries.length, 4);
  assert.equal(data.sessions, undefined);
  assert.equal(response.headers['cache-control'], 'no-store');
});
test('public demo can read and export but cannot log in or modify records', async () => {
  const demo = await createApp(
    pool,
    loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, DEMO_MODE: 'true' }),
  );
  try {
    assert.equal((await demo.inject('/api/servers')).statusCode, 200);
    assert.equal((await demo.inject('/api/export')).statusCode, 200);
    for (const path of [
      '/api/servers',
      '/api/login',
      '/api/logout',
      `/api/servers/${serverId}/entries`,
    ]) {
      assert.equal(
        (await demo.inject({ method: 'POST', url: path, headers: { origin }, payload: input }))
          .statusCode,
        403,
      );
    }
    assert.equal(
      (
        await demo.inject({
          method: 'PUT',
          url: `/api/servers/${serverId}`,
          headers: { origin },
          payload: { ...input, version: 4, archived: true },
        })
      ).statusCode,
      403,
    );
  } finally {
    await demo.close();
  }
});
test('session expiry and logout revoke access', async () => {
  await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
  assert.equal((await app.inject({ url: '/api/servers', headers: headers() })).statusCode, 401);
  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { origin },
    payload: { username: 'owner', password: 'correct-test-password' },
  });
  cookie = String(login.headers['set-cookie']).split(';')[0];
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/logout', headers: headers(), payload: {} }))
      .statusCode,
    200,
  );
  assert.equal((await app.inject({ url: '/api/servers', headers: headers() })).statusCode, 401);
});

test('signed-out session does not disclose the configured username', async () => {
  const session = (await app.inject('/api/session')).json();
  assert.equal(session.authenticated, false);
  assert.equal(Object.hasOwn(session, 'username'), false);
  const demo = await createApp(
    pool,
    loadConfig({ DATABASE_URL: 'test', DEMO_MODE: 'true', OWNER_USERNAME: 'private-owner' }),
  );
  try {
    assert.equal(Object.hasOwn((await demo.inject('/api/session')).json(), 'username'), false);
  } finally {
    await demo.close();
  }
});
