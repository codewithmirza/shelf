// The Worker's bindings and variables. Secrets are set with `wrangler secret put` (Gate 3, "Environments and secrets").
export interface ShelfEnv {
  readonly DB: D1Database;
  readonly PHOTOS: R2Bucket;
  // Photo extraction and the WhatsApp channel share one queue (Workers Free plan).
  readonly EXTRACTION_QUEUE: Queue<QueueMessage>;
  readonly ASSETS: Fetcher;
  readonly PAYPAL_BASE: string;
  readonly PAYPAL_CLIENT_ID: string;
  readonly PAYPAL_CLIENT_SECRET: string;
  readonly PAYPAL_WEBHOOK_ID: string;
  // An Agent Platform (Vertex AI) API key. When set, the model is called directly instead of through AI Gateway.
  readonly VERTEX_API_KEY?: string;
  readonly CF_ACCOUNT_ID: string;
  readonly CF_AIG_TOKEN: string;
  readonly AIG_NAME: string;
  readonly GCP_PROJECT: string;
  readonly GCP_LOCATION: string;
  readonly SESSION_SECRET: string;
  readonly TOKEN_SECRET: string;
  // Sandbox buyer shown on the Try page (test-only credentials).
  readonly TRY_BUYER_EMAIL?: string;
  readonly TRY_BUYER_PASSWORD?: string;
  readonly PUBLIC_ORIGIN: string;
  // WhatsApp Cloud API (ADR-012). Without them the WhatsApp channel is off.
  readonly WHATSAPP_TOKEN?: string;
  readonly WHATSAPP_PHONE_NUMBER_ID?: string;
  readonly WHATSAPP_APP_SECRET?: string;
  readonly WHATSAPP_VERIFY_TOKEN?: string;
}

// One message per uploaded photo; the consumer reads the photo and drafts a product (FL-SEL-02).
export interface ExtractionMessage {
  readonly photoId: string;
}

// WhatsApp work runs on the queue: an inbound message, or a check whether a WhatsApp order is paid yet (ADR-012).
export type WaMessage =
  | { readonly kind: "wa_in"; readonly message: import("./server/whatsapp/graph").Inbound }
  | { readonly kind: "wa_watch"; readonly orderId: string; readonly n: number };

export type QueueMessage = ExtractionMessage | WaMessage;
