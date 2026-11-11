import { domainError } from "@/server/domain/errors";
import { errorResponse, json, nowIso, sellerContext } from "@/server/http";
import { revokeKey } from "@/server/seller/keys";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  return (await revokeKey(c.env.DB, c.storeId, (await params).id, nowIso())) ? json({ revoked: true }) : errorResponse(domainError("not_found"));
}
