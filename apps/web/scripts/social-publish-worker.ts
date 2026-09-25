import { isSocialPublishingEnabled, CLOSED_BETA_MESSAGE } from "../src/lib/marketing/beta-policy";
/**
 * BullMQ worker: process "publish" jobs for social media publishing.
 * Run from apps/web: npm run social-publish-worker
 * Requires: REDIS_URL, SOCIAL_TOKEN_KEY, Supabase env
 *
 * Uses ai_jobs table for job tracking (kind='social_publish').
 * Results stored in ai_jobs.output.results per platform.
 */

import "./load-dotenv";
import "./sentry-worker-init";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

import { Worker, UnrecoverableError } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import type { Tables, TablesUpdate } from "../src/lib/supabase/types";
import { QUEUE_NAMES } from "../src/lib/queue-names";
import { startHeartbeatInterval } from "../src/lib/health/worker-heartbeat";
import type { SocialPublishJobData } from "../src/lib/social-publish-queue";
import { decryptToken, encryptToken } from "../src/lib/social/token-crypto";
import { PUBLISHABLE_PLATFORMS } from "../src/lib/social/platform-constraints";
import { validateForPlatform } from "../src/lib/social/platform-constraints";
import { refreshAccessToken } from "../src/lib/social/oauth";
import { sanitizeJobErrorForStorage } from "../src/lib/sanitize-job-error";
import { assertLocalCampaignSimulation, consumePostDelivery } from "../src/lib/marketing/post-delivery";
import { Sentry } from "./sentry-worker-init";

const QUEUE_NAME = QUEUE_NAMES.SOCIAL_PUBLISH;

// A mock worker must never attach to a remote/shared queue before a job is read.
// The separate nonmock legacy worker retains its existing remote Redis support.
const MOCK_MODE = process.env.SOCIAL_MOCK_MODE === "true";
if (MOCK_MODE) assertLocalCampaignSimulation(true);

// ─────────────────────────────────────────────────────────────────────────────
// Platform publishers
// ─────────────────────────────────────────────────────────────────────────────

type PlatformResult = {
  status: "ok" | "failed" | "not_implemented";
  postId?: string;
  messageId?: string;
  error?: string;
};

