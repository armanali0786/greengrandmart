# E-Commerce Platform — Implementation Plan

**Scale target:** ~100 concurrent users, ~500 products, ~1,000 orders/month
**Budget:** ~₹10,000/month infra (actual usage ~₹2,500–4,000/month)
**Vertical:** fashion, beauty, and accessories, for girls and women (see `PRD.md` §1)
**Principle:** No dead ends. Every module is built so it can grow 10–20x without a rewrite, but nothing is over-built for today's traffic.

---

## 1. Final Tech Stack

| Concern                           | Choice                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Frontend + Backend                | Next.js (App Router), TypeScript — one codebase                               |
| Hosting                           | Vercel Pro                                                                    |
| Database                          | Postgres (Neon)                                                               |
| ORM                               | Prisma or Drizzle (Prisma recommended for this scale — better DX, migrations) |
| Auth (email/password, Google)     | Firebase Authentication                                                       |
| Phone OTP (COD confirmation only) | MSG91 — custom OTP flow, not Firebase phone auth                              |
| File storage                      | Firebase Storage                                                              |
| Payments                          | Razorpay                                                                      |
| Transactional email               | Resend                                                                        |
| Push notifications                | Firebase Cloud Messaging (web push)                                           |
| Background jobs                   | Vercel Cron + queue table in Postgres (no Redis/Pub/Sub needed yet)           |
| Monitoring                        | Sentry (free tier) + Vercel Analytics                                         |
| PDF invoices                      | `@react-pdf/renderer` or `pdf-lib`, generated server-side                     |

---

## 2. High-Level Architecture

```
                         ┌─────────────────────┐
                         │   Next.js (Vercel)    │
                         │  - App Router pages    │
                         │  - Server Actions      │
                         │  - Route Handlers (API)│
                         └──────────┬─────────────┘
                                    │
        ┌───────────────┬──────────┼──────────┬─────────────────┐
        │               │          │          │                 │
   Firebase Auth   Firebase      Postgres   Razorpay        MSG91 / Resend / FCM
   (verify ID       Storage      (Neon)     (payments)      (OTP / email / push)
    token)          (images,
                     invoices)
```

Everything lives in one Next.js app deployed to Vercel. "Modules" below are **folders with clear boundaries**, not separate services — this is a modular monolith, matching your traffic level. Extraction to separate services is a _future_ option, not a day-one requirement (see Section 14).

---

## 3. Database Schema (Postgres)

All money values stored as integers in paise (₹1 = 100 paise) to avoid float rounding errors. All tables have `created_at`, `updated_at`; sensitive tables also get `deleted_at` for soft deletes.

### Core identity & access

```
users
  id (uuid, pk)
  firebase_uid (unique, not null)
  email (unique)
  phone (nullable)
  phone_verified (bool, default false)
  name
  role (enum: customer, admin, staff)
  created_at, updated_at, deleted_at

addresses
  id, user_id (fk), name, phone, line1, line2, landmark,
  city, state, postal_code, country default 'IN',
  is_default_shipping, is_default_billing
```

### Catalog

```
brands        (id, name, slug, logo_path)
categories    (id, name, slug, parent_id nullable, image_path)
products      (id, name, slug, description, short_description,
               brand_id, category_id, status enum(draft,active,archived),
               base_price, sale_price, gst_rate, hsn_code,
               seo_title, seo_description, is_featured)
product_variants
              (id, product_id, sku unique, attributes jsonb
               e.g. {"size":"M","color":"Black"},
               price, sale_price, stock_managed bool)
product_images
              (id, product_id, variant_id nullable, storage_path,
               alt_text, sort_order, is_primary)
```

### Inventory

```
inventory
  id, variant_id (fk, unique), available_qty, reserved_qty,
  sold_qty, damaged_qty, low_stock_threshold

inventory_reservations
  id, variant_id, order_id nullable, cart_id nullable,
  quantity, status enum(active, released, converted),
  expires_at

inventory_movements
  id, variant_id, type enum(restock, sale, return, damage, adjustment),
  quantity, reference_type, reference_id, note, created_by
```

