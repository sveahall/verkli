"use client";

import Link from "next/link";
import Image from "next/image";
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
  fixedChapterId?: string | null;
  title?: string;
};

const formatter = new Intl.DateTimeFormat("en-US", {
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
    <div className="relative h-9 w-9 overflow-hidden rounded-xl border border-black/[0.06] bg-[#F8F9FB] text-xs font-semibold text-[#64748B] dark:border-white/10 dark:bg-white/10 dark:text-white/60">
      {author.avatarUrl ? (
        <Image src={author.avatarUrl} alt={author.name} fill sizes="36px" className="object-cover" />
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
  fixedChapterId = null,
  title = "Comments",
}: CommentsSectionProps) {
  const toast = useToastHelpers();
  const [comments, setComments] = useState<BookComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState<string>(fixedChapterId ?? "");
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
      const chapterQuery = fixedChapterId
        ? `?chapterId=${encodeURIComponent(fixedChapterId)}`
        : "";
      const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/comments${chapterQuery}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as CommentsResponse;

      if (!response.ok) {
        const message = resolveErrorMessage(payload.error, "Could not load comments.");
        setLoadError(message);
        return;
      }

      setComments(Array.isArray(payload.comments) ? payload.comments : []);
    } catch {
      setLoadError("Could not load comments.");
    } finally {
      setIsLoading(false);
    }
  }, [bookId, fixedChapterId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  useEffect(() => {
    setSelectedChapterId(fixedChapterId ?? "");
  }, [fixedChapterId]);

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
          toast.error(resolveErrorMessage(payload.error, "Could not publish comment."));
          return;
        }

        if (input.parentCommentId) {
          toast.success("Reply published.");
          setReplyBody("");
          setReplyingToId(null);
        } else {
          toast.success("Comment published.");
          setBody("");
          setSelectedChapterId(fixedChapterId ?? "");
        }

        await loadComments();
      } catch {
        toast.error("Could not publish comment.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [bookId, fixedChapterId, loadComments, toast]
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
          toast.error(resolveErrorMessage(payload.error, "Could not delete comment."));
          return;
        }

        toast.success("Comment deleted.");
        await loadComments();
      } catch {
        toast.error("Could not delete comment.");
      } finally {
        setPendingDeleteId(null);
      }
    },
    [loadComments, toast]
  );

  return (
    <section>
      <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-[#0F172A] dark:text-white">{title}</h2>
          <span className="text-xs text-[#64748B] dark:text-white/50">
            {totalComments} total
          </span>
        </div>

        {!isSignedIn ? (
          <div className="mt-4 rounded-xl border border-black/[0.06] bg-[#F8F9FB] p-4 text-sm text-[#64748B] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60">
            <p>Sign in to comment.</p>
            <Link
              href={signInHref}
              className="mt-3 inline-flex items-center rounded-xl border border-black/[0.06] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-black/[0.06] bg-[#F8F9FB] p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <label htmlFor="comment-body" className="text-sm font-medium text-[#64748B] dark:text-white/60">
              New comment
            </label>
            <Textarea
              id="comment-body"
              className="mt-2 min-h-[110px]"
              placeholder="Write your comment..."
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={2000}
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {!fixedChapterId ? (
                <div className="flex items-center gap-2">
                  <label htmlFor="comment-chapter" className="text-xs text-[#64748B] dark:text-white/50">
                    Chapter
                  </label>
                  <select
                    id="comment-chapter"
                    className="rounded-xl border border-black/[0.06] bg-white px-3 py-1.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#907AFF]/15 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/80"
                    value={selectedChapterId}
                    onChange={(event) => setSelectedChapterId(event.target.value)}
                  >
                    <option value="">Entire book</option>
                    {chapterOptions.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.order}. {chapter.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-[#64748B] dark:text-white/50">
                  This thread is linked to this chapter.
                </p>
              )}

              <Button
                type="button"
                onClick={() =>
                  submitComment({
                    text: body,
                    chapterId: fixedChapterId ?? (selectedChapterId || null),
                  })
                }
                isLoading={isSubmitting}
                loadingText="Publishing"
              >
                Publish
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-[#64748B] dark:text-white/50">Loading comments...</p>
          ) : loadError ? (
            <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500">
              {loadError}
            </p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-[#64748B] dark:text-white/50">No comments yet. Start the thread.</p>
          ) : (
            comments.map((comment) => (
              <article
                key={comment.id}
                className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex items-start gap-3">
                  <AuthorAvatar author={comment.author} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[#0F172A] dark:text-white">
                        {comment.author.name}
                      </p>
                      {comment.author.username && (
                        <span className="text-xs text-[#64748B] dark:text-white/50">
                          @{comment.author.username}
                        </span>
                      )}
                      <span className="text-xs text-[#64748B] dark:text-white/40">
                        {formatTimestamp(comment.createdAt)}
                      </span>
                      {comment.chapterTitle && (
                        <span className="rounded-xl border border-green-500/20 bg-green-500/5 px-2 py-0.5 text-xs font-medium text-green-500">
                          {comment.chapterTitle}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#0F172A]/80 dark:text-white/70">
                      {comment.body}
                    </p>

                    <div className="mt-2 flex items-center gap-4 text-xs">
                      {isSignedIn && (
                        <button
                          type="button"
                          className="text-[#64748B] transition-colors hover:text-[#907AFF] dark:text-white/50 dark:hover:text-[#907AFF]"
                          onClick={() => {
                            setReplyingToId((current) =>
                              current === comment.id ? null : comment.id
                            );
                            setReplyBody("");
                          }}
                        >
                          Reply
                        </button>
                      )}
                      {canDeleteComment(comment.authorId) && (
                        <button
                          type="button"
                          className="text-red-500 transition-colors hover:text-red-600"
                          disabled={pendingDeleteId === comment.id}
                          onClick={() => deleteComment(comment.id)}
                        >
                          {pendingDeleteId === comment.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>

                    {isSignedIn && replyingToId === comment.id && (
                      <div className="mt-3 rounded-xl border border-black/[0.06] bg-[#F8F9FB] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <Textarea
                          className="min-h-[90px]"
                          placeholder="Write your reply..."
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
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            isLoading={isSubmitting}
                            loadingText="Publishing"
                            onClick={() =>
                              submitComment({
                                text: replyBody,
                                parentCommentId: comment.id,
                                chapterId: comment.chapterId,
                              })
                            }
                          >
                            Publish reply
                          </Button>
                        </div>
                      </div>
                    )}

                    {comment.replies.length > 0 && (
                      <div className="mt-3 space-y-2 border-l-2 border-black/[0.06] pl-4 dark:border-white/10">
                        {comment.replies.map((reply) => (
                          <div
                            key={reply.id}
                            className="rounded-xl bg-[#F8F9FB] p-3 dark:bg-white/[0.03]"
                          >
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-[#0F172A] dark:text-white">
                                {reply.author.name}
                              </p>
                              {reply.author.username && (
                                <span className="text-xs text-[#64748B] dark:text-white/50">
                                  @{reply.author.username}
                                </span>
                              )}
                              <span className="text-xs text-[#64748B] dark:text-white/40">
                                {formatTimestamp(reply.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#0F172A]/80 dark:text-white/70">
                              {reply.body}
                            </p>
                            {canDeleteComment(reply.authorId) && (
                              <button
                                type="button"
                                className="mt-1 text-xs text-red-500 transition-colors hover:text-red-600"
                                disabled={pendingDeleteId === reply.id}
                                onClick={() => deleteComment(reply.id)}
                              >
                                {pendingDeleteId === reply.id ? "Deleting..." : "Delete"}
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
