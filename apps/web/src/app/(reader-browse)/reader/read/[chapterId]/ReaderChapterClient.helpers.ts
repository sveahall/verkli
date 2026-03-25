export type HighlightColor = "yellow" | "green" | "blue" | "rose";

export type ReaderHighlight = {
  id: string;
  startOffset: number;
  endOffset: number;
  snippet: string;
  color: HighlightColor;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
  fontFamily?: "serif" | "sans" | "mono";
  textAlign?: "left" | "center" | "justify";
  marginSize?: "narrow" | "normal" | "wide";
  theme?: "light" | "sepia" | "dark";
};

export type ReaderFont = "serif" | "sans" | "mono";

export type ReaderTheme = "light" | "sepia" | "dark";

export type ReaderThemeOption = {
  value: ReaderTheme;
  label: string;
  preview: string;
  canvas: string;
  orbOne: string;
  orbTwo: string;
  orbThree: string;
  veil: string;
  gridColor: string;
  panelBg: string;
  panelBorder: string;
  chapterBg: string;
  chapterBorder: string;
  proseColor: string;
  headingColor: string;
  linkUnderline: string;
  linkUnderlineHover: string;
};

export const FONT_OPTIONS: {
  value: ReaderFont;
  label: string;
  family: string;
}[] = [
  { value: "serif", label: "Serif", family: "Georgia, serif" },
  { value: "sans", label: "Sans", family: "Inter, system-ui, sans-serif" },
  { value: "mono", label: "Mono", family: "'JetBrains Mono', monospace" },
];

export const THEME_OPTIONS: ReaderThemeOption[] = [
  {
    value: "light",
    label: "Light",
    preview: "linear-gradient(140deg, #eef3ff 10%, #f6f9ff 55%, #eef4ff 100%)",
    canvas: "linear-gradient(165deg, #eef3ff 0%, #f7fbff 48%, #edf5ff 100%)",
    orbOne: "rgba(144,122,255,0.56)",
    orbTwo: "rgba(125,211,252,0.46)",
    orbThree: "rgba(248,180,230,0.38)",
    veil: "linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.08) 100%)",
    gridColor: "rgba(116, 139, 179, 0.22)",
    panelBg: "rgba(255,255,255,0.78)",
    panelBorder: "rgba(148,163,184,0.34)",
    chapterBg:
      "linear-gradient(180deg, rgba(255,255,255,0.9), rgba(252,255,255,0.86))",
    chapterBorder: "rgba(148,163,184,0.34)",
    proseColor: "#1e293b",
    headingColor: "#0f172a",
    linkUnderline: "rgba(100,116,139,0.45)",
    linkUnderlineHover: "rgba(71,85,105,0.75)",
  },
  {
    value: "sepia",
    label: "Sepia",
    preview: "linear-gradient(140deg, #f7efe2 5%, #f4e7d4 55%, #f0e2cf 100%)",
    canvas: "linear-gradient(165deg, #f8f0e4 0%, #f4e8d8 48%, #efe1cc 100%)",
    orbOne: "rgba(245, 158, 11, 0.32)",
    orbTwo: "rgba(236, 72, 153, 0.22)",
    orbThree: "rgba(239, 68, 68, 0.14)",
    veil: "linear-gradient(180deg, rgba(255,250,240,0.34) 0%, rgba(251,244,232,0.1) 100%)",
    gridColor: "rgba(156, 120, 84, 0.18)",
    panelBg: "rgba(253,247,236,0.75)",
    panelBorder: "rgba(180,138,104,0.34)",
    chapterBg:
      "linear-gradient(180deg, rgba(255,251,243,0.86), rgba(251,242,226,0.82))",
    chapterBorder: "rgba(171,133,101,0.34)",
    proseColor: "#5b4633",
    headingColor: "#402f1f",
    linkUnderline: "rgba(146,98,63,0.46)",
    linkUnderlineHover: "rgba(126,78,45,0.74)",
  },
  {
    value: "dark",
    label: "Dark",
    preview: "linear-gradient(140deg, #10182c 10%, #0f172a 58%, #111f36 100%)",
    canvas: "linear-gradient(165deg, #0f172a 0%, #10192f 54%, #0a1222 100%)",
    orbOne: "rgba(147, 112, 219, 0.46)",
    orbTwo: "rgba(34, 211, 238, 0.28)",
    orbThree: "rgba(59, 130, 246, 0.22)",
    veil: "linear-gradient(180deg, rgba(15,23,42,0.34) 0%, rgba(2,6,23,0.18) 100%)",
    gridColor: "rgba(116, 139, 179, 0.2)",
    panelBg: "rgba(15,23,42,0.58)",
    panelBorder: "rgba(148,163,184,0.24)",
    chapterBg:
      "linear-gradient(180deg, rgba(15,23,42,0.76), rgba(13,17,29,0.7))",
    chapterBorder: "rgba(148,163,184,0.24)",
    proseColor: "rgba(241,245,249,0.92)",
    headingColor: "rgba(248,250,252,0.96)",
    linkUnderline: "rgba(203,213,225,0.5)",
    linkUnderlineHover: "rgba(226,232,240,0.78)",
  },
];

export function loadLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocalStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // silent
  }
}

export type SelectionState = {
  startOffset: number;
  endOffset: number;
  snippet: string;
  x: number;
  y: number;
  placement: "top" | "bottom";
};

export type TextNodeIndex = {
  node: Text;
  start: number;
  end: number;
};

