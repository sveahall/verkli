import { notFound } from "next/navigation";
import OfflineReaderPreview from "./OfflineReaderPreview";

export default function OfflineReaderFixturePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <OfflineReaderPreview />;
}
