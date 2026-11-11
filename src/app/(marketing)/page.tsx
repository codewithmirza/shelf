import Link from "next/link";
import { Mark } from "@/components/mark";
import { ThemeSwitch } from "@/components/theme";
import styles from "./landing.module.css";

const REPO = "https://github.com/codewithmirza/shelf";

// Landing page (L1, L2). One sentence as the headline, the two ways in, how a sale moves, where it works.
// No feature grid, no testimonials, no invented numbers (DESIGN-SYSTEM.md "Landing page").
export default function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link href="/" className={styles.brand} aria-label="Shelf home">
          <Mark size={28} />
          shelf
        </Link>
        <nav className={styles.nav}>
          <Link href="/try" className={styles.navOn}>Try it</Link>
          <a href={REPO}>GitHub</a>
          <Link href="/app">For sellers</Link>
          <ThemeSwitch className={styles.theme} />
        </nav>
      </header>
      <main className={styles.main}>
        <h1 className={styles.h1}>Shop and pay with PayPal inside AI assistants.</h1>
        <p className={styles.lede}>
          Shelf is the PayPal checkout that lives inside the chat. A buyer asks their assistant for something, finds a small seller&apos;s product, picks a size and pays with
          PayPal without leaving the conversation. Sellers get on Shelf by sending photos.
        </p>
        <div className={styles.actions}>
          <Link href="/try" className={styles.primary}>Try it in the sandbox</Link>
          <Link href="/app" className={styles.secondary}>Sell on Shelf</Link>
        </div>

        <section className={styles.section} aria-labelledby="how">
          <h2 id="how" className={styles.h2}>How a sale moves</h2>
          <ol className={styles.steps}>
            <li>The seller sends photos. Gemini drafts each product; the seller sets every price.</li>
            <li>A buyer asks an AI assistant. The Storefront shows the products in the chat.</li>
            <li>The buyer pays with PayPal. The card turns to Paid, and the seller ships.</li>
            <li>If something goes wrong, the buyer asks for a refund. Only the seller can approve it.</li>
          </ol>
        </section>

        <section className={styles.section} aria-labelledby="where">
          <h2 id="where" className={styles.h2}>Where it works</h2>
          <dl className={styles.where}>
            <div><dt>The Storefront app</dt><dd>Renders product cards, the cart and checkout in assistants that support MCP Apps, such as Claude and ChatGPT.</dd></div>
            <div><dt>The Shelf tools</dt><dd>Search, cart, checkout and order status work in any assistant that connects to an MCP server, as text when the app cannot render.</dd></div>
            <div><dt>The Cart API</dt><dd>Any other agent can build a cart and check out over HTTP with a store key, following the PayPal Cart API v1 contract.</dd></div>
          </dl>
          <p className={styles.small}>Connect an assistant to <code>/mcp</code> on this site.</p>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>Built for the PayPal AI Hackathon, November 2026. MIT license.</span>
        <span className={styles.mono}>Payments by PayPal · Sandbox only</span>
      </footer>
    </div>
  );
}
