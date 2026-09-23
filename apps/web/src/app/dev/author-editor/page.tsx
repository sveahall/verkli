import { notFound } from "next/navigation";
import EditorPreview from "./EditorPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <EditorPreview />;
}
