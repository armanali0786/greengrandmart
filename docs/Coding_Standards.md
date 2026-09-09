# Coding Standards — GreenGrandMart

**Companion docs:** `AGENTS.md` (rules an AI agent must not violate) · `Architecture.md` · `Data_Model_DB_Schema.md`
**Purpose:** the day-to-day reference for how code is written, named, and organized — so the codebase reads as if one person wrote it, regardless of who (or what) actually did.

---

## 1. Toolchain

| Tool                                                   | Purpose                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| TypeScript (`strict: true`)                            | Language, no exceptions                                                  |
| ESLint (`next/core-web-vitals` + `@typescript-eslint`) | Linting, run in CI                                                       |
| Prettier                                               | Formatting — no manual formatting debates, config is the source of truth |
| Zod                                                    | Runtime validation for all external input                                |
| Prisma                                                 | Database access and migrations                                           |
| Vitest                                                 | Unit tests                                                               |
| Playwright                                             | E2E tests                                                                |
| Husky + lint-staged                                    | Pre-commit: lint + format staged files only                              |

Run `npm run lint && npm run typecheck && npm run test` before opening a PR — CI enforces the same, but don't rely on CI to catch what you could catch locally.

---

## 2. Folder Structure (full reference)

```
ecommerce/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── 20260910_init/
├── src/
│   ├── app/
│   │   ├── (storefront)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── products/
│   │   │   │   └── [slug]/page.tsx
│   │   │   ├── categories/[slug]/page.tsx
│   │   │   ├── cart/page.tsx
│   │   │   ├── checkout/
│   │   │   │   ├── page.tsx
│   │   │   │   └── confirmation/page.tsx
│   │   │   └── account/
│   │   │       ├── layout.tsx
│   │   │       ├── orders/page.tsx
│   │   │       ├── orders/[id]/page.tsx
│   │   │       ├── addresses/page.tsx
│   │   │       └── wishlist/page.tsx
│   │   ├── (admin)/
│   │   │   └── admin/
│   │   │       ├── layout.tsx
│   │   │       ├── dashboard/page.tsx
│   │   │       ├── products/page.tsx
│   │   │       ├── products/[id]/page.tsx
│   │   │       ├── orders/page.tsx
│   │   │       └── ...
│   │   └── api/
│   │       ├── auth/session/route.ts
│   │       ├── products/route.ts
│   │       ├── products/[slug]/route.ts
│   │       ├── cart/route.ts
│   │       ├── cart/items/route.ts
│   │       ├── cart/items/[id]/route.ts
│   │       ├── checkout/quote/route.ts
│   │       ├── checkout/route.ts
│   │       ├── checkout/confirm/route.ts
│   │       ├── payments/webhook/route.ts
│   │       ├── orders/route.ts
│   │       ├── orders/[id]/route.ts
│   │       ├── otp/request/route.ts
│   │       ├── otp/verify/route.ts
│   │       ├── admin/products/route.ts
│   │       ├── admin/orders/[id]/status/route.ts
│   │       └── cron/process-jobs/route.ts
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.service.ts        # verifyFirebaseToken, getSessionUser
│   │   │   ├── auth.guard.ts          # requireRole, requireOwnership
│   │   │   └── auth.types.ts
│   │   ├── catalog/
│   │   │   ├── catalog.service.ts
│   │   │   ├── catalog.repository.ts  # all Prisma queries for products/categories/brands
│   │   │   ├── catalog.schema.ts      # Zod schemas
│   │   │   └── catalog.types.ts
│   │   ├── inventory/
│   │   │   ├── inventory.service.ts   # reserve(), release(), convertToSale(), restock()
│   │   │   ├── inventory.repository.ts
│   │   │   └── inventory.errors.ts    # OutOfStockError, etc.
│   │   ├── cart/
│   │   ├── pricing/
│   │   │   └── pricing.service.ts     # computeOrderTotal() — the ONLY place totals are computed
│   │   ├── coupons/
│   │   ├── promotions/
│   │   ├── checkout/
│   │   │   └── checkout.orchestrator.ts
│   │   ├── orders/
│   │   │   ├── orders.service.ts
│   │   │   ├── orders.state-machine.ts
│   │   │   └── orders.repository.ts
│   │   ├── payments/
│   │   │   ├── payment-provider.interface.ts
│   │   │   ├── razorpay.provider.ts
│   │   │   └── payments.service.ts
│   │   ├── refunds/
│   │   ├── shipping/
│   │   │   ├── shipping-provider.interface.ts
│   │   │   └── adapters/
│   │   ├── invoices/
│   │   ├── notifications/
│   │   │   ├── email-provider.interface.ts
│   │   │   ├── resend.provider.ts
│   │   │   ├── sms-provider.interface.ts
│   │   │   ├── msg91.provider.ts
│   │   │   └── push-provider.interface.ts
│   │   ├── otp/
│   │   ├── reviews/
│   │   ├── wishlist/
│   │   ├── admin/
│   │   │   └── audit.ts               # withAudit() wrapper
│   │   └── jobs/
│   │       ├── job-queue.service.ts
│   │       └── handlers/              # one file per job type
│   ├── components/
│   │   ├── ui/                        # generic, reusable, no business logic (Button, Input, Modal)
│   │   ├── storefront/                # ProductCard, CartItem, CheckoutForm, etc.
│   │   └── admin/                     # AdminTable, AuditLogRow, etc.
│   ├── lib/
│   │   ├── db.ts                      # Prisma client singleton
│   │   ├── firebase-admin.ts
│   │   ├── firebase-client.ts
│   │   ├── rate-limit.ts
│   │   ├── api-response.ts            # success()/error() envelope helpers
│   │   └── money.ts                   # paise <-> rupee formatting helpers
│   ├── types/
│   │   └── index.ts                   # shared cross-module types only
│   └── config/
│       └── env.ts                     # typed, validated env var access
├── tests/
│   ├── unit/                          # mirrors src/modules structure
│   ├── integration/
│   └── e2e/
├── firebase/
│   └── storage.rules
├── docs/                              # all the .md docs (PRD, Architecture, etc.)
├── .env.example
├── AGENTS.md
└── package.json
```

