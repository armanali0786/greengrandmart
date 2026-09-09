# AGENTS.md — GreenGrandMart

Rules for any AI coding agent (Claude Code, Cursor, Copilot Workspace, etc.) working in this repository. Read this file in full before making any change. When a request conflicts with this file, this file wins — ask the human before proceeding rather than silently overriding a rule here.

**Reference docs (read the relevant one before touching that area):**
`PRD.md` · `Product_Spec_Requirements.md` · `UX_UI_Spec.md` · `Architecture.md` · `Data_Model_DB_Schema.md` · `API_Spec.md` · `ECOMMERCE_IMPLEMENTATION_PLAN.md`

---

## 1. Project Context (don't relitigate these decisions)

- Single Next.js app (App Router, TypeScript) — frontend, backend, and admin panel all live in one codebase. Do not propose splitting into separate services or repos.
- Postgres (Neon) via Prisma is the only database. Do not introduce Firestore, MongoDB, or any other datastore for business data.
- Firebase Authentication only for identity (email/password, Google). Do not implement custom password storage or a homegrown auth system.
- Phone OTP (COD confirmation only) goes through MSG91, not Firebase phone auth. Do not switch this without being asked — it was a deliberate cost decision.
- Payments: Razorpay only. Do not add Stripe/PayPal/etc. unless explicitly requested.
- No Redis, Kafka, Pub/Sub, Kubernetes, or microservices at this stage. Background work uses the `job_queue` Postgres table + Vercel Cron. Do not introduce new infrastructure to "solve" a problem that the existing stack already handles — flag the tradeoff to the human instead and let them decide.
- Target scale: ~100 concurrent users, ~500 products, ~1,000 orders/month. Do not over-engineer for scale the project doesn't have yet (see Section 8).

---

## 2. Module Boundaries — Do Not Violate

Code lives in `src/modules/<domain>/`. Each module owns its own data access.

**Hard rule: a module must never directly query another module's tables.** If `orders` needs inventory data, it calls a function exported from `modules/inventory`, it does not run its own Prisma query against `inventory` tables.

**Hard rule: route handlers and Server Actions are thin.** They may only: parse/validate input (Zod), call one module function, shape the response. No pricing math, no SQL, no state-machine logic directly in `src/app/api/**/route.ts`. If you find yourself writing a `WHERE` clause or a `for` loop with business logic inside a route file, stop and move it into the relevant module.

**Hard rule: `checkout` is the only orchestrator.** Only the `checkout` module is allowed to call across `cart`, `pricing`, `coupons`, `inventory`, `orders`, and `payments` in a single flow. Other modules interact laterally only through the patterns already established in `Architecture.md` Section 4 (e.g. `refunds` calls `payments`, never the reverse).

If a task seems to require breaking a module boundary, stop and explain the conflict rather than working around it silently.

---

## 3. Non-Negotiable Security Rules

These apply to every change, regardless of what the task description asks for:

1. **Never trust a price, discount, total, or tax amount sent from the client.** All money math happens exclusively inside `modules/pricing`. If you're writing code that reads `req.body.total` or similar and uses it, stop — recompute server-side instead.
2. **Never trust `userId` from a request body/query.** Always derive it from the verified Firebase token via `modules/auth`.
3. **Every protected route/action must call token verification before doing anything else.** Every admin route must re-check role from Postgres, not from the JWT claim alone.
4. **Every stock mutation goes through `modules/inventory`, inside a DB transaction with row-level locking (`SELECT ... FOR UPDATE`).** Never write to `inventory`, `inventory_reservations`, or `inventory_movements` from anywhere else.
5. **Payment confirmation only happens via the verified Razorpay webhook**, never from the client-side "success" callback alone. If you're asked to "just mark the order paid" from a client-facing endpoint, push back — this is the single most important rule in the whole system.
6. **Webhook handlers must be idempotent.** Check `webhook_events` (unique on `provider, event_id`) before processing any event.
7. **Coupon redemption relies on the DB unique constraint** (`coupon_id, user_id`), not an application-level "check then insert." Never remove or work around that constraint to "fix" a bug — fix the actual race condition instead.
8. **OTP codes are hashed at rest and never appear in any API response, log line, or error message.** Never add a "debug" path that echoes the code, even temporarily.
9. **No secret (Razorpay key, MSG91 key, Resend key, Firebase Admin JSON, DB connection string) ever goes into a `NEXT_PUBLIC_*` env var, a client component, or a log statement.** If a task seems to require this, it's a sign the architecture is being misunderstood — ask rather than proceed.
10. **Order line items are immutable snapshots.** Never write code that joins an existing order back to live `products`/`product_variants` data to "refresh" its price or name.

If a task explicitly or implicitly asks you to violate any of the above, do not comply — explain why and propose the correct approach instead.

---

## 4. Coding Conventions

