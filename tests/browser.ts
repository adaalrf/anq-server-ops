import { checkNavigationTheme } from './navigation-theme.js';
import { workspaceLink } from './workspace-link.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { hashPassword } from '../src/server/auth.js';
import { migrate } from '../src/server/migrate.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const schema = `browser_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  headless: true,
});
const apps: Awaited<ReturnType<typeof createApp>>[] = [];
const consoleErrors: string[] = [];
let prefixServer: Server | undefined;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  for (const [name, game, status] of [
    ['Birchwood', 'Minecraft', 'operational'],
    ['Northstar', 'Valheim', 'degraded'],
    ['Ember', 'Factorio', 'offline'],
  ]) {
    await pool.query(
      'INSERT INTO servers(id,name,hostname,provider,region,game,status,notes,backup_interval_hours) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,24)',
      [
        randomUUID(),
        name,
        `${name.toLowerCase()}.example.invalid`,
        'Example Cloud',
        'Helsinki, FI',
        game,
        status,
        'Fictional browser-test server.',
      ],
    );
  }
  const config = loadConfig({
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    OWNER_PASSWORD_HASH: await hashPassword('browser-test-password'),
  });
  const owner = await createApp(pool, config);
  apps.push(owner);
  config.origin = await owner.listen({ host: '127.0.0.1', port: 0 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto(config.origin);
  await expect(page.getByRole('switch', { name: 'Dark mode' })).toHaveCount(0);
  await page.getByLabel('Username', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Server inventory', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add server', exact: true }).click();
  await page.getByLabel('Server name', { exact: true }).fill('Test garden');
  await page.getByLabel('Game / service', { exact: true }).fill('Terraria');
  await page
    .getByLabel('Hostname (reference only)', { exact: true })
    .fill('garden.example.invalid');
  await page.getByLabel('Recorded status', { exact: true }).selectOption('operational');
  await page.getByRole('button', { name: 'Save server', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test garden', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record work', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Restore test completed');
  await page.getByLabel('Kind', { exact: true }).selectOption('restore');
  await page
    .getByLabel('Notes / recovery evidence', { exact: true })
    .fill('Loaded a separate world and checked the saved state.');
  await page.getByRole('button', { name: 'Record entry', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Restore test completed', exact: true }),
  ).toBeVisible();
  const detailUrl = page.url();
  assert.match(detailUrl, /\?server=/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Test garden', exact: true })).toBeVisible();
  await expect(
    page.getByText('Loaded a separate world and checked the saved state.'),
  ).toBeVisible();
  await workspaceLink(page, 'Activity journal');
  await expect(page).toHaveURL(/\?view=journal$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Activity journal', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Test garden', exact: true })).toBeVisible();
  await page.goForward();
  await page.getByRole('button', { name: 'Record work', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Maintenance from journal');
  // Required selection prevents silently attaching an entry to the first server.
  await page.getByRole('button', { name: 'Record entry', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  assert.equal(
    await page
      .getByLabel('Server', { exact: true })
      .evaluate((node: HTMLSelectElement) => node.validity.valueMissing),
    true,
  );
  const gardenId = new URL(detailUrl).searchParams.get('server')!;
  await page.getByLabel('Server', { exact: true }).selectOption(gardenId);
  await page.getByRole('button', { name: 'Record entry', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Maintenance from journal', exact: true }),
  ).toBeVisible();
  await workspaceLink(page, 'Backup records');
  await page.getByRole('button', { name: 'Record backup', exact: true }).click();
  await expect(page.getByLabel('Kind', { exact: true })).toHaveValue('backup');
  assert.deepEqual(
    await page
      .getByLabel('Kind', { exact: true })
      .locator('option')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value)),
    ['backup', 'restore'],
  );
  await page.getByLabel('Server', { exact: true }).selectOption(gardenId);
  await page.getByLabel('Title', { exact: true }).fill('Backup from records');
  // Failed validation keeps the form and its selected server available to fix.
  await page.getByLabel('Event time (your local time)', { exact: true }).fill('2099-01-01T12:00');
  await page.getByRole('button', { name: 'Record entry', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('future');
  await expect(page.getByLabel('Server', { exact: true })).toHaveValue(gardenId);
  await page
    .getByLabel('Event time (your local time)', { exact: true })
    .fill(
      new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16),
    );
  await page.getByRole('button', { name: 'Record entry', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Backup from records', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Record backup', exact: true }).click();
  await page.getByLabel('Server', { exact: true }).selectOption(gardenId);
  await page.getByLabel('Title', { exact: true }).fill('Restore from records');
  await page.getByLabel('Kind', { exact: true }).selectOption('restore');
  await page.getByRole('button', { name: 'Record entry', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Restore from records', exact: true }),
  ).toBeVisible();
  await page.goto(`${config.origin}/?server=missing`);
  await expect(page.getByRole('heading', { name: 'Server not found', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to inventory', exact: true }).click();
  await page.goto(detailUrl);
  await page.getByRole('button', { name: 'Edit server', exact: true }).click();
  await page.getByLabel('Archive this server (keeps its journal)', { exact: true }).check();
  await page.getByRole('button', { name: 'Save server', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record work', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Back to inventory' }).click();
  await page.getByLabel('Filter server status', { exact: true }).selectOption('archived');
  await expect(page.getByRole('button', { name: 'View Test garden', exact: true })).toBeVisible();
  await workspaceLink(page, 'Activity journal');
  await page.getByRole('button', { name: 'Record work', exact: true }).click();
  await expect(
    page.getByLabel('Server', { exact: true }).locator(`option[value="${gardenId}"]`),
  ).toHaveCount(0);
  const formAccessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  assert.deepEqual(
    formAccessibility.violations.map((v) => v.id),
    [],
  );
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.getByLabel('Notes / recovery evidence', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Record entry', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Record entry', exact: true })).toBeInViewport();
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let exported = '';
  for await (const chunk of stream!) exported += chunk;
  assert.equal(JSON.parse(exported).entries.length, 4);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

  const demo = await createApp(
    pool,
    loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, DEMO_MODE: 'true' }),
  );
  apps.push(demo);
  const demoOrigin = await demo.listen({ host: '127.0.0.1', port: 0 });
  let releaseRecords!: () => void;
  const recordsReady = new Promise<void>((resolve) => {
    releaseRecords = resolve;
  });
  await page.route('**/api/servers', async (route) => {
    await recordsReady;
    await route.continue();
  });
  await page.goto(demoOrigin);
  await expect(page.getByRole('status')).toContainText('Opening the operations journal');
  await expect(page.locator('.stats')).toHaveCount(0);
  await expect(page.getByText('Your inventory starts here', { exact: true })).toHaveCount(0);
  releaseRecords();
  await expect(
    page.getByRole('button', { name: 'Add server · Disabled in demo', exact: true }),
  ).toBeDisabled();
  await page.unroute('**/api/servers');
  await page.route('**/api/servers', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Temporary sample-data failure' }),
    }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Couldn’t open the journal' })).toBeVisible();
  await expect(page.locator('.stats')).toHaveCount(0);
  await page.unroute('**/api/servers');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('link', { name: 'A project by Martin Røed Flyum' })).toHaveAttribute(
    'href',
    'https://adaalrf.dev/work/anq-server-ops/',
  );
  await expect(
    page.getByRole('button', { name: 'Add server · Disabled in demo', exact: true }),
  ).toBeDisabled();
  await expect(page).toHaveTitle('Server inventory · ANQ Server Ops');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.getByLabel('Search servers', { exact: true }).fill('north');
  await expect(page.getByRole('button', { name: 'View Northstar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Birchwood', exact: true })).toHaveCount(0);
  await page.getByLabel('Search servers', { exact: true }).fill('');
  await page.getByLabel('Search servers', { exact: true }).blur();
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  assert.deepEqual(
    accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
    [],
  );
  await mkdir('test-results/screenshots', { recursive: true });
  await page.screenshot({ path: 'test-results/screenshots/inventory-desktop.png', fullPage: true });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `Page overflows at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/screenshots/inventory-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'View Birchwood', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Birchwood', exact: true })).toBeVisible();
  await workspaceLink(page, 'Activity journal');
  await expect(page.getByRole('heading', { name: 'Activity journal', exact: true })).toBeVisible();
  await workspaceLink(page, 'Backup records');
  await expect(page.getByRole('heading', { name: 'Backup records', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record backup · Disabled in demo', exact: true }),
  ).toBeDisabled();

  // Filtering precedes pagination, and a shared URL restores the filter.
  await pool.query(
    `INSERT INTO entries(id,server_id,kind,outcome,title,notes,occurred_at)
    SELECT gen_random_uuid(),$1,'maintenance','completed','Paging rehearsal '||n,'','2026-10-01T12:00:00Z' FROM generate_series(1,30) n`,
    [gardenId],
  );
  await workspaceLink(page, 'Activity journal');
  await page.getByLabel('Search journal', { exact: true }).fill('Paging rehearsal');
  await expect(page.getByText('30 matching records · Page 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('30 matching records · Page 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page.getByText('30 matching records · Page 1', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Search journal', { exact: true })).toHaveValue('Paging rehearsal');
  await expect(page.getByText('30 matching records · Page 1', { exact: true })).toBeVisible();
  await page.getByLabel('Result', { exact: true }).selectOption('failed');
  await expect(page.getByText('0 matching records · Page 1', { exact: true })).toBeVisible();

  // Rehearse the existing proxy contract locally, without touching the VPS.
  execFileSync(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'build',
      '--base=/ops/',
      '--outDir=../../test-results/prefix-client',
    ],
    { stdio: 'pipe' },
  );
  const prefixConfig = loadConfig({
    DATABASE_URL: 'test',
    OWNER_PASSWORD_HASH: await hashPassword('prefix-test-password'),
  });
  const prefixed = await createApp(pool, prefixConfig, {
    staticRoot: resolve('test-results/prefix-client'),
  });
  apps.push(prefixed);
  prefixServer = createServer(async (request, response) => {
    if (!request.url?.startsWith('/ops/')) {
      response.writeHead(404);
      response.end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = await prefixed.inject({
      method: request.method as 'GET' | 'POST',
      url: request.url.slice(4),
      headers: request.headers,
      ...(chunks.length ? { payload: Buffer.concat(chunks) } : {}),
    });
    response.writeHead(result.statusCode, result.headers);
    response.end(result.rawPayload);
  });
  await new Promise<void>((resolve) => prefixServer!.listen(0, '127.0.0.1', resolve));
  prefixConfig.origin = `http://127.0.0.1:${(prefixServer.address() as { port: number }).port}`;
  await page.goto(`${prefixConfig.origin}/ops/?server=${gardenId}`);
  await page.getByLabel('Username', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('prefix-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test garden', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Test garden', exact: true })).toBeVisible();
  await workspaceLink(page, 'Activity journal');
  await expect(page).toHaveURL(/\/ops\/\?view=journal$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Test garden', exact: true })).toBeVisible();

  // No active inventory: the recording action explains its dependency.
  await pool.query('UPDATE servers SET archived=true');
  await context.clearCookies();
  await page.goto(`${config.origin}/?view=backups`);
  await page.getByLabel('Username', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record backup', exact: true })).toBeDisabled();
  await expect(
    page.getByText('Add an active server before recording work.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add a server first', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add a server' })).toBeVisible();
  await checkNavigationTheme(page, demoOrigin, true);
  assert.deepEqual(consoleErrors, []);
  console.log(
    'Browser workflows passed: owner workflows, contextual recording, required server selection, validation recovery, deep links, history, /ops/ prefix, archived/empty inventory, demo mode, mobile forms and accessibility.',
  );
} finally {
  for (const app of apps) await app.close();
  await browser.close();
  await pool.end();
  if (prefixServer) await new Promise<void>((resolve) => prefixServer!.close(() => resolve()));
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
