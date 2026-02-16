"use client";

import * as React from "react";
import type { ReaderSettingsData } from "../../hooks/useReaderSettings";

const FONT_OPTIONS = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
  { value: "mono", label: "Mono" },
] as const;

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "sepia", label: "Sepia" },
  { value: "dark", label: "Dark" },
] as const;

const WIDTH_OPTIONS = [
  { value: "narrow", label: "Narrow" },
  { value: "medium", label: "Medium" },
  { value: "wide", label: "Wide" },
] as const;

type Props = {
  settings: ReaderSettingsData;
  onUpdate: (partial: Partial<ReaderSettingsData>) => void;
  onClose: () => void;
};

export default function ReaderSettingsPanel({ settings, onUpdate, onClose }: Props) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="w-[280px] rounded-2xl border border-black/10 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-slate-900"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Reading settings</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-slate-400 transition hover:text-slate-700 dark:text-white/40 dark:hover:text-white"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
            Font
          </p>
          <div className="flex gap-1.5">
            {FONT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onUpdate({ font_family: option.value })}
                className={`flex-1 rounded-xl px-2 py-1.5 text-[12px] font-medium transition ${
                  settings.font_family === option.value
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
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
              Size
            </p>
            <span className="text-[12px] font-semibold text-slate-900 dark:text-white">
              {settings.font_size}px
            </span>
          </div>
          <input
            type="range"
            min={14}
            max={28}
            step={1}
            value={settings.font_size}
            onChange={(event) => onUpdate({ font_size: Number(event.target.value) })}
            className="w-full accent-[#907AFF]"
          />
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
            Theme
          </p>
          <div className="flex gap-1.5">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onUpdate({ theme: option.value })}
                className={`flex-1 rounded-xl px-2 py-1.5 text-[12px] font-medium transition ${
                  settings.theme === option.value
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
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
              Line height
            </p>
            <span className="text-[12px] font-semibold text-slate-900 dark:text-white">
              {settings.line_height.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min={1.2}
            max={2.0}
            step={0.1}
            value={settings.line_height}
            onChange={(event) => onUpdate({ line_height: Number(event.target.value) })}
            className="w-full accent-[#907AFF]"
          />
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
            Width
          </p>
          <div className="flex gap-1.5">
            {WIDTH_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onUpdate({ content_width: option.value })}
                className={`flex-1 rounded-xl px-2 py-1.5 text-[12px] font-medium transition ${
                  settings.content_width === option.value
                    ? "bg-[#907AFF] text-white"
                    : "border border-black/10 text-slate-700 hover:border-black/20 dark:border-white/15 dark:text-white/70"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
