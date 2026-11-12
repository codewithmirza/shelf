"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type CellValueChangedEvent, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeSwitch } from "@/components/theme";
import type { SellerProduct } from "@/server/seller/products";
import type { SellerOrderSummary } from "@/server/refunds";
import { api, usd, when } from "../app/api";
import styles from "./desk.module.css";

ModuleRegistry.registerModules([AllCommunityModule]);

// The grid takes Shelf's tokens, so it follows the theme switch and dark mode with no second palette (ADR-013).
const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--color-surface)",
  foregroundColor: "var(--color-ink)",
  headerBackgroundColor: "var(--color-surface-sunken)",
  headerTextColor: "var(--color-ink-secondary)",
  borderColor: "var(--color-line)",
  rowHoverColor: "var(--color-surface-sunken)",
  accentColor: "var(--color-ink)",
  inputFocusBorder: { color: "var(--color-focus)" },
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  headerFontWeight: 600,
  borderRadius: 6,
  wrapperBorderRadius: 10,
});

// One row per option (variant): the seller prices each option on its own (INV-03).
interface VariantRow {
  readonly productId: string;
  readonly first: boolean;
  readonly title: string;
  readonly state: SellerProduct["state"];
  readonly variantId: string;
  readonly option: string;
  price: number | null;
  stock: number;
  readonly suggested: string | null;
}

export const toRows = (products: readonly SellerProduct[]): VariantRow[] =>
  products.flatMap((p) =>
    p.variants.map((v, i) => ({
      productId: p.id,
      first: i === 0,
      title: p.title,
      state: p.state,
      variantId: v.id,
      option: Object.values(v.options).join(", ") || "One option",
      price: v.priceCents === null ? null : v.priceCents / 100,
      stock: v.stock,
      suggested: p.suggestedMinCents !== null && p.suggestedMaxCents !== null && p.aiFields.includes("suggested_price") ? `${usd(p.suggestedMinCents)} to ${usd(p.suggestedMaxCents)}` : null,
    })),
  );

const Badge = ({ value }: { value: string }) => <span className={`${styles.badge} ${styles[value] ?? ""}`}>{value}</span>;

