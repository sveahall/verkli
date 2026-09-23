import type { MeterContext, Pipeline, UsageEventInput } from "./types";

/**
 * `ai_jobs.kind` values seen in production, mapped to the pipeline that pays
 * for them.
 *
 * The long form matters: the column holds `audiobook_generation`, never
 * `audiobook`. Querying the short name returns zero rows and reads as "no job
 * has ever run", which is a conclusion this repo has reached before and been
 * wrong about.
 */
const JOB_KIND_TO_PIPELINE: Record<string, Pipeline> = {
  audiobook_generation: "tts",
  editorial_review: "editorial",
  editorial_book_analysis: "editorial",
  translation_quality: "translation",
  book_import: "import",
  cover_generation: "cover",
  trailer_generation: "video",
};

export type AiJobRow = {
  id: string;
  user_id: string | null;
  kind: string;
  book_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  status: string;
};

/**
 * Turns one finished job into its usage event, or null when it cannot be
 * measured.
 *
 * An unrecognised `kind` is recorded under `other` rather than dropped. A new
 * job type is exactly when silent skipping would hurt most: the cost would be
 * real, the rows would be absent, and nothing would say so.
 */
export function jobToUsage(
  job: AiJobRow
): { ctx: MeterContext; events: UsageEventInput[] } | null {
  if (!job.user_id) return null;
  if (!job.started_at || !job.finished_at) return null;

  const durationMs =
    new Date(job.finished_at).getTime() - new Date(job.started_at).getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;

  const pipeline = JOB_KIND_TO_PIPELINE[job.kind];
  return {
    ctx: {
      userId: job.user_id,
      pipeline: pipeline ?? "other",
      bookId: job.book_id,
      jobId: job.id,
    },
    events: [
      {
        kind: "job",
        quantity: durationMs,
        unit: "ms",
        // The day the job finished, not the day the sync noticed it.
        occurredAt: job.finished_at,
        // Failures are recorded too. A run that burned tokens and then crashed
        // is precisely the cost that would otherwise be priced at zero.
        meta: {
          job_kind: job.kind,
          status: job.status,
          ...(pipeline ? {} : { unmapped_kind: true }),
        },
      },
    ],
  };
}
