# Product Spec / Requirements — E-Commerce Platform

**Companion docs:** `PRD.md` (business goals/scope) · `ECOMMERCE_IMPLEMENTATION_PLAN.md` (architecture/schema)
**Purpose of this doc:** feature-by-feature functional requirements with acceptance criteria and edge cases — the level of detail needed to actually build and test each module.

---

## 1. Authentication & Account

### 1.1 Registration

- Fields: name, email, password (or Google OAuth)
- Password rules: minimum 8 characters, at least 1 number
- On email/password signup: send verification email via Firebase Auth; account usable immediately but flagged `email_verified: false`
- Duplicate email → clear error, offer "forgot password" instead of generic failure
- Google sign-in: auto-create account on first login, pull name/email from Google profile

### 1.2 Login

- Email/password or Google
- Failed login attempts rate-limited: max 5 attempts per email per 15 minutes, then temporary lockout with clear message
- Session persists via Firebase Auth token; refreshed silently

### 1.3 Password Reset

- "Forgot password" sends reset link via Firebase Auth
- Reset link expires per Firebase default; expired-link error is user-friendly, not a stack trace
- After reset, all existing sessions for that user are invalidated

### 1.4 Account Deletion

- Customer can request account deletion from account settings
- On deletion: anonymize PII in past orders (keep order records for accounting/tax purposes, strip name/email/phone from the user record, retain order totals/line items)
- Deletion requires re-authentication (password or recent login) before proceeding

**Acceptance criteria:** a user can sign up, verify email, log out, reset password, log back in, and delete their account — all without touching an admin.

---

## 2. Product Catalog

### 2.1 Product Listing

- Paginated (default 24 per page), never fetch full catalog client-side
- Filters: category, brand, price range, in-stock only
- Sort: price (asc/desc), newest, popularity (order count)
- Out-of-stock products remain visible (marked "Out of stock") unless explicitly archived by admin

### 2.2 Product Detail Page

- Displays: name, images (gallery + zoom), price (with GST-inclusive shown, breakdown available), variant selector (size/color etc.), stock status per variant, description, specifications, reviews, related products
- If a variant is out of stock, it's shown but disabled with "Notify me" (v1: optional, can defer) or simply disabled
- Structured data (Product schema) present for SEO

### 2.3 Variants

- A product can have 0 (simple product) or many variants, each with independent SKU, price, and stock
- Selecting a variant updates displayed price/image/stock in real time (client-side), but final price is always re-verified server-side at cart/checkout

### 2.4 Search

- Postgres full-text search (`tsvector`) over product name, description, brand, category
- Typo tolerance: not required for v1 (defer to Algolia/Meilisearch upgrade path if needed)
- Empty search results show "no products found" with suggestion to browse categories

**Edge cases:**

- Product deleted/archived after being added to someone's cart → cart shows "no longer available" at next validation (page load or checkout), removed from orderable total
- Price changed after product added to cart → cart shows updated price with a visible note ("price updated") before checkout

---

## 3. Cart

### 3.1 Behavior

- Guest cart: stored by session ID (cookie), persists across page loads, merged into user cart on login
- Logged-in cart: persisted server-side, available across devices
- Add/update/remove quantity; quantity cannot exceed available stock (checked server-side on every mutation, not just on page load)
- Cart displayed price is a snapshot for UX; footer note: "final price confirmed at checkout"

### 3.2 Validation before checkout

- Server re-checks: product still active, variant still exists, price current, stock available for requested quantity
- If anything fails validation, checkout is blocked with a specific message per item ("Blue / Medium is now out of stock, please update your cart") — never a generic failure

**Acceptance criteria:** two browser tabs adding the last unit of the same variant to cart — only one successfully checks out; the other sees an out-of-stock message at checkout, not after payment.

---

## 4. Pricing, Tax, Coupons, Promotions

### 4.1 Pricing calculation (server-side only, single source of truth)

```
line_total = (unit_price - item_discount) × quantity
subtotal   = sum(line_total)
- promotion discount (if applicable)
- coupon discount (if applicable, capped at max_discount)
+ shipping fee
+ GST (CGST+SGST or IGST depending on buyer state vs seller state)
= grand_total
```

- GST rate stored per product (`gst_rate`, `hsn_code`)
- Intra-state orders: CGST + SGST split; inter-state: IGST — determined by comparing seller's registered state to shipping address state
- All monetary values stored/computed in paise (integers) to avoid rounding errors; displayed in rupees with 2 decimals

### 4.2 Coupons

