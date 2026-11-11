"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SellerOrderSummary } from "@/server/refunds";
import { api, when } from "../api";
import { BottomBar, Card, Empty, Header, Notice, Price } from "../ui";
import { RefundActions } from "./refund-actions";
import { OrderStatus } from "./status";
import styles from "../seller.module.css";

// A9: orders, newest first; a pending refund request pins to the top with its two buttons. Polls every 5 s.
export function OrdersScreen() {
  const [orders, setOrders] = useState<SellerOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<{ orders: SellerOrderSummary[] }>("/orders").then((r) => (r.ok ? setOrders(r.data.orders) : setError(r.message))), []);
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 5000);
    return () => clearInterval(t);
  }, [load]);

  const needs = orders?.filter((o) => o.refundRequest?.state === "pending" || o.refundRequest?.state === "approved") ?? [];
  const recent = orders?.filter((o) => !needs.includes(o)) ?? [];
  return (
    <>
      <main className={styles.page}>
        <Header title="Orders" />
        {error && <Notice>{error}</Notice>}
        {orders === null && !error && <p className={styles.help}>Loading…</p>}
        {orders?.length === 0 && <Empty icon="truck" text="No orders yet."><p className={styles.body}>Paid orders show here as soon as PayPal confirms them.</p></Empty>}
        {needs.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.h2}>Needs you</h2>
            {needs.map((o) => (
              <Card key={o.id}>
                <div className={styles.orderHead}><OrderStatus o={o} /><Price cents={o.refundRequest!.amountCents} /></div>
                <Link className={styles.strongLink} href={`/app/orders/${o.id}`}>{o.lineTitles.join(" · ")}</Link>
                <p className={styles.quote}>“{o.refundRequest!.reason}”</p>
                <RefundActions requestId={o.refundRequest!.id} amountCents={o.refundRequest!.amountCents} onDone={load} />
              </Card>
            ))}
          </section>
        )}
        {recent.length > 0 && (
          <section className={styles.section}>
            {needs.length > 0 && <h2 className={styles.h2}>Recent</h2>}
            {recent.map((o) => (
              <Card key={o.id} href={`/app/orders/${o.id}`}>
                <div className={styles.orderHead}><OrderStatus o={o} /><Price cents={o.amountCents} /></div>
                <p className={styles.strong}>{o.lineTitles.join(" · ")}</p>
                <p className={styles.metaMono}>{o.id.slice(0, 12)} · {when(o.createdAt)}</p>
              </Card>
            ))}
          </section>
        )}
      </main>
      <BottomBar />
    </>
  );
}
