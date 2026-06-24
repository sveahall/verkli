"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

type AuthorApplicationStatus = "pending" | "approved" | "rejected";

type AuthorApplication = {
  user_id: string;
  auth_email: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  has_published_before: boolean | null;
  published_books_url: string | null;
  motivation: string | null;
  writing_background: string | null;
  work_samples: string | null;
  status: AuthorApplicationStatus;
  created_at: string;
};

type StatusFilter = "all" | AuthorApplicationStatus;
type SortOrder = "newest" | "oldest";

const STATUS_BADGE: Record<AuthorApplicationStatus, { variant: "warning" | "success" | "error"; label: string }> = {
  pending: { variant: "warning", label: "Pending" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "error", label: "Rejected" },
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function StatusBadge({ status }: { status: AuthorApplicationStatus }) {
  const { variant, label } = STATUS_BADGE[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-white/40">{label}</p>
      <div className="mt-0.5 text-slate-800 dark:text-white">{children}</div>
    </div>
  );
}

function LongText({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-400 dark:text-white/30">Not provided</span>;
  return <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{value}</p>;
}

export default function AdminAuthorApplicationsPage() {
  const [applications, setApplications] = useState<AuthorApplication[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const pendingCount = useMemo(
    () => applications.filter((application) => application.status === "pending").length,
    [applications]
  );

  const visibleApplications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = applications.filter((application) => {
      if (statusFilter !== "all" && application.status !== statusFilter) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        application.first_name,
        application.last_name,
        application.email,
        application.auth_email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    return [...filtered].sort((a, b) => {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortOrder === "newest" ? diff : -diff;
    });
  }, [applications, query, statusFilter, sortOrder]);

  const loadApplications = async () => {
    setError("");

    try {
      const response = await fetch("/api/admin/author-applications", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(response.status === 403 ? "Access denied." : "Could not load applications.");
        return;
      }

      setApplications(Array.isArray(payload?.applications) ? payload.applications : []);
      setLoaded(true);
    } catch {
      setError("Could not load applications.");
    }
  };

  const updateStatus = async (userId: string, status: AuthorApplicationStatus) => {
    setError("");
    setSavingUserId(userId);

    try {
      const response = await fetch("/api/admin/author-applications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, status }),
      });

      if (!response.ok) {
        setError(response.status === 403 ? "Access denied." : "Could not update application status.");
        return;
      }

      setApplications((current) =>
        current.map((application) =>
          application.user_id === userId ? { ...application, status } : application
        )
      );
    } catch {
      setError("Could not update application status.");
    } finally {
      setSavingUserId(null);
    }
  };

  useEffect(() => {
    void loadApplications();
  }, []);

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
  ];

  return (
    <div className="page-content py-10">
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "Admin", href: "/admin" }, { label: "Author applications" }]}
      />
      <PageHeader
        eyebrow="Operations"
        title="Author applications"
        description="Review reader applications and approve author access."
      />

      {error ? (
        <ErrorState
          className="mt-8"
          title="Something went wrong"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void loadApplications()}>
              Try again
            </Button>
          }
        />
      ) : !loaded ? (
        <LoadingState className="mt-8" title="Loading author applications…" />
      ) : (
        <section className="mt-8 space-y-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="text-[14px] text-slate-600 dark:text-white/60">
              <span className="font-semibold text-[var(--color-warning)] tabular-nums">{pendingCount} pending</span>{" "}
              of <span className="tabular-nums">{applications.length}</span> total
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="sm:w-64">
                <SearchInput
                  inputSize="sm"
                  placeholder="Search by name or email…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search applications"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="sr-only">Filter by status</span>
                {statusFilters.map((filter) => (
                  <Button
                    key={filter.value}
                    variant={statusFilter === filter.value ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setStatusFilter(filter.value)}
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSortOrder((order) => (order === "newest" ? "oldest" : "newest"))}
              >
                {sortOrder === "newest" ? "Newest first" : "Oldest first"}
              </Button>
            </div>
          </div>

          {applications.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No author applications yet"
              description="Applications submitted from the author signup flow will appear here."
            />
          ) : visibleApplications.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No matching applications"
              description="Try a different search term or status filter."
            />
          ) : (
            <div className="space-y-3">
              {visibleApplications.map((application) => {
                const isSaving = savingUserId === application.user_id;
                const isExpanded = expandedUserId === application.user_id;
                const name = [application.first_name, application.last_name].filter(Boolean).join(" ");

                return (
                  <Card key={application.user_id} className="p-0">
                    {/* Card header */}
                    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={() => setExpandedUserId(isExpanded ? null : application.user_id)}
                        className="flex min-w-0 items-center gap-3 text-left"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-600 dark:bg-white/10 dark:text-white/70">
                          {application.first_name?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                            {name || "No name provided"}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-white/50">
                            {application.email ?? application.auth_email ?? "No email"}
                          </p>
                        </div>
                      </button>

                      <div className="flex shrink-0 flex-wrap items-center gap-3">
                        <StatusBadge status={application.status} />
                        <span className="hidden text-xs text-slate-400 tabular-nums dark:text-white/40 sm:inline">
                          {formatDate(application.created_at)}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            isLoading={isSaving}
                            disabled={isSaving || application.status === "approved"}
                            onClick={() => updateStatus(application.user_id, "approved")}
                          >
                            <Check className="h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            isLoading={isSaving}
                            disabled={isSaving || application.status === "rejected"}
                            onClick={() => updateStatus(application.user_id, "rejected")}
                          >
                            <X className="h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="space-y-5 border-t border-slate-100 px-4 py-4 dark:border-white/5">
                        <div className="grid gap-4 text-sm sm:grid-cols-2">
                          <DetailField label="Name">{name || "Not provided"}</DetailField>
                          <DetailField label="Contact email">{application.email ?? "Not provided"}</DetailField>
                          <DetailField label="Auth email">{application.auth_email ?? "Unknown"}</DetailField>
                          <DetailField label="User ID">
                            <span className="font-mono text-xs text-slate-600 dark:text-white/60">
                              {application.user_id}
                            </span>
                          </DetailField>
                          <DetailField label="Published before?">
                            {application.has_published_before === true
                              ? "Yes"
                              : application.has_published_before === false
                                ? "No"
                                : "Not answered"}
                          </DetailField>
                          <DetailField label="Applied">
                            <span className="tabular-nums">{formatDate(application.created_at)}</span>
                          </DetailField>
                          <DetailField label="Published books link">
                            {application.published_books_url ? (
                              <a
                                href={application.published_books_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block break-all text-[var(--brand-violet)] underline hover:opacity-80 dark:text-[#b6a6ff]"
                              >
                                {application.published_books_url}
                              </a>
                            ) : (
                              <span className="text-slate-400 dark:text-white/30">None</span>
                            )}
                          </DetailField>
                        </div>

                        <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-white/5">
                          <DetailField label="Why they want to publish">
                            <LongText value={application.motivation} />
                          </DetailField>
                          <DetailField label="Writing background">
                            <LongText value={application.writing_background} />
                          </DetailField>
                          <DetailField label="Work samples / links">
                            <LongText value={application.work_samples} />
                          </DetailField>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
