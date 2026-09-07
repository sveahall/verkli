import type { Metadata } from "next";
import { Inter, Montserrat_Alternates } from "next/font/google";
import "./globals.css";
import "../components/GlassSurface.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import GlobalThemeToggle from "@/components/GlobalThemeToggle";
import { ToastProvider } from "@/components/ui/toast";
import OfflineServiceWorkerRegistration from "@/components/offline/OfflineServiceWorkerRegistration";
import CookieConsent from "@/components/CookieConsent";
import PostHogProvider from "@/components/analytics/PostHogProvider";

// Set by Vercel's build and runtime only; unset on Railway and locally.
const isVercel = process.env.VERCEL === "1";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const montserratAlternates = Montserrat_Alternates({
  variable: "--font-montserrat-alternates",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});


export const metadata: Metadata = {
  // `||`, not `??`. An env var that exists but is EMPTY is not caught by `??`,
  // and `new URL("")` throws — during page-data collection, which reports it as
  // "Failed to collect page data for /_not-found ... ERR_INVALID_URL input: ''".
  // That message names a route unrelated to the cause and does not mention the
  // variable at all. Clearing this field in the host's dashboard is an easy
  // mistake to make and an expensive one to diagnose.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://verkli.com"
  ),
  title: {
    default: "Verkli",
    template: "%s | Verkli",
  },
  description: "Verkli — the platform for authors and readers.",
  icons: {
    icon: [
      { url: "/favi.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    siteName: "Verkli",
    type: "website",
    title: "Verkli",
    description: "Verkli — the platform for authors and readers.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Verkli",
    description: "Verkli — the platform for authors and readers.",
  },
};

const themeScript = `
  try {
    const stored = localStorage.getItem('verkli-theme');
    const theme = stored || 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch (error) {}
`;

// Suppress Supabase auth AbortError in dev — fired by navigator.locks during
// React strict-mode remounts. Harmless but blocks the error overlay.
const suppressAbortScript = `
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', function(e) {
      const reason = e && e.reason;
      const message = String((reason && reason.message) || '');
      if (
        reason &&
        (
          (reason.name === 'AbortError' && message.indexOf('abort') !== -1) ||
          message === 'signal is aborted without reason'
        )
      ) {
        e.preventDefault();
      }
    });
  }
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${montserratAlternates.variable} antialiased flex min-h-screen min-h-dvh min-h-svh flex-col`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: suppressAbortScript }} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white focus:outline-none"
        >
          Skip to content
        </a>
        <PostHogProvider>
          <ToastProvider>
            <OfflineServiceWorkerRegistration />
            {/* Content first in DOM; navbar rendered via route-group layouts */}
            <div id="main-content" className="relative z-0 flex min-h-0 flex-1 flex-col overflow-x-clip bg-background">
              {children}
            </div>
            {/* Theme toggle fixed in bottom right corner on all pages */}
            <GlobalThemeToggle />
            <CookieConsent />
          </ToastProvider>
        </PostHogProvider>
        {/* Vercel-only. Both scripts are served by Vercel's edge at
            /_vercel/insights/script.js and /_vercel/speed-insights/script.js —
            paths that exist nowhere else. Since the move to Railway, Next
            answered those two requests with the SPA's own HTML, so every page
            load spent two round-trips and logged
              Refused to execute script ... MIME type ('text/html')
            while the dashboards recorded nothing.
            Gated rather than deleted: the env var is set only by Vercel's
            builder, so this re-arms itself if we ever deploy there again. */}
        {isVercel ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
