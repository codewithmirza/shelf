import { redirect } from "next/navigation";
import { pageSeller } from "@/server/page_auth";
import { ProductsScreen } from "./products-screen";
import { SignIn } from "./sign-in";

export const dynamic = "force-dynamic";

// /app: sign in (A1), or the products list (A3, A8).
export default async function SellerHome({ searchParams }: { searchParams: Promise<{ signin?: string; why?: string }> }) {
  const seller = await pageSeller();
  const q = await searchParams;
  if (!seller) return <SignIn outcome={q.signin ?? null} step={q.why ?? null} />;
  if (!seller.storeId) redirect("/app/new-store");
  return <ProductsScreen />;
}
