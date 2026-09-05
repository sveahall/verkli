/**
 * BullMQ import queue. Uses REDIS_URL from env.
 * A dispatch is acknowledged only after Redis confirms the persisted identity and state.
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions, getRedisUrl } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue-names";

const QUEUE_NAME = QUEUE_NAMES.IMPORT;
export type ImportMode = "new_version" | "overwrite_draft";

function createQueue(connection: { host: string; port: number; password?: string }): Queue {
  return new Queue(QUEUE_NAME, {
    connection: { ...connection },
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      // Without a failed-job cap, Redis accumulates dead jobs indefinitely.
      removeOnFail: { count: 500 },
    },
  });
}

let queueInstance: Queue | null = null;
let queueConnectionKey: string | null = null;

function getConnectionKey(connection: { host: string; port: number; password?: string }): string {
  return JSON.stringify(connection);
}

export function getImportQueue(): Queue | null {
  const connection = getRedisConnectionOptions();
  if (!connection) return null;

  const key = getConnectionKey(connection);
  if (!queueInstance || queueConnectionKey !== key) {
    if (queueInstance) {
      void queueInstance.close().catch((err) => {
        console.error("[import queue] failed to close previous queue instance:", err);
      });
    }
    queueInstance = createQueue(connection);
    queueConnectionKey = key;
  }
  return queueInstance;
}

export type ExtractJobData = {
  importId: string;
  filePath: string;
  fileStorage: "local" | "supabase";
  authorId: string;
  /** Optional scoped import target (BookEditor flow) */
  bookId?: string;
  /** Import strategy for scoped imports */
  mode?: ImportMode;
  /** Optional explicit draft version to overwrite */
  targetVersionId?: string | null;
};

const RUNNABLE_STATES = new Set(["waiting", "active", "delayed", "prioritized", "paused"]);

function matchesSource(actual: ExtractJobData, expected: ExtractJobData): boolean {
  return actual?.importId === expected.importId && actual.authorId === expected.authorId &&
    actual.filePath === expected.filePath && actual.fileStorage === expected.fileStorage;
}

function matchesPayload(actual: ExtractJobData, expected: ExtractJobData): boolean {
  return matchesSource(actual, expected) && actual.mode === expected.mode && (actual.bookId ?? null) === (expected.bookId ?? null) &&
    (actual.targetVersionId ?? null) === (expected.targetVersionId ?? null);
}

export async function enqueueExtractJob(data: ExtractJobData): Promise<string | null> {
  if (!getRedisUrl()?.trim()) return null;
  const q = getImportQueue();
  if (!q) return null;

  try {
    const existing = await q.getJob(data.importId);
    if (existing) {
      if (!matchesSource(existing.data, data) || existing.id !== data.importId) {
        throw new Error("Existing import job does not match the requested dispatch");
      }
      const state = await existing.getState();
      if (state === "failed" || state === "completed") {
        // Result book/version pointers may change before a worker fails. The
        // original owned source must still match before removing a retained ID.
        await existing.remove();
      } else {
        if (!RUNNABLE_STATES.has(state) || !matchesPayload(existing.data, data)) {
          throw new Error("Existing import job does not match the requested dispatch");
        }
        return existing.id;
      }
    }
    await q.add("extract", data, { jobId: data.importId });
    // add() may silently return a duplicate ID. Inspect the actual Redis job.
    const persisted = await q.getJob(data.importId);
    if (!persisted || persisted.id !== data.importId || !matchesPayload(persisted.data, data)) {
      throw new Error("Import dispatch could not be confirmed");
    }
    const state = await persisted.getState();
    if (!RUNNABLE_STATES.has(state) && state !== "completed") {
      throw new Error("Import dispatch is not runnable");
    }
    return persisted.id;
  } catch (error) {
    console.error("[import queue] dispatch failed", { importId: data.importId, category: "dispatch_unconfirmed" });
    throw error;
  }
}
