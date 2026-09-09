# Architecture — GreenGrandMart

**Companion docs:** `PRD.md` · `Product_Spec_Requirements.md` · `UX_UI_Spec.md` · `ECOMMERCE_IMPLEMENTATION_PLAN.md`
**Purpose:** describe the system at the component/service level — what talks to what, how data flows through the platform, and where the architectural boundaries sit for future scaling.

---

## 1. Architecture Style

**Modular monolith, single deployable application.**

One Next.js codebase contains the storefront, the admin panel, and all backend logic (as Route Handlers / Server Actions). Internally, code is organized into isolated modules with explicit boundaries (Section 4), so the system _behaves_ like a set of services without the operational cost of running actual microservices at this scale. Modules talk to each other through function calls and an internal event/job mechanism — never by reaching into another module's database tables directly.

This is deliberate: at ~100 concurrent users and ~1,000 orders/month, network hops between microservices would add latency and failure surface with no scaling benefit. The module boundaries exist so any module _can_ be extracted into its own service later (Section 9) without redesigning how it talks to the rest of the system.

---

## 2. System Context Diagram

```
                                   ┌───────────────┐
                                   │   Customer     │
                                   │  (browser/PWA) │
                                   └───────┬────────┘
                                           │ HTTPS
                                           ▼
                              ┌────────────────────────┐
                              │   GreenGrandMart App     │
                              │   (Next.js on Vercel)    │
                              │  storefront + admin +    │
                              │  API route handlers      │
                              └──┬─────┬─────┬─────┬────┘
                 ┌───────────────┘     │     │     └───────────────┐
                 ▼                     ▼     ▼                     ▼
        ┌────────────────┐   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │ Firebase Auth   │   │  Postgres     │ │  Firebase     │ │  Razorpay     │
        │ (identity)      │   │  (Neon)       │ │  Storage      │ │  (payments)   │
        └────────────────┘   │  (source of   │ │  (images,     │ └──────────────┘
                              │   truth for   │ │   invoices)   │
                              │   all business│ └──────────────┘
                              │   data)       │
                              └──────────────┘
                                           ▲
                     ┌─────────────────────┼─────────────────────┐
                     ▼                     ▼                     ▼
             ┌───────────────┐   ┌───────────────┐     ┌──────────────────┐
             │  Resend        │   │  MSG91         │     │  Firebase Cloud    │
             │  (email)       │   │  (COD OTP SMS) │     │  Messaging (push)  │
             └───────────────┘   └───────────────┘     └──────────────────┘
                                           ▲
                                           │ webhook (signed)
                                  ┌────────┴────────┐
                                  │    Razorpay      │
                                  │  (async events)  │
                                  └─────────────────┘
```

**Admin users** (browser) hit the same Next.js app on protected `/admin` routes — there is no separate admin service or deployment.

---

## 3. Component Inventory

| Component                                                                                                        | Responsibility                                                                                      | Talks to                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Storefront UI** (Next.js pages/Server Components)                                                              | Renders catalog, cart, checkout, account pages                                                      | Backend modules via Server Actions/fetch to Route Handlers                  |
| **Admin UI**                                                                                                     | Renders admin dashboard/management screens                                                          | Same backend modules, gated by role check                                   |
| **Route Handlers / Server Actions**                                                                              | Thin request layer: parse input (Zod), auth-check, call module function, return response            | Modules only — no business logic here                                       |
| **Business modules** (`src/modules/*`)                                                                           | All actual logic: pricing, inventory locking, order state machine, payment orchestration, etc.      | Postgres (via Prisma), external provider adapters                           |
| **Provider adapters** (`PaymentProvider`, `SmsProvider`, `EmailProvider`, `ShippingProvider`, `StorageProvider`) | Translate an internal interface call into a specific vendor's API call                              | Razorpay, MSG91, Resend, Firebase Storage, courier APIs                     |
| **Job queue** (`job_queue` table + Vercel Cron)                                                                  | Decouples slow/non-critical work (email, push, invoice PDF, SMS) from the request/response cycle    | Provider adapters                                                           |
| **Firebase Auth**                                                                                                | Identity provider: email/password, Google OAuth, session tokens                                     | Verified server-side via Firebase Admin SDK on every protected request      |
| **Postgres (Neon)**                                                                                              | System of record for all business data: users, products, inventory, orders, payments, coupons, etc. | Accessed only through Prisma from within modules                            |
| **Firebase Storage**                                                                                             | Binary storage for product images, review images, generated invoice PDFs                            | Written to by `catalog` and `invoices` modules; read via public/signed URLs |

---

## 4. Module Boundaries (internal service map)

Each module owns its own data access and exposes a small function-level interface to the rest of the app. No module queries another module's tables directly.

