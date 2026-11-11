"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./seller.module.css";

// Seller app components (DESIGN-SYSTEM.md "Components"). Values come from tokens.css only.

export function Button(p: { kind?: "primary" | "secondary" | "quiet" | "danger"; busy?: boolean; disabled?: boolean; onClick?: () => void; type?: "button" | "submit"; children: ReactNode; full?: boolean }) {
  return (
    <button type={p.type ?? "button"} className={`${styles.btn} ${styles[`btn_${p.kind ?? "primary"}`]} ${p.full ? styles.full : ""}`} onClick={p.onClick} disabled={p.disabled || p.busy} aria-busy={p.busy}>
      <span className={p.busy ? styles.hidden : undefined}>{p.children}</span>
      {p.busy && <span className={styles.spinner} aria-hidden="true" />}
    </button>
  );
}

export function Field(p: { label: string; help?: string | undefined; error?: string | null | undefined; suggested?: boolean; children: ReactNode; id: string }) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label htmlFor={p.id}>{p.label}</label>
        {p.suggested && <span className={styles.suggested}>Suggested</span>}
      </div>
      {p.children}
      {p.error ? <p className={styles.error} role="alert">{p.error}</p> : p.help ? <p className={styles.help}>{p.help}</p> : null}
    </div>
  );
}

const ICON = {
  check: "M20 6 9 17l-5-5",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  x: "M18 6 6 18M6 6l12 12",
  pencil: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  box: "M21 8 12 3 3 8v8l9 5 9-5ZM3 8l9 5 9-5M12 13v8",
  store: "M3 9h18l-1-5H4ZM5 9v11h14V9M9 20v-6h6v6",
  camera: "M3 8h4l2-3h6l2 3h4v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  back: "M15 18l-6-6 6-6",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
} as const;
export type IconName = keyof typeof ICON;

export const Icon = (p: { name: IconName; size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICON[p.name]} />
  </svg>
);

export function Status(p: { tone: "paid" | "wait" | "danger" | "neutral"; icon: IconName; children: string }) {
  return (
    <span className={`${styles.status} ${styles[`status_${p.tone}`]}`}>
      <Icon name={p.icon} /> {p.children}
    </span>
  );
}

export const Price = (p: { cents: number; large?: boolean }) => (
  <span className={p.large ? `${styles.price} ${styles.priceLarge}` : styles.price}>${(p.cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
);

export function Header(p: { title: string; back?: string; action?: ReactNode }) {
  const router = useRouter();
  return (
    <header className={styles.header}>
      {p.back && (
        <button type="button" className={styles.backBtn} aria-label="Back" onClick={() => (window.history.length > 1 ? router.back() : router.push(p.back!))}>
          <Icon name="back" size={18} />
        </button>
      )}
      <h1 className={styles.h1}>{p.title}</h1>
      {p.action && <div className={styles.headerAction}>{p.action}</div>}
    </header>
  );
}

const TABS = [
  { href: "/app", label: "Products", icon: "box" },
  { href: "/app/orders", label: "Orders", icon: "truck" },
  { href: "/app/store", label: "Store", icon: "store" },
] as const;

export function BottomBar() {
  const path = usePathname();
  return (
    <nav className={styles.bar} aria-label="Seller app">
      {TABS.map((t) => {
        const on = t.href === "/app" ? path === "/app" || path.startsWith("/app/products") || path.startsWith("/app/photos") : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={on ? `${styles.tab} ${styles.tabOn}` : styles.tab} aria-current={on ? "page" : undefined}>
            <Icon name={t.icon} size={18} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const Card = (p: { children: ReactNode; href?: string }) =>
  p.href ? <Link href={p.href} className={`${styles.card} ${styles.cardLink}`}>{p.children}</Link> : <div className={styles.card}>{p.children}</div>;

export const Empty = (p: { text: string; children?: ReactNode; icon?: IconName }) => (
  <div className={styles.empty}>
    {p.icon && <span className={styles.emptyIcon}><Icon name={p.icon} size={22} /></span>}
    <p className={styles.emptyText}>{p.text}</p>
    {p.children}
  </div>
);

export const Notice = (p: { children: ReactNode; tone?: "wait" | "danger" }) => <p className={`${styles.notice} ${styles[`notice_${p.tone ?? "wait"}`]}`} role="alert">{p.children}</p>;
