import type { Metadata } from "next";
import { Desk } from "./desk";

export const metadata: Metadata = { title: "Shelf · Seller desk", robots: { index: false } };

// The Seller desk: the Seller app's products and orders as two grids, for a laptop (ADR-013).
export default function DeskPage() {
  return <Desk />;
}
