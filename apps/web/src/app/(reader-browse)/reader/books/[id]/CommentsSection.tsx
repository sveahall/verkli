"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToastHelpers } from "@/components/ui/toast";
import { resolveErrorMessage } from "@/lib/error-messages";

type ChapterOption = {
  id: string;
  title: string;
  order: number;
};

type CommentAuthor = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};

type ReplyComment = {
  id: string;
  chapterId: string | null;
  chapterTitle: string | null;
  parentCommentId: string | null;
  body: string;
  authorId: string;
  createdAt: string;
  author: CommentAuthor;
};

type BookComment = {
  id: string;
  chapterId: string | null;
  chapterTitle: string | null;
  parentCommentId: string | null;
  body: string;
  authorId: string;
  createdAt: string;
  author: CommentAuthor;
  replies: ReplyComment[];
};

type CommentsResponse = {
  comments?: BookComment[];
  viewerId?: string | null;
  error?: string;
};

type CommentsSectionProps = {
  bookId: string;
  bookAuthorId: string;
  currentUserId: string | null;
  isSignedIn: boolean;
  signInHref: string;
  chapterOptions: ChapterOption[];
};

const formatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return formatter.format(date);
}

function AuthorAvatar({ author }: { author: CommentAuthor }) {
  const initials = author.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="h-9 w-9 overflow-hidden rounded-full border border-black/10 bg-slate-100 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-white/70">
      {author.avatarUrl ? (
        <img src={author.avatarUrl} alt={author.name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">{initials}</div>
      )}
    </div>
  );
}

