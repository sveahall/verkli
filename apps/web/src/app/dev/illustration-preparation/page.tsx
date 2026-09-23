import { notFound } from "next/navigation";
import PreparationPanel from "@/features/illustration-preparation/PreparationPanel";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <><p className="mx-auto max-w-6xl px-4 pt-6 text-sm text-muted-foreground">Development preview. Downloads are real local files; no book data is loaded or saved.</p><PreparationPanel /></>;
}
