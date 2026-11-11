# SPK-04 · Vertex gemini-3.8-flash through AI Gateway

**Status.** Code ready, live run not done. It waits for S-03 (GCP project, service account in AI Gateway).

## What is proved offline
- `src/server/model/vertex.ts` builds the ADR-006 endpoint and the `cf-aig-authorization` header (test checks the exact URL).
- The request sets `responseMimeType: application/json` and `responseJsonSchema` (Gate 5), temperature 0.2, and the Gate 5 system instruction.
- Every answer is parsed with zod locally, so a model that ignores the schema can never write a bad draft (CQ-21, SYS-AI-04).
- A schema break is retried once, then final. A transport failure returns at once for the queue to retry (SF-03).

## Open risk
- Whether Vertex accepts `responseJsonSchema` (full JSON Schema, needed for the `options` map) through the gateway. If it refuses, switch to `responseSchema` and send `options` as an array of `{name, value}` pairs, then map back. Record the answer here.

## Live run (to do)
Put five photos in `tests/fixtures/photos/1.jpg` … `5.jpg` and run the command in `tests/fixtures/photos/README.md`. Record per photo: time, valid or not, and the auth path used.
