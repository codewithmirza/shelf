import { json, sellerContext } from "@/server/http";
import { listSellerOrders } from "@/server/refunds";

export async function GET(request: Request) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  return json({ orders: await listSellerOrders(c.env.DB, c.storeId) });
}
