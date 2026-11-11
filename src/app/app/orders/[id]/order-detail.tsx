"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { SellerOrderDetail } from "@/server/refunds";
import { api } from "../../api";
import { Button, Field, Header, Icon, Notice, Price } from "../../ui";
import { RefundActions } from "../refund-actions";
import { OrderStatus } from "../status";
import styles from "../../seller.module.css";

const EVENT_TEXT: Record<string, string> = {
  "order.created": "Order created", "order.approved": "Approved in PayPal", "order.captured": "Payment captured", "order.shipped": "Tracking added",
  "order.refunded": "Refunded", "order.cancelled": "Payment not finished", "refund.requested": "Refund requested", "refund.approved": "You approved the refund",
  "refund.declined": "You declined the refund", "refund.done": "Refund sent", "refund.failed": "Refund failed",
};
const ACTOR: Record<string, string> = { agent: "Agent", buyer: "Buyer", seller: "You", paypal: "PayPal", system: "Shelf" };
const time = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

// A10 and A11: one order with lines, ship-to, timeline, and the tracking sheet.
export function OrderDetail({ id }: { id: string }) {
  const [o, setO] = useState<SellerOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const load = useCallback(() => api<{ order: SellerOrderDetail }>(`/orders/${id}`).then((r) => (r.ok ? setO(r.data.order) : setError(r.message))), [id]);
  useEffect(() => { void load(); }, [load]);
  if (!o) return <main className={styles.page}><Header title="Order" back="/app/orders" />{error ? <Notice>{error}</Notice> : <p className={styles.help}>Loading…</p>}</main>;

  const rr = o.refundRequest;
  return (
    <main className={styles.page}>
      <Header title={o.id.slice(0, 12)} back="/app/orders" />
      <div className={styles.orderHead}><OrderStatus o={o} /><Price cents={o.amountCents} large /></div>
      <div className={styles.card}>
        {o.lines.map((l, i) => (
          <div key={i} className={styles.sumRow}><span>{l.title}{Object.values(l.options).length ? ` · ${Object.values(l.options).join(", ")}` : ""} × {l.quantity}</span><Price cents={l.lineTotalCents} /></div>
        ))}
        <div className={styles.sumRow}><span className={styles.muted}>Shipping</span><Price cents={o.shippingCents} /></div>
      </div>
      <section className={styles.section}>
        <h2 className={styles.label}>Ship to</h2>
        <p className={styles.body}>{o.shipTo ?? "PayPal did not share an address."}</p>
        {o.buyerEmail && <p className={styles.meta}>{o.buyerEmail}</p>}
      </section>
      {o.tracking && <p className={styles.tracking}><Icon name="truck" /> <span className={styles.mono}>{o.tracking.carrier} · {o.tracking.number}</span></p>}
      {rr && (rr.state === "pending" || rr.state === "approved") && (
        <div className={styles.card}>
          <p className={styles.quote}>“{rr.reason}”</p>
          <RefundActions requestId={rr.id} amountCents={rr.amountCents} onDone={load} />
        </div>
      )}
      <section className={styles.section}>
        <h2 className={styles.label}>Timeline</h2>
        <ol className={styles.timeline}>
          {o.events.map((e, i) => (
            <li key={i}><time className={styles.metaMono}>{time(e.at)}</time><span className={styles.strongSmall}>{ACTOR[e.actor] ?? e.actor}</span><span>{EVENT_TEXT[e.type] ?? e.type}</span></li>
          ))}
        </ol>
      </section>
      {o.state === "captured" && <div><Button onClick={() => setSheet(true)}>Add tracking</Button></div>}
      {sheet && <TrackingSheet id={o.id} onClose={() => setSheet(false)} onSaved={(n) => { setO(n); setSheet(false); toast("Tracking sent to PayPal. The buyer can see it."); }} />}
    </main>
  );
}

// A11: bottom sheet on mobile, enters with translateY over 300 ms (--ease-drawer).
function TrackingSheet({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: (o: SellerOrderDetail) => void }) {
  const [carrier, setCarrier] = useState("USPS");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  async function save() {
    setBusy(true);
    setError(null);
    const r = await api<{ order: SellerOrderDetail }>(`/orders/${id}/tracking`, { body: { carrier, number } });
    setBusy(false);
    if (r.ok) onSaved(r.data.order);
    else setError(r.message);
  }
  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
        <span className={styles.grabber} aria-hidden="true" />
        <h2 id="sheet-title" className={styles.h2}>Add tracking</h2>
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field id="carrier" label="Carrier"><input id="carrier" className={styles.input} value={carrier} maxLength={40} onChange={(e) => setCarrier(e.target.value)} /></Field>
          <Field id="number" label="Tracking number" help="We send this to PayPal and show it to the buyer." error={error}>
            <input id="number" className={`${styles.input} ${styles.mono}`} value={number} maxLength={60} autoFocus onChange={(e) => setNumber(e.target.value)} />
          </Field>
          <div className={styles.actions}><Button type="submit" busy={busy} disabled={number.trim().length < 4 || carrier.trim().length < 2}>Save tracking</Button><Button kind="quiet" onClick={onClose}>Cancel</Button></div>
        </form>
      </div>
    </div>
  );
}
