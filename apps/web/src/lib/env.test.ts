import { afterEach, describe, expect, it } from "vitest";
import { getRedisClientOptions, getRedisConnectionOptions } from "@/lib/env";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("redis env parsing", () => {
  it("preserves TLS and db info for rediss URLs", () => {
    process.env.REDIS_URL = "rediss://default:secret@example.upstash.io:6380/2";

    expect(getRedisConnectionOptions()).toEqual({
      host: "example.upstash.io",
      port: 6380,
      username: "default",
      password: "secret",
      db: 2,
      tls: {},
    });
  });

  it("builds ioredis defaults on top of the parsed connection", () => {
    process.env.REDIS_URL = "redis://localhost:6379/1";
    process.env.REDIS_CONNECT_TIMEOUT_MS = "6100";
    process.env.REDIS_MAX_RETRIES = "4";

    const options = getRedisClientOptions({ lazyConnect: true });
    expect(options).toMatchObject({
      host: "localhost",
      port: 6379,
      db: 1,
      lazyConnect: true,
      connectTimeout: 6100,
      maxRetriesPerRequest: 4,
      enableReadyCheck: true,
      keepAlive: 10_000,
    });
    expect(typeof options?.retryStrategy).toBe("function");
  });
});
