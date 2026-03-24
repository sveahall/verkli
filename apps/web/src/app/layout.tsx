import type { Metadata } from "next";
import { Inter, Montserrat_Alternates } from "next/font/google";
import "./globals.css";
import "../components/GridMotion.css";
import "../components/GlassSurface.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import GlobalThemeToggle from "@/components/GlobalThemeToggle";
import { ToastProvider } from "@/components/ui/toast";
import OfflineServiceWorkerRegistration from "@/components/offline/OfflineServiceWorkerRegistration";
import CookieConsent from "@/components/CookieConsent";

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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://verkli.com"
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
  },
  twitter: {
    card: "summary",
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
      if (e && e.reason && e.reason.name === 'AbortError' &&
          String(e.reason.message || '').indexOf('abort') !== -1) {
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
        <ToastProvider>
          <OfflineServiceWorkerRegistration />
          {/* Content first in DOM; navbar rendered via route-group layouts */}
          <div id="main-content" className="relative z-0 flex min-h-0 flex-1 flex-col overflow-x-hidden bg-background">
            {children}
          </div>
          {/* Theme toggle fixed in bottom right corner on all pages */}
          <GlobalThemeToggle />
          <CookieConsent />
        </ToastProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
