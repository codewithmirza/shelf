import { Mark } from "@/components/mark";
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
        <Mark size={30} />
        shelf
      </p>
      <h1 className={styles.signinTitle}>Sell where people now ask for things: inside AI assistants.</h1>
      <p className={styles.body}>Send photos of what you make. You set every price. Buyers pay with PayPal, straight to your account.</p>
      {outcome && OUTCOME[outcome] && <p className={`${styles.notice} ${styles.notice_wait}`} role="alert">{OUTCOME[outcome]}</p>}
      <a href="/api/auth/paypal/start" className={`${styles.btn} ${styles.btn_primary} ${styles.btnLink}`}>Log in with PayPal</a>
      <p className={styles.help}>Shelf uses your PayPal account to sign you in and to receive your sales. We never see your password.</p>
    </main>
  );
}
