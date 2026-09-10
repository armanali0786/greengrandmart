# GreenGrandMart

A production e-commerce platform for the Indian market — browsing, cart, checkout, Indian payment methods (Razorpay, including COD with SMS OTP confirmation), GST-compliant invoicing, shipping tracking, and returns/refunds. Vertical: fashion, beauty & accessories, for a broad audience of women — but the catalog is category-agnostic (variants carry freeform attributes like size/color/shade), so this is a content choice, not a structural one.

Sized for an initial small-scale launch (~100 concurrent users, ~500 products, ~1,000 orders/month) on a lean infra budget, architected so growth to 10,000+ users needs additive changes only, not a rewrite. See [`docs/PRD.md`](docs/PRD.md) for the full product brief.

## Tech stack

- **Framework:** Next.js 16 (App Router), TypeScript (strict), React 19
- **Database:** Postgres (Neon in production, Docker locally) via Prisma
- **Auth:** Firebase Authentication (email/password + Google) — identity only, no custom password storage
- **Payments:** Razorpay (cards/UPI/netbanking + COD)
- **SMS OTP (COD confirmation only):** MSG91
- **Email:** Resend
- **Background jobs:** a Postgres `job_queue` table processed by Vercel Cron — no Redis/Kafka/queues infra
- **Styling:** Tailwind CSS v4
- **Testing:** Vitest (unit/integration), Playwright (E2E, Firebase Auth/Storage emulators)

One Next.js codebase contains the storefront, the admin panel, and all backend logic as Route Handlers — a **modular monolith**, not microservices. See [`docs/Architecture.md`](docs/Architecture.md).

## Features

- **Storefront:** home, category browsing, product search/filtering, product detail pages with variants (size/color/etc.), cart, wishlist
- **Checkout:** address management, coupons & promotions, GST-inclusive pricing, Razorpay payment (online + COD with OTP confirmation)
- **Orders:** full status lifecycle (confirmed → packed → shipped → delivered, cancellations, returns), GST invoice PDF generation, shipment tracking
- **Returns & refunds:** customer-initiated returns within the return window, admin approve/reject/receive/complete flow, Razorpay refunds
- **Notifications:** in-app + push (order updates, promotions), user notification preferences
- **Admin panel** (`/admin`, role-gated): products (with image upload/reorder/primary), categories, brands, coupons, promotions, inventory (stock adjustments with audit trail), orders, refunds, returns, failed background jobs
- **Auth & accounts:** signup/login, profile, saved addresses, order history

## Project structure

```
src/
  app/
    (storefront)/   customer-facing pages (Server Components where possible)
    (admin)/        admin panel (client-rendered, role-gated)
    api/             Route Handlers — thin: validate input, call one module, shape response
  modules/           business logic, one folder per domain (see below) — owns its own data access
  components/        shared UI (ui/) + feature components (admin/, storefront/)
  lib/                cross-cutting utilities (money, dates, API client, Firebase clients)
prisma/               schema.prisma + migrations (authoritative schema lives in docs/Data_Model_DB_Schema.md too — kept in sync)
tests/
  e2e/                Playwright specs, run against the Firebase emulators + local Postgres
  integration/, unit/ Vitest specs
docs/                 the real spec — read before changing anything (see below)
scripts/              one-off/ops scripts (e.g. set-user-role.ts)
```

`src/modules/`: `auth`, `catalog`, `cart`, `pricing`, `inventory`, `orders`, `payments`, `refunds`, `returns`, `shipping`, `invoices`, `notifications`, `otp`, `jobs`, `admin`. Modules never query another module's tables directly — cross-module calls go through exported functions (see [`AGENTS.md`](AGENTS.md) §2).

## Getting started

Requires Node 22+, Docker (for local Postgres), and the Firebase CLI (`npm i -g firebase-tools`, or use the local devDependency via `npx`).

```bash
npm install

cp .env.example .env.local
# edit .env.local if needed — the defaults work out of the box for local dev
# against Docker Postgres + the Firebase emulators (no real Firebase/Razorpay
# project needed for local development)

docker compose up -d          # Postgres on localhost:5433
npm run db:migrate            # apply Prisma migrations
npm run emulators              # in a separate terminal — Firebase Auth + Storage emulators
npm run dev                    # in another terminal — http://localhost:3000
```

There is no database seed script — the catalog (categories, brands, products) is populated through the admin panel, not fixture data. To add products:

1. Sign up a normal account at `/signup`, then promote it to admin (there's no self-service way to do this, by design — see [`AGENTS.md`](AGENTS.md) §3):
   ```bash
   npm run set-user-role -- you@example.com admin
   ```
2. Sign in and go to `/admin` → **Categories** / **Brands** to create at least one of each.
3. Go to **Products** → **New product**, fill in details and at least one variant (SKU, price, initial stock), save.
4. Open the saved product's edit page to upload images (product images can only be added after the product exists).

## Scripts

| Command                                                     | Purpose                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `npm run dev`                                               | Start the Next.js dev server                                          |
| `npm run build` / `npm start`                               | Production build / run                                                |
| `npm run lint` / `npm run typecheck` / `npm run format`     | Code quality checks                                                   |
| `npm test` / `npm run test:watch` / `npm run test:coverage` | Vitest unit/integration tests                                         |
| `npm run test:e2e`                                          | Playwright E2E tests (requires Postgres + Firebase emulators running) |
| `npm run db:migrate`                                        | Apply Prisma migrations (dev)                                         |
| `npm run db:studio`                                         | Prisma Studio — browse the DB                                         |
| `npm run set-user-role -- <email> <customer\|staff\|admin>` | Bootstrap/change a user's role directly in Postgres                   |
| `npm run emulators`                                         | Start Firebase Auth + Storage emulators                               |

## Documentation

`docs/` is the source of truth for product and technical decisions — read the relevant doc before making a non-trivial change:

- [`PRD.md`](docs/PRD.md) / [`Product_Spec_Requirements.md`](docs/Product_Spec_Requirements.md) — what's being built and why
- [`Architecture.md`](docs/Architecture.md) — system design, module boundaries
- [`Data_Model_DB_Schema.md`](docs/Data_Model_DB_Schema.md) — database schema (kept in sync with `prisma/schema.prisma`)
- [`API_Spec.md`](docs/API_Spec.md) — route contracts, error envelope
- [`UX_UI_Spec.md`](docs/UX_UI_Spec.md) — UI patterns (loading states, toasts, etc.)
- [`Security.md`](docs/Security.md), [`Testing_Strategy.md`](docs/Testing_Strategy.md), [`Environment_Config.md`](docs/Environment_Config.md), [`Deployment.md`](docs/Deployment.md) — cross-cutting concerns
- [`ECOMMERCE_IMPLEMENTATION_PLAN.md`](docs/ECOMMERCE_IMPLEMENTATION_PLAN.md) — the phased build plan this codebase follows

[`AGENTS.md`](AGENTS.md) is the rulebook for any AI coding agent (and a useful orientation for humans too) — module boundaries, non-negotiable security rules, and coding conventions. Read it before making changes.
