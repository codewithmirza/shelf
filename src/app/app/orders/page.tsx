import { requireStore } from "@/server/page_auth";
import { OrdersScreen } from "./orders-screen";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await requireStore();
  return <OrdersScreen />;
}
