# Performance — GreenGrandMart

**Companion docs:** `Testing_Strategy.md` (Section 7) · `Architecture.md` · `Data_Model_DB_Schema.md`
**Purpose:** concrete performance targets sized to actual scale, where the real bottlenecks will show up first, and what caching/optimization is (and isn't) warranted right now.

---

## 1. Scale Assumptions (repeated deliberately — performance work should be sized to this, not to imagined scale)

~100 concurrent users · ~500 products · ~1,000 orders/month · single region (India). At this volume, the honest expectation is that **most performance problems will be self-inflicted** (unoptimized images, unnecessary client-side fetching, missing an obvious index) rather than genuine capacity limits of the chosen stack.

---

## 2. Performance Targets

| Metric                                                      | Target                                              | Rationale                                                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Largest Contentful Paint (mobile)                           | < 2.5s                                              | Matches `PRD.md` success metric; majority of Indian e-commerce traffic is mobile                                                 |
| Interaction to Next Paint                                   | < 200ms                                             | Standard responsiveness bar for Core Web Vitals                                                                                  |
| Cumulative Layout Shift                                     | < 0.1                                               | No jank from late-loading images/skeletons mismatched to final layout                                                            |
| Checkout API response time (`/checkout`, `/checkout/quote`) | < 800ms p95                                         | This is a transactional write path with DB locking — acceptable to be slower than a read, but shouldn't feel sluggish            |
| Product listing/search API                                  | < 300ms p95                                         | Read-heavy, paginated, indexed — should be fast                                                                                  |
| Time to first byte on product detail pages (SSR)            | < 500ms                                             | SEO and perceived performance both depend on this                                                                                |
| Database query time for any indexed lookup                  | < 50ms                                              | If a supposedly-indexed query exceeds this at current data volume, something is wrong with the index or the query, not the scale |
| Background job processing latency (cron interval)           | Jobs picked up within 1–2 minutes of being enqueued | Acceptable since nothing user-facing blocks on this; email/SMS delivery isn't expected to be instant anyway                      |

---

## 3. Where Bottlenecks Will Actually Show Up First

Ordered by likelihood at this scale:

1. **Unoptimized images** — product photos served at full resolution instead of the generated thumbnail/medium variant. This is the single most likely cause of a bad LCP score, and it's a process problem (Section 5 of `ECOMMERCE_IMPLEMENTATION_PLAN.md`, image pipeline), not an infrastructure one.
2. **N+1 queries** — e.g. fetching a product listing, then querying images/inventory per product in a loop instead of a single joined/batched query. At 500 products this won't crash anything, but it will make listing pages noticeably slow.
3. **Missing indexes on a new query pattern** — as features are added, a new filter/sort option on product listing or order search can introduce a query Postgres has to sequential-scan. Caught by the `EXPLAIN ANALYZE` review step in `Testing_Strategy.md` Section 7.1.
4. **Client-side over-fetching** — fetching more data than a page actually renders (e.g. full product objects for a listing that only shows name/price/thumbnail).
5. **Neon cold starts** — if compute has scaled to zero during low-traffic periods, the first request after idle time incurs a brief wake-up latency. At ~100 concurrent users this is worth monitoring but not necessarily worth paying for an always-on instance unless it's demonstrably annoying real users.

**What will not be a bottleneck at this scale:** Vercel's serverless function concurrency, Firebase Auth throughput, Razorpay API latency under normal conditions. Don't spend optimization effort here until there's actual evidence of a problem.

---

## 4. Caching Strategy

**No caching layer (Redis) exists yet — deliberately, per `Architecture.md` Section 9.** At 500 products and 100 concurrent users, Postgres reads with proper indexes are fast enough on their own. Caching is introduced only when a specific, measured bottleneck justifies it, not preemptively.

### 4.1 What's already "free" caching

- **Next.js static generation / ISR** for product and category pages where content doesn't change every second — regenerate on a reasonable interval (e.g. every few minutes) or on-demand via revalidation when an admin updates a product, rather than server-rendering from the database on every single request.
- **Vercel's CDN** automatically caches static assets (JS/CSS bundles, optimized images) at the edge — no configuration needed beyond using Next.js's built-in `Image` component and static asset handling correctly.
- **Browser caching** of images/assets via standard cache headers, which Next.js sets sensibly by default.

### 4.2 What to add only when a specific trigger is hit

| Trigger                                                                           | Response                                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product/category listing pages measurably slow under real concurrent load         | Add Upstash Redis (serverless, no ops burden) for a cache-aside pattern in front of `catalog.listProducts()` — the module's public interface doesn't change, only its internal implementation |
| Repeated identical coupon/promotion validation queries under high checkout volume | Cache active coupon/promotion rules in memory per function instance (short TTL) rather than querying Postgres on every validation call                                                        |
| Session/auth lookups becoming a hot path                                          | Not expected at this scale — Firebase token verification is already fast and doesn't hit Postgres                                                                                             |

### 4.3 What should never be cached

- Inventory availability at checkout time — always a fresh, locked read, never a cached value, for the obvious correctness reason.
- Pricing/coupon eligibility at the moment of redemption — cached _previews_ are fine (Section 4.2), but the actual redemption-time check always reads current data inside the transaction.
- Order status shown to a customer — should reflect the true current state, not a stale cached view (Next.js revalidation for this page should be short or on-demand, not long-TTL static).

---

## 5. Database Performance

- Every query pattern used by the application should have a supporting index — cross-reference `Data_Model_DB_Schema.md` Section 13 for the current index inventory; any new query pattern introduced by a feature should get a corresponding index added in the same PR, not as a follow-up.
- **Pagination is mandatory** on every list endpoint (`API_Spec.md` Section 1.4) — never fetch an entire table client-side or server-side "to filter in memory."
- **Avoid N+1 patterns** by using Prisma's `include`/`select` to fetch related data (e.g. a product's primary image and variant count) in a single query rather than looping and querying per row.
- **Connection pooling**: use Neon's pooled connection string (`DATABASE_URL`) for the application runtime; use the direct connection only for Prisma Migrate operations, per `Environment_Config.md`.
- **Monitor query plans** for the highest-traffic queries (product listing, order history, admin order search) periodically via `EXPLAIN ANALYZE`, especially after the catalog grows meaningfully beyond the initial ~500 products.

