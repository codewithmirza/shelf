import { redirect } from "next/navigation";
import { pageSeller } from "@/server/page_auth";
import { ProductsScreen } from "./products-screen";
import { SignIn } from "./sign-in";

export const dynamic = "force-dynamic";

// /app: sign in (A1), or the products list (A3, A8).
export default async function SellerHome({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const seller = await pageSeller();
  if (!seller) return <SignIn outcome={(await searchParams).signin ?? null} />;
  if (!seller.storeId) redirect("/app/new-store");
  return <ProductsScreen />;
}
