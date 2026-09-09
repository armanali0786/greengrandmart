# UX / UI Spec — GreenGrandMart

**Companion docs:** `PRD.md` · `Product_Spec_Requirements.md` · `ECOMMERCE_IMPLEMENTATION_PLAN.md`
**Purpose:** define every screen, flow, state, interaction, and design rule needed to build a consistent, trustworthy storefront and admin panel.

---

## 1. Brand Direction

**Name:** GreenGrandMart
**Positioning:** a trustworthy, everyday-value store — the name signals freshness, reliability, and approachability rather than luxury or niche.

| Element           | Rule                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Primary color     | Deep green (`#1B7A43` or similar) — trust, freshness, "go/buy" actions                                          |
| Accent color      | Warm amber/orange (`#F59E0B` range) — used sparingly for urgency (sale badges, low-stock warnings)              |
| Neutral palette   | Off-white background (`#FAFAF8`), charcoal text (`#1F2937`), mid-gray for secondary text (`#6B7280`)            |
| Success           | Green (distinct shade from primary, or same with checkmark icon to avoid ambiguity)                             |
| Error/destructive | Red (`#DC2626`)                                                                                                 |
| Typography        | One clean sans-serif (e.g. Inter) — regular/medium/semibold weights only; avoid more than 3 weights in one view |
| Corner radius     | Consistent rounded corners (8–12px) on cards, buttons, inputs — friendly, not sharp                             |
| Imagery           | Product photography on clean white/light backgrounds; no heavy filters                                          |
| Tone of voice     | Plain, direct, reassuring — "Your order is confirmed," not "Woohoo! Order placed!"                              |

Logo/wordmark treatment is out of scope for this doc — design rules here apply to product UI, not brand identity assets.

---

## 2. Global Design Rules

- **Mobile-first**: design and build for a 375–414px viewport first; scale up to tablet (768px) and desktop (1280px+) after.
- **Breakpoints**: `sm` 375px · `md` 768px · `lg` 1024px · `xl` 1280px
- **Touch targets**: minimum 44×44px for any tappable element
- **One primary action per screen**: every screen has exactly one visually dominant CTA (solid green button); secondary actions are outlined or text-only
- **Never show a raw price without currency and GST context** where relevant — always ₹, always with Indian digit grouping (₹1,00,000)
- **Loading, empty, and error states are mandatory for every data-driven screen** — no screen ships with only the "happy path" designed
- **Feedback within 200ms**: every tap gets immediate visual feedback (press state, spinner, or optimistic UI) even if the network call takes longer
- **Destructive actions require confirmation**: cancel order, delete address, remove admin role — all show a confirm dialog naming the specific consequence
- **Forms validate inline**, not just on submit — show field-level errors as the user leaves a field, not only after clicking submit

---

## 3. Navigation Structure

### Storefront (mobile)

```
Bottom tab bar: Home | Categories | Cart (badge count) | Account
Top bar: logo + search icon + notification bell (with unread dot)
```

### Storefront (desktop)

```
Top bar: logo | search bar (persistent) | Categories dropdown | Wishlist icon | Cart icon (badge) | Account menu
```

### Admin panel

```
Left sidebar (collapsible on mobile → hamburger):
Dashboard / Products / Categories / Inventory / Orders / Coupons & Promotions /
Customers / Refunds / Shipping / Returns / Reviews / Audit Logs / Settings
Top bar: search + admin profile menu + notification bell
```

---

## 4. Screen Inventory & Specs

### 4.1 Home

**Purpose:** entry point, drive discovery.
**Elements:** hero banner (promotions/featured), category shortcuts (icon grid), featured products carousel, "New arrivals" section, trust strip (secure payment, easy returns, COD available).
**States:**

- Loading: skeleton banner + skeleton product cards
- Empty (no featured products configured): fall back to category grid + all-products link, never a blank hero
  **Interactions:** tapping a category shortcut → category listing; tapping a product card → product detail.

### 4.2 Category / Product Listing

**Elements:** filter bar (category, brand, price range, in-stock toggle), sort dropdown, product grid (2 columns mobile, 4 desktop), pagination (or infinite scroll with a clear "load more" button — avoid silent infinite scroll that hides the footer).
**States:**

- Loading: skeleton grid
- Empty (no results after filtering): "No products match your filters" + "Clear filters" button
- Error (fetch failed): "Couldn't load products" + Retry button
  **Interactions:** filters apply immediately (no "Apply" button needed on desktop; mobile uses a filter drawer with an explicit "Show N results" button).

### 4.3 Product Detail

**Elements:** image gallery (swipeable on mobile, thumbnail strip on desktop), product name, price (strikethrough original + sale price if discounted, GST-inclusive note), variant selector (size/color as tappable chips, disabled state for out-of-stock combinations), quantity stepper, "Add to Cart" (primary) + "Buy Now" (secondary, skips to checkout), description/specs in expandable sections (accordion), reviews section with rating summary bar chart, related products.
**States:**

