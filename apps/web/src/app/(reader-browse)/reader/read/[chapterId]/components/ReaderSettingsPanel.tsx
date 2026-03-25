"use client";

import type { RefObject } from "react";
import {
  FONT_MAX,
  FONT_MIN,
  FONT_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  THEME_OPTIONS,
  clamp,
  type ReaderFont,
  type ReaderSettings,
  type ReaderTheme,
} from "../ReaderChapterClient.helpers";

type ReaderSettingsPanelProps = {
  userId: string | null;
  showSettingsPanel: boolean;
  settingsButtonRef: RefObject<HTMLButtonElement | null>;
  settingsPanelRef: RefObject<HTMLDivElement | null>;
  settingsSaveState: "idle" | "saving" | "saved" | "error";
  settingsStatusLabel: string;
  settings: ReaderSettings;
  readerFont: ReaderFont;
  readerTheme: ReaderTheme;
  backgroundIntensity: number;
  onToggle: () => void;
  onUpdateReaderSettings: (
    updater: (prev: ReaderSettings) => ReaderSettings
  ) => void;
  onFontChange: (font: ReaderFont) => void;
  onThemeChange: (theme: ReaderTheme) => void;
  onBackgroundIntensityChange: (value: number) => void;
};

export default function ReaderSettingsPanel({
  userId,
  showSettingsPanel,
  settingsButtonRef,
  settingsPanelRef,
  settingsSaveState,
  settingsStatusLabel,
  settings,
  readerFont,
  readerTheme,
  backgroundIntensity,
  onToggle,
  onUpdateReaderSettings,
  onFontChange,
  onThemeChange,
  onBackgroundIntensityChange,
}: ReaderSettingsPanelProps) {
  return (
    <div className="fixed right-4 top-[calc(env(safe-area-inset-top,0px)+6rem)] z-[100]">
      <button
        ref={settingsButtonRef}
        type="button"
        onClick={onToggle}
        className="rounded-full border border-slate-200 bg-white/95 p-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-white dark:border-white/15 dark:bg-slate-800 dark:hover:bg-slate-700"
        aria-label="Reader settings"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-slate-700 dark:text-white/80"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {showSettingsPanel && (
        <div
          ref={settingsPanelRef}
          className="absolute right-0 top-12 w-[270px] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_20px_44px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-slate-900"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
              L&auml;sinst&auml;llningar
            </p>
            {userId && settingsStatusLabel && (
              <span
                className={`text-[11px] font-medium ${
                  settingsSaveState === "error"
                    ? "text-red-600 dark:text-red-300"
                    : "text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {settingsStatusLabel}
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
                Textstorlek
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateReaderSettings((prev) => ({
                      ...prev,
                      fontSize: clamp(prev.fontSize - 1, FONT_MIN, FONT_MAX),
                    }))
                  }
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 dark:border-white/15 dark:text-white/70"
                  aria-label="Decrease text size"
                >
                  A-
                </button>
                <span className="min-w-[40px] text-center text-[12px] font-semibold text-slate-900 dark:text-white">
                  {settings.fontSize}px
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateReaderSettings((prev) => ({
                      ...prev,
                      fontSize: clamp(prev.fontSize + 1, FONT_MIN, FONT_MAX),
                    }))
                  }
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 dark:border-white/15 dark:text-white/70"
                  aria-label="Increase text size"
                >
                  A+
                </button>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
                Radavst&aring;nd
              </p>
              <select
                value={String(settings.lineHeight)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onUpdateReaderSettings((prev) => ({
                    ...prev,
                    lineHeight: next,
                  }));
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-800 dark:border-white/15 dark:bg-white/5 dark:text-white"
              >
                {LINE_HEIGHT_OPTIONS.map((value) => (
                  <option key={value} value={String(value)}>
                    {value.toFixed(1)}x
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
                Typsnitt
              </p>
              <div className="flex gap-1.5">
                {FONT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onFontChange(option.value)}
                    className={`flex-1 rounded-xl px-2 py-1.5 text-[12px] font-medium transition ${
                      readerFont === option.value
                        ? "bg-[#907AFF] text-white"
                        : "border border-black/10 text-slate-700 hover:border-black/20 dark:border-white/15 dark:text-white/70"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
                Tema
              </p>
              <div className="flex gap-1.5">
                {THEME_OPTIONS.map((theme) => (
                  <button
                    key={theme.value}
                    type="button"
                    onClick={() => onThemeChange(theme.value)}
                    className={`flex-1 rounded-xl border px-2 py-1.5 text-[12px] font-medium transition ${
                      readerTheme === theme.value
                        ? "border-[#907AFF]/45 bg-[#907AFF] text-white"
                        : "border-black/10 text-slate-700 hover:border-black/20 dark:border-white/15 dark:text-white/70"
                    }`}
                  >
                    <span
                      className="mx-auto mb-1.5 block h-2.5 w-10 rounded-full"
                      style={{ background: theme.preview }}
                    />
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
                  Bakgrund
                </p>
                <span className="text-[11px] font-medium text-slate-500 dark:text-white/60">
                  {backgroundIntensity}%
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={backgroundIntensity}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onBackgroundIntensityChange(clamp(next, 20, 100));
                }}
                className="w-full accent-[#907AFF]"
                aria-label="Background intensity"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
