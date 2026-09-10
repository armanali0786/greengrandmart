import { z } from 'zod';

const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number.');

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  purpose: z.literal('cod_confirmation'),
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
