"use client";

import CommandPaletteProvider from "@/features/author-shell/CommandPaletteProvider";
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
        <div className="min-h-screen bg-[#F8F9FD] text-foreground dark:bg-[#050917]">
          <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)]">
            <AuthorSidebar />
            <main className="min-w-0 px-4 py-4 sm:px-6 lg:px-10 lg:py-6">
              {children}
            </main>
          </div>
        </div>
      </CommandPaletteProvider>
    </AuthorWorkspaceProvider>
  );
}
