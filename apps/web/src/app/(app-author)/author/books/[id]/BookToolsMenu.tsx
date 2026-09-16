"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { BookOpen, ChevronDown, Image, LayoutGrid, Megaphone, Printer, Upload } from "lucide-react";
import { getMarketingEnabled } from "@/lib/flags";
import { getToolHref, type Tool } from "./editor/bookEditor.shared";

export default function BookToolsMenu({ bookId, language, demo = false }: { bookId: string; language?: string; demo?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  if (demo) return null;
  const links: Array<{ label: string; hint: string; tool: Tool; icon: typeof BookOpen; suffix?: string }> = [
    { label: "Book overview", hint: "Your manuscript and editions", tool: "dashboard", icon: LayoutGrid },
    { label: "Print & book layout", hint: "Front, spine, back and interior", tool: "cover", icon: BookOpen, suffix: "&layout=print" },
    { label: "Print options", hint: "Formats and distribution setup", tool: "print", icon: Printer },
    { label: "Import manuscript", hint: "Bring an existing draft into your book", tool: "import", icon: Upload },
    ...(getMarketingEnabled() ? [{ label: "Marketing", hint: "Campaign drafts with Stella", tool: "market" as Tool, icon: Megaphone }, { label: "Book trailer", hint: "Create and review a trailer", tool: "trailer" as Tool, icon: Image }] : []),
  ];
  return <details ref={ref} className="relative" onKeyDown={(event) => {
    if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
  }}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] font-medium [&::-webkit-details-marker]:hidden"><span className="hidden sm:inline">Book tools</span><LayoutGrid className="h-4 w-4 sm:hidden" aria-hidden /><ChevronDown size={14} aria-hidden /><span className="sr-only sm:hidden">Book tools</span></summary>
    <div className="absolute right-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-xl">
      {links.map(({ label, hint, tool, icon: Icon, suffix }) => <Link key={label} href={getToolHref(bookId, tool, language) + (suffix ?? "")} onClick={() => { if (ref.current) ref.current.open = false; }} className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:bg-accent"><Icon size={17} className="shrink-0 text-accent-foreground" aria-hidden /><span>{label}<span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span></span></Link>)}
    </div>
  </details>;
}
