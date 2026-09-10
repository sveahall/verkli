import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { markOrderFailedForUser } from "@/lib/payments/purchase";

export default async function PurchaseCancelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { id: bookId } = await params;
  const query = await searchParams;
  const orderId = String(query.order_id ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && orderId) {
    await markOrderFailedForUser(orderId, user.id);
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-black/10 bg-card p-6 text-foreground shadow-sm dark:border-border dark:bg-card">
        <h1 className="text-2xl font-medium font-display">Purchase cancelled</h1>
        <p className="mt-3 text-sm text-foreground dark:text-muted-foreground">
          No charge was made. You can start checkout again whenever you like.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/reader/books/${bookId}`}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white dark:text-background"
          >
            Back to book
          </Link>
          <Link
            href="/reader/discover"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
          >
            Explore more books
          </Link>
        </div>
      </section>
    </main>
  );
}
