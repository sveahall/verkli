"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
  const [status, setStatus] = useState<string | null>(showAuthStatus ? "Login required" : null);

  useEffect(() => {
    if (!showAuthStatus) return;

    const supabase = createClient();
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        setStatus(`You are logged in as ${user.email}`);
      } else {
        setStatus("Login required");
      }
    };

    void loadUser();
  }, [showAuthStatus]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
        {variantLabel ? (
          <p className="text-[12px] uppercase tracking-[0.3em] text-muted-foreground">
            {variantLabel}
          </p>
        ) : null}
        <h1 className="text-[32px] font-semibold text-foreground">{title}</h1>
        <p className="text-[15px] text-muted-foreground">
          This page is a placeholder. Content will be added soon.
        </p>
        {status ? (
          <p className="rounded-full border border-border bg-muted/30 px-4 py-2 text-[13px] text-muted-foreground">
            {status}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:border-[#907AFF]/40 hover:text-[#907AFF]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
