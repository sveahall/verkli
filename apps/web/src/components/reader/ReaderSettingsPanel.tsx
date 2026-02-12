"use client";

import { useEffect, useRef } from "react";
import type { ReaderSettingsData } from "@/hooks/useReaderSettings";

const FONT_OPTIONS = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
  { value: "mono", label: "Mono" },
] as const;

const THEME_OPTIONS = [
  { value: "light", label: "Ljus" },
  { value: "sepia", label: "Sepia" },
  { value: "dark", label: "M\u00f6rk" },
] as const;

const WIDTH_OPTIONS = [
  { value: "narrow", label: "Smal" },
  { value: "medium", label: "Medium" },
  { value: "wide", label: "Bred" },
] as const;

type Props = {
  settings: ReaderSettingsData;
  onUpdate: (partial: Partial<ReaderSettingsData>) => void;
  onClose: () => void;
};

export default function ReaderSettingsPanel({ settings, onUpdate, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">L\u00e4sinst\u00e4llningar</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-slate-400 transition hover:text-slate-700 dark:text-white/40 dark:hover:text-white"
          aria-label="St\u00e4ng"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>

      <div className="space-y-4">
        {/* Font family */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
            Typsnitt
          </p>
          <div className="flex gap-1.5">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => onUpdate({ font_family: f.value })}
                className={`flex-1 rounded-xl px-2 py-1.5 text-[12px] font-medium transition ${
                  settings.font_family === f.value
                    ? "bg-[#907AFF] text-white"
                    : "border border-black/10 text-slate-700 hover:border-black/20 dark:border-white/15 dark:text-white/70"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Font size */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
              Storlek
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
            onChange={(e) => onUpdate({ font_size: Number(e.target.value) })}
            className="w-full accent-[#907AFF]"
          />
        </div>

        {/* Theme */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
            Tema
          </p>
          <div className="flex gap-1.5">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => onUpdate({ theme: t.value })}
                className={`flex-1 rounded-xl px-2 py-1.5 text-[12px] font-medium transition ${
                  settings.theme === t.value
                    ? "bg-[#907AFF] text-white"
                    : "border border-black/10 text-slate-700 hover:border-black/20 dark:border-white/15 dark:text-white/70"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Line height */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
              Radavst\u00e5nd
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
            onChange={(e) => onUpdate({ line_height: Number(e.target.value) })}
            className="w-full accent-[#907AFF]"
          />
        </div>

        {/* Content width */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 dark:text-white/50">
            Bredd
          </p>
          <div className="flex gap-1.5">
            {WIDTH_OPTIONS.map((w) => (
              <button
                key={w.value}
                type="button"
                onClick={() => onUpdate({ content_width: w.value })}
                className={`flex-1 rounded-xl px-2 py-1.5 text-[12px] font-medium transition ${
                  settings.content_width === w.value
                    ? "bg-[#907AFF] text-white"
                    : "border border-black/10 text-slate-700 hover:border-black/20 dark:border-white/15 dark:text-white/70"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
