import Redis from "ioredis";
import { createClient } from "@/lib/supabase/server";
import { getRedisClientOptions } from "@/lib/env";

export async function checkDbHealth(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("books").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function checkRedisHealth(): Promise<boolean> {
  const connection = getRedisClientOptions({ lazyConnect: true });
  if (!connection) return false;

  const redis = new Redis(connection);
  redis.on("error", () => {
    // Prevent noisy "[ioredis] Unhandled error event" in health probes when Redis is down.
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  } finally {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
}