**Rule:** stock changes only ever happen through a single `InventoryService` function that runs inside a DB transaction with `SELECT ... FOR UPDATE` on the row. No other code path touches `inventory` directly.

### Cart

```
carts        (id, user_id nullable, session_id nullable, status enum(active,converted,abandoned))
cart_items   (id, cart_id, variant_id, quantity, price_snapshot)
```

Price shown in cart is a snapshot for UX only — always recalculated server-side at checkout.

### Pricing / Coupons / Promotions

```
coupons
  id, code unique, type enum(percentage,fixed), value,
  max_discount, min_cart_value, starts_at, expires_at,
  usage_limit_total, usage_limit_per_user, active,
  applies_to jsonb (product_ids / category_ids / brand_ids / all)

coupon_redemptions
  id, coupon_id, user_id, order_id, redeemed_at
  UNIQUE (coupon_id, user_id)  -- enforces per-user limit atomically

promotions
  id, name, type enum(sale_price,category_discount,bogo,bundle,free_shipping),
  rules jsonb, starts_at, expires_at, active
```

### Checkout / Orders / Payments (kept strictly separate)

```
orders
  id, order_number unique, user_id, status enum(
      pending_payment, payment_failed, confirmed, processing,
      packed, shipped, out_for_delivery, delivered,
      cancel_requested, cancelled, return_requested,
      return_approved, returned, refund_pending, refunded),
  subtotal, discount_total, coupon_discount, shipping_fee,
  tax_total, grand_total,
  shipping_address jsonb (snapshot),
  billing_address jsonb (snapshot),
  placed_at

order_items
  id, order_id, product_id, variant_id, product_name_snapshot,
  sku_snapshot, variant_attrs_snapshot jsonb,
  unit_price, discount, tax_amount, quantity, line_total

order_status_history
  id, order_id, from_status, to_status, changed_by, note, created_at

payments
  id, order_id, provider default 'razorpay', razorpay_order_id,
  status enum(created,pending,authorized,captured,failed,
              cancelled,refund_pending,refunded,partially_refunded),
  amount, created_at

payment_attempts
  id, payment_id, razorpay_payment_id, razorpay_signature,
  status, raw_response jsonb, attempted_at

webhook_events
  id, provider, event_id unique, event_type, payload jsonb,
  processed_at   -- unique constraint on event_id = idempotency guard

refunds
  id, order_id, payment_id, type enum(full,partial,item,shipping),
  amount, status enum(pending,processing,completed,failed),
  provider_refund_id, reason, created_by
```

### Shipping / Returns

```
shipments
  id, order_id, provider, shipment_id, tracking_number,
  status, carrier, estimated_delivery

shipment_tracking_events
  id, shipment_id, status, location, occurred_at

returns
  id, order_id, order_item_id, reason, status enum(
      requested,approved,rejected,item_received,completed),
  requested_at
```

### Reviews / Wishlist / Notifications

```
reviews
  id, product_id, user_id, order_item_id nullable (verified purchase link),
  rating, title, body, status enum(pending,approved,rejected),
  helpful_count

review_images  (id, review_id, storage_path)

wishlists      (id, user_id)
wishlist_items (id, wishlist_id, variant_id)

notifications
  id, user_id, type, title, body, data jsonb, read bool, created_at

device_tokens  (id, user_id, fcm_token, platform, created_at)
```

### OTP (MSG91 — custom, since we're not using Firebase phone auth)

```
otp_requests
  id, phone, purpose enum(cod_confirmation, phone_verification),
  code_hash, expires_at, attempts, max_attempts default 5,
  verified bool, created_at, ip_address
```

**Rules:**

- Generate a 6-digit code server-side, hash it before storing (never store plaintext OTP).
- Rate limit: max 3 OTP requests per phone per 10 minutes; max 5 verify attempts per code.
- Cooldown of 60s between resend requests for the same phone.
- Never return the OTP itself in any API response, ever — only "sent" / "verified" / "invalid".

### Background jobs (replaces need for Pub/Sub at this scale)

```
job_queue
  id, type, payload jsonb, status enum(pending,processing,done,failed),
  attempts, max_attempts default 3, run_after, created_at, processed_at
```

