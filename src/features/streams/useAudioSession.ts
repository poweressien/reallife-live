import { AudioSession } from '@livekit/react-native';
import { useEffect } from 'react';

/** Starts the native audio session for the lifetime of a live screen and always releases it. */
export function useAudioSession(): void {
  useEffect(() => {
    AudioSession.startAudioSession().catch(() => undefined);
    return () => {
      AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, []);
}
