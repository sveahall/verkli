import type { Book } from "@/lib/marketing/types";

type BookSelectorProps = {
  books: Book[];
  value: string | null;
  onChange: (bookId: string) => void;
};

export default function BookSelector({ books, value, onChange }: BookSelectorProps) {
  return (
    <section className="card-base p-5">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Book</h2>
        <p className="text-[13px] text-slate-500 dark:text-white/50">
          Choose which book to promote.
        </p>
      </div>

      <select
        className="input-base"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {books.map((book) => (
          <option key={book.id} value={book.id}>
            {book.title?.trim() || "Untitled book"}
          </option>
        ))}
      </select>
    </section>
  );
}