A Vercel Cron job (every 1 minute) picks up pending jobs, processes them (send email, generate invoice, send push, etc.), and marks done/failed with retry count. This gives you the reliability of a queue without needing Redis/Pub/Sub. Migrate to Cloud Tasks or a real queue only if job volume grows enough to need sub-minute latency or higher throughput.

### Audit log

```
audit_logs
  id, actor_user_id, action, entity_type, entity_id,
  before jsonb, after jsonb, ip_address, user_agent, created_at
```

Every admin write to `products`, `inventory`, `orders`, `refunds`, `users.role` gets an audit row via a shared `withAudit()` wrapper — don't rely on remembering to log each place.

---

## 4. Module / Folder Structure

```
ecommerce/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (storefront)/
│   │   │   ├── page.tsx                 # home
│   │   │   ├── products/[slug]/page.tsx
│   │   │   ├── categories/[slug]/page.tsx
│   │   │   ├── cart/page.tsx
│   │   │   ├── checkout/page.tsx
│   │   │   ├── account/
│   │   │   │   ├── orders/page.tsx
│   │   │   │   ├── addresses/page.tsx
│   │   │   │   ├── wishlist/page.tsx
│   │   │   │   └── notifications/page.tsx
│   │   ├── (admin)/
│   │   │   └── admin/
│   │   │       ├── dashboard/page.tsx
│   │   │       ├── products/page.tsx
│   │   │       ├── orders/page.tsx
│   │   │       ├── inventory/page.tsx
│   │   │       ├── coupons/page.tsx
│   │   │       ├── refunds/page.tsx
│   │   │       └── audit-logs/page.tsx
│   │   └── api/
│   │       ├── auth/session/route.ts
│   │       ├── otp/request/route.ts
│   │       ├── otp/verify/route.ts
│   │       ├── products/route.ts
│   │       ├── cart/route.ts
│   │       ├── checkout/quote/route.ts
│   │       ├── checkout/route.ts
│   │       ├── payments/webhook/route.ts
│   │       ├── orders/[id]/route.ts
│   │       ├── admin/products/route.ts
│   │       ├── admin/orders/[id]/status/route.ts
│   │       └── cron/process-jobs/route.ts
│   ├── modules/                          # all business logic lives here, NOT in route files
│   │   ├── auth/          (verifyFirebaseToken, getSessionUser, roleGuard)
│   │   ├── catalog/       (product/category/brand queries, search)
│   │   ├── inventory/     (reserve, release, convert, restock — all transactional)
│   │   ├── cart/          (add/update/remove, server-side revalidation)
│   │   ├── pricing/       (single source of truth: computeOrderTotal())
│   │   ├── coupons/       (validate, redeem — atomic)
│   │   ├── promotions/
│   │   ├── checkout/      (orchestrates cart→order→payment)
│   │   ├── orders/        (state machine, status transitions, snapshots)
│   │   ├── payments/      (RazorpayProvider implementing PaymentProvider interface)
│   │   ├── refunds/
│   │   ├── shipping/      (ShippingProvider interface, adapter per courier)
│   │   ├── invoices/      (PDF generation, storage upload, signed URL)
│   │   ├── notifications/ (EmailProvider=Resend, SmsProvider=MSG91, PushProvider=FCM)
│   │   ├── otp/           (MSG91 integration, hashing, rate limits)
│   │   ├── reviews/
│   │   ├── wishlist/
│   │   ├── admin/         (RBAC guards, audit wrapper)
│   │   └── jobs/          (job_queue producer/consumer, handlers per job type)
│   ├── lib/
│   │   ├── db.ts          (Prisma client singleton)
│   │   ├── firebase-admin.ts
│   │   ├── firebase-client.ts
│   │   └── rate-limit.ts  (Postgres-backed sliding window)
│   └── types/
├── firebase/
│   └── storage.rules
├── .env.example
└── docs/
    ├── ARCHITECTURE.md
    ├── DATABASE.md
    ├── SECURITY.md
    ├── API.md
    └── SCALING.md
```

