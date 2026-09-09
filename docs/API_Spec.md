# API Spec — GreenGrandMart

**Companion docs:** `Architecture.md` · `Data_Model_DB_Schema.md` · `Product_Spec_Requirements.md`
**Base URL:** `/api` (Next.js Route Handlers, same origin as the app — no separate API domain)
**Format:** JSON over HTTPS only

---

## 1. Conventions

### 1.1 Authentication

- Every request requiring identity sends `Authorization: Bearer <firebase_id_token>`
- The server verifies the token via Firebase Admin SDK on every request — never trusts a cached/previous verification
- Public endpoints (product browsing, search) work without a token; cart/checkout endpoints work with either a logged-in token or a guest `session_id` cookie
- Admin endpoints additionally require the user's `role` (read fresh from Postgres, not from the token) to be `admin` or `staff` as appropriate

### 1.2 Standard Response Envelope

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "The requested product is no longer available.",
    "field": "items[0].variantId"
  }
}
```

`field` is included only for validation errors tied to a specific input. Internal stack traces are never sent to the client — logged server-side only.

### 1.3 Standard Error Codes

| Code                          | HTTP status | Meaning                                                                                                                                                                                                                                          |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UNAUTHENTICATED`             | 401         | Missing/invalid Firebase token                                                                                                                                                                                                                   |
| `FORBIDDEN`                   | 403         | Authenticated but lacks required role/ownership                                                                                                                                                                                                  |
| `VALIDATION_ERROR`            | 400         | Zod validation failed; `field` indicates which input                                                                                                                                                                                             |
| `NOT_FOUND`                   | 404         | Resource doesn't exist or isn't visible to this user                                                                                                                                                                                             |
| `OUT_OF_STOCK`                | 409         | Requested quantity exceeds available stock                                                                                                                                                                                                       |
| `PRICE_CHANGED`               | 409         | Client's assumed price no longer matches server price                                                                                                                                                                                            |
| `COUPON_INVALID`              | 400         | Coupon expired/exhausted/not applicable — `message` gives the specific reason                                                                                                                                                                    |
| `PAYMENT_VERIFICATION_FAILED` | 400         | Razorpay signature check failed                                                                                                                                                                                                                  |
| `INVALID_ORDER_STATE`         | 409         | Requested action not valid for order's current status (e.g. cancel after shipped)                                                                                                                                                                |
| `OTP_INVALID`                 | 400         | Wrong/expired OTP code                                                                                                                                                                                                                           |
| `RATE_LIMITED`                | 429         | Too many requests for this action/identity                                                                                                                                                                                                       |
| `REAUTHENTICATION_REQUIRED`   | 401         | Added during implementation for `DELETE /auth/me` (docs/Product_Spec_Requirements.md §1.4 requires re-auth before account deletion) — the ID token's `auth_time` is older than 5 minutes; client re-authenticates and retries with a fresh token |
| `INTERNAL_ERROR`              | 500         | Unexpected server error (generic message to client, full detail logged)                                                                                                                                                                          |

### 1.4 Pagination

List endpoints accept `?page=1&limit=24` (limit capped at 100) and respond with:

```json
{
  "success": true,
  "data": { "items": [], "page": 1, "limit": 24, "total": 137, "totalPages": 6 }
}
```

### 1.5 Rate Limits (see also Product_Spec_Requirements.md)

| Endpoint group                    | Limit                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Login (via Firebase, client-side) | Firebase's own throttling + app-level lockout after 5 failures/15min, via `/auth/login-check` + `/auth/login-failed` |
| `/otp/request`                    | 3 per phone per 10 minutes                                                                                           |
| `/otp/verify`                     | 5 attempts per code                                                                                                  |
| `/checkout`, `/checkout/quote`    | 10 per user per minute                                                                                               |
| `/coupons/validate`               | 20 per user per minute                                                                                               |
| Admin write endpoints             | 60 per admin per minute                                                                                              |

