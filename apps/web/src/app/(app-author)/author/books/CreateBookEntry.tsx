"use client";

import { useState } from "react";
import CreateBookDialog from "@/components/books/CreateBookDialog";

export default function CreateBookEntry({
  initialOpen = false,
}: {
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <>
      <button
        type="button"
        data-create-book
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#8E79FF] to-[#7A6EFF] px-5 py-2.5 text-[14px] font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
        Create book
      </button>
      <CreateBookDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