async function publishToX(
  accessToken: string,
  text: string
): Promise<PlatformResult> {
  const validation = validateForPlatform(text, "x");
  if (!validation.valid || !text.trim()) return { status: "failed", error: validation.error ?? "Caption is empty" };

  if (MOCK_MODE) {
    return { status: "ok", postId: `mock-x-${Date.now()}` };
  }

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    return { status: "failed", error: `X API error ${res.status}. Verify delivery in X before retrying.` };
  }

  const data = (await res.json()) as { data?: { id?: string } };
  if (!data.data?.id) return { status: "failed", error: "X returned no post ID. Verify delivery in X before retrying." };
  return { status: "ok", postId: data.data.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Processing
// ─────────────────────────────────────────────────────────────────────────────

async function processJob(payload: SocialPublishJobData) {
  const { jobId, campaignId, userId, platforms } = payload;
  if ("postId" in payload) {
    assertLocalCampaignSimulation(MOCK_MODE);
    if (typeof payload.postId !== "string" || !payload.postId) throw new UnrecoverableError("Invalid local simulation post ID");
    await consumePostDelivery({
      client: createAdminClient(), postId: payload.postId, jobId, userId, simulated: MOCK_MODE,
    });
    return;
  }


  if (!isSocialPublishingEnabled()) {
    if (!MOCK_MODE) throw new UnrecoverableError(CLOSED_BETA_MESSAGE);
    assertLocalCampaignSimulation(MOCK_MODE);
  }
  const supabase = createAdminClient();
  const updateJob = async (
    status: string,
    outputUpdate: Record<string, unknown> = {},
    error?: string
  ) => {
    const now = new Date().toISOString();
    // Typed rather than a loose record: `.update()` on a typed client rejects
    // unknown keys, which is the point — a typo here used to be a silent no-op.
    const updates: TablesUpdate<"ai_jobs"> = { status };

    if (status === "processing") updates.started_at = now;
    if (status === "completed" || status === "failed") updates.finished_at = now;
    if (error) updates.error = sanitizeJobErrorForStorage(error);

    const { data: current, error: readError } = await supabase
      .from("ai_jobs")
      .select("output")
      .eq("id", jobId)
      .single();

    if (readError) throw new Error("Could not read publishing job status");
    const currentOutput = (current?.output ?? {}) as Record<string, unknown>;
    updates.output = { ...currentOutput, ...outputUpdate } as TablesUpdate<"ai_jobs">["output"];

    const { error: updateError } = await supabase.from("ai_jobs").update(updates).eq("id", jobId);
    if (updateError) throw new Error("Could not save publishing job status");
  };

  try {
    console.log("[social-publish worker] job started -", jobId, "campaign:", campaignId);

    // Auth isolation: verify the user owns the campaign.
    //
    // marketing_campaigns has neither `user_id` nor `content`. It never has —
    // the columns are book_id and caption. So this select returned a PostgREST
    // 400, campError was set, and EVERY job died on "Campaign not found". The
    // ownership check below has therefore never actually run; it failed closed,
    // which is the only reason this was a dead feature rather than a hole.
    //
    // Ownership resolves through the book, in a second explicit query rather
    // than a PostgREST embed: this is an authorisation check, and it should be
    // obvious what it compares.
    const { data: campaign, error: campError } = await supabase
      .from("marketing_campaigns")
      .select("id, book_id, caption, channel")
      .eq("id", campaignId)
      .single();

    if (campError || !campaign) {
      throw new UnrecoverableError("Campaign not found");
    }

    if (!campaign.book_id) {
      throw new UnrecoverableError("Campaign has no book, so ownership cannot be established");
    }

    const { data: ownerBook, error: bookError } = await supabase
      .from("books")
      .select("author_id")
      .eq("id", campaign.book_id)
      .single();

    if (bookError || !ownerBook) {
      throw new UnrecoverableError("Campaign book not found");
    }

    if (ownerBook.author_id !== userId) {
      const errMsg = "Ownership mismatch: userId does not match campaign owner";
      console.error("[social-publish worker]", errMsg);
      await updateJob("failed", {}, errMsg);
      throw new UnrecoverableError(errMsg);
    }

    const camp = { ...campaign, content: campaign.caption };

    const { data: previousJob, error: previousError } = await supabase.from("ai_jobs").select("output").eq("id", jobId).single();
    if (previousError) throw new Error("Could not read previous publishing attempt");
    const previousOutput = (previousJob?.output ?? {}) as { simulated?: boolean; results?: Record<string, PlatformResult>; dispatched?: Record<string, boolean> };
    if (previousOutput.simulated && !MOCK_MODE) throw new UnrecoverableError("A simulation cannot be resumed as a live publishing job");
    const dispatched = { ...previousOutput.dispatched };
    await updateJob("processing", { simulated: MOCK_MODE });

    const content = camp.content ?? "";
    const results: Record<string, PlatformResult> = { ...previousOutput.results };

    // Fetch user's social connections
    const { data: connections, error: connectionsError } = await supabase
      .from("social_connections")
      .select("platform, access_token_enc, refresh_token_enc, token_expires_at, email_config_enc, status")
      .eq("user_id", userId);

    if (connectionsError) throw new Error("Could not load connected accounts");

    // The row type, not Record<string, unknown>. The cast that used to be here
    // turned every column into `unknown`, so the token columns had to be
    // String()-wrapped on read and could be written back as anything.
    type ConnRow = Pick<
      Tables<"social_connections">,
      "platform" | "access_token_enc" | "refresh_token_enc" | "token_expires_at" | "email_config_enc" | "status"
    >;
    const connMap = new Map<string, ConnRow>();
    for (const c of connections ?? []) {
      connMap.set(c.platform, c);
    }

    for (const platform of platforms) {
      // Not-implemented platforms
      if (!PUBLISHABLE_PLATFORMS.includes(platform)) {
        results[platform] = { status: "not_implemented", error: "E_SOCIAL_PUBLISH_NOT_IMPLEMENTED" };
        continue;
      }

      if (results[platform]?.status === "ok") continue;
      if (dispatched[platform]) {
        results[platform] = { status: "failed", error: "Previous delivery is uncertain. Verify the post in your connected account before starting another publish." };
        continue;
      }
      const conn = connMap.get(platform);
      if (!conn || conn.status !== "active") {
        results[platform] = { status: "failed", error: "Platform not connected" };
        continue;
      }

      try {
        // Helper: decrypt access token and refresh if expired
        const getAccessToken = async (p: string): Promise<string> => {
          let accessToken = conn.access_token_enc ? decryptToken(String(conn.access_token_enc)) : "";
          if (conn.token_expires_at) {
            const expiresAt = new Date(String(conn.token_expires_at));
            if (expiresAt <= new Date() && conn.refresh_token_enc) {
              const refreshToken = decryptToken(String(conn.refresh_token_enc));
              const refreshed = await refreshAccessToken(p, refreshToken);
              accessToken = refreshed.accessToken;
              await supabase
                .from("social_connections")
                .update({
                  access_token_enc: encryptToken(refreshed.accessToken),
                  refresh_token_enc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : conn.refresh_token_enc,
                  token_expires_at: refreshed.expiresIn
                    ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
                    : conn.token_expires_at,
                })
                .eq("user_id", userId)
                .eq("platform", p);
            }
          }
          return accessToken;
        };

        if (platform === "x") {
          const accessToken = await getAccessToken("x");
          // Persist before the external side effect. An ambiguous retry requires
          // manual reconciliation instead of automatically creating a duplicate.
          dispatched[platform] = true;
          await updateJob("processing", { dispatched, results, simulated: MOCK_MODE });
          results[platform] = await publishToX(accessToken, content);
          await updateJob("processing", { results, simulated: MOCK_MODE });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[social-publish worker] ${platform} failed:`, msg);
        results[platform] = { status: "failed", error: msg.slice(0, 200) };
      }
    }

    // Check if all publishable platforms succeeded
    const publishablePlatforms = platforms.filter((p) => PUBLISHABLE_PLATFORMS.includes(p));
    const allPublishableSucceeded = publishablePlatforms.every(
      (p) => results[p]?.status === "ok"
    );

    if (publishablePlatforms.length !== platforms.length || !allPublishableSucceeded || platforms.length === 0) {
      // At least one publishable platform failed to post — the job must NOT be
      // reported as "completed" (that made the author's UI show a successful
      // publish while nothing was posted). Mark it failed and surface which
      // platforms failed, keeping the per-platform results for detail.
      const failedPlatforms = platforms.filter(
        (p) => results[p]?.status !== "ok"
      );
      await updateJob(
        "failed",
        { results },
        `Publicering misslyckades för: ${failedPlatforms.join(", ")}.`
      );
    } else {
      await updateJob("completed", { results });

      if (!MOCK_MODE && allPublishableSucceeded && publishablePlatforms.length > 0) {
        await supabase
          .from("marketing_campaigns")
          .update({ status: "published" })
          .eq("id", campaignId);
      }
    }

    console.log("[social-publish worker] completed -", jobId, "results:", JSON.stringify(results));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const safeError = sanitizeJobErrorForStorage(msg) ?? "Något gick fel vid publicering.";
    console.error("[social-publish worker] failed -", jobId, "error:", msg);

    await updateJob("failed", {}, safeError);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const url = process.env.REDIS_URL ?? "";
  if (!url || url.trim() === "") {
    console.error("[social-publish worker] REDIS_URL not set.");
    process.exit(1);
  }

  const connection = getRedisConnectionOptions();
  if (!connection) {
    console.error("[social-publish worker] Redis not reachable.");
    process.exit(1);
  }

  console.log("[social-publish-worker] started", { queue: QUEUE_NAME });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "publish" && job.data) {
        console.log("[social-publish-worker] processing job", job.id);
        await processJob(job.data as SocialPublishJobData);
      }
    },
    {
      connection: { ...connection },
      concurrency: 2,
      stalledInterval: 120_000,
      lockDuration: 300_000,
      maxStalledCount: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log("[social-publish worker] job completed:", job.id);
  });

  worker.on("failed", (job, err) => {
    Sentry.captureException(err);
    console.error("[social-publish-worker] job failed", job?.id, err?.message);
  });

  worker.on("error", (err) => {
    console.error("[social-publish worker] error:", err.message);
  });

  const heartbeatInterval = startHeartbeatInterval(QUEUE_NAME);

  worker.on("closed", () => clearInterval(heartbeatInterval));

  process.on("SIGTERM", async () => {
    console.log("[social-publish worker] shutting down...");
    clearInterval(heartbeatInterval);
    await worker.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[social-publish worker] shutting down...");
    clearInterval(heartbeatInterval);
    await worker.close();
    process.exit(0);
  });
}

main();
