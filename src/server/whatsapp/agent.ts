import { z } from "zod";
import { authHeaders, endpoint, type VertexDeps } from "../model/vertex";
import type { Outgoing } from "./graph";

// A small function-calling loop on Gemini (ADR-012). The model chooses tools; the tools hold every rule.
// The model never sees an order token or a price it could change: tools read those from Shelf's records.

export interface FunctionDeclaration {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export interface ToolRun {
  // What the model reads back.
  readonly result: unknown;
  // Messages Shelf sends itself, before the model's reply: product photos, a Pay link. Exact, never retyped by the model.
  readonly outgoing?: readonly Outgoing[];
}

export interface AgentTool {
  readonly declaration: FunctionDeclaration;
  run(args: Record<string, unknown>): Promise<ToolRun>;
}

export interface Turn {
  readonly role: "user" | "model";
  readonly text: string;
}

export const MAX_STEPS = 6;
export const HISTORY_TURNS = 16;
const TIMEOUT_MS = 25_000;

const partSchema = z.object({
  text: z.string().optional(),
  thought: z.boolean().optional(),
  functionCall: z.object({ name: z.string(), args: z.record(z.string(), z.unknown()).optional() }).optional(),
}).passthrough();
const answerSchema = z.object({
  candidates: z.array(z.object({ content: z.object({ role: z.string().optional(), parts: z.array(partSchema) }).optional() })).min(1),
});

type Content = { role: "user" | "model"; parts: unknown[] };

export interface AgentReply {
  readonly text: string;
  readonly outgoing: readonly Outgoing[];
}

export async function runAgent(
  vertex: VertexDeps,
  system: string,
  history: readonly Turn[],
  userText: string,
  tools: readonly AgentTool[],
): Promise<AgentReply> {
  const byName = new Map(tools.map((t) => [t.declaration.name, t]));
  const contents: Content[] = [...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })), { role: "user", parts: [{ text: userText }] }];
  const outgoing: Outgoing[] = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await vertex
      .fetch(endpoint(vertex), {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(vertex) },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          tools: [{ functionDeclarations: tools.map((t) => t.declaration) }],
          generationConfig: { temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      .catch(() => null);
    const body = res?.ok ? answerSchema.safeParse(await res.json().catch(() => null)) : null;
    if (!body?.success) {
      console.log(JSON.stringify({ level: "warn", job: "whatsapp.agent", status: res?.status ?? 0 }));
      return { text: "Sorry, I couldn't think that through just now. Please try again in a minute.", outgoing };
    }
    const parts = body.data.candidates[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (calls.length === 0) {
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
      return { text: text || "Done.", outgoing };
    }
    // The model's turn goes back verbatim: Gemini needs its thought signatures with each function call.
    contents.push({ role: "model", parts });
    const responses: unknown[] = [];
    for (const p of calls) {
      const call = p.functionCall!;
      const tool = byName.get(call.name);
      let result: unknown;
      if (!tool) result = { error: `No tool named ${call.name}.` };
      else {
        try {
          const r = await tool.run(call.args ?? {});
          result = r.result;
          outgoing.push(...(r.outgoing ?? []));
        } catch (e) {
          console.log(JSON.stringify({ level: "error", job: "whatsapp.tool", tool: call.name, error: String(e).slice(0, 200) }));
          result = { error: "That step failed. Tell the person and suggest trying again." };
        }
      }
      responses.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return { text: "That took too many steps. Could you say it another way?", outgoing };
}

// Keeps the last turns as plain text. Tool calls are not kept between messages; tools re-read Shelf's records.
export function nextHistory(history: readonly Turn[], user: string, model: string): Turn[] {
  return [...history, { role: "user" as const, text: user.slice(0, 1000) }, { role: "model" as const, text: model.slice(0, 2000) }].slice(-HISTORY_TURNS);
}
