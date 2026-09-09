# QA Checklist — GreenGrandMart

**Companion docs:** `Product_Spec_Requirements.md` · `Testing_Strategy.md` · `Security.md` · `UX_UI_Spec.md`
**Purpose:** the manual verification pass a human runs before a release — automated tests (see `Testing_Strategy.md`) catch regressions, this checklist catches things automation doesn't: visual polish, real-device feel, and "does this actually make sense to a shopper."

---

## 1. Definition of Done (general, applies to every feature)

A feature/PR is not done until:

- [ ] Matches the behavior specified in `Product_Spec_Requirements.md` for this feature
- [ ] Matches the screens/states/interactions specified in `UX_UI_Spec.md`
- [ ] Automated tests pass per `Testing_Strategy.md` Section 10
- [ ] No console errors/warnings in the browser on the happy path
- [ ] Works on mobile viewport (375px) and desktop (1280px+)
- [ ] Loading, empty, and error states are implemented, not just the happy path
- [ ] No secret, PII, or internal ID leaked in a client-visible response or error message
- [ ] Docs updated if schema/API/architecture changed (`Coding_Standards.md` Section 12)

---

## 2. Manual Verification — Customer Flows

### 2.1 Registration & Login

- [ ] Sign up with email/password → verification email arrives → link verifies account
- [ ] Sign up with Google → account created with correct name/email from Google profile
- [ ] Duplicate email signup shows a clear message, not a generic error
- [ ] Wrong password shows a clear error; 5 failed attempts triggers lockout message
- [ ] "Forgot password" email arrives, reset link works, old sessions are logged out after reset
- [ ] Logout actually clears session (refreshing doesn't silently re-login)

### 2.2 Catalog & Search

- [ ] Product listing paginates correctly; no duplicate or missing items across pages
- [ ] Filters (category, brand, price range, in-stock) combine correctly, not just individually
- [ ] Sort options produce genuinely different, correct orderings
- [ ] Out-of-stock products show correctly (visible but marked unavailable, not hidden)
- [ ] Search returns relevant results; empty search shows the "no results" state with suggestions
- [ ] Product detail: switching variants updates price/image/stock display correctly
- [ ] Product detail: selecting an out-of-stock variant disables "Add to Cart" with correct messaging

### 2.3 Cart

- [ ] Add to cart from listing and from detail page both work
- [ ] Quantity stepper respects max available stock, shows a message at the limit
- [ ] Removing an item shows undo toast; undo actually restores the item
- [ ] Cart persists across a page refresh (logged-in and guest)
- [ ] Guest cart merges correctly into account cart on login (no items lost or duplicated)
- [ ] A product going out of stock or changing price while in cart shows the correct inline banner

### 2.4 Checkout — Online Payment

- [ ] Address form validates pincode format and required fields inline
- [ ] Coupon apply shows correct discount; invalid coupon shows the _specific_ reason (expired / min cart / already used)
- [ ] Order summary total matches what Razorpay actually charges (spot check against `/checkout/quote` response)
- [ ] GST breakdown (CGST/SGST vs IGST) is correct for same-state vs different-state addresses
- [ ] Razorpay test-mode payment success → order confirmation screen appears, order status is `confirmed` (after webhook, may take a moment — verify it doesn't get stuck on "verifying")
- [ ] Razorpay test-mode payment failure → clear failure screen, cart/order preserved, retry works
- [ ] Double-clicking "Place Order" does not create two orders or two payment attempts

### 2.5 Checkout — COD

- [ ] Selecting COD shows the OTP widget inline, not a separate page
- [ ] OTP arrives via real SMS (test with a real phone number in staging) within a reasonable time
- [ ] Wrong OTP shows attempts-remaining message; exceeding attempts blocks further tries on that code
- [ ] Expired OTP shows the correct message and allows resend
- [ ] Resend button is disabled during cooldown, re-enables after timer
- [ ] Successful OTP verification allows order placement; order is `confirmed` immediately (no payment webhook needed)

### 2.6 Orders & Account

- [ ] Order history lists correctly, newest first
- [ ] Order detail shows the price/name **as it was at purchase time**, even after manually changing the product's price/name in admin
- [ ] Status timeline updates correctly as admin changes order status
- [ ] Cancel button only appears when status allows; cancelling releases stock (verify in admin inventory view)
- [ ] Return request only appears after delivery, within the configured window
- [ ] Invoice PDF downloads and shows correct GST breakdown and order details
- [ ] Address book: add/edit/delete works; default shipping/billing selection works
- [ ] Wishlist: add/remove/move-to-cart works; move-to-cart re-validates stock

### 2.7 Reviews & Notifications

- [ ] Review submission only allowed for delivered, purchased products
- [ ] Submitted review shows as pending, not immediately public
- [ ] Notification center lists events correctly; mark-as-read and mark-all-as-read work
- [ ] Notification preference toggles actually stop/allow the relevant emails (verify by toggling off and triggering an event)

---

## 3. Manual Verification — Admin Flows

- [ ] Create a product with variants and images; verify it appears correctly on the live storefront
- [ ] Edit price/stock; verify existing orders' historical data is unaffected
- [ ] Archive a product; verify it's removed from storefront listing but existing orders referencing it still display correctly
- [ ] Inventory manual adjustment requires a reason note; adjustment reflected immediately and logged in audit log
- [ ] Order status transitions only offer valid next-states in the UI (no illegal jump options)
- [ ] Coupon creation with each constraint type (min cart, date range, usage limit, product restriction) behaves correctly when tested from the customer side
- [ ] Refund initiation: full and partial both processed correctly via Razorpay test mode; refund status updates correctly
- [ ] Attempting a second refund on an already-refunded order/item is blocked with a clear message
- [ ] Staff-role login cannot access refunds, role management, or audit logs (verify by logging in as staff test account)
- [ ] Audit log shows correct before/after state for a price change, a stock adjustment, and a refund

---

## 4. Cross-Cutting Manual Checks

- [ ] All customer-facing currency amounts show ₹ with correct Indian digit grouping
- [ ] All customer-facing status labels are human-readable, not raw enum values
- [ ] Mobile: bottom tab bar navigation works, touch targets feel appropriately sized
- [ ] Keyboard-only navigation can complete a full checkout without a mouse
- [ ] Screen reader spot-check on checkout form (labels read correctly)
- [ ] No layout shift/jank on product listing while images load (skeletons match final layout)
- [ ] Network throttled to "Slow 3G" in dev tools — loading states appear correctly, nothing hangs silently
- [ ] Refreshing mid-checkout doesn't lose the cart or create a duplicate order

---

## 5. Pre-Release Checklist (before promoting to production)

- [ ] All items in Sections 2–4 verified on the staging environment
- [ ] `Security.md` Section 14 pre-launch checklist passed
- [ ] `Testing_Strategy.md` full E2E suite green against the release candidate
- [ ] Database migration (if any) reviewed and tested on a staging-equivalent dataset
- [ ] Rollback plan confirmed per `Deployment.md`
- [ ] Environment variables for production verified per `Environment_Config.md` (no staging/test keys leaked into prod config)
- [ ] Monitoring/alerting confirmed active per `Observability.md` before traffic is routed to the new release
- [ ] Changelog entry added per `Changelog.md`
