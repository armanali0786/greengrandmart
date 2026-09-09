import { z } from 'zod';

// Password rule per docs/Product_Spec_Requirements.md "Auth": min 8 chars, ≥1 number.
// Firebase enforces its own (weaker) minimum server-side; this is the stricter
// business rule, enforced client-side before we ever call the Firebase SDK.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/\d/, 'Password must contain at least one number.');

// India-only per docs/PRD.md assumptions: 10 digits, no country code, starting
// 6-9 (the valid Indian mobile prefix range) — matches every phone example in
// API_Spec.md ("9876543210").
export const indianPhoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number.');

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: passwordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// `name` is client-supplied and optional, used only as the initial display
// name on first login. This is safe to trust from the client — it's profile
// display data, not an authorization- or identity-bearing field (uid/email
// still come only from the verified Firebase token). It exists because the
// ID token's `name` claim lags a client-side updateProfile() call until the
// token is refreshed, which would otherwise show the wrong name right after
// signup.
export const establishSessionSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});
export type EstablishSessionInput = z.infer<typeof establishSessionSchema>;

export const loginLockoutSchema = z.object({
  email: z.string().trim().email(),
});
export type LoginLockoutInput = z.infer<typeof loginLockoutSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200).optional(),
  phone: indianPhoneSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
