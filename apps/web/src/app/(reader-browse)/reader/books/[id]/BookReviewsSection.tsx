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
    <section className="mx-auto mt-6 max-w-[1100px] px-6 pb-16">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(246,243,255,0.82))] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))]">
        <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-[#907AFF]/15 blur-3xl dark:bg-[#907AFF]/20" />
        <div className="pointer-events-none absolute -bottom-20 left-16 h-48 w-48 rounded-full bg-[#E29ED5]/12 blur-3xl dark:bg-[#E29ED5]/15" />

        <div className="relative grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.05]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-white/55">
              Reader rating
              </p>
              <div className="mt-3 flex items-end gap-3">
                <span className="text-[34px] font-semibold tracking-tight text-slate-900 dark:text-white">
                  {averageRating !== null ? averageRating.toFixed(1) : "-"}
                </span>
                <ReviewStars value={roundedAverageStars} readOnly size="sm" className="pb-1" />
              </div>
              <p className="mt-2 text-[13px] text-slate-600 dark:text-white/60">
                {ratingsCount} {ratingsCount === 1 ? "rating" : "ratings"}
              </p>
            </div>

            {isSignedIn ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.05]">
                <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">
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
                  className="input-base mt-2 min-h-[132px] resize-y"
                  placeholder="Share what you liked (optional)"
                />

                {saveError ? (
                  <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">
                    {saveError}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={savingReview}
                  className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-gradient-to-r from-[#907AFF] via-[#A68EFF] to-[#E29ED5] px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(144,122,255,0.30)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-[#08070f]"
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
              <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 text-[14px] text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70">
                <p>Sign in to rate this book and leave a review.</p>
                <Link
                  href={`/reader/signin?next=${encodeURIComponent(`/reader/books/${bookId}`)}`}
                  className="mt-3 inline-flex min-h-[40px] items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.05]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">
                Reviews
              </h3>
              <p className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
                {totalCount} {totalCount === 1 ? "review" : "reviews"}
              </p>
            </div>

            {listError ? (
              <p className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-[14px] text-rose-700 dark:text-rose-300">
                {listError}
              </p>
            ) : null}

            {loadingReviews && !listError ? (
              <p className="mt-4 rounded-xl border border-slate-200/70 bg-slate-100/70 px-4 py-3 text-[14px] text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
                Loading reviews...
              </p>
            ) : null}

            {!listError && reviews.length === 0 && !loadingReviews ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-300/70 bg-slate-100/70 px-4 py-4 text-[14px] text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/60">
                No reviews yet. Be the first to rate this book.
              </p>
            ) : null}

            <div className="mt-4 space-y-3">
              {reviews.map((review) => (
                <article
                  key={review.id}
                  className="rounded-xl border border-slate-200/80 bg-white/90 p-4 transition-shadow hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[14px] font-semibold text-slate-800 dark:text-white/85">
                      {review.reviewerName}
                      {review.isMine ? (
                        <span className="ml-2 rounded-full border border-[#907AFF]/30 bg-[#907AFF]/10 px-2 py-0.5 text-[11px] font-medium text-[#7257f0] dark:text-[#c4b5ff]">
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
                className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-[13px] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/10"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!hasMore || loadingReviews}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-[13px] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/10"
              >
                Next
              </button>
              <span className="ml-1 text-[12px] text-slate-500 dark:text-white/45">
                Page {page}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
