// Pure access-decision tests (private/public/guest/blocked semantics at the token layer).
//   node --test supabase/tests/grants.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideAccess, type StreamRow } from '../functions/_shared/grants.ts';

const stream = (over: Partial<StreamRow> = {}): StreamRow => ({
  id: 's1',
  host_id: 'host',
  status: 'live',
  room_name: 'rl_abc',
  ...over,
});

test('unauthenticated callers are rejected', () => {
  const d = decideAccess({ userId: null, stream: stream(), isApprovedGuest: false });
  assert.deepEqual([d.allowed, d.allowed ? 0 : d.status], [false, 401]);
});

test('a stream RLS hid (private / blocked / unknown) is indistinguishable from not found', () => {
  const d = decideAccess({ userId: 'u', stream: null, isApprovedGuest: false });
  assert.equal(d.allowed, false);
  assert.equal(d.allowed ? 0 : d.status, 404);
});

test('host may publish camera+mic and use data, before and after going live', () => {
  for (const status of ['created', 'live'] as const) {
    const d = decideAccess({ userId: 'host', stream: stream({ status }), isApprovedGuest: false });
    assert.ok(d.allowed && d.role === 'host');
    if (d.allowed) {
      assert.equal(d.grant.canPublish, true);
      assert.deepEqual(d.grant.canPublishSources, ['camera', 'microphone']);
    }
  }
});

test('viewers get subscribe-only tokens: no publishing, no data', () => {
  const d = decideAccess({ userId: 'viewer', stream: stream(), isApprovedGuest: false });
  assert.ok(d.allowed && d.role === 'viewer');
  if (d.allowed) {
    assert.equal(d.grant.canPublish, false);
    assert.equal(d.grant.canPublishData, false);
    assert.equal(d.grant.canSubscribe, true);
    assert.equal(d.grant.room, 'rl_abc');
  }
});

test('only an approved guest may publish, and never data', () => {
  const d = decideAccess({ userId: 'g', stream: stream(), isApprovedGuest: true });
  assert.ok(d.allowed && d.role === 'guest');
  if (d.allowed) {
    assert.equal(d.grant.canPublish, true);
    assert.equal(d.grant.canPublishData, false);
  }
});

test('non-hosts cannot join before the host is live; nobody joins an ended stream', () => {
  const early = decideAccess({
    userId: 'v',
    stream: stream({ status: 'created' }),
    isApprovedGuest: false,
  });
  assert.deepEqual([early.allowed, early.allowed ? 0 : early.code], [false, 'stream_not_live']);
  for (const userId of ['v', 'host']) {
    const ended = decideAccess({
      userId,
      stream: stream({ status: 'ended' }),
      isApprovedGuest: userId === 'v',
    });
    assert.deepEqual([ended.allowed, ended.allowed ? 0 : ended.code], [false, 'stream_ended']);
  }
});