```
auth        → verifies identity, exposes getSessionUser(), requireRole()
catalog     → products, categories, brands, variants, images, search
inventory   → available/reserved/sold stock; the ONLY writer of `inventory*` tables
cart        → cart/cart_items; calls catalog + inventory to validate on read
pricing     → computeOrderTotal(); the ONLY place order totals are calculated
coupons     → validate(), redeem() — redemption uses DB-level uniqueness
promotions  → automatic discount rules, read by pricing
checkout    → orchestrator: calls cart, pricing, coupons, inventory, orders, payments
orders      → order state machine, snapshots, status history
payments    → PaymentProvider interface + RazorpayPaymentProvider implementation
refunds     → refund state machine, calls payments.refundPayment()
shipping    → ShippingProvider interface, shipment tracking
invoices    → PDF generation, upload to StorageProvider
otp         → MSG91 integration, hashing, rate limiting (COD confirmation only)
notifications → EmailProvider / SmsProvider / PushProvider, enqueues jobs
reviews     → review CRUD + moderation, checks order history for "verified purchase"
wishlist    → wishlist CRUD
admin       → RBAC guards, audit log writer (withAudit wrapper)
jobs        → job_queue producer/consumer, dispatches to notifications/invoices
```

**Dependency rule:** `checkout` is the only module allowed to call across `cart`, `pricing`, `coupons`, `inventory`, `orders`, and `payments` in one flow — it is the orchestrator. Other modules do not call each other laterally except through this pattern (e.g. `refunds` calls `payments`, not the other way around).

---

## 5. Data Flow: Key Operations

### 5.1 Page Request (read path)

```
Browser → Next.js Server Component
        → module function (e.g. catalog.listProducts())
        → Prisma → Postgres
        ← rows
        ← rendered HTML (SSR) or JSON (client fetch)
```

Product listing/detail pages are server-rendered where possible for SEO and fast first paint; cart/account pages use client-side fetching against Route Handlers since they're per-user and not SEO-relevant.

### 5.2 Checkout & Payment (write path — the most critical flow)

```
1. Client → POST /api/checkout/quote
     → checkout module calls pricing.computeOrderTotal() using CURRENT
       DB prices (ignores any amount the client might send)
     ← authoritative total returned

2. Client → POST /api/checkout
     → checkout module, inside ONE Postgres transaction:
         - inventory.reserve() for each item (row-locked)
         - orders.create() with item snapshots (status=pending_payment)
     → payments.createPayment() → Razorpay API → razorpay_order_id
     ← order_id + razorpay_order_id returned to client

3. Client completes payment in Razorpay widget
     → client → POST /api/checkout/confirm (payment_id, order_id, signature)
     → payments.verifySignature() — necessary, not sufficient

4. Razorpay → POST /api/payments/webhook (async, out-of-band)
     → verify webhook signature
     → check webhook_events.event_id (idempotency guard)
     → if payment.captured, inside ONE transaction:
         - payments.markCaptured()
         - orders.markConfirmed()
         - inventory.convertReservationToSale()
     → jobs.enqueue(send_email, generate_invoice, send_push, notify_admin)
```

The order only ever becomes `confirmed` from the webhook path — never from the client-facing confirm call alone. This is the core anti-fraud/anti-race-condition boundary in the whole system.

### 5.3 Background Job Processing

```
Vercel Cron (every 1 min) → GET/POST /api/cron/process-jobs
     → jobs module: SELECT pending jobs FROM job_queue (FOR UPDATE SKIP LOCKED)
     → dispatch by type:
         send_email      → notifications.sendEmail() → Resend API
         send_push       → notifications.sendPush()  → FCM API
         send_sms        → otp/notifications → MSG91 API
         generate_invoice→ invoices.generate() → PDF → Firebase Storage
     → mark job done/failed, retry with backoff up to max_attempts
```

This is intentionally a polling queue on top of Postgres rather than Pub/Sub or Redis — see Section 9 for when that changes.

### 5.4 Image Upload (Admin)

```
Admin UI → requests a signed upload URL (backend-authorized, not client-generated)
        → uploads directly to Firebase Storage using the signed URL
        → Storage triggers/backend confirms upload → catalog module writes
          product_images metadata row (path, dimensions, sort order) to Postgres
```

Raw files never pass through the Next.js server itself (avoids Vercel function payload limits) — the server only issues the authorized upload target and records metadata afterward.

### 5.5 COD OTP Flow

```
Client → POST /api/otp/request { phone }
       → otp module: rate-limit check → generate code → hash → store
       → SmsProvider (MSG91) sends SMS
       ← { sent: true } only, code never returned

Client → POST /api/otp/verify { phone, code }
       → otp module: compare hash, check attempts/expiry
       ← { verified: true/false }
       → only on true does checkout proceed to order creation
```

---

## 6. Deployment Topology

