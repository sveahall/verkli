"use client";

import type { CoverFilters } from "./cover-editor.types";
import { FILTER_PRESETS } from "./cover-editor.filters";

type CoverEditorFilterPanelProps = {
  filters: CoverFilters;
  onUpdateFilters: (patch: Partial<CoverFilters>) => void;
  onApplyPreset: (filters: CoverFilters) => void;
};

type SliderRowProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
};

function SliderRow({ label, value, onChange }: SliderRowProps) {
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
        {label} <span className="tabular-nums">{value > 0 ? `+${value}` : value}</span>
      </label>
      <input
        type="range" min={-100} max={100} step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#907AFF]"
      />
    </div>
  );
}

export default function CoverEditorFilterPanel({
  filters,
  onUpdateFilters,
  onApplyPreset,
}: CoverEditorFilterPanelProps) {
  return (
    <div className="space-y-5">
      {/* Presets */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
          Presets
        </p>
        <div className="flex flex-wrap gap-2">
          {FILTER_PRESETS.map((preset) => {
            const isActive =
              filters.brightness === preset.filters.brightness &&
              filters.contrast === preset.filters.contrast &&
              filters.saturation === preset.filters.saturation;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyPreset(preset.filters)}
                className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition ${
                  isActive
                    ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#907AFF]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-white/60"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders */}
      <SliderRow
        label="Brightness"
        value={filters.brightness}
        onChange={(v) => onUpdateFilters({ brightness: v })}
      />
      <SliderRow
        label="Contrast"
        value={filters.contrast}
        onChange={(v) => onUpdateFilters({ contrast: v })}
      />
      <SliderRow
        label="Saturation"
        value={filters.saturation}
        onChange={(v) => onUpdateFilters({ saturation: v })}
      />
    </div>
  );
}