- Types: percentage or fixed amount, with optional `max_discount` cap
- Constraints supported: min cart value, date range (start/expiry), total usage limit, per-user usage limit (1 unless configured otherwise), restriction to specific products/categories/brands, first-order-only flag
- Invalid coupon → specific reason shown ("This coupon requires a minimum order of ₹999", "This coupon has expired", "You've already used this coupon")
- Coupon code entry is case-insensitive
- Redemption is atomic: a DB unique constraint prevents the same user redeeming a per-user-limited coupon twice even under concurrent requests

### 4.3 Promotions

- Admin-defined, applied automatically without a code (e.g. "10% off all Nike products this week")
- Promotions and coupons can stack unless explicitly marked non-stackable — default: only one coupon per order, promotions apply independently on top

**Acceptance criteria:** applying an expired coupon, an over-limit coupon, and a below-minimum-cart coupon all produce distinct, correct error messages — never a generic "invalid coupon."

---

## 5. Checkout & Orders

### 5.1 Checkout Flow

1. Review cart → select/add shipping address → select payment method (online or COD)
2. If COD: phone OTP verification required (see Section 9) before order is placed
3. Order summary shows full breakdown: subtotal, discounts, shipping, GST split, grand total — matching what will actually be charged
4. Place order → online payment redirects to Razorpay; COD order is created directly as `confirmed` after OTP verification

### 5.2 Order Statuses (customer-visible)

`Payment Pending → Confirmed → Processing → Packed → Shipped → Out for Delivery → Delivered`
Alternate paths: `Payment Failed`, `Cancelled`, `Return Requested → Return Approved → Returned → Refund Pending → Refunded`

- Customers can cancel only while status is `Confirmed` or `Processing` (not after `Packed`)
- Status changes are always admin- or system-triggered, never customer-editable beyond cancel/return requests

### 5.3 Order Detail Page

- Shows: items (with snapshot price/name at time of order — not current catalog data), shipping address, payment status, status timeline with timestamps, tracking link once shipped, invoice download link, cancel/return actions where applicable

### 5.4 Data Integrity Rule

- Order line items always store a snapshot of product name, SKU, variant attributes, unit price, discount, and tax at time of purchase. Changing a product's price or deleting it later must never alter historical orders or invoices.

**Acceptance criteria:** an order placed today, viewed 6 months later after the product's price/name has changed, still shows the exact price and name paid at purchase time.

---

## 6. Payments (Razorpay)

### 6.1 Online Payment

- Supported methods: cards, UPI, netbanking, wallets (whatever Razorpay Checkout offers by default)
- Order created as `pending_payment` before redirecting to Razorpay
- On return from Razorpay: client sends payment ID + order ID + signature to backend; backend verifies signature — this is necessary but NOT sufficient to confirm the order
- Order is marked `confirmed` only after the Razorpay webhook independently confirms `payment.captured`

### 6.2 Payment Failure

- Order marked `payment_failed`; customer can retry payment (new payment attempt against the same order) or the order auto-expires after 30 minutes and stock reservation is released

### 6.3 Webhook Handling

- Every webhook verified via signature before processing
- Every webhook's event ID checked against a processed-events table; duplicates are acknowledged (200 OK) but not reprocessed
- Handles out-of-order delivery: if a `refund.processed` webhook arrives before the corresponding `payment.captured` is processed, the system queues/defers rather than erroring

**Acceptance criteria:** sending the same webhook payload twice results in exactly one state change and one set of notifications, not two.

---

## 7. Shipping

### 7.1 Shipment Creation

- Created by admin (manually or via courier integration) once order status moves to `Packed`
- Fields: courier name, tracking number, estimated delivery date
- Customer sees a tracking link/status on their order page

### 7.2 Shipping Fee Calculation

- Configurable rules in admin settings: flat rate, free above a threshold, or weight/zone-based (v1 can start with flat rate + free-above-threshold; zone-based deferred unless required at launch)

### 7.3 COD Eligibility

- Configurable: COD available only below a certain order value, and/or restricted by pincode serviceability (open question — confirm business rule before launch)

---

## 8. Returns & Refunds

### 8.1 Return Request

- Customer can request a return within a configurable window (e.g. 7 days) after `Delivered` status, per item
- Requires a reason (dropdown: damaged, wrong item, not as described, other + note)
- Return request sets item status to `Return Requested`; admin approves or rejects

### 8.2 Refund Processing

- On return approval + item received (or immediate for damaged/wrong-item cases per policy), admin initiates refund
- Refund types: full, partial, item-level, shipping-fee-inclusive or exclusive
- Refund processed via Razorpay refund API with an idempotency key to prevent duplicate refunds on retry
- Refund status visible to customer: Pending → Processing → Completed (or Failed, with admin follow-up)

### 8.3 Inventory on Return

