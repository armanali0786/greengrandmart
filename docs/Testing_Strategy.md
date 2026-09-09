# Testing Strategy — GreenGrandMart

**Companion docs:** `Coding_Standards.md` · `Security.md` · `AGENTS.md` · `Architecture.md`
**Purpose:** what gets tested, at what level, with what tools, and what "done" means for a change — so correctness on money, stock, and payment flows is never left to manual spot-checking.

---

## 1. Testing Philosophy

- **Money, stock, and payment logic are non-negotiable test targets.** Any change touching `pricing`, `inventory`, `coupons`, `orders` state transitions, or `payments`/`refunds` must have passing tests before merge — this is enforced in `AGENTS.md` and repeated here because it's the single most important rule in this document.
- **Test the behavior, not the implementation.** Tests should survive a refactor of _how_ a module works as long as _what_ it guarantees hasn't changed.
- **Prefer fast, isolated tests; reserve slow/integrated tests for what actually needs them.** Most business logic (pricing math, coupon eligibility, state machine transitions) is pure-function testable with a mocked repository — it doesn't need a real database to verify correctness.
- **Every bug fix ships with a regression test** reproducing the original bug, written before or alongside the fix.

---

## 2. Test Pyramid for This Project

```
        ┌───────────────┐
        │   E2E (few)    │   Playwright — critical user journeys only
        ├───────────────┤
        │ Integration     │   Real Postgres (Neon branch/local), real module boundaries,
        │ (moderate)      │   mocked external providers (Razorpay, MSG91, Resend, FCM)
        ├───────────────┤
        │  Unit (many)    │   Vitest — pure logic in modules/*, repository mocked
        └───────────────┘
```

Guideline ratio: roughly 70% unit, 25% integration, 5% E2E by test count — E2E tests are expensive to write and maintain, so they cover only the flows where a real browser interaction genuinely matters.

---

## 3. Unit Testing

**Tool:** Vitest
**Scope:** pure business logic inside `src/modules/*/*.service.ts` and state machines, with the repository layer mocked so no database is touched.

### 3.1 What must be unit tested

