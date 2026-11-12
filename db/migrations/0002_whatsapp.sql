-- WhatsApp channel (ADR-012). A buyer or a seller talks to Shelf's agent on WhatsApp.
-- wa_id is the sender's WhatsApp ID (their phone number in international form). Shelf keeps it only to reply.

-- TAB-15 wa_chats: one row per WhatsApp sender; the last turns of the conversation, as text only.
CREATE TABLE wa_chats (
  wa_id TEXT NOT NULL PRIMARY KEY,
  history_json TEXT NOT NULL DEFAULT '[]',     -- [{role:'user'|'model', text}] , at most 16 turns
  cart_id TEXT,                                -- the buyer's current cart, so the model never has to carry it
  updated_at TEXT NOT NULL
);

-- TAB-16 wa_seen: a WhatsApp message ID that was handled changes nothing (Meta retries deliveries).
CREATE TABLE wa_seen (
  message_id TEXT NOT NULL PRIMARY KEY,
  seen_at TEXT NOT NULL
);

-- TAB-17 wa_sellers: a seller who linked WhatsApp from the Seller app. One number per seller.
CREATE TABLE wa_sellers (
  wa_id TEXT NOT NULL PRIMARY KEY,
  seller_id TEXT NOT NULL UNIQUE REFERENCES sellers(id) ON DELETE CASCADE,
  linked_at TEXT NOT NULL
);

-- TAB-18 wa_orders: orders started on WhatsApp, so Shelf can tell the buyer when PayPal says Paid.
-- The order token stays here, never in the model's context.
CREATE TABLE wa_orders (
  order_id TEXT NOT NULL PRIMARY KEY REFERENCES orders(id),
  wa_id TEXT NOT NULL,
  order_token TEXT NOT NULL,
  notified_at TEXT,                            -- set once the buyer heard "Paid"
  created_at TEXT NOT NULL
);
CREATE INDEX wa_orders_wa ON wa_orders(wa_id);

-- TAB-19 wa_photos: photos a seller sent on WhatsApp, so Shelf can send back the draft.
CREATE TABLE wa_photos (
  photo_id TEXT NOT NULL PRIMARY KEY REFERENCES photos(id),
  wa_id TEXT NOT NULL,
  notified_at TEXT
);
