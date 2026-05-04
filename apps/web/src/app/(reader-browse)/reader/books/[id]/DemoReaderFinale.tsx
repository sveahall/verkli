"use client";

import { useMemo, useRef, useState } from "react";
import { Globe, Pause, Play } from "lucide-react";

/**
 * Reader-finalen — investor-pitch demo override for the top of
 * /reader/books/[id]. Rendered only when the viewer's profile is the
 * seeded demo author AND the demo flag is on. Real users never see it.
 *
 * Layout (above-the-fold, single screen):
 *   - Cover image + "Available in 10 languages" pill (10 flag-emojis).
 *   - Autoplay muted trailer when books.trailer_url is set; sektionen
 *     gömms helt om null.
 *   - Mini language switcher (10 pills). Clicking morphs the visible
 *     chapter excerpt + the audiobook src — no DB call, all data is
 *     pre-fetched server-side and serialized into props.
 *   - Audiobook Play/Pause button → /demo-assets/audio/<lang>.mp3.
 */
export interface DemoChapterByLang {
  language_code: string;
  /** First paragraph of the chapter, plaintext, ~25 s spoken. */
  excerpt: string;
}

interface Props {
  bookTitle: string;
  coverImageUrl: string | null;
  trailerUrl: string | null;
  /** The 10 chapter excerpts indexed by language_code. */
  chapters: ReadonlyArray<DemoChapterByLang>;
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
      // Force the src into sync with the current language. Using the same
      // <audio> element across switches keeps the player UI continuous.
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
    // If audio is already playing, swap source mid-stream so the language
    // change feels live. Browsers reset playback to 0 on src change, which
    // is fine for a 25 s demo clip.
    const el = audioRef.current;
    if (el && audioPlaying) {
      el.src = `/demo-assets/audio/${lang}.mp3`;
      void el.play().catch(() => undefined);
    }
  }

  return (
    <section
      aria-label="Demo reader finale"
      className="relative isolate overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-[var(--brand-rose)]/5 to-[var(--brand-amber)]/10 p-5 shadow-sm sm:p-8"
    >
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* ── Cover + (optional) trailer ───────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-md">
            {trailerUrl ? (
              // Autoplay muted trailer overlays the cover. Falls back to
              // the cover image while the video is buffering.
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
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--brand-violet)]/15 via-[var(--brand-rose)]/10 to-[var(--brand-amber)]/15 text-2xl font-bold text-slate-700">
                {bookTitle}
              </div>
            )}
          </div>
        </div>

        {/* ── Title + badges + lang switcher + audio ──────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-violet)]/10 px-3 py-1 text-[12px] font-semibold text-[var(--brand-violet)]">
              <Globe className="h-3.5 w-3.5" aria-hidden />
              Available in {chapters.length} languages
            </span>
            <span className="flex items-center gap-1 text-[16px]" aria-hidden>
              {langs.map((l) => (
                <span key={l}>{LANGUAGE_FLAGS[l] ?? "🏳️"}</span>
              ))}
            </span>
          </div>

          <h1 className="text-page-title">{bookTitle}</h1>

          <div className="flex flex-wrap gap-1.5">
            {langs.map((l) => {
              const selected = l === activeLang;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => handleSelectLang(l)}
                  aria-pressed={selected}
                  className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${
                    selected
                      ? "border-[var(--brand-violet)]/40 bg-[var(--brand-violet)]/10 text-slate-900"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                >
                  <span aria-hidden className="mr-1">
                    {LANGUAGE_FLAGS[l] ?? "🏳️"}
                  </span>
                  {LANGUAGE_NAMES[l] ?? l.toUpperCase()}
                </button>
              );
            })}
          </div>

          {/* Live-morphing chapter excerpt */}
          <blockquote
            // key on activeLang so React tears the node and remounts on
            // every switch — gives us a clean fade-in via CSS animation
            // without an explicit transition library.
            key={activeLang}
            className="rounded-2xl border border-slate-100 bg-white/80 p-4 text-body italic leading-relaxed text-slate-700 shadow-sm"
            style={{ animation: "demoFadeIn 320ms ease-out" }}
          >
            “{activeChapter?.excerpt ?? "—"}”
          </blockquote>

          <div className="flex items-center gap-3 rounded-2xl border border-[var(--brand-violet)]/30 bg-gradient-to-r from-[var(--brand-violet)]/8 via-[var(--brand-rose)]/8 to-[var(--brand-amber)]/12 px-4 py-3">
            <button
              type="button"
              onClick={handlePlayPause}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-violet)] text-white shadow-sm hover:bg-[var(--brand-violet-hover)]"
              aria-label={audioPlaying ? "Pause audiobook" : "Play audiobook"}
            >
              {audioPlaying ? (
                <Pause className="h-4 w-4" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-label text-slate-900">
                Listen in {LANGUAGE_NAMES[activeLang] ?? activeLang.toUpperCase()}
              </p>
              <p className="text-helper">
                Audiobook {activeLang.toUpperCase()} · narrated with the
                author&rsquo;s cloned voice
              </p>
            </div>
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
      <style>{`
        @keyframes demoFadeIn {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