---

## 3. Naming Conventions

| What                     | Convention                                                         | Example                                        |
| ------------------------ | ------------------------------------------------------------------ | ---------------------------------------------- |
| Files (non-component)    | `kebab-case.ts`                                                    | `inventory.service.ts`, `rate-limit.ts`        |
| React component files    | `PascalCase.tsx`                                                   | `ProductCard.tsx`, `CheckoutForm.tsx`          |
| React component names    | `PascalCase`, matches filename                                     | `export function ProductCard()`                |
| Functions/variables      | `camelCase`                                                        | `computeOrderTotal`, `reserveInventory`        |
| Types/interfaces         | `PascalCase`, no `I` prefix                                        | `OrderStatus`, `PaymentProvider`               |
| Zod schemas              | `camelCase` + `Schema` suffix                                      | `createProductSchema`, `checkoutRequestSchema` |
| Custom errors            | `PascalCase` + `Error` suffix                                      | `OutOfStockError`, `CouponInvalidError`        |
| DB tables/columns        | `snake_case` (matches Prisma `@@map`/`@map` if model names differ) | `order_items`, `firebase_uid`                  |
| Environment variables    | `SCREAMING_SNAKE_CASE`                                             | `RAZORPAY_KEY_SECRET`, `MSG91_AUTH_KEY`        |
| Route folders (dynamic)  | `[param]`                                                          | `products/[slug]`, `orders/[id]`               |
| Constants (module-level) | `SCREAMING_SNAKE_CASE`                                             | `MAX_OTP_ATTEMPTS`, `RESERVATION_TTL_MINUTES`  |
| Test files               | same name as file under test + `.test.ts`                          | `pricing.service.test.ts`                      |

**Booleans read as questions:** `isActive`, `hasStock`, `canCancel` — not `active`, `stock`, `cancel`.

**Avoid abbreviations** except universally understood ones (`id`, `qty`, `sku`). Write `quantity` not `qty` in new code unless matching an existing schema column name exactly.

---

## 4. Module Internal Pattern

Every module in `src/modules/<name>/` follows the same shape:

```
<name>.service.ts     — public functions other modules/routes call. This is the module's "interface."
<name>.repository.ts  — all Prisma queries for this module's tables, private to the module
<name>.schema.ts       — Zod schemas for this module's inputs
<name>.types.ts        — TypeScript types specific to this module
<name>.errors.ts        — custom error classes this module throws
<name>.state-machine.ts — (only for modules with status transitions: orders, payments, refunds)
```

**Rule:** only `<name>.service.ts` functions are imported by other modules or route handlers. Never import `<name>.repository.ts` from outside the module — that's the boundary violation `AGENTS.md` Section 2 forbids.

Example service function signature style:

```typescript
// modules/inventory/inventory.service.ts
export async function reserveStock(
  tx: PrismaTransactionClient,
  items: { variantId: string; quantity: number }[],
): Promise<InventoryReservation[]> {
  // row-locked, transactional — always takes an existing `tx`, never opens its own
  // when called from an orchestrator like checkout
}
```

Functions that must run inside a larger transaction (checkout) accept a `tx` client parameter rather than creating their own — this is how multiple modules participate in one atomic operation without violating boundaries.

---

## 5. API Route Handler Pattern

Every route handler follows this exact shape — parse, authorize, call one service function, respond:

```typescript
// app/api/cart/items/route.ts
import { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { addCartItemSchema } from '@/modules/cart/cart.schema';
import { addItemToCart } from '@/modules/cart/cart.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req); // throws UnauthenticatedError if invalid
  const body = addCartItemSchema.parse(await req.json()); // throws ZodError

  try {
    const result = await addItemToCart(user.id, body);
    return success(result, 201);
  } catch (e) {
    return error(e); // maps known domain errors to the standard envelope, else 500
  }
}
```

