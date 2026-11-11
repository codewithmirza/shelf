import { requireStore } from "@/server/page_auth";
import { StoreScreen } from "./store-screen";

export const dynamic = "force-dynamic";

export default async function StorePage() {
  await requireStore();
  return <StoreScreen />;
}
