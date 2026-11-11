-- Gate 4 · Data contract · first migration for D1 database `shelf`.
-- Every table, column and constraint here is specified in docs/engineering/04-data-contract.md.
-- Money is stored in integer cents, so no floating-point rounding can change a total (INV-01).
-- Times are ISO 8601 text in UTC, because D1 (SQLite) has no time type.
-- TEXT primary keys say NOT NULL: SQLite otherwise allows a NULL primary key on a non-integer key.

PRAGMA foreign_keys = ON;

-- TAB-01 sellers: one row per PayPal account that signed in.
CREATE TABLE sellers (
  id TEXT NOT NULL PRIMARY KEY,                         -- 'sel_' + ULID
  paypal_account_id TEXT NOT NULL UNIQUE,      -- from Log in with PayPal user info
  paypal_email TEXT NOT NULL,                  -- the payee email for orders (ADR-008)
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- TAB-02 sessions: seller sign-in sessions; the cookie holds the id, never the seller id.
CREATE TABLE sessions (
  id TEXT NOT NULL PRIMARY KEY,                         -- 32 random bytes, base64url
  seller_id TEXT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_seller ON sessions(seller_id);

-- TAB-03 stores: one store per seller in R1.
CREATE TABLE stores (
  id TEXT NOT NULL PRIMARY KEY,                         -- 'sto_' + ULID
  seller_id TEXT NOT NULL UNIQUE REFERENCES sellers(id),
  slug TEXT NOT NULL UNIQUE CHECK (slug GLOB '[a-z0-9]*' AND length(slug) BETWEEN 3 AND 40),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  refund_policy TEXT,                          -- one sentence, shown before payment (PR-BUY-08)
  shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  is_demo INTEGER NOT NULL DEFAULT 0,          -- 1 for the two seeded Try page stores
  created_at TEXT NOT NULL
);

-- TAB-04 store_keys: Cart API keys; only the SHA-256 hash is stored (SYS-CART-05).
CREATE TABLE store_keys (
  id TEXT NOT NULL PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

-- TAB-05 photos: uploaded images and their extraction.
CREATE TABLE photos (
  id TEXT NOT NULL PRIMARY KEY,                         -- 'pho_' + ULID
  store_id TEXT NOT NULL REFERENCES stores(id),
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp','image/heic')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  state TEXT NOT NULL CHECK (state IN ('queued','extracted','failed','no_product')),
  failure_reason TEXT,
  extraction_json TEXT,                        -- the schema-valid model answer, kept for review
  product_id TEXT REFERENCES products(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX photos_store_state ON photos(store_id, state);

-- TAB-06 products.
CREATE TABLE products (
  id TEXT NOT NULL PRIMARY KEY,                         -- 'prd_' + ULID
  store_id TEXT NOT NULL REFERENCES stores(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  category TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('draft','published','deleted')),
  ai_fields_json TEXT NOT NULL DEFAULT '[]',   -- names of fields the model filled and the seller has not edited (SYS-AI-03)
  suggested_min_cents INTEGER,
  suggested_max_cents INTEGER,
  cover_photo_id TEXT,
  paypal_catalog_id TEXT,                      -- set if Catalog Products sync runs (Should)
  search_text TEXT NOT NULL DEFAULT '',        -- lower-case title, description, category, options; for LIKE search in R1
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX products_store_state ON products(store_id, state);

-- TAB-07 variants: price_cents is NULL until the seller confirms it (INV-03).
CREATE TABLE variants (
  id TEXT NOT NULL PRIMARY KEY,                         -- 'var_' + ULID
  product_id TEXT NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL UNIQUE,
  options_json TEXT NOT NULL DEFAULT '{}',     -- for example {"Size":"Large"}
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents BETWEEN 50 AND 1000000),
  stock INTEGER NOT NULL DEFAULT 1 CHECK (stock >= 0),
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX variants_product ON variants(product_id);

-- TAB-08 carts.
CREATE TABLE carts (
  id TEXT NOT NULL PRIMARY KEY CHECK (id GLOB 'CART-[A-Z0-9]*'),
  store_id TEXT NOT NULL REFERENCES stores(id),
  channel TEXT NOT NULL CHECK (channel IN ('storefront','cart_api','try')),
  items_json TEXT NOT NULL,                    -- [{variant_id, quantity}] as the caller sent them
  lines_json TEXT NOT NULL,                    -- server-computed lines with prices (INV-01)
  subtotal_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  validation_issues_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL CHECK (state IN ('ready','incomplete','checking_out','completed','expired')),
  version INTEGER NOT NULL DEFAULT 1,          -- optimistic concurrency (ADR-003)
  store_key_id TEXT REFERENCES store_keys(id), -- set for channel cart_api; an agent sees only its own carts
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX carts_state_expiry ON carts(state, expires_at);

-- TAB-09 orders.
CREATE TABLE orders (
  id TEXT NOT NULL PRIMARY KEY,                         -- 'ord_' + ULID
  store_id TEXT NOT NULL REFERENCES stores(id),
  cart_id TEXT NOT NULL UNIQUE REFERENCES carts(id),
  cart_version INTEGER NOT NULL,
  paypal_order_id TEXT NOT NULL UNIQUE,
  capture_id TEXT UNIQUE,                      -- INV-04: one capture per order
  state TEXT NOT NULL CHECK (state IN ('created','approved','captured','shipped','refunded','cancelled')),
  amount_cents INTEGER NOT NULL,
  refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0 AND refunded_cents <= amount_cents), -- INV-07
  buyer_email TEXT,                            -- from PayPal after capture; never sent to a model
  shipping_json TEXT,                          -- address from PayPal; never sent to a model
  carrier TEXT,
  tracking_number TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX orders_store_created ON orders(store_id, created_at);
CREATE INDEX orders_state_updated ON orders(state, updated_at);

-- TAB-10 refund_requests.
CREATE TABLE refund_requests (
  id TEXT NOT NULL PRIMARY KEY,                         -- 'rfd_' + ULID; also the PayPal-Request-Id of the refund call
  order_id TEXT NOT NULL REFERENCES orders(id),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  state TEXT NOT NULL CHECK (state IN ('pending','approved','declined','done','failed')),
  decline_reason TEXT,
  failure_reason TEXT,
  paypal_refund_id TEXT UNIQUE,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- INV-06: at most one pending request per order.
CREATE UNIQUE INDEX refund_one_pending ON refund_requests(order_id) WHERE state = 'pending';

-- TAB-11 events: the order timeline; append only (INV-09).
CREATE TABLE events (
  id TEXT NOT NULL PRIMARY KEY,                         -- 'evt_' + ULID, so ids sort by time
  order_id TEXT NOT NULL REFERENCES orders(id),
  actor TEXT NOT NULL CHECK (actor IN ('agent','buyer','seller','paypal','system')),
  type TEXT NOT NULL,                          -- for example 'order.created', 'order.captured', 'refund.requested'
  data_json TEXT NOT NULL DEFAULT '{}',        -- no email, address or token (NFR-SEC-03)
  created_at TEXT NOT NULL
);
CREATE INDEX events_order ON events(order_id, id);

-- TAB-12 webhook_events: PayPal webhook ids, so a repeat changes nothing (INV-08).
CREATE TABLE webhook_events (
  paypal_event_id TEXT NOT NULL PRIMARY KEY,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  received_at TEXT NOT NULL
);

-- TAB-13 push_subscriptions: Web Push endpoints of a seller's devices.
CREATE TABLE push_subscriptions (
  id TEXT NOT NULL PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- TAB-14 rate_limits: fixed-window counters for the Try chat and the MCP endpoint (THR-09).
CREATE TABLE rate_limits (
  bucket TEXT NOT NULL PRIMARY KEY,                     -- for example 'try:<ip-hash>:<hour>'
  count INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
