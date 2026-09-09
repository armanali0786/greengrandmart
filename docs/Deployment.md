# Deployment — GreenGrandMart

**Companion docs:** `Architecture.md` · `Environment_Config.md` · `Observability.md` · `Security.md`
**Purpose:** how code moves from a developer's machine to production, what environments exist, and how to safely reverse a bad release.

---

## 1. Environments

| Environment    | Purpose                                        | Hosting                                               | Database                                                       | Firebase Project                          |
| -------------- | ---------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| **Local**      | Individual development                         | `next dev` on localhost                               | Local Postgres (Docker) or a personal Neon branch              | Firebase Emulator Suite (Auth, Storage)   |
| **Preview**    | Per-PR review, automatic                       | Vercel Preview Deployment (auto-generated URL per PR) | Ephemeral Neon branch created per PR, destroyed on merge/close | `greengrandmart-dev` Firebase project     |
| **Staging**    | Pre-production validation, mirrors prod config | Vercel (dedicated staging domain)                     | Dedicated long-lived Neon branch (`staging`)                   | `greengrandmart-staging` Firebase project |
| **Production** | Live customer traffic                          | Vercel Production                                     | Neon production branch (`main`)                                | `greengrandmart-prod` Firebase project    |

**Rule:** no environment below Production ever uses live Razorpay keys, live MSG91 credits, or the production Firebase project. Local/Preview/Staging use test-mode credentials exclusively (see `Environment_Config.md`).

---

## 2. Branching & Release Flow

```
feature/xyz  ──PR──▶  main  ──manual promote──▶  Production
     │                  │
     ▼                  ▼
  Preview deploy   Staging deploy (auto, on merge to main)
  (auto, per PR)
```

- Feature branches are cut from `main`, never from another feature branch.
- Opening a PR triggers a Vercel Preview deployment against an ephemeral Neon branch — reviewers test against real infrastructure, not just read the diff.
- Merging to `main` auto-deploys to **Staging** — this is where the full manual QA pass (`QA_Checklist.md`) and full E2E suite (`Testing_Strategy.md`) run before anything reaches real customers.
- Promotion from Staging to **Production** is a deliberate, manual action — never automatic on merge. This is the one gate a human explicitly pulls.

---

## 3. CI/CD Pipeline

```
On every PR (against main):
  1. Install dependencies
  2. Lint (ESLint) + typecheck (tsc --noEmit)
  3. Unit tests (Vitest)
  4. Provision ephemeral Neon branch
  5. Integration tests (against ephemeral branch)
  6. Security-focused integration tests (Testing_Strategy.md Section 6)
  7. Build (Next.js production build)
  8. Secret-scan the build output
  9. Deploy to Vercel Preview
  10. Smoke-subset E2E tests against the Preview URL (registration, cart, one checkout path)
  → PR is mergeable only if all steps pass

On merge to main:
  1. All of the above, plus:
  2. Deploy to Staging
  3. Full E2E suite (Testing_Strategy.md Section 5.1) against Staging
  4. Notify team of staging deploy status

On manual production promotion:
  1. Human confirms: QA checklist passed on staging, E2E green on staging, migration reviewed (if any)
  2. Trigger production deployment (promote the exact build artifact already validated on staging — never a fresh build from source at this step, to guarantee what was tested is what ships)
  3. Post-deploy smoke check (Section 5)
```

**Rule:** the artifact promoted to Production must be the identical build that passed on Staging — not a rebuild. This avoids "it worked in staging but broke in prod" caused by a dependency or environment drift between two separate builds.

---

## 4. Database Migrations in the Pipeline

- Migrations are authored with `prisma migrate dev` locally, committed as versioned files in `prisma/migrations/`.
- CI runs `prisma migrate deploy` against the ephemeral/staging branch as part of the pipeline — migrations are tested before they ever touch production.
- **Migrations touching `orders`, `order_items`, `payments`, or `refunds` require explicit human review and sign-off before being applied to Staging or Production**, regardless of how the automated pipeline evaluates them — per `AGENTS.md` Section 5.
- Production migrations run as a distinct, logged step immediately before the application deployment that depends on them — never bundled silently inside a generic "deploy" script where a failure could go unnoticed.
- Backward-compatible migration pattern preferred: add new columns/tables before deploying code that uses them; remove old columns only after the code depending on them is fully retired — avoids a broken window where old code and new schema (or vice versa) are simultaneously live during a rolling deploy.

---

## 5. Deployment Verification (post-deploy smoke check)

Run immediately after every production deployment:

- [ ] Homepage loads (200, correct content)
- [ ] Login works (test account)
- [ ] A product page loads with correct price/stock
- [ ] Cart add/checkout-quote returns a correct total (no 500s)
- [ ] Razorpay webhook endpoint responds correctly to a test signature check (without creating a real order)
- [ ] Admin dashboard loads for an admin test account
- [ ] Sentry/monitoring shows no new error spike in the first 15 minutes post-deploy

If any check fails, proceed directly to rollback (Section 6) rather than attempting a live fix on production.

---

## 6. Rollback Strategy

### 6.1 Application rollback

- Vercel retains prior deployments — rollback is re-promoting the last known-good deployment via the Vercel dashboard/CLI, typically taking under a minute.
- Because staging and production use the same validated build artifact (Section 3), the "last known-good" deployment is always a build that already passed the full test suite and QA checklist — rollback is never a gamble.

### 6.2 Database rollback

- Additive migrations (new tables/columns) generally don't need a rollback — old code simply ignores new columns it doesn't know about.
- Destructive migrations (column/table removal, data transformation) must have a written-out reverse migration prepared **before** the forward migration is applied to production — "we'll figure out the rollback if needed" is not acceptable for anything touching financial data.
- Neon's point-in-time restore is a last-resort safety net for the database layer, not a substitute for a tested reverse migration — restoring loses any legitimate writes made after the bad migration, which is unacceptable for live order data except in a genuine emergency.

### 6.3 When to roll back vs. hotfix

| Situation                                                                                                             | Action                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| New deploy causes errors/outage affecting checkout or payments                                                        | Immediate rollback, investigate after                                                                                           |
| New deploy causes a cosmetic/non-critical bug                                                                         | Hotfix forward through the normal PR pipeline, no rollback needed                                                               |
| A migration is discovered to be subtly wrong after deploy (e.g. wrong default value) but hasn't caused visible errors | Assess data impact first; prefer a corrective forward migration over a rollback that could re-introduce the original schema gap |

---

## 7. Feature Flags (lightweight, no dedicated service)

At this scale, feature flags are a simple boolean column in a `settings` table or an environment variable, not a dedicated flagging service. Used for:

- Soft-launching a new checkout change to verify in production before fully relying on it
- Disabling COD or a specific payment method temporarily without a full deploy
- Toggling a promotion/sale banner without a code deploy

Do not introduce a dedicated feature-flag SaaS product at this scale — it's disproportionate infrastructure for the toggle volume this project actually needs (see `AGENTS.md` Section 8, scope discipline).

---

## 8. Domain & DNS

- Production domain points to Vercel via the DNS records Vercel provides; staging uses a subdomain (e.g. `staging.greengrandmart.com` or a Vercel-provided staging URL).
- SSL/TLS is handled automatically by Vercel — no manual certificate management required.

---

## 9. Region Configuration

- Vercel functions and Neon database are both configured in the region closest to the majority of users (Mumbai, or Singapore if Mumbai isn't available on the chosen tier) to minimize round-trip latency on every DB-touching request.
- Firebase project region settings (Storage bucket location) should match this choice where configurable.
