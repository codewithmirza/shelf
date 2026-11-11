import styles from "../pay.module.css";

// PayPal's redirect fallback when the buyer cancels (FC-BUY-03-01).
export default function PayCancelled() {
  return (
    <main className={styles.page}>
      <p className={styles.notice} role="status">PayPal didn&apos;t finish. Your cart is saved. Go back to your chat and tap Pay again.</p>
    </main>
  );
}
