"use client";

import { useEffect, useReducer, useRef } from "react";
import styles from "./pay.module.css";

// The Pay page's own state machine (CQ-01). Every event names the state it may come from; anything else is ignored.
type State =
  | { readonly kind: "loading" }
  | { readonly kind: "ready" }
  | { readonly kind: "approving" }
  | { readonly kind: "capturing" }
  | { readonly kind: "paid" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly message: string };

type Event =
  | { readonly type: "sdk_ready" }
  | { readonly type: "start" }
  | { readonly type: "approved" }
  | { readonly type: "cancel" }
  | { readonly type: "captured" }
  | { readonly type: "fail"; readonly message: string };

const FROM: Record<Event["type"], readonly State["kind"][]> = {
  sdk_ready: ["loading"],
  start: ["ready", "cancelled", "failed"],
  approved: ["approving"],
  cancel: ["approving"],
  captured: ["capturing"],
  fail: ["loading", "approving", "capturing"],
};

export function next(state: State, event: Event): State {
  if (!FROM[event.type].includes(state.kind)) return state;
  switch (event.type) {
    case "sdk_ready": return { kind: "ready" };
    case "start": return { kind: "approving" };
    case "approved": return { kind: "capturing" };
    case "cancel": return { kind: "cancelled" };
    case "captured": return { kind: "paid" };
    case "fail": return { kind: "failed", message: event.message };
  }
}

interface PayPalSdk {
  createInstance(o: { clientId: string; components: string[]; pageType?: string }): Promise<{
    createPayPalOneTimePaymentSession(o: {
      onApprove: (data: { orderId: string }) => Promise<void>;
      onCancel: () => void;
      onError: (e: unknown) => void;
    }): { start(o: { presentationMode: "auto" }, order: Promise<{ orderId: string }>): Promise<void> };
  }>;
}

declare global {
  interface Window { paypal?: PayPalSdk }
}

const NOT_FINISHED = "PayPal didn't finish. Your cart is saved.";

interface Props {
  orderId: string;
  token: string;
  paypalOrderId: string;
  clientId: string;
  sdkUrl: string;
  amount: string;
  alreadyPaid: boolean;
}

export function PayButton(p: Props) {
  const [state, dispatch] = useReducer(next, p.alreadyPaid ? { kind: "paid" } : { kind: "loading" });
  const session = useRef<ReturnType<Awaited<ReturnType<PayPalSdk["createInstance"]>>["createPayPalOneTimePaymentSession"]> | null>(null);

  useEffect(() => {
    if (p.alreadyPaid) return;
    let gone = false;
    const capture = async () => {
      const res = await fetch(`/api/pay/${encodeURIComponent(p.orderId)}/capture?t=${encodeURIComponent(p.token)}`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { state?: string; error?: { message: string } } | null;
      if (res.ok && body?.state === "captured") dispatch({ type: "captured" });
      else dispatch({ type: "fail", message: body?.error?.message ?? NOT_FINISHED });
    };
    const script = document.createElement("script");
    script.src = p.sdkUrl;
    script.async = true;
    script.onload = async () => {
      try {
        const sdk = await window.paypal!.createInstance({ clientId: p.clientId, components: ["paypal-payments"], pageType: "checkout" });
        session.current = sdk.createPayPalOneTimePaymentSession({
          onApprove: async () => { dispatch({ type: "approved" }); await capture(); },
          onCancel: () => dispatch({ type: "cancel" }),
          onError: () => dispatch({ type: "fail", message: NOT_FINISHED }),
        });
        if (!gone) dispatch({ type: "sdk_ready" });
      } catch {
        dispatch({ type: "fail", message: "PayPal isn't answering. Your cart is saved. Try again." });
      }
    };
    script.onerror = () => dispatch({ type: "fail", message: "PayPal isn't answering. Your cart is saved. Try again." });
    document.head.appendChild(script);
    return () => { gone = true; script.remove(); };
  }, [p.alreadyPaid, p.clientId, p.orderId, p.sdkUrl, p.token]);

  async function pay() {
    if (!session.current) return;
    dispatch({ type: "start" });
    try {
      await session.current.start({ presentationMode: "auto" }, Promise.resolve({ orderId: p.paypalOrderId }));
    } catch {
      dispatch({ type: "fail", message: NOT_FINISHED });
    }
  }

  if (state.kind === "paid") {
    return (
      <section className={styles.paid} aria-live="polite">
        <svg className={styles.check} width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
          <path d="M6 14.5l5.5 5.5L22 8.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className={styles.paidWord}>Paid</p>
        <p className={styles.paidAmount}>{p.amount}</p>
        <p className={styles.muted}>You can go back to your chat.</p>
      </section>
    );
  }

  const busy = state.kind === "loading" || state.kind === "approving" || state.kind === "capturing";
  const label = state.kind === "loading" ? "Loading PayPal…" : state.kind === "approving" ? "Finish in PayPal…" : state.kind === "capturing" ? "Paying…" : "Pay with PayPal";

  return (
    <section className={styles.actions}>
      {(state.kind === "failed" || state.kind === "cancelled") && (
        <p className={styles.notice} role="alert">{state.kind === "failed" ? state.message : NOT_FINISHED}</p>
      )}
      <button type="button" className={styles.payButton} onClick={pay} disabled={busy} aria-busy={busy}>
        {label}
      </button>
      <p className={styles.muted}>You approve in PayPal. Shelf never sees your card.</p>
    </section>
  );
}
