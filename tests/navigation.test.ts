import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNavigation, navigationUrl } from '../src/client/navigation.js';
test('deep links restore only server selection belonging to the inventory view', () => {
  assert.deepEqual(readNavigation('?server=missing'), { view: 'inventory', serverId: 'missing' });
  assert.deepEqual(readNavigation('?view=journal&server=ignored'), {
    view: 'journal',
    serverId: null,
  });
  assert.deepEqual(readNavigation('?view=backups'), { view: 'backups', serverId: null });
  assert.deepEqual(readNavigation('?view=invalid'), { view: 'inventory', serverId: null });
});
test('navigation preserves deployment prefix and unrelated parameters without duplicating history state', () => {
  assert.equal(
    navigationUrl('http://localhost:8080/ops/?view=journal&theme=test#content', {
      view: 'inventory',
      serverId: 'a b',
    }),
    '/ops/?theme=test&server=a+b#content',
  );
  assert.equal(
    navigationUrl('http://localhost:8080/?server=old', { view: 'backups', serverId: null }),
    '/?view=backups',
  );
  assert.equal(
    navigationUrl('http://localhost:8080/?view=journal', { view: 'inventory', serverId: null }),
    '/',
  );
});
