import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, d1SessionRepo, type Seller } from "./auth/session";
import { shelfEnv } from "./http";

// Server pages of the Seller app: no session goes to sign-in; no store goes to "Name your store".
export async function pageSeller(): Promise<Seller | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  return id ? d1SessionRepo(shelfEnv().DB).sellerForSession(id, new Date().toISOString()) : null;
}

export async function requireStore(): Promise<Seller & { storeId: NonNullable<Seller["storeId"]> }> {
  const s = await pageSeller();
  if (!s) redirect("/app");
  if (!s.storeId) redirect("/app/new-store");
  return s as Seller & { storeId: NonNullable<Seller["storeId"]> };
}
