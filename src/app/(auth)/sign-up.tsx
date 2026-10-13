import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { signUpWithEmail } from '@/features/auth/api';
import { friendlyAuthError } from '@/features/auth/errors';
import { signUpSchema, type SignUpValues } from '@/features/auth/schemas';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export default function SignUpScreen() {
  const { colors } = useTheme();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { needsEmailConfirmation } = await signUpWithEmail(values.email, values.password);
      // With confirmation off, a session now exists and the root layout moves to profile setup.
      if (needsEmailConfirmation) setConfirmSent(values.email);
    } catch (e) {
      setFormError(friendlyAuthError(e));
    }
  });

  if (confirmSent) {
    return (
      <Screen contentStyle={{ justifyContent: 'center', gap: spacing.lg }}>
        <Text variant="display">Check your email</Text>
        <Text muted>
          We sent a confirmation link to {confirmSent}. Open it on this phone to finish creating
          your account, then sign in.
        </Text>
        <Link href="/sign-in" asChild>
          <Button title="Back to sign in" onPress={() => undefined} />
        </Link>
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={{ justifyContent: 'center', gap: spacing.xl }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="display">Create your account</Text>
        <Text muted>You’ll choose your username and profile next.</Text>
      </View>
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
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <TextField
              ref={passwordRef}
              label="Password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.password?.message}
              hint="At least 8 characters, with a letter and a number."
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
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
              label="Confirm password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.confirm?.message}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
          )}
        />
        {formError ? (
          <Text color={colors.danger} accessibilityLiveRegion="polite">
            {formError}
          </Text>
        ) : null}
        <Button title="Create account" onPress={onSubmit} loading={isSubmitting} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
        <Text muted>Already have an account?</Text>
        <Link href="/sign-in">
          <Text color={colors.primary} variant="label">
            Sign in
          </Text>
        </Link>
      </View>
    </Screen>
  );
}
