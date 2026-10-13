-- RealLife Live — core schema (tables, constraints, indexes).
-- Security (RLS + grants) lives in 0003_security.sql; logic (functions/triggers) in 0002_logic.sql.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── Identity ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text,
  bio text check (bio is null or char_length(bio) <= 160),
  links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Roles are never writable by clients (no write grants / policies).
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Private per-user preferences (owner-only).
create table public.profile_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  is_private_account boolean not null default false,
  notify_followers boolean not null default true,
  notify_invites boolean not null default true,
  notify_go_live boolean not null default true,
  location_sharing_enabled boolean not null default false, -- opt-in, off by default
  recording_default boolean not null default false,
  data_saver boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger profile_settings_updated_at before update on public.profile_settings
  for each row execute function public.set_updated_at();

-- ───────────────────────── Social graph ─────────────────────────
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

-- ───────────────────────── Streams ─────────────────────────
create table public.streams (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  category text check (category is null or char_length(category) <= 30),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  status text not null default 'created' check (status in ('created', 'live', 'ended', 'failed')),
  room_name text not null unique default ('rl_' || replace(gen_random_uuid()::text, '-', '')),
  recording_enabled boolean not null default false,
  location_sharing boolean not null default false,
  viewer_count integer not null default 0 check (viewer_count >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  last_heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'live' or started_at is not null),
  check (status <> 'ended' or ended_at is not null)
);
create trigger streams_updated_at before update on public.streams
  for each row execute function public.set_updated_at();
-- A host can only have one active stream: prevents duplicates and stale double-rooms.
create unique index streams_one_active_per_host on public.streams (host_id)
  where status in ('created', 'live');
create index streams_live_feed_idx on public.streams (started_at desc)
  where status = 'live';
create index streams_host_idx on public.streams (host_id, created_at desc);

create table public.stream_participants (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'guest' check (role in ('guest')),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'removed', 'left')),
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  unique (stream_id, user_id)
);
create index stream_participants_stream_idx on public.stream_participants (stream_id, status);

create table public.stream_invitations (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'view' check (kind in ('view', 'guest')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stream_id, invitee_id, kind),
  check (inviter_id <> invitee_id)
);
create trigger stream_invitations_updated_at before update on public.stream_invitations
  for each row execute function public.set_updated_at();
create index stream_invitations_invitee_idx on public.stream_invitations (invitee_id, status);

-- ───────────────────────── Chat & reactions ─────────────────────────
-- Chat architecture: Supabase Postgres is the single source of truth (persisted, moderatable,
-- RLS-enforced); Supabase Realtime streams inserts to clients. LiveKit carries media only.
create table public.chat_messages (
  id bigint generated always as identity primary key,
  stream_id uuid not null references public.streams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index chat_messages_stream_idx on public.chat_messages (stream_id, id desc);
create index chat_messages_user_recent_idx on public.chat_messages (user_id, created_at desc);

-- Hearts etc. animate from Realtime *broadcast* events (not stored per tap).
-- This table only holds batched per-viewer totals, flushed occasionally by the client.
create table public.reactions (
  stream_id uuid not null references public.streams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'heart' check (kind in ('heart', 'fire', 'clap', 'wow')),
  total integer not null default 0 check (total between 0 and 100000),
  updated_at timestamptz not null default now(),
  primary key (stream_id, user_id, kind)
);

-- ───────────────────────── Recordings & location ─────────────────────────
create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams (id) on delete cascade,
  host_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'recording', 'processing', 'ready', 'failed')),
  egress_id text unique,
  storage_path text,
  thumbnail_path text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger recordings_updated_at before update on public.recordings
  for each row execute function public.set_updated_at();
create index recordings_host_idx on public.recordings (host_id, created_at desc);

-- Only an approximate, expiring position. Exact coordinates are never stored.
create table public.location_shares (
  stream_id uuid primary key references public.streams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  approx_lat numeric(6, 2) not null check (approx_lat between -90 and 90),
  approx_lng numeric(6, 2) not null check (approx_lng between -180 and 180),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index location_shares_expiry_idx on public.location_shares (expires_at);

-- ───────────────────────── Notifications ─────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null check (type in
    ('new_follower', 'stream_invite', 'guest_approved', 'guest_request', 'creator_live', 'gift_received')),
  stream_id uuid references public.streams (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ───────────────────────── Gifts & wallet (ledger is append-only, server-written) ─────────────────────────
create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]{2,30}$'),
  name text not null,
  coin_price integer not null check (coin_price > 0),
  icon text not null,
  animation text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  kind text not null check (kind in
    ('purchase', 'gift_sent', 'gift_received', 'refund', 'payout', 'adjustment')),
  amount_coins bigint not null check (amount_coins <> 0), -- signed: credits positive, debits negative
  gift_id uuid references public.gifts (id),
  stream_id uuid references public.streams (id) on delete set null,
  counterparty_id uuid references public.profiles (id) on delete set null,
  idempotency_key text not null unique,
  provider text,
  provider_event_id text,
  created_at timestamptz not null default now()
);
create unique index wallet_provider_event_uidx on public.wallet_transactions (provider, provider_event_id)
  where provider_event_id is not null;
create index wallet_user_idx on public.wallet_transactions (user_id, created_at desc);

-- ───────────────────────── Moderation ─────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('user', 'stream', 'message')),
  target_user_id uuid references public.profiles (id) on delete set null,
  target_stream_id uuid references public.streams (id) on delete set null,
  target_message_id bigint, -- deliberately not a FK: evidence must survive message deletion
  target_message_body text, -- snapshot of the reported message
  reason text not null check (reason in
    ('spam', 'harassment', 'nudity', 'violence', 'self_harm', 'illegal', 'impersonation', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_open_idx on public.reports (created_at) where status in ('open', 'reviewing');

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete cascade,
  stream_id uuid references public.streams (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  action text not null check (action in ('warn', 'mute_chat', 'remove_guest', 'end_stream', 'suspend')),
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions (target_user_id, action);
