import { json, sellerContext } from "@/server/http";
import { listProducts } from "@/server/seller/products";

export async function GET(request: Request) {
  const c = await sellerContext(request);
  if (!c.ok) return c.response;
  return json({ products: await listProducts(c.env.DB, c.storeId) });
}
