import { describe, expect, it } from "vitest";
import { cents } from "@/server/domain/brand";
import type { SellerProduct } from "@/server/seller/products";
import { toRows } from "@/app/desk/desk";

const product = (over: Partial<SellerProduct>): SellerProduct => ({
  id: "prd_1", title: "Motichoor Laddu Box", description: "", category: "sweets", state: "draft",
  aiFields: ["title", "suggested_price"], suggestedMinCents: cents(1200), suggestedMaxCents: cents(1800), coverPhotoId: null, updatedAt: "2026-11-12T00:00:00Z",
  variants: [
    { id: "var_a", options: { Size: "Box of 6" }, priceCents: null, stock: 5 },
    { id: "var_b", options: { Size: "Box of 12" }, priceCents: cents(2600), stock: 3 },
  ],
  ...over,
});

describe("Seller desk rows (ADR-013)", () => {
  it("TC-DESK-01: one row per option, unpriced options stay unpriced, and Gemini's range shows only while it is still a suggestion", () => {
    const rows = toRows([product({})]);
    expect(rows.map((r) => [r.variantId, r.first, r.option, r.price])).toEqual([["var_a", true, "Box of 6", null], ["var_b", false, "Box of 12", 26]]);
    expect(rows[0]!.suggested).toBe("$12.00 to $18.00");
    expect(toRows([product({ aiFields: ["title"] })])[0]!.suggested).toBeNull();
  });
});
