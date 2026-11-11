import { requireStore } from "@/server/page_auth";
import { CheckDraft } from "./check-draft";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStore();
  return <CheckDraft id={(await params).id} />;
}
