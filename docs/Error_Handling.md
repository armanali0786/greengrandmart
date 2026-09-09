# Error Handling — GreenGrandMart

**Companion docs:** `API_Spec.md` (Section 1.3, error codes) · `Coding_Standards.md` (Section 8) · `Observability.md`
**Purpose:** the expected failure modes across the system and the specific, deliberate way each is handled — so failures degrade gracefully instead of surprising anyone.

---

## 1. Error Handling Philosophy

- **Every failure mode listed here was anticipated, not discovered in production.** If a new failure mode is discovered later, it gets added to this document as part of the fix, not just patched silently.
- **Fail loud internally, fail clear externally.** Full error detail goes to Sentry/logs; the customer or admin sees a specific, actionable message — never a stack trace, never a bare "Error 500."
- **Fail closed on anything involving money or stock.** When in doubt about whether an operation succeeded (e.g. an ambiguous provider response), the system treats it as _not yet confirmed_ rather than optimistically assuming success.
- **Retries are deliberate, not automatic-by-default.** Only idempotent operations are retried automatically (background jobs); anything that could double-charge or double-ship requires an idempotency guard before a retry is safe.

---

## 2. Client-Facing Errors (API layer)

Every error follows the envelope defined in `API_Spec.md` Section 1.2/1.3. This section covers the specific _scenarios_, not the format.

| Scenario                                                               | Code                  | Client behavior                                                                                                                                                                         |
| ---------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid/missing input                                                  | `VALIDATION_ERROR`    | Inline field-level error shown on the relevant form field                                                                                                                               |
| Requesting a resource that doesn't exist or isn't visible to this user | `NOT_FOUND`           | Generic "not found" page/message — deliberately identical whether the resource doesn't exist or belongs to someone else, to avoid leaking existence information (see `Security.md` T11) |
| No/invalid auth token                                                  | `UNAUTHENTICATED`     | Redirect to login, preserving intended destination where reasonable                                                                                                                     |
| Valid auth but insufficient role/ownership                             | `FORBIDDEN`           | Clear "you don't have permission" message, no redirect loop                                                                                                                             |
| Item out of stock at cart/checkout validation                          | `OUT_OF_STOCK`        | Inline message on the specific cart line item; checkout blocked until resolved                                                                                                          |
| Price changed since added to cart                                      | `PRICE_CHANGED`       | Inline banner showing new price; user must acknowledge before proceeding                                                                                                                |
| Invalid coupon                                                         | `COUPON_INVALID`      | Specific reason shown (expired / below minimum / already used / not applicable) — never a generic "invalid"                                                                             |
| Order action invalid for current status (e.g. cancel after shipped)    | `INVALID_ORDER_STATE` | Action button simply isn't shown for that status in the first place (UI-level prevention); if reached anyway (e.g. stale tab), a clear explanatory message                              |
| Wrong/expired OTP                                                      | `OTP_INVALID`         | Attempts-remaining or "expired, request new code" message                                                                                                                               |
| Too many requests                                                      | `RATE_LIMITED`        | "Please wait and try again" with a retry-after hint where practical                                                                                                                     |
| Unexpected server error                                                | `INTERNAL_ERROR`      | Generic "something went wrong, please try again" + full detail logged server-side with request context                                                                                  |

---

## 3. Payment Failure Modes

| Scenario                                                                                             | Handling                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Razorpay checkout widget fails to load (network issue)                                               | Client shows a retry option; order remains `pending_payment`, no charge has occurred                                                                                                                                                                      |
| Payment declined by bank/issuer                                                                      | Razorpay returns failure to the client; order marked `payment_failed`; customer can retry with a new payment attempt against the same order, or the reservation eventually expires and releases stock                                                     |
| Payment succeeds but the client-confirm call never reaches the server (browser closed, network drop) | The system does not rely on this call — the **webhook** independently confirms the payment and moves the order to `confirmed` regardless of whether the client-side confirm call ever happened                                                            |
| Webhook never arrives (Razorpay outage, network partition)                                           | A reconciliation job (scheduled, e.g. every few hours) queries Razorpay's API directly for any `pending_payment` orders older than a threshold and reconciles their true status — a webhook is the primary path, not the only path, for this exact reason |
| Duplicate webhook delivery                                                                           | Idempotency guard via `webhook_events` unique constraint — second delivery acknowledged, not reprocessed (see `Security.md` T4)                                                                                                                           |
| Payment captured but for the wrong amount (a theoretical integrity check)                            | System compares `payments.amount` against the webhook's reported captured amount; a mismatch is logged as a high-priority anomaly for manual review rather than silently trusted                                                                          |
| Refund API call to Razorpay times out                                                                | Idempotency key on the refund request means a safe retry doesn't create a duplicate refund; refund status remains `processing` until confirmed, not assumed complete                                                                                      |

---

## 4. Inventory Failure Modes

