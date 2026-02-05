"use client";

import { useState } from "react";
import CreateBookDialog from "@/components/books/CreateBookDialog";

export default function CreateBookEntry() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-create-book
        onClick={() => setOpen(true)}
        className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
      >
        Create book
      </button>
      <CreateBookDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
