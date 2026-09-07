import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/reader/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPurchaseStatusUrl, isCheckoutIdentifier } from "@/lib/payments/checkout-status-url";

type OrderRow = {
  id: string;
  book_id: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  created_at: string | null;
};

type PodOrderRow = OrderRow & { format: string | null };
type DigitalOrderRow = OrderRow & {
  chapter_id: string | null;
  status_url: string | null;
};

type BookRow = {
  id: string;
  title: string | null;
  status: string | null;
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

// These are recorded order states, not independent confirmation of payment
// failure or finalized reading access. Only the status route verifies those.
const DIGITAL_STATUS_LABELS: Record<string, string> = {
  pending: "Payment status pending",
  paid: "Payment recorded",
  failed: "Payment unconfirmed",
};

type BadgeVariant = "neutral" | "success" | "warning" | "info" | "error";

function statusVariant(status: string | null): BadgeVariant {
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
  if (amountMinor == null || !currency) return "Amount unavailable";
  return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Date unavailable";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function displayText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeOrder(row: Record<string, unknown>, labels: Record<string, string>): OrderRow | null {
  if (!isCheckoutIdentifier(row.id)) return null;
  return {
    id: row.id,
    book_id: isCheckoutIdentifier(row.book_id) ? row.book_id : null,
    amount: typeof row.amount === "number" && Number.isSafeInteger(row.amount) && row.amount >= 0 ? row.amount : null,
    currency: typeof row.currency === "string" && /^[A-Za-z]{3}$/.test(row.currency) ? row.currency : null,
    status: typeof row.status === "string" && Object.hasOwn(labels, row.status) ? row.status : null,
    created_at: displayText(row.created_at),
  };
}

function normalizeDigitalOrder(value: unknown, userId: string): DigitalOrderRow | null {
  if (!isRecord(value) || value.user_id !== userId) return null;
  // An absent property is the legacy whole-book schema. Present malformed
  // values must never be relabelled as full-book purchases.
  if (Object.hasOwn(value, "chapter_id") && value.chapter_id !== null && !displayText(value.chapter_id)) return null;
  const order = normalizeOrder(value, DIGITAL_STATUS_LABELS);
  if (!order) return null;
  return {
    ...order,
    chapter_id: displayText(value.chapter_id),
    status_url: order.book_id ? getPurchaseStatusUrl(order.book_id, order.id, value.stripe_session_id) : null,
  };
}

function logReadError(source: string, reason: string, error?: unknown) {
  const code = isRecord(error) && typeof error.code === "string" && /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(error.code)
    ? error.code : "UNKNOWN";
  console.error("[reader orders] read unavailable", { source, reason, code });
}

async function readRows<T>(
  source: string,
  read: () => PromiseLike<{ data: unknown; error: unknown }>,
  normalize: (value: unknown) => T | null,
): Promise<{ rows: T[]; unavailable: boolean }> {
  try {
    const { data, error } = await read();
    if (error || !Array.isArray(data)) {
      logReadError(source, error ? "query_error" : "invalid_data", error);
      return { rows: [], unavailable: true };
    }
    const rows: T[] = [];
    let unavailable = false;
    for (const value of data) {
      const row = normalize(value);
      if (row) rows.push(row);
      else unavailable = true;
    }
    if (unavailable) logReadError(source, "invalid_rows");
    return { rows, unavailable };
  } catch (error) {
    logReadError(source, "transport_error", error);
    return { rows: [], unavailable: true };
  }
}

function ReadUnavailable({ message }: { message: string }) {
  return (
    <p role="status" className="text-[13px] text-slate-600 dark:text-white/70">
      {message}{" "}
      <a href="/reader/orders" className="font-medium text-[#907AFF] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40">
        Reload orders
      </a>
    </p>
  );
}

export default async function ReaderOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin?next=/reader/orders");
  }

  const [printed, digital] = await Promise.all([
    readRows("printed", () => supabase
      .from("pod_orders" as never)
      .select("id, book_id, format, amount, currency, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }), (value): PodOrderRow | null => {
        if (!isRecord(value)) return null;
        const order = normalizeOrder(value, POD_STATUS_LABELS);
        return order ? { ...order, format: displayText(value.format) } : null;
      }),
    readRows("digital", () => supabase
      .from("orders" as never)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }), (value) => normalizeDigitalOrder(value, user.id)),
  ]);
  const podOrders = printed.rows;
  const digitalOrders = digital.rows;

  const bookIds = Array.from(
    new Set(
      [...podOrders, ...digitalOrders]
        .map((o) => o.book_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const bookMap = new Map<string, BookRow>();
  let metadataUnavailable = false;
  if (bookIds.length > 0) {
    // Service role, scoped to this user's displayed orders: titles remain
    // visible after unpublish. This lookup grants no reading access.
    const metadata = await readRows("book metadata", () => createAdminClient()
      .from("books")
      .select("id, title, cover_image, status")
      .in("id", bookIds), (value): BookRow | null => {
        if (!isRecord(value) || !isCheckoutIdentifier(value.id) || !bookIds.includes(value.id)) return null;
        return { id: value.id, title: displayText(value.title), status: displayText(value.status) };
      });
    for (const book of metadata.rows) bookMap.set(book.id, book);
    metadataUnavailable = metadata.unavailable || bookIds.some((id) => !bookMap.get(id)?.title);
    if (metadataUnavailable && !metadata.unavailable) logReadError("book metadata", "missing_titles");
  }

  const hasOrders = podOrders.length > 0 || digitalOrders.length > 0;

  return (
    <div className="section-gap">
      <PageHeader
        eyebrow="Library"
        title="My orders"
        description="Your order history on Verkli — digital books and printed copies."
      />

      {!hasOrders && !digital.unavailable && !printed.unavailable ? (
        <EmptyState
          title="No orders yet"
          description="When you buy a book or order a printed copy, it'll show up here with its receipt details."
        />
      ) : (
        <div className="space-y-8">
          {metadataUnavailable && <ReadUnavailable message="Some book details are unavailable. Your order records are still shown." />}
          {(digitalOrders.length > 0 || digital.unavailable) && (
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
              {digital.unavailable && <ReadUnavailable message={digitalOrders.length ? "Some digital purchases are unavailable." : "Digital purchases are unavailable right now."} />}
              <ul className="space-y-3">
                {digitalOrders.map((order) => {
                  const book = order.book_id ? bookMap.get(order.book_id) : null;
                  const title = book?.title ?? "Title unavailable";
                  const statusLabel = order.status ? DIGITAL_STATUS_LABELS[order.status] : "Payment status unavailable";
                  const isListed = String(book?.status ?? "").toUpperCase() === "PUBLISHED";
                  const href = order.book_id && isListed ? `/reader/books/${order.book_id}` : null;

                  return (
                    <li
                      key={order.id}
                      className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 break-words">
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
                            Placed {formatDate(order.created_at)}
                          </p>
                          <p className="mt-1 break-all text-[11px] text-slate-400 dark:text-white/35">
                            Order {order.id}
                          </p>
                          {order.status_url ? (
                            <div className="mt-2 space-y-1 text-[12px]">
                              <Link href={order.status_url} prefetch={false} className="font-medium text-[#907AFF] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40">
                                Check purchase status
                              </Link>
                              <p className="text-slate-500 dark:text-white/55">Payment and access are checked on the status page.</p>
                            </div>
                          ) : (
                            <p className="mt-2 text-[12px] text-slate-500 dark:text-white/55">
                              Purchase status link unavailable.{" "}
                              <Link href="/support" className="font-medium text-[#907AFF] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40">
                                Contact support
                              </Link>{" "}
                              with this order ID for help.
                            </p>
                          )}
                        </div>
                        <div className="flex max-w-full flex-col items-end gap-1.5">
                          <p className="text-[13px] font-semibold tabular-nums text-slate-800 dark:text-white/85">
                            {formatAmount(order.amount, order.currency)}
                          </p>
                          <Badge variant={statusVariant(order.status)} className="max-w-full whitespace-normal">
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

          {(podOrders.length > 0 || printed.unavailable) && (
            <section className="space-y-3">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Printed copies
                </h2>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-white/55">
                  Delivery takes 7–14 business days after printing.
                </p>
              </div>
              {printed.unavailable && <ReadUnavailable message={podOrders.length ? "Some printed copies are unavailable." : "Printed copies are unavailable right now."} />}
              <ul className="space-y-3">
                {podOrders.map((order) => {
                  const book = order.book_id ? bookMap.get(order.book_id) : null;
                  const title = book?.title ?? "Title unavailable";
                  const statusLabel = order.status ? POD_STATUS_LABELS[order.status] : "Status unavailable";
                  const isListed = String(book?.status ?? "").toUpperCase() === "PUBLISHED";
                  const href = order.book_id && isListed ? `/reader/books/${order.book_id}` : null;

                  return (
                    <li
                      key={order.id}
                      className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 break-words">
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
                        <div className="flex max-w-full flex-col items-end gap-1.5">
                          <p className="text-[13px] font-semibold tabular-nums text-slate-800 dark:text-white/85">
                            {formatAmount(order.amount, order.currency)}
                          </p>
                          <Badge variant={statusVariant(order.status)} className="max-w-full whitespace-normal">
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
