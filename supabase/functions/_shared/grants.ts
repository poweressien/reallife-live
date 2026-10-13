// Pure access decision for LiveKit tokens. No I/O, so it is unit-tested with node:test.
// RLS has already filtered the stream (a user who may not see it gets `stream = null`),
// so "not found" and "not allowed" are deliberately indistinguishable to the caller.

export type StreamRow = {
  id: string;
  host_id: string;
  status: 'created' | 'live' | 'ended' | 'failed';
  room_name: string;
};

export type RoomGrant = {
  room: string;
  roomJoin: true;
  canSubscribe: true;
  canPublish: boolean;
  canPublishData: boolean;
  canPublishSources: ('camera' | 'microphone')[];
  hidden: false;
};

export type Decision =
  | { allowed: true; role: 'host' | 'guest' | 'viewer'; grant: RoomGrant }
  | { allowed: false; status: 401 | 404 | 409; code: 'unauthenticated' | 'not_found' | 'stream_ended' | 'stream_not_live' };

export const TOKEN_TTL_SECONDS = 600; // short-lived; LiveKit refreshes connected sessions itself

const base = (room: string) => ({ room, roomJoin: true as const, canSubscribe: true as const, hidden: false as const });

export function decideAccess(input: {
  userId: string | null;
  stream: StreamRow | null;
  isApprovedGuest: boolean;
}): Decision {
  const { userId, stream, isApprovedGuest } = input;
  if (!userId) return { allowed: false, status: 401, code: 'unauthenticated' };
  if (!stream) return { allowed: false, status: 404, code: 'not_found' };

  if (stream.status === 'ended' || stream.status === 'failed') {
    return { allowed: false, status: 409, code: 'stream_ended' };
  }

  if (stream.host_id === userId) {
    return {
      allowed: true,
      role: 'host',
      grant: { ...base(stream.room_name), canPublish: true, canPublishData: true, canPublishSources: ['camera', 'microphone'] },
    };
  }

  // Everyone else may only join once the host has actually gone live.
  if (stream.status !== 'live') return { allowed: false, status: 409, code: 'stream_not_live' };

  if (isApprovedGuest) {
    return {
      allowed: true,
      role: 'guest',
      grant: { ...base(stream.room_name), canPublish: true, canPublishData: false, canPublishSources: ['camera', 'microphone'] },
    };
  }

  return {
    allowed: true,
    role: 'viewer',
    grant: { ...base(stream.room_name), canPublish: false, canPublishData: false, canPublishSources: [] },
  };
}
