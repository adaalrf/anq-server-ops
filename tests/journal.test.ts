import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { migrate } from '../src/server/migrate.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const schema = `journal_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const first = randomUUID(),
  second = randomUUID();
let app: Awaited<ReturnType<typeof createApp>>;
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  for (const id of [first, second])
    await pool.query(
      "INSERT INTO servers(id,name,hostname,provider,region,game,status,notes,backup_interval_hours) VALUES ($1,$2,'','','','','unknown','',24)",
      [id, id === first ? 'First' : 'Second'],
    );
  await pool.query(
    `INSERT INTO entries(id,server_id,kind,outcome,title,notes,occurred_at,created_at)
    SELECT gen_random_uuid(),$1,'maintenance','completed','Routine '||n,'','2026-10-01T12:00:00.123456Z','2026-10-02T12:00:00.654321Z' FROM generate_series(1,513) n`,
    [first],
  );
  await pool.query(
    "INSERT INTO entries(id,server_id,kind,outcome,title,notes,occurred_at) VALUES ($1,$2,'backup','failed','needle_% backup','proof','2026-10-03T00:00:00Z'),($3,$2,'backup','completed','Backup completed','','2026-10-04T00:00:00Z'),($4,$5,'restore','completed','Restore completed','','2026-10-03T12:00:00Z')",
    [randomUUID(), first, randomUUID(), randomUUID(), second],
  );
  app = await createApp(pool, loadConfig({ DATABASE_URL: 'test', DEMO_MODE: 'true' }));
});
after(async () => {
  if (app) await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});
test('keyset pages recover every record beyond 500 with exact PostgreSQL timestamp ties', async () => {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const response: {
      statusCode: number;
      json(): { total: number; items: { id: string }[]; nextCursor: string | null };
    } = await app.inject(`/api/entries/page?limit=100${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(response.statusCode, 200);
    const page: { total: number; items: { id: string }[]; nextCursor: string | null } =
      response.json();
    assert.equal(page.total, 516);
    ids.push(...page.items.map((e: { id: string }) => e.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 516);
  assert.equal(new Set(ids).size, 516);
});
test('server, event kind, outcome, literal search and half-open dates combine before paging', async () => {
  const result = await app.inject(
    `/api/entries/page?serverId=${first}&kind=backup&outcome=failed&q=needle_%25&from=2026-10-03T00:00:00Z&to=2026-10-04T00:00:00Z`,
  );
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().total, 1);
  assert.equal(result.json().items[0].title, 'needle_% backup');
  assert.equal((await app.inject('/api/entries/page?scope=backups')).json().total, 3);
  assert.equal((await app.inject(`/api/entries/page?serverId=${second}`)).json().total, 1);
});
test('invalid filters, cursor data and reversed dates return 400', async () => {
  for (const query of [
    'cursor=broken',
    'limit=101',
    'kind=command',
    'outcome=unknown',
    'serverId=wrong',
    'scope=backups&kind=incident',
    'from=2026-10-04T00:00:00Z&to=2026-10-03T00:00:00Z',
  ])
    assert.equal((await app.inject(`/api/entries/page?${query}`)).statusCode, 400, query);
});
test('legacy arrays and full exports retain their previous contract', async () => {
  assert.equal((await app.inject('/api/entries?limit=500')).json().length, 500);
  assert.equal((await app.inject('/api/export')).json().entries.length, 516);
});
