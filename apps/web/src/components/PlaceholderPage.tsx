"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SOFT_DENIAL_COPY } from "@/lib/copy-rules";

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

export default function PlaceholderPage({
  title,
  links,
  variantLabel,
  showAuthStatus = false,
}: PlaceholderPageProps) {
  const [status, setStatus] = useState<string | null>(showAuthStatus ? SOFT_DENIAL_COPY.ACCESS_RESTRICTED : null);

  useEffect(() => {
    if (!showAuthStatus) return;

    const supabase = createClient();
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        setStatus(null);
      } else {
        setStatus(SOFT_DENIAL_COPY.ACCESS_RESTRICTED);
      }
    };

    void loadUser();
  }, [showAuthStatus]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="page-content-narrow flex min-h-[60vh] flex-col items-center justify-center gap-6 py-16 text-center">
        {variantLabel ? <p className="text-eyebrow">{variantLabel}</p> : null}
        <h1 className="text-page-title">{title}</h1>
        <p className="max-w-md text-body">
          This page is a placeholder. Content will be added soon.
        </p>
        {status ? (
          <p className="rounded-full border border-border bg-muted/30 px-4 py-2.5 text-helper">
            {status}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="btn-secondary">
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
