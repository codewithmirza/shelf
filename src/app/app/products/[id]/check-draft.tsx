"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { SellerProduct } from "@/server/seller/products";
import { api, usd } from "../../api";
import { Button, Field, Header, Notice, Status } from "../../ui";
import styles from "../../seller.module.css";

const toDollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
const optionLabel = (o: Record<string, string>) => Object.values(o).join(", ");

// A6 and A7: check a draft, set every price, publish (FL-SEL-03). Suggested fields carry the mark until edited.
export function CheckDraft({ id }: { id: string }) {
  const router = useRouter();
  const [p, setP] = useState<SellerProduct | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [stock, setStock] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "save" | "publish" | "unpublish" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});

  const load = (prod: SellerProduct) => {
    setP(prod);
    setTitle(prod.title);
    setDescription(prod.description);
    setPrices(Object.fromEntries(prod.variants.map((v) => [v.id, toDollars(v.priceCents)])));
    setStock(Object.fromEntries(prod.variants.map((v) => [v.id, String(v.stock)])));
  };
  useEffect(() => { void api<{ product: SellerProduct }>(`/products/${id}`).then((r) => (r.ok ? load(r.data.product) : setError(r.message))); }, [id]);

  if (!p) return <main className={styles.page}><Header title="Check draft" back="/app" />{error ? <Notice>{error}</Notice> : <p className={styles.help}>Loading…</p>}</main>;

  const suggested = (f: string) => p.aiFields.includes(f);
  const range = p.suggestedMinCents !== null && p.suggestedMaxCents !== null ? `Suggested: ${usd(p.suggestedMinCents)} to ${usd(p.suggestedMaxCents)}. You set the price.` : undefined;

  async function save(): Promise<SellerProduct | null> {
    const errs: Record<string, string> = {};
    const variants = p!.variants.map((v) => {
      const raw = prices[v.id]?.trim() ?? "";
      const price = raw === "" ? null : Number(raw);
      if (price !== null && (!Number.isFinite(price) || price < 0.5 || price > 10000)) errs[v.id] = "Enter a price between $0.50 and $10,000.";
      const s = Number(stock[v.id] ?? v.stock);
      return { id: v.id, ...(raw !== toDollars(v.priceCents) ? { price } : {}), ...(Number.isInteger(s) && s >= 0 && s !== v.stock ? { stock: s } : {}) };
    });
    setPriceErrors(errs);
    if (Object.keys(errs).length) return null;
    const body: Record<string, unknown> = { variants };
    if (title !== p!.title) body.title = title;
    if (description !== p!.description) body.description = description;
    const r = await api<{ product: SellerProduct }>(`/products/${p!.id}`, { method: "PATCH", body });
    if (!r.ok) { setError(r.message); return null; }
    load(r.data.product);
    return r.data.product;
  }

  async function act(kind: "save" | "publish" | "unpublish" | "delete") {
    setBusy(kind);
    setError(null);
    if (kind === "save" || kind === "publish") {
      const saved = await save();
      if (!saved) { setBusy(null); return; }
      if (kind === "publish") {
        const missing = saved.variants.filter((v) => v.priceCents === null);
        if (missing.length) { setPriceErrors(Object.fromEntries(missing.map((v) => [v.id, "Confirm a price to publish."]))); setBusy(null); return; }
        const r = await api<{ product: SellerProduct }>(`/products/${p!.id}/publish`, { method: "POST" });
        setBusy(null);
        if (!r.ok) { setError(r.message); return; }
        toast("Published. It's live in the Storefront.");
        router.push("/app");
        return;
      }
      toast("Saved.");
      setBusy(null);
      return;
    }
    const r = await api<{ product: SellerProduct }>(`/products/${p!.id}/${kind}`, { method: "POST" });
    setBusy(null);
    if (!r.ok) { setError(r.message); return; }
    if (kind === "delete") { toast("Draft deleted."); router.push("/app"); return; }
    load(r.data.product);
    toast("Unpublished. Buyers can't add it now.");
  }

  return (
    <main className={styles.page}>
      <Header title={p.state === "published" ? "Product" : "Check draft"} back="/app" action={p.state === "published" ? <Status tone="paid" icon="check">Live</Status> : undefined} />
      {p.coverPhotoId ? <img className={styles.hero} src={`/api/seller/photos/${p.coverPhotoId}/image`} alt={p.title} /> : <div className={styles.hero} />}
      {error && <Notice>{error}</Notice>}
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); void act(p.state === "draft" ? "publish" : "save"); }}>
        <Field id="title" label="Title" suggested={suggested("title") && title === p.title}>
          <input id="title" className={`${styles.input} ${suggested("title") && title === p.title ? styles.inputSuggested : ""}`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field id="desc" label="Description" suggested={suggested("description") && description === p.description}>
          <textarea id="desc" rows={3} className={`${styles.input} ${suggested("description") && description === p.description ? styles.inputSuggested : ""}`} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {p.variants.map((v) => (
          <div key={v.id} className={styles.variantRow}>
            <Field id={`price-${v.id}`} label={`Price${optionLabel(v.options) ? `, ${optionLabel(v.options)}` : ""}`} error={priceErrors[v.id]} help={v.priceCents === null ? range : "Set by you."}>
              <input id={`price-${v.id}`} className={`${styles.input} ${styles.mono} ${priceErrors[v.id] ? styles.inputError : ""}`} inputMode="decimal" placeholder="0.00" value={prices[v.id] ?? ""} onChange={(e) => setPrices({ ...prices, [v.id]: e.target.value.replace(/[^0-9.]/g, "") })} />
            </Field>
            <Field id={`stock-${v.id}`} label="In stock">
              <input id={`stock-${v.id}`} className={`${styles.input} ${styles.mono}`} inputMode="numeric" value={stock[v.id] ?? ""} onChange={(e) => setStock({ ...stock, [v.id]: e.target.value.replace(/[^0-9]/g, "") })} />
            </Field>
          </div>
        ))}
        <div className={styles.actions}>
          {p.state === "draft" ? (
            <>
              <Button type="submit" busy={busy === "publish"} disabled={busy !== null}>Publish</Button>
              <Button kind="secondary" busy={busy === "save"} disabled={busy !== null} onClick={() => act("save")}>Save draft</Button>
              <Button kind="quiet" busy={busy === "delete"} disabled={busy !== null} onClick={() => act("delete")}>Delete</Button>
            </>
          ) : (
            <>
              <Button type="submit" busy={busy === "save"} disabled={busy !== null}>Save</Button>
              <Button kind="secondary" busy={busy === "unpublish"} disabled={busy !== null} onClick={() => act("unpublish")}>Unpublish</Button>
            </>
          )}
        </div>
      </form>
    </main>
  );
}
