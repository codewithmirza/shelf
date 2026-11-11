import { cents, type Cents } from "./brand";

// The money shape that crosses every boundary: PayPal's own format (IR-01).
export interface Money {
  readonly currency_code: "USD";
  readonly value: string;
}

export function toMoney(amount: Cents): Money {
  const whole = Math.floor(amount / 100);
  const part = String(amount % 100).padStart(2, "0");
  return { currency_code: "USD", value: `${whole}.${part}` };
}

// Parses PayPal's "32.00" into cents without floating-point arithmetic.
export function parseMoneyValue(value: string): Cents | null {
  const match = /^(\d{1,7})(?:\.(\d{2}))?$/.exec(value);
  if (!match) return null;
  return cents(Number(match[1]) * 100 + Number(match[2] ?? "0"));
}

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function multiplyCents(unit: Cents, quantity: number): Cents {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error(`Not a quantity: ${quantity}`);
  return cents(unit * quantity);
}

// The one display format for people: "$32.00" (CQ-16).
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export function formatUsd(amount: Cents): string {
  return usd.format(amount / 100);
}
