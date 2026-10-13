import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { profileSchema, type ProfileValues } from '@/features/auth/schemas';
import {
  isUsernameAvailable,
  saveProfile,
  UsernameTakenError,
  uploadAvatar,
  type Profile,
} from '@/features/profile/api';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type Props = {
  userId: string;
  mode: 'create' | 'update';
  initial?: Profile | null;
  submitLabel: string;
  onSaved: () => void | Promise<void>;
};

/** Shared by onboarding (create) and edit-profile (update). Server constraints stay authoritative. */
export function ProfileForm({ userId, mode, initial, submitLabel, onSaved }: Props) {
  const { colors } = useTheme();
  const [formError, setFormError] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarMime, setAvatarMime] = useState('image/jpeg');
  const [checked, setChecked] = useState<{
    value: string;
    state: 'free' | 'taken' | 'unknown';
  } | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: initial?.username ?? '',
      displayName: initial?.display_name ?? '',
      bio: initial?.bio ?? '',
      website: initial?.links?.[0] ?? '',
    },
  });

  const username = useWatch({ control, name: 'username' });
  const candidate = (username ?? '').trim().toLowerCase();
  const needsCheck =
    profileSchema.shape.username.safeParse(candidate).success && candidate !== initial?.username;
  // Derived during render; the effect only reports async results (no synchronous setState).
  const availability: 'idle' | 'checking' | 'free' | 'taken' | 'unknown' = !needsCheck
    ? 'idle'
    : checked?.value === candidate
      ? checked.state
      : 'checking';

  useEffect(() => {
    if (!needsCheck) return;
    let active = true;
    const t = setTimeout(() => {
      isUsernameAvailable(candidate, userId)
        .then((free) => active && setChecked({ value: candidate, state: free ? 'free' : 'taken' }))
        .catch(() => active && setChecked({ value: candidate, state: 'unknown' })); // offline: DB constraint still guards on save
    }, 400);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [candidate, needsCheck, userId]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setFormError('Allow photo access in your phone settings to choose a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6, // keeps uploads small on mobile data
    });
    if (result.canceled || !result.assets[0]) return;
    setFormError(null);
    setAvatarUri(result.assets[0].uri);
    setAvatarMime(result.assets[0].mimeType ?? 'image/jpeg');
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (availability === 'taken') {
      setError('username', { message: 'That username is already taken.' });
      return;
    }
    try {
      const avatarUrl = avatarUri ? await uploadAvatar(userId, avatarUri, avatarMime) : undefined;
      await saveProfile({ id: userId, ...values, avatarUrl }, mode);
      await onSaved();
    } catch (e) {
      if (e instanceof UsernameTakenError) setError('username', { message: e.message });
      else setFormError("Couldn't save your profile. Check your connection and try again.");
    }
  });

  const hint =
    availability === 'checking'
      ? 'Checking availability…'
      : availability === 'free'
        ? 'Username is available.'
        : availability === 'unknown'
          ? "Couldn't check availability; we'll verify when you save."
          : '3–20 characters: lowercase letters, numbers, underscores.';

  return (
    <View style={{ gap: spacing.lg }}>
      <Pressable
        onPress={pickAvatar}
        accessibilityRole="button"
        accessibilityLabel="Choose profile photo"
        style={{ alignItems: 'center', gap: spacing.sm }}
      >
        <Avatar
          uri={avatarUri ?? initial?.avatar_url}
          name={initial?.display_name ?? username ?? '?'}
          size={96}
        />
        <Text variant="label" color={colors.primary}>
          {avatarUri || initial?.avatar_url ? 'Change photo' : 'Add photo'}
        </Text>
      </Pressable>

      <Controller
        control={control}
        name="username"
        render={({ field }) => (
          <TextField
            label="Username"
            value={field.value}
            onChangeText={(v) => field.onChange(v.toLowerCase())}
            onBlur={field.onBlur}
            error={
              errors.username?.message ??
              (availability === 'taken' ? 'That username is already taken.' : undefined)
            }
            hint={hint}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
          />
        )}
      />
      <Controller
        control={control}
        name="displayName"
        render={({ field }) => (
          <TextField
            label="Display name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.displayName?.message}
            maxLength={40}
          />
        )}
      />
      <Controller
        control={control}
        name="bio"
        render={({ field }) => (
          <TextField
            label="Bio (optional)"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.bio?.message}
            multiline
            maxLength={160}
            style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.md }}
          />
        )}
      />
      <Controller
        control={control}
        name="website"
        render={({ field }) => (
          <TextField
            label="Link (optional)"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.website?.message}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://"
          />
        )}
      />
      {formError ? (
        <Text color={colors.danger} accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <Button
        title={submitLabel}
        onPress={onSubmit}
        loading={isSubmitting}
        disabled={availability === 'checking'}
      />
    </View>
  );
}
