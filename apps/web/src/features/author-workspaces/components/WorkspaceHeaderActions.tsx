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
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Search className="h-5 w-5" />
      </button>
      <NotificationBell />
    </div>
  );
}
