import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
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

        {/* Logo mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 96,
            height: 96,
            borderRadius: 28,
            background: "linear-gradient(135deg, #907AFF 0%, #E29ED5 100%)",
            marginBottom: 32,
            boxShadow: "0 20px 60px rgba(144,122,255,0.35)",
          }}
        >
          <span
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: "white",
              letterSpacing: "-2px",
            }}
          >
            V
          </span>
        </div>

        {/* Wordmark */}
        <div
          style={{
            fontSize: 88,
            fontWeight: 700,
            color: "white",
            letterSpacing: "-4px",
            lineHeight: 1,
          }}
        >
          verkli
        </div>

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
