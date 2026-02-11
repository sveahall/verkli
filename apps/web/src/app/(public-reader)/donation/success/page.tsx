import Link from "next/link";

export default function DonationSuccessPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-black/10 bg-white p-6 text-slate-900 shadow-sm dark:border-white/10 dark:bg-[#0f1115] dark:text-white">
        <h1 className="text-2xl font-semibold">Tack för din donation</h1>
        <p className="mt-3 text-sm text-slate-700 dark:text-white/75">
          Betalningen är registrerad. Credits och donationstatus uppdateras automatiskt via webhook.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/reader/home"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
          >
            Till reader home
          </Link>
          <Link
            href="/reader/discover"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/20 dark:text-white"
          >
            Utforska böcker
          </Link>
        </div>
      </section>
    </main>
  );
}
