import type { Metadata } from "next";
import { payPage } from "@/server/checkout";
import { ERROR_INFO } from "@/server/domain/errors";
import { formatUsd } from "@/server/domain/money";
import { shelfEnv } from "@/server/http";
import { checkoutDeps } from "@/server/runtime";
import { PayButton } from "./pay-button";
import styles from "./pay.module.css";

export const metadata: Metadata = { title: "Pay with PayPal · Shelf", robots: { index: false } };
export const dynamic = "force-dynamic";

// The Pay page (P1 to P4, FL-BUY-03). One column, 480 px. The server reads the order; the browser only runs PayPal.
export default async function PayPage({ params, searchParams }: { params: Promise<{ order: string }>; searchParams: Promise<{ t?: string }> }) {
  const env = shelfEnv();
  const [{ order }, { t }] = await Promise.all([params, searchParams]);
  const r = await payPage(checkoutDeps(env), order, t ?? "");

  if (!r.ok) {
    return (
      <main className={styles.page}>
        <p className={styles.notice} role="alert">{ERROR_INFO[r.error.code].message}</p>
      </main>
    );
  }

  const { cart, store } = r.value;
  const paid = r.value.order.state === "captured" || r.value.order.state === "shipped";
  const sdkUrl = env.PAYPAL_BASE.includes("sandbox") ? "https://www.sandbox.paypal.com/web-sdk/v6/core" : "https://www.paypal.com/web-sdk/v6/core";

  return (
    <main className={styles.page}>
      <p className={styles.store}>{store.name}</p>
      <ul className={styles.lines}>
        {cart.lines.map((l) => (
          <li key={l.variantId} className={styles.line}>
            <span>
              {l.quantity} × {l.title}
              {Object.keys(l.options).length > 0 && <span className={styles.options}> · {Object.values(l.options).join(", ")}</span>}
            </span>
            <span className={styles.price}>{formatUsd(l.lineTotalCents)}</span>
          </li>
        ))}
        <li className={styles.line}>
          <span className={styles.options}>Shipping</span>
          <span className={styles.price}>{formatUsd(cart.shippingCents)}</span>
        </li>
      </ul>
      <div className={styles.total}>
        <span>Total</span>
        <span className={styles.totalPrice}>{formatUsd(r.value.order.amountCents)}</span>
      </div>
      {store.refundPolicy && <p className={styles.muted}>{store.refundPolicy}</p>}
      <PayButton
        orderId={r.value.order.id}
        token={t ?? ""}
        paypalOrderId={r.value.order.paypalOrderId}
        clientId={env.PAYPAL_CLIENT_ID}
        sdkUrl={sdkUrl}
        amount={formatUsd(r.value.order.amountCents)}
        alreadyPaid={paid}
      />
    </main>
  );
}
