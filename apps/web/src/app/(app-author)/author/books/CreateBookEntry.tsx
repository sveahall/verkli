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
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-80 active:opacity-70 dark:bg-[#ededed] dark:text-[#0A0A0B]"
      >
        Create book
      </button>
      <CreateBookDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