---

## 2. Auth & Account

| Method | Path                 | Auth                            | Purpose                                                                                                                                                                                                                                                                                                                                                   |
| ------ | -------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/session`      | Bearer token                    | Exchange a verified Firebase token for a server session record; creates the `users` row on first login                                                                                                                                                                                                                                                    |
| GET    | `/auth/me`           | Bearer token                    | Return current user profile + role                                                                                                                                                                                                                                                                                                                        |
| PATCH  | `/auth/me`           | Bearer token                    | Update name/phone                                                                                                                                                                                                                                                                                                                                         |
| DELETE | `/auth/me`           | Bearer token (re-auth required) | Request account deletion (anonymizes PII, retains order records)                                                                                                                                                                                                                                                                                          |
| POST   | `/auth/login-check`  | None (pre-auth)                 | Added during implementation to back the "app-level lockout after 5 failures/15min" row in §1.5, which had no endpoint defined. Called client-side before attempting a Firebase email/password sign-in; `{ email }` → `RATE_LIMITED` (429) if the email has ≥5 recorded failures in the last 15 minutes, else `{ allowed: true }`. Records nothing itself. |
| POST   | `/auth/login-failed` | None (pre-auth)                 | Companion to the above — called after Firebase itself rejects credentials, so only genuine failures count (a correct password never consumes the lockout budget). `{ email }` → `{ recorded: true }`.                                                                                                                                                     |

`POST /auth/session`

```json
// Request: (no body — token in Authorization header)
// Response
{
  "success": true,
  "data": { "userId": "uuid", "email": "a@b.com", "role": "customer", "isNewUser": true }
}
```

### Addresses

| Method | Path             | Auth               | Purpose                       |
| ------ | ---------------- | ------------------ | ----------------------------- |
| GET    | `/addresses`     | Bearer             | List current user's addresses |
| POST   | `/addresses`     | Bearer             | Add address                   |
| PATCH  | `/addresses/:id` | Bearer, owner-only | Update address                |
| DELETE | `/addresses/:id` | Bearer, owner-only | Remove address                |

`POST /addresses`

```json
// Request
{
  "name": "Riya Sharma", "phone": "9876543210",
  "line1": "12 MG Road", "line2": "Flat 4B", "landmark": "Near Metro",
  "city": "Hyderabad", "state": "Telangana", "postalCode": "500001",
  "isDefaultShipping": true
}
// Response 201
{ "success": true, "data": { "id": "uuid", ... } }
```

Validation errors: `postalCode` must match `^[1-9][0-9]{5}$` → `VALIDATION_ERROR`.

---

## 3. Catalog

| Method | Path                | Auth   | Purpose                                               |
| ------ | ------------------- | ------ | ----------------------------------------------------- |
| GET    | `/products`         | Public | Paginated, filterable product list                    |
| GET    | `/products/:slug`   | Public | Product detail with variants, images, reviews summary |
| GET    | `/categories`       | Public | Category tree                                         |
| GET    | `/categories/:slug` | Public | Category detail + its products (paginated)            |
| GET    | `/brands`           | Public | Brand list                                            |
| GET    | `/search?q=`        | Public | Full-text product search, paginated                   |

`GET /products?category=slug&brand=slug&minPrice=&maxPrice=&inStock=true&sort=price_asc&page=1&limit=24`

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "Cotton T-Shirt",
        "slug": "cotton-t-shirt",
        "basePrice": 79900,
        "salePrice": 59900,
        "primaryImage": "/products/.../thumb.webp",
        "inStock": true,
        "isFeatured": false
      }
    ],
    "page": 1,
    "limit": 24,
    "total": 137,
    "totalPages": 6
  }
}
```

All prices in **paise** in the API; the client formats to ₹.

