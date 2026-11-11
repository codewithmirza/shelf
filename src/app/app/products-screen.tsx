"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, usd } from "./api";
import { BottomBar, Card, Empty, Header, Icon, Notice, Status } from "./ui";
import styles from "./seller.module.css";
import type { SellerProduct } from "@/server/seller/products";

// A3 (empty) and A8 (list). Drafts that need a price show "Price not set".
export function ProductsScreen() {
  const [products, setProducts] = useState<SellerProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api<{ products: SellerProduct[] }>("/products").then((r) => (r.ok ? setProducts(r.data.products) : setError(r.message)));
  }, []);

  return (
    <>
      <main className={styles.page}>
        <Header title="Products" action={products && products.length > 0 ? <Link href="/app/photos" className={`${styles.btn} ${styles.btn_secondary} ${styles.btnLink}`}>Add photos</Link> : undefined} />
        {error && <Notice>{error}</Notice>}
        {products === null && !error && <p className={styles.help}>Loading…</p>}
        {products?.length === 0 && (
          <Empty icon="camera" text="No products yet.">
            <p className={styles.body}>Take or choose up to 10 photos. We draft each product; you check it and set the price.</p>
            <Link href="/app/photos" className={`${styles.btn} ${styles.btn_primary} ${styles.btnLink}`}>Add photos</Link>
          </Empty>
        )}
        {products && products.length > 0 && (
          <ul className={styles.list}>
            {products.map((p) => {
              const priced = p.variants.filter((v) => v.priceCents !== null);
              const from = priced.length ? Math.min(...priced.map((v) => v.priceCents!)) : null;
              const soldOut = p.variants.every((v) => v.stock === 0);
              return (
                <li key={p.id}>
                  <Card href={`/app/products/${p.id}`}>
                    <div className={styles.productRow}>
                      {p.coverPhotoId ? <img className={styles.thumb} src={`/api/seller/photos/${p.coverPhotoId}/image`} alt="" /> : <span className={styles.thumb} />}
                      <div className={styles.grow}>
                        <p className={styles.strong}>{p.title}</p>
                        <p className={styles.meta}>{from === null ? "Price not set" : soldOut ? "Sold out" : `${p.variants.length} ${p.variants.length === 1 ? "option" : "options"}`}</p>
                        {p.state === "published" ? <Status tone="paid" icon="check">Live</Status> : <Status tone="neutral" icon="pencil">Draft</Status>}
                      </div>
                      {from !== null && <span className={styles.price}>{usd(from)}</span>}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        {products && products.length > 0 && <p className={styles.help}><Icon name="box" /> {products.filter((p) => p.state === "published").length} live, {products.filter((p) => p.state === "draft").length} drafts.</p>}
      </main>
      <BottomBar />
    </>
  );
}
