-- RealLife Live — Row Level Security, grants and realtime publication.
-- Principle: deny by default. Clients get only the table/column privileges listed here;
-- everything privileged (stream lifecycle, ledger, notifications) goes through
-- SECURITY DEFINER functions or the service role in Edge Functions.

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.profile_settings enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.streams enable row level security;
alter table public.stream_participants enable row level security;
alter table public.stream_invitations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.reactions enable row level security;
alter table public.recordings enable row level security;
alter table public.location_shares enable row level security;
alter table public.notifications enable row level security;
alter table public.gifts enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;

-- ───────────────────────── Reset default privileges ─────────────────────────
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Helpers evaluated inside policies need EXECUTE for the calling role.
grant execute on function public.is_moderator() to authenticated;
grant execute on function public.is_stream_host(uuid) to authenticated;
grant execute on function public.is_blocked_either_way(uuid, uuid) to authenticated;
grant execute on function public.can_view_stream(uuid) to authenticated;
grant execute on function public.can_chat_in_stream(uuid) to authenticated;
-- Client-callable RPCs.
grant execute on function public.get_follow_counts(uuid) to anon, authenticated;
grant execute on function public.create_stream(text, text, text, boolean, boolean) to authenticated;
grant execute on function public.mark_stream_live(uuid) to authenticated;
grant execute on function public.stream_heartbeat(uuid) to authenticated;
grant execute on function public.end_stream(uuid) to authenticated;
grant execute on function public.wallet_balance() to authenticated;
-- Scheduler only.
grant execute on function public.end_stale_streams() to service_role;

-- ───────────────────────── profiles (public read, owner write) ─────────────────────────
grant select on public.profiles to anon, authenticated;
grant insert (id, username, display_name, avatar_url, bio, links) on public.profiles to authenticated;
grant update (username, display_name, avatar_url, bio, links) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ───────────────────────── roles (read own only; never client-writable) ─────────────────────────
grant select on public.user_roles to authenticated;
create policy user_roles_read_own on public.user_roles for select to authenticated using (user_id = auth.uid());

-- ───────────────────────── profile_settings (owner only) ─────────────────────────
grant select on public.profile_settings to authenticated;
grant update (is_private_account, notify_followers, notify_invites, notify_go_live,
              location_sharing_enabled, recording_default, data_saver)
  on public.profile_settings to authenticated;
create policy settings_read_own on public.profile_settings for select to authenticated using (user_id = auth.uid());
create policy settings_update_own on public.profile_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── follows ─────────────────────────
grant select, insert, delete on public.follows to authenticated;
create policy follows_read on public.follows for select to authenticated using (true);
create policy follows_insert_own on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and not public.is_blocked_either_way(follower_id, followee_id));
create policy follows_delete_own on public.follows for delete to authenticated using (follower_id = auth.uid());

-- ───────────────────────── blocks (private to the blocker) ─────────────────────────
grant select, insert, delete on public.blocks to authenticated;
create policy blocks_read_own on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert_own on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete_own on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- ───────────────────────── streams (read-only; lifecycle via RPC) ─────────────────────────
grant select on public.streams to authenticated;
create policy streams_read on public.streams for select to authenticated using (public.can_view_stream(id));
create policy streams_moderator_read on public.streams for select to authenticated using (public.is_moderator());

-- ───────────────────────── stream_participants ─────────────────────────
grant select, insert on public.stream_participants to authenticated;
grant update (status) on public.stream_participants to authenticated;
create policy participants_read on public.stream_participants for select to authenticated
  using (user_id = auth.uid() or public.is_stream_host(stream_id));
create policy participants_request on public.stream_participants for insert to authenticated
  with check (
    user_id = auth.uid() and role = 'guest' and status = 'requested'
    and joined_at is null and left_at is null
    and public.can_view_stream(stream_id)
  );
create policy participants_host_manage on public.stream_participants for update to authenticated
  using (public.is_stream_host(stream_id))
  with check (public.is_stream_host(stream_id) and status in ('approved', 'rejected', 'removed'));
create policy participants_self_leave on public.stream_participants for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'left');

-- ───────────────────────── stream_invitations ─────────────────────────
grant select, insert on public.stream_invitations to authenticated;
grant update (status) on public.stream_invitations to authenticated;
create policy invitations_read on public.stream_invitations for select to authenticated
  using (invitee_id = auth.uid() or public.is_stream_host(stream_id));