`GET /products/:slug`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Cotton T-Shirt",
    "slug": "cotton-t-shirt",
    "description": "...",
    "gstRate": 5.0,
    "brand": { "id": "uuid", "name": "GGM Basics" },
    "category": { "id": "uuid", "name": "Apparel", "slug": "apparel" },
    "images": [{ "url": "...", "altText": "...", "isPrimary": true }],
    "variants": [
      {
        "id": "uuid",
        "sku": "TS-BLK-M",
        "attributes": { "size": "M", "color": "Black" },
        "price": 79900,
        "salePrice": 59900,
        "inStock": true,
        "availableQty": 12
      }
    ],
    "reviewsSummary": { "average": 4.3, "count": 28 }
  }
}
```

Not found / archived product → `NOT_FOUND`, 404.

---

## 4. Cart

| Method | Path              | Auth                                | Purpose                                    |
| ------ | ----------------- | ----------------------------------- | ------------------------------------------ |
| GET    | `/cart`           | Bearer or guest session             | Get current cart with live-validated items |
| POST   | `/cart/items`     | Bearer or guest session             | Add item                                   |
| PATCH  | `/cart/items/:id` | Bearer or guest session, owner-only | Update quantity                            |
| DELETE | `/cart/items/:id` | Bearer or guest session, owner-only | Remove item                                |
| POST   | `/cart/merge`     | Bearer                              | Merge guest cart into user cart on login   |

`POST /cart/items`

```json
// Request
{ "variantId": "uuid", "quantity": 2 }
// Response 201
{ "success": true, "data": { "cartId": "uuid", "itemId": "uuid", "quantity": 2 } }
// Error if quantity exceeds stock
{ "success": false, "error": { "code": "OUT_OF_STOCK", "message": "Only 1 left in stock." } }
```

`GET /cart`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "items": [
      {
        "id": "uuid",
        "variantId": "uuid",
        "productName": "Cotton T-Shirt",
        "attributes": { "size": "M", "color": "Black" },
        "quantity": 2,
        "priceSnapshot": 59900,
        "currentPrice": 59900,
        "available": true,
        "priceChanged": false
      }
    ],
    "subtotalEstimate": 119800
  }
}
```

`priceChanged: true` and `available: false` flags let the UI show inline warnings per Section 3 of `Product_Spec_Requirements.md` — the client never computes the real total from this response; `subtotalEstimate` is UX-only.

---

## 5. Checkout, Orders

| Method | Path                               | Auth               | Purpose                                                                                    |
| ------ | ---------------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| POST   | `/checkout/quote`                  | Bearer             | Server-authoritative price breakdown for current cart + coupon                             |
| POST   | `/checkout`                        | Bearer             | Create order (pending_payment) + Razorpay order; or directly confirm if COD + OTP verified |
| POST   | `/checkout/confirm`                | Bearer             | Client-side payment confirmation (signature check; not sufficient alone)                   |
| GET    | `/orders`                          | Bearer             | Paginated order history for current user                                                   |
| GET    | `/orders/:id`                      | Bearer, owner-only | Order detail                                                                               |
| POST   | `/orders/:id/cancel`               | Bearer, owner-only | Cancel (only if status allows)                                                             |
| POST   | `/orders/:id/items/:itemId/return` | Bearer, owner-only | Request return on an item                                                                  |
| GET    | `/orders/:id/invoice`              | Bearer, owner-only | Signed download URL for invoice PDF                                                        |

`POST /checkout/quote`

```json
// Request
{ "couponCode": "WELCOME10" }
// Response
{
  "success": true,
  "data": {
    "subtotal": 159800, "productDiscount": 0, "couponDiscount": 15980,
    "shippingFee": 4900, "cgst": 3596, "sgst": 3596, "igst": 0,
    "grandTotal": 156714
  }
}
// Coupon error
{ "success": false, "error": { "code": "COUPON_INVALID", "message": "This coupon requires a minimum order of ₹999." } }
```

`POST /checkout`

