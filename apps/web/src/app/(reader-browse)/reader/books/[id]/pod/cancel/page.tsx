import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { markPodOrderFailedForUser } from "@/lib/payments/pod";

export default async function PodCancelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pod_order_id?: string }>;
}) {
  const { id: bookId } = await params;
  const query = await searchParams;
  const podOrderId = String(query.pod_order_id ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && podOrderId) {
    await markPodOrderFailedForUser(podOrderId, user.id);
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-black/10 bg-white p-6 text-slate-900 shadow-sm dark:border-white/10 dark:bg-[#0f1115] dark:text-white">
        <h1 className="text-2xl font-semibold">Order cancelled</h1>
        <p className="mt-3 text-sm text-slate-700 dark:text-white/75">
          No charge was made. You can order a physical copy whenever you like.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/reader/books/${bookId}`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
          >
            Back to book
          </Link>
          <Link
            href="/reader/discover"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/20 dark:text-white"
          >
            Explore more books
          </Link>
        </div>
      </section>
    </main>
  );
}
