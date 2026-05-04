"use client";

import CommandPaletteProvider from "@/features/author-shell/CommandPaletteProvider";
import AuthorSidebar from "@/features/author-shell/AuthorSidebar";
import DemoModeToggle from "@/features/author-shell/DemoModeToggle";
import { AuthorWorkspaceProvider } from "@/features/author-shell/workspace-state";
import { LocaleProvider } from "@/lib/author-locale";

export default function AuthorAppShell({
  children,
  preferredLocale = null,
  demoModeActive = false,
}: {
  children: React.ReactNode;
  preferredLocale?: string | null;
  /** True when the deployment-level demo flag is on AND the signed-in
   * profile has demo_mode=true. Drives the demo-only "Production" entry
   * in the sidebar. */
  demoModeActive?: boolean;
}) {
  return (
    <LocaleProvider locale={preferredLocale}>
      <AuthorWorkspaceProvider>
        <CommandPaletteProvider>
          <div className="min-h-screen bg-[#F8F9FD] text-foreground dark:bg-[#050917]">
            <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
              <AuthorSidebar demoModeActive={demoModeActive} />
              <main className="min-w-0 pb-20 lg:pb-0">
                {children}
              </main>
            </div>
          </div>
          <DemoModeToggle />
        </CommandPaletteProvider>
      </AuthorWorkspaceProvider>
    </LocaleProvider>
  );
}
