"use client";

import { useEffect, useState } from "react";

// The viewer's theme choice: follow the system, or force light or dark. Stored per browser only (a convenience).
export type ThemeChoice = "system" | "light" | "dark";
const KEY = "shelf-theme";
const ORDER: readonly ThemeChoice[] = ["system", "light", "dark"];
const EVENT = "shelf-theme";

// Runs before paint from the root layout, so a forced theme never flashes.
export const themeBootScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function readChoice(): ThemeChoice {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

function applyChoice(c: ThemeChoice) {
  if (c === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = c;
  try {
    if (c === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, c);
  } catch {
    // Storage can be blocked; the choice still holds for this page.
  }
  window.dispatchEvent(new Event(EVENT));
}

// The theme the page shows now, after the choice and the system setting.
export function useResolvedTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const set = () => {
      const c = readChoice();
      setTheme(c === "system" ? (mq.matches ? "dark" : "light") : c);
    };
    set();
    mq.addEventListener("change", set);
    window.addEventListener(EVENT, set);
    return () => { mq.removeEventListener("change", set); window.removeEventListener(EVENT, set); };
  }, []);
  return theme;
}

const LABEL: Record<ThemeChoice, string> = { system: "Auto", light: "Light", dark: "Dark" };

export function ThemeSwitch({ className }: { className?: string | undefined }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => setChoice(readChoice()), []);
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] ?? "system";
  return (
    <button
      type="button"
      className={className}
      onClick={() => { applyChoice(next); setChoice(next); }}
      aria-label={`Theme: ${LABEL[choice]}. Switch to ${LABEL[next]}.`}
      title={`Theme: ${LABEL[choice]}`}
    >
      {choice === "dark" ? "☾" : choice === "light" ? "☀" : "◐"} {LABEL[choice]}
    </button>
  );
}
