import { App } from "@modelcontextprotocol/ext-apps";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

// SPK-02 / SPK-07 hello view. Task T-13 replaces it with the five Storefront views.
type Card = { id: string; title: string; price_from: { value: string }; store: { name: string } };
type View =
  | { readonly kind: "waiting" }
  | { readonly kind: "results"; readonly products: readonly Card[] }
  | { readonly kind: "failed"; readonly message: string };

const app = new App({ name: "Shelf Storefront", version: "0.1.0" });

function readView(structured: unknown): View {
  if (typeof structured === "object" && structured !== null && "view" in structured && structured.view === "results" && "products" in structured && Array.isArray(structured.products)) {
    return { kind: "results", products: structured.products as Card[] };
  }
  return { kind: "failed", message: "Shelf sent something this view can't show yet." };
}

function Storefront() {
  const [view, setView] = useState<View>({ kind: "waiting" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    app.ontoolresult = (result) => setView(readView(result.structuredContent));
    app.connect().catch(() => setView({ kind: "failed", message: "This chat app can't show the Storefront." }));
  }, []);

  async function searchAgain() {
    setBusy(true);
    try {
      const result = await app.callServerTool({ name: "search_products", arguments: { query: "mug" } });
      setView(readView(result.structuredContent));
    } catch {
      setView({ kind: "failed", message: "Shelf isn't answering. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ font: "15px/1.5 system-ui, sans-serif", padding: 16 }}>
      {view.kind === "waiting" && <p>Loading Shelf…</p>}
      {view.kind === "failed" && <p role="alert">{view.message}</p>}
      {view.kind === "results" && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {view.products.map((p) => (
            <li key={p.id}>
              {p.title} · {p.store.name} · from ${p.price_from.value}
            </li>
          ))}
          {view.products.length === 0 && <li>No products match.</li>}
        </ul>
      )}
      <button type="button" onClick={searchAgain} disabled={busy} style={{ marginTop: 12 }}>
        {busy ? "Searching…" : "Search mugs"}
      </button>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Storefront />);
