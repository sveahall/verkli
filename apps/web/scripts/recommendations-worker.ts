/**
 * BullMQ worker: compute personalized recommendations for users.
 * Run from apps/web: npm run recommendations-worker
 * Requires: REDIS_URL, Supabase env
 *
 * Lightweight — no external API calls. Reads DB, scores books, writes results.
 */

import "./load-dotenv";
import "./sentry-worker-init";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

import { Worker } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import { QUEUE_NAMES } from "../src/lib/queue-names";
import { startHeartbeatInterval } from "../src/lib/health/worker-heartbeat";
import { Sentry } from "./sentry-worker-init";
import type { RecommendationsJobData } from "../src/lib/recommendations-queue";

const QUEUE_NAME = QUEUE_NAMES.RECOMMENDATIONS;
const MAX_RECS_PER_USER = 100;
const MAX_PER_AUTHOR = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Job Processing
// ─────────────────────────────────────────────────────────────────────────────

async function processJob(data: RecommendationsJobData) {
  const { userId, trigger } = data;
  const supabase = createAdminClient();

  console.log("[recommendations worker] computing for user:", userId, "trigger:", trigger);

  // 1. Gather user signals
  const [genrePrefsRes, likedBooksRes, readingsRes, bookmarksRes, followsRes] = await Promise.all([
    supabase.from("reader_genre_preferences").select("genre_id, weight").eq("user_id", userId),
    supabase.from("reader_book_signals").select("book_id").eq("user_id", userId).eq("signal", "like"),
    supabase.from("readings").select("book_id").eq("user_id", userId),
    supabase.from("bookmarks").select("book_id").eq("user_id", userId),
    supabase.from("author_followers").select("author_id").eq("follower_id", userId),
  ]);

  const genrePrefs = genrePrefsRes.data ?? [];
  const likedBookIds = new Set((likedBooksRes.data ?? []).map((r) => r.book_id));
  const readBookIds = new Set((readingsRes.data ?? []).map((r) => r.book_id));
  const bookmarkedIds = new Set((bookmarksRes.data ?? []).map((r) => r.book_id));
  const followedAuthorIds = new Set((followsRes.data ?? []).map((r) => r.author_id));

  if (genrePrefs.length === 0 && likedBookIds.size === 0) {
    console.log("[recommendations worker] no signals for user:", userId, "— skipping");
    return;
  }

  // Genre weight map
  const genreWeightMap = new Map<string, number>();
  for (const pref of genrePrefs) {
    genreWeightMap.set(pref.genre_id, pref.weight ?? 1.0);
  }

  // 2. Get candidate books (all published, exclude already-read)
  const { data: candidates } = await supabase
    .from("books")
    .select("id, author_id, language, published_at")
    .eq("status", "PUBLISHED")
    .limit(500);

  if (!candidates?.length) {
    console.log("[recommendations worker] no published books found");
    return;
  }

  const unreadCandidates = candidates.filter((b) => !readBookIds.has(b.id));
  if (unreadCandidates.length === 0) {
    console.log("[recommendations worker] user has read all books:", userId);
    return;
  }

  const candidateIds = unreadCandidates.map((b) => b.id);

  // 3. Get genres for all candidates
  const { data: allBookGenres } = await supabase
    .from("book_genres")
    .select("book_id, genre_id")
    .in("book_id", candidateIds);

  const bookGenreMap = new Map<string, string[]>();
  for (const bg of allBookGenres ?? []) {
    const list = bookGenreMap.get(bg.book_id) ?? [];
    list.push(bg.genre_id);
    bookGenreMap.set(bg.book_id, list);
  }

  // 4. Get liked books' genres for expansion
  const likedGenres = new Set<string>();
  if (likedBookIds.size > 0) {
    const { data: likedBookGenres } = await supabase
      .from("book_genres")
      .select("genre_id")
      .in("book_id", [...likedBookIds]);

    for (const bg of likedBookGenres ?? []) {
      likedGenres.add(bg.genre_id);
    }
  }

  // 5. Collaborative filtering: find users sharing 2+ reads
  const coReadBoost = new Map<string, number>();
  if (readBookIds.size >= 2) {
    const readArr = [...readBookIds].slice(0, 50);
    const { data: coReaders } = await supabase
      .from("readings")
      .select("user_id, book_id")
      .in("book_id", readArr)
      .neq("user_id", userId)
      .limit(500);

    // Count overlap per user
    const userOverlap = new Map<string, number>();
    for (const r of coReaders ?? []) {
      userOverlap.set(r.user_id, (userOverlap.get(r.user_id) ?? 0) + 1);
    }

    // Find users with 2+ shared reads
    const similarUsers = [...userOverlap.entries()]
      .filter(([, count]) => count >= 2)
      .map(([uid]) => uid)
      .slice(0, 20);

    if (similarUsers.length > 0) {
      const { data: theirBooks } = await supabase
        .from("readings")
        .select("book_id, user_id")
        .in("user_id", similarUsers)
        .limit(500);

      for (const r of theirBooks ?? []) {
        if (!readBookIds.has(r.book_id)) {
          const overlap = userOverlap.get(r.user_id) ?? 0;
          const current = coReadBoost.get(r.book_id) ?? 0;
          coReadBoost.set(r.book_id, current + overlap * 3);
        }
      }
    }
  }

  // 6. Score each candidate
  const scored: Array<{ bookId: string; score: number; reason: string }> = [];
  const authorCount = new Map<string, number>();

  for (const book of unreadCandidates) {
    let score = 0;
    let topReason = "personalized";

    // Genre match (60% weight): book's genres × user's genre weights × 10
    const bookGenres = bookGenreMap.get(book.id) ?? [];
    let genreScore = 0;
    for (const gid of bookGenres) {
      const weight = genreWeightMap.get(gid);
      if (weight !== undefined) {
        genreScore += weight * 10;
      }
    }
    score += genreScore;
    if (genreScore > 0) topReason = "genre_match";

    // Collaborative filtering boost
    const collab = coReadBoost.get(book.id) ?? 0;
    if (collab > 0) {
      score += collab;
      if (collab > genreScore) topReason = "collaborative";
    }

    // Author affinity: +15 for followed, +12 for highly-rated
    if (followedAuthorIds.has(book.author_id)) {
      score += 15;
      topReason = "author_affinity";
    }

    // Liked-book genre expansion: +8 for books sharing genres with liked books
    if (likedGenres.size > 0 && bookGenres.length > 0) {
      const hasLikedGenre = bookGenres.some((g) => likedGenres.has(g));
      if (hasLikedGenre) score += 8;
    }

    // Bookmark boost: +5 for bookmarked but unread
    if (bookmarkedIds.has(book.id)) {
      score += 5;
    }

    // Popularity nudge: simplified (would need reader_count in production)
    // Using recency as proxy
    if (book.published_at) {
      const daysOld = (Date.now() - new Date(book.published_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysOld < 30) score += 5;
      else if (daysOld < 90) score += 3;
    }

    if (score > 0) {
      scored.push({ bookId: book.id, score, reason: topReason });
    }
  }

  // Sort DESC by score
  scored.sort((a, b) => b.score - a.score);

  // Diversity cap: max 3 per author
  const diversified: typeof scored = [];
  const candidateMap = new Map(unreadCandidates.map((b) => [b.id, b]));

  for (const item of scored) {
    const book = candidateMap.get(item.bookId);
    if (!book) continue;
    const count = authorCount.get(book.author_id) ?? 0;
    if (count >= MAX_PER_AUTHOR) continue;
    authorCount.set(book.author_id, count + 1);
    diversified.push(item);
    if (diversified.length >= MAX_RECS_PER_USER) break;
  }

  if (diversified.length === 0) {
    console.log("[recommendations worker] no scorable candidates for user:", userId);
    return;
  }

  // 7. Write results to recommendations table
  const batchId = `${userId}-${Date.now()}`;
  const now = new Date().toISOString();

  const rows = diversified.map((item, idx) => ({
    user_id: userId,
    book_id: item.bookId,
    score: item.score,
    reason: item.reason,
    rank: idx,
    batch_id: batchId,
    computed_at: now,
  }));

  // Delete previous batches for this user
  await supabase.from("recommendations").delete().eq("user_id", userId);

  // Insert new batch
  const { error: insertError } = await supabase.from("recommendations").insert(rows);

  if (insertError) {
    console.error("[recommendations worker] insert error:", insertError.message);
    throw new Error(`Failed to insert recommendations: ${insertError.message}`);
  }

  console.log(
    "[recommendations worker] completed for user:",
    userId,
    "recommendations:",
    diversified.length,
    "batch:",
    batchId
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled recomputation
// ─────────────────────────────────────────────────────────────────────────────

async function scheduleRecomputation() {
  const { enqueueRecommendationsJob } = await import("../src/lib/recommendations-queue");

  const supabase = createAdminClient();

  const { data: activeUsers } = await supabase
    .from("profiles")
    .select("user_id")
    .not("onboarding_completed_at", "is", null)
    .limit(500);

  if (!activeUsers?.length) return;

  let enqueued = 0;
  for (const user of activeUsers) {
    try {
      await enqueueRecommendationsJob({ userId: user.user_id, trigger: "scheduled" });
      enqueued++;
    } catch (err) {
      console.error("[recommendations worker] failed to enqueue scheduled job for:", user.user_id, err);
    }
  }

  console.log("[recommendations worker] scheduled recomputation enqueued:", enqueued, "users");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const url = process.env.REDIS_URL ?? "";
  if (!url || url.trim() === "") {
    console.error("[recommendations worker] REDIS_URL not set.");
    process.exit(1);
  }

  const connection = getRedisConnectionOptions();
  if (!connection) {
    console.error("[recommendations worker] Redis not reachable.");
    process.exit(1);
  }

  console.log("[recommendations-worker] started", { queue: QUEUE_NAME });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "compute" && job.data) {
        console.log("[recommendations-worker] processing job", job.id);
        await processJob(job.data as RecommendationsJobData);
      }
    },
    {
      connection: { ...connection },
      concurrency: 4,
      stalledInterval: 60_000,
      lockDuration: 120_000,
      maxStalledCount: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log("[recommendations worker] job completed:", job.id);
  });

  worker.on("failed", (job, err) => {
    Sentry.captureException(err);
    console.error("[recommendations-worker] job failed", job?.id, err?.message);
  });

  worker.on("error", (err) => {
    console.error("[recommendations worker] error:", err.message);
  });

  const heartbeatInterval = startHeartbeatInterval(QUEUE_NAME);

  worker.on("closed", () => clearInterval(heartbeatInterval));

  // Scheduled recomputation every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const recomputeInterval = setInterval(() => {
    scheduleRecomputation().catch((err) => {
      console.error("[recommendations worker] scheduled recomputation failed:", err);
    });
  }, SIX_HOURS);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[recommendations worker] shutting down...");
    clearInterval(heartbeatInterval);
    clearInterval(recomputeInterval);
    await worker.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main();
