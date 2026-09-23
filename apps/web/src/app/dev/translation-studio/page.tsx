import { notFound } from "next/navigation";
import TranslationStudioPreview from "./TranslationStudioPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <TranslationStudioPreview />;
}
