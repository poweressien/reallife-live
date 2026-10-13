import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { router, useIsFocused } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { createStream, streamErrorMessage, type Visibility } from '@/features/streams/lifecycle';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

const CATEGORIES = ['Daily life', 'Travel', 'Food', 'Music', 'Sports', 'Learning'];

export default function GoLiveScreen() {
  const { colors } = useTheme();
  const focused = useIsFocused(); // release the camera when this tab is not visible (the broadcast screen needs it)
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const granted = !!camPerm?.granted && !!micPerm?.granted;
  const blocked =
    (camPerm && !camPerm.granted && !camPerm.canAskAgain) ||
    (micPerm && !micPerm.granted && !micPerm.canAskAgain);
  const titleOk = title.trim().length >= 1 && title.trim().length <= 80;

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      const s = await createStream({
        title: title.trim(),
        category,
        visibility,
        recording: false,
        location: false,
      });
      router.push({ pathname: '/broadcast/[id]', params: { id: s.id } });
    } catch (e) {
      setError(streamErrorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  if (!granted) {
    return (
      <Screen contentStyle={{ justifyContent: 'center', gap: spacing.lg }}>
        <Text variant="display">Go live</Text>
        <Text muted>
          RealLife Live needs your camera and microphone so viewers can see and hear your broadcast.
        </Text>
        {blocked ? (
          <>
            <Text color={colors.danger}>
              Access was denied. Enable camera and microphone for this app in your phone settings.
            </Text>
            <Button title="Open settings" onPress={() => void Linking.openSettings()} />
          </>
        ) : (
          <Button
            title="Allow camera & microphone"
            onPress={async () => {
              await requestCam();
              await requestMic();
            }}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={{ gap: spacing.lg, paddingVertical: spacing.lg }}>
      <Text variant="title">Go live</Text>
      <View style={[styles.preview, { backgroundColor: colors.surface }]}>
        {focused ? <CameraView style={StyleSheet.absoluteFill} facing={facing} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch camera"
          onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
          style={styles.flip}
        >
          <Text color="#FFFFFF" variant="label">
            Flip
          </Text>
        </Pressable>
      </View>

      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        maxLength={80}
        placeholder="What are you up to?"
      />

      <View style={{ gap: spacing.sm }}>
        <Text variant="label" muted>
          Category (optional)
        </Text>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityState={{ selected: category === c }}
              onPress={() => setCategory(category === c ? null : c)}
              style={[
                styles.chip,
                {
                  backgroundColor: category === c ? colors.primary : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text variant="caption" color={category === c ? '#FFFFFF' : colors.text}>
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text>Public broadcast</Text>
          <Text variant="caption" muted>
            {visibility === 'public'
              ? 'Anyone can watch from the live feed.'
              : 'Private: only people you invite (invitations arrive in a later update).'}
          </Text>
        </View>
        <Switch
          accessibilityLabel="Public broadcast"
          value={visibility === 'public'}
          onValueChange={(v) => setVisibility(v ? 'public' : 'private')}
          trackColor={{ true: colors.primary }}
        />
      </View>
      <Text variant="caption" muted>
        Recording and location sharing are not available yet and are off.
      </Text>

      {error ? (
        <Text color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button title="Start broadcast" onPress={start} loading={starting} disabled={!titleOk} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { height: 320, borderRadius: radius.lg, overflow: 'hidden' },
  flip: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
