// Database + RLS tests. Runs the REAL migrations against an in-process Postgres (PGlite).
// Supabase-specific pieces (auth.uid(), roles, storage schema) are stubbed in BOOTSTRAP below.
//   npm run test:db
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = new URL('../migrations/', import.meta.url);

const BOOTSTRAP = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated;
`;

let db;

before(async () => {
  db = new PGlite();
  await db.exec(BOOTSTRAP);
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    try {
      await db.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${e.message}`);
    }
  }
});

// ── helpers ──
const asRole = (role, uid, fn) =>
  db.transaction(async (tx) => {
    await tx.query(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    return fn(tx);
  });
const as = (uid, fn) => asRole('authenticated', uid, fn);
const asAnon = (fn) => asRole('anon', null, fn);

async function mkUser(name) {
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${name}@test.dev`]);
  await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [
    id,
    `${name}_${id.slice(0, 4)}`,
    name,
  ]);
  return id;
}
const rows = async (tx, sql, p = []) => (await tx.query(sql, p)).rows;
const createStream = (tx, vis = 'public') =>
  rows(tx, `select * from public.create_stream('Test stream', null, $1, false, false)`, [vis]).then(
    (r) => r[0],
  );
const goLive = (tx, id) =>
  rows(tx, `select * from public.mark_stream_live($1)`, [id]).then((r) => r[0]);
const liveStream = async (host, vis = 'public') => {
  const s = await as(host, (tx) => createStream(tx, vis));
  await as(host, (tx) => goLive(tx, s.id));
  return s;
};

describe('migrations', () => {
  test('all tables from the spec exist with RLS enabled', async () => {
    const need = [
      'profiles',
      'follows',
      'streams',
      'stream_participants',
      'stream_invitations',
      'chat_messages',
      'reactions',
      'recordings',
      'location_shares',
      'notifications',
      'gifts',
      'wallet_transactions',
      'reports',
      'blocks',
      'moderation_actions',
    ];
    const r = await db.query(
      `select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const byName = Object.fromEntries(r.rows.map((x) => [x.relname, x.relrowsecurity]));
    for (const t of need) {
      assert.ok(t in byName, `missing table ${t}`);
      assert.equal(byName[t], true, `RLS disabled on ${t}`);
    }
    for (const [t, rls] of Object.entries(byName)) assert.equal(rls, true, `RLS disabled on ${t}`);
  });
});

describe('profiles', () => {
  test('user creates own profile; settings row is auto-created and private-by-default', async () => {
    const id = randomUUID();
    await db.query(`insert into auth.users (id) values ($1)`, [id]);
    await as(id, (tx) =>
      tx.query(
        `insert into public.profiles (id, username, display_name) values ($1, 'new_user_1', 'New')`,
        [id],
      ),
    );
    const [s] = await as(id, (tx) =>
      rows(tx, `select * from public.profile_settings where user_id = $1`, [id]),
    );
    assert.equal(s.location_sharing_enabled, false);
    assert.equal(s.is_private_account, false);
  });

  test('cannot create a profile for someone else', async () => {
    const a = randomUUID(),
      b = randomUUID();
    await db.query(`insert into auth.users (id) values ($1), ($2)`, [a, b]);
    await assert.rejects(
      as(a, (tx) =>
        tx.query(
          `insert into public.profiles (id, username, display_name) values ($1, 'spoof_user', 'X')`,
          [b],
        ),
      ),
      /row-level security/,
    );
  });

  test('username format and uniqueness are enforced', async () => {
    const u = await mkUser('fmt');
    const other = randomUUID();
    await db.query(`insert into auth.users (id) values ($1)`, [other]);
    for (const bad of ['ab', 'UPPER_case', 'has space', 'x'.repeat(21), 'emoji😀ok']) {
      await assert.rejects(
        as(other, (tx) =>
          tx.query(
            `insert into public.profiles (id, username, display_name) values ($1, $2, 'X')`,
            [other, bad],
          ),
        ),
        /check|violates/i,
      );
    }
    const [{ username }] = (
      await db.query(`select username from public.profiles where id = $1`, [u])
    ).rows;
    await assert.rejects(
      as(other, (tx) =>
        tx.query(`insert into public.profiles (id, username, display_name) values ($1, $2, 'X')`, [
          other,
          username,
        ]),
      ),
      /unique/i,
    );
  });

  test('profiles are publicly readable but only owner can update', async () => {
    const a = await mkUser('pa'),
      b = await mkUser('pb');
    const anon = await asAnon((tx) =>
      rows(tx, `select id from public.profiles where id = $1`, [a]),
    );
    assert.equal(anon.length, 1);
    await as(b, (tx) => tx.query(`update public.profiles set bio = 'hacked' where id = $1`, [a]));
    const [{ bio }] = (await db.query(`select bio from public.profiles where id = $1`, [a])).rows;
    assert.equal(bio, null, 'another user must not change the bio');
    await as(a, (tx) => tx.query(`update public.profiles set bio = 'mine' where id = $1`, [a]));
  });

  test('settings are private to their owner', async () => {
    const a = await mkUser('sa'),
      b = await mkUser('sb');
    const seen = await as(b, (tx) =>
      rows(tx, `select * from public.profile_settings where user_id = $1`, [a]),
    );
    assert.equal(seen.length, 0);
    const anon = await asAnon((tx) =>
      rows(tx, `select * from public.profile_settings`).catch(() => 'denied'),
    );
    assert.equal(anon, 'denied');
  });
});

