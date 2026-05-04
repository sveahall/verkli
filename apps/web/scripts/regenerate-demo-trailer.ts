/**
 * Generate the investor-demo book trailer via Higgsfield.
 *
 * Usage:
 *   COVER_IMAGE_URL=https://example.com/haunted-diary-cover.jpg \
 *     npx tsx apps/web/scripts/regenerate-demo-trailer.ts
 *
 *   # Or pass on the CLI:
 *   npx tsx apps/web/scripts/regenerate-demo-trailer.ts \
 *     https://example.com/haunted-diary-cover.jpg
 *
 * Output: apps/web/public/demo-assets/trailer.mp4 (~5 s, image-to-video).
 *
 * Requires `HF_CREDENTIALS` (Higgsfield KEY_ID:KEY_SECRET) in
 * apps/web/.env.local. The cover image URL must be publicly fetchable from
 * the Higgsfield server side — Supabase Storage public URLs, Unsplash CDN
 * URLs, etc. all work; localhost / file:// URLs do not.
 *
 * After running, re-run scripts/seed-investor-demo.ts; the seed picks up
 * the .mp4 from disk and stamps books.trailer_url + trailer_status='ready'
 * on the demo book.
 *
 * Cost: ~$0.15 per 5-second Higgsfield generation (per the existing
 * marketing/video/generate route's ESTIMATED_COST_USD constant).
 */

import "./load-dotenv";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateImageToVideo } from "../src/lib/higgsfield";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const OUT_DIR = path.join(PUBLIC_DIR, "demo-assets");
const OUT_PATH = path.join(OUT_DIR, "trailer.mp4");

const TRAILER_PROMPT =
  "Cinematic gothic atmosphere, candlelight flickering, ink slowly forming words on an old leather diary, pages turning by themselves, slow zoom-in, dark moody lighting, subtle dust motes, 1880s manuscript aesthetic, ominous but elegant.";

const TRAILER_DURATION_SECONDS = 5;
const DOWNLOAD_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const coverUrl = (process.argv[2] ?? process.env.COVER_IMAGE_URL ?? "").trim();
  if (!coverUrl) {
    throw new Error(
      "Cover image URL is required. Pass as CLI arg or COVER_IMAGE_URL env. " +
        "Must be publicly fetchable (Supabase Storage public URL, Unsplash CDN, etc)."
    );
  }
  if (!coverUrl.startsWith("https://") && !coverUrl.startsWith("http://")) {
    throw new Error(`Cover URL must be http(s); got: ${coverUrl.slice(0, 60)}`);
  }
  if (!(process.env.HF_CREDENTIALS ?? "").trim()) {
    throw new Error("HF_CREDENTIALS is missing. Expected KEY_ID:KEY_SECRET.");
  }

  if (!existsSync(PUBLIC_DIR)) {
    throw new Error(`Expected public dir at ${PUBLIC_DIR}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[demo-trailer] cover: ${coverUrl}`);
  console.log(`[demo-trailer] prompt: ${TRAILER_PROMPT.slice(0, 80)}…`);
  console.log(`[demo-trailer] calling Higgsfield (this can take 1–2 min)…`);

  const result = await generateImageToVideo({
    prompt: TRAILER_PROMPT,
    imageUrl: coverUrl,
    durationSeconds: TRAILER_DURATION_SECONDS,
    includeAudio: true,
  });

  console.log(`[demo-trailer] Higgsfield request ${result.requestId} → ${result.videoUrl}`);
  console.log(`[demo-trailer] downloading mp4…`);

  const response = await fetchWithTimeout(result.videoUrl, DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(
      `Trailer download failed: ${response.status} ${response.statusText}`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error("Higgsfield returned empty video buffer");
  }
  writeFileSync(OUT_PATH, Buffer.from(arrayBuffer));

  const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(1);
  console.log(`\n[demo-trailer] Done. ${sizeKB} KB → ${OUT_PATH}`);
  console.log("[demo-trailer] Next: re-run seed-investor-demo.ts so books.trailer_url updates.");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[demo-trailer] Failed:", message);
  process.exit(1);
});
