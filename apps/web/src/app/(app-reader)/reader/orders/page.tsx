import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/reader/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

/**
 * A digital book (or single-chapter) purchase. Read from `orders`, which until
 * now was consumed only by the author's revenue stats — so a buyer had no order
 * history for the thing they actually bought.
 */
type DigitalOrderRow = {
  id: string;
  book_id: string | null;
  chapter_id: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  created_at: string;
};

type BookRow = {
  id: string;
  title: string | null;
  cover_image: string | null;
};

const POD_STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid — preparing for print",
  printed: "Printed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
};

/**
 * `pending` covers delayed-notification methods (Klarna, Swish, SEPA) that
 * settle after checkout, so the copy must not read as an error.
 */
const DIGITAL_STATUS_LABELS: Record<string, string> = {
  pending: "Payment processing",
  paid: "Paid",
  failed: "Payment failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

type BadgeVariant = "neutral" | "success" | "warning" | "info" | "error";

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case "paid":
    case "delivered":
      return "success";
    case "printed":
    case "shipped":
      return "info";
    case "pending":
      return "warning";
    case "failed":
    case "cancelled":
      return "error";
    default:
      return "neutral";
  }
}

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

  const [{ data: podRows }, { data: digitalRows }] = await Promise.all([
    supabase
      .from("pod_orders" as never)
      .select(
        "id, book_id, format, amount, currency, status, created_at, updated_at, shipping_address",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders" as never)
      .select("id, book_id, chapter_id, amount, currency, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const podOrders = (podRows ?? []) as PodOrderRow[];
  const digitalOrders = (digitalRows ?? []) as DigitalOrderRow[];

  const bookIds = Array.from(
    new Set(
      [...podOrders, ...digitalOrders]
        .map((o) => o.book_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const bookMap = new Map<string, BookRow>();
  if (bookIds.length > 0) {
    // Service role, scoped to books this user actually ordered: an order the
    // buyer placed must keep its title even after the author unpublishes, and
    // the reader's RLS on `books` keys off publication.
    const { data: bookRows } = await createAdminClient()
      .from("books")
      .select("id, title, cover_image")
      .in("id", bookIds);

    for (const row of (bookRows ?? []) as BookRow[]) {
      bookMap.set(row.id, row);
    }
  }

  const hasOrders = podOrders.length > 0 || digitalOrders.length > 0;

  return (
    <div className="section-gap">
      <PageHeader
        eyebrow="Library"
        title="My orders"
        description="Every purchase you've made on Verkli — digital books and printed copies."
      />

      {!hasOrders ? (
        <EmptyState
          title="No orders yet"
          description="When you buy a book or order a printed copy, it'll show up here with its receipt details."
        />
      ) : (
        <div className="space-y-8">
          {digitalOrders.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Digital purchases
                </h2>
                <Link
                  href="/reader/library"
                  className="text-[12px] font-medium text-[#907AFF] transition-colors hover:text-[#7058DD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2"
                >
                  Go to library
                </Link>
              </div>
              <ul className="space-y-3">
                {digitalOrders.map((order) => {
                  const book = order.book_id ? bookMap.get(order.book_id) : null;
                  const title = book?.title ?? "Unknown book";
                  const statusLabel =
                    DIGITAL_STATUS_LABELS[order.status] ?? order.status;
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
                            {order.chapter_id ? "Single chapter · " : "Full book · "}
                            Bought {formatDate(order.created_at)}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-white/35">
                            Order {order.id}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <p className="text-[13px] font-semibold tabular-nums text-slate-800 dark:text-white/85">
                            {formatAmount(order.amount, order.currency)}
                          </p>
                          <Badge variant={statusVariant(order.status)}>
                            {statusLabel}
                          </Badge>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {podOrders.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Printed copies
                </h2>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-white/55">
                  Delivery takes 7–14 business days after printing.
                </p>
              </div>
              <ul className="space-y-3">
                {podOrders.map((order) => {
                  const book = order.book_id ? bookMap.get(order.book_id) : null;
                  const title = book?.title ?? "Unknown book";
                  const statusLabel = POD_STATUS_LABELS[order.status] ?? order.status;
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
                        <div className="flex flex-col items-end gap-1.5">
                          <p className="text-[13px] font-semibold tabular-nums text-slate-800 dark:text-white/85">
                            {formatAmount(order.amount, order.currency)}
                          </p>
                          <Badge variant={statusVariant(order.status)}>
                            {statusLabel}
                          </Badge>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
