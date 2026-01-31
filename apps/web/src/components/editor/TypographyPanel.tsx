"use client";

import { useState } from "react";
import { useEditorContext } from "./EditorContext";
import {
  WRITING_PRESETS,
  type TypographyConfig,
} from "./types";

export default function TypographyPanel() {
  const {
    typography,
    setTypography,
    preset,
    setPreset,
  } = useEditorContext();
  const [isOpen, setIsOpen] = useState(false);

  const applyPreset = (key: string) => {
    const config = WRITING_PRESETS[key];
    if (config) {
      setPreset(key);
      setTypography(config);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Typography"
        className="flex h-8 items-center gap-1 rounded px-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
      >
        <TypographyIcon />
        <span className="capitalize">{preset}</span>
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-3 shadow-lg dark:border-white/10 dark:bg-slate-800">
            {/* Presets */}
            <div className="px-3 pb-3">
              <div className="mb-2 text-xs font-medium text-slate-500 dark:text-white/50">
                Preset
              </div>
              <div className="flex gap-1">
                {Object.keys(WRITING_PRESETS).map((key) => (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    className={`rounded px-2 py-1 text-xs capitalize ${
                      preset === key
                        ? "bg-slate-200 dark:bg-white/20"
                        : "hover:bg-slate-100 dark:hover:bg-white/10"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 border-t border-slate-200 px-3 pt-3 dark:border-white/10">
              <TypographySlider
                label="Font size"
                value={typography.fontSize}
                min={12}
                max={24}
                unit="px"
                onChange={(v) =>
                  setTypography({ ...typography, fontSize: v })
                }
              />
              <TypographySlider
                label="Line height"
                value={typography.lineHeight}
                min={1.1}
                max={2}
                step={0.1}
                onChange={(v) =>
                  setTypography({ ...typography, lineHeight: v })
                }
              />
              <TypographySlider
                label="Paragraph spacing"
                value={typography.paragraphSpacing}
                min={0}
                max={2}
                step={0.25}
                unit="rem"
                onChange={(v) =>
                  setTypography({ ...typography, paragraphSpacing: v })
                }
              />
              <TypographySlider
                label="Content width"
                value={typography.contentWidth}
                min={45}
                max={90}
                unit="ch"
                onChange={(v) =>
                  setTypography({ ...typography, contentWidth: v })
                }
              />
              <div>
                <div className="mb-1 text-xs text-slate-500 dark:text-white/50">
                  Font
                </div>
                <select
                  value={typography.fontFamily}
                  onChange={(e) =>
                    setTypography({
                      ...typography,
                      fontFamily: e.target.value as TypographyConfig["fontFamily"],
                    })
                  }
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-slate-900"
                >
                  <option value="serif">Serif</option>
                  <option value="sans">Sans</option>
                  <option value="mono">Monospace</option>
                </select>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TypographySlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-500 dark:text-white/50">{label}</span>
        <span>
          {typeof value === "number" && value % 1 !== 0
            ? value.toFixed(1)
            : value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-slate-700 dark:accent-slate-300"
      />
    </div>
  );
}

function TypographyIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h16M4 12h8m-8 6h16M16 12h4"
      />
    </svg>
  );
}
