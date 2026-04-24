import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import EmptyState from "@/components/reader/EmptyState";
import { createClient } from "@/lib/supabase/server";

type PodOrderRow = {
  id: string;
  book_id: string | null;
  format: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  shipping_address: Record<string, unknown> | null;
};

type BookRow = {
  id: string;
  title: string | null;
  cover_image: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid — preparing for print",
  printed: "Printed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
};

function formatAmount(amountMinor: number | null, currency: string | null): string {
  if (amountMinor == null || !currency) return "—";
  return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export default async function ReaderOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin?next=/reader/orders");
  }

  const { data: orderRows } = await supabase
    .from("pod_orders" as never)
    .select(
      "id, book_id, format, amount, currency, status, created_at, updated_at, shipping_address",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const orders = (orderRows ?? []) as PodOrderRow[];
  const bookIds = Array.from(
    new Set(orders.map((o) => o.book_id).filter((id): id is string => Boolean(id))),
  );

  const bookMap = new Map<string, BookRow>();
  if (bookIds.length > 0) {
    const { data: bookRows } = await supabase
      .from("books")
      .select("id, title, cover_image")
      .in("id", bookIds);

    for (const row of (bookRows ?? []) as BookRow[]) {
      bookMap.set(row.id, row);
    }
  }

  return (
    <div className="section-gap">
      <PageHeader
        eyebrow="Library"
        title="My orders"
        description="Print-on-demand orders you've placed. Delivery takes 7–14 business days after printing."
      />

      {orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="When you order a printed copy of a book, it'll show up here with its status."
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const book = order.book_id ? bookMap.get(order.book_id) : null;
            const title = book?.title ?? "Unknown book";
            const statusLabel = STATUS_LABELS[order.status] ?? order.status;
            const href = order.book_id ? `/reader/books/${order.book_id}` : null;

            return (
              <li
                key={order.id}
                className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/[0.04]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                      {href ? (
                        <Link href={href} className="hover:underline">
                          {title}
                        </Link>
                      ) : (
                        title
                      )}
                    </p>
                    <p className="mt-1 text-[12px] text-slate-500 dark:text-white/55">
                      {order.format ? `Format: ${order.format}` : null}
                      {order.format ? " · " : null}
                      Placed {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-white/85">
                      {formatAmount(order.amount, order.currency)}
                    </p>
                    <p className="mt-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70">
                      {statusLabel}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
