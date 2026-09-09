# Data Model / DB Schema — GreenGrandMart

**Companion docs:** `Architecture.md` · `ECOMMERCE_IMPLEMENTATION_PLAN.md`
**Database:** Postgres (Neon)
**Conventions:**

- All primary keys: `uuid` generated via `gen_random_uuid()` (requires `pgcrypto` extension)
- All monetary columns store **integer paise** (₹1 = 100), never floats
- Every table has `created_at timestamptz default now()`; mutable tables also have `updated_at timestamptz default now()` (updated via trigger or ORM hook)
- Soft-deletable tables have `deleted_at timestamptz null`
- Foreign keys default to `ON DELETE RESTRICT` unless noted — we never want a hard delete to silently cascade through order history

---

## 1. Entity Relationship Overview

```
users ──< addresses
users ──< carts ──< cart_items >── product_variants
users ──< orders ──< order_items
users ──< coupon_redemptions
users ──< wishlists ──< wishlist_items >── product_variants
users ──< reviews >── products
users ──< notifications
users ──< device_tokens
users ──< otp_requests (by phone, not FK — phone may precede account)

brands ──< products
categories ──< categories (self-referencing, parent_id)
categories ──< products
products ──< product_variants
products ──< product_images >── product_variants (nullable)
product_variants ──< inventory (1:1)
product_variants ──< inventory_reservations
product_variants ──< inventory_movements

orders ──< order_status_history
orders ──< payments ──< payment_attempts
orders ──< refunds >── payments
orders ──< shipments ──< shipment_tracking_events
orders ──< returns >── order_items

coupons ──< coupon_redemptions
promotions (standalone, referenced by rules jsonb, not FK)

webhook_events (standalone, idempotency ledger)
job_queue (standalone, background work)
audit_logs (standalone, references entity_type/entity_id generically, not FK)
```

---

## 2. Identity & Access

```sql
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid    text NOT NULL UNIQUE,
  email           citext NOT NULL UNIQUE,
  phone           text,
  phone_verified  boolean NOT NULL DEFAULT false,
  name            text NOT NULL,
  role            text NOT NULL DEFAULT 'customer'
                    CHECK (role IN ('customer','staff','admin')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_users_role ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

CREATE TABLE addresses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               text NOT NULL,
  phone              text NOT NULL,
  line1              text NOT NULL,
  line2              text,
  landmark           text,
  city               text NOT NULL,
  state              text NOT NULL,
  postal_code        text NOT NULL CHECK (postal_code ~ '^[1-9][0-9]{5}$'),
  country            text NOT NULL DEFAULT 'IN',
  is_default_shipping boolean NOT NULL DEFAULT false,
  is_default_billing  boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_addresses_user ON addresses(user_id);
-- Only one default shipping/billing address per user, enforced at app level
-- (partial unique index optional: see Section 8 notes)
```

---

## 3. Catalog

```sql
CREATE TABLE brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  logo_path   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  parent_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  image_path  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_parent ON categories(parent_id);

CREATE TABLE products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  slug              text NOT NULL UNIQUE,
  description       text,
  short_description text,
  brand_id          uuid REFERENCES brands(id) ON DELETE SET NULL,
  category_id       uuid REFERENCES categories(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','active','archived')),
  base_price        integer NOT NULL CHECK (base_price >= 0),   -- paise
  sale_price        integer CHECK (sale_price IS NULL OR sale_price >= 0),
  gst_rate          numeric(5,2) NOT NULL DEFAULT 0,             -- e.g. 18.00
  hsn_code          text,
  is_featured       boolean NOT NULL DEFAULT false,
  seo_title         text,
  seo_description   text,
  search_vector     tsvector,                                    -- trigger-maintained, see addendum below
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX idx_products_status ON products(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX idx_products_search ON products USING GIN (search_vector);

CREATE TABLE product_variants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku            text NOT NULL UNIQUE,
  attributes     jsonb NOT NULL DEFAULT '{}',   -- {"size":"M","color":"Black"}
  price          integer NOT NULL CHECK (price >= 0),
  sale_price     integer CHECK (sale_price IS NULL OR sale_price >= 0),
  stock_managed  boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

CREATE TABLE product_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id   uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  alt_text     text,
  sort_order   integer NOT NULL DEFAULT 0,
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_images_product ON product_images(product_id, sort_order);
-- Only one primary image per product, enforced via app logic + partial unique index:
CREATE UNIQUE INDEX uq_one_primary_image_per_product
  ON product_images(product_id) WHERE is_primary = true;
```

