export const AUTHOR_LINE_MAX = 280;
export const FLAP_TEXT_MAX = 1200;

export type CoverCopy = {
  /** Short author line printed on the back cover. */
  authorLine: string;
  /** Hardcover dust jacket with folded flaps. */
  dustJacket: boolean;
  /** Longer author note on the back flap. */
  flapText: string;
};

export const EMPTY_COVER_COPY: CoverCopy = {
  authorLine: "",
  dustJacket: false,
  flapText: "",
};

function clipText(value: unknown, max: number, preserveWhitespace = false): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r\n/g, "\n");
  const trimmed = preserveWhitespace ? normalized : normalized.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

export function normalizeCoverCopy(value: unknown, options: { preserveWhitespace?: boolean } = {}): CoverCopy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_COVER_COPY;
  }

  const raw = value as Record<string, unknown>;
  return {
    authorLine: clipText(raw.authorLine, AUTHOR_LINE_MAX, options.preserveWhitespace),
    dustJacket: raw.dustJacket === true,
    flapText: clipText(raw.flapText, FLAP_TEXT_MAX, options.preserveWhitespace),
  };
}

/** One back-cover sentence from the profile bio. Longer bios keep a word boundary. */
export function authorLineFromProfile(bio: string): string {
  const collapsed = bio.replace(/\s+/g, " ").trim();
  if (collapsed.length <= AUTHOR_LINE_MAX) return collapsed;

  const cut = collapsed.slice(0, AUTHOR_LINE_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > AUTHOR_LINE_MAX * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/**
 * Fills the short back-cover line from the profile.
 * Seeds the flap only when the author has not written one yet.
 */
export function applyProfileToCoverCopy(current: CoverCopy, profileBio: string): CoverCopy {
  const full = profileBio.trim();
  if (!full) return current;

  return normalizeCoverCopy({
    ...current,
    authorLine: authorLineFromProfile(full),
    flapText: current.flapText.trim() ? current.flapText : full,
  });
}
