"use client";

import { useState } from "react";
import styles from "./try.module.css";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={styles.copy} aria-label={label} onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}
