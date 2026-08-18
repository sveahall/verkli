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
      // family: 0 == "either IPv4 or IPv6". Required for Railway private
      // networking (redis.railway.internal resolves to IPv6 / dual-stack) and
      // inert for public hosts like this one. Set unconditionally so the worker
      // image stays portable — see RedisConnectionOptions in lib/env.ts.
      family: 0,
      username: "default",
      password: "secret",
      db: 2,
      tls: {},
    });
  });

  it("sets family 0 for plain redis URLs too, so private DNS resolves", () => {
    process.env.REDIS_URL = "redis://redis.railway.internal:6379";

    expect(getRedisConnectionOptions()).toMatchObject({
      host: "redis.railway.internal",
      port: 6379,
      family: 0,
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
