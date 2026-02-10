"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { resolveErrorMessage } from "@/lib/error-messages";
import ReviewStars from "./ReviewStars";

const PAGE_SIZE = 5;

type ReviewItem = {
  id: string;
  bookId: string;
  bookVersionId: string | null;
  rating: number;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  reviewerName: string;
  isMine: boolean;
};

type ListReviewsResponse = {
  reviews: ReviewItem[];
  myReview: ReviewItem | null;
  hasMore: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
};

type AggregateResponse = {
  bookId: string;
  averageRating: number | null;
  ratingsCount: number;
};

type BookReviewsSectionProps = {
  bookId: string;
  isSignedIn: boolean;
  initialAverageRating: number | null;
  initialRatingsCount: number;
};

function formatDate(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getDefaultSaveError(errorKey: string | null | undefined): string {
  return resolveErrorMessage(errorKey, "Could not save your review.");
}

export default function BookReviewsSection({
  bookId,
  isSignedIn,
  initialAverageRating,
  initialRatingsCount,
}: BookReviewsSectionProps) {
  const [averageRating, setAverageRating] = useState<number | null>(initialAverageRating);
  const [ratingsCount, setRatingsCount] = useState<number>(initialRatingsCount);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [myReview, setMyReview] = useState<ReviewItem | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState(0);
  const [content, setContent] = useState("");

  const loadAggregate = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/reviews/aggregate`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await res.json().catch(() => ({}))) as Partial<AggregateResponse> & {
        error?: string;
      };

      if (!res.ok) return;

      setAverageRating(typeof payload.averageRating === "number" ? payload.averageRating : null);
      setRatingsCount(typeof payload.ratingsCount === "number" ? payload.ratingsCount : 0);
    } catch {
      // Non-blocking in UI.
    }
  }, [bookId]);

  const loadReviews = useCallback(
    async (targetPage: number) => {
      setLoadingReviews(true);
      setListError(null);

      try {
        const res = await fetch(
          `/api/books/${bookId}/reviews?page=${targetPage}&limit=${PAGE_SIZE}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );
        const payload = (await res.json().catch(() => ({}))) as
          | (Partial<ListReviewsResponse> & { error?: string })
          | null;

        if (!res.ok) {
          setListError(resolveErrorMessage(payload?.error, "Could not load reviews."));
          return;
        }

        setReviews(Array.isArray(payload?.reviews) ? payload.reviews : []);
        setHasMore(Boolean(payload?.hasMore));
        setTotalCount(typeof payload?.totalCount === "number" ? payload.totalCount : 0);
        setMyReview(payload?.myReview ?? null);
      } catch {
        setListError("Could not load reviews.");
      } finally {
        setLoadingReviews(false);
      }
    },
    [bookId]
  );

  useEffect(() => {
    void loadAggregate();
  }, [loadAggregate]);

  useEffect(() => {
    void loadReviews(page);
  }, [loadReviews, page]);

  useEffect(() => {
    setSelectedRating(myReview?.rating ?? 0);
    setContent(myReview?.content ?? "");
  }, [myReview?.id, myReview?.rating, myReview?.content]);

  const handleSubmit = async () => {
    if (savingReview || !isSignedIn) return;
    if (selectedRating < 1 || selectedRating > 5) {
      setSaveError("Please select a rating between 1 and 5.");
      return;
    }

    setSavingReview(true);
    setSaveError(null);

    try {
      const method = myReview ? "PATCH" : "POST";
      const res = await fetch(`/api/books/${bookId}/reviews`, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rating: selectedRating,
          content: content.trim().length > 0 ? content.trim() : null,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveError(getDefaultSaveError(payload?.error));
        return;
      }

      const firstPage = 1;
      setPage(firstPage);
      await Promise.all([loadAggregate(), loadReviews(firstPage)]);
    } catch {
      setSaveError("Could not save your review.");
    } finally {
      setSavingReview(false);
    }
  };

  const roundedAverageStars =
    typeof averageRating === "number" && Number.isFinite(averageRating)
      ? Math.max(0, Math.min(5, Math.round(averageRating)))
      : 0;

  return (
    <section className="mx-auto mt-2 max-w-[1100px] px-6 pb-16">
      <div className="grid gap-8 rounded-[24px] border border-black/10 bg-white/80 p-6 dark:border-white/10 dark:bg-white/[0.03] lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[12px] uppercase tracking-[0.12em] text-slate-500 dark:text-white/55">
              Reader rating
            </p>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-[32px] font-semibold tracking-tight text-slate-900 dark:text-white">
                {averageRating !== null ? averageRating.toFixed(1) : "-"}
              </span>
              <ReviewStars value={roundedAverageStars} readOnly size="sm" className="pb-1" />
            </div>
            <p className="mt-2 text-[13px] text-slate-600 dark:text-white/60">
              {ratingsCount} {ratingsCount === 1 ? "rating" : "ratings"}
            </p>
          </div>

          {isSignedIn ? (
            <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.04]">
              <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">
                {myReview ? "Update your review" : "Leave a review"}
              </h3>
              <p className="mt-1 text-[13px] text-slate-600 dark:text-white/60">
                Rate this book from 1 to 5 stars. Review text is optional.
              </p>

              <div className="mt-4">
                <ReviewStars value={selectedRating} onChange={setSelectedRating} />
              </div>

              <label className="mt-4 block text-[13px] font-medium text-slate-700 dark:text-white/75">
                Review text (optional)
              </label>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={5}
                maxLength={2000}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none transition focus:border-[#907AFF] focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/15 dark:bg-white/[0.03] dark:text-white/85"
                placeholder="Share what you liked (optional)"
              />

              {saveError ? (
                <p className="mt-3 text-[13px] text-rose-600 dark:text-rose-400">{saveError}</p>
              ) : null}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={savingReview}
                className="mt-4 rounded-full bg-[#907AFF] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#8069EE] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingReview
                  ? myReview
                    ? "Updating..."
                    : "Submitting..."
                  : myReview
                    ? "Update review"
                    : "Submit review"}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-5 text-[14px] text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70">
              <p>Sign in to rate this book and leave a review.</p>
              <Link
                href={`/reader/signin?next=${encodeURIComponent(`/reader/books/${bookId}`)}`}
                className="mt-3 inline-block rounded-full border border-slate-300 px-4 py-2 text-[13px] font-medium transition hover:bg-slate-100 dark:border-white/20 dark:hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">
              Reviews
            </h3>
            <p className="text-[13px] text-slate-600 dark:text-white/60">
              {totalCount} {totalCount === 1 ? "review" : "reviews"}
            </p>
          </div>

          {listError ? (
            <p className="mt-4 text-[14px] text-rose-600 dark:text-rose-400">{listError}</p>
          ) : null}

          {!listError && reviews.length === 0 && !loadingReviews ? (
            <p className="mt-4 rounded-2xl border border-slate-300/60 bg-slate-100/80 px-4 py-4 text-[14px] text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
              No reviews yet. Be the first to rate this book.
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            {reviews.map((review) => (
              <article
                key={review.id}
                className="rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-semibold text-slate-800 dark:text-white/85">
                    {review.reviewerName}
                    {review.isMine ? (
                      <span className="ml-2 text-[12px] font-medium text-[#907AFF]">
                        Your review
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[12px] text-slate-500 dark:text-white/45">
                    {formatDate(review.updatedAt || review.createdAt)}
                  </p>
                </div>
                <ReviewStars value={review.rating} readOnly size="sm" className="mt-2" />
                {review.content ? (
                  <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700 dark:text-white/70">
                    {review.content}
                  </p>
                ) : (
                  <p className="mt-3 text-[13px] italic text-slate-500 dark:text-white/50">
                    No written review.
                  </p>
                )}
              </article>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loadingReviews}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-[13px] text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/10"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!hasMore || loadingReviews}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-[13px] text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/10"
            >
              Next
            </button>
            <span className="ml-1 text-[12px] text-slate-500 dark:text-white/45">
              Page {page}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