create policy invitations_host_create on public.stream_invitations for insert to authenticated
  with check (
    inviter_id = auth.uid() and status = 'pending'
    and public.is_stream_host(stream_id)
    and not public.is_blocked_either_way(inviter_id, invitee_id)
  );
create policy invitations_invitee_respond on public.stream_invitations for update to authenticated
  using (invitee_id = auth.uid() and status = 'pending')
  with check (invitee_id = auth.uid() and status in ('accepted', 'declined'));
create policy invitations_host_revoke on public.stream_invitations for update to authenticated
  using (public.is_stream_host(stream_id))
  with check (public.is_stream_host(stream_id) and status = 'revoked');

-- ───────────────────────── chat_messages ─────────────────────────
grant select, delete, insert (stream_id, user_id, body) on public.chat_messages to authenticated;
create policy chat_read on public.chat_messages for select to authenticated
  using (
    public.can_view_stream(stream_id)
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = user_id)
  );
create policy chat_insert on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid() and public.can_chat_in_stream(stream_id));
-- Moderation removes messages with a hard DELETE so Realtime DELETE events reach every client.
-- (Reports keep a snapshot of the message body as evidence.)
create policy chat_host_delete on public.chat_messages for delete to authenticated
  using (public.is_stream_host(stream_id) or public.is_moderator());

-- ───────────────────────── reactions ─────────────────────────
grant select, insert on public.reactions to authenticated;
grant update (total) on public.reactions to authenticated;
create policy reactions_read on public.reactions for select to authenticated
  using (user_id = auth.uid() or public.is_stream_host(stream_id));
create policy reactions_insert_own on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_chat_in_stream(stream_id));
create policy reactions_update_own on public.reactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── recordings (server-written; host manages visibility/deletion) ─────────────────────────
grant select, delete on public.recordings to authenticated;
grant update (visibility) on public.recordings to authenticated;
create policy recordings_read on public.recordings for select to authenticated
  using (host_id = auth.uid() or (status = 'ready' and visibility = 'public'));
create policy recordings_host_update on public.recordings for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy recordings_host_delete on public.recordings for delete to authenticated using (host_id = auth.uid());

-- ───────────────────────── location_shares (visible only while public stream is live & unexpired) ─────────────────────────
grant select, delete on public.location_shares to authenticated;
create policy location_read on public.location_shares for select to authenticated
  using (
    user_id = auth.uid()
    or (
      expires_at > now()
      and not public.is_blocked_either_way(user_id, auth.uid())
      and exists (
        select 1 from public.streams s
        where s.id = stream_id and s.status = 'live' and s.visibility = 'public'
      )
    )
  );
create policy location_delete_own on public.location_shares for delete to authenticated using (user_id = auth.uid());

-- ───────────────────────── notifications (server-created; owner reads/marks read) ─────────────────────────
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_read_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ───────────────────────── gifts & wallet ─────────────────────────
grant select on public.gifts to authenticated;
create policy gifts_read on public.gifts for select to authenticated using (active);
grant select on public.wallet_transactions to authenticated;
create policy wallet_read_own on public.wallet_transactions for select to authenticated using (user_id = auth.uid());

-- ───────────────────────── reports & moderation ─────────────────────────
grant select, insert on public.reports to authenticated;
grant update (status, resolved_by, resolved_at) on public.reports to authenticated;
create policy reports_insert on public.reports for insert to authenticated
  with check (
    reporter_id = auth.uid() and status = 'open'
    and (
      (target_type = 'user' and target_user_id is not null and target_user_id <> auth.uid())
      or (target_type = 'stream' and target_stream_id is not null)
      or (target_type = 'message' and target_message_id is not null)
    )
  );
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_moderator());
create policy reports_moderator_update on public.reports for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

grant select, insert on public.moderation_actions to authenticated;
create policy mod_actions_read on public.moderation_actions for select to authenticated
  using (target_user_id = auth.uid() or public.is_moderator());
create policy mod_actions_insert on public.moderation_actions for insert to authenticated
  with check (public.is_moderator() and moderator_id = auth.uid());

-- ───────────────────────── Realtime ─────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.chat_messages, public.streams, public.stream_participants,
      public.stream_invitations, public.notifications;
  end if;
end $$;
