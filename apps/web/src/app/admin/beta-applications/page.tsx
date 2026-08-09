import { createAdminClient } from "@/lib/supabase/admin";
import { allFields, formatAnswer } from "@/lib/apply/questions";
import StatusControls from "./StatusControls";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Beta applications",
  robots: { index: false, follow: false },
};

type Status = "pending" | "accepted" | "rejected";

type ApplicationRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  answers: Record<string, string> | null;
  status: Status;
  on_waitlist: boolean;
  review_note: string | null;
  created_at: string;
};

const FILTERS: { value: string; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function BetaApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const filter = FILTERS.some((f) => f.value === params.status)
    ? (params.status as string)
    : "pending";

  let rows: ApplicationRow[] = [];
  let counts: Record<string, number> = {};
  let loadError: string | null = null;

  try {
    const supabase = createAdminClient();

    let query = supabase
      .from("beta_applications")
      .select(
        "id, email, first_name, last_name, answers, status, on_waitlist, review_note, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (filter !== "all") query = query.eq("status", filter);

    const [{ data, error }, { data: allStatuses }] = await Promise.all([
      query,
      supabase.from("beta_applications").select("status"),
    ]);

    if (error) throw new Error(error.message);

    rows = (data ?? []) as ApplicationRow[];
    counts = ((allStatuses ?? []) as { status: string }[]).reduce<
      Record<string, number>
    >((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      acc.all = (acc.all ?? 0) + 1;
      return acc;
    }, {});
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          Beta applications
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          Round one. Applications arrive from the invitation email.
        </p>
      </header>

      <nav className="mb-8 flex flex-wrap gap-2" aria-label="Filter by status">
        {FILTERS.map((f) => {
          const active = f.value === filter;
          return (
            <a
              key={f.value}
              href={`/admin/beta-applications?status=${f.value}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-[36px] items-center rounded-full border px-4 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50"
              }`}
            >
              {f.label}
              <span className={active ? "ml-2 text-white/60" : "ml-2 text-slate-400"}>
                {counts[f.value] ?? 0}
              </span>
            </a>
          );
        })}
      </nav>

      {loadError ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-[15px] text-red-700">
          Could not load applications: {loadError}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center text-[15px] text-slate-500">
          Nothing here yet.
        </p>
      ) : (
        <ol className="space-y-5">
          {rows.map((row) => {
            const name =
              [row.first_name, row.last_name].filter(Boolean).join(" ") ||
              "No name given";
            return (
              <li
                key={row.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-[17px] font-semibold text-slate-900">
                      {name}
                    </h2>
                    <p className="mt-1 break-all text-[14px] text-slate-500">
                      <a
                        href={`mailto:${row.email}`}
                        className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500"
                      >
                        {row.email}
                      </a>
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
                      <span>{formatDate(row.created_at)}</span>
                      <span aria-hidden>·</span>
                      <span
                        className={
                          row.on_waitlist ? "text-slate-500" : "text-amber-600"
                        }
                      >
                        {row.on_waitlist ? "On the waitlist" : "Not on the waitlist"}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="uppercase tracking-wide">{row.status}</span>
                    </p>
                  </div>
                  <StatusControls id={row.id} status={row.status} />
                </div>

                <dl className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                  {allFields().map((question) => {
                    const value = row.answers?.[question.id];
                    if (!value) return null;
                    return (
                      <div key={question.id}>
                        <dt className="text-[12px] uppercase tracking-wide text-slate-400">
                          {question.label}
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800">
                          {question.kind === "url" ? (
                            <a
                              href={value}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="break-all text-[#6b54d6] underline underline-offset-2"
                            >
                              {value}
                            </a>
                          ) : (
                            formatAnswer(question, value)
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>

                {row.review_note ? (
                  <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-[14px] text-slate-600">
                    {row.review_note}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
