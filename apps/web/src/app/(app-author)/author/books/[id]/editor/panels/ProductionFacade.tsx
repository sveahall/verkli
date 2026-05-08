"use client";

import { useMemo } from "react";
import { Check, Headphones, Languages, Play, Sparkles } from "lucide-react";
import {
  DEMO_LANGUAGES,
  type DemoLanguage,
  useDemoProduction,
} from "../hooks/useDemoProduction";

interface ProductionFacadeProps {
  bookId: string;
}

const LANGUAGE_FLAGS: Record<DemoLanguage, string> = {
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

const LANGUAGE_NAMES: Record<DemoLanguage, string> = {
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

export default function ProductionFacade({ bookId }: ProductionFacadeProps) {
  void bookId;

  const {
    state,
    selectedLanguages,
    toggleLanguage,
    audiobookEnabled,
    setAudiobookEnabled,
    start,
    reset,
    playLanguage,
  } = useDemoProduction();

  const isProducing = state.status === "producing";
  const isDone = state.status === "done";
  const readyCount = useMemo(
    () =>
      DEMO_LANGUAGES.reduce(
        (count, lang) => count + (state.badges[lang] ? 1 : 0),
        0
      ),
    [state.badges]
  );

  return (
    <section
      aria-label="Demo production façade"
      className="relative isolate overflow-hidden rounded-3xl ring-1 ring-slate-200/70 dark:ring-white/[0.08]"
    >
      <div className="relative flex flex-col gap-6 p-6 sm:p-10">
        {/* ── Hero header ─────────────────────────────────────────── */}
        <header className="relative flex flex-col items-center gap-3 text-center">
          <h2 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-slate-900 sm:text-[32px]">
            Produce everything.
          </h2>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-slate-500">
            One click. The audiobook narrates with your cloned voice and the
            book translates into every language you pick — all in parallel.
          </p>
          {isDone ? (
            <button
              type="button"
              onClick={reset}
              className="absolute right-0 top-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
            >
              Reset
            </button>
          ) : null}
        </header>

        {/* ── Audiobook toggle + Language picker ──────────────────── */}
        <div className="grid gap-6 sm:grid-cols-[260px_minmax(0,1fr)]">
          {/* Audiobook card */}
          <label
            className={`group flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 transition-colors ${
              audiobookEnabled
                ? "border-[var(--brand-violet)]/30"
                : "border-slate-100 hover:border-slate-200"
            } ${isProducing ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={audiobookEnabled}
              onChange={(e) => setAudiobookEnabled(e.target.checked)}
              disabled={isProducing}
            />
            <span
              className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
                audiobookEnabled
                  ? "bg-[var(--brand-violet)] text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              <Headphones className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-slate-900">
                Audiobook
                {audiobookEnabled ? (
                  <Check className="h-3.5 w-3.5 text-[var(--brand-violet)]" aria-hidden />
                ) : null}
              </span>
              <span className="text-[12px] text-slate-500">
                Cloned voice, every language.
              </span>
            </span>
          </label>

          {/* Language picker */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[14px] font-medium text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Languages className="h-3.5 w-3.5" aria-hidden />
                </span>
                Translate to
              </span>
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                {selectedLanguages.length} / {DEMO_LANGUAGES.length}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {DEMO_LANGUAGES.map((lang) => {
                const selected = selectedLanguages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    disabled={isProducing}
                    aria-pressed={selected}
                    aria-label={LANGUAGE_NAMES[lang]}
                    title={LANGUAGE_NAMES[lang]}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-[16px] transition-all duration-200 disabled:cursor-not-allowed ${
                      selected
                        ? "bg-white ring-1 ring-[var(--brand-violet)]"
                        : "border border-slate-100 bg-white hover:border-[var(--brand-violet)]/30"
                    }`}
                  >
                    <span aria-hidden>{LANGUAGE_FLAGS[lang]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Hero CTA ────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={start}
            disabled={isProducing}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-[#0F172A] px-6 py-3 text-[14px] font-medium text-white transition-colors duration-200 hover:bg-[#1E293B] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            <Sparkles className="relative h-4 w-4" aria-hidden />
            <span className="relative">
              {isProducing ? "Producing…" : "Produce everything"}
            </span>
          </button>
          <p className="text-[12px] text-slate-500">
            No queue · no payments · 18 seconds end-to-end
          </p>
        </div>

        {/* ── Live status ─────────────────────────────────────────── */}
        {state.status !== "idle" ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-baseline gap-3">
                {/* Big swelling counter — the focal point during the 17 s
                    pacing window. Brand-gradient text-fill when complete
                    so the eye lands on it from across the room. */}
                <span
                  key={readyCount}
                  className={`tabular-nums text-[28px] font-semibold leading-none tracking-[-0.02em] sm:text-[32px] ${
                    isDone ? "text-[var(--brand-violet)]" : "text-slate-900"
                  }`}
                  style={{
                    animation: "demoCountPop 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                >
                  {readyCount}
                </span>
                <span className="text-[18px] font-medium text-slate-400">/ {selectedLanguages.length}</span>
                <div className="ml-3 flex flex-col gap-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-violet)]">
                    {isDone ? "Live" : "Producing"}
                  </p>
                  <p className="text-[14px] font-medium text-slate-700">
                    {isDone ? "languages ready" : "languages in flight"}
                  </p>
                </div>
              </div>
              {isDone ? <CheckmarkPop /> : <ProgressRing value={readyCount / Math.max(1, selectedLanguages.length)} />}
            </div>
            <style>{`
              @keyframes demoCountPop {
                0% { transform: scale(0.8); opacity: 0.4; }
                60% { transform: scale(1.08); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
              }
            `}</style>

            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {selectedLanguages.map((lang) => {
                const ready = state.badges[lang];
                return (
                  <li
                    key={lang}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 transition-colors duration-300 ${
                      ready
                        ? "border-[var(--brand-violet)]/30 bg-[var(--brand-violet)]/[0.06]"
                        : "border-slate-100 bg-white"
                    }`}
                    style={{
                      opacity: ready ? 1 : 0.6,
                    }}
                  >
                    <span className="flex items-center gap-2.5 text-[13px] font-medium text-slate-800">
                      <span className="text-[16px]" aria-hidden>{LANGUAGE_FLAGS[lang]}</span>
                      {LANGUAGE_NAMES[lang]}
                    </span>
                    {ready ? (
                      <Check className="h-4 w-4 text-[var(--brand-violet)]" aria-label="ready" />
                    ) : (
                      <span className="flex h-4 w-4 items-center justify-center" aria-hidden>
                        <span className="block h-1.5 w-1.5 rounded-full bg-slate-300" />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            {audiobookEnabled && state.audiobookReady ? (
              <AudiobookReadyPanel
                selectedLanguages={selectedLanguages}
                onPlay={playLanguage}
              />
            ) : audiobookEnabled ? (
              <AudiobookPulsing />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const dash = c * Math.min(1, Math.max(0, value));
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgb(226 232 240)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="var(--brand-violet)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 18 18)"
        style={{ transition: "stroke-dasharray 320ms ease-out" }}
      />
    </svg>
  );
}

function AudiobookPulsing() {
  return (
    <div
      className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-3"
      aria-live="polite"
    >
      <div className="flex items-end gap-1" aria-hidden>
        {[0.5, 0.8, 1.0, 0.7, 0.4].map((scale, i) => (
          <span
            key={i}
            className="block w-1 rounded-full bg-[var(--brand-violet)]/60"
            style={{
              height: `${10 + scale * 16}px`,
              animation: `demoPulse 900ms ease-in-out ${i * 90}ms infinite`,
            }}
          />
        ))}
      </div>
      <span className="text-[13px] text-slate-600">Audiobook narrating…</span>
      <style>{`
        @keyframes demoPulse {
          0%, 100% { transform: scaleY(0.6); opacity: 0.6; }
          50% { transform: scaleY(1.4); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function AudiobookReadyPanel({
  selectedLanguages,
  onPlay,
}: {
  selectedLanguages: DemoLanguage[];
  onPlay: (lang: DemoLanguage) => Promise<void>;
}) {
  const defaultLang: DemoLanguage =
    selectedLanguages.find((l) => l === "en") ?? selectedLanguages[0] ?? "en";
  return (
    <div
      className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[var(--brand-violet)]/20 bg-[var(--brand-violet)]/[0.04] px-4 py-3"
      style={{ animation: "demoPopIn 360ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
          <Headphones className="h-4 w-4 text-[var(--brand-violet)]" aria-hidden />
        </span>
        <div>
          <p className="text-[13px] font-semibold text-slate-900">Audiobook ready</p>
          <p className="text-[11px] text-slate-500">
            {LANGUAGE_NAMES[defaultLang]} · narrated with the author&rsquo;s cloned voice
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          void onPlay(defaultLang);
        }}
        className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1E293B] active:scale-[0.97]"
      >
        <Play className="ml-0.5 h-3.5 w-3.5" aria-hidden /> Play
      </button>
      <style>{`
        @keyframes demoPopIn {
          0% { transform: scale(0.92); opacity: 0; }
          80% { transform: scale(1.02); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function CheckmarkPop() {
  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-violet)] text-white"
      style={{ animation: "demoCheckPop 220ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      aria-label="all done"
    >
      <Check className="h-5 w-5" aria-hidden />
      <style>{`
        @keyframes demoCheckPop {
          0% { transform: scale(0.5); }
          70% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      `}</style>
    </span>
  );
}
