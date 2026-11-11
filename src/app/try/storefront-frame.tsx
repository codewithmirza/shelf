"use client";

import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { useEffect, useRef, useState } from "react";
import { callTool, storefrontHtml, type ToolResult } from "./mcp-client";
import styles from "./try.module.css";

let htmlCache: Promise<string> | null = null;

// Hosts the Storefront the way Claude and ChatGPT do: an isolated iframe, one AppBridge, tool calls proxied
// to /mcp, links opened in a new tab, and ui/message shown in the chat (Try page, ADR-010).
export function StorefrontFrame(p: { toolName: string; args: Record<string, unknown>; result: ToolResult; onMessage: (text: string) => void; theme: "light" | "dark" }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const bridgeRef = useRef<AppBridge | null>(null);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe?.contentWindow) return;
    const bridge = new AppBridge(null, { name: "Shelf Try page", version: "0.1.0" }, { openLinks: {}, serverTools: {}, logging: {} }, { hostContext: { theme: p.theme, displayMode: "inline", platform: "web" } });
    bridgeRef.current = bridge;
    bridge.oncalltool = async (params) => (await callTool(params.name, (params.arguments ?? {}) as Record<string, unknown>)) as never;
    bridge.onopenlink = async ({ url }) => {
      const w = window.open(url, "_blank", "noopener,noreferrer");
      return w ? {} : { isError: true };
    };
    bridge.onmessage = async (m) => {
      const text = m.content.map((c) => ("text" in c ? c.text : "")).join(" ").trim();
      if (text) p.onMessage(text);
      return {};
    };
    bridge.onupdatemodelcontext = async () => ({});
    bridge.onsizechange = ({ height: h }) => { if (h) setHeight(Math.min(Math.max(h, 120), 1200)); };
    bridge.oninitialized = () => {
      void bridge.sendToolInput({ arguments: p.args });
      void bridge.sendToolResult(p.result as never);
    };
    const transport = new PostMessageTransport(iframe.contentWindow, iframe.contentWindow);
    let cancelled = false;
    bridge.connect(transport).then(async () => {
      htmlCache ??= storefrontHtml();
      const html = await htmlCache;
      if (!cancelled) iframe.srcdoc = html;
    });
    return () => { cancelled = true; void bridge.close(); };
    // One frame per tool result; the inputs never change for a mounted frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { bridgeRef.current?.setHostContext({ theme: p.theme }); }, [p.theme]);

  return <iframe ref={ref} title={`Shelf Storefront: ${p.toolName}`} className={styles.frame} style={{ height }} sandbox="allow-scripts allow-forms allow-popups" />;
}
