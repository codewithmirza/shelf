import type { StoreId } from "../domain/brand";
import { domainError, type DomainError } from "../domain/errors";
import { prefixedId, type IdSource } from "../domain/ids";
import { err, ok, type Result } from "../domain/result";
import type { ExtractionOutcome } from "../model/extraction";
import type { ExtractFailure, PhotoInput } from "../model/vertex";

// SYS-SEL-03: JPEG, PNG, WebP or HEIC, 1 byte to 10 MB, 1 to 10 per upload.
export const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" } as const;
export type PhotoType = keyof typeof PHOTO_TYPES;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 10;

export type PhotoState = "queued" | "extracted" | "failed" | "no_product";

export interface PhotoRow {
  readonly id: string;
  readonly storeId: StoreId;
  readonly r2Key: string;
  readonly contentType: PhotoType;
  readonly state: PhotoState;
  readonly failureReason: string | null;
  readonly productId: string | null;
  readonly createdAt: string;
}

export interface PhotoDeps {
  readonly db: D1Database;
  readonly bucket: R2Bucket;
  readonly queue: { send(body: { photoId: string }): Promise<void> };
  readonly ids: IdSource;
}

export interface UploadFile {
  readonly type: string;
  readonly size: number;
  bytes(): Promise<ArrayBuffer>;
}

// Checks every file first, so a bad file stores nothing (FC-SEL-02-01).
export async function uploadPhotos(deps: PhotoDeps, store: StoreId, files: readonly UploadFile[]): Promise<Result<{ id: string; state: PhotoState }[], DomainError>> {
  if (files.length < 1 || files.length > MAX_PHOTOS) return err(domainError("photo.invalid", `count ${files.length}`));
  for (const f of files) if (!(f.type in PHOTO_TYPES) || f.size < 1 || f.size > MAX_PHOTO_BYTES) return err(domainError("photo.invalid", `${f.type} ${f.size}`));
  const out: { id: string; state: PhotoState }[] = [];
  for (const f of files) {
    const id = prefixedId("pho", deps.ids);
    const type = f.type as PhotoType;
    const key = `stores/${store}/${id}.${PHOTO_TYPES[type]}`;
    const now = new Date(deps.ids.now()).toISOString();
    await deps.bucket.put(key, await f.bytes(), { httpMetadata: { contentType: type } });
    await deps.db
      .prepare("INSERT INTO photos (id, store_id, r2_key, content_type, byte_size, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)")
      .bind(id, store, key, type, f.size, now, now)
      .run();
    await deps.queue.send({ photoId: id });
    out.push({ id, state: "queued" });
  }
  return ok(out);
}

interface PhotoDbRow { id: string; store_id: string; r2_key: string; content_type: PhotoType; state: PhotoState; failure_reason: string | null; product_id: string | null; created_at: string }
const rowTo = (r: PhotoDbRow): PhotoRow => ({ id: r.id, storeId: r.store_id as StoreId, r2Key: r.r2_key, contentType: r.content_type, state: r.state, failureReason: r.failure_reason, productId: r.product_id, createdAt: r.created_at });
const COLS = "id, store_id, r2_key, content_type, state, failure_reason, product_id, created_at";

export async function listPhotos(db: D1Database, store: StoreId, since: string | null): Promise<PhotoRow[]> {
  const { results } = await db
    .prepare(`SELECT ${COLS} FROM photos WHERE store_id = ? AND updated_at > ? ORDER BY created_at DESC LIMIT 50`)
    .bind(store, since ?? "")
    .all<PhotoDbRow>();
  return results.map(rowTo);
}

export async function photoById(db: D1Database, id: string): Promise<PhotoRow | null> {
  const r = await db.prepare(`SELECT ${COLS} FROM photos WHERE id = ?`).bind(id).first<PhotoDbRow>();
  return r ? rowTo(r) : null;
}

// The words a buyer can search by: title, description, category and option values, lower case.
export const searchText = (title: string, description: string, category: string, options: readonly Readonly<Record<string, string>>[]) =>
  [title, description, category, ...options.flatMap((o) => Object.values(o))].join(" ").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 2000);