describe('follows & blocks', () => {
  test('follow, duplicate, self-follow, spoofed follower', async () => {
    const a = await mkUser('fa'),
      b = await mkUser('fb');
    await as(a, (tx) =>
      tx.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [a, b]),
    );
    await assert.rejects(
      as(a, (tx) =>
        tx.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [a, b]),
      ),
      /duplicate|unique/i,
    );
    await assert.rejects(
      as(a, (tx) =>
        tx.query(`insert into public.follows (follower_id, followee_id) values ($1, $1)`, [a]),
      ),
      /check|violates/i,
    );
    await assert.rejects(
      as(a, (tx) =>
        tx.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [b, a]),
      ),
      /row-level security/,
    );
    const [c] = await as(a, (tx) => rows(tx, `select * from public.get_follow_counts($1)`, [b]));
    assert.equal(Number(c.followers), 1);
  });

  test('new follower creates a notification for the followee only', async () => {
    const a = await mkUser('na'),
      b = await mkUser('nb');
    await as(a, (tx) =>
      tx.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [a, b]),
    );
    const mine = await as(b, (tx) => rows(tx, `select type, actor_id from public.notifications`));
    assert.equal(mine.length, 1);
    assert.equal(mine[0].type, 'new_follower');
    assert.equal((await as(a, (tx) => rows(tx, `select * from public.notifications`))).length, 0);
  });

  test('clients cannot forge notifications', async () => {
    const a = await mkUser('fa2');
    await assert.rejects(
      as(a, (tx) =>
        tx.query(`insert into public.notifications (user_id, type) values ($1, 'new_follower')`, [
          a,
        ]),
      ),
      /permission denied/,
    );
  });

  test('blocking removes follows in both directions and prevents re-following', async () => {
    const a = await mkUser('ba'),
      b = await mkUser('bb');
    await as(a, (tx) =>
      tx.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [a, b]),
    );
    await as(b, (tx) =>
      tx.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [b, a]),
    );
    await as(a, (tx) =>
      tx.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]),
    );
    const left = (
      await db.query(
        `select count(*)::int n from public.follows where follower_id in ($1,$2) and followee_id in ($1,$2)`,
        [a, b],
      )
    ).rows[0].n;
    assert.equal(left, 0);
    await assert.rejects(
      as(b, (tx) =>
        tx.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [b, a]),
      ),
      /row-level security/,
    );
  });

  test('a block list is private (blocked user cannot see they were blocked)', async () => {
    const a = await mkUser('pla'),
      b = await mkUser('plb');
    await as(a, (tx) =>
      tx.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]),
    );
    assert.equal((await as(b, (tx) => rows(tx, `select * from public.blocks`))).length, 0);
  });
});

