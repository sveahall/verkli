import { notFound } from "next/navigation";
import BookAnalysisPreview from "./BookAnalysisPreview";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <BookAnalysisPreview />;
}
