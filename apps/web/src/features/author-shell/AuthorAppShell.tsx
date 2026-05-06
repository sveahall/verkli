"use client";

import CommandPaletteProvider from "@/features/author-shell/CommandPaletteProvider";
import AuthorSidebar from "@/features/author-shell/AuthorSidebar";
import DemoModeBadge from "@/features/author-shell/DemoModeBadge";
import DemoModeToggle from "@/features/author-shell/DemoModeToggle";
import MicroHookOverlay from "@/features/author-shell/MicroHookOverlay";
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
  // FixedViewportShell: under the investor-pitch demo we lock the app
  // shell to h-screen + overflow-hidden so the screen never scrolls
  // mid-pitch — every façade view fits the viewport by design. Real users
  // get the standard scrollable layout.
  const outerHeight = demoModeActive
    ? "h-screen overflow-hidden"
    : "min-h-screen";
  const innerHeight = demoModeActive
    ? "h-screen grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]"
    : "min-h-screen grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]";
  const mainOverflow = demoModeActive
    ? "min-w-0 overflow-y-auto"
    : "min-w-0 pb-20 lg:pb-0";

  return (
    <LocaleProvider locale={preferredLocale}>
      <AuthorWorkspaceProvider>
        <CommandPaletteProvider>
          <div className={`${outerHeight} bg-[#F8F9FD] text-foreground dark:bg-[#050917]`}>
            <div className={`grid ${innerHeight}`}>
              <AuthorSidebar demoModeActive={demoModeActive} />
              <main className={mainOverflow}>{children}</main>
            </div>
          </div>
          {demoModeActive ? <DemoModeBadge /> : null}
          <MicroHookOverlay enabled={demoModeActive} />
          <DemoModeToggle />
        </CommandPaletteProvider>
      </AuthorWorkspaceProvider>
    </LocaleProvider>
  );
}
