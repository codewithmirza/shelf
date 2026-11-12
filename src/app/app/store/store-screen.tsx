"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { StoreRecord } from "@/server/seller/stores";
import type { StoreKeyRow } from "@/server/seller/keys";
import { api, when } from "../api";
import { ThemeSwitch } from "@/components/theme";
import { BottomBar, Button, Field, Header, Icon, Notice } from "../ui";
import styles from "../seller.module.css";

// A13: the store link, policy and shipping, agent keys for the Cart API, where payments go, log out.
export function StoreScreen() {
  const [store, setStore] = useState<StoreRecord | null>(null);
  const [payee, setPayee] = useState("");
  const [policy, setPolicy] = useState("");
  const [shipping, setShipping] = useState("");
  const [keys, setKeys] = useState<StoreKeyRow[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<null | "save" | "key" | "wa">(null);
  const [wa, setWa] = useState<{ available: boolean; linked: string | null } | null>(null);
  const [waLink, setWaLink] = useState<{ text: string; url: string | null; number: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ store: StoreRecord; payee_email: string }>("/store").then((r) => {
      if (!r.ok) return setError(r.message);
      setStore(r.data.store);
      setPayee(r.data.payee_email);
      setPolicy(r.data.store.refundPolicy ?? "");
      setShipping((r.data.store.shippingCents / 100).toFixed(2));
    });
    void api<{ store_keys: StoreKeyRow[] }>("/store-keys").then((r) => r.ok && setKeys(r.data.store_keys));
    void api<{ available: boolean; linked: string | null }>("/whatsapp").then((r) => r.ok && setWa(r.data));
  }, []);

  if (!store) return <><main className={styles.page}><Header title="Store" />{error ? <Notice>{error}</Notice> : <p className={styles.help}>Loading…</p>}</main><BottomBar /></>;
  const link = `${location.origin}/s/${store.slug}`;

  async function linkWhatsApp() {
    setBusy("wa");
    const r = await api<{ text: string; url: string | null; number: string | null }>("/whatsapp", { method: "POST" });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    setWaLink(r.data);
    if (r.data.url) window.open(r.data.url, "_blank", "noopener,noreferrer");
  }
  async function save() {
    setBusy("save");
    const r = await api<{ store: StoreRecord }>("/store", { method: "PATCH", body: { name: store!.name, refund_policy: policy || undefined, shipping: Number(shipping) || 0 } });
    setBusy(null);
    if (r.ok) { setStore(r.data.store); toast("Saved."); } else setError(r.message);
  }
  async function makeKey() {
    setBusy("key");
    const r = await api<{ key: string; store_key: StoreKeyRow }>("/store-keys", { body: { label: label.trim() || "Agent" } });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    setNewKey(r.data.key);
    setKeys((k) => [r.data.store_key, ...k]);
    setLabel("");
  }
  async function revoke(id: string) {
    const r = await api(`/store-keys/${id}/revoke`, { method: "POST" });
    if (r.ok) setKeys((k) => k.map((x) => (x.id === id ? { ...x, revokedAt: new Date().toISOString() } : x)));
  }

  return (
    <>
      <main className={styles.page}>
        <Header title="Store" action={<ThemeSwitch className={styles.themeSwitch} />} />
        {error && <Notice>{error}</Notice>}
        <section className={styles.section}>
          <h2 className={styles.label}>Your store link</h2>
          <div className={styles.copyRow}>
            <a className={styles.mono} href={link}>/s/{store.slug}</a>
            <button type="button" className={styles.iconBtn} aria-label="Copy store link" onClick={() => navigator.clipboard.writeText(link).then(() => toast("Link copied."))}><Icon name="copy" size={16} /></button>
          </div>
        </section>
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field id="policy" label="Refund policy" help="Buyers see this before they pay.">
            <input id="policy" className={styles.input} value={policy} maxLength={200} onChange={(e) => setPolicy(e.target.value)} />
          </Field>
          <Field id="ship" label="Shipping, flat" help="Added once per order.">
            <input id="ship" className={`${styles.input} ${styles.mono}`} inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value.replace(/[^0-9.]/g, ""))} />
          </Field>
          <div><Button type="submit" kind="secondary" busy={busy === "save"}>Save</Button></div>
        </form>
        <section className={styles.section}>
          <h2 className={styles.label}>WhatsApp</h2>
          <p className={styles.help}>Send product photos and set prices from WhatsApp. Shelf also messages you when an order is paid.</p>
          {wa?.linked && <p className={styles.body}>Linked to {wa.linked}.</p>}
          {wa && !wa.available && <p className={styles.meta}>WhatsApp isn&apos;t set up on this Shelf yet.</p>}
          {waLink && (
            <div className={styles.keyBox} role="status">
              <p className={styles.strongSmall}>{waLink.url ? "WhatsApp opened with this message. Send it." : `Send this message to Shelf on WhatsApp${waLink.number ? ` (+${waLink.number})` : ""}.`} It works for 15 minutes.</p>
              <code className={styles.keyText}>{waLink.text}</code>
              <Button kind="secondary" onClick={() => navigator.clipboard.writeText(waLink.text).then(() => toast("Copied."))}>Copy message</Button>
            </div>
          )}
          {wa?.available && <div><Button kind="secondary" busy={busy === "wa"} onClick={() => void linkWhatsApp()}>{wa.linked ? "Link another number" : "Connect WhatsApp"}</Button></div>}
        </section>
        <section className={styles.section}>
          <h2 className={styles.label}>Agent keys (Cart API)</h2>
          <p className={styles.help}>Other AI agents use a key to build carts in your store. You approve every refund yourself.</p>
          {newKey && (
            <div className={styles.keyBox} role="status">
              <p className={styles.strongSmall}>Copy this key now. Shelf shows it once.</p>
              <code className={styles.keyText}>{newKey}</code>
              <Button kind="secondary" onClick={() => navigator.clipboard.writeText(newKey).then(() => toast("Key copied."))}>Copy key</Button>
            </div>
          )}
          <ul className={styles.list}>
            {keys.map((k) => (
              <li key={k.id} className={styles.keyRow}>
                <span>{k.label} · <span className={styles.meta}>created {when(k.createdAt)}</span></span>
                {k.revokedAt ? <span className={styles.meta}>Revoked</span> : <button type="button" className={styles.dangerLink} onClick={() => revoke(k.id)}>Revoke</button>}
              </li>
            ))}
          </ul>
          <form className={styles.inline} onSubmit={(e) => { e.preventDefault(); void makeKey(); }}>
            <input aria-label="Key name" className={styles.input} placeholder="Key name, like Test agent" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
            <Button type="submit" kind="secondary" busy={busy === "key"}>New key</Button>
          </form>
        </section>
        <section className={styles.section}>
          <h2 className={styles.label}>Payments go to</h2>
          <p className={styles.body}>{payee} <span className={styles.meta}>(PayPal sandbox)</span></p>
        </section>
        <div><Button kind="quiet" onClick={() => fetch("/api/auth/signout", { method: "POST" }).then(() => (window.location.href = "/app"))}>Log out</Button></div>
      </main>
      <BottomBar />
    </>
  );
}
