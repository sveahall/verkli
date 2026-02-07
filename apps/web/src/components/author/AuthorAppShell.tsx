import type { ReactNode } from "react";
import NavbarShell from "@/nav/NavbarShell";

export default function AuthorAppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-[#07070c] dark:via-[#0b0b12] dark:to-[#0f111a]">
      <NavbarShell variant="APP_AUTHOR" />
      {children}
    </div>
  );
}
