import pg from 'pg';
import { randomUUID } from 'node:crypto';
if (process.env.SEED_DEMO !== 'true')
  throw new Error(
    'Set SEED_DEMO=true explicitly. This command inserts fictional demo records into an empty database only.',
  );
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
try {
  await client.query('BEGIN');
  await client.query('LOCK TABLE servers IN EXCLUSIVE MODE');
  if ((await client.query('SELECT 1 FROM servers LIMIT 1')).rowCount)
    throw new Error('Refusing to seed a non-empty inventory');
  const examples = [
    {
      name: 'Birchwood',
      hostname: 'birchwood.example.invalid',
      provider: 'Example Cloud',
      region: 'Helsinki, FI',
      game: 'Minecraft',
      status: 'operational',
      notes: 'Fictional survival world for a small group. Maintenance window: Sunday evenings.',
      interval: 24,
      backup: 5,
      restore: 120,
    },
    {
      name: 'Northstar',
      hostname: 'northstar.example.invalid',
      provider: 'Example Cloud',
      region: 'Frankfurt, DE',
      game: 'Valheim',
      status: 'degraded',
      notes:
        'Fictional community world. Investigating occasional latency after the latest game update.',
      interval: 24,
      backup: 31,
      restore: null,
    },
    {
      name: 'Ember',
      hostname: 'ember.example.invalid',
      provider: 'Home lab',
      region: 'Oslo, NO',
      game: 'Factorio',
      status: 'offline',
      notes:
        'Fictional seasonal factory. Intentionally paused between sessions; no automated health probe is running.',
      interval: 48,
      backup: null,
      restore: null,
    },
  ];
  for (const server of examples) {
    const id = randomUUID();
    await client.query(
      'INSERT INTO servers(id,name,hostname,provider,region,game,status,notes,backup_interval_hours) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        id,
        server.name,
        server.hostname,
        server.provider,
        server.region,
        server.game,
        server.status,
        server.notes,
        server.interval,
      ],
    );
    const records = [
      {
        kind: 'maintenance',
        outcome: 'completed',
        title: 'World configuration reviewed',
        notes: 'Demo entry: reviewed game settings and documented the maintenance window.',
        time: ago(48),
      },
      {
        kind: 'maintenance',
        outcome: 'planned',
        title: 'Review the next game update',
        notes: 'Demo entry: read release notes before scheduling the update.',
        time: ago(-24),
      },
    ];
    if (server.backup !== null)
      records.push({
        kind: 'backup',
        outcome: 'completed',
        title: 'World snapshot recorded',
        notes:
          'Fictional backup record for this demo. A completed backup is not evidence of a successful restore.',
        time: ago(server.backup),
      });
    if (server.restore !== null)
      records.push({
        kind: 'restore',
        outcome: 'completed',
        title: 'Isolated restore drill',
        notes:
          'Fictional drill: restored a copy to a separate world and checked that it loaded. This is illustrative data only.',
        time: ago(server.restore),
      });
    if (server.status === 'degraded')
      records.push({
        kind: 'incident',
        outcome: 'planned',
        title: 'Investigate intermittent latency',
        notes:
          'Demo entry: compare logs around the last game update. No diagnosis has been confirmed.',
        time: ago(2),
      });
    for (const entry of records)
      await client.query(
        'INSERT INTO entries(id,server_id,kind,outcome,title,notes,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(), id, entry.kind, entry.outcome, entry.title, entry.notes, entry.time],
      );
  }
  await client.query('COMMIT');
  console.log('Fictional demo inventory created');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
