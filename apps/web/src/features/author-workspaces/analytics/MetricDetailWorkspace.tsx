"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Coins,
  MessageSquareText,
  ThumbsUp,
  UserRoundPlus,
  Users,
} from "lucide-react";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";

type Metric = "sales" | "readers" | "subscribers" | "comments" | "reviews";

type MetricDetailWorkspaceProps = {
  metric: Metric;
  summary: { total: number; change: number };
  rows: Array<Record<string, unknown>>;
  books: Array<{ id: string; title: string }>;
};

const METRIC_CONFIG: Record<
  Metric,
  {
    title: string;
    icon: typeof Coins;
    toneClassName: string;
    unit?: string;
  }
> = {
  sales: {
    title: "Försäljning",
    icon: Coins,
    toneClassName: "bg-[#EEF4FF] text-[#4F74E7]",
    unit: "SEK",
  },
  readers: {
    title: "Läsare",
    icon: Users,
    toneClassName: "bg-[#F2EDFF] text-[#8A72FF]",
  },
  subscribers: {
    title: "Prenumeranter",
    icon: UserRoundPlus,
    toneClassName: "bg-[#FCEFFF] text-[#E17AD5]",
  },
  comments: {
    title: "Kommentarer",
    icon: MessageSquareText,
    toneClassName: "bg-[#FFF3E8] text-[#F0A75B]",
  },
  reviews: {
    title: "Recensioner",
    icon: ThumbsUp,
    toneClassName: "bg-[#FFF8DB] text-[#D8B53D]",
  },
};

