# PRD — India-Focused E-Commerce Platform

**Status:** Draft v1.0
**Owner:** [Your name]
**Last updated:** September 2026
**Companion doc:** `ECOMMERCE_IMPLEMENTATION_PLAN.md` (technical architecture, schema, flows)

---

## 1. Summary

A production e-commerce platform for the Indian market, built to serve an initial small-scale launch (~100 concurrent users, ~500 products, ~~1,000 orders/month) on a lean budget (~~₹2,500–3,000/month infra), while architected so growth to 10,000+ users needs no rewrite — only additive changes.

**Vertical & audience:** fashion, beauty, and accessories — clothing, footwear, jewelry, skincare, makeup, and haircare — for a broad audience of girls and women, no single age band. The catalog/cart/inventory architecture below is category-agnostic by design (variants carry freeform `attributes` such as size/color/shade rather than anything category-specific), so this is a content/taxonomy choice, not a structural one — but it should still drive category taxonomy, homepage merchandising, seed/demo data, and copy throughout.

---

## 2. Problem Statement

Small-to-mid Indian sellers need a self-owned storefront (not locked to a marketplace's fees, branding, or algorithm) that handles browsing, cart, checkout, Indian payment methods (including COD), GST-compliant invoicing, shipping tracking, and returns/refunds — without the cost or complexity of enterprise commerce platforms.

---

## 3. Goals

- Launch a fully functional storefront + admin panel within [your target timeline]
- Support online payment (Razorpay) and Cash on Delivery with phone confirmation
- Keep infrastructure cost under ₹10,000/month at launch scale
- No security shortcuts: correct pricing, correct inventory, no payment trust issues
- Architecture that scales to 10,000+ users without a rewrite

## 4. Non-Goals (out of scope for v1)

- Multi-vendor / marketplace functionality (single seller only)
- Multi-currency / international shipping
- Native mobile apps (responsive web only for v1)
- Subscription/recurring billing
- Multi-warehouse inventory routing
- Loyalty points / referral programs
- Live chat support

---

## 5. Target Users

| Persona                     | Description                         | Key needs                                                                            |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| **Customer**                | Indian online shopper, mobile-first | Fast browsing, trustworthy checkout, COD option, order tracking, easy returns        |
| **Admin/Owner**             | Business owner managing the store   | Product/inventory control, order fulfillment view, sales visibility, refund handling |
| **Staff** (optional, later) | Warehouse/support person            | Limited access: view/update orders and inventory, no financial controls              |

---

## 6. Functional Requirements

### 6.1 Customer-facing

| Feature            | Requirement                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Registration/Login | Email/password and Google sign-in via Firebase Auth; email verification; password reset                      |
| Product browsing   | List, filter by category/brand, search, sort by price/popularity                                             |
| Product detail     | Images, variants (size/color), price, stock status, GST-inclusive price shown, reviews                       |
| Cart               | Add/update/remove items; server-revalidated price and stock before checkout                                  |
| Checkout           | Address entry, coupon application, order summary with GST breakdown, payment method selection (online / COD) |
| Payment            | Razorpay checkout (cards, UPI, netbanking, wallets)                                                          |
| COD                | Phone OTP confirmation (via MSG91) required before COD order is placed                                       |
| Order tracking     | Status timeline (confirmed → packed → shipped → out for delivery → delivered), shipment tracking link        |
| Invoices           | Downloadable GST invoice PDF per order                                                                       |
| Returns/Refunds    | Request return on eligible items, view refund status                                                         |
| Wishlist           | Save products for later, move to cart                                                                        |
| Reviews            | Rate/review products (verified-purchase only)                                                                |
| Notifications      | Order status emails, optional web push, in-app notification center                                           |
| Account            | Manage profile, addresses, order history, notification preferences                                           |

### 6.2 Admin-facing

| Feature              | Requirement                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| Dashboard            | Sales summary, pending orders, low-stock alerts, pending returns/refunds |
| Product management   | Create/edit/archive products, variants, images, pricing, SEO fields      |
| Inventory            | View/adjust stock, view reservation and movement history                 |
| Order management     | View orders, update status, cancel, view payment/refund state            |
| Coupons & promotions | Create/manage discount codes and rules                                   |
| Refunds              | Initiate full/partial refunds against Razorpay                           |
| Customers            | View customer list and order history (read-only for staff)               |
| Reviews              | Approve/reject/moderate                                                  |
| Audit log            | View history of sensitive admin actions                                  |
| Settings             | GST rates, shipping rules                                                |

---

## 7. Non-Functional Requirements

| Category                | Requirement                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Correctness**         | Pricing, tax, and totals always computed server-side; never trust client-submitted amounts                                        |
| **Payment integrity**   | Payment success confirmed only via verified signature + webhook, never client callback alone                                      |
| **Inventory integrity** | No overselling under concurrent checkout — enforced via DB transactions/row locks                                                 |
| **Security**            | Role-based access control; secrets never exposed client-side; rate limiting on login/OTP/checkout/coupons                         |
| **Performance**         | Product listing pages paginated; Core Web Vitals targets met on mobile                                                            |
| **Availability**        | Target 99.5%+ uptime (Vercel + Neon managed infra)                                                                                |
| **Data integrity**      | Orders retain historical price/product snapshots regardless of later catalog changes                                              |
| **Compliance**          | GST-compliant invoices (GSTIN, HSN/SAC, CGST/SGST/IGST breakdown); validate final tax logic with a tax professional before launch |
| **Cost**                | Total infra spend ≤ ₹10,000/month at launch scale                                                                                 |
| **Auditability**        | All sensitive admin actions (price change, refund, role change, stock override) logged                                            |

---

## 8. Tech Stack (summary — see implementation plan for detail)

Next.js (frontend + backend, single codebase) · Postgres via Neon · Prisma ORM · Firebase Authentication (email/Google) · Firebase Storage (images/invoices) · Razorpay (payments) · MSG91 (COD OTP) · Resend (transactional email) · Firebase Cloud Messaging (push) · Vercel (hosting) · Vercel Cron + Postgres job queue (background jobs).

---

## 9. Success Metrics

| Metric                                       | Target (post-launch)                                                  |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Checkout completion rate                     | Baseline established in first month, improve iteratively              |
| Payment failure rate                         | < 3% of initiated payments                                            |
| Page load (LCP, mobile)                      | < 2.5s                                                                |
| Order fulfillment time (confirmed → shipped) | Store-defined SLA (e.g. 48 hours)                                     |
| Infra cost                                   | ≤ ₹10,000/month at current scale                                      |
| Zero critical incidents                      | No overselling, no payment double-charge, no data-integrity incidents |

---

## 10. Assumptions

- Single seller, single currency (INR), India-only shipping at launch
- COD and online payment are the only payment methods needed at launch
- Admin/staff count is small (1–5 people) — simple 3-role RBAC (customer/staff/admin) is sufficient
- Traffic stays within ~100 concurrent users; no need for multi-region or heavy caching yet

## 11. Constraints

- Monthly infra budget cap: ₹10,000
- No dedicated DevOps team — infra choices favor managed services over self-hosted ops
- Solo/small dev team — favor one deployable codebase over microservices

## 12. Risks & Mitigations

| Risk                                     | Mitigation                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Payment webhook missed/duplicated        | Idempotent webhook handling via unique event ID; reconciliation job to catch missed webhooks         |
| Overselling during flash traffic         | DB-level row locking on inventory; reservation with expiry                                           |
| OTP/SMS cost overrun                     | MSG91 used only for COD confirmation, not every login; rate-limited                                  |
| Tax miscalculation                       | Centralized pricing/tax module; professional tax review before launch                                |
| Vendor lock-in (Firebase/Razorpay/MSG91) | Provider interfaces abstracted (`PaymentProvider`, `ShippingProvider`, etc.) per implementation plan |

---

## 13. Milestones (maps to implementation plan phases)

1. Foundations & Auth
2. Users & RBAC
3. Catalog
4. Inventory & Cart
5. Pricing, Coupons, Promotions, Tax
6. Checkout & Orders
7. Payments (Razorpay)
8. Shipping, Returns, Refunds, Invoices
9. Notifications (email/push/OTP)
10. Admin Panel
11. SEO, performance, analytics
12. Testing, monitoring, backup, production launch

---

## 14. Open Questions

- What are the actual shipping courier(s) to integrate with at launch? (Still open — Phase 8 built the `ShippingProvider` interface + a `ManualShippingProvider` adapter, per Product_Spec_Requirements.md §7.1's "created by admin (manually or via courier integration)"; no live courier vendor is wired up, and none should be added without this question being answered first — see AGENTS.md §8.)
- Confirmed COD availability rules (pincode-based? order value cap?) — still open; unrelated to Phase 8, blocks COD checkout itself (Phase 6/9 territory).
- ~~Return window policy (days, condition requirements)?~~ **Resolved at Phase 8: 7 days after `Delivered`** (`RETURN_WINDOW_DAYS` env var). "Condition requirements" are handled via the existing reason dropdown (damaged / wrong item / not as described / other + note) — no further condition logic was specified or built.
- Who reviews/approves the final GST configuration before go-live? — still open; a compliance/legal sign-off, not a code change.
