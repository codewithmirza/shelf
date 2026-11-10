# ADR-006 · Gemini 3.8 Flash on Vertex AI through Cloudflare AI Gateway

**Status.** Proposed, 10 Nov 2026. The founder chose Vertex AI and Gemini Flash (C-5).

**In one line.** `src/server/model/` calls `gemini-3.8-flash` on Vertex AI (location `global`) through the AI Gateway `google-vertex-ai` provider, which holds the service-account key and signs requests.

## Context
- `gemini-3.8-flash` is GA since 2 Sep 2026: 1,048,576 input and 65,536 output tokens; image input; JSON schema output. Introductory price $0.75 and $3.75 per million tokens until 31 Dec 2026, then $1.50 and $7.50.
- AI Gateway docs: with a stored service-account JSON, "AI Gateway handles the Vertex AI authentication automatically".
- One public issue reports Vertex project auth failing on Workers in another stack.

## Options
| | AI Gateway (chosen) | Service-account JWT signed with WebCrypto | Gemini API key |
| --- | --- | --- | --- |
| Uses GCP credits | Yes | Yes | No |
| Code | Small | About 60 lines | Small |
| Logs and caching | Yes | No | No |

## Decision
1. Endpoint: `https://gateway.ai.cloudflare.com/v1/{CF_ACCOUNT_ID}/{AIG_NAME}/google-vertex-ai/v1/projects/{GCP_PROJECT}/locations/global/publishers/google/models/gemini-3.8-flash:generateContent`, header `cf-aig-authorization: Bearer {CF_AIG_TOKEN}`.
2. Request: the image as inline data, a system instruction, `generationConfig.responseMimeType: "application/json"` and `responseSchema` (Gate 5).
3. Temperature 0.2. One retry on a schema failure.
4. Fallback: sign a service-account JWT (RS256) with WebCrypto and call Vertex directly.
5. The Try page chat uses the same model with function calling over the Shelf tools (ADR-010).

## Consequences
- AI Gateway logs must not store photo content beyond the gateway's retention. Turn off request logging for the gateway if available.
