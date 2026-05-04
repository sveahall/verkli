"use client";

import { useMemo } from "react";
import { Check, Languages, Play, Sparkles } from "lucide-react";
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
  void bookId; // bookId is part of the public component contract but the
  // façade's pacing/state is internal-only — no DB calls in demo mode.

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
    <section className="flex w-full flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-eyebrow">Production</p>
          <h2 className="text-page-title flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-[var(--brand-violet)]" aria-hidden />
            Produce everything
          </h2>
          <p className="text-body mt-1 max-w-xl">
            One click. The audiobook narrates with your cloned voice and the
            book translates into every language you pick — all in parallel.
          </p>
        </div>
        {isDone ? (
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-label text-slate-600 hover:bg-slate-50"
          >
            Reset demo
          </button>
        ) : null}
      </header>

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <ToggleRow
          icon={<Sparkles className="h-4 w-4" aria-hidden />}
          label="Audiobook"
          description="Generate narration with your cloned voice."
          checked={audiobookEnabled}
          onChange={setAudiobookEnabled}
          disabled={isProducing}
        />
        <div>
          <div className="flex items-center gap-2 text-label text-slate-700">
            <Languages className="h-4 w-4" aria-hidden /> Translate to
          </div>
          <p className="text-helper mt-1">
            {selectedLanguages.length} of {DEMO_LANGUAGES.length} languages selected
          </p>
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
                  className={`rounded-full border px-2.5 py-1 text-caption transition disabled:cursor-not-allowed ${
                    selected
                      ? "border-[var(--brand-violet)]/40 bg-[var(--brand-violet)]/10 text-slate-900"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  <span className="mr-1" aria-hidden>
                    {LANGUAGE_FLAGS[lang]}
                  </span>
                  {lang.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5">
        <div>
          <p className="text-label text-slate-700">Ready when you are</p>
          <p className="text-helper">
            No queue. No payments. Façade demo — production-grade pacing only.
          </p>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={isProducing}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-violet)] px-5 py-2.5 text-label font-semibold text-white shadow-sm transition hover:bg-[var(--brand-violet-hover)] active:bg-[var(--brand-violet-active)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Produce everything
        </button>
      </div>

      {state.status !== "idle" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-section-title">
              {isDone
                ? `${readyCount} languages ready`
                : `Producing ${selectedLanguages.length} languages…`}
            </p>
            {isDone ? (
              <CheckmarkPop />
            ) : (
              <span className="text-helper">{readyCount}/{selectedLanguages.length}</span>
            )}
          </div>

          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {selectedLanguages.map((lang) => {
              const ready = state.badges[lang];
              return (
                <li
                  key={lang}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-all duration-300 ${
                    ready
                      ? "border-[var(--brand-violet)]/40 bg-[var(--brand-violet)]/5"
                      : "border-slate-200 bg-white"
                  }`}
                  style={{
                    transform: ready ? "scale(1)" : "scale(0.94)",
                    opacity: ready ? 1 : 0.55,
                    boxShadow: ready
                      ? "0 0 0 4px color-mix(in oklab, var(--brand-violet) 12%, transparent)"
                      : "none",
                  }}
                >
                  <span className="flex items-center gap-2 text-label text-slate-800">
                    <span aria-hidden>{LANGUAGE_FLAGS[lang]}</span>
                    {LANGUAGE_NAMES[lang]}
                  </span>
                  {ready ? (
                    <Check
                      className="h-4 w-4 text-[var(--brand-violet)]"
                      aria-label="ready"
                    />
                  ) : (
                    <span className="text-caption text-slate-400">…</span>
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
    </section>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--brand-violet)] focus:ring-[var(--brand-violet)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>
        <span className="flex items-center gap-2 text-label text-slate-800">
          {icon}
          {label}
        </span>
        <span className="text-helper">{description}</span>
      </span>
    </label>
  );
}

function AudiobookPulsing() {
  return (
    <div
      className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-3"
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
      <span className="text-helper">Audiobook narrating…</span>
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
  // Default play language: the first selected language with a ready badge.
  const defaultLang: DemoLanguage =
    selectedLanguages.find((l) => l === "en") ?? selectedLanguages[0] ?? "en";
  return (
    <div
      className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--brand-violet)]/30 bg-gradient-to-r from-[var(--brand-violet)]/8 via-[var(--brand-rose)]/8 to-[var(--brand-amber)]/12 px-4 py-3"
      style={{ animation: "demoPopIn 320ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
    >
      <div>
        <p className="text-label text-slate-900">Audiobook ready</p>
        <p className="text-helper">
          {LANGUAGE_NAMES[defaultLang]} narration ({defaultLang.toUpperCase()})
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          void onPlay(defaultLang);
        }}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-violet)] px-4 py-2 text-label font-medium text-white shadow-sm hover:bg-[var(--brand-violet-hover)]"
      >
        <Play className="h-4 w-4" aria-hidden /> Play
      </button>
      <style>{`
        @keyframes demoPopIn {
          0% { transform: scale(0.85); opacity: 0; }
          80% { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function CheckmarkPop() {
  return (
    <span
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-violet)] text-white"
      style={{ animation: "demoCheckPop 200ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
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
