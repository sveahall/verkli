"use client";

import Link from "next/link";
import { getPostDelivery, isPostDeliveryLocked } from "@/lib/marketing/post-delivery-state";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
  updatedAt: string;
  mode: string;
  metadata?: Record<string, unknown>;
};

const CHANNEL_DOT: Record<string, string> = {
  instagram: "bg-pink-400",
  tiktok: "bg-primary dark:bg-card",
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
  draft: "bg-muted text-muted-foreground dark:bg-card dark:text-muted-foreground",
  ready: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  asset_pending: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  asset_failed: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  posted: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  skipped: "bg-muted text-muted-foreground dark:bg-card dark:text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ready: "Ready to copy",
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
  const [retrying, setRetrying] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  const posts = useMemo<Post[]>(
    () =>
      initialPosts.map((p) =>
        patches[p.id] && Date.parse(patches[p.id].updatedAt ?? "") >= Date.parse(p.updatedAt) ? { ...p, ...patches[p.id] } : p
      ),
    [initialPosts, patches]
  );

  // Auto-refresh while plan is generating
  useEffect(() => {
    if (campaign.status !== "generating" && !posts.some(p => ["scheduled", "processing"].includes(getPostDelivery(p.metadata)?.state ?? ""))) return;
    const interval = setInterval(() => {
      router.refresh();
    }, 4000);
    return () => clearInterval(interval);
  }, [campaign.status, posts, router]);

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
    const data = (await res.json().catch(() => ({}))) as { post?: Partial<Post> & { updatedAt: string }; error?: string; detail?: string };
    if (!res.ok || !data.post?.updatedAt) {
      throw Object.assign(new Error(data.detail ?? "Could not save this post. Your edits are still here. Try again."), { code: data.error });
    }
    patchLocal(postId, data.post as Partial<Post>);
    return data.post;
  };

  const handleReloadPost = async (postId: string): Promise<Post> => {
    const res = await fetch(`/api/author/marketing/campaigns/${campaign.id}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { posts?: Post[] };
    const latest = data.posts?.find((item) => item.id === postId);
    if (!res.ok || !latest?.updatedAt) throw new Error("Could not load the latest saved copy. Your draft is still here. Try again.");
    patchLocal(postId, latest);
    return latest;
  };

  const handleDelivery = async (postId: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/author/marketing/posts/${postId}/publish`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({})) as { detail?: string };
    if (!res.ok) throw new Error(data.detail ?? "Could not update delivery. Refresh and try again.");
    return handleReloadPost(postId);
  };

  const handleGenerateTrailer = async (postId: string) => {
    patchLocal(postId, { status: "asset_pending", assetError: null });
    try {
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
          status: "draft",
          mediaAssetId: data.post.mediaAssetId,
          mediaAssetUrl: data.post.mediaAssetUrl,
          caption: data.post.caption,
          hashtags: data.post.hashtags,
          assetError: null,
        });
      }
    } catch {
      patchLocal(postId, { status: "asset_failed", assetError: "Could not confirm trailer generation. Refresh before retrying." });
    }
  };

  const retryGeneration = async () => {
    setRetrying(true);
    setCampaignError(null);
    try {
      const response = await fetch(`/api/author/marketing/campaigns/${campaign.id}`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: unknown };
        throw new Error(typeof body.detail === "string" ? body.detail : "Could not resume generation. Refresh and try again.");
      }
      router.refresh();
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : "Could not resume generation.");
    } finally {
      setRetrying(false);
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
            className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground hover:text-muted-foreground dark:text-muted-foreground dark:hover:text-muted-foreground"
          >
            ← Marketing
          </Link>
          <h1 className="author-page-title mt-1 truncate text-foreground">
            {campaign.name ?? campaign.bookTitle ?? "Campaign"}
          </h1>
        </header>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        <div className="space-y-5">
          {/* Summary card */}
          <section className="rounded-2xl bg-card p-5 dark:bg-card">
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
                <p className="truncate text-[15px] font-medium text-foreground dark:text-foreground">
                  {campaign.bookTitle ?? "Untitled book"}
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground dark:text-muted-foreground">
                  {campaign.languages.map(getLanguageLabel).join(", ")} ·{" "}
                  {campaign.channels.length} channels · {campaign.contentTypes.join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground dark:text-muted-foreground">
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

            <p className="mt-3 text-[13px] text-muted-foreground">
              Review each draft, then share it manually in your chosen channel.
            </p>

            {campaign.status === "generating" ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                Generating drafts… larger campaigns can take several minutes.
                The calendar refreshes automatically as drafts are saved.
              </p>
            ) : null}

            {campaignError ? <p role="alert" className="mt-3 text-sm text-red-700">{campaignError}</p> : null}
            {campaign.status === "failed" ? (
              <Button className="mt-3" size="sm" onClick={retryGeneration} isLoading={retrying}>Resume missing drafts</Button>
            ) : null}
            {campaign.status === "failed" && campaign.generationError ? (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:bg-red-950/30 dark:text-red-400">
                Could not generate this campaign: {campaign.generationError}
              </p>
            ) : null}
          </section>

          {/* Filters */}
          {posts.length > 0 ? (
            <section className="rounded-2xl bg-card p-3 dark:bg-card">
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
                    { value: "ready", label: "Ready to copy" },
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
            <section className="rounded-2xl border border-dashed border-border bg-white/40 p-8 text-center dark:border-border dark:bg-card">
              <p className="text-[14px] text-muted-foreground dark:text-muted-foreground">
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
                  className="rounded-2xl bg-card p-4 dark:bg-card"
                >
                  <h3 className="text-eyebrow">{formatDay(day)}</h3>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {dayPosts.map((post) => (
                      <li key={post.id}>
                        <button
                          type="button"
                          onClick={() => setActiveId(post.id)}
                          className="flex w-full flex-col items-start gap-2 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 text-left transition-all hover:border-[#907AFF]/40 hover:bg-[#907AFF]/[0.04] dark:border-border dark:bg-card"
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  CHANNEL_DOT[post.channel] ?? "bg-muted"
                                )}
                                aria-hidden
                              />
                              <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                                {post.channel}
                              </span>
                              <span className="text-[12px] text-muted-foreground dark:text-muted-foreground">
                                {formatTime(post.scheduledFor)}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                STATUS_STYLES[post.status] ?? STATUS_STYLES.draft
                              )}
                            >
                              {getPostDelivery(post.metadata)?.state ?? STATUS_LABEL[post.status] ?? post.status}
                            </span>
                          </div>
                          <p className="line-clamp-2 text-[13px] text-foreground dark:text-foreground">
                            {post.caption ?? "(no caption yet)"}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground dark:text-muted-foreground">
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
        onReload={handleReloadPost}
        onGenerateTrailer={handleGenerateTrailer}
        onDelivery={process.env.NODE_ENV === "development" ? handleDelivery : undefined}
      />
    ) : null}
    </>
  );
}

