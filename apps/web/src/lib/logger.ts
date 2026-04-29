// Structured logger built on Pino.
//
// Behaviour:
//   - Production (NODE_ENV === "production"): JSON to stdout, level=info.
//   - Local dev: pretty-printed, level=debug.
//   - Tests: silent unless LOG_LEVEL is explicitly set.
//
// Correlation IDs:
//   - Use `withCorrelationId(id)` to derive a child logger that attaches
//     `correlation_id` to every line. For BullMQ workers, the job id is the
//     natural correlation. For HTTP, use the request id.
//
// Sentry integration:
//   - Errors at level=error and above are reported to Sentry via the
//     `pinoSentryStream` writeable. Lower levels stay local.
//
// Migration plan: workers are switched one-by-one to use this logger; see
// docs/sprint-0.5-deferred.md for the rollout plan.

import * as Sentry from "@sentry/node";
import pino, { type Logger, type LoggerOptions, type DestinationStream } from "pino";

type PinoLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

function resolveLevel(): PinoLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && ["fatal", "error", "warn", "info", "debug", "trace"].includes(envLevel)) {
    return envLevel as PinoLevel;
  }
  if (process.env.NODE_ENV === "production") return "info";
  if (process.env.NODE_ENV === "test") return "fatal"; // silence by default
  return "debug";
}

function buildOptions(): LoggerOptions {
  const base: LoggerOptions = {
    level: resolveLevel(),
    base: {
      service: "verkli-web",
      env: process.env.NODE_ENV ?? "development",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "password",
        "token",
        "access_token",
        "refresh_token",
        "*.password",
        "*.token",
        "headers.authorization",
        "req.headers.authorization",
      ],
      censor: "[redacted]",
    },
  };

  if (process.env.NODE_ENV !== "production") {
    base.transport = {
      target: "pino-pretty",
      options: {
        translateTime: "SYS:standard",
        ignore: "pid,hostname,service",
        colorize: true,
      },
    };
  }

  return base;
}

// Sentry write-stream: only forwards level≥error.
const sentryStream: DestinationStream = {
  write(line: string) {
    try {
      const parsed = JSON.parse(line) as {
        level?: number;
        msg?: string;
        err?: { message?: string; stack?: string } | null;
        correlation_id?: string;
      };
      // Pino numeric levels: error=50, fatal=60.
      if ((parsed.level ?? 0) >= 50) {
        Sentry.captureMessage(parsed.msg ?? "logger error", {
          level: parsed.level === 60 ? "fatal" : "error",
          tags: parsed.correlation_id
            ? { correlation_id: parsed.correlation_id }
            : undefined,
        });
      }
    } catch {
      // ignore malformed line
    }
  },
};

let cached: Logger | null = null;

export function getLogger(): Logger {
  if (cached) return cached;

  // We only attach the Sentry stream in production — locally we don't want
  // every error log to round-trip to Sentry.
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    cached = pino(buildOptions(), pino.multistream([
      { stream: process.stdout },
      { stream: sentryStream, level: "error" },
    ]));
  } else {
    cached = pino(buildOptions());
  }
  return cached;
}

/**
 * Returns a child logger pre-bound with a correlation id.
 */
export function withCorrelationId(id: string, fields?: Record<string, unknown>): Logger {
  return getLogger().child({ correlation_id: id, ...(fields ?? {}) });
}

/**
 * Convenience for BullMQ job processors: returns a logger bound to job id +
 * job name + queue name.
 */
export function loggerForJob(args: {
  queue: string;
  jobName: string;
  jobId: string | undefined;
}): Logger {
  return getLogger().child({
    correlation_id: args.jobId ?? "no-id",
    queue: args.queue,
    job_name: args.jobName,
    job_id: args.jobId,
  });
}
