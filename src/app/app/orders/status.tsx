"use client";

import type { SellerOrderSummary } from "@/server/refunds";
import { Status } from "../ui";

export const OrderStatus = ({ o }: { o: Pick<SellerOrderSummary, "state" | "refundRequest"> }) => {
  const r = o.refundRequest?.state;
  if (r === "pending") return <Status tone="wait" icon="undo">Refund requested</Status>;
  if (r === "approved") return <Status tone="wait" icon="undo">Refund on its way</Status>;
  if (o.state === "refunded") return <Status tone="neutral" icon="undo">Refunded</Status>;
  if (o.state === "shipped") return <Status tone="paid" icon="truck">Shipped</Status>;
  return <Status tone="paid" icon="check">Paid</Status>;
};
