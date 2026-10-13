import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { requestPasswordReset } from '@/features/auth/api';
import { friendlyAuthError } from '@/features/auth/errors';
import { forgotPasswordSchema } from '@/features/auth/schemas';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type Values = { email: string };

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await requestPasswordReset(email);
      setSentTo(email);
    } catch (e) {
      setFormError(friendlyAuthError(e));
    }
  });

  return (
    <Screen scroll contentStyle={{ justifyContent: 'center', gap: spacing.xl }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="display">Reset password</Text>
        <Text muted>
          {sentTo
            ? `If an account exists for ${sentTo}, a reset link is on its way. Open it on this phone.`
            : 'Enter your email and we’ll send you a link to choose a new password.'}
        </Text>
      </View>
      {sentTo ? null : (
        <View style={{ gap: spacing.lg }}>
          <Controller
            control={control}
            name="email"
            render={({ field }) => (
              <TextField
                label="Email"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.email?.message}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />
            )}
          />
          {formError ? <Text color={colors.danger}>{formError}</Text> : null}
          <Button title="Send reset link" onPress={onSubmit} loading={isSubmitting} />
        </View>
      )}
      <Link href="/sign-in" asChild>
        <Button title="Back to sign in" variant="ghost" onPress={() => undefined} />
      </Link>
    </Screen>
  );
}