describe('stream lifecycle', () => {
  test('clients cannot insert or update streams directly', async () => {
    const h = await mkUser('dh');
    await assert.rejects(
      as(h, (tx) =>
        tx.query(`insert into public.streams (host_id, title, status) values ($1, 't', 'live')`, [
          h,
        ]),
      ),
      /permission denied/,
    );
    const s = await as(h, (tx) => createStream(tx));
    await assert.rejects(
      as(h, (tx) => tx.query(`update public.streams set status = 'live' where id = $1`, [s.id])),
      /permission denied/,
    );
  });

  test('create validates input; only one active stream per host', async () => {
    const h = await mkUser('one');
    await assert.rejects(
      as(h, (tx) => tx.query(`select public.create_stream('', null, 'public', false, false)`)),
      /invalid_title/,
    );
    await assert.rejects(
      as(h, (tx) => tx.query(`select public.create_stream('x', null, 'secret', false, false)`)),
      /invalid_visibility/,
    );
    await assert.rejects(
      as(h, (tx) =>
        tx.query(`select public.create_stream(repeat('x', 81), null, 'public', false, false)`),
      ),
      /invalid_title/,
    );
    const s = await as(h, (tx) => createStream(tx));
    assert.equal(s.status, 'created');
    assert.match(s.room_name, /^rl_[0-9a-f]{32}$/);
    await assert.rejects(
      as(h, (tx) => createStream(tx)),
      /already_live/,
    );
  });

  test('unauthenticated callers cannot create streams', async () => {
    await assert.rejects(
      asAnon((tx) => tx.query(`select public.create_stream('x', null, 'public', false, false)`)),
      /permission denied/,
    );
  });

  test('a stream is not discoverable until the host marks it live', async () => {
    const h = await mkUser('disc'),
      v = await mkUser('discv');
    const s = await as(h, (tx) => createStream(tx));
    assert.equal(
      (await as(v, (tx) => rows(tx, `select id from public.streams where id = $1`, [s.id]))).length,
      0,
    );
    await as(h, (tx) => goLive(tx, s.id));
    assert.equal(
      (await as(v, (tx) => rows(tx, `select id from public.streams where id = $1`, [s.id]))).length,
      1,
    );
  });

  test('only the host can go live, heartbeat, or end', async () => {
    const h = await mkUser('own'),
      x = await mkUser('ownx');
    const s = await as(h, (tx) => createStream(tx));
    await assert.rejects(
      as(x, (tx) => goLive(tx, s.id)),
      /invalid_stream_state/,
    );
    await as(h, (tx) => goLive(tx, s.id));
    assert.equal(
      (await as(x, (tx) => rows(tx, `select public.stream_heartbeat($1) ok`, [s.id])))[0].ok,
      false,
    );
    assert.equal(
      (await as(x, (tx) => rows(tx, `select public.end_stream($1) ok`, [s.id])))[0].ok,
      false,
    );
    assert.equal(
      (await as(h, (tx) => rows(tx, `select public.stream_heartbeat($1) ok`, [s.id])))[0].ok,
      true,
    );
    assert.equal(
      (await as(h, (tx) => rows(tx, `select public.end_stream($1) ok`, [s.id])))[0].ok,
      true,
    );
    const [row] = (
      await db.query(`select status, ended_at from public.streams where id = $1`, [s.id])
    ).rows;
    assert.equal(row.status, 'ended');
    assert.ok(row.ended_at);
    await assert.rejects(
      as(h, (tx) => goLive(tx, s.id)),
      /invalid_stream_state/,
    );
  });

  test('ended streams disappear from viewers and the host can start a new one', async () => {
    const h = await mkUser('end'),
      v = await mkUser('endv');
    const s = await liveStream(h);
    await as(h, (tx) => tx.query(`select public.end_stream($1)`, [s.id]));
    assert.equal(
      (await as(v, (tx) => rows(tx, `select id from public.streams where id = $1`, [s.id]))).length,
      0,
    );
    await as(h, (tx) => createStream(tx));
  });

  test('abandoned live streams (no heartbeat) are reaped, never "live forever"', async () => {
    const h = await mkUser('stale'),
      v = await mkUser('stalev');
    const s = await liveStream(h);
    await db.query(
      `update public.streams set last_heartbeat_at = now() - interval '5 minutes' where id = $1`,
      [s.id],
    );
    const n = await asRole('service_role', null, (tx) =>
      rows(tx, `select public.end_stale_streams() n`),
    );
    assert.ok(n[0].n >= 1);
    assert.equal(
      (await as(v, (tx) => rows(tx, `select id from public.streams where id = $1`, [s.id]))).length,
      0,
    );
    await assert.rejects(
      as(h, (tx) => tx.query(`select public.end_stale_streams()`)),
      /permission denied/,
    );
  });

  test('a stale stream does not block the host from broadcasting again', async () => {
    const h = await mkUser('stale2');
    const s = await liveStream(h);
    await db.query(
      `update public.streams set last_heartbeat_at = now() - interval '5 minutes' where id = $1`,
      [s.id],
    );
    const s2 = await as(h, (tx) => createStream(tx));
    assert.notEqual(s2.id, s.id);
  });

  test("blocked viewers cannot see the host's stream", async () => {
    const h = await mkUser('bh'),
      v = await mkUser('bv');
    const s = await liveStream(h);
    await as(h, (tx) =>
      tx.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [h, v]),
    );
    assert.equal(
      (await as(v, (tx) => rows(tx, `select id from public.streams where id = $1`, [s.id]))).length,
      0,
    );
    assert.equal(
      (await as(v, (tx) => rows(tx, `select public.can_view_stream($1) ok`, [s.id])))[0].ok,
      false,
    );
  });

  test('anonymous visitors cannot read streams', async () => {
    const h = await mkUser('anon');
    await liveStream(h);
    await assert.rejects(
      asAnon((tx) => tx.query(`select * from public.streams`)),
      /permission denied/,
    );
  });
});

