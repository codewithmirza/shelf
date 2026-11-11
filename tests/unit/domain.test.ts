import { describe, expect, it } from "vitest";
import { cents, parseCartId, storeId, variantId, type VariantId } from "@/server/domain/brand";
import { newCartId, ulid, type IdSource } from "@/server/domain/ids";
import { requestKeys } from "@/server/domain/keys";
import type { Actor, Machine } from "@/server/domain/machine";
import { cartMachine, orderMachine, productMachine, refundMachine } from "@/server/domain/machines";
import { formatUsd, parseMoneyValue, toMoney } from "@/server/domain/money";
import { parseCartInput, priceCart, type VariantForPricing } from "@/server/domain/cart";
import { canRequestRefund, checkRefundAmount } from "@/server/domain/refund";
import { checkPrice, checkPublish } from "@/server/domain/product";

const ACTORS: readonly Actor[] = ["seller", "buyer", "agent", "paypal", "system"];

// A fixed source: the same bytes and the same clock on every run (CQ-26).
const fixedSource = (seed = 7, at = "2026-11-11T00:00:00Z"): IdSource => ({
  randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => (seed * 31 + i * 17) % 256),
  now: () => new Date(at),
});

describe("state machines (CQ-34: every move, allowed and refused)", () => {
  // Widened to Machine<string> so one loop covers all four tables.
  const machines = [productMachine, cartMachine, orderMachine, refundMachine] as readonly Machine<string>[];
  for (const machine of machines) {
    it(`${machine.name} allows exactly the moves in its table`, () => {
      for (const from of machine.states) for (const to of machine.states) for (const actor of ACTORS) {
        const inTable = machine.transitions.some((t) => t.to === to && t.from.includes(from) && t.by.includes(actor));
        expect(machine.canMove(from, to, actor), `${machine.name} ${from}->${to} by ${actor}`).toBe(inTable);
      }
    });
  }

  it("T-ORD-03 records its transition ID", () => {
    const r = orderMachine.move("approved", "captured", "paypal");
    expect(r).toEqual({ ok: true, to: "captured", transitionId: "T-ORD-03" });
  });

  it("an order cannot go from created to refunded", () => {
    expect(orderMachine.move("created", "refunded", "system").ok).toBe(false);
  });

  it("TC-SEC-03 (domain part): only the seller approves or declines a refund request (INV-05)", () => {
    for (const actor of ACTORS) {
      expect(refundMachine.canMove("pending", "approved", actor)).toBe(actor === "seller");
      expect(refundMachine.canMove("pending", "declined", actor)).toBe(actor === "seller");
    }
  });
});

const STORE_A = storeId("sto_a");
const STORE_B = storeId("sto_b");
const v = (id: string, over: Partial<VariantForPricing> = {}): VariantForPricing => ({
  id: variantId(id), storeId: STORE_A, productTitle: "Blue speckled mug", options: { Size: "Large" },
  priceCents: cents(3200), stock: 5, published: true, ...over,
});
const catalog = (...list: VariantForPricing[]) => new Map<VariantId, VariantForPricing>(list.map((x) => [x.id, x]));
const store = { id: STORE_A, shippingCents: cents(600) };

describe("cart pricing", () => {
  it("TC-PAY-02 ignores client prices and totals: the server uses stored prices (INV-01)", () => {
    const body = { items: [{ variant_id: "var_mug", quantity: 1, price: 1, unit_price: "0.01" }], total: "0.01" };
    const parsed = parseCartInput(body);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const cart = priceCart(parsed.value, store, catalog(v("var_mug")));
    expect(cart.subtotalCents).toBe(3200);
    expect(cart.totalCents).toBe(3800);
    expect(cart.state).toBe("ready");
  });

  it("TC-CART-04 a variant of another store becomes an OTHER_STORE issue (INV-02)", () => {
    const parsed = parseCartInput({ items: [{ variant_id: "var_mug", quantity: 1 }, { variant_id: "var_print", quantity: 1 }] });
    if (!parsed.ok) throw new Error("parse failed");
    const cart = priceCart(parsed.value, store, catalog(v("var_mug"), v("var_print", { storeId: STORE_B })));
    expect(cart.issues.map((i) => i.code)).toEqual(["OTHER_STORE"]);
    expect(cart.lines).toHaveLength(1);
    expect(cart.state).toBe("incomplete");
  });

  it("sold-out, unpublished, unpriced and unknown variants become issues and leave the total", () => {
    const items = ["var_sold", "var_draft", "var_noprice", "var_ghost", "var_ok"].map((id) => ({ variantId: variantId(id), quantity: 1 }));
    const cart = priceCart(items, store, catalog(v("var_sold", { stock: 0 }), v("var_draft", { published: false }), v("var_noprice", { priceCents: null }), v("var_ok")));
    expect(cart.issues.map((i) => [i.variantId, i.code])).toEqual([
      ["var_sold", "OUT_OF_STOCK"], ["var_draft", "UNPUBLISHED"], ["var_noprice", "UNPUBLISHED"], ["var_ghost", "NOT_FOUND"],
    ]);
    expect(cart.totalCents).toBe(3200 + 600);
  });

  it("merges the same variant sent twice and checks stock on the sum", () => {
    const items = [{ variantId: variantId("var_mug"), quantity: 3 }, { variantId: variantId("var_mug"), quantity: 3 }];
    const cart = priceCart(items, store, catalog(v("var_mug", { stock: 5 })));
    expect(cart.issues.map((i) => i.code)).toEqual(["QUANTITY_LIMIT"]);
  });

  it("charges no shipping on an empty cart", () => {
    const cart = priceCart([], store, catalog());
    expect(cart.totalCents).toBe(0);
    expect(cart.state).toBe("incomplete");
  });

  it("refuses quantities outside 1 to 10 and more than 20 lines at the boundary (CQ-21)", () => {
    expect(parseCartInput({ items: [{ variant_id: "x", quantity: 0 }] }).ok).toBe(false);
    expect(parseCartInput({ items: [{ variant_id: "x", quantity: 11 }] }).ok).toBe(false);
    expect(parseCartInput({ items: [{ variant_id: "x", quantity: 1.5 }] }).ok).toBe(false);
    expect(parseCartInput({ items: Array.from({ length: 21 }, (_, i) => ({ variant_id: `x${i}`, quantity: 1 })) }).ok).toBe(false);
    expect(parseCartInput("not an object").ok).toBe(false);
  });
});

