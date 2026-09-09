# Security — GreenGrandMart

**Companion docs:** `Architecture.md` · `Data_Model_DB_Schema.md` · `API_Spec.md` · `AGENTS.md`
**Purpose:** the single canonical security reference — threat model, auth/authorization design, secrets handling, validation rules, and the checklist that must pass before any production launch or major release.

---

## 1. Scope & Security Principles

- **Never trust the client.** Price, total, stock, payment success, user ID, and role are always re-derived or re-verified server-side, regardless of what the request body claims.
- **Defense in depth.** Critical operations (payment confirmation, inventory changes, coupon redemption) are protected at multiple layers — application logic AND database constraints — so a bug in one layer doesn't become a breach.
- **Least privilege.** Every role, API key, and service account has only the access it needs, nothing more.
- **Fail closed.** When a check can't be completed (auth service down, ambiguous state), the system denies the action rather than allowing it.
- **Everything sensitive is logged, nothing sensitive is logged.** Admin actions and security events are audited; secrets, passwords, OTP codes, and full card/payment details are never written to any log.

---

## 2. Threat Model

| #   | Threat                                 | Attack vector                                                                                                  | Mitigation                                                                                                                                                                                           |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Price manipulation                     | Attacker modifies cart/checkout request to send a lower price/total                                            | All totals computed server-side in `pricing` module from current DB prices; client-sent amounts ignored entirely                                                                                     |
| T2  | Fake payment success                   | Attacker calls an order-confirm endpoint claiming payment succeeded without actually paying                    | Order only reaches `confirmed` via verified Razorpay webhook, never the client-facing confirm call alone                                                                                             |
| T3  | Overselling / race condition           | Two customers buy the last unit simultaneously                                                                 | DB transaction + row-level lock (`SELECT ... FOR UPDATE`) on inventory during reservation; CHECK constraint `available_qty >= 0` as last resort                                                      |
| T4  | Duplicate/replayed webhook             | Razorpay (or an attacker) sends the same payment/refund webhook twice                                          | `webhook_events` unique constraint on `(provider, event_id)`; signature verified before any processing                                                                                               |
| T5  | Coupon abuse                           | User redeems a single-use coupon multiple times via concurrent requests, or shares an account-specific coupon  | DB unique constraint `(coupon_id, user_id)`; server-side eligibility checks (min cart, product scope, first-order-only) re-validated at redemption, not just at preview                              |
| T6  | Account takeover                       | Credential stuffing, weak passwords, session hijacking                                                         | Firebase Auth handles password hashing/storage; app-level lockout after repeated failed logins; short-lived tokens refreshed via Firebase SDK; HTTPS-only, secure cookies                            |
| T7  | Admin privilege escalation             | A compromised customer account or a bug grants admin capability                                                | Role stored in Postgres, re-checked on every admin request from the DB (not from a JWT claim cached client-side); role changes are themselves audited                                                |
| T8  | OTP brute force / SMS bombing          | Attacker guesses OTP codes, or spams a phone number with OTP requests to harass or run up SMS costs            | Rate limit: 3 requests/phone/10min, 5 verify attempts/code, 60s resend cooldown, codes expire in 5 minutes, hashed at rest                                                                           |
| T9  | Malicious file upload                  | Admin (or compromised admin session) uploads an executable or malicious SVG disguised as a product image       | MIME type, extension, file size, and actual file content validated server-side; SVGs sanitized or disallowed; uploads go through Firebase Storage rules requiring authenticated, role-checked access |
| T10 | Secret exposure                        | API keys committed to git, exposed in client bundle, or logged                                                 | Secrets only in server-side env vars (never `NEXT_PUBLIC_*`); `.env` files gitignored; secret scanning in CI; logs never include request bodies containing tokens/keys                               |
| T11 | Data exposure via IDOR                 | User A requests `/orders/:id` for User B's order by guessing/incrementing an ID                                | UUIDs (non-sequential) for all resource IDs; every resource-fetching endpoint checks ownership (`order.userId === session.userId`) before returning data, not just authentication                    |
| T12 | Webhook spoofing                       | Attacker sends a fake webhook claiming to be from Razorpay                                                     | Signature verified using Razorpay's webhook secret (HMAC) before any processing; requests failing verification are rejected with 400, never trusted "just in case"                                   |
| T13 | Cross-site scripting (XSS)             | Malicious script injected via a review, product description, or admin-entered content, rendered to other users | React's default escaping relied upon (no raw `dangerouslySetInnerHTML` without sanitization); user-generated content (reviews) sanitized before storage/display                                      |
| T14 | Injection (SQL)                        | Malicious input in a form field alters a database query                                                        | Prisma parameterizes all queries by default; raw SQL is avoided, and if ever required, uses parameterized queries only, never string concatenation                                                   |
| T15 | Denial of service via abusive requests | Scripted bot hammers checkout, search, or OTP endpoints                                                        | Rate limiting per endpoint group (Section 8); Vercel's built-in DDoS protection at the edge                                                                                                          |
| T16 | PII exposure in exports/logs           | Customer PII leaked via admin export, error logs, or third-party analytics                                     | PII scoped to what's needed; admin exports require explicit permission and are audited; analytics events (Section 10 of implementation plan) exclude raw PII                                         |

