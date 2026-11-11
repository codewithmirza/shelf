import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { shelfEnv } from "@/server/http";
import { Mark } from "@/components/mark";
import styles from "./store.module.css";

export const dynamic = "force-dynamic";

interface Row { id: string; title: string; description: string; price_from: number; cover_key: string | null }

async function load(slug: string) {
  const db = shelfEnv().DB;
  const store = await db.prepare("SELECT id, name, refund_policy, shipping_cents FROM stores WHERE slug = ?").bind(slug).first<{ id: string; name: string; refund_policy: string | null; shipping_cents: number }>();
  if (!store) return null;
  const { results } = await db
    .prepare(
      `SELECT p.id, p.title, p.description, MIN(v.price_cents) AS price_from, ph.r2_key AS cover_key FROM products p JOIN variants v ON v.product_id = p.id
       LEFT JOIN photos ph ON ph.id = p.cover_photo_id WHERE p.store_id = ? AND p.state = 'published' AND v.price_cents IS NOT NULL GROUP BY p.id ORDER BY p.updated_at DESC`,
    )
    .bind(store.id)
    .all<Row>();
  return { store, products: results };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await load((await params).slug);
  return data ? { title: `${data.store.name} on Shelf`, description: `Ask your AI assistant for ${data.store.name} on Shelf, and pay with PayPal.` } : { title: "Shelf" };
}

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// /s/{slug}: the public page of one store. Buying happens in the assistant; this page says how.
export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { store, products } = data;
  return (
    <main className={styles.page}>
      <a href="/" className={styles.brand}><Mark size={22} /> shelf</a>
      <h1 className={styles.h1}>{store.name}</h1>
      <p className={styles.meta}>{[store.refund_policy, `Shipping ${usd(store.shipping_cents)} per order`].filter(Boolean).join(" · ")}</p>
      <p className={styles.body}>Ask your AI assistant: “Show me {store.name} on Shelf.” You pay with PayPal inside the chat. Or try it now in the <a href={`/try`}>sandbox</a>.</p>
      {products.length === 0 ? (
        <p className={styles.body}>Nothing for sale yet.</p>
      ) : (
        <ul className={styles.grid}>
          {products.map((p) => (
            <li key={p.id} className={styles.card}>
              {p.cover_key ? <img className={styles.photo} src={`/photos/${encodeURIComponent(p.cover_key)}`} alt={p.title} loading="lazy" /> : <div className={styles.photo} />}
              <p className={styles.title}>{p.title}</p>
              <p className={styles.price}>from {usd(p.price_from)}</p>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.small}>Sold on Shelf · Payments by PayPal (sandbox)</p>
    </main>
  );
}
