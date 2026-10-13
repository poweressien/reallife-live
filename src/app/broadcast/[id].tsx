import {
  isTrackReference,
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { ConnectionState, Track, type LocalVideoTrack } from 'livekit-client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { LiveBadge } from '@/components/LiveBadge';
import { ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import {
  endStream,
  markStreamLive,
  sendHeartbeat,
  streamErrorMessage,
} from '@/features/streams/lifecycle';
import {
  ensureLiveKitGlobals,
  fetchLiveKitToken,
  hostRoomOptions,
  livekitUrl,
  LiveKitTokenError,
  tokenErrorMessage,
} from '@/features/streams/livekit';
import { ControlsRow, RoundButton } from '@/features/streams/RoomControls';
import { useAudioSession } from '@/features/streams/useAudioSession';

const HEARTBEAT_MS = 30_000;

/** Host screen. Order matters: token → connect → tracks actually published → mark_stream_live → heartbeats. */
export default function BroadcastScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ending = useRef(false);

  useKeepAwake();
  useAudioSession();

  useEffect(() => {
    ensureLiveKitGlobals();
    let active = true;
    fetchLiveKitToken(id)
      .then((t) => {
        if (!active) return;
        if (t.role !== 'host') setError('Only the host can broadcast this stream.');
        else setToken(t.token);
      })
      .catch(
        (e) =>
          active &&
          setError(
            e instanceof LiveKitTokenError
              ? tokenErrorMessage(e.code)
              : 'Could not start the broadcast.',
          ),
      );
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const finish = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    try {
      await endStream(id); // status → ended; trigger notifies clients; LiveKit room is dropped below
    } catch {
      // The server reaper ends it within ~90s even if this call failed (offline).
    }
    router.replace('/(tabs)');
  }, [id]);

  if (error) {
    return (
      <View style={styles.fill}>
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setToken(null);
            setAttempt((n) => n + 1);
          }}
        />
        <Button
          title="End broadcast"
          variant="secondary"
          onPress={finish}
          style={styles.bottomBtn}
        />
      </View>
    );
  }
  if (!token) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color="#FFFFFF" />
        <Text color="#FFFFFF">Starting your broadcast…</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={livekitUrl()}
      token={token}
      connect
      audio
      video
      options={hostRoomOptions}
      onError={() => setError('Connection error. Check your network and retry.')}
      onMediaDeviceFailure={() =>
        setError(
          'Camera or microphone is unavailable. Allow access in your phone settings, then retry.',
        )
      }
    >
      <HostStage
        streamId={id}
        onEnd={finish}
        onServerEnded={() => {
          Alert.alert('Broadcast ended', 'The server ended this broadcast.');
          void finish();
        }}
      />
    </LiveKitRoom>
  );
}

function HostStage({
  streamId,
  onEnd,
  onServerEnded,
}: {
  streamId: string;
  onEnd: () => void;
  onServerEnded: () => void;
}) {
  const insets = useSafeAreaInsets();
  const state = useConnectionState();
  const { localParticipant, cameraTrack, microphoneTrack, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();
  const camRefs = useTracks([Track.Source.Camera]);
  const localCam = camRefs.find((t) => t.participant.isLocal);
  const [live, setLive] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [goLiveError, setGoLiveError] = useState<string | null>(null);
  const marked = useRef(false);

  // Only mark live once the camera AND microphone are truly published.
  const published =
    state === ConnectionState.Connected && !!cameraTrack?.track && !!microphoneTrack?.track;
  useEffect(() => {
    if (!published || marked.current) return;
    marked.current = true;
    markStreamLive(streamId)
      .then(() => setLive(true))
      .catch((e) => {
        marked.current = false;
        setGoLiveError(streamErrorMessage(e));
      });
  }, [published, streamId]);

  // Heartbeats keep the stream "live"; a false result means the server already ended it.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      sendHeartbeat(streamId)
        .then((ok) => !ok && onServerEnded())
        .catch(() => undefined); // transient failures: next tick retries
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [live, streamId, onServerEnded]);

  const flip = async () => {
    const track = cameraTrack?.track as LocalVideoTrack | undefined;
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      await track?.restartTrack({ facingMode: next });
      setFacing(next);
    } catch {
      Alert.alert('Camera', "Couldn't switch cameras on this device.");
    }
  };

  const status =
    goLiveError ??
    (state === ConnectionState.Reconnecting
      ? 'Reconnecting…'
      : state === ConnectionState.Connected
        ? live
          ? null
          : 'Going live…'
        : 'Connecting…');

  return (
    <View style={styles.fill}>
      {localCam && isTrackReference(localCam) && isCameraEnabled ? (
        <VideoTrack
          trackRef={localCam}
          style={StyleSheet.absoluteFill}
          mirror={facing === 'user'}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text color="#FFFFFF">{isCameraEnabled ? 'Starting camera…' : 'Camera is off'}</Text>
        </View>
      )}

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        {live ? <LiveBadge /> : null}
        {status ? (
          <View style={styles.pill}>
            <Text variant="caption" color="#FFFFFF" accessibilityLiveRegion="polite">
              {status}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <ControlsRow>
          <RoundButton
            icon={isMicrophoneEnabled ? 'mic' : 'mic-off'}
            label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
            active={isMicrophoneEnabled}
            onPress={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
          />
          <RoundButton
            icon={isCameraEnabled ? 'videocam' : 'videocam-off'}
            label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            active={isCameraEnabled}
            onPress={() => void localParticipant.setCameraEnabled(!isCameraEnabled)}
          />
          <RoundButton icon="camera-reverse" label="Switch camera" onPress={() => void flip()} />
          <RoundButton
            icon="stop"
            label="End broadcast"
            danger
            onPress={() =>
              Alert.alert('End broadcast?', 'Viewers will be disconnected.', [
                { text: 'Keep streaming', style: 'cancel' },
                { text: 'End', style: 'destructive', onPress: onEnd },
              ])
            }
          />
        </ControlsRow>
      </View>
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
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bottomBtn: { margin: 16 },
});