---

## 3. Authentication

- **Provider:** Firebase Authentication — email/password and Google OAuth. Firebase handles password hashing, storage, and credential verification; the app never sees or stores a raw password.
- **Token flow:** client authenticates with Firebase SDK, receives a short-lived ID token (JWT), sent as `Authorization: Bearer <token>` on every request needing identity.
- **Server-side verification:** every protected route calls `firebase-admin`'s `verifyIdToken()` on the incoming token. This is mandatory on every request — tokens are never assumed valid based on a prior request in the same session.
- **Session persistence:** handled by the Firebase client SDK's own refresh mechanism; the app does not implement custom session/cookie logic beyond what Firebase provides, avoiding a whole class of homegrown session bugs.
- **Login lockout:** application-level tracking (via a rate-limit table) locks an email out for 15 minutes after 5 failed attempts, independent of Firebase's own throttling, to slow credential-stuffing attempts.
- **Password reset:** via Firebase's built-in flow (emailed reset link); on successful reset, existing sessions for that user are invalidated.
- **Account deletion:** requires re-authentication (recent login or password re-entry) before proceeding — prevents a hijacked/unattended session from deleting an account.

**Never implemented in this system:** custom password hashing, custom session tokens, custom "remember me" persistence — all delegated to Firebase Auth by design.

---

## 4. Authorization (RBAC)

### 4.1 Roles

`customer` · `staff` · `admin` — stored in `users.role`, defaulting to `customer`.

### 4.2 Permission Matrix

| Action                                         | customer      | staff         | admin         |
| ---------------------------------------------- | ------------- | ------------- | ------------- |
| Browse/search products                         | ✅            | ✅            | ✅            |
| Manage own cart/orders/addresses/wishlist      | ✅ (own only) | ✅ (own only) | ✅ (own only) |
| View any customer's order                      | ❌            | ✅ (read)     | ✅            |
| Create/edit products, categories, brands       | ❌            | ✅            | ✅            |
| Adjust inventory                               | ❌            | ✅            | ✅            |
| Update order status                            | ❌            | ✅            | ✅            |
| Create/manage coupons & promotions             | ❌            | ✅            | ✅            |
| Initiate refunds                               | ❌            | ❌            | ✅            |
| Change a user's role                           | ❌            | ❌            | ✅            |
| View audit logs                                | ❌            | ❌            | ✅            |
| Manage platform settings (tax, shipping rules) | ❌            | ❌            | ✅            |

### 4.3 Enforcement Rules

