// The Worker's bindings and variables. Secrets are set with `wrangler secret put` (Gate 3, "Environments and secrets").
export interface ShelfEnv {
  readonly DB: D1Database;
  readonly PHOTOS: R2Bucket;
  readonly EXTRACTION_QUEUE: Queue<ExtractionMessage>;
  readonly ASSETS: Fetcher;
  readonly PAYPAL_BASE: string;
  readonly PAYPAL_CLIENT_ID: string;
  readonly PAYPAL_CLIENT_SECRET: string;
  readonly PAYPAL_WEBHOOK_ID: string;
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
}

// One message per uploaded photo; the consumer reads the photo and drafts a product (FL-SEL-02).
export interface ExtractionMessage {
  readonly photoId: string;
}
