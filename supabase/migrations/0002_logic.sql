-- RealLife Live — server-side logic. SECURITY DEFINER functions always pin search_path.

-- ───────────────────────── Authorization helpers (used by RLS policies) ─────────────────────────
create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles where user_id = auth.uid() and role in ('admin', 'moderator')
  );
$$;

create or replace function public.is_stream_host(p_stream uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.streams where id = p_stream and host_id = auth.uid());
$$;

create or replace function public.is_blocked_either_way(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- The single source of truth for "may this user see / join this stream?".
create or replace function public.can_view_stream(p_stream uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.streams s
    where s.id = p_stream
      and auth.uid() is not null
      and (
        s.host_id = auth.uid()
        or (
          not public.is_blocked_either_way(s.host_id, auth.uid())
          and (
            (s.visibility = 'public' and s.status = 'live')
            or (
              s.visibility = 'private'
              and s.status in ('created', 'live')
              and (
                exists (
                  select 1 from public.stream_invitations i
                  where i.stream_id = s.id and i.invitee_id = auth.uid() and i.status = 'accepted'
                )
                or exists (
                  select 1 from public.stream_participants p
                  where p.stream_id = s.id and p.user_id = auth.uid() and p.status = 'approved'
                )
              )
            )
          )
        )
      )
  );
$$;

create or replace function public.can_chat_in_stream(p_stream uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_view_stream(p_stream)
    and exists (select 1 from public.streams where id = p_stream and status = 'live');
$$;

-- ───────────────────────── Profiles ─────────────────────────
create or replace function public.handle_new_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profile_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_profile_created after insert on public.profiles
  for each row execute function public.handle_new_profile();

create or replace function public.get_follow_counts(p_user uuid)
returns table (followers bigint, following bigint)
language sql stable security invoker set search_path = '' as $$
  select
    (select count(*) from public.follows where followee_id = p_user),
    (select count(*) from public.follows where follower_id = p_user);
$$;

-- ───────────────────────── Follow / block side-effects ─────────────────────────
create or replace function public.notify_new_follower()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select notify_followers from public.profile_settings where user_id = new.followee_id), true) then
    insert into public.notifications (user_id, actor_id, type)
    values (new.followee_id, new.follower_id, 'new_follower');
  end if;
  return new;
end $$;
create trigger on_follow_created after insert on public.follows
  for each row execute function public.notify_new_follower();

create or replace function public.cleanup_follows_on_block()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end $$;
create trigger on_block_created after insert on public.blocks
  for each row execute function public.cleanup_follows_on_block();

-- ───────────────────────── Stream lifecycle (clients never UPDATE streams directly) ─────────────────────────
create or replace function public.create_stream(
  p_title text,
  p_category text,
  p_visibility text,
  p_recording boolean,
  p_location boolean
) returns public.streams
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  s public.streams;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile_required';
  end if;
  p_title := btrim(coalesce(p_title, ''));
  if char_length(p_title) not between 1 and 80 then raise exception 'invalid_title'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'invalid_visibility'; end if;
  p_category := nullif(btrim(coalesce(p_category, '')), '');
  if p_category is not null and char_length(p_category) > 30 then raise exception 'invalid_category'; end if;

  -- Reap this host's abandoned streams so they can't block a new broadcast or stay "live" forever.
  update public.streams
     set status = 'ended', ended_at = now()
   where host_id = uid
     and ((status = 'live' and last_heartbeat_at < now() - interval '90 seconds')
       or (status = 'created' and created_at < now() - interval '5 minutes'));

  begin
    insert into public.streams (host_id, title, category, visibility, recording_enabled, location_sharing)
    values (uid, p_title, p_category, p_visibility, coalesce(p_recording, false), coalesce(p_location, false))
    returning * into s;
  exception when unique_violation then
    raise exception 'already_live';
  end;
  return s;
end $$;

-- Called by the host only after the camera/mic tracks were actually published.
create or replace function public.mark_stream_live(p_stream uuid)
returns public.streams
language plpgsql security definer set search_path = '' as $$
declare s public.streams;
begin
  update public.streams
     set status = 'live', started_at = now(), last_heartbeat_at = now()
   where id = p_stream and host_id = auth.uid() and status = 'created'
   returning * into s;
  if s.id is null then raise exception 'invalid_stream_state'; end if;
  return s;
end $$;

