import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email')
  .email('Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number');

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, '3–20 characters: lowercase letters, numbers and underscores');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const signUpSchema = z
  .object({ email: emailSchema, password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

export const profileSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1, 'Enter a display name').max(40, 'At most 40 characters'),
  bio: z.string().trim().max(160, 'At most 160 characters').optional().or(z.literal('')),
  website: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || /^https:\/\/[^\s.]+\.[^\s]+$/i.test(v), 'Use a full https:// link')
    .optional(),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ProfileValues = z.infer<typeof profileSchema>;