**Golden rule:** route handlers and server actions are thin — they parse input, call a module function, return the result. All logic (pricing math, inventory locking, state transitions) lives in `modules/*`, fully unit-testable without spinning up Next.js.

---

## 5. Critical Flows

### 5.1 Checkout & Payment (the flow that must never have a loophole)

```
1. Client calls POST /checkout/quote with cart_id
   → server recalculates: subtotal, coupon discount, promotions,
     shipping, GST — using CURRENT DB prices, ignoring anything
     the client sends about pricing.
   → returns authoritative total. Client shows this, cannot alter it.

2. Client confirms → POST /checkout
   → BEGIN TRANSACTION
     - re-validate stock for every item
     - create inventory_reservations (expires_at = now + 15 min)
     - create order (status = pending_payment) with item snapshots
   → COMMIT
   → create Razorpay order via PaymentProvider.createPayment()
   → return razorpay_order_id + key to client

3. Client completes payment in Razorpay checkout widget
   → client-side "success" callback is NOT trusted.
   → client sends razorpay_payment_id + razorpay_order_id + razorpay_signature
     to POST /checkout/confirm
   → server verifies signature using Razorpay secret (HMAC SHA256)
   → if valid: create payment_attempts row, but order stays pending_payment
     until the WEBHOOK also confirms (defense in depth)

4. Razorpay sends webhook → POST /payments/webhook
   → verify webhook signature (different secret from checkout signature)
   → check webhook_events.event_id — if already processed, return 200 and stop
   → if payment.captured:
       BEGIN TRANSACTION
         - update payments.status = captured
         - update orders.status = confirmed
         - convert inventory_reservations → sold (decrement available_qty,
           increment sold_qty)
       COMMIT
       → enqueue jobs: send confirmation email, generate invoice,
         send push notification, notify admin
   → if payment.failed:
       - update orders.status = payment_failed
       - release inventory_reservations back to available

5. Reservation expiry sweep (cron, every 5 min):
   → find inventory_reservations where status=active AND expires_at < now
   → release reservation, set order.status = payment_failed (if still pending)
```

This gives you: no frontend-trusted price, no frontend-trusted payment success, idempotent webhook handling, and no oversold inventory — even under concurrent checkouts.

### 5.2 COD Order Confirmation (MSG91 OTP)

```
1. Customer selects Cash on Delivery at checkout
2. POST /otp/request { phone, purpose: 'cod_confirmation' }
   → rate-limit check (3/10min per phone, tracked in otp_requests)
   → generate 6-digit code, hash it (bcrypt/argon2), store with 5-min expiry
   → call MSG91 API to send SMS — never expose MSG91 API key to client
   → return { sent: true } only
3. Customer enters code → POST /otp/verify { phone, code }
   → look up latest unexpired otp_requests row for phone
   → increment attempts; if attempts > max_attempts, invalidate
   → compare hash; if match, mark verified=true
   → only on verified=true does checkout proceed to create the order
4. otp_requests rows older than 24h are purged by a daily cron job
```

### 5.3 Coupon Redemption (race-safe)

```
1. At /checkout/quote, coupon validated: active, date range, min cart value,
   product/category restrictions — read-only, no lock needed here.
2. At actual order creation (step in 5.1), inside the SAME transaction:
   → attempt INSERT INTO coupon_redemptions (coupon_id, user_id, order_id)
   → UNIQUE (coupon_id, user_id) constraint means a second concurrent
     request for the same user+coupon fails at the DB level, not in app code
   → also check total usage count against usage_limit_total inside the
     transaction with SELECT ... FOR UPDATE on the coupon row
```

### 5.4 Refunds

```
Admin initiates refund → POST /admin/refunds
  → create refunds row (status=pending)
  → call RazorpayProvider.refundPayment() with a generated idempotency key
  → on provider response, update status accordingly
  → webhook for refund.processed also updates status (idempotent, same
    webhook_events table pattern as payments)
  → on completed: update order status, restock inventory if it's a return-refund,
    enqueue "refund completed" email
```

---

## 6. Notifications Architecture

All notification sends happen through the `job_queue`, never inline during a request:

