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
    <div className="fixed right-4 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] z-[100] sm:right-6">
      <button
        ref={settingsButtonRef}
        type="button"
        onClick={onToggle}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.06] bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#1a1d24]"
        aria-label="Reader settings"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[#64748B] dark:text-white/60"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {showSettingsPanel && (
        <div
          ref={settingsPanelRef}
          className="absolute right-0 top-12 w-[270px] rounded-xl border border-black/[0.06] bg-white p-4 shadow-md dark:border-white/10 dark:bg-[#1a1d24]"
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#0F172A] dark:text-white">
              Reading settings
            </p>
            {userId && settingsStatusLabel && (
              <span
                className={`text-xs font-medium ${
                  settingsSaveState === "error"
                    ? "text-red-500"
                    : "text-green-500"
                }`}
              >
                {settingsStatusLabel}
              </span>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-[#64748B] dark:text-white/50">
                Text size
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
                  className="rounded-xl border border-black/[0.06] px-2.5 py-1 text-xs font-medium text-[#0F172A] transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
                  aria-label="Decrease text size"
                >
                  A-
                </button>
                <span className="min-w-[40px] text-center text-xs font-semibold text-[#0F172A] dark:text-white">
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
                  className="rounded-xl border border-black/[0.06] px-2.5 py-1 text-xs font-medium text-[#0F172A] transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
                  aria-label="Increase text size"
                >
                  A+
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-[#64748B] dark:text-white/50">
                Line spacing
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
                className="w-full rounded-xl border border-black/[0.06] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                {LINE_HEIGHT_OPTIONS.map((value) => (
                  <option key={value} value={String(value)}>
                    {value.toFixed(1)}x
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-[#64748B] dark:text-white/50">
                Font
              </p>
              <div className="flex gap-2">
                {FONT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onFontChange(option.value)}
                    className={`flex-1 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors ${
                      readerFont === option.value
                        ? "bg-[#907AFF] text-white"
                        : "border border-black/[0.06] text-[#0F172A] hover:bg-black/[0.03] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-[#64748B] dark:text-white/50">
                Theme
              </p>
              <div className="flex gap-2">
                {THEME_OPTIONS.map((theme) => (
                  <button
                    key={theme.value}
                    type="button"
                    onClick={() => onThemeChange(theme.value)}
                    className={`flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                      readerTheme === theme.value
                        ? "border-[#907AFF] bg-[#907AFF] text-white"
                        : "border-black/[0.06] text-[#0F172A] hover:bg-black/[0.03] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
                    }`}
                  >
                    <span
                      className="mx-auto mb-1 block h-2 w-8 rounded-full"
                      style={{ background: theme.preview }}
                    />
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-[#64748B] dark:text-white/50">
                  Background
                </p>
                <span className="text-xs text-[#64748B] dark:text-white/40">
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