export function Desk() {
  const [products, setProducts] = useState<SellerProduct[] | null>(null);
  const [orders, setOrders] = useState<SellerOrderSummary[] | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<{ text: string; bad: boolean }>({ text: "", bad: false });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, o] = await Promise.all([api<{ products: SellerProduct[] }>("/products"), api<{ orders: SellerOrderSummary[] }>("/orders")]);
    if (p.ok) setProducts(p.data.products); else setStatus({ text: p.message, bad: true });
    if (o.ok) setOrders(o.data.orders);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const move = useCallback(async (row: VariantRow) => {
    const to = row.state === "published" ? "unpublish" : "publish";
    setBusy(row.productId);
    const r = await api<{ product: SellerProduct }>(`/products/${row.productId}/${to}`, { method: "POST" });
    setBusy(null);
    if (!r.ok) { setStatus({ text: `${row.title}: ${r.message}`, bad: true }); return; }
    setProducts((ps) => ps?.map((p) => (p.id === row.productId ? r.data.product : p)) ?? null);
    setStatus({ text: `${row.title} is ${r.data.product.state === "published" ? "on sale" : "back in drafts"}.`, bad: false });
  }, []);

  // A price or stock edit goes to the same PATCH as the phone screens; the server checks it (INV-03) and the grid shows its answer.
  const onEdit = useCallback(async (e: CellValueChangedEvent<VariantRow>) => {
    if (e.oldValue === e.newValue) return;
    const field = e.colDef.field as "price" | "stock";
    const body = { variants: [{ id: e.data.variantId, [field]: e.newValue }] };
    const r = await api<{ product: SellerProduct }>(`/products/${e.data.productId}`, { method: "PATCH", body });
    if (!r.ok) { setStatus({ text: `${e.data.title}, ${e.data.option}: ${r.message}`, bad: true }); void load(); return; }
    setProducts((ps) => ps?.map((p) => (p.id === e.data.productId ? r.data.product : p)) ?? null);
    setStatus({ text: `Saved ${e.data.option} of ${e.data.title}: ${field === "price" ? usd(Math.round(Number(e.newValue) * 100)) : `${e.newValue} in stock`}.`, bad: false });
  }, [load]);

  const productCols = useMemo<ColDef<VariantRow>[]>(() => [
    { field: "title", headerName: "Product", flex: 2, minWidth: 220, cellStyle: (p) => (p.data?.first ? null : { color: "var(--color-ink-tertiary)" }) },
    { field: "option", headerName: "Option", flex: 1, minWidth: 140 },
    {
      field: "price", headerName: "Price (USD)", width: 130, editable: true, type: "rightAligned",
      valueFormatter: (p) => (p.value === null || p.value === undefined ? "Set a price" : usd(Math.round(Number(p.value) * 100))),
      valueParser: (p) => { const n = Number(String(p.newValue).replace(/[$,\s]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : p.oldValue; },
      cellStyle: (p) => (p.value === null ? { color: "var(--color-wait)" } : null),
    },
    { field: "stock", headerName: "Stock", width: 100, editable: true, type: "rightAligned", valueParser: (p) => { const n = Number(p.newValue); return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : p.oldValue; } },
    { field: "suggested", headerName: "Shelf Agent suggests", width: 190, cellRenderer: (p: ICellRendererParams<VariantRow>) => (p.value ? <span className={styles.suggested}>{p.value}</span> : null) },
    { field: "state", headerName: "State", width: 120, cellRenderer: (p: ICellRendererParams<VariantRow>) => (p.data?.first ? <Badge value={p.value} /> : null) },
    {
      headerName: "", colId: "action", width: 130, sortable: false, filter: false,
      cellRenderer: (p: ICellRendererParams<VariantRow>) =>
        p.data?.first ? (
          <button type="button" className={styles.act} disabled={busy === p.data.productId} onClick={() => void move(p.data!)}>
            {p.data.state === "published" ? "Unpublish" : "Publish"}
          </button>
        ) : null,
    },
  ], [busy, move]);

  const orderCols = useMemo<ColDef<SellerOrderSummary>[]>(() => [
    { field: "createdAt", headerName: "When", width: 140, sort: "desc", valueFormatter: (p) => when(p.value) },
    { field: "id", headerName: "Order", width: 170, cellRenderer: (p: ICellRendererParams<SellerOrderSummary>) => <Link href={`/app/orders/${p.value}`}>{String(p.value).slice(-8)}</Link> },
    { headerName: "Items", flex: 2, minWidth: 260, valueGetter: (p) => p.data?.lineTitles.join("; ") },
    { field: "amountCents", headerName: "Total", width: 110, type: "rightAligned", valueFormatter: (p) => usd(p.value) },
    { field: "state", headerName: "State", width: 120, cellRenderer: (p: ICellRendererParams<SellerOrderSummary>) => <Badge value={p.value} /> },
    { headerName: "Refund", width: 150, valueGetter: (p) => p.data?.refundRequest?.state ?? "", cellRenderer: (p: ICellRendererParams<SellerOrderSummary>) => (p.value ? <Link href={`/app/orders/${p.data!.id}`}><Badge value={p.value} /></Link> : null) },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true }), []);
  const rows = useMemo(() => (products ? toRows(products) : null), [products]);

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link href="/" className={styles.brand}>Shelf</Link>
        <nav className={styles.links}>
          <Link href="/app">Seller app</Link>
          <Link href="/app/photos">Add photos</Link>
          <ThemeSwitch className={styles.theme} />
        </nav>
      </header>
      <main className={styles.main}>
        <div className={styles.bar}>
          <div>
            <h1 className={styles.h1}>Seller desk</h1>
            <p className={styles.help}>Every product option and every order in one place. Double-click a price or stock cell to change it; Shelf checks it before it saves.</p>
          </div>
          <input className={styles.search} type="search" placeholder="Filter products and orders" aria-label="Filter products and orders" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <p className={status.bad ? `${styles.status} ${styles.statusBad}` : styles.status} role="status" aria-live="polite">{status.text}</p>
        <p className={styles.mobile}>On a phone, the <Link href="/app">Seller app</Link> is easier.</p>
        <section className={styles.section} aria-labelledby="products-h">
          <h2 id="products-h" className={styles.h2}>Products</h2>
          <div className={styles.grid}>
            <AgGridReact<VariantRow>
              theme={gridTheme}
              rowData={rows}
              columnDefs={productCols}
              defaultColDef={defaultColDef}
              quickFilterText={filter}
              getRowId={(p) => p.data.variantId}
              onCellValueChanged={onEdit}
              stopEditingWhenCellsLoseFocus
              singleClickEdit={false}
              overlayNoRowsTemplate="No products yet. Add photos in the Seller app."
            />
          </div>
        </section>
        <section className={styles.section} aria-labelledby="orders-h">
          <h2 id="orders-h" className={styles.h2}>Orders</h2>
          <div className={styles.grid}>
            <AgGridReact<SellerOrderSummary>
              theme={gridTheme}
              rowData={orders}
              columnDefs={orderCols}
              defaultColDef={defaultColDef}
              quickFilterText={filter}
              getRowId={(p) => p.data.id}
              overlayNoRowsTemplate="No paid orders yet."
            />
          </div>
        </section>
      </main>
    </div>
  );
}
