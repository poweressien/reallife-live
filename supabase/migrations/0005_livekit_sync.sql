-- RealLife Live — LiveKit → database sync (called ONLY by the livekit-webhook Edge Function, service role).
-- Viewer count is defined server-side as (participants − publishers) reported by LiveKit for the room.
-- It is set as an absolute value, so duplicated/reordered webhooks cannot drift the count.

create or replace function public.set_viewer_count(p_room text, p_count integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.streams
     set viewer_count = greatest(coalesce(p_count, 0), 0)
   where room_name = p_room and status = 'live';
  return found;
end $$;

-- Ends a stream because LiveKit closed the room, or because the HOST (identity = host uuid) left it.
-- Guests/viewers leaving never end the stream.
create or replace function public.end_stream_by_room(p_room text, p_left_identity text default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.streams
     set status = 'ended', ended_at = now(), viewer_count = 0
   where room_name = p_room
     and status in ('created', 'live')
     and (p_left_identity is null or host_id::text = p_left_identity);
  return found;
end $$;

revoke execute on function public.set_viewer_count(text, integer) from public, anon, authenticated;
revoke execute on function public.end_stream_by_room(text, text) from public, anon, authenticated;
grant execute on function public.set_viewer_count(text, integer) to service_role;
grant execute on function public.end_stream_by_room(text, text) to service_role;
