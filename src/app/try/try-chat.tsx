"use client";

import { useEffect, useRef, useState } from "react";
import { callTool, parseSearch, type ToolResult } from "./mcp-client";
import { StorefrontFrame } from "./storefront-frame";
import styles from "./try.module.css";

type Turn =
  | { readonly id: number; readonly kind: "user"; readonly text: string }
  | { readonly id: number; readonly kind: "tool"; readonly name: string; readonly args: Record<string, unknown>; readonly result: ToolResult }
  | { readonly id: number; readonly kind: "note"; readonly text: string };

// Omit over each member, so each kind keeps its own fields.
type NewTurn = Turn extends infer T ? (T extends Turn ? Omit<T, "id"> : never) : never;

const EXAMPLES = ["a blue mug under $40", "prints", "espresso cups"];

// The search-box Try page (ADR-010): a judge types what they want, Shelf answers with the real Storefront.
// It calls the same MCP endpoint a chat host calls, so everything after the first search is the real product.
export function TryChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const id = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const set = () => setTheme(mq.matches ? "dark" : "light");
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length]);

  const add = (t: NewTurn) => setTurns((ts) => [...ts, { ...t, id: ++id.current } as Turn]);

  async function search(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    add({ kind: "user", text: q });
    setBusy(true);
    try {
      const args = parseSearch(q);
      add({ kind: "tool", name: "search_products", args, result: await callTool("search_products", args) });
    } catch (e) {
      add({ kind: "note", text: e instanceof Error ? e.message : "Shelf isn't answering. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.chat}>
      <ol className={styles.turns} aria-live="polite">
        {turns.length === 0 && (
          <li className={styles.hello}>
            <p>Ask for something to buy. Shelf answers with a real store inside the chat, and you pay with the PayPal sandbox.</p>
            <div className={styles.examples}>
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className={styles.example} onClick={() => search(e)}>{e}</button>
              ))}
            </div>
          </li>
        )}
        {turns.map((t) =>
          t.kind === "user" ? (
            <li key={t.id} className={styles.user}>{t.text}</li>
          ) : t.kind === "note" ? (
            <li key={t.id} className={styles.note}>{t.text}</li>
          ) : (
            <li key={t.id} className={styles.tool}>
              <StorefrontFrame toolName={t.name} args={t.args} result={t.result} theme={theme} onMessage={(text) => add({ kind: "user", text })} />
            </li>
          ),
        )}
      </ol>
      <div ref={end} />
      <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); void search(input); }}>
        <label htmlFor="ask" className={styles.srOnly}>What do you want to buy?</label>
        <input id="ask" value={input} onChange={(e) => setInput(e.target.value)} placeholder="A blue mug under $40" autoComplete="off" maxLength={200} />
        <button type="submit" disabled={busy || !input.trim()}>{busy ? "Searching…" : "Ask"}</button>
      </form>
    </div>
  );
}
