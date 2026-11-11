import { requireStore } from "@/server/page_auth";
import { AddPhotos } from "./add-photos";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  await requireStore();
  return <AddPhotos />;
}