describe('private streams & invitations', () => {
  test('private streams are invisible to non-invited users, including via guessed IDs', async () => {
    const h = await mkUser('ph'),
      v = await mkUser('pv');
    const s = await liveStream(h, 'private');
    assert.equal(
      (await as(v, (tx) => rows(tx, `select id from public.streams where id = $1`, [s.id]))).length,
      0,
    );
    assert.equal(
      (await as(v, (tx) => rows(tx, `select public.can_view_stream($1) ok`, [s.id])))[0].ok,
      false,
    );
    assert.equal(
      (await as(h, (tx) => rows(tx, `select id from public.streams where id = $1`, [s.id]))).length,
      1,
    );
  });

  test('invite → pending does not grant access; accept grants; revoke removes', async () => {
    const h = await mkUser('ih'),
      v = await mkUser('iv');
    const s = await liveStream(h, 'private');
    const [inv] = await as(h, (tx) =>
      rows(
        tx,
        `insert into public.stream_invitations (stream_id, inviter_id, invitee_id) values ($1, $2, $3) returning id`,
        [s.id, h, v],
      ),
    );
    const can = (u) =>
      as(u, (tx) => rows(tx, `select public.can_view_stream($1) ok`, [s.id])).then((r) => r[0].ok);
    assert.equal(await can(v), false, 'pending invitation must not grant access');
    assert.equal(
      (await as(v, (tx) => rows(tx, `select type from public.notifications`)))[0].type,
      'stream_invite',
    );
    await as(v, (tx) =>
      tx.query(`update public.stream_invitations set status = 'accepted' where id = $1`, [inv.id]),
    );
    assert.equal(await can(v), true);
    await as(h, (tx) =>
      tx.query(`update public.stream_invitations set status = 'revoked' where id = $1`, [inv.id]),
    );
    assert.equal(await can(v), false, 'revoked invitation must remove access');
  });

  test("only the host can invite; invitee cannot self-escalate or edit others' invitations", async () => {
    const h = await mkUser('eh'),
      v = await mkUser('ev'),
      x = await mkUser('ex');
    const s = await liveStream(h, 'private');
    await assert.rejects(
      as(x, (tx) =>
        tx.query(
          `insert into public.stream_invitations (stream_id, inviter_id, invitee_id, status) values ($1, $2, $2, 'accepted')`,
          [s.id, x],
        ),
      ),
      /row-level security|check/,
    );
    await assert.rejects(
      as(x, (tx) =>
        tx.query(
          `insert into public.stream_invitations (stream_id, inviter_id, invitee_id) values ($1, $2, $3)`,
          [s.id, x, v],
        ),
      ),
      /row-level security/,
    );
    const [inv] = await as(h, (tx) =>
      rows(
        tx,
        `insert into public.stream_invitations (stream_id, inviter_id, invitee_id) values ($1, $2, $3) returning id`,
        [s.id, h, v],
      ),
    );
    await as(x, (tx) =>
      tx.query(`update public.stream_invitations set status = 'accepted' where id = $1`, [inv.id]),
    );
    assert.equal(
      (await db.query(`select status from public.stream_invitations where id = $1`, [inv.id]))
        .rows[0].status,
      'pending',
    );
    await assert.rejects(
      as(h, (tx) =>
        tx.query(`update public.stream_invitations set status = 'accepted' where id = $1`, [
          inv.id,
        ]),
      ),
      /row-level security/,
    );
  });

  test('declined invitation does not grant access', async () => {
    const h = await mkUser('dh2'),
      v = await mkUser('dv2');
    const s = await liveStream(h, 'private');
    const [inv] = await as(h, (tx) =>
      rows(
        tx,
        `insert into public.stream_invitations (stream_id, inviter_id, invitee_id) values ($1, $2, $3) returning id`,
        [s.id, h, v],
      ),
    );
    await as(v, (tx) =>
      tx.query(`update public.stream_invitations set status = 'declined' where id = $1`, [inv.id]),
    );
    assert.equal(
      (await as(v, (tx) => rows(tx, `select public.can_view_stream($1) ok`, [s.id])))[0].ok,
      false,
    );
  });
});

describe('guests', () => {
  test('request → host approves; guest cannot self-approve; strangers cannot read requests', async () => {
    const h = await mkUser('gh'),
      g = await mkUser('gg'),
      x = await mkUser('gx');
    const s = await liveStream(h);
    const [p] = await as(g, (tx) =>
      rows(
        tx,
        `insert into public.stream_participants (stream_id, user_id) values ($1, $2) returning id`,
        [s.id, g],
      ),
    );
    assert.equal(
      (await as(h, (tx) => rows(tx, `select type from public.notifications`)))[0].type,
      'guest_request',
    );
    await as(g, (tx) =>
      tx
        .query(`update public.stream_participants set status = 'approved' where id = $1`, [p.id])
        .catch(() => null),
    ).catch(() => null);
    assert.equal(
      (await db.query(`select status from public.stream_participants where id = $1`, [p.id]))
        .rows[0].status,
      'requested',
    );
    assert.equal(
      (await as(x, (tx) => rows(tx, `select * from public.stream_participants`))).length,
      0,
    );
    await as(h, (tx) =>
      tx.query(`update public.stream_participants set status = 'approved' where id = $1`, [p.id]),
    );
    const [row] = (
      await db.query(`select status, joined_at from public.stream_participants where id = $1`, [
        p.id,
      ])
    ).rows;
    assert.equal(row.status, 'approved');
    assert.ok(row.joined_at);
    await as(h, (tx) =>
      tx.query(`update public.stream_participants set status = 'removed' where id = $1`, [p.id]),
    );
    assert.equal(
      (await db.query(`select status from public.stream_participants where id = $1`, [p.id]))
        .rows[0].status,
      'removed',
    );
  });

  test('cannot request to join a stream you cannot view', async () => {
    const h = await mkUser('gh2'),
      x = await mkUser('gx2');
    const s = await liveStream(h, 'private');
    await assert.rejects(
      as(x, (tx) =>
        tx.query(`insert into public.stream_participants (stream_id, user_id) values ($1, $2)`, [
          s.id,
          x,
        ]),
      ),
      /row-level security/,
    );
  });

  test('cannot insert yourself as already approved', async () => {
    const h = await mkUser('gh3'),
      g = await mkUser('gg3');
    const s = await liveStream(h);
    await assert.rejects(
      as(g, (tx) =>
        tx.query(
          `insert into public.stream_participants (stream_id, user_id, status) values ($1, $2, 'approved')`,
          [s.id, g],
        ),
      ),
      /row-level security/,
    );
  });
});

