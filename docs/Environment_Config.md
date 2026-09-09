# Environment Config — GreenGrandMart

**Companion docs:** `Deployment.md` · `Security.md` (Section 5, Secrets Management) · `Architecture.md`
**Purpose:** every environment variable the application uses, what it's for, whether it's public or secret, and how it differs across environments.

---

## 1. How Configuration Is Loaded

- All env vars are validated at startup through a single typed module (`src/config/env.ts`) using Zod — the app fails fast at boot with a clear error if a required variable is missing or malformed, rather than failing confusingly later at first use.
- `NEXT_PUBLIC_*` prefixed variables are the **only** ones exposed to the browser bundle. Anything without that prefix is server-only by Next.js's own convention — this is enforced by the framework, not just a naming discipline, but the naming discipline still matters so nobody accidentally prefixes a secret.
- `.env.example` is committed to the repo with every variable listed and a placeholder/description — no real values. `.env.local` (developer machine) and platform-level env var settings (Vercel dashboard, per environment) are never committed.

---

## 2. Full Variable Reference

### 2.1 Database

| Variable              | Public?     | Description                                                          |
| --------------------- | ----------- | -------------------------------------------------------------------- |
| `DATABASE_URL`        | Server-only | Neon Postgres connection string (pooled connection, for app runtime) |
| `DIRECT_DATABASE_URL` | Server-only | Neon direct (non-pooled) connection string, used by Prisma Migrate   |

### 2.2 Firebase

| Variable                                   | Public?                 | Description                                                                                             |
| ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`             | **Public by design**    | Firebase client SDK config — not a secret; security enforced via Auth/Storage rules, not by hiding this |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | Public                  | Firebase client config                                                                                  |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | Public                  | Firebase client config                                                                                  |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | Public                  | Firebase client config                                                                                  |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Public                  | Needed for FCM web push                                                                                 |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | Public                  | Firebase client config                                                                                  |
| `FIREBASE_ADMIN_PROJECT_ID`                | Server-only             | Firebase Admin SDK (service account)                                                                    |
| `FIREBASE_ADMIN_CLIENT_EMAIL`              | Server-only             | Firebase Admin SDK service account                                                                      |
| `FIREBASE_ADMIN_PRIVATE_KEY`               | Server-only, **secret** | Firebase Admin SDK service account private key — never logged, never in any client-reachable code path  |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY`           | Public                  | Required for FCM web push subscription                                                                  |

### 2.3 Payments (Razorpay)

| Variable                      | Public?                 | Description                                                                     |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | **Public by design**    | Needed client-side to initialize the Razorpay checkout widget                   |
| `RAZORPAY_KEY_SECRET`         | Server-only, **secret** | Used for signature verification and server-side API calls                       |
| `RAZORPAY_WEBHOOK_SECRET`     | Server-only, **secret** | Used to verify incoming webhook signatures — distinct from the key secret above |

### 2.4 SMS (MSG91)

| Variable                | Public?                 | Description                                                                            |
| ----------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `MSG91_AUTH_KEY`        | Server-only, **secret** | MSG91 API authentication                                                               |
| `MSG91_OTP_TEMPLATE_ID` | Server-only             | MSG91 template ID for OTP messages (required by their API for DLT compliance in India) |
| `MSG91_SENDER_ID`       | Server-only             | Registered SMS sender ID                                                               |

### 2.5 Email (Resend)

| Variable            | Public?                 | Description                                                       |
| ------------------- | ----------------------- | ----------------------------------------------------------------- |
| `RESEND_API_KEY`    | Server-only, **secret** | Resend API authentication                                         |
| `RESEND_FROM_EMAIL` | Server-only             | Verified sending domain/address, e.g. `orders@greengrandmart.com` |

### 2.6 Application