---

## 6. Frontend Performance Practices

- Use Next.js's `<Image>` component everywhere for automatic responsive sizing and format optimization (WebP), never a raw `<img>` tag for product photography.
- Server Components by default (per `Coding_Standards.md` Section 6) — minimizes client-side JavaScript shipped for pages that don't need interactivity.
- Lazy-load below-the-fold content (e.g. related products, review sections) rather than blocking initial render on everything on the page.
- Keep the checkout page's client-side JavaScript bundle lean — this is the page where a slow, janky experience directly costs completed orders; avoid pulling in heavy dependencies here that aren't strictly needed.
- Use skeleton loaders matching final layout dimensions to avoid layout shift (ties to the CLS target above).

---

## 7. Rate/Volume Limits (operational, not just security)

These exist for cost and stability, in addition to the abuse-prevention rationale already covered in `Security.md` Section 8:

| Limit                                 | Value                                                     | Reason                                                                                            |
| ------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Product listing page size             | Max 100 items per request (default 24)                    | Prevents an accidental or malicious request from forcing a huge unpaginated query                 |
| Image upload size                     | 5MB per file                                              | Keeps Storage costs and processing time predictable                                               |
| Search query length                   | Reasonable cap (e.g. 200 chars)                           | Prevents pathological full-text search queries                                                    |
| Concurrent checkout attempts per user | 10/min (shared with the rate-limit rule in `Security.md`) | Also serves as a performance safeguard against a buggy client retry-looping the checkout endpoint |

---

## 8. Load Testing Approach (right-sized, see also `Testing_Strategy.md` Section 7)

- A lightweight k6/Artillery script simulating 20–50 concurrent checkout attempts is run before major releases affecting the checkout path — deliberately above realistic peak load for current scale, as a safety margin, not as an attempt to simulate enterprise traffic the platform doesn't have.
- The specific thing being verified under load is **correctness** (no oversold inventory, no duplicate orders) at least as much as raw throughput — a slow-but-correct result under simulated concurrency is far less concerning than a fast-but-wrong one.
- Full-scale load testing (thousands of concurrent users) is explicitly deferred until real traffic or business growth approaches numbers that would justify it — see `Architecture.md` Section 9 for the scaling triggers that would prompt revisiting this.

---

## 9. Explicitly Deferred (v2+ performance investment)

- Redis caching layer (Section 4.2)
- CDN-level edge caching of dynamic/personalized content
- Database read replicas
- Image CDN beyond what Firebase Storage + Vercel's own asset handling already provides
- Multi-region deployment for latency optimization outside India
