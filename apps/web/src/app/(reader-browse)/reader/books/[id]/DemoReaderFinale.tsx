"use client";

import { useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/**
 * Reader-finalen — investor-pitch demo override for the top of
 * /reader/books/[id]. Rendered only when the viewer's profile is the
 * seeded demo author AND the demo flag is on. Real users never see it.
 *
 * Styled to match the rest of the reader surface (see DESIGN.md and
 * ReaderBookPageView): white `card-base` panel, brand-violet (#907AFF)
 * accents, platform language pills, and a Georgia reading body matching
 * the real chapter reader. No bespoke surfaces, fonts, or shadows.
 */
export interface DemoChapterByLang {
  language_code: string;
  /** First paragraph (used for the hero quote). */
  excerpt: string;
  /** All paragraphs joined with \n\n — rendered inline as the chapter body. */
  fullText: string;
}

interface Props {
  bookTitle: string;
  coverImageUrl: string | null;
  trailerUrl: string | null;
  chapters: ReadonlyArray<DemoChapterByLang>;
  /** Optional per-language chapter UUID for the "Read full chapter →" link. */
  readChapterByLang?: Record<string, string>;
}

const LANGUAGE_FLAGS: Record<string, string> = {
  sv: "🇸🇪",
  en: "🇬🇧",
  de: "🇩🇪",
  fr: "🇫🇷",
  es: "🇪🇸",
  it: "🇮🇹",
  nl: "🇳🇱",
  pt: "🇵🇹",
  pl: "🇵🇱",
  ja: "🇯🇵",
};

const LANGUAGE_NAMES: Record<string, string> = {
  sv: "Swedish",
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese",
  pl: "Polish",
  ja: "Japanese",
};

export default function DemoReaderFinale({
  bookTitle,
  coverImageUrl,
  trailerUrl,
  chapters,
  readChapterByLang,
}: Props) {
  const langs = useMemo(
    () => chapters.map((c) => c.language_code),
    [chapters]
  );
  const [activeLang, setActiveLang] = useState<string>(
    () => (langs.includes("en") ? "en" : langs[0] ?? "en")
  );

  const activeChapter = useMemo(
    () => chapters.find((c) => c.language_code === activeLang) ?? chapters[0],
    [chapters, activeLang]
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);

  const activeLangName = LANGUAGE_NAMES[activeLang] ?? activeLang.toUpperCase();

  function handlePlayPause() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      const expected = `/demo-assets/audio/${activeLang}.mp3`;
      if (!el.currentSrc.endsWith(expected)) {
        el.src = expected;
      }
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }

  function handleSelectLang(lang: string) {
    setActiveLang(lang);
    const el = audioRef.current;
    if (el && audioPlaying) {
      el.src = `/demo-assets/audio/${lang}.mp3`;
      void el.play().catch(() => undefined);
    }
  }

  return (
    <section
      aria-label="Reader"
      data-demo-reader
      className="card-base relative isolate overflow-hidden bg-white/80 backdrop-blur-sm dark:bg-white/[0.03]"
    >
      {/* Atmospheric brand glow — contained, subtle, matches ReaderBookPageView */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      >
        <div className="absolute right-0 top-0 h-72 w-72 translate-x-24 -translate-y-24 rounded-full bg-[#907AFF]/[0.10] blur-[80px]" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 translate-y-24 rounded-full bg-[#E29ED5]/[0.08] blur-[80px]" />
      </div>

      <div className="relative grid gap-6 p-4 sm:gap-8 sm:p-6 md:p-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        {/* ── Cover / trailer ──────────────────────────────────── */}
        <div className="relative mx-auto w-full max-w-[200px] sm:max-w-[260px] lg:mx-0">
          <div className="absolute inset-4 rounded-2xl bg-[#907AFF]/10 blur-2xl" />
          <div
            className="group relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-black/[0.08] shadow-surface-md ring-1 ring-slate-200/60 dark:border-white/10 dark:ring-white/10"
            style={{ animation: "demoHeroCoverIn 600ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
          >
            {trailerUrl ? (
              <video
                src={trailerUrl}
                poster={coverImageUrl ?? undefined}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverImageUrl}
                alt={bookTitle}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20 text-2xl font-semibold text-slate-700 dark:text-white/70">
                {bookTitle}
              </div>
            )}
          </div>
        </div>

        {/* ── Headline + lang + audio ──────────────────────────── */}
        <div
          className="flex min-w-0 flex-col gap-5"
          style={{ animation: "demoHeroTextIn 700ms cubic-bezier(0.16, 1, 0.3, 1) 120ms both" }}
        >
          {/* Title — solid slate heading, matching ReaderBookPageView */}
          <h1 className="text-balance text-[clamp(26px,4vw,40px)] font-bold leading-[1.1] tracking-tight text-slate-900 dark:text-white">
            {bookTitle}
          </h1>

          {/* Language switcher — platform pill style (see page.tsx languageSwitcher) */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/35">
              Read in
            </p>
            <div className="flex flex-wrap gap-2">
              {langs.map((l) => {
                const selected = l === activeLang;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => handleSelectLang(l)}
                    aria-pressed={selected}
                    className={
                      selected
                        ? "inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-[12px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:bg-white dark:text-slate-900"
                        : "inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/60 px-3.5 py-1.5 text-[12px] font-medium text-slate-600 transition-colors duration-150 ease-out hover:border-black/[0.12] hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/60 dark:hover:text-white"
                    }
                  >
                    <span aria-hidden className="text-[14px] leading-none">
                      {LANGUAGE_FLAGS[l] ?? "🏳️"}
                    </span>
                    {LANGUAGE_NAMES[l] ?? l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live-morphing chapter excerpt */}
          <blockquote
            key={activeLang}
            className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-[15px] italic leading-relaxed text-slate-600 shadow-surface-sm backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/60"
            style={{ animation: "demoFadeIn 320ms cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <span className="select-none text-[28px] leading-none text-[#907AFF]/40">“</span>
            {activeChapter?.excerpt ?? "—"}
            <span className="select-none text-[28px] leading-none text-[#907AFF]/40">”</span>
          </blockquote>

          {/* Audio bar */}
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-3 pl-4 shadow-surface-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
            <button
              type="button"
              onClick={handlePlayPause}
              aria-label={audioPlaying ? "Pause audiobook" : "Play audiobook"}
              className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#907AFF] text-white shadow-surface-sm transition-transform duration-200 ease-out hover:scale-[1.05] hover:bg-[#8069EE] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2"
            >
              {audioPlaying ? (
                <Pause className="h-5 w-5" aria-hidden />
              ) : (
                <Play className="ml-0.5 h-5 w-5" aria-hidden />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white">
                Audiobook in {activeLangName}
              </p>
              <p className="truncate text-[12px] text-slate-500 dark:text-white/50">
                Narrated with the author&rsquo;s cloned voice
              </p>
            </div>
            {audioPlaying ? (
              <div className="hidden items-center gap-1 sm:flex" aria-hidden>
                {[0.4, 0.7, 1.0, 0.6, 0.3].map((s, i) => (
                  <span
                    key={i}
                    className="block w-[3px] rounded-full bg-[#907AFF]/70"
                    style={{
                      height: `${10 + s * 14}px`,
                      animation: `demoAudioBar 800ms ease-in-out ${i * 80}ms infinite`,
                    }}
                  />
                ))}
              </div>
            ) : null}
            <audio
              ref={audioRef}
              preload="none"
              onPlay={() => setAudioPlaying(true)}
              onPause={() => setAudioPlaying(false)}
              onEnded={() => setAudioPlaying(false)}
            >
              <source src={`/demo-assets/audio/${activeLang}.mp3`} type="audio/mpeg" />
            </audio>
          </div>
        </div>
      </div>

      {/* ── Inline chapter body — matches the real reader (Georgia serif) ── */}
      <div className="relative border-t border-slate-200/60 bg-white/60 px-6 py-10 sm:px-10 sm:py-12 lg:px-16 lg:py-14 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <article
          key={`body-${activeLang}`}
          className="mx-auto max-w-[64ch] text-[17px] leading-[1.7] text-slate-800 dark:text-white/80"
          style={{ animation: "demoFadeIn 320ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <p className="text-eyebrow mb-4">Chapter one — {activeLangName}</p>
          {(activeChapter?.fullText ?? "")
            .split(/\n{2,}/)
            .filter((p) => p.trim().length > 0)
            .map((paragraph, idx) => (
              <p
                key={idx}
                className="mb-5 last:mb-0"
                style={{ fontFamily: "Georgia, serif" }}
              >
                {paragraph}
              </p>
            ))}
          {readChapterByLang && readChapterByLang[activeLang] ? (
            <div className="mt-10 flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/70 p-5 shadow-surface-sm dark:border-white/[0.08] dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-white">
                  Continue reading in {activeLangName}
                </p>
                <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">
                  Pick up the full chapter where the preview ends.
                </p>
              </div>
              <a
                href={`/reader/read/${readChapterByLang[activeLang]}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#907AFF] px-4 py-2 text-[13px] font-semibold text-white shadow-surface-sm transition-transform duration-200 ease-out hover:scale-[1.02] hover:bg-[#8069EE] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2"
              >
                Read full chapter
                <span aria-hidden>→</span>
              </a>
            </div>
          ) : null}
        </article>
      </div>

      <style>{`
        @keyframes demoHeroCoverIn {
          0% { opacity: 0; transform: translateY(16px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes demoHeroTextIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes demoFadeIn {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes demoAudioBar {
          0%, 100% { transform: scaleY(0.5); opacity: 0.6; }
          50% { transform: scaleY(1.4); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-demo-reader], [data-demo-reader] * {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
