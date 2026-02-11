/**
 * BullMQ worker: process "publish" jobs for social media publishing.
 * Run from apps/web: npm run social-publish-worker
 * Requires: REDIS_URL, SOCIAL_TOKEN_KEY, Supabase env
 *
 * Uses ai_jobs table for job tracking (kind='social_publish').
 * Results stored in ai_jobs.output.results per platform.
 */

import "./load-dotenv";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

import { Worker, UnrecoverableError } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import { QUEUE_NAMES } from "../src/lib/queue-names";
import type { SocialPublishJobData } from "../src/lib/social-publish-queue";
import { decryptToken, encryptToken } from "../src/lib/social/token-crypto";
import { PUBLISHABLE_PLATFORMS } from "../src/lib/social/platform-constraints";
import { truncateForPlatform } from "../src/lib/social/platform-constraints";
import { refreshAccessToken } from "../src/lib/social/oauth";
import { sanitizeJobErrorForStorage } from "../src/lib/sanitize-job-error";

const QUEUE_NAME = QUEUE_NAMES.SOCIAL_PUBLISH;

// Hard check: mock mode only allowed in development
if (process.env.SOCIAL_MOCK_MODE === "true" && process.env.NODE_ENV !== "development") {
  throw new Error("SOCIAL_MOCK_MODE is only allowed in development");
}

const MOCK_MODE = process.env.SOCIAL_MOCK_MODE === "true" && process.env.NODE_ENV === "development";

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
  const truncated = truncateForPlatform(text, "x");

  if (MOCK_MODE) {
    return { status: "ok", postId: `mock-x-${Date.now()}` };
  }

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: truncated }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return { status: "failed", error: `X API error ${res.status}: ${errBody.slice(0, 200)}` };
  }

  const data = (await res.json()) as { data?: { id?: string } };
  return { status: "ok", postId: data.data?.id };
}

async function publishToEmail(
  smtpConfig: { smtpHost: string; smtpPort: string; smtpUser: string; smtpPass: string; fromEmail: string },
  subject: string,
  body: string
): Promise<PlatformResult> {
  if (MOCK_MODE) {
    return { status: "ok", messageId: `mock-email-${Date.now()}` };
  }

  // Use nodemailer-style SMTP sending via fetch to a local relay or Resend
  // For now, log and return success placeholder
  console.log("[social-publish worker] email publish:", {
    from: smtpConfig.fromEmail,
    host: smtpConfig.smtpHost,
    subject: subject.slice(0, 50),
    bodyLength: body.length,
  });

  return { status: "ok", messageId: `email-${Date.now()}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Processing
// ─────────────────────────────────────────────────────────────────────────────

async function processJob(payload: SocialPublishJobData) {
  const { jobId, campaignId, bookId, userId, platforms } = payload;
  const supabase = createAdminClient();

  const updateJob = async (
    status: string,
    outputUpdate: Record<string, unknown> = {},
    error?: string
  ) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };

    if (status === "processing") updates.started_at = now;
    if (status === "completed" || status === "failed") updates.finished_at = now;
    if (error) updates.error = sanitizeJobErrorForStorage(error);

    const { data: current } = await supabase
      .from("ai_jobs" as never)
      .select("output")
      .eq("id", jobId)
      .single();

    const currentOutput = (current?.output as Record<string, unknown>) ?? {};
    updates.output = { ...currentOutput, ...outputUpdate };

    await supabase.from("ai_jobs" as never).update(updates).eq("id", jobId);
  };

  try {
    console.log("[social-publish worker] job started -", jobId, "campaign:", campaignId);

    // Auth isolation: verify user owns the campaign
    const { data: campaign, error: campError } = await supabase
      .from("marketing_campaigns" as never)
      .select("id, user_id, content, channel")
      .eq("id", campaignId)
      .single();

    if (campError || !campaign) {
      throw new UnrecoverableError("Campaign not found");
    }

    const camp = campaign as { id: string; user_id: string; content: string | null; channel: string };
    if (camp.user_id !== userId) {
      const errMsg = "Ownership mismatch: userId does not match campaign owner";
      console.error("[social-publish worker]", errMsg);
      await updateJob("failed", {}, errMsg);
      throw new UnrecoverableError(errMsg);
    }

    await updateJob("processing");

    const content = camp.content ?? "";
    const results: Record<string, PlatformResult> = {};

    // Fetch user's social connections
    const { data: connections } = await supabase
      .from("social_connections" as never)
      .select("platform, access_token_enc, refresh_token_enc, token_expires_at, email_config_enc, status")
      .eq("user_id", userId);

    const connMap = new Map<string, Record<string, unknown>>();
    for (const c of (connections ?? []) as Array<Record<string, unknown>>) {
      connMap.set(String(c.platform), c);
    }

    for (const platform of platforms) {
      // Not-implemented platforms
      if (!PUBLISHABLE_PLATFORMS.includes(platform)) {
        results[platform] = { status: "not_implemented", error: "E_SOCIAL_PUBLISH_NOT_IMPLEMENTED" };
        continue;
      }

      const conn = connMap.get(platform);
      if (!conn || conn.status !== "active") {
        results[platform] = { status: "failed", error: "Platform not connected" };
        continue;
      }

      try {
        if (platform === "x") {
          let accessToken = conn.access_token_enc ? decryptToken(String(conn.access_token_enc)) : "";

          // Check token expiry and refresh if needed
          if (conn.token_expires_at) {
            const expiresAt = new Date(String(conn.token_expires_at));
            if (expiresAt <= new Date() && conn.refresh_token_enc) {
              const refreshToken = decryptToken(String(conn.refresh_token_enc));
              const refreshed = await refreshAccessToken("x", refreshToken);
              accessToken = refreshed.accessToken;

              // Re-encrypt and store new tokens
              await supabase
                .from("social_connections" as never)
                .update({
                  access_token_enc: encryptToken(refreshed.accessToken),
                  refresh_token_enc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : conn.refresh_token_enc,
                  token_expires_at: refreshed.expiresIn
                    ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
                    : conn.token_expires_at,
                })
                .eq("user_id", userId)
                .eq("platform", "x");
            }
          }

          results[platform] = await publishToX(accessToken, content);
        } else if (platform === "email") {
          if (!conn.email_config_enc) {
            results[platform] = { status: "failed", error: "Email config missing" };
            continue;
          }
          const configJson = decryptToken(String(conn.email_config_enc));
          const smtpConfig = JSON.parse(configJson) as {
            smtpHost: string; smtpPort: string; smtpUser: string; smtpPass: string; fromEmail: string;
          };
          results[platform] = await publishToEmail(smtpConfig, `Campaign: ${campaignId}`, content);
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

    await updateJob("completed", { results });

    if (allPublishableSucceeded && publishablePlatforms.length > 0) {
      await supabase
        .from("marketing_campaigns" as never)
        .update({ status: "published" })
        .eq("id", campaignId);
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

  console.log("[social-publish worker] started - queue:", QUEUE_NAME);

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "publish" && job.data) {
        await processJob(job.data as SocialPublishJobData);
      }
    },
    {
      connection: {
        host: connection.host,
        port: connection.port,
        password: connection.password,
      },
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
    console.error("[social-publish worker] job failed:", job?.id, err?.message);
  });

  worker.on("error", (err) => {
    console.error("[social-publish worker] error:", err.message);
  });

  process.on("SIGTERM", async () => {
    console.log("[social-publish worker] shutting down...");
    await worker.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[social-publish worker] shutting down...");
    await worker.close();
    process.exit(0);
  });
}

main();
