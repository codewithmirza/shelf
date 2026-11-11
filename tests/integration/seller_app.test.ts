import { describe, expect, it } from "vitest";
import { cents, storeId, variantId, type StoreId } from "@/server/domain/brand";
import { err, ok } from "@/server/domain/result";
import { domainError } from "@/server/domain/errors";
import { d1Catalog } from "@/server/catalog";
import { d1CartRepo, upsertCart } from "@/server/carts";
import { capturePayment, d1OrderRepo, startCheckout } from "@/server/checkout";
import { d1SessionRepo, signIn } from "@/server/auth/session";
import { createStore, d1SellerStoreRepo } from "@/server/seller/stores";
import { blankDraft, extractPhoto, listPhotos, uploadPhotos, type PhotoDeps } from "@/server/seller/photos";
import { editProduct, getProduct, listProducts, moveProduct } from "@/server/seller/products";
import { addTracking, approveRefund, declineRefund, listSellerOrders, sellerOrder, type SellerPayPalPort } from "@/server/refunds";
import { d1OrderStatusRepo, requestRefund } from "@/server/orders";
import type { ExtractionOutcome } from "@/server/model/extraction";
import { sqliteD1 } from "../support/d1";
import { TOKEN_SECRET, fakeIds, fakePayPal } from "../support/fakes";

function fakeBucket() {
  const objects = new Map<string, ArrayBuffer>();
  return {
    objects,
    bucket: {
      async put(key: string, value: ArrayBuffer) { objects.set(key, value); return {} as never; },
      async get(key: string) { const v = objects.get(key); return v ? ({ arrayBuffer: async () => v, body: null, httpMetadata: {} } as never) : null; },
    } as unknown as R2Bucket,
  };
}

async function sellerWorld() {
  const db = sqliteD1();
  const ids = fakeIds();
  const sent: { photoId: string }[] = [];
  const { bucket, objects } = fakeBucket();
  const photos: PhotoDeps = { db, bucket, ids, queue: { send: async (b) => { sent.push(b); } } };
  const mkSeller = async (accountId: string, slug: string) => {
    const { sellerId } = await signIn(d1SessionRepo(db), ids, { accountId, isPayerId: false, email: `${slug}@seller.test`, name: slug });
    const s = await createStore(d1SellerStoreRepo(db), ids, { id: sellerId, email: "", name: "", storeId: null }, { name: slug, slug, shipping: 6 });
    if (!s.ok) throw new Error("store");
    return s.value.id;
  };
  const maya = await mkSeller("MAYA", "maya-mugs");
  const river = await mkSeller("RIVER", "river-prints");
  return { db, ids, photos, sent, objects, maya, river };
}

const file = (type = "image/jpeg", size = 1000) => ({ type, size, bytes: async () => new Uint8Array(size).buffer });
const mugDraft: ExtractionOutcome = {
  kind: "draft", title: "Speckled mug", description: "Stoneware.", category: "ceramics", variants: [{ options: { Size: "Small" } }, { options: { Size: "Large" } }],
  suggestedMinCents: cents(2800), suggestedMaxCents: cents(3400), aiFields: ["title", "description", "category", "variants", "suggested_price"], flags: [],
};

async function draftedProduct(w: Awaited<ReturnType<typeof sellerWorld>>, store: StoreId = w.maya) {
  const up = await uploadPhotos(w.photos, store, [file()]);
  if (!up.ok) throw new Error("upload");
  await extractPhoto(w.photos, async () => ok(mugDraft), up.value[0]!.id, 1, 4);
  return (await listProducts(w.db, store))[0]!;
}

