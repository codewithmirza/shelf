"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Button, Header, Notice } from "../ui";
import styles from "../seller.module.css";

type Tile = { id: string; state: "queued" | "extracted" | "failed" | "no_product"; product_id: string | null; failure_reason: string | null; preview?: string | undefined };

// A4 and A5: photos upload, each tile reads, then becomes a draft (FL-SEL-02).
export function AddPhotos() {
  const input = useRef<HTMLInputElement>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reading = tiles.filter((t) => t.state === "queued").length;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = [...files].slice(0, 10);
    const form = new FormData();
    for (const f of list) form.append("photos", f);
    setBusy(true);
    setError(null);
    const r = await api<{ photos: { id: string; state: Tile["state"] }[] }>("/photos", { form });
    setBusy(false);
    if (!r.ok) { setError(r.status === 415 ? "This file is too big or not a photo. Use JPEG, PNG, WebP or HEIC up to 10 MB." : r.message); return; }
    setTiles((t) => [...r.data.photos.map((p, i) => ({ id: p.id, state: p.state, product_id: null, failure_reason: null, preview: URL.createObjectURL(list[i]!) })), ...t]);
  }

  // Poll every 2 s while anything is still being read.
  useEffect(() => {
    if (reading === 0) return;
    const t = setInterval(async () => {
      const r = await api<{ photos: Tile[] }>("/photos");
      if (!r.ok) return;
      const byId = new Map(r.data.photos.map((p) => [p.id, p]));
      setTiles((ts) => ts.map((x) => ({ ...x, ...(byId.get(x.id) ?? {}), preview: x.preview })));
    }, 2000);
    return () => clearInterval(t);
  }, [reading]);

  async function fillIn(id: string) {
    const r = await api<{ product_id: string }>(`/photos/${id}/blank`, { method: "POST" });
    if (r.ok) window.location.href = `/app/products/${r.data.product_id}`;
    else setError(r.message);
  }

  const drafts = tiles.filter((t) => t.state === "extracted" && t.product_id);
  return (
    <main className={styles.page}>
      <Header title="Add photos" back="/app" />
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
      {tiles.length === 0 ? (
        <>
          <p className={styles.body}>Take or choose up to 10 photos, one product in each. We draft the title, description and options; you set the price.</p>
          <div><Button busy={busy} onClick={() => input.current?.click()}>Choose photos</Button></div>
        </>
      ) : (
        <p className={styles.body}>{reading > 0 ? `Reading ${tiles.length === 1 ? "1 photo" : `${tiles.length} photos`}. You can leave this screen; drafts keep coming.` : `We read ${drafts.length} of ${tiles.length === 1 ? "1 photo" : `${tiles.length} photos`}. Check each draft and set its price.`}</p>
      )}
      {error && <Notice>{error}</Notice>}
      <ul className={styles.tiles}>
        {tiles.map((t) => (
          <li key={t.id} className={styles.tile}>
            <div className={styles.tilePhoto} style={t.preview ? { backgroundImage: `url(${t.preview})` } : undefined}>
              {t.state === "queued" && <span className={styles.progress} role="progressbar" aria-label="Reading" />}
            </div>
            {t.state === "queued" && <p className={styles.meta}>Reading…</p>}
            {t.state === "extracted" && t.product_id && <Link className={styles.link} href={`/app/products/${t.product_id}`}>Check draft</Link>}
            {t.state === "no_product" && <p className={styles.meta}>We didn&apos;t find a product in this photo.</p>}
            {t.state === "failed" && (
              <>
                <p className={styles.errorSmall}>We couldn&apos;t read this photo.</p>
                <button type="button" className={styles.linkBtn} onClick={() => fillIn(t.id)}>Fill in yourself</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {tiles.length > 0 && (
        <div className={styles.actions}>
          {drafts.length > 0 && <Link href={`/app/products/${drafts[0]!.product_id}`} className={`${styles.btn} ${styles.btn_primary} ${styles.btnLink}`}>Check {drafts.length} {drafts.length === 1 ? "draft" : "drafts"}</Link>}
          <Button kind="secondary" busy={busy} onClick={() => input.current?.click()}>Add more</Button>
        </div>
      )}
    </main>
  );
}