// T-PRD-01: an extraction makes a Draft. Every variant starts with no price (INV-03, SYS-AI-02).
async function draftFrom(deps: Pick<PhotoDeps, "db" | "ids">, photo: PhotoRow, d: Extract<ExtractionOutcome, { kind: "draft" }> | null, raw: unknown): Promise<string> {
  const productId = prefixedId("prd", deps.ids);
  const now = new Date(deps.ids.now()).toISOString();
  const title = d?.title ?? "Untitled product";
  const variants = d?.variants ?? [{ options: {} }];
  const stmts = [
    deps.db
      .prepare(
        `INSERT INTO products (id, store_id, title, description, category, state, ai_fields_json, suggested_min_cents, suggested_max_cents, cover_photo_id, search_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(productId, photo.storeId, title, d?.description ?? "", d?.category ?? "other", JSON.stringify(d?.aiFields ?? []), d?.suggestedMinCents ?? null, d?.suggestedMaxCents ?? null, photo.id,
        searchText(title, d?.description ?? "", d?.category ?? "", variants.map((v) => v.options)), now, now),
    ...variants.map((v, i) =>
      deps.db
        .prepare("INSERT INTO variants (id, product_id, sku, options_json, price_cents, stock, position) VALUES (?, ?, ?, ?, NULL, 1, ?)")
        .bind(prefixedId("var", deps.ids), productId, `${productId.slice(4, 16)}-${i + 1}`, JSON.stringify(v.options), i),
    ),
    deps.db
      .prepare("UPDATE photos SET state = 'extracted', product_id = ?, extraction_json = ?, failure_reason = NULL, updated_at = ? WHERE id = ?")
      .bind(productId, raw === null ? null : JSON.stringify(raw), now, photo.id),
  ];
  await deps.db.batch(stmts);
  return productId;
}

export type ExtractStep = { readonly kind: "done" } | { readonly kind: "retry" };

// The queue consumer for one photo (FL-SEL-02). Transport failures go back to the queue (SF-03); after the
// last attempt the photo is Failed with a reason, and the seller can "Fill in yourself" (FC-SEL-02-02).
export async function extractPhoto(
  deps: Pick<PhotoDeps, "db" | "bucket" | "ids">,
  read: (photo: PhotoInput) => Promise<Result<ExtractionOutcome, ExtractFailure>>,
  photoId: string,
  attempt: number,
  maxAttempts: number,
): Promise<ExtractStep> {
  const photo = await photoById(deps.db, photoId);
  if (!photo || photo.state !== "queued") return { kind: "done" };
  const now = () => new Date(deps.ids.now()).toISOString();
  const fail = async (reason: string) => {
    await deps.db.prepare("UPDATE photos SET state = 'failed', failure_reason = ?, updated_at = ? WHERE id = ? AND state = 'queued'").bind(reason.slice(0, 300), now(), photo.id).run();
    return { kind: "done" } as const;
  };
  const obj = await deps.bucket.get(photo.r2Key);
  if (!obj) return fail("photo file missing");
  const bytes = new Uint8Array(await obj.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await read({ mimeType: photo.contentType, base64: btoa(bin) });
  if (!r.ok) {
    if (r.error.kind === "final") return fail(r.error.reason);
    return attempt >= maxAttempts ? fail("the model did not answer") : { kind: "retry" };
  }
  if (r.value.kind === "no_product") {
    await deps.db.prepare("UPDATE photos SET state = 'no_product', updated_at = ? WHERE id = ? AND state = 'queued'").bind(now(), photo.id).run();
    return { kind: "done" };
  }
  await draftFrom(deps, photo, r.value, r.value);
  return { kind: "done" };
}

// FC-SEL-02-02: "Fill in yourself" makes a blank Draft from a failed photo.
export async function blankDraft(deps: Pick<PhotoDeps, "db" | "ids">, store: StoreId, photoId: string): Promise<Result<string, DomainError>> {
  const photo = await photoById(deps.db, photoId);
  if (!photo || photo.storeId !== store) return err(domainError("not_found", "photo"));
  if (photo.state !== "failed" && photo.state !== "no_product") return err(domainError("request.invalid", `photo is ${photo.state}`));
  return ok(await draftFrom(deps, { ...photo }, null, null));
}

// Images are public only for published products; a draft's photo needs its seller's session.
export async function publicPhoto(db: D1Database, key: string): Promise<boolean> {
  const r = await db
    .prepare("SELECT 1 AS x FROM photos ph JOIN products p ON p.id = ph.product_id WHERE ph.r2_key = ? AND p.state = 'published'")
    .bind(key)
    .first();
  return r !== null;
}
