import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { migrate } from '../src/server/migrate.js';
import { demoDateShiftDays, projectDemoDates, shiftDemoDate } from '../src/server/demo-dates.js';

test('demo date projection preserves calendar days, nulls and non-date text', () => {
  assert.equal(demoDateShiftDays('2024-02-28', new Date('2024-03-01T23:00:00Z')), 2);
  assert.equal(shiftDemoDate('2024-02-28', 2), '2024-03-01');
  const data = {
    appliedOn: '2024-02-28',
    lastBackupAt: null,
    notes: '2024-02-28',
    createdAt: new Date('2024-02-28T12:00:00Z'),
  };
  assert.equal(projectDemoDates(data, 0), data);
  assert.deepEqual(projectDemoDates(data, 2), {
    appliedOn: '2024-03-01',
    lastBackupAt: null,
    notes: '2024-02-28',
    createdAt: '2024-03-01T12:00:00.000Z',
  });
  assert.equal(data.appliedOn, '2024-02-28');
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'test', DEMO_DATE_ANCHOR: '2024-02-28' }),
    /only allowed/,
  );
  assert.throws(() =>
    loadConfig({ DATABASE_URL: 'test', DEMO_MODE: 'true', DEMO_DATE_ANCHOR: '2024-02-30' }),
  );
});
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
test('demo API shifts dates without altering storage; unconfigured instances retain stored dates', async () => {
  const schema = `dates_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    const anchor = '2024-02-28',
      days = demoDateShiftDays(anchor),
      id = randomUUID();
    await pool.query(
      `INSERT INTO servers(id,name,hostname,provider,region,game,status,notes,backup_interval_hours) VALUES ($1,'Example','example.invalid','','','','operational','',24)`,
      [id],
    );
    for (const time of ['2024-02-28T07:00:00Z', '2024-02-27T07:00:00Z'])
      await pool.query(
        `INSERT INTO entries(id,server_id,kind,outcome,title,notes,occurred_at,created_at) VALUES ($1,$2,'backup','completed','Sample backup','',$3,$3)`,
        [randomUUID(), id, time],
      );
    for (const configured of [false, true]) {
      const app = await createApp(
        pool,
        loadConfig({
          DATABASE_URL: 'test',
          DEMO_MODE: 'true',
          DEMO_DATE_ANCHOR: configured ? anchor : '',
        }),
      );
      apps.push(app);
      const count = configured ? days : 0;
      const record = (await app.inject('/api/servers')).json()[0];
      assert.equal(record.lastBackupAt, shiftDemoDate('2024-02-28T07:00:00.000Z', count));
      const history = (await app.inject('/api/entries')).json();
      assert.equal(history[0].occurredAt, record.lastBackupAt);
      const page = (await app.inject('/api/entries/page?limit=1')).json();
      assert.equal(page.items[0].occurredAt, record.lastBackupAt);
      assert.ok(page.nextCursor);
      const next = (
        await app.inject('/api/entries/page?limit=1&cursor=' + encodeURIComponent(page.nextCursor))
      ).json();
      assert.equal(next.items.length, 1);
      assert.notEqual(next.items[0].id, page.items[0].id);
      const bounds = new URLSearchParams({
        from: shiftDemoDate('2024-02-28T00:00:00Z', count),
        to: shiftDemoDate('2024-02-29T00:00:00Z', count),
      });
      const filtered = (await app.inject('/api/entries/page?' + bounds)).json();
      assert.equal(filtered.total, 1);
      assert.equal(filtered.items[0].occurredAt, record.lastBackupAt);
      const exported = (await app.inject('/api/export')).json();
      assert.equal(exported.entries[0].occurredAt, record.lastBackupAt);
      assert.equal((await app.inject('/api/session')).json().relativeDates, configured);
      assert.equal(
        (await app.inject({ method: 'POST', url: '/api/login', payload: {} })).statusCode,
        403,
      );
    }
    assert.equal(
      (
        await pool.query('SELECT min(occurred_at) AS oldest FROM entries')
      ).rows[0].oldest.toISOString(),
      '2024-02-27T07:00:00.000Z',
    );
  } finally {
    for (const app of apps) await app.close();
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