create or replace function public.stream_heartbeat(p_stream uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.streams set last_heartbeat_at = now()
   where id = p_stream and host_id = auth.uid() and status = 'live';
  return found;
end $$;

create or replace function public.end_stream(p_stream uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.streams
     set status = 'ended', ended_at = now()
   where id = p_stream
     and status in ('created', 'live')
     and (host_id = auth.uid() or public.is_moderator());
  return found;
end $$;

-- Run by a scheduler (pg_cron / Edge cron) with the service role.
create or replace function public.end_stale_streams()
returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with ended as (
    update public.streams
       set status = 'ended', ended_at = now()
     where (status = 'live' and last_heartbeat_at < now() - interval '90 seconds')
        or (status = 'created' and created_at < now() - interval '5 minutes')
    returning 1
  )
  select count(*) into n from ended;
  delete from public.location_shares where expires_at < now();
  return n;
end $$;

create or replace function public.on_stream_ended()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.location_shares where stream_id = new.id;
  update public.stream_participants
     set status = 'left', left_at = now()
   where stream_id = new.id and status in ('requested', 'approved');
  return new;
end $$;
create trigger streams_after_end after update of status on public.streams
  for each row when (new.status = 'ended' and old.status <> 'ended')
  execute function public.on_stream_ended();

-- ───────────────────────── Participants & invitations ─────────────────────────
create or replace function public.touch_participant()
returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.joined_at = now();
  elsif new.status in ('left', 'removed') and old.status is distinct from new.status then
    new.left_at = now();
  end if;
  return new;
end $$;
create trigger stream_participants_touch before update on public.stream_participants
  for each row execute function public.touch_participant();

create or replace function public.notify_guest_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare host uuid;
begin
  select host_id into host from public.streams where id = new.stream_id;
  if tg_op = 'INSERT' and new.status = 'requested' then
    insert into public.notifications (user_id, actor_id, type, stream_id)
    values (host, new.user_id, 'guest_request', new.stream_id);
  elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.notifications (user_id, actor_id, type, stream_id)
    values (new.user_id, host, 'guest_approved', new.stream_id);
  end if;
  return new;
end $$;
create trigger stream_participants_notify after insert or update on public.stream_participants
  for each row execute function public.notify_guest_events();

create or replace function public.on_invitation_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_blocked_either_way(new.inviter_id, new.invitee_id)
     and coalesce((select notify_invites from public.profile_settings where user_id = new.invitee_id), true) then
    insert into public.notifications (user_id, actor_id, type, stream_id, data)
    values (new.invitee_id, new.inviter_id, 'stream_invite', new.stream_id, jsonb_build_object('kind', new.kind));
  end if;
  return new;
end $$;
create trigger stream_invitations_notify after insert on public.stream_invitations
  for each row execute function public.on_invitation_created();

-- Accepting a guest invitation creates the approved participant row; revoking removes access.
create or replace function public.on_invitation_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' and new.kind = 'guest' then
    insert into public.stream_participants (stream_id, user_id, status)
    values (new.stream_id, new.invitee_id, 'approved')
    on conflict (stream_id, user_id) do update set status = 'approved';
  elsif new.status = 'revoked' and old.status is distinct from 'revoked' then
    update public.stream_participants
       set status = 'removed'
     where stream_id = new.stream_id and user_id = new.invitee_id and status in ('requested', 'approved');
  end if;
  return new;
end $$;
create trigger stream_invitations_status after update of status on public.stream_invitations
  for each row execute function public.on_invitation_status();

-- ───────────────────────── Chat ─────────────────────────
create or replace function public.enforce_chat_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recent integer;
begin
  select count(*) into recent from public.chat_messages
   where user_id = new.user_id and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'chat_rate_limited'; end if;
  if exists (
    select 1 from public.moderation_actions m
    where m.target_user_id = new.user_id and m.action = 'mute_chat'
      and (m.stream_id is null or m.stream_id = new.stream_id)
      and (m.expires_at is null or m.expires_at > now())
  ) then
    raise exception 'chat_muted';
  end if;
  new.body = btrim(new.body);
  return new;
end $$;
create trigger chat_messages_limits before insert on public.chat_messages
  for each row execute function public.enforce_chat_limits();

-- ───────────────────────── Wallet (read-only for clients) ─────────────────────────
create or replace function public.wallet_balance()
returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_coins), 0)::bigint
    from public.wallet_transactions where user_id = auth.uid();
$$;

-- Ledger rows are immutable.
create or replace function public.forbid_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'wallet_transactions is append-only';
end $$;
create trigger wallet_no_update before update or delete on public.wallet_transactions
  for each row execute function public.forbid_ledger_mutation();