```
Event (e.g. ORDER_CONFIRMED)
   → jobs.enqueue({ type: 'send_email', payload: {...} })
   → jobs.enqueue({ type: 'send_push', payload: {...} })
   → jobs.enqueue({ type: 'generate_invoice', payload: {...} })

Cron (every 1 min) picks up pending jobs:
   → EmailProvider (Resend) / PushProvider (FCM) / SmsProvider (MSG91)
   → on failure: increment attempts, retry with backoff up to max_attempts
   → on final failure: mark 'failed', log to audit, admin can see failed
     jobs in an admin panel view
```

This means checkout responds instantly to the customer — it never waits on an email or SMS provider round-trip.

---

## 7. Security Checklist (mapped to this exact stack)

- [ ] Every API route/server action calls `verifyFirebaseToken()` before touching data
- [ ] Role check (`customer`/`staff`/`admin`) re-read from DB on every admin request — never trusted from a client-supplied field
- [ ] All money math happens in `modules/pricing` only — no other file computes a total
- [ ] Stock changes only through `modules/inventory`, always inside a DB transaction with row locks
- [x] Razorpay signature verified server-side on both the client-confirm step AND the webhook
- [x] `webhook_events.event_id` unique constraint enforces webhook idempotency
- [ ] OTP codes hashed at rest, rate-limited, never echoed back in any response
- [ ] Coupon redemption uniqueness enforced by DB constraint, not app-level checks
- [ ] All secrets (Razorpay, MSG91, Resend, Firebase Admin JSON, DB URL) in Vercel encrypted env vars — nothing in `NEXT_PUBLIC_*`
- [ ] Firebase Storage rules: product images publicly readable, writes require authenticated admin; invoices/user uploads private, served via signed URLs only
- [ ] Admin sensitive actions (refund, price change, role change, stock override) wrapped in `withAudit()` writing to `audit_logs`
- [ ] Rate limiting (Postgres-backed) on: login, OTP request/verify, checkout, coupon validation, review creation
- [ ] Input validation with Zod on every route handler, not just the frontend form
- [ ] Order line items always snapshot product data — orders never join live against current `products` table

---

## 8. Testing Strategy

- **Unit tests** (Vitest/Jest): pricing calculations, coupon validation logic, inventory reservation logic, order/payment state machines — all pure functions in `modules/*`, no DB needed if you mock the repository layer.
- **Integration tests**: checkout flow against a real test Postgres DB (Neon branch or local Docker Postgres), Razorpay test-mode webhooks with sample payloads (including duplicate/out-of-order delivery), OTP flow with MSG91 sandbox if available.
- **E2E tests** (Playwright): signup → browse → cart → coupon → checkout → payment (Razorpay test mode) → order confirmation → admin marks shipped → customer sees status.
- Treat any test touching money, stock, or coupons as mandatory before merge — everything else can be best-effort initially.

---

## 9. CI/CD

```
Pull Request → lint + typecheck + unit tests + build
Merge to main → deploy to Vercel Preview (auto)
Manual promote → Vercel Production
```

Use a separate Neon branch (instant, free with Neon branching) per PR for integration tests against real Postgres without touching production data. Use Firebase Auth's built-in emulator for local dev so you never need real Firebase credentials on a dev machine.

---

## 10. Environments

- **Local dev**: Firebase Auth Emulator, local/dev Neon branch, Razorpay test keys, MSG91 test mode (or console-log stub in dev only — never a silent mock in production code paths)
- **Production**: real Firebase project, Neon production branch, live Razorpay keys, live MSG91 account

---

## 11. Admin Panel — Pages & RBAC

| Page                                                          | Roles                                        |
| ------------------------------------------------------------- | -------------------------------------------- |
| Dashboard (sales, pending orders, low stock, pending returns) | admin, staff                                 |
| Products / Categories / Brands / Variants                     | admin, staff (content)                       |
| Inventory                                                     | admin, staff (warehouse)                     |
| Orders                                                        | admin, staff                                 |
| Payments / Refunds                                            | admin only                                   |
| Coupons / Promotions                                          | admin, staff (marketing)                     |
| Customers                                                     | admin, staff (support) — read-only for staff |
| Shipping / Returns                                            | admin, staff                                 |
| Reviews (moderation)                                          | admin, staff                                 |
| Audit Logs                                                    | admin only                                   |
| Settings (tax rates, shipping rules)                          | admin only                                   |