function FilterPill({
  label,
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
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-full border-0 bg-black/[0.04] px-3 text-[12px] text-foreground outline-none ring-0 focus:bg-black/[0.06] dark:bg-card dark:text-foreground"
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

export function PostDrawer({
  post,
  onClose,
  onUpdate,
  onReload,
  onGenerateTrailer,
  onDelivery,
}: {
  post: Post;
  onClose: () => void;
  onUpdate: (id: string, body: Record<string, unknown>) => Promise<Partial<Post> & { updatedAt: string }>;
  onReload: (id: string) => Promise<Post>;
  onGenerateTrailer: (id: string) => Promise<void>;
  onDelivery?: (id: string, body: Record<string, unknown>) => Promise<Post>;
}) {
  // PostDrawer is remounted per post via `key={post.id}` from the parent,
  // so initializing local edit state from props here is safe.
  useEffect(() => {
    const opener = document.activeElement;
    return () => { queueMicrotask(() => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    }); };
  }, []);
  const [caption, setCaption] = useState(post.caption ?? "");
  const [hashtags, setHashtags] = useState(post.hashtags ?? "");
  // Keep the revision paired with this draft, even if a parent refresh brings newer props.
  const [draftRevision, setDraftRevision] = useState(post.updatedAt);
  const [conflicted, setConflicted] = useState(false);
  const [latestSaved, setLatestSaved] = useState<Post | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copyFlash, setCopyFlash] = useState<"none" | "caption" | "hashtags" | "all">("none");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [publishTime, setPublishTime] = useState(() => {
    const date = new Date(Math.max(Date.parse(post.scheduledFor), Date.now() + 60_000));
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const delivery = getPostDelivery(post.metadata);
  const deliveryLocked = isPostDeliveryLocked(post.metadata);
  const sendDelivery = async (action: "schedule" | "cancel" | "retry") => {
    if (!onDelivery || busy) return;
    setBusy(true); setActionError(null);
    try {
      const saved = await onDelivery(post.id, {
        action, expectedUpdatedAt: action === "schedule" ? draftRevision : post.updatedAt,
        ...(action === "schedule" ? { scheduledFor: new Date(publishTime).toISOString() } : {}),
      });
      setDraftRevision(saved.updatedAt);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not update delivery."); }
    finally { setBusy(false); }
  };

  const copy = async (text: string, kind: "caption" | "hashtags" | "all") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(kind);
      setTimeout(() => setCopyFlash("none"), 1500);
    } catch {
      setActionError("Could not copy. Select and copy the text manually.");
    }
  };

  const update = async (body: Record<string, unknown>, close = false) => {
    if (busy || conflicted) return;
    setBusy(true);
    setSavedFlash(false);
    setActionError(null);
    try {
      const saved = await onUpdate(post.id, { ...body, expectedUpdatedAt: draftRevision });
      setDraftRevision(saved.updatedAt);
      if (close) onClose();
      else {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "POST_CHANGED") {
        setConflicted(true);
        setLatestSaved(null);
      }
      setActionError(error instanceof Error ? error.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const loadLatest = async () => {
    setBusy(true);
    try {
      setLatestSaved(await onReload(post.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not load the latest saved copy.");
    } finally {
      setBusy(false);
    }
  };
  const useLatest = () => {
    if (!latestSaved) return;
    setCaption(latestSaved.caption ?? "");
    setHashtags(latestSaved.hashtags ?? "");
    setDraftRevision(latestSaved.updatedAt);
    setConflicted(false);
    setLatestSaved(null);
    setActionError(null);
  };
  const saveText = () => update({ caption, hashtags });
  const markPosted = () => update({ status: "posted" }, true);
  const markSkipped = () => update({ status: "skipped" }, true);
  const hasUnsavedEdits = caption !== (post.caption ?? "") || hashtags !== (post.hashtags ?? "");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}
      aria-label={`Review ${post.channel} post`}
      className="ml-auto mr-0 h-dvh max-h-dvh w-full max-w-[520px] rounded-none border-0">
      <aside className="flex h-full flex-col overflow-hidden bg-card">
        <header className="flex items-center justify-between border-b border-black/[0.06] p-5 dark:border-border">
          <div className="min-w-0">
            <p className="truncate text-[12px] uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
              {post.channel} · {post.language} · {post.contentType}
            </p>
            <p className="mt-0.5 truncate text-[14px] font-medium text-foreground dark:text-foreground">
              {formatDay(post.scheduledFor)} · {formatTime(post.scheduledFor)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close post"
            className="text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
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
          {actionError ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}
          {conflicted ? (
            <section className="space-y-3 rounded-xl border border-border p-3" aria-label="Post changed in another tab">
              <p className="text-sm">Your draft is still in the fields below. Compare it with the latest saved copy before continuing.</p>
              <Button size="sm" variant="ghost" onClick={loadLatest} isLoading={busy}>Load latest for comparison</Button>
              {latestSaved ? (
                <div className="space-y-3">
                  <p className="text-eyebrow">Latest saved copy</p>
                  <p className="whitespace-pre-wrap text-sm">{latestSaved.caption || "No caption"}</p>
                  <p className="whitespace-pre-wrap text-sm">{latestSaved.hashtags || "No hashtags"}</p>
                  <p className="text-sm text-muted-foreground">Using this copy replaces your local draft. Copy any edits you want to keep first.</p>
                  <Button size="sm" onClick={useLatest} disabled={busy}>Use latest saved copy</Button>
                </div>
              ) : null}
            </section>
          ) : null}
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
                <div className="mt-2 rounded-xl border border-dashed border-black/10 bg-black/[0.02] p-4 text-center text-[13px] text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground">
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
                disabled={busy || conflicted}
                isLoading={post.status === "asset_pending"}
                loadingText="Generating…"
                className="mt-3 w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {post.mediaAssetUrl ? "Regenerate trailer" : "Generate trailer"}
              </Button>
            </section>
          ) : null}

          {post.contentType === "podcast" ? (
            <section>
              <p className="text-eyebrow">Podcast clip</p>
              <div className="mt-2 rounded-xl border border-dashed border-black/10 bg-black/[0.02] p-4 text-center text-[13px] text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground">
                Audio clip generation is not connected. This entry contains draft copy only; it cannot be approved until an audio asset exists.
              </div>
            </section>
          ) : null}

          {/* Caption */}
          <section>
            <label htmlFor="post-caption" className="text-eyebrow">Caption</label>
            <textarea
              id="post-caption"
              disabled={post.status === "posted" || deliveryLocked || busy}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              className="mt-2 w-full resize-y rounded-xl border-0 bg-black/[0.04] p-3 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-[#907AFF]/30 dark:bg-card dark:text-foreground"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copy(caption, "caption")}
              >
                {copyFlash === "caption" ? "Copied!" : "Copy caption"}
              </Button>
              <Button size="sm" variant="ghost" onClick={saveText} isLoading={busy} disabled={post.status === "posted" || deliveryLocked || conflicted}>
                {savedFlash ? "Saved!" : "Save edits"}
              </Button>
            </div>
          </section>

          {/* Hashtags */}
          <section>
            <label htmlFor="post-hashtags" className="text-eyebrow">Hashtags</label>
            <textarea
              id="post-hashtags"
              disabled={post.status === "posted" || deliveryLocked || busy}
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              rows={2}
              className="mt-2 w-full resize-y rounded-xl border-0 bg-black/[0.04] p-3 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-[#907AFF]/30 dark:bg-card dark:text-foreground"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copy(hashtags, "hashtags")}
            >
              {copyFlash === "hashtags" ? "Copied!" : "Copy hashtags"}
            </Button>
          </section>

          {onDelivery && post.channel === "x" && post.contentType === "text" ? (
            <section className="space-y-3 rounded-2xl border border-border p-4" aria-label="Local publishing simulation">
              <p className="text-eyebrow">Local publishing simulation</p>
              <p className="text-sm text-muted-foreground">Development test only. API simulation requires Pro access. No external post is sent and no connected account is used. Live scheduling requires a protected delivery ledger; share approved copy manually.</p>
              {delivery ? <p role="status" className="text-sm">Delivery: {delivery.state === "simulated" ? "Simulated — no external post was sent" : delivery.state}</p> : null}
              {delivery?.error ? <p role="alert" className="text-sm text-red-700">{delivery.error}</p> : null}
              {delivery?.state === "processing" ? <p className="text-sm text-muted-foreground">Delivery is in progress. If this persists after a worker interruption, verify your X account with support; a missing receipt is never retried automatically.</p> : null}
              {post.postedUrl ? <a className="text-sm underline" href={post.postedUrl} target="_blank" rel="noopener noreferrer">View published post</a> : null}
              {!deliveryLocked && post.status !== "posted" ? <>
                <label htmlFor="post-publish-time" className="block text-sm">Simulate at (your local time)</label>
                <input id="post-publish-time" type="datetime-local" value={publishTime} onChange={event => setPublishTime(event.target.value)} disabled={busy} className="w-full rounded-lg border border-border bg-background p-2 text-sm" />
                <Button size="sm" onClick={() => sendDelivery("schedule")} disabled={busy || conflicted || hasUnsavedEdits || post.status !== "ready" || !publishTime}>Schedule local simulation</Button>
              </> : null}
              {delivery?.state === "failed" ? <Button size="sm" onClick={() => sendDelivery("retry")} disabled={busy || conflicted || hasUnsavedEdits}>Retry simulation</Button> : null}
              {delivery && ["scheduled", "failed"].includes(delivery.state) ? <Button size="sm" variant="ghost" onClick={() => sendDelivery("cancel")} disabled={busy}>Cancel simulation</Button> : null}
            </section>
          ) : null}

          {!onDelivery ? <p className="text-sm text-muted-foreground">Automatic publishing is unavailable. Copy and share your approved post manually.</p> : null}

          {/* Quick actions */}
          <section className="rounded-2xl bg-black/[0.03] p-4 dark:bg-card">
            <p className="text-eyebrow">Post this</p>
            <p className="mt-2 text-[13px] text-muted-foreground dark:text-muted-foreground">
              Copy everything, open {post.channel}, paste, hit publish.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => copy(fullCaption({ ...post, caption, hashtags }), "all")}
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {copyFlash === "all" ? "Copied!" : "Copy caption + hashtags"}
              </Button>
              <a
                href={CHANNEL_OPEN_URL[post.channel] ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border border-border px-4 py-1.5 text-[13px] font-medium text-foreground hover:border-border hover:text-foreground dark:border-border dark:text-muted-foreground dark:hover:border-border dark:hover:text-foreground"
              >
                Open {post.channel}
              </a>
              {post.mediaAssetUrl ? (
                <a
                  href={post.mediaAssetUrl}
                  download
                  className="inline-flex items-center rounded-full border border-border px-4 py-1.5 text-[13px] font-medium text-foreground hover:border-border hover:text-foreground dark:border-border dark:text-muted-foreground dark:hover:border-border dark:hover:text-foreground"
                >
                  Download trailer
                </a>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {post.status !== "posted" && (post.status !== "ready" || hasUnsavedEdits) ? (
                <Button size="sm" onClick={() => update({ caption, hashtags, status: "ready" })}
                  disabled={deliveryLocked || conflicted || !caption.trim() || (post.contentType !== "text" && !post.mediaAssetUrl)} isLoading={busy}>
                  Approve final copy
                </Button>
              ) : null}
              {post.status === "posted" ? (
                <p className="text-[13px] text-emerald-700 dark:text-emerald-400">
                  Marked as posted{post.postedAt ? ` ${formatDay(post.postedAt)}` : ""}.
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={markPosted}
                  disabled={deliveryLocked || conflicted || post.status !== "ready" || hasUnsavedEdits}
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
                  disabled={deliveryLocked || conflicted}
                  isLoading={busy}
                >
                  Skip this one
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      </aside>
    </Dialog>
  );
}
