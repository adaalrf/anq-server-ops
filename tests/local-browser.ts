import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { chromium, expect } from '@playwright/test';

// Explicitly targets the running local owner workspace; never changes inventory.
const env = parseEnv(await readFile('.env', 'utf8'));
assert.ok(env.DATABASE_URL, 'Run npm run setup:local first.');
const database = new URL(env.DATABASE_URL);
assert.equal(env.APP_ORIGIN, 'http://localhost:5173');
assert.equal(env.DEMO_MODE, 'false');
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.pathname, '/server_ops_owner');
const credentials = JSON.parse(await readFile('.local/owner-credentials.json', 'utf8'));
const origin = env.APP_ORIGIN;
for (const file of ['.env', '.local/owner-credentials.json']) {
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await fetch(`${origin}/@fs/${process.cwd()}/${file}`)).status, 403);
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  headless: true,
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByLabel('Username', { exact: true }).fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Server inventory', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add server', exact: true })).toBeEnabled();
  const response = await page.request.get(`${origin}/api/servers`);
  assert.equal(response.status(), 200);
  const records: { id: string; name: string; archived: boolean }[] = await response.json();
  if (records.length) {
    await page.goto(`${origin}/?server=${records[0].id}`);
    await expect(page.getByRole('heading', { name: records[0].name, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: records[0].name, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Activity journal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record work', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Backup records', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record backup', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    'Running Vite workspace passed: modules, owner sign-in, API proxy, deep links, recording actions, logout, and private-file denial. No inventory changed.',
  );
} finally {
  await browser.close();
}