Two roles (`admin`, `staff`) plus `customer` is enough at your scale. Add finer-grained permissions later only if you actually hire people who need restricted access — don't build 9 roles for a 2-person team.

---

## 12. What NOT to build yet (explicitly deferred)

- Microservices — stay in the modular monolith until traffic data says otherwise
- Redis / caching layer — Postgres + Vercel's CDN caching covers you until much higher traffic
- Kafka / Pub/Sub — the `job_queue` table + cron covers background work at this volume
- Dedicated search service (Algolia/OpenSearch) — Postgres full-text search (`tsvector`) handles 500 products easily; the `SearchService` interface is abstracted so swapping in Algolia later is a contained change
- Multi-region deployment — single region (choose Neon + Vercel region closest to your users, e.g. Mumbai/Singapore) is correct for an India-only launch
- Kubernetes — not needed; Vercel handles scaling automatically

---

## 13. Cost Recap

| Service                           | ~Monthly cost           |
| --------------------------------- | ----------------------- |
| Vercel Pro                        | ₹1,750                  |
| Neon Postgres                     | ₹500–1,000              |
| Firebase Storage                  | ₹100–200                |
| Firebase Auth (email/Google)      | ₹0                      |
| Resend                            | ₹0 (free tier)          |
| MSG91 (COD OTP only, ~200-300/mo) | ₹50–100                 |
| Domain (amortized)                | ₹100                    |
| **Total**                         | **~₹2,500–3,150/month** |

Razorpay's ~2% transaction fee comes out of payment revenue, not this fixed budget.

---

## 14. Future Scaling Path (so nothing dead-ends)

| Trigger                                                                     | What changes                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orders > 5,000/month or checkout latency rising                             | Move `job_queue` processing to Cloud Tasks/Pub/Sub instead of cron polling                                                                                                    |
| Product catalog > 2,000 or search feels slow                                | Swap `SearchService` implementation to Algolia/Meilisearch — interface unchanged                                                                                              |
| Read-heavy pages slow under load                                            | Add Redis (Upstash serverless, still no ops burden) for hot product/category caching                                                                                          |
| Postgres compute maxed                                                      | Neon scales compute vertically first (no migration needed); add read replicas next                                                                                            |
| One module (e.g. notifications, payments) needs independent scaling/deploys | Extract that module only, communicating via the same event/job pattern already in place — the modular monolith was built for exactly this                                     |
| Multiple warehouses / multi-courier complexity grows                        | `ShippingProvider` interface already supports adding adapters without touching order logic                                                                                    |
| International expansion                                                     | Multi-currency support needs to be added to `pricing` and `orders` — flagged now so schema (paise-based ints, GST-specific fields) isn't blindly reused for other tax regimes |

Nothing in this plan requires a rewrite to reach 10,000+ users — only additive changes behind interfaces that already exist.

---

## 15. Implementation Order (phased)

1. **Foundations** — Next.js + Prisma + Neon setup, Firebase Auth (email + Google), env config, base folder structure
2. **Users & RBAC** — profile, addresses, role field, admin guard middleware
3. **Catalog** — products, categories, brands, variants, image upload to Firebase Storage
4. **Inventory & Cart** — reservation logic, cart CRUD, server-side price recalculation
5. **Pricing, Coupons, Promotions, Tax (GST)** — centralized `computeOrderTotal()`
6. **Checkout & Orders** — order state machine, snapshotting
7. **Payments** — Razorpay integration, signature verification, webhook handler, idempotency
8. **Shipping, Returns, Refunds, Invoices**
9. **Notifications** — job_queue, Resend email, FCM push, MSG91 OTP for COD
10. **Admin Panel** — all pages, audit logging
11. **SEO, performance, analytics**
12. **Testing, monitoring, backup strategy, production deployment**

Each phase should be fully working and testable before moving to the next — don't parallelize phases 6–9, since checkout is the highest-risk area and needs to be solid before layering notifications/admin on top of it.