| Module                     | Test focus                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pricing`                  | `computeOrderTotal()`: subtotal math, coupon discount applied before/after promotions per the documented order, GST split logic (CGST+SGST vs IGST based on address state comparison), rounding behavior on paise values, max-discount capping |
| `coupons`                  | Eligibility checks: expired, not-yet-started, below min cart value, product/category/brand restriction matching, first-order-only logic, usage limit exhausted — each as a distinct test case with a distinct expected error code              |
| `inventory`                | Reservation logic never allows negative available quantity; conversion from reservation to sale correctly moves quantities between buckets; release-on-expiry correctly restores availability                                                  |
| `orders` (state machine)   | Every valid transition succeeds; every invalid transition (e.g. `confirmed` → `delivered` directly) throws `InvalidOrderStateError`; status history entry created on every transition                                                          |
| `payments` (state machine) | Valid Razorpay status → internal status mapping; webhook payload parsing handles missing/malformed fields without crashing                                                                                                                     |
| `refunds`                  | Partial refund amount validation (cannot exceed remaining refundable amount); refund state transitions                                                                                                                                         |
| `otp`                      | Code hashing/comparison logic; attempt counting; expiry checking — without actually calling MSG91                                                                                                                                              |
| Auth guards                | `requireRole()` correctly allows/denies for each role combination; ownership check logic                                                                                                                                                       |

### 3.2 Example test shape

```typescript
// tests/unit/pricing/pricing.service.test.ts
describe('computeOrderTotal', () => {
  it('applies coupon discount before calculating GST', () => {
    const result = computeOrderTotal({
      items: [{ unitPrice: 100000, quantity: 1, gstRate: 18 }],
      coupon: { type: 'percentage', value: 10, maxDiscount: null },
      shippingState: 'Telangana',
      sellerState: 'Telangana',
    });
    expect(result.couponDiscount).toBe(10000);
    expect(result.cgst).toBe(8100); // 9% of 90000
    expect(result.sgst).toBe(8100);
    expect(result.igst).toBe(0);
    expect(result.grandTotal).toBe(106200);
  });

  it('caps percentage coupon discount at maxDiscount', () => {
    /* ... */
  });
  it('applies IGST when shipping state differs from seller state', () => {
    /* ... */
  });
});
```

### 3.3 Coverage target

**90%+ line coverage on `modules/pricing`, `modules/inventory`, `modules/coupons`, `modules/orders`, `modules/payments`, `modules/refunds`.** Other modules (catalog, wishlist, reviews, notifications) target 70%+ — good coverage, but not held to the same zero-tolerance standard since a bug there doesn't cause financial or stock corruption.

---

## 4. Integration Testing

**Tool:** Vitest (or a dedicated runner) against a real Postgres instance — either a local Docker Postgres or a disposable Neon branch created per test run (Neon branching is fast and cheap, ideal for CI).
**External providers are mocked** (Razorpay, MSG91, Resend, FCM, Firebase Auth) using recorded fixture responses — integration tests verify GreenGrandMart's own code paths and database interactions, not third-party uptime.

### 4.1 What must be integration tested

| Flow                                       | What's verified                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent checkout on last-unit stock     | Two simultaneous `reserveStock()` calls for the same variant with `available_qty = 1` — exactly one succeeds, the other receives `OutOfStockError`; verified against a **real** DB transaction/lock, since this is precisely the class of bug that a mocked repository can't catch |
| Coupon redemption race                     | Two simultaneous checkout completions for the same user + single-use coupon — exactly one redemption row is created, the other fails on the unique constraint and is handled gracefully (not a raw DB error surfaced to the client)                                                |
| Webhook idempotency                        | Same webhook payload (same `event_id`) delivered twice — second delivery is acknowledged (200) but produces no additional state change or duplicate notification job                                                                                                               |
| Out-of-order webhook delivery              | A `refund.processed` event arriving before its corresponding `payment.captured` event has been processed — system doesn't crash or corrupt state                                                                                                                                   |
| Full checkout → order → payment happy path | Cart → quote → checkout → mocked Razorpay webhook → order reaches `confirmed`, inventory correctly converted from reserved to sold, a `send_email` job is enqueued                                                                                                                 |
| Reservation expiry sweep                   | A reservation past `expires_at` is released by the cron job, and the associated order (if still `pending_payment`) is marked `payment_failed`                                                                                                                                      |
| Firebase token verification                | A request with an invalid/expired token is rejected with 401 before touching any module logic                                                                                                                                                                                      |
| Role-based admin access                    | A `staff`-role token is rejected on `admin`-only endpoints (e.g. `/admin/refunds`) even though it's a valid, authenticated token                                                                                                                                                   |

### 4.2 Test data management

- Integration tests run against a **fresh, isolated database state** per test file (via transaction rollback after each test, or a fresh Neon branch per CI run) — tests never depend on or leave behind shared mutable state.
- A `tests/fixtures/` directory holds reusable seed data builders (`createTestProduct()`, `createTestUser()`, `createTestOrder()`) so tests read clearly without repeating setup boilerplate.
- Never run integration tests against the production or staging database.

---

## 5. End-to-End (E2E) Testing

**Tool:** Playwright
**Scope:** the smallest set of full-browser journeys that give confidence the whole system works together, run against a deployed preview environment (or local dev server) with Razorpay in **test mode**.

### 5.1 Required E2E flows

1. **Registration → email verification → login** (using Firebase Auth Emulator or a test project)
2. **Browse → search → product detail → add to cart → view cart**
3. **Full checkout, online payment:** cart → checkout → address → Razorpay test-mode payment → webhook (simulated/test mode) → order confirmation screen → order visible in order history with correct status
4. **Full checkout, COD:** cart → checkout → COD selected → OTP flow (test/sandbox mode) → order placed directly as confirmed
5. **Coupon applied at checkout** → total reflects discount correctly on the confirmation screen
6. **Order cancellation** (while status allows) → order shows cancelled, stock released
7. **Return request → admin approval → refund** (spanning both customer and admin UI in one test, since this is a cross-role flow worth verifying end-to-end)
8. **Admin: create product → appears correctly on storefront** (verifies the full write-then-read path including image upload)
9. **Admin: update order status through the full fulfillment sequence** → customer-visible status timeline updates correctly at each step

### 5.2 What NOT to E2E test

Don't E2E test every validation error message, every filter combination, or every admin CRUD field — those belong in unit/integration tests. E2E tests are reserved for flows where the _integration between real browser, real UI, and backend_ is the actual risk being tested, not for exhaustively covering every business rule already covered elsewhere.

---

## 6. Security Testing

Cross-reference: `Security.md` Section 14 (Pre-Launch Security Checklist) is the authoritative list; this section describes _how_ those checks are executed as tests, not just as a manual checklist.

| Check                                      | How it's automated                                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unauthenticated access to protected routes | Integration test suite hits every route under `/api/**` (except explicitly public ones) with no/invalid token, asserts 401                                                                                   |
| Role escalation                            | Integration test hits every `/api/admin/**` route with a valid `customer`-role token, asserts 403                                                                                                            |
| IDOR (accessing another user's resource)   | Integration test creates two users, asserts User A cannot fetch User B's order/address/wishlist by ID                                                                                                        |
| Price/total tampering                      | Integration test sends a checkout request with a client-supplied `total` field different from the correct server calculation, asserts the server-computed total is what's actually charged, not the client's |
| Webhook signature bypass                   | Integration test sends a webhook payload with an invalid/missing signature, asserts 400 and no state change                                                                                                  |
| SQL injection                              | Not a dedicated test suite item — mitigated structurally by Prisma's parameterization; covered incidentally by fuzzing inputs through Zod validation tests instead                                           |
| Rate limiting                              | Integration test hammers `/otp/request` beyond the limit, asserts `429 RATE_LIMITED` on the next attempt                                                                                                     |
| File upload validation                     | Integration test uploads a renamed `.exe` as `.jpg`, asserts rejection based on actual content inspection, not just extension                                                                                |
| Secret exposure in client bundle           | CI step: build the app, grep the output bundle for known secret-key patterns/prefixes (e.g. Razorpay secret key prefix), fail the build if found                                                             |

These security-focused tests live alongside the regular integration suite (often in a `tests/integration/security/` subfolder) and run in CI on every PR, not as a separate manual pre-launch-only activity — though the Section 14 checklist in `Security.md` is still walked manually before an actual production launch as a final human review.

---

## 7. Performance Testing

Given the target scale (~100 concurrent users, ~1,000 orders/month), performance testing is calibrated to that reality — not enterprise load-testing theater for traffic the platform doesn't have.

### 7.1 What's tested

| Target                               | Method                                                                                                                                                     | Goal                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Product listing/search page load     | Lighthouse/Web Vitals check in CI (or manual spot-check) on representative pages                                                                           | LCP < 2.5s on mobile (per `PRD.md` success metrics)                                                                               |
| Checkout under light concurrent load | A simple k6 or Artillery script simulating ~20–50 concurrent checkout attempts (well above realistic peak for current scale, as headroom)                  | No errors, no oversold inventory, response times remain reasonable (a few hundred ms to low seconds for the checkout-create step) |
| Database query performance           | `EXPLAIN ANALYZE` review on the core listing/search queries and the checkout transaction, checked against the indexes defined in `Data_Model_DB_Schema.md` | No sequential scans on tables expected to use an index at this data volume                                                        |
| Image delivery                       | Spot-check that product images are served in optimized formats (WebP) and reasonably sized, not full-resolution originals on listing pages                 | Contributes to the LCP target above                                                                                               |

### 7.2 What's explicitly deferred

Full-scale load testing simulating thousands of concurrent users, multi-region latency testing, and stress-testing Neon's autoscaling limits are deferred until real traffic or business growth actually approaches those numbers — per the scaling triggers table in `Architecture.md` Section 9. Building elaborate load-test infrastructure for traffic the platform doesn't have yet is scope creep, not diligence.

---

## 8. Mocking Strategy for External Providers

| Provider         | Unit tests                                                 | Integration tests                                                   | E2E tests                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebase Auth    | N/A (auth module logic tested directly)                    | Firebase Auth Emulator                                              | Firebase Auth Emulator or a dedicated test project                                                                                                                                  |
| Razorpay         | Mocked interface (`PaymentProvider`) with canned responses | Mocked HTTP responses (recorded fixtures) for create/verify/webhook | Real Razorpay **test mode** (their sandbox, not a mock) — this is the one place a real (but sandboxed) integration matters                                                          |
| MSG91            | Mocked `SmsProvider`                                       | Mocked HTTP responses                                               | Sandbox/test mode if MSG91 provides one; otherwise a stubbed provider swapped in via environment config for E2E runs                                                                |
| Resend           | Mocked `EmailProvider`                                     | Mocked HTTP responses, or Resend's test-mode API key if available   | Not exercised in E2E (email delivery isn't asserted in the browser) — verified instead via a job-queue integration test that the "send_email" job was enqueued with correct payload |
| Firebase Storage | Mocked `StorageProvider`                                   | Firebase Storage Emulator                                           | Firebase Storage Emulator                                                                                                                                                           |

**Rule:** never let a test suite depend on live third-party credentials or live external calls except the explicitly-chosen Razorpay test-mode case in E2E — this keeps tests fast, deterministic, and runnable without real API keys in CI.

---

## 9. CI Integration

```
On every PR:
  lint → typecheck → unit tests → integration tests (against ephemeral Neon branch)
  → security-focused integration tests → build (+ secret-scan grep) → E2E smoke subset

On merge to main / before production deploy:
  full E2E suite (all flows in Section 5.1) against the preview deployment
```

- Unit + integration tests must pass for a PR to be mergeable — this is a hard gate, not advisory.
- The full E2E suite runs on every merge to `main`, not on every single commit/PR push, to keep PR feedback fast; a smaller "smoke" subset (registration, browse-to-cart, one checkout path) can run on PRs touching checkout/payment code specifically.

---

## 10. Definition of Done (testing-specific)

A change is not complete until:

- [ ] New/changed logic in `pricing`, `inventory`, `coupons`, `orders`, `payments`, or `refunds` has unit tests covering the new behavior and relevant edge cases
- [ ] Any change to a concurrent/race-condition-sensitive flow has an integration test proving the race is actually handled (not just "looks correct" on a single-request read-through)
- [ ] Any new API endpoint has at least: one success-path integration test, one auth-failure test, one authorization-failure test (if role/ownership-gated)
- [ ] Any bug fix includes a regression test that would have failed before the fix
- [ ] Checkout/payment-path changes are covered by the relevant E2E smoke test, or the E2E suite is updated if the flow itself changed
- [ ] No test was skipped, weakened, or deleted to make CI pass without addressing the underlying issue

---

## 11. Explicitly Deferred (v2+ testing investment)

- Automated visual regression testing (screenshot diffing)
- Chaos/fault-injection testing (simulating Neon/Firebase/Razorpay outages)
- Full accessibility audit automation beyond basic axe-core checks in E2E
- Large-scale load testing (see Section 7.2)
- Contract testing against third-party provider API schemas (mitigated for now by keeping provider adapters thin and well-isolated behind interfaces per `Architecture.md`)
