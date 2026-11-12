import type { ShelfEnv } from "@/env";
import type { WhatsAppDeps } from "./graph";

// The WhatsApp channel is on only when the Worker has a token and a phone number ID (ADR-012).
export const whatsappDeps = (env: ShelfEnv): WhatsAppDeps | null =>
  env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? { fetch: (i, init) => fetch(i, init), token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID } : null;
