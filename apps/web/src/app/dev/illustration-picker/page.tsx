import { notFound } from "next/navigation";
import { pickerQuerySchema } from "@/features/illustration-picker/contracts";
import PickerView from "@/features/illustration-picker/PickerView";
import { demoChapters, demoPicker } from "./fixture";
import DemoCandidate from "./DemoCandidate";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { chapter, ...raw } = await searchParams;
  const parsed = pickerQuerySchema.safeParse(raw);
  if (!parsed.success) notFound();
  let model;
  try { model = demoPicker(parsed.data); } catch { notFound(); }
  if (chapter) {
    const selected = model.book && model.edition ? demoChapters(model.book.id, model.edition.id).find((item) => item.id === chapter) : null;
    if (!selected || !model.book || !model.edition) notFound();
    const scope = { bookId: model.book.id, editionId: model.edition.id, chapterId: selected.id };
    return <main className="p-4 sm:p-8"><DemoCandidate key={`${scope.bookId}:${scope.editionId}:${scope.chapterId}`} scope={scope} title={selected.title} /></main>;
  }
  return <main className="p-4 sm:p-8"><PickerView model={model} base="/dev/illustration-picker" demo /></main>;
}
