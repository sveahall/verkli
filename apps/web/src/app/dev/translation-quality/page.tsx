import { notFound } from "next/navigation";
import TranslationQualityPreview from "./preview";

export default function TranslationQualityPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TranslationQualityPreview />;
}
