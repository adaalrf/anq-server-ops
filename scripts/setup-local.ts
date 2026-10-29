import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { hashPassword, verifyPassword } from '../src/server/auth.js';
import { loadConfig } from '../src/server/config.js';
import { migrate } from '../src/server/migrate.js';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const container = 'server-ops-dev-db';
const database = 'server_ops_owner';
const databaseUrl = `postgres://postgres:local-development-only@127.0.0.1:55432/${database}`;
const directory = resolve('.local');
const credentialPath = resolve(directory, 'owner-credentials.json');
const statePath = resolve(directory, 'setup-state.json');
const podman = (...args: string[]) =>
  execFileSync('podman', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
// A setup invocation never overwrites a user's existing configuration.
let existing: NodeJS.ProcessEnv | undefined;
if (existsSync('.env')) {
  existing = parseEnv(await readFile('.env', 'utf8'));
  if (
    existing.DATABASE_URL !== databaseUrl ||
    existing.DEMO_MODE !== 'false' ||
    existing.APP_ORIGIN !== 'http://localhost:5173' ||
    existing.PORT !== '8080' ||
    existing.HOST !== '127.0.0.1'
  ) {
    throw new Error(
      'Existing .env differs from this local owner workspace. It was preserved; use its documented startup or move it aside explicitly before local setup.',
    );
  }
  loadConfig(existing);
}
const present = spawnSync('podman', ['container', 'exists', container]);
if (present.error || (present.status !== 0 && present.status !== 1))
  throw new Error('Rootless Podman is unavailable. Check podman info before running setup.');
if (present.status === 1) {
  podman(
    'run',
    '-d',
    '--name',
    container,
    '-e',
    'POSTGRES_PASSWORD=local-development-only',
    '-e',
    'POSTGRES_DB=server_ops',
    '-p',
    '127.0.0.1:55432:5432',
    '-v',
    'server-ops-development-data:/var/lib/postgresql/data',
    'docker.io/library/postgres:17-alpine',
  );
} else {
  const info = JSON.parse(podman('inspect', container))[0];
  const bindings = info.HostConfig.PortBindings?.['5432/tcp'];
  if (
    bindings?.length !== 1 ||
    bindings[0].HostIp !== '127.0.0.1' ||
    bindings[0].HostPort !== '55432'
  )
    throw new Error(
      'Existing development container has different port bindings; it was preserved.',
    );
  if (!info.State.Running) podman('start', container);
}
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  const result = spawnSync('podman', [
    'exec',
    container,
    'pg_isready',
    '-U',
    'postgres',
    '-d',
    'server_ops',
  ]);
  if (result.status === 0) {
    ready = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!ready) throw new Error('Development PostgreSQL did not become ready; no data was reset.');

const admin = new pg.Pool({
  connectionString: databaseUrl.replace(`/${database}`, '/postgres'),
  connectionTimeoutMillis: 5000,
});
let pending =
  existsSync(statePath) && JSON.parse(await readFile(statePath, 'utf8')).pending === true;
try {
  const exists =
    (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount === 1;
  if (!exists) {
    pending = true;
    await writeFile(statePath, JSON.stringify({ database, pending: true }) + '\n', { mode: 0o600 });
    await admin.query(`CREATE DATABASE ${database}`); // Fixed identifier, never user input.
  }
} finally {
  await admin.end();
}
const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
try {
  await migrate(pool);
  if (pending && !(await pool.query('SELECT 1 FROM servers LIMIT 1')).rowCount) {
    execFileSync(process.execPath, ['--import', 'tsx', 'src/server/seed.ts'], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl, SEED_DEMO: 'true' },
    });
  }
  await writeFile(statePath, JSON.stringify({ database, pending: false }) + '\n', { mode: 0o600 });
} finally {
  await pool.end();
}

if (!existing) {
  let credentials: { username: string; password: string };
  if (existsSync(credentialPath)) {
    credentials = JSON.parse(await readFile(credentialPath, 'utf8'));
    if (credentials.username !== 'owner' || typeof credentials.password !== 'string')
      throw new Error('Local credential file is invalid; it was preserved.');
  } else {
    credentials = { username: 'owner', password: randomBytes(24).toString('base64url') };
    await writeFile(credentialPath, JSON.stringify(credentials, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
  }
  const hash = await hashPassword(credentials.password);
  await writeFile(
    '.env',
    `DATABASE_URL=${databaseUrl}\nAPP_ORIGIN=http://localhost:5173\nHOST=127.0.0.1\nPORT=8080\nDEMO_MODE=false\nOWNER_USERNAME=${credentials.username}\nOWNER_PASSWORD_HASH=${hash}\n`,
    { mode: 0o600, flag: 'wx' },
  );
}
await chmod('.env', 0o600);
let credentialMessage = 'Use the credentials already configured in .env.';
if (existsSync(credentialPath)) {
  await chmod(credentialPath, 0o600);
  const credentials = JSON.parse(await readFile(credentialPath, 'utf8'));
  const config = loadConfig(parseEnv(await readFile('.env', 'utf8')));
  if (
    credentials.username === config.username &&
    typeof credentials.password === 'string' &&
    (await verifyPassword(credentials.password, config.passwordHash))
  )
    credentialMessage = `Username: ${config.username}\nCredentials: ${credentialPath}`;
}
console.log(
  `Local owner workspace ready at http://localhost:5173\n${credentialMessage}\nStart with npm run dev. Existing records and credentials were preserved.`,
);
