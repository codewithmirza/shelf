import { captureFromPayPalReturn } from "@/server/checkout";
import { ERROR_INFO } from "@/server/domain/errors";
import { shelfEnv } from "@/server/http";
import { checkoutDeps } from "@/server/runtime";
import styles from "../pay.module.css";

export const dynamic = "force-dynamic";

// PayPal's redirect fallback lands here with its own order id in `token` (ADR-005).
export default async function PayDone({ params, searchParams }: { params: Promise<{ order: string }>; searchParams: Promise<{ token?: string }> }) {
  const [{ order }, { token }] = await Promise.all([params, searchParams]);
  const r = await captureFromPayPalReturn(checkoutDeps(shelfEnv()), order, token ?? "");
  const text = r.ok
    ? r.value === "captured" || r.value === "shipped" || r.value === "refunded"
      ? "Paid. You can go back to your chat."
      : "PayPal is still confirming. Your chat will show Paid when it is done."
    : ERROR_INFO[r.error.code].message;
  return (
    <main className={styles.page}>
      <p className={r.ok ? styles.store : styles.notice} role="status">{text}</p>
    </main>
  );
}
