import Link from "next/link";
import Image from "next/image";
import { getDiscoverHref } from "@/lib/flags";

type FooterVariant = "reader" | "author";

const linkClass =
  "transition-colors hover:text-slate-900 dark:hover:text-white/80";
const columnHeaderClass =
  "text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40";
const columnLinkClass = "space-y-3 text-[15px] text-slate-600 dark:text-white/50";

export default function Footer({ variant = "reader" }: { variant?: FooterVariant }) {
  const discoverHref = getDiscoverHref();
  return (
    <footer data-variant={variant} className="relative mx-auto w-full max-w-[100vw] px-4 pb-8 pt-6 md:px-6 md:pb-12 md:pt-8">
      <div className="grid gap-8 rounded-2xl bg-gradient-to-b from-black/[0.04] to-transparent px-4 py-6 sm:gap-10 sm:rounded-[32px] sm:px-6 sm:py-10 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:gap-12 md:px-11 md:py-12 dark:from-white/[0.04]">
        <div className="space-y-5">
          <Link href="/" className="inline-block">
            <Image src="/logo-dark.svg" alt="Verkli" width={158} height={36} className="h-9 w-auto dark:hidden" />
            <Image src="/favicon.svg" alt="Verkli" width={36} height={36} className="hidden h-9 w-auto dark:block" />
          </Link>
          <p className="max-w-[280px] text-[15px] leading-[1.7] text-slate-600 dark:text-white/50">
            Where books become momentum. The platform for authors who want to reach readers everywhere.
          </p>
        </div>
        <div className="space-y-4">
          <p className={columnHeaderClass}>Product</p>
          <ul className={columnLinkClass}>
            <li><Link href="/product" className={linkClass}>Features</Link></li>
            <li><Link href="/pricing" className={linkClass}>Pricing</Link></li>
            <li><Link href="/how-it-works" className={linkClass}>How it works</Link></li>
            <li><Link href="/faq" className={linkClass}>FAQ</Link></li>
          </ul>
        </div>
        <div className="space-y-4">
          <p className={columnHeaderClass}>Readers</p>
          <ul className={columnLinkClass}>
            {discoverHref && (
              <li><Link href={discoverHref} className={linkClass}>Discover</Link></li>
            )}
            <li><Link href="/reader/signin" className={linkClass}>Sign in</Link></li>
            <li><Link href="/pricing" className={linkClass}>Membership</Link></li>
          </ul>
        </div>
        <div className="space-y-4">
          <p className={columnHeaderClass}>Authors</p>
          <ul className={columnLinkClass}>
            <li><Link href="/author/signin" className={linkClass}>Author portal</Link></li>
            <li><Link href="/author/signup" className={linkClass}>Start writing</Link></li>
          </ul>
        </div>
      </div>
      <div className="mt-8 flex flex-col items-center justify-between gap-4 px-4 text-[13px] text-slate-500 dark:text-white/30 md:flex-row md:px-11">
        <div className="flex items-center gap-4">
          <span>© 2026 Verkli. All rights reserved.</span>
          <Link href="/privacy" className={linkClass}>Privacy</Link>
          <Link href="/terms" className={linkClass}>Terms</Link>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="h-2 w-2 rounded-full bg-green-400"></span>
          <span>All systems operational</span>
        </div>
      </div>
    </footer>
  );
}