No inline SQL, no pricing math, no manual JSON shaping beyond calling `success()`/`error()`. If a route handler exceeds ~30 lines, that's a signal logic has leaked in that belongs in a service function.

---

## 6. React Component Patterns

- **Server Components by default.** Only mark a component `'use client'` when it needs interactivity (state, effects, event handlers) or browser APIs.
- **Data fetching happens in Server Components or Server Actions**, not `useEffect` + `fetch` for anything that could be rendered server-side.
- **Forms use React Hook Form + Zod resolver**, sharing the same Zod schema the API route uses where practical (import from the module's `.schema.ts`).
- **`components/ui/`** contains zero business logic — a `Button` doesn't know what "checkout" means. Business-aware components live in `components/storefront/` or `components/admin/`.
- **Props are explicitly typed**, never `any`, never implicit from destructuring without an interface:

```typescript
interface ProductCardProps {
  product: ProductListItem;
  onAddToCart?: (variantId: string) => void;
}
export function ProductCard({ product, onAddToCart }: ProductCardProps) { ... }
```

- **No prop drilling more than 2 levels** — use React Context or lift the fetch to a common server-rendered ancestor instead.

---

## 7. State Management

| State type                                     | Where it lives                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Server data (products, orders, cart)           | Server Components (initial render) + TanStack Query for client-side refetch/mutation                                                       |
| Auth state                                     | Firebase Auth SDK's own listener, exposed via a small `useAuth()` hook                                                                     |
| Ephemeral UI state (modal open, form input)    | Local `useState`                                                                                                                           |
| URL-driven state (filters, search, pagination) | URL search params, not client state — enables shareable/bookmarkable links                                                                 |
| Global client state                            | Avoided by default; if genuinely needed (e.g. cart item count badge shared across header), use a minimal Context, not a full state library |

Do not introduce Redux/Zustand/Jotai unless a concrete problem (documented) can't be solved with the above.

---

## 8. Error Handling Pattern

```typescript
// modules/inventory/inventory.errors.ts
export class OutOfStockError extends Error {
  code = 'OUT_OF_STOCK' as const;
  constructor(
    public variantId: string,
    message = 'The requested product is no longer available.',
  ) {
    super(message);
  }
}
```

```typescript
// lib/api-response.ts
export function error(e: unknown) {
  if (e instanceof ZodError)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: e.errors[0].message,
          field: e.errors[0].path.join('.'),
        },
      },
      { status: 400 },
    );
  if (e instanceof DomainError)
    return NextResponse.json(
      { success: false, error: { code: e.code, message: e.message } },
      { status: e.httpStatus ?? 400 },
    );
  console.error(e); // full detail server-side only
  return NextResponse.json(
    {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    },
    { status: 500 },
  );
}
```

Every module error extends a common `DomainError` base so `error()` handles them uniformly — new error types don't require touching `api-response.ts`.

---

## 9. Money & Date Handling

```typescript
// lib/money.ts
export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const toRupeeDisplay = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
```

- All arithmetic on money happens in paise (integers) using plain `+`/`-`/`*` — never divide until final display.
- All dates from the DB/API are ISO 8601 UTC strings; convert to IST only in the presentation layer using `Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata' })`.

---

## 10. Testing Conventions

- Test files live in `tests/unit/`, `tests/integration/`, `tests/e2e/`, mirroring the `src/` structure they test.
- Unit tests for a module mock the repository layer, testing only the service logic (pricing math, state transitions, validation rules) — no real DB needed.
- Integration tests use a real Postgres (local Docker or a disposable Neon branch) and test a full module or flow (e.g. "reserving stock twice concurrently for the last unit only succeeds once").
- Test naming: `describe('computeOrderTotal', () => { it('applies coupon discount before tax', () => {...}) })` — descriptive, behavior-focused, not `test1`, `test2`.
- Every bug fix includes a regression test reproducing the original bug before the fix, in the same commit/PR.

---

## 11. Git Conventions

- **Commit messages:** Conventional Commits style — `feat(checkout): add COD OTP verification step`, `fix(inventory): prevent negative stock on concurrent reservation`, `docs(schema): add returns table`.
- **Branch naming:** `feature/<short-desc>`, `fix/<short-desc>`, `chore/<short-desc>`.
- **PRs:** one logical change per PR; link the relevant doc section if the change affects schema/API/architecture; note if a migration is included.
- **No direct commits to `main`** — all changes via PR, even small ones, so CI (lint/typecheck/test) runs before merge.

---

## 12. Documentation-Code Sync

Whenever a change affects one of the following, update the matching doc in the same PR — don't let code and docs drift:

| Change                                | Update                         |
| ------------------------------------- | ------------------------------ |
| New/changed DB table or column        | `Data_Model_DB_Schema.md`      |
| New/changed API endpoint              | `API_Spec.md`                  |
| New module or changed module boundary | `Architecture.md` Section 4    |
| New screen or changed flow            | `UX_UI_Spec.md`                |
| New feature or changed business rule  | `Product_Spec_Requirements.md` |
