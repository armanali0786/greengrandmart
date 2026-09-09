import { z } from 'zod';

// Password rule per docs/Product_Spec_Requirements.md "Auth": min 8 chars, ≥1 number.
// Firebase enforces its own (weaker) minimum server-side; this is the stricter
// business rule, enforced client-side before we ever call the Firebase SDK.
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/\d/, 'Password must contain at least one number.');

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
