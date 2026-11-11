import { describe, expect, it } from "vitest";
import { next } from "@/app/pay/[order]/pay-button";

type S = Parameters<typeof next>[0];
const s = (kind: S["kind"]): S => (kind === "failed" ? { kind, message: "x" } : ({ kind } as S));

describe("Pay page state machine (CQ-01, CQ-34)", () => {
  it("the happy path: loading → ready → approving → capturing → paid", () => {
    let st: S = s("loading");
    for (const type of ["sdk_ready", "start", "approved", "captured"] as const) st = next(st, { type });
    expect(st.kind).toBe("paid");
  });

  it("a cancelled or failed payment can start again", () => {
    expect(next(next(s("approving"), { type: "cancel" }), { type: "start" }).kind).toBe("approving");
    expect(next(s("failed"), { type: "start" }).kind).toBe("approving");
  });

  it("events from the wrong state change nothing", () => {
    expect(next(s("loading"), { type: "start" }).kind).toBe("loading");
    expect(next(s("ready"), { type: "captured" }).kind).toBe("ready");
    expect(next(s("paid"), { type: "fail", message: "late" }).kind).toBe("paid");
    expect(next(s("capturing"), { type: "cancel" }).kind).toBe("capturing");
  });
});