```
┌─────────────────────────────────────────────┐
│                   Vercel                      │
│  ┌───────────────────────────────────────┐   │
│  │  Next.js app (Production deployment)    │   │
│  │  - Edge/CDN for static assets            │   │
│  │  - Serverless functions for API routes   │   │
│  │  - Vercel Cron → /api/cron/process-jobs  │   │
│  └───────────────────────────────────────┘   │
└───────────────┬───────────────────────────────┘
                │
    ┌───────────┼────────────────┬─────────────────┐
    ▼           ▼                ▼                 ▼
┌────────┐ ┌──────────┐   ┌──────────────┐  ┌──────────────┐
│ Neon    │ │ Firebase  │   │ Firebase      │  │ External APIs │
│ Postgres│ │ Auth      │   │ Storage       │  │ Razorpay/     │
│ (single │ │           │   │               │  │ MSG91/Resend/ │
│ region, │ │           │   │               │  │ FCM/Courier   │
│ Mumbai) │ │           │   │               │  │               │
└────────┘ └──────────┘   └──────────────┘  └──────────────┘
```

- **Environments:** separate Vercel projects (or environment configs) for `preview`/`staging` and `production`, each pointing to its own Neon branch and its own Firebase project, so no dev work ever touches production data.
- **Region choice:** Neon and Vercel functions colocated in the region closest to the majority of users (Mumbai/Singapore) to minimize DB round-trip latency.

---

## 7. Data Stores

| Store                | Contains                                                                                                                            | Notes                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Postgres (Neon)**  | All structured business data — users, catalog, inventory, cart, orders, payments, coupons, reviews, notifications, jobs, audit logs | Single source of truth; see `ECOMMERCE_IMPLEMENTATION_PLAN.md` for full schema                                  |
| **Firebase Storage** | Product/category/review images, generated invoice PDFs                                                                              | Metadata about every file (path, dimensions, alt text) lives in Postgres — Storage holds bytes only             |
| **Firebase Auth**    | Identity records (email, hashed credentials, OAuth links)                                                                           | Not queried directly by app logic beyond token verification; `users.firebase_uid` is the join key into Postgres |

No caching layer (Redis) exists yet — see Section 9 for the trigger to add one.

---

## 8. Cross-Cutting Concerns

| Concern              | How it's handled architecturally                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication**   | Every protected Route Handler/Server Action calls `auth.verifyFirebaseToken()` before anything else runs                           |
| **Authorization**    | `admin.requireRole()` re-reads the user's role from Postgres on every admin request — never trusted from the token payload alone   |
| **Idempotency**      | Enforced at the DB level: `webhook_events.event_id` unique constraint, `coupon_redemptions (coupon_id, user_id)` unique constraint |
| **Consistency**      | Postgres transactions with row-level locking (`FOR UPDATE`) around every stock/coupon/payment-state change                         |
| **Async decoupling** | `job_queue` table + cron — request/response never blocks on email/SMS/push/PDF generation                                          |
| **Audit trail**      | `admin.withAudit()` wraps sensitive writes (price change, refund, role change, stock override) and writes to `audit_logs`          |
| **Rate limiting**    | Postgres-backed sliding-window checks on login, OTP, checkout, and coupon-validation endpoints                                     |
| **Observability**    | Sentry for error tracking, Vercel Analytics for performance, structured logs from job failures surfaced in an admin view           |

---

## 9. Scaling Boundaries (when architecture changes, and how)

The module boundaries in Section 4 exist specifically so these changes are additive, not rewrites:

| Trigger                                                                                               | Architectural change                                                                                       | What stays the same                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job volume grows / cron latency too coarse                                                            | Replace cron-polling `job_queue` with Cloud Tasks or Pub/Sub                                               | `jobs` module's public interface (`enqueue`, handler registration) is unchanged                                                                           |
| Read-heavy pages slow under load                                                                      | Add Upstash Redis for hot product/category caching                                                         | `catalog` module wraps reads with a cache-aside pattern; callers unaffected                                                                               |
| Catalog search needs typo-tolerance/relevance ranking                                                 | Swap Postgres full-text search for Algolia/Meilisearch behind `SearchService`                              | Only the `catalog.search()` implementation changes                                                                                                        |
| One module needs independent scaling or deploy cadence (e.g. `notifications` under heavy send volume) | Extract that module into its own service, communicating via the same job/event pattern already in place    | Every other module's calling code is unchanged — it still calls `notifications.send()`, just now over a queue/HTTP boundary instead of an in-process call |
| Postgres compute maxed                                                                                | Scale Neon compute vertically, then add read replicas for read-heavy modules (`catalog`, `orders` history) | Schema and module code unchanged                                                                                                                          |
| Multi-warehouse / multi-courier complexity                                                            | `ShippingProvider` interface already supports additional adapters                                          | `checkout`/`orders` modules unchanged                                                                                                                     |

No component in this architecture requires a full rewrite to reach 10,000+ users — every scaling step above is an addition behind an existing interface.

---

## 10. Explicitly Out of Scope (architecture-level, deferred)

- Multi-region active-active deployment
- Event bus / message broker (Kafka, Pub/Sub) — deferred until job volume justifies it
- Service mesh / API gateway — unnecessary for a single deployable app
- CQRS / event sourcing — standard CRUD + transactions is sufficient at this data volume
- Kubernetes — Vercel's managed serverless scaling covers current and near-future load
