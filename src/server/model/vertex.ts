import { z } from "zod";
import { domainError, type DomainError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import { EXTRACTION_JSON_SCHEMA, SYSTEM_INSTRUCTION, extractionSchema, toOutcome, type ExtractionOutcome } from "./extraction";

// The only caller of Vertex AI (architecture rule 2). Calls go through Cloudflare AI Gateway, which holds the
// service-account key (ADR-006).
export const MODEL = "gemini-3.8-flash";
export const TIMEOUT_MS = 15_000;

export interface VertexDeps {
  readonly fetch: typeof fetch;
  readonly accountId: string;
  readonly gateway: string;
  readonly gatewayToken: string;
  readonly project: string;
  readonly location: string;
}

export function endpoint(d: VertexDeps): string {
  return (
    `https://gateway.ai.cloudflare.com/v1/${d.accountId}/${d.gateway}/google-vertex-ai` +
    `/v1/projects/${d.project}/locations/${d.location}/publishers/google/models/${MODEL}:generateContent`
  );
}

const responseSchema = z.object({
  candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(), finishReason: z.string().optional() })).min(1),
});

export interface PhotoInput {
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic";
  readonly base64: string;
}

export function requestBody(photo: PhotoInput): unknown {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: photo.mimeType, data: photo.base64 } }, { text: "Describe the product in this photo." }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseJsonSchema: EXTRACTION_JSON_SCHEMA },
  };
}

// Why an attempt failed. "schema" earns one more attempt (SYS-AI-04); "transport" is left to the queue's retries.
type AttemptFailure = { readonly kind: "transport"; readonly error: DomainError } | { readonly kind: "schema"; readonly detail: string };

async function attempt(d: VertexDeps, photo: PhotoInput): Promise<Result<ExtractionOutcome, AttemptFailure>> {
  let res: Response;
  try {
    res = await d.fetch(endpoint(d), {
      method: "POST",
      headers: { "content-type": "application/json", "cf-aig-authorization": `Bearer ${d.gatewayToken}` },
      body: JSON.stringify(requestBody(photo)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    return err({ kind: "transport", error: domainError(timedOut ? "upstream.timeout" : "model.unavailable", "network") });
  }
  if (!res.ok) return err({ kind: "transport", error: domainError("model.unavailable", `status ${res.status}`) });
  const envelope = responseSchema.safeParse(await res.json().catch(() => null));
  if (!envelope.success) return err({ kind: "schema", detail: "envelope" });
  const text = envelope.data.candidates[0]?.content?.parts.map((p) => p.text ?? "").join("") ?? "";
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return err({ kind: "schema", detail: "not json" }); }
  const parsed = extractionSchema.safeParse(raw);
  if (!parsed.success) return err({ kind: "schema", detail: parsed.error.issues.map((i) => i.path.join(".") || i.message).join(",").slice(0, 200) });
  return ok(toOutcome(parsed.data));
}

// Reads one photo. A schema failure is retried once; a second one is final and the photo becomes Failed (SYS-AI-04).
// A transport failure returns at once so the queue can retry later with backoff (SF-03).
export type ExtractFailure = { readonly kind: "retryable"; readonly error: DomainError } | { readonly kind: "final"; readonly reason: string };

export async function extractProduct(d: VertexDeps, photo: PhotoInput): Promise<Result<ExtractionOutcome, ExtractFailure>> {
  const first = await attempt(d, photo);
  if (first.ok) return first;
  if (first.error.kind === "transport") return err({ kind: "retryable", error: first.error.error });
  const second = await attempt(d, photo);
  if (second.ok) return second;
  if (second.error.kind === "transport") return err({ kind: "retryable", error: second.error.error });
  return err({ kind: "final", reason: `schema: ${second.error.detail}` });
}

export function depsFromEnv(env: { CF_ACCOUNT_ID: string; AIG_NAME: string; CF_AIG_TOKEN: string; GCP_PROJECT: string; GCP_LOCATION: string }): VertexDeps {
  return {
    fetch: (input, init) => fetch(input, init),
    accountId: env.CF_ACCOUNT_ID,
    gateway: env.AIG_NAME,
    gatewayToken: env.CF_AIG_TOKEN,
    project: env.GCP_PROJECT,
    location: env.GCP_LOCATION,
  };
}
