import { notFound } from "next/navigation";
import AdDraftPreview from "./AdDraftPreview";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AdDraftPreview />;
}
