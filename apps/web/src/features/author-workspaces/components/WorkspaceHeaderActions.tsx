"use client";

import { Search } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";

export default function WorkspaceHeaderActions() {
  return (
    <div className="flex items-center gap-2.5 pr-0.5">
      <button
        type="button"
        aria-label="Search"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("author-shell:open-command-palette"),
          )
        }
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[#98A0B3] transition hover:bg-slate-100 hover:text-slate-600 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/70"
      >
        <Search className="h-5 w-5" />
      </button>
      <NotificationBell />
    </div>
  );
}