export type HighlightRecord = {
  id: string;
  start_offset: number;
  end_offset: number;
  snippet: string;
  color: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export const FONT_MIN = 13;
export const FONT_MAX = 24;
export const LINE_HEIGHT_OPTIONS = [1.5, 1.7, 1.9, 2.1] as const;
export const COLOR_ORDER: HighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "rose",
];
export const COLOR_META: Record<
  HighlightColor,
  { label: string; swatch: string }
> = {
  yellow: { label: "Yellow", swatch: "#facc15" },
  green: { label: "Green", swatch: "#86efac" },
  blue: { label: "Blue", swatch: "#93c5fd" },
  rose: { label: "Rose", swatch: "#fda4af" },
};
export const HIGHLIGHT_BUCKETS: Record<HighlightColor, string> = {
  yellow: "reader-highlight-yellow",
  green: "reader-highlight-green",
  blue: "reader-highlight-blue",
  rose: "reader-highlight-rose",
};

type CssHighlightsMap = {
  set(name: string, value: unknown): void;
  delete(name: string): void;
};

type HighlightConstructor = new (...ranges: Range[]) => unknown;

export type ReaderPrefs = {
  settings?: {
    fontSize?: number;
    lineHeight?: number;
  };
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeColor(value: unknown): HighlightColor {
  if (
    value === "yellow" ||
    value === "green" ||
    value === "blue" ||
    value === "rose"
  ) {
    return value;
  }
  return "yellow";
}

export function normalizeHighlights(
  input: ReaderHighlight[]
): ReaderHighlight[] {
  return [...input].sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
    return a.endOffset - b.endOffset;
  });
}

export function getCssHighlightsMap(): CssHighlightsMap | null {
  if (typeof CSS === "undefined") return null;
  const maybeCss = CSS as unknown as { highlights?: CssHighlightsMap };
  if (!maybeCss.highlights) return null;
  if (
    typeof maybeCss.highlights.set !== "function" ||
    typeof maybeCss.highlights.delete !== "function"
  ) {
    return null;
  }
  return maybeCss.highlights;
}

export function getHighlightConstructor(): HighlightConstructor | null {
  if (typeof window === "undefined") return null;
  const maybeWindow = window as unknown as {
    Highlight?: HighlightConstructor;
  };
  if (!maybeWindow.Highlight) return null;
  return maybeWindow.Highlight;
}

export function collectTextNodeIndex(root: HTMLElement): TextNodeIndex[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: TextNodeIndex[] = [];
  let cursor = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof Text)) continue;
    const text = node.textContent ?? "";
    if (!text.length) continue;

    const start = cursor;
    const end = start + text.length;
    nodes.push({ node, start, end });
    cursor = end;
  }

  return nodes;
}

export function createRangeFromOffsets(
  index: TextNodeIndex[],
  startOffset: number,
  endOffset: number
): Range | null {
  if (!index.length) return null;
  if (
    !Number.isFinite(startOffset) ||
    !Number.isFinite(endOffset) ||
    endOffset <= startOffset
  ) {
    return null;
  }

  const totalLength = index[index.length - 1]?.end ?? 0;
  if (totalLength <= 0) return null;

  const start = clamp(startOffset, 0, totalLength);
  const end = clamp(endOffset, 0, totalLength);
  if (end <= start) return null;

  let startNode: Text | null = null;
  let startNodeOffset = 0;
  let endNode: Text | null = null;
  let endNodeOffset = 0;

  for (const entry of index) {
    if (!startNode && start >= entry.start && start <= entry.end) {
      startNode = entry.node;
      startNodeOffset = start - entry.start;
    }

    if (!endNode && end >= entry.start && end <= entry.end) {
      endNode = entry.node;
      endNodeOffset = end - entry.start;
    }

    if (startNode && endNode) break;
  }

  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(
    startNode,
    clamp(startNodeOffset, 0, startNode.textContent?.length ?? 0)
  );
  range.setEnd(
    endNode,
    clamp(endNodeOffset, 0, endNode.textContent?.length ?? 0)
  );
  return range;
}

export function parseHighlightRecord(value: unknown): ReaderHighlight | null {
  if (!isRecord(value)) return null;

  const id = String(value.id ?? "").trim();
  const snippet = String(value.snippet ?? "").trim();
  const startOffset = Number(value.start_offset ?? NaN);
  const endOffset = Number(value.end_offset ?? NaN);

  if (
    !id ||
    !snippet ||
    !Number.isFinite(startOffset) ||
    !Number.isFinite(endOffset) ||
    endOffset <= startOffset
  ) {
    return null;
  }

  return {
    id,
    startOffset,
    endOffset,
    snippet,
    color: normalizeColor(value.color),
    note: typeof value.note === "string" ? value.note : null,
    createdAt: String(value.created_at ?? ""),
    updatedAt: String(value.updated_at ?? ""),
  };
}

export function getReaderPrefs(
  preferences: Record<string, unknown>
): ReaderPrefs {
  const reader = isRecord(preferences.reader) ? preferences.reader : {};
  if (!isRecord(reader.settings)) {
    return {};
  }

  const fontSize =
    typeof reader.settings.fontSize === "number"
      ? reader.settings.fontSize
      : undefined;
  const lineHeight =
    typeof reader.settings.lineHeight === "number"
      ? reader.settings.lineHeight
      : undefined;

  if (fontSize === undefined && lineHeight === undefined) {
    return {};
  }

  return {
    settings: {
      fontSize,
      lineHeight,
    },
  };
}
