import {
  passwordSchema,
  profileSchema,
  signUpSchema,
  usernameSchema,
} from '@/features/auth/schemas';

describe('auth schemas', () => {
  it('normalises usernames to lowercase and enforces the DB pattern', () => {
    expect(usernameSchema.parse('  Ekpe_01 ')).toBe('ekpe_01');
    for (const bad of ['ab', 'has space', 'a'.repeat(21), 'emoji😀x', 'dash-name']) {
      expect(usernameSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('requires letters and numbers in passwords', () => {
    expect(passwordSchema.safeParse('abcdefgh').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
    expect(passwordSchema.safeParse('abc12345').success).toBe(true);
  });

  it('rejects mismatched password confirmation', () => {
    const r = signUpSchema.safeParse({
      email: 'a@b.co',
      password: 'abc12345',
      confirm: 'abc12346',
    });
    expect(r.success).toBe(false);
  });

  it('validates profile fields and only allows https links', () => {
    const base = { username: 'ekpe', displayName: 'Ekpe' };
    expect(profileSchema.safeParse({ ...base, website: 'https://example.com' }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, website: 'http://example.com' }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, website: 'javascript:alert(1)' }).success).toBe(
      false,
    );
    expect(profileSchema.safeParse({ ...base, bio: 'x'.repeat(161) }).success).toBe(false);
  });
});
