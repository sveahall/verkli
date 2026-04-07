"use client";

import CommandPaletteProvider from "@/features/author-shell/CommandPaletteProvider";
import AuthorSidebar from "@/features/author-shell/AuthorSidebar";
import { AuthorWorkspaceProvider } from "@/features/author-shell/workspace-state";
import { LocaleProvider } from "@/lib/author-locale";

export default function AuthorAppShell({
  children,
  preferredLocale = null,
}: {
  children: React.ReactNode;
  preferredLocale?: string | null;
}) {
  return (
    <LocaleProvider locale={preferredLocale}>
      <AuthorWorkspaceProvider>
        <CommandPaletteProvider>
          <div className="min-h-screen bg-[#F0F1F6] text-foreground dark:bg-[#050917]">
            <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
              <AuthorSidebar />
              <main className="min-w-0 pb-20 lg:pb-0">
                {children}
              </main>
            </div>
          </div>
        </CommandPaletteProvider>
      </AuthorWorkspaceProvider>
    </LocaleProvider>
  );
}
