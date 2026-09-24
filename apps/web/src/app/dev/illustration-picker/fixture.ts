import { PICKER_PAGE_SIZE, type PickerModel, type PickerQuery } from "@/features/illustration-picker/contracts";
export const demoId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const books = [{ id: demoId(1), title: "The harbour" }, { id: demoId(10), title: "Empty notebook" }, ...Array.from({ length: 21 }, (_, i) => ({ id: demoId(100 + i), title: `Demo book ${i + 1}` }))];
function editions(book: string) { return book === demoId(10) ? [] : book === demoId(1) ? [{ id: demoId(2), title: "SV" }, { id: demoId(5), title: "EN" }] : [{ id: demoId(6), title: "SV" }]; }
export function demoChapters(book: string, edition: string) {
  if (book !== demoId(1)) return [];
  return edition === demoId(2) ? [{ id: demoId(3), title: "At the harbour" }, ...Array.from({ length: 22 }, (_, i) => ({ id: demoId(50 + i), title: `Island chapter ${i + 1}` }))] : [{ id: demoId(4), title: "Across the water" }];
}
export function demoPicker(query: PickerQuery): PickerModel {
  const book = query.book ? books.find((item) => item.id === query.book) ?? null : null;
  if (query.book && !book) throw new Error("Unknown demo book");
  const edition = query.edition && book ? editions(book.id).find((item) => item.id === query.edition) ?? null : null;
  if (query.edition && !edition) throw new Error("Unknown demo edition");
  const stage = !book ? "books" : !edition ? "editions" : "chapters";
  let items = !book ? books : !edition ? editions(book.id) : demoChapters(book.id, edition.id);
  if (query.q && stage !== "editions") items = items.filter((item) => item.title.toLowerCase().includes(query.q.toLowerCase()));
  const start = query.page * PICKER_PAGE_SIZE;
  return { query, book, edition, stage, hasNext: items.length > start + PICKER_PAGE_SIZE, items: items.slice(start, start + PICKER_PAGE_SIZE).map((item) => ({ ...item, detail: stage === "books" ? "Choose an edition" : stage === "editions" ? "Synthetic edition · 2026-09-23" : "Open image candidates" })) };
}
