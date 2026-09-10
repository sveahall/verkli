import Link from "next/link";
import Image from "next/image";
import { getDiscoverHref } from "@/lib/flags";

type FooterVariant = "reader" | "author";

const linkClass =
  "inline-flex min-h-8 items-center transition-colors hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";
const columnHeaderClass =
  "text-[14px] font-medium text-foreground";
const columnLinkClass = "space-y-2 text-[14px] text-muted-foreground";

export default function Footer({ variant = "reader" }: { variant?: FooterVariant }) {
  const discoverHref = getDiscoverHref();
  return (
    <footer data-variant={variant} className="relative mx-auto w-full max-w-[1520px] px-5 pb-8 pt-12 sm:px-8 md:pb-12 lg:px-12">
      <div className="grid gap-x-8 gap-y-10 border-t border-border py-10 sm:grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr] md:gap-12 md:py-14">
        <div className="space-y-5">
          <Link href="/" className="inline-block">
            <Image src="/logo-dark.svg" alt="Verkli" width={158} height={36} className="h-9 w-auto dark:hidden" />
            <Image src="/favicon.svg" alt="Verkli" width={158} height={36} className="hidden h-9 w-auto dark:block" />
          </Link>
          <p className="max-w-[280px] text-[15px] leading-[1.7] text-muted-foreground ">
            One story. Every possibility. Writing, translation, audiobooks and publishing, together in Verkli.
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
            <li><Link href="/support" className={linkClass}>Help &amp; support</Link></li>
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
      <div className="flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-[12px] text-muted-foreground md:flex-row">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:justify-start">
          <span>© 2026 Verkli. All rights reserved.</span>
          <Link href="/privacy" className={linkClass}>Privacy</Link>
          <Link href="/terms" className={linkClass}>Terms</Link>
          <Link href="/support" className={linkClass}>Support</Link>
        </div>
        {/* This slot used to claim "All systems operational" against no status
            source at all — a green dot that was hard-coded true even during an
            outage. Until there is a real health feed to read, it carries a
            contact address instead, which is always true. */}
        <a
          href="mailto:hello@verkli.com"
          className={`${linkClass} shrink-0`}
        >
          hello@verkli.com
        </a>
      </div>
    </footer>
  );
}
