import type { CoverTextLayer, CoverFilters } from "./cover-editor.types";
import { DEFAULT_FILTERS } from "./cover-editor.filters";

export type CoverEditorSavedState = {
  /** The original background image URL (before text was flattened) */
  backgroundUrl: string;
  textLayers: CoverTextLayer[];
  filters: CoverFilters;
  savedAt: string;
};

const STORAGE_KEY_PREFIX = "verkli_cover_editor_";

function getKey(bookId: string): string {
  return `${STORAGE_KEY_PREFIX}${bookId}`;
}

export function saveCoverEditorState(
  bookId: string,
  backgroundUrl: string,
  textLayers: CoverTextLayer[],
  filters: CoverFilters
): void {
  try {
    const state: CoverEditorSavedState = {
      backgroundUrl,
      textLayers,
      filters,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(getKey(bookId), JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

export function loadCoverEditorState(bookId: string): CoverEditorSavedState | null {
  try {
    const raw = localStorage.getItem(getKey(bookId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoverEditorSavedState;
    if (!parsed.backgroundUrl || !Array.isArray(parsed.textLayers)) return null;
    return {
      backgroundUrl: parsed.backgroundUrl,
      textLayers: parsed.textLayers,
      filters: parsed.filters ?? DEFAULT_FILTERS,
      savedAt: parsed.savedAt ?? "",
    };
  } catch {
    return null;
  }
}

export function clearCoverEditorState(bookId: string): void {
  try {
    localStorage.removeItem(getKey(bookId));
  } catch {
    // ignore
  }
}
