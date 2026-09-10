import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { requireAdminPageAccess } from "@/lib/admin-page-auth";
import { ToastProvider } from "@/components/ui/toast";
import { AdminNav } from "./_components/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPageAccess();

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-card px-4 py-8 lg:block">
          <div className="sticky top-8">
            <Link
              href="/admin"
              className="flex min-h-11 items-center rounded-xl px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Image src="/logo-dark.svg" alt="Verkli admin" width={120} height={32} className="h-8 w-auto dark:brightness-0 dark:invert" priority />
            </Link>
            <p className="mb-7 mt-3 px-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Platform administration</p>
            <AdminNav />
            <Link href="/reader/home" className="mt-8 flex min-h-11 items-center justify-between gap-3 border-t border-border px-3 pt-4 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Open Verkli <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </aside>

        {/* Mobile nav — horizontal scroll bar shown below lg */}
        <div className="min-w-0 border-b border-border bg-card px-5 py-4 lg:hidden">
          <div className="flex items-center justify-between">
            <Link href="/admin" className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Image src="/logo-dark.svg" alt="Verkli" width={100} height={28} className="h-7 w-auto dark:brightness-0 dark:invert" />
              <span className="border-l border-border pl-3 text-xs text-muted-foreground">Admin</span>
            </Link>
          </div>
          <div className="mt-3">
            <AdminNav />
          </div>
        </div>

        <main className="min-w-0 [&>.page-content]:max-w-[1360px] [&>.page-content]:px-5 sm:[&>.page-content]:px-8 lg:[&>.page-content]:px-10">{children}</main>
      </div>
    </ToastProvider>
  );
}