- Approved, received returns restock inventory automatically (configurable: some businesses may want manual restock decision if item condition is uncertain)

**Acceptance criteria:** a partial refund for 1 of 3 items in an order correctly recalculates and displays remaining order value; the refunded item's stock is not restocked until physically received and marked so by admin.

---

## 9. Phone OTP (COD Confirmation — MSG91)

- Triggered only when customer selects COD at checkout
- 6-digit numeric code, expires in 5 minutes, hashed at rest (never stored or returned in plaintext)
- Rate limits: max 3 send requests per phone per 10 minutes; max 5 verification attempts per code; 60-second cooldown between resends
- On successful verification, order proceeds to creation; on failure/expiry, customer must request a new code
- OTP requests never block/delay online-payment checkouts — this flow is COD-only

---

## 10. Notifications

### 10.1 Email (Resend)

Sent for: welcome, email verification (via Firebase), password reset (via Firebase), order confirmation, payment failed, order packed/shipped/out-for-delivery/delivered, cancellation confirmation, return requested/approved, refund initiated/completed, invoice attached.

- All sent asynchronously via background job — checkout/order actions never wait on email delivery.

### 10.2 Push (Firebase Cloud Messaging)

- Optional opt-in; same event triggers as email, sent as web push
- Customer can disable in notification preferences

### 10.3 In-App Notification Center

- List of notifications with read/unread state, mark-as-read, mark-all-as-read
- Preferences page: toggle email/push per category (order updates, promotions)

---

## 11. Reviews

- Only customers with a `delivered` order containing the product can submit a review (verified purchase)
- Fields: star rating (1–5, required), title (optional), body (optional), up to 3 images (optional)
- New reviews default to `pending`; admin approves/rejects before public display
- "Helpful" voting on published reviews (optional for v1, can defer)

---

## 12. Wishlist

- Add/remove products (not tied to a specific variant necessarily — product-level, defer variant-level wishlist unless required)
- "Move to cart" from wishlist validates current stock/price before adding
- Wishlist persists for logged-in users only (not guest sessions)

---

## 13. Admin Panel — Detailed Requirements

### 13.1 Dashboard

- Widgets: today/week/month sales total, order count by status, low-stock products (below `low_stock_threshold`), pending returns, pending refunds, recent orders table

### 13.2 Product Management

- Create/edit product with all catalog fields (Section 2); manage variants inline; drag-to-reorder images; mark primary image; publish/unpublish (draft ↔ active); soft-delete (archive) rather than hard delete if the product has order history

### 13.3 Inventory Management

- View current stock per variant (available/reserved/sold); manual stock adjustment with mandatory reason note (logged to `inventory_movements` and `audit_logs`); low-stock threshold configurable per variant

### 13.4 Order Management

- Filter/search by status, date range, customer; view full order detail; manually update status (with the state machine enforced — e.g. cannot jump from `Confirmed` directly to `Delivered`); view payment and refund history per order

### 13.5 Coupons/Promotions Management

- CRUD for coupons/promotions with all fields from Section 4; view redemption count/usage against limits; deactivate without deleting (preserve history)

### 13.6 Refunds

- Initiate refund against any eligible order/item; view refund status and provider refund ID; cannot be initiated twice for the same order-item without explicit override + audit note

### 13.7 Audit Log Viewer

- Filterable by action type, actor, date range; shows before/after state for sensitive changes (price, stock, role, refund)

### 13.8 Role Enforcement

- `admin`: full access
- `staff`: content/operations access (products, inventory, orders, coupons, reviews) — no access to refunds initiation, no role management, no audit log (or read-only, decide per business preference)
- Every admin page and API route re-checks role server-side on every request

---

## 14. Cross-Cutting Requirements

| Requirement           | Detail                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| Mobile responsiveness | All customer-facing pages fully usable on mobile (majority of Indian e-commerce traffic is mobile)        |
| Error messages        | Specific and actionable, never raw stack traces or generic "something went wrong" for known failure cases |
| Loading states        | Skeleton/loading indicators on all async data fetches, especially product listing and cart                |
| Empty states          | Meaningful empty states for empty cart, no orders yet, no wishlist items, no search results               |
| Accessibility         | Semantic HTML, form labels, sufficient color contrast, keyboard-navigable checkout                        |
| Currency display      | Always ₹ with proper Indian digit grouping (e.g. ₹1,00,000 not ₹100,000)                                  |

---

## 15. Explicitly Deferred (v2+ candidates)

- Product "notify me when back in stock"
- Loyalty/referral programs
- Multi-warehouse inventory
- Zone-based shipping rate tables
- Algolia/Meilisearch-powered search with typo tolerance
- Native mobile app
- Live chat support
- Subscription/recurring orders
