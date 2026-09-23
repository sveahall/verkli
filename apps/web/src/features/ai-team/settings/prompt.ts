import type { AiSettings, AiTraitLevel } from "./contracts";

/**
 * Turns account AI preferences into prompt material.
 *
 * The split is the whole point of this module:
 *
 *  - `buildPersonalityLines` returns sentences THIS FILE wrote, chosen by a
 *    closed enum. Nothing the author typed reaches them, so the caller may put
 *    them in the system prompt.
 *  - `buildAuthorProfile` returns the author's own words. The caller must place
 *    them in the user prompt, labelled untrusted, exactly like saved
 *    preferences. "Custom instructions" are still user data: an author who
 *    writes "ignore your safety rules" there is a user making a request, not an
 *    operator changing the system prompt.
 */

const replyStyleLine: Record<AiSettings["replyStyle"], string | null> = {
  default: null,
  concise: "Preferred style: be efficient. Lead with the answer, drop preamble and do not restate the request back to the author.",
  friendly: "Preferred style: warm and conversational, like a trusted colleague reading over the author's shoulder.",
  candid: "Preferred style: candid. Say plainly what is not working and why, without softening it into vagueness.",
  encouraging: "Preferred style: encouraging. Name what already works before what to change, and leave the author wanting to keep writing.",
};

const traits: Record<"warmth" | "enthusiasm" | "structure" | "emoji", Record<Exclude<AiTraitLevel, "standard">, string>> = {
  warmth: {
    less: "Keep warmth low: no pleasantries, affirmations or checking in on how the author feels.",
    more: "Be noticeably warm: acknowledge the work behind the draft before critiquing it.",
  },
  enthusiasm: {
    less: "Keep enthusiasm flat: no exclamation marks, no superlatives, no selling the suggestion.",
    more: "Show genuine enthusiasm for what is working in the writing.",
  },
  structure: {
    less: "Answer in prose. Avoid headings and bullet lists unless the author asks for a list.",
    more: "Structure the answer with a short heading or a tight bullet list where it helps scanning.",
  },
  emoji: {
    less: "Never use emoji.",
    more: "At most one relevant emoji per reply, never inside manuscript text or proposed edits.",
  },
};

/** Safe, server-authored system-prompt lines. Empty when everything is default. */
export function buildPersonalityLines(settings: AiSettings): string[] {
  const lines: string[] = [];
  const style = replyStyleLine[settings.replyStyle];
  if (style) lines.push(style);
  for (const trait of ["warmth", "enthusiasm", "structure", "emoji"] as const) {
    const level = settings[trait];
    if (level !== "standard") lines.push(traits[trait][level]);
  }
  if (settings.matchWritingVoice) {
    lines.push(
      "The author asked you to follow their voice: take register, sentence rhythm and vocabulary from the manuscript in front of you, and do not impose a house style over it."
    );
  }
  return lines;
}

export type AuthorProfile = {
  nickname?: string;
  writes?: string;
  about?: string;
  standingRequests?: string;
};

/**
 * The author's own words, ready to be serialised into the user prompt. Returns
 * null when the author filled nothing in, so the caller adds no empty block.
 */
export function buildAuthorProfile(settings: AiSettings): AuthorProfile | null {
  const profile: AuthorProfile = {
    ...(settings.nickname ? { nickname: settings.nickname } : {}),
    ...(settings.craft ? { writes: settings.craft } : {}),
    ...(settings.about ? { about: settings.about } : {}),
    ...(settings.instructions ? { standingRequests: settings.instructions } : {}),
  };
  return Object.keys(profile).length ? profile : null;
}

/** True when nothing about this account changes the prompt. */
export function isDefaultPersonalization(settings: AiSettings): boolean {
  return buildPersonalityLines(settings).length === 0 && buildAuthorProfile(settings) === null;
}