function formatDate(dateStr: unknown): string {
  if (typeof dateStr !== "string") return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateStr: unknown): string {
  if (typeof dateStr !== "string") return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    active:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    pending:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    unsubscribed:
      "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50",
    cancelled:
      "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        styles[status] ?? "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50"
      }`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function RatingStars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5 text-[#D8B53D]">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? "opacity-100" : half && i === full ? "opacity-60" : "opacity-20"}>
          ★
        </span>
      ))}
      <span className="ml-1 text-[12px] text-slate-500 dark:text-white/50">
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

function SalesTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) {
    return <EmptyState message="Inga ordrar ännu." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200/80 dark:border-white/10">
            <Th>Order</Th>
            <Th>Datum</Th>
            <Th>Bok</Th>
            <Th>Land</Th>
            <Th>Belopp</Th>
            <Th>Betalstatus</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)} className="transition hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
              <Td className="font-medium text-slate-900 dark:text-white">
                #{String(row.id ?? "").slice(0, 8)}
              </Td>
              <Td>{formatDateTime(row.date)}</Td>
              <Td>{String(row.bookTitle ?? "")}</Td>
              <Td>{String(row.country ?? "—")}</Td>
              <Td className="font-medium">
                {Number(row.amount ?? 0).toLocaleString("sv-SE")} {String(row.currency ?? "SEK")}
              </Td>
              <Td>
                <StatusBadge status={String(row.status ?? "pending")} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadersTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) {
    return <EmptyState message="Inga läsare ännu." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200/80 dark:border-white/10">
            <Th>Bok</Th>
            <Th>Läsare</Th>
            <Th>Senaste aktivitet</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)} className="transition hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
              <Td className="font-medium text-slate-900 dark:text-white">
                {String(row.bookTitle ?? "")}
              </Td>
              <Td>{Number(row.readerCount ?? 0).toLocaleString("sv-SE")}</Td>
              <Td>{formatDate(row.latestRead)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubscribersTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) {
    return <EmptyState message="Inga prenumeranter ännu." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200/80 dark:border-white/10">
            <Th>E-post</Th>
            <Th>Status</Th>
            <Th>Prenumererade</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)} className="transition hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
              <Td className="font-medium text-slate-900 dark:text-white">
                {String(row.email ?? "")}
              </Td>
              <Td>
                <StatusBadge status={String(row.status ?? "")} />
              </Td>
              <Td>{formatDate(row.date)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommentsTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) {
    return <EmptyState message="Inga kommentarer ännu." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200/80 dark:border-white/10">
            <Th>Bok</Th>
            <Th>Kommentar</Th>
            <Th>Datum</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)} className="transition hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
              <Td className="font-medium text-slate-900 dark:text-white">
                {String(row.bookTitle ?? "")}
              </Td>
              <Td className="max-w-[400px] truncate">
                {String(row.content ?? "")}
              </Td>
              <Td>{formatDateTime(row.date)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewsTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) {
    return <EmptyState message="Inga recensioner ännu." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200/80 dark:border-white/10">
            <Th>Bok</Th>
            <Th>Betyg</Th>
            <Th>Recension</Th>
            <Th>Datum</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)} className="transition hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
              <Td className="font-medium text-slate-900 dark:text-white">
                {String(row.bookTitle ?? "")}
              </Td>
              <Td>
                <RatingStars rating={Number(row.rating ?? 0)} />
              </Td>
              <Td className="max-w-[400px] truncate">
                {String(row.text ?? "—")}
              </Td>
              <Td>{formatDate(row.date)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/35 ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td
      className={`px-4 py-3.5 text-[13px] text-slate-600 dark:text-white/60 ${className ?? ""}`}
    >
      {children}
    </td>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-slate-400 dark:text-white/35">{message}</p>
    </div>
  );
}

const TABLE_COMPONENT: Record<Metric, (props: { rows: Array<Record<string, unknown>> }) => React.ReactNode> = {
  sales: SalesTable,
  readers: ReadersTable,
  subscribers: SubscribersTable,
  comments: CommentsTable,
  reviews: ReviewsTable,
};

export default function MetricDetailWorkspace({
  metric,
  summary,
  rows,
}: MetricDetailWorkspaceProps) {
  const config = METRIC_CONFIG[metric];
  const Icon = config.icon;
  const TableComponent = TABLE_COMPONENT[metric];

  const summaryCards = getSummaryCards(metric, summary, rows);

  return (
    <WorkspaceLayout
      header={
        <header className="flex items-center gap-3">
          <Link
            href="/author/home"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/70"
            aria-label="Tillbaka till dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-[17px] font-medium uppercase tracking-[0.14em] text-[#8B92A5] dark:text-white/50">
            {config.title}
          </h1>
        </header>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        <div className="space-y-5">
          {/* Summary cards row */}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl bg-white px-5 py-4 dark:bg-white/[0.04]"
              >
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400 dark:text-white/40">
                    {card.label}
                  </p>
                  {card.sparkline ? (
                    <span className="text-[10px] text-slate-300 dark:text-white/20">
                      {card.sparkline}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                  {card.value}
                </p>
                {card.change ? (
                  <p className={`mt-0.5 text-[11px] font-medium ${card.change.startsWith("-") ? "text-red-500" : "text-[#1FA971]"}`}>
                    {card.change}
                  </p>
                ) : null}
              </div>
            ))}
          </section>

          {/* Main data table */}
          <section className="rounded-2xl bg-white dark:bg-white/[0.04]">
            <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${config.toneClassName}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    {config.title}
                  </h2>
                  <p className="text-[12px] text-slate-400 dark:text-white/35">
                    {rows.length} {rows.length === 1 ? "post" : "poster"}
                  </p>
                </div>
              </div>
            </div>
            <TableComponent rows={rows} />
          </section>
        </div>
      }
    />
  );
}

function getSummaryCards(
  metric: Metric,
  summary: { total: number; change: number },
  rows: Array<Record<string, unknown>>
): Array<{ label: string; value: string; change?: string; sparkline?: string }> {
  switch (metric) {
    case "sales": {
      const paid = rows.filter(
        (r) => r.status === "paid" || r.status === "completed"
      ).length;
      const pending = rows.filter((r) => r.status === "pending").length;
      const countries = new Set(rows.map((r) => String(r.country ?? "")).filter((c) => c !== "—"));
      return [
        {
          label: "Totalt",
          value: `${summary.total.toLocaleString("sv-SE")} SEK`,
        },
        { label: "Ordrar", value: rows.length.toLocaleString("sv-SE") },
        {
          label: "Betalda",
          value: paid.toLocaleString("sv-SE"),
          sparkline: `▕ ${pending} väntande`,
        },
        { label: "Länder", value: countries.size.toLocaleString("sv-SE") },
      ];
    }
    case "readers": {
      const totalReaders = rows.reduce(
        (s, r) => s + (Number(r.readerCount) || 0),
        0
      );
      return [
        { label: "Totalt läsare", value: totalReaders.toLocaleString("sv-SE") },
        { label: "Böcker", value: rows.length.toLocaleString("sv-SE") },
        {
          label: "Snitt per bok",
          value:
            rows.length > 0
              ? Math.round(totalReaders / rows.length).toLocaleString("sv-SE")
              : "0",
        },
        { label: "Period", value: "Alla" },
      ];
    }
    case "subscribers": {
      const active = rows.filter((r) => r.status === "active").length;
      const unsubscribed = rows.filter(
        (r) => r.status === "unsubscribed"
      ).length;
      return [
        { label: "Aktiva", value: active.toLocaleString("sv-SE") },
        { label: "Totalt", value: rows.length.toLocaleString("sv-SE") },
        {
          label: "Avprenumererade",
          value: unsubscribed.toLocaleString("sv-SE"),
        },
        {
          label: "Retention",
          value:
            rows.length > 0
              ? `${Math.round((active / rows.length) * 100)}%`
              : "—",
        },
      ];
    }
    case "comments":
      return [
        { label: "Totalt", value: summary.total.toLocaleString("sv-SE") },
        {
          label: "Böcker",
          value: new Set(rows.map((r) => String(r.bookTitle ?? "")))
            .size.toLocaleString("sv-SE"),
        },
        { label: "Period", value: "Alla" },
        { label: "Senaste", value: rows[0] ? formatDate(rows[0].date) : "—" },
      ];
    case "reviews": {
      const avgRating =
        rows.length > 0
          ? rows.reduce((s, r) => s + (Number(r.rating) || 0), 0) / rows.length
          : 0;
      return [
        { label: "Totalt", value: summary.total.toLocaleString("sv-SE") },
        {
          label: "Snittbetyg",
          value: avgRating > 0 ? `${avgRating.toFixed(1)} ★` : "—",
        },
        {
          label: "Böcker",
          value: new Set(rows.map((r) => String(r.bookTitle ?? "")))
            .size.toLocaleString("sv-SE"),
        },
        { label: "Senaste", value: rows[0] ? formatDate(rows[0].date) : "—" },
      ];
    }
    default:
      return [];
  }
}