```json
// Request
{
  "shippingAddressId": "uuid", "billingAddressId": "uuid",
  "paymentMethod": "online",           // or "cod"
  "couponCode": "WELCOME10",
  "codOtpVerificationId": null          // required if paymentMethod = "cod"
}
// Response (online)
{
  "success": true,
  "data": { "orderId": "uuid", "orderNumber": "GGM-2026-000123",
             "razorpayOrderId": "order_xxx", "amount": 156714, "keyId": "rzp_live_xxx" }
}
// Response (COD, already confirmed)
{ "success": true, "data": { "orderId": "uuid", "orderNumber": "GGM-2026-000123", "status": "confirmed" } }
```

If any cart item fails re-validation at this point → `OUT_OF_STOCK` or `PRICE_CHANGED`, 409, with `field` indicating which item — order is not created.

`POST /checkout/confirm`

```json
// Request
{ "orderId": "uuid", "razorpayPaymentId": "pay_xxx", "razorpaySignature": "..." }
// Response
{ "success": true, "data": { "status": "pending_confirmation" } }
```

Note: response status is `pending_confirmation`, not `confirmed` — actual confirmation happens via the webhook (Section 6). The client polls `GET /orders/:id` or listens for a push/notification update.

`GET /orders/:id`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "orderNumber": "GGM-2026-000123",
    "status": "shipped",
    "items": [
      {
        "productName": "Cotton T-Shirt",
        "sku": "TS-BLK-M",
        "quantity": 2,
        "unitPrice": 59900,
        "lineTotal": 119800
      }
    ],
    "subtotal": 159800,
    "grandTotal": 156714,
    "statusHistory": [
      { "status": "confirmed", "at": "2026-09-01T10:00:00Z" },
      { "status": "shipped", "at": "2026-09-03T14:00:00Z" }
    ],
    "shipment": { "carrier": "Delhivery", "trackingNumber": "DL123456789", "status": "in_transit" },
    "shippingAddress": { "...": "snapshot, not live" }
  }
}
```

`POST /orders/:id/cancel` — invalid transition (e.g. already shipped) → `INVALID_ORDER_STATE`, 409.

---

## 6. Payments (server-to-server / webhook)

| Method | Path                | Auth                                  | Purpose                              |
| ------ | ------------------- | ------------------------------------- | ------------------------------------ |
| POST   | `/payments/webhook` | Razorpay signature (not a user token) | Receives async payment/refund events |

`POST /payments/webhook`

- Verified via `X-Razorpay-Signature` header against the webhook secret — request is rejected with 400 before any processing if invalid
- Body is Razorpay's standard event payload; `payload.payment.entity.id` and `event` type drive handling
- Always responds `200 OK` quickly (even for events we choose to ignore) so Razorpay doesn't retry unnecessarily; the one exception is signature failure, which returns 400
- Idempotency: `event.id` (Razorpay's own event ID) is stored in `webhook_events`; a repeat delivery is acknowledged with 200 but not reprocessed

This endpoint is never called by the frontend and has no `success`/`data` envelope — it follows Razorpay's expected webhook response contract (plain 200/400).

---

## 7. Coupons

| Method | Path                | Auth   | Purpose                                                    |
| ------ | ------------------- | ------ | ---------------------------------------------------------- |
| POST   | `/coupons/validate` | Bearer | Check a code against the current cart without redeeming it |

```json
// Request
{ "code": "WELCOME10" }
// Response
{ "success": true, "data": { "valid": true, "type": "percentage", "value": 10, "estimatedDiscount": 15980 } }
```

Redemption itself only happens inside `/checkout` at order creation, inside the DB transaction — this endpoint is preview-only.

---

## 8. OTP (COD confirmation via MSG91)

| Method | Path           | Auth                         | Purpose           |
| ------ | -------------- | ---------------------------- | ----------------- |
| POST   | `/otp/request` | Bearer (or guest with phone) | Send OTP to phone |
| POST   | `/otp/verify`  | Same session as request      | Verify code       |

`POST /otp/request`

```json
// Request
{ "phone": "9876543210", "purpose": "cod_confirmation" }
// Response
{ "success": true, "data": { "sent": true, "expiresInSeconds": 300 } }
// Rate limited
{ "success": false, "error": { "code": "RATE_LIMITED", "message": "Too many OTP requests. Try again in 8 minutes." } }
```

The OTP code itself is never present in any response, ever.

`POST /otp/verify`

```json
// Request
{ "phone": "9876543210", "code": "482913" }
// Response
{ "success": true, "data": { "verified": true, "verificationId": "uuid" } }
// Wrong code
{ "success": false, "error": { "code": "OTP_INVALID", "message": "Incorrect code. 3 attempts remaining." } }
```

`verificationId` from a successful verify is what's passed as `codOtpVerificationId` in `POST /checkout`.

---

## 9. Reviews & Wishlist

| Method | Path                               | Auth               | Purpose                                                            |
| ------ | ---------------------------------- | ------------------ | ------------------------------------------------------------------ |
| GET    | `/products/:id/reviews`            | Public             | Paginated approved reviews                                         |
| POST   | `/reviews`                         | Bearer             | Submit review (must have a delivered order containing the product) |
| GET    | `/wishlist`                        | Bearer             | Current user's wishlist                                            |
| POST   | `/wishlist/items`                  | Bearer             | Add variant to wishlist                                            |
| DELETE | `/wishlist/items/:id`              | Bearer, owner-only | Remove                                                             |
| POST   | `/wishlist/items/:id/move-to-cart` | Bearer, owner-only | Move item to cart (re-validates stock/price)                       |

`POST /reviews`

```json
// Request
{ "productId": "uuid", "orderItemId": "uuid", "rating": 5, "title": "Great fit", "body": "..." }
// Response 201 (status defaults to pending, not yet public)
{ "success": true, "data": { "id": "uuid", "status": "pending" } }
// Not eligible
{ "success": false, "error": { "code": "FORBIDDEN", "message": "You can only review products you've purchased and received." } }
```

---

## 10. Notifications

| Method | Path                          | Auth               | Purpose                                |
| ------ | ----------------------------- | ------------------ | -------------------------------------- |
| GET    | `/notifications`              | Bearer             | Paginated, newest first                |
| POST   | `/notifications/:id/read`     | Bearer, owner-only | Mark one as read                       |
| POST   | `/notifications/read-all`     | Bearer             | Mark all as read                       |
| PATCH  | `/notifications/preferences`  | Bearer             | Update email/push opt-ins per category |
| POST   | `/notifications/device-token` | Bearer             | Register FCM token for push            |

---

## 11. Admin Endpoints

All under `/admin/*`, require `role IN ('admin','staff')` (re-checked from DB), with specific actions further restricted to `admin` only where noted.

### Products

| Method | Path                                        | Role         |
| ------ | ------------------------------------------- | ------------ |
| GET    | `/admin/products`                           | admin, staff |
| POST   | `/admin/products`                           | admin, staff |
| PATCH  | `/admin/products/:id`                       | admin, staff |
| DELETE | `/admin/products/:id` (soft delete/archive) | admin, staff |
| POST   | `/admin/products/:id/images`                | admin, staff |
| PATCH  | `/admin/products/:id/images/reorder`        | admin, staff |

`POST /admin/products`

```json
// Request
{
  "name": "Cotton T-Shirt", "slug": "cotton-t-shirt", "categoryId": "uuid", "brandId": "uuid",
  "basePrice": 79900, "gstRate": 5.00, "hsnCode": "6109",
  "variants": [ { "sku": "TS-BLK-M", "attributes": { "size": "M", "color": "Black" }, "price": 79900 } ]
}
// Response 201
{ "success": true, "data": { "id": "uuid", "slug": "cotton-t-shirt" } }
```

Writes to this endpoint are wrapped in `withAudit()` — every change is logged with before/after state.

### Inventory

| Method | Path                                 | Role         |
| ------ | ------------------------------------ | ------------ |
| GET    | `/admin/inventory`                   | admin, staff |
| POST   | `/admin/inventory/:variantId/adjust` | admin, staff |

`POST /admin/inventory/:variantId/adjust`

```json
// Request
{ "type": "restock", "quantity": 50, "note": "New shipment received" }
// Response
{ "success": true, "data": { "variantId": "uuid", "availableQty": 62 } }
```

`note` is required — enforced by validation, not optional, since this writes to `inventory_movements` and `audit_logs`.

### Orders

| Method | Path                       | Role         |
| ------ | -------------------------- | ------------ |
| GET    | `/admin/orders`            | admin, staff |
| GET    | `/admin/orders/:id`        | admin, staff |
| PATCH  | `/admin/orders/:id/status` | admin, staff |

`PATCH /admin/orders/:id/status`

```json
// Request
{ "status": "packed", "trackingNumber": null }
// Invalid transition
{ "success": false, "error": { "code": "INVALID_ORDER_STATE", "message": "Cannot move from 'confirmed' directly to 'delivered'." } }
```

### Coupons / Promotions

| Method   | Path                 | Role                     |
| -------- | -------------------- | ------------------------ |
| GET/POST | `/admin/coupons`     | admin, staff (marketing) |
| PATCH    | `/admin/coupons/:id` | admin, staff             |
| GET/POST | `/admin/promotions`  | admin, staff             |

### Refunds

| Method | Path             | Role       |
| ------ | ---------------- | ---------- |
| GET    | `/admin/refunds` | admin only |
| POST   | `/admin/refunds` | admin only |

`POST /admin/refunds`

```json
// Request
{ "orderId": "uuid", "type": "partial", "amount": 59900, "reason": "Damaged item returned" }
// Response
{ "success": true, "data": { "id": "uuid", "status": "processing" } }
// Duplicate refund attempt
{ "success": false, "error": { "code": "INVALID_ORDER_STATE", "message": "A refund is already in progress for this order." } }
```

### Customers, Reviews, Audit Logs

| Method | Path                                  | Role                               |
| ------ | ------------------------------------- | ---------------------------------- |
| GET    | `/admin/customers`                    | admin, staff (read-only for staff) |
| GET    | `/admin/customers/:id/orders`         | admin, staff                       |
| GET    | `/admin/reviews?status=pending`       | admin, staff                       |
| PATCH  | `/admin/reviews/:id` (approve/reject) | admin, staff                       |
| GET    | `/admin/audit-logs`                   | admin only                         |

---

## 12. Cron / Internal Endpoints

| Method | Path                                 | Auth                      | Purpose                                                                                                       |
| ------ | ------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| POST   | `/cron/process-jobs`                 | Vercel Cron secret header | Drain `job_queue`, dispatch to notification/invoice providers                                                 |
| POST   | `/cron/release-expired-reservations` | Vercel Cron secret header | Sweep `inventory_reservations` past `expires_at`, release stock, mark order `payment_failed` if still pending |

These are not user-facing; authenticated via a shared secret header (`X-Cron-Secret`) checked against an environment variable, distinct from Firebase auth entirely.

---

## 13. What the Frontend Must Never Send (and the server ignores if it does)

- Any `price`, `total`, `discount`, or `taxAmount` field on cart/checkout requests — always recomputed server-side
- `userId` on any request — always derived from the verified token, never accepted as a body/query field
- `status` transitions on customer-facing order endpoints beyond the specific allowed actions (cancel, return-request) — no generic "update status" endpoint exists for customers
- OTP codes are never round-tripped from server to client in any form — request/verify only
