import { registerGlobals } from '@livekit/react-native';
import { VideoPresets, type RoomOptions } from 'livekit-client';
import { getEnv } from '@/config/env';
import { getSupabase } from '@/lib/supabase';

let registered = false;
/** registerGlobals() must run once before any LiveKit use. Needs a native dev build (not Expo Go). */
export function ensureLiveKitGlobals(): void {
  if (registered) return;
  registerGlobals();
  registered = true;
}

export const livekitUrl = () => getEnv().EXPO_PUBLIC_LIVEKIT_URL;

export type TokenErrorCode =
  | 'unauthenticated'
  | 'not_found'
  | 'stream_ended'
  | 'stream_not_live'
  | 'server_not_configured'
  | 'network'
  | 'unknown';

export class LiveKitTokenError extends Error {
  constructor(public code: TokenErrorCode) {
    super(code);
    this.name = 'LiveKitTokenError';
  }
}

export function tokenErrorMessage(code: TokenErrorCode): string {
  switch (code) {
    case 'not_found':
      return 'This stream is unavailable. It may have ended, be private, or you may not have access.';
    case 'stream_ended':
      return 'This stream has ended.';
    case 'stream_not_live':
      return 'The host has not started broadcasting yet.';
    case 'unauthenticated':
      return 'Your session expired. Please sign in again.';
    case 'server_not_configured':
      return 'Streaming is not configured on the server yet.';
    case 'network':
      return "Can't reach the server. Check your connection and try again.";
    default:
      return 'Could not join the stream. Please try again.';
  }
}

/** Pure: turns an Edge Function error body/status into a typed code (unit-tested). */
export function parseTokenError(status: number | undefined, body: unknown): TokenErrorCode {
  const code = (body as { error?: string } | null)?.error;
  if (
    code === 'not_found' ||
    code === 'stream_ended' ||
    code === 'stream_not_live' ||
    code === 'unauthenticated' ||
    code === 'server_not_configured'
  ) {
    return code;
  }
  if (status === 401) return 'unauthenticated';
  if (status === 404) return 'not_found';
  return 'unknown';
}

export type TokenResult = { token: string; role: 'host' | 'guest' | 'viewer' };

/** Asks the trusted server function for a short-lived, least-privilege token. Never mints tokens locally. */
export async function fetchLiveKitToken(streamId: string): Promise<TokenResult> {
  const { data, error } = await getSupabase().functions.invoke('livekit-token', {
    body: { stream_id: streamId },
  });
  if (error) {
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === 'function') {
      const body = await res.json().catch(() => null);
      throw new LiveKitTokenError(parseTokenError(res.status, body));
    }
    throw new LiveKitTokenError('network');
  }
  const t = data as { token?: string; role?: TokenResult['role'] } | null;
  if (!t?.token || !t.role) throw new LiveKitTokenError('unknown');
  return { token: t.token, role: t.role };
}

/** Moderate 540p simulcast: sensible on variable mobile networks; viewers adapt automatically. */
export const hostRoomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: { resolution: VideoPresets.h540.resolution, facingMode: 'user' },
  publishDefaults: { simulcast: true, videoEncoding: VideoPresets.h540.encoding },
};

export const viewerRoomOptions: RoomOptions = { adaptiveStream: true, dynacast: true };
