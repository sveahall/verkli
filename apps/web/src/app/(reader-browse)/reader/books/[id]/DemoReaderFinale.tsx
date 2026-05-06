"use client";

import { useMemo, useRef, useState } from "react";
import { Globe, Pause, Play } from "lucide-react";

/**
 * Reader-finalen — investor-pitch demo override for the top of
 * /reader/books/[id]. Rendered only when the viewer's profile is the
 * seeded demo author AND the demo flag is on. Real users never see it.
 *
 * Light-mode hero matching the rest of the reader surface (cream/paper
 * tones with brand-gradient accents), not a standalone dark card. Big
 * cover, display title, language switcher, audio band.
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
      aria-label="Demo reader finale"
      // Light cream/paper base with very subtle ambient brand glow on the
      // edges. Reads as part of the reader surface, not a foreign card.
      className="relative isolate overflow-hidden rounded-[28px] border border-slate-200/80 bg-[#FDFAF4] shadow-[0_24px_72px_-32px_rgba(124,92,252,0.18)]"
    >
      {/* Soft brand-gradient atmosphere — present but never dominant */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-32 -top-40 h-[420px] w-[420px] rounded-full opacity-25 blur-3xl"
          style={{ background: "var(--brand-violet)" }}
        />
        <div
          className="absolute -right-24 top-32 h-[340px] w-[340px] rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--brand-rose)" }}
        />
        <div
          className="absolute -bottom-32 left-1/3 h-[380px] w-[380px] rounded-full opacity-25 blur-3xl"
          style={{ background: "var(--brand-amber)" }}
        />
      </div>

      <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(280px,400px)_minmax(0,1fr)] lg:gap-12">
        {/* ── Cover / trailer ──────────────────────────────────── */}
        <div className="flex justify-center lg:justify-start">
          <div
            className="group relative aspect-[2/3] w-full max-w-[400px] overflow-hidden rounded-2xl shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-slate-200/60"
            style={{ animation: "demoHeroCoverIn 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
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
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--brand-violet)]/20 via-[var(--brand-rose)]/15 to-[var(--brand-amber)]/20 text-3xl font-bold text-slate-700">
                {bookTitle}
              </div>
            )}
          </div>
        </div>

        {/* ── Headline + lang + audio ──────────────────────────── */}
        <div
          className="flex min-w-0 flex-col justify-center gap-5"
          style={{ animation: "demoHeroTextIn 700ms ease-out 120ms both" }}
        >
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-[var(--brand-violet)]/20 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-violet)] shadow-sm backdrop-blur">
            <Globe className="h-3 w-3" aria-hidden />
            Available in {chapters.length} languages
            <span className="ml-2 flex items-center gap-1 text-[14px]" aria-hidden>
              {langs.map((l) => (
                <span key={l} className="leading-none">
                  {LANGUAGE_FLAGS[l] ?? "🏳️"}
                </span>
              ))}
            </span>
          </span>

          <h1
            className="text-balance text-[44px] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[56px]"
            style={{ fontFamily: 'var(--font-montserrat-alternates), "Inter", ui-sans-serif, system-ui, sans-serif' }}
          >
            <span className="bg-gradient-to-r from-[var(--brand-violet)] via-[var(--brand-rose)] to-[var(--brand-amber)] bg-clip-text text-transparent">
              {bookTitle}
            </span>
          </h1>

          {/* Language switcher — flag pills only */}
          <div className="flex flex-wrap gap-1.5">
            {langs.map((l) => {
              const selected = l === activeLang;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => handleSelectLang(l)}
                  aria-pressed={selected}
                  aria-label={LANGUAGE_NAMES[l] ?? l}
                  title={LANGUAGE_NAMES[l] ?? l}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-[18px] transition-all duration-200 ${
                    selected
                      ? "bg-white shadow-[0_6px_18px_-4px_rgba(124,92,252,0.45)] ring-2 ring-[var(--brand-violet)]"
                      : "border border-slate-200 bg-white/60 hover:scale-[1.08] hover:border-[var(--brand-violet)]/30 hover:bg-white"
                  }`}
                >
                  <span aria-hidden>{LANGUAGE_FLAGS[l] ?? "🏳️"}</span>
                </button>
              );
            })}
          </div>

          {/* Live-morphing chapter excerpt */}
          <blockquote
            key={activeLang}
            className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-[15px] italic leading-[1.65] text-slate-700 shadow-sm backdrop-blur-sm"
            style={{ animation: "demoFadeIn 320ms ease-out" }}
          >
            <span className="select-none text-[28px] leading-none text-[var(--brand-violet)]/40">“</span>
            {activeChapter?.excerpt ?? "—"}
            <span className="select-none text-[28px] leading-none text-[var(--brand-violet)]/40">”</span>
          </blockquote>

          {/* Audio bar — light, brand-violet primary */}
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-3 pl-4 shadow-sm">
            <button
              type="button"
              onClick={handlePlayPause}
              aria-label={audioPlaying ? "Pause audiobook" : "Play audiobook"}
              className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--brand-violet)] text-white shadow-[0_8px_20px_-4px_rgba(124,92,252,0.5)] transition hover:scale-[1.05] hover:bg-[var(--brand-violet-hover)] active:scale-[0.96]"
            >
              {audioPlaying ? (
                <Pause className="h-5 w-5" aria-hidden />
              ) : (
                <Play className="ml-0.5 h-5 w-5" aria-hidden />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold tracking-tight text-slate-900">
                Audiobook in {LANGUAGE_NAMES[activeLang] ?? activeLang.toUpperCase()}
              </p>
              <p className="truncate text-[12px] text-slate-500">
                Narrated with the author&rsquo;s cloned voice · {activeLang.toUpperCase()}
              </p>
            </div>
            {audioPlaying ? (
              <div className="hidden items-center gap-1 sm:flex" aria-hidden>
                {[0.4, 0.7, 1.0, 0.6, 0.3].map((s, i) => (
                  <span
                    key={i}
                    className="block w-[3px] rounded-full bg-[var(--brand-violet)]/70"
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

      {/* ── Inline chapter body — answers "och vad läser man?" ── */}
      <div className="relative border-t border-slate-200/60 bg-white/80 px-6 py-10 sm:px-10 sm:py-12 lg:px-16 lg:py-14">
        <article
          // key on activeLang re-mounts the article so the fade re-fires
          // and the scroll position resets when the user switches language.
          key={`body-${activeLang}`}
          className="mx-auto max-w-[64ch] text-[16px] leading-[1.7] text-slate-800"
          style={{ animation: "demoFadeIn 320ms ease-out" }}
        >
          <p className="text-eyebrow mb-4 text-[var(--brand-violet)]">
            Chapter one — {LANGUAGE_NAMES[activeLang] ?? activeLang.toUpperCase()}
          </p>
          {(activeChapter?.fullText ?? "")
            .split(/\n{2,}/)
            .filter((p) => p.trim().length > 0)
            .map((paragraph, idx) => (
              <p
                key={idx}
                className="mb-5 last:mb-0"
                style={{ fontFamily: '"Iowan Old Style", Georgia, "Times New Roman", serif' }}
              >
                {paragraph}
              </p>
            ))}
          {readChapterByLang && readChapterByLang[activeLang] ? (
            <p className="mt-8 text-[13px]">
              <a
                href={`/reader/read/${readChapterByLang[activeLang]}`}
                className="inline-flex items-center gap-1.5 font-semibold text-[var(--brand-violet)] underline decoration-[var(--brand-violet)]/30 underline-offset-4 hover:decoration-[var(--brand-violet)]"
              >
                Read the full chapter
                <span aria-hidden>→</span>
              </a>
            </p>
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
      `}</style>
    </section>
  );
}
