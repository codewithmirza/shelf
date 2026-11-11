"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, usd } from "../api";
import { Button, Field } from "../ui";
import styles from "../seller.module.css";

// A9 and A12: Approve opens a confirm step ("Refund $32.00 to the buyer?"), so a refund takes two taps (AC-SEL-05-04).
export function RefundActions({ requestId, amountCents, onDone }: { requestId: string; amountCents: number; onDone: () => void }) {
  const [step, setStep] = useState<"idle" | "confirm" | "decline">("idle");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    const r = await api<{ state: string; message?: string }>(`/refunds/${requestId}/approve`, { method: "POST" });
    setBusy(false);
    if (!r.ok) { setMessage(r.message); return; }
    if (r.data.state === "done") { toast(`Refunded ${usd(amountCents)}.`); onDone(); return; }
    setMessage(r.data.message ?? null);
    if (r.data.state !== "approved") onDone();
  }

  async function decline() {
    setBusy(true);
    const r = await api<{ state: string }>(`/refunds/${requestId}/decline`, { body: { reason } });
    setBusy(false);
    if (!r.ok) { setMessage(r.message); return; }
    toast("Declined. The buyer sees your reason.");
    onDone();
  }

  return (
    <div className={styles.refundActions}>
      {message && <p className={styles.errorSmall} role="alert">{message}</p>}
      {step === "idle" && (
        <div className={styles.actions}>
          <Button onClick={() => setStep("confirm")}>Approve refund</Button>
          <Button kind="secondary" onClick={() => setStep("decline")}>Decline</Button>
        </div>
      )}
      {step === "confirm" && (
        <>
          <p className={styles.strong}>Refund {usd(amountCents)} to the buyer?</p>
          <div className={styles.actions}>
            <Button busy={busy} onClick={approve}>Refund {usd(amountCents)}</Button>
            <Button kind="quiet" disabled={busy} onClick={() => setStep("idle")}>Cancel</Button>
          </div>
        </>
      )}
      {step === "decline" && (
        <form onSubmit={(e) => { e.preventDefault(); if (reason.trim()) void decline(); }}>
          <Field id={`why-${requestId}`} label="Why? The buyer sees this.">
            <input id={`why-${requestId}`} className={styles.input} maxLength={300} value={reason} autoFocus onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className={styles.actions}>
            <Button type="submit" kind="danger" busy={busy} disabled={!reason.trim()}>Decline refund</Button>
            <Button kind="quiet" disabled={busy} onClick={() => setStep("idle")}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
