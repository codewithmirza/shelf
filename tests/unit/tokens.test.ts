import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "@/server/auth/tokens";

const SECRET = "test-secret-test-secret-test-secret-1234";
const now = new Date("2026-11-11T10:00:00Z");
const later = (min: number) => new Date(now.getTime() + min * 60_000);

describe("Signed tokens (TC-SEC-02, NFR-SEC-02)", () => {
  it("a fresh pay token opens its own order", async () => {
    const { token, expiresAt } = await signToken(SECRET, "pay", "ord_1", now);
    expect(await verifyToken(SECRET, token, "pay", "ord_1", later(29))).toEqual({ ok: true, expiresAt });
    expect(expiresAt.toISOString()).toBe("2026-11-11T10:30:00.000Z");
  });

  it("TC-SEC-02: a pay token is refused after 30 minutes", async () => {
    const { token } = await signToken(SECRET, "pay", "ord_1", now);
    expect(await verifyToken(SECRET, token, "pay", "ord_1", later(30))).toEqual({ ok: false, reason: "expired" });
  });

  it("TC-SEC-02: a tampered payload is refused", async () => {
    const { token } = await signToken(SECRET, "pay", "ord_1", now);
    const [v, body, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ k: "pay", o: "ord_2", e: 9_999_999_999 })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    expect((await verifyToken(SECRET, `${v}.${forged}.${sig}`, "pay", "ord_2", now)).ok).toBe(false);
    expect((await verifyToken(SECRET, `${v}.${body}.${sig!.slice(0, -2)}AA`, "pay", "ord_1", now)).ok).toBe(false);
  });

  it("TC-SEC-02: a token for one order does not open another", async () => {
    const { token } = await signToken(SECRET, "pay", "ord_1", now);
    expect(await verifyToken(SECRET, token, "pay", "ord_2", now)).toEqual({ ok: false, reason: "wrong_order" });
  });

  it("THR-06: an order token is not a pay token, and the other way round", async () => {
    const order = await signToken(SECRET, "order", "ord_1", now);
    const pay = await signToken(SECRET, "pay", "ord_1", now);
    expect(await verifyToken(SECRET, order.token, "pay", "ord_1", now)).toEqual({ ok: false, reason: "wrong_kind" });
    expect(await verifyToken(SECRET, pay.token, "order", "ord_1", now)).toEqual({ ok: false, reason: "wrong_kind" });
  });

  it("a token signed with another secret is refused", async () => {
    const { token } = await signToken("another-secret-another-secret-123456", "pay", "ord_1", now);
    expect(await verifyToken(SECRET, token, "pay", "ord_1", now)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("garbage is refused, not thrown", async () => {
    for (const t of ["", "v1", "v1.a.b", "v2.x.y", "v1.!!.??"]) expect((await verifyToken(SECRET, t, "pay", "ord_1", now)).ok).toBe(false);
  });

  it("a short secret is a setup error", async () => {
    await expect(signToken("short", "pay", "ord_1", now)).rejects.toThrow("TOKEN_SECRET");
  });
});
