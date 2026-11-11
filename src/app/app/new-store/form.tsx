"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { slugify } from "@/server/seller/stores";
import { api } from "../api";
import { Button, Field } from "../ui";
import styles from "../seller.module.css";

// A2 "Name your store" (FL-SEL-01 step 3).
export function NewStoreForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [policy, setPolicy] = useState("");
  const [shipping, setShipping] = useState("0.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: "slug" | "form"; text: string } | null>(null);
  const link = slugTouched ? slug : slugify(name);

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await api<{ store: unknown }>("/store", { body: { name, slug: link, refund_policy: policy || undefined, shipping: Number(shipping) || 0 } });
    setBusy(false);
    if (r.ok) { router.replace("/app"); router.refresh(); return; }
    const suggestion = (r.data as { error?: { suggestion?: string } } | undefined)?.error?.suggestion;
    if (suggestion) { setSlug(suggestion); setSlugTouched(true); setError({ field: "slug", text: r.message }); }
    else setError({ field: "form", text: r.status === 400 ? "Check the name, the link and the shipping amount." : r.message });
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.h1}>Name your store</h1>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field id="name" label="Store name">
          <input id="name" className={styles.input} value={name} maxLength={60} required autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="slug" label="Store link" help={link ? `Buyers and agents find you at /s/${link}.` : "Lower-case letters, digits and hyphens."} error={error?.field === "slug" ? error.text : null}>
          <input id="slug" className={`${styles.input} ${styles.mono}`} value={link} maxLength={40} required onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value) || e.target.value.toLowerCase()); }} />
        </Field>
        <Field id="policy" label="Refund policy, one sentence" help="Buyers see this before they pay.">
          <input id="policy" className={styles.input} value={policy} maxLength={200} placeholder="Refunds within 14 days." onChange={(e) => setPolicy(e.target.value)} />
        </Field>
        <Field id="ship" label="Shipping, flat" help="Added once per order. USD only for now.">
          <input id="ship" className={`${styles.input} ${styles.mono}`} inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value.replace(/[^0-9.]/g, ""))} />
        </Field>
        {error?.field === "form" && <p className={styles.error} role="alert">{error.text}</p>}
        <div><Button type="submit" busy={busy} disabled={!name.trim() || !link}>Create store</Button></div>
      </form>
    </main>
  );
}
