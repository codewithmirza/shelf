import { describe, expect, it } from "vitest";
import { exampleQuery } from "../../src/server/catalog";

describe("Try page examples come from real product titles", () => {
  it("keeps the part before a dash or a bracket, at most five words", () => {
    expect(exampleQuery("Fresh Handmade Motichoor Laddu Box - Traditional Indian Sweets")).toBe("Fresh Handmade Motichoor Laddu Box");
    expect(exampleQuery("Handcrafted Sesame Seed Ladoo (Til Laddu) Traditional Sweets")).toBe("Handcrafted Sesame Seed Ladoo");
    expect(exampleQuery("Mug")).toBe("Mug");
  });
});