| Variable                 | Public?                                   | Description                                                                                                                     |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`    | Public                                    | Canonical base URL of the current environment (used for building absolute links in emails, redirects)                           |
| `CRON_SECRET`            | Server-only, **secret**                   | Shared secret checked against `X-Cron-Secret` header on `/api/cron/*` routes                                                    |
| `NODE_ENV`               | N/A (framework-managed)                   | `development` / `production` / `test`                                                                                           |
| `SENTRY_DSN`             | Server-only (server-side error reporting) | Sentry project DSN                                                                                                              |
| `NEXT_PUBLIC_SENTRY_DSN` | Public                                    | Sentry DSN for client-side error reporting (Sentry DSNs are not secret — they only allow _submitting_ events, not reading data) |

### 2.7 Business Configuration (non-secret, but environment-specific)

| Variable                  | Public?     | Description                                                                                                          |
| ------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_GST_RATE`        | Server-only | Fallback GST rate if not set per-product (should rarely be relied upon — most products should have an explicit rate) |
| `SELLER_STATE`            | Server-only | Registered business state, used to determine CGST+SGST vs IGST split                                                 |
| `SELLER_GSTIN`            | Server-only | Displayed on invoices                                                                                                |
| `RESERVATION_TTL_MINUTES` | Server-only | Inventory reservation expiry window (default: 15)                                                                    |
| `OTP_EXPIRY_SECONDS`      | Server-only | Default: 300                                                                                                         |
| `COD_MAX_ORDER_VALUE`     | Server-only | Optional cap on COD-eligible order value, if the business rule from `PRD.md` Section 14 is confirmed                 |
| `SHIPPING_FLAT_FEE`       | Server-only | Flat shipping fee in paise (Phase 5's minimal v1 rule per `Product_Spec_Requirements.md` §7.2; default ₹49)          |
| `FREE_SHIPPING_THRESHOLD` | Server-only | Cart value (paise, post-discount) at/above which shipping is free (default ₹999)                                     |

---

## 3. Values by Environment

| Variable group        | Local                                                                                         | Preview                                         | Staging                                                              | Production                                       |
| --------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| Firebase project      | Emulator Suite                                                                                | `greengrandmart-dev`                            | `greengrandmart-staging`                                             | `greengrandmart-prod`                            |
| `DATABASE_URL`        | Local Docker Postgres or personal Neon branch                                                 | Ephemeral Neon branch (auto-provisioned per PR) | Neon `staging` branch                                                | Neon `main` (production) branch                  |
| Razorpay keys         | Test mode                                                                                     | Test mode                                       | Test mode                                                            | **Live mode**                                    |
| MSG91                 | Test/sandbox mode if available, else a stubbed provider (see `Testing_Strategy.md` Section 8) | Same as Local                                   | Test mode with real SMS delivery to verify the flow works end-to-end | **Live**                                         |
| Resend                | Test API key or a catch-all test inbox domain                                                 | Same as Local                                   | Real delivery to a test inbox                                        | **Live**, verified sending domain                |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000`                                                                       | Vercel-generated preview URL                    | `https://staging.greengrandmart.com`                                 | `https://greengrandmart.com`                     |
| `CRON_SECRET`         | Any local dev value                                                                           | Per-preview generated value                     | Staging-specific value                                               | Production-specific value, rotated independently |

**Absolute rule:** live Razorpay keys and the production Firebase project exist **only** in the Production environment's configuration. No developer, CI job, or staging deployment ever has access to live payment credentials.

---

## 4. Secret Storage & Access

- All server-only and secret variables are stored in Vercel's encrypted environment variable settings, scoped per environment (Preview / Staging / Production are configured independently in Vercel, not shared).
- Local development secrets live in `.env.local`, gitignored, shared among a small team via a password manager or secure sharing tool — never via chat, email, or committed to any branch.
- Access to view/edit Production environment variables in Vercel is restricted to the smallest necessary set of team members (project owner/admin), consistent with least-privilege from `Security.md`.

---

## 5. Adding a New Environment Variable (process)

1. Add it to `src/config/env.ts` with a Zod schema entry (required or optional, with a sensible type).
2. Add it to `.env.example` with a placeholder and one-line description.
3. Add it to this document (Section 2) under the correct category.
4. Set the real value in Vercel for every environment that needs it (Preview/Staging/Production), and in `.env.local` for local development.
5. If it's a secret, confirm it does not use the `NEXT_PUBLIC_` prefix.
