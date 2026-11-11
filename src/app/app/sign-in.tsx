import styles from "./seller.module.css";

const OUTCOME: Record<string, string> = {
  cancelled: "You didn't finish logging in with PayPal.",
  failed: "PayPal didn't confirm who you are. Try again.",
};

// A1. One action: Log in with PayPal. The PayPal account becomes the store's payee (ADR-008).
export function SignIn({ outcome }: { outcome: string | null }) {
  return (
    <main className={styles.signin}>
      <p className={styles.wordmark}>
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="3" rx="1" fill="currentColor" /><rect x="5" y="10" width="6" height="9" rx="1" fill="currentColor" /><rect x="13" y="12" width="6" height="7" rx="1" fill="currentColor" /></svg>
        shelf
      </p>
      <h1 className={styles.signinTitle}>Sell where people now ask for things: inside Claude and ChatGPT.</h1>
      <p className={styles.body}>Send photos of what you make. You set every price. Buyers pay with PayPal, straight to your account.</p>
      {outcome && OUTCOME[outcome] && <p className={`${styles.notice} ${styles.notice_wait}`} role="alert">{OUTCOME[outcome]}</p>}
      <a href="/api/auth/paypal/start" className={`${styles.btn} ${styles.btn_primary} ${styles.btnLink}`}>Log in with PayPal</a>
      <p className={styles.help}>Shelf uses your PayPal account to sign you in and to receive your sales. We never see your password.</p>
    </main>
  );
}
