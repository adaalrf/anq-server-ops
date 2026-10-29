import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupState } from '../src/shared/model.js';
import { loadConfig } from '../src/server/config.js';
import { hashPassword, verifyPassword } from '../src/server/auth.js';
test('backup freshness has explicit missing, recorded and overdue states', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  assert.equal(backupState({ lastBackupAt: null, backupIntervalHours: 24 }, now), 'missing');
  assert.equal(
    backupState({ lastBackupAt: '2026-10-25T12:00:00Z', backupIntervalHours: 24 }, now),
    'recorded',
  );
  assert.equal(
    backupState({ lastBackupAt: '2026-10-25T11:59:59Z', backupIntervalHours: 24 }, now),
    'overdue',
  );
});
test('owner mode fails closed without password configuration; malformed demo flags fail', () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'postgres://localhost/test' }),
    /OWNER_PASSWORD_HASH/,
  );
  assert.throws(() => loadConfig({ DATABASE_URL: 'postgres://localhost/test', DEMO_MODE: 'yes' }));
  for (const origin of [
    'ftp://example.com',
    'https://example.com/path',
    'https://user:pass@example.com',
    'https://example.com/',
  ]) {
    assert.throws(() =>
      loadConfig({
        DATABASE_URL: 'postgres://localhost/test',
        DEMO_MODE: 'true',
        APP_ORIGIN: origin,
      }),
    );
  }
});
test('password verification handles incorrect and oversized passwords', async () => {
  const hash = await hashPassword('a-long-test-password');
  assert.ok(await verifyPassword('a-long-test-password', hash));
  assert.equal(await verifyPassword('another-password', hash), false);
  assert.equal(await verifyPassword('x'.repeat(257), hash), false);
});
