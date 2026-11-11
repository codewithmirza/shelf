import { requireStore } from "@/server/page_auth";
import { OrderDetail } from "./order-detail";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStore();
  return <OrderDetail id={(await params).id} />;
}