**Addendum (added during implementation): `search_vector` population.** The original comment above ("generated column, see Section 8") pointed nowhere — this doc never actually specified the generation logic, and a plain `GENERATED ALWAYS AS (...) STORED` column cannot reference `brands`/`categories` (a same-table generated column can't join), which the search requirement ("tsvector of name/description/brand/category," §13 Indexing Strategy Summary) needs. Implemented instead as a trigger on `products` that looks up the current brand/category name and combines it with `name`/`short_description`/`description` (weighted A/B/C via `setweight`) into `search_vector` on every insert/update of those columns:

```sql
CREATE FUNCTION products_search_vector_trigger() RETURNS trigger AS $$
DECLARE
  brand_name TEXT;
  category_name TEXT;
BEGIN
  SELECT name INTO brand_name FROM brands WHERE id = NEW.brand_id;
  SELECT name INTO category_name FROM categories WHERE id = NEW.category_id;
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.short_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(brand_name, '') || ' ' || coalesce(category_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE OF name, short_description, description, brand_id, category_id
  ON products FOR EACH ROW EXECUTE FUNCTION products_search_vector_trigger();
```

**Known limitation:** renaming a brand or category does not retroactively re-index the products that reference it (no trigger on `brands`/`categories` themselves) — acceptable at this scale (renames are rare; the catalog module can force a re-index by re-saving affected products if this ever matters in practice).

---

## 4. Inventory

```sql
CREATE TABLE inventory (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id         uuid NOT NULL UNIQUE REFERENCES product_variants(id) ON DELETE CASCADE,
  available_qty      integer NOT NULL DEFAULT 0 CHECK (available_qty >= 0),
  reserved_qty       integer NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  sold_qty           integer NOT NULL DEFAULT 0 CHECK (sold_qty >= 0),
  damaged_qty        integer NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
  returned_qty       integer NOT NULL DEFAULT 0 CHECK (returned_qty >= 0),
  low_stock_threshold integer NOT NULL DEFAULT 5,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_reservations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  order_id    uuid REFERENCES orders(id) ON DELETE SET NULL,
  cart_id     uuid REFERENCES carts(id) ON DELETE SET NULL,
  quantity    integer NOT NULL CHECK (quantity > 0),
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','released','converted')),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reservations_variant_status ON inventory_reservations(variant_id, status);
CREATE INDEX idx_reservations_expiry ON inventory_reservations(expires_at) WHERE status = 'active';

CREATE TABLE inventory_movements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id     uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  type           text NOT NULL
                   CHECK (type IN ('restock','sale','return','damage','adjustment')),
  quantity       integer NOT NULL,   -- signed: positive = increase, negative = decrease
  reference_type text,               -- e.g. 'order', 'return', 'manual'
  reference_id   uuid,
  note           text,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_variant ON inventory_movements(variant_id, created_at);
```

**Note:** `inventory` is only ever written to from the `inventory` module inside a transaction with `SELECT ... FOR UPDATE` on the row — this is an application-level rule, not enforceable purely by schema, but the CHECK constraints (`>= 0`) are the last line of defense against negative stock.

---

## 5. Cart

```sql
CREATE TABLE carts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  session_id  text,                     -- for guest carts
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','converted','abandoned')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_carts_user ON carts(user_id) WHERE status = 'active';
CREATE INDEX idx_carts_session ON carts(session_id) WHERE status = 'active';

CREATE TABLE cart_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id        uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id     uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity       integer NOT NULL CHECK (quantity > 0),
  price_snapshot integer NOT NULL,   -- UX display only, re-verified at checkout
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);
```

---

## 6. Coupons & Promotions

```sql
CREATE TABLE coupons (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text NOT NULL UNIQUE,
  type                  text NOT NULL CHECK (type IN ('percentage','fixed')),
  value                 integer NOT NULL CHECK (value > 0),  -- % (1-100) or paise
  max_discount          integer,                              -- paise, nullable = no cap
  min_cart_value        integer NOT NULL DEFAULT 0,
  starts_at             timestamptz,
  expires_at            timestamptz,
  usage_limit_total     integer,
  usage_limit_per_user  integer NOT NULL DEFAULT 1,
  first_order_only      boolean NOT NULL DEFAULT false,
  applies_to            jsonb NOT NULL DEFAULT '{"scope":"all"}',
  active                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coupons_active ON coupons(active, starts_at, expires_at);

CREATE TABLE coupon_redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id   uuid NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, user_id)   -- enforces per-user limit atomically at DB level
);
CREATE INDEX idx_redemptions_coupon ON coupon_redemptions(coupon_id);

CREATE TABLE promotions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  type        text NOT NULL
                CHECK (type IN ('sale_price','category_discount','bogo','bundle','free_shipping')),
  rules       jsonb NOT NULL,
  starts_at   timestamptz,
  expires_at  timestamptz,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_promotions_active ON promotions(active, starts_at, expires_at);
```

---

## 7. Orders, Payments, Refunds

```sql
CREATE TABLE orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number       text NOT NULL UNIQUE,     -- human-readable, e.g. GGM-2026-000123
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status             text NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
                       'pending_payment','payment_failed','confirmed','processing',
                       'packed','shipped','out_for_delivery','delivered',
                       'cancel_requested','cancelled','return_requested',
                       'return_approved','returned','refund_pending','refunded'
                     )),
  subtotal           integer NOT NULL,
  discount_total     integer NOT NULL DEFAULT 0,
  coupon_discount    integer NOT NULL DEFAULT 0,
  shipping_fee       integer NOT NULL DEFAULT 0,
  tax_total          integer NOT NULL DEFAULT 0,
  grand_total        integer NOT NULL,
  shipping_address   jsonb NOT NULL,     -- full snapshot, not a FK
  billing_address    jsonb NOT NULL,
  placed_at          timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_user ON orders(user_id, placed_at DESC);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_placed_at ON orders(placed_at DESC);

CREATE TABLE order_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id             uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id             uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name_snapshot  text NOT NULL,
  sku_snapshot           text NOT NULL,
  variant_attrs_snapshot jsonb NOT NULL DEFAULT '{}',
  unit_price             integer NOT NULL,
  discount               integer NOT NULL DEFAULT 0,
  tax_amount             integer NOT NULL DEFAULT 0,
  quantity               integer NOT NULL CHECK (quantity > 0),
  line_total             integer NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  changed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_status_history_order ON order_status_history(order_id, created_at);

CREATE TABLE payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider         text NOT NULL DEFAULT 'razorpay',
  razorpay_order_id text,
  status           text NOT NULL DEFAULT 'created' CHECK (status IN (
                      'created','pending','authorized','captured','failed',
                      'cancelled','refund_pending','refunded','partially_refunded'
                    )),
  amount           integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_razorpay_order ON payments(razorpay_order_id);

CREATE TABLE payment_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  razorpay_payment_id text,
  razorpay_signature  text,
  status              text NOT NULL,
  raw_response        jsonb,
  attempted_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attempts_payment ON payment_attempts(payment_id);

CREATE TABLE webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL,
  event_id     text NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  processed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)   -- the idempotency guard
);

CREATE TABLE refunds (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_id         uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  type               text NOT NULL CHECK (type IN ('full','partial','item','shipping')),
  amount             integer NOT NULL CHECK (amount > 0),
  status             text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','completed','failed')),
  provider_refund_id text,
  reason             text,
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refunds_order ON refunds(order_id);
```

---

## 8. Shipping & Returns

```sql
CREATE TABLE shipments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider            text NOT NULL,
  shipment_id         text,
  tracking_number     text,
  status              text NOT NULL DEFAULT 'created',
  carrier             text,
  estimated_delivery  date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shipments_order ON shipments(order_id);

CREATE TABLE shipment_tracking_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id  uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status       text NOT NULL,
  location     text,
  occurred_at  timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracking_shipment ON shipment_tracking_events(shipment_id, occurred_at);

CREATE TABLE returns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  reason        text NOT NULL,
  status        text NOT NULL DEFAULT 'requested' CHECK (status IN (
                   'requested','approved','rejected','item_received','completed'
                 )),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_returns_order ON returns(order_id);
```

---

## 9. Reviews & Wishlist

```sql
CREATE TABLE reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_item_id  uuid REFERENCES order_items(id) ON DELETE SET NULL,  -- verified purchase link
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title          text,
  body           text,
  status         text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  helpful_count  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_product ON reviews(product_id, status);
CREATE UNIQUE INDEX uq_review_per_purchase ON reviews(user_id, order_item_id)
  WHERE order_item_id IS NOT NULL;

CREATE TABLE review_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id    uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wishlists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wishlist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id  uuid NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  variant_id   uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wishlist_id, variant_id)
);
```

---

## 10. Notifications

```sql
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}',
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);

CREATE TABLE device_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token   text NOT NULL UNIQUE,
  platform    text NOT NULL CHECK (platform IN ('web','android','ios')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);
```

---

## 11. OTP (MSG91 — COD confirmation)

```sql
CREATE TABLE otp_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL,
  purpose       text NOT NULL CHECK (purpose IN ('cod_confirmation','phone_verification')),
  code_hash     text NOT NULL,
  expires_at    timestamptz NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 5,
  verified      boolean NOT NULL DEFAULT false,
  ip_address    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone_purpose ON otp_requests(phone, purpose, created_at DESC);
-- Rate-limit queries filter WHERE phone = ? AND created_at > now() - interval '10 minutes'
```

---

## 12. Background Jobs & Audit

```sql
CREATE TABLE job_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,
  payload       jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','done','failed')),
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 3,
  run_after     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);
CREATE INDEX idx_jobs_pending ON job_queue(status, run_after) WHERE status = 'pending';

CREATE TABLE audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  action         text NOT NULL,          -- e.g. 'PRODUCT_PRICE_CHANGED'
  entity_type    text NOT NULL,          -- e.g. 'product'
  entity_id      uuid NOT NULL,
  before         jsonb,
  after          jsonb,
  ip_address     text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_user_id, created_at DESC);
```

**Addendum (added during implementation):** this section originally covered `job_queue` and `audit_logs` only. Architecture.md §8 and Security.md specify a Postgres-backed sliding-window rate limiter for login, `/otp/request`, `/otp/verify`, checkout, coupon-validate, review creation, and admin writes, but no backing table was specified here — the only rate-limit query this doc showed was the `otp_requests`-based count for OTP itself, which doesn't cover the other endpoints. Added a minimal generic table to close that gap:

```sql
CREATE TABLE rate_limit_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,   -- composite bucket key, e.g. 'login:email:foo@bar.com'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rate_limit_events_key_created ON rate_limit_events(key, created_at DESC);
-- Rate-limit queries filter WHERE key = ? AND created_at > now() - interval '<window>'
```

Old rows have no long-term value once outside every limiter's window; a daily cleanup job (alongside the existing `otp_requests` 24h purge) should delete rows older than the longest configured window.

---

## 13. Indexing Strategy Summary

| Access pattern                              | Index                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| List active products by category, paginated | `idx_products_category`, `idx_products_status`                                                                                        |
| Product search                              | GIN index on `search_vector` (tsvector of name/description/brand/category)                                                            |
| Customer's order history, newest first      | `idx_orders_user` (composite, includes `placed_at DESC`)                                                                              |
| Admin order queue by status                 | `idx_orders_status`                                                                                                                   |
| Coupon redemption limit check               | `UNIQUE (coupon_id, user_id)` doubles as both constraint and lookup index                                                             |
| Webhook idempotency check                   | `UNIQUE (provider, event_id)`                                                                                                         |
| Active reservation expiry sweep (cron)      | Partial index `idx_reservations_expiry` (`WHERE status = 'active'`) — keeps the index small since most reservations end up non-active |
| Job queue polling                           | Partial index `idx_jobs_pending` (`WHERE status = 'pending'`)                                                                         |
| Low-stock dashboard widget                  | Query filters `available_qty <= low_stock_threshold`; no dedicated index needed at this table size (≤500 rows), add one if it grows   |
| Notification bell unread count              | `idx_notifications_user` composite on `(user_id, read, created_at)`                                                                   |

**General rule:** every foreign key used in a `WHERE` or `JOIN` has a supporting index; partial indexes are used wherever a query only ever filters to a small subset of a larger table (active reservations, pending jobs).

---

## 14. Constraints Summary

| Type                                 | Where used                                                                                                                                                            | Purpose                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CHECK`                              | Non-negative quantities/prices, enum-like status fields, rating range, pincode format                                                                                 | Reject invalid data at the DB layer even if application code has a bug                                                    |
| `UNIQUE`                             | `users.firebase_uid`, `users.email`, `products.slug`, `product_variants.sku`, `coupons.code`, `(coupon_id, user_id)`, `(provider, event_id)`, `(cart_id, variant_id)` | Prevent duplicates that would corrupt business logic (double redemption, double webhook processing, duplicate cart lines) |
| Partial `UNIQUE`                     | One primary image per product, one review per purchased order item                                                                                                    | Enforce a business rule that's conditional, not global                                                                    |
| `FOREIGN KEY ... ON DELETE RESTRICT` | Anything tied to financial/historical records (orders, payments, refunds referencing users/products)                                                                  | Prevent accidental data loss that would corrupt an audit trail or historical order                                        |
| `FOREIGN KEY ... ON DELETE CASCADE`  | Child records with no independent meaning (cart_items, order status history, review images, wishlist items)                                                           | Clean up dependent rows automatically when the parent is legitimately deleted                                             |
| `FOREIGN KEY ... ON DELETE SET NULL` | Optional/soft associations (category on a product, actor on an audit log if the user is later deleted)                                                                | Preserve the record while acknowledging the reference is gone                                                             |

---

## 15. Notes on Data Integrity Beyond the Schema

- **Order snapshots are intentional denormalization.** `order_items.product_name_snapshot`, `sku_snapshot`, `variant_attrs_snapshot`, and `orders.shipping_address`/`billing_address` (jsonb) duplicate data that also lives elsewhere — this is correct, not a bug. Orders must never change when the catalog or a user's address book changes later.
- **Money is always integer paise.** Any migration or reporting query that divides by 100 for display must do so at the presentation layer only — never store a float/decimal rupee amount.
- **`inventory.available_qty` is the only number shown to customers.** `reserved_qty` and `sold_qty` are internal; a customer never sees "reserved" as a concept.
- **Extensions required:** `pgcrypto` (for `gen_random_uuid()`), `citext` (case-insensitive email uniqueness), and standard Postgres full-text search (no extension needed beyond core).
