import path from "path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl 4 plugin — points at the server-side request config that
// resolves the locale per request (cookie → user preference → default).
const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const isProduction = process.env.NODE_ENV === "production";

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "https://js.stripe.com",
  "https://platform.twitter.com",
  "https://cdn.syndication.twimg.com",
  "https://syndication.twitter.com",
  "https://www.instagram.com",
  "https://*.instagram.com",
  "https://www.tiktok.com",
  "https://*.tiktok.com",
  "https://va.vercel-scripts.com",
  "https://*.vercel-scripts.com",
  "https://browser.sentry-cdn.com",
  "https://js.sentry-cdn.com",
  "https://runwayml.com",
  "https://*.runwayml.com",
  "https://us-assets.i.posthog.com",
  "https://eu-assets.i.posthog.com",
];

if (!isProduction) {
  scriptSrc.push("'unsafe-eval'");
}

const connectSrc = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://api.stripe.com",
  "https://checkout.stripe.com",
  "https://billing.stripe.com",
  "https://api.resend.com",
  "https://*.sentry.io",
  "https://*.ingest.sentry.io",
  "https://runwayml.com",
  "https://*.runwayml.com",
  "https://vitals.vercel-insights.com",
  "https://*.vercel-insights.com",
  "https://*.vercel.app",
  "https://www.google-analytics.com",
  "https://analytics.google.com",
  "https://region1.google-analytics.com",
  "https://www.googletagmanager.com",
  "https://stats.g.doubleclick.net",
  "https://api.twitter.com",
  "https://x.com",
  "https://*.x.com",
  "https://twitter.com",
  "https://*.twitter.com",
  "https://graph.instagram.com",
  "https://*.instagram.com",
  "https://open.tiktokapis.com",
  "https://*.tiktokapis.com",
  "https://*.tiktok.com",
  "https://us.i.posthog.com",
  "https://eu.i.posthog.com",
  "https://us-assets.i.posthog.com",
  "https://eu-assets.i.posthog.com",
];

if (!isProduction) {
  connectSrc.push("ws:");
}

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src ${scriptSrc.join(" ")}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src ${connectSrc.join(" ")}`,
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://billing.stripe.com https://platform.twitter.com https://syndication.twitter.com https://www.instagram.com https://*.instagram.com https://www.tiktok.com https://*.tiktok.com https://*.supabase.co https://runwayml.com https://*.runwayml.com",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://*.supabase.co",
  "worker-src 'self' blob:",
  "media-src 'self' blob: data: https://*.supabase.co https://runwayml.com https://*.runwayml.com",
];

if (isProduction) {
  cspDirectives.push("upgrade-insecure-requests");
}

const contentSecurityPolicy = cspDirectives.join("; ");

const permissionsPolicy = [
  "accelerometer=()",
  'autoplay=(self "https://www.instagram.com" "https://platform.twitter.com" "https://www.tiktok.com")',
  "camera=()",
  "display-capture=()",
  'fullscreen=(self "https://www.instagram.com" "https://platform.twitter.com" "https://www.tiktok.com")',
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  'payment=(self "https://js.stripe.com")',
  'picture-in-picture=(self "https://www.instagram.com" "https://platform.twitter.com" "https://www.tiktok.com")',
  "usb=()",
].join(", ");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  transpilePackages: ["@verkli/ui", "@verkli/shared"],
  // Keep heavy/native-binding parsers out of the route bundle. `cheerio`
  // (~500 KB) and `mammoth` (~1 MB) were previously being bundled into the
  // chapter-repair route via `import-extract.ts`.
  serverExternalPackages: ["epub", "pdf-parse", "bullmq", "cheerio", "mammoth"],
  experimental: {
    // Tree-shake barrel imports for large UI/animation libs.
    optimizePackageImports: ["lucide-react", "@tiptap/core", "motion"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: permissionsPolicy },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/writer", destination: "/author", permanent: true },
      { source: "/writer/home", destination: "/author/home", permanent: true },
    ];
  },
  images: {
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Allow cross-origin requests from network IP during development
  ...(process.env.NODE_ENV === "development" ? { allowedDevOrigins: ["192.168.35.146"] } : {}),
};

const analyzedConfig = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})(nextConfig);

const intlConfig = withNextIntl(analyzedConfig);

export default withSentryConfig(intlConfig, {
  silent: !process.env.CI,
});