export default function CommentsSection({
  bookId,
  bookAuthorId,
  currentUserId,
  isSignedIn,
  signInHref,
  chapterOptions,
}: CommentsSectionProps) {
  const toast = useToastHelpers();
  const [comments, setComments] = useState<BookComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const totalComments = useMemo(
    () =>
      comments.reduce((sum, comment) => {
        return sum + 1 + comment.replies.length;
      }, 0),
    [comments]
  );

  const canDeleteComment = useCallback(
    (authorId: string) => {
      if (!currentUserId) return false;
      return currentUserId === authorId || currentUserId === bookAuthorId;
    },
    [bookAuthorId, currentUserId]
  );

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/comments`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as CommentsResponse;

      if (!response.ok) {
        const message = resolveErrorMessage(payload.error, "Kunde inte ladda kommentarer.");
        setLoadError(message);
        return;
      }

      setComments(Array.isArray(payload.comments) ? payload.comments : []);
    } catch {
      setLoadError("Kunde inte ladda kommentarer.");
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const submitComment = useCallback(
    async (input: { text: string; parentCommentId?: string | null; chapterId?: string | null }) => {
      const trimmed = input.text.trim();
      if (!trimmed) return;

      setIsSubmitting(true);
      try {
        const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: trimmed,
            chapterId: input.chapterId ?? null,
            parentCommentId: input.parentCommentId ?? null,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          toast.error(resolveErrorMessage(payload.error, "Kunde inte publicera kommentaren."));
          return;
        }

        if (input.parentCommentId) {
          toast.success("Svar publicerat.");
          setReplyBody("");
          setReplyingToId(null);
        } else {
          toast.success("Kommentar publicerad.");
          setBody("");
          setSelectedChapterId("");
        }

        await loadComments();
      } catch {
        toast.error("Kunde inte publicera kommentaren.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [bookId, loadComments, toast]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!commentId) return;

      setPendingDeleteId(commentId);
      try {
        const response = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
          method: "DELETE",
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        if (!response.ok) {
          toast.error(resolveErrorMessage(payload.error, "Kunde inte radera kommentaren."));
          return;
        }

        toast.success("Kommentar raderad.");
        await loadComments();
      } catch {
        toast.error("Kunde inte radera kommentaren.");
      } finally {
        setPendingDeleteId(null);
      }
    },
    [loadComments, toast]
  );

  return (
    <section className="mx-auto max-w-[1100px] px-6 pb-14">
      <div className="rounded-[24px] border border-black/10 bg-black/[0.02] p-6 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[24px] font-semibold tracking-tight">Kommentarer</h2>
          <span className="rounded-full border border-black/10 bg-black/[0.02] px-3 py-1 text-[12px] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
            {totalComments} totalt
          </span>
        </div>

        {!isSignedIn ? (
          <div className="mt-5 rounded-2xl border border-slate-300/60 bg-slate-100/70 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
            <p>Logga in för att kommentera.</p>
            <Link
              href={signInHref}
              className="mt-3 inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium hover:bg-slate-50 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15"
            >
              Logga in
            </Link>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
            <label htmlFor="comment-body" className="text-[13px] font-medium text-slate-600 dark:text-white/70">
              Ny kommentar
            </label>
            <Textarea
              id="comment-body"
              className="mt-2 min-h-[110px]"
              placeholder="Skriv din kommentar..."
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={2000}
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label htmlFor="comment-chapter" className="text-[12px] text-slate-500 dark:text-white/50">
                  Kapitel
                </label>
                <select
                  id="comment-chapter"
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/30 dark:border-white/15 dark:bg-white/10 dark:text-white/80"
                  value={selectedChapterId}
                  onChange={(event) => setSelectedChapterId(event.target.value)}
                >
                  <option value="">Hela boken</option>
                  {chapterOptions.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.order}. {chapter.title}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                type="button"
                onClick={() =>
                  submitComment({
                    text: body,
                    chapterId: selectedChapterId || null,
                  })
                }
                isLoading={isSubmitting}
                loadingText="Publicerar"
              >
                Publicera
              </Button>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {isLoading ? (
            <p className="text-[14px] text-slate-500 dark:text-white/50">Laddar kommentarer...</p>
          ) : loadError ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[14px] text-rose-700 dark:text-rose-300">
              {loadError}
            </p>
          ) : comments.length === 0 ? (
            <p className="text-[14px] text-slate-500 dark:text-white/50">Inga kommentarer än. Starta tråden.</p>
          ) : (
            comments.map((comment) => (
              <article
                key={comment.id}
                className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-[0_6px_20px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-start gap-3">
                  <AuthorAvatar author={comment.author} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                        {comment.author.name}
                      </p>
                      {comment.author.username && (
                        <span className="text-[12px] text-slate-500 dark:text-white/50">
                          @{comment.author.username}
                        </span>
                      )}
                      <span className="text-[12px] text-slate-500 dark:text-white/45">
                        {formatTimestamp(comment.createdAt)}
                      </span>
                      {comment.chapterTitle && (
                        <span className="rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          {comment.chapterTitle}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700 dark:text-white/75">
                      {comment.body}
                    </p>

                    <div className="mt-3 flex items-center gap-3 text-[12px]">
                      {isSignedIn && (
                        <button
                          type="button"
                          className="text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white/90"
                          onClick={() => {
                            setReplyingToId((current) =>
                              current === comment.id ? null : comment.id
                            );
                            setReplyBody("");
                          }}
                        >
                          Svara
                        </button>
                      )}
                      {canDeleteComment(comment.authorId) && (
                        <button
                          type="button"
                          className="text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
                          disabled={pendingDeleteId === comment.id}
                          onClick={() => deleteComment(comment.id)}
                        >
                          {pendingDeleteId === comment.id ? "Raderar..." : "Radera"}
                        </button>
                      )}
                    </div>

                    {isSignedIn && replyingToId === comment.id && (
                      <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/5">
                        <Textarea
                          className="min-h-[90px]"
                          placeholder="Skriv ditt svar..."
                          value={replyBody}
                          onChange={(event) => setReplyBody(event.target.value)}
                          maxLength={2000}
                        />
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setReplyingToId(null);
                              setReplyBody("");
                            }}
                          >
                            Avbryt
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            isLoading={isSubmitting}
                            loadingText="Publicerar"
                            onClick={() =>
                              submitComment({
                                text: replyBody,
                                parentCommentId: comment.id,
                                chapterId: comment.chapterId,
                              })
                            }
                          >
                            Publicera svar
                          </Button>
                        </div>
                      </div>
                    )}

                    {comment.replies.length > 0 && (
                      <div className="mt-4 space-y-3 border-l border-black/10 pl-4 dark:border-white/10">
                        {comment.replies.map((reply) => (
                          <div
                            key={reply.id}
                            className="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/5"
                          >
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
                                {reply.author.name}
                              </p>
                              {reply.author.username && (
                                <span className="text-[11px] text-slate-500 dark:text-white/50">
                                  @{reply.author.username}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-500 dark:text-white/45">
                                {formatTimestamp(reply.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700 dark:text-white/75">
                              {reply.body}
                            </p>
                            {canDeleteComment(reply.authorId) && (
                              <button
                                type="button"
                                className="mt-2 text-[11px] text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
                                disabled={pendingDeleteId === reply.id}
                                onClick={() => deleteComment(reply.id)}
                              >
                                {pendingDeleteId === reply.id ? "Raderar..." : "Radera"}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
