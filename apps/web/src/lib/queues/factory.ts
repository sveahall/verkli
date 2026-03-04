import { Queue } from "bullmq";
import { getRedisConnectionOptions, getRedisUrl } from "@/lib/env";
import type { QueueDescriptor } from "@/lib/queues/descriptors";

type RedisConnection = {
  host: string;
  port: number;
  password?: string;
};

type QueueRegistryEntry = {
  queue: Queue;
  connectionKey: string;
};

const queueRegistry = new Map<string, QueueRegistryEntry>();

function getConnectionKey(connection: RedisConnection): string {
  return `${connection.host}:${connection.port}:${connection.password ?? ""}`;
}

function getQueueRegistryKey(queueName: string): string {
  return `queue:${queueName}`;
}

function createQueue<JobName extends string>(
  descriptor: QueueDescriptor<JobName>,
  connection: RedisConnection
): Queue {
  return new Queue(descriptor.queueName, {
    connection: {
      host: connection.host,
      port: connection.port,
      password: connection.password,
    },
    defaultJobOptions: {
      attempts: descriptor.retryPolicy.attempts,
      backoff: { type: "exponential", delay: descriptor.retryPolicy.backoffDelayMs },
      removeOnComplete: { count: descriptor.retryPolicy.removeOnCompleteCount },
      ...(descriptor.retryPolicy.removeOnFailCount != null && {
        removeOnFail: { count: descriptor.retryPolicy.removeOnFailCount },
      }),
    },
  });
}

function ensureQueue<JobName extends string>(
  descriptor: QueueDescriptor<JobName>
): Queue | null {
  const connection = getRedisConnectionOptions();
  if (!connection) return null;

  const registryKey = getQueueRegistryKey(descriptor.queueName);
  const nextConnectionKey = getConnectionKey(connection);
  const cached = queueRegistry.get(registryKey);

  if (cached && cached.connectionKey === nextConnectionKey) {
    return cached.queue;
  }

  if (cached) {
    void cached.queue.close().catch((err: unknown) => {
      console.error(
        `${descriptor.logPrefix} failed to close previous queue instance:`,
        err
      );
    });
  }

  const queue = createQueue(descriptor, connection);
  queueRegistry.set(registryKey, { queue, connectionKey: nextConnectionKey });
  return queue;
}

export function getQueue<JobName extends string>(
  descriptor: QueueDescriptor<JobName>
): Queue | null {
  return ensureQueue(descriptor);
}

type EnqueueIdempotencyOptions = {
  inspectExistingBeforeEnqueue?: boolean;
  allowQueuedOverwrite?: boolean;
  removeTerminalExisting?: boolean;
};

const ACTIVE_STATES = new Set<string>(["active"]);
const QUEUED_STATES = new Set<string>(["waiting", "delayed", "paused", "waiting-children"]);
const TERMINAL_STATES = new Set<string>(["completed", "failed"]);

async function handleExistingJob(
  queue: Queue,
  jobId: string,
  logPrefix: string,
  options: EnqueueIdempotencyOptions
): Promise<string | null> {
  const existing = await queue.getJob(jobId);
  if (!existing) return null;

  const state = await existing.getState();
  const stateStr = typeof state === "string" ? state : String(state);
  if (ACTIVE_STATES.has(stateStr)) {
    return existing.id ?? null;
  }

  if (QUEUED_STATES.has(stateStr)) {
    if (options.allowQueuedOverwrite) {
      try {
        await existing.remove();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`${logPrefix} could not remove queued job before overwrite:`, jobId, msg);
        return existing.id ?? null;
      }
      return null;
    }
    return existing.id ?? null;
  }

  if (!TERMINAL_STATES.has(stateStr) || options.removeTerminalExisting === false) {
    return existing.id ?? null;
  }

  try {
    await existing.remove();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`${logPrefix} could not remove old job before re-enqueue:`, jobId, msg);
    return existing.id ?? null;
  }

  return null;
}

export async function enqueueJob<JobName extends string, TData>(args: {
  descriptor: QueueDescriptor<JobName>;
  jobName: JobName;
  data: TData;
  jobId: string;
  idempotency?: EnqueueIdempotencyOptions;
}): Promise<string | null> {
  const {
    descriptor,
    jobName,
    data,
    jobId,
    idempotency = {},
  } = args;

  const url = getRedisUrl();
  if (!url || url.trim() === "") {
    console.warn(`${descriptor.logPrefix} REDIS_URL not set — ${jobName} job not enqueued.`);
    return null;
  }

  const queue = ensureQueue(descriptor);
  if (!queue) {
    console.warn(`${descriptor.logPrefix} Redis not reachable — ${jobName} job not enqueued.`);
    return null;
  }

  if (!descriptor.jobNames.includes(jobName)) {
    throw new Error(`${descriptor.logPrefix} invalid job name "${jobName}" for queue descriptor.`);
  }

  if (idempotency.inspectExistingBeforeEnqueue !== false) {
    const existingId = await handleExistingJob(queue, jobId, descriptor.logPrefix, {
      inspectExistingBeforeEnqueue: true,
      allowQueuedOverwrite: idempotency.allowQueuedOverwrite === true,
      removeTerminalExisting: idempotency.removeTerminalExisting !== false,
    });
    if (existingId) {
      return existingId;
    }
  }

  try {
    const job = await queue.add(jobName, data, { jobId });
    return job.id ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const normalized = message.toLowerCase();
    if (normalized.includes("job") && normalized.includes("exists")) {
      const duplicate = await queue.getJob(jobId);
      return duplicate?.id ?? null;
    }

    console.error(
      `${descriptor.logPrefix} failed to enqueue job:`,
      jobName,
      message,
      "jobId:",
      jobId
    );
    throw err;
  }
}
