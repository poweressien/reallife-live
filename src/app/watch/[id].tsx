import {
  isTrackReference,
  LiveKitRoom,
  useConnectionState,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ConnectionState, Track } from 'livekit-client';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { LiveBadge } from '@/components/LiveBadge';
import { EmptyState, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { fetchStream } from '@/features/streams/lifecycle';
import {
  ensureLiveKitGlobals,
  fetchLiveKitToken,
  livekitUrl,
  LiveKitTokenError,
  tokenErrorMessage,
  viewerRoomOptions,
} from '@/features/streams/livekit';
import { ControlsRow, RoundButton } from '@/features/streams/RoomControls';
import { useAudioSession } from '@/features/streams/useAudioSession';

/** Viewer: server decides access (token), RLS decides visibility (stream metadata). Subscribe-only. */
export default function WatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [dropped, setDropped] = useState(false);

  useAudioSession();

  // RLS hides ended/private-without-access streams → null means "ended or unavailable". Polled cheaply.
  const info = useQuery({
    queryKey: ['stream', id],
    queryFn: () => fetchStream(id),
    refetchInterval: 10_000,
  });
  const ended = info.isSuccess && (info.data === null || info.data.status !== 'live');

  useEffect(() => {
    ensureLiveKitGlobals();
    let active = true;
    fetchLiveKitToken(id)
      .then((t) => active && setToken(t.token))
      .catch((e) => {
        if (!active) return;
        const code = e instanceof LiveKitTokenError ? e.code : 'unknown';
        setError({
          message: tokenErrorMessage(code),
          retry: code === 'network' || code === 'unknown',
        });
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (ended) {
    return (
      <View style={styles.fill}>
        <EmptyState
          icon="videocam-off-outline"
          title="This stream has ended"
          message="Thanks for watching."
          actionLabel="Back to live"
          onAction={leave}
        />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.fill}>
        <ErrorState
          message={error.message}
          onRetry={
            error.retry
              ? () => {
                  setError(null);
                  setToken(null);
                  setAttempt((n) => n + 1);
                }
              : undefined
          }
        />
        <Button title="Leave" variant="secondary" onPress={leave} style={{ margin: 16 }} />
      </View>
    );
  }
  if (!token) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color="#FFFFFF" />
        <Text color="#FFFFFF">Joining stream…</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <LiveKitRoom
        serverUrl={livekitUrl()}
        token={token}
        connect
        audio={false}
        video={false}
        options={viewerRoomOptions}
        onDisconnected={() => setDropped(true)}
        onConnected={() => setDropped(false)}
        onError={() =>
          setError({ message: 'Connection error. Check your network and retry.', retry: true })
        }
      >
        <ViewerStage dropped={dropped} />
      </LiveKitRoom>

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <LiveBadge />
        {info.data ? (
          <View style={styles.host}>
            <Avatar uri={info.data.host.avatar_url} name={info.data.host.display_name} size={32} />
            <View style={{ flexShrink: 1 }}>
              <Text variant="label" color="#FFFFFF" numberOfLines={1}>
                {info.data.title}
              </Text>
              <Text variant="caption" color="#DDD" numberOfLines={1}>
                @{info.data.host.username} · {info.data.viewer_count} watching
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <ControlsRow>
          <RoundButton icon="exit-outline" label="Leave stream" onPress={leave} />
        </ControlsRow>
      </View>
    </View>
  );
}

function ViewerStage({ dropped }: { dropped: boolean }) {
  const state = useConnectionState();
  const cams = useTracks([Track.Source.Camera]);
  const hostCam = cams.find((t) => !t.participant.isLocal);
  const message = dropped
    ? 'Connection lost. Trying to reconnect…'
    : state === ConnectionState.Reconnecting
      ? 'Reconnecting…'
      : state !== ConnectionState.Connected
        ? 'Connecting…'
        : !hostCam
          ? 'Waiting for the host’s video…'
          : null;

  return (
    <View style={StyleSheet.absoluteFill}>
      {hostCam && isTrackReference(hostCam) ? (
        <VideoTrack trackRef={hostCam} style={StyleSheet.absoluteFill} objectFit="cover" />
      ) : null}
      {message ? (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
          <Text color="#FFFFFF" accessibilityLiveRegion="polite">
            {message}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  host: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexShrink: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 999,
    paddingRight: 12,
  },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});
