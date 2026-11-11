import type { Metadata } from "next";
import { searchExamples } from "@/server/catalog";
import { shelfEnv } from "@/server/http";
import { CopyButton } from "./copy-button";
import { TryChat } from "./try-chat";
import styles from "./try.module.css";

export const metadata: Metadata = { title: "Try Shelf · Shop and pay inside a chat", description: "Search real independent stores and pay with the PayPal sandbox, inside a chat." };
export const dynamic = "force-dynamic";

// The judge path (FL-JDG-01): no account, no install. Sandbox buyer details are shown, because they are test-only.
export default async function TryPage() {
  const env = shelfEnv();
  const examples = await searchExamples(env.DB).catch(() => []);
  const email = env.TRY_BUYER_EMAIL ?? "";
  const password = env.TRY_BUYER_PASSWORD ?? "";
  return (
    <main className={styles.page}>
      <div className={styles.bar} role="note">
        <span>Sandbox. No real money moves.</span>
        {email && (
          <span className={styles.creds}>
            Buyer <code>{email}</code> <CopyButton text={email} label="Copy buyer email" /> · <code>{password}</code> <CopyButton text={password} label="Copy buyer password" />
          </span>
        )}
      </div>
      <header className={styles.head}>
        <a href="/" className={styles.brand}>Shelf</a>
        <h1 className={styles.h1}>Try it</h1>
      </header>
      <TryChat examples={examples} />
    </main>
  );
}
