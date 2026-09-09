import { z } from 'zod';

/**
 * Server-only, validated environment access. Import this from server code
 * (modules/*, route handlers, lib/*) — never from a 'use client' component.
 * Fails fast at boot if a required var is missing or malformed, per
 * docs/Environment_Config.md.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database (Neon)
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1),

  // Firebase Admin SDK
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().min(1),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1),

  // Razorpay
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),

  // MSG91 (COD OTP only)
  MSG91_AUTH_KEY: z.string().min(1),
  MSG91_OTP_TEMPLATE_ID: z.string().min(1),
  MSG91_SENDER_ID: z.string().min(1),

  // Resend
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),

  // Cron
  CRON_SECRET: z.string().min(1),

  // Observability
  SENTRY_DSN: z.string().optional(),

  // Tax / seller config
  DEFAULT_GST_RATE: z.coerce.number().min(0).max(100).default(0),
  SELLER_STATE: z.string().min(1),
  SELLER_GSTIN: z.string().min(1),

  // Business timing rules
  RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  OTP_EXPIRY_SECONDS: z.coerce.number().int().positive().default(300),
  // PRD.md §14 open question, confirmed by the business at Phase 8: 7 days.
  RETURN_WINDOW_DAYS: z.coerce.number().int().positive().default(7),

  // Shipping fee (paise) — Product_Spec_Requirements.md §7.2: "v1 can start
  // with flat rate + free-above-threshold" (zone/weight-based rules and
  // courier integration are Phase 8's job, not this). Defaults are a
  // placeholder launch config, freely adjustable via env — not a business
  // sign-off item like GST/COD, see AGENTS.md §9.
  SHIPPING_FLAT_FEE: z.coerce.number().int().nonnegative().default(4900),
  FREE_SHIPPING_THRESHOLD: z.coerce.number().int().nonnegative().default(99900),

  // Pending PRD §14 decision — not yet confirmed by the business, see AGENTS.md §9.
  COD_MAX_ORDER_VALUE: z.coerce.number().int().positive().optional(),

  // Public vars, re-declared here so server code can read them too
  NEXT_PUBLIC_APP_URL: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: z.string().optional(),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  // Set only in local dev to point the client/admin SDKs at the Firebase emulators.
  NEXT_PUBLIC_FIREBASE_USE_EMULATOR: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

function loadServerEnv() {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadServerEnv();
export type Env = typeof env;