- **Role is re-read from Postgres on every admin request** via `requireRole()` in `modules/admin`. It is never trusted from the JWT payload alone, since role changes must take effect immediately, not after a token refresh cycle.
- **Ownership checks are separate from role checks.** A `customer` role check confirms _what kind_ of user this is; an ownership check (`resource.userId === session.userId`) confirms _which_ records they can touch. Both are required — a role check alone is insufficient to prevent T11 (IDOR).
- **No endpoint infers role from the frontend.** The admin UI hides controls a `staff` user shouldn't see, but the API independently rejects the action even if the UI were bypassed.

---

## 5. Secrets Management

| Secret                                       | Where stored                                                                                                                                                                                         | Never appears in                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Firebase Admin service account JSON          | Vercel encrypted environment variable                                                                                                                                                                | Client bundle, git history, logs                                                  |
| Firebase client config (API key, project ID) | `NEXT_PUBLIC_*` env vars — **this one is intentionally public**, Firebase client config is not a secret by design, security is enforced via Firebase Auth + Storage rules, not by hiding this config | N/A (safe to expose)                                                              |
| Razorpay Key ID                              | `NEXT_PUBLIC_RAZORPAY_KEY_ID` — public by design (needed to init the checkout widget)                                                                                                                | N/A (safe to expose)                                                              |
| Razorpay Key Secret                          | Server-only env var                                                                                                                                                                                  | Client bundle, logs, error messages                                               |
| Razorpay webhook secret                      | Server-only env var                                                                                                                                                                                  | Client bundle, logs                                                               |
| MSG91 auth key                               | Server-only env var                                                                                                                                                                                  | Client bundle, logs, OTP-related error messages                                   |
| Resend API key                               | Server-only env var                                                                                                                                                                                  | Client bundle, logs                                                               |
| Postgres connection string (Neon)            | Server-only env var                                                                                                                                                                                  | Client bundle, logs, error messages (connection errors are generic to the client) |
| Cron secret (for `/api/cron/*`)              | Server-only env var, compared to `X-Cron-Secret` header                                                                                                                                              | Client bundle, public routes                                                      |

**Rules:**

