import Redis from "ioredis";
import { createClient } from "@/lib/supabase/server";
import { getRedisUrl } from "@/lib/env";

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
  const redisUrl = getRedisUrl();
  if (!redisUrl) return false;

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    enableReadyCheck: false,
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
