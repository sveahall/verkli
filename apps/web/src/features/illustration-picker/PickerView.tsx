import Link from "next/link";
import { candidatePage, pickerUrl, type PickerModel } from "./contracts";

const button = "inline-flex items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-medium";
const titles = { books: "Choose a book", editions: "Choose an edition", chapters: "Choose a chapter" };
export default function PickerView({ model, base = "/author/illustrations", demo = false }: { model: PickerModel; base?: string; demo?: boolean }) {
  const { book, edition, query, stage } = model;
  function destination(id: string) {
    if (stage === "books") return pickerUrl(base, { book: id });
    if (stage === "editions") return pickerUrl(base, { book: book!.id, edition: id });
    return demo ? pickerUrl(base, { book: book!.id, edition: edition!.id, chapter: id }) : candidatePage(book!.id, edition!.id, id);
  }
  const nextPage = (page: number) => pickerUrl(base, { book: book?.id, edition: edition?.id, q: query.q, page });
  return <section className="mx-auto max-w-5xl space-y-6" aria-labelledby="picker-heading">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Book studio / illustrations</p><h1 id="picker-heading" className="mt-2 text-3xl font-semibold tracking-tight">Illustration workspace</h1><p className="mt-3 max-w-2xl text-sm text-muted-foreground">Choose where to prepare a private image candidate. Saving a candidate does not insert it into the manuscript.</p></header>
    {demo && <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><strong>Local demo — synthetic books only.</strong> Saving in the next view is simulated in memory. No database, storage or AI calls.</p>}
    <nav aria-label="Illustration selection" className="flex flex-wrap gap-2 text-sm"><Link href={base} className="rounded-lg border px-3 py-2">1. Your books</Link>{book && <Link href={pickerUrl(base, { book: book.id })} className="max-w-full break-words rounded-lg border px-3 py-2">2. {book.title}</Link>}{edition && <span className="rounded-lg border px-3 py-2">3. {edition.title}</span>}</nav>
    <div className="space-y-4 rounded-2xl border border-border p-5 sm:p-6"><h2 className="text-xl font-semibold">{titles[stage]}</h2>
      {stage !== "editions" && <form method="get" action={base} className="flex flex-wrap items-end gap-3">
        {book && <input type="hidden" name="book" value={book.id} />}{edition && <input type="hidden" name="edition" value={edition.id} />}
        <label className="min-w-0 basis-full text-sm font-medium sm:flex-1 sm:basis-auto">{stage === "books" ? "Search book titles" : "Search chapter titles"}<input key={`${stage}:${query.q}`} name="q" type="search" defaultValue={query.q} maxLength={120} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm" /></label><button className={button}>Search</button>
        {query.q && <Link className={button} href={pickerUrl(base, { book: book?.id, edition: edition?.id })}>Clear search</Link>}
      </form>}
      {!model.items.length ? <div className="rounded-xl bg-muted/40 p-6"><p>{query.q ? "No matching titles. Try a different search." : query.page > 0 ? "No more results on this page. Return to the previous page." : stage === "books" ? "No active books yet. Create a book in your library to prepare image candidates." : stage === "editions" ? "This book has no editions yet." : "This edition has no active chapters yet."}</p>{stage === "books" && !demo && !query.q && <Link className={`${button} mt-4`} href="/author/library">Open your library</Link>}</div> : <ul className="grid gap-3 sm:grid-cols-2">{model.items.map((item) => <li key={item.id} className="min-w-0"><Link href={destination(item.id)} className="block h-full rounded-xl border border-border p-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2"><h3 className="break-words font-medium">{item.title}</h3><p className="mt-2 text-sm text-muted-foreground">{item.detail}</p></Link></li>)}</ul>}
      <nav aria-label="Results pages" className="flex flex-wrap items-center justify-between gap-3"><div>{query.page > 0 && <Link className={button} href={nextPage(query.page - 1)}>Previous page</Link>}</div><span className="text-sm text-muted-foreground">Page {query.page + 1}</span><div>{model.hasNext && <Link className={button} href={nextPage(query.page + 1)}>Next page</Link>}</div></nav>
    </div>
  </section>;
}
