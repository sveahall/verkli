"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import { getLanguageLabel } from "@/lib/languages";
import { cn } from "@/lib/utils";

type Campaign = {
  id: string;
  bookId: string;
  bookTitle: string | null;
  bookCoverUrl: string | null;
  name: string | null;
  status: string;
  template: string;
  channels: string[];
  languages: string[];
  contentTypes: string[];
  frequency: string;
  startDate: string;
  durationWeeks: number;
  mode: string;
  generationError: string | null;
};

type Post = {
  id: string;
  scheduledFor: string;
  channel: string;
  language: string;
  contentType: string;
  status: string;
  headline: string | null;
  caption: string | null;
  hashtags: string | null;
  cta: string | null;
  shareUrl: string | null;
  mediaAssetId: string | null;
  mediaAssetUrl: string | null;
  assetError: string | null;
  postedAt: string | null;
  postedUrl: string | null;
  mode: string;
};

const CHANNEL_DOT: Record<string, string> = {
  instagram: "bg-pink-400",
  tiktok: "bg-slate-700 dark:bg-white/70",
  youtube: "bg-red-500",
  facebook: "bg-blue-500",
  x: "bg-amber-500",
  threads: "bg-emerald-500",
};

const CHANNEL_OPEN_URL: Record<string, string> = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/upload",
  youtube: "https://www.youtube.com/upload",
  facebook: "https://www.facebook.com/",
  x: "https://x.com/compose/post",
  threads: "https://www.threads.net/",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60",
  ready: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  asset_pending: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  asset_failed: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  posted: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  skipped: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/45",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ready: "Ready",
  asset_pending: "Generating…",
  asset_failed: "Asset failed",
  posted: "Posted",
  skipped: "Skipped",
};

