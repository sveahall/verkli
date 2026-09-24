import { z } from "zod";
const uuid = z.string().uuid().transform((value) => value.toLowerCase());
export const pickerQuerySchema = z.object({
  book: uuid.optional(), edition: uuid.optional(), q: z.string().trim().max(120).default(""),
  page: z.string().regex(/^\d{1,5}$/).default("0").transform(Number).pipe(z.number().max(10_000)),
}).strict().refine((value) => !value.edition || Boolean(value.book), "Choose a book first.");
export type PickerQuery = z.infer<typeof pickerQuerySchema>;
export type PickerModel = {
  stage: "books" | "editions" | "chapters";
  query: PickerQuery;
  book: { id: string; title: string } | null;
  edition: { id: string; title: string } | null;
  items: Array<{ id: string; title: string; detail: string }>;
  hasNext: boolean;
};
export const PICKER_PAGE_SIZE = 20;
export function pickerUrl(base: string, values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) if (value !== undefined && value !== "") query.set(name, String(value));
  return `${base}${query.size ? `?${query}` : ""}`;
}
export function candidatePage(book: string, edition: string, chapter: string) {
  return `/author/books/${book}/editions/${edition}/chapters/${chapter}/illustrations`;
}
