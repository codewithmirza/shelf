import { ERROR_INFO, type DomainError } from "../domain/errors";

// A tool failure: the Gate 5 screen text for people and models, the code for the Storefront (CQ-32).
// The detail is for logs only and never leaves the server.
export function toolError(e: DomainError) {
  const { message } = ERROR_INFO[e.code];
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
    structuredContent: { view: "error", error: { code: e.code, message } },
  };
}
