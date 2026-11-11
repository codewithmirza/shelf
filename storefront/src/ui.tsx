import type { ReactNode } from "react";
import { usd, type Money, type Order } from "./views";

// Base components from DESIGN-SYSTEM.md "Components". Values come from tokens.css only.

export function Button(p: { kind?: "primary" | "secondary" | "quiet"; busy?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button type="button" className={`btn btn-${p.kind ?? "primary"}`} onClick={p.onClick} disabled={p.disabled || p.busy} aria-busy={p.busy} aria-label={p.label}>
      {/* Busy keeps the width: the label stays in place under the spinner. */}
      <span className={p.busy ? "btn-label is-hidden" : "btn-label"}>{p.children}</span>
      {p.busy && <span className="spinner" aria-hidden="true" />}
    </button>
  );
}

export const Price = (p: { money: Money; large?: boolean }) => <span className={p.large ? "price price-large" : "price"}>{usd(p.money)}</span>;

const ICONS = {
  check: "M20 6 9 17l-5-5",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  x: "M18 6 6 18M6 6l12 12",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  external: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
} as const;

export const Icon = (p: { name: keyof typeof ICONS; size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[p.name]} />
  </svg>
);

type Tone = "paid" | "wait" | "danger" | "neutral";
export function Status(p: { tone: Tone; icon: keyof typeof ICONS; children: string }) {
  return (
    <span className={`status status-${p.tone}`} role="status" aria-label={`Order status: ${p.children}`}>
      <Icon name={p.icon} />
      {p.children}
    </span>
  );
}

// − value + ; 1 to 10; a tap is one step, holding does not repeat.
export function Stepper(p: { value: number; disabled: boolean; onChange: (n: number) => void; label: string }) {
  return (
    <span className="stepper" role="group" aria-label={`Quantity of ${p.label}`}>
      <button type="button" onClick={() => p.onChange(p.value - 1)} disabled={p.disabled} aria-label={p.value === 1 ? `Remove ${p.label}` : `One fewer ${p.label}`}>
        −
      </button>
      <span className="stepper-value" aria-live="polite">{p.value}</span>
      <button type="button" onClick={() => p.onChange(p.value + 1)} disabled={p.disabled || p.value >= 10} aria-label={`One more ${p.label}`}>
        +
      </button>
    </span>
  );
}

export function Photo(p: { src: string; alt: string; className?: string }) {
  // Until a product has a photo, the server sends the Shelf icon; show a quiet tile instead.
  if (p.src.endsWith("/icon.svg")) return <div className={`photo photo-empty ${p.className ?? ""}`} role="img" aria-label={p.alt} />;
  return <img className={`photo ${p.className ?? ""}`} src={p.src} alt={p.alt} loading="lazy" />;
}

export const Footer = () => (
  <footer className="footer">
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="3" rx="1" fill="currentColor" /><rect x="5" y="11" width="6" height="8" rx="1" fill="currentColor" /><rect x="13" y="13" width="6" height="6" rx="1" fill="currentColor" /></svg>
    Sold on Shelf · Payments by PayPal
  </footer>
);

export const Notice = (p: { children: ReactNode; tone?: "wait" | "danger" }) => (
  <p className={`notice notice-${p.tone ?? "wait"}`} role="alert">{p.children}</p>
);

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const ACTOR: Record<string, string> = { agent: "Agent", buyer: "Buyer", seller: "Seller", paypal: "PayPal", system: "Shelf" };

export const Timeline = (p: { items: Order["timeline"] }) => (
  <ol className="timeline">
    {p.items.map((t, i) => (
      <li key={`${t.at}-${i}`}>
        <time dateTime={t.at}>{when(t.at)}</time>
        <span className="timeline-actor">{ACTOR[t.actor] ?? t.actor}</span>
        <span>{t.text}</span>
      </li>
    ))}
  </ol>
);