describe("refunds", () => {
  const captured = { state: "captured" as const, amountCents: cents(5600), refundedCents: cents(0) };

  it("TC-PAY-06 a refund never exceeds the captured amount minus earlier refunds (INV-07)", () => {
    expect(checkRefundAmount(captured, cents(5600)).ok).toBe(true);
    expect(checkRefundAmount(captured, cents(5601)).ok).toBe(false);
    expect(checkRefundAmount({ ...captured, refundedCents: cents(3200) }, cents(2401)).ok).toBe(false);
    expect(checkRefundAmount({ ...captured, refundedCents: cents(3200) }, cents(2400)).ok).toBe(true);
    expect(checkRefundAmount(captured, cents(0)).ok).toBe(false);
  });

  it("allows one pending request per order, only when captured or shipped (INV-06)", () => {
    expect(canRequestRefund(captured, []).ok).toBe(true);
    expect(canRequestRefund(captured, [{ state: "pending" }]).ok).toBe(false);
    expect(canRequestRefund(captured, [{ state: "declined" }]).ok).toBe(true);
    expect(canRequestRefund({ ...captured, state: "created" }, []).ok).toBe(false);
    expect(canRequestRefund({ ...captured, refundedCents: cents(5600) }, []).ok).toBe(false);
  });
});

describe("publishing", () => {
  it("TC-AI-02 (domain part): a product with an unconfirmed price cannot publish (INV-03)", () => {
    const r = checkPublish({ state: "draft", variants: [{ priceCents: cents(2400) }, { priceCents: null }] });
    expect(r).toEqual({ ok: false, error: { code: "product.price_unconfirmed" } });
    expect(checkPublish({ state: "draft", variants: [{ priceCents: cents(2400) }] }).ok).toBe(true);
    expect(checkPublish({ state: "draft", variants: [] }).ok).toBe(false);
  });

  it("FC-SEL-03-01 a price is between $0.50 and $10,000", () => {
    expect(checkPrice(49).ok).toBe(false);
    expect(checkPrice(50).ok).toBe(true);
    expect(checkPrice(1_000_000).ok).toBe(true);
    expect(checkPrice(1_000_001).ok).toBe(false);
  });
});

describe("money", () => {
  it("formats and parses PayPal amounts without floating point", () => {
    expect(toMoney(cents(3200))).toEqual({ currency_code: "USD", value: "32.00" });
    expect(toMoney(cents(5))).toEqual({ currency_code: "USD", value: "0.05" });
    expect(parseMoneyValue("56.00")).toBe(5600);
    expect(parseMoneyValue("0.10")).toBe(10);
    expect(parseMoneyValue("12")).toBe(1200);
    expect(parseMoneyValue("1.5")).toBeNull();
    expect(parseMoneyValue("-1.00")).toBeNull();
    expect(formatUsd(cents(5600))).toBe("$56.00");
  });

  it("refuses non-integer and negative cents", () => {
    expect(() => cents(1.5)).toThrow();
    expect(() => cents(-1)).toThrow();
  });
});

describe("IDs and idempotency keys", () => {
  it("makes cart IDs that match CART-[A-Z0-9]{12} (SYS-CART-04)", () => {
    const id = newCartId(fixedSource());
    expect(parseCartId(id)).toBe(id);
    expect(parseCartId("CART-abc")).toBeNull();
  });

  it("ULIDs sort by creation time", () => {
    const a = ulid(fixedSource(1, "2026-11-11T00:00:00Z"));
    const b = ulid(fixedSource(9, "2026-11-11T00:00:01Z"));
    expect(a < b).toBe(true);
    expect(a).toHaveLength(26);
  });

  it("builds the same PayPal-Request-Id for the same record, so a retry acts once (CQ-27)", () => {
    const cart = newCartId(fixedSource());
    expect(requestKeys.createOrder(cart, 3)).toBe(requestKeys.createOrder(cart, 3));
    expect(requestKeys.createOrder(cart, 3)).not.toBe(requestKeys.createOrder(cart, 4));
    expect(requestKeys.track("ord_1" as never, "9400 1000")).toBe("track:ord_1:94001000");
  });
});
