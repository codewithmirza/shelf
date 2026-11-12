import type { Metadata } from "next";
import Link from "next/link";
import styles from "../landing.module.css";

export const metadata: Metadata = { title: "Privacy · Shelf", description: "What Shelf keeps, why, and how to have it deleted." };

// The privacy policy Meta and PayPal link to. Plain words; it says only what the code does (ADR-012, ADR-008).
export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main} style={{ maxWidth: "68ch" }}>
        <p><Link href="/">← Shelf</Link></p>
        <h1 className={styles.h1}>Privacy</h1>
        <p className={styles.lede}>Shelf is a hackathon project that runs on the PayPal sandbox. No real money moves. This page says what Shelf keeps and why.</p>
        <h2>Sellers</h2>
        <p>When you log in with PayPal, Shelf keeps your PayPal account ID, your email and your name, so orders pay you. Shelf keeps your store details, the product photos you upload and the products you publish.</p>
        <h2>Buyers</h2>
        <p>Shelf keeps your cart and order: items, prices, and the shipping details PayPal returns, so the seller can ship. PayPal handles your payment. Shelf never sees your card or bank details.</p>
        <h2>WhatsApp</h2>
        <p>If you message Shelf on WhatsApp, Shelf keeps your WhatsApp number to reply, the last few messages of the conversation so the assistant can follow it, and your cart and order IDs. Your messages are sent to Google Gemini on Vertex AI to understand what you want. Photos a seller sends are stored like photos uploaded in the Seller app.</p>
        <h2>AI</h2>
        <p>Product photos and chat messages are processed by Gemini on Google Cloud Vertex AI. Shelf does not use them to train any model.</p>
        <h2>Deletion</h2>
        <p>To have your data deleted, email <a href="mailto:mirza@gitring.tech">mirza@gitring.tech</a> from the address on your account, or send "delete my data" to Shelf on WhatsApp and we will remove it within 30 days. Orders may be kept as long as PayPal&apos;s records require.</p>
        <p className={styles.lede}>Last updated 12 November 2026.</p>
      </main>
    </div>
  );
}
