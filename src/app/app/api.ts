// The Seller app's one way to call its API. Every failure carries the Gate 5 screen text.
export type Answer<T> = { ok: true; data: T } | { ok: false; status: number; message: string; data?: unknown };

export async function api<T>(path: string, init?: { method?: string; body?: unknown; form?: FormData }): Promise<Answer<T>> {
  try {
    const req: RequestInit = { method: init?.method ?? (init?.body !== undefined || init?.form ? "POST" : "GET"), cache: "no-store" };
    if (init?.form) req.body = init.form;
    else if (init?.body !== undefined) { req.body = JSON.stringify(init.body); req.headers = { "content-type": "application/json" }; }
    const res = await fetch(`/api/seller${path}`, req);
    const data = (await res.json().catch(() => null)) as (T & { error?: { message: string } }) | null;
    if (res.status === 401) { window.location.href = "/app"; return { ok: false, status: 401, message: "Log in with PayPal to continue." }; }
    if (!res.ok) return { ok: false, status: res.status, message: data?.error?.message ?? "Something went wrong on our side.", data };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, message: "You're offline. Try again." };
  }
}

export const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  if (today) return `Today ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  const y = new Date(Date.now() - 864e5).toDateString() === d.toDateString();
  return y ? "Yesterday" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
