// Gate 4 tables in Drizzle form. They match db/migrations/0001_initial.sql exactly; `drizzle-kit check` guards the match (M-02).
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// TAB-01
export const sellers = sqliteTable("sellers", {
  id: text("id").primaryKey(),
  paypalAccountId: text("paypal_account_id").notNull().unique(),
  paypalEmail: text("paypal_email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
});

// TAB-02
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  sellerId: text("seller_id").notNull().references(() => sellers.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [index("sessions_seller").on(t.sellerId)]);

// TAB-03
export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(),
  sellerId: text("seller_id").notNull().unique().references(() => sellers.id),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  refundPolicy: text("refund_policy"),
  shippingCents: integer("shipping_cents").notNull().default(0),
  currency: text("currency", { enum: ["USD"] }).notNull().default("USD"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

// TAB-04
export const storeKeys = sqliteTable("store_keys", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull().unique(),
  label: text("label").notNull(),
  createdAt: text("created_at").notNull(),
  revokedAt: text("revoked_at"),
});

// TAB-05
export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  r2Key: text("r2_key").notNull().unique(),
  contentType: text("content_type", { enum: ["image/jpeg", "image/png", "image/webp", "image/heic"] }).notNull(),
  byteSize: integer("byte_size").notNull(),
  state: text("state", { enum: ["queued", "extracted", "failed", "no_product"] }).notNull(),
  failureReason: text("failure_reason"),
  extractionJson: text("extraction_json"),
  productId: text("product_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("photos_store_state").on(t.storeId, t.state)]);

// TAB-06
export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default(""),
  state: text("state", { enum: ["draft", "published", "deleted"] }).notNull(),
  aiFieldsJson: text("ai_fields_json").notNull().default("[]"),
  suggestedMinCents: integer("suggested_min_cents"),
  suggestedMaxCents: integer("suggested_max_cents"),
  coverPhotoId: text("cover_photo_id"),
  paypalCatalogId: text("paypal_catalog_id"),
  searchText: text("search_text").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("products_store_state").on(t.storeId, t.state)]);

// TAB-07: price_cents stays null until the seller confirms it (INV-03).
export const variants = sqliteTable("variants", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id),
  sku: text("sku").notNull().unique(),
  optionsJson: text("options_json").notNull().default("{}"),
  priceCents: integer("price_cents"),
  stock: integer("stock").notNull().default(1),
  position: integer("position").notNull().default(0),
}, (t) => [index("variants_product").on(t.productId)]);

// TAB-08
export const carts = sqliteTable("carts", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  channel: text("channel", { enum: ["storefront", "cart_api", "try"] }).notNull(),
  itemsJson: text("items_json").notNull(),
  linesJson: text("lines_json").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  validationIssuesJson: text("validation_issues_json").notNull().default("[]"),
  state: text("state", { enum: ["ready", "incomplete", "checking_out", "completed", "expired"] }).notNull(),
  version: integer("version").notNull().default(1),
  storeKeyId: text("store_key_id").references(() => storeKeys.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("carts_state_expiry").on(t.state, t.expiresAt)]);

// TAB-09
export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  cartId: text("cart_id").notNull().unique().references(() => carts.id),
  cartVersion: integer("cart_version").notNull(),
  paypalOrderId: text("paypal_order_id").notNull().unique(),
  captureId: text("capture_id").unique(),
  state: text("state", { enum: ["created", "approved", "captured", "shipped", "refunded", "cancelled"] }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  refundedCents: integer("refunded_cents").notNull().default(0),
  buyerEmail: text("buyer_email"),
  shippingJson: text("shipping_json"),
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("orders_store_created").on(t.storeId, t.createdAt), index("orders_state_updated").on(t.state, t.updatedAt)]);

// TAB-10: at most one pending request per order (INV-06).
export const refundRequests = sqliteTable("refund_requests", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  reason: text("reason").notNull(),
  amountCents: integer("amount_cents").notNull(),
  state: text("state", { enum: ["pending", "approved", "declined", "done", "failed"] }).notNull(),
  declineReason: text("decline_reason"),
  failureReason: text("failure_reason"),
  paypalRefundId: text("paypal_refund_id").unique(),
  decidedAt: text("decided_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [uniqueIndex("refund_one_pending").on(t.orderId).where(sql`state = 'pending'`)]);

// TAB-11: append only (INV-09).
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  actor: text("actor", { enum: ["agent", "buyer", "seller", "paypal", "system"] }).notNull(),
  type: text("type").notNull(),
  dataJson: text("data_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (t) => [index("events_order").on(t.orderId, t.id)]);

// TAB-12: a known PayPal event ID changes nothing (INV-08).
export const webhookEvents = sqliteTable("webhook_events", {
  paypalEventId: text("paypal_event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  resourceId: text("resource_id"),
  receivedAt: text("received_at").notNull(),
});

// TAB-13
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  sellerId: text("seller_id").notNull().references(() => sellers.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
});

// TAB-14
export const rateLimits = sqliteTable("rate_limits", {
  bucket: text("bucket").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: text("expires_at").notNull(),
});

// TAB-15 to TAB-19: the WhatsApp channel (ADR-012).
export const waChats = sqliteTable("wa_chats", {
  waId: text("wa_id").primaryKey().notNull(),
  historyJson: text("history_json").notNull().default("[]"),
  cartId: text("cart_id"),
  updatedAt: text("updated_at").notNull(),
});

export const waSeen = sqliteTable("wa_seen", {
  messageId: text("message_id").primaryKey().notNull(),
  seenAt: text("seen_at").notNull(),
});

export const waSellers = sqliteTable("wa_sellers", {
  waId: text("wa_id").primaryKey().notNull(),
  sellerId: text("seller_id").notNull().unique().references(() => sellers.id, { onDelete: "cascade" }),
  linkedAt: text("linked_at").notNull(),
});

export const waOrders = sqliteTable("wa_orders", {
  orderId: text("order_id").primaryKey().notNull().references(() => orders.id),
  waId: text("wa_id").notNull(),
  orderToken: text("order_token").notNull(),
  notifiedAt: text("notified_at"),
  createdAt: text("created_at").notNull(),
}, (t) => [index("wa_orders_wa").on(t.waId)]);

export const waPhotos = sqliteTable("wa_photos", {
  photoId: text("photo_id").primaryKey().notNull().references(() => photos.id),
  waId: text("wa_id").notNull(),
  notifiedAt: text("notified_at"),
});
