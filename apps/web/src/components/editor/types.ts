/**
 * Typography configuration for the editor.
 * Applied to editor content only, not surrounding UI.
 */
export type TypographyConfig = {
  fontFamily: "serif" | "sans" | "mono";
  fontSize: number; // px
  lineHeight: number;
  paragraphSpacing: number; // rem
  contentWidth: number; // max-width in ch units
};

/**
 * Writing presets - pre-defined typography configs.
 */
export const WRITING_PRESETS: Record<string, TypographyConfig> = {
  novel: {
    fontFamily: "serif",
    fontSize: 18,
    lineHeight: 1.6,
    paragraphSpacing: 1,
    contentWidth: 56,
  },
  essay: {
    fontFamily: "serif",
    fontSize: 16,
    lineHeight: 1.7,
    paragraphSpacing: 0.75,
    contentWidth: 60,
  },
  screenplay: {
    fontFamily: "mono",
    fontSize: 12,
    lineHeight: 1.2,
    paragraphSpacing: 0,
    contentWidth: 54,
  },
};

export const FONT_FAMILY_MAP: Record<TypographyConfig["fontFamily"], string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, sans-serif",
  mono: "'Courier New', Courier, monospace",
};
