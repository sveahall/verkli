import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  // Use the raster wordmark directly. Importing a native image processor here
  // also loads it for every page that resolves this root metadata module.
  const wordmark = await readFile(join(process.cwd(), "public/logo-verkli-light.png"));
  const logo = `data:image/png;base64,${wordmark.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          background: "#050917",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Background glow blobs */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 480,
            height: 480,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(144,122,255,0.18) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -60,
            left: -60,
            width: 380,
            height: 380,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(226,158,213,0.12) 0%, transparent 70%)",
          }}
        />

        {/* Supplied wordmark; ImageResponse renders this image directly. */}
        <img src={logo} alt="Verkli" width={438} height={(438 * 397) / 2143} />

        {/* Tagline */}
        <div
          style={{
            marginTop: 20,
            fontSize: 28,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 400,
            letterSpacing: "0.3px",
          }}
        >
          The platform for authors and readers
        </div>

        {/* Bottom subtle URL */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            fontSize: 18,
            color: "rgba(255,255,255,0.2)",
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
