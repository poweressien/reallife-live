import { zodResolver } from '@hookform/resolvers/zod';
import React, { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { updatePassword } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { friendlyAuthError } from '@/features/auth/errors';
import { resetPasswordSchema } from '@/features/auth/schemas';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type Values = { password: string; confirm: string };

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const { clearRecovery } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const confirmRef = useRef<TextInput>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await updatePassword(password);
      clearRecovery(); // the recovery session becomes a normal signed-in session
    } catch (e) {
      setFormError(friendlyAuthError(e));
    }
  });

  return (
    <Screen scroll contentStyle={{ justifyContent: 'center', gap: spacing.xl }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="display">Choose a new password</Text>
        <Text muted>You’re signed in with a one-time link. Set a new password to continue.</Text>
      </View>
      <View style={{ gap: spacing.lg }}>
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <TextField
              label="New password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.password?.message}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
            />
          )}
        />
        <Controller
          control={control}
          name="confirm"
          render={({ field }) => (
            <TextField
              ref={confirmRef}
              label="Confirm new password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.confirm?.message}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
          )}
        />
        {formError ? <Text color={colors.danger}>{formError}</Text> : null}
        <Button title="Update password" onPress={onSubmit} loading={isSubmitting} />
      </View>
    </Screen>
  );
}
