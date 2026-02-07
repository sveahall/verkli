import { NextResponse } from "next/server";
import { synthesizeTextToWavBytes, TtsBusyError, TtsDisabledError, TtsSynthesisError, TtsValidationError } from "@/lib/tts/piper";

/** Simple in-memory token bucket per IP. Resets on cold start / redeploy. */
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_DEFAULT_MAX = 30;
const RATE_LIMIT_HARD_MAX = 600;

type RateLimitEntry = {
  tokens: number;
  lastRefill: number;
};

const rateLimitMap = new Map<string, RateLimitEntry>();

function getRateLimitMax(): number {
  const raw = process.env.TTS_RATE_LIMIT_PER_MINUTE;
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return RATE_LIMIT_DEFAULT_MAX;
  if (n > RATE_LIMIT_HARD_MAX) return RATE_LIMIT_HARD_MAX;
  return Math.floor(n);
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  // Last resort – Next.js dev server usually sets this
  // but in local dev we can just bucket everything together.
  return "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const maxPerMinute = getRateLimitMax();
  const refillInterval = RATE_LIMIT_WINDOW_MS;

  const existing = rateLimitMap.get(ip);
  if (!existing) {
    rateLimitMap.set(ip, {
      tokens: maxPerMinute - 1,
      lastRefill: now,
    });
    return { allowed: true };
  }

  const elapsed = now - existing.lastRefill;
  if (elapsed >= refillInterval) {
    existing.tokens = maxPerMinute - 1;
    existing.lastRefill = now;
    return { allowed: true };
  }

  if (existing.tokens <= 0) {
    const retryAfterMs = refillInterval - elapsed;
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  existing.tokens -= 1;
  return { allowed: true };
}

function validateToken(request: Request): boolean {
  const expected = process.env.TTS_API_TOKEN;
  if (!expected || expected.trim() === "") {
    // No token configured – treat as open endpoint (local dev).
    return true;
  }
  const provided = request.headers.get("x-tts-token");
  if (!provided) return false;
  return provided === expected;
}

export async function POST(request: Request) {
  // Optional: simple shared secret to protect the endpoint.
  if (!validateToken(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const ip = getClientIp(request);
  const { allowed, retryAfterSeconds } = checkRateLimit(ip);
  if (!allowed) {
    const resp = NextResponse.json(
      { error: "Too many TTS requests. Please try again later." },
      { status: 429 },
    );
    if (retryAfterSeconds != null) {
      resp.headers.set("Retry-After", String(retryAfterSeconds));
    }
    return resp;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }

  // Narrowing
  const text = (body as { text?: unknown }).text;
  if (typeof text !== "string") {
    return NextResponse.json(
      { error: "Field 'text' must be a non-empty string" },
      { status: 400 },
    );
  }

  try {
    const wav = await synthesizeTextToWavBytes(text);
    const wavBytes = new Uint8Array(wav);

    const response = new NextResponse(wavBytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wavBytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
    return response;
  } catch (err) {
    if (err instanceof TtsDisabledError) {
      return NextResponse.json(
        { error: "TTS is disabled" },
        { status: 503 },
      );
    }
    if (err instanceof TtsBusyError) {
      return NextResponse.json(
        { error: "TTS is busy" },
        { status: 503 },
      );
    }
    if (err instanceof TtsValidationError) {
      return NextResponse.json(
        { error: err.message },
        { status: 400 },
      );
    }
    if (err instanceof TtsSynthesisError) {
      console.error("[tts] Synthesis error", {
        message: err.message,
        stdout_tail: err.stdout?.slice(-500),
        stderr_tail: err.stderr?.slice(-500),
      });
      return NextResponse.json(
        { error: "TTS synthesis failed" },
        { status: 500 },
      );
    }

    console.error("[tts] Unexpected error", err);
    return NextResponse.json(
      { error: "Unexpected TTS error" },
      { status: 500 },
    );
  }
}