describe('chat', () => {
  const say = (u, sid, body) =>
    as(u, (tx) =>
      tx.query(`insert into public.chat_messages (stream_id, user_id, body) values ($1, $2, $3)`, [
        sid,
        u,
        body,
      ]),
    );

  test('viewers can chat in live public streams and see messages', async () => {
    const h = await mkUser('ch'),
      v = await mkUser('cv');
    const s = await liveStream(h);
    await say(v, s.id, '  hello  ');
    const msgs = await as(h, (tx) =>
      rows(tx, `select body, user_id from public.chat_messages where stream_id = $1`, [s.id]),
    );
    assert.deepEqual(
      msgs.map((m) => m.body),
      ['hello'],
      'body is trimmed server-side',
    );
  });

  test('cannot post as someone else, cannot post empty or oversized messages', async () => {
    const h = await mkUser('ch2'),
      v = await mkUser('cv2');
    const s = await liveStream(h);
    await assert.rejects(
      as(v, (tx) =>
        tx.query(
          `insert into public.chat_messages (stream_id, user_id, body) values ($1, $2, 'x')`,
          [s.id, h],
        ),
      ),
      /row-level security/,
    );
    await assert.rejects(say(v, s.id, '   '), /check|violates/i);
    await assert.rejects(say(v, s.id, 'x'.repeat(301)), /check|violates/i);
  });

  test('rate limit: 6th message within 10 seconds is rejected', async () => {
    const h = await mkUser('ch3'),
      v = await mkUser('cv3');
    const s = await liveStream(h);
    for (let i = 0; i < 5; i++) await say(v, s.id, `m${i}`);
    await assert.rejects(say(v, s.id, 'm5'), /chat_rate_limited/);
  });

  test('no chat in ended streams or private streams without access', async () => {
    const h = await mkUser('ch4'),
      v = await mkUser('cv4');
    const priv = await liveStream(h, 'private');
    await assert.rejects(say(v, priv.id, 'sneak'), /row-level security/);
    await as(h, (tx) => tx.query(`select public.end_stream($1)`, [priv.id]));
    await assert.rejects(say(h, priv.id, 'late'), /row-level security/);
  });

  test("blocked viewers cannot chat; a blocker does not see the blocked user's messages", async () => {
    const h = await mkUser('ch5'),
      v = await mkUser('cv5'),
      w = await mkUser('cw5');
    const s = await liveStream(h);
    await say(v, s.id, 'rude');
    await say(w, s.id, 'nice');
    await as(w, (tx) =>
      tx.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [w, v]),
    );
    const seenByW = await as(w, (tx) =>
      rows(tx, `select body from public.chat_messages where stream_id = $1`, [s.id]),
    );
    assert.deepEqual(
      seenByW.map((m) => m.body),
      ['nice'],
    );
    await as(h, (tx) =>
      tx.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [h, v]),
    );
    await assert.rejects(say(v, s.id, 'again'), /row-level security/);
  });

  test('host can remove a message; other viewers (even the author) cannot', async () => {
    const h = await mkUser('ch6'),
      v = await mkUser('cv6'),
      x = await mkUser('cx6');
    const s = await liveStream(h);
    await say(v, s.id, 'bad');
    const [{ id }] = (
      await db.query(`select id from public.chat_messages where stream_id = $1`, [s.id])
    ).rows;
    await as(x, (tx) => tx.query(`delete from public.chat_messages where id = $1`, [id]));
    await as(v, (tx) => tx.query(`delete from public.chat_messages where id = $1`, [id]));
    assert.equal(
      (
        await as(h, (tx) =>
          rows(tx, `select id from public.chat_messages where stream_id = $1`, [s.id]),
        )
      ).length,
      1,
    );
    await as(h, (tx) => tx.query(`delete from public.chat_messages where id = $1`, [id]));
    assert.equal(
      (
        await as(h, (tx) =>
          rows(tx, `select id from public.chat_messages where stream_id = $1`, [s.id]),
        )
      ).length,
      0,
    );
  });

  test('a moderator mute blocks posting', async () => {
    const h = await mkUser('ch7'),
      v = await mkUser('cv7'),
      m = await mkUser('cm7');
    const s = await liveStream(h);
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'moderator')`, [m]);
    await as(m, (tx) =>
      tx.query(
        `insert into public.moderation_actions (moderator_id, target_user_id, stream_id, action) values ($1, $2, $3, 'mute_chat')`,
        [m, v, s.id],
      ),
    );
    await assert.rejects(say(v, s.id, 'hi'), /chat_muted/);
  });
});

describe('moderation & roles', () => {
  test('users cannot grant themselves roles or act as moderators', async () => {
    const u = await mkUser('mod1');
    await assert.rejects(
      as(u, (tx) =>
        tx.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [u]),
      ),
      /permission denied/,
    );
    await assert.rejects(
      as(u, (tx) =>
        tx.query(
          `insert into public.moderation_actions (moderator_id, target_user_id, action) values ($1, $1, 'warn')`,
          [u],
        ),
      ),
      /row-level security/,
    );
  });

  test('reports: reporter sees own, strangers see none, moderators see all', async () => {
    const a = await mkUser('ra'),
      b = await mkUser('rb'),
      x = await mkUser('rx'),
      m = await mkUser('rm');
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'moderator')`, [m]);
    await as(a, (tx) =>
      tx.query(
        `insert into public.reports (reporter_id, target_type, target_user_id, reason) values ($1, 'user', $2, 'spam')`,
        [a, b],
      ),
    );
    assert.equal((await as(a, (tx) => rows(tx, `select * from public.reports`))).length, 1);
    assert.equal(
      (await as(b, (tx) => rows(tx, `select * from public.reports`))).length,
      0,
      'reported user must not see reporter',
    );
    assert.equal((await as(x, (tx) => rows(tx, `select * from public.reports`))).length, 0);
    assert.ok((await as(m, (tx) => rows(tx, `select * from public.reports`))).length >= 1);
  });

  test('reports cannot be forged for another reporter, self-reported, or resolved by users', async () => {
    const a = await mkUser('rf'),
      b = await mkUser('rg');
    await assert.rejects(
      as(a, (tx) =>
        tx.query(
          `insert into public.reports (reporter_id, target_type, target_user_id, reason) values ($1, 'user', $1, 'spam')`,
          [b],
        ),
      ),
      /row-level security/,
    );
    await assert.rejects(
      as(a, (tx) =>
        tx.query(
          `insert into public.reports (reporter_id, target_type, target_user_id, reason) values ($1, 'user', $1, 'spam')`,
          [a],
        ),
      ),
      /row-level security/,
    );
    await as(a, (tx) =>
      tx.query(
        `insert into public.reports (reporter_id, target_type, target_user_id, reason) values ($1, 'user', $2, 'spam')`,
        [a, b],
      ),
    );
    const [{ id }] = (await db.query(`select id from public.reports where reporter_id = $1`, [a]))
      .rows;
    await as(a, (tx) =>
      tx.query(`update public.reports set status = 'dismissed' where id = $1`, [id]),
    );
    assert.equal(
      (await db.query(`select status from public.reports where id = $1`, [id])).rows[0].status,
      'open',
    );
  });

  test('moderators can end any stream', async () => {
    const h = await mkUser('me'),
      m = await mkUser('mm');
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'moderator')`, [m]);
    const s = await liveStream(h);
    assert.equal(
      (await as(m, (tx) => rows(tx, `select public.end_stream($1) ok`, [s.id])))[0].ok,
      true,
    );
  });
});

describe('location', () => {
  const share = (sid, uid, expiresSql) =>
    db.query(
      `insert into public.location_shares (stream_id, user_id, approx_lat, approx_lng, expires_at)
       values ($1, $2, 5.03, 7.93, ${expiresSql})`,
      [sid, uid],
    );

  test('visible only while stream is live, public and unexpired', async () => {
    const h = await mkUser('lh'),
      v = await mkUser('lv');
    const s = await liveStream(h);
    await share(s.id, h, `now() + interval '10 minutes'`);
    assert.equal((await as(v, (tx) => rows(tx, `select * from public.location_shares`))).length, 1);
    await db.query(`update public.location_shares set expires_at = now() - interval '1 second'`);
    assert.equal(
      (
        await as(v, (tx) =>
          rows(tx, `select * from public.location_shares where stream_id = $1`, [s.id]),
        )
      ).length,
      0,
      'expired',
    );
  });

  test('ending the stream deletes the location; private streams never expose it', async () => {
    const h = await mkUser('lh2'),
      v = await mkUser('lv2');
    const s = await liveStream(h);
    await share(s.id, h, `now() + interval '10 minutes'`);
    await as(h, (tx) => tx.query(`select public.end_stream($1)`, [s.id]));
    assert.equal(
      (
        await db.query(`select count(*)::int n from public.location_shares where stream_id = $1`, [
          s.id,
        ])
      ).rows[0].n,
      0,
    );
    const p = await liveStream(h, 'private');
    await share(p.id, h, `now() + interval '10 minutes'`);
    assert.equal(
      (
        await as(v, (tx) =>
          rows(tx, `select * from public.location_shares where stream_id = $1`, [p.id]),
        )
      ).length,
      0,
    );
  });

  test('clients cannot write locations directly and coordinates are coarse', async () => {
    const h = await mkUser('lh3');
    const s = await liveStream(h);
    await assert.rejects(
      as(h, (tx) =>
        tx.query(
          `insert into public.location_shares (stream_id, user_id, approx_lat, approx_lng, expires_at)
         values ($1, $2, 5, 7, now() + interval '1 hour')`,
          [s.id, h],
        ),
      ),
      /permission denied/,
    );
    const col = (
      await db.query(
        `select numeric_scale from information_schema.columns where table_name = 'location_shares' and column_name = 'approx_lat'`,
      )
    ).rows[0];
    assert.equal(col.numeric_scale, 2);
  });
});

describe('recordings', () => {
  test('private recordings are hidden from others; public+ready are visible; host can delete', async () => {
    const h = await mkUser('rch'),
      v = await mkUser('rcv');
    const s = await liveStream(h);
    await db.query(
      `insert into public.recordings (stream_id, host_id, status, visibility) values ($1, $2, 'ready', 'private')`,
      [s.id, h],
    );
    await db.query(
      `insert into public.recordings (stream_id, host_id, status, visibility) values ($1, $2, 'processing', 'public')`,
      [s.id, h],
    );
    assert.equal((await as(v, (tx) => rows(tx, `select * from public.recordings`))).length, 0);
    await db.query(`update public.recordings set visibility = 'public' where status = 'ready'`);
    assert.equal(
      (await as(v, (tx) => rows(tx, `select * from public.recordings`))).length,
      1,
      'only ready+public',
    );
    await as(v, (tx) => tx.query(`delete from public.recordings`));
    assert.equal(
      (await db.query(`select count(*)::int n from public.recordings where host_id = $1`, [h]))
        .rows[0].n,
      2,
    );
    await as(h, (tx) => tx.query(`delete from public.recordings`));
    assert.equal(
      (await db.query(`select count(*)::int n from public.recordings where host_id = $1`, [h]))
        .rows[0].n,
      0,
    );
  });

  test('clients cannot create recordings or change their status', async () => {
    const h = await mkUser('rch2');
    const s = await liveStream(h);
    await assert.rejects(
      as(h, (tx) =>
        tx.query(`insert into public.recordings (stream_id, host_id) values ($1, $2)`, [s.id, h]),
      ),
      /permission denied/,
    );
  });
});

describe('wallet', () => {
  test('ledger is read-only for clients, append-only for everyone, and idempotent', async () => {
    const a = await mkUser('wa'),
      b = await mkUser('wb');
    await assert.rejects(
      as(a, (tx) =>
        tx.query(
          `insert into public.wallet_transactions (user_id, kind, amount_coins, idempotency_key) values ($1, 'purchase', 1000, 'k1')`,
          [a],
        ),
      ),
      /permission denied/,
    );
    await db.query(
      `insert into public.wallet_transactions (user_id, kind, amount_coins, idempotency_key, provider, provider_event_id)
      values ($1, 'purchase', 500, 'evt_1', 'test', 'evt_1')`,
      [a],
    );
    await assert.rejects(
      db.query(
        `insert into public.wallet_transactions (user_id, kind, amount_coins, idempotency_key, provider, provider_event_id)
      values ($1, 'purchase', 500, 'evt_1b', 'test', 'evt_1')`,
        [a],
      ),
      /unique|duplicate/i,
    );
    await assert.rejects(
      db.query(
        `insert into public.wallet_transactions (user_id, kind, amount_coins, idempotency_key)
      values ($1, 'purchase', 500, 'evt_1')`,
        [a],
      ),
      /unique|duplicate/i,
    );
    await assert.rejects(
      db.query(
        `insert into public.wallet_transactions (user_id, kind, amount_coins, idempotency_key)
      values ($1, 'adjustment', 0, 'zero')`,
        [a],
      ),
      /check|violates/i,
    );
    await assert.rejects(
      as(a, (tx) => tx.query(`update public.wallet_transactions set amount_coins = 999999`)),
      /permission denied/,
    );
    await assert.rejects(
      db.query(`update public.wallet_transactions set amount_coins = 999999`),
      /append-only/,
    );
    await assert.rejects(db.query(`delete from public.wallet_transactions`), /append-only/);
    assert.equal(
      Number((await as(a, (tx) => rows(tx, `select public.wallet_balance() b`)))[0].b),
      500,
    );
    assert.equal(
      Number((await as(b, (tx) => rows(tx, `select public.wallet_balance() b`)))[0].b),
      0,
    );
    assert.equal(
      (await as(b, (tx) => rows(tx, `select * from public.wallet_transactions`))).length,
      0,
    );
  });

  test('gift catalogue is read-only for clients', async () => {
    const a = await mkUser('wg');
    await db.query(
      `insert into public.gifts (slug, name, coin_price, icon) values ('rose', 'Rose', 10, '🌹')`,
    );
    assert.equal((await as(a, (tx) => rows(tx, `select * from public.gifts`))).length, 1);
    await assert.rejects(
      as(a, (tx) => tx.query(`update public.gifts set coin_price = 1`)),
      /permission denied/,
    );
  });
});

describe('storage policies', () => {
  test('users can only write inside their own avatar folder', async () => {
    const a = await mkUser('sta'),
      b = await mkUser('stb');
    await as(a, (tx) =>
      tx.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [
        `${a}/avatar.jpg`,
      ]),
    );
    await assert.rejects(
      as(a, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [
          `${b}/avatar.jpg`,
        ]),
      ),
      /row-level security/,
    );
    await assert.rejects(
      as(a, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('avatars', 'loose.jpg')`),
      ),
      /row-level security/,
    );
  });

  test('recordings bucket is private and not publicly readable', async () => {
    const buckets = (await db.query(`select id, public from storage.buckets`)).rows;
    assert.equal(buckets.find((x) => x.id === 'recordings').public, false);
    const a = await mkUser('stc'),
      b = await mkUser('std');
    await db.query(`insert into storage.objects (bucket_id, name) values ('recordings', $1)`, [
      `${a}/r.mp4`,
    ]);
    assert.equal(
      (
        await as(b, (tx) =>
          rows(tx, `select * from storage.objects where bucket_id = 'recordings'`),
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await as(a, (tx) =>
          rows(tx, `select * from storage.objects where bucket_id = 'recordings'`),
        )
      ).length,
      1,
    );
  });
});

