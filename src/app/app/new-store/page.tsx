import { redirect } from "next/navigation";
import { pageSeller } from "@/server/page_auth";
import { NewStoreForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewStore() {
  const seller = await pageSeller();
  if (!seller) redirect("/app");
  if (seller.storeId) redirect("/app");
  return <NewStoreForm />;
}
