"use client";

// Multi-language reader switcher (Week 1 / ROADMAP Phase 0.2).
//
// Renders a chip per published language version of the book and navigates to
// the matching chapter id when clicked. The current language is highlighted
// and non-clickable.
//
// On click:
//   1. Optimistically navigate to the sibling chapter (audio reload happens
//      because audio src is keyed on chapter id).
//   2. Best-effort POST to /api/reader/preferences/preferred-language to
//      persist the choice in profiles.preferences.preferredLanguageByBook.
//      Failure is silent — preference is a comfort feature, not a guarantee.
//
// Server-side, the parent page resolves which sibling chapter to use for each
// language by joining `book_versions` to `chapters` on `order`. If a language
// is missing the sibling chapter, that language is omitted from the list.

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

export type LanguageOption = {
  code: string;
  label: string;
  chapterId: string;
  hasAudio: boolean;
};

type Props = {
  bookId: string;
  currentLanguage: string;
  options: LanguageOption[];
};

export default function LanguageSwitcher({ bookId, currentLanguage, options }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  if (options.length <= 1) return null; // single-language books — nothing to switch

  const handleSwitch = (option: LanguageOption) => {
    if (option.code === currentLanguage || isPending) return;

    // Preserve any existing query params (e.g. ?continue=true), set lang.
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("lang", option.code);
    const targetPath = `/reader/read/${option.chapterId}?${params.toString()}`;

    // Best-effort persistence — fire and forget.
    void fetch("/api/reader/preferences/preferred-language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId, language: option.code }),
    }).catch(() => {
      /* analytics, not load-bearing */
    });

    startTransition(() => {
      router.push(targetPath);
    });

    void pathname;
  };

  return (
    <div
      role="group"
      aria-label="Reading language"
      className="flex flex-wrap items-center gap-1.5"
      data-testid="reader-language-switcher"
    >
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Language
      </span>
      {options.map((opt) => {
        const isCurrent = opt.code === currentLanguage;
        return (
          <button
            key={opt.code}
            type="button"
            disabled={isCurrent || isPending}
            aria-pressed={isCurrent}
            onClick={() => handleSwitch(opt)}
            data-testid={`lang-chip-${opt.code}`}
            className={
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition " +
              (isCurrent
                ? "border-primary/40 bg-primary/10 text-primary cursor-default"
                : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5") +
              (isPending && !isCurrent ? " opacity-50" : "")
            }
          >
            <span className="font-mono text-[10px] uppercase">{opt.code}</span>
            <span>{opt.label}</span>
            {opt.hasAudio ? (
              <span aria-label="Audiobook available" title="Audiobook available" className="text-[10px]">
                🎧
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