describe('livekit sync (service role only)', () => {
  test('clients cannot call the sync functions', async () => {
    const host = await mkUser('synchost');
    const s = await liveStream(host);
    for (const sql of [
      `select public.set_viewer_count('${s.room_name}', 999)`,
      `select public.end_stream_by_room('${s.room_name}')`,
    ]) {
      await assert.rejects(
        as(host, (tx) => rows(tx, sql)),
        /permission denied/,
      );
      await assert.rejects(
        asAnon((tx) => rows(tx, sql)),
        /permission denied/,
      );
    }
  });

  test('viewer count is set absolutely, floored at zero, and only for live streams', async () => {
    const host = await mkUser('counthost');
    const s = await liveStream(host);
    await asRole('service_role', null, (tx) =>
      rows(tx, `select public.set_viewer_count($1, 7)`, [s.room_name]),
    );
    await asRole('service_role', null, (tx) =>
      rows(tx, `select public.set_viewer_count($1, 7)`, [s.room_name]),
    ); // duplicate webhook
    let [row] = await as(host, (tx) =>
      rows(tx, `select viewer_count from public.streams where id = $1`, [s.id]),
    );
    assert.equal(row.viewer_count, 7);
    await asRole('service_role', null, (tx) =>
      rows(tx, `select public.set_viewer_count($1, -3)`, [s.room_name]),
    );
    [row] = await as(host, (tx) =>
      rows(tx, `select viewer_count from public.streams where id = $1`, [s.id]),
    );
    assert.equal(row.viewer_count, 0);
    await as(host, (tx) => rows(tx, `select public.end_stream($1)`, [s.id]));
    const [res] = await asRole('service_role', null, (tx) =>
      rows(tx, `select public.set_viewer_count($1, 5) as ok`, [s.room_name]),
    );
    assert.equal(res.ok, false);
  });

  test('only the host leaving (or the room closing) ends a stream', async () => {
    const host = await mkUser('leavehost');
    const viewer = await mkUser('leaveviewer');
    const s = await liveStream(host);
    const svc = (sql, p) => asRole('service_role', null, (tx) => rows(tx, sql, p));
    const [a] = await svc(`select public.end_stream_by_room($1, $2) as ok`, [s.room_name, viewer]);
    assert.equal(a.ok, false);
    let [st] = await as(host, (tx) =>
      rows(tx, `select status from public.streams where id = $1`, [s.id]),
    );
    assert.equal(st.status, 'live');
    const [b] = await svc(`select public.end_stream_by_room($1, $2) as ok`, [s.room_name, host]);
    assert.equal(b.ok, true);
    [st] = await as(host, (tx) =>
      rows(tx, `select status, viewer_count from public.streams where id = $1`, [s.id]),
    );
    assert.equal(st.status, 'ended');
    assert.equal(st.viewer_count, 0);
  });
});