- `.env.local` and `.env` are gitignored; only `.env.example` (with placeholder values and comments) is committed.
- CI includes a secret-scanning step (e.g. gitleaks or GitHub's built-in secret scanning) on every PR.
- Rotate the Razorpay webhook secret, MSG91 key, and Resend key immediately if any suspected exposure occurs; rotating Firebase Admin credentials requires generating a new service account key in the Firebase console and redeploying.
- No secret is ever interpolated into a log statement, even at debug level — log the fact that an operation happened, never the credential used to perform it.

---

## 6. Input Validation

- **Every external input is validated with Zod before use** — API request bodies, query params, and (for defense in depth) even values already validated client-side in a form.
- **Validation happens at the route-handler boundary**, using schemas defined in the relevant module (`<module>.schema.ts` per `Coding_Standards.md`).
- **Type coercion is explicit**, never implicit — e.g. a query param that should be a number is parsed and validated as one (`z.coerce.number().int().positive()`), not used as a raw string in a comparison.
- **Whitelisting over blacklisting**: enums (order status, payment method, coupon type) are validated against an explicit allowed set, not merely checked for "not obviously malicious."
- **Sanitization for user-generated content:** review text/titles are sanitized (strip/escape HTML) before storage and again before rendering, even though React escapes by default — this guards against any future use of `dangerouslySetInnerHTML` or a non-React rendering path (e.g. email templates that include review content).

---

## 7. Payment Security

- **PCI scope is minimized by design**: Razorpay's hosted checkout widget handles card data entry directly; card numbers/CVV never touch GreenGrandMart's servers or database at any point.
- **Signature verification happens twice, independently:**
  1. On the client-confirm call (`POST /checkout/confirm`) — HMAC-SHA256 using the payment ID + order ID + Razorpay Key Secret.
  2. On the webhook (`POST /payments/webhook`) — HMAC-SHA256 using the raw request body + webhook secret, checked against the `X-Razorpay-Signature` header, **before** parsing the body as JSON for processing.
- **Order state authority:** only the webhook path can move an order to `confirmed`. The client-confirm call may only move state to an intermediate `pending_confirmation` status — this is the single most load-bearing rule in the whole payment flow (see also `AGENTS.md` Section 3, Rule 5).
- **Idempotency keys** are used on refund creation calls to Razorpay, preventing a network retry from triggering a duplicate refund.
- **Reservation expiry** ensures stock isn't held indefinitely by an abandoned or fraudulent checkout attempt — reservations auto-release after 15 minutes if payment isn't confirmed.

---

## 8. Rate Limiting & Abuse Prevention

Implemented as a Postgres-backed sliding-window check (no Redis needed at current scale — see `Architecture.md` Section 9 for the future migration trigger).

| Endpoint group                               | Limit                      | Key                                                               |
| -------------------------------------------- | -------------------------- | ----------------------------------------------------------------- |
| Login (app-level lockout on top of Firebase) | 5 failed attempts / 15 min | email                                                             |
| `/otp/request`                               | 3 / 10 min                 | phone                                                             |
| `/otp/verify`                                | 5 attempts / code          | otp_request_id                                                    |
| `/checkout`, `/checkout/quote`               | 10 / min                   | user ID                                                           |
| `/coupons/validate`                          | 20 / min                   | user ID                                                           |
| `/reviews` (create)                          | 5 / day                    | user ID                                                           |
| Admin write endpoints                        | 60 / min                   | admin user ID                                                     |
| Public search/browse                         | 60 / min                   | IP (guards against scraping bots, generous enough for real users) |

Requests exceeding a limit receive `429 RATE_LIMITED` with a clear retry-after message, never a silent drop or a generic 500.

---

## 9. File Upload Security

Applies to product images, review images, and any admin-uploaded content.

1. **Never trust the client-reported MIME type.** Validate actual file content (magic bytes) server-side before accepting.
2. **Enforce a strict allowlist** of accepted formats (JPEG, PNG, WebP) and reject everything else, including SVG unless a sanitization pipeline is explicitly added later.
3. **Enforce file size limits** (e.g. 5MB per image) before upload begins, both client-side (UX) and server-side (enforced, not just suggested).
4. **Strip EXIF metadata** on processing — avoids leaking GPS/device data embedded in customer-submitted review images.
5. **Uploads never happen through an unauthenticated endpoint.** The server issues a signed, time-limited upload URL only after verifying the requester's identity and role/ownership; raw files never pass through app logic unauthenticated.
6. **Generated image variants (thumbnail/medium/large)** are produced server-side from the validated original — the client never uploads pre-resized variants directly, preventing a mismatched or malicious "thumbnail" from being substituted.

---

## 10. Firebase Storage Rules (summary — full rules live in `firebase/storage.rules`)

| Path                                        | Read                                                                                    | Write                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `products/**`, `categories/**`, `brands/**` | Public                                                                                  | Authenticated `admin`/`staff` only                                |
| `reviews/**`                                | Public                                                                                  | Authenticated user, own review only, size/type validated in rules |
| `users/{userId}/**` (profile images)        | Public or owner-only (decide per feature)                                               | Owner only                                                        |
| `invoices/**`                               | **Never public** — served only via a backend-issued signed URL after an ownership check | Backend/admin service account only                                |

Storage rules are a second layer, not the only layer — the backend independently authorizes any signed-URL issuance rather than relying on Storage rules alone to catch everything.

---

## 11. Data Protection & Compliance

- **PII minimization:** collect only what's needed for the order/shipping/tax flow (name, phone, address, email). No unnecessary fields collected "just in case."
- **Encryption in transit:** HTTPS enforced everywhere (Vercel default); no endpoint accepts plain HTTP.
- **Encryption at rest:** handled by the managed providers (Neon encrypts Postgres storage at rest; Firebase Storage/Auth encrypt at rest by default) — no additional application-level encryption needed for current scope, beyond hashing OTP codes and never storing raw payment credentials.
- **India's Digital Personal Data Protection Act (DPDP), 2023:** as a business handling Indian customers' personal data, review DPDP obligations before launch — notably, purpose limitation (only using data for stated purposes like order fulfillment and communication), consent for marketing communications, and a documented process for data deletion requests (see account deletion in Section 3). This document is not legal advice — validate final compliance posture with a qualified professional before launch, same caveat as GST in `Product_Spec_Requirements.md`.
- **Data retention:** order/payment records retained per applicable tax/accounting requirements even after account deletion (anonymized, per Section 1.4 of `Product_Spec_Requirements.md`) — deletion of a user's account does not delete financial records the business is legally required to keep.

---

## 12. Logging & Monitoring

**Always log:**

- Authentication failures (without the attempted password, obviously)
- Authorization failures (who, what resource, what action attempted)
- Admin actions (via `audit_logs` — before/after state, actor, timestamp)
- Payment state transitions and webhook processing outcomes
- Rate-limit triggers
- Unhandled exceptions (full stack trace, server-side only)

**Never log:**

- Passwords (never see them anyway — Firebase handles this)
- OTP codes, in any form, at any log level
- Full Razorpay signatures or webhook secrets
- Firebase Admin credentials or any other secret from Section 5
- Full card/payment details (never received by the app in the first place)
- Full request bodies on auth-adjacent endpoints without redaction

**Monitoring:** Sentry captures unhandled exceptions and flags spikes; Vercel Analytics tracks performance; a simple admin-visible "failed jobs" view surfaces background job failures (email/SMS/invoice generation) so they don't silently disappear.

---

## 13. Incident Response (baseline)

1. **Suspected secret leak:** rotate the affected credential immediately (Section 5), redeploy, then investigate scope of exposure.
2. **Suspected account compromise:** force password reset for the affected user, review their recent order/audit activity for unauthorized actions, notify the user.
3. **Payment discrepancy (e.g. webhook missed):** reconciliation job compares Razorpay's payment records against local `payments` table state periodically; discrepancies are flagged for manual review rather than auto-resolved silently.
4. **Data breach affecting customer PII:** assess scope, and depending on findings, follow applicable DPDP notification obligations — consult a professional; this doc does not substitute for legal guidance in an actual incident.

---

## 14. Pre-Launch Security Checklist

- [ ] All routes requiring auth call `verifyFirebaseToken()`; spot-checked with an automated test hitting protected routes with no/invalid token and expecting 401
- [ ] All admin routes independently re-check role from Postgres; spot-checked with a `customer`-role token expecting 403 on every `/admin/*` route
- [ ] Ownership checks verified on every resource-fetching endpoint (order, address, wishlist) — a second test user cannot fetch another user's data by ID
- [ ] Pricing/coupon/inventory logic has unit test coverage for the race conditions in the Threat Model (T1, T3, T5)
- [ ] Webhook signature verification confirmed against Razorpay's test-mode webhook tool; duplicate delivery test passes (T4)
- [ ] Rate limits verified functional on OTP, login, and checkout endpoints (T8, T15)
- [ ] No secret present in the client bundle (`grep` build output for known key patterns as a final check) (T10)
- [ ] File upload validated against a renamed-extension attack (e.g. a `.exe` renamed `.jpg`) and rejected (T9)
- [ ] Storage rules tested: unauthenticated write attempts to `products/**` and `invoices/**` are denied
- [ ] Audit logs confirmed populated for a sample price change, refund, and role change
- [ ] `.env.example` reviewed to ensure no real secret values were accidentally committed
- [ ] DPDP/GST compliance posture reviewed with a qualified professional before go-live
