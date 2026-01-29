import type { Metadata } from "next";
import { Inter, Montserrat_Alternates } from "next/font/google";
import "./globals.css";
import "../components/GridMotion.css";
import "../components/GlassSurface.css";
import GlobalNavbar from "@/components/navbar/GlobalNavbar";
import GlobalFooter from "@/components/GlobalFooter";

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
  title: "Verkli",
  description: "Verkli — the platform for writers and readers.",
};

const themeScript = `
  try {
    const stored = localStorage.getItem('verkli-theme');
    const theme = stored || 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch (error) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${montserratAlternates.variable} antialiased flex min-h-screen min-h-dvh flex-col`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <GlobalNavbar />
        <div className="flex min-h-0 flex-1 flex-col">
          {children}
        </div>
        <GlobalFooter />
      </body>
    </html>
  );
}
