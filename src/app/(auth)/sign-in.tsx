import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { brand } from '@/config/brand';
import { signInWithEmail } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { friendlyAuthError } from '@/features/auth/errors';
import { signInSchema, type SignInValues } from '@/features/auth/schemas';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export default function SignInScreen() {
  const { colors } = useTheme();
  const { linkError, dismissLinkError } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    dismissLinkError();
    try {
      await signInWithEmail(values.email, values.password);
    } catch (e) {
      setFormError(friendlyAuthError(e));
    }
  });

  return (
    <Screen scroll contentStyle={{ justifyContent: 'center', gap: spacing.xl }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="display" color={colors.primary}>
          {brand.name}
        </Text>
        <Text muted>{brand.tagline}</Text>
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
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
          )}
        />
        {formError || linkError ? (
          <Text color={colors.danger} accessibilityLiveRegion="polite">
            {formError ?? linkError}
          </Text>
        ) : null}
        <Button title="Sign in" onPress={onSubmit} loading={isSubmitting} />
        <Link href="/forgot-password" asChild>
          <Button title="Forgot password?" variant="ghost" onPress={() => undefined} />
        </Link>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
        <Text muted>New here?</Text>
        <Link href="/sign-up">
          <Text color={colors.primary} variant="label">
            Create an account
          </Text>
        </Link>
      </View>
    </Screen>
  );
}