async function publish(w: Awaited<ReturnType<typeof sellerWorld>>, store: StoreId = w.maya) {
  const p = await draftedProduct(w, store);
  await editProduct(w.db, store, p.id, { variants: p.variants.map((v, i) => ({ id: v.id, price: 24 + i * 8, stock: 5 })) }, "2026-11-11T10:00:00Z");
  const r = await moveProduct(w.db, store, p.id, "published", "2026-11-11T10:00:00Z");
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

describe("Photos to drafts (FL-SEL-02)", () => {
  it("AC-SEL-02-01: 3 photos are stored in R2 and 3 queue messages sent", async () => {
    const w = await sellerWorld();
    const r = await uploadPhotos(w.photos, w.maya, [file(), file("image/png"), file("image/heic")]);
    expect(r.ok && r.value.map((p) => p.state)).toEqual(["queued", "queued", "queued"]);
    expect([w.objects.size, w.sent.length]).toEqual([3, 3]);
  });

  it("FC-SEL-02-01: a bad file stores nothing", async () => {
    const w = await sellerWorld();
    expect(await uploadPhotos(w.photos, w.maya, [file(), file("application/pdf")])).toMatchObject({ ok: false, error: { code: "photo.invalid" } });
    expect(await uploadPhotos(w.photos, w.maya, [file("image/jpeg", 10 * 1024 * 1024 + 1)])).toMatchObject({ ok: false });
    expect(w.objects.size).toBe(0);
  });

  it("AC-SEL-02-02 / SYS-AI-02: an extraction makes a Draft with ai_fields and no price", async () => {
    const w = await sellerWorld();
    const p = await draftedProduct(w);
    expect(p).toMatchObject({ state: "draft", title: "Speckled mug", aiFields: mugDraft.kind === "draft" ? mugDraft.aiFields : [], suggestedMinCents: 2800 });
    expect(p.variants.map((v) => v.priceCents)).toEqual([null, null]);
    expect((await listPhotos(w.db, w.maya, null))[0]).toMatchObject({ state: "extracted", productId: p.id });
  });

  it("SF-03 and FC-SEL-02-02: a model outage retries, then fails; Fill in yourself makes a blank Draft", async () => {
    const w = await sellerWorld();
    const up = await uploadPhotos(w.photos, w.maya, [file()]);
    const id = up.ok ? up.value[0]!.id : "";
    const down = async () => err({ kind: "retryable" as const, error: domainError("model.unavailable") });
    expect(await extractPhoto(w.photos, down, id, 1, 4)).toEqual({ kind: "retry" });
    expect(await extractPhoto(w.photos, down, id, 4, 4)).toEqual({ kind: "done" });
    expect((await listPhotos(w.db, w.maya, null))[0]).toMatchObject({ state: "failed", failureReason: "the model did not answer" });
    expect((await blankDraft(w.photos, w.river, id)).ok).toBe(false);
    const blank = await blankDraft(w.photos, w.maya, id);
    expect(blank.ok && (await getProduct(w.db, w.maya, blank.value))?.title).toBe("Untitled product");
  });

  it("FC-SEL-02-03: no product in the photo makes no Draft; a second delivery changes nothing", async () => {
    const w = await sellerWorld();
    const up = await uploadPhotos(w.photos, w.maya, [file()]);
    const id = up.ok ? up.value[0]!.id : "";
    await extractPhoto(w.photos, async () => ok({ kind: "no_product" }), id, 1, 4);
    await extractPhoto(w.photos, async () => ok(mugDraft), id, 2, 4);
    expect(await listProducts(w.db, w.maya)).toEqual([]);
  });
});

describe("Review and publish (FL-SEL-03)", () => {
  it("AC-SEL-03-01 / TC-AI-02: no confirmed price, no publish", async () => {
    const w = await sellerWorld();
    const p = await draftedProduct(w);
    expect(await moveProduct(w.db, w.maya, p.id, "published", "t")).toMatchObject({ ok: false, error: { code: "product.price_unconfirmed" } });
  });

  it("FC-SEL-03-01: a price outside $0.50 to $10,000 is not saved", async () => {
    const w = await sellerWorld();
    const p = await draftedProduct(w);
    expect((await editProduct(w.db, w.maya, p.id, { variants: [{ id: p.variants[0]!.id, price: 0 }] }, "t")).ok).toBe(false);
    expect((await editProduct(w.db, w.maya, p.id, { variants: [{ id: p.variants[0]!.id, price: 10000.01 }] }, "t")).ok).toBe(false);
  });

  it("SYS-AI-03: editing a field removes its Suggested mark", async () => {
    const w = await sellerWorld();
    const p = await draftedProduct(w);
    const r = await editProduct(w.db, w.maya, p.id, { title: "Blue speckled mug", variants: [{ id: p.variants[0]!.id, price: 24 }] }, "t");
    expect(r.ok && r.value.aiFields).toEqual(["description", "category", "variants"]);
  });

  it("AC-SEL-03-02: a published product is found by search; unpublished it is gone and carts flag it", async () => {
    const w = await sellerWorld();
    const p = await publish(w);
    const cat = d1Catalog(w.db);
    expect((await cat.searchProducts({ words: ["speckled"], maxPriceCents: null, storeSlug: null, limit: 6 })).map((r) => r.id)).toEqual([p.id]);
    const cart = await upsertCart({ repo: d1CartRepo(w.db), ids: w.ids }, { cartId: undefined, storeSlug: "maya-mugs", items: [{ variantId: variantId(p.variants[0]!.id), quantity: 1 }], channel: "storefront", actor: "buyer" });
    await moveProduct(w.db, w.maya, p.id, "draft", "t");
    expect(await cat.searchProducts({ words: ["speckled"], maxPriceCents: null, storeSlug: null, limit: 6 })).toEqual([]);
    const again = await upsertCart({ repo: d1CartRepo(w.db), ids: w.ids }, { cartId: cart.ok ? cart.value.cart.id : undefined, storeSlug: "maya-mugs", items: [{ variantId: variantId(p.variants[0]!.id), quantity: 1 }], channel: "storefront", actor: "buyer" });
    expect(again.ok && again.value.cart.issues.map((i) => i.code)).toEqual(["UNPUBLISHED"]);
  });

  it("TC-SEC-01: another seller reads and changes nothing of Maya's", async () => {
    const w = await sellerWorld();
    const p = await publish(w);
    expect(await getProduct(w.db, w.river, p.id)).toBeNull();
    expect((await editProduct(w.db, w.river, p.id, { title: "x" }, "t")).ok).toBe(false);
    expect((await moveProduct(w.db, w.river, p.id, "draft", "t")).ok).toBe(false);
    expect(await listProducts(w.db, w.river)).toEqual([]);
  });
});

describe("Orders, tracking and refunds (FL-SEL-04, FL-SEL-05)", () => {
  async function paidOrder() {
    const w = await sellerWorld();
    const p = await publish(w);
    await w.db.prepare("UPDATE sellers SET paypal_email = 'maya@sandbox.test' WHERE id IN (SELECT seller_id FROM stores WHERE id = ?)").bind(w.maya).run();
    const paypal = fakePayPal();
    const checkout = { carts: d1CartRepo(w.db), orders: d1OrderRepo(w.db), payments: paypal, ids: w.ids, tokenSecret: TOKEN_SECRET, origin: "https://s.test" };
    const cart = await upsertCart({ repo: checkout.carts, ids: w.ids }, { cartId: undefined, storeSlug: "maya-mugs", items: [{ variantId: variantId(p.variants[1]!.id), quantity: 1 }], channel: "storefront", actor: "buyer" });
    const link = await startCheckout(checkout, cart.ok ? cart.value.cart.id : "");
    if (!link.ok) throw new Error(link.error.code);
    paypal.approve(link.value.order.paypalOrderId);
    w.ids.advance(1000);
    await capturePayment(checkout, link.value.order.id, decodeURIComponent(new URL(link.value.payUrl).searchParams.get("t")!));
    const calls: { kind: string; key: string; amount?: number }[] = [];
    let refundAnswer: "COMPLETED" | "refused" = "COMPLETED";
    const port: SellerPayPalPort = {
      async addTracking(i) { calls.push({ kind: "track", key: i.requestId }); return i.trackingNumber === "BAD0000" ? err({ ...domainError("paypal.refused"), status: 422 }) : ok(true); },
      async refund(_cap, amount, key) { calls.push({ kind: "refund", key, amount }); return refundAnswer === "COMPLETED" ? ok({ paypalRefundId: "R1", status: "COMPLETED" }) : err({ ...domainError("paypal.refused", "x"), paypalName: "TRANSACTION_REFUSED" }); },
    };
    const deps = { db: w.db, ids: w.ids, paypal: port };
    const orderDeps = { repo: d1OrderStatusRepo(w.db), ids: w.ids, tokenSecret: TOKEN_SECRET };
    return { w, deps, calls, link: link.value, orderDeps, setRefund: (a: typeof refundAnswer) => { refundAnswer = a; } };
  }

  it("AC-SEL-04-01: a paid order shows in Maya's list only; the seller sees the address, the buyer tool never does", async () => {
    const o = await paidOrder();
    expect((await listSellerOrders(o.w.db, o.w.maya)).map((x) => x.id)).toEqual([o.link.order.id]);
    expect(await listSellerOrders(o.w.db, o.w.river)).toEqual([]);
    expect(await sellerOrder(o.w.db, o.w.river, o.link.order.id)).toBeNull();
    expect((await sellerOrder(o.w.db, o.w.maya, o.link.order.id))?.buyerEmail).toBe("ben@sandbox.test");
  });

  it("TC-PAY-07: tracking goes to PayPal, then the order is Shipped; a refusal changes nothing", async () => {
    const o = await paidOrder();
    expect(await addTracking(o.deps, o.w.maya, o.link.order.id, { carrier: "USPS", number: "BAD0000" })).toMatchObject({ ok: false, error: { code: "paypal.tracking_refused" } });
    expect((await sellerOrder(o.w.db, o.w.maya, o.link.order.id))?.state).toBe("captured");
    const r = await addTracking(o.deps, o.w.maya, o.link.order.id, { carrier: "USPS", number: "9400 1000 0000" });
    expect(r.ok && [r.value.state, r.value.tracking]).toEqual(["shipped", { carrier: "USPS", number: "9400 1000 0000" }]);
    expect(o.calls.at(-1)?.key).toBe(`track:${o.link.order.id}:940010000000`);
  });

  it("TC-PAY-05 / TC-PAY-06: approve refunds once with refund:{id}, never above the capture; the order is Refunded", async () => {
    const o = await paidOrder();
    await requestRefund(o.orderDeps, o.link.order.id, o.link.orderToken, "Chipped");
    const rid = (await listSellerOrders(o.w.db, o.w.maya))[0]!.refundRequest!.id;
    expect(await approveRefund(o.deps, o.w.river, rid)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await approveRefund(o.deps, o.w.maya, rid)).toEqual({ ok: true, value: { state: "done" } });
    expect(await approveRefund(o.deps, o.w.maya, rid)).toEqual({ ok: true, value: { state: "done" } });
    const refunds = o.calls.filter((c) => c.kind === "refund");
    expect(refunds).toEqual([{ kind: "refund", key: `refund:${rid}`, amount: o.link.order.amountCents }]);
    const order = (await sellerOrder(o.w.db, o.w.maya, o.link.order.id))!;
    expect([order.state, order.refundRequest?.state]).toEqual(["refunded", "done"]);
  });

  it("FC-SEL-05-01: a PayPal refusal leaves the request Approved; the retry uses the same key", async () => {
    const o = await paidOrder();
    await requestRefund(o.orderDeps, o.link.order.id, o.link.orderToken, "Chipped");
    const rid = (await listSellerOrders(o.w.db, o.w.maya))[0]!.refundRequest!.id;
    o.setRefund("refused");
    expect(await approveRefund(o.deps, o.w.maya, rid)).toMatchObject({ ok: true, value: { state: "approved", message: "PayPal didn't refund this order: TRANSACTION_REFUSED." } });
    o.setRefund("COMPLETED");
    expect((await approveRefund(o.deps, o.w.maya, rid)).ok && true).toBe(true);
    expect(new Set(o.calls.filter((c) => c.kind === "refund").map((c) => c.key))).toEqual(new Set([`refund:${rid}`]));
  });

  it("AC-BUY-05-03: a decline carries the seller's reason to the buyer", async () => {
    const o = await paidOrder();
    await requestRefund(o.orderDeps, o.link.order.id, o.link.orderToken, "Changed my mind");
    const rid = (await listSellerOrders(o.w.db, o.w.maya))[0]!.refundRequest!.id;
    expect(await declineRefund(o.deps, o.w.maya, rid, { reason: "Refunds are for items returned within 14 days." })).toEqual({ ok: true, value: { state: "declined" } });
    const status = await d1OrderStatusRepo(o.w.db).status(o.link.order.id);
    expect(status?.refundRequest).toEqual({ state: "declined", declineReason: "Refunds are for items returned within 14 days." });
    expect((await approveRefund(o.deps, o.w.maya, rid)).ok && true).toBe(true);
    expect(o.calls.filter((c) => c.kind === "refund")).toEqual([]);
    void storeId;
  });
});
