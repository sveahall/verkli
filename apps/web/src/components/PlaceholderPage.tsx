"use client";

import Link from "next/link";

export type PlaceholderLink = {
  label: string;
  href: string;
};

type PlaceholderPageProps = {
  title: string;
  links: PlaceholderLink[];
  variantLabel?: string;
  showAuthStatus?: boolean;
};

/**
 * Legacy compatibility component kept to satisfy stale imports/build artifacts.
 * Current routes should redirect to real pages instead of rendering this.
 */
export default function PlaceholderPage({
  title,
  links,
  variantLabel,
}: PlaceholderPageProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="page-content-narrow flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
        {variantLabel ? <p className="text-eyebrow">{variantLabel}</p> : null}
        <h1 className="text-page-title">{title}</h1>
        <nav className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="btn-secondary">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
