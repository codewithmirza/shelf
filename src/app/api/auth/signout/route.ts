import { SESSION_COOKIE, cookie, d1SessionRepo, readCookie } from "@/server/auth/session";
import { shelfEnv } from "@/server/http";

export async function POST(request: Request) {
  const id = readCookie(request, SESSION_COOKIE);
  if (id) await d1SessionRepo(shelfEnv().DB).deleteSession(id);
  return new Response(null, { status: 204, headers: { "set-cookie": cookie(SESSION_COOKIE, "", 0) } });
}
