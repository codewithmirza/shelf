import { App } from "@modelcontextprotocol/ext-apps";
import { parseView, type View } from "./views";

// The only place the Storefront talks to the host (ADR-009). Every tool call returns a parsed view.
export const app = new App({ name: "Shelf Storefront", version: "0.1.0" });

const UNREADABLE = "Shelf sent something this view can't show. Ask in the chat instead.";

export async function call(name: string, args: Record<string, unknown>): Promise<View> {
  const result = await app.callServerTool({ name, arguments: args });
  const view = parseView(result.structuredContent);
  if (view) return view;
  return { view: "error", error: { code: "server.error", message: UNREADABLE } };
}

// Opens the Pay page in the buyer's browser (ADR-005). False when the host refuses (FC-BUY-03-03).
export async function openLink(url: string): Promise<boolean> {
  try {
    const r = await app.openLink({ url });
    return !r.isError;
  } catch {
    return false;
  }
}

// Tells the model what the buyer did in the Storefront, so the chat stays in step.
export function tellModel(text: string): void {
  app.updateModelContext({ content: [{ type: "text", text }] }).catch(() => undefined);
}

// "Paid. Order {id}." into the chat, if the host allows it (DESIGN-SYSTEM "The Paid moment").
export function postMessage(text: string): void {
  app.sendMessage({ role: "user", content: [{ type: "text", text }] }).catch(() => undefined);
}