- Selected variant out of stock: "Add to Cart" disabled, label changes to "Out of Stock," chip shows a diagonal strike
- Product fully unavailable/archived: page shows "This product is no longer available" + link back to category, not a broken page
  **Interactions:** changing variant updates price/image/stock instantly (client-side), quantity stepper respects max available stock (stepper's `+` disables at limit with a tooltip "Only 3 left").

### 4.4 Cart

**Elements:** line items (image, name, variant, price, quantity stepper, remove), price summary (subtotal, discount, shipping estimate, GST note "calculated at checkout"), coupon code input, "Proceed to Checkout" primary CTA.
**States:**

- Empty cart: illustration + "Your cart is empty" + "Browse products" CTA
- Item became unavailable/price changed since added: inline banner on that line item ("Price updated to ₹X" or "No longer available — removed"), non-blocking for other items
  **Interactions:** quantity changes debounce and show a small spinner on the line item while syncing; removing an item shows an undo toast for 5 seconds before it's final.

### 4.5 Checkout

**Flow (single page, sectioned, not multi-step wizard unless testing shows otherwise):**

1. Shipping address (select saved / add new — inline form, not a separate page)
2. Payment method (Online / Cash on Delivery — radio cards, not a dropdown)
   - If COD selected → OTP verification widget appears inline (phone auto-filled from address if available, 6-digit code input, resend timer)
3. Order summary (itemized, GST breakdown shown explicitly: CGST/SGST or IGST line)
4. "Place Order" primary CTA — becomes "Pay ₹X" when online payment selected

**States:**

- Address validation errors shown inline per field (pincode format, required fields)
- COD OTP: countdown timer on resend button (disabled until 0:00), clear error for wrong code ("Incorrect code, 3 attempts left") vs expired code ("Code expired, request a new one")
- Coupon applied/invalid: green confirmation chip or red inline error with the specific reason (Section 4 of Product Spec)
- Order placement in progress: primary button shows spinner + "Placing order..." and is disabled to prevent double-submit
- Payment redirect (Razorpay): full-screen loading state while redirecting, and a clear "Verifying payment..." state on return before showing success/failure

### 4.6 Order Confirmation

**Elements:** success icon, order number, estimated delivery, order summary, "View Order" and "Continue Shopping" CTAs.
**States:**

- Payment failed: distinct screen (not a variant of success) with "Payment failed" message, reason if available, "Retry Payment" and "Back to Cart" options — cart/order is preserved, not lost.

### 4.7 Order History / Order Detail

**Elements (list):** order number, date, status badge (color-coded per status), total, thumbnail of first item.
**Elements (detail):** status timeline (horizontal stepper on desktop, vertical on mobile) with timestamps, item list with snapshot price, shipping address, payment method, invoice download button, tracking link (once shipped), cancel button (only if status allows), return request button (only if delivered + within window).
**States:**

- Empty order history: "You haven't placed any orders yet" + "Start shopping" CTA
- Cancel/return action: confirmation dialog stating exact consequence ("This will cancel your order and release the reserved items")

### 4.8 Account / Profile

**Sub-screens:** Profile info, Addresses (list + add/edit/delete, mark default), Wishlist, Notifications (list + preferences toggle), Order History (see 4.7), Account security (change password, delete account).
**States:** each list sub-screen has its own empty state ("No addresses saved yet," "Your wishlist is empty").

### 4.9 Notification Center

**Elements:** list of notifications (icon per type, title, relative timestamp, unread dot), "Mark all as read."
**Interactions:** tapping a notification navigates to the relevant order/product; swipe-to-dismiss on mobile (optional).

### 4.10 Search Results

**Elements:** search input persists at top, result count, same grid as category listing.
**States:** no results → "No results for 'X'" + suggested categories, not a dead end.

---

## 5. Admin Panel Screens

### 5.1 Dashboard

**Elements:** stat cards (today's sales, orders today, pending orders, low-stock count), recent orders table (last 10, clickable rows), low-stock products list, pending returns/refunds widget.
**States:** all-zero state (new store, no orders yet) shows friendly placeholder, not blank cards.

### 5.2 Product List / Editor

**List:** table with thumbnail, name, category, price, stock, status (draft/active/archived) badge, quick actions (edit, archive).
**Editor:** tabbed or sectioned form — Basic Info / Images / Variants / Pricing & Tax / SEO. Image uploader supports drag-drop, reorder via drag handle, one-click "set as primary." Variant table is inline-editable (spreadsheet-like rows) rather than a modal-per-variant.
**States:** unsaved changes warning if navigating away; validation errors surfaced per section tab (a red dot on the tab with the error).

### 5.3 Inventory

**Elements:** table (variant, SKU, available, reserved, sold, low-stock threshold), manual adjustment action opens a small modal requiring quantity + mandatory reason.
**States:** rows below threshold highlighted (amber background or badge).

### 5.4 Order Management

**List:** filterable/searchable table (status, date range, customer name/order number), status shown as colored badge.
**Detail:** same structure as customer order detail but with an admin status-update control (dropdown restricted to valid next states per the state machine — invalid transitions are simply not selectable options, not just validated after the fact).

### 5.5 Coupons/Promotions

**List:** table with code, type, usage (X/limit), status (active/expired/inactive), toggle to deactivate.
**Editor:** form matching Section 4 fields from Product Spec; live preview of "who this applies to" summary sentence (e.g. "10% off, max ₹200, on Electronics, min cart ₹999, until 30 Sep").

### 5.6 Refunds

**Elements:** list of refund-eligible/pending items, initiate-refund form (amount pre-filled but editable for partial, reason field), status badge.
**States:** disable "Initiate Refund" button once a refund is already in progress for that order-item, with a tooltip explaining why.

### 5.7 Audit Log

**Elements:** filterable table (actor, action, entity, date), expandable row showing before/after diff.

---

## 6. Component States Reference

Every interactive component must define these states explicitly in the design file before build:

| Component         | Required states                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Button            | default, hover (desktop), pressed, disabled, loading (spinner replacing label)                                                      |
| Input field       | default, focused, filled, error (red border + message below), disabled                                                              |
| Card (product)    | default, hover (desktop lift/shadow), out-of-stock overlay                                                                          |
| Badge/status pill | one distinct color per order status — documented in a single legend used consistently everywhere                                    |
| Modal/dialog      | entering/exiting transition, backdrop click behavior (confirm dialogs should NOT close on backdrop click — require explicit choice) |
| Toast             | success (green), error (red), info (neutral) — auto-dismiss 4s except errors, which persist until dismissed                         |

---

## 7. Key User Flows (state-by-state)

### 7.1 Purchase Flow (Online Payment)

```
Home → Product Detail → Add to Cart (toast: "Added to cart")
→ Cart → Proceed to Checkout
→ Checkout: address → payment method (Online) → Place Order (loading)
→ Redirect to Razorpay (full-screen loading)
→ Return to app: "Verifying payment..." (loading)
→ Success: Order Confirmation screen
   OR Failure: Payment Failed screen (Retry / Back to Cart)
```

### 7.2 Purchase Flow (COD)

```
Checkout: address → payment method (COD)
→ OTP widget appears → Send Code → Enter Code → Verify (loading)
→ On success: Place Order enabled → tap → Order Confirmation
→ On OTP failure (wrong code): inline error, attempts remaining shown
→ On OTP expiry: "Code expired" + Resend option
```

### 7.3 Return & Refund Flow (customer side)

```
Order Detail (status: Delivered) → "Request Return" on an item
→ Reason selection (dropdown + optional note) → Submit
→ Order item status: "Return Requested" (visible badge)
→ [Admin approves] → Customer sees "Return Approved" + return instructions
→ [Admin marks received + refund initiated] → "Refund Processing"
→ [Refund completed] → "Refund Completed" + email/notification
```

### 7.4 Admin Order Fulfillment Flow

```
Dashboard → Orders (filter: Confirmed) → Open order
→ Update status: Confirmed → Processing → Packed
   (at Packed: prompted to enter courier + tracking number)
→ Packed → Shipped (tracking now visible to customer)
→ Shipped → Out for Delivery → Delivered
```

Each transition only shows valid next-states in the dropdown — the UI itself prevents illegal jumps (e.g. Confirmed → Delivered is not a selectable option).

---

## 8. Accessibility Rules

- All interactive elements reachable and operable via keyboard (tab order follows visual order)
- Form inputs have associated `<label>` elements, not placeholder-only labeling
- Color is never the only indicator of state — status badges pair color with text/icon; errors pair red with an icon and message text
- Minimum contrast ratio 4.5:1 for body text
- Images have meaningful `alt` text (product name at minimum); decorative images have empty `alt`

---

## 9. Micro-interactions & Feedback Rules

- Add-to-cart: brief toast + cart icon badge increments with a small bounce animation
- Form submission: button shows loading state, disabled during submission (prevents double order/double payment)
- Skeleton loaders match the actual layout shape (not a generic spinner) for listing/grid pages, to avoid layout shift
- Optimistic updates for low-risk actions (wishlist add/remove, notification mark-as-read); server-confirmed (non-optimistic) for anything involving money or stock (cart quantity, checkout, coupon apply)
- Network error anywhere shows a consistent retry pattern: message + "Try Again" button, never a silent failure

---

## 10. Content & Copy Rules

- Status labels are customer-friendly, not internal enum names: `out_for_delivery` → "Out for Delivery," not "OUT_FOR_DELIVERY"
- Error messages state what happened and what to do next ("This coupon has expired. Browse current offers." not "Invalid coupon.")
- Never use technical jargon in customer-facing copy (no "SKU," "variant ID," "reservation" — use "item," "option," "reserved for you")
- Admin panel copy can be more operational/technical since the audience is internal staff

---

## 11. Explicitly Deferred (v2+ UI work)

- Dark mode
- Native app-specific interaction patterns (this spec covers responsive web only)
- Advanced filter UI (multi-select price histograms, faceted search sidebars)
- Animated onboarding/tutorial overlays