| Scenario                                                           | Handling                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two customers attempt to buy the last unit simultaneously          | Row-level lock during reservation ensures exactly one succeeds; the other receives `OUT_OF_STOCK` at the reservation step, before an order is even created                                                                                    |
| A reservation is created but the customer abandons checkout        | Reservation auto-expires after `RESERVATION_TTL_MINUTES` (default 15); a cron sweep releases it and restores availability                                                                                                                     |
| Admin sets stock to a value lower than currently reserved quantity | Application logic prevents `available_qty` from going negative; the adjustment is applied against the _available_ pool only, existing reservations are honored, and the admin is warned if the resulting available quantity would be negative |
| Inventory reservation exists for a since-deleted product/variant   | Foreign keys use `RESTRICT` on `product_variants` referenced by active reservations — a variant with active reservations cannot be hard-deleted; it must be archived instead, preserving referential integrity                                |

---

## 5. External Provider Failure Modes

| Provider         | Failure scenario                                         | Handling                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebase Auth    | Token verification service temporarily unavailable       | Requests fail closed (`UNAUTHENTICATED`/500 rather than allowing through); Sentry alert fires; this is rare enough (Google-managed uptime) not to need a bespoke fallback                                                                                                                                                                                                                             |
| Firebase Storage | Image upload fails mid-request                           | Client shows a retry option; no partial/corrupt metadata is written to Postgres unless the upload is confirmed complete                                                                                                                                                                                                                                                                               |
| Razorpay         | API unreachable during checkout                          | Checkout creation fails gracefully with a clear "payment provider unavailable, please try again shortly" message; no order is left in a half-created state (the DB transaction for order+reservation only commits before the Razorpay call, and a failure to create the Razorpay order is handled by marking the order `payment_failed` rather than leaving it ambiguously `pending_payment` forever) |
| MSG91            | SMS delivery fails or times out                          | OTP request returns a failure to the client with a retry option; COD checkout simply can't proceed until an OTP is successfully sent and verified — this is an acceptable hard stop, not a fallback-to-unverified-COD path                                                                                                                                                                            |
| Resend           | Email delivery fails                                     | Job retries with backoff (see Section 6); after exhausting retries, the failure is visible in the admin "failed jobs" view and logged — the _order itself_ is unaffected since email is decoupled from the checkout transaction entirely                                                                                                                                                              |
| FCM (push)       | Push delivery fails or token is stale/invalid            | Failure is logged and the stale token is removed from `device_tokens`; push is inherently best-effort and never blocks or is relied upon as the sole notification channel (email is the reliable fallback)                                                                                                                                                                                            |
| Neon (database)  | Connection pool exhausted / transient connectivity issue | Prisma's connection retry behavior handles brief blips; a sustained outage surfaces as `INTERNAL_ERROR` to users and triggers an immediate alert — there is no fallback datastore, this is accepted as the single point of failure appropriate for current scale                                                                                                                                      |

---

## 6. Background Job Failure Handling

- Every job in `job_queue` has `attempts` and `max_attempts` (default 3).
- On failure, the job is retried with exponential backoff (e.g. 1 min, 5 min, 15 min) rather than immediately.
- After exhausting `max_attempts`, the job is marked `failed` and surfaced in the admin "failed jobs" view — it is not silently dropped, and it does not retry forever.
- **Order-critical jobs vs. best-effort jobs** are treated differently in review priority: a failed `generate_invoice` or `send_order_confirmation_email` job should be manually retried/investigated promptly (customer-visible impact); a failed `send_push` job is lower priority since email is the reliable channel for the same information.
- A job handler failing must never throw an error that crashes the cron route itself — one bad job in the batch is caught and marked failed individually, while the rest of the batch continues processing.

---

## 7. Frontend Failure Handling

| Scenario                                                  | Handling                                                                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API call fails (network error, 500, timeout)              | Consistent UI pattern: message + "Try Again" button, per `UX_UI_Spec.md` Section 9 — never a silent failure or an infinitely spinning loader                                      |
| Form submission fails validation                          | Inline field errors, submit button re-enabled, focus moves to the first invalid field                                                                                             |
| A page's data fails to load entirely (not just an action) | A page-level error boundary shows a friendly message and a retry/reload option, rather than a blank white screen or a raw Next.js error overlay in production                     |
| User double-submits a form (double-click, slow network)   | Submit buttons disable immediately on click and show a loading state, preventing duplicate requests at the UI layer, backed by idempotency at the API layer as the real guarantee |
| Stale data (e.g. price changed on a tab left open)        | Re-validated server-side at the point it matters (cart view, checkout) rather than trusting whatever was rendered when the page first loaded                                      |

---

## 8. What Is Explicitly Not Handled (accepted risk at this scale)

- **Multi-region failover** — a Neon or Vercel regional outage is accepted as a full-service outage at this scale; multi-region redundancy is deferred per `Architecture.md` Section 9 until traffic/business criticality justifies the added complexity and cost.
- **Automatic circuit-breaking on third-party providers** — if Razorpay, MSG91, or Resend degrade, the system surfaces clear errors and relies on manual monitoring/response rather than automated circuit breakers with fallback providers. Revisit if provider reliability becomes a recurring operational problem.
- **Offline-first / PWA-style resilience** — the storefront requires an active internet connection; no offline queueing of cart actions is implemented at this stage.

These are documented as _deliberate_ gaps, not oversights — so a future review can decide when (not whether) to address them, rather than rediscovering the gap during an actual incident.
