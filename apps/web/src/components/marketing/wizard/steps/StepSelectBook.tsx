"use client";
import Image from "next/image";
import { useTrailerWizard } from "@/components/marketing/wizard/WizardContext";
export default function StepSelectBook() {
  const { state, selectedBook, selectBook, canGoNext, goNext } = useTrailerWizard();
  return (
    <section className="space-y-4">
      <div className="card-base p-5">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Välj bok</h2>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">Välj boken du vill skapa en trailer för.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.books.map((book) => {
            const isSelected = book.id === state.selectedBookId;
            const hasCover = Boolean(book.cover_image);
            return (
              <button key={book.id} type="button" onClick={() => selectBook(book.id)} className={`group relative overflow-hidden rounded-xl border text-left transition ${isSelected ? "border-slate-900 ring-2 ring-slate-900 dark:border-white dark:ring-white" : "border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20"} ${!hasCover ? "opacity-60" : ""}`}>
                <div className="aspect-[2/3] w-full overflow-hidden bg-slate-100 dark:bg-white/5">
                  {book.cover_image ? <Image src={book.cover_image} alt={book.title ?? "Bok"} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover" /> : <div className="flex h-full items-center justify-center"><span className="text-[12px] text-slate-400 dark:text-white/30">Inget omslag</span></div>}
                </div>
                <div className="p-3"><p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">{book.title ?? "Namnlös bok"}</p>{!hasCover && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-white/30">Boken behöver ett omslag</p>}</div>
                {isSelected && <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end"><button type="button" onClick={goNext} disabled={!canGoNext} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">Fortsätt</button></div>
      {selectedBook && !selectedBook.cover_image && <p className="text-[12px] text-amber-600 dark:text-amber-400">Tips: Lägg till ett omslag för bättre resultat.</p>}
    </section>
  );
}
