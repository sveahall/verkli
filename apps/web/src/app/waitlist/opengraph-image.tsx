import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { TA_FOR_ER_ORDER } from "@/lib/orders/ta-for-er";

/**
 * Link preview for `/waitlist`, which is where the book is actually sold.
 *
 * A route-level `opengraph-image` overrides the root one for this path. Without
 * it, pasting the buy link anywhere produced the generic site card — logo on a
 * dark gradient, "the platform for authors and readers" — which said nothing
 * about the book, showed no cover, and gave a recipient no reason to click.
 *
 * Node runtime rather than edge because the cover is read off disk and base64'd
 * below, which needs `fs` and `Buffer`.
 */
export const runtime = "nodejs";

/**
 * Deliberately prerendered — no `force-dynamic`.
 *
 * The cover is read from `public/` at build time, when the source tree is
 * provably present, and baked into a static PNG. That removes every runtime
 * dependency in one move: no fetch that can fail, no `NEXT_PUBLIC_SITE_URL` to
 * be pointing somewhere stale, and no question of whether `public/` was traced
 * into the serverless bundle. An earlier cut fetched the cover over HTTP and
 * silently rendered the fallback when the configured origin did not match the
 * running port — which is precisely the failure this avoids.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${TA_FOR_ER_ORDER.bookTitle} — ${TA_FOR_ER_ORDER.authorName}`;

const COVER_FILE = "ta-for-er-cover.jpg";

/**
 * The cover as a data URI, or null if it could not be read.
 *
 * Satori throws on an `<img>` whose source fails, so without the catch a
 * missing cover would mean a broken preview rather than a plain one. The
 * fallback should never fire in practice — the file is in the repo and this
 * runs at build time — but a shop window that degrades quietly beats one that
 * 500s.
 */
async function loadCover(): Promise<string | null> {
  try {
    const bytes = await readFile(join(process.cwd(), "public", COVER_FILE));
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function WaitlistOgImage() {
  const cover = await loadCover();

  return new ImageResponse(
    (
      <div
        style={{
          background: "#050917",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          position: "relative",
          overflow: "hidden",
          fontFamily: "Inter, system-ui, sans-serif",
          padding: "0 80px",
          gap: 64,
        }}
      >
        {/* Same glow treatment as the root card, so this still reads as Verkli. */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(144,122,255,0.20) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(226,158,213,0.12) 0%, transparent 70%)",
          }}
        />

        {cover === null ? (
          // Typographic stand-in. Keeps the composition intact so the card is
          // plain rather than broken when the cover cannot be loaded.
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 300,
              height: 424,
              flexShrink: 0,
              borderRadius: 12,
              background: "linear-gradient(135deg, #907AFF 0%, #E29ED5 100%)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
              fontSize: 120,
              fontWeight: 800,
              color: "white",
            }}
          >
            {TA_FOR_ER_ORDER.bookTitle.slice(0, 1)}
          </div>
        ) : (
          // A5 proportions, matching the printed book.
          <img
            src={cover}
            width={300}
            height={424}
            alt=""
            style={{
              flexShrink: 0,
              borderRadius: 12,
              objectFit: "cover",
              boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
            }}
          />
        )}

        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div
            style={{
              fontSize: 22,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.40)",
              fontWeight: 500,
            }}
          >
            Beställ boken
          </div>

          <div
            style={{
              marginTop: 18,
              fontSize: 76,
              fontWeight: 700,
              color: "white",
              letterSpacing: "-2px",
              lineHeight: 1.05,
            }}
          >
            {TA_FOR_ER_ORDER.bookTitle}
          </div>

          <div
            style={{
              marginTop: 20,
              fontSize: 34,
              color: "rgba(255,255,255,0.70)",
              fontWeight: 400,
            }}
          >
            {TA_FOR_ER_ORDER.authorName}
          </div>

          <div
            style={{
              marginTop: 40,
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                borderRadius: 999,
                padding: "12px 28px",
                background: "linear-gradient(135deg, #907AFF 0%, #E29ED5 100%)",
                fontSize: 30,
                fontWeight: 600,
                color: "white",
              }}
            >
              {TA_FOR_ER_ORDER.priceLabel}
            </div>
            <div style={{ fontSize: 24, color: "rgba(255,255,255,0.45)" }}>
              frakt ingår
            </div>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 36,
            right: 80,
            fontSize: 18,
            color: "rgba(255,255,255,0.20)",
            letterSpacing: "1px",
          }}
        >
          verkli.com
        </div>
      </div>
    ),
    { ...size }
  );
}
