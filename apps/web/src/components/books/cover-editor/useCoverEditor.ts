"use client";

import { useCallback, useRef, useState } from "react";
import type { CoverTextLayer, CoverFilters, CoverEditorState } from "./cover-editor.types";
import { DEFAULT_FILTERS } from "./cover-editor.filters";

function createId(): string {
  return crypto.randomUUID();
}

const MAX_HISTORY = 30;

export function useCoverEditor() {
  const [textLayers, setTextLayers] = useState<CoverTextLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [filters, setFilters] = useState<CoverFilters>({ ...DEFAULT_FILTERS });
  const [exporting, setExporting] = useState(false);

  // Undo/redo
  const historyRef = useRef<CoverEditorState[]>([]);
  const historyIndexRef = useRef(-1);

  const snapshot = useCallback(() => {
    const state: CoverEditorState = {
      textLayers: textLayers.map((l) => ({ ...l })),
      selectedLayerId,
      filters: { ...filters },
    };
    const next = historyRef.current.slice(0, historyIndexRef.current + 1);
    next.push(state);
    if (next.length > MAX_HISTORY) next.shift();
    historyRef.current = next;
    historyIndexRef.current = next.length - 1;
  }, [textLayers, selectedLayerId, filters]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const prev = historyRef.current[historyIndexRef.current];
    if (!prev) return;
    setTextLayers(prev.textLayers);
    setSelectedLayerId(prev.selectedLayerId);
    setFilters(prev.filters);
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const next = historyRef.current[historyIndexRef.current];
    if (!next) return;
    setTextLayers(next.textLayers);
    setSelectedLayerId(next.selectedLayerId);
    setFilters(next.filters);
  }, []);

  const addTextLayer = useCallback(
    (defaults?: Partial<CoverTextLayer>) => {
      snapshot();
      const layer: CoverTextLayer = {
        id: createId(),
        text: defaults?.text ?? "Title",
        fontFamily: defaults?.fontFamily ?? "Inter",
        fontSize: defaults?.fontSize ?? 48,
        fontStyle: defaults?.fontStyle ?? "bold",
        fill: defaults?.fill ?? "#FFFFFF",
        x: 50,
        y: 50,
        width: 300,
        align: defaults?.align ?? "center",
        letterSpacing: 0,
      };
      setTextLayers((prev) => [...prev, layer]);
      setSelectedLayerId(layer.id);
      return layer;
    },
    [snapshot]
  );

  const updateTextLayer = useCallback(
    (id: string, patch: Partial<CoverTextLayer>) => {
      snapshot();
      setTextLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
      );
    },
    [snapshot]
  );

  const removeTextLayer = useCallback(
    (id: string) => {
      snapshot();
      setTextLayers((prev) => prev.filter((l) => l.id !== id));
      setSelectedLayerId((prev) => (prev === id ? null : prev));
    },
    [snapshot]
  );

  const updateFilters = useCallback(
    (patch: Partial<CoverFilters>) => {
      snapshot();
      setFilters((prev) => ({ ...prev, ...patch }));
    },
    [snapshot]
  );

  const applyFilterPreset = useCallback(
    (preset: CoverFilters) => {
      snapshot();
      setFilters({ ...preset });
    },
    [snapshot]
  );

  const selectedLayer = textLayers.find((l) => l.id === selectedLayerId) ?? null;

  return {
    textLayers,
    selectedLayerId,
    selectedLayer,
    setSelectedLayerId,
    filters,
    exporting,
    setExporting,
    addTextLayer,
    updateTextLayer,
    removeTextLayer,
    updateFilters,
    applyFilterPreset,
    undo,
    redo,
  };
}