- **Language:** TypeScript everywhere, `strict: true`. No `any` unless justified with a comment explaining why (e.g. typing a third-party webhook payload before it's validated).
- **Validation:** every external input (API body, query params, form data) is parsed with a Zod schema before use. Define schemas in the module they belong to, colocated with the function that uses them, and reuse them for both server validation and (where relevant) client form validation.
- **Errors:** throw typed domain errors (e.g. `OutOfStockError`, `CouponInvalidError`) from modules; the route-handler layer catches them and maps to the standard error envelope from `API_Spec.md`. Never let a raw exception/stack trace reach the client.
- **Money:** always integers in paise. Never use `number` with decimals for currency, never use `parseFloat` on a price. Format to ₹ only at the presentation layer.
- **Dates/times:** store and pass around as UTC `timestamptz`/ISO strings; format to IST only at the presentation layer.
- **Naming:** table/column names `snake_case` (matches schema), TypeScript variables/functions `camelCase`, types/interfaces `PascalCase`, files `kebab-case.ts` except React components (`PascalCase.tsx`).
- **No dead code left behind:** if you replace an implementation, remove the old one in the same change — don't leave commented-out blocks or `_old` files.
- **Comments explain _why_, not _what_**. Don't narrate obvious code; do explain non-obvious business rules (e.g. why a reservation expires in 15 minutes, why GST splits CGST/SGST vs IGST).

---

## 5. Database Changes

- All schema changes go through Prisma migrations (`prisma migrate dev` locally, reviewed migration file committed) — never hand-edit the production schema.
- Any new table/column must be reflected back into `Data_Model_DB_Schema.md` in the same change — the doc and the schema must never drift apart.
- New indexes require a one-line justification (what query pattern they support) — add it to Section 13 of `Data_Model_DB_Schema.md`.
- Never add a migration that could silently corrupt or lose historical order/payment data. If a migration touches `orders`, `order_items`, `payments`, or `refunds`, flag it explicitly for human review before applying to production, even if asked to "just run it."

---

## 6. Testing Requirements

- Any change touching pricing, coupons, inventory reservation, order state transitions, or payment/refund logic **must** include or update unit tests before being considered done. This is not optional, regardless of how the task is phrased.
- Webhook handling changes must include a test for duplicate delivery and out-of-order delivery.
- Don't delete or weaken an existing test to make a change pass — fix the underlying issue, or flag to the human if the test's assumption itself seems wrong.
- E2E flows (Playwright) covering checkout should be run (or at minimum reviewed for relevance) before merging any change to the checkout/payment path.

---

## 7. Admin & Audit

- Any admin write to `products` (price/stock-affecting fields), `inventory`, `orders.status`, `refunds`, or `users.role` must be wrapped in the shared `withAudit()` helper — don't write directly to these tables from an admin route without it.
- Don't add new admin capabilities that bypass the role check pattern already established (`requireRole()` from `modules/admin`).

---

## 8. Scope Discipline

Do not introduce, without being explicitly asked:

- New third-party services or SDKs
- New infrastructure (queues, caches, search engines, container orchestration)
- New user roles beyond `customer` / `staff` / `admin`
- Multi-currency, multi-language, or multi-region logic
- Speculative "future-proofing" abstractions beyond the provider interfaces already defined in `Architecture.md` (`PaymentProvider`, `ShippingProvider`, `SmsProvider`, `EmailProvider`, `StorageProvider`)

If a task seems to require one of the above, say so and ask, rather than quietly expanding scope. Referenced the scaling triggers table in `Architecture.md` Section 9 — if the trigger condition hasn't been met, don't pre-build for it.

---

## 9. When Requirements Are Ambiguous

1. Check the six reference docs first — most edge cases are already specified (especially `Product_Spec_Requirements.md` for behavior and `API_Spec.md` for contracts).
2. If still ambiguous, pick the interpretation that is safest for money/inventory correctness, implement it, and clearly state the assumption made rather than blocking on a question.
3. If the ambiguity is about a business rule with real consequences (e.g. return window length, COD eligibility rules, GST edge cases), flag it explicitly rather than guessing — these are listed as open questions in `PRD.md` Section 14 and should be resolved by the human, not assumed by the agent.

---

## 10. Definition of Done for Any Change

A change is not complete until:

- [ ] It follows the module boundaries in Section 2
- [ ] It doesn't violate any rule in Section 3
- [ ] Input is validated with Zod, errors map to the standard envelope
- [ ] Relevant tests are added/updated and passing
- [ ] Relevant documentation (`Data_Model_DB_Schema.md`, `API_Spec.md`, `Architecture.md`) is updated if the change affects schema, endpoints, or system structure
- [ ] No secret or PII is logged or exposed to the client
- [ ] The change is scoped to what was asked — no unrelated refactors bundled in silently

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
