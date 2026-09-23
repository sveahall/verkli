import type { FilterPreset, CoverFilters } from "./cover-editor.types";

export const DEFAULT_FILTERS: CoverFilters = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

export const FILTER_PRESETS: FilterPreset[] = [
  { id: "original", label: "Original", filters: { brightness: 0, contrast: 0, saturation: 0 } },
  { id: "vivid", label: "Vivid", filters: { brightness: 5, contrast: 15, saturation: 30 } },
  { id: "cool", label: "Cool", filters: { brightness: 0, contrast: 5, saturation: -10 } },
  { id: "warm", label: "Warm", filters: { brightness: 8, contrast: 5, saturation: 15 } },
  { id: "dramatic", label: "Dramatic", filters: { brightness: -10, contrast: 40, saturation: -5 } },
  { id: "faded", label: "Faded", filters: { brightness: 10, contrast: -20, saturation: -30 } },
  { id: "bw", label: "B&W", filters: { brightness: 5, contrast: 10, saturation: -100 } },
];

/** Convert our -100..100 filter values to a CSS filter string. */
export function filtersToCss(f: CoverFilters): string {
  const brightness = 1 + f.brightness / 100;
  const contrast = 1 + f.contrast / 100;
  const saturation = 1 + f.saturation / 100;
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
}
