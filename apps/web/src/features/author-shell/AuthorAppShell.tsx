"use client";

import CommandPaletteProvider from "@/features/author-shell/CommandPaletteProvider";
import ContextPanelHost from "@/features/author-shell/ContextPanelHost";
import AuthorSidebar from "@/features/author-shell/AuthorSidebar";
import { AuthorWorkspaceProvider } from "@/features/author-shell/workspace-state";

export default function AuthorAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthorWorkspaceProvider>
      <CommandPaletteProvider>
        <div className="min-h-screen bg-[#f7f8fb] text-foreground dark:bg-[#030712]">
          <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_320px]">
            <AuthorSidebar />
            <main className="min-w-0 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
              {children}
            </main>
            <aside className="border-t border-black/[0.06] px-4 py-4 dark:border-white/10 lg:col-span-2 lg:px-6 lg:py-0 xl:col-span-1 xl:border-l xl:border-t-0 xl:px-4 xl:py-6">
              <ContextPanelHost />
            </aside>
          </div>
        </div>
      </CommandPaletteProvider>
    </AuthorWorkspaceProvider>
  );
}
