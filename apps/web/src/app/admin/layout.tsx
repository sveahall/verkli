import Link from "next/link";
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
      <div className="min-h-screen lg:grid lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200/80 bg-white/60 px-4 py-8 lg:block dark:border-white/10 dark:bg-white/[0.02]">
          <div className="sticky top-8">
            <Link
              href="/admin"
              className="mb-6 flex items-center gap-2 px-3 text-[15px] font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:text-white"
            >
              <span className="text-brand-gradient">Verkli</span>
              <span className="text-slate-400 dark:text-white/40">Admin</span>
            </Link>
            <AdminNav />
          </div>
        </aside>

        {/* Mobile nav — horizontal scroll bar shown below lg */}
        <div className="border-b border-slate-200/80 bg-white/80 px-4 py-3 lg:hidden dark:border-white/10 dark:bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <Link href="/admin" className="text-[15px] font-semibold">
              <span className="text-brand-gradient">Verkli</span>{" "}
              <span className="text-slate-400 dark:text-white/40">Admin</span>
            </Link>
          </div>
          <div className="mt-3">
            <AdminNav />
          </div>
        </div>

        <main className="min-w-0">{children}</main>
      </div>
    </ToastProvider>
  );
}