function formatDay(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(d: string): string {
  return new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fullCaption(post: Post): string {
  return [post.caption ?? "", post.hashtags ?? ""].filter(Boolean).join("\n\n");
}

export default function CampaignDetailView({
  campaign,
  posts: initialPosts,
}: {
  campaign: Campaign;
  posts: Post[];
}) {
  const router = useRouter();
  // Optimistic patches keyed by post.id — overlaid on server-loaded initialPosts
  // so that local edits survive across router.refresh() (which re-runs the
  // server component and re-passes initialPosts).
  const [patches, setPatches] = useState<Record<string, Partial<Post>>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterLanguage, setFilterLanguage] = useState<string>("all");
  const [filterContentType, setFilterContentType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const posts = useMemo<Post[]>(
    () =>
      initialPosts.map((p) =>
        patches[p.id] ? { ...p, ...patches[p.id] } : p
      ),
    [initialPosts, patches]
  );

  // Auto-refresh while plan is generating
  useEffect(() => {
    if (campaign.status !== "generating") return;
    const interval = setInterval(() => {
      router.refresh();
    }, 4000);
    return () => clearInterval(interval);
  }, [campaign.status, router]);

  const grouped = useMemo(() => {
    const filtered = posts.filter((p) => {
      if (filterChannel !== "all" && p.channel !== filterChannel) return false;
      if (filterLanguage !== "all" && p.language !== filterLanguage) return false;
      if (filterContentType !== "all" && p.contentType !== filterContentType) return false;
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      return true;
    });
    const map = new Map<string, Post[]>();
    for (const p of filtered) {
      const day = p.scheduledFor.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [posts, filterChannel, filterLanguage, filterContentType, filterStatus]);

  const counts = useMemo(() => {
    const total = posts.length;
    const posted = posts.filter((p) => p.status === "posted").length;
    const ready = posts.filter((p) => p.status === "ready").length;
    return { total, posted, ready };
  }, [posts]);

  const activePost = posts.find((p) => p.id === activeId) ?? null;

  const patchLocal = (postId: string, patch: Partial<Post>) => {
    setPatches((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] ?? {}), ...patch },
    }));
  };

  const handlePostUpdate = async (
    postId: string,
    body: Record<string, unknown>
  ) => {
    const res = await fetch(`/api/author/marketing/posts/${postId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: Partial<Post> };
    if (!data.post) return null;
    patchLocal(postId, data.post as Partial<Post>);
    return data.post;
  };

  const handleGenerateTrailer = async (postId: string) => {
    patchLocal(postId, { status: "asset_pending", assetError: null });
    const res = await fetch(
      `/api/author/marketing/posts/${postId}/generate-trailer`,
      {
        method: "POST",
        credentials: "include",
      }
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      patchLocal(postId, {
        status: "asset_failed",
        assetError: body.error ?? "failed",
      });
      return;
    }
    const data = (await res.json()) as {
      post?: { mediaAssetId: string; mediaAssetUrl: string; caption: string; hashtags: string };
    };
    if (data.post) {
      patchLocal(postId, {
        status: "ready",
        mediaAssetId: data.post.mediaAssetId,
        mediaAssetUrl: data.post.mediaAssetUrl,
        caption: data.post.caption,
        hashtags: data.post.hashtags,
        assetError: null,
      });
    }
  };

  const handleDeleteCampaign = async () => {
    if (!window.confirm("Delete this campaign and all its posts?")) return;
    const res = await fetch(`/api/author/marketing/campaigns/${campaign.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) router.push("/author/marketing");
  };

  return (
    <>
    <WorkspaceLayout
      header={
        <header>
          <Link
            href="/author/marketing"
            className="text-[12px] uppercase tracking-[0.14em] text-[#8B92A5] hover:text-[#6B7280] dark:text-white/50 dark:hover:text-white/65"
          >
            ← Marketing
          </Link>
          <h1 className="mt-1 truncate text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
            {campaign.name ?? campaign.bookTitle ?? "Campaign"}
          </h1>
        </header>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        <div className="space-y-5">
          {/* Summary card */}
          <section className="rounded-2xl bg-white p-5 dark:bg-white/[0.04]">
            <div className="flex flex-wrap items-center gap-3">
              {campaign.bookCoverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={campaign.bookCoverUrl}
                  alt=""
                  className="h-14 w-10 rounded-md object-cover shadow-sm"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-slate-900 dark:text-white">
                  {campaign.bookTitle ?? "Untitled book"}
                </p>
                <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/45">
                  {campaign.languages.map(getLanguageLabel).join(", ")} ·{" "}
                  {campaign.channels.length} channels · {campaign.contentTypes.join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-white/45">
                <span>{counts.posted}/{counts.total} posted</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteCampaign}
                className="text-red-600 hover:text-red-700 dark:text-red-400"
              >
                Delete
              </Button>
            </div>

            {campaign.status === "generating" ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                Generating posts… this usually takes ~10 seconds. Calendar will
                refresh automatically.
              </p>
            ) : null}

            {campaign.status === "failed" && campaign.generationError ? (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:bg-red-950/30 dark:text-red-400">
                Could not generate this campaign: {campaign.generationError}
              </p>
            ) : null}
          </section>

          {/* Filters */}
          {posts.length > 0 ? (
            <section className="rounded-2xl bg-white p-3 dark:bg-white/[0.04]">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <FilterPill
                  label="All channels"
                  options={[
                    { value: "all", label: "All channels" },
                    ...campaign.channels.map((c) => ({ value: c, label: c })),
                  ]}
                  value={filterChannel}
                  onChange={setFilterChannel}
                />
                <FilterPill
                  label="All languages"
                  options={[
                    { value: "all", label: "All languages" },
                    ...campaign.languages.map((l) => ({
                      value: l,
                      label: getLanguageLabel(l),
                    })),
                  ]}
                  value={filterLanguage}
                  onChange={setFilterLanguage}
                />
                <FilterPill
                  label="All formats"
                  options={[
                    { value: "all", label: "All formats" },
                    ...campaign.contentTypes.map((c) => ({ value: c, label: c })),
                  ]}
                  value={filterContentType}
                  onChange={setFilterContentType}
                />
                <FilterPill
                  label="All statuses"
                  options={[
                    { value: "all", label: "All statuses" },
                    { value: "ready", label: "Ready" },
                    { value: "draft", label: "Draft" },
                    { value: "asset_pending", label: "Generating" },
                    { value: "asset_failed", label: "Asset failed" },
                    { value: "posted", label: "Posted" },
                  ]}
                  value={filterStatus}
                  onChange={setFilterStatus}
                />
              </div>
            </section>
          ) : null}

          {/* Calendar / day groups */}
          {grouped.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-slate-200 bg-white/40 p-8 text-center dark:border-white/10 dark:bg-white/[0.02]">
              <p className="text-[14px] text-slate-500 dark:text-white/45">
                {posts.length === 0
                  ? "No posts yet — they will show up here when generation finishes."
                  : "No posts match the current filters."}
              </p>
            </section>
          ) : (
            <section className="space-y-3">
              {grouped.map(([day, dayPosts]) => (
                <div
                  key={day}
                  className="rounded-2xl bg-white p-4 dark:bg-white/[0.04]"
                >
                  <h3 className="text-eyebrow">{formatDay(day)}</h3>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {dayPosts.map((post) => (
                      <li key={post.id}>
                        <button
                          type="button"
                          onClick={() => setActiveId(post.id)}
                          className="flex w-full flex-col items-start gap-2 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 text-left transition-all hover:border-[#907AFF]/40 hover:bg-[#907AFF]/[0.04] dark:border-white/[0.06] dark:bg-white/[0.02]"
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  CHANNEL_DOT[post.channel] ?? "bg-slate-400"
                                )}
                                aria-hidden
                              />
                              <span className="text-[12px] font-medium uppercase tracking-wider text-slate-500 dark:text-white/55">
                                {post.channel}
                              </span>
                              <span className="text-[12px] text-slate-400 dark:text-white/35">
                                {formatTime(post.scheduledFor)}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                STATUS_STYLES[post.status] ?? STATUS_STYLES.draft
                              )}
                            >
                              {STATUS_LABEL[post.status] ?? post.status}
                            </span>
                          </div>
                          <p className="line-clamp-2 text-[13px] text-slate-700 dark:text-white/70">
                            {post.caption ?? "(no caption yet)"}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-white/35">
                            <span className="uppercase">{post.contentType}</span>
                            <span aria-hidden>·</span>
                            <span className="uppercase">{post.language}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </div>
      }
    />
    {activePost ? (
      <PostDrawer
        key={activePost.id}
        post={activePost}
        onClose={() => setActiveId(null)}
        onUpdate={handlePostUpdate}
        onGenerateTrailer={handleGenerateTrailer}
      />
    ) : null}
    </>
  );
}

function FilterPill({
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-full border-0 bg-black/[0.04] px-3 text-[12px] text-slate-700 outline-none ring-0 focus:bg-black/[0.06] dark:bg-white/[0.06] dark:text-white/70"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ─── Post drawer ─────────────────────────────────────────────────────────────

function PostDrawer({
  post,
  onClose,
  onUpdate,
  onGenerateTrailer,
}: {
  post: Post;
  onClose: () => void;
  onUpdate: (id: string, body: Record<string, unknown>) => Promise<unknown>;
  onGenerateTrailer: (id: string) => Promise<void>;
}) {
  // PostDrawer is remounted per post via `key={post.id}` from the parent,
  // so initializing local edit state from props here is safe.
  const [caption, setCaption] = useState(post.caption ?? "");
  const [hashtags, setHashtags] = useState(post.hashtags ?? "");
  const [savedFlash, setSavedFlash] = useState(false);
  const [copyFlash, setCopyFlash] = useState<"none" | "caption" | "hashtags" | "all">("none");
  const [busy, setBusy] = useState(false);

  const copy = async (text: string, kind: "caption" | "hashtags" | "all") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(kind);
      setTimeout(() => setCopyFlash("none"), 1500);
    } catch {
      // ignore
    }
  };

  const saveText = async () => {
    setBusy(true);
    await onUpdate(post.id, { caption, hashtags });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    setBusy(false);
  };

  const markPosted = async () => {
    setBusy(true);
    await onUpdate(post.id, { status: "posted" });
    setBusy(false);
    onClose();
  };

  const markSkipped = async () => {
    setBusy(true);
    await onUpdate(post.id, { status: "skipped" });
    setBusy(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[800] flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="button"
      tabIndex={-1}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full max-w-[520px] flex-col overflow-hidden bg-white shadow-2xl dark:bg-[#0a0a0f]"
      >
        <header className="flex items-center justify-between border-b border-black/[0.06] p-5 dark:border-white/[0.06]">
          <div className="min-w-0">
            <p className="truncate text-[12px] uppercase tracking-wider text-slate-400 dark:text-white/35">
              {post.channel} · {post.language} · {post.contentType}
            </p>
            <p className="mt-0.5 truncate text-[14px] font-medium text-slate-900 dark:text-white">
              {formatDay(post.scheduledFor)} · {formatTime(post.scheduledFor)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 18L18 6M6 6l12 12"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Trailer / podcast preview */}
          {post.contentType === "trailer" ? (
            <section>
              <p className="text-eyebrow">Trailer</p>
              {post.mediaAssetUrl ? (
                <video
                  src={post.mediaAssetUrl}
                  controls
                  className="mt-2 w-full rounded-xl bg-black"
                />
              ) : (
                <div className="mt-2 rounded-xl border border-dashed border-black/10 bg-black/[0.02] p-4 text-center text-[13px] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/45">
                  {post.status === "asset_pending"
                    ? "Generating trailer…"
                    : post.assetError
                      ? `Last attempt failed: ${post.assetError}`
                      : "No trailer yet."}
                </div>
              )}
              <Button
                size="sm"
                onClick={() => onGenerateTrailer(post.id)}
                isLoading={post.status === "asset_pending"}
                loadingText="Generating…"
                className="mt-3 w-full rounded-full bg-[#0F172A] text-white hover:bg-[#1E293B]"
              >
                {post.mediaAssetUrl ? "Regenerate trailer" : "Generate trailer"}
              </Button>
            </section>
          ) : null}

          {post.contentType === "podcast" ? (
            <section>
              <p className="text-eyebrow">Podcast clip</p>
              <div className="mt-2 rounded-xl border border-dashed border-black/10 bg-black/[0.02] p-4 text-center text-[13px] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/45">
                Narrated chapter excerpt — generation hooks up to the audiobook
                pipeline. Coming in the next drop.
              </div>
            </section>
          ) : null}

          {/* Caption */}
          <section>
            <label className="text-eyebrow">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              className="mt-2 w-full resize-y rounded-xl border-0 bg-black/[0.04] p-3 text-[14px] text-slate-900 outline-none focus:ring-2 focus:ring-[#907AFF]/30 dark:bg-white/[0.06] dark:text-white"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copy(caption, "caption")}
              >
                {copyFlash === "caption" ? "Copied!" : "Copy caption"}
              </Button>
              <Button size="sm" variant="ghost" onClick={saveText} isLoading={busy}>
                {savedFlash ? "Saved!" : "Save edits"}
              </Button>
            </div>
          </section>

          {/* Hashtags */}
          <section>
            <label className="text-eyebrow">Hashtags</label>
            <textarea
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              rows={2}
              className="mt-2 w-full resize-y rounded-xl border-0 bg-black/[0.04] p-3 text-[13px] text-slate-700 outline-none focus:ring-2 focus:ring-[#907AFF]/30 dark:bg-white/[0.06] dark:text-white/75"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copy(hashtags, "hashtags")}
            >
              {copyFlash === "hashtags" ? "Copied!" : "Copy hashtags"}
            </Button>
          </section>

          {/* Quick actions */}
          <section className="rounded-2xl bg-black/[0.03] p-4 dark:bg-white/[0.04]">
            <p className="text-eyebrow">Post this</p>
            <p className="mt-2 text-[13px] text-slate-500 dark:text-white/45">
              Copy everything, open {post.channel}, paste, hit publish.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => copy(fullCaption(post), "all")}
                className="rounded-full bg-[#0F172A] text-white hover:bg-[#1E293B]"
              >
                {copyFlash === "all" ? "Copied!" : "Copy caption + hashtags"}
              </Button>
              <a
                href={CHANNEL_OPEN_URL[post.channel] ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border border-slate-200 px-4 py-1.5 text-[13px] font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900 dark:border-white/15 dark:text-white/65 dark:hover:border-white/25 dark:hover:text-white"
              >
                Open {post.channel}
              </a>
              {post.mediaAssetUrl ? (
                <a
                  href={post.mediaAssetUrl}
                  download
                  className="inline-flex items-center rounded-full border border-slate-200 px-4 py-1.5 text-[13px] font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900 dark:border-white/15 dark:text-white/65 dark:hover:border-white/25 dark:hover:text-white"
                >
                  Download trailer
                </a>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {post.status === "posted" ? (
                <p className="text-[13px] text-emerald-700 dark:text-emerald-400">
                  Marked as posted{post.postedAt ? ` ${formatDay(post.postedAt)}` : ""}.
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={markPosted}
                  isLoading={busy}
                >
                  Mark as posted
                </Button>
              )}
              {post.status !== "skipped" && post.status !== "posted" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={markSkipped}
                  isLoading={busy}
                >
                  Skip this one
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
